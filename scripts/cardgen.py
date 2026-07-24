#!/usr/bin/env python3
"""cardgen — composite the 40 pip cards of a deck deterministically.

Why compose instead of generate: a pip card is layout, not art. A2-10 in four
suits is a frame, N suit symbols in the canonical arrangement, and a rank glyph
in two corners. Generating those 40 with an image model means 40 independent
samples that drift in border weight, margin and palette, and it is exactly the
40 cards where drift is most visible because they sit next to each other. Built
in code they are identical by construction, and generation is reserved for the
12 court cards and the back, where variation is wanted anyway.

    python -m scripts.cardgen deck -o cells/ --width 71 --height 96
    python -m scripts.spritesheet assemble cells/ -o deck.png

Output filenames match scripts/spritesheet.py's manifest convention
(``cell_rRR_cCC.png``, row = suit, col 0-9 = A-10), so a generated deck drops
straight into a sliced sheet and `assemble` closes the loop unchanged.

Suits are drawn as shapes rather than scaled from a source sheet so they stay
crisp at any size; everything is rendered at SS x scale and downsampled, because
Pillow's polygon fill is aliased and a 71px card shows it badly.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover - dependency is in requirements.txt
    sys.exit("Pillow is required: pip install -r requirements.txt")

SS = 4  # supersampling factor

SUITS = ["spades", "hearts", "clubs", "diamonds"]  # row order of the reference sheet
RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
RED = (206, 17, 38, 255)
BLACK = (17, 17, 17, 255)

# Canonical pip arrangements. (column, y) with column -1/0/+1 and y as a
# fraction of the pip field; anything below the midline is drawn rotated 180
# degrees, which is what makes a real card readable from either end.
LAYOUTS = {
    "A":  [(0, 0.50)],
    "2":  [(0, 0.16), (0, 0.84)],
    "3":  [(0, 0.16), (0, 0.50), (0, 0.84)],
    "4":  [(-1, 0.16), (1, 0.16), (-1, 0.84), (1, 0.84)],
    "5":  [(-1, 0.16), (1, 0.16), (0, 0.50), (-1, 0.84), (1, 0.84)],
    "6":  [(-1, 0.16), (1, 0.16), (-1, 0.50), (1, 0.50), (-1, 0.84), (1, 0.84)],
    "7":  [(-1, 0.16), (1, 0.16), (0, 0.33), (-1, 0.50), (1, 0.50),
           (-1, 0.84), (1, 0.84)],
    "8":  [(-1, 0.16), (1, 0.16), (0, 0.33), (-1, 0.50), (1, 0.50), (0, 0.67),
           (-1, 0.84), (1, 0.84)],
    "9":  [(-1, 0.16), (1, 0.16), (-1, 0.39), (1, 0.39), (0, 0.50),
           (-1, 0.61), (1, 0.61), (-1, 0.84), (1, 0.84)],
    "10": [(-1, 0.16), (1, 0.16), (0, 0.28), (-1, 0.39), (1, 0.39),
           (-1, 0.61), (1, 0.61), (0, 0.72), (-1, 0.84), (1, 0.84)],
}

FONT_CANDIDATES = [
    "C:/Windows/Fonts/georgiab.ttf", "C:/Windows/Fonts/georgia.ttf",
    "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/Arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
]


def suit_colour(suit: str):
    return RED if suit in ("hearts", "diamonds") else BLACK


def load_font(size: int, override: str | None = None):
    for path in ([override] if override else []) + FONT_CANDIDATES:
        if path and Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_suit(img: Image.Image, suit: str, box, colour):
    """Draw `suit` filling `box` = (x0, y0, x1, y1), in device pixels."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d = ImageDraw.Draw(img)
    X = lambda u: x0 + u * w  # noqa: E731 - normalised -> device
    Y = lambda v: y0 + v * h  # noqa: E731

    if suit == "diamonds":
        d.polygon([(X(.5), Y(0)), (X(.94), Y(.5)), (X(.5), Y(1)), (X(.06), Y(.5))],
                  fill=colour)
    elif suit == "hearts":
        d.ellipse([X(.02), Y(.02), X(.52), Y(.60)], fill=colour)
        d.ellipse([X(.48), Y(.02), X(.98), Y(.60)], fill=colour)
        d.polygon([(X(.03), Y(.42)), (X(.97), Y(.42)), (X(.5), Y(1))], fill=colour)
    elif suit == "spades":
        # A heart upside down, plus a stem.
        d.ellipse([X(.02), Y(.40), X(.52), Y(.98)], fill=colour)
        d.ellipse([X(.48), Y(.40), X(.98), Y(.98)], fill=colour)
        d.polygon([(X(.03), Y(.58)), (X(.97), Y(.58)), (X(.5), Y(0))], fill=colour)
        d.polygon([(X(.42), Y(1)), (X(.58), Y(1)), (X(.54), Y(.72)), (X(.46), Y(.72))],
                  fill=colour)
    elif suit == "clubs":
        d.ellipse([X(.20), Y(.02), X(.80), Y(.62)], fill=colour)
        d.ellipse([X(.02), Y(.34), X(.62), Y(.94)], fill=colour)
        d.ellipse([X(.38), Y(.34), X(.98), Y(.94)], fill=colour)
        d.polygon([(X(.40), Y(1)), (X(.60), Y(1)), (X(.56), Y(.60)), (X(.44), Y(.60))],
                  fill=colour)
    else:
        raise ValueError(f"unknown suit: {suit}")


def _suit_stamp(suit: str, size: int, colour) -> Image.Image:
    stamp = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_suit(stamp, suit, (0, 0, size, size), colour)
    return stamp


def render_pip_card(rank: str, suit: str, width: int, height: int,
                    font_path: str | None = None) -> Image.Image:
    if rank not in LAYOUTS:
        raise ValueError(f"{rank} is not a pip card (A-10)")
    colour = suit_colour(suit)
    W, H = width * SS, height * SS
    card = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(card)

    # Border: a thin rounded rect, inset so it survives the downsample.
    inset = max(1, round(W * 0.012))
    radius = round(W * 0.07)
    d.rounded_rectangle([inset, inset, W - inset - 1, H - inset - 1],
                        radius=radius, outline=(60, 60, 60, 255),
                        width=max(1, round(W * 0.010)))

    # ── Corner index: rank glyph with a small suit pip beneath it ──
    # Kept narrow on purpose. On a real deck the index column clears the pip
    # columns entirely; a wider box overlaps the top-left pip on every card that
    # has one, which is exactly what a first pass at these numbers produced.
    margin = round(W * 0.045)
    corner_w, corner_h = round(W * 0.155), round(H * 0.26)
    pip_small = round(W * 0.105)

    # "10" is twice the width of every other rank, so fit the glyph to the box
    # rather than letting the one two-character rank overflow it.
    glyph = max(8, round(H * 0.185))
    font = load_font(glyph, font_path)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    while glyph > 8 and probe.textlength(rank, font=font) > corner_w:
        glyph -= max(1, glyph // 12)
        font = load_font(glyph, font_path)

    corner = Image.new("RGBA", (corner_w, corner_h), (0, 0, 0, 0))
    cd = ImageDraw.Draw(corner)
    cd.text((corner_w / 2, 0), rank, font=font, fill=colour, anchor="ma")
    corner.alpha_composite(_suit_stamp(suit, pip_small, colour),
                           ((corner_w - pip_small) // 2, corner_h - pip_small))
    card.alpha_composite(corner, (margin, margin))
    card.alpha_composite(corner.rotate(180, expand=False),
                         (W - margin - corner_w, H - margin - corner_h))

    # ── Pip field ──
    # Columns sit outboard of the index box (which ends at margin + corner_w),
    # so the two never collide however tall the rank glyph is.
    fx0, fx1 = W * 0.315, W * 0.685
    fy0, fy1 = H * 0.13, H * 0.87
    pip = round(W * (0.32 if rank == "A" else 0.19))
    stamp = _suit_stamp(suit, pip, colour)
    flipped = stamp.rotate(180, expand=False)

    for col, y in LAYOUTS[rank]:
        cx = (fx0 + fx1) / 2 + col * (fx1 - fx0) / 2
        cy = fy0 + y * (fy1 - fy0)
        card.alpha_composite(flipped if y > 0.5 else stamp,
                             (round(cx - pip / 2), round(cy - pip / 2)))

    return card.resize((width, height), Image.LANCZOS)


def render_deck(out_dir: Path, width: int, height: int,
                font_path: str | None = None) -> list[str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for row, suit in enumerate(SUITS):
        for col, rank in enumerate(RANKS):
            name = f"cell_r{row:02d}_c{col:02d}.png"
            render_pip_card(rank, suit, width, height, font_path).save(out_dir / name)
            written.append(name)
    return written


def main(argv=None):
    p = argparse.ArgumentParser(prog="cardgen", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("deck", help="render the 40 pip cards (A-10 x 4 suits)")
    d.add_argument("-o", "--out", type=Path, required=True)
    d.add_argument("--width", type=int, default=71)
    d.add_argument("--height", type=int, default=96)
    d.add_argument("--font", help="path to a .ttf for the rank glyphs")
    args = p.parse_args(argv)

    written = render_deck(args.out, args.width, args.height, args.font)
    print(f"rendered {len(written)} pip cards at {args.width}x{args.height} -> {args.out}")
    print("  court cards (cols 10-12) and any backs are left to you — "
          "drop them in and run `spritesheet assemble`")


if __name__ == "__main__":
    main()
