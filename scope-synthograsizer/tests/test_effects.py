"""Unit tests for glitcher effects — validates NumPy ports produce valid output."""

import numpy as np
import pytest

from scope_synthograsizer.pipelines.glitcher.effects.pixel_sort import apply_pixel_sort
from scope_synthograsizer.pipelines.glitcher.effects.slice_fx import apply_slice
from scope_synthograsizer.pipelines.glitcher.effects.color_fx import apply_color_effect
from scope_synthograsizer.pipelines.glitcher.effects.direction_fx import apply_direction
from scope_synthograsizer.pipelines.glitcher.effects.spiral_fx import apply_spiral
from scope_synthograsizer.pipelines.glitcher.effects.utils import rgb_to_brightness, rgb_to_hue


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def gradient_img():
    """256×256 RGB gradient — R increases left→right, G increases top→down."""
    h, w = 256, 256
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :, 0] = np.arange(w, dtype=np.uint8)[np.newaxis, :]  # R
    img[:, :, 1] = np.arange(h, dtype=np.uint8)[:, np.newaxis]  # G
    img[:, :, 2] = 128  # constant B
    return img


@pytest.fixture
def small_img():
    """Small 32×32 random image for fast tests."""
    return np.random.randint(0, 256, (32, 32, 3), dtype=np.uint8)


# ── Utils ────────────────────────────────────────────────────────────────────

def test_rgb_to_brightness_shape(gradient_img):
    b = rgb_to_brightness(gradient_img)
    assert b.shape == (256, 256)
    assert b.dtype == np.float32
    assert np.all(b >= 0) and np.all(b <= 255)


def test_rgb_to_hue_shape(gradient_img):
    h = rgb_to_hue(gradient_img)
    assert h.shape == (256, 256)
    assert h.dtype == np.uint8


# ── Pixel Sort ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("sort_type", [
    "columnBrightness", "rowBrightness", "columnHue", "rowHue",
    "randomLines", "diagonal", "circular", "wave",
])
def test_pixel_sort_shape_and_range(gradient_img, sort_type):
    out = apply_pixel_sort(gradient_img, sort_type)
    assert out.shape == gradient_img.shape
    assert out.dtype == np.uint8
    assert np.all(out >= 0) and np.all(out <= 255)
    assert not np.any(np.isnan(out.astype(np.float32)))


def test_pixel_sort_columns_sorted(gradient_img):
    """After column-brightness sort, each column should be monotonically ordered."""
    out = apply_pixel_sort(gradient_img, "columnBrightness")
    bright = rgb_to_brightness(out)
    for col in range(0, out.shape[1], 16):  # sample every 16th column
        column_vals = bright[:, col]
        assert np.all(np.diff(column_vals) >= -0.01), f"Column {col} not sorted"


def test_pixel_sort_off_passthrough(gradient_img):
    out = apply_pixel_sort(gradient_img, "off")
    np.testing.assert_array_equal(out, gradient_img)


# ── Slice ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("mode", ["horizontal", "vertical", "both"])
def test_slice_shape(small_img, mode):
    out = apply_slice(small_img, mode, 0.5)
    assert out.shape == small_img.shape
    assert out.dtype == np.uint8


# ── Colour ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("effect", [
    "chromaticAberration", "hueShift", "vintage", "invert",
    "channelShift", "colorNoise",
])
def test_color_effect_shape(small_img, effect):
    out = apply_color_effect(small_img, effect, 0.5)
    assert out.shape == small_img.shape
    assert out.dtype == np.uint8


def test_invert_correctness():
    img = np.array([[[100, 200, 50]]], dtype=np.uint8)
    out = apply_color_effect(img, "invert", 1.0)
    np.testing.assert_array_equal(out, [[[155, 55, 205]]])


# ── Direction ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("direction", ["down", "up", "left", "right", "random", "jitter"])
def test_direction_shape(small_img, direction):
    out = apply_direction(small_img, direction, 2.0)
    assert out.shape == small_img.shape
    assert out.dtype == np.uint8


# ── Spiral ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("spiral_type", ["spiral", "insideOut", "outsideIn", "cw", "ccw"])
def test_spiral_shape(small_img, spiral_type):
    out = apply_spiral(small_img, spiral_type, 0.06)
    assert out.shape == small_img.shape
    assert out.dtype == np.uint8
