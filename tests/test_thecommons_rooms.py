"""Room CRUD/ownership tests for routers/thecommons.py.

No Postgres: FakeCommonsPool is an in-memory relational store implementing
exactly the SQL shapes thecommons_jobs.py/thecommons.py emit against
commons_rooms/commons_room_state/commons_room_jobs — same philosophy as
FakePool in test_service_credits.py. Auth/session helpers (_fake_user,
_sign_in) are reused from their existing homes, matching test_service_dsar.py
and test_service_artifacts.py's own convention.
"""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import backend.server as server
from backend.service import db as service_db
from backend.service import thecommons_relay
from backend.service import thecommons_jobs

from tests.test_service_auth import _fake_user
from tests.test_service_credits import CLIENT_ID, _sign_in

client = TestClient(server.app, raise_server_exceptions=False)


# ── fake pool ────────────────────────────────────────────────────────────────

class FakeCommonsPool:
    DEFAULT_BALANCE = 300

    def __init__(self):
        self.rooms: dict[int, dict] = {}
        self.room_state: dict[int, dict] = {}
        self.room_jobs: dict[int, dict] = {}
        self._next_room_id = 1
        self._next_job_id = 1
        # Credit accounting — per user_id, unlike test_service_credits.py's
        # single-balance FakePool, because Commons is multi-tenant and "one
        # owner's spend never moves another's balance" is a property worth
        # being able to assert.
        self.balances: dict[int, int] = {}
        self.generations: dict[int, dict] = {}
        self.ledger: list[dict] = []
        self._next_generation_id = 1

    def balance_of(self, user_id: int) -> int:
        return self.balances.setdefault(user_id, self.DEFAULT_BALANCE)

    def ledger_reasons(self) -> list[str]:
        return [entry["reason"] for entry in self.ledger]

    @staticmethod
    def _norm(sql):
        return " ".join(sql.split())

    # -- direct helpers for tests to seed/inspect state ----------------------
    def seed_room(self, owner_user_id, join_code=None, name=None, status="active"):
        rid = self._next_room_id
        self._next_room_id += 1
        self.rooms[rid] = {
            "id": rid, "owner_user_id": owner_user_id, "join_code": join_code or f"code-{rid}",
            "name": name, "status": status, "created_at": datetime.now(timezone.utc), "closed_at": None,
        }
        return rid

    # -- asyncpg surface ------------------------------------------------------
    async def fetchrow(self, sql, *args):
        s = self._norm(sql)

        if "INSERT INTO commons_rooms" in s:
            owner_user_id, join_code, name = args
            rid = self._next_room_id
            self._next_room_id += 1
            row = {"id": rid, "owner_user_id": owner_user_id, "join_code": join_code, "name": name,
                   "status": "active", "created_at": datetime.now(timezone.utc), "closed_at": None}
            self.rooms[rid] = row
            return dict(row)

        if "SELECT * FROM commons_rooms WHERE id = $1 AND owner_user_id = $2" in s:
            room_id, owner_user_id = args
            row = self.rooms.get(room_id)
            return dict(row) if row and row["owner_user_id"] == owner_user_id else None

        if "SELECT id, status FROM commons_rooms WHERE join_code = $1" in s:
            (join_code,) = args
            for row in self.rooms.values():
                if row["join_code"] == join_code:
                    return {"id": row["id"], "status": row["status"]}
            return None

        if "SELECT sketch, values, undo FROM commons_room_state" in s:
            (room_id,) = args
            row = self.room_state.get(room_id)
            return dict(row) if row else None

        if "SELECT sketch, values FROM commons_room_state" in s:
            (room_id,) = args
            row = self.room_state.get(room_id)
            return {"sketch": row["sketch"], "values": row["values"]} if row else None

        if "SELECT id FROM commons_room_jobs WHERE room_id = $1 AND status = 'generating'" in s:
            (room_id,) = args
            for row in self.room_jobs.values():
                if row["room_id"] == room_id and row["status"] == "generating":
                    return {"id": row["id"]}
            return None

        if "SELECT * FROM commons_room_jobs WHERE id = $1 AND room_id = $2" in s:
            job_id, room_id = args
            row = self.room_jobs.get(job_id)
            return dict(row) if row and row["room_id"] == room_id else None

        if "status = 'generating' ORDER BY id DESC LIMIT 1" in s:
            (room_id,) = args
            candidates = [r for r in self.room_jobs.values()
                          if r["room_id"] == room_id and r["status"] == "generating"]
            return dict(max(candidates, key=lambda r: r["id"])) if candidates else None

        if "SELECT * FROM commons_room_jobs WHERE room_id = $1 AND client_request_id = $2" in s:
            room_id, request_id = args
            for row in self.room_jobs.values():
                if row["room_id"] == room_id and row["client_request_id"] == request_id:
                    return dict(row)
            return None

        if "INSERT INTO commons_room_jobs" in s and "RETURNING *" in s:
            room_id, client_request_id, mode, prompt, source, generation_id = args
            jid = self._next_job_id
            self._next_job_id += 1
            row = {"id": jid, "room_id": room_id, "client_request_id": client_request_id,
                   "status": "generating", "mode": mode, "prompt": prompt, "preset_name": None,
                   "base_sketch_id": None, "source": source, "sketch": None, "values": None,
                   "applied": False, "error": None, "generation_id": generation_id,
                   "created_at": datetime.now(timezone.utc), "finished_at": None}
            self.room_jobs[jid] = row
            return dict(row)

        if "INSERT INTO commons_room_jobs" in s and "RETURNING id" in s:
            room_id, client_request_id, preset_name, sketch, values = args
            jid = self._next_job_id
            self._next_job_id += 1
            self.room_jobs[jid] = {
                "id": jid, "room_id": room_id, "client_request_id": client_request_id,
                "status": "preset", "mode": "create", "prompt": "", "preset_name": preset_name,
                "base_sketch_id": None, "source": None, "sketch": sketch, "values": values,
                "applied": True, "error": None, "generation_id": None,
                "created_at": datetime.now(timezone.utc), "finished_at": datetime.now(timezone.utc),
            }
            return {"id": jid}

        raise AssertionError(f"unexpected fetchrow: {s}")

    async def fetchval(self, sql, *args):
        s = self._norm(sql)

        # ── credits.Charge's reserve/refund shapes ──────────────────────────
        if "SET credits_balance = credits_balance -" in s:
            cost, user_id = args
            if self.balance_of(user_id) >= cost:
                self.balances[user_id] -= cost
                return self.balances[user_id]
            return None  # insufficient → Charge.reserve raises 402
        if "SET credits_balance = credits_balance +" in s:
            cost, user_id = args
            self.balances[user_id] = self.balance_of(user_id) + cost
            return self.balances[user_id]
        if "SELECT credits_balance FROM users" in s:
            (user_id,) = args
            return self.balance_of(user_id)
        if "INSERT INTO generations" in s:
            gid = self._next_generation_id
            self._next_generation_id += 1
            self.generations[gid] = {"user_id": args[0], "endpoint": args[1], "action": args[2],
                                      "model": args[3], "credits": args[6], "usd": args[7],
                                      "status": "failed", "error": None}
            return gid

        if "SUM(usd_est)" in s:
            # The daily budget breaker (enforcement.py's AI_PREFIXES gate,
            # which /api/thecommons/generate is in) queries this on every
            # generate call. No Commons job ever writes usd_est today (no
            # credit charging yet — see thecommons_generate.py), so there is
            # always exactly 0 spend to report; returning it directly avoids
            # budget.tripped()'s except-and-log-a-full-traceback fail-open
            # path, which otherwise fires on every single generate call.
            return 0.0
        raise AssertionError(f"unexpected fetchval: {s}")

    async def fetch(self, sql, *args):
        s = self._norm(sql)
        if "SELECT * FROM commons_rooms WHERE owner_user_id = $1" in s:
            (owner_user_id,) = args
            rows = [r for r in self.rooms.values() if r["owner_user_id"] == owner_user_id]
            rows.sort(key=lambda r: r["created_at"], reverse=True)
            return [dict(r) for r in rows]
        if "SELECT id, sketch, values, preset_name, status, finished_at FROM commons_room_jobs" in s:
            (room_id,) = args
            rows = [r for r in self.room_jobs.values()
                    if r["room_id"] == room_id and r["status"] in ("completed", "preset")]
            rows.sort(key=lambda r: r["finished_at"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
            return [dict(r) for r in rows]
        raise AssertionError(f"unexpected fetch: {s}")

    async def execute(self, sql, *args):
        s = self._norm(sql)

        # ── credits.Charge's ledger/settlement shapes ───────────────────────
        if "INSERT INTO credit_ledger" in s:
            user_id, delta, balance_after, generation_id = args
            self.ledger.append({"user_id": user_id, "delta": delta, "generation_id": generation_id,
                                 "reason": "refund" if delta > 0 else "charge"})
            return
        if "UPDATE generations SET status = 'ok'" in s:
            _latency, error, gen_id = args
            self.generations[gen_id].update(status="ok", error=error)
            return
        if "UPDATE generations SET status = 'refunded'" in s:
            _latency, error, gen_id = args
            self.generations[gen_id].update(status="refunded", error=error)
            return

        if "UPDATE commons_room_jobs SET status = 'interrupted'" in s:
            for row in self.room_jobs.values():
                if row["status"] == "generating":
                    row["status"] = "interrupted"
                    row["error"] = "The server restarted during generation. Your prompt was saved; retry when ready."
                    row["finished_at"] = datetime.now(timezone.utc)
            return
        if "UPDATE commons_room_jobs SET status = $1, sketch = $2::jsonb" in s:
            status, sketch, values, applied, job_id = args
            self.room_jobs[job_id].update(
                status=status, sketch=sketch, values=values, applied=applied,
                finished_at=datetime.now(timezone.utc))
            return
        if "UPDATE commons_room_jobs SET status = 'failed'" in s:
            error, job_id = args
            self.room_jobs[job_id].update(
                status="failed", error=error, applied=False, finished_at=datetime.now(timezone.utc))
            return
        if "INSERT INTO commons_room_state" in s and "ON CONFLICT" in s:
            room_id, sketch, values, undo = args
            self.room_state[room_id] = {"room_id": room_id, "sketch": sketch, "values": values,
                                         "undo": undo, "updated_at": datetime.now(timezone.utc)}
            return
        if "UPDATE commons_room_state SET sketch = $1::jsonb" in s:
            sketch, values, room_id = args
            self.room_state.setdefault(room_id, {"room_id": room_id})
            self.room_state[room_id].update(sketch=sketch, values=values, undo=None,
                                             updated_at=datetime.now(timezone.utc))
            return
        raise AssertionError(f"unexpected execute: {s}")


@pytest.fixture
def service_on(monkeypatch):
    monkeypatch.setenv("SYNTH_AUTH", "1")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("SYNTH_TERMS_VERSION", "v0.2")


@pytest.fixture
def fake_pool(monkeypatch):
    pool = FakeCommonsPool()
    monkeypatch.setattr(service_db, "_pool", pool)
    return pool


@pytest.fixture(autouse=True)
def reset_thecommons_registries():
    # The relay registry and job start-locks are process-global module state
    # (by design — see thecommons_relay.py); clear them between tests so
    # room_id reuse across FakeCommonsPool instances can't leak a relay
    # object from one test into another.
    thecommons_relay._relays.clear()
    thecommons_relay._creation_locks.clear()
    thecommons_jobs._start_locks.clear()
    yield
    thecommons_relay._relays.clear()
    thecommons_relay._creation_locks.clear()
    thecommons_jobs._start_locks.clear()


# ── tests ────────────────────────────────────────────────────────────────────

def test_create_room_requires_sign_in(service_on, fake_pool):
    r = client.post("/api/thecommons/rooms", json={"name": "My room"})
    assert r.status_code == 401


def test_create_room_succeeds_for_any_signed_in_account(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user(id=7))
    r = client.post("/api/thecommons/rooms", json={"name": "Owner7 Room"}, cookies=cookies)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Owner7 Room"
    assert body["status"] == "active"
    assert isinstance(body["joinCode"], str) and len(body["joinCode"]) > 10


def test_list_my_rooms_returns_only_own_rooms(service_on, fake_pool, monkeypatch):
    fake_pool.seed_room(owner_user_id=1, name="mine")
    fake_pool.seed_room(owner_user_id=2, name="not mine")
    cookies = _sign_in(monkeypatch, _fake_user(id=1))
    r = client.get("/api/me/thecommons/rooms", cookies=cookies)
    assert r.status_code == 200
    names = [room["name"] for room in r.json()["rooms"]]
    assert names == ["mine"]


def test_nonexistent_and_unowned_room_return_identical_404(service_on, fake_pool, monkeypatch):
    owned_by_2 = fake_pool.seed_room(owner_user_id=2)
    cookies = _sign_in(monkeypatch, _fake_user(id=1))

    r_missing = client.get("/api/thecommons/rooms/999999", cookies=cookies)
    r_unowned = client.get(f"/api/thecommons/rooms/{owned_by_2}", cookies=cookies)

    assert r_missing.status_code == 404
    assert r_unowned.status_code == 404
    # The literal proof that a room_id can't be enumerated: identical bodies
    # for "doesn't exist" and "exists but isn't yours".
    assert r_missing.json() == r_unowned.json()


def test_owner_can_read_own_room(service_on, fake_pool, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1, name="my room")
    cookies = _sign_in(monkeypatch, _fake_user(id=1))
    r = client.get(f"/api/thecommons/rooms/{room_id}", cookies=cookies)
    assert r.status_code == 200
    assert r.json()["name"] == "my room"
    assert r.json()["canUndo"] is False


def test_cross_origin_write_is_rejected(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user(id=1))
    r = client.post("/api/thecommons/rooms", json={"name": "x"}, cookies=cookies,
                     headers={"Origin": "https://evil.example.com"})
    assert r.status_code == 403
    assert r.json()["error"] == "cross_origin_rejected"


def test_qr_returns_png_for_active_room_with_no_login_needed(service_on, fake_pool):
    fake_pool.seed_room(owner_user_id=1, join_code="scan-me")
    r = client.get("/api/thecommons/qr/scan-me")  # deliberately no cookies
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_qr_404s_for_unknown_and_closed_join_codes(service_on, fake_pool):
    fake_pool.seed_room(owner_user_id=1, join_code="closed-code", status="closed")
    assert client.get("/api/thecommons/qr/does-not-exist").status_code == 404
    assert client.get("/api/thecommons/qr/closed-code").status_code == 404


def test_qr_encodes_the_configured_public_origin_not_the_internal_host(service_on, fake_pool, monkeypatch):
    from backend.routers import thecommons as thecommons_router
    fake_pool.seed_room(owner_user_id=1, join_code="scan-me-2")
    monkeypatch.setenv("SYNTH_PUBLIC_ORIGINS", "https://synthograsizer.com,https://www.synthograsizer.com")
    captured = {}
    real_make = thecommons_router.qrcode.make

    def spy_make(data, **kwargs):
        captured["data"] = data
        return real_make(data, **kwargs)

    monkeypatch.setattr(thecommons_router.qrcode, "make", spy_make)
    r = client.get("/api/thecommons/qr/scan-me-2")
    assert r.status_code == 200
    assert captured["data"] == "https://synthograsizer.com/thecommons/join/scan-me-2"


def test_telemetry_is_owner_only_not_public(service_on, fake_pool, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    # Anonymous request (no cookie at all) must not see telemetry.
    r_anon = client.get(f"/api/thecommons/rooms/{room_id}/telemetry")
    assert r_anon.status_code == 401

    other_cookies = _sign_in(monkeypatch, _fake_user(id=2))
    r_other = client.get(f"/api/thecommons/rooms/{room_id}/telemetry", cookies=other_cookies)
    assert r_other.status_code == 404
