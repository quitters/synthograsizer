"""Feedback intake — the "make it very easy to give feedback" endpoint.

POST /api/feedback appends one JSON line to data/feedback/feedback-YYYYMM.jsonl
on the operator's disk. Used by:
  - the "Report wrongly blocked" button on safety-block errors
  - the general "Send feedback" form in the settings modal

Privacy posture: nothing is sent anywhere except this machine's disk. The
client never auto-includes prompts — including one is an explicit opt-in
checkbox. On Vercel (read-only filesystem) the endpoint returns 503 with the
GitHub issues URL so the front-end can fall back.
"""

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()
logger = logging.getLogger(__name__)

GITHUB_ISSUES_URL = "https://github.com/quitters/synthograsizer/issues/new/choose"

# Repo-root data/ dir (exists; holds workflows/). Resolved explicitly so the
# write target doesn't depend on launch CWD.
FEEDBACK_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "feedback"

MAX_ENTRY_BYTES = 32 * 1024  # cap a single feedback entry at 32 KB

_write_lock = threading.Lock()


class FeedbackRequest(BaseModel):
    kind: str = "general"                  # "general" | "wrongly_blocked"
    message: str = ""
    surface: Optional[str] = None          # e.g. "image-studio", "template-gen"
    error_message: Optional[str] = None    # the block/error text shown to the user
    categories: Optional[List[str]] = None # harm categories from the typed 422
    backend_tier: Optional[str] = None     # google | local
    model: Optional[str] = None
    prompt: Optional[str] = None           # ONLY when the user opted in
    contact: Optional[str] = None          # optional email for follow-up


@router.post("/api/feedback")
async def submit_feedback(request: FeedbackRequest, http_request: Request):
    if os.environ.get("VERCEL"):
        # Read-only filesystem — point the client at GitHub instead.
        raise HTTPException(
            status_code=503,
            detail={"message": "Feedback storage is unavailable on this deployment.",
                    "github_url": GITHUB_ISSUES_URL},
        )

    entry = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "kind": request.kind,
        "message": (request.message or "")[:8000],
        "surface": request.surface,
        "error_message": (request.error_message or "")[:2000] or None,
        "categories": request.categories or None,
        "backend_tier": request.backend_tier,
        "model": request.model,
        "prompt": (request.prompt or "")[:8000] or None,
        "contact": (request.contact or "")[:200] or None,
    }
    line = json.dumps({k: v for k, v in entry.items() if v is not None},
                      ensure_ascii=False)
    if len(line.encode("utf-8")) > MAX_ENTRY_BYTES:
        raise HTTPException(status_code=413, detail="Feedback entry too large (32 KB cap).")

    # Service mode: feedback goes to Postgres (the instance disk is ephemeral
    # tmpfs on Cloud Run — a JSONL there would vanish on the next deploy).
    from backend.service import service_mode
    if service_mode():
        from backend.service import db
        user = getattr(http_request.state, "user", None)
        await db.pool().execute(
            "INSERT INTO feedback (user_id, payload) VALUES ($1, $2::jsonb)",
            user["id"] if user else None, line,
        )
        return {"status": "success", "message": "Feedback saved — thank you.",
                "stored_at": "service-db"}

    try:
        FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)
        path = FEEDBACK_DIR / f"feedback-{datetime.now(timezone.utc):%Y%m}.jsonl"
        with _write_lock:
            with open(path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
    except OSError as e:
        logger.error("Feedback write failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail={"message": f"Could not save feedback: {e}",
                    "github_url": GITHUB_ISSUES_URL},
        )

    return {"status": "success", "message": "Feedback saved — thank you.",
            "stored_at": str(path)}
