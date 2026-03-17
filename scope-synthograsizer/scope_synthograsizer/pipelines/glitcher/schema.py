"""Scope pipeline config for the Synthograsizer Glitcher preprocessor."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from scope.core.pipelines.base_schema import (
    BasePipelineConfig,
    ModeDefaults,
    UsageType,
    ui_field_config,
)

# ── Literal types for dropdown rendering ─────────────────────────────────

PixelSortMode = Literal[
    "off", "columnBrightness", "rowBrightness",
    "columnHue", "rowHue", "randomLines",
    "diagonal", "circular", "wave",
]

SliceMode = Literal["off", "horizontal", "vertical", "both"]

ColorEffect = Literal[
    "off", "chromaticAberration", "hueShift", "vintage",
    "invert", "channelShift", "colorNoise",
]

SpiralType = Literal["off", "spiral", "insideOut", "outsideIn", "cw", "ccw"]

DirectionMode = Literal["off", "down", "up", "left", "right", "random", "jitter"]


class GlitcherPreprocessorConfig(BasePipelineConfig):
    """Destructive glitch-art preprocessor from Synthograsizer.

    Processes incoming video frames with pixel-sort, slice, colour, spiral,
    and direction effects before they reach the main diffusion pipeline.
    All parameters are runtime-editable and mappable via Scope's MIDI/OSC.
    """

    pipeline_id = "synthograsizer-glitcher"
    pipeline_name = "Synthograsizer Glitcher"
    pipeline_description = (
        "Destructive glitch-art preprocessor — pixel sort, slice, "
        "colour shift, spiral, and directional displacement"
    )

    usage = [UsageType.PREPROCESSOR]
    supports_prompts = False
    modes = {"video": ModeDefaults(default=True)}

    # ── Effect selectors (runtime dropdowns) ──────────────────────────────

    pixel_sort: PixelSortMode = Field(
        default="off",
        description="Pixel-sort algorithm",
        json_schema_extra=ui_field_config(
            order=1, label="Pixel Sort", category="input",
        ),
    )

    slice_mode: SliceMode = Field(
        default="off",
        description="Slice glitch direction",
        json_schema_extra=ui_field_config(
            order=2, label="Slice", category="input",
        ),
    )

    color_effect: ColorEffect = Field(
        default="off",
        description="Colour effect",
        json_schema_extra=ui_field_config(
            order=3, label="Colour", category="input",
        ),
    )

    spiral_type: SpiralType = Field(
        default="off",
        description="Spiral/swirl distortion",
        json_schema_extra=ui_field_config(
            order=4, label="Spiral", category="input",
        ),
    )

    direction_mode: DirectionMode = Field(
        default="off",
        description="Directional displacement",
        json_schema_extra=ui_field_config(
            order=5, label="Direction", category="input",
        ),
    )

    # ── Continuous controls (runtime sliders) ─────────────────────────────

    intensity: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Master effect intensity (0 = off, 1 = full)",
        json_schema_extra=ui_field_config(
            order=10, label="Intensity", category="input",
        ),
    )

    speed: float = Field(
        default=2.0,
        ge=0.1,
        le=10.0,
        description="Effect speed / shift magnitude",
        json_schema_extra=ui_field_config(
            order=11, label="Speed", category="input",
        ),
    )

    swirl_strength: float = Field(
        default=0.06,
        ge=0.0,
        le=1.0,
        description="Swirl distortion strength",
        json_schema_extra=ui_field_config(
            order=12, label="Swirl", category="input",
        ),
    )
