"""Check every model id in backend/config.py against what the provider still serves.

Exists because nothing offline can tell you a model was retired. On
2026-09-22 `MODEL_IMAGE_GEN_NB2` and `MODEL_IMAGE_GEN_HQ` were found
pointing at `gemini-3.1-flash-image-preview` and `gemini-3-pro-image-preview`,
which Google had shut down on 2026-06-25 — three months of image generation
aimed at dead endpoints, with nothing failing until a user tried it. The test
suite cannot catch that (it asserts constants are classified and priced, not
that they exist upstream), so this is the piece that has to run on a schedule.

Usage:
  python scripts/check_model_ids.py            # report, exit 1 if any id is gone
  python scripts/check_model_ids.py --strict   # also fail on unverifiable ids
  python scripts/check_model_ids.py --json     # machine-readable, for CI

Needs GOOGLE_API_KEY / GEMINI_API_KEY (or ai_studio_config.json). `models.list`
is a metadata call — it generates nothing and costs nothing.

On false positives: `models.list` does not enumerate every family. If a
configured id is absent we only call it MISSING when the listing contains
*other* ids from the same family, which means the family is enumerated and
this one is genuinely not there. When the whole family is absent (the API
simply doesn't list it) the id is UNVERIFIABLE, and that is not a failure
unless you pass --strict. A checker that cries wolf gets muted, and a muted
checker is how you end up three months behind again.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import config  # noqa: E402

OK, MISSING, UNVERIFIABLE = "ok", "missing", "unverifiable"


def configured_models() -> dict[str, list[str]]:
    """{model id: [constant names pointing at it]}, in config declaration order.

    Several constants deliberately share an id (MODEL_FAST / MODEL_DEMO /
    MODEL_TEMPLATE_GEN_FAST are all one model today), so the report is keyed by
    id and names every constant that would be affected.
    """
    found: dict[str, list[str]] = {}
    for name in dir(config):
        if not name.startswith("MODEL_"):
            continue
        value = getattr(config, name)
        if isinstance(value, str) and value:
            found.setdefault(normalise(value), []).append(name)
    return {k: sorted(v) for k, v in sorted(found.items())}


def normalise(model_id: str) -> str:
    """config writes MODEL_MUSIC_REALTIME with a `models/` prefix; the listing
    returns every name that way. Compare without it."""
    return model_id.removeprefix("models/")


def family(model_id: str) -> str:
    """The part before the first version digit — gemini, veo, lyria, imagen."""
    return model_id.split("-", 1)[0]


def live_models(api_key: str) -> set[str]:
    from google import genai

    client = genai.Client(api_key=api_key)
    # query_base=True asks for the provider's own models rather than this
    # project's tuned ones, which is what a config id always refers to.
    return {normalise(m.name) for m in client.models.list(config={"query_base": True})
            if m.name}


def classify(configured: dict[str, list[str]], live: set[str]) -> list[dict]:
    families_listed = {family(m) for m in live}
    report = []
    for model_id, names in configured.items():
        if model_id in live:
            status, note = OK, ""
        elif family(model_id) not in families_listed:
            status = UNVERIFIABLE
            note = f"the provider's listing contains no {family(model_id)}-* models at all"
        else:
            status = MISSING
            note = "not in the provider's listing"
            # The exact shape of the 2026-06-25 shutdown: a preview id retired
            # once its GA twin landed. Worth naming, since it is the fix.
            if model_id.endswith("-preview") and model_id[: -len("-preview")] in live:
                note += f"; GA successor available: {model_id[: -len('-preview')]}"
        report.append({"model": model_id, "constants": names, "status": status, "note": note})
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--strict", action="store_true",
                        help="treat unverifiable ids as failures too")
    parser.add_argument("--json", action="store_true", help="emit JSON only")
    args = parser.parse_args()

    api_key = config.get_api_key()
    if not api_key:
        print("No API key configured (GOOGLE_API_KEY / GEMINI_API_KEY / "
              "ai_studio_config.json) — cannot check anything.", file=sys.stderr)
        return 2

    configured = configured_models()
    try:
        live = live_models(api_key)
    except Exception as exc:  # noqa: BLE001 — a listing failure is not a verdict
        print(f"Could not list models: {exc}", file=sys.stderr)
        return 2

    report = classify(configured, live)
    gone = [r for r in report if r["status"] == MISSING]
    unknown = [r for r in report if r["status"] == UNVERIFIABLE]

    if args.json:
        print(json.dumps({"checked": len(report), "missing": gone,
                          "unverifiable": unknown}, indent=2))
    else:
        width = max(len(r["model"]) for r in report)
        for r in report:
            mark = {OK: "ok  ", MISSING: "GONE", UNVERIFIABLE: "?   "}[r["status"]]
            line = f"  {mark} {r['model']:<{width}}  {', '.join(r['constants'])}"
            print(line + (f"\n         -> {r['note']}" if r["note"] else ""))
        print(f"\n{len(report)} ids checked against {len(live)} models the provider lists.")
        if gone:
            print(f"{len(gone)} NO LONGER SERVED — calls using them fail at runtime.")
        if unknown:
            print(f"{len(unknown)} could not be verified (family not enumerated).")

    if gone:
        return 1
    return 1 if (args.strict and unknown) else 0


if __name__ == "__main__":
    raise SystemExit(main())
