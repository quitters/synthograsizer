"""Scope pipeline config for the Synthograsizer Companion."""

from __future__ import annotations

from pydantic import Field

from scope.core.pipelines.base_schema import (
    BasePipelineConfig,
    ModeDefaults,
    ui_field_config,
)


class CompanionConfig(BasePipelineConfig):
    """Launches the Synthograsizer web UI for prompt crafting and p5.js input.

    The companion pipeline is intentionally lightweight — its ``__call__``
    returns a black frame.  The real work happens through WebRTC: the
    Synthograsizer web UI connects directly to Scope's ``/api/v1/webrtc/offer``
    endpoint to stream p5.js canvas frames and push prompt updates via the
    data channel.
    """

    pipeline_id = "synthograsizer-companion"
    pipeline_name = "Synthograsizer"
    pipeline_description = (
        "Launches the Synthograsizer web UI — mad-libs prompt crafting, "
        "skeuomorphic knobs, p5.js VJ canvas, MIDI/OSC integration"
    )

    supports_prompts = True
    modes = {"text": ModeDefaults(default=True), "video": ModeDefaults()}

    # ── Load-time parameters ──────────────────────────────────────────────

    ui_port: int = Field(
        default=8765,
        ge=1024,
        le=65535,
        description="Port for the Synthograsizer companion web server",
        json_schema_extra=ui_field_config(
            order=1,
            label="UI Port",
            is_load_param=True,
        ),
    )

    auto_open_ui: bool = Field(
        default=True,
        description="Automatically open the Synthograsizer UI in the default browser",
        json_schema_extra=ui_field_config(
            order=2,
            label="Auto-Open Browser",
            is_load_param=True,
        ),
    )

    static_dir: str = Field(
        default="",
        description=(
            "Path to the static/ directory containing the Synthograsizer UI.  "
            "Leave empty for auto-detection."
        ),
        json_schema_extra=ui_field_config(
            order=3,
            label="Static Dir",
            is_load_param=True,
        ),
    )
