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


async def purge_service_db() -> dict:
    """Service-mode database housekeeping (no-op otherwise):

    - expired sessions go away,
    - generation-log rows past the retention window are deleted
      (privacy: metadata-only, but still not kept forever),
    - feedback older than 90 days is deleted,
    - orphaned reserves (a crash between reserve and settle leaves an old
      'failed' row whose charge was never refunded) are refunded after 15
      minutes — keeps the ledger-sum invariant honest,
    - storage orphans: a DSAR delete's GCS purge step logs and continues
      rather than blocking account deletion on a transient failure, so a
      users/{id}/ prefix can occasionally outlive its user row — swept here.
    """
    from backend.service import service_mode
    if not service_mode():
        return {}
    from backend.service import db
    pool = db.pool()
    summary = {}
    summary["sessions"] = await pool.fetchval(
        "WITH gone AS (DELETE FROM sessions WHERE expires_at <= now() RETURNING 1) "
        "SELECT COUNT(*) FROM gone")
    summary["generations"] = await pool.fetchval(
        "WITH gone AS (DELETE FROM generations "
        f"WHERE ts < now() - INTERVAL '{retention_days()} days' RETURNING 1) "
        "SELECT COUNT(*) FROM gone")
    summary["feedback"] = await pool.fetchval(
        "WITH gone AS (DELETE FROM feedback "
        "WHERE ts < now() - INTERVAL '90 days' RETURNING 1) "
        "SELECT COUNT(*) FROM gone")

    orphans = await pool.fetch(
        "SELECT id, user_id, credits FROM generations "
        "WHERE status = 'failed' AND credits > 0 AND user_id IS NOT NULL "
        "AND ts < now() - INTERVAL '15 minutes'")
    refunded = 0
    for row in orphans:
        balance = await pool.fetchval(
            "UPDATE users SET credits_balance = credits_balance + $1 "
            "WHERE id = $2 RETURNING credits_balance",
            row["credits"], row["user_id"])
        if balance is None:
            continue  # user deleted since
        await pool.execute(
            "INSERT INTO credit_ledger (user_id, delta, reason, balance_after, generation_id, note) "
            "VALUES ($1, $2, 'refund', $3, $4, 'orphaned reserve auto-refund')",
            row["user_id"], row["credits"], balance, row["id"])
        await pool.execute(
            "UPDATE generations SET status = 'refunded', error = 'orphaned_reserve' WHERE id = $1",
            row["id"])
        refunded += 1
    summary["orphan_refunds"] = refunded

    from backend.service import storage
    if storage.enabled():
        try:
            candidate_ids = storage.list_user_ids_with_objects()
        except Exception as e:
            logger.error("Storage orphan sweep: listing failed: %s", e)
            candidate_ids = []
        orphan_users = 0
        orphan_objects = 0
        for uid in candidate_ids:
            exists = await pool.fetchval("SELECT 1 FROM users WHERE id = $1", uid)
            if exists is None:
                try:
                    orphan_objects += storage.delete_prefix(f"users/{uid}/")
                    orphan_users += 1
                except Exception as e:
                    logger.error("Storage orphan sweep: purge failed for user %s: %s", uid, e)
        summary["storage_orphan_users"] = orphan_users
        summary["storage_orphan_objects"] = orphan_objects

    if any(summary.values()):
        logger.info("Service DB retention: %s", summary)
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
        try:
            await purge_service_db()
        except Exception as e:
            logger.error("Service DB retention failed: %s", e)
        await asyncio.sleep(3600)
