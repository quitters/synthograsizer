"""Google GenAI text provider — wraps the clients ai_manager already owns.

Behavior is identical to the pre-refactor inline calls:
- ``json_mode`` → ``GenerateContentConfig(response_mime_type="application/json")``
- safety dicts → ``types.SafetySetting`` (strings pass through; Google's API
  validates thresholds, and its errors surface verbatim)
- text extraction tolerates thought/empty parts (same logic as
  ``services/analysis._extract_text_from_response``)
- safety blocks raise ``SafetyBlockedError`` so routers can emit a typed 422
  that the front-end's "Report wrongly blocked" affordance recognizes.
"""

import logging
from typing import Dict, Iterator, List, Optional

import google.generativeai as legacy_genai
from google.genai import types

from backend.helpers import SafetyBlockedError
from backend.providers.base import TextProvider, ensure_text_only

logger = logging.getLogger(__name__)


def _extract_text(response) -> str:
    """Safely extract text parts (skips thought_signature parts)."""
    try:
        if hasattr(response, "candidates") and response.candidates:
            parts = response.candidates[0].content.parts
            text_parts = [p.text for p in parts if getattr(p, "text", None)]
            if text_parts:
                return "".join(text_parts)
        return response.text
    except Exception:
        return str(response.text) if hasattr(response, "text") else ""


def _raise_if_blocked(response) -> None:
    """Translate Google block signals into SafetyBlockedError."""
    feedback = getattr(response, "prompt_feedback", None)
    if feedback is not None and getattr(feedback, "block_reason", None):
        raise SafetyBlockedError(
            f"Prompt blocked by Google safety filters: {feedback.block_reason}"
        )
    candidates = getattr(response, "candidates", None)
    if not candidates:
        return
    for candidate in candidates:
        finish_reason = str(getattr(candidate, "finish_reason", "") or "")
        if "SAFETY" in finish_reason:
            categories = []
            for rating in getattr(candidate, "safety_ratings", None) or []:
                prob = str(getattr(rating, "probability", ""))
                if "HIGH" in prob or "MEDIUM" in prob:
                    categories.append(
                        str(getattr(rating, "category", "")).replace("HARM_CATEGORY_", "")
                    )
            raise SafetyBlockedError(
                "Response blocked by Google safety filters.", categories=categories
            )


class GoogleTextProvider(TextProvider):
    name = "google"

    def __init__(self, ai_manager):
        self._mgr = ai_manager

    def _client(self):
        if not self._mgr.genai_client:
            raise ValueError("API Key not configured")
        return self._mgr.genai_client

    @staticmethod
    def _config(json_mode: bool, safety_settings: Optional[List[Dict[str, str]]]):
        kwargs = {}
        if json_mode:
            kwargs["response_mime_type"] = "application/json"
        if safety_settings:
            kwargs["safety_settings"] = [
                types.SafetySetting(category=s["category"], threshold=s["threshold"])
                for s in safety_settings
            ]
        return types.GenerateContentConfig(**kwargs) if kwargs else None

    def generate(self, model, contents, json_mode=False, safety_settings=None) -> str:
        contents = ensure_text_only(contents)
        gen_config = self._config(json_mode, safety_settings)
        response = self._client().models.generate_content(
            model=model,
            contents=contents,
            **({"config": gen_config} if gen_config else {}),
        )
        _raise_if_blocked(response)
        return _extract_text(response)

    def generate_stream(self, model, contents, safety_settings=None) -> Iterator[str]:
        contents = ensure_text_only(contents)
        gen_config = self._config(False, safety_settings)
        stream = self._client().models.generate_content_stream(
            model=model,
            contents=contents,
            **({"config": gen_config} if gen_config else {}),
        )
        for chunk in stream:
            if chunk.text:
                yield chunk.text

    def chat(self, message, history, model) -> str:
        # Legacy SDK path preserved verbatim from services/text_gen.chat —
        # the multi-turn chat surface still rides google.generativeai.
        if not self._mgr.api_key:
            raise ValueError("API Key not configured")
        chat_model = legacy_genai.GenerativeModel(model)
        chat_history = []
        for msg in history or []:
            role = "user" if msg["role"] == "user" else "model"
            chat_history.append({"role": role, "parts": [msg["content"]]})
        chat = chat_model.start_chat(history=chat_history)
        response = chat.send_message(message)
        return response.text
