"""Contract checks for the templates shipped in static/synthograsizer/templates/.

Structural rules apply to every template: it is an object with a promptTemplate and variables, every {{placeholder}} has a
variable, a p5 sketch only reads variables the template declares, and it makes no calls the sandboxed viewer forbids.

The stricter p5 rule from docs/SCHEMA.md section 8.8 (every variable value appears in the sketch as a quoted lookup key, and
the variable has a usable scale of values) is enforced for the instruments listed in STRICT, which were written against it.
Older p5 templates predate it; test_legacy_p5_templates_report_lookup_gaps prints how many still break it without failing.

Run with:  python -m pytest tests/test_template_contract.py -q
"""
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "static" / "synthograsizer" / "templates"
INDEX_HTML = ROOT / "static" / "synthograsizer" / "index.html"

STRICT = [
    "reaction-loom", "physarum-dreams", "chladni-plates",
    "orbital-resonance", "truchet-cathedral", "epicycle-atelier",
]

# image-prompt engines: no p5 code, a promptTemplate that reads as one image prompt, and variables with real depth
ENGINES = [
    "lost-cinema", "tape-shelf", "impossible-objects", "civic-notices",
    "arcade-archaeology", "brutalist-utopias", "arcana-machina", "specimen-plates",
    "sanatorium-dispatch",   # designed by an agent swarm session, see the atelier log
]

# calls the sandboxed p5 viewer cannot use (no network, no assets, no storage, no console)
FORBIDDEN = ["console.log", "alert(", "fetch(", "loadImage(", "loadFont(", "import ", "require(", "XMLHttpRequest", "localStorage"]


def load_all():
    out = {}
    for path in sorted(TEMPLATES.glob("*.json")):
        out[path.stem] = json.loads(path.read_text(encoding="utf-8"))
    return out


ALL = load_all()
P5 = {name: t for name, t in ALL.items() if isinstance(t, dict) and t.get("p5Code")}


def value_texts(variable):
    return [v["text"] if isinstance(v, dict) else v for v in variable.get("values", [])]


def quoted_in(code, text):
    return f"'{text}'" in code or f'"{text}"' in code or "'" + text.replace("'", "\\'") + "'" in code


@pytest.mark.parametrize("name", sorted(ALL))
def test_template_is_an_object_with_prompt_and_variables(name):
    t = ALL[name]
    assert isinstance(t, dict), f"{name}.json is not a JSON object"
    assert "promptTemplate" in t and "variables" in t, f"{name}.json needs promptTemplate and variables"
    assert isinstance(t["variables"], list)


@pytest.mark.parametrize("name", sorted(ALL))
def test_every_placeholder_has_a_variable(name):
    t = ALL[name]
    names = {v.get("name") for v in t["variables"] if isinstance(v, dict)}
    holders = set(re.findall(r"\{\{(\w+)\}\}", t.get("promptTemplate", "")))
    assert holders <= names, f"{name}: placeholders without a variable: {sorted(holders - names)}"


@pytest.mark.parametrize("name", sorted(P5))
def test_p5_sketch_reads_only_declared_variables(name):
    t = P5[name]
    names = {v["name"] for v in t["variables"]}
    used = set(re.findall(r"getSynthVar\(\s*['\"]([^'\"]+)['\"]", t["p5Code"]))
    assert used <= names, f"{name}: getSynthVar of undeclared variable(s) {sorted(used - names)}"


@pytest.mark.parametrize("name", sorted(P5))
def test_p5_sketch_makes_no_forbidden_calls(name):
    code = P5[name]["p5Code"]
    found = [bad for bad in FORBIDDEN if bad in code]
    assert not found, f"{name}: p5Code contains {found}"


@pytest.mark.parametrize("name", sorted(P5))
def test_p5_sketch_does_not_end_in_a_line_comment(name):
    # the viewer appends '});' straight after the code (buildSrcdoc in index.html), so a trailing // comment would swallow it
    code = P5[name]["p5Code"]
    last = code.split("\n")[-1]
    assert code.endswith("\n") or "//" not in last, f"{name}: p5Code ends in a // comment with no newline"


@pytest.mark.parametrize("name", STRICT)
def test_strict_instrument_exists_and_creates_a_canvas(name):
    assert name in P5, f"{name}.json is missing or has no p5Code"
    assert "p.createCanvas(" in P5[name]["p5Code"]


@pytest.mark.parametrize("name", STRICT)
def test_strict_instrument_keys_every_value_and_has_a_scale(name):
    t = P5[name]
    code = t["p5Code"]
    assert 4 <= len(t["variables"]) <= 7, f"{name}: {len(t['variables'])} variables (guide says 4-7)"
    for v in t["variables"]:
        texts = value_texts(v)
        assert len(texts) >= 6, f"{name}.{v['name']}: only {len(texts)} values"
        assert len(set(texts)) == len(texts), f"{name}.{v['name']}: duplicate values"
        for tx in texts:
            assert quoted_in(code, tx), f"{name}.{v['name']}: value {tx!r} is not a lookup key in p5Code"
        for val in v["values"]:
            assert isinstance(val, dict) and val.get("weight", 1) in (1, 2, 3), f"{name}.{v['name']}: bad value object {val!r}"


@pytest.mark.parametrize("name", STRICT)
def test_strict_instrument_falls_back_when_a_variable_is_missing(name):
    # every getSynthVar must be followed by a fallback (|| 'x'), since it returns null before the first update
    code = P5[name]["p5Code"]
    for m in re.finditer(r"getSynthVar\(\s*['\"][^'\"]+['\"]\s*\)(.{0,12})", code):
        assert m.group(1).lstrip().startswith("||"), f"{name}: getSynthVar without a fallback near {m.group(0)!r}"


@pytest.mark.parametrize("name", STRICT)
def test_strict_instrument_is_in_the_p5_picker(name):
    html = INDEX_HTML.read_text(encoding="utf-8")
    assert re.search(rf'data-template="{re.escape(name)}"[^>]*data-category="P5"', html), f"{name} has no P5 picker button"


@pytest.mark.parametrize("name", ENGINES)
def test_engine_uses_every_variable_and_has_depth(name):
    t = ALL[name]
    names = [v["name"] for v in t["variables"]]
    holders = re.findall(r"\{\{(\w+)\}\}", t["promptTemplate"])
    assert set(holders) == set(names), f"{name}: placeholders and variables differ"
    assert len(holders) == len(set(holders)), f"{name}: a placeholder is used twice"
    assert 5 <= len(names) <= 9, f"{name}: {len(names)} variables"
    assert "p5Code" not in t
    for v in t["variables"]:
        texts = value_texts(v)
        assert len(texts) >= 6, f"{name}.{v['name']}: only {len(texts)} values"
        assert len(set(texts)) == len(texts), f"{name}.{v['name']}: duplicate values"
        assert not any("{{" in x or "}}" in x for x in texts), f"{name}.{v['name']}: a value contains a placeholder"
        assert all(isinstance(x, dict) and x.get("weight", 1) in (1, 2, 3) for x in v["values"]), f"{name}.{v['name']}: bad weights"


@pytest.mark.parametrize("name", ENGINES)
def test_engine_fills_into_a_clean_prompt(name):
    t = ALL[name]
    for pick in (0, -1):
        combo = {v["name"]: value_texts(v)[pick] for v in t["variables"]}
        prompt = re.sub(r"\{\{(\w+)\}\}", lambda m: combo[m.group(1)], t["promptTemplate"])
        assert "{{" not in prompt and "}}" not in prompt
        assert 80 <= len(prompt) <= 700, f"{name}: prompt is {len(prompt)} characters"
        assert "  " not in prompt, f"{name}: double space in the filled prompt"


@pytest.mark.parametrize("name", ENGINES)
def test_engine_is_in_the_prompt_picker(name):
    html = INDEX_HTML.read_text(encoding="utf-8")
    assert re.search(rf'data-template="{re.escape(name)}"[^>]*data-category="PROMPT"', html), f"{name} has no PROMPT picker button"


def test_legacy_p5_templates_report_lookup_gaps(capsys):
    gaps = {}
    for name, t in P5.items():
        if name in STRICT:
            continue
        missing = sum(1 for v in t["variables"] for tx in value_texts(v) if not quoted_in(t["p5Code"], tx))
        if missing:
            gaps[name] = missing
    with capsys.disabled():
        print(f"\n[template contract] {len(gaps)} of {len(P5) - len(STRICT)} older p5 templates have variable values that are "
              f"not lookup keys in their sketch (not enforced): " + ", ".join(f"{k}={v}" for k, v in sorted(gaps.items())[:8]) + (" ..." if len(gaps) > 8 else ""))
