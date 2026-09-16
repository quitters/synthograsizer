"""The Commons — native (Canvas2D) sketch validation.

Direct port of TheCommons' server/validate-sketch.js. Only freshly generated
Canvas2D sketches pass through this gate; the inherited p5 library keeps its
own contract and its verbatim source files. This checks structure and syntax,
not runtime safety or artistic quality.

Known gap vs. the JS original: validate-sketch.js's final step is
`new Function('ctx','frame','getVar','audio', sketch.code)` — a JS *syntax*
compile check with no Python equivalent. Stage 2 never serves model-generated
code (only the static, pre-trusted fallback pool), so that check has zero
practical exposure yet. Revisit once a live provider call can produce
`code` here — likely via a `node --check`-equivalent subprocess check, since
compiling JS from Python isn't otherwise meaningful.
"""

import re

_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-z][a-z0-9_]*)\s*\}\}")
_RESERVED_NAMES = {"constructor", "prototype"}


class InvalidSketchError(ValueError):
    pass


def _nonempty(value) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise InvalidSketchError(f"invalid native sketch: {message}")


def validate_native_sketch(sketch: dict) -> dict:
    _require(isinstance(sketch, dict), "expected an object")
    _require("p5Code" not in sketch, "p5Code belongs only to the inherited library")
    _require(_nonempty(sketch.get("name")), "missing name")
    _require(_nonempty(sketch.get("promptTemplate")), "missing promptTemplate")
    _require(_nonempty(sketch.get("code")), "missing drawing code")
    variables_in = sketch.get("variables")
    _require(isinstance(variables_in, list) and 2 <= len(variables_in) <= 16, "expected 2-16 variables")

    names: set[str] = set()
    variables = []
    for v in variables_in:
        _require(
            isinstance(v, dict) and isinstance(v.get("name"), str)
            and bool(_NAME_RE.match(v["name"])) and v["name"] not in _RESERVED_NAMES,
            "invalid variable name",
        )
        name = v["name"]
        _require(name not in names, f"duplicate variable {name}")
        names.add(name)
        label = v["label"] if _nonempty(v.get("label")) else name.replace("_", " ")
        vtype = v.get("type")
        _require(vtype in (None, "select", "number"), "unknown control type")

        if vtype == "number":
            _require("values" not in v, f"{name} cannot mix a numeric range and choices")
            bounds = [v.get("min"), v.get("max"), v.get("step"), v.get("default")]
            _require(
                all(isinstance(b, (int, float)) and not isinstance(b, bool) for b in bounds),
                f"{name} needs finite min/max/step/default",
            )
            vmin, vmax, vstep, vdefault = bounds
            _require(vmin < vmax and vstep > 0 and vstep <= vmax - vmin, f"{name} has an invalid range")
            _require(vmin <= vdefault <= vmax, f"{name} default is outside its range")
            from backend.service.thecommons_parameters import on_step
            _require(
                on_step({"min": vmin, "step": vstep}, vmax) and on_step({"min": vmin, "step": vstep}, vdefault),
                f"{name} max and default must align with step from min",
            )
            variables.append({
                "name": name, "label": label, "type": "number",
                "min": vmin, "max": vmax, "step": vstep, "default": vdefault,
            })
            continue

        values_in = v.get("values")
        _require(isinstance(values_in, list) and 3 <= len(values_in) <= 10, f"{name} needs 3-10 choices")
        texts: set[str] = set()
        values = []
        for value in values_in:
            _require(isinstance(value, dict) and _nonempty(value.get("text")), f"{name} has a malformed choice")
            text = value["text"]
            _require(text not in texts, f"{name} has duplicate choices")
            texts.add(text)
            weight = value.get("weight", 1)
            _require(not isinstance(weight, bool) and weight in (1, 2, 3), f"{name} has an invalid weight")
            values.append({"text": text, "weight": weight})
        variables.append({"name": name, "label": label, "values": values})

    prompt_template = sketch["promptTemplate"]
    placeholders = {m.group(1) for m in _PLACEHOLDER_RE.finditer(prompt_template)}
    _require(
        placeholders == names,
        "prompt placeholders must match the controls",
    )
    stripped = _PLACEHOLDER_RE.sub("", prompt_template)
    _require("{{" not in stripped, "malformed prompt placeholder")

    return {
        "name": sketch["name"].strip(),
        "promptTemplate": prompt_template,
        "variables": variables,
        "code": sketch["code"],
    }
