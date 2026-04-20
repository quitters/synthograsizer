import asyncio
import logging
import base64
import re
import time
import os
import io
import tempfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse, Response
import httpx
from typing import Optional, List, Dict

from backend.ai_manager import ai_manager, normalize_template
from backend.osc_bridge import osc_bridge
from backend.music_manager import get_music_manager
from backend import config
from backend.models.requests import *
from backend.helpers import decode_base64_image, parse_llm_json

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/api/scope/save-asset")
async def scope_save_asset(request: Request):
    """Write an image directly to Scope's local assets directory.

    Bypasses Scope's cloud-mode CDN token requirement by writing the file
    locally rather than calling Scope's /api/v1/assets endpoint.
    Returns the filename (relative to the assets dir) for use in vace_ref_images.
    """
    try:
        body = await request.json()
        image_b64 = body.get("image", "")
        filename = body.get("filename", "synth-ref.png")

        # Strip data-URL prefix
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_b64)

        scope_assets = Path.home() / ".daydream-scope" / "assets"
        scope_assets.mkdir(parents=True, exist_ok=True)

        file_path = scope_assets / filename
        file_path.write_bytes(image_bytes)
        logger.info("Saved Scope reference asset: %s (%d bytes)", file_path, len(image_bytes))

        return {"path": filename, "full_path": str(file_path)}
    except Exception as e:
        logger.error("scope_save_asset failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/api/scope/discover")
async def scope_discover(req: ScopeDiscoverRequest):
    """Probe Scope's health endpoint and return connection info."""
    return osc_bridge.discover_scope(req.scopeUrl)


@router.get("/api/scope/discover")
async def scope_discover_get():
    """Quick health check of Scope at the current configured URL."""
    return osc_bridge.discover_scope()


# ── Music Studio (Lyria RealTime) ───────────────────────────────────


