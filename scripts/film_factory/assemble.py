"""Stage 5 — ASSEMBLE: selected takes -> per-act cuts + full film via ffmpeg.

Re-encodes to a uniform 1080p24 H.264/AAC stream so mixed Veo outputs concat
cleanly. Also writes exports/manifest.csv (the edit's paper trail).
"""
import csv
import logging
import subprocess

log = logging.getLogger("filmfactory.assemble")


def _concat(files, out_path, crop43=False, tape=False, aspect="16:9"):
    lst = out_path.with_suffix(".txt")
    lst.write_text("".join(f"file '{str(p).replace(chr(39), chr(39)*2)}'\n"
                           for p in files), encoding="utf-8")
    if tape:  # tapeify output is already 4:3 29.97 — just normalize size
        vf = "scale=1440:1080:flags=bilinear,fps=30000/1001"
    elif crop43:  # center-crop 16:9 masters to 4:3 (e.g. VHS-era projects)
        vf = "crop=ih*4/3:ih,scale=1440:1080,fps=24"
    elif aspect == "9:16":  # vertical (Snapchat/TikTok/Reels)
        vf = ("scale=1080:1920:force_original_aspect_ratio=decrease,"
              "pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=24")
    else:
        vf = ("scale=1920:1080:force_original_aspect_ratio=decrease,"
              "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=24")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
           "-i", str(lst),
           "-vf", vf,
           "-c:v", "libx264", "-crf", "18", "-preset", "medium",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
           str(out_path)]
    subprocess.run(cmd, check=True, timeout=7200, capture_output=True)


def run(ai, db, version="v1", crop43=False, tape=False):
    dirs = db.dirs()
    aspect = db.get_meta("aspect", "16:9")
    rows = db.fetchall(
        "SELECT s.id, s.seq, s.act, s.scene, s.title, t.path, t.qc_score, t.cost, "
        "s.selected_take FROM shots s JOIN takes t ON t.id = s.selected_take "
        "WHERE s.status='selected' AND COALESCE(s.excluded, 0)=0 ORDER BY s.seq")
    if not rows:
        raise SystemExit("No selected takes to assemble - run render first.")
    if tape:
        tape_dir = db.project_dir / "tape"
        swapped = []
        for r in rows:
            tp = tape_dir / f"{r[8]}.mp4"
            if not tp.exists():
                raise SystemExit(f"--tape: missing {tp} - run tapeify first.")
            swapped.append(r[:5] + (str(tp),) + r[6:])
        rows = swapped

    with open(dirs["exports"] / "manifest.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["seq", "shot_id", "act", "scene", "title", "take_path",
                    "qc_score", "take_cost_usd"])
        for r in rows:
            w.writerow([r[1], r[0], r[2], r[3], r[4], r[5], r[6], r[7]])

    acts = sorted({r[2] for r in rows})
    act_files = []
    for act in acts:
        files = [r[5] for r in rows if r[2] == act]
        out = dirs["exports"] / f"{act}_{version}.mp4"
        log.info("assembling %s (%d shots)...", act, len(files))
        _concat(files, out, crop43=crop43, tape=tape, aspect=aspect)
        act_files.append(out)

    import re as _re
    title = _re.sub(r"[^a-z0-9]+", "_", (db.film().get("title") or "film").lower()).strip("_")[:40]
    full = dirs["exports"] / f"{title}_{version}_full.mp4"
    log.info("assembling full cut (%d shots)...", len(rows))
    _concat([r[5] for r in rows], full, crop43=crop43, tape=tape, aspect=aspect)
    dur = len(rows) * 8
    log.info("ASSEMBLE complete: %s (%d shots, %d:%02d) + %d act files",
             full, len(rows), dur // 60, dur % 60, len(act_files))
