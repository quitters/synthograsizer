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
from backend.routers import sessions
from backend.routers import outputs
from backend.routers import feedback

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
app.include_router(sessions.router)
app.include_router(outputs.router)
app.include_router(feedback.router)


# ── Hosted-mode hardening ────────────────────────────────────────────────────
# Rate limiting + retention purge activate only when SYNTH_HOSTED=1 (or on
# Vercel). A solo local install is unaffected. See docs/COMPLIANCE_ROADMAP.md.
from backend.policy import is_hosted as _is_hosted

if _is_hosted():
    import time as _time
    from collections import defaultdict, deque
    from fastapi import Request as _Request
    from fastapi.responses import JSONResponse as _JSONResponse

    # Per-IP sliding window over the expensive endpoints. Deliberately
    # hand-rolled (no new dependency): a deque of timestamps per client.
    _RATE_LIMITED_PREFIXES = ("/api/generate/", "/api/chat", "/api/analyze/", "/api/feedback")
    _RATE_MAX_REQUESTS = int(os.environ.get("RATE_LIMIT_REQUESTS", "30"))
    _RATE_WINDOW_SECONDS = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "300"))
    _rate_buckets: dict = defaultdict(deque)

    @app.middleware("http")
    async def _rate_limit(request: _Request, call_next):
        if request.method == "POST" and request.url.path.startswith(_RATE_LIMITED_PREFIXES):
            client_ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                         or (request.client.host if request.client else "unknown"))
            now = _time.monotonic()
            bucket = _rate_buckets[client_ip]
            while bucket and now - bucket[0] > _RATE_WINDOW_SECONDS:
                bucket.popleft()
            if len(bucket) >= _RATE_MAX_REQUESTS:
                retry_after = int(_RATE_WINDOW_SECONDS - (now - bucket[0])) + 1
                return _JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded — this is a shared instance. "
                                       f"Try again in ~{retry_after}s, or run Synthograsizer locally."},
                    headers={"Retry-After": str(retry_after)},
                )
            bucket.append(now)
        return await call_next(request)

    @app.on_event("startup")
    async def _start_retention():
        import asyncio
        from backend.services.retention import retention_loop
        asyncio.create_task(retention_loop())



BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

if not STATIC_DIR.exists():
    print(f"WARNING: Static directory not found at {STATIC_DIR}")

# On Vercel, static files are served by the CDN via vercel.json rewrites
if not os.environ.get("VERCEL") and STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    uvicorn.run("backend.server:app", host="0.0.0.0", port=8000, reload=True)
