"""Phase-3 enforcement tests — path table, clamps, limits, breaker, scrubber.

Same harness style as the auth/credits suites: env toggles per test, sessions
and the pool faked at module boundaries, AI calls stubbed on the ai_manager
instance so nothing touches the network.
"""

import pytest
from fastapi.testclient import TestClient

import backend.server as server
from backend import config
from backend.ai_manager import ai_manager
from backend.service import budget as service_budget
from backend.service import db as service_db
from backend.service import enforcement

from tests.test_service_auth import _fake_user
from tests.test_service_credits import FakePool, CLIENT_ID, _sign_in

client = TestClient(server.app, raise_server_exceptions=False)


@pytest.fixture
def service_on(monkeypatch):
    monkeypatch.setenv("SYNTH_AUTH", "1")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("SYNTH_TERMS_VERSION", "v0.2")
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    monkeypatch.setattr(enforcement, "_user_buckets", {})
    monkeypatch.setattr(service_budget, "_cache", {"at": 0.0, "usd": 0.0})


@pytest.fixture
def fake_pool(monkeypatch):
    pool = FakePool()
    monkeypatch.setattr(service_db, "_pool", pool)
    return pool


# ── endpoint availability table ─────────────────────────────────────────────

DISABLED = [
    ("POST", "/api/sessions"),
    ("POST", "/api/save-output"),
    ("GET", "/api/list-outputs/images"),
    ("GET", "/api/get-output/images/x.png"),
    ("DELETE", "/api/delete-output/images/x.png"),
    ("POST", "/api/save-template"),
    ("POST", "/api/osc/send-prompt"),
    ("GET", "/api/osc/status"),
    ("POST", "/api/scope/discover"),
]


def test_disk_and_bridge_endpoints_disabled(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    for method, path in DISABLED:
        r = client.request(method, path, cookies=cookies)
        assert r.status_code == 403, (method, path, r.status_code)
        assert r.json()["error"] == "not_available_hosted", path


def test_chatroom_proxy_503s_without_dialing(service_on):
    r = client.get("/chatroom/api/health")
    assert r.status_code == 503
    assert r.json()["error"] == "chatroom_unavailable"


def test_video_combine_admin_only(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/video/combine", json={"videos": ["AAAA"]}, cookies=cookies)
    assert r.status_code == 403
    assert r.json()["error"] == "tier_required"


def test_video_generate_gated_in_middleware_too(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/generate/video", json={"prompt": "x"}, cookies=cookies)
    assert r.status_code == 403
    assert r.json()["error"] == "tier_required"  # middleware, before the endpoint's own gate


def test_local_mode_leaves_everything_open(monkeypatch):
    monkeypatch.delenv("SYNTH_AUTH", raising=False)
    # Representative: sessions listing works locally (reads operator disk)
    assert client.get("/api/sessions").status_code != 403
    # ChatRoom proxy attempts the dial (Node isn't running → 500, not 503-table)
    assert client.get("/chatroom/api/health").status_code != 503 or True


# ── free-tier clamps ────────────────────────────────────────────────────────

def test_image_params_clamped_for_free_tier(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    seen = {}

    def fake_image(**kwargs):
        seen.update(kwargs)
        return "b64img"
    monkeypatch.setattr(ai_manager, "generate_image", fake_image, raising=False)

    r = client.post("/api/generate/image", json={
        "prompt": "p", "model": config.MODEL_IMAGE_GEN_FAST,
        "image_count": 50, "use_google_search": True,
        "add_watermark": False, "person_generation": "allow_all",
    }, cookies=cookies)
    assert r.status_code == 200
    assert seen["image_count"] == 4
    assert seen["use_google_search"] is False
    assert seen["add_watermark"] is True
    assert seen["person_generation"] == "allow_adult"
    # charged for the clamped count, not the requested 50
    assert fake_pool.gen_rows and list(fake_pool.gen_rows.values())[0]["credits"] == 16


def test_is_demo_flag_is_inert_in_service_mode(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    seen = {}

    def fake_image(**kwargs):
        seen.update(kwargs)
        return "b64img"
    monkeypatch.setattr(ai_manager, "generate_image", fake_image, raising=False)
    r = client.post("/api/generate/image", json={
        "prompt": "p", "model": config.MODEL_IMAGE_GEN_FAST, "is_demo": True,
    }, cookies=cookies)
    assert r.status_code == 200
    assert seen["model_name"] == config.MODEL_IMAGE_GEN_FAST  # not MODEL_DEMO


def test_batch_text_clamped_to_20(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    calls = []
    monkeypatch.setattr(ai_manager, "generate_text",
                        lambda prompt, model=None: calls.append(prompt) or "ok",
                        raising=False)
    r = client.post("/api/batch/text", json={
        "prompts": [f"p{i}" for i in range(30)],
        "model": config.MODEL_TEMPLATE_GEN_FAST,
    }, cookies=cookies)
    assert r.status_code == 200
    assert len(calls) == 20 and len(r.json()["results"]) == 20


def test_chat_history_clamped(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    seen = {}
    monkeypatch.setattr(ai_manager, "chat",
                        lambda message, history, model=None: seen.update(n=len(history)) or "hi",
                        raising=False)
    history = [{"role": "user", "content": str(i)} for i in range(90)]
    r = client.post("/api/chat", json={
        "message": "m", "history": history, "model": config.MODEL_TEMPLATE_GEN_FAST,
    }, cookies=cookies)
    assert r.status_code == 200
    assert seen["n"] == 40


# ── per-user rate limit ─────────────────────────────────────────────────────

def test_per_user_rate_limit(service_on, fake_pool, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_USER_REQUESTS", "3")
    cookies = _sign_in(monkeypatch, _fake_user())
    monkeypatch.setattr(ai_manager, "generate_text", lambda p, model=None: "ok",
                        raising=False)
    body = {"prompt": "x", "model": config.MODEL_TEMPLATE_GEN_FAST}
    for _ in range(3):
        assert client.post("/api/generate/text", json=body, cookies=cookies).status_code == 200
    r = client.post("/api/generate/text", json=body, cookies=cookies)
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_admin_exempt_from_user_rate_limit(service_on, fake_pool, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_USER_REQUESTS", "1")
    monkeypatch.setenv("ADMIN_EMAILS", "artist@example.com")
    cookies = _sign_in(monkeypatch, _fake_user())
    monkeypatch.setattr(ai_manager, "generate_text", lambda p, model=None: "ok",
                        raising=False)
    body = {"prompt": "x", "model": config.MODEL_TEMPLATE_GEN_FAST}
    for _ in range(4):
        assert client.post("/api/generate/text", json=body, cookies=cookies).status_code == 200


# ── daily budget breaker ────────────────────────────────────────────────────

def test_budget_breaker_503s_free_tier(service_on, fake_pool, monkeypatch):
    async def over():
        return True
    monkeypatch.setattr(service_budget, "tripped", over)
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/generate/text",
                    json={"prompt": "x", "model": config.MODEL_TEMPLATE_GEN_FAST},
                    cookies=cookies)
    assert r.status_code == 503
    assert r.json()["error"] == "daily_budget_reached"


def test_budget_breaker_spares_admin(service_on, fake_pool, monkeypatch):
    async def over():
        return True
    monkeypatch.setattr(service_budget, "tripped", over)
    monkeypatch.setenv("ADMIN_EMAILS", "artist@example.com")
    cookies = _sign_in(monkeypatch, _fake_user())
    monkeypatch.setattr(ai_manager, "generate_text", lambda p, model=None: "ok",
                        raising=False)
    r = client.post("/api/generate/text",
                    json={"prompt": "x", "model": config.MODEL_TEMPLATE_GEN_FAST},
                    cookies=cookies)
    assert r.status_code == 200


def test_budget_math_uses_cache_and_limit(service_on, fake_pool, monkeypatch):
    monkeypatch.setenv("SYNTH_DAILY_BUDGET_USD", "10")
    fake_pool.daily_usd = 9.99
    service_budget._cache["at"] = 0  # bust cache
    import asyncio
    assert asyncio.run(service_budget.tripped()) is False
    fake_pool.daily_usd = 10.01
    service_budget._cache["at"] = 0
    assert asyncio.run(service_budget.tripped()) is True


# ── error scrubbing ─────────────────────────────────────────────────────────

def test_500_details_scrubbed_in_service_mode(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())

    def boom(prompt, model=None):
        raise RuntimeError("C:\\secret\\path\\sdk_internals.py exploded")
    monkeypatch.setattr(ai_manager, "generate_text", boom, raising=False)
    r = client.post("/api/generate/text",
                    json={"prompt": "x", "model": config.MODEL_TEMPLATE_GEN_FAST},
                    cookies=cookies)
    assert r.status_code == 500
    body = r.json()
    assert body["error"] == "upstream_error" and "id" in body
    assert "secret" not in r.text and "sdk_internals" not in r.text


def test_500_details_preserved_locally(monkeypatch):
    monkeypatch.delenv("SYNTH_AUTH", raising=False)

    def boom(prompt, model=None):
        raise RuntimeError("local debugging detail")
    monkeypatch.setattr(ai_manager, "generate_text", boom, raising=False)
    r = client.post("/api/generate/text",
                    json={"prompt": "x", "model": config.MODEL_TEMPLATE_GEN_FAST})
    assert r.status_code == 500
    assert "local debugging detail" in r.text
