"""Stage 1 — DEVELOP: concept brief -> film bible + complete 8s shot list.

The brief is a pluggable module (scripts/film_factory/brief_<name>.py) exposing:
CONCEPT, STYLE_ANCHOR_BRIEF, CASTING, STRUCTURE_NOTES, SHOT_RULES,
TARGET_SHOTS, SHOT_SECONDS, and optionally QC_NOTES.

Pass 1 (showrunner): treatment, cast, locations, style anchor, act/scene grid.
Pass 2 (shot writer): per act, in scene batches, writes every shot's prompts.
Outputs: film.json, shots table, film_storyboard.json (suite Bespoke-Beat shape).
"""
import json
import logging
import re

from backend import config, google_api
from . import costs

log = logging.getLogger("filmfactory.develop")

MODEL = config.MODEL_TEMPLATE_GEN  # gemini-3.1-pro-preview

SHOWRUNNER_SYS = """You are the showrunner of a prestige AI-generated short
film. You answer ONLY with valid JSON matching the requested schema exactly.
Be wildly imaginative within the brief's rails. All characters and places are
fictional. Choose visually spectacular, culturally respectful specifics."""


def _shot_writer_sys(brief) -> str:
    return ("You are a shot-list writer for an AI-generated film shot entirely "
            f"in {brief.SHOT_SECONDS}-second clips with the Veo 3.1 video model. "
            "You answer ONLY with valid JSON matching the requested schema "
            "exactly.\n" + brief.SHOT_RULES)


def _parse_json(text: str) -> dict:
    """Best-effort JSON extraction: strip fences, find outermost object."""
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.MULTILINE).strip()
    start = t.find("{")
    if start < 0:
        raise ValueError("no JSON object in response")
    depth = 0
    in_str = esc = False
    for i in range(start, len(t)):
        c = t[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json.loads(t[start:i + 1])
    # models regularly drop trailing close-braces at the very end — repair
    if depth > 0 and not in_str:
        return json.loads(t[start:] + "}" * depth)
    raise ValueError("unbalanced JSON in response")


def _gen_json(ai, db, sys_prompt: str, user_prompt: str, item: str) -> dict:
    last_err = None
    for attempt in range(3):
        costs.assert_budget(db, costs.estimate(MODEL, 1))
        prompt = user_prompt if attempt == 0 else (
            user_prompt + "\n\nIMPORTANT: your previous answer was not valid "
            f"JSON ({last_err}). Return ONLY the JSON object, nothing else.")
        text = google_api.gen_text(
            ai.genai_client, MODEL, [google_api.text_block(prompt)],
            system_instruction=sys_prompt, json_mode=True)
        costs.charge(db, "develop", item, MODEL, 1)
        try:
            return _parse_json(text)
        except (ValueError, json.JSONDecodeError) as e:
            last_err = str(e)[:200]
            log.warning("JSON parse failed for %s (attempt %d): %s | len=%d tail=%r",
                        item, attempt + 1, last_err, len(text), text[-160:])
    raise RuntimeError(f"could not get valid JSON for {item}: {last_err}")


PASS1_SCHEMA = """{
 "title": str, "logline": str (<=40 words), "style_anchor": str (the reusable
 sentence, 30-45 words),
 "characters": [ {"id": snake_case str, "name": str, "role": str,
   "country": str, "discipline": str, "visual_desc": str (35-55 words: age,
   build, face, hair, skin tone, signature outfit + colors, one distinctive
   accessory - written so a video model can redraw them identically),
   "personality": str (<=25 words), "arc": str (<=25 words)} ] (may be []),
 "locations": [ {"id": snake_case str, "name": str,
   "visual_desc": str (30-50 words)} ],
 "acts": [ {"id": str, "title": str, "summary": str (<=60 words),
   "scenes": [ {"id": "S01".., "title": str, "intent": str (<=30 words:
     what this scene must accomplish), "location": location id,
     "characters": [character ids], "target_shots": int} ] } ]
}"""


def run(ai, db, brief):
    db.dirs()
    if getattr(brief, "QC_NOTES", None):
        db.set_meta("qc_notes_extra", brief.QC_NOTES)
    if getattr(brief, "TAPE_PRESET", None):
        db.set_meta("tape_preset", brief.TAPE_PRESET)
    db.set_meta("aspect", getattr(brief, "ASPECT", None) or "16:9")

    # ---------- pass 1: the bible ----------
    if not db.film().get("title"):
        targets = ", ".join(f"{k}: exactly {v} shots" for k, v in brief.TARGET_SHOTS.items())
        user = (f"{brief.CONCEPT}\n\n{brief.STYLE_ANCHOR_BRIEF}\n\n"
                f"Shot budget ({brief.SHOT_SECONDS}s per shot): {targets}. "
                f"{brief.STRUCTURE_NOTES} Scene target_shots must sum exactly "
                f"to each act's budget. {brief.CASTING}\n\n"
                f"Return JSON with this schema:\n{PASS1_SCHEMA}")
        film = _gen_json(ai, db, SHOWRUNNER_SYS, user, "pass1_bible")
        db.save_film(film)
        log.info("Film bible written: '%s' - %s", film.get("title"), film.get("logline"))
    else:
        film = db.film()
        log.info("Film bible already exists ('%s'), skipping pass 1", film.get("title"))

    for act in film.get("acts", []):
        _pass2_act(ai, db, brief, film, act)

    _export_storyboard(db, film, brief)

    total = db.fetchone("SELECT COUNT(*) FROM shots")[0]
    log.info("DEVELOP complete: %d shots, ~%d:%02d runtime, spend so far $%.2f",
             total, total * brief.SHOT_SECONDS // 60,
             total * brief.SHOT_SECONDS % 60, costs.spent(db))


def _pass2_act(ai, db, brief, film, act):
    """Write every missing shot for one act (resumable by shot-id existence)."""
    char_map = {c["id"]: c for c in film.get("characters", [])}
    loc_map = {l["id"]: l for l in film.get("locations", [])}
    seq = db.fetchone("SELECT COALESCE(MAX(seq), 0) FROM shots")[0]
    existing = {r[0] for r in db.fetchall("SELECT id FROM shots")}
    shot_writer_sys = _shot_writer_sys(brief)

    if True:  # keep original loop body's indentation contract
        scenes = act.get("scenes", [])
        BATCH = 5
        for bi in range(0, len(scenes), BATCH):
            batch = scenes[bi:bi + BATCH]
            todo = [s for s in batch
                    if f"{act['id']}_{s['id']}_01" not in existing]
            if not todo:
                continue
            ctx = {
                "film_title": film["title"],
                "style_anchor": film["style_anchor"],
                "characters": {cid: c["visual_desc"] for cid, c in char_map.items()},
                "character_names": {cid: c["name"] for cid, c in char_map.items()},
                "locations": {lid: l["visual_desc"] for lid, l in loc_map.items()},
                "act": {"id": act["id"], "title": act["title"], "summary": act["summary"]},
                "scenes": todo,
            }
            user = (
                "Write every shot for the scenes below. Return JSON: "
                '{"scenes": [{"id": scene id, "shots": [shot objects in order]}]}. '
                "Each scene MUST contain exactly its target_shots number of shots. "
                "Append the style_anchor sentence verbatim to the END of every "
                "veo_prompt (and keyframe_prompt when non-empty). When a character "
                "id from 'characters' appears in a shot, weave their visual_desc "
                "into the prompt (condense to ~25 words if needed, keeping "
                "identity markers).\n\nCONTEXT:\n" + json.dumps(ctx, ensure_ascii=False))
            item = f"pass2_{act['id']}_b{bi // BATCH + 1}"
            result = _gen_json(ai, db, shot_writer_sys, user, item)

            for scene_out in result.get("scenes", []):
                sid = scene_out.get("id")
                scene_meta = next((s for s in todo if s["id"] == sid), None)
                if scene_meta is None:
                    continue
                shots = scene_out.get("shots", [])
                want = scene_meta.get("target_shots", len(shots))
                if len(shots) != want:
                    log.warning("%s %s: wanted %d shots, got %d (keeping what we got)",
                                act["id"], sid, want, len(shots))
                for i, sh in enumerate(shots, 1):
                    seq += 1
                    shot_id = f"{act['id']}_{sid}_{i:02d}"
                    chars = [c for c in sh.get("characters", []) if c in char_map]
                    db.exec(
                        "INSERT OR IGNORE INTO shots (id, seq, act, scene, title, "
                        "duration, veo_prompt, keyframe_prompt, characters, "
                        "location, needs_keyframe) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                        (shot_id, seq, act["id"], sid,
                         str(sh.get("title", ""))[:80], brief.SHOT_SECONDS,
                         sh.get("veo_prompt", ""), sh.get("keyframe_prompt", ""),
                         json.dumps(chars), sh.get("location", ""),
                         1 if sh.get("needs_keyframe", True) else 0))
            n = db.fetchone("SELECT COUNT(*) FROM shots")[0]
            log.info("%s: %d shots in db after batch %d", act["id"], n, bi // BATCH + 1)

def _export_storyboard(db, film, brief):
    """Storyboard export (suite Bespoke-Beat schema)."""
    rows = db.fetchall(
        "SELECT id, act, title, veo_prompt, characters FROM shots ORDER BY seq")
    beats = [{"id": i + 1, "act": r[1], "shot": r[2], "prompt": r[3],
              "characters": json.loads(r[4])} for i, r in enumerate(rows)]
    storyboard = {"story": {
        "title": film.get("title", ""),
        "duration_seconds": len(beats) * brief.SHOT_SECONDS,
        "beat_duration_seconds": brief.SHOT_SECONDS,
        "anchors": {"world": film.get("logline", ""),
                    "style": film.get("style_anchor", "")},
        "characters": [{"id": c["id"], "name": c["name"], "anchors": c["visual_desc"]}
                       for c in film.get("characters", [])],
        "beats": beats}}
    (db.project_dir / "film_storyboard.json").write_text(
        json.dumps(storyboard, indent=2, ensure_ascii=False), encoding="utf-8")


EXTEND_SCHEMA = """{
 "id": str (ignored - server assigns), "title": str,
 "summary": str (<=60 words),
 "scenes": [ {"id": "S01"..., "title": str, "intent": str (<=30 words),
   "location": one EXISTING location id, "characters": [EXISTING character ids],
   "target_shots": int} ]
}"""


def extend(ai, db, brief, count: int, direction: str = ""):
    """Append COUNT new shots to a developed project as a new act (EXT{n}),
    reusing the existing cast and locations, then write the shots via the
    normal pass-2 machinery."""
    film = db.film()
    if not film.get("title"):
        raise SystemExit("run develop first")

    n = 1
    existing_acts = {a["id"] for a in film.get("acts", [])}
    while f"EXT{n}" in existing_acts:
        n += 1
    act_id = f"EXT{n}"

    ctx = {
        "title": film["title"], "logline": film.get("logline", ""),
        "style_anchor": film.get("style_anchor", ""),
        "characters": {c["id"]: c.get("personality", "") for c in film.get("characters", [])},
        "locations": {l["id"]: l["name"] for l in film.get("locations", [])},
        "existing_acts": [{"id": a["id"], "title": a.get("title", ""),
                           "summary": a.get("summary", "")} for a in film.get("acts", [])],
    }
    user = (f"This film already exists (context below). Write ONE new act that "
            f"adds exactly {count} more shots"
            + (f", following this direction: {direction}" if direction else "")
            + ". Reuse ONLY the existing character and location ids. Scene "
              f"target_shots must sum to exactly {count} (1-4 scenes).\n\n"
              f"CONTEXT:\n{json.dumps(ctx, ensure_ascii=False)}\n\n"
              f"Return JSON with this schema:\n{EXTEND_SCHEMA}")
    new_act = _gen_json(ai, db, SHOWRUNNER_SYS, user, f"extend_{act_id}")
    new_act["id"] = act_id
    ts = sum(int(s.get("target_shots", 0)) for s in new_act.get("scenes", []))
    if ts != count and new_act.get("scenes"):
        new_act["scenes"][0]["target_shots"] = \
            int(new_act["scenes"][0].get("target_shots", 0)) + (count - ts)

    film.setdefault("acts", []).append(new_act)
    db.save_film(film)
    _pass2_act(ai, db, brief, film, new_act)
    _export_storyboard(db, film, brief)
    total = db.fetchone("SELECT COUNT(*) FROM shots")[0]
    log.info("EXTEND complete: +%d shots requested (act %s), %d total, spend $%.2f",
             count, act_id, total, costs.spent(db))
