"""Videorama single-shot operations — the Inspector's power tools.

Unlike farm stages (subprocesses of scripts.film_factory), these are
one-item ops that run in-process against ai_manager, guarded by the router's
_inline() context so they can't race a farm. Every op charges the project
ledger and respects the budget cap, and every new take gets QC frame samples
(the grid's poster thumbnails depend on them).
"""
import base64
import logging
import subprocess
import time
from pathlib import Path

from backend import config
from scripts.film_factory import costs, qc
from scripts.film_factory.render import MODEL as VEO_MODEL, build_name_subs, scrub_names

logger = logging.getLogger(__name__)

URI_MAX_AGE_H = 48  # Veo file URIs expire ~2 days after generation


class ShotOpError(Exception):
    """User-facing failure (maps to HTTP 400)."""


def _shot(db, shot_id):
    r = db.fetchone(
        "SELECT id, seq, act, scene, title, veo_prompt, characters, location, "
        "duration, keyframe_path, selected_take FROM shots WHERE id=?", (shot_id,))
    if not r:
        raise ShotOpError(f"no shot '{shot_id}'")
    cols = ("id", "seq", "act", "scene", "title", "veo_prompt", "characters",
            "location", "duration", "keyframe_path", "selected_take")
    return dict(zip(cols, r))


def _selected_take(db, shot):
    if not shot["selected_take"]:
        raise ShotOpError("shot has no finished take yet")
    t = db.fetchone("SELECT id, path, video_uri FROM takes WHERE id=?",
                    (shot["selected_take"],))
    if not t or not t[1] or not Path(t[1]).exists():
        raise ShotOpError("selected take's video file is missing")
    return {"id": t[0], "path": t[1], "video_uri": t[2]}


def _next_suffix_id(db, parent_id, letter):
    n = 1
    while db.fetchone("SELECT 1 FROM shots WHERE id=?", (f"{parent_id}{letter}{n}",)):
        n += 1
    return f"{parent_id}{letter}{n}"


def _insert_sequel(db, parent, new_id, **overrides):
    """Insert a sequel shot immediately after its parent in the edit order."""
    with db.lock:
        db.conn.execute("UPDATE shots SET seq = seq + 1 WHERE seq > ?", (parent["seq"],))
        row = {
            "id": new_id, "seq": parent["seq"] + 1, "act": parent["act"],
            "scene": parent["scene"], "title": overrides.pop("title"),
            "duration": overrides.pop("duration", parent["duration"]),
            "veo_prompt": overrides.pop("veo_prompt", parent["veo_prompt"]),
            "keyframe_prompt": "", "characters": parent["characters"],
            "location": parent["location"],
            "needs_keyframe": overrides.pop("needs_keyframe", 0),
            "keyframe_path": overrides.pop("keyframe_path", None),
            "keyframe_status": overrides.pop("keyframe_status", "skipped"),
            "status": overrides.pop("status", "pending"),
            "selected_take": overrides.pop("selected_take", None),
        }
        db.conn.execute(
            "INSERT INTO shots (id, seq, act, scene, title, duration, veo_prompt, "
            "keyframe_prompt, characters, location, needs_keyframe, keyframe_path, "
            "keyframe_status, status, selected_take) "
            "VALUES (:id, :seq, :act, :scene, :title, :duration, :veo_prompt, "
            ":keyframe_prompt, :characters, :location, :needs_keyframe, "
            ":keyframe_path, :keyframe_status, :status, :selected_take)", row)
        db.conn.commit()
    return new_id


def _ffprobe_duration(path) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=60, check=True)
        return float(out.stdout.strip())
    except Exception:
        return 0.0


def _ffprobe_height(path) -> int:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v",
             "-show_entries", "stream=height", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=60, check=True)
        return int(out.stdout.strip().splitlines()[0])
    except Exception:
        return 0


def _last_frame(take_path, out_png):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-sseof", "-0.1",
                    "-i", str(take_path), "-frames:v", "1", str(out_png)],
                   check=True, timeout=60, capture_output=True)
    if not Path(out_png).exists():
        raise ShotOpError("could not extract the take's last frame")


# ── Reimagine keyframe ──────────────────────────────────────────────────────

def reimagine_keyframe(ai, db, slug: str, shot_id: str, intent: str, dirs) -> dict:
    """NB2-transform the shot's current visual (keyframe, else QC frame, else
    a mid-clip frame) toward the user's intent; becomes the new keyframe."""
    shot = _shot(db, shot_id)

    src_bytes = None
    if shot["keyframe_path"] and Path(shot["keyframe_path"]).exists():
        src_bytes = Path(shot["keyframe_path"]).read_bytes()
    elif shot["selected_take"]:
        for t in ("4s", "1s", "7s"):
            pf = dirs["qc_frames"] / f"{shot['selected_take']}_{t}.jpg"
            if pf.exists():
                src_bytes = pf.read_bytes()
                break
        if src_bytes is None:
            take = _selected_take(db, shot)
            tmp = dirs["qc_frames"] / f"{shot['selected_take']}_mid.jpg"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "4",
                            "-i", take["path"], "-frames:v", "1", str(tmp)],
                           check=True, timeout=60, capture_output=True)
            src_bytes = tmp.read_bytes()
    if src_bytes is None:
        raise ShotOpError("no source image — the shot has no keyframe or finished take")

    costs.assert_budget(db, 0.25)
    result = ai.smart_transform(
        src_bytes, user_intent=intent,
        model_name=config.MODEL_IMAGE_GEN_HQ,
        aspect_ratio=db.get_meta("aspect", "16:9"))

    n = 1
    while (dirs["keyframes"] / f"{shot_id}_r{n}.png").exists():
        n += 1
    out = dirs["keyframes"] / f"{shot_id}_r{n}.png"
    out.write_bytes(base64.b64decode(result["image"]))

    usd = costs.charge(db, "inspector", f"{shot_id}_reimagine", config.MODEL_IMAGE_GEN_HQ, 1)
    costs.charge(db, "inspector", f"{shot_id}_reimagine_analysis", config.MODEL_FAST, 2)
    db.exec("UPDATE shots SET needs_keyframe=1, keyframe_status='done', "
            "keyframe_path=?, keyframe_cost=keyframe_cost+? WHERE id=?",
            (str(out), usd, shot_id))
    logger.info("reimagined keyframe %s -> %s", shot_id, out.name)
    return {"keyframe_path": str(out), "prompt_used": result.get("prompt", "")}


# ── Extend (+~8s) — dual path ───────────────────────────────────────────────
# True Veo extension requires a 720p SOURCE video (API constraint discovered
# live) and a fresh (<48h) file URI. Our farm renders 1080p, so most takes
# can't use it. The extend op therefore auto-picks:
#   - "extension": seamless Veo continuation (720p sources, fresh URI)
#   - "chain": last-frame image-to-video at full quality (works on any take)

async def extend_take(ai, db, slug: str, shot_id: str, dirs) -> dict:
    shot = _shot(db, shot_id)
    take = _selected_take(db, shot)

    age_h = (time.time() - Path(take["path"]).stat().st_mtime) / 3600
    src_h = _ffprobe_height(take["path"])
    use_extension = (take["video_uri"] and age_h < URI_MAX_AGE_H and src_h == 720)

    seconds = 7 if use_extension else 8
    costs.assert_budget(db, costs.estimate(VEO_MODEL, seconds))
    prompt = scrub_names(shot["veo_prompt"], build_name_subs(db.film()))

    new_id = _next_suffix_id(db, shot_id, "x")
    if use_extension:
        result = await ai.generate_video(
            prompt=prompt, model_name=VEO_MODEL,
            extension_video_uri=take["video_uri"])
    else:
        kf = dirs["keyframes"] / f"{new_id}.png"
        _last_frame(take["path"], kf)
        from scripts.film_factory.keyframes import jpeg_for_veo
        result = await ai.generate_video(
            prompt=prompt, model_name=VEO_MODEL, duration_seconds=8,
            aspect_ratio=db.get_meta("aspect", "16:9"), resolution="1080p",
            start_frame_image=jpeg_for_veo(str(kf)),
            person_generation="allow_adult")
    video = base64.b64decode(result["video_b64"])

    take_id = f"{new_id}_t1"
    path = dirs["takes"] / f"{take_id}.mp4"
    path.write_bytes(video)
    usd = costs.charge(db, "inspector", take_id, VEO_MODEL, seconds)

    # True extension output may be tail-only or original+tail; if it contains
    # the parent footage, exclude the parent so assembly stays duplicate-free.
    out_dur = _ffprobe_duration(path)
    parent_dur = _ffprobe_duration(take["path"]) or shot["duration"] or 8
    parent_excluded = use_extension and out_dur > parent_dur + 5
    if parent_excluded:
        db.exec("UPDATE shots SET excluded=1 WHERE id=?", (shot_id,))

    score, notes = qc.score_take(ai, db, dirs, {"veo_prompt": shot["veo_prompt"]},
                                 take_id, str(path))
    method = "extension" if use_extension else "chain"
    db.exec("INSERT OR REPLACE INTO takes (id, shot_id, n, path, video_uri, cost, "
            "status, qc_score, qc_notes) VALUES (?,?,?,?,?,?,?,?,?)",
            (take_id, new_id, 1, str(path), result.get("video_uri"), usd,
             "done", score, f"{method} of {shot_id}. " + (notes or "")))
    _insert_sequel(db, shot, new_id, title=shot["title"][:70] + " (ext)",
                   status="selected", selected_take=take_id,
                   duration=int(round(out_dur)) or 8,
                   needs_keyframe=0 if use_extension else 1,
                   keyframe_status="skipped" if use_extension else "done",
                   keyframe_path=None if use_extension else str(dirs["keyframes"] / f"{new_id}.png"))
    logger.info("extend(%s) %s -> %s (%.1fs, parent_excluded=%s)",
                method, shot_id, new_id, out_dur, parent_excluded)
    return {"new_shot_id": new_id, "take_id": take_id, "method": method,
            "duration": out_dur, "parent_excluded": parent_excluded}


# ── Asset (bible sheet) operations ──────────────────────────────────────────

def _next_asset_path(dirs, aid: str):
    n = 1
    while (dirs["bible"] / f"{aid}_v{n}.png").exists():
        n += 1
    return dirs["bible"] / f"{aid}_v{n}.png"


def regenerate_asset(ai, db, asset_id: str, tweak: str, dirs) -> dict:
    row = db.fetchone("SELECT prompt FROM assets WHERE id=?", (asset_id,))
    if not row:
        raise ShotOpError(f"no asset '{asset_id}'")
    prompt = row[0] + (f"\nADJUSTMENT: {tweak.strip()}" if tweak.strip() else "")
    costs.assert_budget(db, costs.estimate(config.MODEL_IMAGE_GEN_HQ, 1))
    out = ai.generate_image(
        prompt=prompt, model_name=config.MODEL_IMAGE_GEN_HQ, aspect_ratio="16:9",
        media_resolution="media_resolution_medium")
    b64 = out["image"] if isinstance(out, dict) else out
    path = _next_asset_path(dirs, asset_id)
    path.write_bytes(base64.b64decode(b64))
    usd = costs.charge(db, "bible", f"{asset_id}_regen", config.MODEL_IMAGE_GEN_HQ, 1)
    db.exec("UPDATE assets SET status='done', path=?, cost=cost+?, error=NULL WHERE id=?",
            (str(path), usd, asset_id))
    return {"path": str(path)}


def upload_asset(db, asset_id: str, image_bytes: bytes, dirs) -> dict:
    """Replace a bible sheet with a user-provided image (re-encoded to PNG,
    downscaled to <=2048px wide so keyframe conditioning stays in-cap)."""
    import io
    from PIL import Image
    if not db.fetchone("SELECT 1 FROM assets WHERE id=?", (asset_id,)):
        raise ShotOpError(f"no asset '{asset_id}'")
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise ShotOpError("not a decodable image")
    if img.width > 2048:
        img = img.resize((2048, int(img.height * 2048 / img.width)))
    path = _next_asset_path(dirs, asset_id)
    img.save(path, format="PNG")
    db.exec("UPDATE assets SET status='done', path=?, error=NULL WHERE id=?",
            (str(path), asset_id))
    return {"path": str(path)}


def reset_keyframes_for_asset(db, asset_id: str) -> list:
    """Mark keyframes stale for every shot that uses this character/location."""
    if asset_id.startswith("char_"):
        cid = asset_id[len("char_"):]
        rows = db.fetchall(
            "SELECT id FROM shots WHERE needs_keyframe=1 AND characters LIKE ?",
            (f'%"{cid}"%',))
    elif asset_id.startswith("loc_"):
        lid = asset_id[len("loc_"):]
        rows = db.fetchall(
            "SELECT id FROM shots WHERE needs_keyframe=1 AND location=?", (lid,))
    else:
        rows = []
    ids = [r[0] for r in rows]
    if ids:
        q = ",".join("?" * len(ids))
        db.exec(f"UPDATE shots SET keyframe_status='pending' WHERE id IN ({q})", ids)
    return ids


# ── Continue (last frame -> sequel shot) ────────────────────────────────────

def continue_shot(ai, db, slug: str, shot_id: str, prompt: str, dirs) -> dict:
    shot = _shot(db, shot_id)
    take = _selected_take(db, shot)

    new_id = _next_suffix_id(db, shot_id, "c")
    kf = dirs["keyframes"] / f"{new_id}.png"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-sseof", "-0.1",
                    "-i", take["path"], "-frames:v", "1", str(kf)],
                   check=True, timeout=60, capture_output=True)
    if not kf.exists():
        raise ShotOpError("could not extract the take's last frame")

    _insert_sequel(db, shot, new_id, title=shot["title"][:68] + " (cont.)",
                   veo_prompt=prompt, needs_keyframe=1,
                   keyframe_path=str(kf), keyframe_status="done",
                   status="pending")
    logger.info("continue %s -> %s (last-frame keyframe)", shot_id, new_id)
    return {"new_shot_id": new_id, "keyframe_path": str(kf)}
