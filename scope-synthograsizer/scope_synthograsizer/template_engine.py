"""Template engine — loads Synthograsizer JSON templates and resolves prompts.

Mirrors the JS implementation in ``studio-integration.js`` and ``app.js``:
templates are JSON files with a ``promptTemplate`` string containing
``{{variable_name}}`` placeholders and a ``variables`` array of objects with
``name`` and ``values`` fields.
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any


_PLACEHOLDER_RE = re.compile(r"\{\{([^}]+)\}\}")


# ── Loading & validation ─────────────────────────────────────────────────────

def load_template(path: str | Path) -> dict[str, Any]:
    """Load and validate a Synthograsizer JSON template.

    Raises ``ValueError`` if the template is structurally invalid.
    """
    with open(path, "r", encoding="utf-8") as f:
        tpl = json.load(f)

    _validate(tpl)
    return tpl


def _validate(tpl: dict) -> None:
    if "promptTemplate" not in tpl:
        raise ValueError("Template missing 'promptTemplate'")
    if "variables" not in tpl or not isinstance(tpl["variables"], list):
        raise ValueError("Template missing 'variables' array")
    names = set()
    for v in tpl["variables"]:
        name = v.get("name")
        if not name:
            raise ValueError("Variable missing 'name'")
        if name in names:
            raise ValueError(f"Duplicate variable name: {name}")
        names.add(name)
        vals = v.get("values")
        if not vals or not isinstance(vals, list):
            raise ValueError(f"Variable '{name}' has no values")


# ── Prompt resolution ────────────────────────────────────────────────────────

def resolve_prompt(
    template: dict,
    values: dict[str, int] | None = None,
) -> str:
    """Resolve the prompt by substituting variable placeholders.

    Parameters
    ----------
    template : dict
        Loaded template JSON.
    values : dict[str, int] | None
        Mapping of variable name → index into its values array.
        If ``None``, index 0 is used for every variable.

    Returns
    -------
    str  — the fully-resolved prompt string.
    """
    text = template["promptTemplate"]
    var_map = {v["name"]: v for v in template["variables"]}

    def _replace(m: re.Match) -> str:
        name = m.group(1).strip()
        var = var_map.get(name)
        if var is None:
            return m.group(0)  # leave placeholder as-is
        idx = (values or {}).get(name, 0)
        val_list = var["values"]
        idx = idx % len(val_list) if val_list else 0
        entry = val_list[idx]
        # Support both flat strings and {text, weight} objects
        if isinstance(entry, dict):
            return entry.get("text", str(entry))
        return str(entry)

    return _PLACEHOLDER_RE.sub(_replace, text)


# ── Weighted random ──────────────────────────────────────────────────────────

def get_weighted_random_index(values: list) -> int:
    """Pick a random index weighted by the ``weight`` field on each value.

    Matches the JS implementation in ``app.js``.  If no weights are present
    a uniform distribution is used.
    """
    if not values:
        return 0

    weights: list[float] = []
    for v in values:
        if isinstance(v, dict):
            weights.append(float(v.get("weight", 1)))
        else:
            weights.append(1.0)

    total = sum(weights)
    if total <= 0:
        return random.randint(0, len(values) - 1)

    r = random.random() * total
    cumulative = 0.0
    for i, w in enumerate(weights):
        cumulative += w
        if r <= cumulative:
            return i
    return len(values) - 1


# ── Scope parameter mapping ─────────────────────────────────────────────────

def template_to_scope_params(template: dict) -> list[dict]:
    """Convert template variables into Scope-style parameter descriptors.

    Each variable becomes an integer parameter with range ``[0, N-1]``
    where *N* is the number of values.  This allows Scope's built-in
    MIDI/OSC mapping to control each variable directly.
    """
    params = []
    for i, v in enumerate(template["variables"]):
        n = len(v["values"])
        params.append({
            "name":        v["name"],
            "label":       v.get("feature_name", v["name"]),
            "type":        "int",
            "default":     0,
            "min":         0,
            "max":         n - 1,
            "order":       100 + i,
            "category":    "input",
            "is_load_param": False,
        })
    return params
