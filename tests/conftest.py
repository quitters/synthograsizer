"""Shared pytest fixtures and path setup for the synthograsizer-suite test suite.

The backend package is imported as `backend.*` (absolute imports), so we
ensure the project root is on sys.path before tests run. This lets tests
execute from any working directory without an editable install.
"""
import asyncio
import sys
from pathlib import Path

import pytest
from starlette.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ── Background Commons jobs need an event loop that outlives the request ─────
# `thecommons_jobs.start` dispatches the work as a bare `asyncio.create_task`
# and returns 202, exactly like the Node original. Starlette's TestClient,
# when its context manager has *not* been entered, builds a throwaway blocking
# portal per request and tears its event loop down as soon as the response
# comes back — which cancels that task wherever it happens to be suspended,
# and `generate()` always suspends at least once (it awaits `asyncio.to_thread`
# for the model call).
#
# A cancelled `_run_job` skips both of its status UPDATEs (CancelledError is a
# BaseException, so the `except Exception` arm never sees it) but still runs
# its `finally`, so the job row stays 'generating' while the reservation is
# refunded. Whether that happened came down to whether the task got enough
# loop time before teardown, which is why tests for this passed alone and
# failed roughly one run in four inside a bigger batch.
#
# The protection is applied here, to every module, rather than offered as a
# fixture each module has to remember: the failure mode is silent, so opt-in
# was the wrong default. `_module_client` finds the module-level `client` that
# every HTTP module in this suite declares and keeps it entered, so a new test
# file is covered by existing. A module that builds its client somewhere else
# (a fixture, a local) is not seen — such a module should enter it itself and
# call `drain_commons_jobs` before asserting on a finished job.
#
# This does not excuse a test from waiting: asserting on a job's outcome still
# needs `drain_commons_jobs(client)`. What it removes is the silent, racy
# version of forgetting — the failure is now a deterministic "never settled"
# rather than a charge quietly refunded behind your back.


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

    Runs inside the client's own loop, so the client must be entered — which
    `_module_client` below does for any module-level `client`.
    """
    client.portal.call(_drain_commons_jobs)


@pytest.fixture(scope="module")
def _module_client(request):
    client = getattr(request.module, "client", None)
    if not isinstance(client, TestClient):
        yield None
        return
    with client:  # one portal, one loop, shared by every test in the module
        yield client


@pytest.fixture(autouse=True)
def _commons_jobs_settle(_module_client, monkeypatch):
    """Drain the jobs a test started before the next test begins.

    Takes `monkeypatch` so it is set up after it and torn down before it: the
    drain has to run while the test's provider stubs are still installed, or a
    job still in flight would reach the real provider.
    """
    yield
    if _module_client is not None:
        drain_commons_jobs(_module_client)
