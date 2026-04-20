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

@router.post("/api/osc/send-prompt")
async def osc_send_prompt(req: OSCSendPromptRequest):
    """Forward a prompt string to Scope via OSC."""
    try:
        osc_bridge.send_prompt(req.prompt, req.address)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/osc/send-param")
async def osc_send_param(req: OSCSendParamRequest):
    """Forward a numeric parameter to Scope via OSC."""
    try:
        osc_bridge.send_float(req.address, req.value)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/osc/config")
async def osc_config(req: OSCConfigRequest):
    """Update the OSC target host/port."""
    osc_bridge.update_config(host=req.host, port=req.port)
    return osc_bridge.status()


@router.get("/api/osc/status")
async def osc_status():
    """Return current OSC target configuration."""
    return osc_bridge.status()


# ── Scope Discovery Endpoints ────────────────────────────────────────


