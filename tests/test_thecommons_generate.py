"""Tests for thecommons_generate.py — live Gemini wiring with the
validation-aware repair pass, no OpenAI, no credit charging (2026-09-16
scope). google_api.gen_text is stubbed at the module boundary (same
"AI calls are stubbed at the ai_manager instance" convention the rest of the
suite's tests use) so nothing touches the network or a real API key.
"""

import asyncio
import json

import pytest

from backend.ai_manager import ai_manager
from backend import google_api
from backend.service import thecommons_generate as gen


VALID_SKETCH_JSON = json.dumps({
    "name": "Neon Drift",
    "promptTemplate": "a {{palette}} drift with {{speed}}",
    "code": "ctx.fillRect(0,0,frame.width,frame.height);",
    "variables": [
        {"name": "palette", "values": [
            {"text": "warm", "weight": 1}, {"text": "cool", "weight": 1}, {"text": "mono", "weight": 1},
        ]},
        {"name": "speed", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
    ],
})


@pytest.fixture
def gemini_configured(monkeypatch):
    monkeypatch.setattr(ai_manager, "genai_client", object())  # any truthy sentinel
    yield


def _stub_calls(monkeypatch, responses):
    """responses: list of (str | Exception) consumed in order, one per call."""
    calls = []

    def fake_gen_text(client, model, blocks, **kwargs):
        calls.append({"model": model, "blocks": blocks, **kwargs})
        result = responses[len(calls) - 1]
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(google_api, "gen_text", fake_gen_text)
    return calls


def test_no_key_configured_returns_fallback(monkeypatch):
    monkeypatch.setattr(ai_manager, "genai_client", None)
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is True
    assert sketch["reason"] == "no Gemini key configured"


def test_successful_generation_is_tagged_gemini_and_not_fallback(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, [VALID_SKETCH_JSON])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is False
    assert sketch["name"] == "Neon Drift"
    assert sketch["generation"] == {"provider": "gemini", "model": "gemini-3.1-pro-preview"}
    assert len(calls) == 1
    assert calls[0]["json_mode"] is True
    assert calls[0]["system_instruction"] == gen.SYSTEM_PROMPT


def test_invalid_json_triggers_exactly_one_repair_then_succeeds(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, ["not valid json at all", VALID_SKETCH_JSON])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is False
    assert sketch["name"] == "Neon Drift"
    assert len(calls) == 2
    # The repair call must show the model its own broken output and the error.
    repair_text = calls[1]["blocks"][0]["text"]
    assert "not valid json at all" in repair_text
    assert "failed validation" in repair_text


def test_persistent_invalid_json_falls_back_after_exactly_one_repair(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, ["nope", "still nope"])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is True
    assert len(calls) == 2  # one original + one repair, never more


def test_network_error_falls_back_without_attempting_repair(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, [RuntimeError("HTTP 503")])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is True
    assert len(calls) == 1  # network/HTTP failures never trigger the repair pass


def test_repair_call_network_error_also_falls_back(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, ["not valid json", RuntimeError("timeout")])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is True
    assert len(calls) == 2


def test_remix_with_no_source_falls_back_without_calling_the_model(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, [VALID_SKETCH_JSON])
    sketch = asyncio.run(gen.generate_sketch("change it", mode="remix", source=None))
    assert sketch["fallback"] is True
    assert len(calls) == 0


def test_remix_prompt_flags_oversized_source_for_consolidation():
    source = {"sketch": {"id": "s1", "name": "Big", "variables": [
        {"name": f"v{i}"} for i in range(20)
    ]}, "values": {}}
    prompt = gen.generation_prompt("simplify it", mode="remix", source=source)
    assert "20 variables" in prompt
    assert "consolidate" in prompt


def test_api_key_is_redacted_from_fallback_reason(gemini_configured, monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "secret-key-123")
    from backend import config
    monkeypatch.setattr(config, "get_api_key", lambda: "secret-key-123")
    _stub_calls(monkeypatch, [RuntimeError("request failed with key secret-key-123 rejected")])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert "secret-key-123" not in sketch["reason"]
    assert "[redacted]" in sketch["reason"]
