"""Schema migration tests — backend/service/db.py::_migrate.

Runs without Postgres: a fake asyncpg pool/connection implements exactly the
calls _migrate makes (execute, fetchrow, acquire, transaction), so the real
migration branching executes for real — only the storage is a recorder
instead of a database. Async code is driven with asyncio.run(), matching the
convention in test_service_credits.py (no pytest-asyncio plugin is installed).

The case that matters: a FRESH database (no schema_version row) must be
stamped straight to SCHEMA_VERSION with no migration steps replayed.
schema.sql already builds the complete current schema on that database, so
replaying an old step there runs it a second time against tables/columns
that already exist in final form — harmless for a bare CREATE TABLE, but an
ALTER TABLE ADD COLUMN or a backfill would error or double-apply. That bug
existed until this test was written: the pre-fix loop computed `current = 0`
for a fresh database and replayed every step up to SCHEMA_VERSION regardless.
"""

import asyncio

import pytest

from backend.service import db as service_db


class FakeConn:
    """Records every statement; answers schema_version queries from a script."""

    def __init__(self, existing_version=None):
        self.existing_version = existing_version
        self.executed = []  # [(sql, args), ...] in order

    async def execute(self, sql, *args):
        self.executed.append((sql, args))

    async def fetchrow(self, sql, *args):
        if "SELECT version FROM schema_version" in sql:
            if self.existing_version is None:
                return None
            return {"version": self.existing_version}
        return None

    def transaction(self):
        return _NullAsyncCtx()

    def statements_containing(self, needle):
        return [sql for sql, _args in self.executed if needle in sql]


class _NullAsyncCtx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _AcquireCtx:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *exc):
        return False


class FakePool:
    def __init__(self, existing_version=None):
        self.conn = FakeConn(existing_version)

    def acquire(self):
        return _AcquireCtx(self.conn)


POISON = "ALTER TABLE fake_table ADD COLUMN would_fail_if_replayed TEXT"


@pytest.fixture
def poisoned_migration(monkeypatch):
    """A step-2 migration statement that must NEVER run against a fresh DB."""
    monkeypatch.setitem(service_db._MIGRATIONS, 2, [POISON])


def test_fresh_database_skips_all_migration_steps(poisoned_migration):
    pool = FakePool(existing_version=None)
    asyncio.run(service_db._migrate(pool))

    assert pool.conn.statements_containing(POISON) == [], (
        "a fresh database replayed a migration step — schema.sql already "
        "built the current schema, so this would double-apply or error"
    )
    inserts = pool.conn.statements_containing("INSERT INTO schema_version")
    assert len(inserts) == 1
    assert inserts[0] == "INSERT INTO schema_version (version) VALUES ($1)"
    assert pool.conn.executed[-1][1] == (service_db.SCHEMA_VERSION,)
    assert pool.conn.statements_containing("UPDATE schema_version") == []


def test_existing_v1_database_runs_v2_migration(poisoned_migration):
    pool = FakePool(existing_version=1)
    asyncio.run(service_db._migrate(pool))

    assert pool.conn.statements_containing(POISON) == [POISON], (
        "an existing v1 database did not run the v2 migration step"
    )
    updates = pool.conn.statements_containing("UPDATE schema_version")
    assert len(updates) == 1
    assert pool.conn.executed[-1][1] == (service_db.SCHEMA_VERSION,)
    assert pool.conn.statements_containing("INSERT INTO schema_version") == []


def test_already_current_database_is_a_no_op(poisoned_migration):
    pool = FakePool(existing_version=service_db.SCHEMA_VERSION)
    asyncio.run(service_db._migrate(pool))

    assert pool.conn.statements_containing(POISON) == []
    assert pool.conn.statements_containing("UPDATE schema_version") == []
    assert pool.conn.statements_containing("INSERT INTO schema_version") == []


def test_schema_sql_is_always_applied_first(poisoned_migration):
    """The base DDL runs before any version check, on every path."""
    for existing_version in (None, 1, service_db.SCHEMA_VERSION):
        pool = FakePool(existing_version=existing_version)
        asyncio.run(service_db._migrate(pool))
        assert pool.conn.executed[0][0] == service_db._schema_sql_text()


def test_artifacts_table_and_index_are_in_schema_sql():
    """Guards the actual gallery migration this test suite was written for."""
    sql = service_db._schema_sql_text()
    assert "CREATE TABLE IF NOT EXISTS artifacts" in sql
    assert "artifacts_user_created" in sql
    assert "ON DELETE CASCADE" in sql


# ── v3: artifacts.thumb_path — the first migration entry with real SQL ────────

_THUMB_ALTER = "ADD COLUMN IF NOT EXISTS thumb_path"


def test_existing_v2_database_runs_v3_thumb_migration():
    """A DB created at v2 (pre-thumbnails) gets the thumb_path column added."""
    pool = FakePool(existing_version=2)
    asyncio.run(service_db._migrate(pool))
    assert pool.conn.statements_containing(_THUMB_ALTER), "v2→v3 must add artifacts.thumb_path"
    updates = pool.conn.statements_containing("UPDATE schema_version")
    assert len(updates) == 1
    assert pool.conn.executed[-1][1] == (service_db.SCHEMA_VERSION,)


def test_fresh_database_does_not_run_v3_thumb_alter():
    """The exact bug class: a fresh DB already has thumb_path from schema.sql, so
    the ALTER must NOT replay (it would be redundant, and any future non-idempotent
    step here would double-apply)."""
    pool = FakePool(existing_version=None)
    asyncio.run(service_db._migrate(pool))
    assert pool.conn.statements_containing(_THUMB_ALTER) == []


def test_thumb_path_in_schema_sql_for_fresh_databases():
    """Fresh installs must get thumb_path from the base DDL, not the migration."""
    assert "thumb_path" in service_db._schema_sql_text()
