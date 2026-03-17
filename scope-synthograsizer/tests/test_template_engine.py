"""Unit tests for the template engine."""

import json
import tempfile
from pathlib import Path

import pytest

from scope_synthograsizer.template_engine import (
    load_template,
    resolve_prompt,
    get_weighted_random_index,
    template_to_scope_params,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def sample_template():
    return {
        "promptTemplate": "A {{style}} painting of a {{subject}}",
        "variables": [
            {
                "name": "style",
                "values": ["impressionist", "cubist", "baroque"],
            },
            {
                "name": "subject",
                "values": ["landscape", "portrait"],
            },
        ],
    }


@pytest.fixture
def weighted_template():
    return {
        "promptTemplate": "{{mood}} scene",
        "variables": [
            {
                "name": "mood",
                "values": [
                    {"text": "serene", "weight": 5},
                    {"text": "chaotic", "weight": 1},
                ],
            },
        ],
    }


@pytest.fixture
def fantasy_scene_path():
    """Path to the actual fantasy-scene.json in the repo."""
    p = Path(__file__).resolve().parent.parent.parent / "static" / "synthograsizer" / "templates" / "fantasy-scene.json"
    if not p.exists():
        pytest.skip("fantasy-scene.json not found in repo")
    return p


# ── Loading ──────────────────────────────────────────────────────────────────

def test_load_from_file(sample_template):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(sample_template, f)
        f.flush()
        tpl = load_template(f.name)
    assert len(tpl["variables"]) == 2


def test_load_invalid_raises():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump({"foo": "bar"}, f)
        f.flush()
        with pytest.raises(ValueError):
            load_template(f.name)


def test_load_fantasy_scene(fantasy_scene_path):
    tpl = load_template(fantasy_scene_path)
    assert len(tpl["variables"]) == 7
    assert "{{scope}}" in tpl["promptTemplate"]


# ── Resolution ───────────────────────────────────────────────────────────────

def test_resolve_defaults(sample_template):
    result = resolve_prompt(sample_template)
    assert "impressionist" in result
    assert "landscape" in result


def test_resolve_with_indices(sample_template):
    result = resolve_prompt(sample_template, {"style": 1, "subject": 1})
    assert "cubist" in result
    assert "portrait" in result


def test_resolve_index_wraps(sample_template):
    result = resolve_prompt(sample_template, {"style": 99})
    # 99 % 3 == 0 → "impressionist"
    assert "impressionist" in result


def test_resolve_weighted_template(weighted_template):
    result = resolve_prompt(weighted_template, {"mood": 0})
    assert result == "serene scene"


# ── Weighted random ──────────────────────────────────────────────────────────

def test_weighted_random_distribution():
    values = [
        {"text": "a", "weight": 100},
        {"text": "b", "weight": 0},
    ]
    results = [get_weighted_random_index(values) for _ in range(100)]
    assert all(r == 0 for r in results)


def test_weighted_random_flat_strings():
    values = ["x", "y", "z"]
    results = set(get_weighted_random_index(values) for _ in range(200))
    assert len(results) > 1  # should hit at least 2 different indices


# ── Scope parameter mapping ─────────────────────────────────────────────────

def test_scope_params(sample_template):
    params = template_to_scope_params(sample_template)
    assert len(params) == 2
    assert params[0]["name"] == "style"
    assert params[0]["max"] == 2  # 3 values → max index 2
    assert params[1]["name"] == "subject"
    assert params[1]["max"] == 1


def test_scope_params_fantasy(fantasy_scene_path):
    tpl = load_template(fantasy_scene_path)
    params = template_to_scope_params(tpl)
    assert len(params) == 7
    # Each variable has 16 values → max index 15
    assert all(p["max"] == 15 for p in params)
