"""/api/feedback: JSONL persistence, size cap, Vercel fallback."""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import backend.routers.feedback as feedback_router


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(feedback_router, "FEEDBACK_DIR", tmp_path / "feedback")
    monkeypatch.delenv("VERCEL", raising=False)
    app = FastAPI()
    app.include_router(feedback_router.router)
    return TestClient(app)


class TestFeedbackWrites:
    def test_general_feedback_appends_jsonl(self, client, tmp_path):
        res = client.post("/api/feedback", json={
            "kind": "general",
            "message": "the knobs feel great",
            "surface": "settings",
        })
        assert res.status_code == 200
        files = list((tmp_path / "feedback").glob("feedback-*.jsonl"))
        assert len(files) == 1
        entry = json.loads(files[0].read_text(encoding="utf-8").strip())
        assert entry["kind"] == "general"
        assert entry["message"] == "the knobs feel great"
        assert "ts" in entry

    def test_block_report_carries_context_fields(self, client, tmp_path):
        res = client.post("/api/feedback", json={
            "kind": "wrongly_blocked",
            "message": "abstract paint splatter flagged as dangerous",
            "error_message": "Content blocked for SAFETY. (DANGEROUS_CONTENT: HIGH)",
            "categories": ["DANGEROUS_CONTENT"],
            "backend_tier": "google",
            "model": "gemini-3-pro-image-preview",
        })
        assert res.status_code == 200
        files = list((tmp_path / "feedback").glob("*.jsonl"))
        entry = json.loads(files[0].read_text(encoding="utf-8").strip())
        assert entry["categories"] == ["DANGEROUS_CONTENT"]
        assert entry["backend_tier"] == "google"

    def test_prompt_absent_unless_provided(self, client, tmp_path):
        client.post("/api/feedback", json={"kind": "general", "message": "hi"})
        files = list((tmp_path / "feedback").glob("*.jsonl"))
        entry = json.loads(files[0].read_text(encoding="utf-8").strip())
        assert "prompt" not in entry  # never auto-included

    def test_multiple_entries_append(self, client, tmp_path):
        client.post("/api/feedback", json={"message": "one"})
        client.post("/api/feedback", json={"message": "two"})
        files = list((tmp_path / "feedback").glob("*.jsonl"))
        lines = files[0].read_text(encoding="utf-8").strip().splitlines()
        assert len(lines) == 2


class TestLimitsAndFallbacks:
    def test_long_ascii_message_truncates_to_200(self, client):
        # ASCII messages are char-truncated server-side (8000) — under the cap.
        res = client.post("/api/feedback", json={"message": "x" * 40000})
        assert res.status_code == 200

    def test_oversized_multibyte_entry_is_413(self, client):
        # Truncation is per-CHARACTER; "м" is 2 UTF-8 bytes, so maxed-out
        # multibyte fields exceed the 32 KB byte cap: 8000×2 + 8000×2 + 2000×2
        # ≈ 36 KB → deterministic 413.
        res = client.post("/api/feedback", json={
            "message": "м" * 8000,
            "prompt": "м" * 8000,
            "error_message": "м" * 2000,
        })
        assert res.status_code == 413

    def test_vercel_returns_503_with_github_fallback(self, client, monkeypatch):
        monkeypatch.setenv("VERCEL", "1")
        res = client.post("/api/feedback", json={"message": "hello"})
        assert res.status_code == 503
        assert "github_url" in res.json()["detail"]
