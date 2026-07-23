"""Template-generation metadata — routers/templates.py.

Covers the two additions that let a generated template be saved to the gallery:
  1. the endpoint surfaces `generation_id` (the artifacts save endpoint requires
     an owned one — it didn't used to be returned);
  2. it attaches a snappy `template_name`, in service mode only, best-effort.

The heavy machinery (charged ledger, the LLM naming call, the mode dispatch) is
faked at the module boundary — same philosophy as the other service tests — so
these exercise the wrapper's plumbing, not Gemini.
"""

import asyncio

import pytest

import backend.routers.templates as tmod
from backend.models.requests import TemplateRequest


class _FakeCharge:
    """Doubles as both the `charged(...)` context manager and its `ch`."""
    def __init__(self, gen_id=4242):
        self.gen_id = gen_id

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def commit(self):
        pass


def _wire(monkeypatch, *, impl_result, service_mode, name="Neon Cats", gen_id=4242):
    async def fake_impl(request):
        return impl_result

    async def fake_name(template):
        return name

    monkeypatch.setattr(tmod, "_generate_template_impl", fake_impl)
    monkeypatch.setattr(tmod, "_safe_name_template", fake_name)
    monkeypatch.setattr(tmod, "charged", lambda *a, **k: _FakeCharge(gen_id))
    monkeypatch.setattr(tmod, "service_mode", lambda: service_mode)
    monkeypatch.setattr(tmod, "is_free_tier", lambda req: False)


def _run(req):
    return asyncio.run(tmod.generate_template(req, http_request=object()))


# ── generation_id + name surfacing ───────────────────────────────────────────

def test_surfaces_generation_id_and_name_in_service_mode(monkeypatch):
    _wire(monkeypatch,
          impl_result={"status": "success",
                       "template": {"promptTemplate": "a {{style}} cat",
                                    "variables": [{"name": "style"}]}},
          service_mode=True)
    res = _run(TemplateRequest(mode="text", prompt="cats"))
    assert res["generation_id"] == 4242
    assert res["template_name"] == "Neon Cats"


def test_no_name_call_outside_service_mode_but_gen_id_still_present(monkeypatch):
    """Local installs must pay no extra naming call — but a local caller has no
    gallery anyway, so only template_name is withheld; gen_id is harmless."""
    named = {"called": False}

    async def spy_name(template):
        named["called"] = True
        return "Should Not Appear"

    _wire(monkeypatch,
          impl_result={"status": "success", "template": {"promptTemplate": "x", "variables": []}},
          service_mode=False)
    monkeypatch.setattr(tmod, "_safe_name_template", spy_name)
    res = _run(TemplateRequest(mode="text", prompt="cats"))
    assert res["generation_id"] == 4242
    assert "template_name" not in res
    assert named["called"] is False, "naming must not run (or cost a call) on a local install"


def test_non_template_payload_gets_gen_id_but_no_name(monkeypatch):
    """p5_edit / workflow / taste payloads aren't {template:…} — no name, but the
    gen_id still rides along (harmless, and lets any future save bind to it)."""
    _wire(monkeypatch,
          impl_result={"status": "success", "mode": "p5_edit", "p5_code": "// ..."},
          service_mode=True)
    res = _run(TemplateRequest(mode="p5_edit", prompt="spin it"))
    assert res["generation_id"] == 4242
    assert "template_name" not in res


def test_name_failure_is_non_fatal(monkeypatch):
    """If naming returns None (timeout/error swallowed by _safe_name_template),
    the generation still returns cleanly without a template_name."""
    _wire(monkeypatch,
          impl_result={"status": "success", "template": {"promptTemplate": "x", "variables": []}},
          service_mode=True, name=None)
    res = _run(TemplateRequest(mode="text", prompt="cats"))
    assert res["status"] == "success"
    assert "template_name" not in res


# ── pure name sanitizer ──────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ('"Neon Cats"', "Neon Cats"),
    ("**Cyberpunk**", "Cyberpunk"),
    ("Ocean Depths Studio Reef", "Ocean Depths"),   # capped to 2 words
    ("Title.\nSecond line ignored", "Title"),        # first line only, trailing dot stripped
    ("`glitch`", "glitch"),
    ("<script>Neon", "scriptNeon"),   # angle brackets stripped (renders in button text)
    ("", None),
    ("   ", None),
])
def test_sanitize_name(raw, expected):
    assert tmod._sanitize_name(raw) == expected


def test_sanitize_name_caps_length():
    out = tmod._sanitize_name("Supercalifragilistic Expialidocious")
    assert out is not None and len(out) <= 24
