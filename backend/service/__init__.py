"""Service mode — accounts, sessions, and (later) credit metering.

``SYNTH_AUTH=1`` layers user accounts on top of the existing hosted-mode
hardening (``backend/policy.py::is_hosted``). With the flag unset (the local
default) every module in this package stays inert: the enforcement middleware
passes requests straight through, the account endpoints 404, and no database
driver is imported — a local install behaves exactly as before.

Production deployments set ``SYNTH_HOSTED=1`` *and* ``SYNTH_AUTH=1``.
"""

import os


def service_mode() -> bool:
    """Accounts + credits + tier gating active (read per-call so tests can toggle)."""
    return os.environ.get("SYNTH_AUTH") == "1"
