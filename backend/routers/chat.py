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
from backend.helpers import decode_base64_image, parse_llm_json, SafetyBlockedError, safety_block_detail
from backend.service import is_free_tier
from backend.service.credits import charged

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/api/chat")
async def chat(request: ChatRequest, http_request: Request):
    history = request.history or []
    if is_free_tier(http_request):
        history = history[-40:]  # resent-context cap: long chats get expensive fast
    try:
        async with charged(http_request, action="chat", model=request.model,
                           prompt_chars=len(request.message)) as ch:
            response = await asyncio.to_thread(ai_manager.chat, request.message, history, request.model)
            ch.commit()
        return {"status": "success", "response": response}
    except SafetyBlockedError as e:
        raise HTTPException(status_code=422, detail=safety_block_detail(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


