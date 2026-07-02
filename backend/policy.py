"""Backend-tier and safety policy — single source of truth.

Owns three pieces of state and the rules around them:

1. **Backend tier** — which engine serves *text* generation:
     - ``google`` (default): Google GenAI APIs. Google's safety filters and
       Prohibited Use Policy apply contractually.
     - ``local``: an OpenAI-compatible local endpoint (Ollama, LM Studio).
       The app imposes no content filters of its own — user discretion under
       the Terms (§6 acceptable-use floor).
   Image / video / music / multimodal calls remain Google-only in v1
   (mixed-mode): the tier only reroutes text.

2. **Safety defaults** — the Google ``safety_settings`` baseline, adjustable
   by the operator within whatever Google's API permits. Precedence:
   per-request settings > saved operator defaults > ``BASELINE_SAFETY``.
   Thresholds pass through as strings — Google's API is the arbiter of
   permitted values; its 400s surface verbatim. We never enumerate-and-reject
   here, so the panel can't drift out of sync with the API.

3. **Hosted mode** — ``SYNTH_HOSTED=1`` (or running on Vercel) pins the tier
   to ``google``, rejects config mutations (the instance operator manages
   configuration via environment), and clamps per-request safety to the
   saved defaults so anonymous visitors can't lower thresholds on the
   operator's API key.

State persists in ``ai_studio_config.json`` at the project root (alongside
the legacy API key), resolved explicitly so behavior doesn't depend on the
launch directory.
"""

import ipaddress
import json
import logging
import os
import socket
import threading
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

TIER_GOOGLE = "google"
TIER_LOCAL = "local"
VALID_TIERS = (TIER_GOOGLE, TIER_LOCAL)

# Which Google API serves Gemini-model calls (text / vision / gemini image gen):
#   - "interactions" (default): the Interactions API (interactions.create).
#     No per-category safety thresholds exist there — Google-managed filtering
#     applies. Every call is sent with store=False (no server-side retention).
#   - "legacy": generateContent — still fully supported by Google; honors the
#     operator's safety_settings thresholds. Doubles as a wholesale behavioral
#     rollback switch for the Interactions migration.
# Veo / Imagen / Lyria are not covered by the Interactions API and always use
# their dedicated endpoints regardless of this mode.
GOOGLE_API_INTERACTIONS = "interactions"
GOOGLE_API_LEGACY = "legacy"
VALID_GOOGLE_APIS = (GOOGLE_API_INTERACTIONS, GOOGLE_API_LEGACY)

DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/v1"   # Ollama's OpenAI-compatible mount
DEFAULT_LOCAL_MODEL = "llama3.1"

# Permissive baseline — moved verbatim from services/image_gen.py so image
# and text paths share one definition. "Permissive" here means Google's
# lightest *selectable* blocking tier, not "off": Google's non-negotiable
# filters always apply upstream of these knobs.
BASELINE_SAFETY: List[Dict[str, str]] = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
    {"category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "BLOCK_ONLY_HIGH"},
]

# Project root = parent of backend/ — explicit, so the config file lands in
# the same place regardless of the CWD the server was launched from.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "ai_studio_config.json"

_lock = threading.Lock()


def is_hosted() -> bool:
    """True when this instance serves people other than its operator."""
    return os.environ.get("SYNTH_HOSTED") == "1" or bool(os.environ.get("VERCEL"))


def _assert_private_host(url: str) -> None:
    """Require the local-backend URL to point at this machine or the LAN.

    A local OpenAI-compatible endpoint lives on loopback or a private network
    (Ollama on this box, LM Studio on the workstation next door). Public
    hosts are rejected — both because that's not "local inference" and
    because the /api/backend/local/models proxy would otherwise be a
    server-side fetch of an arbitrary public URL. Validation runs at
    config-save time (an operator action), not per request.
    """
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        raise ValueError("local_base_url has no hostname")
    if host.lower() in ("localhost",) or host.lower().endswith(".local"):
        return
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_loopback or ip.is_private or ip.is_link_local:
            return
        raise ValueError(
            f"local_base_url host {host} is a public IP — the local backend "
            "must be on loopback or a private network."
        )
    except ValueError as exc:
        if "public IP" in str(exc):
            raise
        # Not an IP literal — resolve the hostname and require every result
        # to be loopback/private.
        try:
            infos = socket.getaddrinfo(host, None)
        except socket.gaierror as dns_exc:
            raise ValueError(
                f"Could not resolve local_base_url host {host!r}: {dns_exc}"
            ) from dns_exc
        for info in infos:
            addr = ipaddress.ip_address(info[4][0])
            if not (addr.is_loopback or addr.is_private or addr.is_link_local):
                raise ValueError(
                    f"local_base_url host {host} resolves to public address "
                    f"{addr} — the local backend must be on loopback or a "
                    "private network."
                )


def _read_config_file() -> dict:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f) or {}
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Could not read %s: %s", CONFIG_PATH, exc)
    return {}


class Policy:
    """Mutable policy state + the invariants around it."""

    def __init__(self):
        self._tier: str = TIER_GOOGLE
        self._local_base_url: str = DEFAULT_LOCAL_BASE_URL
        self._local_model: str = DEFAULT_LOCAL_MODEL
        self._safety_defaults: Optional[List[Dict[str, str]]] = None
        self._google_api_mode: str = GOOGLE_API_INTERACTIONS
        self.load()

    # ── persistence ──────────────────────────────────────────────────────

    def load(self) -> None:
        data = _read_config_file()
        backend = data.get("backend") or {}
        tier = backend.get("tier")
        self._tier = tier if tier in VALID_TIERS else TIER_GOOGLE
        self._local_base_url = backend.get("local_base_url") or DEFAULT_LOCAL_BASE_URL
        self._local_model = backend.get("local_model") or DEFAULT_LOCAL_MODEL
        saved_safety = backend.get("safety_defaults")
        self._safety_defaults = saved_safety if self._valid_safety_shape(saved_safety) else None
        api_mode = backend.get("google_api_mode")
        self._google_api_mode = (
            api_mode if api_mode in VALID_GOOGLE_APIS else GOOGLE_API_INTERACTIONS
        )

    def save(self) -> None:
        """Merge policy state into the shared config file (key preserved)."""
        if os.environ.get("VERCEL"):
            return  # read-only filesystem; hosted state comes from env anyway
        with _lock:
            data = _read_config_file()
            data["backend"] = {
                "tier": self._tier,
                "local_base_url": self._local_base_url,
                "local_model": self._local_model,
                "safety_defaults": self._safety_defaults,
                "google_api_mode": self._google_api_mode,
            }
            try:
                with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
            except OSError as exc:
                logger.warning("Could not persist policy to %s: %s", CONFIG_PATH, exc)

    # ── validation ───────────────────────────────────────────────────────

    @staticmethod
    def _valid_safety_shape(settings) -> bool:
        """Shape check only — category/threshold must be non-empty strings.

        Deliberately NOT a whitelist of values: Google's API decides what
        thresholds are permitted, and its errors surface verbatim.
        """
        if not isinstance(settings, list) or not settings:
            return False
        for s in settings:
            if not isinstance(s, dict):
                return False
            if not (isinstance(s.get("category"), str) and s["category"].strip()):
                return False
            if not (isinstance(s.get("threshold"), str) and s["threshold"].strip()):
                return False
        return True

    # ── tier ─────────────────────────────────────────────────────────────

    def effective_tier(self) -> str:
        """Hosted instances are always pinned to Google."""
        if is_hosted():
            return TIER_GOOGLE
        return self._tier

    def effective_google_api(self) -> str:
        """Which Google API serves Gemini-model calls right now.

        Hosted instances take the mode from the environment
        (``SYNTH_GOOGLE_API``) so anonymous visitors can't switch APIs on
        the operator's key; unset or invalid values mean Interactions.
        """
        if is_hosted():
            env_mode = os.environ.get("SYNTH_GOOGLE_API", "")
            return env_mode if env_mode in VALID_GOOGLE_APIS else GOOGLE_API_INTERACTIONS
        return self._google_api_mode

    @property
    def local_base_url(self) -> str:
        return self._local_base_url

    @property
    def local_model(self) -> str:
        return self._local_model

    @property
    def saved_safety_defaults(self) -> Optional[List[Dict[str, str]]]:
        return self._safety_defaults

    # ── safety resolution ────────────────────────────────────────────────

    def effective_safety(
        self, per_request: Optional[List[Dict[str, str]]] = None
    ) -> List[Dict[str, str]]:
        """Resolve the safety settings for a Google API call.

        Precedence: per-request > saved operator defaults > baseline.
        Hosted mode ignores per-request settings entirely (anonymous
        visitors must not lower thresholds on the operator's key).
        """
        if is_hosted():
            return self._safety_defaults or BASELINE_SAFETY
        if self._valid_safety_shape(per_request):
            return per_request
        return self._safety_defaults or BASELINE_SAFETY

    # ── mutation (operator only, never hosted) ───────────────────────────

    def update(
        self,
        tier: Optional[str] = None,
        local_base_url: Optional[str] = None,
        local_model: Optional[str] = None,
        safety_defaults: Optional[List[Dict[str, str]]] = None,
        google_api_mode: Optional[str] = None,
    ) -> None:
        """Apply operator configuration. Raises on hosted instances and on
        malformed input; persists on success."""
        if is_hosted():
            raise PermissionError(
                "This hosted instance is managed by its operator via environment "
                "configuration; backend and safety settings cannot be changed here."
            )
        if tier is not None:
            if tier not in VALID_TIERS:
                raise ValueError(f"Unknown backend tier: {tier!r} (expected one of {VALID_TIERS})")
            self._tier = tier
        if local_base_url is not None:
            url = local_base_url.strip().rstrip("/")
            if url:
                if not url.startswith(("http://", "https://")):
                    raise ValueError("local_base_url must start with http:// or https://")
                _assert_private_host(url)
            self._local_base_url = url or DEFAULT_LOCAL_BASE_URL
        if local_model is not None:
            self._local_model = local_model.strip() or DEFAULT_LOCAL_MODEL
        if safety_defaults is not None:
            if not self._valid_safety_shape(safety_defaults):
                raise ValueError(
                    "safety_defaults must be a non-empty list of "
                    '{"category": str, "threshold": str} objects'
                )
            self._safety_defaults = safety_defaults
        if google_api_mode is not None:
            if google_api_mode not in VALID_GOOGLE_APIS:
                raise ValueError(
                    f"Unknown google_api_mode: {google_api_mode!r} "
                    f"(expected one of {VALID_GOOGLE_APIS})"
                )
            self._google_api_mode = google_api_mode
        self.save()

    # ── introspection for /api/health and the settings panel ────────────

    def snapshot(self) -> dict:
        return {
            "backend_tier": self.effective_tier(),
            "configured_tier": self._tier,
            "hosted": is_hosted(),
            "local_base_url": self._local_base_url,
            "local_model": self._local_model,
            "safety_defaults": self._safety_defaults or BASELINE_SAFETY,
            "safety_customized": self._safety_defaults is not None,
            "google_api_mode": self.effective_google_api(),
            # Safety thresholds only reach Google on the legacy generateContent
            # API — the panel uses this to render the knobs active vs. inert.
            "safety_thresholds_active": self.effective_google_api() == GOOGLE_API_LEGACY,
        }


policy = Policy()
