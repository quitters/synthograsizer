"""How a host finds the piece they want.

A gallery of twenty-odd pieces is a list you read; a library of sixty is one
you search. These are the tags the desk filters by, in four groups, and the
rule for each group is different on purpose:

  Kind            the section the piece is already in -- derived.
  What it does    what the room will be able to do with it -- derived from the
                  piece itself, so a chip can never claim what the code doesn't.
  Look and feel   the only hand-written group. Nothing in the code says a piece
                  is calm, and a model guessing at it would be a second billed
                  call on something a human can answer in four words.
  Where it's from a piece written by hand, generated here, or ported from the
                  studio -- and, on the desk, whether it's yours at all.

A piece with no entry in LOOK below still gets every derived tag, so a new one
appears in the library properly filtered on the day it lands, and someone can
add its two adjectives later. A piece that describes itself in its own
<slug>.json brings its adjectives with it, and those are used instead.
"""

# ── the vocabulary ───────────────────────────────────────────────────────────
# Kept small on purpose. Thirty chips is a second search problem; these twelve
# cover the collection with room to spare, and a piece carries two or three.
LOOK_TAGS: dict[str, str] = {
    "retro": "Retro",
    "3d": "3D",
    "geometric": "Geometric",
    "organic": "Organic",
    "painterly": "Painterly",
    "text": "Words",
    "psychedelic": "Psychedelic",
    "space": "Space",
    "nature": "Nature",
    "light": "Light",
    "calm": "Calm",
    "energetic": "Energetic",
}

DOES_TAGS: dict[str, str] = {
    "interactive": "Room can act",
    "crowd": "Knows who's here",
    "music": "Follows the music",
    "host": "Host controls",
}

ORIGIN_TAGS: dict[str, str] = {
    "hand-written": "Hand-written",
    "generated": "Generated here",
    # Not "from the studio": that is the section's name, and one word
    # meaning two things in two groups of chips is a puzzle, not a filter.
    "ported": "Ported by hand",
}

# The desk adds these itself, for everything in the library that isn't a
# ready-made piece. Named here so both sides agree on the words.
SOURCE_TAGS: dict[str, str] = {
    "ready": "Ready-made",
    "saved": "Your saved looks",
    "made": "Made in this room",
    "builtin": "Built in",
    "inherited": "Inherited library",
}

# ── the hand-written half ────────────────────────────────────────────────────
LOOK: dict[str, tuple[str, ...]] = {
    "cracktro": ("retro", "text", "energetic"),
    "fire": ("organic", "energetic", "light"),
    "metaballs": ("organic", "retro"),
    "plasma": ("psychedelic", "retro", "calm"),
    "tunnel": ("3d", "retro", "psychedelic"),
    "starfield": ("space", "3d", "calm"),
    "rotozoomer": ("retro", "geometric", "psychedelic"),
    "vector-balls": ("3d", "retro", "geometric"),
    "interference": ("geometric", "calm"),
    "copper-bars": ("retro", "geometric", "energetic"),
    "invaders": ("retro", "geometric", "energetic"),
    "fireworks": ("light", "energetic"),
    "neon-defense": ("retro", "light", "energetic"),
    "pachinko": ("geometric", "energetic"),
    "mural": ("painterly",),
    "spore-colonies": ("organic", "nature", "calm"),
    "ecosystem": ("organic", "nature"),
    "constellations": ("space", "calm"),
    "ink-drifts": ("painterly", "organic", "calm"),
    "flowmounds": ("painterly", "organic", "calm"),
    "flowmounds-boil": ("painterly", "organic"),
}


def tag_groups(sections: list[dict]) -> list[dict]:
    """The chips the desk offers, in the order it shows them."""
    return [
        {"id": "kind", "title": "Kind",
         "tags": [{"id": s["id"], "label": s["title"]} for s in sections]},
        {"id": "does", "title": "What the room does",
         "tags": [{"id": k, "label": v} for k, v in DOES_TAGS.items()]},
        {"id": "look", "title": "Look and feel",
         "tags": [{"id": k, "label": v} for k, v in LOOK_TAGS.items()]},
        # Two questions that a host asks as one: is this mine, and who made it.
        {"id": "source", "title": "Where it's from",
         "tags": [{"id": "ready", "label": SOURCE_TAGS["ready"]}]
                 + [{"id": k, "label": v} for k, v in ORIGIN_TAGS.items()]
                 + [{"id": k, "label": v} for k, v in SOURCE_TAGS.items() if k != "ready"]},
    ]


def tags_for(slug: str, section: str, origin: str, variables: list[dict], code: str,
             look: tuple[str, ...] | None = None) -> list[str]:
    """Every tag a gallery piece carries: its section, what it lets the room
    do, its two or three adjectives, and where it came from."""
    tags = [section, "ready", origin]
    if any(v.get("type") == "trigger" for v in variables):
        tags.append("interactive")
    if "room.people" in code:
        tags.append("crowd")
    # `audio.` and nothing else: the argument is named `audio` in every piece,
    # and a piece that never touches it is not audio-reactive however much its
    # blurb says "pulse".
    if "audio." in code:
        tags.append("music")
    if any(v.get("access") == "host" for v in variables):
        tags.append("host")
    tags.extend(LOOK.get(slug, ()) if look is None else look)
    return tags
