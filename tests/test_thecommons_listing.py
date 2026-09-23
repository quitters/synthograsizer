"""A generated piece's listing: what it needs to join the gallery besides its
code, controls and panel. Written by the panel designer in the call it already
makes, normalised like a panel, and always present on a generated piece."""

import asyncio
import json
import sys
from pathlib import Path

import pytest

from backend.service import thecommons_generate as gen
from backend.service.thecommons_gallery import SECTIONS, _self_described
from backend.service.thecommons_gallery_tags import BLURB_CAP, GENERATED_SECTIONS, LOOK_TAGS, MAX_LOOK
from backend.service.thecommons_ui import PANEL_PROMPT, normalize_listing
from backend.routers.thecommons import _preset_listing

from tests.test_thecommons_generate import VALID_SKETCH_JSON, _stub_calls, gemini_configured  # noqa: F401

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import commons_promote  # noqa: E402

KNOBS = [{"name": "speed", "type": "number", "min": 0, "max": 1, "step": 0.1, "default": 0.5}]
WITH_A_BUTTON = KNOBS + [{"name": "burst", "type": "trigger"}]


# ── normalising ─────────────────────────────────────────────────────────────

def test_a_good_answer_comes_through():
    listing = normalize_listing({"blurb": "Rings of dots fly out of a tunnel.", "section": "demo",
                                 "look": ["retro", "3d"]}, KNOBS, "a dot tunnel")
    assert listing == {"section": "demo", "blurb": "Rings of dots fly out of a tunnel.",
                       "prompt": "a dot tunnel", "look": ["retro", "3d"]}


def test_a_piece_with_something_to_press_is_a_party_game_whatever_the_model_says():
    assert normalize_listing({"section": "demo"}, WITH_A_BUTTON, "p")["section"] == "games"


@pytest.mark.parametrize("section", ["games", "studio", "Demo", None, 3, ["demo"]])
def test_a_section_the_model_may_not_choose_becomes_generative(section):
    assert normalize_listing({"section": section}, KNOBS, "p")["section"] == "generative"


def test_look_tags_are_the_vocabulary_only_once_each_and_at_most_three():
    listing = normalize_listing({"look": ["calm", "moody", "calm", 7, "retro", "3d", "light"]}, KNOBS, "p")
    assert listing["look"] == ["calm", "retro", "3d"]
    assert len(listing["look"]) == MAX_LOOK
    assert normalize_listing({"look": "calm"}, KNOBS, "p")["look"] == []


def test_a_missing_or_unsafe_blurb_falls_back_to_the_prompt():
    assert normalize_listing({}, KNOBS, "a slow ink study")["blurb"] == "a slow ink study"
    assert normalize_listing({"blurb": "see www.example.com"}, KNOBS, "ink")["blurb"] == "ink"
    assert len(normalize_listing({"blurb": "x" * 900}, KNOBS, "p")["blurb"]) == BLURB_CAP


@pytest.mark.parametrize("answer", [None, "text", ["demo"], 42])
def test_no_usable_answer_still_gives_a_complete_listing(answer):
    listing = normalize_listing(answer, WITH_A_BUTTON, "fireworks")
    assert listing == {"section": "games", "blurb": "fireworks", "prompt": "fireworks", "look": []}


# ── vocabulary stays in step ─────────────────────────────────────────────────

def test_the_sections_a_model_may_choose_all_exist():
    assert set(GENERATED_SECTIONS) <= {s["id"] for s in SECTIONS}


def test_the_designer_is_offered_every_look_word_and_section():
    for tag in LOOK_TAGS:
        assert f'"{tag}"' in PANEL_PROMPT, tag
    for section in GENERATED_SECTIONS:
        assert f'"{section}"' in PANEL_PROMPT, section
    assert "LOOK_WORDS" not in PANEL_PROMPT


# ── generation ───────────────────────────────────────────────────────────────

PANEL_WITH_LISTING = json.dumps({
    "skin": "trainer", "variant": "acid", "title": "DRIFT +2",
    "blurb": "Neon drifts across the wall.", "section": "demo", "look": ["psychedelic", "nope"],
})


def test_a_generated_piece_arrives_with_its_listing(gemini_configured, monkeypatch):
    _stub_calls(monkeypatch, [VALID_SKETCH_JSON], panel=PANEL_WITH_LISTING)
    sketch = asyncio.run(gen.generate_sketch("neon drift"))
    assert sketch["listing"] == {"section": "demo", "blurb": "Neon drifts across the wall.",
                                 "prompt": "neon drift", "look": ["psychedelic"]}
    assert "blurb" not in sketch["ui"]          # the listing is not part of the panel


def test_a_failed_panel_still_leaves_a_listing(gemini_configured, monkeypatch):
    _stub_calls(monkeypatch, [VALID_SKETCH_JSON], panel=RuntimeError("HTTP 503"))
    sketch = asyncio.run(gen.generate_sketch("neon drift"))
    assert "ui" not in sketch
    assert sketch["listing"] == {"section": "generative", "blurb": "neon drift", "prompt": "neon drift", "look": []}


def test_a_fallback_has_no_listing(monkeypatch):
    from backend.ai_manager import ai_manager
    monkeypatch.setattr(ai_manager, "genai_client", None)
    assert "listing" not in asyncio.run(gen.generate_sketch("anything"))


# ── the desk ─────────────────────────────────────────────────────────────────

def test_the_presets_list_carries_only_a_clean_card_line_and_known_tags():
    assert _preset_listing({"listing": {"blurb": "Dots.", "look": ["retro", "<b>", 5], "prompt": "p"}}) == \
        {"blurb": "Dots.", "look": ["retro"]}
    assert _preset_listing({"name": "old piece"}) is None
    assert _preset_listing({"listing": "nope"}) is None
    assert _preset_listing(None) is None


# ── promotion ────────────────────────────────────────────────────────────────

def _generated(**over):
    sketch = {**json.loads(VALID_SKETCH_JSON), "ui": {"skin": "desk", "variant": "blue"},
              "listing": {"section": "living", "blurb": "Drifts.", "prompt": "neon drift", "look": ["calm"]},
              "fallback": False}
    return {**sketch, **over}


def test_a_promoted_piece_is_one_the_gallery_loads(tmp_path, monkeypatch):
    written = commons_promote.promote(_generated(), "neon-drift", tmp_path)
    assert [p.name for p in written] == ["neon-drift.js", "neon-drift.json"]
    sidecar = json.loads(written[1].read_text(encoding="utf-8"))
    assert sidecar["listing"] == {"section": "living", "blurb": "Drifts.", "prompt": "neon drift", "look": ["calm"]}
    # The loader reads exactly what promotion writes.
    import backend.service.thecommons_gallery as gallery
    monkeypatch.setattr(gallery, "_DIR", tmp_path)
    monkeypatch.setattr(gallery, "GALLERY", [])
    assert _self_described() == [{"slug": "neon-drift", "section": "living", "blurb": "Drifts.",
                                  "prompt": "neon drift", "look": ("calm",)}]


def test_a_sketchbook_record_keeps_its_source(tmp_path):
    record = {"id": "scenes100/neon~2", "prompt": "neon drift, economically", "sketch": _generated()}
    _, meta = commons_promote.promote(record, "neon", tmp_path)
    listing = json.loads(meta.read_text(encoding="utf-8"))["listing"]
    assert listing["source"] == "scenes100/neon~2" and listing["prompt"] == "neon drift, economically"


@pytest.mark.parametrize("piece, slug", [
    (_generated(fallback=True), "neon"),
    (_generated(ui=None), "neon"),
    (_generated(listing=None), "neon"),          # and no prompt anywhere else
    (_generated(), "Neon Drift"),
    (_generated(), "plasma"),                    # already in the gallery
])
def test_promotion_refuses_what_cannot_be_a_gallery_piece(tmp_path, piece, slug):
    with pytest.raises(ValueError):
        commons_promote.promote(piece, slug, tmp_path)
    assert not list(tmp_path.iterdir())


def test_every_gallery_listing_is_one_a_generated_piece_could_have():
    """The pieces that describe themselves are held to the rules a fresh
    listing is, so a promoted piece and an imported one can't drift apart."""
    from backend.service.thecommons_gallery import _DIR
    listed = 0
    for path in _DIR.glob("*.json"):
        sidecar = json.loads(path.read_text(encoding="utf-8"))
        if "listing" not in sidecar:
            continue
        listed += 1
        listing = {k: v for k, v in sidecar["listing"].items() if k != "source"}
        assert normalize_listing(listing, sidecar["variables"], listing["prompt"]) == listing, path.stem
        assert listing["look"], path.stem       # the desk's tag test needs one; say which piece lacks it
    assert listed >= 100


# ── names and sections from a real batch ─────────────────────────────────────

@pytest.mark.parametrize("name, readable", [
    ("paik_cathode_wall", "Paik Cathode Wall"),
    ("facade_lumina", "Facade Lumina"),
    ("dot tunnel", "Dot Tunnel"),
    ("CGA_demo", "CGA Demo"),
    ("Arena of Lights", "Arena of Lights"),          # a real title is left exactly as written
    ("(Des)Ordres", "(Des)Ordres"),
    ("16-Colour Torus Knot", "16-Colour Torus Knot"),
])
def test_a_name_written_like_a_variable_becomes_a_title(name, readable):
    assert gen.readable_name(name) == readable


def test_a_generated_piece_and_its_panel_get_the_readable_name(gemini_configured, monkeypatch):
    snake = json.dumps({**json.loads(VALID_SKETCH_JSON), "name": "neon_drift"})
    calls = _stub_calls(monkeypatch, [snake], panel=PANEL_WITH_LISTING)
    sketch = asyncio.run(gen.generate_sketch("neon drift"))
    assert sketch["name"] == "Neon Drift"
    piece = json.loads(calls.panel[0]["blocks"][0]["text"].split("PIECE:\n", 1)[1])
    assert piece["name"] == "Neon Drift"


def test_the_designer_is_told_efficient_code_does_not_make_a_demo():
    # Lightworks filed drone shows and a black hole under Demo scene: every
    # prompt asked for "a demoscener's economy", and the designer took the hint.
    assert "demoscener's economy" in PANEL_PROMPT
    assert "light installations" in PANEL_PROMPT
