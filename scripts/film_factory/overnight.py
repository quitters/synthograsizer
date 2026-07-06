"""Overnight batch driver — runs a queue of Videorama batches unattended.

One long-lived process: for each concept it writes a brief (via the Brief
Writer, rails on), then develop -> [bible/keyframes if characters] ->
render -> [tapeify] -> assemble. Every batch is wrapped in try/except so one
failure never stops the queue; every stage is resumable so a restart continues
where it left off. Global + per-batch budget caps; a STOP file drains it.

Run:  python -m scripts.film_factory.overnight
Stop: create D:\Synthograsizer_Films\_overnight\STOP
"""
import json
import logging
import time
import traceback
from pathlib import Path

from scripts.film_factory import bootstrap, briefs, develop, bible, keyframes, \
    render, assemble, tapeify, costs
from scripts.film_factory.db import DB

FILMS_ROOT = Path(r"D:\Synthograsizer_Films")
CTRL = FILMS_ROOT / "_overnight"
GLOBAL_CAP = 1800.0        # hard ceiling across the whole run
RENDER_CONCURRENCY = 4
MAX_TAKES = 2
QC_GATE = 6.0

# ── The dozen concepts (all original formats — no real games/shows/people) ──
BATCHES = [
    dict(slug="impossible_gameplay", clips=24, aspect="16:9", preset="none", prompt=(
        "Screen-recorded gameplay of impossible fictional video games that break "
        "their own rules: a racing game where the track devours the cars, a "
        "cooking mini-game where ingredients panic and flee the pan, a fishing "
        "game that reels up living-room furniture, a platformer whose hero falls "
        "upward forever, a farming sim where crops grow into weather. Screen-"
        "capture aesthetic, invented game-engine physics and glitches, minimal "
        "abstract HUD shapes only (no readable text), each clip a different "
        "fictional game.")),
    dict(slug="facetime_gone_wrong", clips=20, aspect="9:16", preset="none", prompt=(
        "Vertical smartphone video-call footage where the person on the other "
        "end is subtly, impossibly wrong: a grandmother whose cozy room slowly "
        "floods while she chats calmly, a friend whose reflection moves a half-"
        "second late, a caller who quietly duplicates into two identical people "
        "mid-sentence, a dad whose background loops seamlessly. Front selfie-cam "
        "framing, connection artifacts and pixelation, deadpan unbothered "
        "callers, one quiet impossible detail per call.")),
    dict(slug="runway_mishaps", clips=20, aspect="16:9", preset="none", prompt=(
        "High-fashion runway show footage where each walk goes surreally wrong: "
        "a gown that unspools into the entire catwalk behind the model, a walk "
        "where gravity tilts sideways, garments woven from smoke or falling "
        "water, a model who multiplies into a line of identical selves with each "
        "step. Glossy fashion-film lighting, flashing photographer cameras, "
        "editorial slow motion, a different anonymous model per clip.")),
    dict(slug="cooking_show_disasters", clips=20, aspect="16:9", preset="none", prompt=(
        "Bright daytime TV cooking-show footage where the food behaves "
        "impossibly: a souffle that inflates to fill the entire kitchen, a sauce "
        "that pours upward onto the ceiling, a roast that calmly reassembles "
        "itself raw, vegetables that dice themselves in midair. Clean studio "
        "kitchen, cheerful over-lit daytime-TV look, one enthusiastic unnamed "
        "chef per clip who never breaks composure.")),
    dict(slug="impossible_nature_doc", clips=20, aspect="16:9", preset="none", prompt=(
        "Cinematic wildlife documentary footage of impossible fictional "
        "creatures: a herd that flows across the plain like a single liquid, a "
        "bird that unfolds into flat origami and back, a deep-sea animal made of "
        "shifting geometric light, an insect swarm that assembles into "
        "architecture then disperses. Prestige nature-documentary cinematography, "
        "hushed generic wildlife ambience, no people on camera, no on-screen "
        "text. Every creature blatantly impossible.")),
    dict(slug="dashcam_surreal", clips=20, aspect="16:9", preset="none", prompt=(
        "Car dashcam footage capturing quietly impossible roadside moments: a "
        "deer that phases through passing traffic, a highway that loops back on "
        "itself, rain that falls upward off the windshield, a car ahead that "
        "folds flat and slides under a bridge, a traffic light that grows like a "
        "tree. Dashcam wide-angle, mundane suburban roads and overpasses, "
        "absolutely no collisions, harm, or crime — impossibility only.")),
    dict(slug="doorbell_cam", clips=18, aspect="9:16", preset="none", prompt=(
        "Vertical fisheye security doorbell-camera footage of gentle "
        "impossibilities on a front porch: a package that unpacks and delivers "
        "itself, a visitor who is there in one frame and gone the next, porch "
        "shadows that don't match their objects, a potted plant that grows a "
        "foot each time a car passes, autumn leaves that fall upward into the "
        "tree. Doorbell-cam wide fisheye, porch and doorway lighting, harmless "
        "surreal events only, no crime.")),
    dict(slug="absurd_infomercials", clips=20, aspect="16:9", preset="betacam", prompt=(
        "Late-1980s infomercial footage demonstrating absurd impossible "
        "products: a blanket with far too many arm-holes, a kitchen gadget that "
        "endlessly multiplies the food it touches, dramatic grayscale 'before' "
        "scenes of impossible domestic defeat (an adult overwhelmed by a "
        "sandwich that keeps growing). Overlit studio, oversaturated video, one "
        "earnest unnamed presenter per clip, exaggerated reactions, no readable "
        "text, brands, or logos.")),
    dict(slug="weather_reports_alive", clips=18, aspect="16:9", preset="betacam", prompt=(
        "Local-news weather-report field and studio footage where the forecast "
        "comes alive: a meteorologist gestures at a map and the cartoon weather "
        "leaks off the screen into the studio, a sun graphic that scorches the "
        "news desk, rain that falls only on the presenter's patch of floor, a "
        "cold front that frosts the camera lens. Flat broadcast-video look, "
        "fictional station, no readable graphics or lower-thirds; every event "
        "blatantly and obviously impossible, never a real weather event.")),
    dict(slug="asmr_impossible_unboxing", clips=18, aspect="9:16", preset="none", prompt=(
        "Cozy vertical ASMR unboxing videos where the box contains impossible "
        "things: a package that nests into endless identical smaller packages, "
        "bubble wrap whose bubbles silently refill after popping, an object "
        "whose surface ripples like water when touched, tissue paper that folds "
        "itself into origami. Soft warm close-up lighting, slow gentle handling, "
        "hands only and no faces, satisfying textures, no readable text or "
        "brands.")),
    dict(slug="backyard_physics_sports", clips=22, aspect="9:16", preset="none", prompt=(
        "Amateur phone-shot backyard and street sports clips where physics is "
        "quietly broken: a basketball that orbits the hoop like a moon, a "
        "bowling ball that curves through the air in a slow spiral, a skateboard "
        "trick that briefly loops the same second three times, a frisbee that "
        "folds space and returns from the opposite side of the frame. Handheld "
        "vertical phone video, driveways, parks and empty lots, fictional "
        "players, exaggerated hype reactions, no team names or logos.")),
    dict(slug="how_its_made_impossible", clips=20, aspect="16:9", preset="none", prompt=(
        "Glossy industrial 'how it's made' time-lapse footage of impossible "
        "production lines: a factory conveyor assembling fluffy clouds into "
        "cardboard boxes, fruit ripening and transforming into other objects on "
        "the belt, a building that grows upward like a vine in fast-forward, "
        "machines that fold raw sheet metal into living shapes. Clean industrial "
        "time-lapse cinematography, macro detail shots, no narration, no people, "
        "no readable signage.")),
]


def _log():
    CTRL.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s", "%H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for h in (logging.FileHandler(CTRL / "run.log", encoding="utf-8"),
              logging.StreamHandler()):
        h.setFormatter(fmt)
        root.addHandler(h)
    for noisy in ("httpx", "google_genai"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    return logging.getLogger("overnight")


def _total_spent():
    total = 0.0
    for spec in BATCHES:
        pdir = FILMS_ROOT / spec["slug"]
        if (pdir / "film.db").exists():
            try:
                total += costs.spent(DB(pdir))
            except Exception:
                pass
    return round(total, 2)


def _write_status(log_obj):
    rows = []
    for spec in BATCHES:
        pdir = FILMS_ROOT / spec["slug"]
        entry = {"slug": spec["slug"], "clips_target": spec["clips"]}
        if (pdir / "film.db").exists():
            db = DB(pdir)
            entry["shots"] = dict(db.fetchall("SELECT status, COUNT(*) FROM shots GROUP BY 1"))
            entry["spent"] = costs.spent(db)
            entry["assembled"] = bool(list((pdir / "exports").glob("*_full.mp4"))
                                      if (pdir / "exports").exists() else [])
        rows.append(entry)
    (CTRL / "status.json").write_text(
        json.dumps({"updated": time.strftime("%H:%M:%S"),
                    "total_spent": _total_spent(), "batches": rows}, indent=2),
        encoding="utf-8")


def run_batch(ai, spec, log):
    from backend.services.videorama_brief import write_brief
    pdir = FILMS_ROOT / spec["slug"]
    if (pdir / "exports").exists() and list((pdir / "exports").glob("*_full.mp4")):
        log.info("SKIP %s (already assembled)", spec["slug"])
        return
    pdir.mkdir(parents=True, exist_ok=True)
    db = DB(pdir)

    bp = pdir / "brief.json"
    if bp.exists():
        brief_d = json.loads(bp.read_text(encoding="utf-8"))
    else:
        log.info("writing brief: %s", spec["slug"])
        brief_d = write_brief(ai, spec["prompt"], {
            "clips": spec["clips"], "consistent_characters": False,
            "tape_preset": spec["preset"], "aspect": spec["aspect"]})
        brief_d["ASPECT"] = spec["aspect"]
        bp.write_text(json.dumps(brief_d, indent=2, ensure_ascii=False), encoding="utf-8")

    db.set_meta("budget_usd", spec["clips"] * 9)  # generous: never stalls a batch
    b = briefs.from_dict(brief_d)

    if db.fetchone("SELECT COUNT(*) FROM shots")[0] == 0:
        develop.run(ai, db, b)

    if brief_d.get("uses_characters"):
        bible.run(ai, db)
        keyframes.run(ai, db, concurrency=3)

    render.run(ai, db, concurrency=RENDER_CONCURRENCY, max_takes=MAX_TAKES,
               qc_threshold=QC_GATE)

    preset = brief_d.get("TAPE_PRESET")
    done = False
    if preset:
        try:
            tapeify.run(ai, db, concurrency=2)
            assemble.run(ai, db, version="v1", tape=True)
            done = True
        except Exception as e:
            log.warning("tape path failed for %s (%s) — plain assemble", spec["slug"], e)
    if not done:
        try:
            assemble.run(ai, db, version="v1")
        except SystemExit as e:
            log.warning("assemble skipped for %s: %s", spec["slug"], e)
    sel = db.fetchone("SELECT COUNT(*) FROM shots WHERE status='selected'")[0]
    log.info("BATCH DONE %s: %d selected, spend $%.2f", spec["slug"], sel, costs.spent(db))


def main():
    log = _log()
    ai = bootstrap(FILMS_ROOT / BATCHES[0]["slug"])
    log.info("=== OVERNIGHT RUN START: %d batches, ~%d clips, global cap $%.0f ===",
             len(BATCHES), sum(b["clips"] for b in BATCHES), GLOBAL_CAP)
    for i, spec in enumerate(BATCHES, 1):
        if (CTRL / "STOP").exists():
            log.warning("STOP file present — draining after batch %d", i - 1)
            break
        spent = _total_spent()
        if spent > GLOBAL_CAP:
            log.warning("global cap $%.0f reached (spent $%.2f) — stopping", GLOBAL_CAP, spent)
            break
        log.info("--- batch %d/%d: %s (total so far $%.2f) ---", i, len(BATCHES),
                 spec["slug"], spent)
        try:
            run_batch(ai, spec, log)
        except Exception:
            log.error("BATCH FAILED %s:\n%s", spec["slug"], traceback.format_exc())
        _write_status(log)
    log.info("=== OVERNIGHT RUN COMPLETE: total spend ~$%.2f ===", _total_spent())


if __name__ == "__main__":
    main()
