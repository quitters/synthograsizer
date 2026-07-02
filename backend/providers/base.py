"""Provider protocol for text-only generation.

The router (``services/llm_router.py``) calls these methods instead of
touching ``genai_client`` at every *text-only* call site (the Google
provider dispatches through ``backend/google_api.py`` — Interactions API
by default, legacy generateContent behind the policy switch).
Multimodal calls (image parts in contents) never come through here — and
``ensure_text_only`` enforces that by construction, so a future refactor
can't accidentally route an image to a local text endpoint.
"""

from typing import Dict, Iterator, List, Optional


def ensure_text_only(contents: List) -> List[str]:
    """Assert every content part is a plain string. Returns the list typed.

    Raises TypeError otherwise — the deliberate guard that keeps multimodal
    requests off the text-provider path.
    """
    for i, part in enumerate(contents):
        if not isinstance(part, str):
            raise TypeError(
                f"Text provider received a non-string content part at index {i} "
                f"({type(part).__name__}). Multimodal calls must use the Google "
                "path directly."
            )
    return contents


class TextProvider:
    """Interface — concrete providers implement all three methods."""

    name: str = "abstract"

    def generate(
        self,
        model: str,
        contents: List[str],
        json_mode: bool = False,
        safety_settings: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        raise NotImplementedError

    def generate_stream(
        self,
        model: str,
        contents: List[str],
        safety_settings: Optional[List[Dict[str, str]]] = None,
    ) -> Iterator[str]:
        raise NotImplementedError

    def chat(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]],
        model: str,
    ) -> str:
        raise NotImplementedError
