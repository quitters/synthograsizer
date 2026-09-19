"""Control panel specs: normalising model output into a safe, complete panel.

The spec is model output that ends up on anonymous phones and on the signed-in
desk, so the tests here are mostly about what it must NOT be able to do. The
differential test at the bottom runs the same specs through the client's
mirror (panel-spec.js) so the two normalisers can't drift apart.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from backend.service.thecommons_ui import (
    DENSITIES, GROUP_TITLE_CAP, HINT_CAP, MAX_GROUPS, MIN_ACCENT_CONTRAST, SKINS, TAGLINE_CAP, TITLE_CAP,
    WIDGETS_BY_TYPE, contrast, normalize_ui,
)
from backend.service.thecommons_validate import validate_native_sketch

VARIABLES = [
    {"name": "palette", "label": "Palette", "values": [{"text": "ember", "weight": 1}, {"text": "ocean", "weight": 1},
                                                        {"text": "acid", "weight": 1}]},
    {"name": "speed", "label": "Speed", "type": "number", "min": 0, "max": 10, "step": 1, "default": 4},
    {"name": "warp", "label": "Warp", "type": "number", "min": 0, "max": 1, "step": 0.1, "default": 0.3},
    {"name": "pulse", "label": "Pulse", "type": "trigger", "share": "all"},
]

GOOD = {
    "skin": "trainer",
    "variant": "fire",
    "title": "PLASMA TRAINER +3",
    "tagline": "cracked by the room",
    "accent": "#FFE45E",
    "groups": [{"title": "Colour", "controls": ["palette"]},
               {"title": "Motion", "controls": ["speed", "warp", "pulse"]}],
    "controls": {"palette": {"widget": "cycle", "hint": "Tap to change the colours"},
                 "speed": {"widget": "knob"}, "warp": {"widget": "stepper"}, "pulse": {"widget": "pad"}},
    "mobile": {"density": "compact"},
    "desktop": {"columns": 2},
}


def _sketch(**extra):
    return {"name": "Plasma", "promptTemplate": "plasma in {{palette}} at {{speed}} with {{warp}}",
            "code": "ctx.fillRect(0, 0, 1, 1);", "variables": VARIABLES, **extra}


# ── a good spec survives intact ─────────────────────────────────────────────

def test_a_good_spec_survives_intact():
    ui = normalize_ui(GOOD, VARIABLES)
    assert ui == {
        "skin": "trainer", "variant": "fire", "title": "PLASMA TRAINER +3", "tagline": "cracked by the room",
        "accent": "#ffe45e",
        "groups": [{"title": "Colour", "controls": ["palette"]},
                   {"title": "Motion", "controls": ["speed", "warp", "pulse"]}],
        "controls": {"palette": {"widget": "cycle", "hint": "Tap to change the colours"},
                     "speed": {"widget": "knob", "hint": ""}, "warp": {"widget": "stepper", "hint": ""},
                     "pulse": {"widget": "pad", "hint": ""}},
        "mobile": {"density": "compact"},
        "desktop": {"columns": 2},
    }


def test_no_spec_means_no_spec():
    for absent in (None, "trainer", [], 7):
        assert normalize_ui(absent, VARIABLES) is None
    assert "ui" not in validate_native_sketch(_sketch())


def test_the_validator_keeps_a_normalised_spec():
    """Before panels existed the validator dropped unknown keys, which would
    silently strip every panel that passed through it -- the gallery's too."""
    sketch = validate_native_sketch(_sketch(ui={**GOOD, "css": "body{display:none}"}))
    assert sketch["ui"] == normalize_ui(GOOD, VARIABLES)
    assert "css" not in sketch["ui"]


# ── every field falls back on its own ───────────────────────────────────────

@pytest.mark.parametrize("field, bad, expect", [
    ("skin", "vaporwave", ("skin", "commons")),
    ("skin", ["trainer"], ("skin", "commons")),          # unhashable must not raise
    ("variant", "plaid", ("variant", "violet")),         # the skin's first variant
    ("variant", {"x": 1}, ("variant", "violet")),
    ("accent", "red", ("accent", "")),
    ("accent", "#12345", ("accent", "")),
    ("accent", "#ffe45e; background:url(x)", ("accent", "")),
    ("title", 42, ("title", "")),
    ("mobile", {"density": "cosy"}, ("mobile", {"density": "roomy"})),
    ("desktop", {"columns": 9}, ("desktop", {"columns": 2})),
    ("desktop", {"columns": True}, ("desktop", {"columns": 2})),
])
def test_each_field_falls_back_on_its_own(field, bad, expect):
    ui = normalize_ui({**GOOD, field: bad}, VARIABLES)
    key, value = expect
    assert ui[key] == value
    # ...and nothing else about the panel was lost with it.
    assert ui["groups"][0]["title"] == "Colour"
    assert ui["controls"]["speed"]["widget"] == "knob"


def test_unknown_keys_never_reach_a_phone():
    ui = normalize_ui({**GOOD, "css": "*{}", "html": "<b>", "script": "x", "fontUrl": "https://x"}, VARIABLES)
    assert set(ui) == {"skin", "variant", "title", "tagline", "accent", "groups", "controls", "mobile", "desktop"}
    assert set(ui["controls"]["palette"]) == {"widget", "hint"}


def test_a_widget_must_fit_its_control():
    ui = normalize_ui({**GOOD, "controls": {"palette": {"widget": "knob"}, "speed": {"widget": "pads"},
                                            "pulse": {"widget": "slider"}, "warp": {"widget": "<script>"}}},
                      VARIABLES)
    assert {name: c["widget"] for name, c in ui["controls"].items()} == {
        "palette": "buttons", "speed": "slider", "warp": "slider", "pulse": "button"}
    for name, choices in WIDGETS_BY_TYPE.items():
        assert choices, name


# ── controls: every one exactly once ────────────────────────────────────────

def test_every_control_appears_exactly_once():
    ui = normalize_ui({**GOOD, "groups": [
        {"title": "A", "controls": ["speed", "speed", "ghost", 7]},
        {"title": "B", "controls": ["speed"]},              # empty once the duplicate goes: dropped
        {"title": "C", "controls": ["warp"]},
    ]}, VARIABLES)
    assert ui["groups"] == [{"title": "A", "controls": ["speed"]},
                            {"title": "C", "controls": ["warp", "palette", "pulse"]}]
    placed = [name for group in ui["groups"] for name in group["controls"]]
    assert sorted(placed) == sorted(v["name"] for v in VARIABLES)


def test_forgotten_controls_still_reach_phones_without_any_groups():
    ui = normalize_ui({"skin": "desk"}, VARIABLES)
    assert ui["groups"] == [{"title": "", "controls": [v["name"] for v in VARIABLES]}]
    assert ui["desktop"] == {"columns": 1}


def test_groups_are_capped():
    many = [{"title": f"G{i}", "controls": [v["name"]]} for i, v in enumerate(VARIABLES * 3)]
    ui = normalize_ui({**GOOD, "groups": many}, VARIABLES)
    assert len(ui["groups"]) <= MAX_GROUPS


# ── text is one short line of plain text ────────────────────────────────────

def test_text_is_capped_and_plain():
    ui = normalize_ui({**GOOD,
                       "title": "A" * 200,
                       "tagline": "line one\nline two\t‮evil​",
                       "groups": [{"title": "G" * 50, "controls": ["palette"]}],
                       "controls": {"speed": {"widget": "knob", "hint": "h" * 500}}}, VARIABLES)
    assert len(ui["title"]) == TITLE_CAP
    assert ui["tagline"] == "line one line two evil"          # bidi override and zero-width space gone
    assert len(ui["groups"][0]["title"]) == GROUP_TITLE_CAP
    assert len(ui["controls"]["speed"]["hint"]) == HINT_CAP
    assert TAGLINE_CAP >= len(ui["tagline"])


@pytest.mark.parametrize("text", [
    "Visit https://example.test", "go to www.example.test", "claim at prize.com", "mail me@example.test",
    "javascript://x",
])
def test_nothing_on_a_panel_sends_anyone_anywhere(text):
    ui = normalize_ui({**GOOD, "title": text, "tagline": text}, VARIABLES)
    assert ui["title"] == "" and ui["tagline"] == ""


# ── colour: curated, plus one accent that must stay readable ────────────────

def test_an_accent_must_be_readable_on_its_skin():
    dim = "#1a1a1a"   # nearly black, on the trainer's black ground
    assert contrast(dim, "#000000") < MIN_ACCENT_CONTRAST
    assert normalize_ui({**GOOD, "accent": dim}, VARIABLES)["accent"] == ""
    # The same colour is fine where the ground is light.
    assert normalize_ui({**GOOD, "skin": "desk", "variant": "grey", "accent": dim}, VARIABLES)["accent"] == dim


def test_every_skin_has_variants_with_real_grounds():
    for skin, meta in SKINS.items():
        assert meta["variants"], skin
        for variant, ground in meta["variants"].items():
            assert len(ground) == 7 and ground.startswith("#"), (skin, variant)


# ── garbage in, a working panel out ─────────────────────────────────────────

@pytest.mark.parametrize("junk", [
    {}, {"skin": None}, {"groups": "all"}, {"groups": [None, 3, "x", {"controls": "speed"}]},
    {"controls": ["speed"]}, {"controls": {"speed": "knob"}}, {"mobile": "roomy"}, {"desktop": [2]},
    {"title": {"text": "x"}}, {"accent": 0xffffff}, {"skin": {"trainer": True}},
])
def test_garbage_never_raises_and_always_yields_every_control(junk):
    ui = normalize_ui(junk, VARIABLES)
    placed = [name for group in ui["groups"] for name in group["controls"]]
    assert sorted(placed) == sorted(v["name"] for v in VARIABLES)
    assert ui["mobile"]["density"] in DENSITIES


# ── the client mirror agrees ────────────────────────────────────────────────

_PANEL_SPEC = Path(__file__).resolve().parent.parent / "static" / "thecommons" / "js" / "panel-spec.js"

_NODE_DIFF = r"""
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
const [modulePath, casesPath] = process.argv.slice(2);
const spec = await import(pathToFileURL(modulePath).href);
const { variables, cases } = JSON.parse(readFileSync(casesPath, 'utf8'));
const out = cases.map((ui) => {
  const p = spec.resolvePanel({ variables, ui });
  return { skin: p.skin, variant: p.variant, title: p.title, tagline: p.tagline, accent: p.accent,
           groups: p.groups, controls: p.controls, mobile: { density: p.density }, desktop: { columns: p.columns } };
});
console.log(JSON.stringify({
  out,
  allow: { skins: Object.fromEntries(Object.entries(spec.SKINS).map(([k, v]) => [k, v.variants])),
           widgets: spec.WIDGETS_BY_TYPE, densities: spec.DENSITIES, caps: spec.CAPS },
}));
"""


def _client_resolve(tmp_path, variables, cases):
    script = tmp_path / "diff.mjs"
    script.write_text(_NODE_DIFF, encoding="utf-8")
    case_file = tmp_path / "cases.json"
    case_file.write_text(json.dumps({"variables": variables, "cases": cases}), encoding="utf-8")
    result = subprocess.run(["node", str(script), str(_PANEL_SPEC), str(case_file)],
                            capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_the_client_mirror_resolves_exactly_what_the_server_normalises(tmp_path):
    cases = [
        GOOD,
        {**GOOD, "accent": "#1a1a1a"},
        {**GOOD, "skin": "desk", "variant": "grey", "accent": "#1A1A1A"},
        {**GOOD, "title": "A" * 200, "tagline": "line one\nline two\t‮evil​"},
        {**GOOD, "title": "go to www.example.test"},
        {**GOOD, "controls": {"palette": {"widget": "knob"}, "speed": {"widget": "pads"}}},
        {**GOOD, "groups": [{"title": "A", "controls": ["speed", "speed", "ghost"]}, {"controls": ["warp"]}]},
        {**GOOD, "desktop": {"columns": 9}, "mobile": {"density": "cosy"}},
        {"skin": "textmode", "variant": "amber"},
        {"skin": ["x"], "variant": {"y": 1}, "groups": "all", "controls": ["speed"]},
        {},
    ]
    client = _client_resolve(tmp_path, VARIABLES, cases)
    for ui, resolved in zip(cases, client["out"]):
        assert resolved == normalize_ui(ui, VARIABLES), ui

    allow = client["allow"]
    assert allow["skins"] == {k: v["variants"] for k, v in SKINS.items()}
    assert {k: tuple(v) for k, v in allow["widgets"].items()} == WIDGETS_BY_TYPE
    assert tuple(allow["densities"]) == DENSITIES
    assert allow["caps"] == {"groups": MAX_GROUPS, "title": TITLE_CAP, "tagline": TAGLINE_CAP,
                             "groupTitle": GROUP_TITLE_CAP, "hint": HINT_CAP, "accentContrast": MIN_ACCENT_CONTRAST}


# ── toggle ───────────────────────────────────────────────────────────────────

TOGGLE_VARIABLES = VARIABLES + [{"name": "trails", "label": "Trails", "type": "toggle", "default": True}]


def test_a_toggle_takes_a_toggle_widget_and_nothing_else():
    ui = normalize_ui({**GOOD, "controls": {"trails": {"widget": "lamp"}}}, TOGGLE_VARIABLES)
    assert ui["controls"]["trails"]["widget"] == "lamp"
    for wrong in ("knob", "pads", "button", "buttons", "slider"):
        ui = normalize_ui({**GOOD, "controls": {"trails": {"widget": wrong}}}, TOGGLE_VARIABLES)
        assert ui["controls"]["trails"]["widget"] == "switch"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_the_client_mirror_agrees_on_toggles(tmp_path):
    cases = [
        {**GOOD, "controls": {"trails": {"widget": "lamp"}}},
        {**GOOD, "controls": {"trails": {"widget": "knob"}}},
        {**GOOD, "groups": [{"title": "Look", "controls": ["trails", "palette"]}]},
        {},
    ]
    client = _client_resolve(tmp_path, TOGGLE_VARIABLES, cases)
    for ui, resolved in zip(cases, client["out"]):
        assert resolved == normalize_ui(ui, TOGGLE_VARIABLES), ui
