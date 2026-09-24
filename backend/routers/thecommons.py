"""The Commons — multi-room generative-art installation.

Stage 2 (room identity & isolation) of the port described in
TheCommons/docs/HANDOFF.md. Router = thin auth/validation; logic lives in
backend/service/thecommons_jobs.py and thecommons_relay.py.

Every HTTP endpoint 404s unless service mode is active, matching
routers/account.py and routers/artifacts.py. Room-admin endpoints require a
verified Google session AND server-checked ownership of that specific room —
copying artifacts.py's exact discipline: a nonexistent room and someone
else's room return the identical 404, so a room_id can never be enumerated.
The WebSocket route is the opposite: fully anonymous for both the display and
station (participant) roles, scoped only by an opaque join_code — matching
the decided product requirement that joining a room's live canvas needs no
account at all.
"""

import asyncio
import hashlib
import io
import json
import logging
import os
import secrets
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from backend import config
from backend.service import credits, service_mode, storage, storage_quota
from backend.service import thecommons_images as images
from backend.service import thecommons_jobs as jobs
from backend.service.thecommons_gallery import SECTIONS as GALLERY_SECTIONS
from backend.service.thecommons_gallery import gallery_preset_id, load_gallery
from backend.service.thecommons_gallery_tags import LOOK_TAGS
from backend.service.thecommons_gallery_tags import tag_groups as gallery_tag_groups
from backend.service.thecommons_generate import generate_sketch
from backend.service.thecommons_relay import HostControlError, discard_relay, get_or_create_relay, peek_relay

router = APIRouter()
logger = logging.getLogger(__name__)


# ── auth/ownership helpers (pattern copied from routers/artifacts.py) ──────

def _require_service() -> None:
    if not service_mode():
        raise HTTPException(status_code=404, detail="Not found")


def _current_user(request: Request):
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in.")
    return user


async def _require_owned_room(pool, room_id: int, user_id: int):
    room = await pool.fetchrow(
        "SELECT * FROM commons_rooms WHERE id = $1 AND owner_user_id = $2", room_id, user_id)
    if room is None:
        # Identical 404 for "doesn't exist" and "not yours" — never confirm a
        # room_id's existence to a caller who doesn't own it.
        raise HTTPException(status_code=404, detail="Not found")
    return room


def _public_origin(request: Request) -> str:
    """The public-facing origin to embed in join/QR links.

    Reuses SYNTH_PUBLIC_ORIGINS (already operator-set, non-secret — see
    enforcement.py's _trusted_origins) rather than the request's own Host
    header: synthograsizer.com is fronted by a Vercel proxy that dials Cloud
    Run with Host: ...run.app, so request.base_url would bake the internal
    run.app URL into every QR code instead of the public domain. Falls back
    to the request's own origin when unset (local/dev — same-origin is
    correct there).
    """
    configured = os.environ.get("SYNTH_PUBLIC_ORIGINS", "")
    first = configured.split(",")[0].strip() if configured else ""
    if first:
        return first if "://" in first else f"https://{first}"
    return str(request.base_url).rstrip("/")


def _join_url(request: Request, join_code: str) -> str:
    # /thecommons/join/:code isn't a built page yet (no client UI this
    # stage) — this is the URL the QR/join link will resolve to once it is.
    return f"{_public_origin(request)}/thecommons/join/{join_code}"


def _room_summary(row) -> dict:
    return {
        "id": row["id"], "name": row["name"], "joinCode": row["join_code"], "status": row["status"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
    }


# ── request bodies ──────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    name: str | None = None


class HostControlRequest(BaseModel):
    name: str
    # Any, not a union: pydantic would coerce true to 1 or "5" to 5, and the
    # relay's own gate (accept_value) is the one place that decides validity.
    value: Any = None
    fire: bool = False


class SavePresetRequest(BaseModel):
    name: str | None = None


class LoadPresetRequest(BaseModel):
    presetId: str


class ReorderImagesRequest(BaseModel):
    ids: list[int]


class GenerateRequest(BaseModel):
    roomId: int
    prompt: str
    requestId: str
    mode: str = "create"
    baseSketchId: str | None = None
    # Which system prompt to generate against. Orthogonal to `mode`: the
    # creator picks it on the desk, so routing costs no classifier call.
    interactive: bool = False
    # Write a piece that uses the room's images (room.images). Forced on for a
    # remix of a piece that already does.
    useImages: bool = False


# ── room CRUD ────────────────────────────────────────────────────────────────

@router.post("/api/thecommons/rooms")
async def create_room(body: CreateRoomRequest, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    join_code = secrets.token_urlsafe(24)
    name = body.name.strip()[:100] if body.name else None
    row = await pool.fetchrow(
        "INSERT INTO commons_rooms (owner_user_id, join_code, name) VALUES ($1, $2, $3) RETURNING *",
        user["id"], join_code, name,
    )
    return JSONResponse(status_code=201, content=_room_summary(row))


@router.get("/api/me/thecommons/rooms")
async def list_my_rooms(request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    rows = await pool.fetch(
        "SELECT * FROM commons_rooms WHERE owner_user_id = $1 ORDER BY created_at DESC", user["id"])
    return {"rooms": [_room_summary(r) for r in rows]}


@router.delete("/api/thecommons/rooms/{room_id}")
async def delete_room(room_id: int, request: Request):
    """Permanently delete a room the caller owns.

    commons_room_state and commons_room_jobs go with it via ON DELETE CASCADE,
    so the live canvas AND the room's saved presets are destroyed — presets are
    job rows. The generations rows those jobs point at are NOT cascaded
    (generation_id is ON DELETE SET NULL in the other direction), so the spend
    ledger survives deleting a room, which is what billing integrity needs.

    A generation already in flight is left to finish. Its room-state write will
    fail its foreign key and be swallowed by _run_job's own handler, but that
    handler's `finally` still settles the charge — so a room deleted mid-remix
    still bills or refunds correctly rather than losing the reservation.
    """
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])

    # Row first, relay second. The other order leaves a window where a joining
    # phone re-hydrates the relay we just discarded; with the row already gone,
    # that join is refused at the handshake instead.
    await pool.execute(
        "DELETE FROM commons_rooms WHERE id = $1 AND owner_user_id = $2", room_id, user["id"])
    relay = peek_relay(room_id)
    if relay is not None:
        await relay.shutdown()
    discard_relay(room_id)
    # The image rows went with the room (CASCADE); their objects go here. Best
    # effort: a leftover object is still under the owner's prefix, so their
    # account delete would take it, and it is never served without its row.
    if storage.enabled():
        try:
            await asyncio.to_thread(storage.delete_prefix, images.room_prefix(user["id"], room_id))
        except Exception:  # noqa: BLE001
            logger.exception("[thecommons] room %s deleted, but its images were not", room_id)
    return Response(status_code=204)


def _panel_preview(sketch: dict | None) -> dict | None:
    """What the desk needs to preview the phones' panel: the controls and the
    panel spec, and deliberately not the code. The desk only draws this, with
    the same data-only renderer the phones use; it never runs a piece that
    didn't come from the gallery endpoint."""
    if not sketch:
        return None
    variables = sketch.get("variables") or []
    return {"id": sketch.get("id"), "name": sketch.get("name"),
            "variables": [v for v in variables if v.get("access") != "host"], "ui": sketch.get("ui"),
            "hostCount": sum(1 for v in variables if v.get("access") == "host")}


@router.get("/api/thecommons/rooms/{room_id}")
async def get_room(room_id: int, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    room = await _require_owned_room(pool, room_id, user["id"])
    relay = await get_or_create_relay(pool, room_id)
    active_job = await jobs.get_active_job(pool, room_id)
    state = await jobs.get_room_state(pool, room_id)
    return {
        **_room_summary(room),
        "sketchName": relay.current_sketch.get("name") if relay.current_sketch else None,
        "sketchId": relay.current_sketch.get("id") if relay.current_sketch else None,
        # Lets the desk keep "use this room's images" on when remixing a piece that does.
        "usesImages": jobs.uses_images(relay.current_sketch),
        # Set only while a gallery piece is live, unremixed — lets the desk mark its card.
        "gallerySlug": relay.current_sketch.get("gallery") if relay.current_sketch else None,
        "panel": _panel_preview(relay.current_sketch),
        # The live piece's host-only controls and their values, for the desk.
        "host": relay.host_controls(),
        "canUndo": bool(state and state.get("undo")) and active_job is None,
        "activeJobId": active_job["id"] if active_job else None,
    }


_PAGES = Path(__file__).resolve().parent.parent.parent / "static" / "thecommons"


def _page(name: str) -> FileResponse:
    """Serve one of the room-scoped pages by path.

    StaticFiles can't route a path segment, and the join URL is a path
    (/thecommons/join/{code}) rather than a query string because it's the
    thing a QR encodes and people occasionally read aloud. These are
    registered before the "/" static mount, so they win the match.

    Deliberately no room lookup here: the page loads regardless and its
    WebSocket reports an unknown or closed room, which also covers a room
    closing while someone is already looking at it.
    """
    return FileResponse(_PAGES / name / "index.html")


@lru_cache(maxsize=1)
def _gallery_payload() -> tuple[bytes, str]:
    body = json.dumps({
        "sections": GALLERY_SECTIONS,
        # The chips the desk's library offers, with their labels, so the two
        # sides can't drift on what a tag is called.
        "tagGroups": gallery_tag_groups(GALLERY_SECTIONS),
        "pieces": [{**piece, "presetId": gallery_preset_id(piece["slug"])} for piece in load_gallery()],
    }).encode("utf-8")
    return body, '"' + hashlib.sha256(body).hexdigest()[:20] + '"'


@router.get("/api/thecommons/gallery")
async def commons_gallery(request: Request):
    """The gallery of ready-made pieces, with their code.

    Deliberately public and deliberately separate from the presets list. The
    desk runs every piece returned here live as a thumbnail, on the signed-in
    page, so this endpoint must only ever return code shipped in the repo —
    never a room's saved looks or anything generated at runtime, which is what
    the presets list mixes in. Keeping it a separate endpoint makes that
    boundary something the server enforces, not something the client has to
    filter correctly. Loading a piece still goes through the owner-only
    presets/load route.

    Revalidated, not cached for a fixed time: this first shipped with
    max-age=300, and after the gallery grew, browsers kept serving the old list
    to the new page for five minutes, so new pieces simply weren't there. An
    ETag costs a 304 when nothing changed and picks up a deploy immediately.
    """
    body, etag = _gallery_payload()
    headers = {"Cache-Control": "no-cache", "ETag": etag}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


@router.get("/api/thecommons/config")
async def commons_config():
    """Where the realtime relay actually lives.

    synthograsizer.com is fronted by a Vercel proxy that answers WebSocket
    upgrade requests with its own 404 instead of forwarding them — verified
    2026-09-17, when the identical upgrade returned 101 against Cloud Run
    directly. So the wall and station pages are served from the domain but
    must open their socket straight at Cloud Run, which browsers allow
    (WebSockets aren't subject to CORS preflight, and this endpoint never
    carried an origin check — a join code is the capability, as it already
    was for same-origin connections).

    Unset means same-origin, which is correct for local installs and for any
    future fronting that does pass upgrades through (e.g. the ALB +
    serverless NEG path DEPLOY_CLOUDRUN.md already anticipates for Veo).
    """
    return {"wsOrigin": os.environ.get("SYNTH_WS_ORIGIN", "")}


@router.get("/thecommons/join/{join_code}", include_in_schema=False)
async def join_page(join_code: str):
    return _page("join")


@router.get("/thecommons/display/{join_code}", include_in_schema=False)
async def display_page(join_code: str):
    return _page("display")


@router.get("/api/thecommons/qr/{join_code}")
async def room_qr(join_code: str, request: Request):
    """The room's join QR, as a PNG. Public and unauthenticated by design —
    same trust model as /ws/thecommons/{join_code}: this is exactly what a
    room's public display page shows so people in the room can scan it, so
    gating it behind the owner's session would defeat its purpose. Knowing a
    join_code already lets anyone connect to the room's WS as a participant;
    this adds nothing beyond that. The owner already has the join_code from
    GET /api/thecommons/rooms/{room_id}, so no separate owner-scoped route.
    """
    if not service_mode():
        raise HTTPException(status_code=404, detail="Not found")
    from backend.service import db
    pool = db.pool()
    room = await pool.fetchrow(
        "SELECT id, status FROM commons_rooms WHERE join_code = $1", join_code)
    if room is None or room["status"] != "active":
        raise HTTPException(status_code=404, detail="Not found")

    # Lazy, like db.py's asyncpg import and for the same reason: Commons is
    # hosted-only, so a local install with stale deps shouldn't fail to boot
    # the whole app over a dependency only this endpoint needs.
    import qrcode

    img = qrcode.make(_join_url(request, join_code), error_correction=qrcode.constants.ERROR_CORRECT_M)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png",
                     headers={"Cache-Control": "public, max-age=3600"})


@router.get("/api/thecommons/rooms/{room_id}/telemetry")
async def room_telemetry(room_id: int, request: Request):
    # Deliberately owner-only, unlike Node's public /api/telemetry: per-room
    # activity/liveness is a disclosure even though it costs no model spend
    # (see docs/HANDOFF.md's Stage-2 reasoning).
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    relay = await get_or_create_relay(pool, room_id)
    return relay.get_telemetry()


# ── host controls ────────────────────────────────────────────────────────────
# The owner steers the live piece's "access": "host" controls from the desk.
# HTTP rather than a socket on purpose: walls and phones dial Cloud Run
# directly (SYNTH_WS_ORIGIN), where the desk's synthograsizer.com session
# cookie never arrives -- this route reuses the ordinary owner check as is.

_HOST_ERRORS = {
    "unknown": (404, "The live piece has no host control by that name."),
    "invalid": (400, "That value doesn't fit this control."),
    "busy": (429, "Too many changes at once. Try again in a moment."),
}


@router.post("/api/thecommons/rooms/{room_id}/host")
async def set_host_control(room_id: int, body: HostControlRequest, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    relay = await get_or_create_relay(pool, room_id)
    try:
        items = relay.apply_host_trigger(body.name) if body.fire else relay.apply_host_update(body.name, body.value)
    except HostControlError as exc:
        status, message = _HOST_ERRORS[exc.code]
        raise HTTPException(status_code=status, detail=message)
    await relay.broadcast(items)
    return {"name": body.name, "value": None if body.fire else relay.values.get(body.name)}


# ── undo / presets ───────────────────────────────────────────────────────────

@router.post("/api/thecommons/rooms/{room_id}/undo")
async def undo_room(room_id: int, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    relay = await get_or_create_relay(pool, room_id)
    try:
        sketch = await jobs.undo(pool, relay, room_id)
    except jobs.ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {"name": sketch.get("name")}


@router.get("/api/thecommons/rooms/{room_id}/presets")
async def list_presets(room_id: int, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    presets = await jobs.list_presets(pool, room_id)
    return {"presets": [_preset_row(p) for p in presets]}


def _preset_row(preset: dict) -> dict:
    row = {"id": preset["id"], "name": preset["name"], "kind": preset["kind"], "savedAt": preset.get("savedAt")}
    sketch = preset.get("sketch")
    code = sketch.get("code") if isinstance(sketch, dict) else None
    if isinstance(code, str) and "room.images" in code:
        row["usesImages"] = True
    # A generated piece's card line and look tags, so the library can describe
    # and filter it like a ready-made one. Pieces made before listings existed
    # have none, and get the generic card they always had.
    listing = _preset_listing(sketch)
    if listing:
        row["listing"] = listing
    return row


def _preset_listing(sketch) -> dict | None:
    listing = sketch.get("listing") if isinstance(sketch, dict) else None
    if not isinstance(listing, dict):
        return None
    blurb = listing.get("blurb") if isinstance(listing.get("blurb"), str) else ""
    look = [t for t in listing.get("look") or [] if isinstance(t, str) and t in LOOK_TAGS]
    return {"blurb": blurb, "look": look} if blurb or look else None


@router.post("/api/thecommons/rooms/{room_id}/presets")
async def save_preset(room_id: int, body: SavePresetRequest, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    relay = await get_or_create_relay(pool, room_id)
    try:
        preset_id = await jobs.save_preset(pool, relay, room_id, body.name)
    except jobs.ConflictError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return JSONResponse(status_code=201, content={"id": str(preset_id)})


@router.post("/api/thecommons/rooms/{room_id}/presets/load")
async def load_preset(room_id: int, body: LoadPresetRequest, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    presets = await jobs.list_presets(pool, room_id)
    preset = next((p for p in presets if p["id"] == body.presetId), None)
    if preset is None:
        raise HTTPException(status_code=404, detail="Preset not found.")
    relay = await get_or_create_relay(pool, room_id)
    try:
        sketch = await jobs.load_preset(pool, relay, room_id, preset["sketch"], preset.get("values") or {})
    except jobs.ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {"name": sketch.get("name")}


# ── generation jobs ──────────────────────────────────────────────────────────
# Note: /api/thecommons/generate is added to enforcement.AI_PREFIXES even
# though Stage 2's own generator (thecommons_generate.generate_sketch) spends
# nothing — see docs/HANDOFF.md. That wires terms/rate-limit/budget gating in
# now, ahead of a later stage swapping in a live provider call, with no
# second trip through enforcement.py needed then.

@router.post("/api/thecommons/generate")
async def start_generation(body: GenerateRequest, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, body.roomId, user["id"])
    relay = await get_or_create_relay(pool, body.roomId)

    # Metered against the room owner's own suite credits, reserved before any
    # provider dispatch (jobs.start takes it last, once every rejection path
    # is cleared). Admins are exempt from the debit by Charge itself, exactly
    # as they are everywhere else in the suite. A short balance surfaces as
    # the standard 402 out_of_credits from Charge.reserve().
    charge = credits.Charge(request, action="commons_sketch",
                             model=config.MODEL_COMMONS_SKETCH, prompt_chars=len(body.prompt or ""))
    try:
        job = await jobs.start(
            pool, relay, body.roomId, body.prompt, body.requestId,
            mode=body.mode, base_sketch_id=body.baseSketchId, generate=generate_sketch,
            charge=charge, interactive=body.interactive, use_images=body.useImages,
        )
    except jobs.ActiveJobError as exc:
        raise HTTPException(status_code=409, detail={"error": str(exc), "jobId": exc.job_id})
    except jobs.StaleSourceError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return JSONResponse(status_code=202, content={"job": job})


@router.get("/api/thecommons/rooms/{room_id}/jobs/active")
async def active_job(room_id: int, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    return await jobs.get_active_job(pool, room_id)


@router.get("/api/thecommons/rooms/{room_id}/jobs/{job_id}")
async def get_job(room_id: int, job_id: int, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    job = await jobs.get_job(pool, room_id, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="remix not found")
    return job


# ── room images ──────────────────────────────────────────────────────────────
# The owner uploads images for pieces on the wall to use (room.images). Every
# upload is re-encoded by thecommons_images.sanitize() before anything is
# stored, and the wall only ever fetches that output, from this origin -- see
# that module's docstring for why. Owner-only, like the rest of the desk; the
# wall's own route below is reached by the join code it already has.

_IMAGE_HEADERS = {"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"}


def _images_unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail={
        "error": "storage_disabled",
        "message": "This deployment can't store images, so pieces use the sample images.",
    })


def _room_full() -> HTTPException:
    return HTTPException(status_code=409, detail={
        "error": "room_full", "message": f"This room already has {images.MAX_ROOM_IMAGES} images."})


def _image_entry(room_id: int, row: dict) -> dict:
    return {"id": row["id"], "position": row["position"], "width": row["width"], "height": row["height"],
            "bytes": row["bytes"], "url": f"/api/thecommons/rooms/{room_id}/images/{row['id']}"}


async def _images_payload(pool, room_id: int, user_id: int) -> dict:
    rows = await images.list_images(pool, room_id)
    used = await storage_quota.used_bytes(pool, user_id)
    return {
        "images": [_image_entry(room_id, r) for r in rows],
        "limit": images.MAX_ROOM_IMAGES,
        "storageEnabled": storage.enabled(),
        "storageUsedMb": round(used / 1024 / 1024, 1),
        "storageLimitMb": storage_quota.quota_bytes() // (1024 * 1024),
        # What pieces use while the room has no uploads.
        "samples": [{"id": d["id"], "width": d["width"], "height": d["height"],
                     "url": f"{images.DEFAULTS_URL}/{d['file']}"} for d in images.DEFAULT_IMAGES],
    }


async def _rebroadcast_images(pool, room_id: int) -> None:
    relay = peek_relay(room_id)
    if relay is not None:
        await relay.publish_images(images.wall_manifest(await images.list_images(pool, room_id)))


async def _image_bytes(owner_user_id: int, room_id: int, image_id: int) -> Response:
    try:
        data = await asyncio.to_thread(storage.get, images.object_path(owner_user_id, room_id, image_id))
    except Exception:  # noqa: BLE001 -- a missing object is a missing image
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=data, media_type=images.MIME, headers=_IMAGE_HEADERS)


@router.get("/api/thecommons/rooms/{room_id}/images")
async def list_room_images(room_id: int, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    return await _images_payload(pool, room_id, user["id"])


@router.post("/api/thecommons/rooms/{room_id}/images")
async def upload_room_image(room_id: int, request: Request, file: UploadFile = File(...)):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    if not storage.enabled():
        raise _images_unavailable()
    # Cheap refusal first: a full room never pays for a decode.
    if len(await images.list_images(pool, room_id)) >= images.MAX_ROOM_IMAGES:
        raise _room_full()

    data = await file.read(images.MAX_UPLOAD_BYTES + 1)
    try:
        # Decoding is CPU work; off the loop, so the room's relay keeps up.
        webp, width, height = await asyncio.to_thread(images.sanitize, data)
    except images.UnusableImage as refused:
        status = 415 if refused.code == "not_an_image" else 413
        raise HTTPException(status_code=status, detail={"error": refused.code, "message": str(refused)})

    used = await storage_quota.used_bytes(pool, user["id"])
    quota = storage_quota.quota_bytes()
    if used + len(webp) > quota:
        raise HTTPException(status_code=413, detail={
            "error": "storage_quota", "message": "You're out of storage space.",
            "used_mb": round(used / 1024 / 1024, 1), "limit_mb": quota // (1024 * 1024)})

    row = await images.add_image(pool, room_id, width, height, len(webp))
    if row is None:
        raise _room_full()
    try:
        await asyncio.to_thread(storage.put, images.object_path(user["id"], room_id, row["id"]),
                                webp, images.MIME)
    except Exception:  # noqa: BLE001
        logger.exception("[thecommons] storing image %s for room %s failed", row["id"], room_id)
        await images.delete_image(pool, room_id, row["id"])
        raise HTTPException(status_code=502, detail={
            "error": "storage_failed", "message": "The image couldn't be stored. Try again."})
    await _rebroadcast_images(pool, room_id)
    return JSONResponse(status_code=201, content=_image_entry(room_id, row))


@router.put("/api/thecommons/rooms/{room_id}/images/order")
async def reorder_room_images(room_id: int, body: ReorderImagesRequest, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    if not await images.reorder(pool, room_id, body.ids):
        raise HTTPException(status_code=400, detail={
            "error": "wrong_ids", "message": "The order must list every image in this room exactly once."})
    await _rebroadcast_images(pool, room_id)
    return await _images_payload(pool, room_id, user["id"])


@router.get("/api/thecommons/rooms/{room_id}/images/{image_id}")
async def room_image(room_id: int, image_id: int, request: Request):
    """The bytes, for the desk's thumbnails."""
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    if not storage.enabled():
        raise _images_unavailable()
    if await images.get_image(pool, room_id, image_id) is None:
        raise HTTPException(status_code=404, detail="Not found")
    return await _image_bytes(user["id"], room_id, image_id)


@router.delete("/api/thecommons/rooms/{room_id}/images/{image_id}")
async def delete_room_image(room_id: int, image_id: int, request: Request):
    _require_service()
    user = _current_user(request)
    from backend.service import db
    pool = db.pool()
    await _require_owned_room(pool, room_id, user["id"])
    if not await images.delete_image(pool, room_id, image_id):
        raise HTTPException(status_code=404, detail="Not found")
    if storage.enabled():
        try:
            await asyncio.to_thread(storage.delete, images.object_path(user["id"], room_id, image_id))
        except Exception:  # noqa: BLE001 -- the row is gone, so the object is never served again
            logger.exception("[thecommons] image %s's row was deleted but its object was not", image_id)
    await _rebroadcast_images(pool, room_id)
    return Response(status_code=204)


@router.get("/api/thecommons/display/{join_code}/images/{image_id}")
async def display_room_image(join_code: str, image_id: int):
    """The bytes, for the wall, reached by the join code the wall already has.

    Anyone with the join link can reach this, phones included. That is
    accepted: these are the images the room's public wall shows."""
    if not service_mode():
        raise HTTPException(status_code=404, detail="Not found")
    from backend.service import db
    pool = db.pool()
    room = await pool.fetchrow(
        "SELECT id, owner_user_id, status FROM commons_rooms WHERE join_code = $1", join_code)
    if room is None or room["status"] != "active" or not storage.enabled():
        raise HTTPException(status_code=404, detail="Not found")
    if await images.get_image(pool, room["id"], image_id) is None:
        raise HTTPException(status_code=404, detail="Not found")
    return await _image_bytes(room["owner_user_id"], room["id"], image_id)


# ── realtime relay (fully anonymous, room-scoped by join_code) ─────────────

@router.websocket("/ws/thecommons/{join_code}")
async def ws_thecommons(websocket: WebSocket, join_code: str,
                         role: str | None = None, session: str | None = None, table: str | None = None):
    if not service_mode():
        await websocket.close(code=4404)
        return
    from backend.service import db
    pool = db.pool()
    room = await pool.fetchrow("SELECT id, status FROM commons_rooms WHERE join_code = $1", join_code)
    if room is None or room["status"] != "active":
        # Same close code whether the room never existed or was closed — a
        # probe can't distinguish the two, same non-disclosure principle as
        # the HTTP 404s above.
        await websocket.close(code=4404)
        return

    relay = await get_or_create_relay(pool, room["id"])
    await websocket.accept()

    if role == "display":
        await relay.connect_display(websocket)
        try:
            while True:
                await websocket.receive_text()  # displays never send anything meaningful; just keep the socket open
        except WebSocketDisconnect:
            pass
        finally:
            await relay.disconnect_display(websocket)
        return

    person, token = await relay.connect_station(websocket, session, table or "table-1")
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            await relay.handle_message(websocket, person, message)
    except WebSocketDisconnect:
        pass
    finally:
        await relay.disconnect_station(websocket, person, token)
