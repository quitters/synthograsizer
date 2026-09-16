"""The Commons — control-value bounds/step/default logic.

Direct port of TheCommons' client/shared/parameters.js. A numeric control is
explicitly declared, never inferred from its name or numeric-looking choice
labels. Inherited template values remain strings.
"""

import math
from typing import Any


def default_value(variable: dict) -> Any:
    if variable.get("type") == "number":
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
