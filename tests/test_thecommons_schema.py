"""Schema/migration tests for The Commons' three new tables — same shape as
test_service_db_migrate.py's own v2 (artifacts) precedent: a fresh database
gets everything from schema.sql directly and replays no migration steps; an
existing v3 database just bumps its recorded version with nothing additive
to run, since the tables are fully expressed in schema.sql.
"""

import asyncio

from backend.service import db as service_db


class FakePool:
    """Records every statement.execute()d against it; fetchrow answers the
    schema_version bookkeeping query the same way test_service_db_migrate.py's
    poisoned_migration fixture does."""

    def __init__(self, existing_version=None):
        self.existing_version = existing_version
        self.executed: list[str] = []

    def acquire(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def transaction(self):
        return self

    async def execute(self, sql, *args):
        self.executed.append(" ".join(sql.split()))

    async def fetchrow(self, sql, *args):
        if "SELECT version FROM schema_version" in sql:
            return {"version": self.existing_version} if self.existing_version is not None else None
        raise AssertionError(f"unexpected fetchrow: {sql}")


def test_new_tables_present_in_schema_sql():
    schema = service_db._schema_sql_text()
    for table in ("commons_rooms", "commons_room_state", "commons_room_jobs", "commons_room_images"):
        assert f"CREATE TABLE IF NOT EXISTS {table}" in schema

    assert "owner_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE" in schema
    assert "join_code      TEXT NOT NULL UNIQUE" in schema
    assert "room_id     BIGINT PRIMARY KEY REFERENCES commons_rooms(id) ON DELETE CASCADE" in schema
    assert "room_id            BIGINT NOT NULL REFERENCES commons_rooms(id) ON DELETE CASCADE" in schema
    assert "generation_id      BIGINT REFERENCES generations(id) ON DELETE SET NULL" in schema
    assert "commons_room_jobs_room_request_idx ON commons_room_jobs(room_id, client_request_id)" in schema
    assert "room_id     BIGINT NOT NULL REFERENCES commons_rooms(id) ON DELETE CASCADE" in schema
    assert "commons_room_images_room_idx ON commons_room_images(room_id, position)" in schema


def test_schema_version_is_5():
    # v4 added the rooms; v5 (2026-09-23) added room images. Both are new
    # tables only, so neither carries migration SQL.
    assert service_db.SCHEMA_VERSION == 5
    assert service_db._MIGRATIONS[4] == [] and service_db._MIGRATIONS[5] == []


def test_fresh_database_replays_no_commons_migration_steps():
    pool = FakePool(existing_version=None)
    asyncio.run(service_db._migrate(pool))
    # Only schema.sql (via execute) plus the version-insert ran — no
    # additive ALTER statements, since a fresh DB already has the tables in
    # their final v4 shape.
    inserts = [s for s in pool.executed if "INSERT INTO schema_version" in s]
    assert len(inserts) == 1
    assert not any("ALTER TABLE commons" in s for s in pool.executed)


def test_existing_v3_database_bumps_to_v4_with_no_additive_sql():
    pool = FakePool(existing_version=3)
    asyncio.run(service_db._migrate(pool))
    assert any("UPDATE schema_version SET version" in s for s in pool.executed)
    assert not any("ALTER TABLE commons" in s or "CREATE TABLE commons" in s for s in pool.executed
                   if "IF NOT EXISTS" not in s)


def test_existing_v4_database_bumps_to_v5_with_no_additive_sql():
    pool = FakePool(existing_version=4)
    asyncio.run(service_db._migrate(pool))
    assert any("UPDATE schema_version SET version" in s for s in pool.executed)
    assert not any("ALTER TABLE" in s for s in pool.executed)
