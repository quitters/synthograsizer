"""Companion web server — serves the Synthograsizer UI alongside Scope.

Launched as a daemon thread by ``CompanionPipeline.__init__()`` so the
web UI is available as soon as the Scope node loads.  Idempotent — calling
``start()`` when the server is already running is a no-op.

Endpoints
---------
/synthograsizer/          Static Synthograsizer files (HTML, JS, CSS, templates)
/glitcher/                Static Glitcher files
/api/osc/send-prompt      OSC bridge — send prompt string
/api/osc/send-param       OSC bridge — send float parameter
/api/osc/config           OSC bridge — update target host/port
/api/osc/status           OSC bridge — current config
/api/scope-config         Auto-detect Scope URL for the UI
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

logger = logging.getLogger(__name__)

_server_thread: threading.Thread | None = None
_server_lock = threading.Lock()


# ── Pydantic request models ─────────────────────────────────────────────────

class PromptPayload(BaseModel):
    prompt: str
    address: str = "/scope/prompt"


class ParamPayload(BaseModel):
    address: str
    value: float


class OscConfigPayload(BaseModel):
    host: str | None = None
    port: int | None = None


# ── OSC bridge (lightweight, inline — avoids importing the backend package) ─

class _OSCBridge:
    """Minimal OSC bridge using python-osc."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8000):
        self.host = host
        self.port = port
        self._client: Any = None
        self._connect()

    def _connect(self) -> None:
        try:
            from pythonosc.udp_client import SimpleUDPClient
            self._client = SimpleUDPClient(self.host, self.port)
        except ImportError:
            logger.warning("python-osc not installed — OSC bridge disabled")
            self._client = None

    def send_prompt(self, prompt: str, address: str = "/scope/prompt") -> None:
        if self._client:
            self._client.send_message(address, prompt)

    def send_float(self, address: str, value: float) -> None:
        if self._client:
            self._client.send_message(address, value)

    def update_config(self, host: str | None, port: int | None) -> None:
        if host:
            self.host = host
        if port:
            self.port = port
        self._connect()

    def status(self) -> dict:
        return {"host": self.host, "port": self.port}


_osc = _OSCBridge()


# ── FastAPI app ──────────────────────────────────────────────────────────────

def _create_app(static_dir: Path) -> FastAPI:
    app = FastAPI(title="Synthograsizer Companion")

    # ── Static file mounts ────────────────────────────────────────────────
    synthograsizer_dir = static_dir / "synthograsizer"
    glitcher_dir = static_dir / "glitcher"

    if synthograsizer_dir.is_dir():
        app.mount(
            "/synthograsizer",
            StaticFiles(directory=str(synthograsizer_dir), html=True),
            name="synthograsizer",
        )
    if glitcher_dir.is_dir():
        app.mount(
            "/glitcher",
            StaticFiles(directory=str(glitcher_dir), html=True),
            name="glitcher",
        )

    # ── OSC bridge endpoints ─────────────────────────────────────────────

    @app.post("/api/osc/send-prompt")
    async def osc_send_prompt(payload: PromptPayload):
        _osc.send_prompt(payload.prompt, payload.address)
        return {"ok": True}

    @app.post("/api/osc/send-param")
    async def osc_send_param(payload: ParamPayload):
        _osc.send_float(payload.address, payload.value)
        return {"ok": True}

    @app.post("/api/osc/config")
    async def osc_config(payload: OscConfigPayload):
        _osc.update_config(payload.host, payload.port)
        return _osc.status()

    @app.get("/api/osc/status")
    async def osc_status():
        return _osc.status()

    # ── Scope auto-config ────────────────────────────────────────────────

    @app.get("/api/scope-config")
    async def scope_config():
        return {
            "scopeUrl": os.environ.get("SCOPE_URL", "http://127.0.0.1:7860"),
        }

    # ── Root redirect ────────────────────────────────────────────────────

    @app.get("/")
    async def root():
        from fastapi.responses import RedirectResponse
        return RedirectResponse("/synthograsizer/")

    return app


# ── Server lifecycle ─────────────────────────────────────────────────────────

def resolve_static_dir(custom_path: str = "") -> Path:
    """Find the ``static/`` directory containing the Synthograsizer UI.

    Resolution order:
    1. ``custom_path`` argument (if non-empty)
    2. ``SYNTHOGRASIZER_STATIC_DIR`` environment variable
    3. ``../../static`` relative to this package (works in the mono-repo)
    """
    if custom_path:
        p = Path(custom_path)
        if p.is_dir():
            return p

    env = os.environ.get("SYNTHOGRASIZER_STATIC_DIR", "")
    if env:
        p = Path(env)
        if p.is_dir():
            return p

    # Walk up from this file to the repo root
    repo_static = Path(__file__).resolve().parent.parent.parent / "static"
    if repo_static.is_dir():
        return repo_static

    raise FileNotFoundError(
        "Cannot find the Synthograsizer static/ directory.  "
        "Set SYNTHOGRASIZER_STATIC_DIR or pass static_dir to the pipeline."
    )


def start(static_dir: Path, port: int = 8765) -> None:
    """Start the companion web server in a daemon thread (idempotent)."""
    global _server_thread

    with _server_lock:
        if _server_thread is not None and _server_thread.is_alive():
            logger.info("Companion server already running on port %d", port)
            return

        app = _create_app(static_dir)

        def _run() -> None:
            import uvicorn
            uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")

        _server_thread = threading.Thread(target=_run, daemon=True, name="synthograsizer-companion")
        _server_thread.start()
        logger.info("Companion server started → http://localhost:%d/synthograsizer/", port)
