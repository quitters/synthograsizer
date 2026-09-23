"""Room images, uploaded: the sanitiser every upload passes through, the
owner-only API, the wall's route, the shared storage quota, and the relay
telling walls (and only walls) when the room's images change.

No Postgres and no bucket: FakeCommonsPool (test_thecommons_rooms.py) holds
the rows and RoomStorage below holds the objects.
"""

import asyncio
import io
import struct
import zlib

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import backend.server as server
from backend.service import storage
from backend.service import thecommons_images as images
from backend.service import thecommons_relay
from backend.service.storage_quota import used_bytes

from tests.test_service_auth import _fake_user
from tests.test_service_credits import _sign_in
from tests.test_thecommons_rooms import (  # noqa: F401  (fixtures)
    fake_pool, reset_thecommons_registries, service_on,
)

client = TestClient(server.app, raise_server_exceptions=False)


# ── fakes and files ──────────────────────────────────────────────────────────

class RoomStorage:
    def __init__(self):
        self.on = True
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.fail_put = False
        self.deleted_prefixes: list[str] = []

    def enabled(self):
        return self.on

    def put(self, path, data, mime):
        if self.fail_put:
            raise RuntimeError("bucket said no")
        self.objects[path] = (data, mime)

    def get(self, path):
        if path not in self.objects:
            raise KeyError(path)
        return self.objects[path][0]

    def delete(self, path):
        self.objects.pop(path, None)

    def delete_prefix(self, prefix):
        self.deleted_prefixes.append(prefix)
        gone = [p for p in self.objects if p.startswith(prefix)]
        for p in gone:
            del self.objects[p]
        return len(gone)


@pytest.fixture
def bucket(monkeypatch):
    fake = RoomStorage()
    for name in ("enabled", "put", "get", "delete", "delete_prefix"):
        monkeypatch.setattr(storage, name, getattr(fake, name))
    return fake


def _png(size=(320, 200), colour=(200, 40, 40), mode="RGB") -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, colour).save(out, format="PNG")
    return out.getvalue()


def _bomb_header(width=20000, height=20000) -> bytes:
    """A PNG whose header claims 400 MP. Nothing past the header is ever read."""
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"\0" * 64)) + chunk(b"IEND", b"")


def _upload(cookies, room_id, data, name="photo.png", mime="image/png"):
    return client.post(f"/api/thecommons/rooms/{room_id}/images", cookies=cookies,
                       files={"file": (name, data, mime)})


def _owner(monkeypatch, user_id=1):
    return _sign_in(monkeypatch, _fake_user(id=user_id))


# ── the sanitiser ────────────────────────────────────────────────────────────

def test_a_decompression_bomb_is_refused_from_its_header():
    with pytest.raises(images.UnusableImage) as refused:
        images.sanitize(_bomb_header())
    assert refused.value.code == "too_many_pixels"


def test_an_oversize_upload_is_refused_before_it_is_opened():
    with pytest.raises(images.UnusableImage) as refused:
        images.sanitize(b"\0" * (images.MAX_UPLOAD_BYTES + 1))
    assert refused.value.code == "too_large"


@pytest.mark.parametrize("data", [
    b"<script>alert(1)</script>",
    b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    b"",
])
def test_what_is_not_an_image_is_refused(data):
    with pytest.raises(images.UnusableImage) as refused:
        images.sanitize(data)
    assert refused.value.code == "not_an_image"


@pytest.mark.parametrize("fmt", ["BMP", "TIFF"])
def test_formats_outside_the_four_are_refused_even_when_pillow_reads_them(fmt):
    out = io.BytesIO()
    Image.new("RGB", (40, 40), (1, 2, 3)).save(out, format=fmt)
    with pytest.raises(images.UnusableImage):
        images.sanitize(out.getvalue())


def test_a_damaged_image_is_refused():
    out = io.BytesIO()
    Image.new("RGB", (400, 400), (9, 9, 9)).save(out, format="JPEG")
    with pytest.raises(images.UnusableImage) as refused:
        images.sanitize(out.getvalue()[: len(out.getvalue()) // 3])
    assert refused.value.code == "not_an_image"


def test_a_polyglot_keeps_its_pixels_and_loses_its_payload():
    polyglot = _png() + b"<script>fetch('/api/me')</script>"
    webp, width, height = images.sanitize(polyglot)
    assert (width, height) == (320, 200)
    assert b"<script" not in webp and Image.open(io.BytesIO(webp)).format == "WEBP"


def test_a_phone_photo_comes_out_upright_and_without_its_metadata():
    exif = Image.Exif()
    exif[0x0112] = 6          # orientation: rotate 90° clockwise to display
    exif[0x010F] = "SomeCamera"
    raw = io.BytesIO()
    Image.new("RGB", (400, 200), (10, 120, 200)).save(raw, format="JPEG", exif=exif)
    webp, width, height = images.sanitize(raw.getvalue())
    assert (width, height) == (200, 400)
    out = Image.open(io.BytesIO(webp))
    assert not out.info.get("exif") and not out.info.get("icc_profile")


def test_transparency_survives():
    webp, _, _ = images.sanitize(_png(mode="RGBA", colour=(255, 0, 0, 0)))
    assert Image.open(io.BytesIO(webp)).mode == "RGBA"


def test_an_animated_gif_keeps_its_first_frame():
    frames = [Image.new("RGB", (60, 60), c) for c in ((255, 0, 0), (0, 0, 255))]
    raw = io.BytesIO()
    frames[0].save(raw, format="GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
    webp, _, _ = images.sanitize(raw.getvalue())
    r, g, b = Image.open(io.BytesIO(webp)).convert("RGB").getpixel((30, 30))
    assert r > 200 and b < 60


def test_a_phone_photo_saved_as_mpo_is_accepted():
    # Many phones write a JPEG with a second image inside (MPO). Pillow opens it
    # as JPEG; the first image is the photo.
    first, second = Image.new("RGB", (120, 80), (250, 10, 10)), Image.new("RGB", (120, 80), (10, 10, 250))
    raw = io.BytesIO()
    first.save(raw, format="MPO", save_all=True, append_images=[second])
    webp, width, height = images.sanitize(raw.getvalue())
    assert (width, height) == (120, 80)
    assert Image.open(io.BytesIO(webp)).convert("RGB").getpixel((5, 5))[0] > 200


def test_a_big_image_is_fitted_to_the_wall():
    raw = io.BytesIO()
    Image.new("RGB", (3000, 1000), (0, 0, 0)).save(raw, format="JPEG")
    _, width, height = images.sanitize(raw.getvalue())
    assert (width, height) == (images.MAX_EDGE, 640)


def test_paths_are_made_of_integers_only():
    assert images.object_path(7, 3, 12) == "users/7/rooms/3/12.webp"
    assert images.room_prefix(7, 3) == "users/7/rooms/3/"


# ── uploading ────────────────────────────────────────────────────────────────

def test_the_owner_uploads_and_only_the_re_encoding_is_stored(service_on, fake_pool, bucket, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    cookies = _owner(monkeypatch)
    original = _png()
    r = _upload(cookies, room_id, original)
    assert r.status_code == 201, r.text
    entry = r.json()
    assert entry["width"] == 320 and entry["height"] == 200 and entry["position"] == 0
    stored, mime = bucket.objects[f"users/1/rooms/{room_id}/{entry['id']}.webp"]
    assert mime == "image/webp" and stored != original
    assert Image.open(io.BytesIO(stored)).format == "WEBP"
    assert entry["bytes"] == len(stored)


def test_the_list_says_what_the_room_has_and_what_it_would_use_without(service_on, fake_pool, bucket,
                                                                        monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    cookies = _owner(monkeypatch)
    empty = client.get(f"/api/thecommons/rooms/{room_id}/images", cookies=cookies).json()
    assert empty["images"] == [] and empty["limit"] == 12 and empty["storageEnabled"] is True
    assert [s["id"] for s in empty["samples"]] == [d["id"] for d in images.DEFAULT_IMAGES]
    assert all(s["url"].startswith("/thecommons/img/defaults/") for s in empty["samples"])
    _upload(cookies, room_id, _png())
    listed = client.get(f"/api/thecommons/rooms/{room_id}/images", cookies=cookies).json()
    assert len(listed["images"]) == 1 and listed["storageUsedMb"] >= 0


def test_everything_is_owner_only(service_on, fake_pool, bucket, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=2)
    fake_pool.room_images[99] = {"id": 99, "room_id": room_id, "position": 0, "width": 1, "height": 1,
                                 "bytes": 1, "created_at": None}
    bucket.objects[f"users/2/rooms/{room_id}/99.webp"] = (b"x", "image/webp")
    base = f"/api/thecommons/rooms/{room_id}/images"
    assert client.get(base).status_code == 401
    cookies = _owner(monkeypatch, user_id=1)
    assert client.get(base, cookies=cookies).status_code == 404
    assert _upload(cookies, room_id, _png()).status_code == 404
    assert client.get(f"{base}/99", cookies=cookies).status_code == 404
    assert client.put(f"{base}/order", json={"ids": [99]}, cookies=cookies).status_code == 404
    assert client.delete(f"{base}/99", cookies=cookies).status_code == 404
    assert 99 in fake_pool.room_images and bucket.objects


def test_a_full_room_refuses_without_decoding(service_on, fake_pool, bucket, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    cookies = _owner(monkeypatch)
    for _ in range(images.MAX_ROOM_IMAGES):
        assert _upload(cookies, room_id, _png()).status_code == 201
    monkeypatch.setattr(images, "sanitize", lambda data: pytest.fail("decoded an upload a full room refused"))
    r = _upload(cookies, room_id, _png())
    assert r.status_code == 409 and r.json()["detail"]["error"] == "room_full"


@pytest.mark.parametrize("data, status, code", [
    (b"not an image at all", 415, "not_an_image"),
    (_bomb_header(), 413, "too_many_pixels"),
])
def test_refusals_say_why(service_on, fake_pool, bucket, monkeypatch, data, status, code):
    room_id = fake_pool.seed_room(owner_user_id=1)
    r = _upload(_owner(monkeypatch), room_id, data)
    assert r.status_code == status and r.json()["detail"]["error"] == code
    assert fake_pool.room_images == {} and bucket.objects == {}


def test_room_images_count_against_the_same_quota_as_saved_creations(service_on, fake_pool, bucket,
                                                                        monkeypatch):
    monkeypatch.setenv("SYNTH_STORAGE_QUOTA_MB", "1")
    room_id = fake_pool.seed_room(owner_user_id=1)
    fake_pool.artifact_bytes[1] = 1024 * 1024 - 10    # saved creations have used nearly all of it
    r = _upload(_owner(monkeypatch), room_id, _png())
    assert r.status_code == 413 and r.json()["detail"]["error"] == "storage_quota"
    assert fake_pool.room_images == {}


def test_used_bytes_adds_every_room_the_account_owns(fake_pool):
    mine, theirs = fake_pool.seed_room(owner_user_id=1), fake_pool.seed_room(owner_user_id=2)
    for iid, (room_id, size) in enumerate([(mine, 100), (mine, 50), (theirs, 7)], start=1):
        fake_pool.room_images[iid] = {"id": iid, "room_id": room_id, "position": iid, "width": 1,
                                      "height": 1, "bytes": size, "created_at": None}
    fake_pool.artifact_bytes[1] = 1000
    assert asyncio.run(used_bytes(fake_pool, 1)) == 1150


def test_without_a_bucket_uploads_are_refused_and_the_list_says_so(service_on, fake_pool, bucket,
                                                                     monkeypatch):
    bucket.on = False
    room_id = fake_pool.seed_room(owner_user_id=1)
    cookies = _owner(monkeypatch)
    # A 5xx body is scrubbed to a correlation id in service mode (server.py),
    # so the desk learns this from the list's storageEnabled, and the status.
    assert _upload(cookies, room_id, _png()).status_code == 503
    assert client.get(f"/api/thecommons/rooms/{room_id}/images", cookies=cookies).json()["storageEnabled"] is False


def test_a_failed_store_leaves_no_row(service_on, fake_pool, bucket, monkeypatch):
    bucket.fail_put = True
    room_id = fake_pool.seed_room(owner_user_id=1)
    r = _upload(_owner(monkeypatch), room_id, _png())
    assert r.status_code == 502 and fake_pool.room_images == {}


# ── ordering and deleting ────────────────────────────────────────────────────

def test_reordering_takes_every_image_exactly_once(service_on, fake_pool, bucket, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    cookies = _owner(monkeypatch)
    ids = [_upload(cookies, room_id, _png()).json()["id"] for _ in range(3)]
    order = f"/api/thecommons/rooms/{room_id}/images/order"
    r = client.put(order, json={"ids": [ids[2], ids[0], ids[1]]}, cookies=cookies)
    assert r.status_code == 200 and [i["id"] for i in r.json()["images"]] == [ids[2], ids[0], ids[1]]
    for wrong in ([ids[0], ids[1]], [ids[0], ids[0], ids[1]], [*ids, 999]):
        assert client.put(order, json={"ids": wrong}, cookies=cookies).status_code == 400
    listed = client.get(f"/api/thecommons/rooms/{room_id}/images", cookies=cookies).json()
    assert [i["id"] for i in listed["images"]] == [ids[2], ids[0], ids[1]]


def test_deleting_removes_the_row_and_the_object(service_on, fake_pool, bucket, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    cookies = _owner(monkeypatch)
    image_id = _upload(cookies, room_id, _png()).json()["id"]
    url = f"/api/thecommons/rooms/{room_id}/images/{image_id}"
    assert client.get(url, cookies=cookies).status_code == 200
    assert client.delete(url, cookies=cookies).status_code == 204
    assert fake_pool.room_images == {} and bucket.objects == {}
    assert client.delete(url, cookies=cookies).status_code == 404


def test_deleting_the_room_clears_its_images_from_the_bucket(service_on, fake_pool, bucket, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    cookies = _owner(monkeypatch)
    _upload(cookies, room_id, _png())
    assert client.delete(f"/api/thecommons/rooms/{room_id}", cookies=cookies).status_code == 204
    assert bucket.deleted_prefixes == [f"users/1/rooms/{room_id}/"]
    assert bucket.objects == {} and fake_pool.room_images == {}


# ── the wall ─────────────────────────────────────────────────────────────────

def test_the_wall_fetches_by_join_code_and_nothing_else(service_on, fake_pool, bucket, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1, join_code="wall-code")
    other = fake_pool.seed_room(owner_user_id=1, join_code="other-code")
    closed = fake_pool.seed_room(owner_user_id=1, join_code="closed-code", status="closed")
    cookies = _owner(monkeypatch)
    image_id = _upload(cookies, room_id, _png()).json()["id"]
    r = client.get(f"/api/thecommons/display/wall-code/images/{image_id}")   # no session: a wall has none
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert Image.open(io.BytesIO(r.content)).format == "WEBP"
    assert client.get(f"/api/thecommons/display/other-code/images/{image_id}").status_code == 404
    assert client.get(f"/api/thecommons/display/nope/images/{image_id}").status_code == 404
    closed_image = _upload(cookies, closed, _png()).json()
    assert client.get(f"/api/thecommons/display/closed-code/images/{closed_image.get('id', 0)}").status_code == 404
    assert other and closed


def test_a_wall_hears_about_uploads_and_deletes(service_on, fake_pool, bucket, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1, join_code="live-wall")
    cookies = _owner(monkeypatch)
    with client.websocket_connect("/ws/thecommons/live-wall?role=display") as wall:
        assert wall.receive_json() == {"type": "images", "images": []}
        assert wall.receive_json()["type"] == "sketch"
        image_id = _upload(cookies, room_id, _png(size=(64, 48))).json()["id"]
        assert wall.receive_json() == {"type": "images",
                                       "images": [{"id": image_id, "width": 64, "height": 48}]}
        client.delete(f"/api/thecommons/rooms/{room_id}/images/{image_id}", cookies=cookies)
        assert wall.receive_json() == {"type": "images", "images": []}   # back to the samples


def test_a_wall_that_connects_later_is_told_the_room_s_images_first(service_on, fake_pool, bucket,
                                                                    monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1, join_code="late-wall")
    image_id = _upload(_owner(monkeypatch), room_id, _png(size=(30, 20))).json()["id"]
    thecommons_relay._relays.clear()          # as if the server restarted: the list comes from the rows
    with client.websocket_connect("/ws/thecommons/late-wall?role=display") as wall:
        assert wall.receive_json() == {"type": "images", "images": [{"id": image_id, "width": 30, "height": 20}]}


class _Socket:
    def __init__(self):
        self.sent = []

    async def send_json(self, message):
        self.sent.append(message)


def test_phones_never_hear_about_images():
    relay = thecommons_relay.RoomRelay(1)
    wall, phone = _Socket(), _Socket()
    relay.displays.add(wall)
    relay.stations.add(phone)
    asyncio.run(relay.publish_images([{"id": 5, "width": 10, "height": 10}]))
    assert wall.sent == [{"type": "images", "images": [{"id": 5, "width": 10, "height": 10}]}]
    assert phone.sent == []
