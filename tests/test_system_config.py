"""/api/config and /api/health behavior via FastAPI TestClient.

Builds a minimal app with just the system router — no static mounts, no
startup side effects. configure_api is monkeypatched so no Google client is
constructed with fake keys.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import backend.policy as policy_mod
import backend.routers.system as system_router
from backend.policy import Policy


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(policy_mod, "CONFIG_PATH", tmp_path / "cfg.json")
    monkeypatch.delenv("SYNTH_HOSTED", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    fresh = Policy()
    # system.py imported the singleton by name — repoint it.
    monkeypatch.setattr(system_router, "policy", fresh)
    monkeypatch.setattr(policy_mod, "policy", fresh)

    configured = {}
    monkeypatch.setattr(system_router.ai_manager, "configure_api",
                        lambda key, save=True: configured.update(key=key))

    app = FastAPI()
    app.include_router(system_router.router)
    test_client = TestClient(app)
    test_client._configured = configured
    return test_client


class TestConfigEndpoint:
    def test_legacy_api_key_payload_still_works(self, client):
        res = client.post("/api/config", json={"api_key": "fake-key-123"})
        assert res.status_code == 200
        assert client._configured["key"] == "fake-key-123"
        assert "api_key" in res.json()["applied"]

    def test_tier_and_safety_update(self, client):
        res = client.post("/api/config", json={
            "backend_tier": "local",
            "local_base_url": "http://localhost:11434/v1",
            "local_model": "llama3.1",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["backend"]["configured_tier"] == "local"

        res2 = client.post("/api/config", json={
            "backend_tier": "google",
            "safety_settings": [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            ],
        })
        assert res2.status_code == 200
        assert res2.json()["backend"]["safety_customized"] is True

    def test_empty_payload_is_400(self, client):
        res = client.post("/api/config", json={})
        assert res.status_code == 400

    def test_invalid_tier_is_400(self, client):
        res = client.post("/api/config", json={"backend_tier": "mainframe"})
        assert res.status_code == 400

    def test_hosted_rejects_all_mutations(self, client, monkeypatch):
        monkeypatch.setenv("SYNTH_HOSTED", "1")
        for payload in ({"api_key": "x"}, {"backend_tier": "local"}):
            res = client.post("/api/config", json=payload)
            assert res.status_code == 403, payload


class TestHealthEndpoint:
    def test_health_includes_tier_snapshot(self, client):
        res = client.get("/api/health")
        assert res.status_code == 200
        body = res.json()
        for field in ("backend_tier", "hosted", "local_base_url",
                      "local_model", "safety_defaults"):
            assert field in body, field
        assert body["hosted"] is False
        assert body["backend_tier"] == "google"

    def test_health_reports_hosted_pinning(self, client, monkeypatch):
        client.post("/api/config", json={"backend_tier": "local"})
        monkeypatch.setenv("SYNTH_HOSTED", "1")
        body = client.get("/api/health").json()
        assert body["hosted"] is True
        assert body["backend_tier"] == "google"      # pinned
        assert body["configured_tier"] == "local"    # but remembered


class TestLocalModelsProxy:
    def test_forbidden_when_hosted(self, client, monkeypatch):
        monkeypatch.setenv("SYNTH_HOSTED", "1")
        res = client.get("/api/backend/local/models")
        assert res.status_code == 403

    def test_unreachable_local_server_is_502(self, client, monkeypatch):
        import backend.providers.openai_compat as oc

        def boom(self):
            raise ConnectionError("Could not reach http://localhost:11434/v1/models")

        monkeypatch.setattr(oc.OpenAICompatProvider, "list_models", boom)
        res = client.get("/api/backend/local/models")
        assert res.status_code == 502
        assert "Could not reach" in res.json()["detail"]
