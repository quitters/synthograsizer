"""The Commons — control panel specs: the phone UI a piece arrives with.

A panel spec is a small declarative extension of the sketch JSON (`sketch.ui`).
It picks a skin, a widget for each control, how controls are grouped, a few
short strings, and at most one accent colour. Trusted code on the phone draws
it (static/thecommons/js/panel.js); the spec itself is never markup.

WHY A SPEC AND NOT GENERATED CSS. Phones have never run generated code; only
the wall does. Model-written CSS or HTML would end that: CSS alone can leak
input values through url() and attribute selectors, lay a fake prompt over the
page, or hide the real controls. A closed vocabulary gives most of the visual
range with none of that surface.

NORMALISE, DON'T REJECT. Every field falls back to its default on its own, so
a half-wrong spec still yields a working panel and can never cost the room its
piece. This is safe precisely because the spec is presentational: nothing in
it changes what a control does, only how it looks and where it sits.

static/thecommons/js/panel-spec.js mirrors these allowlists on the client.
tests/test_thecommons_ui.py keeps the two in step.
"""

import asyncio
import json
import logging
import re
import unicodedata

from backend import config
from backend import google_api

logger = logging.getLogger(__name__)

# Each skin's variants map to the ground colour an accent has to stand out
# against. The skins evoke their era without copying anyone's product: no
# logos, no product names.
SKINS: dict[str, dict] = {
    "commons": {"label": "The Commons", "variants": {"night": "#0a0b0f"}},
    "trainer": {"label": "Trainer menu",
                "variants": {"violet": "#000000", "fire": "#000000", "ice": "#000000", "acid": "#000000"}},
    "desk": {"label": "Retro desktop", "variants": {"blue": "#0055aa", "grey": "#a8a8a8"}},
    "textmode": {"label": "Text mode", "variants": {"blue": "#0000aa", "amber": "#1a1000", "green": "#001a06"}},
}
DEFAULT_SKIN = "commons"

# A widget is how a control is operated; the skin only changes how it looks.
# The first entry for each type is its default, which is the panel The Commons
# has always drawn.
WIDGETS_BY_TYPE: dict[str, tuple[str, ...]] = {
    "number": ("slider", "knob", "stepper"),
    "select": ("buttons", "list", "cycle", "pads"),
    "toggle": ("switch", "lamp"),
    "trigger": ("button", "pad"),
}

DENSITIES = ("roomy", "compact")
MAX_GROUPS = 6
TITLE_CAP = 28
TAGLINE_CAP = 60
GROUP_TITLE_CAP = 20
HINT_CAP = 60
MIN_ACCENT_CONTRAST = 4.5

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
# Panel text is decoration. A string that looks like a link or an address is
# dropped outright: nothing on this page should send anyone anywhere.
_LINKISH_RE = re.compile(r"://|www\.|@|\.(?:com|net|org|io|ly|app|xyz)\b", re.IGNORECASE)


def control_type(variable: dict) -> str:
    return variable.get("type") if variable.get("type") in ("number", "toggle", "trigger") else "select"


def default_widget(variable: dict) -> str:
    return WIDGETS_BY_TYPE[control_type(variable)][0]


def _is_space(ch: str) -> bool:
    # Spelled out rather than str.isspace(), which also counts some control
    # characters; panel-spec.js uses exactly this set.
    return ch in "\t\n\v\f\r" or unicodedata.category(ch) in ("Zs", "Zl", "Zp")


def _clean_text(value, cap: int) -> str:
    if not isinstance(value, str):
        return ""
    # Whitespace becomes a space FIRST -- a newline is a control character too,
    # and dropping it would glue two words together. Then drop every other
    # control and format character (bidi overrides, zero-width spaces) and
    # collapse runs of spaces: one line of plain text is all a panel shows.
    text = "".join(" " if _is_space(ch) else ch for ch in value
                   if _is_space(ch) or not unicodedata.category(ch).startswith("C"))
    text = " ".join(part for part in text.split(" ") if part)
    if _LINKISH_RE.search(text):
        return ""
    return text[:cap].rstrip()


def _luminance(hex_colour: str) -> float:
    def channel(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a: str, b: str) -> float:
    """WCAG contrast ratio between two #rrggbb colours."""
    la, lb = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def normalize_ui(ui, variables: list[dict]) -> dict | None:
    """Return a complete, safe panel spec for these controls, or None when
    there is no spec at all. Never raises on bad input."""
    if not isinstance(ui, dict):
        return None
    # A panel is what phones hold. Host controls live on the owner's desk and
    # are never handed out, so they have no place in it.
    variables = [v for v in variables if v.get("access") != "host"]
    by_name = {v["name"]: v for v in variables}

    # isinstance first: a list or dict here would be unhashable, and this
    # function must never raise on model output.
    skin = ui.get("skin") if isinstance(ui.get("skin"), str) and ui["skin"] in SKINS else DEFAULT_SKIN
    variants = SKINS[skin]["variants"]
    variant = ui.get("variant")
    if not (isinstance(variant, str) and variant in variants):
        variant = next(iter(variants))

    accent = ui.get("accent")
    if not (isinstance(accent, str) and _HEX_RE.match(accent)
            and contrast(accent, variants[variant]) >= MIN_ACCENT_CONTRAST):
        accent = ""

    groups = []
    placed: set[str] = set()
    raw_groups = ui.get("groups") if isinstance(ui.get("groups"), list) else []
    for group in raw_groups[:MAX_GROUPS]:
        if not isinstance(group, dict) or not isinstance(group.get("controls"), list):
            continue
        names = []
        for name in group["controls"]:
            if isinstance(name, str) and name in by_name and name not in placed:
                placed.add(name)
                names.append(name)
        if names:
            groups.append({"title": _clean_text(group.get("title"), GROUP_TITLE_CAP), "controls": names})
    # Nothing may go missing: a control the spec forgot still reaches phones.
    leftover = [v["name"] for v in variables if v["name"] not in placed]
    if leftover:
        if groups:
            groups[-1]["controls"].extend(leftover)
        else:
            groups.append({"title": "", "controls": leftover})

    raw_controls = ui.get("controls") if isinstance(ui.get("controls"), dict) else {}
    controls = {}
    for v in variables:
        raw = raw_controls.get(v["name"]) if isinstance(raw_controls.get(v["name"]), dict) else {}
        widget = raw.get("widget")
        controls[v["name"]] = {
            "widget": widget if widget in WIDGETS_BY_TYPE[control_type(v)] else default_widget(v),
            "hint": _clean_text(raw.get("hint"), HINT_CAP),
        }

    mobile = ui.get("mobile") if isinstance(ui.get("mobile"), dict) else {}
    desktop = ui.get("desktop") if isinstance(ui.get("desktop"), dict) else {}
    columns = desktop.get("columns")
    if not (isinstance(columns, int) and not isinstance(columns, bool) and 1 <= columns <= 3):
        columns = max(1, min(2, len(groups)))

    return {
        "skin": skin,
        "variant": variant,
        "title": _clean_text(ui.get("title"), TITLE_CAP),
        "tagline": _clean_text(ui.get("tagline"), TAGLINE_CAP),
        "accent": accent.lower(),
        "groups": groups,
        "controls": controls,
        "mobile": {"density": mobile.get("density") if mobile.get("density") in DENSITIES else DENSITIES[0]},
        "desktop": {"columns": columns},
    }


# ── the panel designer ──────────────────────────────────────────────────────
#
# A second, separate prompt, not a section of the sketch prompt: its output is
# a different contract, and the sketch prompt is already long enough that
# every rule added to it dilutes the rest. It runs only after a sketch has
# succeeded, on the fast model, with no repair pass -- normalize_ui() already
# turns a half-wrong answer into a working panel, and a failed call just means
# the default one.

PANEL_MODEL = config.MODEL_COMMONS_PANEL
# 3.8 Flash thinks at "medium" by default and spends more tokens on longer
# tasks by design; picking from a closed vocabulary doesn't need that. It
# supports low/medium/high only -- "minimal" is an error, not a cheaper mode.
PANEL_THINKING = "low"
PANEL_TIMEOUT_S = 20
# Enough code for the model to see what each control does, without paying to
# send a very long sketch in full.
PANEL_CODE_CAP = 8000

PANEL_PROMPT = """You design the control panel people hold on their phones for a live, shared
generative art piece at an event. A projector wall shows the piece; everyone in the room steers it
from their own phone, and each person is handed a few of the piece's controls. You decide how those
controls look and feel: the skin, the widget for each control, how the controls are grouped, and a
few short lines of copy. You never change what a control does, and you never write code, CSS or
HTML -- only the JSON described below, which trusted code renders.

THE PIECE arrives as JSON: its name, what the creator asked for, a one-line description of it
(with {{placeholders}} where the controls' values go), its controls (each a "select" of choices, a
"number" range, a "toggle" that is on or off, or a "trigger" momentary action), and its drawing code, so you can see what each
control actually does on the wall. Read the request, the description and the code's palettes for
the piece's aesthetic -- its era, mood and colours -- and design the panel to belong to it.

SKINS -- choose the one whose era suits the piece. If the creator asked for a particular look,
choose the closest.
- "trainer": the cheat menu a 1990s demo group put in front of a game. Black screen, copper bars,
  a chunky pixel font, a cursor. Suits demo effects, arcade games, anything loud, rhythmic or neon.
  Variants (the copper bar colours): "violet", "fire", "ice", "acid".
- "desk": a late-1980s windowed desktop. Each group is a window with a striped title bar, and
  buttons are bevelled and press in. Suits calm, constructive, systemic pieces: simulations, tools,
  generative drawing, anything that feels like a program. Variants: "blue", "grey".
- "textmode": an 80-column text program with double-line dialog boxes, [ bracketed ] buttons and a
  highlight bar. Suits code-like, glitchy, terminal, data, matrix and strategy pieces. Variants:
  "blue" (the classic application palette), "amber" and "green" (monochrome monitors).
Let the piece pick the variant: a fire piece gets "fire", an ocean piece "ice", a hacker piece
"green".

WIDGETS -- how each control is operated. Choose from the control's own type only:
- number: "slider" (precise, or a long range), "knob" (a continuous feel: speed, intensity,
  rotation; best for the one or two headline quantities), "stepper" (a small whole-number range
  or a count, like 1-8).
- select: "buttons" (two to four short choices, all visible), "list" (a menu read top to bottom:
  modes, presets), "cycle" (many choices, or long names, on a small screen; palettes especially),
  "pads" (three to six punchy choices you hit like a drum machine).
- toggle: "switch" (a plain on/off, the calm default) or "lamp" (a latching pad with a light, for
  the on/off that is part of the show).
- trigger: "button" (wide) or "pad" (a big square pad for the action everyone mashes).

GROUPS -- one to six, each with a short title and the names of its controls. Group by what the
controls do on the wall (colour, motion, shape, the actions), put every control in exactly one
group, and order each group from most to least important.

COPY -- plain text, in the voice of the skin.
- "title", up to 28 characters. A trainer title reads like a crack intro ("PLASMA +3 TRAINER"), a
  desk title like a program ("Plasma Workshop"), a textmode title like a program file
  ("PLASMA.EXE").
- "tagline", up to 60 characters: one short line.
- "hint", up to 60 characters, only for a control whose effect isn't obvious from its label: what
  a person will see on the wall when they touch it ("Twist to heat the flames"). Never just repeat
  the label.
Never include links, addresses, handles, directions to go anywhere else, or anything that asks a
person for information.

LAYOUT -- "mobile": {"density": "roomy" or "compact"}; compact sets two small widgets side by side,
so use it when most controls are knobs, steppers or cycles. "desktop": {"columns": 1 to 3}, how many
groups sit side by side on a laptop screen.

ACCENT -- optional "accent": "#rrggbb", one highlight colour taken from the piece's own palette. It
must stay readable on the skin's background (trainer: black; desk blue: #0055aa; desk grey:
#a8a8a8; textmode blue: #0000aa; amber and green: near-black), or it is discarded. Leave it out
rather than guess.

When a previous panel is included, the creator is remixing the piece: keep that panel's skin and
variant unless the request asks for a different look, and carry over whatever still fits.

Respond with ONLY this JSON object -- no markdown fences, no commentary:
{
  "skin": "trainer",
  "variant": "violet",
  "title": "string",
  "tagline": "string",
  "accent": "#rrggbb",
  "groups": [{"title": "string", "controls": ["control_name"]}],
  "controls": {"control_name": {"widget": "string", "hint": "string"}},
  "mobile": {"density": "roomy"},
  "desktop": {"columns": 2}
}"""

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```\s*$")


def panel_request(sketch: dict, prompt: str, source_ui: dict | None = None) -> str:
    """The piece, as the panel designer sees it."""
    controls = []
    for v in sketch["variables"]:
        if v.get("access") == "host":
            continue  # the host's own, on the desk: not the phones' panel to design
        kind = control_type(v)
        control = {"name": v["name"], "label": v.get("label") or v["name"], "type": kind}
        if kind == "number":
            control.update({k: v[k] for k in ("min", "max", "step", "default")})
        elif kind == "select":
            control["values"] = [value["text"] for value in v.get("values") or []]
        else:
            control["share"] = "everyone" if v.get("share") == "all" else "one person"
        controls.append(control)
    code = sketch.get("code") or ""
    piece = {
        "name": sketch.get("name"),
        "creatorRequest": prompt,
        # The piece describing itself in one line, usually with its look in it
        # ("a crack intro with a {{logo_style}} logo over {{bars}} copper bars").
        "description": sketch.get("promptTemplate"),
        "controls": controls,
        "code": code if len(code) <= PANEL_CODE_CAP else code[:PANEL_CODE_CAP] + "\n/* ...truncated */",
    }
    if source_ui:
        piece["previousPanel"] = source_ui
    return "Design the control panel for this piece.\n\nPIECE:\n" + json.dumps(piece)


async def design_panel(sketch: dict, prompt: str, *, source_ui: dict | None = None) -> dict | None:
    """Ask the fast model for this sketch's panel. Returns a normalised spec,
    or None whenever there's no usable answer -- which just means the default
    panel. Never raises: a panel must never cost the room its piece."""
    from backend.ai_manager import ai_manager

    client = ai_manager.genai_client
    if not client:
        return None
    try:
        text = await asyncio.wait_for(asyncio.to_thread(
            google_api.gen_text, client, PANEL_MODEL,
            [google_api.text_block(panel_request(sketch, prompt, source_ui))],
            system_instruction=PANEL_PROMPT, json_mode=True,
            generation_config={"thinking_level": PANEL_THINKING},
        ), timeout=PANEL_TIMEOUT_S)
        answer = json.loads(_FENCE_RE.sub("", text.strip()))
    except Exception as exc:  # noqa: BLE001 -- any failure means the default panel
        logger.warning("[thecommons] panel design failed, using the default panel: %s", type(exc).__name__)
        return None
    # An answer without a real skin isn't a design, whatever else it holds.
    if not (isinstance(answer, dict) and isinstance(answer.get("skin"), str) and answer["skin"] in SKINS):
        logger.warning("[thecommons] panel design had no usable skin, using the default panel")
        return None
    return normalize_ui(answer, sketch["variables"])
