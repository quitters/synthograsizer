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

import re
import unicodedata

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
    return variable.get("type") if variable.get("type") in ("number", "trigger") else "select"


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
