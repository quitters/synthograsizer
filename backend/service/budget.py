"""Daily USD circuit breaker — the last line of key-spend defense.

If per-user limits ever fail (bug, leaked session, bot swarm), the summed
``generations.usd_est`` for the UTC day crossing ``SYNTH_DAILY_BUDGET_USD``
(default $25) 503s every non-admin AI request until midnight UTC. Admin
traffic keeps flowing — and keeps being logged into the same sum.

The sum is cached ~30s per process; with max-instances=1 that is globally
coherent. DB trouble fails OPEN (never let a broken breaker take the
service down) and logs loudly.
"""

import logging
import os
import time

from . import db

logger = logging.getLogger(__name__)

_cache = {"at": 0.0, "usd": 0.0}
_CACHE_TTL = 30.0


def budget_limit_usd() -> float:
    return float(os.environ.get("SYNTH_DAILY_BUDGET_USD", "25"))


async def daily_spend_usd() -> float:
    now = time.monotonic()
    if now - _cache["at"] < _CACHE_TTL:
        return _cache["usd"]
    usd = await db.pool().fetchval(
        "SELECT COALESCE(SUM(usd_est), 0) FROM generations "
        "WHERE ts >= date_trunc('day', now() AT TIME ZONE 'utc')"
    )
    _cache["at"] = now
    _cache["usd"] = float(usd or 0)
    return _cache["usd"]


async def tripped() -> bool:
    try:
        return await daily_spend_usd() >= budget_limit_usd()
    except Exception:
        logger.exception("budget breaker check failed — failing open")
        return False
