"""The Commons — per-room generation job / saved-state domain model.

Direct port of TheCommons' server/generation-jobs.js, with local JSON-file
persistence replaced by the two Postgres tables added for Stage 2
(commons_room_jobs, commons_room_state) and the in-memory `active` job
replaced by a DB-backed check (`status = 'generating'`) guarded by a
per-room asyncio.Lock only around the idempotency-check + insert, mirroring
Node's synchronous "if (active) throw" — the lock is what gives that same
atomicity in an async, awaiting world.

A browser request only starts a job; the async worker (`_run_job`) continues
independently, exactly like Node — the prompt and completed result survive
reloads via the DB row, not via an in-memory future.
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
import uuid
from typing import Any, Awaitable, Callable

from backend.service.thecommons_builtin import BUILTIN_SKETCHES
from backend.service.thecommons_templates import load_template_library

logger = logging.getLogger(__name__)

GenerateFn = Callable[..., Awaitable[dict]]

_start_locks: dict[int, asyncio.Lock] = {}
_background_tasks: set[asyncio.Task] = set()


class ActiveJobError(Exception):
    """Another job is already generating in this room."""
    def __init__(self, message: str, job_id: int):
        super().__init__(message)
        self.job_id = job_id


class ConflictError(Exception):
    """409-shaped: the room's state doesn't allow this operation right now."""


class StaleSourceError(Exception):
    """409-shaped: a remix's base_sketch_id no longer matches the live sketch."""


def _lock_for(room_id: int) -> asyncio.Lock:
    lock = _start_locks.get(room_id)
    if lock is None:
        lock = asyncio.Lock()
        _start_locks[room_id] = lock
    return lock


def _decode(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    return json.loads(value)


def _row_to_job(row) -> dict:
    return {
        "id": row["id"], "roomId": row["room_id"], "requestId": str(row["client_request_id"]),
        "status": row["status"], "mode": row["mode"], "prompt": row["prompt"],
        "presetName": row["preset_name"], "baseSketchId": row["base_sketch_id"],
        "source": _decode(row["source"]), "sketch": _decode(row["sketch"]), "values": _decode(row["values"]),
        "applied": row["applied"], "error": row["error"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "finishedAt": row["finished_at"].isoformat() if row["finished_at"] else None,
    }


async def sweep_interrupted_jobs(pool) -> None:
    """Boot-time recovery: a job frozen mid-generation by a restart is honestly
    reported, not silently left 'generating' forever. Matches
    generation-jobs.js's own boot-time replay marking."""
    await pool.execute(
        "UPDATE commons_room_jobs SET status = 'interrupted', "
        "error = 'The server restarted during generation. Your prompt was saved; retry when ready.', "
        "finished_at = now() WHERE status = 'generating'"
    )


async def _active_job_id(pool, room_id: int) -> int | None:
    row = await pool.fetchrow(
        "SELECT id FROM commons_room_jobs WHERE room_id = $1 AND status = 'generating'", room_id)
    return row["id"] if row else None


async def get_room_state(pool, room_id: int) -> dict | None:
    row = await pool.fetchrow(
        "SELECT sketch, values, undo FROM commons_room_state WHERE room_id = $1", room_id)
    if row is None:
        return None
    return {"sketch": _decode(row["sketch"]), "values": _decode(row["values"]) or {}, "undo": _decode(row["undo"])}


async def get_job(pool, room_id: int, job_id: int) -> dict | None:
    row = await pool.fetchrow(
        "SELECT * FROM commons_room_jobs WHERE id = $1 AND room_id = $2", job_id, room_id)
    return _row_to_job(row) if row else None


async def get_active_job(pool, room_id: int) -> dict | None:
    row = await pool.fetchrow(
        "SELECT * FROM commons_room_jobs WHERE room_id = $1 AND status = 'generating' ORDER BY id DESC LIMIT 1",
        room_id)
    return _row_to_job(row) if row else None


async def list_presets(pool, room_id: int) -> list[dict]:
    """Own saved looks/generated pieces (excluding fallbacks), plus the shared
    builtin and inherited pools — same three-source concat as index.js today."""
    rows = await pool.fetch(
        "SELECT id, sketch, values, preset_name, status, finished_at FROM commons_room_jobs "
        "WHERE room_id = $1 AND status IN ('completed', 'preset') ORDER BY finished_at DESC",
        room_id)
    own = []
    for r in rows:
        sketch = _decode(r["sketch"])
        if not sketch or sketch.get("fallback"):
            continue
        own.append({
            "id": str(r["id"]), "name": r["preset_name"] or sketch.get("name"),
            "kind": "Saved looks" if r["status"] == "preset" else "Generated pieces",
            "savedAt": r["finished_at"].isoformat() if r["finished_at"] else None,
            "sketch": sketch, "values": _decode(r["values"]) or {},
        })
    builtins = [{"id": f"builtin-{i}", "name": s["name"], "kind": "Built-in pieces", "sketch": s}
                for i, s in enumerate(BUILTIN_SKETCHES)]
    inherited = [{"id": f"inherited-{t['id']}", "name": t["name"], "kind": "Inherited library", "sketch": t}
                 for t in load_template_library()]
    return [*own, *builtins, *inherited]


async def _settle_charge(charge, model_answered: bool) -> None:
    """Commit or refund the reservation taken at job start.

    The charge stands whenever the model actually answered — that response
    was billed by Google whether or not we could use it, and "the model
    replied with something unusable" is the one outcome a user could provoke
    on purpose, so refunding it would fund unlimited retries on the
    operator's key. Everything else (no key, rejected input, transport
    failure) refunds in full: nothing chargeable happened.

    Settlement failures are logged, never raised — mirroring credits.py's own
    charged.__aexit__, which does the same so a bookkeeping hiccup can't take
    down the work it was accounting for.
    """
    if charge is None:
        return
    try:
        if model_answered:
            await charge.settle_ok()
        else:
            await charge.settle_refund("no_model_response")
    except Exception:
        logger.exception("[thecommons] credit settlement failed (gen_id=%s)",
                         getattr(charge, "gen_id", None))


def _has_trigger(sketch: dict | None) -> bool:
    return any((v or {}).get("type") == "trigger" for v in (sketch or {}).get("variables") or [])


async def start(pool, relay, room_id: int, prompt: str, request_id: str, *,
                 mode: str = "create", base_sketch_id: str | None = None,
                 generate: GenerateFn, charge=None, interactive: bool = False) -> dict:
    if mode not in ("create", "remix"):
        raise ValueError("mode must be create or remix")
    try:
        req_uuid = uuid.UUID(str(request_id))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("invalid remix request ID")
    if not prompt or len(prompt) > 2000:
        raise ValueError("prompt must be text between 1 and 2000 characters")

    async with _lock_for(room_id):
        existing = await pool.fetchrow(
            "SELECT * FROM commons_room_jobs WHERE room_id = $1 AND client_request_id = $2",
            room_id, req_uuid)
        if existing is not None:
            if existing["prompt"] != prompt or existing["mode"] != mode:
                raise ValueError("request ID belongs to another prompt or mode")
            return _row_to_job(existing)

        active_id = await _active_job_id(pool, room_id)
        if active_id is not None:
            raise ActiveJobError("The room already has a remix in progress.", active_id)

        before_sketch = relay.current_sketch
        if mode == "remix" and (not before_sketch or (base_sketch_id and base_sketch_id != before_sketch.get("id"))):
            raise StaleSourceError("The piece changed. Review the current canvas before remixing.")
        before_values = dict(relay.values)
        source = {"sketch": before_sketch, "values": before_values} if mode == "remix" else None

        # Remixing a piece that already has triggers forces the interactive
        # prompt regardless of what the client asked for. Otherwise the model
        # would never be told triggers exist and would quietly return a sketch
        # without them — the buttons would vanish with nothing to explain it.
        # Decided here, under the room lock, where before_sketch can't change.
        if mode == "remix" and _has_trigger(before_sketch):
            interactive = True

        # Reserve LAST, once every rejection path above is cleared and this
        # call is definitely going to dispatch — so an idempotent replay, a
        # busy room, or a stale remix can never silently burn credits, and no
        # refund-on-rejection dance is needed. Still inside the room lock, so
        # the reserve and the insert can't interleave with a second request.
        # Raises HTTPException(402) when the owner is short, which is the
        # suite's own convention (credits.py raises it from the service
        # layer too).
        if charge is not None:
            await charge.reserve()

        row = await pool.fetchrow(
            "INSERT INTO commons_room_jobs (room_id, client_request_id, status, mode, prompt, source, generation_id) "
            "VALUES ($1, $2, 'generating', $3, $4, $5::jsonb, $6) RETURNING *",
            room_id, req_uuid, mode, prompt, json.dumps(source) if source is not None else None,
            getattr(charge, "gen_id", None),
        )

    task = asyncio.create_task(
        _run_job(pool, relay, room_id, row["id"], prompt, mode, before_sketch, before_values,
                 generate, charge, interactive))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return _row_to_job(row)


async def _run_job(pool, relay, room_id: int, job_id: int, prompt: str, mode: str,
                    before_sketch: dict | None, before_values: dict, generate: GenerateFn,
                    charge=None, interactive: bool = False) -> None:
    sketch = None
    try:
        source = {"sketch": before_sketch, "values": before_values} if mode == "remix" else None
        sketch = await generate(prompt, mode=mode, source=source, interactive=interactive)
        status = "fallback" if sketch.get("fallback") else "completed"
        # Applied only if the room's live sketch is still the exact object this
        # job started against — a reference-identity check, matching Node's
        # `getSketch() === before`. Nothing else can change relay.current_sketch
        # mid-job: load_preset/undo both refuse to run while a job is active.
        applied = relay.current_sketch is before_sketch
        values = None
        if applied:
            values = before_values if (mode == "remix" and not sketch.get("fallback")) else {}
        await pool.execute(
            "UPDATE commons_room_jobs SET status = $1, sketch = $2::jsonb, values = $3::jsonb, "
            "applied = $4, finished_at = now() WHERE id = $5",
            status, json.dumps(sketch), json.dumps(values) if values is not None else None, applied, job_id,
        )
        if applied:
            undo_snapshot = {"sketch": before_sketch, "values": before_values} if before_sketch else None
            await pool.execute(
                "INSERT INTO commons_room_state (room_id, sketch, values, undo, updated_at) "
                "VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, now()) "
                "ON CONFLICT (room_id) DO UPDATE SET sketch = EXCLUDED.sketch, values = EXCLUDED.values, "
                "undo = EXCLUDED.undo, updated_at = now()",
                room_id, json.dumps(sketch), json.dumps(values),
                json.dumps(undo_snapshot) if undo_snapshot is not None else None,
            )
            await relay.publish(sketch, values)
    except Exception:
        await pool.execute(
            "UPDATE commons_room_jobs SET status = 'failed', error = $1, applied = FALSE, finished_at = now() "
            "WHERE id = $2",
            "Could not finish and save the remix. Your prompt is retained; try again.", job_id,
        )
    finally:
        # generate() is documented never to raise (it returns a tagged
        # fallback instead), so a None sketch here means our own bookkeeping
        # blew up before one existed — refund, since we can't attest the
        # model answered.
        await _settle_charge(charge, bool(sketch and sketch.get("modelAnswered")))


async def undo(pool, relay, room_id: int) -> dict:
    if await _active_job_id(pool, room_id) is not None:
        raise ConflictError("Wait for the current generation to finish before undoing.")
    state = await get_room_state(pool, room_id)
    if not state or not state["undo"]:
        raise ConflictError("There is no previous piece to restore.")
    snapshot = state["undo"]
    values = snapshot.get("values") or {}
    await pool.execute(
        "UPDATE commons_room_state SET sketch = $1::jsonb, values = $2::jsonb, undo = NULL, updated_at = now() "
        "WHERE room_id = $3",
        json.dumps(snapshot["sketch"]), json.dumps(values), room_id,
    )
    await relay.publish(snapshot["sketch"], values)
    return snapshot["sketch"]


async def save_preset(pool, relay, room_id: int, name: str | None) -> int:
    sketch = relay.current_sketch
    if not sketch:
        raise ConflictError("There is no piece to save.")
    if name is not None and (not isinstance(name, str) or len(name.strip()) > 100):
        raise ValueError("Use a preset name of up to 100 characters.")
    values = dict(relay.values)
    preset_sketch = {**sketch, "fallback": False}
    row = await pool.fetchrow(
        "INSERT INTO commons_room_jobs (room_id, client_request_id, status, mode, prompt, preset_name, "
        "sketch, values, applied, finished_at) "
        "VALUES ($1, $2, 'preset', 'create', '', $3, $4::jsonb, $5::jsonb, TRUE, now()) RETURNING id",
        room_id, uuid.uuid4(), (name or sketch.get("name") or "").strip() or sketch.get("name"),
        json.dumps(preset_sketch), json.dumps(values),
    )
    return row["id"]


async def load_preset(pool, relay, room_id: int, sketch: dict, values: dict | None = None) -> dict:
    if await _active_job_id(pool, room_id) is not None:
        raise ConflictError("Wait for the current generation to finish before loading a preset.")
    values = values or {}
    before_sketch = relay.current_sketch
    before_values = dict(relay.values)
    next_sketch = {**sketch, "id": secrets.token_hex(4)}
    undo_snapshot = {"sketch": before_sketch, "values": before_values} if before_sketch else None
    await pool.execute(
        "INSERT INTO commons_room_state (room_id, sketch, values, undo, updated_at) "
        "VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, now()) "
        "ON CONFLICT (room_id) DO UPDATE SET sketch = EXCLUDED.sketch, values = EXCLUDED.values, "
        "undo = EXCLUDED.undo, updated_at = now()",
        room_id, json.dumps(next_sketch), json.dumps(values),
        json.dumps(undo_snapshot) if undo_snapshot is not None else None,
    )
    await relay.publish(next_sketch, values)
    return next_sketch
