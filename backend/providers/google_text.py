"""Google GenAI text provider — thin adapter over backend.google_api.

All call mechanics (Interactions vs. legacy generateContent dispatch,
store=False, JSON mode, safety handling, block detection, streaming
thought-guard) live in ``backend/google_api.py``. This class only adapts the
``TextProvider`` interface onto it:

- ``json_mode`` → JSON response constraint (both modes)
- ``safety_settings`` are threaded through; they reach Google only when
  ``google_api_mode`` is ``legacy`` (the Interactions API has no such
  parameter — google_api warns once and drops them)
- safety blocks raise ``SafetyBlockedError`` so routers can emit a typed 422
  that the front-end's "Report wrongly blocked" affordance recognizes.
"""

from typing import Dict, Iterator, List, Optional

from backend import google_api
from backend.providers.base import TextProvider, ensure_text_only


class GoogleTextProvider(TextProvider):
    name = "google"

    def __init__(self, ai_manager):
        self._mgr = ai_manager

    def _client(self):
        if not self._mgr.genai_client:
            raise ValueError("API Key not configured")
        return self._mgr.genai_client

    @staticmethod
    def _blocks(contents: List[str]):
        return [google_api.text_block(part) for part in ensure_text_only(contents)]

    def generate(self, model, contents, json_mode=False, safety_settings=None) -> str:
        return google_api.gen_text(
            self._client(),
            model,
            self._blocks(contents),
            json_mode=json_mode,
            safety_settings=safety_settings,
        )

    def generate_stream(self, model, contents, safety_settings=None) -> Iterator[str]:
        return google_api.gen_text_stream(
            self._client(),
            model,
            self._blocks(contents),
            safety_settings=safety_settings,
        )

    def chat(self, message, history, model) -> str:
        return google_api.gen_chat(self._client(), model, message, history)
