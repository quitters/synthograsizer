"""
Generic local-disk persistence for browser-side stores.

Most user content in this app lives only in localStorage / IndexedDB. That's fine
for active work but it evaporates if the browser is wiped, the user moves machines,
or anything goes wrong. This router gives every store a cheap path to a content-
addressed JSON file on disk, plus a way to list and re-import those files.

Each "output kind" maps to a subdirectory under OUTPUT_JSON_DIR. Filenames are
{1-3 word slug}-{6 char sha256}.json, computed from the canonical content. Same
content → same filename → automatic dedup. A user can save the same agent profile
ten times and it lands as one file.

Recovery flow:
  GET  /api/list-outputs/<kind>          → summary list (filename + lightweight fields)
  GET  /api/get-output/<kind>/<filename> → full JSON
  POST /api/save-output                  → write/dedup
  DELETE /api/delete-output/<kind>/<filename> → remove

Supported kinds are declared in KIND_DIRS. To add a new kind, extend KIND_DIRS and
optionally add a summary extractor to _SUMMARY_EXTRACTORS so the list endpoint
returns useful previews.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import config

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Kind registry ──────────────────────────────────────────────────────────────
#
# kind → subdirectory name under OUTPUT_JSON_DIR.
KIND_DIRS = {
    "agent_profile":   "Agent Profiles",
    "taste_profile":   "Taste Profiles",
    "agent_log":       "Agent Studio Logs",
    "story_output":    "Stories",
    "workflow_output": "Workflow Outputs",
}

# ── Schema ─────────────────────────────────────────────────────────────────────

class SaveOutputRequest(BaseModel):
    kind: str
    content: dict
    filename_hint: Optional[str] = None  # optional override slug source


# ── Helpers ────────────────────────────────────────────────────────────────────

_SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9._\-]+$")
_STOP_WORDS = {"a", "an", "the", "this", "is", "in", "of", "with", "for", "to"}


def _kind_dir(kind: str) -> Path:
    if kind not in KIND_DIRS:
        raise HTTPException(status_code=400, detail=f"Unknown output kind: {kind!r}")
    target = config.OUTPUT_JSON_DIR / KIND_DIRS[kind]
    target.mkdir(parents=True, exist_ok=True)
    return target


def _safe_filename(name: str) -> str:
    """Guard against path traversal — only plain filenames are valid."""
    if not name or not _SAFE_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail=f"Invalid filename: {name!r}")
    return name


def _canonical_content_json(content: Any) -> str:
    """
    Stable JSON representation for hashing. Sorted keys, no whitespace. The id
    and *At timestamps are stripped before hashing so renaming or re-saving the
    same logical content produces the same fingerprint (and therefore the same
    file). Anything outside this projection still affects the file body — only
    the hash key is stripped.
    """
    if isinstance(content, dict):
        sanitized = {
            k: _canonical_content_json(v)
            for k, v in content.items()
            if k not in {"id", "createdAt", "updatedAt", "savedAt"}
        }
        return json.dumps(sanitized, sort_keys=True, ensure_ascii=False)
    return json.dumps(content, sort_keys=True, ensure_ascii=False)


def _fingerprint(content: Any) -> str:
    return hashlib.sha256(_canonical_content_json(content).encode("utf-8")).hexdigest()[:8]


def _slugify(text: str, max_words: int = 3) -> str:
    text = re.sub(r"\{\{[^}]*\}\}", "", text or "")
    words = re.sub(r"[^a-z0-9 ]+", " ", text.lower()).split()
    while words and words[0] in _STOP_WORDS:
        words = words[1:]
    slug = "-".join(words[:max_words]).strip("-")
    return slug or "output"


def _derive_slug(kind: str, content: dict, filename_hint: Optional[str] = None) -> str:
    """Pick a 1-3 word slug to make filenames human-scannable."""
    if filename_hint:
        return _slugify(filename_hint)
    # Common fields first
    for key in ("name", "title", "profile_name"):
        v = content.get(key) if isinstance(content, dict) else None
        if isinstance(v, str) and v.strip():
            return _slugify(v)
    # Kind-specific fallbacks
    if kind == "agent_profile":
        cat = content.get("category") if isinstance(content, dict) else None
        return _slugify(cat or "agent")
    if kind == "taste_profile":
        tag = content.get("tagline") if isinstance(content, dict) else None
        return _slugify(tag or "taste-profile")
    if kind == "story_output":
        return _slugify(content.get("promptTemplate", "story"))
    if kind == "agent_log":
        agent = content.get("agentName") if isinstance(content, dict) else None
        return _slugify(agent or "agent-log")
    return _slugify("output")


# ── Per-kind list summary extractor ────────────────────────────────────────────
# Defines what fields the list endpoint returns. Keeps the response light so
# the recovery UI can render hundreds of files without pulling the full JSON.

def _summary_agent_profile(c: dict) -> dict:
    return {
        "name": c.get("name") or "Untitled Agent",
        "category": c.get("category") or "",
        "description": (c.get("description") or "")[:140],
        "icon": c.get("icon") or "",
        "color": c.get("color") or "",
    }


def _summary_taste_profile(c: dict) -> dict:
    return {
        "name": c.get("name") or "Untitled Profile",
        "tagline": (c.get("tagline") or "")[:140],
        "palette_first": (c.get("palette") or [None])[0],
    }


def _summary_agent_log(c: dict) -> dict:
    msgs = c.get("messages") if isinstance(c.get("messages"), list) else []
    return {
        "agentName": c.get("agentName") or "Unknown",
        "startedAt": c.get("startedAt") or "",
        "messageCount": len(msgs),
        "lastSnippet": (msgs[-1].get("text") if msgs and isinstance(msgs[-1], dict) else "")[:100],
    }


def _summary_story_output(c: dict) -> dict:
    return {
        "name": c.get("name") or "Untitled Story",
        "promptPreview": (c.get("promptTemplate") or "")[:140],
        "beatCount": len(c.get("steps") or c.get("beats") or []) or None,
    }


def _summary_workflow_output(c: dict) -> dict:
    return {
        "workflow": c.get("workflowName") or c.get("workflow_name") or "",
        "summary": (c.get("summary") or c.get("description") or "")[:140],
    }


_SUMMARY_EXTRACTORS = {
    "agent_profile":   _summary_agent_profile,
    "taste_profile":   _summary_taste_profile,
    "agent_log":       _summary_agent_log,
    "story_output":    _summary_story_output,
    "workflow_output": _summary_workflow_output,
}


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/api/save-output")
async def save_output(req: SaveOutputRequest):
    """
    Write `content` to disk under the directory for `kind`. Content-addressed:
    same content → same filename → no duplicate file. Returns:
      {status, kind, filename, filepath, fingerprint}
    status is "success" (new file written) or "exists" (matched existing file).
    """
    target_dir = _kind_dir(req.kind)
    fp = _fingerprint(req.content)
    slug = _derive_slug(req.kind, req.content, req.filename_hint)
    filename = f"{slug}-{fp[:6]}.json"
    filepath = target_dir / filename

    # Fast path: already saved under the derived name
    if filepath.exists():
        return {"status": "exists", "kind": req.kind, "filename": filename,
                "filepath": str(filepath), "fingerprint": fp}

    # Slow path: scan for content-equal file under a different slug
    for existing in target_dir.glob("*.json"):
        try:
            with existing.open("r", encoding="utf-8") as f:
                if _fingerprint(json.load(f)) == fp:
                    return {"status": "exists", "kind": req.kind, "filename": existing.name,
                            "filepath": str(existing), "fingerprint": fp}
        except Exception:
            continue

    try:
        with filepath.open("w", encoding="utf-8") as f:
            json.dump(req.content, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error("Failed to write %s: %s", filepath, e)
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "success", "kind": req.kind, "filename": filename,
            "filepath": str(filepath), "fingerprint": fp}


@router.get("/api/list-outputs/{kind}")
async def list_outputs(kind: str):
    """
    Return a lightweight summary of every file in the kind's directory. Sorted
    newest-first by mtime. The response is shaped for picker UIs:
      {status, kind, count, items: [{filename, mtime, ...summary fields}]}
    """
    target_dir = _kind_dir(kind)
    extractor = _SUMMARY_EXTRACTORS.get(kind, lambda c: {})
    items = []
    for p in target_dir.glob("*.json"):
        try:
            stat = p.stat()
            with p.open("r", encoding="utf-8") as f:
                content = json.load(f)
        except Exception as e:
            logger.warning("Skipping unreadable %s: %s", p, e)
            continue
        summary = extractor(content)
        items.append({
            "filename": p.name,
            "mtime": stat.st_mtime,
            **summary,
        })
    items.sort(key=lambda x: x.get("mtime") or 0, reverse=True)
    return {"status": "success", "kind": kind, "count": len(items), "items": items}


@router.get("/api/get-output/{kind}/{filename}")
async def get_output(kind: str, filename: str):
    """Return the full JSON content of one file."""
    target_dir = _kind_dir(kind)
    filename = _safe_filename(filename)
    filepath = target_dir / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"Not found: {filename}")
    try:
        with filepath.open("r", encoding="utf-8") as f:
            content = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Read failed: {e}")
    return {"status": "success", "kind": kind, "filename": filename, "content": content}


@router.delete("/api/delete-output/{kind}/{filename}")
async def delete_output(kind: str, filename: str):
    target_dir = _kind_dir(kind)
    filename = _safe_filename(filename)
    filepath = target_dir / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"Not found: {filename}")
    try:
        filepath.unlink()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")
    return {"status": "success", "kind": kind, "filename": filename}
