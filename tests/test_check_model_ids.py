"""The model-id checker — backend/config.py against what the provider serves.

The interesting behaviour is not "spots a missing id", it is *when it keeps
quiet*. `models.list` does not enumerate every family, so a checker that
treated every absence as a retirement would fail on veo and lyria every run,
get muted, and be worth nothing the day it was right. These tests pin the
distinction it draws instead.
"""

import importlib.util
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "check_model_ids", Path(__file__).resolve().parent.parent / "scripts" / "check_model_ids.py")
cmi = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(cmi)

# A plausible provider listing. Only the shapes matter, not the exact roster.
LIVE = {
    "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.1-pro-preview",
    "gemini-3.1-flash-image", "gemini-3-pro-image", "gemini-3.1-flash-lite-image",
    "veo-3.1-generate-preview", "lyria-realtime-exp",
}


def _status(configured: dict, live: set) -> dict:
    return {r["model"]: r["status"] for r in cmi.classify(configured, live)}


def test_a_served_id_is_ok():
    assert _status({"gemini-3.8-flash": ["MODEL_COMMONS_SKETCH"]}, LIVE) == {
        "gemini-3.8-flash": cmi.OK}


def test_a_retired_id_is_reported_with_its_ga_successor():
    """The 2026-06-25 shutdown, exactly: a preview id retired once its GA twin
    landed. The successor is named because that is the fix, and a report that
    only says 'gone' makes someone go and look it up."""
    configured = {"gemini-3-pro-image-preview": ["MODEL_IMAGE_GEN_HQ"]}
    (result,) = cmi.classify(configured, LIVE)
    assert result["status"] == cmi.MISSING
    assert "GA successor available: gemini-3-pro-image" in result["note"]


def test_an_unenumerated_family_is_not_called_a_retirement():
    """No veo-* in the listing means the API does not enumerate veo, not that
    this veo model is gone. Crying wolf here is what gets the check ignored."""
    gemini_only = {m for m in LIVE if m.startswith("gemini")}
    (result,) = cmi.classify({"veo-3.1-generate-preview": ["MODEL_VIDEO_GEN"]}, gemini_only)
    assert result["status"] == cmi.UNVERIFIABLE
    assert "no veo-* models" in result["note"]


def test_a_missing_id_is_still_caught_within_an_enumerated_family():
    """The other side of the same rule: gemini-* is clearly enumerated, so a
    gemini id that is absent really is absent."""
    (result,) = cmi.classify({"gemini-9-imaginary": ["MODEL_NOPE"]}, LIVE)
    assert result["status"] == cmi.MISSING


def test_every_constant_sharing_an_id_is_named():
    """One id, one row, every affected constant listed -- several constants
    deliberately collapse onto one model, and a report naming only the first
    would understate the blast radius."""
    configured = cmi.configured_models()
    fast = configured[cmi.normalise(cmi.config.MODEL_FAST)]
    assert {"MODEL_FAST", "MODEL_DEMO", "MODEL_TEMPLATE_GEN_FAST"} <= set(fast)


def test_the_models_prefix_is_normalised_away():
    """config writes MODEL_MUSIC_REALTIME as `models/lyria-realtime-exp`; the
    listing returns names that way too. Compared unnormalised, it never matches."""
    assert cmi.normalise("models/lyria-realtime-exp") == "lyria-realtime-exp"
    assert cmi.normalise(cmi.config.MODEL_MUSIC_REALTIME) in LIVE


@pytest.mark.parametrize("configured", [{}, {"gemini-3.6-flash": ["MODEL_FAST"]}])
def test_healthy_configurations_report_nothing_missing(configured):
    assert [r for r in cmi.classify(configured, LIVE) if r["status"] == cmi.MISSING] == []
