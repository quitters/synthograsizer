"""Service database — asyncpg pool + migrate-on-boot.

Connection resolution (first match wins):
  1. ``DATABASE_URL`` — full DSN, used by docker-compose.dev.yml and tests.
  2. ``INSTANCE_CONNECTION_NAME`` (+ ``DB_USER``/``DB_PASS``/``DB_NAME``) —
     Cloud SQL unix socket at ``/cloudsql/<name>`` as mounted by Cloud Run's
     ``--add-cloudsql-instances``.

asyncpg is imported lazily so local installs (SYNTH_AUTH unset) never need
the dependency at import time. Migration philosophy mirrors
``scripts/film_factory/db.py::_migrate``: idempotent base DDL + a dict of
additive steps keyed by schema version.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1

# version → list of SQL statements upgrading from version-1. Purely additive.
_MIGRATIONS: dict[int, list[str]] = {}

_pool = None


def _connect_kwargs() -> dict:
    url = os.environ.get("DATABASE_URL")
    if url:
        return {"dsn": url}
    icn = os.environ.get("INSTANCE_CONNECTION_NAME")
    if icn:
        return {
            "host": f"/cloudsql/{icn}",
            "user": os.environ.get("DB_USER", "postgres"),
            "password": os.environ.get("DB_PASS", ""),
            "database": os.environ.get("DB_NAME", "synth"),
        }
    raise RuntimeError(
        "Service mode needs DATABASE_URL or INSTANCE_CONNECTION_NAME "
        "(+ DB_USER/DB_PASS/DB_NAME) — see .env.example."
    )


async def init():
    """Create the pool and apply schema. Safe to call more than once."""
    global _pool
    if _pool is not None:
        return _pool
    import asyncpg  # lazy: only service-mode processes need the driver

    _pool = await asyncpg.create_pool(
        **_connect_kwargs(),
        min_size=1,
        max_size=int(os.environ.get("DB_POOL_MAX", "5")),
        command_timeout=30,
    )
    await _migrate(_pool)
    logger.info("service db ready (schema v%s)", SCHEMA_VERSION)
    return _pool


async def _migrate(pool) -> None:
    schema_sql = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(schema_sql)
            row = await conn.fetchrow("SELECT version FROM schema_version LIMIT 1")
            current = row["version"] if row else 0
            for step in range(current + 1, SCHEMA_VERSION + 1):
                for stmt in _MIGRATIONS.get(step, []):
                    await conn.execute(stmt)
            if row is None:
                await conn.execute(
                    "INSERT INTO schema_version (version) VALUES ($1)", SCHEMA_VERSION
                )
            elif current < SCHEMA_VERSION:
                await conn.execute("UPDATE schema_version SET version = $1", SCHEMA_VERSION)


def pool():
    """The live pool; raises if service startup hasn't run."""
    if _pool is None:
        raise RuntimeError("service database not initialized (is SYNTH_AUTH=1 and startup complete?)")
    return _pool


async def close():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
