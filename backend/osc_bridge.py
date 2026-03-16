"""OSC Bridge — forwards messages to Daydream Scope (or any OSC server) via UDP.

Uses python-osc's SimpleUDPClient.  The bridge is a singleton created at
import time with sensible defaults (localhost:52178).  FastAPI endpoints
call its methods; the frontend never talks UDP directly.
"""

import logging
from pythonosc.udp_client import SimpleUDPClient

logger = logging.getLogger(__name__)


class OSCBridge:
    def __init__(self, host: str = "127.0.0.1", port: int = 8000):
        self.host = host
        self.port = port
        self._client = SimpleUDPClient(host, port)

    # ── send helpers ──────────────────────────────────────────

    def send_prompt(self, prompt: str, address: str = "/scope/prompt") -> None:
        """Send a prompt string to the target OSC address."""
        logger.debug("OSC → %s:%d %s  %r", self.host, self.port, address, prompt[:80])
        self._client.send_message(address, prompt)

    def send_float(self, address: str, value: float) -> None:
        """Send a single float value (guidance_scale, delta, seed …)."""
        logger.debug("OSC → %s:%d %s  %f", self.host, self.port, address, value)
        self._client.send_message(address, value)

    def send_int(self, address: str, value: int) -> None:
        """Send a single int value."""
        logger.debug("OSC → %s:%d %s  %d", self.host, self.port, address, value)
        self._client.send_message(address, value)

    # ── reconfiguration ──────────────────────────────────────

    def update_config(self, host: str | None = None, port: int | None = None) -> None:
        """Change the target host/port and reconnect the UDP client."""
        if host is not None:
            self.host = host
        if port is not None:
            self.port = port
        self._client = SimpleUDPClient(self.host, self.port)
        logger.info("OSC target updated → %s:%d", self.host, self.port)

    def status(self) -> dict:
        """Return the current configuration as a JSON-friendly dict."""
        return {"host": self.host, "port": self.port}


# Module-level singleton — imported by server.py
osc_bridge = OSCBridge()
