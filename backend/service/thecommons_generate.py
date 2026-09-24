"""The Commons — sketch generation: live Gemini, with a validation-aware
repair pass and a fallback pool for everything else.

Ports the Gemini half of TheCommons' server/generate.js onto the suite's own
Gemini call layer (backend/google_api.py) instead of a raw HTTP fetch, so
Commons gets the suite's existing Interactions/legacy dispatch, JSON-mode
degrade-retry, and safety-block translation for free. OpenAI is deliberately
not ported (owner's call, 2026-09-16) — Gemini only.

No credit charging here either (also the owner's call, same date): this
calls the model directly with no reserve/commit/refund around it. The daily
USD budget breaker and per-user rate limiting already apply automatically —
/api/thecommons/generate is in enforcement.AI_PREFIXES — but no credits are
deducted per call yet. Adding that is a later, separate piece of work; see
TheCommons/docs/HANDOFF.md's "Credit-enforcement gaps" section.

The repair pass is flattened into a single user turn (original prompt, then
the model's own invalid response, then the validation error and a fix
request) rather than true multi-turn role-alternating history: the suite's
gen_text()/create_interaction() surface a system_instruction + a flat content
list, not a chat-turns API, and google_api.gen_chat() (which does support
turns) has no system_instruction/json_mode support to extend for one caller.
A single well-structured user message carrying the same information serves
the same purpose without adding a new shape to shared plumbing.
"""

import asyncio
import json
import logging
import re
import secrets
from typing import Any

from backend import config
from backend import google_api
from backend.service.thecommons_builtin import BUILTIN_SKETCHES
from backend.service.thecommons_templates import load_template_library
from backend.service.thecommons_ui import PANEL_MODEL, design_panel
from backend.service.thecommons_validate import MAX_VARIABLES, InvalidSketchError, validate_native_sketch

logger = logging.getLogger(__name__)

# Deliberately narrow: this system prompt only ever asks for Canvas2D drawing
# CODE, never an image or video generation call. Ported verbatim from
# TheCommons' server/generate.js — see AGENTS.md / README.md there for why.
_BASE_PROMPT = """You write short JavaScript Canvas2D drawing code for a live, shared
generative art piece running at a public event. Multiple people steer it together via knobs
mapped to your "variables", and it reacts to live music playing in the room.

VISUAL INTENT:
- Let the requested visual technique determine the drawing: a moire study needs interfering
  lines, an orbit study needs orbital motion. Do not answer every idea with the same particles.
- Translate mood into a deliberate composition, palette, and movement. Keep the result legible
  on a distant wall, with a composed first frame and a visible animation even when audio is zero.

RUNTIME CONTRACT -- your "code" field runs every animation frame as the BODY of a function
(ctx, frame, getVar, audio, room) => { ...your code... }. Do not include the function wrapper itself.
- ctx: CanvasRenderingContext2D, already sized to frame.width x frame.height.
- frame: { t (seconds elapsed), width, height, dt (seconds since last frame) }.
- getVar(name): returns CURRENT selected text for a choice, a number for a numeric control, or null.
- audio: { level, bass, mid, treble } each 0..1, plus audio.beat (boolean). Use these to make
  the piece visibly react to the music -- e.g. scale, rotate, spawn, or recolor on audio.bass
  or audio.beat, not just on frame.t.
- room.state: an object you own and may mutate freely. It PERSISTS between frames and is
  cleared only when a new piece loads -- it is the only way to remember anything. Initialise
  once and reuse it: room.state.dots ??= []; then update that same array each frame. room.state
  itself always exists already: give it fields, never replace it -- room.state ??= {...} does
  nothing, so fields set that way stay undefined. Keep it
  BOUNDED -- cap anything you grow (around 200 entries) and drop the oldest, because this runs
  for hours on a wall and an array that only grows will eventually stall the display.
- room.people: everyone connected right now, as [{id, table, hue}] with hue 0-359. Optional,
  but drawing one element per person makes the room itself part of the composition. id and
  table are opaque STRINGS (like "a3f90c1e..." and "table-2"): compare them, never do arithmetic
  on them -- p.id * 97 is NaN, and a NaN position draws nothing. For a number per person, use
  their hue or their index in room.people.

RULES:
- Pure Canvas2D only. No p5.js, no external libraries, no network calls, no image/video generation.
- 2-24 variables. This is a hard limit that always applies, even if the request explicitly asks
  for more -- satisfy that intent by combining related ideas into fewer, richer controls rather
  than exceeding 24; a rejected sketch serves the room worse than a slightly consolidated one.
  Use selectable choices for categorical ideas such as palette, shape family, or motion style.
  Use numeric sliders only for real quantities such as speed, count, scale, or line width.
  Choose controls that suit the requested piece; not every variable is numeric. More variables
  is not automatically better -- reach for the fuller range when the idea genuinely calls for
  it, not as a default.
- Numeric controls have type:"number", min, max, step, and default (all numbers), and NO
  values array. Require min < max, step > 0, and max/default on the step grid from min.
  The default must be inside the range. Pick useful, finite ranges with sensible performance
  limits for a shared display. Read numbers directly: const speed = getVar('speed') ?? 0.5;
  use ?? rather than || so zero remains a valid value.
- Selectable controls have 3-10 weighted values and no numeric range fields.
- A genuine on/off idea is a toggle: {"name": "trails", "label": "Trails", "type": "toggle",
  "default": true} -- no values, no range. It needs its {{placeholder}} like any other control.
  Read it with const trails = getVar('trails') ?? true; Never fake an on/off as three choices.
- Give each variable a unique snake_case name and a short human label. Values are unique
  {text, weight} objects with weights 1, 2, or 3. Include every variable as a {{name}}
  placeholder in promptTemplate, and never refer to an undeclared placeholder.
- For categorical parameters, use lookup maps whose keys exactly match the declared value
  texts. Read each getVar once per frame and fall back to the first option if it is unknown.
  Example: const speeds = { calm: 0.2, drifting: 0.6, lively: 1.2 };
  const speed = speeds[getVar('motion')] ?? speeds.calm;
- Every knob must visibly affect a distinct part of the piece. Order choices coherently,
  from quieter to more expressive, and make the first choice an inviting starting point.
- Your code body re-runs from the top every frame, so local variables do NOT survive. Anything
  the piece must remember belongs in room.state; everything else should be derived from frame.t
  and audio each time (or rely on the canvas's own existing pixel content for trail effects,
  e.g. a low-alpha fillRect before drawing).
- Keep loops bounded and drawing self-contained. The canvas context is REUSED between frames,
  so wrap ctx.save()/ctx.restore() around anything you change on it -- transforms, but equally
  globalCompositeOperation, globalAlpha, filter and line dash. Leaving one set will corrupt the
  next frame's very first draw, including your own background. Fill the background unless trails
  are intentional. For an offscreen buffer use new OffscreenCanvas(w, h). No DOM access, timers,
  event listeners, imports, global state, or unfinished code. Do not emit a p5Code field."""


# Appended only for an interactive piece. Kept out of the base deliberately:
# a model reaches for whatever is in front of it, so a prompt that explains
# SHOOT buttons will put one on a moire study. Dilution, not length, is what
# degrades a long contract — so an ambient piece never sees these rules.
_INTERACTIVE_RULES = """INTERACTIVE ACTIONS -- this piece reacts to deliberate actions, not only to knob settings.
- room.events: the actions taken since the last frame, as [{name, participantId, table, t}].
  Read it every frame; it is cleared for you afterwards. An event is MOMENTARY -- react to it
  and store the consequence in room.state, which is the thing that actually persists.
  Example: for (const e of room.events) if (e.name === 'shoot') room.state.shots.push({x: 0.5, t: frame.t});
- e.participantId and e.table are the same opaque strings as in room.people: find the person with
  room.people.find(p => p.id === e.participantId) and use their hue or index, and allow for
  not finding them (they may have just left).
- Declare an action as a trigger control:
    {"name": "shoot", "label": "Shoot", "type": "trigger", "share": "all"}
  A trigger has NO values array, NO numeric range, and takes NO placeholder in promptTemplate.
- "share" is valid ONLY on a trigger. "all" means everyone in the room can fire it -- use that
  for the action you want the whole room doing together. "one" (the default) means only its
  assigned owner can fire it, which suits a single decisive action like a reset or a view change.
- Use 1-3 triggers, and keep at least three ordinary controls so a full room still has knobs to
  divide between people. Make every fired action produce an immediate, visible result on screen."""


_OUTPUT_TAIL = """- Respond with ONLY the JSON object below. No markdown fences, no commentary, no extra keys.

{
  "name": "string",
  "promptTemplate": "string with {{snake_case_var}} placeholders, PLACEHOLDER_NOTE",
  "code": "JavaScript source, the BODY only (see RUNTIME CONTRACT)",
  "variables": [
    {"name": "string", "label": "string", "type": "number", "min": 0, "max": 10, "step": 1, "default": 5},
    {"name": "string", "label": "string", "values": [{"text": "string", "weight": 1}]},
    {"name": "string", "label": "string", "type": "toggle", "default": true}TRIGGER_LINE
  ]
}"""


def system_prompt(*, interactive: bool = False) -> str:
    """One shared contract plus an optional block — not one monolith, and not
    two prompts that drift apart. The creator picks the mode on the desk, so
    nothing here costs a classifier call to route."""
    tail = _OUTPUT_TAIL.replace(
        "PLACEHOLDER_NOTE",
        "one per select, number or toggle control (a trigger takes none)" if interactive else "one per variable",
    ).replace(
        "TRIGGER_LINE",
        ',\n    {"name": "string", "label": "string", "type": "trigger", "share": "all"}'
        if interactive else "",
    )
    parts = [_BASE_PROMPT]
    if interactive:
        parts.append("\n" + _INTERACTIVE_RULES)
    parts.append(tail)
    return "\n".join(parts)


# Preserved for callers and tests that want the default (ambient) contract.
SYSTEM_PROMPT = system_prompt()

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```\s*$")


def _random_id() -> str:
    return secrets.token_hex(4)


def pick_fallback() -> dict:
    """Random pick across the native builtins + inherited p5 library — the
    same combined pool generate.js's pickFallback() draws from."""
    pool = [*BUILTIN_SKETCHES, *load_template_library()]
    sketch = secrets.choice(pool)
    return {**sketch, "id": _random_id()}


def _fallback(reason: str, *, model_answered: bool) -> dict:
    """``model_answered`` drives credit settlement (see thecommons_jobs.py):
    True means the model returned a response we then couldn't use, which was
    really billed by Google and is also the one path a user could deliberately
    provoke with an adversarial prompt — so the charge stands. False means no
    usable response ever came back (no key, rejected input, transport
    failure), which is refunded: nothing chargeable happened, and a user
    can't provoke it on demand."""
    return {**pick_fallback(), "fallback": True, "reason": reason, "modelAnswered": model_answered}


def generation_prompt(prompt: str, *, mode: str = "create", source: dict | None = None) -> str:
    """Direct port of generate.js's generationPrompt()."""
    if mode != "remix":
        return prompt
    if not source or not source.get("sketch"):
        raise ValueError("Remix requires a source sketch")
    sketch = source["sketch"]
    source_count = len(sketch.get("variables") or [])
    cap_note = ""
    if source_count > MAX_VARIABLES:
        cap_note = (
            f" The source below has {source_count} variables, more than your 2-{MAX_VARIABLES} output limit "
            "allows -- you MUST consolidate, merge, or drop the least essential ones (keep "
            "whichever are most central to the piece's identity and to the requested change) "
            f"rather than returning all of them. Never exceed {MAX_VARIABLES} variables."
        )
    p5_note = (
        "The source is an inherited p5 sketch, provided only as a visual/algorithm reference. "
        "Reimplement the requested result in the native Canvas2D contract; never return p5Code "
        "or combine runtimes."
        if sketch.get("p5Code") else
        "The source uses the same native Canvas2D contract as your output."
    )
    source_data = json.dumps({
        "name": sketch.get("name"), "promptTemplate": sketch.get("promptTemplate"),
        "variables": sketch.get("variables"), "code": sketch.get("code"), "p5Code": sketch.get("p5Code"),
        "currentValues": source.get("values"),
    })
    return (
        "Remix the existing piece below according to the user's instructions. Preserve its "
        "visual identity, code structure, controls, and current settings unless the requested "
        f"changes require replacing them. Keep compatible variable names.{cap_note} Your output's "
        "variables and promptTemplate placeholders must match each other exactly, not the "
        "source's -- if you drop or rename a variable, update or remove its placeholder in "
        "promptTemplate too. Use current settings as numeric defaults and first choices where "
        "possible. Return a COMPLETE replacement native Canvas2D sketch, never a patch.\n"
        f"{p5_note}\n\nSOURCE DATA:\n{source_data}\n\nUSER CHANGE REQUEST:\n{prompt}"
    )


def _parse_sketch(text: str) -> dict:
    cleaned = _FENCE_RE.sub("", text.strip())
    return validate_native_sketch(json.loads(cleaned))


# "medium" is 3.8 Flash's default, sent explicitly so a change of default
# upstream can't silently change what a generation costs or produces. Measured
# against "low" on the same prompts: equally valid, but only medium grew a
# working reaction-diffusion field, for ~1.6x the tokens. ("minimal" is not
# supported and errors.)
SKETCH_THINKING = "medium"


async def _call_gemini(genai_client, text: str, *, interactive: bool = False) -> str:
    # The repair pass comes through here too, so it always gets the same model,
    # prompt and thinking level as the call it is repairing.
    return await asyncio.to_thread(
        google_api.gen_text, genai_client, config.MODEL_COMMONS_SKETCH,
        [google_api.text_block(text)],
        system_instruction=system_prompt(interactive=interactive), json_mode=True,
        generation_config={"thinking_level": SKETCH_THINKING},
    )


def _repair_text(original_response: str, error: str) -> str:
    return (
        f"That response failed validation: {error}. Return a corrected, COMPLETE replacement "
        "JSON sketch that fixes this specific problem -- keep the rest of the sketch (visual "
        "concept, code, other variables) the same wherever possible. Respond with ONLY the "
        "corrected JSON object, no markdown fences, no commentary.\n\n"
        f"--- Your previous response ---\n{original_response}"
    )


async def generate_sketch(prompt: str, *, mode: str = "create",
                           source: dict[str, Any] | None = None,
                           interactive: bool = False) -> dict:
    """Live Gemini generation with one validation-aware repair pass, falling
    back to the static pool on any network/HTTP/timeout error, an unusable
    key, or a repair that still fails validation. Never raises — a failed
    generation is always a tagged fallback sketch, matching generate.js.

    ``interactive`` selects the system prompt: it is orthogonal to ``mode``
    (create/remix), since an interactive piece can be remixed like any other."""
    from backend.ai_manager import ai_manager

    if not ai_manager.genai_client:
        return _fallback("no Gemini key configured", model_answered=False)

    try:
        request_text = generation_prompt(prompt, mode=mode, source=source)
    except ValueError as exc:
        return _fallback(str(exc), model_answered=False)

    try:
        text = await _call_gemini(ai_manager.genai_client, request_text, interactive=interactive)
    except Exception as exc:
        logger.warning("[thecommons] Gemini call failed, falling back: %s", exc)
        return _fallback(_redact(str(exc)), model_answered=False)

    try:
        sketch = _parse_sketch(text)
    except (InvalidSketchError, json.JSONDecodeError) as invalid:
        logger.warning("[thecommons] first attempt failed validation, retrying with a repair prompt: %s", invalid)
        try:
            repaired_text = await _call_gemini(
                ai_manager.genai_client, _repair_text(text, str(invalid)), interactive=interactive)
        except Exception as exc:
            # The first call DID answer (and was billed) even though the
            # repair never landed — the charge stands.
            logger.warning("[thecommons] repair call failed, falling back: %s", exc)
            return _fallback(_redact(str(exc)), model_answered=True)
        try:
            sketch = _parse_sketch(repaired_text)
        except (InvalidSketchError, json.JSONDecodeError) as still_invalid:
            logger.warning("[thecommons] repair still failed validation, falling back: %s", still_invalid)
            return _fallback(str(still_invalid), model_answered=True)

    return await _succeeded(sketch, prompt, mode=mode, source=source)


async def _succeeded(sketch: dict, prompt: str, *, mode: str, source: dict[str, Any] | None) -> dict:
    """A sketch that passed validation gets its control panel designed, by a
    second and separate call. Only ever here: a fallback is a curated piece and
    brings its own panel, or none. If the design fails, the sketch still ships
    with the default panel -- and at the same charge, since the sketch itself,
    which is what the price is for, was delivered."""
    source_ui = ((source or {}).get("sketch") or {}).get("ui") if mode == "remix" else None
    ui = await design_panel(sketch, prompt, source_ui=source_ui)
    if ui is not None:
        sketch = {**sketch, "ui": ui}
    return {**sketch, "id": _random_id(), "fallback": False, "modelAnswered": True,
            "generation": {"provider": "gemini", "model": config.MODEL_COMMONS_SKETCH,
                           "panel": "designed" if ui is not None else "default", "panelModel": PANEL_MODEL}}


def _redact(message: str) -> str:
    from backend import config as _config
    key = _config.get_api_key()
    return message.replace(key, "[redacted]") if key else message
