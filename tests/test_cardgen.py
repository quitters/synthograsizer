"""Composited pip cards.

The point of building these in code rather than generating them is that the
result is correct *by construction*, so the tests assert the things construction
is supposed to guarantee: the right number of pips, the right colour, identical
output every run, and an index that never collides with the pip field. The
collision one is here because the first pass got it wrong — the corner index
overlapped the top-left pip on every card that had one, and it was only obvious
once a card was rendered large.
"""

from collections import deque

import pytest

PIL = pytest.importorskip("PIL")
from PIL import Image  # noqa: E402

from scripts.cardgen import (  # noqa: E402
    LAYOUTS, RANKS, SS, SUITS, AssetKit, key_white, render_pip_card, suit_colour,
)

W, H = 142, 192  # 2x the reference cell; big enough for shapes to separate


def ink_mask(img: Image.Image, box=None):
    """Binary mask of non-white pixels, optionally cropped to `box`."""
    region = img.convert("RGB").crop(box) if box else img.convert("RGB")
    px = region.load()
    w, h = region.size
    return [[sum(px[x, y]) < 600 for x in range(w)] for y in range(h)], w, h


def count_blobs(mask, w, h):
    """Connected non-white regions (4-neighbour flood fill)."""
    seen = [[False] * w for _ in range(h)]
    blobs = 0
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or seen[y][x]:
                continue
            blobs += 1
            q = deque([(x, y)])
            seen[y][x] = True
            while q:
                cx, cy = q.popleft()
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
    return blobs


@pytest.mark.parametrize("suit", SUITS)
@pytest.mark.parametrize("rank", RANKS)
def test_every_pip_card_renders_at_the_requested_size(rank, suit):
    assert render_pip_card(rank, suit, W, H).size == (W, H)


def test_rendering_is_deterministic():
    """Composition's whole selling point over generation — same input, same card."""
    a = render_pip_card("7", "hearts", W, H)
    b = render_pip_card("7", "hearts", W, H)
    assert list(a.convert("RGBA").getdata()) == list(b.convert("RGBA").getdata())


@pytest.mark.parametrize("suit", SUITS)
def test_suit_colour_is_correct(suit):
    img = render_pip_card("5", suit, W, H).convert("RGB")
    expected_red = suit in ("hearts", "diamonds")
    px = img.load()
    reddish = blackish = 0
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if sum((r, g, b)) >= 600:
                continue
            if r > g + 60 and r > b + 60:
                reddish += 1
            elif abs(r - g) < 40 and abs(g - b) < 40:
                blackish += 1
    assert (reddish > blackish) is expected_red, f"{suit} drew the wrong colour"
    assert suit_colour(suit)[0] > 150 if expected_red else True


@pytest.mark.parametrize("rank", RANKS)
def test_pip_count_matches_the_rank(rank):
    """The central field must hold exactly as many pips as the rank says.

    Cropped to the pip field so the two corner indices are excluded; diamonds
    because its shape never touches a neighbour at these spacings, which keeps
    the flood fill counting pips rather than merged clusters.
    """
    img = render_pip_card(rank, "diamonds", W, H)
    # Starts just inboard of where the index box ends (0.045 + 0.155 = 0.20W),
    # so a stray antialiased pixel from the index isn't counted as a pip.
    box = (round(W * 0.215), round(H * 0.09), round(W * 0.785), round(H * 0.91))
    mask, mw, mh = ink_mask(img, box)
    assert count_blobs(mask, mw, mh) == len(LAYOUTS[rank])


@pytest.mark.parametrize("rank", ["4", "5", "7", "9", "10"])
@pytest.mark.parametrize("suit", SUITS)
def test_index_never_merges_into_the_pip_field(rank, suit):
    """The bug the first pass shipped: index overlapping the top-left pip.

    Asserts a clean separation rather than an exact gutter width — there must
    exist at least one fully white pixel column between the index box and the
    pip columns, across the band where the index lives. That is precisely
    "these two never touch", and unlike measuring a 2px gutter it isn't
    defeated by the antialiasing that downsampling necessarily spreads.
    """
    img = render_pip_card(rank, suit, W, H)
    # Band starts inside the card border: the border runs along the top edge
    # across every column, so including it means no column is ever fully white
    # and the test can never pass however wide the gutter is.
    band = (0, round(H * 0.05), W, round(H * 0.40))
    mask, mw, mh = ink_mask(img, band)
    x0 = round(W * 0.045 + W * 0.155)          # right edge of the index box
    x1 = round(W * 0.315 + W * 0.19 / 2)       # right edge of the left pip column

    clean = [x for x in range(x0, min(x1, mw)) if not any(mask[y][x] for y in range(mh))]
    assert clean, (f"{rank} of {suit}: no clear column between index and pips — "
                   "they are touching")


# ── Style assets ────────────────────────────────────────────────────────────

MAGENTA = (255, 0, 255)
TEAL = (0, 160, 160)


def _write_kit(dirpath, suits=("spade", "heart", "club", "diamond"), frame=True):
    """A kit whose art is unmistakable, so 'was it used?' needs no judgement."""
    dirpath.mkdir(parents=True, exist_ok=True)
    for name in suits:
        img = Image.new("RGB", (64, 64), (255, 255, 255))   # white ground, as generated
        for y in range(16, 48):
            for x in range(16, 48):
                img.putpixel((x, y), MAGENTA)
        img.save(dirpath / f"{name}.png")
    if frame:
        Image.new("RGB", (120, 160), TEAL).save(dirpath / "frame.png")
    return dirpath


def _has_colour(img, rgb, tol=30):
    px = img.convert("RGB").load()
    return any(
        all(abs(px[x, y][i] - rgb[i]) <= tol for i in range(3))
        for y in range(img.height) for x in range(img.width)
    )


def test_key_white_drops_a_white_ground_but_keeps_the_art():
    img = Image.new("RGB", (8, 8), (255, 255, 255))
    img.putpixel((4, 4), MAGENTA)
    keyed = key_white(img)
    assert keyed.getpixel((0, 0))[3] == 0, "white ground should be transparent"
    assert keyed.getpixel((4, 4))[3] == 255, "the symbol itself must survive"


def test_key_white_leaves_art_that_already_has_alpha_alone():
    """An asset the author already cut out must not be second-guessed."""
    img = Image.new("RGBA", (8, 8), (255, 255, 255, 0))
    img.putpixel((4, 4), (255, 255, 255, 255))  # deliberately white AND opaque
    assert key_white(img).getpixel((4, 4))[3] == 255


def test_assets_replace_the_drawn_suit_and_frame(tmp_path):
    kit = AssetKit(_write_kit(tmp_path / "kit"))
    card = render_pip_card("5", "spades", W, H, None, kit)
    assert _has_colour(card, MAGENTA), "suit art was not used"
    assert _has_colour(card, TEAL), "frame art was not used"


def test_a_partial_kit_falls_back_per_suit(tmp_path):
    """Iterating on one asset at a time has to keep rendering a full deck."""
    kit = AssetKit(_write_kit(tmp_path / "kit", suits=("spade",), frame=False))
    assert sorted(kit.missing()) == ["club.png", "diamond.png", "frame.png", "heart.png"]

    styled = render_pip_card("5", "spades", W, H, None, kit)
    drawn = render_pip_card("5", "hearts", W, H, None, kit)
    assert _has_colour(styled, MAGENTA), "the supplied suit should use its art"
    assert not _has_colour(drawn, MAGENTA), "a missing suit must fall back, not borrow"
    assert _has_colour(drawn, suit_colour("hearts")[:3]), "fallback should draw the shape"


def test_pip_count_still_holds_with_assets(tmp_path):
    """Styling must not disturb the layout the whole approach depends on."""
    kit = AssetKit(_write_kit(tmp_path / "kit", frame=False))
    img = render_pip_card("7", "diamonds", W, H, None, kit)
    box = (round(W * 0.215), round(H * 0.09), round(W * 0.785), round(H * 0.91))
    mask, mw, mh = ink_mask(img, box)
    assert count_blobs(mask, mw, mh) == len(LAYOUTS["7"])
