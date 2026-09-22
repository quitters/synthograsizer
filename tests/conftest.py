"""Shared pytest fixtures and path setup for the synthograsizer-suite test suite.

The backend package is imported as `backend.*` (absolute imports), so we
ensure the project root is on sys.path before tests run. This lets tests
execute from any working directory without an editable install.
"""
import asyncio
import contextlib
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ── Background Commons jobs need an event loop that outlives the request ─────
# `thecommons_jobs.start` dispatches the work as a bare `asyncio.create_task`
# and returns 202 immediately, exactly like the Node original. Starlette's
# TestClient, when its context manager has *not* been entered, builds a
# throwaway blocking portal per request and tears its event loop down as soon
# as the response comes back — which cancels that task wherever it happens to
# be suspended, and `generate()` always suspends at least once (it awaits
# `asyncio.to_thread` for the model call).
#
# A cancelled `_run_job` skips both of its status UPDATEs (CancelledError is a
# BaseException, so the `except Exception` arm never sees it) but still runs
# its `finally`, so the job row stays 'generating' while the reservation is
# refunded. Whether that happened came down to whether the task got enough
# loop time before teardown, which is why these tests passed alone and failed
# roughly one run in four inside a bigger batch.
#
# `commons_job_loop` gives a test one long-lived loop for all its requests and
# drains every outstanding job before the loop goes away, so completion is
# waited for rather than raced against.
async def _drain_commons_jobs() -> None:
    from backend.service import thecommons_jobs
    # Waits on the tasks that are still running rather than on the set
    # emptying: `start` drops a finished task from `_background_tasks` via a
    # done-callback, and a callback the loop has scheduled but not yet run
    # would leave a finished task in the set and spin this loop forever.
    while True:
        running = [t for t in list(thecommons_jobs._background_tasks) if not t.done()]
        if not running:
            return
        await asyncio.wait(running)


def drain_commons_jobs(client) -> None:
    """Block until every in-flight Commons job has finished and settled.

    Runs inside the client's own loop, so it is only usable under
    `commons_job_loop`.
    """
    client.portal.call(_drain_commons_jobs)


@contextlib.contextmanager
def commons_job_loop(client):
    with client:  # one portal, one loop, reused by every request in the test
        try:
            yield
        finally:
            drain_commons_jobs(client)
