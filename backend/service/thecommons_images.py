"""The Commons — room images: the default set, and the one encoder.

A piece that uses images reads them from `room.images` on the wall. A room
whose owner has uploaded none gets the DEFAULT_IMAGES below instead, so an
image piece always has something to show and can be tried before anyone
uploads. Uploads (a later change) are re-encoded by encode_webp() too: an
image reaches the wall only as a file this module wrote, never as the bytes
someone sent.

static/thecommons/js/room-images.js lists the same defaults for the wall, and
tests/test_thecommons_images.py keeps the two lists, and the files, in step.
"""

import io

from PIL import Image, ImageOps

# The wall's own resolution: nothing larger is ever worth decoding there.
MAX_EDGE = 1920
WEBP_QUALITY = 85

DEFAULTS_URL = "/thecommons/img/defaults"

# Three shapes, so a piece meets a wide image, a tall one and a transparent
# one before it ever meets an upload.
DEFAULT_IMAGES: tuple[dict, ...] = (
    {"id": "default-harbour", "file": "harbour.webp", "width": 1920, "height": 1080},
    {"id": "default-fox", "file": "fox.webp", "width": 1080, "height": 1440},
    {"id": "default-emblem", "file": "emblem.webp", "width": 1024, "height": 1024},
)


def default_manifest() -> list[dict]:
    """The default set as the wall and the generator see it: ids and sizes."""
    return [{"id": d["id"], "width": d["width"], "height": d["height"], "default": True}
            for d in DEFAULT_IMAGES]


def has_alpha(img: Image.Image) -> bool:
    if img.mode in ("RGBA", "LA"):
        return img.getchannel("A").getextrema()[0] < 255
    return img.mode == "P" and "transparency" in img.info


def fit_within(img: Image.Image, max_edge: int = MAX_EDGE) -> Image.Image:
    """Shrink so the long edge is at most max_edge. Never enlarges."""
    if max(img.size) <= max_edge:
        return img
    scale = max_edge / max(img.size)
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                      Image.Resampling.LANCZOS)


def cover(img: Image.Image, width: int, height: int) -> Image.Image:
    """Scale and centre-crop to exactly width x height."""
    return ImageOps.fit(img, (width, height), Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def encode_webp(img: Image.Image) -> bytes:
    """The only way an image leaves this module: a fresh WebP with no metadata.

    RGB, or RGBA when the image really is transparent. Pillow writes no EXIF,
    ICC or XMP here because none is passed, so nothing the source carried
    survives but its pixels."""
    img = img.convert("RGBA" if has_alpha(img) else "RGB")
    out = io.BytesIO()
    img.save(out, format="WEBP", quality=WEBP_QUALITY, method=6)
    return out.getvalue()
