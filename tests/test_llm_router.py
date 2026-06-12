"""LLM router: provider selection, local model substitution, safety passing."""
import pytest

import backend.policy as policy_mod
import backend.services.llm_router as router_mod
from backend.ai_manager import ai_manager
from backend.policy import Policy, TIER_LOCAL


class FakeProvider:
    def __init__(self, name):
        self.name = name
        self.calls = []

    def generate(self, model, contents, json_mode=False, safety_settings=None):
        self.calls.append({"model": model, "contents": contents,
                           "json_mode": json_mode, "safety_settings": safety_settings})
        return "ok"

    def generate_stream(self, model, contents, safety_settings=None):
        self.calls.append({"model": model, "stream": True})
        yield "chunk"

    def chat(self, message, history, model):
        self.calls.append({"model": model, "chat": True})
        return "chatted"


@pytest.fixture()
def fresh_policy(tmp_path, monkeypatch):
    monkeypatch.setattr(policy_mod, "CONFIG_PATH", tmp_path / "cfg.json")
    monkeypatch.delenv("SYNTH_HOSTED", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    p = Policy()
    # llm_router reads the module-level singleton — point it at our instance.
    monkeypatch.setattr(router_mod, "policy", p)
    return p


def use_provider(monkeypatch, provider):
    monkeypatch.setattr(router_mod, "get_text_provider", lambda mgr: provider)
    return provider


class TestModelSubstitution:
    def test_local_tier_substitutes_configured_model(self, fresh_policy, monkeypatch):
        fresh_policy.update(tier=TIER_LOCAL, local_model="qwen2.5")
        provider = use_provider(monkeypatch, FakeProvider("local"))
        out = ai_manager.llm_text(["sys", "user"], "gemini-3.1-pro-preview", json_mode=True)
        assert out == "ok"
        assert provider.calls[0]["model"] == "qwen2.5"  # NOT the Gemini name
        # Local provider receives no safety settings from the router.
        assert provider.calls[0]["safety_settings"] is None

    def test_google_tier_keeps_requested_model_and_gets_safety(self, fresh_policy, monkeypatch):
        provider = use_provider(monkeypatch, FakeProvider("google"))
        ai_manager.llm_text(["sys", "user"], "gemini-3-flash-preview")
        call = provider.calls[0]
        assert call["model"] == "gemini-3-flash-preview"
        assert call["safety_settings"]  # baseline resolved by policy
        assert call["safety_settings"][0]["threshold"] == "BLOCK_ONLY_HIGH"

    def test_stream_and_chat_route_through_provider(self, fresh_policy, monkeypatch):
        provider = use_provider(monkeypatch, FakeProvider("google"))
        assert list(ai_manager.llm_text_stream(["p"], "m")) == ["chunk"]
        assert ai_manager.llm_chat("hi", None, "m") == "chatted"
        assert len(provider.calls) == 2


class TestTextOnlyGuard:
    def test_non_string_parts_rejected_by_providers(self):
        from backend.providers.base import ensure_text_only
        with pytest.raises(TypeError, match="non-string content part"):
            ensure_text_only(["fine", b"image-bytes"])
        with pytest.raises(TypeError):
            ensure_text_only([{"part": "x"}])
        assert ensure_text_only(["a", "b"]) == ["a", "b"]
