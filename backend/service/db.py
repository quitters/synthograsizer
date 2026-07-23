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

SCHEMA_VERSION = 3

# version → list of SQL statements upgrading an EXISTING database from
# version-1 to version. Purely additive, and never run on a fresh database
# (see _migrate: schema.sql already is the current schema there).
#
# What goes here: only what schema.sql cannot express idempotently — ALTER
# TABLE ADD COLUMN, backfills, index changes over existing rows. A brand-new
# table does NOT belong here; add it to schema.sql with CREATE TABLE IF NOT
# EXISTS and it lands on fresh and existing databases alike.
#
# v2 (artifacts, 2026-07-20) is exactly that case: the table and its index are
# in schema.sql, so there is nothing additive to replay — the version bump
# alone records the change.
#
# v3 (artifacts.thumb_path, 2026-07-22) is the FIRST entry that carries real
# SQL: a new column on an existing table. A fresh database already has it from
# schema.sql and never runs this; only a database created at v2 needs the
# ALTER. IF NOT EXISTS keeps it safe even if the version bookkeeping is ever
# off — re-running it against a DB that already has the column is a no-op.
_MIGRATIONS: dict[int, list[str]] = {
    2: [],
    3: ["ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS thumb_path TEXT"],
}

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


def _schema_sql_text() -> str:
    return (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")


async def _migrate(pool) -> None:
    """Apply schema.sql, then bring an EXISTING database's version forward.

    A fresh database (no schema_version row yet) is stamped straight to
    SCHEMA_VERSION with no migration steps replayed: schema.sql just built
    the complete current schema, so there is nothing additive left to apply
    — replaying old steps here would run them against tables/columns that
    already exist in their final form, which for anything past a bare
    CREATE TABLE (e.g. an ALTER TABLE ADD COLUMN) errors or double-applies.
    Migration steps exist solely to carry a database that pre-dates this
    deploy forward from its own recorded version.
    """
    schema_sql = _schema_sql_text()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(schema_sql)
            row = await conn.fetchrow("SELECT version FROM schema_version LIMIT 1")
            if row is None:
                await conn.execute(
                    "INSERT INTO schema_version (version) VALUES ($1)", SCHEMA_VERSION
                )
                return
            current = row["version"]
            for step in range(current + 1, SCHEMA_VERSION + 1):
                for stmt in _MIGRATIONS.get(step, []):
                    await conn.execute(stmt)
            if current < SCHEMA_VERSION:
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
