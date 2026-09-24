"""The Commons — hand-written control panels for the gallery's pieces.

Kept apart from thecommons_gallery.py so each piece's entry there stays about
the piece. These go through the same normalize_ui() as a generated panel, and
tests/test_thecommons_gallery.py checks that each one survives it unchanged:
a curated panel that was quietly patched up on load would be a curated panel
nobody actually reviewed.

Skins follow the piece. The loud demo effects and arcade games get the trainer
menu, calm and systemic pieces the retro desktop, and code-like or strategy
pieces text mode.
"""


def _panel(skin, variant, title, tagline, groups, controls, *, density="roomy", columns=2):
    return {
        "skin": skin, "variant": variant, "title": title, "tagline": tagline,
        "groups": [{"title": t, "controls": names} for t, names in groups],
        "controls": {name: ({"widget": spec} if isinstance(spec, str) else {"widget": spec[0], "hint": spec[1]})
                     for name, spec in controls.items()},
        "mobile": {"density": density}, "desktop": {"columns": columns},
    }


PANELS: dict[str, dict] = {
    # ── demo scene ──────────────────────────────────────────────────────────
    "cracktro": _panel(
        "trainer", "violet", "CRACKTRO +5 TRAINER", "greetings to everyone in the room",
        [("Logo", ["logo_style", "bars"]), ("Scroller", ["scroll_speed", "wave_height"]), ("Greetings", ["shout"])],
        {"logo_style": "pads", "bars": "pads",
         "scroll_speed": ("knob", "Speed the scroller up or down"),
         "wave_height": ("slider", "How far the scroller bounces"),
         "shout": ("pad", "Adds your table's name to the scroller")},
        columns=3),
    "fire": _panel(
        "trainer", "fire", "FIRE +4 TRAINER", "keep the flames fed",
        [("Heat", ["fuel", "flame_height", "stoke"]), ("Air", ["wind"]), ("Look", ["palette", "resolution"])],
        {"fuel": ("knob", "More fuel, brighter fire"), "flame_height": "knob",
         "stoke": ("pad", "Stoke your own patch of the fire"),
         "wind": ("slider", "Blow the flames left or right"),
         "palette": "cycle", "resolution": "buttons"},
        density="compact", columns=3),
    "metaballs": _panel(
        "textmode", "amber", "BLOBS.EXE", "goo simulation, amber monitor edition",
        [("Goo", ["goo", "drift"]), ("Display", ["palette", "resolution"])],
        {"goo": ("knob", "How readily the blobs merge"), "drift": ("knob", "How fast the blobs wander"),
         "palette": "list", "resolution": "buttons"},
        density="compact"),
    "plasma": _panel(
        "trainer", "acid", "PLASMA +3 TRAINER", "the oldest trick in the demo book",
        [("Colour", ["palette"]), ("Flow", ["flow_speed", "pattern_scale"]), ("Display", ["resolution"])],
        {"palette": "cycle", "flow_speed": ("knob", "Speed of the colour flow"),
         "pattern_scale": ("knob", "Bigger or smaller ripples"), "resolution": "buttons"},
        density="compact", columns=3),
    "tunnel": _panel(
        "textmode", "blue", "TUNNEL.EXE", "an endless texture-mapped tube",
        [("Surface", ["texture", "palette"]), ("Flight", ["speed", "twist"]), ("Display", ["resolution"])],
        {"texture": "pads", "palette": "cycle", "speed": ("knob", "How fast you fly down the tube"),
         "twist": ("slider", "Twist the tube left or right"), "resolution": "buttons"},
        columns=3),
    "starfield": _panel(
        "trainer", "ice", "STARFIELD +4 TRAINER", "punch it",
        [("Flight", ["flight", "warp_speed", "hyperspace"]), ("Stars", ["star_color", "star_count"])],
        {"flight": "list", "warp_speed": "knob",
         "hyperspace": ("pad", "A burst of lightspeed, with trails"),
         "star_color": "cycle", "star_count": "slider"}),
    "rotozoomer": _panel(
        "textmode", "blue", "ROTOZOOM.EXE", "spin and zoom, one pixel at a time",
        [("Motion", ["spin", "zoom_depth"]), ("Surface", ["texture", "palette"]), ("Display", ["resolution"])],
        {"spin": ("knob", "Spin it either way"), "zoom_depth": ("knob", "How far it zooms in and out"),
         "texture": "pads", "palette": "list", "resolution": "buttons"},
        density="compact", columns=3),
    "vector-balls": _panel(
        "desk", "grey", "Vector Balls", "a chrome sculpture you turn by hand",
        [("Sculpture", ["shape", "ball_size"]), ("Rotation", ["spin_x", "spin_y"]), ("Finish", ["palette"])],
        {"shape": "list", "ball_size": "stepper", "spin_x": ("knob", "Tumble it forwards or back"),
         "spin_y": ("knob", "Turn it left or right"), "palette": "pads"},
        density="compact", columns=3),
    "interference": _panel(
        "desk", "grey", "Interference Lab", "overlapping rings, beating together",
        [("Rings", ["ring_spacing", "centers", "drift"]), ("Display", ["palette", "resolution"])],
        {"ring_spacing": ("slider", "Tighter or looser rings"), "centers": "stepper",
         "drift": ("knob", "How fast the ring sets wander"), "palette": "buttons", "resolution": "buttons"}),
    "copper-bars": _panel(
        "trainer", "violet", "COPPER +5 TRAINER", "raster bars, the way the hardware did it",
        [("Bars", ["bar_count", "bar_height", "bounce"]), ("Colour", ["palette", "orientation"])],
        {"bar_count": "stepper", "bar_height": "slider", "bounce": ("knob", "How hard the bars bounce"),
         "palette": "cycle", "orientation": "buttons"}),

    # ── party games ─────────────────────────────────────────────────────────
    "invaders": _panel(
        "trainer", "acid", "INVADERS +2 TRAINER", "one of you steers, everyone shoots",
        [("Ship", ["ship_position", "fire"]), ("Game", ["game_speed", "invader_style", "color_palette"])],
        {"ship_position": ("slider", "Slide to steer the ship"), "fire": "pad",
         "game_speed": "knob", "invader_style": "pads", "color_palette": "buttons"}),
    "fireworks": _panel(
        "trainer", "fire", "FIREWORKS +3 TRAINER", "light up the sky together",
        [("Launch", ["launch", "finale"]), ("Shells", ["shell_style", "ember_life"]),
         ("Sky", ["sky_palette", "wind_speed"])],
        {"launch": ("pad", "Send a shell into the sky"), "finale": ("button", "Set off everything at once"),
         "shell_style": "pads", "ember_life": ("stepper", "How long the embers hang"),
         "sky_palette": "cycle", "wind_speed": "slider"},
        columns=3),
    "neon-defense": _panel(
        "textmode", "green", "DEFENSE.EXE", "hold the line",
        [("Weapons", ["fire", "fire_mode"]), ("Threat", ["difficulty", "enemy_speed", "enemy_shape"])],
        {"fire": "pad", "fire_mode": "list", "difficulty": "list", "enemy_speed": "knob",
         "enemy_shape": "buttons"}),
    "pachinko": _panel(
        "desk", "blue", "Pachinko Parlour", "drop a marble, watch it fall",
        [("Marbles", ["drop_marble", "clear_board", "marble_size"]),
         ("Board", ["peg_layout", "board_tilt", "peg_size"]), ("Physics", ["gravity_strength", "bounciness"])],
        {"drop_marble": "pad", "clear_board": "button", "marble_size": "stepper", "peg_layout": "pads",
         "board_tilt": ("slider", "Tilt the board left or right"), "peg_size": "stepper",
         "gravity_strength": "knob", "bounciness": "knob"},
        density="compact", columns=3),
    "mural": _panel(
        "desk", "blue", "Mural Paint", "everyone paints on one wall",
        [("Brush", ["action_stamp", "stamp_shape", "stamp_size"]), ("Colour", ["color_theme", "chaos_amount"])],
        {"action_stamp": ("pad", "Stamp your mark on the wall"), "stamp_shape": "pads", "stamp_size": "slider",
         "color_theme": "cycle", "chaos_amount": ("knob", "How far your stamps wander")}),

    # ── living canvases ─────────────────────────────────────────────────────
    "spore-colonies": _panel(
        "textmode", "green", "SPORES.EXE", "a reaction-diffusion culture, live",
        [("Culture", ["pattern", "growth_speed"]), ("Microscope", ["zoom", "palette", "audio_reactivity"])],
        {"pattern": "list", "growth_speed": "stepper", "zoom": ("knob", "Magnify the culture"),
         "palette": "cycle", "audio_reactivity": ("slider", "How much the music feeds the growth")}),
    "ecosystem": _panel(
        "desk", "grey", "Ecosystem Simulator", "your species, in your colour",
        [("Species", ["spawn_creature", "boid_scale", "mutation"]),
         ("World", ["feed_burst", "climate", "metabolism"]), ("Catastrophe", ["extinction"])],
        {"spawn_creature": ("pad", "Release creatures in your colour"), "boid_scale": "stepper",
         "mutation": "slider", "feed_burst": ("button", "Scatter food for every species"),
         "climate": "list", "metabolism": "knob", "extinction": "button"},
        columns=3),
    "constellations": _panel(
        "desk", "blue", "Star Chart", "everyone here is a star",
        [("Stars", ["star_scale", "drift_speed", "social_gravity"]),
         ("Lines", ["connection_radius", "line_style"]), ("Sky", ["nebula_bg"])],
        {"star_scale": "knob", "drift_speed": "knob",
         "social_gravity": ("slider", "Pull the stars together or apart"),
         "connection_radius": ("slider", "How far apart stars still link"), "line_style": "list",
         "nebula_bg": "cycle"},
        density="compact", columns=3),
    "ink-drifts": _panel(
        "desk", "grey", "Ink Studio", "drops that stay all night",
        [("Ink", ["palette", "drop_rate", "spread_size"]), ("Water", ["drift_style", "drift_speed"]),
         ("Paper", ["paper"])],
        {"palette": "cycle", "drop_rate": ("slider", "Seconds between drops"), "spread_size": "stepper",
         "drift_style": "pads", "drift_speed": "knob", "paper": "buttons"},
        columns=3),
    # ── from the studio ─────────────────────────────────────────────────────
    # A paint program's panel for a painting, in the order a painter works:
    # where the scene is, how it is painted, and who it is.
    "flowmounds": _panel(
        "desk", "grey", "FLOWMOUNDS", "paint it, then let it look back",
        [("Scene", ["palette", "contrast", "separation", "horizon"]),
         ("Paint", ["structure", "marks", "mark_length", "mark_width"]),
         ("Colour", ["creature", "tint", "tint_strength", "body"]),
         ("Creature", ["apex", "width", "lean", "wobble", "eyes", "eye_size", "eye_shape", "ground"])],
        {"palette": ("list", "The sky and the land it stands in"),
         "creature": ("list", "The creature's own colours"),
         "tint": ("list", "A colour its paint is pulled toward, or its own"),
         "tint_strength": ("slider", "How far its colours lean into the tint"),
         "body": ("buttons", "The base coat under its brush marks"),
         "contrast": ("buttons", "What holds it apart from its background"),
         "separation": ("slider", "How hard that is pushed"),
         "horizon": ("slider", "Where the land begins"),
         "structure": ("buttons", "Which way the brush runs"),
         "marks": ("knob", "How many strokes it is painted with"),
         "mark_length": ("knob", "How far each stroke travels"),
         "mark_width": ("knob", "How broad the brush is"),
         "apex": ("slider", "How tall it stands"),
         "width": ("slider", "How wide it sits"),
         "lean": ("slider", "Lean it left or right"),
         "wobble": ("knob", "How lumpy its outline is"),
         "eyes": ("buttons", "How many eyes it has"),
         "eye_size": ("knob", "How big its eyes are"),
         "eye_shape": ("knob", "Round eyes, or tall ones"),
         "ground": ("switch", "Let the near bank cross its feet")},
        columns=3),
    "flowmounds-boil": _panel(
        "desk", "blue", "FLOWMOUNDS · BOIL", "shot on twos, when the host says so",
        [("Scene", ["palette", "contrast", "separation", "horizon"]),
         ("Paint", ["structure", "marks", "mark_length", "mark_width"]),
         ("Colour", ["creature", "tint", "tint_strength", "body"]),
         ("Creature", ["apex", "width", "lean", "wobble", "eyes", "eye_size", "eye_shape", "ground"])],
        {"palette": ("list", "The sky and the land it stands in"),
         "creature": ("list", "The creature's own colours"),
         "tint": ("list", "A colour its paint is pulled toward, or its own"),
         "tint_strength": ("slider", "How far its colours lean into the tint"),
         "body": ("buttons", "The base coat under its brush marks"),
         "contrast": ("buttons", "What holds it apart from its background"),
         "separation": ("slider", "How hard that is pushed"),
         "horizon": ("slider", "Where the land begins"),
         "structure": ("buttons", "Which way the brush runs"),
         "marks": ("knob", "How many strokes it is painted with"),
         "mark_length": ("knob", "How far each stroke travels"),
         "mark_width": ("knob", "How broad the brush is"),
         "apex": ("slider", "How tall it stands"),
         "width": ("slider", "How wide it sits"),
         "lean": ("slider", "Lean it left or right"),
         "wobble": ("knob", "How lumpy its outline is"),
         "eyes": ("buttons", "How many eyes it has"),
         "eye_size": ("knob", "How big its eyes are"),
         "eye_shape": ("knob", "Round eyes, or tall ones"),
         "ground": ("switch", "Let the near bank cross its feet")},
        columns=3),
}
