"""Job/room-state domain model tests — backend/service/thecommons_jobs.py.

Exercises the service layer directly (no HTTP, no auth) against
FakeCommonsPool and a real RoomRelay, with test-controlled `generate`
callables standing in for thecommons_generate.generate_sketch — the same
injection seam generation-jobs.js itself uses, so these tests can control
exactly what a "model call" returns without touching the real fallback pool.
"""

import asyncio
import json
import uuid

import pytest

from backend.service import thecommons_jobs as jobs
from backend.service.thecommons_relay import RoomRelay

from tests.test_thecommons_rooms import FakeCommonsPool


def _seeded_relay(room_id: int, sketch_id="base-1") -> RoomRelay:
    relay = RoomRelay(room_id)
    relay.set_sketch({"id": sketch_id, "name": "Base", "variables": [
        {"name": "a", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
    ]}, {})
    return relay


async def _ok_generate(name="Generated"):
    async def gen(prompt, *, mode="create", source=None):
        return {"id": f"gen-{name}", "name": name, "fallback": False, "variables": [
            {"name": "a", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
        ]}
    return gen


@pytest.fixture(autouse=True)
def reset_start_locks():
    jobs._start_locks.clear()
    yield
    jobs._start_locks.clear()


# ── idempotency + concurrency ────────────────────────────────────────────────

def test_start_is_idempotent_on_request_id_prompt_and_mode():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1)
        req_id = str(uuid.uuid4())
        gen = await _ok_generate()
        job1 = await jobs.start(pool, relay, 1, "make art", req_id, generate=gen)
        job2 = await jobs.start(pool, relay, 1, "make art", req_id, generate=gen)
        assert job1["id"] == job2["id"]
        assert len(pool.room_jobs) == 1
    asyncio.run(body())


def test_start_rejects_replay_with_different_prompt():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1)
        req_id = str(uuid.uuid4())
        gen = await _ok_generate()
        await jobs.start(pool, relay, 1, "make art", req_id, generate=gen)
        with pytest.raises(ValueError):
            await jobs.start(pool, relay, 1, "different prompt", req_id, generate=gen)
    asyncio.run(body())


def test_second_concurrent_job_in_same_room_is_rejected():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1)

        async def never_finishes(prompt, *, mode="create", source=None):
            await asyncio.sleep(10)
            return {"id": "x", "name": "x", "fallback": False, "variables": []}

        first = await jobs.start(pool, relay, 1, "prompt one", str(uuid.uuid4()), generate=never_finishes)
        with pytest.raises(jobs.ActiveJobError) as exc_info:
            await jobs.start(pool, relay, 1, "prompt two", str(uuid.uuid4()), generate=never_finishes)
        assert exc_info.value.job_id == first["id"]
        # Clean up the still-pending background task.
        for task in list(jobs._background_tasks):
            task.cancel()
        await asyncio.sleep(0)
    asyncio.run(body())


def test_two_rooms_run_active_jobs_simultaneously():
    async def body():
        pool = FakeCommonsPool()
        relay1, relay2 = _seeded_relay(1), _seeded_relay(2)

        async def never_finishes(prompt, *, mode="create", source=None):
            await asyncio.sleep(10)
            return {"id": "x", "name": "x", "fallback": False, "variables": []}

        job1 = await jobs.start(pool, relay1, 1, "room one", str(uuid.uuid4()), generate=never_finishes)
        job2 = await jobs.start(pool, relay2, 2, "room two", str(uuid.uuid4()), generate=never_finishes)
        assert job1["id"] != job2["id"]
        assert job1["status"] == job2["status"] == "generating"
        for task in list(jobs._background_tasks):
            task.cancel()
        await asyncio.sleep(0)
    asyncio.run(body())


def test_stale_remix_base_sketch_id_is_rejected():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1, sketch_id="current-1")
        gen = await _ok_generate()
        with pytest.raises(jobs.StaleSourceError):
            await jobs.start(pool, relay, 1, "remix it", str(uuid.uuid4()),
                              mode="remix", base_sketch_id="stale-id", generate=gen)
    asyncio.run(body())


# ── completion / apply ───────────────────────────────────────────────────────

def test_completed_job_applies_and_publishes_to_its_own_room_only():
    async def body():
        pool = FakeCommonsPool()
        relay1, relay2 = _seeded_relay(1), _seeded_relay(2)
        gen = await _ok_generate("RoomOnePiece")
        await jobs.start(pool, relay1, 1, "make it", str(uuid.uuid4()), generate=gen)
        await asyncio.sleep(0.05)  # let the background task complete
        assert relay1.current_sketch["name"] == "RoomOnePiece"
        assert relay2.current_sketch["name"] == "Base"  # untouched
        state1 = await jobs.get_room_state(pool, 1)
        state2 = await jobs.get_room_state(pool, 2)
        assert state1["sketch"]["name"] == "RoomOnePiece"
        assert state2 is None  # room 2 was never written to
    asyncio.run(body())


def test_failed_generation_marks_job_failed_without_touching_room_state():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1)

        async def boom(prompt, *, mode="create", source=None):
            raise RuntimeError("provider exploded")

        job = await jobs.start(pool, relay, 1, "make it", str(uuid.uuid4()), generate=boom)
        await asyncio.sleep(0.05)
        row = await jobs.get_job(pool, 1, job["id"])
        assert row["status"] == "failed"
        assert relay.current_sketch["name"] == "Base"
    asyncio.run(body())


# ── undo / presets ───────────────────────────────────────────────────────────

def test_undo_restores_previous_sketch_then_clears_the_slot():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1)
        gen = await _ok_generate("NewPiece")
        await jobs.start(pool, relay, 1, "make it", str(uuid.uuid4()), generate=gen)
        await asyncio.sleep(0.05)
        assert relay.current_sketch["name"] == "NewPiece"

        restored = await jobs.undo(pool, relay, 1)
        assert restored["name"] == "Base"
        assert relay.current_sketch["name"] == "Base"

        with pytest.raises(jobs.ConflictError):
            await jobs.undo(pool, relay, 1)  # undo slot is now empty
    asyncio.run(body())


def test_undo_blocked_while_a_job_is_active():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1)

        async def never_finishes(prompt, *, mode="create", source=None):
            await asyncio.sleep(10)
            return {"id": "x", "name": "x", "fallback": False, "variables": []}

        await jobs.start(pool, relay, 1, "prompt", str(uuid.uuid4()), generate=never_finishes)
        with pytest.raises(jobs.ConflictError):
            await jobs.undo(pool, relay, 1)
        for task in list(jobs._background_tasks):
            task.cancel()
        await asyncio.sleep(0)
    asyncio.run(body())


def test_save_and_load_preset_round_trip():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1)
        preset_id = await jobs.save_preset(pool, relay, 1, "My look")
        assert isinstance(preset_id, int)

        presets = await jobs.list_presets(pool, 1)
        own = [p for p in presets if p["id"] == str(preset_id)]
        assert len(own) == 1 and own[0]["name"] == "My look" and own[0]["kind"] == "Saved looks"

        # Change the live sketch, then load the preset back.
        relay.set_sketch({"id": "other", "name": "Other", "variables": []}, {})
        loaded = await jobs.load_preset(pool, relay, 1, own[0]["sketch"], own[0]["values"])
        assert loaded["name"] == "Base"
        assert relay.current_sketch["name"] == "Base"
    asyncio.run(body())


def test_load_preset_blocked_while_a_job_is_active():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1)

        async def never_finishes(prompt, *, mode="create", source=None):
            await asyncio.sleep(10)
            return {"id": "x", "name": "x", "fallback": False, "variables": []}

        await jobs.start(pool, relay, 1, "prompt", str(uuid.uuid4()), generate=never_finishes)
        with pytest.raises(jobs.ConflictError):
            await jobs.load_preset(pool, relay, 1, {"id": "z", "name": "Z", "variables": []}, {})
        for task in list(jobs._background_tasks):
            task.cancel()
        await asyncio.sleep(0)
    asyncio.run(body())


def test_cross_room_job_read_is_not_found():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1)
        gen = await _ok_generate()
        job = await jobs.start(pool, relay, 1, "make it", str(uuid.uuid4()), generate=gen)
        await asyncio.sleep(0.05)
        # Reading room 1's job as if it belonged to room 2 must fail.
        assert await jobs.get_job(pool, 2, job["id"]) is None
    asyncio.run(body())


# ── boot-time recovery ───────────────────────────────────────────────────────

def test_sweep_marks_orphaned_generating_jobs_interrupted():
    async def body():
        pool = FakeCommonsPool()
        relay = _seeded_relay(1)

        async def never_finishes(prompt, *, mode="create", source=None):
            await asyncio.sleep(10)
            return {"id": "x", "name": "x", "fallback": False, "variables": []}

        job = await jobs.start(pool, relay, 1, "prompt", str(uuid.uuid4()), generate=never_finishes)
        for task in list(jobs._background_tasks):
            task.cancel()  # simulate the process dying mid-generation
        await asyncio.sleep(0)

        await jobs.sweep_interrupted_jobs(pool)
        row = await jobs.get_job(pool, 1, job["id"])
        assert row["status"] == "interrupted"
        assert "restarted" in row["error"]
    asyncio.run(body())
