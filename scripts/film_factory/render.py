"""Stage 4 — RENDER: the Veo farm. Async worker pool over pending shots.

Per shot: keyframed shots go image-to-video from their NB2 still; the rest go
text-to-video with character sheets as Veo reference images. Each take is
QC-scored; below-threshold takes trigger a retake up to --max-takes, then the
best-scoring take is selected. 429s back off, content blocks get one prompt
soften, a STOP file in the project dir drains the pool, and the budget cap is
checked before every take.
"""
import asyncio
import base64
import json
import logging
import re
import time

from backend import config, google_api
from . import costs, qc
from .keyframes import jpeg_for_veo

log = logging.getLogger("filmfactory.render")

MODEL = config.MODEL_VIDEO_GEN  # veo-3.1-generate-preview
TAKE_SECONDS = 8
TRANSIENT_RETRIES = 5

SOFTEN_SYS = ("Rewrite this video prompt so it passes strict content filters "
              "while keeping the same cinematic intent: remove anything that "
              "could read as violence, injury, minors, real people, or brands; "
              "keep length and structure. Return only the rewritten prompt.")


def _is_transient(err: str) -> bool:
    e = err.lower()
    return any(k in e for k in ("429", "resource_exhausted", "quota", "rate",
                                "timeout", "timed out", "503", "500", "unavailable",
                                "deadline", "connection",
                                # network / DNS blips — retry through them
                                "getaddrinfo", "disconnect", "network",
                                "name resolution", "temporarily", "reset by peer",
                                "eof occurred", "11001", "connection reset",
                                "remote end closed", "read timed out"))


def _is_blocked(err: str) -> bool:
    e = err.lower()
    return any(k in e for k in ("safety", "blocked", "filtered", "violat",
                                "prohibited", "responsible ai", "rai "))


def build_name_subs(film: dict) -> list:
    """(pattern, descriptor) pairs replacing character names with role
    descriptors — Veo's celebrity filter false-positives on fictional full
    names next to photoreal faces. Shared by the farm and single-shot ops."""
    subs = []
    for c in film.get("characters", []):
        parts = c.get("name", "").split()
        if not parts:
            continue
        disc = (c.get("discipline") or "artist").lower()
        desc = ("the broadcast commentator" if c.get("role") == "host"
                else f"the {disc} artist")
        names = [c["name"]] + ([parts[0], parts[-1]] if len(parts) > 1 else [])
        pat = re.compile(r"\b(" + "|".join(re.escape(n) for n in names) + r")('s)?\b",
                         re.IGNORECASE)
        subs.append((pat, desc))
    return subs


def scrub_names(prompt: str, subs: list) -> str:
    for pat, desc in subs:
        prompt = pat.sub(lambda m, d=desc: d + (m.group(2) or ""), prompt)
    return prompt


class Farm:
    def __init__(self, ai, db, concurrency=3, max_takes=2, qc_threshold=6.0,
                 model=MODEL):
        self.ai, self.db = ai, db
        self.dirs = db.dirs()
        self.sem = asyncio.Semaphore(concurrency)
        self.max_takes = max_takes
        self.qc_threshold = qc_threshold
        self.model = model
        self.aspect = db.get_meta("aspect", "16:9")
        self.stop_file = db.project_dir / "STOP"
        self.done = self.failed = 0
        self.t0 = time.time()
        # prompts sent to Veo get names swapped for role descriptors; DB
        # prompts keep names for humans and QC (see build_name_subs)
        self.name_subs = build_name_subs(db.film())

    def _scrub_names(self, prompt: str) -> str:
        return scrub_names(prompt, self.name_subs)

    def _soften(self, prompt: str) -> str:
        try:
            costs.assert_budget(self.db, 0.01)
            out = google_api.gen_text(
                self.ai.genai_client, config.MODEL_FAST,
                [google_api.text_block(prompt)], system_instruction=SOFTEN_SYS)
            costs.charge(self.db, "render", "soften", config.MODEL_FAST, 1)
            return self._scrub_names(out.strip()) if out.strip() else self._scrub_names(prompt)
        except Exception:
            return self._scrub_names(prompt)

    def _veo_kwargs(self, shot) -> dict:
        kw = dict(prompt=self._scrub_names(shot["veo_prompt"]), model_name=self.model,
                  duration_seconds=TAKE_SECONDS, resolution="1080p")
        if shot["keyframe_path"]:
            kw["start_frame_image"] = jpeg_for_veo(shot["keyframe_path"])
            kw["aspect_ratio"] = self.aspect
            # Only the image-to-video path accepts this; text-to-video 400s
            # with "allow_adult for personGeneration is currently not supported".
            kw["person_generation"] = "allow_adult"
        else:
            kw["aspect_ratio"] = self.aspect
            refs = []
            for cid in json.loads(shot["characters"] or "[]")[:3]:
                row = self.db.fetchone(
                    "SELECT path FROM assets WHERE id=? AND status='done'",
                    (f"char_{cid}",))
                if row:
                    refs.append(jpeg_for_veo(row[0]))
            if refs:
                kw["reference_images"] = refs
        return kw

    async def _one_take(self, shot, n: int):
        take_id = f"{shot['id']}_t{n}"
        prompt_used = shot["veo_prompt"]
        kwargs = self._veo_kwargs(shot)
        blocked_count = 0
        for attempt in range(TRANSIENT_RETRIES + 1):
            costs.assert_budget(self.db, costs.estimate(self.model, TAKE_SECONDS))
            try:
                result = await self.ai.generate_video(**kwargs)
                video = base64.b64decode(result["video_b64"])
                path = self.dirs["takes"] / f"{take_id}.mp4"
                path.write_bytes(video)
                usd = costs.charge(self.db, "render", take_id, self.model, TAKE_SECONDS)
                score, notes = qc.score_take(self.ai, self.db, self.dirs,
                                             shot, take_id, str(path))
                self.db.exec(
                    "INSERT OR REPLACE INTO takes (id, shot_id, n, path, video_uri, "
                    "cost, status, qc_score, qc_notes) VALUES (?,?,?,?,?,?,?,?,?)",
                    (take_id, shot["id"], n, str(path), result.get("video_uri"),
                     usd, "done", score, notes))
                log.info("take done %s qc=%.1f (%s)", take_id, score, notes[:60])
                return score
            except costs.BudgetExceeded:
                raise
            except Exception as e:
                err = str(e)
                if _is_blocked(err):
                    blocked_count += 1
                    if blocked_count == 1:
                        # RAI filtering is probabilistic — an identical request
                        # often passes on the next roll.
                        log.warning("take %s filtered, retrying unchanged: %s",
                                    take_id, err[:120])
                        continue
                    if blocked_count == 2:
                        log.warning("take %s filtered twice, softening prompt", take_id)
                        kwargs["prompt"] = self._soften(prompt_used)
                        continue
                if _is_transient(err) and attempt < TRANSIENT_RETRIES:
                    wait = min(30 * (attempt + 1), 180)
                    log.warning("take %s transient error (attempt %d, wait %ds): %s",
                                take_id, attempt + 1, wait, err[:150])
                    await asyncio.sleep(wait)
                    continue
                self.db.exec(
                    "INSERT OR REPLACE INTO takes (id, shot_id, n, status, error) "
                    "VALUES (?,?,?,?,?)",
                    (take_id, shot["id"], n, "filtered" if _is_blocked(err) else "failed",
                     err[:500]))
                log.error("take FAILED %s: %s", take_id, err[:200])
                return None

    async def _one_shot(self, shot):
        async with self.sem:
            if self.stop_file.exists():
                return
            self.db.exec("UPDATE shots SET status='rendering' WHERE id=?", (shot["id"],))
            have = {r[0]: r[1] for r in self.db.fetchall(
                "SELECT n, qc_score FROM takes WHERE shot_id=? AND status='done'",
                (shot["id"],))}
            best = max(have.values()) if have else None
            n = max(have.keys(), default=0)
            while (best is None or best < self.qc_threshold) and n < self.max_takes:
                n += 1
                if n in have:
                    continue
                score = await self._one_take(shot, n)
                if score is not None:
                    best = max(best or 0, score)
            sel = self.db.fetchone(
                "SELECT id, qc_score FROM takes WHERE shot_id=? AND status='done' "
                "ORDER BY qc_score DESC LIMIT 1", (shot["id"],))
            if sel:
                self.db.exec("UPDATE shots SET status='selected', selected_take=?, "
                             "error=NULL WHERE id=?", (sel[0], shot["id"]))
                self.done += 1
            else:
                self.db.exec("UPDATE shots SET status='failed' WHERE id=?", (shot["id"],))
                self.failed += 1
            total = self.done + self.failed
            if total % 5 == 0:
                rate = (time.time() - self.t0) / max(total, 1)
                log.info("== farm: %d selected, %d failed | $%.2f spent | ~%.1f min/shot ==",
                         self.done, self.failed, costs.spent(self.db), rate / 60)


async def run_async(ai, db, concurrency=3, max_takes=2, qc_threshold=6.0,
                    limit=None, shot_ids=None, model=MODEL):
    farm = Farm(ai, db, concurrency, max_takes, qc_threshold, model)
    q = ("SELECT id, veo_prompt, characters, keyframe_path, needs_keyframe "
         "FROM shots WHERE status IN ('pending','rendering','failed') ")
    params = []
    if shot_ids:
        q += f"AND id IN ({','.join('?' * len(shot_ids))}) "
        params += list(shot_ids)
    q += "ORDER BY seq"
    if limit:
        q += f" LIMIT {int(limit)}"
    cols = ("id", "veo_prompt", "characters", "keyframe_path", "needs_keyframe")
    shots = [dict(zip(cols, r)) for r in db.fetchall(q, params)]
    if not shots:
        log.info("RENDER: nothing to do")
        return
    log.info("RENDER: %d shots queued (concurrency %d, max %d takes, qc gate %.1f, "
             "budget $%.0f, ~$%.0f worst case)",
             len(shots), concurrency, max_takes, qc_threshold, costs.budget(db),
             len(shots) * max_takes * costs.estimate(model, TAKE_SECONDS))
    try:
        await asyncio.gather(*(farm._one_shot(s) for s in shots))
    except costs.BudgetExceeded as e:
        log.error("BUDGET STOP: %s", e)
    if farm.stop_file.exists():
        log.warning("STOP file present - farm drained early")
    log.info("RENDER pass complete: %d selected, %d failed, spend $%.2f",
             farm.done, farm.failed, costs.spent(db))


def run(ai, db, **kw):
    asyncio.run(run_async(ai, db, **kw))
