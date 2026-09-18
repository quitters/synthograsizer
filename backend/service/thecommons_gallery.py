"""The Commons — the demo scene gallery: hand-written pieces a room can put on
the wall for zero credits.

Each piece's drawing code lives in thecommons_data/gallery/<slug>.js, as the
BODY of the native (ctx, frame, getVar, audio, room) contract. Python only
stores and serves it; the browser runs it.

These pieces are TRUSTED in a way nothing else in Commons is: the creator desk
runs them live as thumbnails, on the signed-in page, where same-origin code
could make authenticated requests. That is acceptable only because every piece
here is written by hand and shipped in this repository. The gallery endpoint
serves this list and nothing else — never saved looks, never generated pieces —
and that boundary is the reason it has its own endpoint rather than being a
filter over the presets list.

Every piece is also run through validate_native_sketch(), the same gate
generated sketches face, so a curated piece can't ship with a malformed control
surface either.
"""

import logging
from functools import lru_cache
from pathlib import Path

from backend.service.thecommons_validate import InvalidSketchError, validate_native_sketch

logger = logging.getLogger(__name__)

_DIR = Path(__file__).parent / "thecommons_data" / "gallery"


def _choices(*texts: str) -> list[dict]:
    """First choice is the default and the most common; the rest taper off."""
    return [{"text": text, "weight": 3 if i == 0 else 2 if i < 3 else 1} for i, text in enumerate(texts)]


_RESOLUTION = {"name": "resolution", "label": "Resolution", "values": _choices("classic", "chunky", "fine")}

GALLERY: list[dict] = [
    {
        "slug": "cracktro",
        "name": "Cracktro",
        "blurb": "Starfield, copper bars, a chrome logo and a sine scroller that greets everyone in the room by name.",
        "lineage": "The intro crackers stamped on the front of a game, often more fun than the game itself.",
        "promptTemplate": "a crack intro with a {{logo_style}} logo over {{bars}} copper bars and a scroller "
                          "moving at {{scroll_speed}} with {{wave_height}} wave",
        "variables": [
            {"name": "logo_style", "label": "Logo", "values": _choices("chrome", "gold", "rainbow")},
            {"name": "bars", "label": "Copper bars", "values": _choices("amiga", "sunset", "ice")},
            {"name": "scroll_speed", "label": "Scroll speed", "type": "number",
             "min": 0.5, "max": 4, "step": 0.1, "default": 1.6},
            {"name": "wave_height", "label": "Wave", "type": "number",
             "min": 0, "max": 1, "step": 0.05, "default": 0.5},
            {"name": "shout", "label": "Shout out", "type": "trigger", "share": "all"},
        ],
    },
    {
        "slug": "fire",
        "name": "Fire",
        "blurb": "Heat seeded along the bottom climbs and cools. Anyone can stoke it, and the sparks fly in their colour.",
        "lineage": "Every cell is the cooled average of the ones beneath it. Nothing more.",
        "promptTemplate": "a {{palette}} fire burning {{fuel}} fuel in {{wind}} wind with {{flame_height}} flames "
                          "at {{resolution}} resolution",
        "variables": [
            {"name": "palette", "label": "Flame",
             "values": _choices("classic fire", "blue flame", "toxic", "magma", "ghost")},
            {"name": "fuel", "label": "Fuel", "type": "number", "min": 0.2, "max": 1, "step": 0.05, "default": 0.75},
            {"name": "wind", "label": "Wind", "type": "number", "min": -1, "max": 1, "step": 0.1, "default": 0},
            {"name": "flame_height", "label": "Flame height", "type": "number",
             "min": 0.3, "max": 1, "step": 0.05, "default": 0.6},
            _RESOLUTION,
            {"name": "stoke", "label": "Stoke the fire", "type": "trigger", "share": "all"},
        ],
    },
    {
        "slug": "metaballs",
        "name": "Metaballs",
        "blurb": "One glowing blob for every person in the room. Join and yours drifts in; blobs melt together where they meet.",
        "lineage": "Sum every blob's pull at every pixel, and colour whatever crosses the line.",
        "promptTemplate": "{{palette}} metaballs, one for every person in the room, drifting at {{drift}} "
                          "with {{goo}} goo at {{resolution}} resolution",
        "variables": [
            {"name": "palette", "label": "Colour",
             "values": _choices("per person", "lava lamp", "slime", "plasma pink")},
            {"name": "goo", "label": "Goo", "type": "number", "min": 0.5, "max": 2, "step": 0.1, "default": 1},
            {"name": "drift", "label": "Drift", "type": "number", "min": 0.1, "max": 2, "step": 0.1, "default": 0.6},
            _RESOLUTION,
        ],
    },
    {
        "slug": "plasma",
        "name": "Plasma",
        "blurb": "Stacked sine waves, one colour per pixel, and a palette that cycles so the whole screen ripples.",
        "lineage": "The effect that turned a beige PC into a rave in 1993.",
        "promptTemplate": "a {{palette}} plasma flowing at {{flow_speed}} with {{pattern_scale}} ripples "
                          "at {{resolution}} resolution",
        "variables": [
            {"name": "palette", "label": "Palette", "values": _choices("acid", "inferno", "deep sea", "copper", "candy")},
            {"name": "flow_speed", "label": "Flow", "type": "number",
             "min": 0.1, "max": 3, "step": 0.1, "default": 1},
            {"name": "pattern_scale", "label": "Ripple size", "type": "number",
             "min": 0.5, "max": 3, "step": 0.1, "default": 1.2},
            _RESOLUTION,
        ],
    },
    {
        "slug": "tunnel",
        "name": "Tunnel",
        "blurb": "Rushing down a textured tube, looking around as you go. Flies faster when the music gets loud.",
        "lineage": "Not 3D at all: angle and depth are baked into lookup tables once, then a texture slides through them.",
        "promptTemplate": "a {{texture}} tunnel in {{palette}} rushing at {{speed}} with {{twist}} twist "
                          "at {{resolution}} resolution",
        "variables": [
            {"name": "texture", "label": "Texture", "values": _choices("checker", "rings", "bricks", "xor")},
            {"name": "palette", "label": "Palette", "values": _choices("neon", "copper", "toxic", "ice")},
            {"name": "speed", "label": "Speed", "type": "number", "min": 0.1, "max": 3, "step": 0.1, "default": 1},
            {"name": "twist", "label": "Twist", "type": "number", "min": -2, "max": 2, "step": 0.1, "default": 0.5},
            _RESOLUTION,
        ],
    },
    {
        "slug": "starfield",
        "name": "Warp Field",
        "blurb": "Stars rushing past. Anyone can punch hyperspace, and the streaks take the colour of whoever did.",
        "lineage": "The hello-world of demo coding, behind nearly every intro ever made.",
        "promptTemplate": "a {{flight}} starfield of {{star_count}} {{star_color}} stars at {{warp_speed}}",
        "variables": [
            {"name": "flight", "label": "Flight", "values": _choices("forward warp", "side scroll", "spiral dive")},
            {"name": "star_color", "label": "Star colour",
             "values": _choices("white", "amber monitor", "cga cyan", "rainbow")},
            {"name": "warp_speed", "label": "Warp", "type": "number",
             "min": 0.2, "max": 4, "step": 0.1, "default": 1.2},
            {"name": "star_count", "label": "Star count", "type": "number",
             "min": 100, "max": 1500, "step": 50, "default": 600},
            {"name": "hyperspace", "label": "Hyperspace", "type": "trigger", "share": "all"},
        ],
    },
    {
        "slug": "rotozoomer",
        "name": "Rotozoomer",
        "blurb": "A texture spinning and zooming at once, the effect that closed out the 2D era of PC demos.",
        "lineage": "Two additions and a lookup per pixel. Combining rotate and zoom costs nothing extra.",
        "promptTemplate": "a {{texture}} rotozoomer in {{palette}} spinning at {{spin}} with {{zoom_depth}} zoom "
                          "at {{resolution}} resolution",
        "variables": [
            {"name": "texture", "label": "Texture", "values": _choices("checker", "xor", "bricks", "diamonds")},
            {"name": "palette", "label": "Palette", "values": _choices("amiga", "gameboy", "vaporwave", "copper")},
            {"name": "spin", "label": "Spin", "type": "number", "min": -2, "max": 2, "step": 0.1, "default": 0.4},
            {"name": "zoom_depth", "label": "Zoom", "type": "number",
             "min": 0, "max": 1.5, "step": 0.05, "default": 0.6},
            _RESOLUTION,
        ],
    },
    {
        "slug": "vector-balls",
        "name": "Vector Balls",
        "blurb": "A shape built from shaded balls, spun in 3D and painted back to front.",
        "lineage": "One pre-rendered ball, scaled by depth. That's how these ran on 90s hardware.",
        "promptTemplate": "a {{shape}} of {{palette}} vector balls sized {{ball_size}} spinning {{spin_x}} "
                          "by {{spin_y}}",
        "variables": [
            {"name": "shape", "label": "Shape", "values": _choices("cube", "sphere", "torus", "double helix")},
            {"name": "palette", "label": "Finish", "values": _choices("chrome", "gold", "rgb", "sunset")},
            {"name": "spin_x", "label": "Tumble", "type": "number", "min": -2, "max": 2, "step": 0.1, "default": 0.7},
            {"name": "spin_y", "label": "Turn", "type": "number", "min": -2, "max": 2, "step": 0.1, "default": 1.1},
            {"name": "ball_size", "label": "Ball size", "type": "number", "min": 2, "max": 20, "step": 1, "default": 8},
        ],
    },
    {
        "slug": "interference",
        "name": "Interference",
        "blurb": "Sets of rings drifting over each other. Where they overlap, patterns appear that nobody drew.",
        "lineage": "Moiré: each ring set contributes one bit, and the bits are XORed.",
        "promptTemplate": "{{centers}} {{palette}} ring sets spaced {{ring_spacing}} apart drifting at {{drift}} "
                          "at {{resolution}} resolution",
        "variables": [
            {"name": "palette", "label": "Palette", "values": _choices("mono", "cga", "ember", "ultraviolet")},
            {"name": "ring_spacing", "label": "Ring spacing", "type": "number",
             "min": 4, "max": 30, "step": 1, "default": 10},
            {"name": "drift", "label": "Drift", "type": "number", "min": 0.1, "max": 2, "step": 0.1, "default": 0.6},
            {"name": "centers", "label": "Ring sets", "type": "number", "min": 2, "max": 4, "step": 1, "default": 2},
            _RESOLUTION,
        ],
    },
    {
        "slug": "copper-bars",
        "name": "Copper Bars",
        "blurb": "Glowing bands weaving over and under each other, bouncing harder with the bass.",
        "lineage": "Named for the Amiga's copper chip, which changed colours mid-scanline to draw them for free.",
        "promptTemplate": "{{bar_count}} {{palette}} copper bars {{bar_height}} tall bouncing {{orientation}} "
                          "at {{bounce}}",
        "variables": [
            {"name": "palette", "label": "Palette", "values": _choices("amiga", "sunset", "ice", "rgb", "gold")},
            {"name": "orientation", "label": "Direction", "values": _choices("horizontal", "vertical", "woven")},
            {"name": "bar_count", "label": "Bars", "type": "number", "min": 3, "max": 16, "step": 1, "default": 7},
            {"name": "bounce", "label": "Bounce", "type": "number", "min": 0.1, "max": 2, "step": 0.1, "default": 0.8},
            {"name": "bar_height", "label": "Bar height", "type": "number",
             "min": 10, "max": 80, "step": 2, "default": 36},
        ],
    },
]


@lru_cache(maxsize=1)
def load_gallery() -> tuple[dict, ...]:
    """Every gallery piece that has code on disk and passes validation.

    A piece that fails is logged and skipped rather than raising: a curated
    piece going wrong must never stop the app from booting. The test suite
    asserts that none do, so in practice this never skips anything.
    """
    pieces = []
    for meta in GALLERY:
        path = _DIR / f"{meta['slug']}.js"
        try:
            code = path.read_text(encoding="utf-8")
            sketch = validate_native_sketch({
                "name": meta["name"], "promptTemplate": meta["promptTemplate"],
                "variables": meta["variables"], "code": code,
            })
        except (OSError, InvalidSketchError) as exc:
            logger.error("[thecommons] skipping gallery piece %s: %s", meta["slug"], exc)
            continue
        # `gallery` survives load_preset (it spreads the sketch), so the desk can
        # tell which gallery piece is live. A remix drops it — correctly, since
        # a remix is no longer the curated piece.
        sketch["gallery"] = meta["slug"]
        variables = sketch["variables"]
        pieces.append({
            "slug": meta["slug"],
            "name": meta["name"],
            "blurb": meta["blurb"],
            "lineage": meta["lineage"],
            # Derived from the piece itself, so a badge can never claim what the code doesn't do.
            "interactive": any(v.get("type") == "trigger" for v in variables),
            "usesPeople": "room.people" in code,
            "sketch": sketch,
        })
    return tuple(pieces)


def gallery_preset_id(slug: str) -> str:
    return f"gallery-{slug}"
