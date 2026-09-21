"""The host's own controls: "access": "host", steered from the desk over an
owner-checked HTTP route, never from a phone."""

import pytest
from fastapi.testclient import TestClient

import backend.server as server
from backend.service import thecommons_relay

from tests.test_service_auth import _fake_user
from tests.test_service_credits import _sign_in
from tests.test_thecommons_rooms import fake_pool, reset_thecommons_registries, service_on  # noqa: F401 (fixtures)

client = TestClient(server.app, raise_server_exceptions=False)

SKETCH = {"id": "s1", "name": "Mounds", "variables": [
    {"name": "speed", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
    {"name": "mound", "type": "number", "min": 1, "max": 9999, "step": 1, "default": 1, "access": "host"},
    {"name": "wander", "type": "toggle", "default": False, "access": "host"},
    {"name": "repaint", "type": "trigger", "share": "one", "access": "host"},
]}


class Wall:
    def __init__(self):
        self.sent = []

    async def send_json(self, message):
        self.sent.append(message)


def _live_room(fake_pool, monkeypatch, owner=1):
    room_id = fake_pool.seed_room(owner_user_id=owner)
    cookies = _sign_in(monkeypatch, _fake_user(id=owner))
    assert client.get(f"/api/thecommons/rooms/{room_id}", cookies=cookies).status_code == 200  # creates the relay
    relay = thecommons_relay._relays[room_id]
    relay.set_sketch(SKETCH, {})
    wall = Wall()
    relay.displays.add(wall)
    return room_id, cookies, relay, wall


def test_the_room_payload_lists_the_host_controls(service_on, fake_pool, monkeypatch):
    room_id, cookies, relay, _ = _live_room(fake_pool, monkeypatch)
    host = client.get(f"/api/thecommons/rooms/{room_id}", cookies=cookies).json()["host"]
    assert [v["name"] for v in host["variables"]] == ["mound", "wander", "repaint"]
    assert host["values"] == {"mound": 1, "wander": False}


def test_the_owner_sets_a_host_control_and_the_wall_hears_it(service_on, fake_pool, monkeypatch):
    room_id, cookies, relay, wall = _live_room(fake_pool, monkeypatch)
    r = client.post(f"/api/thecommons/rooms/{room_id}/host", json={"name": "mound", "value": 42}, cookies=cookies)
    assert r.status_code == 200 and r.json() == {"name": "mound", "value": 42}
    assert relay.values["mound"] == 42
    assert {"type": "var", "varName": "mound", "value": 42, "table": "host", "participantId": "host"} in wall.sent
    r = client.post(f"/api/thecommons/rooms/{room_id}/host", json={"name": "wander", "value": True}, cookies=cookies)
    assert r.status_code == 200 and relay.values["wander"] is True


def test_the_owner_fires_a_host_trigger(service_on, fake_pool, monkeypatch):
    room_id, cookies, relay, wall = _live_room(fake_pool, monkeypatch)
    r = client.post(f"/api/thecommons/rooms/{room_id}/host", json={"name": "repaint", "fire": True}, cookies=cookies)
    assert r.status_code == 200
    assert {"type": "event", "name": "repaint", "participantId": "host", "table": "host"} in wall.sent


def test_only_the_owner_can_steer_and_a_stranger_sees_no_room(service_on, fake_pool, monkeypatch):
    room_id, _, relay, _ = _live_room(fake_pool, monkeypatch, owner=1)
    stranger = _sign_in(monkeypatch, _fake_user(id=2))
    r = client.post(f"/api/thecommons/rooms/{room_id}/host", json={"name": "mound", "value": 7}, cookies=stranger)
    assert r.status_code == 404
    assert relay.values["mound"] == 1


@pytest.mark.parametrize("body, status", [
    ({"name": "mound", "value": 0}, 400),          # below the range
    ({"name": "mound", "value": "7"}, 400),        # a string is not a number, and is not coerced into one
    ({"name": "wander", "value": 1}, 400),         # 1 is not true
    ({"name": "speed", "value": 3}, 404),          # a room control is the room's, not the host's
    ({"name": "ghost", "value": 1}, 404),
    ({"name": "mound", "fire": True}, 400),        # only a trigger fires
])
def test_bad_host_changes_are_refused(service_on, fake_pool, monkeypatch, body, status):
    room_id, cookies, relay, _ = _live_room(fake_pool, monkeypatch)
    assert client.post(f"/api/thecommons/rooms/{room_id}/host", json=body, cookies=cookies).status_code == status
    assert relay.values == {"speed": 5, "mound": 1, "wander": False}


def test_a_runaway_desk_is_throttled(service_on, fake_pool, monkeypatch):
    room_id, cookies, relay, _ = _live_room(fake_pool, monkeypatch)
    codes = [client.post(f"/api/thecommons/rooms/{room_id}/host", json={"name": "mound", "value": 1 + i},
                         cookies=cookies).status_code for i in range(40)]
    assert 200 in codes and 429 in codes


def test_the_phone_preview_leaves_host_controls_out_and_counts_them(service_on, fake_pool, monkeypatch):
    room_id, cookies, relay, _ = _live_room(fake_pool, monkeypatch)
    panel = client.get(f"/api/thecommons/rooms/{room_id}", cookies=cookies).json()["panel"]
    assert [v["name"] for v in panel["variables"]] == ["speed"]
    assert panel["hostCount"] == 3

