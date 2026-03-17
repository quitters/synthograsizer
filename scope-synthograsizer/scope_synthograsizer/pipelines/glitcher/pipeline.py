"""Synthograsizer Glitcher — Scope preprocessor pipeline.

Applies a chain of destructive glitch effects to incoming video frames.
All effect parameters are Scope runtime params (editable during streaming,
mappable to MIDI/OSC via Scope's built-in mapping system).

Effect chain order:  pixel_sort → slice → direction → spiral → colour
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
import torch

from scope.core.pipelines.interface import Pipeline, Requirements

from .schema import GlitcherPreprocessorConfig
from .effects import (
    apply_pixel_sort,
    apply_slice,
    apply_color_effect,
    apply_direction,
    apply_spiral,
)

if TYPE_CHECKING:
    from scope.core.pipelines.base_schema import BasePipelineConfig


class GlitcherPreprocessorPipeline(Pipeline):
    """Destructive glitch-art preprocessor.

    Converts each input frame from Scope's tensor format to a NumPy uint8
    array, applies the enabled effects, then converts back to the [0, 1]
    float tensor that Scope expects.
    """

    @classmethod
    def get_config_class(cls) -> type[BasePipelineConfig]:
        return GlitcherPreprocessorConfig

    def __init__(
        self,
        device: torch.device | None = None,
        **kwargs,
    ):
        self.device = (
            device
            if device is not None
            else torch.device("cuda" if torch.cuda.is_available() else "cpu")
        )

    def prepare(self, **kwargs) -> Requirements:
        """We process one frame at a time."""
        return Requirements(input_size=1)

    def __call__(self, **kwargs) -> dict:
        """Process a single video frame through the glitch effect chain.

        Parameters (via kwargs)
        -----------------------
        video : list[torch.Tensor]
            Single-element list; tensor shape ``(1, H, W, C)`` in [0, 255].
        pixel_sort, slice_mode, color_effect, spiral_type, direction_mode :
            Effect selector strings (default ``"off"``).
        intensity, speed, swirl_strength :
            Continuous controls.

        Returns
        -------
        dict  with ``"video"`` key → tensor ``(1, H, W, 3)`` in [0.0, 1.0].
        """
        video = kwargs.get("video")
        if video is None:
            raise ValueError("GlitcherPreprocessor requires video input")

        # ── Unpack frame ──────────────────────────────────────────────────
        frame = video[0].squeeze(0)  # (H, W, C) in [0, 255]
        img = frame.cpu().numpy().astype(np.uint8)

        # Ensure RGB order and 3 channels
        if img.shape[-1] == 4:
            img = img[:, :, :3]

        # ── Read runtime params ───────────────────────────────────────────
        pixel_sort    = kwargs.get("pixel_sort",    "off")
        slice_mode    = kwargs.get("slice_mode",    "off")
        color_effect  = kwargs.get("color_effect",  "off")
        spiral_type   = kwargs.get("spiral_type",   "off")
        direction_mode = kwargs.get("direction_mode", "off")
        intensity     = float(kwargs.get("intensity",     0.5))
        speed         = float(kwargs.get("speed",         2.0))
        swirl_strength = float(kwargs.get("swirl_strength", 0.06))

        # ── Effect chain ──────────────────────────────────────────────────
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

        # ── Convert back to Scope tensor format ──────────────────────────
        result = torch.from_numpy(img.astype(np.float32) / 255.0)
        result = result.unsqueeze(0)  # (1, H, W, 3)
        result = result.clamp(0.0, 1.0)

        return {"video": result}
