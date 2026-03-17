"""Spiral / swirl effects — NumPy + OpenCV port of spiral-effects.js.

Uses ``cv2.remap`` for efficient subpixel-accurate polar distortion instead
of the pixel-by-pixel loop used in the JS version.
"""

from __future__ import annotations

import math

import numpy as np
import cv2


def apply_spiral(
    img: np.ndarray,
    spiral_type: str,
    strength: float = 0.06,
) -> np.ndarray:
    """Apply a full-image swirl / spiral distortion.

    Parameters
    ----------
    img : (H, W, 3) uint8 RGB
    spiral_type : 'spiral' | 'insideOut' | 'outsideIn' | 'cw' | 'ccw'
    strength : swirl strength (0.0–1.0, default 0.06 matches JS)
    """
    h, w, _ = img.shape
    cx, cy = w / 2.0, h / 2.0
    max_r = math.sqrt(cx * cx + cy * cy)

    # Build coordinate grids
    cols, rows = np.meshgrid(np.arange(w, dtype=np.float32),
                             np.arange(h, dtype=np.float32))
    dx = cols - cx
    dy = rows - cy
    r = np.sqrt(dx * dx + dy * dy)
    theta = np.arctan2(dy, dx)

    # Compute per-pixel swirl angle
    swirl_angle = _compute_swirl_angle(r, max_r, strength, spiral_type)
    new_theta = theta + swirl_angle

    # Map back to Cartesian
    map_x = (cx + r * np.cos(new_theta)).astype(np.float32)
    map_y = (cy + r * np.sin(new_theta)).astype(np.float32)

    # Remap with bilinear interpolation
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    result_bgr = cv2.remap(bgr, map_x, map_y, cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_REFLECT)
    return cv2.cvtColor(result_bgr, cv2.COLOR_BGR2RGB)


def _compute_swirl_angle(
    r: np.ndarray,
    max_r: float,
    strength: float,
    spiral_type: str,
) -> np.ndarray:
    """Vectorised version of ``computeSwirlAngle`` from the JS source."""
    norm = r / max_r

    if spiral_type == "cw":
        return strength * norm
    elif spiral_type == "ccw":
        return -strength * norm
    elif spiral_type == "spiral":
        return strength * norm  # default CW
    elif spiral_type == "insideOut":
        return strength * (1.0 - norm)
    elif spiral_type == "outsideIn":
        return strength * norm
    else:
        return np.zeros_like(r)
