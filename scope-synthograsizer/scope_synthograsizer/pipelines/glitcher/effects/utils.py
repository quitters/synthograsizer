"""Colour conversion helpers used by all glitcher effects."""

from __future__ import annotations

import numpy as np
import cv2


def rgb_to_brightness(img: np.ndarray) -> np.ndarray:
    """Luminance per pixel — matches JS ``0.299R + 0.587G + 0.114B``.

    Parameters
    ----------
    img : np.ndarray  (H, W, 3) uint8, RGB order

    Returns
    -------
    np.ndarray  (H, W) float32
    """
    return (
        0.299 * img[:, :, 0].astype(np.float32)
        + 0.587 * img[:, :, 1].astype(np.float32)
        + 0.114 * img[:, :, 2].astype(np.float32)
    )


def rgb_to_hue(img: np.ndarray) -> np.ndarray:
    """Hue channel (0–180, OpenCV convention) per pixel.

    Parameters
    ----------
    img : np.ndarray  (H, W, 3) uint8, RGB order

    Returns
    -------
    np.ndarray  (H, W) uint8  — hue in [0, 180)
    """
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    return hsv[:, :, 0]


def clamp_uint8(arr: np.ndarray) -> np.ndarray:
    """Clamp an array to [0, 255] and cast to uint8."""
    return np.clip(arr, 0, 255).astype(np.uint8)
