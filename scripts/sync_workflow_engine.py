"""Keep the browser copy of the workflow engine in step with the Node original.

    python scripts/sync_workflow_engine.py          # rewrite static/synthograsizer/js/workflow-engine/ from workflow-engine/
    python scripts/sync_workflow_engine.py --check  # exit 1 and say which file is stale (what tests/test_workflow_engine_vendored.py does)

workflow-engine/ is the original (the chat server imports it as a package). The Synthograsizer's workflow runner loads a vendored copy in
the browser. The two had drifted (the browser copy lacked per-run media stores and owners, and the image model option), which is how a
feature added to one never reached the other. Four files are carried over; each edit made on the way is listed here and nowhere else:

  stylePresets.js, workflowTemplates.js   copied unchanged
  workflowEngine.js                       the bare 'uuid' import becomes './uuid.js' (a browser cannot resolve a bare specifier)
  synthClient.js                          base URL is same-origin ('') instead of localhost, and process.env is not read

Not synced, because they are browser-specific rewrites by design: uuid.js, urlGuard.js, workflowLibrary.js.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "workflow-engine"
DST = ROOT / "static" / "synthograsizer" / "js" / "workflow-engine"

ENGINE_HEADER = """// VENDORED COPY — see workflow-engine/workflowEngine.js for the original.
// The ONLY edit to this file is the import line below: a browser cannot resolve
// the bare 'uuid' specifier without an import map, so it points at a local shim
// exposing the same v4 export. workflowLibrary.js and urlGuard.js resolve to
// browser shims sitting alongside this file under the same module names, so
// they need no edit here. Keep this file otherwise byte-identical to the Node
// original so the two do not drift (scripts/sync_workflow_engine.py regenerates it).
import { v4 as uuidv4 } from './uuid.js';
"""

CLIENT_HEADER = """// VENDORED COPY — see workflow-engine/synthClient.js for the original.
// Two edits, both here at the top: the base URL defaults to same-origin ('')
// instead of a hardcoded localhost, and process.env is not read (it does not
// exist in a browser and would throw on construction). Everything below is
// unchanged (scripts/sync_workflow_engine.py regenerates it).
//
// Same-origin matters for more than convenience: the request then carries the
// user's session cookie, so every workflow step is metered, rate-limited and
// budget-checked by the normal middleware exactly like a Studio call. The
// client-side engine gets correct credit accounting for free rather than
// needing its own.
const DEFAULT_BASE_URL = '';
"""


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8").replace("\r\n", "\n")


def vendored_engine() -> str:
    text = read(SRC / "workflowEngine.js")
    first = "import { v4 as uuidv4 } from 'uuid';\n"
    if not text.startswith(first):
        raise SystemExit("workflowEngine.js no longer starts with the uuid import; update scripts/sync_workflow_engine.py")
    return ENGINE_HEADER + text[len(first):]


def vendored_client() -> str:
    text = read(SRC / "synthClient.js")
    base = "const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';\n"
    ctor = "    this._baseUrl = baseUrl || process.env.SYNTH_BACKEND_URL || DEFAULT_BASE_URL;\n"
    for needle in (base, ctor):
        if text.count(needle) != 1:
            raise SystemExit(f"synthClient.js changed around {needle.strip()!r}; update scripts/sync_workflow_engine.py")
    text = text.replace(base, CLIENT_HEADER).replace(ctor, "    this._baseUrl = baseUrl != null ? baseUrl : DEFAULT_BASE_URL;\n")
    return text


def targets() -> dict:
    return {
        "workflowEngine.js": vendored_engine(),
        "synthClient.js": vendored_client(),
        "stylePresets.js": read(SRC / "stylePresets.js"),
        "workflowTemplates.js": read(SRC / "workflowTemplates.js"),
    }


def stale() -> list:
    out = []
    for name, text in targets().items():
        path = DST / name
        if not path.exists() or read(path) != text:
            out.append(name)
    return out


def main(argv) -> int:
    if "--check" in argv:
        bad = stale()
        if bad:
            print("stale browser copies (run python scripts/sync_workflow_engine.py):", ", ".join(bad))
            return 1
        print("browser copies are up to date")
        return 0
    for name, text in targets().items():
        (DST / name).write_text(text, encoding="utf-8", newline="\n")
        print("wrote", DST / name)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
