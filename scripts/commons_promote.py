"""Promote a generated Commons piece into the curated gallery.

    python scripts/commons_promote.py piece.json some-slug

`piece.json` is either a generated sketch (a job row's `sketch`, as the
generator returns it) or a Commons Sketchbook record, which holds one under
`sketch`. It writes backend/service/thecommons_data/gallery/<slug>.js and
<slug>.json, which the gallery loads with no other entry anywhere.

This copies files; it is not the review. Every gallery piece runs live on the
signed-in desk, so read the code before committing it, and run
tests/test_thecommons_gallery.py, whose node harness is the check that a piece
actually runs. A generated piece arrives with its listing (section, blurb,
prompt, look tags) already written; edit the .json afterwards to change any of
it, and give it at least one look tag if the designer left it none.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.service.thecommons_gallery import _DIR, GALLERY  # noqa: E402
from backend.service.thecommons_ui import normalize_listing  # noqa: E402
from backend.service.thecommons_validate import validate_native_sketch  # noqa: E402

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def gallery_files(piece: dict) -> tuple[str, dict]:
    """The <slug>.js body and <slug>.json content for a generated sketch or a
    Sketchbook record. Raises ValueError when it can't be a gallery piece."""
    record = piece if "sketch" in piece else None
    sketch = piece["sketch"] if record else piece
    if sketch.get("fallback"):
        raise ValueError("a fallback is already a curated piece, not a generated one")
    if not sketch.get("ui"):
        raise ValueError("no designed panel: a gallery piece needs one")
    if "room.images" in (sketch.get("code") or ""):
        raise ValueError("it uses room images, which belong to one room: it can't be a gallery piece")
    checked = validate_native_sketch(sketch)            # raises InvalidSketchError, a ValueError
    prompt = (record or {}).get("prompt") or (sketch.get("listing") or {}).get("prompt") or ""
    # Normalised again, so a hand-edited or older listing is held to the rules
    # a fresh one is -- and a piece from before listings existed gets one.
    listing = normalize_listing(sketch.get("listing"), checked["variables"], prompt)
    if not listing["prompt"]:
        raise ValueError("no prompt: a generated piece's lineage is the prompt it came from")
    if record:
        listing["source"] = record["id"]
    return sketch["code"], {
        "name": sketch["name"], "promptTemplate": sketch["promptTemplate"],
        "variables": sketch["variables"], "ui": sketch["ui"], "listing": listing,
    }


def promote(piece: dict, slug: str, dest: Path = _DIR) -> list[Path]:
    if not _SLUG_RE.match(slug):
        raise ValueError(f"{slug!r} is not a slug: lowercase words joined by hyphens")
    if slug in {meta["slug"] for meta in GALLERY} or (dest / f"{slug}.js").exists():
        raise ValueError(f"{slug} is already in the gallery")
    code, sidecar = gallery_files(piece)
    js, meta = dest / f"{slug}.js", dest / f"{slug}.json"
    js.write_text(code, encoding="utf-8", newline="\n")
    meta.write_text(json.dumps(sidecar, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return [js, meta]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("piece", type=Path, help="a generated sketch or a Sketchbook record, as JSON")
    parser.add_argument("slug", help="the piece's gallery slug, e.g. dot-tunnel")
    args = parser.parse_args()
    try:
        written = promote(json.loads(args.piece.read_text(encoding="utf-8")), args.slug)
    except (OSError, ValueError, KeyError) as exc:
        print(f"not promoted: {exc}", file=sys.stderr)
        return 1
    for path in written:
        print(f"wrote {path.relative_to(ROOT)}")
    listing = json.loads(written[1].read_text(encoding="utf-8"))["listing"]
    if not listing["look"]:
        print("add at least one look tag to its listing before committing", file=sys.stderr)
    print("now read the code, then run: python -m pytest tests/test_thecommons_gallery.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
