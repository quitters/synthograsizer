"""The /chatroom/api reverse proxy must pass the chat room's session cookie both ways.

Each visitor's chat room is found by a cookie the Node server issues. The proxy
forwards the browser's Cookie header on every request, and must hand the server's
Set-Cookie back -- including on the SSE stream, which a first-time visitor opens at
the same moment as the page's other requests.
"""
import httpx
import pytest
from fastapi.testclient import TestClient

import backend.server as server

client = TestClient(server.app, raise_server_exceptions=False)

ISSUED = "cr_sid=0123456789abcdef0123456789abcdef; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"


@pytest.fixture(autouse=True)
def local_mode(monkeypatch):
    monkeypatch.delenv("SYNTH_AUTH", raising=False)


def _upstream(monkeypatch, handler):
    """Make the proxy talk to `handler` instead of the Node server."""
    real = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", factory)


def test_plain_requests_carry_the_cookie_both_ways(monkeypatch):
    seen = {}

    def handler(request: httpx.Request):
        seen["cookie"] = request.headers.get("cookie")
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"agents": []}, headers=[("set-cookie", ISSUED)])

    _upstream(monkeypatch, handler)
    r = client.get("/chatroom/api/agents", headers={"cookie": "cr_sid=ffffffffffffffffffffffffffffffff"})

    assert r.status_code == 200
    assert seen["cookie"] == "cr_sid=ffffffffffffffffffffffffffffffff"     # the browser's cookie reached Node
    assert seen["url"].endswith("/api/agents")
    assert r.headers["set-cookie"] == ISSUED                               # and Node's came back


def test_the_event_stream_returns_the_cookie_a_first_visit_needs(monkeypatch):
    def handler(request: httpx.Request):
        return httpx.Response(
            200,
            headers=[("content-type", "text/event-stream"), ("set-cookie", ISSUED)],
            stream=httpx.ByteStream(b"retry: 300\n\n"),
        )

    _upstream(monkeypatch, handler)
    with client.stream("GET", "/chatroom/api/chat/stream", headers={"accept": "text/event-stream"}) as r:
        body = b"".join(r.iter_bytes())
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        assert r.headers["set-cookie"] == ISSUED
    assert body == b"retry: 300\n\n"


def test_the_event_stream_still_relays_events(monkeypatch):
    payload = b"event: connected\ndata: {}\n\nevent: state\ndata: {\"agents\": []}\n\n"

    def handler(request: httpx.Request):
        return httpx.Response(200, headers=[("content-type", "text/event-stream")], stream=httpx.ByteStream(payload))

    _upstream(monkeypatch, handler)
    with client.stream("GET", "/chatroom/api/chat/stream", headers={"accept": "text/event-stream"}) as r:
        assert b"".join(r.iter_bytes()) == payload
        assert "set-cookie" not in r.headers


def test_an_unreachable_chat_room_is_a_502_not_a_crash(monkeypatch):
    def handler(request: httpx.Request):
        raise httpx.ConnectError("refused", request=request)

    _upstream(monkeypatch, handler)
    r = client.get("/chatroom/api/chat/stream", headers={"accept": "text/event-stream"})
    assert r.status_code == 502
