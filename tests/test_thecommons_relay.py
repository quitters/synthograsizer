"""Pure unit tests for RoomRelay — the ported balancing/hold/broadcast logic.

No Postgres, no websockets, no pytest-asyncio (not a suite dependency): async
code is driven with asyncio.run(), matching test_service_db_migrate.py's own
convention. These call RoomRelay's methods directly, the same "test the pure
logic directly" approach that file uses for _migrate().
"""

import asyncio

from backend.service.thecommons_relay import RoomRelay


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
