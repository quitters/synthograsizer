"""sketch-runtime.js: the frame timing the wall and the desk previews share.

Run in node, because it's the browser's own module under test. JSON turns a NaN
into null, so a NaN leaking out fails these comparisons too. Skipped, not
failed, where node isn't installed.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

_RUNTIME = Path(__file__).resolve().parent.parent / "static" / "thecommons" / "js" / "sketch-runtime.js"

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")


def _node(tmp_path, body):
    script = tmp_path / "run.mjs"
    script.write_text(
        "import { pathToFileURL } from 'node:url';\n"
        "const rt = await import(pathToFileURL(process.argv[2]).href);\n"
        f"console.log(JSON.stringify({body}));\n",
        encoding="utf-8")
    result = subprocess.run(["node", str(script), str(_RUNTIME)],
                            capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_dt_is_clamped_to_zero_through_a_tenth_of_a_second(tmp_path):
    out = _node(tmp_path, "{ max: rt.MAX_FRAME_DT, dts: [-5, -0.001, 0, 0.016, 0.1, 0.25, 37.5, 1e308,"
                          " Infinity, -Infinity, NaN].map(rt.clampFrameDt) }")
    assert out["max"] == 0.1
    assert out["dts"] == [0, 0, 0, 0.016, 0.1, 0.1, 0.1, 0.1, 0.1, 0, 0]


def test_the_wall_clock_never_reports_negative_or_huge_time(tmp_path):
    # Origin at 1000 ms. The first rAF timestamp is 3 ms EARLIER than it -- the
    # case that gave a generated piece a negative radius on its first frame.
    # Then a normal frame, thirty seconds in a background tab, and a timestamp
    # that goes backwards.
    frames = _node(tmp_path, "(() => { const tick = rt.frameClock(1000);"
                             " return [997, 1013.7, 31013.7, 31000, 31016].map((now) => tick(now)); })()")
    assert frames == [
        {"t": 0, "dt": pytest.approx(1 / 60)},                    # first frame: one 60 fps frame, not -3 ms
        {"t": pytest.approx(0.0137), "dt": pytest.approx(0.0167)},
        {"t": pytest.approx(30.0137), "dt": 0.1},                 # t is wall time; dt is not
        {"t": pytest.approx(30.0137), "dt": 0},                   # neither goes backwards
        {"t": pytest.approx(30.016), "dt": pytest.approx(0.016)},
    ]
