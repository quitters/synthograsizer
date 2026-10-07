"""The Commons' inherited p5 library (backend/service/thecommons_data/templates) against the suite's own templates.

The library is copied from static/synthograsizer/templates, so a template present in both must have the same content, and the
instruments written in the atelier residency must all be in it. A copy that drifts would show a different piece on the wall than in the app.
"""
import json
import re
from pathlib import Path

import pytest

from backend.service.thecommons_templates import load_template_library

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "static" / "synthograsizer" / "templates"
COMMONS = ROOT / "backend" / "service" / "thecommons_data" / "templates"

INSTRUMENTS = [
    "reaction-loom", "physarum-dreams", "chladni-plates", "orbital-resonance", "truchet-cathedral", "epicycle-atelier",
    "ferrofluid-magnetics", "murmuration", "cellular-garden", "shattered-stained-glass",
]


def test_instruments_are_in_the_commons_library():
    ids = {t["id"] for t in load_template_library()}
    missing = [n for n in INSTRUMENTS if n not in ids]
    assert not missing, f"not in the Commons p5 library: {missing}"


@pytest.mark.parametrize("path", sorted(COMMONS.glob("*.json")), ids=lambda p: p.stem)
def test_commons_copy_matches_the_app_template(path):
    original = APP / path.name
    if not original.exists():
        pytest.skip("not in the app's template folder")
    mine = json.loads(path.read_text(encoding="utf-8"))
    theirs = json.loads(original.read_text(encoding="utf-8"))
    assert mine == theirs, f"{path.name} differs from static/synthograsizer/templates"


@pytest.mark.parametrize("name", INSTRUMENTS)
def test_instrument_reads_only_declared_variables(name):
    t = next(t for t in load_template_library() if t["id"] == name)
    declared = {v["name"] for v in t["variables"]}
    used = set(re.findall(r"getSynthVar\(\s*['\"]([^'\"]+)['\"]", t["p5Code"]))
    assert used <= declared, f"{name} reads {used - declared}"
    assert all(v["values"] for v in t["variables"]), f"{name} has a variable with no values"
