"""Room images, part 4: asking the generator for a piece that uses them.

The host ticks "Use this room's images"; the job passes the room's images (the
uploads, or the samples when there are none) to the generator; the generator
adds the image rules to its system prompt and their sizes to the request. A
remix of a piece that already uses images keeps using them.
"""

import asyncio
import json
import uuid

from fastapi.testclient import TestClient

import backend.server as server
from backend.routers import thecommons as router
from backend.service import thecommons_generate as gen
from backend.service import thecommons_jobs as jobs
from backend.service.thecommons_images import DEFAULT_IMAGES
from backend.service.thecommons_relay import RoomRelay
from backend.service.thecommons_ui import PANEL_PROMPT, panel_request

from tests.test_service_auth import _fake_user
from tests.test_service_credits import _sign_in
from tests.test_thecommons_generate import VALID_SKETCH_JSON, _stub_calls, gemini_configured  # noqa: F401
from tests.test_thecommons_rooms import (  # noqa: F401  (fixtures)
    FakeCommonsPool, fake_pool, reset_thecommons_registries, service_on,
)

client = TestClient(server.app, raise_server_exceptions=False)

SAMPLES = [{"width": d["width"], "height": d["height"], "default": True} for d in DEFAULT_IMAGES]


# ── the prompt ───────────────────────────────────────────────────────────────

def test_the_image_rules_reach_the_model_only_when_asked():
    ambient, with_images = gen.system_prompt(), gen.system_prompt(images=True)
    assert "room.images" not in ambient and "room.images" not in gen.SYSTEM_PROMPT
    assert with_images.startswith(ambient.split("- Respond with ONLY")[0])
    assert "ROOM IMAGES" in with_images
    for rule in ("EMPTY for a moment", "REPLACED", "img.thumb", "keyed by img.id", "cannot see the images",
                 "never call close()"):
        assert rule in with_images, rule
    both = gen.system_prompt(interactive=True, images=True)
    assert "INTERACTIVE ACTIONS" in both and "ROOM IMAGES" in both
    assert "ROOM IMAGES" not in gen.system_prompt(interactive=True)


def test_the_request_says_how_many_images_and_what_shapes():
    line = gen.images_line(SAMPLES)
    assert "3 images (1920x1080, 1080x1440, 1024x1024)" in line and "sample images" in line
    uploads = [{"width": 800, "height": 600, "default": False}]
    assert "1 image (800x600), uploaded by the host" in gen.images_line(uploads)
    assert gen.images_line(None) == gen.images_line([]) == ""


def test_both_create_and_remix_requests_carry_the_images():
    assert gen.generation_prompt("drift", images=SAMPLES).startswith("drift\n\nROOM IMAGES RIGHT NOW: 3 images")
    assert gen.generation_prompt("drift") == "drift"
    source = {"sketch": {"name": "x", "code": "ctx.fillRect(0,0,1,1)", "variables": []}, "values": {}}
    remix = gen.generation_prompt("bluer", mode="remix", source=source, images=SAMPLES)
    assert remix.endswith(gen.images_line(SAMPLES)) and "USER CHANGE REQUEST:\nbluer" in remix


def test_a_generation_with_images_asks_with_the_image_rules(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, ["not json", VALID_SKETCH_JSON])   # forces the repair pass too
    asyncio.run(gen.generate_sketch("floating prints", images=SAMPLES))
    assert len(calls) == 2
    for call in calls:                                   # the repair asks under the same rules
        assert "ROOM IMAGES" in call["system_instruction"]
    assert "1920x1080" in calls[0]["blocks"][0]["text"]


def test_a_generation_without_images_is_unchanged(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, [VALID_SKETCH_JSON])
    asyncio.run(gen.generate_sketch("floating prints"))
    assert calls[0]["system_instruction"] == gen.SYSTEM_PROMPT
    assert calls[0]["blocks"][0]["text"] == "floating prints"


def test_the_panel_designer_hears_that_a_piece_uses_images():
    sketch = {"name": "x", "promptTemplate": "x", "variables": [], "code": "const n = room.images.length;"}
    piece = json.loads(panel_request(sketch, "p").split("PIECE:\n", 1)[1])
    assert piece["usesRoomImages"] is True
    plain = json.loads(panel_request({**sketch, "code": "ctx.fill()"}, "p").split("PIECE:\n", 1)[1])
    assert "usesRoomImages" not in plain
    assert "usesRoomImages" in PANEL_PROMPT and "the room's images" in PANEL_PROMPT


# ── the job ──────────────────────────────────────────────────────────────────

def _recording(seen: list):
    async def generate(prompt, *, mode="create", source=None, interactive=False, **extra):
        seen.append(extra)
        return {"id": "gen-1", "name": "Generated", "fallback": False, "variables": [
            {"name": "a", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5}]}
    return generate


def _relay(code="ctx.fillRect(0, 0, 1, 1);"):
    relay = RoomRelay(1)
    relay.set_sketch({"id": "base-1", "name": "Base", "code": code, "variables": [
        {"name": "a", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5}]}, {})
    return relay


def _start(pool, relay, seen, **kw):
    async def body():
        await jobs.start(pool, relay, 1, "make it", str(uuid.uuid4()), generate=_recording(seen), **kw)
        await asyncio.sleep(0.05)
    asyncio.run(body())


def test_without_the_box_the_generator_is_called_as_it_always_was():
    pool, seen = FakeCommonsPool(), []
    pool.seed_room(owner_user_id=1)
    _start(pool, _relay(), seen)
    assert seen == [{}]


def test_a_room_with_no_uploads_hands_the_generator_the_samples():
    pool, seen = FakeCommonsPool(), []
    pool.seed_room(owner_user_id=1)
    _start(pool, _relay(), seen, use_images=True)
    assert seen == [{"images": SAMPLES}]


def test_a_room_with_uploads_hands_the_generator_those():
    pool, seen = FakeCommonsPool(), []
    pool.seed_room(owner_user_id=1)
    for iid, (w, h) in enumerate([(800, 600), (300, 900)], start=1):
        pool.room_images[iid] = {"id": iid, "room_id": 1, "position": iid, "width": w, "height": h,
                                 "bytes": 1, "created_at": None}
    _start(pool, _relay(), seen, use_images=True)
    assert seen == [{"images": [{"width": 800, "height": 600, "default": False},
                                {"width": 300, "height": 900, "default": False}]}]


def test_remixing_a_piece_that_uses_images_keeps_it_using_them():
    pool, seen = FakeCommonsPool(), []
    pool.seed_room(owner_user_id=1)
    _start(pool, _relay("for (const img of room.images) ctx.drawImage(img.bitmap, 0, 0);"), seen,
           mode="remix", base_sketch_id="base-1", use_images=False)
    assert seen == [{"images": SAMPLES}]


def test_creating_fresh_from_an_image_piece_leaves_the_choice_to_the_host():
    pool, seen = FakeCommonsPool(), []
    pool.seed_room(owner_user_id=1)
    _start(pool, _relay("room.images"), seen, mode="create", use_images=False)
    assert seen == [{}]


# ── the desk's side of it ────────────────────────────────────────────────────

def test_the_desk_asks_through_the_generate_route(service_on, fake_pool, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    seen = {}

    async def fake_start(pool, relay, room, prompt, request_id, **kw):
        seen.update(kw)
        return {"id": 1, "status": "generating"}
    monkeypatch.setattr(router.jobs, "start", fake_start)
    cookies = _sign_in(monkeypatch, _fake_user())
    body = {"roomId": room_id, "prompt": "prints", "requestId": str(uuid.uuid4()), "useImages": True}
    assert client.post("/api/thecommons/generate", json=body, cookies=cookies).status_code == 202
    assert seen["use_images"] is True
    body = {**body, "requestId": str(uuid.uuid4())}
    del body["useImages"]
    client.post("/api/thecommons/generate", json=body, cookies=cookies)
    assert seen["use_images"] is False


def test_the_desk_is_told_whether_the_piece_on_the_wall_uses_images(service_on, fake_pool, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    fake_pool.room_state[room_id] = {"room_id": room_id, "undo": None, "values": {}, "sketch": {
        "id": "s", "name": "Prints", "code": "room.images.forEach(() => {});", "variables": []}}
    cookies = _sign_in(monkeypatch, _fake_user())
    assert client.get(f"/api/thecommons/rooms/{room_id}", cookies=cookies).json()["usesImages"] is True
