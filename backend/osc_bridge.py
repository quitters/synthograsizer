"""OSC Bridge — forwards messages to Daydream Scope (or any OSC server) via UDP.

Uses python-osc's SimpleUDPClient.  The bridge is a singleton created at
import time with sensible defaults (localhost:9000 — Scope's default OSC port).
FastAPI endpoints call its methods; the browser never talks UDP directly.
"""

import logging
import urllib.request
import json

from pythonosc.udp_client import SimpleUDPClient

logger = logging.getLogger(__name__)

# Default Scope URL for auto-discovery
DEFAULT_SCOPE_URL = "http://127.0.0.1:7860"


class OSCBridge:
    def __init__(self, host: str = "127.0.0.1", port: int = 9000):
        self.host = host
        self.port = port
        self._client = SimpleUDPClient(host, port)
        self.scope_url = DEFAULT_SCOPE_URL
        self._scope_healthy = False

    # ── send helpers ──────────────────────────────────────────

    def send_prompt(self, prompt: str, address: str = "/prompts") -> None:
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

    def send_string(self, address: str, value: str) -> None:
        """Send a string value to an arbitrary OSC address."""
        logger.debug("OSC → %s:%d %s  %r", self.host, self.port, address, value[:80])
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

    # ── auto-discovery ────────────────────────────────────────

    def discover_scope(self, scope_url: str | None = None) -> dict:
        """Probe Scope's /health endpoint to check if it's running.

        Returns a dict with { healthy, scopeUrl, oscHost, oscPort }.
        """
        url = (scope_url or self.scope_url).rstrip("/")
        result = {
            "healthy": False,
            "scopeUrl": url,
            "oscHost": self.host,
            "oscPort": self.port,
        }

        try:
            req = urllib.request.Request(f"{url}/health", method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    result["healthy"] = True
                    self._scope_healthy = True
                    self.scope_url = url
                    logger.info("Scope discovered at %s", url)
        except Exception as e:
            logger.debug("Scope not found at %s: %s", url, e)
            self._scope_healthy = False

        return result

    def status(self) -> dict:
        """Return the current configuration as a JSON-friendly dict."""
        return {
            "host": self.host,
            "port": self.port,
            "scopeUrl": self.scope_url,
            "scopeHealthy": self._scope_healthy,
        }


# Module-level singleton — imported by server.py
osc_bridge = OSCBridge()
