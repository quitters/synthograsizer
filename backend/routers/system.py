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

@router.post("/api/config")
async def configure_api(request: ConfigRequest):
    try:
        ai_manager.configure_api(request.api_key)
        return {"status": "success", "message": "API key configured"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/health")
async def health_check():
    """Test API connectivity and return diagnostic info."""
    return {
        "status": "ok",
        "api_key_configured": bool(ai_manager.api_key),
        "genai_client_available": ai_manager.genai_client is not None,
        "message": "Synthograsizer Suite API is running"
    }

# ---------- ChatRoom Reverse Proxy ----------
# Forwards /chatroom/api/* requests to the Node.js ChatRoom backend on port 3001.
# Supports both standard HTTP requests and SSE streaming for real-time chat.
CHATROOM_BACKEND = "http://localhost:3001"


@router.api_route("/chatroom/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_chatroom(request: Request, path: str):
    """Reverse proxy for ChatRoom Node.js backend."""
    url = f"{CHATROOM_BACKEND}/api/{path}"
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}

    # Handle SSE streaming (GET /chatroom/api/chat/stream)
    if request.method == "GET" and "text/event-stream" in request.headers.get("accept", ""):
        async def stream_sse():
            async with httpx.AsyncClient() as client:
                async with client.stream("GET", url, headers=headers, timeout=None) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk
        return StreamingResponse(stream_sse(), media_type="text/event-stream",
                                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    # Standard request proxy
    async with httpx.AsyncClient() as client:
        body = await request.body()
        resp = await client.request(
            method=request.method,
            url=url,
            headers=headers,
            content=body,
            params=dict(request.query_params),
            timeout=60.0,
        )
        # Filter out hop-by-hop headers
        excluded = {"transfer-encoding", "content-encoding", "content-length", "connection"}
        resp_headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
        return Response(content=resp.content, status_code=resp.status_code, headers=resp_headers)
