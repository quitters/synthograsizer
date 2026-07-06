"""Stage 2 — BIBLE: NB2 reference sheets for characters, locations, style.

One 16:9 sheet per character (three views on neutral grey), one establishing
plate per location, two style frames. These are the consistency refs for both
keyframe generation and Veo reference-image shots.
"""
import base64
import logging

from backend import config
from . import costs

log = logging.getLogger("filmfactory.bible")

MODEL = config.MODEL_IMAGE_GEN_HQ  # gemini-3-pro-image-preview


def _sheet_prompts(film):
    style = film.get("style_anchor", "")
    for c in film.get("characters", []):
        yield ("character", f"char_{c['id']}", c["name"], (
            f"Character reference sheet, single image with three views of the "
            f"same person: full body standing, waist-up close portrait, and 3/4 "
            f"view mid-action working on their art. {c['visual_desc']} "
            f"({c['discipline']}, {c['country']}). Neutral mid-grey seamless "
            f"studio backdrop, even soft key light, photorealistic, crisp "
            f"detail, no text or labels. {style}"))
    for l in film.get("locations", []):
        yield ("location", f"loc_{l['id']}", l["name"], (
            f"Cinematic establishing still, empty of people: {l['visual_desc']} "
            f"Wide anamorphic framing, rich environmental detail, no text. {style}"))
    yield ("style", "style_main", "Style frame A", (
        "Cinematic style frame for a broadcast-documentary hybrid film about a "
        "global art competition: an artist's hands mid-work in a warm tungsten "
        f"workshop, shallow depth of field, no text, no faces. {style}"))
    yield ("style", "style_alt", "Style frame B", (
        "Cinematic style frame: golden-hour exterior wide of a vast festival "
        f"arena crowd, long shadows, drone perspective, no text. {style}"))


def run(ai, db, only_failed=False):
    dirs = db.dirs()
    film = db.film()
    if not film.get("characters"):
        raise SystemExit("Run develop first - film.json has no characters.")

    for kind, aid, name, prompt in _sheet_prompts(film):
        db.exec("INSERT OR IGNORE INTO assets (id, kind, name, prompt) VALUES (?,?,?,?)",
                (aid, kind, name, prompt))
        row = db.fetchone("SELECT status FROM assets WHERE id=?", (aid,))
        if row[0] == "done" or (only_failed and row[0] != "failed"):
            continue
        costs.assert_budget(db, costs.estimate(MODEL, 1))
        try:
            out = ai.generate_image(
                prompt=prompt, model_name=MODEL, aspect_ratio="16:9",
                media_resolution="media_resolution_medium")
            b64 = out["image"] if isinstance(out, dict) else out
            path = dirs["bible"] / f"{aid}.png"
            path.write_bytes(base64.b64decode(b64))
            usd = costs.charge(db, "bible", aid, MODEL, 1)
            db.exec("UPDATE assets SET status='done', path=?, cost=?, error=NULL WHERE id=?",
                    (str(path), usd, aid))
            log.info("bible sheet done: %s (%s)", aid, name)
        except costs.BudgetExceeded:
            raise
        except Exception as e:
            db.exec("UPDATE assets SET status='failed', error=? WHERE id=?",
                    (str(e)[:500], aid))
            log.error("bible sheet FAILED: %s - %s", aid, str(e)[:200])

    done, failed = (db.fetchone(
        "SELECT SUM(status='done'), SUM(status='failed') FROM assets"))
    log.info("BIBLE complete: %s done, %s failed, spend so far $%.2f",
             done, failed or 0, costs.spent(db))
