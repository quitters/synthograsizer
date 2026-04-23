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
import json
from typing import Optional, List, Dict

from backend.ai_manager import ai_manager, normalize_template
from backend.osc_bridge import osc_bridge
from backend.music_manager import get_music_manager
from backend import config
from backend.models.requests import *
from backend.helpers import decode_base64_image, parse_llm_json

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/api/music/status")
async def music_status():
    """Return current Lyria session status."""
    from backend.music_manager import music_manager
    if music_manager is None:
        return {"connected": False, "playing": False, "prompts": [], "config": {}}
    return music_manager.get_status()



@router.websocket("/ws/music")
async def ws_music(websocket: WebSocket):
    """WebSocket endpoint for Lyria RealTime music streaming.

    Protocol:
      Client → Server (JSON text): control messages (play, pause, stop, set_prompts, set_config, reset_context)
      Server → Client (binary): raw 16-bit PCM audio chunks (48kHz stereo)
      Server → Client (JSON text): status updates and errors
    """
    await websocket.accept()

    if not ai_manager.genai_client:
        await websocket.send_json({"error": "API key not configured"})
        await websocket.close()
        return

    # Defer the get_music_manager() call into the try-block. If the singleton
    # constructor raises (bad API key shape, network init failure, etc.),
    # the original `finally` would call `mm.shutdown()` on an undefined name
    # and mask the real error.
    mm = None
    try:
        mm = get_music_manager(ai_manager.genai_client)

        # Callback that forwards data to the browser WebSocket
        async def send_to_browser(data):
            if isinstance(data, bytes):
                await websocket.send_bytes(data)
            elif isinstance(data, str):
                await websocket.send_text(data)
            else:
                await websocket.send_text(data.decode())

        # Start the Lyria session (runs in background task with async context manager)
        await mm.start(send_to_browser)

        # Listen for control messages from the browser and queue them
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await websocket.send_json({"error": "Invalid JSON"})
                    continue

                await mm.send_command(msg)

        except WebSocketDisconnect:
            logger.info("Music WebSocket client disconnected")

    except Exception as e:
        logger.error("Music WebSocket error: %s", e)
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass

    finally:
        if mm is not None:
            try:
                await mm.shutdown()
            except Exception:
                logger.exception("MusicManager shutdown raised — ignoring")


