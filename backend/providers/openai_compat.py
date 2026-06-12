"""OpenAI-compatible local provider (Ollama, LM Studio, llama.cpp server…).

The "unrestricted" tier: inference runs on the user's own hardware, and this
client NEVER sends any safety/moderation parameter — there is nothing to
send; local OpenAI-compatible servers have no safety-settings concept. The
acceptable-use floor lives in the Terms (§6), not in code, by design.

Compatibility notes (why this file is slightly defensive):
- ``json_mode`` maps to ``response_format={"type": "json_object"}``. Some
  Ollama / LM Studio builds 400 on response_format — we retry once without
  it; weaker models then rely on the markdown-fence fallback already in
  ``backend.helpers.parse_llm_json``.
- Streaming is SSE: ``data: {json}`` lines ending with ``data: [DONE]``.
  Chunk shapes vary slightly across servers (final usage chunks, missing
  fields) — the parser tolerates unknown fields and empty deltas.
- Errors surface verbatim (with the local server's own message) so users
  can actually debug their Ollama setup.
"""

import json
import logging
from typing import Dict, Iterator, List, Optional

import httpx

from backend.providers.base import TextProvider, ensure_text_only

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT = 10.0
READ_TIMEOUT = 300.0  # local models on modest hardware can be slow


def _messages_from_contents(contents: List[str]) -> List[Dict[str, str]]:
    """First part = system prompt (matches how every call site builds
    [system_prompt, user_payload, ...]); the rest become user messages."""
    if not contents:
        raise ValueError("No content provided")
    if len(contents) == 1:
        return [{"role": "user", "content": contents[0]}]
    messages = [{"role": "system", "content": contents[0]}]
    messages.extend({"role": "user", "content": part} for part in contents[1:])
    return messages


def _error_detail(response: httpx.Response) -> str:
    try:
        data = response.json()
        err = data.get("error")
        if isinstance(err, dict):
            return err.get("message") or json.dumps(err)
        if isinstance(err, str):
            return err
        return response.text[:500]
    except Exception:
        return response.text[:500]


class OpenAICompatProvider(TextProvider):
    name = "local"

    def __init__(self, base_url: str, default_model: str):
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model

    def _post(self, payload: dict, stream: bool = False) -> httpx.Response:
        url = f"{self.base_url}/chat/completions"
        timeout = httpx.Timeout(READ_TIMEOUT, connect=CONNECT_TIMEOUT)
        try:
            if stream:
                client = httpx.Client(timeout=timeout)
                req = client.build_request("POST", url, json=payload)
                return client.send(req, stream=True)
            with httpx.Client(timeout=timeout) as client:
                return client.post(url, json=payload)
        except httpx.ConnectError as exc:
            raise ConnectionError(
                f"Could not reach the local model server at {self.base_url} — "
                f"is it running? ({exc})"
            ) from exc

    def generate(self, model, contents, json_mode=False, safety_settings=None) -> str:
        # safety_settings intentionally ignored: no such concept locally.
        contents = ensure_text_only(contents)
        payload = {
            "model": model or self.default_model,
            "messages": _messages_from_contents(contents),
            "stream": False,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        response = self._post(payload)

        # Some local servers reject response_format outright — retry bare once.
        if response.status_code == 400 and json_mode:
            logger.info(
                "Local server rejected response_format (400); retrying without "
                "JSON mode — parse_llm_json's fence fallback will handle output."
            )
            payload.pop("response_format", None)
            response = self._post(payload)

        if response.status_code != 200:
            raise Exception(
                f"Local model server error ({response.status_code}): "
                f"{_error_detail(response)}"
            )

        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise Exception("Local model returned no choices")
        content = (choices[0].get("message") or {}).get("content")
        if content is None:
            raise Exception("Local model returned an empty message")
        return content

    def generate_stream(self, model, contents, safety_settings=None) -> Iterator[str]:
        contents = ensure_text_only(contents)
        payload = {
            "model": model or self.default_model,
            "messages": _messages_from_contents(contents),
            "stream": True,
        }
        response = self._post(payload, stream=True)
        try:
            if response.status_code != 200:
                response.read()
                raise Exception(
                    f"Local model server error ({response.status_code}): "
                    f"{_error_detail(response)}"
                )
            for line in response.iter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data_str = line[len("data:"):].strip()
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue  # tolerate keep-alives / vendor extras
                choices = chunk.get("choices") or []
                if not choices:
                    continue  # e.g. trailing usage-only chunk
                delta = choices[0].get("delta") or {}
                text = delta.get("content")
                if text:
                    yield text
        finally:
            response.close()

    def chat(self, message, history, model) -> str:
        messages: List[Dict[str, str]] = []
        for msg in history or []:
            role = "user" if msg.get("role") == "user" else "assistant"
            messages.append({"role": role, "content": msg.get("content", "")})
        messages.append({"role": "user", "content": message})
        payload = {
            "model": model or self.default_model,
            "messages": messages,
            "stream": False,
        }
        response = self._post(payload)
        if response.status_code != 200:
            raise Exception(
                f"Local model server error ({response.status_code}): "
                f"{_error_detail(response)}"
            )
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise Exception("Local model returned no choices")
        return (choices[0].get("message") or {}).get("content") or ""

    # ── connectivity helper for the settings panel ───────────────────────

    def list_models(self) -> List[str]:
        """GET {base_url}/models — doubles as 'Test connection'."""
        url = f"{self.base_url}/models"
        try:
            with httpx.Client(timeout=httpx.Timeout(1.5, connect=1.5)) as client:
                response = client.get(url)
        except httpx.HTTPError as exc:
            raise ConnectionError(
                f"Could not reach {url} — is the local server running? ({exc})"
            ) from exc
        if response.status_code != 200:
            raise Exception(
                f"Local model server error ({response.status_code}): "
                f"{_error_detail(response)}"
            )
        data = response.json()
        models = data.get("data") or []
        return [m.get("id") for m in models if isinstance(m, dict) and m.get("id")]
