"""The knob skins are wired up: app.js gives every knob the three numbers a skin draws from, the picker in the app's menu offers only skins the
stylesheet really has, and every skin is scoped to its own data-skin.

Run with:  python -m pytest tests/test_knob_skins.py -q
(Whether each skin looks right, with one notch per value, is checked in a real browser by Teamcrafter's design/knobs/tests/app_notches.py.)
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "static" / "synthograsizer"
INDEX = (APP / "index.html").read_text(encoding="utf-8")
SKINS = (APP / "css" / "knob-skins.css").read_text(encoding="utf-8")
APP_JS = (APP / "js" / "app.js").read_text(encoding="utf-8")


def picker_slugs():
    m = re.search(r'<select id="knob-skin-select".*?</select>', INDEX, re.S)
    assert m, "the knob style picker is missing from index.html"
    return [s for s in re.findall(r'<option value="([^"]*)"', m.group(0))]


def test_picker_offers_classic_and_only_real_skins():
    slugs = picker_slugs()
    assert slugs[0] == "", "the first option must be Classic (no skin)"
    for slug in slugs[1:]:
        assert f'#knobs-container[data-skin="{slug}"]' in SKINS, f"the picker offers '{slug}' but knob-skins.css has no rules for it"


def test_every_skin_in_the_stylesheet_is_in_the_picker():
    in_css = set(re.findall(r'#knobs-container\[data-skin="([a-z0-9-]+)"\]', SKINS))
    assert in_css, "no skins found in knob-skins.css"
    assert in_css == set(picker_slugs()[1:]), "knob-skins.css and the picker list different skins"


def test_default_skin_is_a_real_one():
    m = re.search(r"var savedSkin = '([a-z0-9-]+)'", INDEX)
    assert m and m.group(1) in picker_slugs()


def test_stylesheet_is_linked_after_the_themes():
    links = re.findall(r'<link rel="stylesheet" href="(css/[^"?]+)', INDEX)
    assert "css/knob-skins.css" in links
    assert links.index("css/knob-skins.css") > links.index("css/cel-pastel-theme.css")
    assert links.index("css/knob-skins.css") > links.index("css/synth-hardware-theme.css")


def test_skins_pull_nothing_from_outside():
    assert "@import" not in SKINS
    assert not re.search(r"url\((?!\s*['\"]?data:)", SKINS), "a skin loads a file"


def test_every_rule_is_scoped_to_a_skin_or_is_the_token_block():
    # strip comments and @media/@keyframes bodies' inner rules are checked too: every selector list must start at #knobs-container (or body.theme-... #knobs-container)
    css = re.sub(r"/\*.*?\*/", "", SKINS, flags=re.S)
    for sel in re.findall(r"(?:^|[}\n])\s*([^{}@\n][^{}]*?)\s*\{", css):
        for part in [p.strip() for p in sel.split(",") if p.strip()]:
            if re.match(r"^(from|to|\d+%)$", part):
                continue
            assert "#knobs-container" in part, f"a rule is not scoped to the knob container: {part[:80]}"


def test_app_sets_the_three_skin_variables_on_render_and_update():
    assert "setKnobScale(item, valueIndex, totalValues)" in APP_JS
    body = re.search(r"setKnobScale\(item, valueIndex, totalValues\) \{(.*?)\n  \}", APP_JS, re.S)
    assert body, "setKnobScale is missing"
    for var in ("--knob-t", "--knob-n", "--knob-angle"):
        assert var in body.group(1)
    render = re.search(r"renderKnobs\(\) \{.*?\n  \}", APP_JS, re.S).group(0)
    update = re.search(r"updateKnobDisplay\(index\) \{.*?\n  \}", APP_JS, re.S).group(0)
    assert "this.setKnobScale(" in render and "this.setKnobScale(" in update
    # the number of notches is the number of values: n is the variable's value count, not the index of the last one
    assert "String(totalValues)" in body.group(1)
