"""Pure unit tests for RoomRelay — the ported balancing/hold/broadcast logic.

No Postgres, no websockets, no pytest-asyncio (not a suite dependency): async
code is driven with asyncio.run(), matching test_service_db_migrate.py's own
convention. These call RoomRelay's methods directly, the same "test the pure
logic directly" approach that file uses for _migrate().
"""

import asyncio

import pytest

from backend.service.thecommons_relay import HostControlError, RoomRelay


class FakeSocket:
    def __init__(self, name="ws"):
        self.name = name
        self.sent: list[dict] = []

    async def send_json(self, message):
        self.sent.append(message)


def _sketch(n_numeric=0, n_select=0, select_choices=("x", "y", "z")):
    variables = []
    for i in range(n_numeric):
        variables.append({"name": f"num{i}", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5})
    for i in range(n_select):
        variables.append({"name": f"sel{i}",
                           "values": [{"text": c, "weight": 1} for c in select_choices]})
    return {"id": "s1", "name": "Test", "variables": variables}


async def _add_station(relay: RoomRelay, table: str) -> tuple:
    ws = FakeSocket(table)
    person, token = await relay.connect_station(ws, None, table)
    return ws, person, token


# ── distribute(): enough controls for everyone ──────────────────────────────

def test_distribute_one_owner_per_control_when_controls_exceed_people():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_numeric=3), {})
        await _add_station(relay, "t1")
        await _add_station(relay, "t2")
        counts = [len(g) for g in relay.assigned.values()]
        assert all(c == 1 for c in counts)  # 3 controls, 2 people → each control has exactly one owner
        people_owning = {p for group in relay.assigned.values() for p in group}
        assert len(people_owning) == 2  # both people own at least one control
    asyncio.run(body())


def test_distribute_balances_within_one_when_people_exceed_controls():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_numeric=1, n_select=2), {})  # 3 controls
        for i in range(5):
            await _add_station(relay, f"t{i}")
        counts = [len(g) for g in relay.assigned.values()]
        assert max(counts) - min(counts) <= 1
        assert sum(counts) == 5  # every person owns exactly one control
        for group in relay.assigned.values():
            assert len(group) == len(set(id(p) for p in group))  # no duplicate owner in one group
    asyncio.run(body())


def test_distribute_prunes_departed_participant():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_numeric=2), {})
        ws1, p1, t1 = await _add_station(relay, "t1")
        await _add_station(relay, "t2")
        del relay.participants[t1]
        relay.distribute()
        for group in relay.assigned.values():
            assert p1 not in group
    asyncio.run(body())


def test_distribute_prunes_control_removed_by_new_sketch():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_numeric=2), {})
        await _add_station(relay, "t1")
        assert set(relay.assigned.keys()) == {"num0", "num1"}
        relay.set_sketch(_sketch(n_numeric=1), {})
        assert set(relay.assigned.keys()) == {"num0"}
    asyncio.run(body())


# ── apply_var_update() ───────────────────────────────────────────────────────

def test_not_owner_gets_directed_reply_only():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_numeric=1, n_select=1), {})  # 2 controls
        ws1, p1, _ = await _add_station(relay, "t1")
        ws2, p2, _ = await _add_station(relay, "t2")
        owned_by_p1 = [name for name, g in relay.assigned.items() if p1 in g][0]
        not_owned_by_p1 = [name for name in relay.assigned if name != owned_by_p1][0]
        items = relay.apply_var_update(ws1, p1, not_owned_by_p1, "anything")
        assert len(items) == 1
        target, message = items[0]
        assert target is ws1
        assert message["type"] == "not_owner"
    asyncio.run(body())


def test_invalid_value_is_silently_dropped():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_numeric=1), {})
        ws1, p1, _ = await _add_station(relay, "t1")
        items = relay.apply_var_update(ws1, p1, "num0", 999)  # out of [0,10] range
        assert items == []
        assert relay.values["num0"] == 5  # unchanged (the sketch default)
    asyncio.run(body())


def test_invalid_choice_is_silently_dropped():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_select=1), {})
        ws1, p1, _ = await _add_station(relay, "t1")
        items = relay.apply_var_update(ws1, p1, "sel0", "not-a-real-choice")
        assert items == []
    asyncio.run(body())


def test_numeric_update_snaps_and_broadcasts_to_everyone():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_numeric=1), {})
        display = FakeSocket("display")
        await relay.connect_display(display)
        ws1, p1, _ = await _add_station(relay, "t1")
        items = relay.apply_var_update(ws1, p1, "num0", 7.4)  # step=1 → snaps to 7
        assert len(items) == 1
        target, message = items[0]
        assert target == "all"
        assert message["type"] == "var" and message["value"] == 7
        await relay._send_all(None, items)
        assert any(m["type"] == "var" and m["value"] == 7 for m in display.sent)
    asyncio.run(body())


# ── the 4-second held turn ───────────────────────────────────────────────────

def test_hold_blocks_other_assigned_owner_but_not_the_holder():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_select=1, select_choices=("x", "y", "z")), {})  # 1 control
        ws1, p1, _ = await _add_station(relay, "t1")
        ws2, p2, _ = await _add_station(relay, "t2")
        name = next(iter(relay.assigned))
        assert set(relay.assigned[name]) == {p1, p2}  # 1 control, 2 people → shared

        relay.apply_var_update(ws1, p1, name, "y")  # p1 takes the hold
        items = relay.apply_var_update(ws2, p2, name, "z")  # p2 tries to steal it immediately
        assert len(items) == 1 and items[0][1]["type"] == "held"

        items = relay.apply_var_update(ws1, p1, name, "z")  # the holder can keep updating
        assert len(items) == 1 and items[0][1]["type"] == "var"
    asyncio.run(body())


def test_hold_expires_and_allows_steal():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_select=1), {})
        ws1, p1, _ = await _add_station(relay, "t1")
        ws2, p2, _ = await _add_station(relay, "t2")
        name = next(iter(relay.assigned))
        relay.apply_var_update(ws1, p1, name, "y")
        # Force the hold into the past instead of sleeping 4 real seconds.
        relay.holds[name].until = 0
        items = relay.apply_var_update(ws2, p2, name, "z")
        assert items[0][1]["type"] == "var"
    asyncio.run(body())


# ── telemetry ────────────────────────────────────────────────────────────────

def test_telemetry_counts_changes_per_table():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_sketch(n_numeric=1), {})
        ws1, p1, _ = await _add_station(relay, "table-9")
        relay.apply_var_update(ws1, p1, "num0", 3)
        relay.apply_var_update(ws1, p1, "num0", 4)
        telemetry = relay.get_telemetry()
        assert telemetry["changesByTable"]["table-9"] == 2
        assert "table-9" in telemetry["activeTables"]
    asyncio.run(body())


# ── toggle ───────────────────────────────────────────────────────────────────

def _toggle_sketch(default=True):
    return {"id": "s1", "name": "Test", "variables": [
        {"name": "trails", "label": "Trails", "type": "toggle", "default": default}]}


def test_toggle_seeds_from_its_default_and_from_a_saved_look():
    relay = RoomRelay(room_id=1)
    relay.set_sketch(_toggle_sketch(default=True), {})
    assert relay.values["trails"] is True
    relay.set_sketch(_toggle_sketch(default=True), {"trails": False})  # False is a real value, not "missing"
    assert relay.values["trails"] is False
    relay.set_sketch(_toggle_sketch(default=True), {"trails": "no"})    # junk falls back to the default
    assert relay.values["trails"] is True


def test_toggle_update_accepts_only_a_real_boolean():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_toggle_sketch(default=True), {})
        ws1, p1, _ = await _add_station(relay, "t1")
        for junk in ("false", 0, 1, None, [], {}):
            assert relay.apply_var_update(ws1, p1, "trails", junk) == []
        assert relay.values["trails"] is True
        items = relay.apply_var_update(ws1, p1, "trails", False)
        assert items and items[0][1]["type"] == "var" and items[0][1]["value"] is False
        assert relay.values["trails"] is False
    asyncio.run(body())


# ── host-only controls ───────────────────────────────────────────────────────

def _host_sketch():
    return {"id": "s1", "name": "Test", "variables": [
        {"name": "speed", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
        {"name": "mound", "type": "number", "min": 1, "max": 9999, "step": 1, "default": 1, "access": "host"},
        {"name": "wander", "type": "toggle", "default": False, "access": "host"},
        {"name": "reset", "type": "trigger", "share": "one", "access": "host"},
    ]}


def test_host_controls_are_never_handed_to_a_phone():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_host_sketch(), {})
        for i in range(6):
            await _add_station(relay, f"t{i}")
        assert set(relay.assigned) == {"speed"}
        assert relay.values["mound"] == 1 and relay.values["wander"] is False
    asyncio.run(body())


def test_a_phone_can_never_set_or_fire_a_host_control():
    async def body():
        relay = RoomRelay(room_id=1)
        relay.set_sketch(_host_sketch(), {})
        ws1, p1, _ = await _add_station(relay, "t1")
        assert relay.apply_var_update(ws1, p1, "mound", 42) == []
        assert relay.apply_var_update(ws1, p1, "wander", True) == []
        assert relay.apply_trigger(ws1, p1, "reset") == []
        assert relay.values["mound"] == 1 and relay.values["wander"] is False
    asyncio.run(body())


def test_the_host_sets_its_controls_through_the_same_gate():
    relay = RoomRelay(room_id=1)
    relay.set_sketch(_host_sketch(), {})
    items = relay.apply_host_update("mound", 42.4)            # snaps like any number
    assert items == [("all", {"type": "var", "varName": "mound", "value": 42,
                              "table": "host", "participantId": "host"})]
    assert relay.values["mound"] == 42
    relay.apply_host_update("wander", True)
    assert relay.values["wander"] is True
    for name, bad, code in (("mound", 0, "invalid"), ("wander", "yes", "invalid"), ("speed", 3, "unknown"),
                            ("ghost", 1, "unknown"), ("reset", 1, "invalid")):
        with pytest.raises(HostControlError) as err:
            relay.apply_host_update(name, bad)
        assert err.value.code == code
    assert relay.host_controls()["values"] == {"mound": 42, "wander": True}


def test_the_host_fires_its_trigger_as_host():
    relay = RoomRelay(room_id=1)
    relay.set_sketch(_host_sketch(), {})
    assert relay.apply_host_trigger("reset") == [("all", {"type": "event", "name": "reset",
                                                          "participantId": "host", "table": "host"})]
    with pytest.raises(HostControlError):
        relay.apply_host_trigger("mound")


def test_the_host_has_a_rate_limit_of_its_own():
    relay = RoomRelay(room_id=1)
    relay.set_sketch(_host_sketch(), {})
    sent = 0
    with pytest.raises(HostControlError) as err:
        for i in range(100):
            relay.apply_host_update("mound", 1 + i)
            sent += 1
    assert err.value.code == "busy" and 15 <= sent <= 25

