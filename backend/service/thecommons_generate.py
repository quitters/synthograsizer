"""The Commons — Stage 2 generator: fallback pool only.

Ports the *fallback* half of TheCommons' server/generate.js. The real
Gemini/OpenAI callModel() + one-repair-pass provider logic is deliberately
NOT ported here — see docs/HANDOFF.md's "Stage 2" section: a live call today
would spend real, unmetered operator money ahead of the reserve/commit/refund
credit wiring that's an explicit later stage. This module exists so the room
domain model has something real to generate against (two rooms landing on
genuinely different pieces), via the exact same injection seam Node uses:
`generate(prompt, mode=..., source=...) -> sketch`. A later stage swaps in
the real provider call here with no changes to the room/job model.
"""

import secrets
from typing import Any

from backend.service.thecommons_builtin import BUILTIN_SKETCHES
from backend.service.thecommons_templates import load_template_library


def _random_id() -> str:
    # Mirrors the shape (not the exact algorithm) of generate.js's
    # `Math.random().toString(36).slice(2, 10)` — an internal id, not
    # observed by any client contract that requires bit-for-bit parity.
    return secrets.token_hex(4)


def pick_fallback() -> dict:
    """Random pick across the native builtins + inherited p5 library —
    the same combined pool generate.js's pickFallback() draws from."""
    pool = [*BUILTIN_SKETCHES, *load_template_library()]
    sketch = secrets.choice(pool)
    return {**sketch, "id": _random_id()}


async def generate_sketch(prompt: str, *, mode: str = "create",
                           source: dict[str, Any] | None = None) -> dict:
    """Stage-2 stand-in for generate.js's generateSketch(): always lands on
    the fallback pool, tagged the same way a real no-key/failed call would be."""
    return {**pick_fallback(), "fallback": True, "reason": "Stage 2: live generation not yet wired"}
