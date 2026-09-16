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
