"""The Commons — works by other artists, shown from a generative art archive.

Everything else on a wall is code this repository holds: written here, generated
here, or ported here. An archive piece is none of those. It is another artist's
work, running from that artist's own code in a page the archive serves, with
controls added at the lines where the code chooses each trait. The wall frames
that page (`sketch.page`); nothing of the artist's code is in this repository or
is ever handed to the desk.

What is here, one <slug>.json per work in thecommons_data/archive/, is the
control surface and the CREDIT, both written by the archive's own tooling
(GenerativeArtArchive, tools/traits/commons.mjs --export) from its record of the
original: nothing is typed in by hand, and nothing is written by a model.

Three rules, enforced below rather than left to whoever adds a file:

  1. No credit, no piece. Title and artist are required, and the credit travels
     with the sketch (`sketch.credit`), so the wall and the desk can always
     show it.
  2. No licence to adapt, no piece. Only works whose licence permits shared
     adaptations (Creative Commons without NoDerivatives, or CC0) are listed.
     A NoDerivatives work, an NFT licence, a bare copyright line or no recorded
     licence at all is skipped and logged: those need the artist's own yes.
  3. Off unless a venue turns it on. The pieces exist only when
     SYNTH_COMMONS_ARCHIVE_ORIGIN names the archive that serves the pages
     (http://localhost:8130 for the explorer on the same machine). Without it
     there is no section, no piece, and nothing in production changes.

On the desk an archive piece's thumbnail and its fallback on an older display
are the same small native sketch: a title card that draws the credit.
"""

import json
import logging
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

from backend.service.thecommons_validate import validate_native_sketch

logger = logging.getLogger(__name__)

_DIR = Path(__file__).parent / "thecommons_data" / "archive"
ORIGIN_ENV = "SYNTH_COMMONS_ARCHIVE_ORIGIN"

# A section of well over a hundred works is not a wall of cards: the desk shows
# `paged` of them at a time, in the order the host picks from `sorts` (the first
# is the default), and search and the tag chips still reach every one.
SECTION = {"id": "archive", "title": "Creative Commons Generative Art",
           "intro": "Works by other artists, released under Creative Commons licences that allow "
                    "adaptation. Each runs from its artist's own code with controls added, and "
                    "carries its credit and its licence.",
           "paged": 12,
           "sorts": [{"id": "collected", "label": "Most collected"},
                     {"id": "newest", "label": "Newest"},
                     {"id": "title", "label": "Title, A to Z"},
                     {"id": "artist", "label": "Artist, A to Z"}]}

_ADAPTATIONS = ("permitted", "not-permitted", "unclear")
_PAGE_PATH_RE = re.compile(r"^/(?!/)[\w./?=&%:~-]+$")
DESCRIPTION_CAP = 6000


def archive_origin() -> str | None:
    """The archive that serves the pages, as scheme://host[:port], or None."""
    raw = (os.environ.get(ORIGIN_ENV) or "").strip().rstrip("/")
    if not raw:
        return None
    parts = urlsplit(raw)
    if parts.scheme not in ("http", "https") or not parts.netloc or parts.path or parts.query:
        logger.error("[thecommons] %s must be an origin such as http://localhost:8130, not %r", ORIGIN_ENV, raw)
        return None
    return raw


def _text(value, cap: int) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:cap] if value else None


def _url(value) -> str | None:
    value = _text(value, 500)
    if not value:
        return None
    parts = urlsplit(value)
    return value if parts.scheme in ("http", "https") and parts.netloc else None


def normalize_credit(raw) -> dict:
    """A complete credit, or ValueError. Only what is listed here survives, so
    a file cannot smuggle markup or a non-http link onto the desk."""
    if not isinstance(raw, dict):
        raise ValueError("missing credit")
    title, artist = _text(raw.get("title"), 200), _text(raw.get("artist"), 200)
    if not title or not artist:
        raise ValueError("a credit needs a title and an artist")
    lic = raw.get("license") if isinstance(raw.get("license"), dict) else {}
    adaptation = lic.get("adaptation") if lic.get("adaptation") in _ADAPTATIONS else "unclear"
    terms = [t for t in (_text(t, 200) for t in (lic.get("terms") or []) if isinstance(t, str)) if t][:6]
    year = raw.get("year")
    editions = raw.get("editions")
    chain = raw.get("onChain") if isinstance(raw.get("onChain"), dict) else None
    return {
        "title": title,
        "artist": artist,
        "year": year if isinstance(year, int) and not isinstance(year, bool) and 1950 <= year <= 2100 else None,
        # The artist's own words, as their platform published them.
        "description": _text(raw.get("description"), DESCRIPTION_CAP),
        "platform": _text(raw.get("platform"), 80),
        "url": _url(raw.get("url")),
        "artistUrl": _url(raw.get("artistUrl")),
        "license": {
            "name": _text(lic.get("name"), 120) or "Not recorded",
            "text": _text(lic.get("text"), 200),
            "url": _url(lic.get("url")),
            "adaptation": adaptation,
            "terms": terms,
        },
        "editions": editions if isinstance(editions, int) and not isinstance(editions, bool) and editions > 0 else None,
        "onChain": {
            "network": _text(chain.get("network"), 60),
            "contract": _text(chain.get("contract"), 80),
            "projectId": chain.get("projectId") if isinstance(chain.get("projectId"), int) else None,
        } if chain else None,
        "archiveId": _text(raw.get("archiveId"), 120),
        # What was changed: a Creative Commons licence asks an adaptation to say.
        "adaptation": _text(raw.get("adaptation"), 600),
    }


def credit_line(credit: dict) -> str:
    """"Screens, Thomas Lin Pedersen, 2022. Art Blocks. CC BY-NC 4.0." """
    head = ", ".join(str(part) for part in (credit["title"], credit["artist"], credit["year"]) if part)
    parts = [head, credit["platform"], credit["license"]["name"] if credit["license"]["text"] else None]
    return ". ".join(p for p in parts if p) + "."


def card_code(credit: dict) -> str:
    """A native sketch that draws the credit as a title card: the desk's
    thumbnail, and what a display that predates `sketch.page` would show."""
    lines = [credit["title"], credit["artist"],
             " · ".join(str(p) for p in (credit["platform"], credit["year"], credit["license"]["name"]) if p)]
    return (
        f"const lines = {json.dumps(lines)};\n"
        "const w = frame.width, h = frame.height, u = Math.min(w, h);\n"
        "ctx.fillStyle = '#0c0c0e'; ctx.fillRect(0, 0, w, h);\n"
        "ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = Math.max(1, u * 0.004);\n"
        "ctx.strokeRect(u * 0.08, u * 0.08, w - u * 0.16, h - u * 0.16);\n"
        "ctx.textAlign = 'center'; ctx.textBaseline = 'middle';\n"
        "ctx.fillStyle = '#f2efe8'; ctx.font = `600 ${u * 0.11}px Georgia, serif`;\n"
        "ctx.fillText(lines[0], w / 2, h * 0.4, w * 0.76);\n"
        "ctx.font = `400 ${u * 0.065}px Georgia, serif`;\n"
        "ctx.fillText(lines[1], w / 2, h * 0.56, w * 0.76);\n"
        "ctx.fillStyle = 'rgba(242,239,232,0.6)'; ctx.font = `400 ${u * 0.042}px monospace`;\n"
        "ctx.fillText(lines[2], w / 2, h * 0.7, w * 0.76);\n"
    )


def _first_sentences(text: str | None, cap: int = 260) -> str:
    if not text:
        return ""
    text = " ".join(text.split())
    if len(text) <= cap:
        return text
    cut = text[:cap]
    stop = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[:stop + 1] if stop > 80 else cut.rsplit(" ", 1)[0] + "…"


def load_archive() -> list[dict]:
    """Every archive piece a wall may show, in the shape load_gallery() builds.
    Empty unless the venue named an archive origin. Never raises: a bad file is
    logged and skipped."""
    origin = archive_origin()
    if origin is None or not _DIR.is_dir():
        return []
    from backend.service.thecommons_gallery_tags import tags_for
    from backend.service.thecommons_ui import SKINS
    pieces = []
    for path in sorted(_DIR.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            credit = normalize_credit(raw.get("credit"))
            if credit["license"]["adaptation"] != "permitted":
                logger.warning("[thecommons] archive piece %s not listed: its licence (%s) does not permit "
                               "shared adaptations", path.stem, credit["license"]["name"])
                continue
            page_path = (raw.get("page") or {}).get("path")
            if not (isinstance(page_path, str) and _PAGE_PATH_RE.match(page_path)):
                raise ValueError("page.path must be a path on the archive")
            code = card_code(credit)
            by = f"by {credit['artist']}"
            sketch = validate_native_sketch({
                "name": raw["name"], "promptTemplate": raw["promptTemplate"],
                "variables": raw["variables"], "code": code,
                # What phones show above the controls: whose work this is.
                "ui": {"skin": "commons", "title": credit["title"], "tagline": by},
            })
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
            logger.error("[thecommons] skipping archive piece %s: %s", path.stem, exc)
            continue
        thumb_path = (raw.get("thumb") or {}).get("path") if isinstance(raw.get("thumb"), dict) else None
        listing = raw.get("listing") if isinstance(raw.get("listing"), dict) else {}
        collected = listing.get("collected")
        slug = f"archive-{path.stem}"
        sketch["gallery"] = slug
        sketch["page"] = {"url": origin + page_path}
        sketch["credit"] = credit
        variables = sketch["variables"]
        pieces.append({
            "slug": slug,
            "section": SECTION["id"],
            "name": sketch["name"],
            "blurb": _first_sentences(credit["description"]) or credit_line(credit),
            # What was changed; who made it is the credit block the card shows beside this.
            "lineage": credit["adaptation"] or credit_line(credit),
            "origin": "adapted",
            "prompt": None,
            "interactive": any(v.get("type") == "trigger" and v.get("access") != "host" for v in variables),
            "usesPeople": False,
            "panel": SKINS[sketch["ui"]["skin"]]["label"] if "ui" in sketch else None,
            "tags": tags_for(slug, SECTION["id"], "adapted", variables, code, look=()),
            # The credit is on the sketch (sketch.credit): once, for the wall and the desk both.
            # A picture of the work for its card, served by the archive like the
            # page; without one the card shows the title card the sketch draws.
            "thumb": origin + thumb_path if isinstance(thumb_path, str) and _PAGE_PATH_RE.match(thumb_path) else None,
            # What SECTION["sorts"] order by.
            "order": {
                "collected": collected if isinstance(collected, (int, float)) and not isinstance(collected, bool) else 0,
                "newest": credit["year"] or 0,
                "title": credit["title"].casefold(),
                "artist": credit["artist"].casefold(),
            },
            "sketch": sketch,
        })
    return pieces
