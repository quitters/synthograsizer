"""WebSocket relay tests — routers/thecommons.py's /ws/thecommons/{join_code}.

Fully anonymous by design (no auth needed here, unlike /ws/music). Same
TestClient.websocket_connect() + pytest.raises(WebSocketDisconnect) pattern
test_service_auth.py uses for /ws/music's close-code assertions.
"""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import backend.server as server
from backend.service import db as service_db
from backend.service import thecommons_relay

from tests.test_thecommons_rooms import FakeCommonsPool
from tests.test_service_credits import CLIENT_ID

client = TestClient(server.app, raise_server_exceptions=False)


@pytest.fixture
def service_on(monkeypatch):
    monkeypatch.setenv("SYNTH_AUTH", "1")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("SYNTH_TERMS_VERSION", "v0.2")


@pytest.fixture
def fake_pool(monkeypatch):
    pool = FakeCommonsPool()
    monkeypatch.setattr(service_db, "_pool", pool)
    return pool


@pytest.fixture(autouse=True)
def reset_relay_registry(monkeypatch):
    thecommons_relay._relays.clear()
    thecommons_relay._creation_locks.clear()
    # The real 30s disconnect-grace timer would otherwise leave a pending
    # asyncio task per station connect/disconnect in this file's TestClient
    # portal thread — harmless in a single-file run, but accumulates into a
    # real multi-second-to-minutes wait when the full suite tears down
    # several files' portals in one process. Tests here don't exercise the
    # grace period itself (test_thecommons_relay.py does, directly).
    monkeypatch.setattr(thecommons_relay, "DISCONNECT_GRACE_S", 0.01)
    yield
    thecommons_relay._relays.clear()
    thecommons_relay._creation_locks.clear()


def test_unknown_join_code_closes_4404(service_on, fake_pool):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/thecommons/does-not-exist"):
            pass
    assert exc.value.code == 4404


def test_closed_room_closes_4404(service_on, fake_pool):
    room_id = fake_pool.seed_room(owner_user_id=1, join_code="closed-room", status="closed")
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/thecommons/closed-room"):
            pass
    assert exc.value.code == 4404


def test_display_receives_current_sketch_on_connect(service_on, fake_pool):
    fake_pool.seed_room(owner_user_id=1, join_code="room-a")
    with client.websocket_connect("/ws/thecommons/room-a?role=display") as ws:
        message = ws.receive_json()
        assert message["type"] == "sketch"
        assert "variables" in message["sketch"]


def test_station_welcome_then_reconnect_preserves_identity(service_on, fake_pool):
    fake_pool.seed_room(owner_user_id=1, join_code="room-a")
    with client.websocket_connect("/ws/thecommons/room-a?table=Table%201") as ws:
        welcome = ws.receive_json()
        assert welcome["type"] == "welcome"
        session_token = welcome["session"]
        participant_id = welcome["participantId"]

    # Reconnect with the same session token — same participant identity.
    with client.websocket_connect(f"/ws/thecommons/room-a?session={session_token}") as ws2:
        welcome2 = ws2.receive_json()
        assert welcome2["participantId"] == participant_id
        assert welcome2["table"] == "Table 1"


def test_session_token_from_one_room_is_not_honored_in_another(service_on, fake_pool):
    fake_pool.seed_room(owner_user_id=1, join_code="room-a")
    fake_pool.seed_room(owner_user_id=1, join_code="room-b")

    with client.websocket_connect("/ws/thecommons/room-a?table=t1") as ws_a:
        welcome_a = ws_a.receive_json()
        token_from_a = welcome_a["session"]
        id_from_a = welcome_a["participantId"]

    with client.websocket_connect(f"/ws/thecommons/room-b?session={token_from_a}&table=t1") as ws_b:
        welcome_b = ws_b.receive_json()
        assert welcome_b["participantId"] != id_from_a  # a fresh participant was minted, not reused


def test_var_broadcast_never_crosses_rooms(service_on, fake_pool):
    fake_pool.seed_room(owner_user_id=1, join_code="room-a")
    fake_pool.seed_room(owner_user_id=1, join_code="room-b")

    with client.websocket_connect("/ws/thecommons/room-a?role=display") as display_a:
        sketch_a = display_a.receive_json()
        var_name = sketch_a["sketch"]["variables"][0]["name"]
        variable = next(v for v in sketch_a["sketch"]["variables"] if v["name"] == var_name)
        new_value = (variable["default"] + 1) if variable.get("type") == "number" else variable["values"][1]["text"]

        with client.websocket_connect("/ws/thecommons/room-a?table=t1") as station_a:
            welcome_a = station_a.receive_json()
            assert welcome_a["owners"].get(var_name)  # station_a should own at least one control
            station_a.send_json({"type": "var", "varName": var_name, "value": new_value})

            display_a.receive_json()  # the ownership broadcast triggered by station_a joining
            update = display_a.receive_json()
            assert update["type"] == "var" and update["varName"] == var_name and update["value"] == new_value

    # A room never touched by this traffic must show none of it in its own
    # relay state — checked directly against the in-process registry rather
    # than by trying to prove a socket received nothing (which has no clean
    # non-blocking way to assert on a plain synchronous TestClient socket).
    with client.websocket_connect("/ws/thecommons/room-b?role=display") as display_b:
        display_b.receive_json()  # forces room-b's relay to hydrate in the registry

    relay_a = thecommons_relay._relays[1]
    relay_b = thecommons_relay._relays[2]
    assert relay_a is not relay_b
    assert relay_a.values.get(var_name) == new_value
    assert relay_b.values.get(var_name) != new_value
    assert relay_b.get_telemetry()["changesByTable"] == {}
