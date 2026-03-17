"""Pixel-sort effects — NumPy port of pixel-sort-effects.js.

All functions accept an RGB uint8 image ``(H, W, 3)`` and return a new image
of the same shape.  The original is never mutated.
"""

from __future__ import annotations

import math

import numpy as np

from .utils import rgb_to_brightness, rgb_to_hue


# ── Public dispatcher ────────────────────────────────────────────────────────

def apply_pixel_sort(img: np.ndarray, sort_type: str) -> np.ndarray:
    """Apply the requested pixel-sort algorithm.

    Parameters
    ----------
    img : np.ndarray  (H, W, 3) uint8 RGB
    sort_type : str
        One of: columnBrightness, rowBrightness, columnHue, rowHue,
        randomLines, diagonal, circular, wave
    """
    fn = _DISPATCH.get(sort_type)
    if fn is None:
        return img
    return fn(img.copy())


# ── Column / Row sorts ───────────────────────────────────────────────────────

def _sort_columns_by_brightness(img: np.ndarray) -> np.ndarray:
    bright = rgb_to_brightness(img)  # (H, W)
    order = np.argsort(bright, axis=0)  # sort each column (along rows)
    h, w, c = img.shape
    rows = order  # (H, W) — row index that should go to position [i, j]
    cols = np.arange(w)[np.newaxis, :].repeat(h, axis=0)
    return img[rows, cols]


def _sort_rows_by_brightness(img: np.ndarray) -> np.ndarray:
    bright = rgb_to_brightness(img)
    order = np.argsort(bright, axis=1)
    h, w, c = img.shape
    rows = np.arange(h)[:, np.newaxis].repeat(w, axis=1)
    return img[rows, order]


def _sort_columns_by_hue(img: np.ndarray) -> np.ndarray:
    hue = rgb_to_hue(img).astype(np.float32)
    order = np.argsort(hue, axis=0)
    h, w, _ = img.shape
    cols = np.arange(w)[np.newaxis, :].repeat(h, axis=0)
    return img[order, cols]


def _sort_rows_by_hue(img: np.ndarray) -> np.ndarray:
    hue = rgb_to_hue(img).astype(np.float32)
    order = np.argsort(hue, axis=1)
    h, w, _ = img.shape
    rows = np.arange(h)[:, np.newaxis].repeat(w, axis=1)
    return img[rows, order]


# ── Random lines ─────────────────────────────────────────────────────────────

def _random_line_sort(img: np.ndarray) -> np.ndarray:
    h, w, _ = img.shape
    bright = rgb_to_brightness(img)

    for _ in range(3):
        if np.random.random() < 0.5:
            row = np.random.randint(0, h)
            order = np.argsort(bright[row])
            img[row] = img[row, order]
        else:
            col = np.random.randint(0, w)
            order = np.argsort(bright[:, col])
            img[:, col] = img[order, col]
    return img


# ── Diagonal sort ────────────────────────────────────────────────────────────

def _diagonal_sort(img: np.ndarray) -> np.ndarray:
    h, w, _ = img.shape
    bright = rgb_to_brightness(img)

    for k in range(w + h - 1):
        start_x = max(0, k - h + 1)
        start_y = min(k, h - 1)

        xs, ys = [], []
        x, y = start_x, start_y
        while x < w and y >= 0:
            xs.append(x)
            ys.append(y)
            x += 1
            y -= 1

        if len(xs) < 2:
            continue

        xs_a = np.array(xs)
        ys_a = np.array(ys)
        diag_bright = bright[ys_a, xs_a]
        order = np.argsort(diag_bright)
        img[ys_a, xs_a] = img[ys_a[order], xs_a[order]]

    return img


# ── Circular sort ────────────────────────────────────────────────────────────

def _circular_sort(img: np.ndarray) -> np.ndarray:
    h, w, _ = img.shape
    cx, cy = w / 2, h / 2
    max_radius = min(cx, cy) * 0.8
    step = 5

    bright = rgb_to_brightness(img)

    r = 0.0
    while r < max_radius:
        circumference = 2 * math.pi * r if r > 0 else 1
        steps = max(8, int(circumference / 2))

        xs, ys = [], []
        for i in range(steps):
            angle = (i / steps) * 2 * math.pi
            x = int(round(cx + r * math.cos(angle)))
            y = int(round(cy + r * math.sin(angle)))
            if 0 <= x < w and 0 <= y < h:
                xs.append(x)
                ys.append(y)

        if len(xs) >= 2:
            xs_a = np.array(xs)
            ys_a = np.array(ys)
            ring_bright = bright[ys_a, xs_a]
            order = np.argsort(ring_bright)
            sorted_pixels = img[ys_a[order], xs_a[order]].copy()
            img[ys_a, xs_a] = sorted_pixels

        r += step
    return img


# ── Wave sort ────────────────────────────────────────────────────────────────

def _wave_sort(img: np.ndarray) -> np.ndarray:
    h, w, _ = img.shape
    bright = rgb_to_brightness(img)

    wave_types = [
        {"direction": "horizontal", "amplitude": h * 0.3, "frequency": 0.02, "waves": 3},
        {"direction": "vertical",   "amplitude": w * 0.3, "frequency": 0.02, "waves": 2},
        {"direction": "diagonal",   "amplitude": min(w, h) * 0.2, "frequency": 0.015, "waves": 2},
    ]

    for ti, wt in enumerate(wave_types):
        for wi in range(wt["waves"]):
            phase = (wi + ti) * math.pi * 0.4
            if wt["direction"] == "horizontal":
                _sort_horizontal_wave(img, bright, w, h, wt["amplitude"], wt["frequency"], phase)
            elif wt["direction"] == "vertical":
                _sort_vertical_wave(img, bright, w, h, wt["amplitude"], wt["frequency"], phase)
            else:
                _sort_diagonal_wave(img, bright, w, h, wt["amplitude"], wt["frequency"], phase)
    return img


def _sort_horizontal_wave(
    img: np.ndarray, bright: np.ndarray, w: int, h: int,
    amplitude: float, frequency: float, phase: float,
) -> None:
    step = max(1, int(amplitude / 8))
    for base_y in range(0, h, step):
        xs, ys = [], []
        for x in range(w):
            offset = int(round(amplitude * math.sin(x * frequency + phase)))
            y = max(0, min(h - 1, base_y + offset))
            xs.append(x)
            ys.append(y)
        xs_a = np.array(xs)
        ys_a = np.array(ys)
        path_bright = bright[ys_a, xs_a]
        order = np.argsort(path_bright)
        sorted_pixels = img[ys_a[order], xs_a[order]].copy()
        img[ys_a, xs_a] = sorted_pixels


def _sort_vertical_wave(
    img: np.ndarray, bright: np.ndarray, w: int, h: int,
    amplitude: float, frequency: float, phase: float,
) -> None:
    step = max(1, int(amplitude / 8))
    for base_x in range(0, w, step):
        xs, ys = [], []
        for y in range(h):
            offset = int(round(amplitude * math.sin(y * frequency + phase)))
            x = max(0, min(w - 1, base_x + offset))
            xs.append(x)
            ys.append(y)
        xs_a = np.array(xs)
        ys_a = np.array(ys)
        path_bright = bright[ys_a, xs_a]
        order = np.argsort(path_bright)
        sorted_pixels = img[ys_a[order], xs_a[order]].copy()
        img[ys_a, xs_a] = sorted_pixels


def _sort_diagonal_wave(
    img: np.ndarray, bright: np.ndarray, w: int, h: int,
    amplitude: float, frequency: float, phase: float,
) -> None:
    cx, cy = w / 2, h / 2
    max_dist = math.sqrt(w * w + h * h)

    for angle in np.arange(0, math.pi, math.pi / 4):
        xs, ys = [], []
        dist = 0.0
        while dist < max_dist:
            bx = cx + dist * math.cos(angle)
            by = cy + dist * math.sin(angle)
            if not (0 <= bx < w and 0 <= by < h):
                dist += 2
                continue
            perp = angle + math.pi / 2
            wo = amplitude * math.sin(dist * frequency + phase)
            x = int(round(bx + wo * math.cos(perp)))
            y = int(round(by + wo * math.sin(perp)))
            if 0 <= x < w and 0 <= y < h:
                xs.append(x)
                ys.append(y)
            dist += 2

        if len(xs) >= 2:
            xs_a = np.array(xs)
            ys_a = np.array(ys)
            path_bright = bright[ys_a, xs_a]
            order = np.argsort(path_bright)
            sorted_pixels = img[ys_a[order], xs_a[order]].copy()
            img[ys_a, xs_a] = sorted_pixels


# ── Dispatch table ───────────────────────────────────────────────────────────

_DISPATCH = {
    "columnBrightness": _sort_columns_by_brightness,
    "rowBrightness":    _sort_rows_by_brightness,
    "columnHue":        _sort_columns_by_hue,
    "rowHue":           _sort_rows_by_hue,
    "randomLines":      _random_line_sort,
    "diagonal":         _diagonal_sort,
    "circular":         _circular_sort,
    "wave":             _wave_sort,
}
