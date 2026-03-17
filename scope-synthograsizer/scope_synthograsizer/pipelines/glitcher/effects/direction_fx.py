"""Direction shift effects — NumPy port of direction-effects.js.

Shifts random rectangular regions in the specified direction.
"""

from __future__ import annotations

import numpy as np


def apply_direction(
    img: np.ndarray,
    direction: str,
    speed: float = 2.0,
) -> np.ndarray:
    """Shift random rectangular blocks in the given direction.

    Parameters
    ----------
    img : (H, W, 3) uint8 RGB
    direction : 'down' | 'up' | 'left' | 'right' | 'random' | 'jitter'
    speed : shift magnitude in pixels (scaled by frame size)
    """
    out = img.copy()
    h, w, _ = out.shape
    shift = max(1, int(speed))

    # Generate 3–5 random rectangular regions
    n_blocks = np.random.randint(3, 6)
    for _ in range(n_blocks):
        bw = np.random.randint(w // 8, max(w // 8 + 1, w // 3))
        bh = np.random.randint(h // 8, max(h // 8 + 1, h // 3))
        bx = np.random.randint(0, max(1, w - bw))
        by = np.random.randint(0, max(1, h - bh))

        d = direction
        if d == "random":
            d = np.random.choice(["down", "up", "left", "right"])
        elif d == "jitter":
            d = np.random.choice(["down", "up", "left", "right"])

        _shift_rect(out, bx, by, bw, bh, shift, d)

    return out


def _shift_rect(
    img: np.ndarray,
    x: int, y: int, w: int, h: int,
    shift: int, direction: str,
) -> None:
    ih, iw, _ = img.shape
    block = img[y : y + h, x : x + w].copy()

    if direction == "down" and y + h + shift <= ih:
        img[y + shift : y + h + shift, x : x + w] = block
    elif direction == "up" and y - shift >= 0:
        img[y - shift : y + h - shift, x : x + w] = block
    elif direction == "right" and x + w + shift <= iw:
        img[y : y + h, x + shift : x + w + shift] = block
    elif direction == "left" and x - shift >= 0:
        img[y : y + h, x - shift : x + w - shift] = block
