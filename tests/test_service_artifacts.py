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
                       nbytes=1000, label=None, generation_id=1):
        aid = self._next_id
        self._next_id += 1
        self.artifacts[aid] = {
            "user_id": user_id, "generation_id": generation_id, "kind": kind,
            "mime": mime, "bytes": nbytes, "storage_path": storage_path,
            "label": label, "created_at": datetime.now(timezone.utc),
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
        if "SELECT storage_path FROM artifacts" in s:
            artifact_id, user_id = args
            row = self.artifacts.get(artifact_id)
            if row and row["user_id"] == user_id:
                return {"storage_path": row["storage_path"]}
            return None
        raise AssertionError(f"unexpected fetchrow: {s}")

    async def fetchval(self, sql, *args):
        s = self._norm(sql)
        if "SELECT COALESCE(SUM(bytes), 0) FROM artifacts" in s:
            (user_id,) = args
            return sum(a["bytes"] for a in self.artifacts.values()
                       if a["user_id"] == user_id)
        if "INSERT INTO artifacts" in s:
            user_id, generation_id, kind, mime, nbytes, storage_path, label = args
            aid = self._next_id
            self._next_id += 1
            self.artifacts[aid] = {
                "user_id": user_id, "generation_id": generation_id, "kind": kind,
                "mime": mime, "bytes": nbytes, "storage_path": storage_path,
                "label": label, "created_at": datetime.now(timezone.utc),
            }
            return aid
        raise AssertionError(f"unexpected fetchval: {s}")

    async def fetch(self, sql, *args):
        s = self._norm(sql)
        if "SELECT id, kind, mime, bytes, label, created_at FROM artifacts" in s:
            user_id, before_id, limit = args
            rows = [
                {"id": aid, "kind": a["kind"], "mime": a["mime"], "bytes": a["bytes"],
                 "label": a["label"], "created_at": a["created_at"]}
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
        raise AssertionError(f"unexpected execute: {s}")


class FakeStorage:
    def __init__(self, enabled=True, upload_error=None):
        self._enabled = enabled
        self.upload_error = upload_error
        self.uploads = []
        self.deletes = []
        self.signed = []

    def enabled(self):
        return self._enabled

    def put(self, storage_path, data, mime):
        if self.upload_error:
            raise self.upload_error
        self.uploads.append((storage_path, data, mime))

    def signed_url(self, storage_path, ttl_seconds=None):
        self.signed.append(storage_path)
        return f"https://signed.example/{storage_path}?ttl={ttl_seconds}"

    def delete(self, storage_path):
        self.deletes.append(storage_path)


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
