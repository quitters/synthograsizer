"""Operator endpoints — usage visibility, credit adjustments, ban switch.

Admin is computed from ADMIN_EMAILS (never stored); everyone else gets 404s
so the surface doesn't advertise itself. Service mode only.
"""

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.service import auth, db, service_mode

router = APIRouter()
logger = logging.getLogger(__name__)


class CreditAdjustRequest(BaseModel):
    delta: int
    note: str = ""


class DisableRequest(BaseModel):
    disabled: bool


def _require_admin(request: Request) -> None:
    if not service_mode() or getattr(request.state, "tier", None) != "admin":
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/admin/stats")
async def admin_stats(request: Request):
    _require_admin(request)
    pool = db.pool()
    today = await pool.fetchrow(
        "SELECT COUNT(*) AS generations, COALESCE(SUM(usd_est),0) AS usd, "
        "COALESCE(SUM(credits),0) AS credits FROM generations "
        "WHERE ts >= date_trunc('day', now() AT TIME ZONE 'utc')"
    )
    month = await pool.fetchrow(
        "SELECT COUNT(*) AS generations, COALESCE(SUM(usd_est),0) AS usd, "
        "COALESCE(SUM(credits),0) AS credits FROM generations "
        "WHERE ts >= date_trunc('month', now() AT TIME ZONE 'utc')"
    )
    users = await pool.fetchrow(
        "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE disabled_at IS NOT NULL) AS disabled "
        "FROM users"
    )
    by_action = await pool.fetch(
        "SELECT action, COUNT(*) AS n, COALESCE(SUM(usd_est),0) AS usd FROM generations "
        "WHERE ts >= date_trunc('day', now() AT TIME ZONE 'utc') GROUP BY action ORDER BY usd DESC"
    )
    return {
        "today": {"generations": today["generations"], "usd_est": float(today["usd"]),
                  "credits": today["credits"],
                  "by_action": [{"action": r["action"], "n": r["n"], "usd_est": float(r["usd"])}
                                for r in by_action]},
        "month": {"generations": month["generations"], "usd_est": float(month["usd"]),
                  "credits": month["credits"]},
        "users": {"total": users["total"], "disabled": users["disabled"]},
    }


@router.get("/api/admin/users")
async def admin_users(request: Request, limit: int = 200):
    _require_admin(request)
    rows = await db.pool().fetch(
        "SELECT id, email, name, tier, credits_balance, credits_period, "
        "created_at, last_login_at, disabled_at FROM users "
        "ORDER BY created_at DESC LIMIT $1", min(max(limit, 1), 1000)
    )
    return {"users": [dict(r) for r in rows]}


@router.post("/api/admin/users/{user_id}/credits")
async def admin_adjust_credits(user_id: int, body: CreditAdjustRequest, request: Request):
    _require_admin(request)
    pool = db.pool()
    balance = await pool.fetchval(
        "UPDATE users SET credits_balance = GREATEST(credits_balance + $1, 0) "
        "WHERE id = $2 RETURNING credits_balance",
        body.delta, user_id,
    )
    if balance is None:
        raise HTTPException(status_code=404, detail="No such user")
    await pool.execute(
        "INSERT INTO credit_ledger (user_id, delta, reason, balance_after, note) "
        "VALUES ($1, $2, 'adjustment', $3, $4)",
        user_id, body.delta, balance, body.note[:300] or None,
    )
    return {"status": "success", "user_id": user_id, "balance": balance}


@router.post("/api/admin/users/{user_id}/disable")
async def admin_disable_user(user_id: int, body: DisableRequest, request: Request):
    _require_admin(request)
    pool = db.pool()
    row = await pool.fetchrow(
        "UPDATE users SET disabled_at = CASE WHEN $1 THEN now() ELSE NULL END "
        "WHERE id = $2 RETURNING id, disabled_at",
        body.disabled, user_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="No such user")
    if body.disabled:  # dead sessions can't linger on a banned account
        await pool.execute("DELETE FROM sessions WHERE user_id = $1", user_id)
    return {"status": "success", "user_id": user_id,
            "disabled": row["disabled_at"] is not None}
