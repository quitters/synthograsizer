"""Stage 3 — KEYFRAMES: one NB2 still per keyframed shot, conditioned on the
bible sheets (character sheets + location plate + style frame) so identity and
grade stay locked before any video dollars are spent.
"""
import base64
import io
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from PIL import Image

from backend import config
from . import costs

log = logging.getLogger("filmfactory.keyframes")

MODEL = config.MODEL_IMAGE_GEN_HQ


def _load_refs(db, shot_chars, shot_loc):
    """Ordered refs: up to 2 character sheets, the location plate, style frame."""
    refs, labels = [], []
    for cid in shot_chars[:2]:
        row = db.fetchone("SELECT path, name FROM assets WHERE id=? AND status='done'",
                          (f"char_{cid}",))
        if row:
            refs.append(open(row[0], "rb").read())
            labels.append(f"image {len(refs)}: character reference sheet for {row[1]}")
    row = db.fetchone("SELECT path, name FROM assets WHERE id=? AND status='done'",
                      (f"loc_{shot_loc}",))
    if row:
        refs.append(open(row[0], "rb").read())
        labels.append(f"image {len(refs)}: location plate ({row[1]})")
    row = db.fetchone("SELECT path FROM assets WHERE id='style_main' AND status='done'")
    if row and len(refs) < 4:
        refs.append(open(row[0], "rb").read())
        labels.append(f"image {len(refs)}: color grade / style frame")
    return refs, labels


def jpeg_for_veo(png_path: str, max_w: int = 1920) -> str:
    """Keyframe PNG -> base64 JPEG small enough for the backend's upload cap."""
    img = Image.open(png_path).convert("RGB")
    if img.width > max_w:
        img = img.resize((max_w, int(img.height * max_w / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()


def _one(ai, db, dirs, shot_id, kf_prompt, chars, loc, aspect="16:9"):
    refs, labels = _load_refs(db, json.loads(chars or "[]"), loc)
    preamble = (("Using the attached references (" + "; ".join(labels) + "): ")
                if labels else "")
    prompt = (f"{preamble}render this exact cinematic film still, {aspect}. "
              f"Characters must match their reference sheets precisely; match "
              f"the color grade of the style frame. No text. {kf_prompt}")
    out = ai.generate_image(prompt=prompt, model_name=MODEL, aspect_ratio=aspect,
                            input_images=refs or None,
                            media_resolution="media_resolution_medium")
    b64 = out["image"] if isinstance(out, dict) else out
    path = dirs["keyframes"] / f"{shot_id}.png"
    path.write_bytes(base64.b64decode(b64))
    return str(path)


def run(ai, db, concurrency=3, limit=None, only_failed=False):
    dirs = db.dirs()
    want_status = "('failed')" if only_failed else "('pending','failed')"
    rows = db.fetchall(
        f"SELECT id, keyframe_prompt, characters, location FROM shots "
        f"WHERE needs_keyframe=1 AND keyframe_status IN {want_status} "
        f"ORDER BY seq" + (f" LIMIT {int(limit)}" if limit else ""))
    if not rows:
        log.info("KEYFRAMES: nothing to do")
        return
    log.info("KEYFRAMES: %d stills to generate (concurrency %d)", len(rows), concurrency)

    aspect = db.get_meta("aspect", "16:9")

    def work(row):
        shot_id, kf_prompt, chars, loc = row
        costs.assert_budget(db, costs.estimate(MODEL, 1))
        return shot_id, _one(ai, db, dirs, shot_id, kf_prompt, chars, loc, aspect)

    done = failed = 0
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(work, r): r[0] for r in rows}
        for fut in as_completed(futures):
            shot_id = futures[fut]
            try:
                _sid, path = fut.result()
                usd = costs.charge(db, "keyframes", shot_id, MODEL, 1)
                db.exec("UPDATE shots SET keyframe_status='done', keyframe_path=?, "
                        "keyframe_cost=keyframe_cost+? WHERE id=?", (path, usd, shot_id))
                done += 1
                if done % 10 == 0:
                    log.info("keyframes progress: %d/%d done", done, len(rows))
            except costs.BudgetExceeded as e:
                log.error("BUDGET STOP: %s", e)
                pool.shutdown(cancel_futures=True)
                break
            except Exception as e:
                failed += 1
                db.exec("UPDATE shots SET keyframe_status='failed', error=? WHERE id=?",
                        (str(e)[:500], shot_id))
                log.error("keyframe FAILED %s: %s", shot_id, str(e)[:200])

    log.info("KEYFRAMES complete: %d done, %d failed, spend so far $%.2f",
             done, failed, costs.spent(db))
