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
    # ⚠ One key where there were two: since the 3.6 Flash migration MODEL_DEMO and
    # MODEL_TEMPLATE_GEN_FAST are the SAME model id, so this literal collapses.
    # That is intended — both were priced at 1 credit, so nothing is lost — but
    # it does mean demo mode no longer costs less than a normal fast call.
    config.MODEL_TEMPLATE_GEN_FAST: 1,  # gemini 3.6 flash (== MODEL_FAST == MODEL_DEMO)
    config.MODEL_TEXT_CHAT: 5,          # gemini pro (== MODEL_TEMPLATE_GEN)
    # gemini 3.8 flash (== MODEL_COMMONS_SKETCH == MODEL_COMMONS_PANEL), at its
    # STANDARD rate ($1.50 in / $7.50 out per 1M, from 2027-01-01), not the
    # introductory half price. A Commons sketch call at "medium" thinking
    # measured $0.052 on average at that rate (p90 $0.079), so 5 per call.
    # Being a key here also allowlists it for /chat and /generate text at
    # 5 credits -- far above what a short call costs, so over- not under-.
    config.MODEL_COMMONS_SKETCH: 5,
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
# A successful sketch also gets one call to design its control panel
# (service/thecommons_ui.py), not priced separately: about 1 credit.
#
# Measured 2026-09-19 by tokens, not by call count, on 11 prompts per model
# (TheCommons/docs/HANDOFF.md has the table). Since then sketches run on
# MODEL_COMMONS_SKETCH (3.8 Flash, medium thinking), priced at 5 per call, so
# the charge is still 10. At the standard rate a generation -- repair and panel
# included -- averaged 7.2 credits of real cost, and the worst of 11 was 13.3.
# So this covers the average with room to spare but not every single job;
# revisit if the repair rate (2 in 11) climbs. For the record, the same
# measurement put the Pro model it replaced at 18 on average and 27 at worst:
# Pro thinks ~8.8k tokens a call, so its flat 5-per-call price, and the older
# "over-charges by 40%" reading, which counted calls, had it under-charging.
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
        "commons_sketch": text_credits(config.MODEL_COMMONS_SKETCH) * COMMONS_SKETCH_CALLS,
    }
