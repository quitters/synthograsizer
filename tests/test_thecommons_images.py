"""Room images, before uploads exist: the default set, the one encoder, the
guard that keeps image pieces out of the gallery, and a reference piece run
with and without images."""

import io
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image

from backend.routers.thecommons import _preset_row
from backend.service.thecommons_gallery import _DIR as GALLERY_DIR
from backend.service.thecommons_gallery_tags import DOES_TAGS
from backend.service.thecommons_images import (
    DEFAULT_IMAGES, DEFAULTS_URL, MAX_EDGE, cover, default_manifest, encode_webp, fit_within,
)
from tests.test_thecommons_gallery import _NODE_HARNESS

ROOT = Path(__file__).resolve().parent.parent
DEFAULTS_DIR = ROOT / "static" / DEFAULTS_URL.strip("/")
ROOM_IMAGES_JS = ROOT / "static" / "thecommons" / "js" / "room-images.js"
FIXTURES = Path(__file__).resolve().parent / "fixtures"

sys.path.insert(0, str(ROOT / "scripts"))
import commons_promote  # noqa: E402


# ── the default set ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("default", DEFAULT_IMAGES, ids=lambda d: d["id"])
def test_each_default_image_is_the_size_it_claims(default):
    img = Image.open(DEFAULTS_DIR / default["file"])
    assert img.format == "WEBP"
    assert img.size == (default["width"], default["height"])
    assert max(img.size) <= MAX_EDGE


def test_the_defaults_cover_wide_tall_and_transparent():
    shapes = {d["id"]: d["width"] / d["height"] for d in DEFAULT_IMAGES}
    assert any(r > 1.2 for r in shapes.values()) and any(r < 0.9 for r in shapes.values())
    emblem = Image.open(DEFAULTS_DIR / "emblem.webp")
    assert emblem.mode == "RGBA" and emblem.getchannel("A").getextrema()[0] == 0
    for opaque in ("harbour.webp", "fox.webp"):
        assert Image.open(DEFAULTS_DIR / opaque).mode == "RGB"


def test_the_wall_lists_the_same_defaults_as_the_server():
    source = ROOM_IMAGES_JS.read_text(encoding="utf-8")
    listed = [
        {"id": m[0], "file": m[1], "width": int(m[2]), "height": int(m[3])}
        for m in re.findall(r"\{ id: '([^']+)', file: '([^']+)', width: (\d+), height: (\d+) \}", source)
    ]
    assert listed == list(DEFAULT_IMAGES)
    assert f"'{DEFAULTS_URL}'" in source


def test_the_manifest_a_piece_is_described_by_marks_every_default():
    assert [m["id"] for m in default_manifest()] == [d["id"] for d in DEFAULT_IMAGES]
    assert all(m["default"] is True for m in default_manifest())


def test_the_defaults_say_where_they_came_from():
    readme = (DEFAULTS_DIR / "README.md").read_text(encoding="utf-8")
    for d in DEFAULT_IMAGES:
        assert d["file"] in readme
    assert "no real person" in readme.lower() or "nothing here depicts a real person" in readme.lower()


# ── the encoder ──────────────────────────────────────────────────────────────

def _jpeg_with_exif() -> Image.Image:
    img = Image.new("RGB", (400, 300), (200, 40, 40))
    exif = Image.Exif()
    exif[0x010F] = "SomeCamera"        # Make
    exif[0x9286] = "a private comment"  # UserComment
    raw = io.BytesIO()
    img.save(raw, format="JPEG", exif=exif, icc_profile=b"\0" * 128)
    return Image.open(io.BytesIO(raw.getvalue()))


def test_encoding_keeps_the_pixels_and_nothing_else():
    source = _jpeg_with_exif()
    assert source.info.get("exif") and source.info.get("icc_profile")
    out = Image.open(io.BytesIO(encode_webp(source)))
    assert out.format == "WEBP" and out.size == (400, 300) and out.mode == "RGB"
    assert not out.info.get("exif") and not out.info.get("icc_profile") and not out.info.get("xmp")


def test_alpha_is_kept_only_when_something_is_transparent():
    opaque = Image.new("RGBA", (64, 64), (10, 200, 10, 255))
    assert Image.open(io.BytesIO(encode_webp(opaque))).mode == "RGB"
    clear = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    assert Image.open(io.BytesIO(encode_webp(clear))).mode == "RGBA"


def test_fitting_shrinks_to_the_wall_and_never_enlarges():
    assert fit_within(Image.new("RGB", (4000, 1000))).size == (MAX_EDGE, 480)
    assert fit_within(Image.new("RGB", (300, 200))).size == (300, 200)
    assert cover(Image.new("RGB", (1000, 1000)), 160, 90).size == (160, 90)


# ── per-room only ────────────────────────────────────────────────────────────

def test_no_gallery_piece_uses_room_images():
    """Room images belong to one room. A gallery piece that used them would
    show a different room's uploads, or the samples, to everyone."""
    users = [p.stem for p in GALLERY_DIR.glob("*.js") if "room.images" in p.read_text(encoding="utf-8")]
    assert users == []


def test_a_piece_that_uses_images_is_never_promoted(tmp_path):
    sketch = {"name": "Sprites", "promptTemplate": "sprites at {{speed}} and {{size}}",
              "variables": [{"name": "speed", "type": "number", "min": 0, "max": 2, "step": 0.1, "default": 1},
                            {"name": "size", "type": "number", "min": 0.1, "max": 0.8, "step": 0.05,
                             "default": 0.4}],
              "code": (FIXTURES / "commons_image_sprites.js").read_text(encoding="utf-8"),
              "ui": {"skin": "desk", "variant": "blue"},
              "listing": {"section": "generative", "blurb": "Sprites.", "prompt": "sprites", "look": ["calm"]}}
    with pytest.raises(ValueError, match="room images"):
        commons_promote.promote(sketch, "sprites", tmp_path)
    assert not list(tmp_path.iterdir())


def test_a_saved_piece_that_uses_images_is_marked_on_the_desk():
    assert "images" in DOES_TAGS
    uses = {"id": "7", "name": "Sprites", "kind": "Generated pieces", "sketch": {"code": "room.images.length"}}
    plain = {"id": "8", "name": "Plasma", "kind": "Generated pieces", "sketch": {"code": "ctx.fillRect(0,0,1,1)"}}
    assert _preset_row(uses)["usesImages"] is True
    assert "usesImages" not in _preset_row(plain)
    assert "usesImages" not in _preset_row({"id": "9", "name": "x", "kind": "Built-in pieces", "sketch": None})


# ── the reference piece ──────────────────────────────────────────────────────

@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_the_reference_piece_runs_with_images_and_without(tmp_path):
    """The gallery harness runs every piece with no images and with stubs of the
    three defaults; the reference piece has to pass both, with its own knobs
    unset, as a wall that has only just loaded would run it."""
    harness = tmp_path / "harness.cjs"
    harness.write_text(_NODE_HARNESS, encoding="utf-8")
    assert "STUB_IMAGES" in _NODE_HARNESS and "/*DEFAULT_IMAGES*/" not in _NODE_HARNESS
    result = subprocess.run(["node", str(harness), str(FIXTURES), json.dumps({"commons_image_sprites": []})],
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
