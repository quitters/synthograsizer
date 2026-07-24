#!/usr/bin/env python3
"""spritesheet — slice a uniform sprite sheet into cells and put it back together.

Why this exists: a whole-sheet Smart Transform restyles the *look* of a sheet but
loses the *identity* of its cells. Asking one image call to preserve 78 distinct
cards at ~98x133px each reliably scrambles ranks and suits (verified on a real
13x6 deck: spades lost every pip, clubs became one repeated pattern). Restyling
per cell fixes that, and this is the prep and reassembly either side of it.

    python -m scripts.spritesheet slice  CardsGrid.png --cols 13 --rows 6 -o cells/
    # …restyle cells/ however you like — Smart Transform batch mode, by hand, …
    python -m scripts.spritesheet assemble cells/ -o CardsGrid-restyled.png

`slice` writes a `sheet.json` manifest next to the cells recording the grid, the
cell size, and which cells are a single flat colour (sheets are usually padded
out with filler — on the reference deck 5 of 78 were). `assemble` reads it, so
the grid only has to be stated once and a filler cell can be left out of a
restyle run and still land back in the right place.

Round-tripping is lossless: assembling freshly-sliced cells reproduces the source
pixel-for-pixel, which `tests/test_spritesheet.py` asserts on a synthetic sheet.
Cells are RGBA throughout so transparent sheets survive the trip.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - dependency is in requirements.txt
    sys.exit("Pillow is required: pip install -r requirements.txt")

MANIFEST_NAME = "sheet.json"
CELL_GLOB = "cell_*.png"


def cell_name(row: int, col: int) -> str:
    """Row-major, zero-padded so shell globbing and sorting agree."""
    return f"cell_r{row:02d}_c{col:02d}.png"


def is_uniform(img: Image.Image) -> bool:
    """True when every pixel is identical — i.e. the cell is filler, not art."""
    extrema = img.convert("RGBA").getextrema()
    return all(lo == hi for lo, hi in extrema)


def slice_sheet(sheet_path: Path, cols: int, rows: int, out_dir: Path) -> dict:
    sheet = Image.open(sheet_path).convert("RGBA")
    w, h = sheet.size
    if w % cols or h % rows:
        sys.exit(
            f"{w}x{h} does not divide evenly into {cols}x{rows} "
            f"(cell would be {w / cols:.2f}x{h / rows:.2f}). "
            "Uneven grids would silently shift every cell after the first."
        )
    cw, ch = w // cols, h // rows
    out_dir.mkdir(parents=True, exist_ok=True)

    cells = []
    for r in range(rows):
        for c in range(cols):
            box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
            cell = sheet.crop(box)
            name = cell_name(r, c)
            cell.save(out_dir / name)
            cells.append({"row": r, "col": c, "file": name, "uniform": is_uniform(cell)})

    manifest = {
        "source": sheet_path.name,
        "cols": cols,
        "rows": rows,
        "cell_width": cw,
        "cell_height": ch,
        "sheet_width": w,
        "sheet_height": h,
        "cells": cells,
    }
    (out_dir / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2))
    return manifest


def assemble_sheet(cells_dir: Path, out_path: Path, background: str | None = None) -> dict:
    manifest_path = cells_dir / MANIFEST_NAME
    if not manifest_path.exists():
        sys.exit(f"no {MANIFEST_NAME} in {cells_dir} — was this directory made by `slice`?")
    m = json.loads(manifest_path.read_text())

    cw, ch = m["cell_width"], m["cell_height"]
    bg = (0, 0, 0, 0)
    if background:
        bg = Image.new("RGBA", (1, 1), background).getpixel((0, 0))
    sheet = Image.new("RGBA", (m["cols"] * cw, m["rows"] * ch), bg)

    placed, missing, resized = 0, [], []
    for cell in m["cells"]:
        path = cells_dir / cell["file"]
        if not path.exists():
            # A cell left out of a restyle run is a normal case, not an error:
            # it just keeps the background. Reported so it is never a surprise.
            missing.append(cell["file"])
            continue
        img = Image.open(path).convert("RGBA")
        if img.size != (cw, ch):
            # Restyled cells routinely come back at the generator's own
            # resolution. Fitting them to the grid is the whole point of
            # reassembly, so do it, but say so.
            resized.append(f"{cell['file']} {img.size[0]}x{img.size[1]}->{cw}x{ch}")
            img = img.resize((cw, ch), Image.LANCZOS)
        sheet.paste(img, (cell["col"] * cw, cell["row"] * ch))
        placed += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    return {"placed": placed, "missing": missing, "resized": resized,
            "size": f"{sheet.width}x{sheet.height}"}


def main(argv=None):
    p = argparse.ArgumentParser(prog="spritesheet", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("slice", help="split a sheet into per-cell PNGs + manifest")
    s.add_argument("sheet", type=Path)
    s.add_argument("--cols", type=int, required=True)
    s.add_argument("--rows", type=int, required=True)
    s.add_argument("-o", "--out", type=Path, required=True, help="output directory")

    a = sub.add_parser("assemble", help="rebuild a sheet from a sliced directory")
    a.add_argument("cells", type=Path)
    a.add_argument("-o", "--out", type=Path, required=True)
    a.add_argument("--background", help="fill for missing cells (e.g. '#1b6b3a'); default transparent")

    args = p.parse_args(argv)

    if args.cmd == "slice":
        m = slice_sheet(args.sheet, args.cols, args.rows, args.out)
        filler = [c["file"] for c in m["cells"] if c["uniform"]]
        print(f"sliced {m['sheet_width']}x{m['sheet_height']} into "
              f"{m['cols']}x{m['rows']} cells of {m['cell_width']}x{m['cell_height']} "
              f"-> {args.out}")
        if filler:
            print(f"  {len(filler)} flat-colour cell(s), likely filler: {', '.join(filler)}")
    else:
        r = assemble_sheet(args.cells, args.out, args.background)
        print(f"assembled {r['placed']} cell(s) -> {args.out} ({r['size']})")
        if r["resized"]:
            print(f"  resized to fit the grid: {'; '.join(r['resized'])}")
        if r["missing"]:
            print(f"  {len(r['missing'])} cell(s) absent, left as background: "
                  f"{', '.join(r['missing'])}")


if __name__ == "__main__":
    main()
