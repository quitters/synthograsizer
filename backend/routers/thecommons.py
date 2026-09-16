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

import json
import logging
import secrets

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.service import service_mode
from backend.service import thecommons_jobs as jobs
from backend.service.thecommons_generate import generate_sketch
from backend.service.thecommons_relay import get_or_create_relay

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


def _room_summary(row) -> dict:
    return {
        "id": row["id"], "name": row["name"], "joinCode": row["join_code"], "status": row["status"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
    }


# ── request bodies ──────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    name: str | None = None


class SavePresetRequest(BaseModel):
    name: str | None = None


class LoadPresetRequest(BaseModel):
    presetId: str


class GenerateRequest(BaseModel):
    roomId: int
    prompt: str
    requestId: str
    mode: str = "create"
    baseSketchId: str | None = None


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
        "canUndo": bool(state and state.get("undo")) and active_job is None,
        "activeJobId": active_job["id"] if active_job else None,
    }


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
    return {"presets": [
        {"id": p["id"], "name": p["name"], "kind": p["kind"], "savedAt": p.get("savedAt")} for p in presets
    ]}


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
    try:
        job = await jobs.start(
            pool, relay, body.roomId, body.prompt, body.requestId,
            mode=body.mode, base_sketch_id=body.baseSketchId, generate=generate_sketch,
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
