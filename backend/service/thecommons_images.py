"""The Commons — room images: the default set, the one encoder, and uploads.

A piece that uses images reads them from `room.images` on the wall. A room
whose owner has uploaded none gets the DEFAULT_IMAGES below instead, so an
image piece always has something to show and can be tried before anyone
uploads.

THE SAFETY MODEL. The wall runs generated code in its own page with no
sandbox, so an uploaded file must never reach it as uploaded. sanitize()
decodes every upload with Pillow and re-encodes it with encode_webp(): a
fresh WebP, at most the wall's size, carrying nothing but pixels. The bytes
someone sent are discarded; only that output is ever stored or served. Only
the room's owner can upload (routers/thecommons.py), and there is no
automated content check: what goes on the wall is the owner's call.

static/thecommons/js/room-images.js lists the same defaults for the wall, and
tests/test_thecommons_images.py keeps the two lists, and the files, in step.
"""

import io
import logging

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

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


# ── uploads ─────────────────────────────────────────────────────────────────

MAX_ROOM_IMAGES = 12
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
# Checked from the header, before a single pixel is decoded, so a
# decompression bomb costs a few hundred bytes of reading and nothing more.
MAX_PIXELS = 40_000_000
# Decided by Pillow from the file's own bytes, never by its name or the
# content type the browser declared. JPEG covers MPO, which is how many phones
# save a photo: Pillow's JPEG opener recognises it and hands back an MPO image.
ACCEPTED_FORMATS = ("PNG", "JPEG", "WEBP", "GIF")
MIME = "image/webp"


class UnusableImage(ValueError):
    """Why an upload was refused, as a code the desk can put into words."""
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def sanitize(data: bytes) -> tuple[bytes, int, int]:
    """An upload's pixels as a fresh WebP, with its width and height.

    Raises UnusableImage for anything too big, not an image, or not one of
    the accepted formats. An animated GIF or WebP keeps its first frame.
    Phone photos come out upright, since EXIF orientation is applied before
    the metadata is dropped."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise UnusableImage("too_large", f"That file is over {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    # Load every format plugin first: open(formats=...) looks each name up and
    # fails on one (MPO, WebP) whose plugin Pillow hasn't loaded yet.
    Image.init()
    try:
        img = Image.open(io.BytesIO(data), formats=ACCEPTED_FORMATS)
    except Image.DecompressionBombError:
        # Pillow's own refusal, for a header far past even MAX_PIXELS.
        raise UnusableImage("too_many_pixels", "That image has too many pixels to put on a wall.") from None
    except Exception:  # noqa: BLE001 -- anything Pillow can't identify is simply not an image here
        raise UnusableImage("not_an_image", "That file isn't a PNG, JPEG, WebP or GIF image.") from None
    if img.width * img.height > MAX_PIXELS:
        raise UnusableImage("too_many_pixels", "That image has too many pixels to put on a wall.")
    try:
        img.seek(0)
        img.load()
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if has_alpha(img) else "RGB")
        img = fit_within(img)
        out = encode_webp(img)
    except UnusableImage:
        raise
    except Exception as exc:  # noqa: BLE001 -- a malformed file fails in many ways; all mean "no"
        logger.info("[thecommons] refused an upload that would not decode: %s", type(exc).__name__)
        raise UnusableImage("not_an_image", "That image is damaged or can't be read.") from None
    return out, img.width, img.height


def room_prefix(owner_user_id: int, room_id: int) -> str:
    """Under the owner's own prefix, so deleting their account (which deletes
    users/{id}/) takes every room image with it."""
    return f"users/{owner_user_id}/rooms/{room_id}/"


def object_path(owner_user_id: int, room_id: int, image_id: int) -> str:
    """Nothing user-controlled goes into a path: three integers."""
    return f"{room_prefix(owner_user_id, room_id)}{int(image_id)}.webp"


# ── the room's rows ─────────────────────────────────────────────────────────

async def list_images(pool, room_id: int) -> list[dict]:
    """The room's uploads in the order pieces see them."""
    rows = await pool.fetch(
        "SELECT id, position, width, height, bytes FROM commons_room_images "
        "WHERE room_id = $1 ORDER BY position, id", room_id)
    return [dict(r) for r in rows]


def wall_manifest(rows: list[dict]) -> list[dict]:
    """What the wall is told: which images, and their sizes. An empty list
    means "use the samples"."""
    return [{"id": r["id"], "width": r["width"], "height": r["height"]} for r in rows]


async def add_image(pool, room_id: int, width: int, height: int, size: int) -> dict | None:
    """A row for a new upload, at the end of the room's order, or None when
    the room already has MAX_ROOM_IMAGES. The count and the insert are one
    statement, which closes the gap a separate SELECT would leave; two uploads
    landing in the same instant could still both pass at Postgres's default
    isolation, and the owner's storage quota bounds that."""
    row = await pool.fetchrow(
        "INSERT INTO commons_room_images (room_id, position, width, height, bytes) "
        "SELECT $1, COALESCE(MAX(position), -1) + 1, $2, $3, $4 FROM commons_room_images "
        "WHERE room_id = $1 HAVING COUNT(*) < $5 "
        "RETURNING id, position, width, height, bytes",
        room_id, width, height, size, MAX_ROOM_IMAGES)
    return dict(row) if row else None


async def get_image(pool, room_id: int, image_id: int) -> dict | None:
    row = await pool.fetchrow(
        "SELECT id, position, width, height, bytes FROM commons_room_images WHERE id = $1 AND room_id = $2",
        image_id, room_id)
    return dict(row) if row else None


async def delete_image(pool, room_id: int, image_id: int) -> bool:
    row = await pool.fetchrow(
        "DELETE FROM commons_room_images WHERE id = $1 AND room_id = $2 RETURNING id", image_id, room_id)
    return row is not None


async def reorder(pool, room_id: int, ids: list[int]) -> bool:
    """Put the room's images in this order. `ids` must be exactly the room's
    images, each once; anything else changes nothing and returns False."""
    current = {r["id"] for r in await list_images(pool, room_id)}
    if len(ids) != len(set(ids)) or set(ids) != current:
        return False
    await pool.execute(
        "UPDATE commons_room_images AS i SET position = o.pos - 1 "
        "FROM unnest($2::bigint[]) WITH ORDINALITY AS o(id, pos) "
        "WHERE i.id = o.id AND i.room_id = $1",
        room_id, ids)
    return True
