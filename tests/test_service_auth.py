"""Service-mode auth tests — flag gating, enforcement middleware, sessions.

No Postgres needed: DB-touching paths are monkeypatched at the
``backend.service.auth`` module boundary (account.py and enforcement.py both
call through that module object). Bodies sent to AI endpoints are deliberately
invalid so requests that clear the middleware die in FastAPI validation (422)
— proof of passage without ever reaching model code or the live API key.
"""

import pytest
from fastapi.testclient import TestClient

import backend.server as server
from backend.service import auth as service_auth
from backend.service import service_mode

client = TestClient(server.app, raise_server_exceptions=False)

CLIENT_ID = "679278101913-test.apps.googleusercontent.com"


def _fake_user(**over):
    from backend.service.credits import current_period
    row = {
        "id": 1,
        "google_sub": "sub-123",
        "email": "artist@example.com",
        "email_verified": True,
        "name": "Artist Example",
        "avatar_url": None,
        "tier": "free",
        "credits_balance": 300,
        "credits_period": current_period(),  # current → middleware skips the grant path
        "accepted_terms_version": "v0.2",
        "age_attested_at": "2026-07-18T00:00:00Z",
        "stripe_customer_id": None,
        "disabled_at": None,
    }
    row.update(over)
    return row


@pytest.fixture
def service_on(monkeypatch):
    monkeypatch.setenv("SYNTH_AUTH", "1")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("SYNTH_TERMS_VERSION", "v0.2")
    monkeypatch.delenv("SYNTH_INSECURE_COOKIES", raising=False)


# ── local mode: bit-for-bit inert ───────────────────────────────────────────

def test_local_mode_is_inert(monkeypatch):
    monkeypatch.delenv("SYNTH_AUTH", raising=False)
    assert not service_mode()
    health = client.get("/api/health").json()
    assert "service" not in health
    assert client.get("/api/me").status_code == 404
    # AI endpoints are NOT auth-walled locally (invalid body → validation, not 401)
    r = client.post("/api/generate/text", json={})
    assert r.status_code != 401


# ── service mode: surface + anonymous walls ─────────────────────────────────

def test_health_advertises_service(service_on):
    health = client.get("/api/health").json()
    assert health["service"]["auth_required"] is True
    assert health["service"]["gis_client_id"] == CLIENT_ID
    assert health["service"]["terms_version"] == "v0.2"


def test_anonymous_ai_calls_are_401(service_on):
    for path in ("/api/generate/text", "/api/chat", "/api/analyze/image-to-prompt",
                 "/api/generate/image", "/api/generate/video"):
        r = client.post(path, json={})
        assert r.status_code == 401, path
        assert r.json()["error"] == "auth_required"


def test_me_requires_session(service_on):
    assert client.get("/api/me").status_code == 401


def test_non_ai_endpoints_stay_public(service_on):
    assert client.get("/api/health").status_code == 200
    assert client.post("/api/extract-metadata", json={}).status_code != 401


def test_cross_origin_post_rejected(service_on):
    r = client.post("/api/generate/text", json={},
                    headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    assert r.json()["error"] == "cross_origin_rejected"


def test_same_origin_post_passes_origin_check(service_on):
    r = client.post("/api/generate/text", json={},
                    headers={"Origin": "http://testserver", "Host": "testserver"})
    assert r.status_code == 401  # cleared CSRF, stopped at the auth wall


def test_proxied_public_origin_passes_when_allowlisted(service_on, monkeypatch):
    """A reverse proxy (synthograsizer.com → run.app) makes Origin and Host
    legitimately disagree; SYNTH_PUBLIC_ORIGINS is the operator's opt-in."""
    monkeypatch.setenv("SYNTH_PUBLIC_ORIGINS", "https://synthograsizer.com")
    r = client.post("/api/generate/text", json={},
                    headers={"Origin": "https://synthograsizer.com", "Host": "testserver"})
    assert r.status_code == 401  # cleared CSRF, stopped at the auth wall


def test_proxied_public_origin_rejected_when_not_allowlisted(service_on, monkeypatch):
    monkeypatch.delenv("SYNTH_PUBLIC_ORIGINS", raising=False)
    r = client.post("/api/generate/text", json={},
                    headers={"Origin": "https://synthograsizer.com", "Host": "testserver"})
    assert r.status_code == 403
    assert r.json()["error"] == "cross_origin_rejected"


def test_allowlist_does_not_admit_other_origins(service_on, monkeypatch):
    monkeypatch.setenv("SYNTH_PUBLIC_ORIGINS", "https://synthograsizer.com")
    r = client.post("/api/generate/text", json={},
                    headers={"Origin": "https://evil.example", "Host": "testserver"})
    assert r.status_code == 403
    assert r.json()["error"] == "cross_origin_rejected"


# ── sign-in flow (Google verify + DB mocked) ────────────────────────────────

def test_auth_google_rejects_bad_credential(service_on, monkeypatch):
    monkeypatch.setattr(service_auth, "verify_google_credential",
                        lambda cred: (_ for _ in ()).throw(ValueError("bad token")))
    r = client.post("/api/auth/google", json={"credential": "garbage"})
    assert r.status_code == 401


def test_auth_google_mints_session_cookie(service_on, monkeypatch):
    async def fake_upsert(claims):
        return _fake_user(email=claims["email"])

    async def fake_create_session(user_id, ua, ip):
        return "opaque-test-token"

    monkeypatch.setattr(service_auth, "verify_google_credential",
                        lambda cred: {"sub": "sub-123", "email": "artist@example.com",
                                      "email_verified": True, "name": "Artist"})
    monkeypatch.setattr(service_auth, "upsert_user", fake_upsert)
    monkeypatch.setattr(service_auth, "create_session", fake_create_session)

    r = client.post("/api/auth/google", json={"credential": "mock"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["email"] == "artist@example.com"
    assert body["features"]["video"] is False and body["features"]["text"] is True
    cookie = r.headers["set-cookie"]
    assert service_auth.COOKIE_NAME in cookie
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Secure" in cookie


def test_insecure_cookie_flag_for_http_dev(service_on, monkeypatch):
    monkeypatch.setenv("SYNTH_INSECURE_COOKIES", "1")

    async def fake_upsert(claims):
        return _fake_user()

    async def fake_create_session(user_id, ua, ip):
        return "tok"

    monkeypatch.setattr(service_auth, "verify_google_credential", lambda c: {
        "sub": "s", "email": "artist@example.com", "email_verified": True})
    monkeypatch.setattr(service_auth, "upsert_user", fake_upsert)
    monkeypatch.setattr(service_auth, "create_session", fake_create_session)
    cookie = client.post("/api/auth/google", json={"credential": "m"}).headers["set-cookie"]
    assert "Secure" not in cookie


# ── session-backed enforcement (resolve mocked) ─────────────────────────────

def _patch_session(monkeypatch, user):
    async def fake_resolve(token):
        return user, None
    monkeypatch.setattr(service_auth, "resolve_session", fake_resolve)


def test_signed_in_user_clears_wall(service_on, monkeypatch):
    _patch_session(monkeypatch, _fake_user())
    r = client.post("/api/generate/text", json={},
                    cookies={service_auth.COOKIE_NAME: "tok"})
    assert r.status_code == 422  # middleware passed; died in validation, not auth


def test_terms_gate_blocks_until_accepted(service_on, monkeypatch):
    _patch_session(monkeypatch, _fake_user(accepted_terms_version=None))
    r = client.post("/api/generate/text", json={},
                    cookies={service_auth.COOKIE_NAME: "tok"})
    assert r.status_code == 403
    assert r.json()["error"] == "terms_required"


def test_disabled_account_is_blocked(service_on, monkeypatch):
    _patch_session(monkeypatch, _fake_user(disabled_at="2026-07-01T00:00:00Z"))
    r = client.post("/api/generate/text", json={},
                    cookies={service_auth.COOKIE_NAME: "tok"})
    assert r.status_code == 403
    assert r.json()["error"] == "account_disabled"


def test_admin_email_gets_admin_features(service_on, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "boss@example.com, artist@example.com")
    payload = service_auth.me_payload(_fake_user())
    assert payload["user"]["is_admin"] is True
    assert payload["features"]["video"] is True and payload["features"]["music"] is True
    monkeypatch.setenv("ADMIN_EMAILS", "boss@example.com")
    payload = service_auth.me_payload(_fake_user())
    assert payload["user"]["is_admin"] is False
    assert payload["features"]["video"] is False


def test_ws_music_closes_for_anonymous(service_on):
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/music"):
            pass
    assert exc.value.code == 4401
