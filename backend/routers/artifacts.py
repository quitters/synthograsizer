"""Artifacts — per-user saved creations ("My creations" gallery).

Mounted unconditionally; every endpoint 404s unless service mode is active
(SYNTH_AUTH=1), matching routers/account.py. Storage is a separate opt-in on
top of that (SYNTH_GCS_BUCKET): with the bucket unset, saves and signed-URL
fetches 503 via storage.enabled(), but the list endpoint still works — an
operator can flip the bucket off without breaking whatever UI is already
rendered.

Every save requires an owned generation_id: this is deliberately NOT a bare
{data_b64} upload endpoint. Requiring a generation_id the caller's own
`generations` row actually holds, of a compatible action, proves they made a
metered call capable of producing this kind of media before we store their
bytes — closing the "arbitrary image host" hole a bare upload endpoint would
otherwise open. generation_id is surfaced by the generate/image,
generate/video, and generate/smart-transform endpoints for exactly this.

No dedicated rate limiting here, and deliberately not added to enforcement's
AI_PREFIXES: that list also trips the Gemini daily-budget breaker and the
admin-only-prefix check, neither of which makes sense for a storage call that
never reaches Gemini — blocking saves of already-generated (already-paid-for)
content because today's Gemini spend cap was hit would frustrate users for no
budget benefit. The per-user storage quota is the actual abuse bound. Session
resolution and the CSRF same-origin check still apply here for free: the
middleware runs them for every /api/ path regardless of prefix.
"""

import base64
import binascii
import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.service import service_mode, storage

router = APIRouter()
logger = logging.getLogger(__name__)

DEFAULT_QUOTA_MB = 200
PAGE_SIZE = 50

# kind -> generations.action values that could plausibly have produced it,
# and the MIME top-level type it must declare.
_KIND_ACTIONS = {
    "image": ("image", "smart_transform"),
    "video": ("video",),
    "music": ("music",),
}
_KIND_MIME_PREFIX = {"image": "image/", "video": "video/", "music": "audio/"}


class SaveArtifactRequest(BaseModel):
    data_b64: str
    kind: str
    mime: str
    generation_id: int
    label: Optional[str] = None


def _require_service() -> None:
    if not service_mode():
        raise HTTPException(status_code=404, detail="Not found")


def _current_user(request: Request):
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in.")
    return user


def _quota_bytes() -> int:
    mb = int(os.environ.get("SYNTH_STORAGE_QUOTA_MB", DEFAULT_QUOTA_MB))
    return mb * 1024 * 1024


def _storage_unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail={
        "error": "storage_disabled",
        "message": "This deployment doesn't have saved creations turned on.",
    })


@router.post("/api/artifacts")
async def save_artifact(body: SaveArtifactRequest, request: Request):
    _require_service()
    user = _current_user(request)
    if not storage.enabled():
        raise _storage_unavailable()
    if body.kind not in _KIND_ACTIONS:
        raise HTTPException(status_code=400, detail="kind must be image, video, or music")
    if not body.mime.lower().startswith(_KIND_MIME_PREFIX[body.kind]):
        raise HTTPException(status_code=400,
                             detail=f"mime type doesn't match kind={body.kind}")

    from backend.service import db
    pool = db.pool()

    # Same 404 whether generation_id is someone else's or doesn't exist at
    # all — don't let this endpoint confirm other users' generation ids.
    gen = await pool.fetchrow(
        "SELECT action FROM generations WHERE id = $1 AND user_id = $2",
        body.generation_id, user["id"],
    )
    if gen is None or gen["action"] not in _KIND_ACTIONS[body.kind]:
        raise HTTPException(status_code=404,
                             detail="No matching generation for this account.")

    try:
        data = base64.b64decode(body.data_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="data_b64 is not valid base64.")
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload.")

    used = await pool.fetchval(
        "SELECT COALESCE(SUM(bytes), 0) FROM artifacts WHERE user_id = $1", user["id"]
    )
    quota = _quota_bytes()
    if used + len(data) > quota:
        raise HTTPException(status_code=413, detail={
            "error": "storage_quota",
            "used_mb": round(used / 1024 / 1024, 1),
            "limit_mb": quota // (1024 * 1024),
        })

    # The GCS object name is a UUID, not the DB row id: the id only exists
    # after INSERT, but storage_path is NOT NULL — computing the path from an
    # independent key sidesteps that ordering instead of a two-step
    # insert-placeholder-then-update.
    import uuid
    artifact_key = uuid.uuid4().hex
    storage_path = storage.object_path(user["id"], artifact_key, body.kind, body.mime)

    artifact_id = await pool.fetchval(
        "INSERT INTO artifacts (user_id, generation_id, kind, mime, bytes, storage_path, label) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        user["id"], body.generation_id, body.kind, body.mime, len(data),
        storage_path, body.label,
    )
    try:
        storage.put(storage_path, data, body.mime)
    except Exception:
        logger.exception("artifact upload failed (user=%s, path=%s)", user["id"], storage_path)
        await pool.execute("DELETE FROM artifacts WHERE id = $1", artifact_id)
        raise HTTPException(status_code=503, detail="Upload failed — nothing was saved.")

    return {"id": artifact_id, "kind": body.kind, "mime": body.mime,
            "bytes": len(data), "label": body.label}


@router.get("/api/me/artifacts")
async def list_artifacts(request: Request, before_id: Optional[int] = None):
    _require_service()
    user = _current_user(request)

    from backend.service import db
    pool = db.pool()
    rows = await pool.fetch(
        "SELECT id, kind, mime, bytes, label, created_at FROM artifacts "
        "WHERE user_id = $1 AND ($2::bigint IS NULL OR id < $2) "
        "ORDER BY id DESC LIMIT $3",
        user["id"], before_id, PAGE_SIZE + 1,
    )
    has_more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]
    used = await pool.fetchval(
        "SELECT COALESCE(SUM(bytes), 0) FROM artifacts WHERE user_id = $1", user["id"]
    )
    return {
        "items": [
            {"id": r["id"], "kind": r["kind"], "mime": r["mime"], "bytes": r["bytes"],
             "label": r["label"], "created_at": r["created_at"].isoformat()}
            for r in rows
        ],
        "next_before_id": rows[-1]["id"] if has_more and rows else None,
        "storage_used_mb": round(used / 1024 / 1024, 1),
        "storage_limit_mb": _quota_bytes() // (1024 * 1024),
    }


@router.get("/api/artifacts/{artifact_id}/url")
async def artifact_url(artifact_id: int, request: Request):
    _require_service()
    user = _current_user(request)
    if not storage.enabled():
        raise _storage_unavailable()

    from backend.service import db
    pool = db.pool()
    row = await pool.fetchrow(
        "SELECT storage_path FROM artifacts WHERE id = $1 AND user_id = $2",
        artifact_id, user["id"],
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")

    ttl = int(os.environ.get("SYNTH_SIGNED_URL_TTL_S", "600"))
    url = storage.signed_url(row["storage_path"], ttl_seconds=ttl)
    return {"url": url, "expires_in": ttl}


@router.delete("/api/artifacts/{artifact_id}")
async def delete_artifact(artifact_id: int, request: Request):
    _require_service()
    user = _current_user(request)

    from backend.service import db
    pool = db.pool()
    row = await pool.fetchrow(
        "SELECT storage_path FROM artifacts WHERE id = $1 AND user_id = $2",
        artifact_id, user["id"],
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")

    # The row must always be deletable even if the operator has since turned
    # storage off — a disabled bucket must not leave a gallery entry stuck.
    if storage.enabled():
        storage.delete(row["storage_path"])
    await pool.execute("DELETE FROM artifacts WHERE id = $1", artifact_id)
    return {"status": "deleted"}
