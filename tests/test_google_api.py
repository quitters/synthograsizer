"""Tests for backend/google_api.py — the Interactions/legacy dispatch layer.

A fake client records every interactions.create / models.generate_content
call so we can assert the wire contracts without touching the network:

- store=False is sent on EVERY Interactions call (the privacy guarantee);
- JSON mode maps to response_mime_type="application/json";
- chat history becomes typed user_input/model_output steps;
- extract_text prefers output_text, falls back to a steps walk, skips thoughts;
- raise_if_blocked maps failed+safety-message to SafetyBlockedError and
  treats 'incomplete' as success (partial output);
- the stream helper never yields thought-step or thought_summary deltas;
- gen_image returns decoded bytes from base64 block data;
- mode dispatch: legacy forwards safety_settings, interactions does not.
"""

import base64
from types import SimpleNamespace as NS

import pytest

from backend import google_api
from backend.helpers import SafetyBlockedError
from backend.policy import policy, GOOGLE_API_INTERACTIONS, GOOGLE_API_LEGACY


PNG = b"\x89PNG\r\n\x1a\n" + b"fakepixels"


# ── fakes ────────────────────────────────────────────────────────────────────

def make_interaction(status="completed", output_text=None, steps=None,
                     output_image=None):
    return NS(status=status, output_text=output_text, steps=steps or [],
              output_image=output_image)


def text_step(text, step_type="model_output"):
    return NS(type=step_type, content=[NS(type="text", text=text, annotations=None)],
              error=None)


def image_step(data_b64, mime="image/png"):
    return NS(type="model_output",
              content=[NS(type="image", data=data_b64, mime_type=mime)], error=None)


class FakeInteractions:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


class FakeModels:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class FakeClient:
    def __init__(self, interaction=None, legacy_response=None):
        self.interactions = FakeInteractions(interaction)
        self.models = FakeModels(legacy_response)


@pytest.fixture
def interactions_mode(monkeypatch):
    monkeypatch.setattr(policy, "effective_google_api",
                        lambda: GOOGLE_API_INTERACTIONS)


@pytest.fixture
def legacy_mode(monkeypatch):
    monkeypatch.setattr(policy, "effective_google_api",
                        lambda: GOOGLE_API_LEGACY)


# ── store=False on every call ────────────────────────────────────────────────

class TestStoreFalse:
    def test_gen_text_sends_store_false(self, interactions_mode):
        client = FakeClient(make_interaction(output_text="hi"))
        google_api.gen_text(client, "m", [google_api.text_block("x")])
        assert client.interactions.calls[0]["store"] is False

    def test_gen_chat_sends_store_false(self, interactions_mode):
        client = FakeClient(make_interaction(output_text="hi"))
        google_api.gen_chat(client, "m", "hello", [])
        assert client.interactions.calls[0]["store"] is False

    def test_gen_image_sends_store_false(self, interactions_mode):
        data = base64.b64encode(PNG).decode()
        client = FakeClient(make_interaction(steps=[image_step(data)]))
        google_api.gen_image(client, "m", [google_api.text_block("x")])
        assert client.interactions.calls[0]["store"] is False

    def test_every_recorded_call_carries_store_false(self, interactions_mode):
        client = FakeClient(make_interaction(output_text="hi"))
        google_api.gen_text(client, "m", [google_api.text_block("x")], json_mode=True)
        google_api.gen_chat(client, "m", "q", [{"role": "user", "content": "a"}])
        assert client.interactions.calls  # sanity
        assert all(c.get("store") is False for c in client.interactions.calls)


# ── request shapes ───────────────────────────────────────────────────────────

class TestRequestShapes:
    def test_json_mode_sets_response_format(self, interactions_mode):
        client = FakeClient(make_interaction(output_text="{}"))
        google_api.gen_text(client, "m", [google_api.text_block("x")], json_mode=True)
        assert client.interactions.calls[0]["response_format"] == {
            "type": "text", "mime_type": "application/json"
        }

    def test_plain_text_omits_response_format(self, interactions_mode):
        client = FakeClient(make_interaction(output_text="y"))
        google_api.gen_text(client, "m", [google_api.text_block("x")])
        assert "response_format" not in client.interactions.calls[0]

    def test_system_instruction_passes_through(self, interactions_mode):
        client = FakeClient(make_interaction(output_text="y"))
        google_api.gen_text(client, "m", [google_api.text_block("x")],
                            system_instruction="be brief")
        assert client.interactions.calls[0]["system_instruction"] == "be brief"

    def test_image_block_bytes_become_base64(self, interactions_mode):
        client = FakeClient(make_interaction(output_text="y"))
        google_api.gen_text(client, "m", [google_api.image_block(PNG),
                                          google_api.text_block("x")])
        sent = client.interactions.calls[0]["input"][0]
        assert sent["type"] == "image"
        assert sent["mime_type"] == "image/png"
        assert base64.b64decode(sent["data"]) == PNG

    def test_chat_history_becomes_typed_steps(self, interactions_mode):
        client = FakeClient(make_interaction(output_text="y"))
        history = [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ]
        google_api.gen_chat(client, "m", "next", history)
        steps = client.interactions.calls[0]["input"]
        assert [s["type"] for s in steps] == ["user_input", "model_output", "user_input"]
        assert steps[0]["content"][0]["text"] == "hi"
        assert steps[1]["content"][0]["text"] == "hello"
        assert steps[2]["content"][0]["text"] == "next"

    def test_gen_image_request_shape(self, interactions_mode):
        data = base64.b64encode(PNG).decode()
        client = FakeClient(make_interaction(steps=[image_step(data)]))
        google_api.gen_image(
            client, "m", [google_api.text_block("x")],
            aspect_ratio="16:9", image_size="512px", thinking_level="high",
            include_thoughts=True, temperature=1.2, use_google_search=True,
        )
        call = client.interactions.calls[0]
        assert call["response_modalities"] == ["image"]
        gc = call["generation_config"]
        assert gc["image_config"] == {"aspect_ratio": "16:9", "image_size": "512"}
        assert gc["thinking_level"] == "high"
        assert gc["thinking_summaries"] == "auto"
        assert gc["temperature"] == 1.2
        assert call["tools"] == [{"type": "google_search"}]


# ── extraction & block detection ─────────────────────────────────────────────

class TestExtraction:
    def test_extract_text_prefers_output_text(self):
        it = make_interaction(output_text="direct", steps=[text_step("steps")])
        assert google_api.extract_text(it) == "direct"

    def test_extract_text_walks_steps_and_skips_thoughts(self):
        it = make_interaction(steps=[
            text_step("secret plan", step_type="thought"),
            text_step("hello "),
            text_step("world"),
        ])
        assert google_api.extract_text(it) == "hello world"

    def test_gen_image_decodes_base64_data(self, interactions_mode):
        data = base64.b64encode(PNG).decode()
        client = FakeClient(make_interaction(steps=[image_step(data)]))
        img, mime, text = google_api.gen_image(client, "m",
                                               [google_api.text_block("x")])
        assert img == PNG
        assert mime == "image/png"

    def test_raise_if_blocked_maps_safety_failure(self):
        it = make_interaction(status="failed", steps=[
            NS(type="model_output", content=[],
               error=NS(code=400, message="Content blocked by safety policy")),
        ])
        with pytest.raises(SafetyBlockedError):
            google_api.raise_if_blocked(it)

    def test_raise_if_blocked_plain_failure_is_generic(self):
        it = make_interaction(status="failed", steps=[
            NS(type="model_output", content=[],
               error=NS(code=500, message="internal error")),
        ])
        with pytest.raises(Exception) as exc:
            google_api.raise_if_blocked(it)
        assert not isinstance(exc.value, SafetyBlockedError)

    def test_incomplete_is_not_an_error(self):
        google_api.raise_if_blocked(make_interaction(status="incomplete"))

    def test_safety_flavored_api_error_translates(self, interactions_mode):
        client = FakeClient(RuntimeError("PROHIBITED_CONTENT: request blocked"))
        with pytest.raises(SafetyBlockedError):
            google_api.gen_text(client, "m", [google_api.text_block("x")])


# ── streaming thought guard ──────────────────────────────────────────────────

class TestStreamGuard:
    @staticmethod
    def events():
        return [
            NS(event_type="step.start", step=NS(type="thought")),
            NS(event_type="step.delta", delta=NS(type="text", text="LEAKED")),
            NS(event_type="step.start", step=NS(type="model_output")),
            NS(event_type="step.delta", delta=NS(type="thought_summary", text=None)),
            NS(event_type="step.delta", delta=NS(type="text", text="visible ")),
            NS(event_type="step.delta", delta=NS(type="text", text="text")),
            NS(event_type="interaction.completed",
               interaction=make_interaction(output_text="visible text")),
        ]

    def test_only_model_output_text_deltas_yielded(self):
        assert list(google_api.iter_stream_text(self.events())) == ["visible ", "text"]

    def test_error_event_raises(self):
        events = [NS(event_type="error",
                     error=NS(code="x", message="stream broke"))]
        with pytest.raises(Exception, match="stream broke"):
            list(google_api.iter_stream_text(events))


# ── mode dispatch ────────────────────────────────────────────────────────────

SAFETY = [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"}]


class TestModeDispatch:
    def test_legacy_uses_generate_content_and_forwards_safety(self, legacy_mode):
        response = NS(
            prompt_feedback=None,
            candidates=[NS(finish_reason="STOP",
                           content=NS(parts=[NS(text="legacy out")]),
                           safety_ratings=[])],
            text="legacy out",
        )
        client = FakeClient(legacy_response=response)
        out = google_api.gen_text(client, "m", [google_api.text_block("x")],
                                  safety_settings=SAFETY)
        assert out == "legacy out"
        assert not client.interactions.calls
        config = client.models.calls[0]["config"]
        assert config.safety_settings[0].category == "HARM_CATEGORY_HARASSMENT"

    def test_interactions_ignores_safety_settings(self, interactions_mode):
        client = FakeClient(make_interaction(output_text="y"))
        google_api.gen_text(client, "m", [google_api.text_block("x")],
                            safety_settings=SAFETY)
        call = client.interactions.calls[0]
        assert "safety_settings" not in call
        assert not client.models.calls

    def test_legacy_chat_builds_role_contents(self, legacy_mode):
        response = NS(prompt_feedback=None, candidates=[], text="pong")
        client = FakeClient(legacy_response=response)
        out = google_api.gen_chat(client, "m", "ping",
                                  [{"role": "user", "content": "a"},
                                   {"role": "assistant", "content": "b"}])
        assert out == "pong"
        contents = client.models.calls[0]["contents"]
        assert [c["role"] for c in contents] == ["user", "model", "user"]
        assert contents[-1]["parts"][0]["text"] == "ping"
