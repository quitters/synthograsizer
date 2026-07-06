"""QC — sample frames from a take with ffmpeg and score them against the shot
spec with Gemini vision. Fail-open: a QC malfunction never blocks the farm."""
import json
import logging
import re
import subprocess

from backend import config, google_api
from . import costs

log = logging.getLogger("filmfactory.qc")

MODEL = config.MODEL_FAST  # gemini-3-flash-preview
RUBRIC = """You are a film dailies QC grader. The attached frames are sampled
from one 8-second AI-generated clip. Judge them against the shot brief below.
Return ONLY JSON: {"adherence": 0-10, "characters": 0-10, "artifacts": 0-10,
"overall": 0-10, "notes": "<=25 words"}.
- adherence: does the footage match the brief (subject, action, framing, mood)?
- characters: do people match the character descriptions in the brief? (10 if
  no recurring characters required)
- artifacts: 10 = clean; deduct for warped anatomy, morphing objects, garbled
  textures, text artifacts.
- overall: your gate score - below 6 means reshoot.
SHOT BRIEF:
"""


def sample_frames(video_path: str, out_dir, shot_take: str, times=(1, 4, 7)):
    frames = []
    for t in times:
        out = out_dir / f"{shot_take}_{t}s.jpg"
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t),
               "-i", video_path, "-frames:v", "1", "-vf", "scale=640:-2",
               "-q:v", "4", str(out)]
        try:
            subprocess.run(cmd, check=True, timeout=60, capture_output=True)
            frames.append(out.read_bytes())
        except Exception as e:
            log.warning("frame sample failed at %ss for %s: %s", t, shot_take, e)
    return frames


def score_take(ai, db, dirs, shot_row, take_id: str, video_path: str) -> tuple:
    """Returns (overall_score, notes). Fail-open to (7.0, 'qc-skipped ...')."""
    try:
        frames = sample_frames(video_path, dirs["qc_frames"], take_id)
        if not frames:
            return 7.0, "qc-skipped: no frames sampled"
        extra = db.get_meta("qc_notes_extra", "")
        rubric = RUBRIC + shot_row["veo_prompt"]
        if extra:
            rubric += "\nPROJECT GRADING NOTES:\n" + extra
        blocks = [google_api.image_block(f) for f in frames]
        blocks.append(google_api.text_block(rubric))
        costs.assert_budget(db, costs.estimate(MODEL, 1))
        text = google_api.gen_text(ai.genai_client, MODEL, blocks, json_mode=True)
        costs.charge(db, "qc", take_id, MODEL, 1)
        m = re.search(r"\{.*\}", text, re.DOTALL)
        data = json.loads(m.group(0)) if m else {}
        overall = float(data.get("overall", 7.0))
        notes = str(data.get("notes", ""))[:200]
        return overall, notes
    except costs.BudgetExceeded:
        raise
    except Exception as e:
        log.warning("QC error on %s (fail-open): %s", take_id, str(e)[:150])
        return 7.0, f"qc-error: {str(e)[:80]}"
