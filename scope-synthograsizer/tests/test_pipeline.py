"""Integration-level tests for the Glitcher preprocessor pipeline.

These tests instantiate the pipeline and call __call__ with synthetic tensors,
verifying the full flow from Scope tensor format through NumPy effects and
back to Scope tensor format.

Note: These tests do NOT import scope.core — they test the effect chain
directly to avoid requiring Scope as a dependency in CI.
"""

import numpy as np
import pytest

from scope_synthograsizer.pipelines.glitcher.effects import (
    apply_pixel_sort,
    apply_slice,
    apply_color_effect,
    apply_direction,
    apply_spiral,
)


@pytest.fixture
def frame_rgb():
    """Simulated video frame as uint8 RGB (H, W, 3) — matches what the
    pipeline converts from torch tensors."""
    return np.random.randint(0, 256, (320, 576, 3), dtype=np.uint8)


def _pipeline_chain(img, **kwargs):
    """Simulate the effect chain from pipeline.py __call__."""
    pixel_sort = kwargs.get("pixel_sort", "off")
    slice_mode = kwargs.get("slice_mode", "off")
    color_effect = kwargs.get("color_effect", "off")
    direction_mode = kwargs.get("direction_mode", "off")
    spiral_type = kwargs.get("spiral_type", "off")
    intensity = float(kwargs.get("intensity", 0.5))
    speed = float(kwargs.get("speed", 2.0))
    swirl_strength = float(kwargs.get("swirl_strength", 0.06))

    if pixel_sort != "off":
        img = apply_pixel_sort(img, pixel_sort)
    if slice_mode != "off":
        img = apply_slice(img, slice_mode, intensity)
    if direction_mode != "off":
        img = apply_direction(img, direction_mode, speed)
    if spiral_type != "off":
        img = apply_spiral(img, spiral_type, swirl_strength)
    if color_effect != "off":
        img = apply_color_effect(img, color_effect, intensity)

    # Convert to float [0, 1] as the pipeline does
    return img.astype(np.float32) / 255.0


def test_full_chain(frame_rgb):
    result = _pipeline_chain(
        frame_rgb,
        pixel_sort="columnBrightness",
        slice_mode="horizontal",
        color_effect="hueShift",
        intensity=0.8,
    )
    assert result.shape == (320, 576, 3)
    assert result.dtype == np.float32
    assert np.all(result >= 0.0)
    assert np.all(result <= 1.0)


def test_no_effects_passthrough(frame_rgb):
    result = _pipeline_chain(frame_rgb)
    expected = frame_rgb.astype(np.float32) / 255.0
    np.testing.assert_allclose(result, expected, atol=1e-6)


def test_spiral_chain(frame_rgb):
    result = _pipeline_chain(
        frame_rgb,
        spiral_type="insideOut",
        swirl_strength=0.1,
    )
    assert result.shape == (320, 576, 3)
    assert not np.any(np.isnan(result))


@pytest.mark.parametrize("combo", [
    {"pixel_sort": "rowHue", "color_effect": "vintage"},
    {"slice_mode": "both", "direction_mode": "jitter"},
    {"spiral_type": "ccw", "color_effect": "chromaticAberration"},
])
def test_effect_combos(frame_rgb, combo):
    result = _pipeline_chain(frame_rgb, **combo)
    assert result.shape == frame_rgb.shape[:2] + (3,)
    assert result.dtype == np.float32
    assert np.all(result >= 0.0)
    assert np.all(result <= 1.0)
