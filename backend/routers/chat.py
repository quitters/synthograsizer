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

@router.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        response = await asyncio.to_thread(ai_manager.chat, request.message, request.history, request.model)
        return {"status": "success", "response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


