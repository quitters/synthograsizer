"""OpenAICompatProvider against a mocked OpenAI-compatible server.

httpx.MockTransport — no network. The provider constructs its own
httpx.Client internally, so we monkeypatch the Client symbol in the
provider's module namespace with a factory that injects the mock transport.

The single most important assertion in this file: the payload sent to a
local model server NEVER contains any safety/moderation parameter — that is
the "unrestricted local tier" contract.
"""
import json

import httpx
import pytest

import backend.providers.openai_compat as oc_mod
from backend.providers.openai_compat import OpenAICompatProvider


def make_provider(monkeypatch, handler):
    transport = httpx.MockTransport(handler)
    real_client = httpx.Client

    def client_factory(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client(*args, **kwargs)

    monkeypatch.setattr(oc_mod.httpx, "Client", client_factory)
    return OpenAICompatProvider(base_url="http://localhost:11434/v1",
                                default_model="testmodel")


def ok_chat_response(content="hello"):
    return httpx.Response(200, json={
        "choices": [{"message": {"role": "assistant", "content": content}}],
    })


class TestGenerate:
    def test_json_mode_sends_response_format_and_no_safety_params(self, monkeypatch):
        captured = {}

        def handler(request):
            captured.update(json.loads(request.content))
            return ok_chat_response('{"ok": true}')

        provider = make_provider(monkeypatch, handler)
        out = provider.generate(
            model="testmodel",
            contents=["SYSTEM PROMPT", "user payload"],
            json_mode=True,
            safety_settings=[{"category": "X", "threshold": "Y"}],  # must be dropped
        )
        assert out == '{"ok": true}'
        assert captured["response_format"] == {"type": "json_object"}
        assert captured["messages"][0] == {"role": "system", "content": "SYSTEM PROMPT"}
        assert captured["messages"][1] == {"role": "user", "content": "user payload"}
        # The unrestricted contract: nothing safety-shaped in the payload.
        blob = json.dumps(captured).lower()
        assert "safety" not in blob
        assert "moderation" not in blob
        assert "harm" not in blob

    def test_retries_without_response_format_on_400(self, monkeypatch):
        calls = []

        def handler(request):
            body = json.loads(request.content)
            calls.append(body)
            if "response_format" in body:
                return httpx.Response(400, json={"error": {"message": "response_format unsupported"}})
            return ok_chat_response("plain")

        provider = make_provider(monkeypatch, handler)
        out = provider.generate("m", ["sys", "user"], json_mode=True)
        assert out == "plain"
        assert len(calls) == 2
        assert "response_format" in calls[0]
        assert "response_format" not in calls[1]

    def test_non_string_content_raises_typeerror(self, monkeypatch):
        provider = make_provider(monkeypatch, lambda req: ok_chat_response())
        with pytest.raises(TypeError):
            provider.generate("m", ["text", {"inline_data": b"img"}])

    def test_server_error_surfaces_verbatim(self, monkeypatch):
        def handler(request):
            return httpx.Response(500, json={"error": {"message": "model 'nope' not found"}})

        provider = make_provider(monkeypatch, handler)
        with pytest.raises(Exception, match="model 'nope' not found"):
            provider.generate("nope", ["hi"])


class TestStreaming:
    def test_sse_stream_parsing(self, monkeypatch):
        sse = (
            'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'
            'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'
            'data: {"choices":[],"usage":{"total_tokens":3}}\n\n'  # vendor extra
            "data: [DONE]\n\n"
        )

        def handler(request):
            return httpx.Response(200, content=sse.encode("utf-8"))

        provider = make_provider(monkeypatch, handler)
        chunks = list(provider.generate_stream("m", ["hi"]))
        assert chunks == ["Hel", "lo"]


class TestChatAndModels:
    def test_chat_maps_history_roles(self, monkeypatch):
        captured = {}

        def handler(request):
            captured.update(json.loads(request.content))
            return ok_chat_response("reply")

        provider = make_provider(monkeypatch, handler)
        out = provider.chat("now", [{"role": "user", "content": "a"},
                                    {"role": "model", "content": "b"}], "m")
        assert out == "reply"
        assert captured["messages"] == [
            {"role": "user", "content": "a"},
            {"role": "assistant", "content": "b"},
            {"role": "user", "content": "now"},
        ]

    def test_list_models(self, monkeypatch):
        def handler(request):
            assert request.url.path.endswith("/models")
            return httpx.Response(200, json={"data": [{"id": "llama3.1"}, {"id": "qwen2.5"}]})

        provider = make_provider(monkeypatch, handler)
        assert provider.list_models() == ["llama3.1", "qwen2.5"]
