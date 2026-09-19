"""Tests for thecommons_generate.py — live Gemini wiring with the
validation-aware repair pass, no OpenAI, no credit charging (2026-09-16
scope). google_api.gen_text is stubbed at the module boundary (same
"AI calls are stubbed at the ai_manager instance" convention the rest of the
suite's tests use) so nothing touches the network or a real API key.
"""

import asyncio
import json

import pytest

from backend.ai_manager import ai_manager
from backend import config, google_api
from backend.service import thecommons_generate as gen
from backend.service import thecommons_ui
from backend.service.thecommons_ui import PANEL_MODEL, PANEL_PROMPT, SKINS, WIDGETS_BY_TYPE


VALID_SKETCH_JSON = json.dumps({
    "name": "Neon Drift",
    "promptTemplate": "a {{palette}} drift with {{speed}}",
    "code": "ctx.fillRect(0,0,frame.width,frame.height);",
    "variables": [
        {"name": "palette", "values": [
            {"text": "warm", "weight": 1}, {"text": "cool", "weight": 1}, {"text": "mono", "weight": 1},
        ]},
        {"name": "speed", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
    ],
})


@pytest.fixture
def gemini_configured(monkeypatch):
    monkeypatch.setattr(ai_manager, "genai_client", object())  # any truthy sentinel
    yield


class _Calls(list):
    """Sketch-model calls, in order. Panel-designer calls are kept apart in
    `.panel`, so a test about the sketch contract isn't thrown by the second
    call every successful generation now makes."""
    def __init__(self):
        super().__init__()
        self.panel = []


def _stub_calls(monkeypatch, responses, panel=None):
    """responses: list of (str | Exception) consumed in order, one per sketch
    call. `panel` answers every panel-design call; by default it errors, which
    means the default panel."""
    calls = _Calls()

    def fake_gen_text(client, model, blocks, **kwargs):
        call = {"model": model, "blocks": blocks, **kwargs}
        if kwargs.get("system_instruction") == PANEL_PROMPT:
            calls.panel.append(call)
            result = panel if panel is not None else RuntimeError("no panel stubbed")
        else:
            calls.append(call)
            result = responses[len(calls) - 1]
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(google_api, "gen_text", fake_gen_text)
    return calls


def test_no_key_configured_returns_fallback(monkeypatch):
    monkeypatch.setattr(ai_manager, "genai_client", None)
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is True
    assert sketch["reason"] == "no Gemini key configured"


def test_successful_generation_is_tagged_gemini_and_not_fallback(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, [VALID_SKETCH_JSON])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is False
    assert sketch["name"] == "Neon Drift"
    assert sketch["generation"] == {"provider": "gemini", "model": "gemini-3.8-flash",
                                    "panel": "default", "panelModel": PANEL_MODEL}
    assert len(calls) == 1
    assert calls[0]["json_mode"] is True
    assert calls[0]["system_instruction"] == gen.SYSTEM_PROMPT


def test_invalid_json_triggers_exactly_one_repair_then_succeeds(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, ["not valid json at all", VALID_SKETCH_JSON])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is False
    assert sketch["name"] == "Neon Drift"
    assert len(calls) == 2
    # The repair call must show the model its own broken output and the error.
    repair_text = calls[1]["blocks"][0]["text"]
    assert "not valid json at all" in repair_text
    assert "failed validation" in repair_text


def test_persistent_invalid_json_falls_back_after_exactly_one_repair(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, ["nope", "still nope"])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is True
    assert len(calls) == 2  # one original + one repair, never more


def test_network_error_falls_back_without_attempting_repair(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, [RuntimeError("HTTP 503")])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is True
    assert len(calls) == 1  # network/HTTP failures never trigger the repair pass


def test_repair_call_network_error_also_falls_back(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, ["not valid json", RuntimeError("timeout")])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is True
    assert len(calls) == 2


def test_remix_with_no_source_falls_back_without_calling_the_model(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, [VALID_SKETCH_JSON])
    sketch = asyncio.run(gen.generate_sketch("change it", mode="remix", source=None))
    assert sketch["fallback"] is True
    assert len(calls) == 0


def test_remix_prompt_flags_oversized_source_for_consolidation():
    source = {"sketch": {"id": "s1", "name": "Big", "variables": [
        {"name": f"v{i}"} for i in range(20)
    ]}, "values": {}}
    prompt = gen.generation_prompt("simplify it", mode="remix", source=source)
    assert "20 variables" in prompt
    assert "consolidate" in prompt


def test_api_key_is_redacted_from_fallback_reason(gemini_configured, monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "secret-key-123")
    from backend import config
    monkeypatch.setattr(config, "get_api_key", lambda: "secret-key-123")
    _stub_calls(monkeypatch, [RuntimeError("request failed with key secret-key-123 rejected")])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert "secret-key-123" not in sketch["reason"]
    assert "[redacted]" in sketch["reason"]


# ── which system prompt gets used ───────────────────────────────────────────

def test_ambient_prompt_never_mentions_triggers():
    ambient = gen.system_prompt()
    # The whole point of splitting the prompt: a model reaches for whatever is
    # in front of it, so an ambient piece must never be told buttons exist.
    assert "trigger" not in ambient.lower()
    assert "room.events" not in ambient
    # Persistent state stays in the base, though — it is the headline
    # improvement and an ambient piece wants it as much as a game does.
    assert "room.state" in ambient


def test_interactive_prompt_is_the_ambient_one_plus_a_block():
    ambient, interactive = gen.system_prompt(), gen.system_prompt(interactive=True)
    assert "room.events" in interactive
    assert '"type": "trigger"' in interactive
    # A shared base means the runtime contract can never drift between the two,
    # which is the failure mode two independent prompts would have.
    shared = ambient.split("- Respond with ONLY")[0]
    assert interactive.startswith(shared)



def test_prompt_says_ids_are_strings_and_room_state_is_never_replaced():
    # Both were real, measured failures (2026-09-19): `room.state ??= {...}` left every field
    # undefined (a blank wall), and `p.id * 97` on a hex id made every action draw at NaN.
    ambient, interactive = gen.system_prompt(), gen.system_prompt(interactive=True)
    for prompt in (ambient, interactive):
        assert "never replace it" in prompt and "room.state ??= {...} does" in prompt
        assert "opaque STRINGS" in prompt and "never do arithmetic" in prompt
        assert "OffscreenCanvas" in prompt
    # The event half of the rule stays out of the ambient prompt, like the rest of the events contract.
    assert "e.participantId" in interactive and "e.participantId" not in ambient


def test_both_prompts_offer_a_real_toggle():
    for prompt in (gen.system_prompt(), gen.system_prompt(interactive=True)):
        assert '"type": "toggle"' in prompt
        assert "Never fake an on/off as three choices" in prompt
    # The ambient prompt still never mentions triggers: a toggle is not an action.
    assert "trigger" not in gen.system_prompt().lower()

def test_generate_sketch_selects_the_prompt(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, [VALID_SKETCH_JSON, VALID_SKETCH_JSON])
    asyncio.run(gen.generate_sketch("a quiet moire study"))
    assert "trigger" not in calls[0]["system_instruction"].lower()
    asyncio.run(gen.generate_sketch("space invaders", interactive=True))
    assert "room.events" in calls[1]["system_instruction"]


def test_repair_pass_keeps_the_same_prompt(gemini_configured, monkeypatch):
    # If the repair fell back to the ambient contract, a first response that
    # correctly used triggers would be "fixed" by a model that has never heard
    # of them — silently stripping the buttons on the way through.
    calls = _stub_calls(monkeypatch, ["not json at all", VALID_SKETCH_JSON])
    asyncio.run(gen.generate_sketch("space invaders", interactive=True))
    assert len(calls) == 2
    assert all("room.events" in c["system_instruction"] for c in calls)


def test_sketches_run_on_3_8_flash_and_the_repair_matches_the_first_call(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, ["not json at all", VALID_SKETCH_JSON])
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is False and len(calls) == 2
    assert config.MODEL_COMMONS_SKETCH == "gemini-3.8-flash"
    # Its own constant: the template tools stay on Pro.
    assert config.MODEL_TEMPLATE_GEN == "gemini-3.1-pro-preview"
    first, repair = calls
    # Same model, same system prompt, same thinking level -- a repair on a
    # different setup could "fix" the piece into something else.
    assert first["model"] == repair["model"] == "gemini-3.8-flash"
    assert first["system_instruction"] == repair["system_instruction"]
    assert first["generation_config"] == repair["generation_config"] == {"thinking_level": gen.SKETCH_THINKING}
    assert gen.SKETCH_THINKING == "medium"                # 3.8 Flash errors on "minimal"
    assert sketch["generation"]["model"] == "gemini-3.8-flash"


# ── the panel designer: a second call, after a sketch succeeds ──────────────

PANEL_ANSWER = json.dumps({
    "skin": "textmode", "variant": "green", "title": "DRIFT.EXE", "tagline": "steer the neon",
    "groups": [{"title": "Look", "controls": ["palette"]}, {"title": "Move", "controls": ["speed"]}],
    "controls": {"palette": {"widget": "cycle"}, "speed": {"widget": "knob", "hint": "Faster drift"}},
    "mobile": {"density": "compact"}, "desktop": {"columns": 2},
    "css": "body { display: none }",
})


def test_a_successful_sketch_gets_its_panel_designed(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, [VALID_SKETCH_JSON], panel=PANEL_ANSWER)
    sketch = asyncio.run(gen.generate_sketch("neon drift for a hacker party"))
    assert sketch["fallback"] is False and sketch["modelAnswered"] is True
    assert sketch["generation"]["panel"] == "designed"
    assert sketch["ui"]["skin"] == "textmode" and sketch["ui"]["variant"] == "green"
    assert sketch["ui"]["controls"]["speed"] == {"widget": "knob", "hint": "Faster drift"}
    assert "css" not in sketch["ui"]                       # normalised on the way through
    # Exactly one extra call, on the fast model, with its own prompt.
    assert len(calls) == 1 and len(calls.panel) == 1
    panel_call = calls.panel[0]
    assert panel_call["model"] == PANEL_MODEL
    assert panel_call["json_mode"] is True
    request = panel_call["blocks"][0]["text"]
    piece = json.loads(request.split("PIECE:\n", 1)[1])
    assert piece["creatorRequest"] == "neon drift for a hacker party"
    assert piece["description"] == "a {{palette}} drift with {{speed}}"   # the piece's own look, in its words
    assert [c["name"] for c in piece["controls"]] == ["palette", "speed"]
    assert piece["controls"][1] == {"name": "speed", "label": "speed", "type": "number",
                                    "min": 0, "max": 10, "step": 1, "default": 5}
    assert "previousPanel" not in piece


def test_the_panel_runs_on_its_own_flash_model_at_low_thinking(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, [VALID_SKETCH_JSON], panel=PANEL_ANSWER)
    sketch = asyncio.run(gen.generate_sketch("neon drift"))
    assert PANEL_MODEL == config.MODEL_COMMONS_PANEL == "gemini-3.8-flash"
    # Not the shared fast constant: that one is a price-table key for MODEL_FAST too.
    assert PANEL_MODEL != config.MODEL_TEMPLATE_GEN_FAST
    assert calls.panel[0]["model"] == "gemini-3.8-flash"
    level = calls.panel[0]["generation_config"]["thinking_level"]
    assert level == "low"
    assert level in {"low", "medium", "high"}           # 3.8 Flash errors on "minimal"
    assert sketch["generation"]["panelModel"] == "gemini-3.8-flash"
    # The sketch call thinks harder than the panel does.
    assert calls[0]["generation_config"] == {"thinking_level": "medium"}


@pytest.mark.parametrize("answer", [
    RuntimeError("HTTP 503"),
    "not json",
    json.dumps({"skin": "vaporwave", "title": "nope"}),     # no usable skin: not a design
    json.dumps(["textmode"]),
])
def test_a_failed_panel_still_ships_the_sketch_at_the_same_charge(gemini_configured, monkeypatch, answer):
    calls = _stub_calls(monkeypatch, [VALID_SKETCH_JSON], panel=answer)
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["fallback"] is False
    # modelAnswered drives settlement: the sketch was delivered, so it's charged.
    assert sketch["modelAnswered"] is True
    assert "ui" not in sketch
    assert sketch["generation"]["panel"] == "default"
    assert len(calls.panel) == 1                            # tried once; never a repair pass


def test_a_slow_panel_is_abandoned_not_waited_for(gemini_configured, monkeypatch):
    import time
    monkeypatch.setattr(thecommons_ui, "PANEL_TIMEOUT_S", 0.05)

    def slow_panel(client, model, blocks, **kwargs):
        if kwargs.get("system_instruction") == PANEL_PROMPT:
            time.sleep(0.5)
            return PANEL_ANSWER
        return VALID_SKETCH_JSON

    monkeypatch.setattr(google_api, "gen_text", slow_panel)

    async def timed():
        # Timed inside the loop: asyncio.run() itself waits for the abandoned
        # worker thread on the way out, which a long-running server never does.
        started = time.monotonic()
        sketch = await gen.generate_sketch("swirling colors")
        return sketch, time.monotonic() - started

    sketch, elapsed = asyncio.run(timed())
    assert sketch["generation"]["panel"] == "default"
    assert elapsed < 0.45


def test_no_panel_call_for_a_fallback(gemini_configured, monkeypatch):
    for responses in (["nope", "still nope"], [RuntimeError("HTTP 503")]):
        calls = _stub_calls(monkeypatch, responses, panel=PANEL_ANSWER)
        sketch = asyncio.run(gen.generate_sketch("swirling colors"))
        assert sketch["fallback"] is True
        assert calls.panel == []


def test_a_repaired_sketch_gets_a_panel_too(gemini_configured, monkeypatch):
    calls = _stub_calls(monkeypatch, ["not json", VALID_SKETCH_JSON], panel=PANEL_ANSWER)
    sketch = asyncio.run(gen.generate_sketch("swirling colors"))
    assert sketch["ui"]["skin"] == "textmode"
    assert len(calls) == 2 and len(calls.panel) == 1


def test_a_remix_shows_the_designer_the_previous_panel(gemini_configured, monkeypatch):
    previous = {"skin": "trainer", "variant": "fire", "title": "OLD +2"}
    source = {"sketch": {**json.loads(VALID_SKETCH_JSON), "ui": previous}, "values": {}}
    calls = _stub_calls(monkeypatch, [VALID_SKETCH_JSON], panel=PANEL_ANSWER)
    asyncio.run(gen.generate_sketch("make it calmer", mode="remix", source=source))
    piece = json.loads(calls.panel[0]["blocks"][0]["text"].split("PIECE:\n", 1)[1])
    assert piece["previousPanel"] == previous
    assert piece["creatorRequest"] == "make it calmer"
    # The sketch model is never shown the panel: its contract has no such field.
    assert "OLD +2" not in calls[0]["blocks"][0]["text"]


def test_a_long_sketch_is_capped_before_it_reaches_the_designer(gemini_configured, monkeypatch):
    long_sketch = json.loads(VALID_SKETCH_JSON)
    long_sketch["code"] = "ctx.fillRect(0,0,1,1);\n" * 2000
    calls = _stub_calls(monkeypatch, [json.dumps(long_sketch)], panel=PANEL_ANSWER)
    asyncio.run(gen.generate_sketch("swirling colors"))
    piece = json.loads(calls.panel[0]["blocks"][0]["text"].split("PIECE:\n", 1)[1])
    assert len(piece["code"]) < thecommons_ui.PANEL_CODE_CAP + 100
    assert piece["code"].endswith("truncated */")


def test_the_panel_prompt_names_the_whole_vocabulary():
    """If a skin, variant or widget exists but the prompt never mentions it,
    the model can't choose it; if the prompt names one that doesn't exist,
    the normaliser silently discards it. Either way they have drifted."""
    for skin, meta in SKINS.items():
        if skin == "commons":
            continue                  # the default: never offered, only fallen back to
        assert f'"{skin}"' in PANEL_PROMPT, skin
        for variant in meta["variants"]:
            assert f'"{variant}"' in PANEL_PROMPT, (skin, variant)
    for widgets in WIDGETS_BY_TYPE.values():
        for widget in widgets:
            assert f'"{widget}"' in PANEL_PROMPT, widget
    assert '"commons"' not in PANEL_PROMPT
