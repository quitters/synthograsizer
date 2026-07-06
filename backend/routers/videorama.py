"""Videorama — self-serve film-factory runs from the suite UI.

Local-only: every stage is a subprocess of `python -m scripts.film_factory`
against a project dir under FILMS_ROOT, so the CLI and the UI share one code
path and crash isolation. State machine lives in the project's SQLite meta
(vr_state), so a server restart loses nothing — jobs resume where they left.

Checkpointed flow (default):
  brief_ready -> develop -> shots_ready [checkpoint]
  -> prep (bible+keyframes+likeness, only if brief uses characters)
  -> pilot (render --limit 4) -> pilot_ready [checkpoint]
  -> finish (render -> tapeify -> assemble) -> done
Full-auto runs the same sequence without stopping.
"""
import json
import logging
import os
import re
import subprocess
import sys
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.ai_manager import ai_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/videorama", tags=["videorama"])

REPO_ROOT = Path(__file__).resolve().parents[2]
FILMS_ROOT = Path(os.environ.get(
    "SYNTH_FILMS_ROOT",
    r"D:\Synthograsizer_Films" if Path(r"D:\\").exists()
    else str(Path.home() / "Synthograsizer_Films")))

from backend.policy import is_hosted
HOSTED = is_hosted()

# slug -> {"thread": Thread, "stage": str}
_jobs: dict = {}
# slug -> name of a running single-item (in-process) op, e.g. "extend"
_inline_ops: dict = {}
_lock = threading.Lock()


def _assert_idle(slug: str):
    with _lock:
        job = _jobs.get(slug)
        if job and job["thread"].is_alive():
            raise HTTPException(409, "a farm job is running for this project")
        if slug in _inline_ops:
            raise HTTPException(409, f"'{_inline_ops[slug]}' is already running for this project")


from contextlib import contextmanager


@contextmanager
def _inline(slug: str, name: str):
    _assert_idle(slug)
    with _lock:
        _inline_ops[slug] = name
    try:
        yield
    finally:
        with _lock:
            _inline_ops.pop(slug, None)


def _shot_op_guard(fn):
    """Translate single-op service errors to HTTP codes."""
    from functools import wraps

    @wraps(fn)
    async def wrapper(*a, **k):
        from scripts.film_factory import costs as _costs
        from backend.services.videorama_shots import ShotOpError
        try:
            r = fn(*a, **k)
            return (await r) if hasattr(r, "__await__") else r
        except HTTPException:
            raise
        except ShotOpError as e:
            raise HTTPException(400, str(e))
        except _costs.BudgetExceeded as e:
            raise HTTPException(402, str(e))
        except Exception as e:
            # surface upstream API errors as readable JSON, not a bare 500
            logger.exception("shot op failed")
            raise HTTPException(500, str(e)[:400])
    return wrapper


def _guard():
    if HOSTED:
        raise HTTPException(403, "Videorama renders run on a local install only.")
    if not ai_manager.genai_client:
        raise HTTPException(400, "Google API key not configured.")


def _db(slug):
    from scripts.film_factory.db import DB
    pdir = FILMS_ROOT / slug
    if not pdir.exists():
        raise HTTPException(404, f"no project '{slug}'")
    return DB(pdir)


def _spawn_chain(slug: str, phase: str, stages: list, end_state: str):
    """Run film_factory stages sequentially in a daemon thread."""
    pdir = FILMS_ROOT / slug

    def work():
        db = _db(slug)
        try:
            for stage_args in stages:
                db.set_meta("vr_state", f"running:{stage_args[0]}")
                r = subprocess.run(
                    [sys.executable, "-m", "scripts.film_factory", *stage_args,
                     "--project-dir", str(pdir)],
                    cwd=str(REPO_ROOT), capture_output=True, text=True,
                    timeout=6 * 3600)
                if r.returncode != 0:
                    tail = (r.stdout or "")[-400:] + (r.stderr or "")[-400:]
                    db.set_meta("vr_state", f"error:{stage_args[0]}")
                    db.set_meta("vr_error", tail)
                    logger.error("videorama %s %s failed: %s", slug, stage_args[0], tail)
                    return
            db.set_meta("vr_state", end_state)
        except Exception as e:
            db.set_meta("vr_state", "error:internal")
            db.set_meta("vr_error", str(e)[:400])
        finally:
            with _lock:
                _jobs.pop(slug, None)

    with _lock:
        if slug in _jobs and _jobs[slug]["thread"].is_alive():
            raise HTTPException(409, "a job is already running for this project")
        if slug in _inline_ops:
            raise HTTPException(409, f"'{_inline_ops[slug]}' is running for this project")
        t = threading.Thread(target=work, daemon=True, name=f"vr-{slug}")
        _jobs[slug] = {"thread": t, "stage": phase}
        t.start()


class CreateReq(BaseModel):
    prompt: str = ""
    template: str = ""          # template name to use instead of the writer
    name: str = ""
    clips: int = 30
    consistent_characters: bool = False
    tape_preset: str = "auto"
    aspect: str = "16:9"        # "16:9" landscape | "9:16" vertical
    era: str = ""
    budget_usd: float = 300.0
    full_auto: bool = False


class ShotsReq(BaseModel):
    shot_ids: list = []


class RestyleReq(BaseModel):
    direction: str


@router.get("/health")
def health():
    import shutil
    from scripts.film_factory.tapeify import PRESETS
    from backend.services.videorama_brief import rails_active
    return {"hosted": HOSTED, "films_root": str(FILMS_ROOT),
            "films_root_exists": FILMS_ROOT.exists(),
            "ffmpeg": bool(shutil.which("ffmpeg")),
            "api_key": bool(ai_manager.genai_client),
            "tape_presets": list(PRESETS), "rails": rails_active()}


@router.get("/templates")
def templates():
    from scripts.film_factory import briefs
    return {"templates": briefs.list_templates()}


@router.get("/projects")
def projects():
    out = []
    if FILMS_ROOT.exists():
        for p in sorted(FILMS_ROOT.iterdir()):
            if not (p / "film.db").exists():
                continue
            try:
                db = _db(p.name)
                film = db.film()
                from scripts.film_factory import costs
                out.append({"slug": p.name, "title": film.get("title", p.name),
                            "state": db.get_meta("vr_state", "cli"),
                            "spent": costs.spent(db)})
            except Exception:
                continue
    return {"projects": out, "films_root": str(FILMS_ROOT)}


@router.post("/projects")
def create(req: CreateReq):
    _guard()
    from scripts.film_factory import briefs
    from backend.services.videorama_brief import write_brief

    if req.template:
        brief = json.loads((briefs.TEMPLATES_DIR / f"{req.template}.json")
                           .read_text(encoding="utf-8"))
        brief["_source"] = f"template:{req.template}"
    else:
        if len(req.prompt.strip()) < 8:
            raise HTTPException(400, "prompt too short")
        brief = write_brief(ai_manager, req.prompt, req.model_dump())
        brief["_source"] = "brief_writer"

    # aspect from the request wins (template default is 16:9); validated
    brief["ASPECT"] = req.aspect if req.aspect in ("16:9", "9:16") else "16:9"

    slug = re.sub(r"[^a-z0-9]+", "_",
                  (req.name or brief.get("name", "project")).lower()).strip("_")[:40]
    pdir = FILMS_ROOT / slug
    if (pdir / "film.db").exists():
        raise HTTPException(409, f"project '{slug}' already exists")
    pdir.mkdir(parents=True, exist_ok=True)
    (pdir / "brief.json").write_text(json.dumps(brief, indent=2, ensure_ascii=False),
                                     encoding="utf-8")
    db = _db(slug)
    db.set_meta("budget_usd", req.budget_usd)
    db.set_meta("vr_state", "brief_ready")
    db.set_meta("vr_full_auto", "1" if req.full_auto else "0")
    db.set_meta("vr_uses_characters",
                "1" if brief.get("uses_characters") or req.consistent_characters else "0")

    clips = sum(brief.get("TARGET_SHOTS", {"EP1": req.clips}).values())
    est = round(clips * 8 * 0.40 * 1.4 + (clips * 0.20 if req.consistent_characters else 0), 2)
    return {"slug": slug, "brief": brief, "estimated_usd": est,
            "budget_usd": req.budget_usd}


@router.post("/projects/{slug}/develop")
def develop(slug: str):
    _guard()
    db = _db(slug)
    stages = [["develop", "--brief", str(FILMS_ROOT / slug / "brief.json")]]
    if db.get_meta("vr_full_auto") == "1":
        stages += _prep_stages(db) + _finish_stages(db)
        _spawn_chain(slug, "full_auto", stages, "done")
    else:
        _spawn_chain(slug, "develop", stages, "shots_ready")
    return {"ok": True}


def _prep_stages(db):
    if db.get_meta("vr_uses_characters") == "1":
        return [["bible"], ["keyframes", "--concurrency", "3"]]
    return []


def _assemble_stage(db):
    args = ["assemble", "--version", "v1"]
    if db.get_meta("tape_preset"):
        args += ["--tape"]
    return [args]


def _finish_stages(db):
    """render -> (tapeify if the brief chose a signal path) -> assemble.
    Without the preset guard, tapeify would fall back to its 'vhs' default
    and smear clean-look projects."""
    stages = [["render", "--concurrency", "4", "--max-takes", "2"]]
    if db.get_meta("tape_preset"):
        stages.append(["tapeify", "--concurrency", "2"])
    return stages + _assemble_stage(db)


@router.post("/projects/{slug}/pilot")
def pilot(slug: str):
    _guard()
    db = _db(slug)
    stages = _prep_stages(db) + [["render", "--limit", "4", "--max-takes", "1",
                                  "--concurrency", "4"]]
    _spawn_chain(slug, "pilot", stages, "pilot_ready")
    return {"ok": True}


@router.post("/projects/{slug}/resume")
def resume(slug: str):
    """Recover a job left mid-stage by a server restart (e.g. the dev
    reloader firing while a farm was running). Safe to call any time: every
    film_factory stage already skips completed shots/assets, so this just
    continues whatever wasn't finished — same as `finish`, but callable from
    a stuck `running:*` state instead of only from `shots_ready`/`pilot_ready`."""
    _guard()
    db = _db(slug)
    _spawn_chain(slug, "resume", _prep_stages(db) + _finish_stages(db), "done")
    return {"ok": True}


@router.post("/projects/{slug}/finish")
def finish(slug: str):
    _guard()
    db = _db(slug)
    _spawn_chain(slug, "finish", _finish_stages(db), "done")
    return {"ok": True}


@router.post("/projects/{slug}/retake")
def retake(slug: str, req: ShotsReq):
    _guard()
    db = _db(slug)
    if not req.shot_ids:
        raise HTTPException(400, "shot_ids required")
    q = ",".join("?" * len(req.shot_ids))
    # stale-tape invalidation: a retake reuses take ids, so the processed
    # tape/ clip must die with the old take or assembly serves stale footage
    for (tid,) in db.fetchall(
            f"SELECT id FROM takes WHERE shot_id IN ({q})", req.shot_ids):
        (FILMS_ROOT / slug / "tape" / f"{tid}.mp4").unlink(missing_ok=True)
    db.exec(f"UPDATE shots SET status='pending', selected_take=NULL WHERE id IN ({q})",
            req.shot_ids)
    db.exec(f"DELETE FROM takes WHERE shot_id IN ({q})", req.shot_ids)
    # Only reassemble + land on "done" if the project had already finished a
    # full render (i.e. exports exist). Retaking pilot shots must NOT jump
    # the project to "done" — that would hide the "render everything" action
    # while 11 of 15 shots are still untouched.
    had_exports = bool(list((FILMS_ROOT / slug / "exports").glob("*.mp4"))) \
        if (FILMS_ROOT / slug / "exports").exists() else False
    stages = [["render", "--shots", ",".join(req.shot_ids), "--max-takes", "2"]]
    end_state = db.get_meta("vr_state", "shots_ready")
    if had_exports:
        if db.get_meta("tape_preset"):
            stages.append(["tapeify", "--concurrency", "2"])
        stages += _assemble_stage(db)
        end_state = "done"
    _spawn_chain(slug, "retake", stages, end_state)
    return {"ok": True, "count": len(req.shot_ids)}


@router.post("/projects/{slug}/restyle")
def restyle(slug: str, req: RestyleReq):
    _guard()
    db = _db(slug)
    db.exec("UPDATE shots SET status='pending', selected_take=NULL")
    db.exec("DELETE FROM takes")
    _spawn_chain(slug, "restyle",
                 [["restyle", "--direction", req.direction]], "shots_ready")
    return {"ok": True}


@router.post("/projects/{slug}/likeness")
def likeness(slug: str):
    _guard()
    from backend.services.videorama_brief import likeness_check
    db = _db(slug)
    results = []
    for aid, path in db.fetchall(
            "SELECT id, path FROM assets WHERE kind='character' AND status='done'"):
        res = likeness_check(ai_manager, Path(path).read_bytes())
        res["asset"] = aid
        results.append(res)
    db.set_meta("vr_likeness", json.dumps(results))
    return {"results": results,
            "flagged": [r for r in results if r["resembles"] and r["confidence"] >= 6]}


# ── Assets (bible sheets) ───────────────────────────────────────────────────

class AssetRegenReq(BaseModel):
    tweak: str = ""


class AssetUploadReq(BaseModel):
    image_b64: str


def _asset_url(slug, path):
    if not path or not Path(path).exists():
        return None
    p = Path(path)
    return f"/films/{slug}/bible/{p.name}?v={int(p.stat().st_mtime)}"


@router.get("/projects/{slug}/assets")
def assets(slug: str):
    db = _db(slug)
    likeness = {r.get("asset"): r for r in json.loads(db.get_meta("vr_likeness") or "[]")}
    out = []
    for r in db.fetchall("SELECT id, kind, name, status, prompt, cost, path FROM assets"):
        out.append({"id": r[0], "kind": r[1], "name": r[2], "status": r[3],
                    "prompt": r[4], "cost": r[5], "url": _asset_url(slug, r[6]),
                    "likeness": likeness.get(r[0])})
    return {"assets": out}


@router.post("/projects/{slug}/assets/{asset_id}/regenerate")
@_shot_op_guard
async def asset_regen(slug: str, asset_id: str, req: AssetRegenReq):
    _guard()
    import asyncio
    from backend.services import videorama_shots as vs
    db = _db(slug)
    with _inline(slug, "regenerate sheet"):
        res = await asyncio.to_thread(
            vs.regenerate_asset, ai_manager, db, asset_id, req.tweak, db.dirs())
    return {"ok": True, "url": _asset_url(slug, res["path"])}


@router.post("/projects/{slug}/assets/{asset_id}/upload")
@_shot_op_guard
def asset_upload(slug: str, asset_id: str, req: AssetUploadReq):
    _guard()
    from backend.helpers import decode_base64_image
    from backend.services import videorama_shots as vs
    db = _db(slug)
    image_bytes = decode_base64_image(req.image_b64)
    res = vs.upload_asset(db, asset_id, image_bytes, db.dirs())
    return {"ok": True, "url": _asset_url(slug, res["path"])}


@router.post("/projects/{slug}/assets/{asset_id}/reset-keyframes")
def asset_reset_keyframes(slug: str, asset_id: str):
    from backend.services import videorama_shots as vs
    db = _db(slug)
    ids = vs.reset_keyframes_for_asset(db, asset_id)
    return {"ok": True, "count": len(ids), "shot_ids": ids}


@router.post("/projects/{slug}/keyframes")
def run_keyframes(slug: str):
    _guard()
    db = _db(slug)
    prev = db.get_meta("vr_state", "shots_ready")
    if prev.startswith(("running", "error")):
        prev = "shots_ready"
    _spawn_chain(slug, "keyframes", [["keyframes", "--concurrency", "3"]], prev)
    return {"ok": True}


# ── Templates / extend / reassemble ─────────────────────────────────────────

class SaveTemplateReq(BaseModel):
    name: str = ""


@router.post("/projects/{slug}/save-template")
def save_template(slug: str, req: SaveTemplateReq):
    from scripts.film_factory import briefs
    pdir = FILMS_ROOT / slug
    bp = pdir / "brief.json"
    if not bp.exists():
        raise HTTPException(404, "project has no brief.json")
    brief = json.loads(bp.read_text(encoding="utf-8"))
    for k in ("_source", "_rails"):
        brief.pop(k, None)
    name = re.sub(r"[^a-z0-9]+", "_", (req.name or brief.get("name", slug)).lower()).strip("_")[:40]
    base, n = name, 2
    while (briefs.TEMPLATES_DIR / f"{name}.json").exists():
        name = f"{base}_{n}"
        n += 1
    brief["name"] = name
    briefs.TEMPLATES_DIR.mkdir(exist_ok=True)
    (briefs.TEMPLATES_DIR / f"{name}.json").write_text(
        json.dumps(brief, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "name": name}


class ExtendShotsReq(BaseModel):
    count: int = 5
    direction: str = ""


@router.post("/projects/{slug}/extend-shots")
def extend_shots(slug: str, req: ExtendShotsReq):
    _guard()
    db = _db(slug)
    count = max(1, min(int(req.count), 30))
    stages = [["extend", "--count", str(count),
               "--direction", req.direction or "",
               "--brief", str(FILMS_ROOT / slug / "brief.json")]] + _prep_stages(db)
    _spawn_chain(slug, "extend", stages, "shots_ready")
    return {"ok": True, "count": count}


@router.post("/projects/{slug}/assemble")
def reassemble(slug: str):
    _guard()
    db = _db(slug)
    exports = FILMS_ROOT / slug / "exports"
    n = 1
    if exports.exists():
        for p in exports.glob("*_v*.mp4"):
            m = re.search(r"_v(\d+)", p.name)
            if m:
                n = max(n, int(m.group(1)))
    version = f"v{n + 1}"
    stages = []
    if db.get_meta("tape_preset"):
        stages.append(["tapeify", "--concurrency", "2"])
    stages.append(["assemble", "--version", version]
                  + (["--tape"] if db.get_meta("tape_preset") else []))
    _spawn_chain(slug, "assemble", stages, "done")
    return {"ok": True, "version": version}


@router.post("/projects/{slug}/stop")
def stop(slug: str):
    (FILMS_ROOT / slug / "STOP").write_text("stop")
    return {"ok": True, "note": "farm drains after in-flight takes complete"}


@router.get("/projects/{slug}/status")
def status(slug: str):
    db = _db(slug)
    from scripts.film_factory import costs
    film = db.film()
    shots = dict(db.fetchall("SELECT status, COUNT(*) FROM shots GROUP BY 1"))
    takes = db.fetchone("SELECT COUNT(*), AVG(qc_score) FROM takes WHERE status='done'")
    log_tail = ""
    lp = FILMS_ROOT / slug / "film.log"
    if lp.exists():
        log_tail = "\n".join(lp.read_text(encoding="utf-8", errors="replace")
                             .splitlines()[-25:])
    with _lock:
        job = _jobs.get(slug)
    exports = sorted((FILMS_ROOT / slug / "exports").glob("*.mp4")) \
        if (FILMS_ROOT / slug / "exports").exists() else []
    return {
        "slug": slug, "title": film.get("title"), "logline": film.get("logline"),
        "state": db.get_meta("vr_state", "cli"), "error": db.get_meta("vr_error"),
        "job_alive": bool(job and job["thread"].is_alive()),
        "shots": shots, "shots_total": sum(shots.values()),
        "takes_done": takes[0], "qc_avg": round(takes[1], 2) if takes[1] else None,
        "spent": costs.spent(db), "budget": costs.budget(db),
        "inline_op": _inline_ops.get(slug),
        "tape_preset": db.get_meta("tape_preset"),
        "likeness": json.loads(db.get_meta("vr_likeness") or "[]"),
        "exports": [f"/films/{slug}/exports/{p.name}" for p in exports],
        "log_tail": log_tail,
    }


def _media_urls(slug: str, take_path: str):
    """(clip_url, poster_url) for a take, preferring the tape-processed clip
    and reusing QC frame samples as poster thumbnails."""
    clip = poster = None
    if take_path:
        take_stem = Path(take_path).stem
        tape = FILMS_ROOT / slug / "tape" / (take_stem + ".mp4")
        rel = tape if tape.exists() else Path(take_path)
        clip = "/films/" + str(rel.relative_to(FILMS_ROOT)).replace("\\", "/")
        for t in ("4s", "1s", "7s"):
            pf = FILMS_ROOT / slug / "qc_frames" / f"{take_stem}_{t}.jpg"
            if pf.exists():
                poster = f"/films/{slug}/qc_frames/{pf.name}"
                break
    return clip, poster


def _kf_url(slug: str, kf_path: str):
    if not kf_path or not Path(kf_path).exists():
        return None
    p = Path(kf_path)
    return (f"/films/{slug}/keyframes/{p.name}?v={int(p.stat().st_mtime)}")


SHOT_COLS = ("s.id, s.seq, s.title, s.status, s.veo_prompt, s.act, s.scene, "
             "s.excluded, s.needs_keyframe, s.keyframe_status, s.keyframe_path, "
             "s.selected_take, s.characters, s.location, s.duration")


def _shot_dict(slug, r, take_path=None, qc=None, qc_notes=None):
    clip, poster = _media_urls(slug, take_path)
    return {"id": r[0], "seq": r[1], "title": r[2], "status": r[3],
            "prompt": r[4], "act": r[5], "scene": r[6],
            "excluded": bool(r[7]), "needs_keyframe": bool(r[8]),
            "keyframe_status": r[9], "keyframe_url": _kf_url(slug, r[10]),
            "selected_take": r[11], "characters": json.loads(r[12] or "[]"),
            "location": r[13], "duration": r[14],
            "clip": clip, "poster": poster, "qc": qc, "qc_notes": qc_notes}


@router.get("/projects/{slug}/shots")
def shots(slug: str):
    db = _db(slug)
    rows = db.fetchall(
        f"SELECT {SHOT_COLS}, t.path, t.qc_score, t.qc_notes "
        "FROM shots s LEFT JOIN takes t ON t.id = s.selected_take ORDER BY s.seq")
    return {"shots": [_shot_dict(slug, r, r[15], r[16], r[17]) for r in rows]}


@router.get("/projects/{slug}/shots/{shot_id}")
def shot_detail(slug: str, shot_id: str):
    db = _db(slug)
    r = db.fetchone(
        f"SELECT {SHOT_COLS}, t.path, t.qc_score, t.qc_notes "
        "FROM shots s LEFT JOIN takes t ON t.id = s.selected_take WHERE s.id=?",
        (shot_id,))
    if not r:
        raise HTTPException(404, f"no shot '{shot_id}'")
    import time
    takes = []
    for t in db.fetchall(
            "SELECT id, n, status, qc_score, qc_notes, cost, path, video_uri "
            "FROM takes WHERE shot_id=? ORDER BY n", (shot_id,)):
        age_h = None
        if t[6] and Path(t[6]).exists():
            age_h = round((time.time() - Path(t[6]).stat().st_mtime) / 3600, 1)
        clip, _ = _media_urls(slug, t[6])
        takes.append({"id": t[0], "n": t[1], "status": t[2], "qc": t[3],
                      "qc_notes": t[4], "cost": t[5], "clip": clip,
                      "age_h": age_h, "has_uri": bool(t[7]),
                      "extendable": bool(t[7]) and t[2] == "done"
                                    and age_h is not None and age_h < 48})
    return {"shot": _shot_dict(slug, r, r[15], r[16], r[17]), "takes": takes}


class ShotPatch(BaseModel):
    veo_prompt: str = None
    needs_keyframe: bool = None
    excluded: bool = None


@router.patch("/projects/{slug}/shots/{shot_id}")
def shot_patch(slug: str, shot_id: str, req: ShotPatch):
    db = _db(slug)
    if not db.fetchone("SELECT 1 FROM shots WHERE id=?", (shot_id,)):
        raise HTTPException(404, f"no shot '{shot_id}'")
    if req.veo_prompt is not None:
        with _lock:
            job = _jobs.get(slug)
            if job and job["thread"].is_alive():
                raise HTTPException(409, "can't edit prompts while a farm is running")
        db.exec("UPDATE shots SET veo_prompt=? WHERE id=?", (req.veo_prompt, shot_id))
    if req.needs_keyframe is not None:
        db.exec("UPDATE shots SET needs_keyframe=? WHERE id=?",
                (1 if req.needs_keyframe else 0, shot_id))
    if req.excluded is not None:
        db.exec("UPDATE shots SET excluded=? WHERE id=?",
                (1 if req.excluded else 0, shot_id))
    return {"ok": True}


class MoveReq(BaseModel):
    direction: str  # "up" | "down"


@router.post("/projects/{slug}/shots/{shot_id}/move")
def shot_move(slug: str, shot_id: str, req: MoveReq):
    db = _db(slug)
    row = db.fetchone("SELECT seq FROM shots WHERE id=?", (shot_id,))
    if not row:
        raise HTTPException(404, f"no shot '{shot_id}'")
    seq = row[0]
    if req.direction == "up":
        nb = db.fetchone("SELECT id, seq FROM shots WHERE seq < ? ORDER BY seq DESC LIMIT 1", (seq,))
    else:
        nb = db.fetchone("SELECT id, seq FROM shots WHERE seq > ? ORDER BY seq ASC LIMIT 1", (seq,))
    if not nb:
        raise HTTPException(400, "already at the edge")
    with db.lock:
        db.conn.execute("UPDATE shots SET seq=? WHERE id=?", (nb[1], shot_id))
        db.conn.execute("UPDATE shots SET seq=? WHERE id=?", (seq, nb[0]))
        db.conn.commit()
    return {"ok": True, "seq": nb[1]}


class IntentReq(BaseModel):
    intent: str


class ContinueReq(BaseModel):
    prompt: str


@router.post("/projects/{slug}/shots/{shot_id}/reimagine-keyframe")
@_shot_op_guard
async def shot_reimagine(slug: str, shot_id: str, req: IntentReq):
    _guard()
    if len(req.intent.strip()) < 4:
        raise HTTPException(400, "intent too short")
    import asyncio
    from backend.services import videorama_shots as vs
    db = _db(slug)
    with _inline(slug, "reimagine"):
        # smart_transform is ~30-60s of blocking calls — keep the loop alive
        res = await asyncio.to_thread(
            vs.reimagine_keyframe, ai_manager, db, slug, shot_id,
            req.intent.strip(), db.dirs())
    p = Path(res["keyframe_path"])
    return {"ok": True,
            "keyframe_url": f"/films/{slug}/keyframes/{p.name}?v={int(p.stat().st_mtime)}",
            "prompt_used": res["prompt_used"]}


@router.post("/projects/{slug}/shots/{shot_id}/extend")
@_shot_op_guard
async def shot_extend(slug: str, shot_id: str):
    _guard()
    from backend.services import videorama_shots as vs
    db = _db(slug)
    with _inline(slug, "extend"):
        res = await vs.extend_take(ai_manager, db, slug, shot_id, db.dirs())
    return {"ok": True, **res}


@router.post("/projects/{slug}/shots/{shot_id}/continue")
@_shot_op_guard
async def shot_continue(slug: str, shot_id: str, req: ContinueReq):
    _guard()
    if len(req.prompt.strip()) < 8:
        raise HTTPException(400, "prompt too short")
    import asyncio
    from backend.services import videorama_shots as vs
    db = _db(slug)
    with _inline(slug, "continue"):
        res = await asyncio.to_thread(
            vs.continue_shot, ai_manager, db, slug, shot_id,
            req.prompt.strip(), db.dirs())
    return {"ok": True, "new_shot_id": res["new_shot_id"]}


@router.post("/projects/{slug}/shots/{shot_id}/variations")
def shot_variations(slug: str, shot_id: str):
    _guard()
    db = _db(slug)
    row = db.fetchone("SELECT veo_prompt FROM shots WHERE id=?", (shot_id,))
    if not row:
        raise HTTPException(404, f"no shot '{shot_id}'")
    from backend import config
    from scripts.film_factory import costs
    try:
        costs.assert_budget(db, 0.01)
    except costs.BudgetExceeded as e:
        raise HTTPException(402, str(e))
    variations = ai_manager.generate_video_variations(row[0], mode="story")
    costs.charge(db, "inspector", f"{shot_id}_variations", config.MODEL_FAST, 1)
    return {"variations": variations}
