"""Phase-4 tests — DSAR export/delete and the retention janitor."""

import asyncio

import pytest
from fastapi.testclient import TestClient

import backend.server as server
from backend.service import db as service_db
from backend.service import storage as service_storage
from backend.services import retention

from tests.test_service_auth import _fake_user
from tests.test_service_credits import FakePool, CLIENT_ID, _sign_in

client = TestClient(server.app, raise_server_exceptions=False)


@pytest.fixture
def service_on(monkeypatch):
    monkeypatch.setenv("SYNTH_AUTH", "1")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("SYNTH_TERMS_VERSION", "v0.2")
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)


@pytest.fixture
def fake_pool(monkeypatch):
    pool = FakePool()
    monkeypatch.setattr(service_db, "_pool", pool)
    return pool


def test_export_returns_attachment_json(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.get("/api/me/export", cookies=cookies)
    assert r.status_code == 200
    assert "attachment" in r.headers.get("content-disposition", "")
    body = r.json()
    assert set(body) == {"exported_at", "account", "credit_ledger",
                         "generation_log", "sessions", "feedback", "artifacts"}
    assert body["account"]["email"] == "artist@example.com"
    assert "prompt" not in str(body["generation_log"])  # metadata only, ever


def test_export_requires_session(service_on, fake_pool):
    assert client.get("/api/me/export").status_code == 401


def test_delete_account_removes_user_and_cookie(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.delete("/api/me", cookies=cookies)
    assert r.status_code == 200 and r.json()["status"] == "deleted"
    assert ("delete_user", 1) in fake_pool.ops
    assert 'synth_session="";' in r.headers.get("set-cookie", "") or \
           "synth_session=;" in r.headers.get("set-cookie", "")


def test_delete_requires_session(service_on, fake_pool):
    assert client.delete("/api/me").status_code == 401


def test_delete_is_404_locally(monkeypatch):
    monkeypatch.delenv("SYNTH_AUTH", raising=False)
    assert client.delete("/api/me").status_code == 404


def test_delete_account_purges_storage_before_row_delete(service_on, fake_pool, monkeypatch):
    calls = []
    monkeypatch.setattr(service_storage, "enabled", lambda: True)
    monkeypatch.setattr(service_storage, "delete_prefix", lambda prefix: calls.append(prefix) or 3)
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.delete("/api/me", cookies=cookies)
    assert r.status_code == 200
    assert calls == ["users/1/"]
    assert ("delete_user", 1) in fake_pool.ops


def test_delete_account_tolerates_storage_failure(service_on, fake_pool, monkeypatch):
    """A GCS hiccup must never block account deletion — it's left for the
    retention janitor's orphan sweep, not raised."""
    monkeypatch.setattr(service_storage, "enabled", lambda: True)

    def boom(prefix):
        raise RuntimeError("GCS hiccup")
    monkeypatch.setattr(service_storage, "delete_prefix", boom)
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.delete("/api/me", cookies=cookies)
    assert r.status_code == 200
    assert ("delete_user", 1) in fake_pool.ops


def test_delete_account_skips_storage_when_disabled(service_on, fake_pool, monkeypatch):
    monkeypatch.setattr(service_storage, "enabled", lambda: False)
    called = []
    monkeypatch.setattr(service_storage, "delete_prefix", lambda prefix: called.append(prefix))
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.delete("/api/me", cookies=cookies)
    assert r.status_code == 200
    assert called == []


def test_janitor_refunds_orphaned_reserves(service_on, fake_pool):
    fake_pool.orphans = [{"id": 5, "user_id": 1, "credits": 4}]
    summary = asyncio.run(retention.purge_service_db())
    assert summary["orphan_refunds"] == 1
    assert ("refund", 4) in fake_pool.ops
    assert fake_pool.balance == 304
    assert fake_pool.gen_rows[5]["status"] == "refunded"
    assert "refund" in fake_pool.ledger_reasons()


def test_janitor_noop_locally(monkeypatch):
    monkeypatch.delenv("SYNTH_AUTH", raising=False)
    assert asyncio.run(retention.purge_service_db()) == {}


def test_janitor_purges_storage_orphans(service_on, fake_pool, monkeypatch):
    """id=1 matches fake_pool.user (exists); id=99 doesn't — only 99 is an
    orphan (a users/{id}/ prefix outliving its deleted user row)."""
    monkeypatch.setattr(service_storage, "enabled", lambda: True)
    monkeypatch.setattr(service_storage, "list_user_ids_with_objects", lambda: [1, 99])
    purged = []
    monkeypatch.setattr(service_storage, "delete_prefix",
                         lambda prefix: purged.append(prefix) or 4)
    summary = asyncio.run(retention.purge_service_db())
    assert summary["storage_orphan_users"] == 1
    assert summary["storage_orphan_objects"] == 4
    assert purged == ["users/99/"]


def test_janitor_skips_storage_sweep_when_disabled(service_on, fake_pool, monkeypatch):
    monkeypatch.setattr(service_storage, "enabled", lambda: False)
    called = []
    monkeypatch.setattr(service_storage, "list_user_ids_with_objects",
                         lambda: called.append("listed") or [])
    summary = asyncio.run(retention.purge_service_db())
    assert called == []
    assert "storage_orphan_users" not in summary


def test_janitor_tolerates_listing_failure(service_on, fake_pool, monkeypatch):
    monkeypatch.setattr(service_storage, "enabled", lambda: True)

    def boom():
        raise RuntimeError("bucket unreachable")
    monkeypatch.setattr(service_storage, "list_user_ids_with_objects", boom)
    summary = asyncio.run(retention.purge_service_db())
    assert summary["storage_orphan_users"] == 0
    assert summary["storage_orphan_objects"] == 0
