"""LLM text router — the single choke point for text-only generation.

Every text-only call site in services/ calls ``self.llm_text(...)`` /
``self.llm_text_stream(...)`` (bound onto AIManager) instead of touching
``genai_client`` directly. The router:

- picks the provider for the current policy tier (Google vs local);
- on the **local** tier, substitutes the operator's configured local model
  for whatever Gemini model name the caller/UI sent (and logs it);
- on the **google** tier, resolves effective safety settings
  (request > saved defaults > baseline) and passes them through.

Multimodal calls (image parts) never come through here — providers raise
TypeError on non-string content parts by construction.
"""

import logging
from typing import Dict, Iterator, List, Optional

from backend.policy import policy, TIER_LOCAL
from backend.providers import get_text_provider

logger = logging.getLogger(__name__)


def _resolve_model(provider_name: str, requested_model: str) -> str:
    if provider_name == "local":
        local_model = policy.local_model
        if requested_model and requested_model != local_model:
            logger.info(
                "Local tier: substituting model %r for requested %r",
                local_model, requested_model,
            )
        return local_model
    return requested_model


def llm_text(
    self,
    contents: List[str],
    model: str,
    json_mode: bool = False,
    safety_settings: Optional[List[Dict[str, str]]] = None,
) -> str:
    """Generate text via the active backend tier."""
    provider = get_text_provider(self)
    resolved_model = _resolve_model(provider.name, model)
    resolved_safety = (
        policy.effective_safety(safety_settings) if provider.name == "google" else None
    )
    return provider.generate(
        model=resolved_model,
        contents=contents,
        json_mode=json_mode,
        safety_settings=resolved_safety,
    )


def llm_text_stream(
    self,
    contents: List[str],
    model: str,
    safety_settings: Optional[List[Dict[str, str]]] = None,
) -> Iterator[str]:
    """Stream text chunks via the active backend tier."""
    provider = get_text_provider(self)
    resolved_model = _resolve_model(provider.name, model)
    resolved_safety = (
        policy.effective_safety(safety_settings) if provider.name == "google" else None
    )
    return provider.generate_stream(
        model=resolved_model,
        contents=contents,
        safety_settings=resolved_safety,
    )


def llm_chat(
    self,
    message: str,
    history: Optional[List[Dict[str, str]]],
    model: str,
) -> str:
    """Multi-turn chat via the active backend tier."""
    provider = get_text_provider(self)
    resolved_model = _resolve_model(provider.name, model)
    return provider.chat(message=message, history=history, model=resolved_model)
