"""Overnight batch driver — WAVE 2. Eight more original formats, reusing the
wave-1 machinery (run_batch). Separate control dir + its own budget cap.

Run:  python -m scripts.film_factory.overnight2
Stop: create D:\Synthograsizer_Films\_overnight2\STOP
"""
import json
import logging
import time
import traceback
from pathlib import Path

from scripts.film_factory import bootstrap, costs
from scripts.film_factory.db import DB
from scripts.film_factory.overnight import run_batch, FILMS_ROOT

CTRL = FILMS_ROOT / "_overnight2"
GLOBAL_CAP = 700.0

WAVE2 = [
    dict(slug="elevator_security_cam", clips=18, aspect="9:16", preset="none", prompt=(
        "Fixed security-camera footage inside elevators where impossible things "
        "happen between floors: the floor counter counts to numbers that can't "
        "exist, two occupants quietly swap places, the doors open onto a forest "
        "or an identical elevator, a rider's reflection stays behind when they "
        "exit. High-corner fixed elevator cam, mirrored walls, fluorescent "
        "light, ordinary anonymous adult riders, harmless surreal events only, "
        "no crime, no readable text.")),
    dict(slug="wedding_videography", clips=20, aspect="16:9", preset="none", prompt=(
        "Glossy wedding-videographer footage where each moment goes gently "
        "impossible: a cake that tiers upward forever into the rafters, a "
        "bouquet toss that never comes back down, a first dance where the couple "
        "slowly floats, confetti that falls upward and reassembles. Cinematic "
        "wedding-film lighting, soft focus and lens flare, anonymous fictional "
        "couples and guests, joyful tone, no readable signage or text.")),
    dict(slug="streamer_webcam", clips=18, aspect="16:9", preset="none", prompt=(
        "Gaming-streamer webcam footage where the streamer's room quietly warps "
        "behind them: posters that rearrange when unobserved, a second identical "
        "streamer sitting in the background, a plant that grows across a full "
        "clip, RGB lights that drift off the wall into the air. Webcam framing "
        "with the person centered, cluttered bedroom setup, ring-light glow, one "
        "anonymous adult streamer per clip reacting deadpan, no readable chat, "
        "overlays, or text.")),
    dict(slug="real_estate_tours", clips=20, aspect="16:9", preset="none", prompt=(
        "Bright real-estate walkthrough-tour footage of impossible houses: a "
        "hallway that returns to the room you started in, a closet far bigger "
        "inside than the house, a staircase that leads back to its own bottom, a "
        "window that looks onto a different season in every room. Smooth gliding "
        "listing-video camera, staged furniture, clean natural light, no people, "
        "no readable text or signage.")),
    dict(slug="airport_liminal_vlog", clips=18, aspect="9:16", preset="none", prompt=(
        "Vertical travel-vlog phone footage in eerily impossible airport "
        "terminals: a moving walkway that loops endlessly past the same gate, a "
        "departure gate that opens onto the identical terminal, a baggage "
        "carousel delivering impossible objects, an empty terminal at golden "
        "hour that gently breathes. Handheld selfie-vlog framing, liminal "
        "over-lit spaces, anonymous fictional traveler, calm uncanny mood, no "
        "readable signage, brands, or flight text.")),
    dict(slug="talent_show_auditions", clips=20, aspect="16:9", preset="none", prompt=(
        "Talent-show stage audition footage where each act is genuinely "
        "impossible: a magician whose trick warps the entire stage, a singer "
        "whose voice becomes visible ribbons of light, a dancer who leaves "
        "slow-fading afterimages, a juggler whose objects orbit on their own. "
        "Big stage lighting, spotlights and haze, wide audience silhouette, one "
        "anonymous fictional performer per clip, dramatic reveal energy, no "
        "readable text or logos.")),
    dict(slug="aquarium_visit", clips=18, aspect="9:16", preset="none", prompt=(
        "Vertical phone footage at an aquarium where the exhibits are impossible: "
        "fish that swim out through the glass as drifting light, a tank whose "
        "reflection shows a different room, a jellyfish that unfolds into a "
        "chandelier, a shark that phases into a school of smaller copies. Dim "
        "blue aquarium lighting, glass reflections and caustics, anonymous "
        "visitor silhouettes, hushed awe, no readable placards or text.")),
    dict(slug="drive_thru_window", clips=18, aspect="9:16", preset="none", prompt=(
        "Vertical car-window phone footage at a fictional late-night drive-thru "
        "where the window is impossible: an endless bag of food handed out that "
        "never stops, a service window that opens onto a kitchen in a different "
        "season, a receipt that unspools to the ground, headlights reflecting a "
        "sky that doesn't match. Night-time car-window framing, neon menu glow "
        "(no readable text), anonymous hands exchanging items, deadpan surreal "
        "tone, no brands or logos.")),
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
    return logging.getLogger("overnight2")


def _total_spent():
    total = 0.0
    for spec in WAVE2:
        pdir = FILMS_ROOT / spec["slug"]
        if (pdir / "film.db").exists():
            try:
                total += costs.spent(DB(pdir))
            except Exception:
                pass
    return round(total, 2)


def _write_status():
    rows = []
    for spec in WAVE2:
        pdir = FILMS_ROOT / spec["slug"]
        e = {"slug": spec["slug"], "clips_target": spec["clips"]}
        if (pdir / "film.db").exists():
            db = DB(pdir)
            e["shots"] = dict(db.fetchall("SELECT status, COUNT(*) FROM shots GROUP BY 1"))
            e["spent"] = costs.spent(db)
            e["assembled"] = bool(list((pdir / "exports").glob("*_full.mp4"))
                                  if (pdir / "exports").exists() else [])
        rows.append(e)
    (CTRL / "status.json").write_text(
        json.dumps({"updated": time.strftime("%H:%M:%S"),
                    "total_spent": _total_spent(), "batches": rows}, indent=2),
        encoding="utf-8")


def main():
    log = _log()
    bootstrap(FILMS_ROOT / WAVE2[0]["slug"])
    from backend.ai_manager import ai_manager as ai
    log.info("=== WAVE 2 START: %d batches, ~%d clips, cap $%.0f ===",
             len(WAVE2), sum(b["clips"] for b in WAVE2), GLOBAL_CAP)
    for i, spec in enumerate(WAVE2, 1):
        if (CTRL / "STOP").exists():
            log.warning("STOP present — draining after batch %d", i - 1)
            break
        if _total_spent() > GLOBAL_CAP:
            log.warning("cap $%.0f reached — stopping", GLOBAL_CAP)
            break
        log.info("--- wave2 batch %d/%d: %s (total $%.2f) ---", i, len(WAVE2),
                 spec["slug"], _total_spent())
        try:
            run_batch(ai, spec, log)
        except Exception:
            log.error("BATCH FAILED %s:\n%s", spec["slug"], traceback.format_exc())
        _write_status()
    log.info("=== WAVE 2 COMPLETE: total spend ~$%.2f ===", _total_spent())


if __name__ == "__main__":
    main()
