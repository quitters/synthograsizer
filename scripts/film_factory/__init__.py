"""Film Factory — batch film production pipeline on the Synthograsizer backend.

Stages: develop -> bible -> keyframes -> render -> assemble.
State lives in <project_dir>/film.db (SQLite); every paid API call is
estimated into the ledger and stopped by a hard budget cap.

Run from anywhere:  python -m scripts.film_factory <command> [options]
"""
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

_bootstrapped = False


def bootstrap(project_dir: Path):
    """Make backend imports + ai_studio_config.json resolution work, then
    defang the parts of the suite that would write to the C: Desktop."""
    global _bootstrapped
    if _bootstrapped:
        return
    # backend.config reads OUTPUT dir env at import time; point it into the
    # project so any stray save lands on the big drive, not Desktop.
    os.environ.setdefault("SYNTHOGRASIZER_OUTPUT_DIR", str(project_dir / "_raw"))
    os.chdir(REPO_ROOT)  # ai_studio_config.json + .env are CWD-relative
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))

    import backend.config as bconfig
    from backend.ai_manager import ai_manager

    if not ai_manager.genai_client:
        raise SystemExit("No Google API key found (env or ai_studio_config.json).")

    # The pipeline writes its own files; suppress the duplicate Desktop copies.
    ai_manager.save_output = lambda *a, **k: None
    # Veo queues can exceed the suite's 300s default under sustained load.
    bconfig.VIDEO_POLL_TIMEOUT_SECONDS = 900
    _bootstrapped = True
    return ai_manager
