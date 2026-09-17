"""Trigger controls, the event broadcast, presence, and the message budget.

Same conventions as test_thecommons_relay.py: no Postgres, no websockets, no
pytest-asyncio — async code is driven with asyncio.run().
"""

import asyncio

from backend.service.thecommons_relay import (
    MSG_BUCKET_CAPACITY,
    RoomRelay,
)
from tests.test_thecommons_relay import FakeSocket, _add_station


def _sketch(*, shared=True, extra_selects=1):
    """One assignable choice plus one trigger, shared or owned."""
    variables = [
        {"name": f"sel{i}", "values": [{"text": t, "weight": 1} for t in ("x", "y", "z")]}
        for i in range(extra_selects)
    ]
    variables.append({"name": "shoot", "label": "Shoot", "type": "trigger",
                       "share": "all" if shared else "one"})
    return {"id": "s1", "name": "Test", "variables": variables}


def _events(ws):
    return [m for m in ws.sent if m.get("type") == "event"]


# ── the trigger itself ──────────────────────────────────────────────────────

def test_shared_trigger_is_fireable_by_anyone_and_reaches_the_display():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(shared=True), {})
        display = FakeSocket("wall")
        await relay.connect_display(display)
        ws_a, person_a, _ = await _add_station(relay, "t1")
        _, person_b, _ = await _add_station(relay, "t2")

        # Neither person owns it — a shared trigger is never assigned at all.
        assert "shoot" not in relay.assigned

        for person, ws in ((person_a, ws_a), (person_b, ws_a)):
            items = relay.apply_trigger(ws, person, "shoot")
            assert items and items[0][0] == "all"
            assert items[0][1]["type"] == "event"
            assert items[0][1]["name"] == "shoot"

        # And it goes out to the wall, not only to the other phones.
        await relay._send_all(None, relay.apply_trigger(ws_a, person_a, "shoot"))
        assert len(_events(display)) == 1
        assert _events(display)[0]["participantId"] == person_a.id
    asyncio.run(body())


def test_owned_trigger_rejects_a_non_owner():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(shared=False), {})
        ws_a, person_a, _ = await _add_station(relay, "t1")
        ws_b, person_b, _ = await _add_station(relay, "t2")

        # share:"one" means it IS assigned, to exactly one of them.
        owner_group = relay.assigned["shoot"]
        assert len(owner_group) == 1
        owner = owner_group[0]
        intruder, intruder_ws = (person_b, ws_b) if owner is person_a else (person_a, ws_a)

        items = relay.apply_trigger(intruder_ws, intruder, "shoot")
        assert len(items) == 1
        target, message = items[0]
        assert target is intruder_ws      # directed reply, not a broadcast
        assert message["type"] == "not_owner"
    asyncio.run(body())


def test_trigger_sets_no_value_and_takes_no_hold():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(shared=True), {})
        ws, person, _ = await _add_station(relay, "t1")
        relay.apply_trigger(ws, person, "shoot")
        # A trigger carries no value, so it must never enter room state — that
        # dict is what gets persisted to commons_room_state.values.
        assert "shoot" not in relay.values
        # And it must not hold: for an action everyone can fire, contention is
        # the point rather than something to serialise.
        assert "shoot" not in relay.holds
    asyncio.run(body())


def test_a_var_message_cannot_set_a_trigger():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(shared=True), {})
        ws, person, _ = await _add_station(relay, "t1")
        assert relay.apply_var_update(ws, person, "shoot", "anything") == []
        assert "shoot" not in relay.values
    asyncio.run(body())


def test_unknown_and_non_trigger_names_are_silently_dropped():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(shared=True), {})
        ws, person, _ = await _add_station(relay, "t1")
        assert relay.apply_trigger(ws, person, "nope") == []
        assert relay.apply_trigger(ws, person, "sel0") == []  # a choice is not fireable
    asyncio.run(body())


# ── distribution ────────────────────────────────────────────────────────────

def test_shared_controls_never_consume_an_assignment_slot():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(shared=True, extra_selects=2), {})
        await _add_station(relay, "t1")
        await _add_station(relay, "t2")
        assert set(relay.assigned) == {"sel0", "sel1"}
        # Two assignable controls, two people → one each, nobody idle.
        assert all(len(g) == 1 for g in relay.assigned.values())
    asyncio.run(body())


def test_only_shared_controls_leaves_nothing_assigned():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch({"id": "s", "name": "T", "variables": [
            {"name": "shoot", "type": "trigger", "share": "all"}]}, {})
        await _add_station(relay, "t1")
        assert relay.assigned == {}
        assert relay.values == {}
    asyncio.run(body())


# ── presence ────────────────────────────────────────────────────────────────

def test_people_is_reported_with_a_stable_hue():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(), {})
        _, person, _ = await _add_station(relay, "t1")
        people = relay.people()
        assert len(people) == 1
        assert people[0]["id"] == person.id
        assert people[0]["table"] == "t1"
        assert 0 <= people[0]["hue"] <= 359
        assert relay.people()[0]["hue"] == people[0]["hue"]  # stable across calls
    asyncio.run(body())


def test_welcome_and_ownership_carry_presence():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(), {})
        ws_a, person_a, _ = await _add_station(relay, "t1")
        welcome = ws_a.sent[0]
        assert welcome["type"] == "welcome"
        assert welcome["people"][0]["id"] == person_a.id
        assert isinstance(welcome["hue"], int)

        await _add_station(relay, "t2")
        ownership = [m for m in ws_a.sent if m.get("type") == "ownership"][-1]
        assert len(ownership["people"]) == 2
    asyncio.run(body())


# ── the per-participant message budget ──────────────────────────────────────

def test_message_budget_drops_a_flood_silently():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(shared=True), {})
        ws, person, _ = await _add_station(relay, "t1")
        display = FakeSocket("wall")
        await relay.connect_display(display)

        # Spend the whole bucket, then keep mashing.
        allowed = 0
        for _ in range(int(MSG_BUCKET_CAPACITY) + 40):
            await relay.handle_message(ws, person, {"type": "trigger", "varName": "shoot"})
        allowed = len(_events(display))

        assert allowed <= MSG_BUCKET_CAPACITY + 1  # refill during the loop is negligible
        assert allowed >= 1                        # but a normal tap still gets through
        # Dropped messages produce no reply of any kind — same as an invalid
        # value. Nothing is sent back to tell a flooder they were throttled.
        assert not [m for m in ws.sent if m.get("type") in ("error", "throttled")]
    asyncio.run(body())


def test_budget_refills_over_time():
    relay = RoomRelay(room_id=1)

    class _P:
        tokens = 0.0
        tokens_at = 0.0

    person = _P()
    import time
    person.tokens = 0.0
    person.tokens_at = time.monotonic() - 1.0  # a full second of refill owed
    assert relay.take_message_token(person) is True


def test_one_participants_flood_does_not_starve_another():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(shared=True), {})
        ws_a, person_a, _ = await _add_station(relay, "t1")
        ws_b, person_b, _ = await _add_station(relay, "t2")
        display = FakeSocket("wall")
        await relay.connect_display(display)

        for _ in range(int(MSG_BUCKET_CAPACITY) + 20):
            await relay.handle_message(ws_a, person_a, {"type": "trigger", "varName": "shoot"})
        before = len(_events(display))
        await relay.handle_message(ws_b, person_b, {"type": "trigger", "varName": "shoot"})
        # The bucket is per participant, so B is unaffected by A exhausting theirs.
        assert len(_events(display)) == before + 1
    asyncio.run(body())
