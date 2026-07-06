"""Videorama Brief Writer — turn a user's prompt into a full film-factory
brief (JSON), with the production guardrails encoded in the writer itself.

The rails exist because the pipeline runs unattended: they are ON by default
and only an operator-level env switch (SYNTH_VIDEORAMA_RAILS=off) relaxes the
unreality requirement for realistic registers. The baseline safety rules
(minors, real people, likeness) are not relaxable here at all.
"""
import json
import logging
import os

from backend import config, google_api

logger = logging.getLogger(__name__)

TAPE_PRESETS = ["vhs", "publicaccess", "betacam", "cctv", "news", "none"]

BASELINE_RULES = """\
NON-NEGOTIABLE RULES (bake them into CONCEPT hard rules and SHOT_RULES):
- ADULTS ONLY on camera; no children, no minors, no "teens".
- No real people, celebrities, names, brands, logos, or existing artworks.
  On-screen people are referred to by role only ("the host", "a father") -
  full proper names in video prompts trip content filters and are forbidden.
- No gore, injuries, violence, or sexual content; keep incidents impossible,
  procedural, or absurd instead.
- No readable on-screen text, captions, or graphics (models render gibberish).
- Every veo_prompt must be self-contained (the video model has no memory) and
  must end with an "Audio:" clause; dialogue max one speaker, <=14 words,
  in double quotes."""

UNREALITY_RAIL = """\
REALISM RAIL (this project imitates a "real" format - news, surveillance,
documentary, bodycam, archival): every single clip must contain something
IMMEDIATELY impossible to a casual viewer (physics, scale, duration, spatial
logic). Never depict plausibly-real events: no crime, accidents, disasters,
protests, politics, health emergencies, or missing persons. All stations,
towns, and institutions fictional; spoken only, never shown as text. Add a
QC_NOTES criterion: score adherence 2 or lower if a clip could pass as real
footage of a real event."""

WRITER_SYS = """You are a film-format designer for an automated 8-second-clip
video pipeline (Veo 3.1). Given a user's idea, you write a complete production
brief as JSON. Your briefs succeed when they encode PRODUCTION TRUTH: the
specific camera platform, operator behavior, lighting, staging, and audio
signature of the format, era-correct and concrete - and a distinct incident
register with wide variety. Answer ONLY with valid JSON:
{
 "name": short_snake_case,
 "title_hint": str,
 "CONCEPT": str (the format, tone, incident register with ~10 example seeds,
   PRODUCTION TRUTH section, and HARD RULES section),
 "STYLE_ANCHOR_BRIEF": str (instruction to write ONE reusable 30-45 word
   style-anchor sentence locking look/lens/stock/light/grade),
 "CASTING": str (recurring characters with visual_desc requirements IF the
   user wants consistent characters, else instruct an empty characters list;
   plus 10-14 locations),
 "STRUCTURE_NOTES": str (how scenes divide the shot budget),
 "SHOT_RULES": str (the per-shot JSON contract: title, veo_prompt 70-130
   words w/ camera behavior + Audio clause, keyframe_prompt, characters,
   location, needs_keyframe, dialogue),
 "QC_NOTES": str (what the grader should reward/punish for THIS format -
   state which artifacts are desired vs illusion-breaking),
 "TAPE_PRESET": one of %s (post signal path; "none" for clean cinematic),
 "TARGET_SHOTS": {"EP1": int},
 "SHOT_SECONDS": 8,
 "uses_characters": bool (true only if recurring cast requested/needed)
}""" % TAPE_PRESETS


def rails_active() -> bool:
    return os.environ.get("SYNTH_VIDEORAMA_RAILS", "on").lower() != "off"


def _looks_realistic(user_prompt: str, options: dict) -> bool:
    kw = ("news", "documentary", "cctv", "security", "surveillance", "bodycam",
          "dashcam", "archival", "found footage", "broadcast", "interview",
          "police", "military", "medical")
    return any(k in user_prompt.lower() for k in kw)


def write_brief(ai, user_prompt: str, options: dict) -> dict:
    """options: {clips:int, consistent_characters:bool, tape_preset:str|'auto',
    era:str|None}"""
    from scripts.film_factory.develop import _parse_json

    clips = max(4, min(int(options.get("clips", 30)), 120))
    aspect = options.get("aspect", "16:9")
    rails = [BASELINE_RULES]
    if rails_active() and _looks_realistic(user_prompt, options):
        rails.append(UNREALITY_RAIL)

    aspect_line = (
        "FRAMING: vertical 9:16 (phone/Snapchat/TikTok). Every veo_prompt and "
        "keyframe_prompt must describe a VERTICAL composition — subjects framed "
        "head-to-waist or full-body in a tall frame, action staged for a "
        "portrait crop, held-phone or selfie energy where it fits.\n"
        if aspect == "9:16" else "FRAMING: standard 16:9 landscape.\n")

    user = (
        f"USER IDEA:\n{user_prompt}\n\n"
        f"CLIP COUNT: exactly {clips} shots of 8 seconds "
        f"(TARGET_SHOTS must sum to {clips}).\n"
        + aspect_line +
        f"CONSISTENT RECURRING CHARACTERS: "
        f"{'YES - define 3-6 recurring characters with redrawable visual_desc' if options.get('consistent_characters') else 'NO - anonymous one-off people per clip, empty characters list'}.\n"
        f"POST SIGNAL PATH: "
        f"{'choose the best-fitting TAPE_PRESET yourself' if options.get('tape_preset', 'auto') == 'auto' else 'use TAPE_PRESET ' + options['tape_preset']}.\n"
        + (f"ERA: {options['era']}.\n" if options.get("era") else "")
        + "\n" + "\n\n".join(rails))

    last_err = None
    brief = None
    for attempt in range(3):
        prompt = user if attempt == 0 else (
            user + "\n\nIMPORTANT: your previous answer was not valid JSON "
            f"({last_err}). Return ONLY the JSON object, nothing else.")
        text = google_api.gen_text(
            ai.genai_client, config.MODEL_TEMPLATE_GEN,
            [google_api.text_block(prompt)],
            system_instruction=WRITER_SYS, json_mode=True)
        try:
            brief = _parse_json(text)
            break
        except (ValueError, __import__("json").JSONDecodeError) as e:
            last_err = str(e)[:200]
            logger.warning("brief JSON parse failed (attempt %d): %s", attempt + 1, last_err)
    if brief is None:
        raise RuntimeError(f"brief writer could not produce valid JSON: {last_err}")

    # normalize + enforce
    brief["SHOT_SECONDS"] = 8
    ts = brief.get("TARGET_SHOTS") or {"EP1": clips}
    total = sum(int(v) for v in ts.values()) or clips
    if total != clips:  # rescale to the requested count
        ts = {k: max(1, round(int(v) * clips / total)) for k, v in ts.items()}
        drift = clips - sum(ts.values())
        first = next(iter(ts))
        ts[first] += drift
    brief["TARGET_SHOTS"] = ts
    if brief.get("TAPE_PRESET") not in TAPE_PRESETS:
        brief["TAPE_PRESET"] = "vhs"
    if brief["TAPE_PRESET"] == "none":
        brief["TAPE_PRESET"] = None
    brief["_rails"] = {"baseline": True,
                      "unreality": rails_active() and _looks_realistic(user_prompt, options)}
    return brief


LIKENESS_PROMPT = """Does the person in this character reference sheet strongly
resemble a specific, identifiable real celebrity or public figure? Be strict -
"kind of looks like" a generic type is fine; a recognizable specific person is
not. Return ONLY JSON: {"resembles": true/false, "who": "name or empty",
"confidence": 0-10}"""


def likeness_check(ai, image_bytes: bytes) -> dict:
    """Screens an NB2 character sheet for real-person likeness before the
    sheet is allowed to drive hundreds of video generations."""
    from scripts.film_factory.develop import _parse_json
    try:
        text = google_api.gen_text(
            ai.genai_client, config.MODEL_FAST,
            [google_api.image_block(image_bytes),
             google_api.text_block(LIKENESS_PROMPT)],
            json_mode=True)
        out = _parse_json(text)
        return {"resembles": bool(out.get("resembles")),
                "who": str(out.get("who", ""))[:80],
                "confidence": float(out.get("confidence", 0))}
    except Exception as e:
        logger.warning("likeness check failed (fail-open): %s", e)
        return {"resembles": False, "who": "", "confidence": 0,
                "error": str(e)[:120]}
