"""Tests for thecommons_validate.py — the port of validate-sketch.js.

Not currently on any runtime path (Stage 2's generator is fallback-only —
see thecommons_generate.py), but ported now for when live generation lands,
so it gets verified now rather than trusted blind.
"""

import json
import logging
import re
import sys
from pathlib import Path

import pytest

from backend.service import thecommons_validate
from backend.service.thecommons_gallery import _DIR as GALLERY_DIR
from backend.service.thecommons_validate import (
    NATIVE_PARAMS, InvalidSketchError, compile_error, validate_native_sketch,
)


def _valid_sketch(**over):
    sketch = {
        "name": "Test Piece",
        "promptTemplate": "a {{speed}} {{palette}} scene",
        "code": "ctx.fillRect(0,0,frame.width,frame.height);",
        "variables": [
            {"name": "speed", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
            {"name": "palette", "values": [
                {"text": "warm", "weight": 1}, {"text": "cool", "weight": 1}, {"text": "mono", "weight": 1},
            ]},
        ],
    }
    sketch.update(over)
    return sketch


def test_valid_sketch_passes():
    result = validate_native_sketch(_valid_sketch())
    assert result["name"] == "Test Piece"
    assert len(result["variables"]) == 2


def test_rejects_p5code():
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_valid_sketch(p5Code="function setup() {}"))


def test_rejects_missing_name():
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_valid_sketch(name=""))


def test_rejects_too_few_variables():
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_valid_sketch(variables=[
            {"name": "only_one", "type": "number", "min": 0, "max": 1, "step": 1, "default": 0},
        ], promptTemplate="{{only_one}}"))


def test_accepts_sixteen_rejects_seventeen_variables():
    def numeric_vars(n):
        return [{"name": f"v{i}", "type": "number", "min": 0, "max": 10, "step": 1, "default": 0}
                for i in range(n)]

    def prompt_for(n):
        return " ".join(f"{{{{v{i}}}}}" for i in range(n))

    ok = validate_native_sketch(_valid_sketch(variables=numeric_vars(16), promptTemplate=prompt_for(16)))
    assert len(ok["variables"]) == 16

    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_valid_sketch(variables=numeric_vars(17), promptTemplate=prompt_for(17)))


def test_numeric_range_must_be_finite_and_ordered():
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_valid_sketch(variables=[
            {"name": "a", "type": "number", "min": 10, "max": 0, "step": 1, "default": 5},  # min > max
            {"name": "b", "values": [{"text": "x", "weight": 1}, {"text": "y", "weight": 1}, {"text": "z", "weight": 1}]},
        ], promptTemplate="{{a}} {{b}}"))


def test_numeric_default_must_be_on_step():
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_valid_sketch(variables=[
            {"name": "a", "type": "number", "min": 0, "max": 10, "step": 2, "default": 5},  # 5 not on 0,2,4,6...
            {"name": "b", "values": [{"text": "x", "weight": 1}, {"text": "y", "weight": 1}, {"text": "z", "weight": 1}]},
        ], promptTemplate="{{a}} {{b}}"))


def test_select_needs_three_to_ten_choices():
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_valid_sketch(variables=[
            {"name": "a", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
            {"name": "b", "values": [{"text": "x", "weight": 1}, {"text": "y", "weight": 1}]},  # only 2
        ], promptTemplate="{{a}} {{b}}"))


def test_boolean_weight_is_rejected_even_though_true_equals_one():
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_valid_sketch(variables=[
            {"name": "a", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
            {"name": "b", "values": [{"text": "x", "weight": True}, {"text": "y", "weight": 1}, {"text": "z", "weight": 1}]},
        ], promptTemplate="{{a}} {{b}}"))


def test_prompt_placeholders_must_match_variable_names_exactly():
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_valid_sketch(promptTemplate="a {{speed}} scene"))  # missing {{palette}}


def test_duplicate_variable_names_rejected():
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_valid_sketch(variables=[
            {"name": "a", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
            {"name": "a", "values": [{"text": "x", "weight": 1}, {"text": "y", "weight": 1}, {"text": "z", "weight": 1}]},
        ], promptTemplate="{{a}}"))


# ── trigger controls and the share hint ─────────────────────────────────────

def _with_trigger(**over):
    """The standard sketch plus a shared trigger. Note the promptTemplate is
    unchanged: a trigger deliberately takes no placeholder."""
    sketch = _valid_sketch()
    sketch["variables"] = [*sketch["variables"],
                            {"name": "shoot", "label": "Shoot", "type": "trigger", "share": "all"}]
    sketch.update(over)
    return sketch


def test_trigger_is_accepted_and_normalised():
    result = validate_native_sketch(_with_trigger())
    trigger = [v for v in result["variables"] if v["name"] == "shoot"][0]
    assert trigger == {"name": "shoot", "label": "Shoot", "type": "trigger", "share": "all"}


def test_trigger_defaults_to_being_owned_by_one_person():
    sketch = _with_trigger()
    sketch["variables"][-1].pop("share")
    trigger = [v for v in validate_native_sketch(sketch)["variables"] if v["name"] == "shoot"][0]
    assert trigger["share"] == "one"


def test_trigger_needs_no_placeholder_but_other_controls_still_do():
    validate_native_sketch(_with_trigger())  # no {{shoot}} anywhere, and that is fine
    # Referring to one anyway is still an error: there is no value to substitute.
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_with_trigger(promptTemplate="a {{speed}} {{palette}} {{shoot}} scene"))
    # And a real control that loses its placeholder is still rejected.
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_with_trigger(promptTemplate="a {{speed}} scene"))


def test_trigger_cannot_carry_choices_or_a_numeric_range():
    for bad in ({"values": [{"text": "a", "weight": 1}]}, {"min": 0, "max": 1, "step": 1, "default": 0}):
        sketch = _with_trigger()
        sketch["variables"][-1].update(bad)
        with pytest.raises(InvalidSketchError):
            validate_native_sketch(sketch)


def test_share_is_rejected_on_anything_but_a_trigger():
    # A shared slider has no turn-taking at all — which is exactly what the
    # relay's 4s hold exists to provide. Only a trigger may opt out.
    for index in (0, 1):
        sketch = _valid_sketch()
        sketch["variables"][index]["share"] = "all"
        with pytest.raises(InvalidSketchError):
            validate_native_sketch(sketch)


def test_share_rejects_an_unknown_mode():
    sketch = _with_trigger()
    sketch["variables"][-1]["share"] = "everyone"
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(sketch)


def test_at_least_one_control_must_stay_assignable():
    # All-shared would leave distribute() nothing to hand out, so nobody in the
    # room would own anything — the premise of the whole installation.
    sketch = _valid_sketch(
        promptTemplate="a scene",
        variables=[
            {"name": "shoot", "type": "trigger", "share": "all"},
            {"name": "pulse", "type": "trigger", "share": "all"},
        ],
    )
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(sketch)
    # One owned trigger is enough to satisfy it.
    sketch["variables"][1]["share"] = "one"
    assert len(validate_native_sketch(sketch)["variables"]) == 2


# ── toggle ───────────────────────────────────────────────────────────────────

def _with_toggle(**over):
    sketch = _valid_sketch(promptTemplate="a {{speed}} {{palette}} scene, trails {{trails}}")
    sketch["variables"].append({"name": "trails", "label": "Trails", "type": "toggle", "default": True})
    sketch.update(over)
    return sketch


def test_toggle_is_accepted_and_normalised():
    toggle = [v for v in validate_native_sketch(_with_toggle())["variables"] if v["name"] == "trails"][0]
    assert toggle == {"name": "trails", "label": "Trails", "type": "toggle", "default": True}


def test_toggle_default_must_be_a_real_boolean():
    for bad in (None, 1, 0, "true", "on"):
        sketch = _with_toggle()
        sketch["variables"][-1]["default"] = bad
        if bad is None:
            sketch["variables"][-1].pop("default")
        with pytest.raises(InvalidSketchError):
            validate_native_sketch(sketch)


def test_toggle_takes_no_choices_range_or_share():
    for bad in ({"values": [{"text": "on", "weight": 1}]}, {"min": 0}, {"max": 1}, {"step": 1}, {"share": "all"}):
        sketch = _with_toggle()
        sketch["variables"][-1].update(bad)
        with pytest.raises(InvalidSketchError):
            validate_native_sketch(sketch)


def test_toggle_needs_its_placeholder_like_any_valued_control():
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(_with_toggle(promptTemplate="a {{speed}} {{palette}} scene"))


# ── host-only controls ───────────────────────────────────────────────────────

def _with_host(**over):
    sketch = _with_toggle(promptTemplate="a {{speed}} {{palette}} scene, trails {{trails}}")
    sketch["variables"][-1]["access"] = "host"
    sketch.update(over)
    return sketch


def test_a_host_control_keeps_its_access_and_room_controls_stay_unmarked():
    result = validate_native_sketch(_with_host())
    by_name = {v["name"]: v for v in result["variables"]}
    assert by_name["trails"]["access"] == "host"
    assert "access" not in by_name["speed"] and "access" not in by_name["palette"]


def test_access_must_be_room_or_host():
    sketch = _with_host()
    sketch["variables"][-1]["access"] = "admin"
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(sketch)


def test_a_host_trigger_cannot_also_be_shared():
    sketch = _with_trigger()
    sketch["variables"][-1]["access"] = "host"          # share: "all" is still on it
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(sketch)
    sketch["variables"][-1].pop("share")
    trigger = [v for v in validate_native_sketch(sketch)["variables"] if v["name"] == "shoot"][0]
    assert trigger["access"] == "host"


def test_host_controls_never_count_as_the_rooms():
    # Every control host-only would leave the phones with nothing at all.
    sketch = _with_host()
    for v in sketch["variables"]:
        v["access"] = "host"
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(sketch)


def test_at_most_four_host_controls():
    sketch = _valid_sketch(promptTemplate="{{speed}} {{palette}} " + " ".join(f"{{{{h{i}}}}}" for i in range(5)))
    for i in range(5):
        sketch["variables"].append({"name": f"h{i}", "type": "toggle", "default": False, "access": "host"})
    with pytest.raises(InvalidSketchError):
        validate_native_sketch(sketch)
    sketch["variables"].pop()
    sketch["promptTemplate"] = "{{speed}} {{palette}} " + " ".join(f"{{{{h{i}}}}}" for i in range(4))
    validate_native_sketch(sketch)

# ── the code has to compile, exactly as the wall compiles it ────────────────

# Verbatim from a gemini-3.8-flash sketch: 2 of 30 had this stray `)`, and it
# passed every structural check, so it would have shipped as a blank wall.
STRAY_PAREN = "const glow = 0.4;\nctx.strokeStyle = `rgba(100, 240, 255, 0.4)`);\nctx.stroke();"


def test_a_known_good_gallery_piece_passes_with_its_own_controls():
    code = (GALLERY_DIR / "fireworks.js").read_text(encoding="utf-8")
    controls = json.loads((GALLERY_DIR / "fireworks.json").read_text(encoding="utf-8"))
    assert validate_native_sketch({**controls, "code": code})["code"] == code


@pytest.mark.parametrize("piece", sorted(GALLERY_DIR.glob("*.js")), ids=lambda p: p.stem)
def test_every_gallery_piece_compiles(piece):
    assert compile_error(piece.read_text(encoding="utf-8")) is None


@pytest.mark.parametrize("code", [
    "ctx.fillStyle = `hsl(${frame.t * 40 % 360}, 80%, 50%)`;",
    "const speed = getVar('speed') ?? 0.5;",
    "room.state.dots ??= []; room.state.n ||= 1;",
    "const hue = room.people?.[0]?.hue ?? 0; audio?.beat;",
    "const dots = room.state.dots ?? []; dots.forEach((d) => { d.x += 1; });",
    "class Spark { #age = 0; static count = 0; tick() { return ++this.#age; } }",
    "room.state.buf ??= new OffscreenCanvas(64, 36); const b = room.state.buf.getContext('2d');",
    "if (!frame.width) return;\nctx.fillRect(0, 0, frame.width, frame.height);",
])
def test_modern_syntax_the_sketches_use_compiles(code):
    assert compile_error(code) is None


def test_a_stray_paren_after_a_template_literal_is_rejected_with_the_parsers_message():
    with pytest.raises(InvalidSketchError) as exc:
        validate_native_sketch(_valid_sketch(code=STRAY_PAREN))
    assert str(exc.value) == (
        "invalid native sketch: code does not compile: SyntaxError: Unexpected token ')' "
        "at line 2 of the code: ctx.strokeStyle = `rgba(100, 240, 255, 0.4)`);"
    )


@pytest.mark.parametrize("code, message", [
    # Valid on its own, but not beside the wall's own parameters.
    ("let room = {};", "Identifier 'room' has already been declared"),
    # Balanced by a naive wrapper, so a parser fed "(function(...){" + code + "})" accepts it.
    ("}); (function () {", "Single function literal required"),
    # The body is not async.
    ("await frame;", "await is only valid in async functions"),
])
def test_errors_only_the_real_compile_catches_are_rejected(code, message):
    with pytest.raises(InvalidSketchError, match=re.escape(message)):
        validate_native_sketch(_valid_sketch(code=code))


def test_the_location_is_given_only_where_it_points_into_the_code():
    assert compile_error("const s = `unterminated;") == "SyntaxError: Unexpected end of input at the end of the code"
    # Windows line endings count as one line break, as they do in V8.
    assert compile_error("const a = 1;\r\nctx.fill());").endswith("at line 2 of the code: ctx.fill());")
    # V8 locates this one in the harness, not the code, so no line is claimed.
    nested = "x = " + "(" * 100_000 + "1" + ")" * 100_000 + ";"
    assert compile_error(nested) == "RangeError: Maximum call stack size exceeded"


def test_code_is_compiled_never_run():
    # Run, this would throw, and come back as an error.
    assert compile_error("throw new Error('ran');") is None


def test_native_params_match_the_wall():
    runtime = (Path(__file__).parents[1] / "static" / "thecommons" / "js" / "sketch-runtime.js").read_text(encoding="utf-8")
    declared = re.search(r"NATIVE_PARAMS = \[([^\]]*)\]", runtime).group(1)
    assert tuple(re.findall(r"'(\w+)'", declared)) == NATIVE_PARAMS


class _V8WontLoad:
    @staticmethod
    def init_mini_racer(**_):
        raise OSError("libmini_racer.so: cannot open shared object file")


@pytest.mark.parametrize("engine", [None, _V8WontLoad], ids=["not installed", "native library won't load"])
def test_without_the_engine_the_check_is_skipped_loudly(monkeypatch, caplog, engine):
    # A stale local install, or a wheel whose V8 won't load, must still boot,
    # generate and load the gallery -- but not quietly. None makes the import fail.
    monkeypatch.setitem(sys.modules, "py_mini_racer", engine)
    thecommons_validate._v8.cache_clear()
    try:
        with caplog.at_level(logging.ERROR, logger=thecommons_validate.__name__):
            assert validate_native_sketch(_valid_sketch(code=STRAY_PAREN))["code"] == STRAY_PAREN
        assert "NOT being compiled" in caplog.text
    finally:
        thecommons_validate._v8.cache_clear()
