"""Synthograsizer Companion — Scope pipeline that launches the web UI.

This pipeline's ``__call__`` is a deliberate pass-through.  The actual
integration happens via WebRTC from the Synthograsizer browser UI directly
to Scope's WebRTC API (``/api/v1/webrtc/offer``).  This pipeline exists so
that:

1. Users have a pipeline entry in Scope to load the companion.
2. The web server starts automatically on pipeline load.
3. The Scope session stays active while the companion is in use.
"""

from __future__ import annotations

import logging
import webbrowser
from typing import TYPE_CHECKING

import torch

from scope.core.pipelines.interface import Pipeline

from .schema import CompanionConfig
from ...web_server import resolve_static_dir, start as start_server

if TYPE_CHECKING:
    from scope.core.pipelines.base_schema import BasePipelineConfig

logger = logging.getLogger(__name__)


class CompanionPipeline(Pipeline):
    """Launches the Synthograsizer companion web UI."""

    @classmethod
    def get_config_class(cls) -> type[BasePipelineConfig]:
        return CompanionConfig

    def __init__(
        self,
        height: int = 512,
        width: int = 512,
        ui_port: int = 8765,
        auto_open_ui: bool = True,
        static_dir: str = "",
        **kwargs,
    ):
        self.height = height
        self.width = width

        # Start the companion web server
        resolved = resolve_static_dir(static_dir)
        start_server(resolved, port=ui_port)

        # Optionally open the browser
        if auto_open_ui:
            url = f"http://localhost:{ui_port}/synthograsizer/"
            logger.info("Opening Synthograsizer UI → %s", url)
            webbrowser.open(url)

    def __call__(self, **kwargs) -> dict:
        """Return a black frame — the real output comes via WebRTC."""
        return {
            "video": torch.zeros(1, self.height, self.width, 3),
        }
