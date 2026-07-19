"""Credit pricing — the tunable server-side rate table + model allowlists.

1 credit ≈ $0.01 USD of estimated upstream cost (same governing philosophy as
``scripts/film_factory/costs.py``, which ran a $4,500 film budget on per-action
estimates). Every chargeable request resolves through here; a client-supplied
model that isn't allowlisted raises :class:`InvalidModel` → HTTP 400, which is
also what kills arbitrary-model-string injection.

Prices are per UNIT; ``resolve()`` scales by units and returns
``(credits, usd_est, unit_kind)``.
"""

import math

from backend import config

CREDIT_USD = 0.01  # 1 credit ≈ $0.01 (estimates, not invoices)


class InvalidModel(ValueError):
    def __init__(self, model, kind):
        self.model, self.kind = model, kind
        super().__init__(f"{kind} model not available on this instance: {model!r}")


# ── per-model credit prices (per call / per image) ─────────────────────────
TEXT_MODEL_CREDITS = {
    config.MODEL_DEMO: 1,               # gemini flash-lite
    config.MODEL_TEMPLATE_GEN_FAST: 1,  # gemini flash (== MODEL_FAST)
    config.MODEL_TEXT_CHAT: 5,          # gemini pro (== MODEL_TEMPLATE_GEN / MODEL_ANALYSIS)
}

IMAGE_MODEL_CREDITS = {
    config.MODEL_IMAGE_GEN_FAST: 4,
    config.MODEL_IMAGE_GEN_NB2: 5,
    config.MODEL_IMAGE_GEN_HQ: 15,
}

VIDEO_MODEL_CREDITS_PER_SEC = {
    config.MODEL_VIDEO_GEN: 40,         # veo-3.1 quality ≈ $0.40/s — admin-only at v1
}

ANALYZE_CREDITS_PER_IMAGE = 2
SMART_TRANSFORM_OVERHEAD = 2            # analysis + prompt-writing steps around the image call
TEMPLATE_IMAGE_CREDITS = 1              # per analyzed input image in template modes


def text_credits(model: str) -> int:
    try:
        return TEXT_MODEL_CREDITS[model]
    except KeyError:
        raise InvalidModel(model, "text")


def image_credits(model: str) -> int:
    try:
        return IMAGE_MODEL_CREDITS[model]
    except KeyError:
        raise InvalidModel(model, "image")


def resolve(action: str, model: str | None, units: float = 1) -> tuple[int, float, str]:
    """(action, model, units) → (credits, usd_est, unit_kind).

    ``units`` means: images for image/analyze actions, seconds for video,
    input-image count for template/smart_transform overheads, else 1.
    """
    if action == "text" or action == "chat":
        credits = text_credits(model)
        kind = "call"
    elif action == "image":
        credits = image_credits(model) * max(1, int(units))
        kind = "image"
    elif action == "smart_transform":
        credits = image_credits(model) + SMART_TRANSFORM_OVERHEAD
        kind = "call"
    elif action == "analyze":
        credits = ANALYZE_CREDITS_PER_IMAGE * max(1, int(units))
        kind = "image"
    elif action == "template":
        # units = number of analyzed input images
        credits = text_credits(model) + TEMPLATE_IMAGE_CREDITS * int(units)
        kind = "call"
    elif action == "video":
        per_sec = VIDEO_MODEL_CREDITS_PER_SEC.get(model)
        if per_sec is None:
            raise InvalidModel(model, "video")
        credits = int(math.ceil(per_sec * max(1.0, float(units))))
        kind = "sec"
    elif action == "music":
        credits = 0  # admin-only; logged for visibility, per-minute pricing later
        kind = "call"
    else:
        raise ValueError(f"unknown charge action: {action}")
    return credits, round(credits * CREDIT_USD, 4), kind
