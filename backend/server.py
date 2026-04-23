"""Synthograsizer API Server — FastAPI endpoints for AI generation.

Routes delegate to AIManager (ai_manager.py) for Gemini/Imagen/Veo calls.
All base64 image inputs are decoded via `decode_base64_image()` and all
LLM JSON responses are parsed via `parse_llm_json()` to keep endpoint
handlers concise and consistent.
"""

import sys
import os
from pathlib import Path

# Add the project root and backend directory to path for imports
# This allows both 'import config' and 'from backend import config' to work
backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import asyncio
import logging
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, Response
import httpx
from pydantic import BaseModel
from typing import Optional, List, Dict
import uvicorn
import json
import base64
import re
import time

from backend import config
from ai_manager import ai_manager, normalize_template
from osc_bridge import osc_bridge
from music_manager import get_music_manager

logger = logging.getLogger(__name__)

app = FastAPI(title="Synthograsizer AI Suite")

from backend.routers import chat
from backend.routers import generation
from backend.routers import video_tools
from backend.routers import system
from backend.routers import templates
from backend.routers import analysis
from backend.routers import scope
from backend.routers import metadata
from backend.routers import osc
from backend.routers import music

app.include_router(chat.router)
app.include_router(generation.router)
app.include_router(video_tools.router)
app.include_router(system.router)
app.include_router(templates.router)
app.include_router(analysis.router)
app.include_router(scope.router)
app.include_router(metadata.router)
app.include_router(osc.router)
app.include_router(music.router)



BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

if not STATIC_DIR.exists():
    print(f"WARNING: Static directory not found at {STATIC_DIR}")

# On Vercel, static files are served by the CDN via vercel.json rewrites
if not os.environ.get("VERCEL") and STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    uvicorn.run("backend.server:app", host="0.0.0.0", port=8000, reload=True)
