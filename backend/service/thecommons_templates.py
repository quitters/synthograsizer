"""The Commons — inherited p5.js template library.

Direct port of TheCommons' server/templates.js. These are INHERITED content,
pulled verbatim from synthograsizer-suite's own p5.js template set (each
file's own `tags` field records further provenance). Everything that RUNS
these templates (the relay, the WS display/station protocol, the p5 adapter)
is new; the JSON template bodies themselves are copied as-is into
backend/service/thecommons_data/templates/ so they ship inside the Cloud Run
image (the Dockerfile only COPYs backend/, static/, scripts/).

One template is excluded from the auto-picked pool: it uses a non-default p5
renderer mode (SVG) the display runtime doesn't special-case yet.
"""

import json
import random
import re
from pathlib import Path

_EXCLUDED = {"svg-flow-particles"}
_TEMPLATES_DIR = Path(__file__).parent / "thecommons_data" / "templates"

_cache: list[dict] | None = None


def _title_case(filename: str) -> str:
    stem = re.sub(r"\.json$", "", filename)
    stem = re.sub(r"[-_]+", " ", stem)
    return re.sub(r"\b\w", lambda m: m.group(0).upper(), stem)


def _normalize_variables(variables: list[dict] | None) -> list[dict]:
    out = []
    for v in variables or []:
        out.append({
            "name": v.get("name"),
            "label": v.get("label") or v.get("feature_name") or _title_case(v.get("name", "")),
            "values": v.get("values") or [],
        })
    return out


def load_template_library() -> list[dict]:
    global _cache
    if _cache is not None:
        return _cache
    templates = []
    for path in sorted(_TEMPLATES_DIR.glob("*.json")):
        stem = path.stem
        if stem in _EXCLUDED:
            continue
        raw = json.loads(path.read_text(encoding="utf-8"))
        p5_code = raw.get("p5Code")
        if not isinstance(p5_code, str) or not p5_code:
            continue
        templates.append({
            "id": stem,
            "name": _title_case(path.name),
            "promptTemplate": raw.get("promptTemplate", ""),
            "variables": _normalize_variables(raw.get("variables")),
            "p5Code": p5_code,
            "source": "inherited from synthograsizer-suite's template library",
        })
    _cache = templates
    return _cache


def random_template() -> dict:
    library = load_template_library()
    return random.choice(library)
