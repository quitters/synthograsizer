"""Briefs as data.

A brief is the creative contract the develop stage consumes. Historically a
Python module (brief_<name>.py); Videorama needs them as JSON so the suite can
generate, store, and edit them without code. Both forms resolve to the same
attribute namespace, so develop.py doesn't care which it got.

JSON schema (all strings unless noted):
{
  "name": str, "CONCEPT": str, "STYLE_ANCHOR_BRIEF": str, "CASTING": str,
  "STRUCTURE_NOTES": str, "SHOT_RULES": str, "QC_NOTES": str|null,
  "TAPE_PRESET": str|null, "TARGET_SHOTS": {act: int}, "SHOT_SECONDS": int
}
"""
import importlib
import json
from pathlib import Path
from types import SimpleNamespace

TEMPLATES_DIR = Path(__file__).parent / "templates"

FIELDS = ["CONCEPT", "STYLE_ANCHOR_BRIEF", "CASTING", "STRUCTURE_NOTES",
          "SHOT_RULES", "QC_NOTES", "TAPE_PRESET", "TARGET_SHOTS", "SHOT_SECONDS",
          "ASPECT"]


def from_dict(data: dict) -> SimpleNamespace:
    missing = [f for f in FIELDS[:6] if not data.get(f) and f != "QC_NOTES"]
    if missing:
        raise ValueError(f"brief missing required fields: {missing}")
    ns = SimpleNamespace()
    for f in FIELDS:
        setattr(ns, f, data.get(f))
    ns.SHOT_SECONDS = int(data.get("SHOT_SECONDS") or 8)
    ns.TARGET_SHOTS = {k: int(v) for k, v in (data.get("TARGET_SHOTS") or {"EP1": 30}).items()}
    ns.ASPECT = data.get("ASPECT") if data.get("ASPECT") in ("16:9", "9:16") else "16:9"
    ns.name = data.get("name", "custom")
    return ns


def module_to_dict(name: str) -> dict:
    mod = importlib.import_module(f".brief_{name}", package=__package__)
    d = {"name": name}
    for f in FIELDS:
        d[f] = getattr(mod, f, None)
    return d


def load(ref: str) -> SimpleNamespace:
    """Resolve a brief reference: path to .json, template name in templates/,
    or legacy python module name."""
    p = Path(ref)
    if ref.endswith(".json") and p.exists():
        return from_dict(json.loads(p.read_text(encoding="utf-8")))
    tpl = TEMPLATES_DIR / f"{ref}.json"
    if tpl.exists():
        return from_dict(json.loads(tpl.read_text(encoding="utf-8")))
    return from_dict(module_to_dict(ref))


def list_templates() -> list:
    out = []
    for p in sorted(TEMPLATES_DIR.glob("*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            concept = (d.get("CONCEPT") or "").strip()
            summary = next((ln[len("FORMAT:"):].strip() for ln in concept.splitlines()
                            if ln.startswith("FORMAT:")), concept[:160])
            out.append({"name": d.get("name", p.stem),
                        "tape_preset": d.get("TAPE_PRESET"),
                        "shots": sum((d.get("TARGET_SHOTS") or {"EP1": 30}).values()),
                        "summary": summary[:160],
                        "path": str(p)})
        except Exception:
            continue
    return out


def export_module_templates():
    """One-time: snapshot the six python briefs into templates/*.json."""
    TEMPLATES_DIR.mkdir(exist_ok=True)
    for name in ["art_olympics", "afv_resnick", "public_access",
                 "corporate_training", "mall_cctv", "news_remote"]:
        d = module_to_dict(name)
        (TEMPLATES_DIR / f"{name}.json").write_text(
            json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
        print("exported", name)


if __name__ == "__main__":
    export_module_templates()
