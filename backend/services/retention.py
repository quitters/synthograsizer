"""Retention purge — hosted-mode housekeeping.

Deletes generated artifacts older than RETENTION_DAYS from the output
directories (Images / Videos / JSON) and the feedback store. Runs as an
hourly background task started by server.py, and ONLY when the instance is
hosted (SYNTH_HOSTED=1): a solo operator's local outputs are their own
archive and are never touched.

Privacy rationale (compliance roadmap §3.1 principle 5, GDPR storage
limitation): a hosted demo shouldn't accumulate visitors' generations
indefinitely.
"""

import logging
import os
import time
from pathlib import Path

from backend import config
from backend.policy import is_hosted

logger = logging.getLogger(__name__)

DEFAULT_RETENTION_DAYS = 30


def retention_days() -> int:
    try:
        return max(1, int(os.environ.get("RETENTION_DAYS", DEFAULT_RETENTION_DAYS)))
    except ValueError:
        return DEFAULT_RETENTION_DAYS


def _purge_dir(root: Path, cutoff_ts: float) -> int:
    """Delete files under root older than cutoff. Returns count removed."""
    if not root.exists():
        return 0
    removed = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        try:
            if path.stat().st_mtime < cutoff_ts:
                path.unlink()
                removed += 1
        except OSError as e:
            logger.warning("Retention: could not remove %s: %s", path, e)
    return removed


def purge_old_outputs(days: int = None) -> dict:
    """Purge artifacts older than `days`. Returns a per-target count summary."""
    days = days or retention_days()
    cutoff = time.time() - days * 86400

    feedback_dir = Path(__file__).resolve().parent.parent.parent / "data" / "feedback"
    targets = {
        "images": config.OUTPUT_IMAGES_DIR,
        "videos": config.OUTPUT_VIDEOS_DIR,
        "json": config.OUTPUT_JSON_DIR,
        "feedback": feedback_dir,
    }
    summary = {}
    for name, root in targets.items():
        summary[name] = _purge_dir(Path(root), cutoff)
    total = sum(summary.values())
    if total:
        logger.info("Retention purge (>%sd): removed %s file(s) %s", days, total, summary)
    return summary


async def retention_loop():
    """Hourly purge loop — started from server.py only when hosted."""
    import asyncio
    if not is_hosted():
        return
    logger.info("Retention loop active (hosted mode, %s-day window)", retention_days())
    while True:
        try:
            purge_old_outputs()
        except Exception as e:  # never let housekeeping kill the server
            logger.error("Retention purge failed: %s", e)
        await asyncio.sleep(3600)
