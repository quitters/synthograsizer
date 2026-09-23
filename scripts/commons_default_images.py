"""Make The Commons' default room images.

    python scripts/commons_default_images.py [--only harbour,fox,emblem]

Run once; the output is committed, so builds and tests never call the model.
It asks the suite's own image model for each picture, then fits it to the
exact size backend/service/thecommons_images.py declares and writes it with
that module's encoder -- the one uploads will go through too. The emblem is
drawn on a flat green ground, which is keyed out here to real transparency,
since image models don't return an alpha channel.

Spends a few image generations on the key from GOOGLE_API_KEY / GEMINI_API_KEY
or ai_studio_config.json, which it never prints. The prompts are the record:
they are written to the README beside the images.
"""

import argparse
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PIL import Image  # noqa: E402

from backend import config, google_api  # noqa: E402
from backend.service.thecommons_images import DEFAULT_IMAGES, cover, encode_webp  # noqa: E402

OUT = ROOT / "static" / "thecommons" / "img" / "defaults"
MODEL = config.MODEL_IMAGE_GEN_NB2
KEY_GREEN = (0, 255, 0)

# Nothing here depicts a real person, a brand, or any artist's style. Each
# picture is chosen for what it tests: the harbour is a full frame of colour
# and edges, the fox a clear subject in the wrong shape for the wall, the
# emblem a transparent graphic to float as a sprite.
PROMPTS = {
    "harbour": ("16:9",
                "A small fishing harbour at golden hour, photographed from the quay: brightly painted "
                "wooden boats in red, yellow and blue moored in rippling water full of their reflections, "
                "a white lighthouse at the end of a stone pier, green hills and a warm sky behind, a few "
                "gulls. Rich saturated colour, crisp detail, strong edges. No people, no text, no logos."),
    "fox": ("3:4",
            "A studio portrait of a red fox sitting upright and looking straight at the camera, sharp "
            "detail in its fur and whiskers, soft side lighting, against a plain smooth teal backdrop "
            "with nothing else in frame. No text, no logos."),
    "emblem": ("1:1",
               "A bold flat graphic emblem centred in the frame: a stylised sun with twelve thick rays "
               "inside a round badge ring, in orange, magenta, deep blue and cream, heavy dark outlines, "
               "no gradients. The background is one flat, perfectly uniform pure green (#00FF00) with "
               "nothing on it, and no green anywhere in the emblem. No text, no letters, no logos."),
}


def key_out_green(img: Image.Image) -> Image.Image:
    """Pure green becomes transparent, with a soft edge, and green spill on the
    emblem's rim is pulled back to neutral so no fringe shows over dark walls."""
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, _ = px[x, y]
            # How much greener than its other channels this pixel is.
            spill = g - max(r, b)
            if spill > 90:
                px[x, y] = (r, g, b, 0)
            elif spill > 25:
                alpha = round(255 * (90 - spill) / 65)
                px[x, y] = (r, max(r, b), b, alpha)
            elif spill > 0:
                px[x, y] = (r, max(r, b), b, 255)
    return img


def make(name: str, client) -> Path:
    spec = next(d for d in DEFAULT_IMAGES if d["file"] == f"{name}.webp")
    aspect, prompt = PROMPTS[name]
    data, _mime, text = google_api.gen_image(client, MODEL, [google_api.text_block(prompt)],
                                             aspect_ratio=aspect, image_size="2K")
    if data is None:
        raise RuntimeError(f"{name}: the model answered with text only: {text!r}")
    img = Image.open(io.BytesIO(data))
    img.load()
    if name == "emblem":
        img = key_out_green(img)
    img = cover(img, spec["width"], spec["height"])
    path = OUT / spec["file"]
    path.write_bytes(encode_webp(img))
    return path


def write_readme() -> None:
    lines = ["# The Commons — default room images", "",
             "Pieces that use images get these three when a room's owner hasn't uploaded any.",
             "Made once by `scripts/commons_default_images.py` with the suite's image model "
             f"(`{MODEL}`), fitted to size and re-encoded by `backend/service/thecommons_images.py`.",
             "Nothing here depicts a real person, a brand, or any artist's style.", ""]
    for d in DEFAULT_IMAGES:
        name = d["file"].removesuffix(".webp")
        aspect, prompt = PROMPTS[name]
        lines += [f"## {d['file']} — {d['width']}×{d['height']}", "",
                  f"Asked for at {aspect}:", "", f"> {prompt}", ""]
    lines.append("The emblem was drawn on a flat green ground, keyed out to transparency by the script.")
    (OUT / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--only", help="comma-separated: harbour, fox, emblem")
    args = parser.parse_args()
    key = config.get_api_key()
    if not key:
        print("no API key: set GOOGLE_API_KEY or run from a checkout with ai_studio_config.json",
              file=sys.stderr)
        return 1
    from google import genai
    client = genai.Client(api_key=key)
    OUT.mkdir(parents=True, exist_ok=True)
    names = args.only.split(",") if args.only else list(PROMPTS)
    for name in names:
        path = make(name, client)
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")
    write_readme()
    return 0


if __name__ == "__main__":
    sys.exit(main())
