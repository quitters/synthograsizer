"""Credit metering — lazy monthly grant + reserve/commit/refund charging.

Charging contract (used by the generation routers):

    async with charged(http_request, action="image", model=name, units=n) as ch:
        result = await asyncio.to_thread(...)
        ch.commit()          # not reached on exception → __aexit__ refunds

- Reserve happens up-front with a single atomic conditional UPDATE
  (``... WHERE credits_balance >= cost``) — no race can overspend.
- The generations row is inserted at reserve time with status='failed' and
  flipped to 'ok' on commit, so a crash leaves an honest audit trail (a
  later janitor can refund orphans).
- Admins are never debited but still get a generations row (credits=0,
  real usd_est) so the operator's own spend shows in the same ledger.
- When service mode is off every entry point is a no-op passthrough.

Invariant (tested): SUM(credit_ledger.delta) == users.credits_balance.
"""

import logging
import time
from datetime import datetime, timezone

from fastapi import HTTPException

from . import auth, db, pricing, service_mode

logger = logging.getLogger(__name__)


def current_period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def ensure_monthly_grant(user):
    """Reset the balance on the first authenticated request of a new month.

    ``SELECT ... FOR UPDATE`` serializes concurrent first-of-month requests;
    losers re-read the fresh period and no-op. No rollover: balance resets TO
    the grant, and the ledger delta is (grant − old) so the sum invariant
    holds. Returns the refreshed user row.
    """
    period = current_period()
    if user["credits_period"] == period:
        return user
    grant = auth.monthly_credits()
    pool = db.pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT credits_balance, credits_period FROM users WHERE id = $1 FOR UPDATE",
                user["id"],
            )
            if row is not None and row["credits_period"] != period:
                await conn.execute(
                    "UPDATE users SET credits_balance = $1, credits_period = $2 WHERE id = $3",
                    grant, period, user["id"],
                )
                await conn.execute(
                    "INSERT INTO credit_ledger (user_id, delta, reason, balance_after) "
                    "VALUES ($1, $2, 'monthly_grant', $3)",
                    user["id"], grant - row["credits_balance"], grant,
                )
    return await auth.get_user(user["id"])


class Charge:
    """One metered generation. Prefer the ``charged()`` context manager;
    streaming endpoints drive reserve/settle_ok/settle_refund directly."""

    def __init__(self, http_request, action: str, model: str | None = None,
                 units: float = 1, prompt_chars: int = 0):
        self.request = http_request
        self.action = action
        self.model = model
        self.units = units
        self.prompt_chars = prompt_chars
        self.active = service_mode()
        self.is_admin = False
        self.cost = 0
        self.usd = 0.0
        self.gen_id = None
        self._t0 = time.monotonic()
        self._settled = False

    async def reserve(self):
        if not self.active:
            return self
        user = getattr(self.request.state, "user", None)
        if user is None:  # enforcement middleware should have stopped this
            raise HTTPException(status_code=401, detail={"error": "auth_required"})
        self.user_id = user["id"]
        self.is_admin = getattr(self.request.state, "tier", None) == "admin"

        try:
            self.cost, self.usd, unit_kind = pricing.resolve(self.action, self.model, self.units)
        except pricing.InvalidModel as exc:
            raise HTTPException(status_code=400, detail={"error": "invalid_model",
                                                         "message": str(exc)})
        pool = db.pool()
        balance = None
        if not self.is_admin and self.cost > 0:
            balance = await pool.fetchval(
                "UPDATE users SET credits_balance = credits_balance - $1 "
                "WHERE id = $2 AND credits_balance >= $1 RETURNING credits_balance",
                self.cost, self.user_id,
            )
            if balance is None:
                current = await pool.fetchval(
                    "SELECT credits_balance FROM users WHERE id = $1", self.user_id
                )
                raise HTTPException(status_code=402, detail={
                    "error": "out_of_credits",
                    "balance": current or 0,
                    "needed": self.cost,
                })
        self.gen_id = await pool.fetchval(
            "INSERT INTO generations (user_id, endpoint, action, model, units, unit_kind, "
            "credits, usd_est, status, prompt_chars) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'failed', $9) RETURNING id",
            self.user_id, self.request.url.path, self.action, self.model,
            float(self.units), unit_kind, 0 if self.is_admin else self.cost,
            self.usd, self.prompt_chars,
        )
        if balance is not None:
            await pool.execute(
                "INSERT INTO credit_ledger (user_id, delta, reason, balance_after, generation_id) "
                "VALUES ($1, $2, 'charge', $3, $4)",
                self.user_id, -self.cost, balance, self.gen_id,
            )
            self.request.state.credits_balance = balance  # → X-Credits-Balance header
        return self

    async def settle_ok(self, error: str | None = None):
        """Charge stands. ``error`` marks a mid-stream interruption on an
        otherwise-committed generation."""
        if not self.active or self._settled:
            return
        self._settled = True
        await db.pool().execute(
            "UPDATE generations SET status = 'ok', latency_ms = $1, error = $2 WHERE id = $3",
            int((time.monotonic() - self._t0) * 1000), error, self.gen_id,
        )

    async def settle_refund(self, error: str | None = None):
        if not self.active or self._settled:
            return
        self._settled = True
        pool = db.pool()
        if not self.is_admin and self.cost > 0:
            balance = await pool.fetchval(
                "UPDATE users SET credits_balance = credits_balance + $1 "
                "WHERE id = $2 RETURNING credits_balance",
                self.cost, self.user_id,
            )
            await pool.execute(
                "INSERT INTO credit_ledger (user_id, delta, reason, balance_after, generation_id) "
                "VALUES ($1, $2, 'refund', $3, $4)",
                self.user_id, self.cost, balance, self.gen_id,
            )
            self.request.state.credits_balance = balance
        await pool.execute(
            "UPDATE generations SET status = 'refunded', latency_ms = $1, error = $2 WHERE id = $3",
            int((time.monotonic() - self._t0) * 1000), (error or "")[:120] or None, self.gen_id,
        )


class charged:
    """``async with charged(...) as ch: ...; ch.commit()`` — refunds unless
    ``commit()`` was reached; exceptions always propagate."""

    def __init__(self, http_request, action: str, model: str | None = None,
                 units: float = 1, prompt_chars: int = 0):
        self._charge = Charge(http_request, action, model, units, prompt_chars)
        self._committed = False

    def commit(self):
        self._committed = True

    async def __aenter__(self):
        await self._charge.reserve()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        try:
            if exc_type is None and self._committed:
                await self._charge.settle_ok()
            else:
                await self._charge.settle_refund(exc_type.__name__ if exc_type else "not_committed")
        except Exception:
            logger.exception("credit settlement failed (gen_id=%s)", self._charge.gen_id)
        return False  # never swallow the endpoint's exception
