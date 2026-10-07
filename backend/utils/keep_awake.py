"""keep_awake: ask the operating system not to sleep while long work runs.

    from backend.utils.keep_awake import keep_awake, keeps_awake

    with keep_awake.hold("video render"):      # sync or async code; released on exit, even on an exception
        ...

    @keeps_awake("video generation")           # a function (sync or async) that holds for as long as it runs
    async def generate_video(...): ...

Why: on 2026-10-07 a laptop slept for about two hours in the middle of a batch. Time limits fired after two messages, a Veo call
reported 7,300 seconds and another failed with "Server disconnected". A render that takes minutes should hold the machine awake for
exactly as long as it runs and not a moment longer.

Holds are counted: the first one acquires, the last release lets go. Windows: SetThreadExecutionState(ES_CONTINUOUS |
ES_SYSTEM_REQUIRED) from a small daemon thread that lives as long as any hold (the state belongs to the thread that set it).
macOS: `caffeinate -i` bound to this process. Elsewhere it does nothing (a server in a data centre does not sleep).
SYNTH_KEEP_AWAKE=0 turns it off, and it is off under pytest. It never raises: a hold that cannot be taken is skipped.
The sibling for Node is workflow-engine/keepAwake.js; for the browser, static/synthograsizer/js/keep-awake.js.
"""
import contextlib
import functools
import inspect
import logging
import os
import subprocess
import sys
import threading

logger = logging.getLogger(__name__)

ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001


class _WindowsHold:
    """Sets the execution state from a thread that stays alive until released."""

    def __init__(self, set_state=None):
        if set_state is None:
            import ctypes
            set_state = ctypes.windll.kernel32.SetThreadExecutionState
        self._set_state = set_state
        self._stop = threading.Event()
        self._ready = threading.Event()
        self._thread = threading.Thread(target=self._run, name="keep-awake", daemon=True)
        self._thread.start()
        self._ready.wait(2)

    def _run(self):
        try:
            self._set_state(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
        finally:
            self._ready.set()
        self._stop.wait()
        self._set_state(ES_CONTINUOUS)

    def release(self):
        self._stop.set()
        self._thread.join(2)


class _ProcessHold:
    """A helper process (caffeinate) that holds the machine awake until it is killed or this process ends."""

    def __init__(self, command, popen=subprocess.Popen):
        self._proc = popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def release(self):
        try:
            self._proc.terminate()
        except Exception:  # noqa: BLE001 - already gone
            pass


def _default_hold_factory(platform):
    if platform.startswith("win"):
        return _WindowsHold
    if platform == "darwin":
        return lambda: _ProcessHold(["caffeinate", "-i", "-w", str(os.getpid())])
    return None


class KeepAwake:
    def __init__(self, hold_factory=None, enabled=None, platform=sys.platform):
        self._factory = hold_factory if hold_factory is not None else _default_hold_factory(platform)
        self._enabled = enabled
        self._lock = threading.Lock()
        self._holds = 0
        self._hold = None

    def _is_enabled(self) -> bool:
        if self._enabled is not None:
            return self._enabled
        return os.environ.get("SYNTH_KEEP_AWAKE") != "0" and "PYTEST_CURRENT_TEST" not in os.environ

    def status(self) -> dict:
        return {"holds": self._holds, "held": self._hold is not None}

    def _acquire(self):
        with self._lock:
            self._holds += 1
            if self._holds == 1 and self._factory is not None:
                try:
                    self._hold = self._factory()
                except Exception:  # noqa: BLE001 - never stop the work for want of a hold
                    logger.debug("keep-awake hold could not be taken", exc_info=True)
                    self._hold = None

    def _release(self):
        with self._lock:
            self._holds = max(0, self._holds - 1)
            if self._holds == 0 and self._hold is not None:
                try:
                    self._hold.release()
                except Exception:  # noqa: BLE001
                    logger.debug("keep-awake hold could not be released", exc_info=True)
                self._hold = None

    @contextlib.contextmanager
    def hold(self, reason: str = ""):
        if not self._is_enabled():
            yield
            return
        self._acquire()
        try:
            yield
        finally:
            self._release()


keep_awake = KeepAwake()


def keeps_awake(reason: str = "", manager: KeepAwake = None):
    """Decorator: the wrapped function (sync or async) holds the machine awake for as long as it runs."""

    def wrap(fn):
        if inspect.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def inner(*args, **kwargs):
                with (manager or keep_awake).hold(reason or fn.__name__):
                    return await fn(*args, **kwargs)
        else:
            @functools.wraps(fn)
            def inner(*args, **kwargs):
                with (manager or keep_awake).hold(reason or fn.__name__):
                    return fn(*args, **kwargs)
        return inner

    return wrap
