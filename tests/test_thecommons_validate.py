"""Tests for thecommons_validate.py — the port of validate-sketch.js.

Not currently on any runtime path (Stage 2's generator is fallback-only —
see thecommons_generate.py), but ported now for when live generation lands,
so it gets verified now rather than trusted blind.
"""

import pytest

from backend.service.thecommons_validate import InvalidSketchError, validate_native_sketch


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
