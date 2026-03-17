"""Slice glitch effects — NumPy port of slice-effects.js.

Horizontal and vertical slice displacement with optional colour offset.
"""

from __future__ import annotations

import numpy as np

from .utils import clamp_uint8


def apply_slice(img: np.ndarray, mode: str, intensity: float = 0.5) -> np.ndarray:
    """Apply slice glitch.

    Parameters
    ----------
    img : (H, W, 3) uint8 RGB
    mode : 'horizontal' | 'vertical' | 'both'
    intensity : 0.0–1.0  (controls colour offset magnitude and slice size)
    """
    out = img.copy()
    color_max = int(intensity * 60)  # max colour offset in [0, 60]

    if mode in ("horizontal", "both"):
        _horizontal_slice(out, color_max)
    if mode in ("vertical", "both"):
        _vertical_slice(out, color_max)
    return out


# ── Internal ─────────────────────────────────────────────────────────────────

def _horizontal_slice(img: np.ndarray, color_max: int) -> None:
    h, w, _ = img.shape
    slice_h = np.random.randint(1, max(2, h // 6))
    start_y = np.random.randint(0, max(1, h - slice_h))
    offset = np.random.randint(1, 6)
    color_offset = np.random.randint(-color_max, color_max + 1) if color_max > 0 else 0

    band = img[start_y : start_y + slice_h].copy()

    if np.random.random() < 0.5:
        # shift right
        if offset < w:
            img[start_y : start_y + slice_h, offset:] = clamp_uint8(
                band[:, : w - offset].astype(np.int16) + color_offset
            )
    else:
        # shift left
        if offset < w:
            img[start_y : start_y + slice_h, : w - offset] = clamp_uint8(
                band[:, offset:].astype(np.int16) + color_offset
            )


def _vertical_slice(img: np.ndarray, color_max: int) -> None:
    h, w, _ = img.shape
    slice_w = np.random.randint(1, max(2, w // 6))
    start_x = np.random.randint(0, max(1, w - slice_w))
    offset = np.random.randint(1, 6)
    color_offset = np.random.randint(-color_max, color_max + 1) if color_max > 0 else 0

    band = img[:, start_x : start_x + slice_w].copy()

    if np.random.random() < 0.5:
        # shift down
        if offset < h:
            img[offset:, start_x : start_x + slice_w] = clamp_uint8(
                band[: h - offset].astype(np.int16) + color_offset
            )
    else:
        # shift up
        if offset < h:
            img[: h - offset, start_x : start_x + slice_w] = clamp_uint8(
                band[offset:].astype(np.int16) + color_offset
            )
