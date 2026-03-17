"""Colour manipulation effects — NumPy port of color-effects.js.

Chromatic aberration, hue shift, vintage/sepia, invert, channel shift,
and colour noise.
"""

from __future__ import annotations

import numpy as np
import cv2

from .utils import clamp_uint8


def apply_color_effect(
    img: np.ndarray,
    effect: str,
    intensity: float = 0.5,
) -> np.ndarray:
    """Dispatch to the requested colour effect.

    Parameters
    ----------
    img : (H, W, 3) uint8 RGB
    effect : str  — one of chromaticAberration, hueShift, vintage, invert,
             channelShift, colorNoise
    intensity : 0.0–1.0
    """
    fn = _DISPATCH.get(effect)
    if fn is None:
        return img
    return fn(img.copy(), intensity)


# ── Effects ──────────────────────────────────────────────────────────────────

def _chromatic_aberration(img: np.ndarray, strength: float) -> np.ndarray:
    """Horizontal channel displacement — red right, blue left."""
    offset = int(strength * 10)
    if offset == 0:
        return img
    h, w, _ = img.shape
    out = img.copy()
    # Red channel shifted right
    out[:, offset:, 0] = img[:, : w - offset, 0]
    # Blue channel shifted left
    out[:, : w - offset, 2] = img[:, offset:, 2]
    return out


def _hue_shift(img: np.ndarray, strength: float) -> np.ndarray:
    """Rotate the hue channel.  strength 1.0 ≈ 29° shift (matches JS)."""
    shift = strength * 0.08 * 180  # OpenCV hue is [0, 180)
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.int16)
    hsv[:, :, 0] = (hsv[:, :, 0] + int(shift)) % 180
    hsv = hsv.astype(np.uint8)
    bgr_out = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    return cv2.cvtColor(bgr_out, cv2.COLOR_BGR2RGB)


def _vintage(img: np.ndarray, strength: float) -> np.ndarray:
    """Sepia-tone filter blended with the original."""
    # Standard sepia matrix (matches JS implementation)
    sepia = np.array(
        [
            [0.393, 0.769, 0.189],
            [0.349, 0.686, 0.168],
            [0.272, 0.534, 0.131],
        ],
        dtype=np.float32,
    )
    f = img.astype(np.float32)
    toned = f @ sepia.T  # (H, W, 3)
    blended = f * (1.0 - strength) + toned * strength
    return clamp_uint8(blended)


def _invert(img: np.ndarray, _intensity: float) -> np.ndarray:
    """Full RGB inversion."""
    return 255 - img


def _channel_shift(img: np.ndarray, _intensity: float) -> np.ndarray:
    """Rotate RGB channels → GBR."""
    return np.stack([img[:, :, 1], img[:, :, 2], img[:, :, 0]], axis=-1)


def _color_noise(img: np.ndarray, strength: float) -> np.ndarray:
    """Additive uniform colour noise."""
    amount = strength * 50
    noise = (np.random.random(img.shape).astype(np.float32) - 0.5) * amount
    return clamp_uint8(img.astype(np.float32) + noise)


# ── Dispatch ─────────────────────────────────────────────────────────────────

_DISPATCH = {
    "chromaticAberration": _chromatic_aberration,
    "hueShift":            _hue_shift,
    "vintage":             _vintage,
    "invert":              _invert,
    "channelShift":        _channel_shift,
    "colorNoise":          _color_noise,
}
