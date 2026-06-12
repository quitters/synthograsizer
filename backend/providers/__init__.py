"""Text-generation provider selection.

``get_text_provider(ai_manager)`` returns the provider matching the current
policy tier. Providers are constructed per-call (they're thin and stateless);
the underlying HTTP/SDK clients they wrap are long-lived on ``ai_manager``.
"""

from backend.policy import policy, TIER_LOCAL
from backend.providers.base import TextProvider, ensure_text_only
from backend.providers.google_text import GoogleTextProvider
from backend.providers.openai_compat import OpenAICompatProvider

__all__ = [
    "get_text_provider",
    "TextProvider",
    "ensure_text_only",
    "GoogleTextProvider",
    "OpenAICompatProvider",
]


def get_text_provider(ai_manager) -> TextProvider:
    if policy.effective_tier() == TIER_LOCAL:
        return OpenAICompatProvider(
            base_url=policy.local_base_url,
            default_model=policy.local_model,
        )
    return GoogleTextProvider(ai_manager)
