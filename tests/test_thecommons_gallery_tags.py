"""The library's tags: derived ones must match the piece, hand-written ones
must come from the vocabulary, and every piece must be findable."""

from backend.service.thecommons_gallery import SECTIONS, load_gallery
from backend.service.thecommons_gallery_tags import (
    DOES_TAGS, LOOK, LOOK_TAGS, ORIGIN_TAGS, SOURCE_TAGS, tag_groups,
)


def _known() -> set[str]:
    return ({s["id"] for s in SECTIONS} | set(DOES_TAGS) | set(LOOK_TAGS)
            | set(ORIGIN_TAGS) | set(SOURCE_TAGS))


def test_every_tag_a_piece_carries_is_one_the_desk_can_show():
    known = _known()
    for piece in load_gallery():
        unknown = set(piece["tags"]) - known
        assert not unknown, (piece["slug"], unknown)


def test_the_chips_offered_cover_every_tag_in_use():
    offered = {tag["id"] for group in tag_groups(SECTIONS) for tag in group["tags"]}
    for piece in load_gallery():
        assert set(piece["tags"]) <= offered, piece["slug"]


def test_hand_written_tags_name_a_piece_that_exists():
    slugs = {piece["slug"] for piece in load_gallery()}
    assert set(LOOK) <= slugs, set(LOOK) - slugs


def test_every_piece_says_what_it_is_and_where_it_came_from():
    sections = {s["id"] for s in SECTIONS}
    for piece in load_gallery():
        tags = set(piece["tags"])
        assert tags & sections == {piece["section"]}, piece["slug"]
        assert piece["origin"] in tags, piece["slug"]
        assert "ready" in tags, piece["slug"]
        # Two or three adjectives, so a browse by feel is worth doing.
        assert tags & set(LOOK_TAGS), piece["slug"]


def test_what_a_piece_lets_the_room_do_is_read_from_the_piece():
    """The claims a host filters by are derived, never declared: a chip can't
    promise an action the code doesn't have."""
    for piece in load_gallery():
        tags = set(piece["tags"])
        variables = piece["sketch"]["variables"]
        code = piece["sketch"]["code"]
        assert ("interactive" in tags) == any(v.get("type") == "trigger" for v in variables), piece["slug"]
        assert ("crowd" in tags) == ("room.people" in code), piece["slug"]
        assert ("music" in tags) == ("audio." in code), piece["slug"]
        assert ("host" in tags) == any(v.get("access") == "host" for v in variables), piece["slug"]
