"""TAPEIFY — run selected takes through an era-correct video signal path.

Veo renders period styles as clean 24fps cinema with grain painted on. These
presets rebuild the actual signal character of each format: video cadence,
format-specific resolution bottlenecks, chroma behavior, and source-correct
audio. Preset comes from --preset, else project meta 'tape_preset', else vhs.
Outputs <project>/tape/<take_id>.mp4; assemble --tape prefers these.

Hard-won ffmpeg 8.0 notes baked into every preset:
- pin aformat=flt:44100 before any audio filter (NaN otherwise on some clips)
- no vibrato (emits NaN schedule-dependently when a video branch is present)
- noise branches pre-scaled with volume=, mixed amix normalize=0 (weights= NaNs)
"""
import logging
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

log = logging.getLogger("filmfactory.tapeify")

# 24fps film cadence -> 29.97 motion-compensated video cadence: the single
# biggest "this is video, not cinema" cue, shared by all presets
_CADENCE = ("minterpolate=fps=30000/1001:mi_mode=mci:mc_mode=aobmc:"
            "me_mode=bidir:vsbmc=1")
_AFMT = "aformat=sample_fmts=flt:sample_rates=44100"

PRESETS = {
    # consumer VHS camcorder (home video)
    "vhs": (
        ",".join([
            "crop=ih*4/3:ih", "scale=640:480:flags=lanczos", _CADENCE,
            "scale=352:240:flags=lanczos",       # VHS luma bottleneck
            "scale=640:480:flags=bilinear",
            "boxblur=lr=0:cr=2:cp=1",            # chroma bleed
            "unsharp=5:5:0.9:3:3:0",             # edge ringing
            "noise=alls=7:allf=t",
            "curves=all='0/0.06 0.5/0.5 1/0.94'",
            "eq=saturation=1.12:gamma=0.97:contrast=1.02",
            "scale=1440:1080:flags=bilinear"]),
        (f"[0:a]pan=mono|c0=.5*c0+.5*c1,{_AFMT},"
         "highpass=f=120,lowpass=f=8500[a1];"
         f"anoisesrc=colour=pink:amplitude=0.012,{_AFMT},volume=0.35[n];"
         "[a1][n]amix=inputs=2:duration=first:normalize=0[aout]"),
    ),
    # public-access cable studio (S-VHS master, tripod cameras, hot lights)
    "publicaccess": (
        ",".join([
            "crop=ih*4/3:ih", "scale=640:480:flags=lanczos", _CADENCE,
            "scale=480:360:flags=lanczos",       # S-VHS: cleaner than VHS
            "scale=640:480:flags=bilinear",
            "boxblur=lr=0:cr=1:cp=1",
            "unsharp=5:5:1.1:3:3:0",             # hot video-camera ringing
            "noise=alls=5:allf=t",
            "curves=all='0/0.04 0.5/0.52 1/0.97'",
            "eq=saturation=1.25:gamma=1.0:contrast=1.05",  # overdriven studio color
            "scale=1440:1080:flags=bilinear"]),
        (f"[0:a]pan=mono|c0=.5*c0+.5*c1,{_AFMT},"
         "highpass=f=90,lowpass=f=10000,"
         "aecho=0.8:0.25:36:0.18[a1];"           # untreated studio room echo
         f"sine=frequency=60:sample_rate=44100,{_AFMT},volume=0.012[hum];"
         f"anoisesrc=colour=pink:amplitude=0.008,{_AFMT},volume=0.3[n];"
         "[a1][hum][n]amix=inputs=3:duration=first:normalize=0[aout]"),
    ),
    # corporate training tape (Betacam SP, tripod, fluorescent offices)
    "betacam": (
        ",".join([
            "crop=ih*4/3:ih", "scale=640:480:flags=lanczos", _CADENCE,
            "scale=540:404:flags=lanczos",       # broadcast-adjacent res
            "scale=640:480:flags=bilinear",
            "boxblur=lr=0:cr=1:cp=1",
            "unsharp=5:5:0.7:3:3:0",
            "noise=alls=3:allf=t",               # cleaner tape stock
            "curves=all='0/0.03 0.5/0.5 1/0.97'",
            "eq=saturation=0.92:gamma=1.02:contrast=1.03",  # flat corporate grade
            "scale=1440:1080:flags=bilinear"]),
        (f"[0:a]pan=mono|c0=.5*c0+.5*c1,{_AFMT},"
         "highpass=f=100,lowpass=f=11000[a1];"
         f"anoisesrc=colour=pink:amplitude=0.005,{_AFMT},volume=0.3[n];"
         "[a1][n]amix=inputs=2:duration=first:normalize=0[aout]"),
    ),
    # time-lapse security VCR (ceiling camera, ~5fps stepped, near-silent)
    "cctv": (
        ",".join([
            "crop=ih*4/3:ih", "scale=640:480:flags=lanczos", _CADENCE,
            "fps=5",                              # time-lapse VCR cadence
            "scale=320:240:flags=lanczos",        # miserable CCTV resolution
            "scale=640:480:flags=bilinear",
            "boxblur=lr=1:lp=1:cr=2:cp=1",
            "noise=alls=10:allf=t",
            "hue=s=0.15",                         # nearly-dead color
            "curves=all='0/0.09 0.5/0.55 1/0.92'",
            "eq=gamma=1.15:contrast=0.95",        # security-gain washout
            "fps=30000/1001",                     # stepped playback judder
            "scale=1440:1080:flags=bilinear"]),
        # ceiling mic distance: crush the diegetic audio to a muffled murmur
        (f"[0:a]pan=mono|c0=.5*c0+.5*c1,{_AFMT},"
         "lowpass=f=1800,volume=0.25[a1];"
         f"sine=frequency=60:sample_rate=44100,{_AFMT},volume=0.02[hum];"
         f"anoisesrc=colour=brown:amplitude=0.01,{_AFMT},volume=0.4[n];"
         "[a1][hum][n]amix=inputs=3:duration=first:normalize=0[aout]"),
    ),
}
PRESETS["news"] = PRESETS["betacam"]  # ENG field units shot Betacam SP too


def _one(src: str, dst, video_chain: str, audio_chain: str) -> None:
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
           "-filter_complex", f"[0:v]{video_chain}[vout];{audio_chain}",
           "-map", "[vout]", "-map", "[aout]",
           "-c:v", "libx264", "-crf", "17", "-preset", "medium",
           "-c:a", "aac", "-b:a", "128k",
           str(dst)]
    # write to a temp name and rename on success — a failed encode must not
    # leave a stub that passes downstream exists() checks
    tmp = dst.with_suffix(".part.mp4")
    cmd[-1] = str(tmp)
    try:
        subprocess.run(cmd, check=True, timeout=900, capture_output=True)
        tmp.replace(dst)
    except subprocess.CalledProcessError as e:
        tmp.unlink(missing_ok=True)
        tail = (e.stderr or b"").decode(errors="replace")[-600:]
        raise RuntimeError(f"ffmpeg failed: {tail}") from e
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def run(ai, db, concurrency=4, shot_ids=None, force=False, preset=None):
    dirs = db.dirs()
    preset = preset or db.get_meta("tape_preset", "vhs")
    if preset not in PRESETS:
        raise SystemExit(f"unknown tape preset '{preset}' (have: {list(PRESETS)})")
    video_chain, audio_chain = PRESETS[preset]
    tape_dir = db.project_dir / "tape"
    tape_dir.mkdir(exist_ok=True)
    q = ("SELECT s.selected_take, t.path FROM shots s JOIN takes t "
         "ON t.id = s.selected_take WHERE s.status='selected'")
    params = []
    if shot_ids:
        q += f" AND s.id IN ({','.join('?' * len(shot_ids))})"
        params = list(shot_ids)
    rows = db.fetchall(q, params)
    todo = [(tid, p) for tid, p in rows
            if force or not (tape_dir / f"{tid}.mp4").exists()]
    log.info("TAPEIFY: %d clips (preset '%s', concurrency %d)",
             len(todo), preset, concurrency)
    done = failed = 0
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futs = {pool.submit(_one, p, tape_dir / f"{tid}.mp4",
                            video_chain, audio_chain): tid
                for tid, p in todo}
        for fut in as_completed(futs):
            tid = futs[fut]
            try:
                fut.result()
                done += 1
                if done % 5 == 0:
                    log.info("tapeify progress: %d/%d", done, len(todo))
            except Exception as e:
                failed += 1
                log.error("tapeify FAILED %s: %s", tid, str(e)[:200])
    log.info("TAPEIFY complete: %d done, %d failed -> %s", done, failed, tape_dir)
