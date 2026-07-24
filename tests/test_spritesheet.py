"""Sprite-sheet slice/assemble round-trip.

The whole tool is only worth anything if slicing and reassembling is lossless —
an off-by-one in the crop box would shift every cell after the first and nobody
would notice until a restyled sheet came out subtly misaligned. So the central
assertion is pixel equality on a sheet built to make misalignment visible: every
cell is a different flat colour, so any shift changes some pixel.
"""

from pathlib import Path

import pytest

PIL = pytest.importorskip("PIL")
from PIL import Image  # noqa: E402

from scripts.spritesheet import assemble_sheet, cell_name, slice_sheet  # noqa: E402

COLS, ROWS, CW, CH = 5, 3, 7, 11  # deliberately not square, not powers of two


def _make_sheet(path: Path) -> Image.Image:
    sheet = Image.new("RGBA", (COLS * CW, ROWS * CH))
    for r in range(ROWS):
        for c in range(COLS):
            colour = (20 + c * 40, 30 + r * 60, 200 - c * 20, 255)
            sheet.paste(Image.new("RGBA", (CW, CH), colour), (c * CW, r * CH))
    sheet.save(path)
    return sheet


def test_round_trip_is_pixel_identical(tmp_path):
    src = tmp_path / "sheet.png"
    original = _make_sheet(src)

    m = slice_sheet(src, COLS, ROWS, tmp_path / "cells")
    assert (m["cell_width"], m["cell_height"]) == (CW, CH)
    assert len(m["cells"]) == COLS * ROWS

    out = tmp_path / "rebuilt.png"
    result = assemble_sheet(tmp_path / "cells", out)
    assert result["placed"] == COLS * ROWS
    assert not result["missing"] and not result["resized"]

    rebuilt = Image.open(out).convert("RGBA")
    assert rebuilt.size == original.size
    assert list(rebuilt.getdata()) == list(original.convert("RGBA").getdata())


def test_cells_carry_the_right_pixels(tmp_path):
    """Each cell must hold its own colour — catches a transposed row/col."""
    src = tmp_path / "sheet.png"
    _make_sheet(src)
    slice_sheet(src, COLS, ROWS, tmp_path / "cells")
    for r in range(ROWS):
        for c in range(COLS):
            cell = Image.open(tmp_path / "cells" / cell_name(r, c)).convert("RGBA")
            assert cell.size == (CW, CH)
            assert cell.getpixel((0, 0)) == (20 + c * 40, 30 + r * 60, 200 - c * 20, 255)


def test_uneven_grid_is_refused(tmp_path):
    """A grid that doesn't divide would silently shift every later cell.

    Note 6, not 7: the sheet is COLS*CW = 35px wide and 7 divides 35 exactly, so
    asking for 7 columns is a legitimate (if different) grid. 35 % 6 == 5.
    """
    src = tmp_path / "sheet.png"
    _make_sheet(src)
    assert (COLS * CW) % 6 != 0, "test's own premise: 6 must not divide the width"
    with pytest.raises(SystemExit) as exc:
        slice_sheet(src, 6, ROWS, tmp_path / "cells")
    assert "divide evenly" in str(exc.value)


def test_uniform_cells_are_flagged_as_filler(tmp_path):
    """Real sheets are padded out; those cells shouldn't be sent for restyling."""
    src = tmp_path / "sheet.png"
    sheet = _make_sheet(src)
    sheet.paste(Image.new("RGBA", (CW, CH), (9, 9, 9, 255)), ((COLS - 1) * CW, (ROWS - 1) * CH))
    sheet.save(src)

    m = slice_sheet(src, COLS, ROWS, tmp_path / "cells")
    flagged = [c["file"] for c in m["cells"] if c["uniform"]]
    assert cell_name(ROWS - 1, COLS - 1) in flagged


def test_missing_cell_leaves_a_hole_rather_than_shifting(tmp_path):
    """Dropping a cell must not renumber the rest — the classic reassembly bug."""
    src = tmp_path / "sheet.png"
    original = _make_sheet(src)
    cells = tmp_path / "cells"
    slice_sheet(src, COLS, ROWS, cells)
    (cells / cell_name(1, 2)).unlink()

    out = tmp_path / "rebuilt.png"
    result = assemble_sheet(cells, out)
    assert result["placed"] == COLS * ROWS - 1
    assert cell_name(1, 2) in result["missing"]

    rebuilt = Image.open(out).convert("RGBA")
    # The hole is transparent; every other cell is still exactly where it was.
    assert rebuilt.getpixel((2 * CW + 1, 1 * CH + 1))[3] == 0
    assert rebuilt.getpixel((3 * CW + 1, 1 * CH + 1)) == original.getpixel((3 * CW + 1, 1 * CH + 1))


def test_oversized_restyled_cell_is_fitted_back_to_the_grid(tmp_path):
    """Generators return their own resolution; reassembly has to normalise it."""
    src = tmp_path / "sheet.png"
    _make_sheet(src)
    cells = tmp_path / "cells"
    slice_sheet(src, COLS, ROWS, cells)
    big = Image.new("RGBA", (CW * 8, CH * 8), (255, 0, 255, 255))
    big.save(cells / cell_name(0, 0))

    out = tmp_path / "rebuilt.png"
    result = assemble_sheet(cells, out)
    assert any(cell_name(0, 0) in r for r in result["resized"])
    rebuilt = Image.open(out).convert("RGBA")
    assert rebuilt.size == (COLS * CW, ROWS * CH)
    assert rebuilt.getpixel((1, 1)) == (255, 0, 255, 255)
