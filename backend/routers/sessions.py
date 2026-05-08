"""
Session presets — save/load/delete reusable Composer session configurations.

A "session" bundles:
  - name              human-readable label
  - agents            [{profileId, overrides}] — references AgentProfileStore profile ids
  - sharedAnchors     {key: value} — injected into every agent bio at launch
  - goal              string the agents work toward
  - resolutionMode    "once" | "each_turn" — how variable knobs are resolved
  - createdAt/updatedAt   ISO 8601 timestamps

Storage is plain JSON files under OUTPUT_JSON_DIR / "Sessions" / <id>.json.
File name == id so deletes and reads are O(1) by id.
"""
import json
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import config

router = APIRouter()
logger = logging.getLogger(__name__)

SESSIONS_DIR = config.OUTPUT_JSON_DIR / "Sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


# ── Schema ────────────────────────────────────────────────────────────────────

class SessionAgentSlot(BaseModel):
    profileId: str
    overrides: Optional[Dict[str, Any]] = None


class SessionPreset(BaseModel):
    id: Optional[str] = None
    name: str = ""
    agents: List[SessionAgentSlot] = []
    sharedAnchors: Dict[str, str] = {}
    goal: str = ""
    resolutionMode: str = "once"
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")


def _safe_id(sid: str) -> str:
    """Reject anything that isn't a plain id — guards against path traversal."""
    if not sid or not _ID_RE.match(sid):
        raise HTTPException(status_code=400, detail=f"Invalid session id: {sid!r}")
    return sid


def _path_for(sid: str) -> Path:
    return SESSIONS_DIR / f"{_safe_id(sid)}.json"


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _read_one(p: Path) -> Optional[dict]:
    try:
        with p.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Failed to read session %s: %s", p, e)
        return None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/api/sessions")
async def list_sessions():
    """List all saved sessions, newest first."""
    out = []
    for p in SESSIONS_DIR.glob("*.json"):
        data = _read_one(p)
        if data:
            out.append(data)
    # Sort by updatedAt desc, falling back to createdAt, then name
    out.sort(key=lambda s: (s.get("updatedAt") or s.get("createdAt") or "", s.get("name") or ""), reverse=True)
    return {"status": "success", "sessions": out}


@router.post("/api/sessions")
async def save_session(preset: SessionPreset):
    """Save (insert or update). If preset.id is missing, a new uuid is assigned."""
    sid = preset.id or ("s_" + uuid.uuid4().hex[:10])
    sid = _safe_id(sid)
    now = _now()
    payload = preset.dict()
    payload["id"] = sid
    if not payload.get("createdAt"):
        payload["createdAt"] = now
    payload["updatedAt"] = now
    try:
        with _path_for(sid).open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save: {e}")
    return {"status": "success", "session": payload}


@router.get("/api/sessions/{sid}")
async def get_session(sid: str):
    p = _path_for(sid)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Session not found: {sid}")
    data = _read_one(p)
    if not data:
        raise HTTPException(status_code=500, detail="Session file unreadable")
    return {"status": "success", "session": data}


@router.delete("/api/sessions/{sid}")
async def delete_session(sid: str):
    p = _path_for(sid)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Session not found: {sid}")
    try:
        p.unlink()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete: {e}")
    return {"status": "success", "id": sid}
