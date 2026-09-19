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
    # ⚠ Two keys, not three: since the 3.6 Flash migration MODEL_DEMO and
    # MODEL_TEMPLATE_GEN_FAST are the SAME model id, so this literal collapses.
    # That is intended — both were priced at 1 credit, so nothing is lost — but
    # it does mean demo mode no longer costs less than a normal fast call.
    config.MODEL_TEMPLATE_GEN_FAST: 1,  # gemini 3.6 flash (== MODEL_FAST == MODEL_DEMO)
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

# The Commons: one sketch generation can legitimately be TWO Pro calls — the
# initial one plus a single validation-aware repair pass when the model
# returns unusable JSON (see service/thecommons_generate.py). The whole job is
# reserved up front at the worst-case price rather than reserving again
# mid-flight, because the repair is decided deep inside the generator, long
# after the request that could have surfaced a 402. Over-reserving slightly on
# the common (no-repair) path is the deliberate trade: it can never
# under-charge, and it needs no partial-refund mechanism, which Charge has no
# notion of. Unused reservations are NOT refunded when a provider call
# actually happened — see _settle_charge in thecommons_jobs.py for why.
#
# Since 2026-09-18 a successful sketch also gets one FAST call to design its
# control panel (service/thecommons_ui.py), which costs 1 credit and is not
# priced separately. The average still clears the tariff comfortably: the
# measured repair rate is 1 in 5, so the expected spend is about 6 credits of
# Pro plus 1 of Flash, against 10 charged. The worst case (a repair AND a
# panel) is 11, so "never under-charges" now holds on average rather than on
# every single job, by one credit. Revisit if the repair rate climbs.
COMMONS_SKETCH_CALLS = 2


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
    elif action == "commons_sketch":
        credits = text_credits(model) * COMMONS_SKETCH_CALLS
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


def client_rates() -> dict:
    """The subset of this table the UI needs to quote a price before spending.

    Exists so the front-end can label a model picker with what it costs without
    hardcoding numbers that would silently drift from the table above the first
    time a price changes. Shipped on ``/api/me`` (service mode only) rather than
    a public endpoint: quoting a price is only useful to someone who can spend.

    Deliberately partial — video/music are admin-only and priced per second, so
    a single number would misinform rather than inform.
    """
    return {
        "image": dict(IMAGE_MODEL_CREDITS),
        "text": dict(TEXT_MODEL_CREDITS),
        "analyze_per_image": ANALYZE_CREDITS_PER_IMAGE,
        "smart_transform_overhead": SMART_TRANSFORM_OVERHEAD,
        "template_image": TEMPLATE_IMAGE_CREDITS,
        "commons_sketch": text_credits(config.MODEL_TEMPLATE_GEN) * COMMONS_SKETCH_CALLS,
    }
