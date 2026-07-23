"""Artifacts ("My creations" gallery) tests — routers/artifacts.py.

No Postgres and no real GCS: a FakeArtifactsPool implements exactly the SQL
shapes the router emits (real metering-style logic, fake storage — same
philosophy as FakePool in test_service_credits.py, but scoped to just the
`generations` ownership lookup and the `artifacts` table, so it doesn't need
to also understand credit reserve/refund SQL). A FakeStorage monkeypatches
backend.service.storage's I/O functions (enabled/put/signed_url/delete)
directly on the module object artifacts.py imports — object_path is left
real since it's pure (no I/O), so path construction is exercised for real.

Auth/session helpers (_fake_user, _sign_in, CLIENT_ID) are reused from their
existing homes rather than redefined, matching test_service_dsar.py.
"""

import base64
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import backend.server as server
from backend.service import db as service_db
from backend.service import storage as artifacts_storage

from tests.test_service_auth import _fake_user
from tests.test_service_credits import CLIENT_ID, _sign_in

client = TestClient(server.app, raise_server_exceptions=False)

PNG_BYTES = b"\x89PNG\r\n\x1a\nfake-but-nonempty"
PNG_B64 = base64.b64encode(PNG_BYTES).decode()

THUMB_BYTES = b"\xff\xd8\xff\xe0fake-jpeg-thumb"   # JPEG SOI, non-empty
THUMB_B64 = base64.b64encode(THUMB_BYTES).decode()

TEMPLATE_JSON = b'{"promptTemplate":"a {{style}} cat","variables":[{"name":"style"}]}'
TEMPLATE_B64 = base64.b64encode(TEMPLATE_JSON).decode()


# ── fakes ────────────────────────────────────────────────────────────────────

class FakeArtifactsPool:
    def __init__(self):
        self.generations = {}   # id -> {"user_id":, "action":}
        self.artifacts = {}     # id -> row dict
        self._next_id = 1
        self.deleted_ids = []   # every id ever passed to DELETE, in order

    def seed_generation(self, gen_id, user_id, action):
        self.generations[gen_id] = {"user_id": user_id, "action": action}

    def seed_artifact(self, user_id, storage_path, kind="image", mime="image/png",
                       nbytes=1000, label=None, generation_id=1, thumb_path=None):
        aid = self._next_id
        self._next_id += 1
        self.artifacts[aid] = {
            "user_id": user_id, "generation_id": generation_id, "kind": kind,
            "mime": mime, "bytes": nbytes, "storage_path": storage_path,
            "label": label, "created_at": datetime.now(timezone.utc),
            "thumb_path": thumb_path,
        }
        return aid

    @staticmethod
    def _norm(sql):
        return " ".join(sql.split())

    async def fetchrow(self, sql, *args):
        s = self._norm(sql)
        if "SELECT action FROM generations" in s:
            gen_id, user_id = args
            gen = self.generations.get(gen_id)
            if gen and gen["user_id"] == user_id:
                return {"action": gen["action"]}
            return None
        # delete selects both paths; /url selects storage_path; /thumb selects thumb_path
        if "FROM artifacts WHERE id = $1 AND user_id = $2" in s and "SELECT" in s:
            artifact_id, user_id = args
            row = self.artifacts.get(artifact_id)
            if not (row and row["user_id"] == user_id):
                return None
            out = {}
            if "kind" in s:
                out["kind"] = row["kind"]
            if "mime" in s:
                out["mime"] = row["mime"]
            if "storage_path" in s:
                out["storage_path"] = row["storage_path"]
            if "thumb_path" in s:
                out["thumb_path"] = row.get("thumb_path")
            return out
        raise AssertionError(f"unexpected fetchrow: {s}")

    async def fetchval(self, sql, *args):
        s = self._norm(sql)
        if "SELECT COALESCE(SUM(bytes), 0) FROM artifacts" in s:
            (user_id,) = args
            return sum(a["bytes"] for a in self.artifacts.values()
                       if a["user_id"] == user_id)
        if "INSERT INTO artifacts" in s:
            (user_id, generation_id, kind, mime, nbytes,
             storage_path, label, thumb_path) = args
            aid = self._next_id
            self._next_id += 1
            self.artifacts[aid] = {
                "user_id": user_id, "generation_id": generation_id, "kind": kind,
                "mime": mime, "bytes": nbytes, "storage_path": storage_path,
                "label": label, "created_at": datetime.now(timezone.utc),
                "thumb_path": thumb_path,
            }
            return aid
        raise AssertionError(f"unexpected fetchval: {s}")

    async def fetch(self, sql, *args):
        s = self._norm(sql)
        if "SELECT id, kind, mime, bytes, label, created_at, thumb_path FROM artifacts" in s:
            user_id, before_id, limit = args
            rows = [
                {"id": aid, "kind": a["kind"], "mime": a["mime"], "bytes": a["bytes"],
                 "label": a["label"], "created_at": a["created_at"],
                 "thumb_path": a.get("thumb_path")}
                for aid, a in sorted(self.artifacts.items(), key=lambda kv: -kv[0])
                if a["user_id"] == user_id and (before_id is None or aid < before_id)
            ]
            return rows[:limit]
        raise AssertionError(f"unexpected fetch: {s}")

    async def execute(self, sql, *args):
        s = self._norm(sql)
        if "DELETE FROM artifacts WHERE id = $1" in s:
            (artifact_id,) = args
            self.deleted_ids.append(artifact_id)
            self.artifacts.pop(artifact_id, None)
            return
        if "UPDATE artifacts SET thumb_path = NULL WHERE id = $1" in s:
            (artifact_id,) = args
            if artifact_id in self.artifacts:
                self.artifacts[artifact_id]["thumb_path"] = None
            return
        raise AssertionError(f"unexpected execute: {s}")


class FakeStorage:
    THUMB_MIME = "image/jpeg"

    def __init__(self, enabled=True, upload_error=None, thumb_upload_error=None):
        self._enabled = enabled
        self.upload_error = upload_error
        self.thumb_upload_error = thumb_upload_error
        self.uploads = []
        self.deletes = []
        self.signed = []
        self.objects = {}   # storage_path -> data, for get()

    def enabled(self):
        return self._enabled

    def put(self, storage_path, data, mime):
        # A thumb upload can be made to fail independently of the main object,
        # to exercise the best-effort thumb path.
        if self.thumb_upload_error and storage_path.endswith("_thumb.jpg"):
            raise self.thumb_upload_error
        if self.upload_error and not storage_path.endswith("_thumb.jpg"):
            raise self.upload_error
        self.uploads.append((storage_path, data, mime))
        self.objects[storage_path] = data

    def get(self, storage_path):
        from google.api_core import exceptions as gcs_exceptions  # mirror real signature
        if storage_path not in self.objects:
            raise gcs_exceptions.NotFound("no such object")
        return self.objects[storage_path]

    def signed_url(self, storage_path, ttl_seconds=None):
        self.signed.append(storage_path)
        return f"https://signed.example/{storage_path}?ttl={ttl_seconds}"

    def delete(self, storage_path):
        self.deletes.append(storage_path)
        self.objects.pop(storage_path, None)


@pytest.fixture
def service_on(monkeypatch):
    monkeypatch.setenv("SYNTH_AUTH", "1")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("SYNTH_TERMS_VERSION", "v0.2")
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)


@pytest.fixture
def fake_pool(monkeypatch):
    pool = FakeArtifactsPool()
    monkeypatch.setattr(service_db, "_pool", pool)
    return pool


@pytest.fixture
def fake_storage(monkeypatch):
    fs = FakeStorage()
    monkeypatch.setattr(artifacts_storage, "enabled", fs.enabled)
    monkeypatch.setattr(artifacts_storage, "put", fs.put)
    monkeypatch.setattr(artifacts_storage, "get", fs.get)
    monkeypatch.setattr(artifacts_storage, "signed_url", fs.signed_url)
    monkeypatch.setattr(artifacts_storage, "delete", fs.delete)
    return fs


def _save_body(**over):
    body = {"data_b64": PNG_B64, "kind": "image", "mime": "image/png", "generation_id": 1}
    body.update(over)
    return body


# ── local mode: every endpoint 404s ─────────────────────────────────────────

def test_all_endpoints_404_locally(monkeypatch):
    monkeypatch.delenv("SYNTH_AUTH", raising=False)
    assert client.post("/api/artifacts", json=_save_body()).status_code == 404
    assert client.get("/api/me/artifacts").status_code == 404
    assert client.get("/api/artifacts/1/url").status_code == 404
    assert client.delete("/api/artifacts/1").status_code == 404


# ── anonymous: every endpoint 401s ──────────────────────────────────────────

def test_all_endpoints_401_when_signed_out(service_on, fake_pool, fake_storage):
    assert client.post("/api/artifacts", json=_save_body()).status_code == 401
    assert client.get("/api/me/artifacts").status_code == 401
    assert client.get("/api/artifacts/1/url").status_code == 401
    assert client.delete("/api/artifacts/1").status_code == 401


# ── save: ownership gate ────────────────────────────────────────────────────

def test_save_requires_owned_generation(service_on, fake_pool, fake_storage, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    # generation_id doesn't exist at all
    r = client.post("/api/artifacts", json=_save_body(generation_id=999), cookies=cookies)
    assert r.status_code == 404
    assert fake_storage.uploads == []


def test_save_requires_generation_belongs_to_caller(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=2, action="image")  # someone else's
    cookies = _sign_in(monkeypatch, _fake_user())  # signs in as id=1
    r = client.post("/api/artifacts", json=_save_body(generation_id=1), cookies=cookies)
    assert r.status_code == 404  # same 404 as "doesn't exist" — no confirmation either way
    assert fake_storage.uploads == []


def test_save_requires_compatible_action(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="text")  # not image/smart_transform
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts", json=_save_body(generation_id=1, kind="image"),
                    cookies=cookies)
    assert r.status_code == 404


def test_save_rejects_mismatched_mime(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts",
                     json=_save_body(generation_id=1, kind="image", mime="video/mp4"),
                     cookies=cookies)
    assert r.status_code == 400


def test_save_rejects_invalid_base64(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts",
                     json=_save_body(generation_id=1, data_b64="not-valid-base64!!"),
                     cookies=cookies)
    assert r.status_code == 400


# ── save: success path ───────────────────────────────────────────────────────

def test_save_success_uploads_and_inserts(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts",
                     json=_save_body(generation_id=1, label="my favorite"),
                     cookies=cookies)
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "image" and body["label"] == "my favorite"
    assert body["bytes"] == len(PNG_BYTES)

    (artifact_id,) = fake_pool.artifacts.keys()
    row = fake_pool.artifacts[artifact_id]
    assert row["user_id"] == 1 and row["generation_id"] == 1
    assert row["storage_path"].startswith("users/1/") and row["storage_path"].endswith(".png")

    (uploaded_path, uploaded_data, uploaded_mime) = fake_storage.uploads[0]
    assert uploaded_path == row["storage_path"]
    assert uploaded_data == PNG_BYTES
    assert uploaded_mime == "image/png"


def test_save_disabled_storage_is_503(service_on, fake_pool, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    monkeypatch.setattr(artifacts_storage, "enabled", lambda: False)
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts", json=_save_body(generation_id=1), cookies=cookies)
    assert r.status_code == 503
    assert fake_pool.artifacts == {}  # nothing left behind


def test_upload_failure_deletes_the_row(service_on, fake_pool, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    fs = FakeStorage(upload_error=RuntimeError("GCS is briefly unavailable"))
    monkeypatch.setattr(artifacts_storage, "enabled", fs.enabled)
    monkeypatch.setattr(artifacts_storage, "put", fs.put)
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts", json=_save_body(generation_id=1), cookies=cookies)
    assert r.status_code == 503
    assert fake_pool.artifacts == {}, "the inserted row must be rolled back on upload failure"
    assert len(fake_pool.deleted_ids) == 1


def test_quota_rejects_when_full(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    quota_bytes = 200 * 1024 * 1024  # DEFAULT_QUOTA_MB
    fake_pool.seed_artifact(user_id=1, storage_path="users/1/existing.png",
                             nbytes=quota_bytes - 10)  # 10 bytes of headroom left
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts", json=_save_body(generation_id=1), cookies=cookies)
    assert r.status_code == 413
    detail = r.json()["detail"]
    assert detail["error"] == "storage_quota"
    assert detail["limit_mb"] == 200
    assert fake_storage.uploads == []


# ── list ─────────────────────────────────────────────────────────────────────

def test_list_scoped_to_caller_with_quota_summary(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_artifact(user_id=1, storage_path="users/1/a.png", nbytes=1024 * 1024)
    fake_pool.seed_artifact(user_id=1, storage_path="users/1/b.png", nbytes=2 * 1024 * 1024)
    fake_pool.seed_artifact(user_id=2, storage_path="users/2/c.png", nbytes=99 * 1024 * 1024)
    cookies = _sign_in(monkeypatch, _fake_user())  # id=1
    r = client.get("/api/me/artifacts", cookies=cookies)
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 2  # not user 2's
    assert body["storage_used_mb"] == 3.0
    assert body["storage_limit_mb"] == 200


# ── signed URL + delete: ownership + storage-disabled behavior ─────────────

def test_foreign_artifact_is_404_for_url_and_delete(service_on, fake_pool, fake_storage, monkeypatch):
    other_id = fake_pool.seed_artifact(user_id=2, storage_path="users/2/secret.png")
    cookies = _sign_in(monkeypatch, _fake_user())  # id=1
    assert client.get(f"/api/artifacts/{other_id}/url", cookies=cookies).status_code == 404
    assert client.delete(f"/api/artifacts/{other_id}", cookies=cookies).status_code == 404
    assert fake_storage.signed == []
    assert fake_storage.deletes == []
    assert other_id in fake_pool.artifacts, "a foreign id must not be deletable"


def test_url_endpoint_returns_signed_url(service_on, fake_pool, fake_storage, monkeypatch):
    aid = fake_pool.seed_artifact(user_id=1, storage_path="users/1/mine.png")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.get(f"/api/artifacts/{aid}/url", cookies=cookies)
    assert r.status_code == 200
    body = r.json()
    assert "users/1/mine.png" in body["url"]
    assert body["expires_in"] == 600
    assert fake_storage.signed == ["users/1/mine.png"]


def test_url_endpoint_503_when_storage_disabled(service_on, fake_pool, monkeypatch):
    aid = fake_pool.seed_artifact(user_id=1, storage_path="users/1/mine.png")
    monkeypatch.setattr(artifacts_storage, "enabled", lambda: False)
    cookies = _sign_in(monkeypatch, _fake_user())
    assert client.get(f"/api/artifacts/{aid}/url", cookies=cookies).status_code == 503


def test_delete_removes_object_then_row(service_on, fake_pool, fake_storage, monkeypatch):
    aid = fake_pool.seed_artifact(user_id=1, storage_path="users/1/gone-soon.png")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.delete(f"/api/artifacts/{aid}", cookies=cookies)
    assert r.status_code == 200 and r.json()["status"] == "deleted"
    assert fake_storage.deletes == ["users/1/gone-soon.png"]
    assert aid not in fake_pool.artifacts


def test_delete_still_removes_row_when_storage_disabled(service_on, fake_pool, monkeypatch):
    """A disabled bucket must not leave a gallery entry permanently stuck."""
    aid = fake_pool.seed_artifact(user_id=1, storage_path="users/1/orphaned.png")
    fs = FakeStorage(enabled=False)
    monkeypatch.setattr(artifacts_storage, "enabled", fs.enabled)
    monkeypatch.setattr(artifacts_storage, "delete", fs.delete)
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.delete(f"/api/artifacts/{aid}", cookies=cookies)
    assert r.status_code == 200
    assert aid not in fake_pool.artifacts
    assert fs.deletes == [], "must not call a disabled storage backend"


# ── thumbnails (schema v3) ───────────────────────────────────────────────────

def test_save_with_thumb_stores_second_object_and_sets_thumb_path(
        service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts",
                     json=_save_body(generation_id=1, thumb_b64=THUMB_B64),
                     cookies=cookies)
    assert r.status_code == 200
    assert r.json()["has_thumb"] is True

    (aid,) = fake_pool.artifacts.keys()
    row = fake_pool.artifacts[aid]
    # main + thumb are siblings under the same key; thumb is always .jpg
    assert row["thumb_path"] is not None
    assert row["thumb_path"].startswith("users/1/") and row["thumb_path"].endswith("_thumb.jpg")
    assert row["thumb_path"] in fake_storage.objects
    assert fake_storage.objects[row["thumb_path"]] == THUMB_BYTES
    # bytes column reflects the MEDIA size only — the thumb is not counted
    assert row["bytes"] == len(PNG_BYTES)


def test_save_without_thumb_has_null_thumb_path(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts", json=_save_body(generation_id=1), cookies=cookies)
    assert r.status_code == 200 and r.json()["has_thumb"] is False
    (aid,) = fake_pool.artifacts.keys()
    assert fake_pool.artifacts[aid]["thumb_path"] is None


def test_thumb_upload_failure_does_not_fail_the_save(service_on, fake_pool, monkeypatch):
    """The media is already stored; a thumb hiccup just clears thumb_path."""
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    fs = FakeStorage(thumb_upload_error=RuntimeError("thumb put failed"))
    monkeypatch.setattr(artifacts_storage, "enabled", fs.enabled)
    monkeypatch.setattr(artifacts_storage, "put", fs.put)
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts",
                     json=_save_body(generation_id=1, thumb_b64=THUMB_B64),
                     cookies=cookies)
    assert r.status_code == 200, "a failed thumb must not fail the whole save"
    assert r.json()["has_thumb"] is False
    (aid,) = fake_pool.artifacts.keys()
    assert fake_pool.artifacts[aid]["thumb_path"] is None, "thumb_path cleared after upload failure"
    # the main object is still there
    assert fake_pool.artifacts[aid]["storage_path"] in fs.objects


def test_malformed_thumb_is_ignored_media_still_saves(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts",
                     json=_save_body(generation_id=1, thumb_b64="!!not base64!!"),
                     cookies=cookies)
    assert r.status_code == 200 and r.json()["has_thumb"] is False


def test_thumb_endpoint_returns_bytes_for_owner(service_on, fake_pool, fake_storage, monkeypatch):
    aid = fake_pool.seed_artifact(user_id=1, storage_path="users/1/a.png",
                                   thumb_path="users/1/a_thumb.jpg")
    fake_storage.objects["users/1/a_thumb.jpg"] = THUMB_BYTES
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.get(f"/api/artifacts/{aid}/thumb", cookies=cookies)
    assert r.status_code == 200
    assert r.content == THUMB_BYTES
    assert r.headers["content-type"] == "image/jpeg"
    assert "private" in r.headers.get("cache-control", "")


def test_thumb_endpoint_404_when_no_thumb(service_on, fake_pool, fake_storage, monkeypatch):
    aid = fake_pool.seed_artifact(user_id=1, storage_path="users/1/a.png", thumb_path=None)
    cookies = _sign_in(monkeypatch, _fake_user())
    assert client.get(f"/api/artifacts/{aid}/thumb", cookies=cookies).status_code == 404


def test_thumb_endpoint_is_owner_scoped(service_on, fake_pool, fake_storage, monkeypatch):
    """A foreign artifact's thumb must be a 404 — same as absent."""
    other = fake_pool.seed_artifact(user_id=2, storage_path="users/2/s.png",
                                     thumb_path="users/2/s_thumb.jpg")
    fake_storage.objects["users/2/s_thumb.jpg"] = THUMB_BYTES
    cookies = _sign_in(monkeypatch, _fake_user())  # id=1
    assert client.get(f"/api/artifacts/{other}/thumb", cookies=cookies).status_code == 404


def test_thumb_endpoint_404_when_object_missing(service_on, fake_pool, fake_storage, monkeypatch):
    """Row claims a thumb but the object is gone → 404, client falls back to icon."""
    aid = fake_pool.seed_artifact(user_id=1, storage_path="users/1/a.png",
                                   thumb_path="users/1/a_thumb.jpg")  # object NOT seeded
    cookies = _sign_in(monkeypatch, _fake_user())
    assert client.get(f"/api/artifacts/{aid}/thumb", cookies=cookies).status_code == 404


def test_list_reports_has_thumb(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_artifact(user_id=1, storage_path="users/1/withthumb.png",
                             thumb_path="users/1/withthumb_thumb.jpg")
    fake_pool.seed_artifact(user_id=1, storage_path="users/1/nothumb.png", thumb_path=None)
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.get("/api/me/artifacts", cookies=cookies)
    assert r.status_code == 200
    flags = {i["has_thumb"] for i in r.json()["items"]}
    assert flags == {True, False}


def test_delete_removes_both_main_and_thumb(service_on, fake_pool, fake_storage, monkeypatch):
    aid = fake_pool.seed_artifact(user_id=1, storage_path="users/1/gone.png",
                                   thumb_path="users/1/gone_thumb.jpg")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.delete(f"/api/artifacts/{aid}", cookies=cookies)
    assert r.status_code == 200
    assert set(fake_storage.deletes) == {"users/1/gone.png", "users/1/gone_thumb.jpg"}


# ── template kind (roadmap #3, explicit save) ────────────────────────────────

def test_save_template_kind_succeeds(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="template")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts", json={
        "data_b64": TEMPLATE_B64, "kind": "template", "mime": "application/json",
        "generation_id": 1, "label": "Neon Cats",
    }, cookies=cookies)
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "template" and body["label"] == "Neon Cats"
    (aid,) = fake_pool.artifacts.keys()
    assert fake_pool.artifacts[aid]["storage_path"].endswith(".json")
    assert fake_storage.uploads[0][2] == "application/json"


def test_template_kind_requires_template_action(service_on, fake_pool, fake_storage, monkeypatch):
    """An image generation_id can't be used to smuggle a template save."""
    fake_pool.seed_generation(gen_id=1, user_id=1, action="image")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts", json={
        "data_b64": TEMPLATE_B64, "kind": "template", "mime": "application/json",
        "generation_id": 1,
    }, cookies=cookies)
    assert r.status_code == 404
    assert fake_storage.uploads == []


def test_template_kind_rejects_non_json_mime(service_on, fake_pool, fake_storage, monkeypatch):
    fake_pool.seed_generation(gen_id=1, user_id=1, action="template")
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/artifacts", json={
        "data_b64": TEMPLATE_B64, "kind": "template", "mime": "image/png",
        "generation_id": 1,
    }, cookies=cookies)
    assert r.status_code == 400


def test_content_endpoint_returns_template_json_same_origin(
        service_on, fake_pool, fake_storage, monkeypatch):
    aid = fake_pool.seed_artifact(user_id=1, storage_path="users/1/t.json",
                                   kind="template", mime="application/json")
    fake_storage.objects["users/1/t.json"] = TEMPLATE_JSON
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.get(f"/api/artifacts/{aid}/content", cookies=cookies)
    assert r.status_code == 200
    assert r.content == TEMPLATE_JSON
    assert r.headers["content-type"].startswith("application/json")
    # never a signed URL for this path — it's a same-origin proxy
    assert fake_storage.signed == []


def test_content_endpoint_refuses_non_template_kind(service_on, fake_pool, fake_storage, monkeypatch):
    """Media must not be proxied through the app — /url (signed) is for those."""
    aid = fake_pool.seed_artifact(user_id=1, storage_path="users/1/big.png",
                                   kind="image", mime="image/png")
    cookies = _sign_in(monkeypatch, _fake_user())
    assert client.get(f"/api/artifacts/{aid}/content", cookies=cookies).status_code == 415


def test_content_endpoint_is_owner_scoped(service_on, fake_pool, fake_storage, monkeypatch):
    other = fake_pool.seed_artifact(user_id=2, storage_path="users/2/t.json",
                                     kind="template", mime="application/json")
    fake_storage.objects["users/2/t.json"] = TEMPLATE_JSON
    cookies = _sign_in(monkeypatch, _fake_user())  # id=1
    assert client.get(f"/api/artifacts/{other}/content", cookies=cookies).status_code == 404
