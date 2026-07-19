"""Google Identity Services auth + session management for service mode.

Flow: the frontend's GIS button posts an ID-token ``credential`` to
``POST /api/auth/google``; we verify it against Google's JWKS (google-auth),
upsert the user on their stable ``sub``, and mint our own opaque session
token — sha256-stored, delivered as an HttpOnly SameSite=Lax cookie. Google
never sees our session; we never store Google tokens.

Admin is computed from ``ADMIN_EMAILS`` (env), never persisted — a DB
compromise can't mint admins, and revocation is an env change + restart.
"""

import hashlib
import logging
import os
import secrets
from datetime import date, datetime, timedelta, timezone

from . import db

logger = logging.getLogger(__name__)

COOKIE_NAME = "synth_session"

# Columns every auth-consumer needs; selected explicitly so session-join
# queries can't collide on ambiguous names like created_at.
_USER_COLS = (
    "u.id, u.google_sub, u.email, u.email_verified, u.name, u.avatar_url, "
    "u.tier, u.credits_balance, u.credits_period, u.accepted_terms_version, "
    "u.age_attested_at, u.stripe_customer_id, u.disabled_at"
)


class EmailCollision(Exception):
    """A different Google account already registered this email."""


# ── env-derived settings (read per-call; cheap, and tests can toggle) ───────

def oauth_client_id() -> str:
    return os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")


def terms_version() -> str:
    return os.environ.get("SYNTH_TERMS_VERSION", "v0.2")


def monthly_credits() -> int:
    return int(os.environ.get("SYNTH_MONTHLY_CREDITS", "300"))


def session_ttl() -> timedelta:
    return timedelta(days=int(os.environ.get("SESSION_TTL_DAYS", "30")))


def admin_emails() -> set[str]:
    raw = os.environ.get("ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def effective_tier(user) -> str:
    if user["email"].lower() in admin_emails():
        return "admin"
    return user["tier"]


# ── Google credential verification ──────────────────────────────────────────

def verify_google_credential(credential: str) -> dict:
    """Validate a GIS ID token; returns its claims or raises ValueError.

    google-auth checks signature (against Google's rotating JWKS), audience,
    and expiry; we additionally require issuer + verified email.
    """
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    client_id = oauth_client_id()
    if not client_id:
        raise ValueError("GOOGLE_OAUTH_CLIENT_ID is not configured")
    claims = google_id_token.verify_oauth2_token(
        credential, google_requests.Request(), client_id, clock_skew_in_seconds=10
    )
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("unexpected token issuer")
    if not claims.get("sub"):
        raise ValueError("token has no subject")
    if not (claims.get("email") and claims.get("email_verified")):
        raise ValueError("Google account email is not verified")
    return claims


# ── users ───────────────────────────────────────────────────────────────────

async def upsert_user(claims: dict):
    """Create-or-refresh the user keyed on google_sub; returns the row."""
    email = claims["email"].lower()
    try:
        return await db.pool().fetchrow(
            f"""
            INSERT INTO users (google_sub, email, email_verified, name, avatar_url, last_login_at)
            VALUES ($1, $2, TRUE, $3, $4, now())
            ON CONFLICT (google_sub) DO UPDATE
              SET email = EXCLUDED.email,
                  name = EXCLUDED.name,
                  avatar_url = EXCLUDED.avatar_url,
                  last_login_at = now()
            RETURNING {_USER_COLS.replace('u.', '')}
            """,
            claims["sub"],
            email,
            claims.get("name"),
            claims.get("picture"),
        )
    except Exception as exc:  # asyncpg.UniqueViolationError on users_email_key
        if type(exc).__name__ == "UniqueViolationError":
            logger.warning("email collision on login: %s (different google_sub)", email)
            raise EmailCollision(email) from exc
        raise


async def get_user(user_id: int):
    return await db.pool().fetchrow(
        f"SELECT {_USER_COLS.replace('u.', '')} FROM users WHERE id = $1", user_id
    )


# ── sessions ────────────────────────────────────────────────────────────────

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _ip_hash(ip: str | None) -> str | None:
    if not ip:
        return None
    return hashlib.sha256(f"{date.today().isoformat()}|{ip}".encode()).hexdigest()


async def create_session(user_id: int, user_agent: str | None, ip: str | None) -> str:
    token = secrets.token_urlsafe(32)
    pool = db.pool()
    await pool.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at, user_agent, ip_hash) "
        "VALUES ($1, $2, now() + $3, now(), $4, $5)",
        _hash(token),
        user_id,
        session_ttl(),
        (user_agent or "")[:300],
        _ip_hash(ip),
    )
    # Opportunistic hygiene: clear this user's expired sessions.
    await pool.execute(
        "DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()", user_id
    )
    return token


async def resolve_session(token: str):
    """Cookie token → (user_row | None, rotated_token | None).

    Sliding session: bumps last_seen (throttled to 10 min); once past half
    the TTL the token is rotated — caller must set the new cookie.
    """
    pool = db.pool()
    row = await pool.fetchrow(
        f"""
        SELECT {_USER_COLS}, s.token_hash, s.created_at AS session_created_at,
               s.expires_at, s.last_seen_at, s.user_agent
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()
        """,
        _hash(token),
    )
    if row is None:
        return None, None

    now = datetime.now(timezone.utc)
    rotated = None
    if now - row["session_created_at"] > session_ttl() / 2:
        rotated = secrets.token_urlsafe(32)
        await pool.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at, user_agent) "
            "VALUES ($1, $2, now() + $3, now(), $4)",
            _hash(rotated), row["id"], session_ttl(), row["user_agent"],
        )
        await pool.execute("DELETE FROM sessions WHERE token_hash = $1", row["token_hash"])
    elif row["last_seen_at"] is None or now - row["last_seen_at"] > timedelta(minutes=10):
        await pool.execute(
            "UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1",
            row["token_hash"],
        )
    return row, rotated


async def delete_session(token: str) -> None:
    await db.pool().execute("DELETE FROM sessions WHERE token_hash = $1", _hash(token))


# ── cookies ─────────────────────────────────────────────────────────────────

def set_session_cookie(response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=int(session_ttl().total_seconds()),
        httponly=True,
        samesite="lax",
        secure=os.environ.get("SYNTH_INSECURE_COOKIES") != "1",
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


# ── /api/me payload ─────────────────────────────────────────────────────────

def needs_terms(user) -> bool:
    return (
        user["accepted_terms_version"] != terms_version()
        or user["age_attested_at"] is None
    )


def me_payload(user) -> dict:
    tier = effective_tier(user)
    is_admin = tier == "admin"
    today = date.today()
    resets = (
        date(today.year + 1, 1, 1) if today.month == 12
        else date(today.year, today.month + 1, 1)
    )
    return {
        "user": {
            "email": user["email"],
            "name": user["name"],
            "avatar_url": user["avatar_url"],
            "tier": tier,
            "is_admin": is_admin,
        },
        "credits": {
            "balance": user["credits_balance"],
            "monthly_grant": monthly_credits(),
            "period": user["credits_period"],
            "resets": resets.isoformat(),
            "unlimited": is_admin,
        },
        "features": {
            "text": True,
            "image": True,
            "analysis": True,
            "templates": True,
            "video": is_admin,
            "music": is_admin,
            "videorama": False,
        },
        "needs_terms": needs_terms(user),
        "terms_version": terms_version(),
    }
