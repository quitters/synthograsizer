"""backend/utils/keep_awake.py: counted holds, safe misuse, per-platform defaults, and the long jobs that use it."""
import asyncio
import inspect
import sys

import pytest

from backend.utils import keep_awake as ka


class FakeHold:
    made = []

    def __init__(self):
        self.released = False
        FakeHold.made.append(self)

    def release(self):
        self.released = True


@pytest.fixture(autouse=True)
def _reset():
    FakeHold.made = []


def manager(**kw):
    return ka.KeepAwake(hold_factory=FakeHold, enabled=True, **kw)


def test_first_hold_acquires_last_release_lets_go():
    m = manager()
    with m.hold("a"):
        with m.hold("b"):
            assert len(FakeHold.made) == 1
            assert m.status() == {"holds": 2, "held": True}
        assert not FakeHold.made[0].released
    assert FakeHold.made[0].released
    assert m.status() == {"holds": 0, "held": False}
    with m.hold("again"):
        pass
    assert len(FakeHold.made) == 2


def test_an_exception_still_releases():
    m = manager()
    with pytest.raises(RuntimeError):
        with m.hold("x"):
            raise RuntimeError("boom")
    assert FakeHold.made[0].released and m.status()["holds"] == 0


def test_a_hold_that_cannot_be_taken_never_stops_the_work():
    def broken():
        raise OSError("no helper")
    m = ka.KeepAwake(hold_factory=broken, enabled=True)
    with m.hold("x"):
        assert m.status()["held"] is False
    assert m.status()["holds"] == 0


def test_disabled_does_nothing():
    m = ka.KeepAwake(hold_factory=FakeHold, enabled=False)
    with m.hold("x"):
        pass
    assert FakeHold.made == []


def test_off_under_pytest_and_by_environment(monkeypatch):
    m = ka.KeepAwake(hold_factory=FakeHold)   # enabled=None: decided by the environment
    assert "PYTEST_CURRENT_TEST" in __import__("os").environ
    with m.hold("x"):
        pass
    assert FakeHold.made == []
    monkeypatch.delenv("PYTEST_CURRENT_TEST")
    monkeypatch.setenv("SYNTH_KEEP_AWAKE", "0")
    with m.hold("x"):
        pass
    assert FakeHold.made == []
    monkeypatch.delenv("SYNTH_KEEP_AWAKE")
    with m.hold("x"):
        assert len(FakeHold.made) == 1


def test_decorator_holds_for_sync_and_async_functions_and_keeps_the_signature():
    m = manager()
    seen = []

    @ka.keeps_awake("sync job", manager=m)
    def work(a, b=2):
        seen.append(m.status()["holds"])
        return a + b

    @ka.keeps_awake("async job", manager=m)
    async def awork(a, *, b=3):
        seen.append(m.status()["holds"])
        await asyncio.sleep(0)
        return a * b

    assert work(1) == 3
    assert asyncio.run(awork(2)) == 6
    assert seen == [1, 1]
    assert m.status()["holds"] == 0
    assert inspect.iscoroutinefunction(awork)
    assert list(inspect.signature(work).parameters) == ["a", "b"]


def test_platform_defaults():
    assert ka._default_hold_factory("linux") is None
    assert ka._default_hold_factory("win32") is ka._WindowsHold
    assert ka._default_hold_factory("darwin") is not None


def test_windows_hold_sets_and_clears_the_execution_state():
    calls = []
    hold = ka._WindowsHold(set_state=lambda flags: calls.append(flags) or 1)
    assert calls == [ka.ES_CONTINUOUS | ka.ES_SYSTEM_REQUIRED]
    hold.release()
    assert calls == [ka.ES_CONTINUOUS | ka.ES_SYSTEM_REQUIRED, ka.ES_CONTINUOUS]


@pytest.mark.skipif(not sys.platform.startswith("win"), reason="Windows only")
def test_real_windows_hold_takes_and_lets_go():
    hold = ka._WindowsHold()
    hold.release()


def test_process_hold_terminates_its_helper():
    class P:
        terminated = False

        def terminate(self):
            self.terminated = True
    proc = P()
    hold = ka._ProcessHold(["caffeinate"], popen=lambda *a, **k: proc)
    hold.release()
    assert proc.terminated


def test_the_long_jobs_hold():
    from backend.services import video_gen
    from backend.routers import music
    assert getattr(video_gen.generate_video, "__wrapped__", None) is not None
    assert getattr(music.ws_music, "__wrapped__", None) is not None
