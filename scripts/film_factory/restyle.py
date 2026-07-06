"""RESTYLE — swap the film's entire visual language without touching the story.

Pass A writes a new style anchor + camera grammar from a direction brief.
Pass B rewrites every shot's veo_prompt/keyframe_prompt: same scene, action,
characters, and dialogue — new lensing, staging, and grade. Bible sheets and
keyframes are reset to regenerate in the new look.
"""
import json
import logging

from backend import config
from . import costs
from .develop import _gen_json

log = logging.getLogger("filmfactory.restyle")

MODEL = config.MODEL_TEMPLATE_GEN  # gemini-3.1-pro-preview

ANCHOR_SYS = """You are a legendary cinematographer defining the look bible of
a film. Answer ONLY with valid JSON."""

REWRITE_SYS = """You are re-lensing an existing film shot list into a new
visual style. For each shot you receive, rewrite "veo_prompt" (for the Veo 3.1
video model) and "keyframe_prompt" (a still frame of the same moment).
PRESERVE EXACTLY: the story beat, the action, which characters appear (keep
their physical descriptions verbatim where present), the location, and any
quoted dialogue line and its speaker.
REPLACE COMPLETELY: camera grammar, staging, lighting, palette and grade -
per the CAMERA NOTES. Remove every trace of the old style anchor sentence and
append the NEW ANCHOR verbatim at the end of both prompts. Keep the "Audio:"
clause in veo_prompt (retune ambience/score flavor to the new style; keep
dialogue lines word-for-word). veo_prompt 60-120 words + anchor;
keyframe_prompt 40-90 words + anchor, still frame, no motion words, no audio.
Answer ONLY with valid JSON."""


def run(ai, db, direction: str, batch: int = 15):
    film = db.film()
    if not film.get("title"):
        raise SystemExit("Nothing to restyle - run develop first.")
    old_anchor = film.get("style_anchor", "")

    # ---------- pass A: new anchor + camera grammar ----------
    if direction != film.get("_restyle_direction"):
        user = (
            f"FILM: {film['title']} - {film['logline']}\n"
            f"NEW STYLE DIRECTION FROM THE DIRECTOR:\n{direction}\n\n"
            "Return JSON: {\"style_anchor\": one reusable sentence (30-50 words) "
            "appended verbatim to every shot prompt - lens/stock/grain/palette/"
            "light/grade in concrete visual terms; \"camera_notes\": 80-140 words "
            "of shot-grammar rules for rewriting coverage into this style "
            "(framing, movement vocabulary, staging, what to never do).}")
        out = _gen_json(ai, db, ANCHOR_SYS, user, "restyle_anchor")
        film["_old_style_anchors"] = film.get("_old_style_anchors", []) + [old_anchor]
        film["style_anchor"] = out["style_anchor"]
        film["_camera_notes"] = out["camera_notes"]
        film["_restyle_direction"] = direction
        db.save_film(film)
        log.info("NEW ANCHOR: %s", film["style_anchor"])
        log.info("CAMERA NOTES: %s", film["_camera_notes"])

    # ---------- pass B: rewrite every shot ----------
    rows = db.fetchall("SELECT id, veo_prompt, keyframe_prompt FROM shots ORDER BY seq")
    todo = [r for r in rows if film["style_anchor"][:60] not in (r[1] or "")]
    log.info("RESTYLE: rewriting %d/%d shots in batches of %d", len(todo), len(rows), batch)
    for i in range(0, len(todo), batch):
        chunk = todo[i:i + batch]
        payload = [{"id": r[0], "veo_prompt": r[1], "keyframe_prompt": r[2]}
                   for r in chunk]
        user = (f"NEW ANCHOR (append verbatim to every prompt):\n{film['style_anchor']}\n\n"
                f"CAMERA NOTES:\n{film['_camera_notes']}\n\n"
                f"OLD ANCHOR (remove all traces of it):\n{old_anchor}\n\n"
                'Return JSON: {"shots": [{"id", "veo_prompt", "keyframe_prompt"}]} '
                f"for ALL {len(payload)} shots.\n\nSHOTS:\n"
                + json.dumps(payload, ensure_ascii=False))
        out = _gen_json(ai, db, REWRITE_SYS, user, f"restyle_b{i // batch + 1}")
        n = 0
        for sh in out.get("shots", []):
            if sh.get("id") and sh.get("veo_prompt"):
                db.exec("UPDATE shots SET veo_prompt=?, keyframe_prompt=? WHERE id=?",
                        (sh["veo_prompt"], sh.get("keyframe_prompt", ""), sh["id"]))
                n += 1
        log.info("restyle batch %d: %d/%d shots rewritten",
                 i // batch + 1, n, len(payload))

    # ---------- reset downstream stages ----------
    db.exec("UPDATE assets SET status='pending', error=NULL")
    db.exec("UPDATE shots SET keyframe_status='pending', keyframe_path=NULL "
            "WHERE needs_keyframe=1")

    # refresh bible sheet prompts with the new anchor
    from .bible import _sheet_prompts
    for kind, aid, name, prompt in _sheet_prompts(film):
        db.exec("UPDATE assets SET prompt=?, name=? WHERE id=?", (prompt, name, aid))

    # refresh storyboard export
    rows = db.fetchall("SELECT id, act, title, veo_prompt, characters FROM shots ORDER BY seq")
    sb_path = db.project_dir / "film_storyboard.json"
    if sb_path.exists():
        sb = json.loads(sb_path.read_text(encoding="utf-8"))
        sb["story"]["anchors"]["style"] = film["style_anchor"]
        sb["story"]["beats"] = [
            {"id": i + 1, "act": r[1], "shot": r[2], "prompt": r[3],
             "characters": json.loads(r[4])} for i, r in enumerate(rows)]
        sb_path.write_text(json.dumps(sb, indent=2, ensure_ascii=False), encoding="utf-8")

    log.info("RESTYLE complete - bible + keyframes reset to pending. Spend $%.2f",
             costs.spent(db))
