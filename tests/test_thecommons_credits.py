"""Credit metering for The Commons — reserve before dispatch, settle after.

Drives the real router + real credits.Charge against FakeCommonsPool's
credit accounting, with google_api.gen_text stubbed so nothing reaches a
provider. The properties that matter here are the ones docs/HANDOFF.md's
"Credit-enforcement gaps" section called out: no dispatch without a
reservation, no reservation burned by a request that was rejected, and no
refund for an outcome a user could provoke on purpose.
"""

import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

import backend.server as server
from backend import google_api
from backend.ai_manager import ai_manager
from backend.service import db as service_db
from backend.service import thecommons_relay, thecommons_jobs

from tests.test_service_auth import _fake_user
from tests.test_service_credits import CLIENT_ID, _sign_in
from tests.test_thecommons_rooms import FakeCommonsPool

client = TestClient(server.app, raise_server_exceptions=False)

# 5 credits for the Pro model × 2, covering the possible repair call.
COMMONS_SKETCH_COST = 10

VALID_SKETCH_JSON = json.dumps({
    "name": "Metered Drift",
    "promptTemplate": "a {{palette}} drift at {{speed}}",
    "code": "ctx.fillRect(0,0,frame.width,frame.height);",
    "variables": [
        {"name": "palette", "values": [
            {"text": "warm", "weight": 1}, {"text": "cool", "weight": 1}, {"text": "mono", "weight": 1}]},
        {"name": "speed", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
    ],
})


@pytest.fixture
def service_on(monkeypatch):
    from backend.service import budget as service_budget
    from backend.service import enforcement
    monkeypatch.setenv("SYNTH_AUTH", "1")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("SYNTH_TERMS_VERSION", "v0.2")
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)  # otherwise the owner is never debited
    monkeypatch.setattr(enforcement, "_user_buckets", {})
    monkeypatch.setattr(service_budget, "_cache", {"at": 0.0, "usd": 0.0})


@pytest.fixture
def fake_pool(monkeypatch):
    pool = FakeCommonsPool()
    monkeypatch.setattr(service_db, "_pool", pool)
    return pool


@pytest.fixture(autouse=True)
def reset_registries():
    thecommons_relay._relays.clear()
    thecommons_relay._creation_locks.clear()
    thecommons_jobs._start_locks.clear()
    yield
    thecommons_relay._relays.clear()
    thecommons_relay._creation_locks.clear()
    thecommons_jobs._start_locks.clear()


def _model_answers(monkeypatch, response=VALID_SKETCH_JSON):
    """Gemini configured and answering — the charge-stands path."""
    monkeypatch.setattr(ai_manager, "genai_client", object())
    monkeypatch.setattr(google_api, "gen_text", lambda *a, **k: response)


def _model_unavailable(monkeypatch):
    """No key configured — nothing is dispatched, so nothing is chargeable."""
    monkeypatch.setattr(ai_manager, "genai_client", None)


def _generate(cookies, room_id, prompt="make something"):
    return client.post("/api/thecommons/generate",
                        json={"roomId": room_id, "prompt": prompt, "requestId": str(uuid.uuid4())},
                        cookies=cookies)


def _await_settlement(pool, job_id, tries=200, delay=0.05):
    """Wait for the generations row to reach a settled state.

    Deliberately not "wait for the job to leave 'generating'": the charge is
    settled in _run_job's finally block, strictly *after* the job row is
    updated, so polling job status leaves a window where the status is final
    but the credits aren't settled yet — which flaked exactly once in a full
    suite run before this waited on the right thing.
    """
    for _ in range(tries):
        job = pool.room_jobs.get(job_id)
        gen_id = job and job.get("generation_id")
        if gen_id and pool.generations[gen_id]["status"] in ("ok", "refunded"):
            return
        time.sleep(delay)
    raise AssertionError("charge never settled")


def _new_room(cookies, name="Room"):
    return client.post("/api/thecommons/rooms", json={"name": name}, cookies=cookies).json()


def test_generation_reserves_credits_before_dispatch(service_on, fake_pool, monkeypatch):
    user = _fake_user(id=501)
    cookies = _sign_in(monkeypatch, user)
    _model_answers(monkeypatch)
    room = _new_room(cookies)
    start_balance = fake_pool.balance_of(501)

    r = _generate(cookies, room["id"])
    assert r.status_code == 202
    # Debited at job-start time, not at completion — the 202 is not success.
    assert fake_pool.balance_of(501) == start_balance - COMMONS_SKETCH_COST
    job_id = r.json()["job"]["id"]
    assert fake_pool.room_jobs[job_id]["generation_id"] is not None  # linked for audit


def test_answered_generation_keeps_the_charge(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user(id=502))
    _model_answers(monkeypatch)
    room = _new_room(cookies)
    start_balance = fake_pool.balance_of(502)

    job_id = _generate(cookies, room["id"]).json()["job"]["id"]
    _await_settlement(fake_pool, job_id)

    assert fake_pool.balance_of(502) == start_balance - COMMONS_SKETCH_COST
    assert "refund" not in fake_pool.ledger_reasons()
    gen_id = fake_pool.room_jobs[job_id]["generation_id"]
    assert fake_pool.generations[gen_id]["status"] == "ok"


def test_unusable_model_output_still_keeps_the_charge(service_on, fake_pool, monkeypatch):
    """The gameable path: a user can prompt their way to junk output, so
    refunding it would fund unlimited retries on the operator's key."""
    cookies = _sign_in(monkeypatch, _fake_user(id=503))
    _model_answers(monkeypatch, response="absolutely not json")
    room = _new_room(cookies)
    start_balance = fake_pool.balance_of(503)

    job_id = _generate(cookies, room["id"]).json()["job"]["id"]
    _await_settlement(fake_pool, job_id)

    assert fake_pool.room_jobs[job_id]["status"] == "fallback"
    assert fake_pool.balance_of(503) == start_balance - COMMONS_SKETCH_COST
    assert "refund" not in fake_pool.ledger_reasons()


def test_no_provider_call_is_refunded_in_full(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user(id=504))
    _model_unavailable(monkeypatch)
    room = _new_room(cookies)
    start_balance = fake_pool.balance_of(504)

    job_id = _generate(cookies, room["id"]).json()["job"]["id"]
    _await_settlement(fake_pool, job_id)

    assert fake_pool.balance_of(504) == start_balance  # made whole
    assert "refund" in fake_pool.ledger_reasons()
    gen_id = fake_pool.room_jobs[job_id]["generation_id"]
    assert fake_pool.generations[gen_id]["status"] == "refunded"


def test_transport_failure_is_refunded(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user(id=505))
    monkeypatch.setattr(ai_manager, "genai_client", object())

    def boom(*a, **k):
        raise RuntimeError("HTTP 503")

    monkeypatch.setattr(google_api, "gen_text", boom)
    room = _new_room(cookies)
    start_balance = fake_pool.balance_of(505)

    job_id = _generate(cookies, room["id"]).json()["job"]["id"]
    _await_settlement(fake_pool, job_id)

    assert fake_pool.balance_of(505) == start_balance
    assert "refund" in fake_pool.ledger_reasons()


def test_out_of_credits_returns_402_and_starts_no_job(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user(id=506))
    _model_answers(monkeypatch)
    room = _new_room(cookies)
    fake_pool.balances[506] = COMMONS_SKETCH_COST - 1  # one short

    r = _generate(cookies, room["id"])
    assert r.status_code == 402
    assert r.json()["detail"]["error"] == "out_of_credits"
    assert fake_pool.room_jobs == {}  # nothing dispatched
    assert fake_pool.balances[506] == COMMONS_SKETCH_COST - 1  # untouched


def test_rejected_requests_never_burn_credits(service_on, fake_pool, monkeypatch):
    """Idempotent replay, a busy room, and a stale remix all reject *before*
    the reservation is taken, so none of them costs the owner anything."""
    cookies = _sign_in(monkeypatch, _fake_user(id=507))
    _model_answers(monkeypatch)
    room = _new_room(cookies)

    request_id = str(uuid.uuid4())
    body = {"roomId": room["id"], "prompt": "same prompt", "requestId": request_id}
    first = client.post("/api/thecommons/generate", json=body, cookies=cookies)
    assert first.status_code == 202
    after_first = fake_pool.balance_of(507)
    _await_settlement(fake_pool, first.json()["job"]["id"])
    settled_balance = fake_pool.balance_of(507)

    # Same requestId again → the existing job, no second reservation.
    replay = client.post("/api/thecommons/generate", json=body, cookies=cookies)
    assert replay.status_code == 202
    assert replay.json()["job"]["id"] == first.json()["job"]["id"]
    assert fake_pool.balance_of(507) == settled_balance

    # Stale remix → 409, still no charge.
    stale = client.post("/api/thecommons/generate", cookies=cookies, json={
        "roomId": room["id"], "prompt": "remix", "requestId": str(uuid.uuid4()),
        "mode": "remix", "baseSketchId": "not-the-live-one"})
    assert stale.status_code == 409
    assert fake_pool.balance_of(507) == settled_balance
    assert after_first == settled_balance  # answered → charge stood, no refund


def test_one_owners_spend_never_moves_anothers_balance(service_on, fake_pool, monkeypatch):
    owner_a, owner_b = _fake_user(id=601, email="a@x.com"), _fake_user(id=602, email="b@x.com")

    from backend.service import auth as service_auth

    async def resolve(token):
        return ({"tok-a": owner_a, "tok-b": owner_b}.get(token), None)

    monkeypatch.setattr(service_auth, "resolve_session", resolve)
    _model_answers(monkeypatch)
    cookies_a = {service_auth.COOKIE_NAME: "tok-a"}
    cookies_b = {service_auth.COOKIE_NAME: "tok-b"}

    room_a = _new_room(cookies_a, "A")
    _new_room(cookies_b, "B")
    b_start = fake_pool.balance_of(602)

    _generate(cookies_a, room_a["id"])
    assert fake_pool.balance_of(601) == FakeCommonsPool.DEFAULT_BALANCE - COMMONS_SKETCH_COST
    assert fake_pool.balance_of(602) == b_start


def test_admins_are_not_debited(service_on, fake_pool, monkeypatch):
    """Matches every other suite feature: the operator's own calls are logged
    in the ledger at zero credits, never debited."""
    monkeypatch.setenv("ADMIN_EMAILS", "boss@example.com")
    cookies = _sign_in(monkeypatch, _fake_user(id=700, email="boss@example.com"))
    _model_answers(monkeypatch)
    room = _new_room(cookies)
    start_balance = fake_pool.balance_of(700)

    r = _generate(cookies, room["id"])
    assert r.status_code == 202
    assert fake_pool.balance_of(700) == start_balance
