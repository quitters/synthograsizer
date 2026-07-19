"""Credit metering tests — pricing, reserve/commit/refund, grants, endpoints.

Runs without Postgres: a FakePool implements exactly the SQL shapes
``backend/service/credits.py`` emits, so the real metering logic (atomic
conditional reserve, refund-on-failure, admin bypass, monthly grant, batch
stop-on-exhaustion, stream settle paths) executes for real — only the storage
is substituted. AI calls are stubbed at the ``ai_manager`` instance.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient

import backend.server as server
from backend import config
from backend.ai_manager import ai_manager
from backend.service import auth as service_auth
from backend.service import credits as service_credits
from backend.service import db as service_db
from backend.service import pricing

from tests.test_service_auth import _fake_user  # same shape, current period

client = TestClient(server.app, raise_server_exceptions=False)

CLIENT_ID = "679278101913-test.apps.googleusercontent.com"


# ── fake asyncpg pool ───────────────────────────────────────────────────────

class FakePool:
    def __init__(self, balance=300, period=None, user=None):
        self.balance = balance
        self.period = period or service_credits.current_period()
        self.user = user or _fake_user(credits_balance=balance)
        self.ops = []           # ("reserve"|"refund"|"ledger:<reason>"|"grant", ...)
        self.gen_rows = {}
        self._next_gen = 1

    # -- helpers ------------------------------------------------------------
    def _norm(self, sql):
        return " ".join(sql.split())

    def ledger_reasons(self):
        return [op[0].split(":", 1)[1] for op in self.ops if op[0].startswith("ledger:")]

    # -- asyncpg surface -----------------------------------------------------
    async def fetchval(self, sql, *args):
        s = self._norm(sql)
        if "SET credits_balance = credits_balance -" in s:
            cost, _uid = args
            if self.balance >= cost:
                self.balance -= cost
                self.ops.append(("reserve", cost))
                return self.balance
            return None
        if "SET credits_balance = credits_balance +" in s:
            cost, _uid = args
            self.balance += cost
            self.ops.append(("refund", cost))
            return self.balance
        if "INSERT INTO generations" in s:
            gid = self._next_gen
            self._next_gen += 1
            self.gen_rows[gid] = {"endpoint": args[1], "action": args[2], "model": args[3],
                                  "units": args[4], "credits": args[6], "usd": args[7],
                                  "status": "failed", "error": None}
            return gid
        if "SELECT credits_balance FROM users" in s:
            return self.balance
        raise AssertionError(f"unexpected fetchval: {s}")

    async def fetchrow(self, sql, *args):
        s = self._norm(sql)
        if "FOR UPDATE" in s:
            return {"credits_balance": self.balance, "credits_period": self.period}
        if "FROM users WHERE id" in s:
            return dict(self.user, credits_balance=self.balance, credits_period=self.period)
        raise AssertionError(f"unexpected fetchrow: {s}")

    async def execute(self, sql, *args):
        s = self._norm(sql)
        if "INSERT INTO credit_ledger" in s:
            reason = "grant" if "monthly_grant" in s else ("charge" if "'charge'" in s else "refund")
            self.ops.append((f"ledger:{reason}", args))
            return
        if "UPDATE generations SET status = 'ok'" in s:
            self.gen_rows[args[2]].update(status="ok", error=args[1])
            return
        if "UPDATE generations SET status = 'refunded'" in s:
            self.gen_rows[args[2]].update(status="refunded", error=args[1])
            return
        if "UPDATE users SET credits_balance = $1" in s:
            self.balance, self.period = args[0], args[1]
            self.ops.append(("grant", args[0]))
            return
        if "DELETE FROM sessions" in s or "UPDATE sessions" in s:
            return
        raise AssertionError(f"unexpected execute: {s}")

    def acquire(self):
        pool = self

        class _Acquire:
            async def __aenter__(self):
                class _Conn:
                    def transaction(self):
                        class _Tx:
                            async def __aenter__(self): return self
                            async def __aexit__(self, *a): return False
                        return _Tx()
                    fetchrow = pool.fetchrow
                    execute = pool.execute
                    fetchval = pool.fetchval
                return _Conn()
            async def __aexit__(self, *a):
                return False
        return _Acquire()


# ── fixtures ────────────────────────────────────────────────────────────────

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


def _sign_in(monkeypatch, user):
    async def fake_resolve(token):
        return user, None
    monkeypatch.setattr(service_auth, "resolve_session", fake_resolve)
    return {service_auth.COOKIE_NAME: "tok"}


def _stub_text(monkeypatch, result="stubbed text"):
    if isinstance(result, Exception):
        def fn(prompt, model=None):
            raise result
    else:
        def fn(prompt, model=None):
            return result
    monkeypatch.setattr(ai_manager, "generate_text", fn, raising=False)


# ── pricing table ───────────────────────────────────────────────────────────

def test_pricing_resolution():
    assert pricing.resolve("text", config.MODEL_TEMPLATE_GEN_FAST) == (1, 0.01, "call")
    assert pricing.resolve("text", config.MODEL_TEXT_CHAT) == (5, 0.05, "call")
    assert pricing.resolve("image", config.MODEL_IMAGE_GEN_FAST, 2) == (8, 0.08, "image")
    assert pricing.resolve("image", config.MODEL_IMAGE_GEN_HQ) == (15, 0.15, "image")
    assert pricing.resolve("smart_transform", config.MODEL_IMAGE_GEN_NB2) == (7, 0.07, "call")
    assert pricing.resolve("analyze", None, 3) == (6, 0.06, "image")
    assert pricing.resolve("template", config.MODEL_TEMPLATE_GEN, 2) == (7, 0.07, "call")
    assert pricing.resolve("video", config.MODEL_VIDEO_GEN, 8) == (320, 3.2, "sec")


def test_pricing_rejects_unknown_models():
    with pytest.raises(pricing.InvalidModel):
        pricing.resolve("text", "gemini-exp-9999")
    with pytest.raises(pricing.InvalidModel):
        pricing.resolve("image", config.MODEL_TEXT_CHAT)  # text model can't bill as image


# ── charge lifecycle through the real endpoints ─────────────────────────────

def test_text_generation_charges_and_reports_balance(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    _stub_text(monkeypatch)
    r = client.post("/api/generate/text",
                    json={"prompt": "hi", "model": config.MODEL_TEMPLATE_GEN_FAST},
                    cookies=cookies)
    assert r.status_code == 200
    assert r.headers["X-Credits-Balance"] == "299"
    assert ("reserve", 1) in fake_pool.ops
    assert fake_pool.ledger_reasons() == ["charge"]
    (gen,) = fake_pool.gen_rows.values()
    assert gen["status"] == "ok" and gen["action"] == "text" and gen["credits"] == 1


def test_upstream_failure_refunds(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    _stub_text(monkeypatch, RuntimeError("upstream boom"))
    r = client.post("/api/generate/text",
                    json={"prompt": "hi", "model": config.MODEL_TEMPLATE_GEN_FAST},
                    cookies=cookies)
    assert r.status_code == 500
    assert fake_pool.balance == 300  # reserve then refund → net zero
    assert fake_pool.ledger_reasons() == ["charge", "refund"]
    (gen,) = fake_pool.gen_rows.values()
    assert gen["status"] == "refunded"


def test_out_of_credits_402(service_on, monkeypatch):
    pool = FakePool(balance=0)
    monkeypatch.setattr(service_db, "_pool", pool)
    cookies = _sign_in(monkeypatch, _fake_user(credits_balance=0))
    _stub_text(monkeypatch)
    r = client.post("/api/generate/text",
                    json={"prompt": "hi", "model": config.MODEL_TEXT_CHAT},
                    cookies=cookies)
    assert r.status_code == 402
    detail = r.json()["detail"]
    assert detail["error"] == "out_of_credits"
    assert detail["needed"] == 5 and detail["balance"] == 0
    assert pool.gen_rows == {}  # nothing logged, nothing charged


def test_unknown_model_is_400(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/generate/text",
                    json={"prompt": "hi", "model": "gemini-exp-9999"}, cookies=cookies)
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "invalid_model"
    assert fake_pool.ops == []


def test_admin_is_logged_but_not_debited(service_on, fake_pool, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "artist@example.com")
    cookies = _sign_in(monkeypatch, _fake_user())
    _stub_text(monkeypatch)
    r = client.post("/api/generate/text",
                    json={"prompt": "hi", "model": config.MODEL_TEXT_CHAT}, cookies=cookies)
    assert r.status_code == 200
    assert "X-Credits-Balance" not in r.headers
    assert fake_pool.balance == 300 and fake_pool.ledger_reasons() == []
    (gen,) = fake_pool.gen_rows.values()
    assert gen["status"] == "ok" and gen["credits"] == 0 and gen["usd"] == 0.05


def test_video_blocked_for_free_tier(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    r = client.post("/api/generate/video", json={"prompt": "a shot"}, cookies=cookies)
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "tier_video"
    assert fake_pool.ops == [] and fake_pool.gen_rows == {}


def test_video_admin_logs_real_usd(service_on, fake_pool, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "artist@example.com")
    cookies = _sign_in(monkeypatch, _fake_user())

    async def fake_video(*a, **k):
        return {"video_b64": "AAAA", "video_uri": None}
    monkeypatch.setattr(ai_manager, "generate_video", fake_video, raising=False)

    r = client.post("/api/generate/video", json={"prompt": "a shot", "duration": 8},
                    cookies=cookies)
    assert r.status_code == 200
    (gen,) = fake_pool.gen_rows.values()
    assert gen["action"] == "video" and gen["credits"] == 0 and gen["usd"] == 3.2


def test_batch_text_stops_on_exhaustion(service_on, monkeypatch):
    pool = FakePool(balance=1)
    monkeypatch.setattr(service_db, "_pool", pool)
    cookies = _sign_in(monkeypatch, _fake_user(credits_balance=1))
    _stub_text(monkeypatch)
    r = client.post("/api/batch/text",
                    json={"prompts": ["a", "b", "c"], "model": config.MODEL_TEMPLATE_GEN_FAST},
                    cookies=cookies)
    assert r.status_code == 200
    results = r.json()["results"]
    assert [x["status"] for x in results] == ["success", "error"]  # stopped, no third try
    assert results[1]["error"] == "out_of_credits"


def test_stream_commits_on_output(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    monkeypatch.setattr(ai_manager, "generate_text_stream",
                        lambda prompt, model=None: iter(["al", "pha"]), raising=False)
    r = client.post("/api/generate/text/stream",
                    json={"prompt": "hi", "model": config.MODEL_TEMPLATE_GEN_FAST},
                    cookies=cookies)
    assert r.status_code == 200 and r.text == "alpha"
    (gen,) = fake_pool.gen_rows.values()
    assert gen["status"] == "ok"
    assert fake_pool.ledger_reasons() == ["charge"]


def test_stream_refunds_when_nothing_produced(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())

    def broken(prompt, model=None):
        raise RuntimeError("no stream for you")
        yield  # pragma: no cover — makes this a generator factory
    monkeypatch.setattr(ai_manager, "generate_text_stream", broken, raising=False)
    r = client.post("/api/generate/text/stream",
                    json={"prompt": "hi", "model": config.MODEL_TEMPLATE_GEN_FAST},
                    cookies=cookies)
    assert r.status_code == 200 and r.text == ""  # stream had already opened
    (gen,) = fake_pool.gen_rows.values()
    assert gen["status"] == "refunded"
    assert fake_pool.balance == 300


def test_monthly_grant_resets_stale_period(service_on, monkeypatch):
    pool = FakePool(balance=7, period="2020-01",
                    user=_fake_user(credits_balance=7))
    monkeypatch.setattr(service_db, "_pool", pool)
    cookies = _sign_in(monkeypatch, _fake_user(credits_balance=7, credits_period="2020-01"))
    _stub_text(monkeypatch)
    r = client.post("/api/generate/text",
                    json={"prompt": "hi", "model": config.MODEL_TEMPLATE_GEN_FAST},
                    cookies=cookies)
    assert r.status_code == 200
    assert any(op[0] == "grant" for op in pool.ops)
    assert pool.period == service_credits.current_period()
    # grant reset to 300, then this call charged 1
    assert r.headers["X-Credits-Balance"] == "299"


def test_admin_endpoints_hidden_from_non_admins(service_on, fake_pool, monkeypatch):
    cookies = _sign_in(monkeypatch, _fake_user())
    assert client.get("/api/admin/stats", cookies=cookies).status_code == 404
    assert client.get("/api/admin/users", cookies=cookies).status_code == 404


def test_charged_is_noop_without_service_mode(monkeypatch):
    monkeypatch.delenv("SYNTH_AUTH", raising=False)

    class DummyReq:
        class state:
            pass
        class url:
            path = "/x"

    async def run():
        async with service_credits.charged(DummyReq(), action="text",
                                           model="anything-goes") as ch:
            ch.commit()
    asyncio.run(run())  # would raise if it touched pricing or the (absent) pool
