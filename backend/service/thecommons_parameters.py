"""The Commons — control-value bounds/step/default logic.

Direct port of TheCommons' client/shared/parameters.js. A numeric control is
explicitly declared, never inferred from its name or numeric-looking choice
labels. Inherited template values remain strings.
"""

import math
from typing import Any


def default_value(variable: dict) -> Any:
    if variable.get("type") in ("number", "toggle"):
        return variable.get("default")
    values = variable.get("values")
    return values[0]["text"] if values else None


def on_step(variable: dict, value: float) -> bool:
    steps = (value - variable["min"]) / variable["step"]
    return math.isfinite(steps) and abs(steps - round(steps)) < 1e-7


def numeric_value(variable: dict, value: Any) -> float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        return None
    if value < variable["min"] or value > variable["max"]:
        return None
    snapped = variable["min"] + round((value - variable["min"]) / variable["step"]) * variable["step"]
    # JS `Number(x.toPrecision(12))` — round to 12 significant digits, then clamp.
    snapped = float(f"{snapped:.12g}")
    return min(variable["max"], max(variable["min"], snapped))


def accept_value(variable: dict, value: Any) -> Any:
    """The value a control may take, normalised, or None when it may not.

    One gate for every writer -- a participant's phone, the host's desk, a
    saved look being loaded -- so they can never disagree about what's valid.
    Callers must test `is None`: a toggle's False is a real value.
    """
    vtype = variable.get("type")
    if vtype == "trigger":
        return None  # a trigger is fired, never set
    if vtype == "number":
        return numeric_value(variable, value)
    if vtype == "toggle":
        return value if isinstance(value, bool) else None
    choices = variable.get("values") or []
    return value if any(c["text"] == value for c in choices) else None
