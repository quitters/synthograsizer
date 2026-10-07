"""The browser copy of the workflow engine (static/synthograsizer/js/workflow-engine/) must be what scripts/sync_workflow_engine.py makes
from the Node original (workflow-engine/). They had drifted once; a feature added to one never reached the other."""
import importlib.util
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load_sync():
    spec = importlib.util.spec_from_file_location("sync_workflow_engine", ROOT / "scripts" / "sync_workflow_engine.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_browser_copy_is_up_to_date():
    stale = _load_sync().stale()
    assert not stale, f"stale browser copies {stale}: run python scripts/sync_workflow_engine.py"


@pytest.mark.skipif(not shutil.which("node"), reason="node not installed")
def test_workflow_engine_node_tests_pass():
    result = subprocess.run(["node", "--test", "tests/media.test.mjs"], cwd=ROOT / "workflow-engine", capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout[-1500:] + result.stderr[-500:]
