"""The Commons — per-room real-time relay.

Direct behavioral port of TheCommons' server/relay.js, scoped to one room.
Creator-directed ownership: distribute distinct controls among individuals.
Joining/leaving rebalances the fewest controls needed; values never average.

Design note (see docs/HANDOFF.md's Stage-2 plan): the state-mutating methods
(`distribute`, `apply_var_update`, `set_sketch`) are kept fully synchronous —
no `await` inside them — and return the messages to send rather than sending
them directly. Node's handlers are synchronous JS, so each incoming WS
message or HTTP-triggered publish is one indivisible step per room; keeping
the Python equivalent synchronous preserves that atomicity for free, with no
lock needed, and means two *different* rooms never share any lock or await
point.

Ordering matters for the balancing algorithm's tie-breaks (JS `Set` iterates
in insertion order; Python's built-in `set` does not) — every control's
owner group is therefore a plain `list` used as an order-preserving set
(dedup by membership check), never a `set`.
"""

from __future__ import annotations

import asyncio
import hashlib
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from backend.service.thecommons_parameters import accept_value, default_value

DISCONNECT_GRACE_S = 30.0
HOLD_MS = 4000

# Per-participant flood guard. The station socket is anonymous by design and
# the message loop has no other throttle — client-side coalescing and the 4s
# hold are advisory at best, and a mashable trigger button removes even that.
# Over-limit messages are dropped silently, matching how this module already
# treats an invalid value: no error reply, no new message type.
MSG_BUCKET_CAPACITY = 40.0
MSG_BUCKET_REFILL_PER_S = 40.0
# The host's desk reaches the relay over HTTP, and the suite's own rate limiter
# only covers generation, so the host gets a bucket of its own. Generous for a
# person dragging a knob (the desk coalesces to ~10/s), tight for a runaway loop.
HOST_BUCKET_CAPACITY = 20.0
HOST_BUCKET_REFILL_PER_S = 10.0
HOST = "host"  # participantId and table on everything the host does


class HostControlError(Exception):
    """Why a host change was refused: "unknown", "invalid" or "busy"."""
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def is_host_control(variable: dict) -> bool:
    return variable.get("access") == "host"


def _hue_for(participant_id: str) -> int:
    """A stable 0-359 hue per participant, so a piece can colour each person's
    contribution and a station can tell someone which colour is theirs."""
    digest = hashlib.sha256(participant_id.encode()).digest()
    return int.from_bytes(digest[:2], "big") % 360

# A directed reply targets the specific socket that triggered it; "all"
# means every display + station socket currently attached to the room.
Target = Literal["all"] | Any  # Any = a specific websocket-like object
SendItem = tuple[Target, dict]


class Participant:
    __slots__ = ("id", "table", "sockets", "disconnect_task", "tokens", "tokens_at")

    def __init__(self, participant_id: str, table: str):
        self.id = participant_id
        self.table = table
        self.sockets: set[Any] = set()
        self.disconnect_task: asyncio.Task | None = None
        self.tokens: float = MSG_BUCKET_CAPACITY
        self.tokens_at: float = time.monotonic()


@dataclass
class Hold:
    person: Participant
    until: float  # monotonic seconds


@dataclass
class Telemetry:
    last_activity: float = field(default_factory=time.monotonic)
    table_seen: dict[str, float] = field(default_factory=dict)
    changes_by_table: dict[str, int] = field(default_factory=dict)


def _group_add(group: list[Participant], person: Participant) -> None:
    if person not in group:
        group.append(person)


def _group_remove(group: list[Participant], person: Participant) -> None:
    if person in group:
        group.remove(person)


class RoomRelay:
    def __init__(self, room_id: int, sketch: dict | None = None, values: dict | None = None):
        self.room_id = room_id
        self.displays: set[Any] = set()
        self.stations: set[Any] = set()
        self.participants: dict[str, Participant] = {}  # session token -> participant
        self.assigned: dict[str, list[Participant]] = {}  # var name -> ordered owner list
        self.holds: dict[str, Hold] = {}
        self.values: dict[str, Any] = dict(values or {})
        self.telemetry = Telemetry()
        self.current_sketch: dict | None = sketch
        self.host_tokens = HOST_BUCKET_CAPACITY
        self.host_tokens_at = time.monotonic()

    # ── pure queries ────────────────────────────────────────────────────────

    def people(self) -> list[dict]:
        """Who is attached right now — exposed to sketches as room.people so a
        piece can draw the crowd itself, not just what the crowd is steering."""
        return [
            {"id": p.id, "table": p.table, "hue": _hue_for(p.id)}
            for p in self.participants.values()
        ]

    def ownership(self) -> dict:
        return {
            name: [{"id": p.id, "table": p.table} for p in group]
            for name, group in self.assigned.items()
        }

    def _ownership_message(self) -> dict:
        return {"type": "ownership", "owners": self.ownership(), "people": self.people()}

    def get_telemetry(self) -> dict:
        now = time.monotonic()
        return {
            "activeTables": [table for table, at in self.telemetry.table_seen.items() if now - at < 30],
            "msSinceLastActivity": (now - self.telemetry.last_activity) * 1000,
            "changesByTable": dict(self.telemetry.changes_by_table),
        }

    # ── pure mutators (no I/O; return what to send) ─────────────────────────

    def _count(self, person: Participant) -> int:
        return sum(1 for group in self.assigned.values() if person in group)

    def _ranked(self, people: list[Participant]) -> list[Participant]:
        return sorted(people, key=self._count)

    def distribute(self) -> None:
        people = list(self.participants.values())
        variables = (self.current_sketch or {}).get("variables") or []
        names_ordered: list[str] = []
        seen_names: set[str] = set()
        for v in variables:
            # share:"all" controls belong to everyone, so they are never owned
            # and must not consume a slot in the balancing. Host controls belong
            # to the owner's desk and are never handed to a phone at all.
            if v.get("share") == "all" or is_host_control(v):
                continue
            if v["name"] not in seen_names:
                seen_names.add(v["name"])
                names_ordered.append(v["name"])
        names = seen_names
        people_set = set(people)

        for name, group in list(self.assigned.items()):
            if name not in names:
                del self.assigned[name]
                self.holds.pop(name, None)
                continue
            self.assigned[name] = [p for p in group if p in people_set]

        if not people or not names:
            self.assigned.clear()
            self.holds.clear()
            return

        for name in names_ordered:
            self.assigned.setdefault(name, [])

        if len(names) >= len(people):
            # Enough controls: one owner per control, possibly several per person.
            for name, group in self.assigned.items():
                if len(group) > 1:
                    self.assigned[name] = [group[0]]
            for name, group in self.assigned.items():
                if not group:
                    group.append(self._ranked(people)[0])
            while True:
                ordered = self._ranked(people)
                low, high = ordered[0], ordered[-1]
                if self._count(high) - self._count(low) <= 1:
                    break
                target_name = None
                for n, group in self.assigned.items():
                    if high in group:
                        target_name = n
                self.assigned[target_name] = [low]
        else:
            # More people than controls: everyone gets one, balanced into groups.
            for person in people:
                groups_with_person = [g for g in self.assigned.values() if person in g]
                for g in groups_with_person[1:]:
                    _group_remove(g, person)

            def group_rank() -> list[list[Participant]]:
                return sorted(self.assigned.values(), key=len)

            for person in people:
                if self._count(person) == 0:
                    group_rank()[0].append(person)
            while True:
                groups = group_rank()
                low, high = groups[0], groups[-1]
                if len(high) - len(low) <= 1:
                    break
                person = high[-1]
                _group_remove(high, person)
                _group_add(low, person)

        for name, hold in list(self.holds.items()):
            group = self.assigned.get(name)
            if group is None or hold.person not in group:
                del self.holds[name]

    def set_sketch(self, sketch: dict, initial_values: dict | None = None) -> list[SendItem]:
        initial_values = initial_values or {}
        self.current_sketch = sketch
        self.values.clear()
        self.holds.clear()
        for v in sketch.get("variables") or []:
            # A trigger fires events; it has no value to seed, and letting one
            # into self.values would persist a meaningless null into
            # commons_room_state.values on the next save.
            if v.get("type") == "trigger":
                continue
            candidate = initial_values.get(v["name"])
            accepted = accept_value(v, candidate) if candidate is not None else None
            self.values[v["name"]] = accepted if accepted is not None else default_value(v)
        self.distribute()
        return [("all", {"type": "sketch", "sketch": sketch, "values": dict(self.values),
                          "owners": self.ownership(), "people": self.people()})]

    def take_message_token(self, person: Participant) -> bool:
        """Token bucket, one per participant. Returns False when this message
        should be dropped on the floor."""
        now = time.monotonic()
        person.tokens = min(
            MSG_BUCKET_CAPACITY,
            person.tokens + (now - person.tokens_at) * MSG_BUCKET_REFILL_PER_S,
        )
        person.tokens_at = now
        if person.tokens < 1.0:
            return False
        person.tokens -= 1.0
        return True

    def apply_trigger(self, ws: Any, person: Participant, var_name: str) -> list[SendItem]:
        """A trigger says *something happened* rather than *a value is now X*.
        It sets no value and takes no hold — for a control everyone can fire,
        contention is the point, not a problem to be serialised."""
        variables = (self.current_sketch or {}).get("variables") or []
        variable = next((v for v in variables if v["name"] == var_name), None)
        if variable is None or variable.get("type") != "trigger" or is_host_control(variable):
            return []  # a phone can never fire the host's action

        if variable.get("share") != "all":
            group = self.assigned.get(var_name)
            if group is None or person not in group:
                return [(ws, {"type": "not_owner", "varName": var_name,
                               "value": None, "owners": self.ownership()})]

        now = time.monotonic()
        self.telemetry.last_activity = now
        self.telemetry.table_seen[person.table] = now
        self.telemetry.changes_by_table[person.table] = self.telemetry.changes_by_table.get(person.table, 0) + 1
        return [("all", {"type": "event", "name": var_name,
                          "participantId": person.id, "table": person.table})]

    def apply_var_update(self, ws: Any, person: Participant, var_name: str, value: Any) -> list[SendItem]:
        variables = (self.current_sketch or {}).get("variables") or []
        variable = next((v for v in variables if v["name"] == var_name), None)
        if variable is None:
            return []
        if variable.get("type") == "trigger" or is_host_control(variable):
            return []  # a trigger is fired, not set; a host control is never a phone's
        group = self.assigned.get(var_name)
        if group is None or person not in group:
            return [(ws, {"type": "not_owner", "varName": var_name,
                           "value": self.values.get(var_name), "owners": self.ownership()})]

        value = accept_value(variable, value)
        if value is None:
            return []

        hold = self.holds.get(var_name)
        now = time.monotonic()
        if len(group) > 1 and hold and hold.person is not person and hold.until > now:
            return [(ws, {"type": "held", "varName": var_name, "value": self.values.get(var_name),
                           "table": hold.person.table, "until": hold.until})]

        self.values[var_name] = value
        self.holds[var_name] = Hold(person=person, until=now + HOLD_MS / 1000)
        self.telemetry.last_activity = now
        self.telemetry.table_seen[person.table] = now
        self.telemetry.changes_by_table[person.table] = self.telemetry.changes_by_table.get(person.table, 0) + 1
        return [("all", {"type": "var", "varName": var_name, "value": value,
                          "table": person.table, "participantId": person.id})]

    # ── the host, from the desk ─────────────────────────────────────────────

    def _take_host_token(self) -> bool:
        now = time.monotonic()
        self.host_tokens = min(HOST_BUCKET_CAPACITY,
                               self.host_tokens + (now - self.host_tokens_at) * HOST_BUCKET_REFILL_PER_S)
        self.host_tokens_at = now
        if self.host_tokens < 1.0:
            return False
        self.host_tokens -= 1.0
        return True

    def _host_variable(self, var_name: str) -> dict:
        variables = (self.current_sketch or {}).get("variables") or []
        variable = next((v for v in variables if v["name"] == var_name), None)
        if variable is None or not is_host_control(variable):
            raise HostControlError("unknown")
        return variable

    def host_controls(self) -> dict:
        """The live piece's host controls and their values, for the desk."""
        variables = [v for v in (self.current_sketch or {}).get("variables") or [] if is_host_control(v)]
        return {"variables": variables,
                "values": {v["name"]: self.values.get(v["name"]) for v in variables if v.get("type") != "trigger"}}

    def apply_host_update(self, var_name: str, value: Any) -> list[SendItem]:
        """The owner sets one of the piece's host controls. The same gate as a
        phone's update (accept_value), no hold -- there is only one host."""
        variable = self._host_variable(var_name)
        if variable.get("type") == "trigger":
            raise HostControlError("invalid")
        accepted = accept_value(variable, value)
        if accepted is None:
            raise HostControlError("invalid")
        if not self._take_host_token():
            raise HostControlError("busy")
        self.values[var_name] = accepted
        self.telemetry.last_activity = time.monotonic()
        return [("all", {"type": "var", "varName": var_name, "value": accepted,
                          "table": HOST, "participantId": HOST})]

    def apply_host_trigger(self, var_name: str) -> list[SendItem]:
        variable = self._host_variable(var_name)
        if variable.get("type") != "trigger":
            raise HostControlError("invalid")
        if not self._take_host_token():
            raise HostControlError("busy")
        self.telemetry.last_activity = time.monotonic()
        # Sketches look the participant up in room.people and already allow for
        # not finding them, which is exactly what "host" is.
        return [("all", {"type": "event", "name": var_name, "participantId": HOST, "table": HOST})]

    # ── connection lifecycle (async: does socket I/O + timer scheduling) ────

    def _resolve_targets(self, items: list[SendItem]) -> list[tuple[Any, dict]]:
        resolved = []
        for target, message in items:
            if target == "all":
                for ws in [*self.displays, *self.stations]:
                    resolved.append((ws, message))
            else:
                resolved.append((target, message))
        return resolved

    async def _send_all(self, sender, items: list[SendItem]) -> None:
        for ws, message in self._resolve_targets(items):
            try:
                await ws.send_json(message)
            except Exception:
                pass  # a dead socket is cleaned up by its own disconnect handler

    async def broadcast(self, items: list[SendItem]) -> None:
        await self._send_all(None, items)

    async def publish(self, sketch: dict, values: dict | None = None) -> None:
        await self._send_all(None, self.set_sketch(sketch, values))

    async def connect_display(self, ws: Any) -> None:
        self.displays.add(ws)
        if self.current_sketch:
            await ws.send_json({"type": "sketch", "sketch": self.current_sketch,
                                 "values": dict(self.values), "owners": self.ownership(),
                                 "people": self.people()})

    async def disconnect_display(self, ws: Any) -> None:
        self.displays.discard(ws)

    async def connect_station(self, ws: Any, token: str | None, table_hint: str) -> tuple[Participant, str]:
        person = self.participants.get(token) if token else None
        if person is None:
            token = secrets.token_hex(32)
            person = Participant(participant_id=secrets.token_hex(16), table=(table_hint or "table-1")[:80])
            self.participants[token] = person
        if person.disconnect_task is not None:
            person.disconnect_task.cancel()
            person.disconnect_task = None
        person.sockets.add(ws)
        self.stations.add(ws)
        self.distribute()
        await ws.send_json({"type": "welcome", "table": person.table, "participantId": person.id,
                             "session": token, "sketch": self.current_sketch, "values": dict(self.values),
                             "owners": self.ownership(), "people": self.people(),
                             "hue": _hue_for(person.id)})
        await self._send_all(None, [("all", self._ownership_message())])
        return person, token

    async def disconnect_station(self, ws: Any, person: Participant, token: str) -> None:
        self.stations.discard(ws)
        person.sockets.discard(ws)
        if person.sockets:
            return

        async def _expire():
            try:
                await asyncio.sleep(DISCONNECT_GRACE_S)
            except asyncio.CancelledError:
                return
            if self.participants.get(token) is not person:
                return
            del self.participants[token]
            self.distribute()
            await self._send_all(None, [("all", self._ownership_message())])

        person.disconnect_task = asyncio.create_task(_expire())

    async def shutdown(self, code: int = 4404) -> None:
        """Drop everyone attached to this room. Used when the room is deleted:
        the registry is in-process and nothing else evicts a live relay, so
        without this the wall and every phone would keep steering a room that
        no longer exists. Uses the same 4404 the handshake sends for an unknown
        room, which the station already words as "this room isn't open"."""
        for ws in [*self.displays, *self.stations]:
            try:
                await ws.close(code=code)
            except Exception:
                pass  # already gone; its own disconnect handler will tidy up
        self.displays.clear()
        self.stations.clear()
        # Cancel the 30s grace timers too, or they outlive the room and fire
        # against a relay nobody can reach.
        for person in self.participants.values():
            if person.disconnect_task is not None:
                person.disconnect_task.cancel()
                person.disconnect_task = None
        self.participants.clear()
        self.assigned.clear()
        self.holds.clear()

    async def handle_message(self, ws: Any, person: Participant, message: dict) -> None:
        kind = message.get("type")
        if kind not in ("var", "trigger") or not isinstance(message.get("varName"), str):
            return
        if not self.take_message_token(person):
            return  # silently dropped, same as an invalid value
        if kind == "var":
            await self._send_all(None, self.apply_var_update(ws, person, message["varName"], message.get("value")))
        else:
            await self._send_all(None, self.apply_trigger(ws, person, message["varName"]))


# ── per-room registry ────────────────────────────────────────────────────────
# In-process, keyed by room_id. Safe because the Cloud Run deploy is
# single-process (Dockerfile runs bare `uvicorn`, no --workers). If the suite
# ever scales past one instance, this registry silently diverges per
# instance — out of scope for Stage 2; would need a shared broker later.

_relays: dict[int, RoomRelay] = {}
_creation_locks: dict[int, asyncio.Lock] = {}


async def get_or_create_relay(pool, room_id: int) -> RoomRelay:
    existing = _relays.get(room_id)
    if existing is not None:
        return existing
    lock = _creation_locks.setdefault(room_id, asyncio.Lock())
    async with lock:
        existing = _relays.get(room_id)
        if existing is not None:
            return existing
        row = await pool.fetchrow(
            "SELECT sketch, values FROM commons_room_state WHERE room_id = $1", room_id)
        sketch = None
        values: dict = {}
        if row and row["sketch"] is not None:
            import json
            sketch = row["sketch"] if isinstance(row["sketch"], dict) else json.loads(row["sketch"])
            raw_values = row["values"]
            values = raw_values if isinstance(raw_values, dict) else (json.loads(raw_values) if raw_values else {})
        if sketch is None:
            from backend.service.thecommons_generate import pick_fallback
            sketch = pick_fallback()
            values = {}
        relay = RoomRelay(room_id, sketch=sketch, values=values)
        relay.distribute()
        _relays[room_id] = relay
        return relay


def peek_relay(room_id: int) -> RoomRelay | None:
    """Look up a live relay without creating one. Deleting a room must not
    hydrate a relay from the database purely in order to throw it away."""
    return _relays.get(room_id)


def discard_relay(room_id: int) -> None:
    """Test/teardown helper — drop a room's in-process relay state."""
    _relays.pop(room_id, None)
    _creation_locks.pop(room_id, None)
