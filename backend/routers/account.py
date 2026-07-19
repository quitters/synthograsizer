"""Account endpoints — Google sign-in, session lifecycle, /api/me.

Mounted unconditionally; every endpoint 404s unless service mode is active
(``SYNTH_AUTH=1``), so a local install exposes no account surface at all.
The enforcement middleware (backend/service/enforcement.py) attaches
``request.state.user`` before these handlers run.
"""

import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from backend.service import auth, service_mode

router = APIRouter()
logger = logging.getLogger(__name__)


class GoogleAuthRequest(BaseModel):
    credential: str


class AcceptTermsRequest(BaseModel):
    terms_version: str
    age_over_18: bool


def _require_service() -> None:
    if not service_mode():
        raise HTTPException(status_code=404, detail="Not found")


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/api/auth/google")
async def auth_google(request: Request, body: GoogleAuthRequest):
    """Exchange a GIS ID-token credential for a first-party session cookie."""
    _require_service()
    try:
        claims = auth.verify_google_credential(body.credential)
    except Exception as exc:
        logger.info("rejected Google credential: %s", exc)
        raise HTTPException(status_code=401, detail="Google sign-in could not be verified.")
    try:
        user = await auth.upsert_user(claims)
    except auth.EmailCollision:
        raise HTTPException(
            status_code=409,
            detail="This email is already registered to a different Google account. "
                   "Contact support via the feedback form.",
        )
    token = await auth.create_session(
        user["id"], request.headers.get("user-agent"), _client_ip(request)
    )
    response = JSONResponse(auth.me_payload(user))
    auth.set_session_cookie(response, token)
    return response


@router.post("/api/auth/logout")
async def auth_logout(request: Request):
    _require_service()
    token = request.cookies.get(auth.COOKIE_NAME)
    if token:
        try:
            await auth.delete_session(token)
        except RuntimeError:
            pass  # DB unavailable — still clear the cookie
    response = Response(status_code=204)
    auth.clear_session_cookie(response)
    return response


@router.get("/api/me")
async def me(request: Request):
    _require_service()
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in.")
    return auth.me_payload(user)


@router.post("/api/me/accept-terms")
async def accept_terms(request: Request, body: AcceptTermsRequest):
    _require_service()
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in.")
    if body.terms_version != auth.terms_version():
        raise HTTPException(status_code=400, detail="Stale terms version — reload the page.")
    if not body.age_over_18:
        raise HTTPException(status_code=400, detail="This service requires users to be 18 or older.")
    from backend.service import db
    await db.pool().execute(
        "UPDATE users SET accepted_terms_version = $1, age_attested_at = now() WHERE id = $2",
        body.terms_version,
        user["id"],
    )
    return auth.me_payload(await auth.get_user(user["id"]))
