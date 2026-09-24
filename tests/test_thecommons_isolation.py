"""End-to-end isolation tests — the literal proof of Stage 2's acceptance
criteria from docs/HANDOFF.md: "two rooms can run concurrently with
different art, controls, owners, presets, jobs, and undo. Changes,
reconnects, stale requests, and joins in one never affect or disclose
private state in the other. A second creator cannot read or mutate another
owner's jobs/presets by guessing IDs."

Full HTTP round trips through the real router + the real (fallback-only)
generator — no stubbing of thecommons_generate, since Stage 2's own
generator is offline-safe by design (see thecommons_generate.py).
"""

import uuid

import pytest
from fastapi.testclient import TestClient

import backend.server as server
from backend.service import db as service_db
from backend.service import thecommons_relay
from backend.service import thecommons_jobs

from tests.conftest import drain_commons_jobs
from tests.test_service_auth import _fake_user
from tests.test_service_credits import CLIENT_ID
from tests.test_thecommons_rooms import FakeCommonsPool

client = TestClient(server.app, raise_server_exceptions=False)


@pytest.fixture
def service_on(monkeypatch):
    from backend.service import budget as service_budget
    monkeypatch.setenv("SYNTH_AUTH", "1")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("SYNTH_TERMS_VERSION", "v0.2")
    # /api/thecommons/generate is in enforcement.AI_PREFIXES, so every
    # generate call here runs the daily budget breaker — reset its 30s cache
    # per test, matching test_service_enforcement.py's own convention.
    monkeypatch.setattr(service_budget, "_cache", {"at": 0.0, "usd": 0.0})


@pytest.fixture
def fake_pool(monkeypatch):
    pool = FakeCommonsPool()
    monkeypatch.setattr(service_db, "_pool", pool)
    return pool


@pytest.fixture(autouse=True)
def reset_registries(monkeypatch):
    thecommons_relay._relays.clear()
    thecommons_relay._creation_locks.clear()
    thecommons_jobs._start_locks.clear()
    # This file drives /api/thecommons/generate over real HTTP, which calls
    # the real thecommons_generate.generate_sketch() — unlike
    # test_thecommons_jobs.py, which injects a fake `generate` callable
    # directly. Forcing genai_client to None guarantees the "no key
    # configured" fallback path (no network call) regardless of whether this
    # machine happens to have a real Gemini key configured locally (it does
    # — see REPO_MAP.md's ai_studio_config.json note). Keeping tests off paid
    # providers is a hard invariant for this project; this was missing and
    # caused a real, slow, unmocked Gemini call during this file's tests.
    from backend.ai_manager import ai_manager
    monkeypatch.setattr(ai_manager, "genai_client", None)
    yield
    thecommons_relay._relays.clear()
    thecommons_relay._creation_locks.clear()
    thecommons_jobs._start_locks.clear()


def _multi_sign_in(monkeypatch, users_by_token: dict):
    from backend.service import auth as service_auth

    async def fake_resolve(token):
        user = users_by_token.get(token)
        return (user, None) if user else (None, None)
    monkeypatch.setattr(service_auth, "resolve_session", fake_resolve)


def _cookie_for(token: str) -> dict:
    from backend.service import auth as service_auth
    return {service_auth.COOKIE_NAME: token}


def _poll_job(cookies, room_id, job_id):
    """Wait on the job task itself, then read the row back over HTTP."""
    drain_commons_jobs(client)
    job = client.get(f"/api/thecommons/rooms/{room_id}/jobs/{job_id}", cookies=cookies).json()
    assert job["status"] != "generating", "job never left 'generating'"
    return job


def test_two_owners_two_rooms_fully_independent_lifecycle(service_on, fake_pool, monkeypatch):
    owner_a, owner_b = _fake_user(id=101, email="a@example.com"), _fake_user(id=102, email="b@example.com")
    _multi_sign_in(monkeypatch, {"tok-a": owner_a, "tok-b": owner_b})
    cookies_a, cookies_b = _cookie_for("tok-a"), _cookie_for("tok-b")

    room_a = client.post("/api/thecommons/rooms", json={"name": "Room A"}, cookies=cookies_a).json()
    room_b = client.post("/api/thecommons/rooms", json={"name": "Room B"}, cookies=cookies_b).json()
    assert room_a["id"] != room_b["id"]

    # Each owner generates independently.
    job_a = client.post("/api/thecommons/generate",
                         json={"roomId": room_a["id"], "prompt": "swirling color", "requestId": str(uuid.uuid4())},
                         cookies=cookies_a)
    job_b = client.post("/api/thecommons/generate",
                         json={"roomId": room_b["id"], "prompt": "geometric grid", "requestId": str(uuid.uuid4())},
                         cookies=cookies_b)
    assert job_a.status_code == 202 and job_b.status_code == 202

    done_a = _poll_job(cookies_a, room_a["id"], job_a.json()["job"]["id"])
    done_b = _poll_job(cookies_b, room_b["id"], job_b.json()["job"]["id"])
    assert done_a["status"] in ("completed", "fallback") and done_a["applied"] is True
    assert done_b["status"] in ("completed", "fallback") and done_b["applied"] is True

    room_a_after = client.get(f"/api/thecommons/rooms/{room_a['id']}", cookies=cookies_a).json()
    room_b_after = client.get(f"/api/thecommons/rooms/{room_b['id']}", cookies=cookies_b).json()
    assert room_a_after["sketchId"] == done_a["sketch"]["id"]
    assert room_b_after["sketchId"] == done_b["sketch"]["id"]
    assert room_a_after["sketchId"] != room_b_after["sketchId"]

    # Undo independently: undoing room A must not touch room B.
    r_undo_a = client.post(f"/api/thecommons/rooms/{room_a['id']}/undo", cookies=cookies_a)
    assert r_undo_a.status_code == 200
    room_b_still = client.get(f"/api/thecommons/rooms/{room_b['id']}", cookies=cookies_b).json()
    assert room_b_still["sketchId"] == done_b["sketch"]["id"]  # untouched by A's undo

    # Presets: each owner only ever sees their own.
    save_a = client.post(f"/api/thecommons/rooms/{room_a['id']}/presets",
                          json={"name": "A's look"}, cookies=cookies_a)
    assert save_a.status_code == 201
    presets_b = client.get(f"/api/thecommons/rooms/{room_b['id']}/presets", cookies=cookies_b).json()
    own_presets_b = [p for p in presets_b["presets"] if p["kind"] == "Saved looks"]
    assert own_presets_b == []  # A's saved preset is invisible from B's room


def test_owner_b_cannot_read_or_mutate_owner_a_room(service_on, fake_pool, monkeypatch):
    owner_a, owner_b = _fake_user(id=201, email="a2@example.com"), _fake_user(id=202, email="b2@example.com")
    _multi_sign_in(monkeypatch, {"tok-a": owner_a, "tok-b": owner_b})
    cookies_a, cookies_b = _cookie_for("tok-a"), _cookie_for("tok-b")

    room_a = client.post("/api/thecommons/rooms", json={"name": "Private"}, cookies=cookies_a).json()
    job = client.post("/api/thecommons/generate",
                       json={"roomId": room_a["id"], "prompt": "test", "requestId": str(uuid.uuid4())},
                       cookies=cookies_a).json()["job"]

    # Every mutating/reading endpoint, attempted by the non-owner, 404s.
    assert client.get(f"/api/thecommons/rooms/{room_a['id']}", cookies=cookies_b).status_code == 404
    assert client.post(f"/api/thecommons/rooms/{room_a['id']}/undo", cookies=cookies_b).status_code == 404
    assert client.get(f"/api/thecommons/rooms/{room_a['id']}/presets", cookies=cookies_b).status_code == 404
    assert client.get(f"/api/thecommons/rooms/{room_a['id']}/jobs/{job['id']}", cookies=cookies_b).status_code == 404
    assert client.post("/api/thecommons/generate",
                        json={"roomId": room_a["id"], "prompt": "hijack", "requestId": str(uuid.uuid4())},
                        cookies=cookies_b).status_code == 404


def test_stale_remix_in_one_room_never_touches_the_other(service_on, fake_pool, monkeypatch):
    owner_a, owner_b = _fake_user(id=301, email="a3@example.com"), _fake_user(id=302, email="b3@example.com")
    _multi_sign_in(monkeypatch, {"tok-a": owner_a, "tok-b": owner_b})
    cookies_a, cookies_b = _cookie_for("tok-a"), _cookie_for("tok-b")

    room_a = client.post("/api/thecommons/rooms", json={"name": "A"}, cookies=cookies_a).json()
    room_b = client.post("/api/thecommons/rooms", json={"name": "B"}, cookies=cookies_b).json()

    # Force room A's relay to hydrate with a known sketch id via a display connect.
    with client.websocket_connect(f"/ws/thecommons/{room_a['joinCode']}?role=display") as ws:
        assert ws.receive_json()["type"] == "images"
        current = ws.receive_json()
    with client.websocket_connect(f"/ws/thecommons/{room_b['joinCode']}?role=display") as ws:
        assert ws.receive_json()["type"] == "images"
        room_b_sketch = ws.receive_json()

    stale_remix = client.post(
        "/api/thecommons/generate",
        json={"roomId": room_a["id"], "prompt": "remix", "requestId": str(uuid.uuid4()),
              "mode": "remix", "baseSketchId": "definitely-not-the-real-id"},
        cookies=cookies_a,
    )
    assert stale_remix.status_code == 409

    room_a_after = client.get(f"/api/thecommons/rooms/{room_a['id']}", cookies=cookies_a).json()
    room_b_after = client.get(f"/api/thecommons/rooms/{room_b['id']}", cookies=cookies_b).json()
    assert room_a_after["sketchId"] == current["sketch"]["id"]  # untouched by the rejected remix
    assert room_b_after["sketchId"] == room_b_sketch["sketch"]["id"]  # room B was never in the request at all
