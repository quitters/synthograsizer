"""The Commons — the gallery of ready-made pieces a room can put on the wall
for zero credits.

Each piece's drawing code lives in thecommons_data/gallery/<slug>.js, as the
BODY of the native (ctx, frame, getVar, audio, room) contract. Python only
stores and serves it; the browser runs it.

Two kinds of piece, one bar:
  - hand-written demo scene pieces, whose controls are declared below;
  - pieces the Commons generator wrote live, which were then read in full,
    fixed where they needed it, and committed. Their exact generated controls
    and template live in <slug>.json beside the code, and the commit history
    shows the verbatim original followed by each fix as its own diff.

These pieces are TRUSTED in a way nothing else in Commons is: the creator desk
runs them live as thumbnails, on the signed-in page, where same-origin code
could make authenticated requests. That is acceptable only because every piece
here has been reviewed and shipped in this repository — authorship doesn't
matter, review does. The gallery endpoint serves this list and nothing else —
never a room's saved looks, never anything generated at runtime — and that
boundary is the reason it has its own endpoint rather than being a filter over
the presets list.

Every piece is also run through validate_native_sketch(), the same gate
generated sketches face, so a curated piece can't ship with a malformed control
surface either.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path

from backend.service.thecommons_gallery_panels import PANELS
from backend.service.thecommons_gallery_tags import tags_for
from backend.service.thecommons_ui import SKINS
from backend.service.thecommons_validate import validate_native_sketch

logger = logging.getLogger(__name__)

_DIR = Path(__file__).parent / "thecommons_data" / "gallery"


def _choices(*texts: str) -> list[dict]:
    """First choice is the default and the most common; the rest taper off."""
    return [{"text": text, "weight": 3 if i == 0 else 2 if i < 3 else 1} for i, text in enumerate(texts)]


_RESOLUTION = {"name": "resolution", "label": "Resolution", "values": _choices("classic", "chunky", "fine")}

SECTIONS = [
    {"id": "demo", "title": "Demo scene",
     "intro": "The classic effects of 1990s PC and Amiga demos."},
    {"id": "games", "title": "Party games",
     "intro": "Made for a room full of phones: everyone taps, and the wall reacts."},
    {"id": "living", "title": "Living canvases",
     "intro": "Pieces that grow, drift and remember everything that happened."},
    {"id": "generative", "title": "Generative art",
     "intro": "Systems, automata and homages to the artists who first drew with code."},
    {"id": "studio", "title": "From the studio",
     "intro": "Ported from the generative pieces made next door, mark for mark."},
]

_GENERATED_LINEAGE = "Generated in The Commons from the prompt below, then reviewed and tuned by hand."

GALLERY: list[dict] = [
    {
        "slug": "cracktro",
        "section": "demo",
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
        "section": "demo",
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
        "section": "demo",
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
        "section": "demo",
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
        "section": "demo",
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
        "section": "demo",
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
        "section": "demo",
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
        "section": "demo",
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
        "section": "demo",
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
        "section": "demo",
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

    # ── Generated in The Commons, reviewed and tuned ────────────────────────
    # Name, controls and template come from <slug>.json, exactly as generated.
    # `prompt` is what produced each one; the desk shows it, which doubles as
    # a lesson in what a prompt can do.
    {
        "slug": "invaders",
        "section": "games",
        "blurb": "Space invaders for a whole room: one person steers the ship and everyone fires. "
                 "Clear the swarm and a new one arrives.",
        "prompt": "space invaders: one person steers a ship left and right along the bottom, and everybody "
                  "in the room can fire a shot at the descending rows above",
    },
    {
        "slug": "fireworks",
        "section": "games",
        "blurb": "Anyone can launch a shell that bursts in their own colour. One person steers the wind, "
                 "and one person alone holds the grand finale.",
        "prompt": "a co-operative fireworks night: anyone in the room can launch a shell that bursts in their own "
                  "personal colour and leaves embers that linger and fall, one person steers the wind that drags "
                  "the embers sideways, one person picks the sky palette, and one person alone can set off the "
                  "grand finale",
    },
    {
        "slug": "neon-defense",
        "section": "games",
        "blurb": "Shapes drift down and the whole room shoots them out of the sky. A live scoreboard keeps "
                 "each table's tally in its own colour.",
        "prompt": "a co-operative tower defence: waves of drifting shapes descend from the top, everyone in the "
                  "room can fire at them, each person's shots burst in their own colour, and a live scoreboard "
                  "along the edge shows each table's score as they rack up hits",
    },
    {
        "slug": "pachinko",
        "section": "games",
        "blurb": "Everyone drops marbles through a field of pegs with real bouncing physics. One person tilts "
                 "the board, and one can clear it.",
        "prompt": "a marble machine: anyone can drop a marble that falls through a field of pegs with real "
                  "bouncing physics, marbles knock into each other on the way down and pile up at the bottom in "
                  "the colour of whoever dropped them, and one person tilts the whole board left and right",
    },
    {
        "slug": "mural",
        "section": "games",
        "blurb": "Twenty seconds of everyone stamping marks together, then the mural shrinks into a gallery "
                 "along the bottom and a fresh round begins.",
        "prompt": "a round-based collaborative mural: for about twenty seconds everyone can stamp marks onto a "
                  "shared canvas, then the mural freezes, shrinks down into a small tile that joins a growing "
                  "gallery along the bottom of the screen, and a fresh blank round begins",
    },
    {
        "slug": "spore-colonies",
        "section": "living",
        "blurb": "Coral-like patterns that grow and branch across the whole screen for as long as it runs. "
                 "Every person in the room seeds their own colony.",
        "prompt": "a reaction-diffusion field: coral-like Turing patterns that grow, branch and compete across the "
                  "whole screen, evolving continuously for many minutes without ever resetting, so the pattern "
                  "you see is the accumulated history of the piece",
    },
    {
        "slug": "ecosystem",
        "section": "living",
        "blurb": "Release creatures in your own colour to wander, hunt, breed and starve. Anyone can scatter "
                 "food; one person can call an extinction.",
        "prompt": "a living ecosystem where every person in the room is their own species in their own colour: "
                  "each can release creatures that wander, hunt for food, breed when well fed and die when they "
                  "starve, while one person controls the climate that makes food scarce or abundant for everybody",
    },
    {
        "slug": "constellations",
        "section": "living",
        "blurb": "Every person in the room is a star in their own colour, linked to their neighbours by faint lines.",
        "prompt": "a living constellation where every person currently in the room is their own star in their "
                  "own colour, linked by faint lines, drifting slowly",
    },
    {
        "slug": "ink-drifts",
        "section": "living",
        "blurb": "A drop of ink lands every few seconds and stays, spreading and drifting, so the page keeps "
                 "filling up over the night.",
        "prompt": "a slow ink-drop study: every few seconds a drop of ink lands and stays, spreading and drifting "
                  "for the rest of the piece, so the canvas keeps filling up over several minutes rather than "
                  "resetting",
    },
    # ── from the studio ─────────────────────────────────────────────────────
    # Ported by hand from the owner's own generator, and checked against it
    # pixel for pixel: the same random draws in the same order, so the wall
    # paints the picture the explorer paints. The two differ in what the wall
    # does with a finished one, not in how it is painted.
    {
        "slug": "flowmounds",
        "section": "studio",
        "origin": "ported",
        "blurb": "A creature painted into a landscape, brush stroke by brush stroke, that opens its eyes "
                 "when the painting is done.",
        "lineage": "Ported from FlowMounds v0.25 (bootloader, 2026-09-06), the latest of the studio's own "
                   "generative line, and checked against it pixel for pixel.",
    },
    {
        "slug": "flowmounds-boil",
        "section": "studio",
        "origin": "ported",
        "blurb": "The same creature, and the host's Boil: it is painted again for every frame of a loop, "
                 "then played back the way a hand-drawn animation is shot on twos.",
        "lineage": "Ported from FlowMounds v0.25 (bootloader, 2026-09-06). The boil is the original's own, "
                   "put on a control instead of a key.",
    },
]


def _self_described() -> list[dict]:
    """Generated pieces that carry their own gallery entry.

    A piece whose <slug>.json has a `gallery` block -- section, blurb, prompt
    and look tags -- needs no entry above, and its phone panel is the `ui`
    beside its controls rather than one in thecommons_gallery_panels.py. The
    100 Scenes batch came in this way; it is also the shape a generated piece
    can arrive in already, so promoting one is copying two files in and
    reading them, not writing its paperwork by hand. Ordered by name, after
    the pieces listed above.
    """
    listed = {meta["slug"] for meta in GALLERY}
    entries = []
    for path in _DIR.glob("*.json"):
        if path.stem in listed:
            continue
        try:
            sidecar = json.loads(path.read_text(encoding="utf-8"))
            meta = sidecar.get("gallery")
            if meta is None:
                continue
            entries.append((sidecar["name"].casefold(), {
                "slug": path.stem, "section": meta["section"], "blurb": meta["blurb"],
                "prompt": meta["prompt"], "look": tuple(meta["look"]),
            }))
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
            logger.error("[thecommons] skipping gallery piece %s: %s", path.stem, exc)
    return [entry for _, entry in sorted(entries, key=lambda e: e[0])]


GALLERY.extend(_self_described())


@lru_cache(maxsize=1)
def load_gallery() -> tuple[dict, ...]:
    """Every gallery piece that has code on disk and passes validation.

    A piece that fails is logged and skipped rather than raising: a curated
    piece going wrong must never stop the app from booting. The test suite
    asserts that none do, so in practice this never skips anything.
    """
    pieces = []
    for meta in GALLERY:
        try:
            code = (_DIR / f"{meta['slug']}.js").read_text(encoding="utf-8")
            # Generated pieces keep the generator's exact controls beside the code.
            controls = meta if "variables" in meta else json.loads(
                (_DIR / f"{meta['slug']}.json").read_text(encoding="utf-8"))
            sketch = validate_native_sketch({
                "name": controls["name"], "promptTemplate": controls["promptTemplate"],
                "variables": controls["variables"], "code": code,
                "ui": PANELS.get(meta["slug"], controls.get("ui")),
            })
        except (OSError, ValueError, KeyError) as exc:   # InvalidSketchError and JSON errors are ValueErrors
            logger.error("[thecommons] skipping gallery piece %s: %s", meta["slug"], exc)
            continue
        # `gallery` survives load_preset (it spreads the sketch), so the desk can
        # tell which gallery piece is live. A remix drops it — correctly, since
        # a remix is no longer the curated piece.
        sketch["gallery"] = meta["slug"]
        variables = sketch["variables"]
        generated = "prompt" in meta
        pieces.append({
            "slug": meta["slug"],
            "section": meta["section"],
            "name": sketch["name"],
            "blurb": meta["blurb"],
            "lineage": _GENERATED_LINEAGE if generated else meta["lineage"],
            "origin": "generated" if generated else meta.get("origin", "hand-written"),
            "prompt": meta.get("prompt"),
            # Derived from the piece itself, so a badge can never claim what the code doesn't do.
            "interactive": any(v.get("type") == "trigger" for v in variables),
            "usesPeople": "room.people" in code,
            # The phone panel's look, named for the card, e.g. "Trainer menu".
            "panel": SKINS[sketch["ui"]["skin"]]["label"] if "ui" in sketch else None,
            # What the desk's library filters and searches by.
            "tags": tags_for(meta["slug"], meta["section"],
                             "generated" if generated else meta.get("origin", "hand-written"),
                             variables, code, look=meta.get("look")),
            "sketch": sketch,
        })
    return tuple(pieces)


def gallery_preset_id(slug: str) -> str:
    return f"gallery-{slug}"
