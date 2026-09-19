"""The Commons — native (Canvas2D) sketch validation.

Direct port of TheCommons' server/validate-sketch.js. Only freshly generated
Canvas2D sketches pass through this gate; the inherited p5 library keeps its
own contract and its verbatim source files. This checks structure and syntax,
not runtime safety or artistic quality.

Like validate-sketch.js, the last step compiles the code exactly as the wall
does, `new Function(...NATIVE_PARAMS, code)`, here in an embedded V8
(mini-racer) because the Cloud Run image has no node. Only compiled, never
run. Measured on gemini-3.8-flash: 2 of 30 sketches had a stray `)` after a
template literal. Before this they passed and shipped as a blank wall; now
they fail here, so generate_sketch's repair pass fixes them. A pure-Python
parser was not an option: esprima rejected every gallery piece (no `??`,
`?.`, class fields), and tree-sitter, which recovers from errors rather than
reporting them, accepted `let ctx = 1;`, which V8 rejects.
"""

import functools
import logging
import re

from backend.service.thecommons_ui import normalize_ui

logger = logging.getLogger(__name__)

# Must match NATIVE_PARAMS in static/thecommons/js/sketch-runtime.js: a body
# that redeclares a parameter (`let room = ...`) fails there and nowhere else.
NATIVE_PARAMS = ("ctx", "frame", "getVar", "audio", "room")
_COMPILE_JS = "(code) => { new Function(%s, code); }" % ", ".join(f"'{p}'" for p in NATIVE_PARAMS)
# ECMA-262's LineTerminatorSequence, which is how V8 numbers lines.
_JS_LINE_BREAK_RE = re.compile(r"\r\n|[\n\r\u2028\u2029]")
# mini-racer's uncaught-error text: "<script>:<line>: SyntaxError: ...\n<that source line>\n   ^".
_V8_LOCATED_RE = re.compile(r"[^\n]*?:(\d+): ([^\n]+)\n([^\n]*)")

_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-z][a-z0-9_]*)\s*\}\}")
_RESERVED_NAMES = {"constructor", "prototype"}
# Host controls belong to the room's owner, on the desk. A few at most: the
# room is the point, and every host control is one fewer for the phones.
MAX_HOST_CONTROLS = 4


class InvalidSketchError(ValueError):
    pass


def _nonempty(value) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise InvalidSketchError(f"invalid native sketch: {message}")


@functools.cache
def _v8():
    """py_mini_racer with V8 loaded, imported lazily like qrcode and asyncpg
    so that a local install with stale dependencies still boots. If the
    package is missing or its native library won't load, the compile check
    is skipped, loudly, which leaves validation as it was before the check
    existed -- rather than failing every generation and the whole gallery."""
    try:
        import py_mini_racer
        py_mini_racer.init_mini_racer(ignore_duplicate_init=True)
    except Exception:
        logger.exception("[thecommons] V8 (mini-racer) is unavailable, so sketch code is NOT being compiled "
                         "before it ships; pip install -r requirements.txt")
        return None
    return py_mini_racer


def compile_error(code: str) -> str | None:
    """None if the wall can compile `code`, otherwise V8's own error message.

    A fresh context per call: it costs a few milliseconds, and a context
    that is never closed keeps the interpreter from exiting. No timeout,
    because mini-racer refuses one when called on a running event loop, which
    is where generate_sketch validates. None is needed either: the code is
    never run, and a 1 MB sketch compiles in ~75 ms."""
    v8 = _v8()
    if v8 is None:
        return None
    with v8.MiniRacer() as js:
        try:
            js.eval(_COMPILE_JS)(code)
        except v8.JSEvalException as exc:
            return _describe(str(exc), code)
    return None


def _describe(raw: str, code: str) -> str:
    """V8's message, plus the offending line of `code` whenever V8's line
    number verifiably points into it. The source V8 compiles is, per
    ECMA-262's CreateDynamicFunction, "(function anonymous(<params>\\n) {\\n"
    + code + "\\n})" -- so the code starts two lines down. The line quoted in
    the error has to match that line of the code, or the location is dropped:
    a RangeError from deeply nested code, for one, is located in the harness."""
    match = _V8_LOCATED_RE.match(raw)
    if not match:
        return raw.strip().split("\n", 1)[0]
    line_no, message, quoted = int(match.group(1)) - 2, match.group(2), match.group(3)
    lines = _JS_LINE_BREAK_RE.split(code)
    if 1 <= line_no <= len(lines) and lines[line_no - 1] == quoted:
        where, text = f"{message} at line {line_no} of the code", quoted.strip()
        return f"{where}: {text}" if len(text) <= 200 else where
    if line_no == len(lines) + 1 and quoted == "})":
        return f"{message} at the end of the code"
    return message


def validate_native_sketch(sketch: dict) -> dict:
    _require(isinstance(sketch, dict), "expected an object")
    _require("p5Code" not in sketch, "p5Code belongs only to the inherited library")
    _require(_nonempty(sketch.get("name")), "missing name")
    _require(_nonempty(sketch.get("promptTemplate")), "missing promptTemplate")
    _require(_nonempty(sketch.get("code")), "missing drawing code")
    variables_in = sketch.get("variables")
    _require(isinstance(variables_in, list) and 2 <= len(variables_in) <= 16, "expected 2-16 variables")

    names: set[str] = set()
    valued_names: set[str] = set()  # select, number and toggle; triggers carry no value
    assignable = 0                  # controls distribute() can hand to one person
    host_controls = 0
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
        _require(vtype in (None, "select", "number", "toggle", "trigger"), "unknown control type")

        # `share` is deliberately trigger-only. A shared slider or choice would
        # be several people overwriting one value with no turn-taking — exactly
        # what the relay's 4s hold exists to prevent. A trigger is the one
        # control where simultaneous input is the point rather than a problem.
        share = "one"
        if "share" in v:
            _require(vtype == "trigger", f"{name} cannot declare share — triggers only")
            share = v["share"]
            _require(share in ("one", "all"), f"{name} has an invalid share mode")

        # Who may set it: the room (handed to participants, the default) or the
        # host alone, from the desk. A host control is never handed out, so it
        # can't also be shared with everyone.
        access = v.get("access", "room")
        _require(access in ("room", "host"), f"{name} has an invalid access mode")
        host = access == "host"
        _require(not (host and "share" in v), f"{name} cannot be both host-only and shared")
        if host:
            host_controls += 1
        elif share != "all":
            assignable += 1

        if vtype == "trigger":
            _require("values" not in v, f"{name} cannot mix a trigger and choices")
            _require(
                not any(k in v for k in ("min", "max", "step", "default")),
                f"{name} cannot mix a trigger and a numeric range",
            )
            variables.append({"name": name, "label": label, "type": "trigger", "share": share,
                              **({"access": "host"} if host else {})})
            continue

        valued_names.add(name)

        # A genuine on/off. Before this, on/off had to be faked as a 3-choice
        # select, because a choice needs at least three values.
        if vtype == "toggle":
            _require(
                not any(k in v for k in ("values", "min", "max", "step")),
                f"{name} is a toggle: it takes no choices and no numeric range",
            )
            _require(isinstance(v.get("default"), bool), f"{name} needs a true or false default")
            variables.append({"name": name, "label": label, "type": "toggle", "default": v["default"],
                              **({"access": "host"} if host else {})})
            continue

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
                **({"access": "host"} if host else {}),
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
        variables.append({"name": name, "label": label, "values": values,
                          **({"access": "host"} if host else {})})

    _require(host_controls <= MAX_HOST_CONTROLS, f"at most {MAX_HOST_CONTROLS} host-only controls")
    # At least one control must stay assignable, or distribute() has nothing to
    # hand out and the room loses the "you own a knob" premise entirely. Host
    # controls don't count: they are the owner's, not the room's.
    _require(assignable >= 1, "at least one control must be handed to the room")

    prompt_template = sketch["promptTemplate"]
    placeholders = {m.group(1) for m in _PLACEHOLDER_RE.finditer(prompt_template)}
    # Triggers are exempt: promptTemplate substitutes *values*, and a trigger
    # has none, so {{shoot}} would render as nothing sensible.
    _require(
        placeholders == valued_names,
        "prompt placeholders must match the controls",
    )
    stripped = _PLACEHOLDER_RE.sub("", prompt_template)
    _require("{{" not in stripped, "malformed prompt placeholder")

    # Last, as the costliest check. The message reaches the repair prompt
    # verbatim, so it carries the parser's own words and the line.
    error = compile_error(sketch["code"])
    _require(error is None, f"code does not compile: {error}")

    validated = {
        "name": sketch["name"].strip(),
        "promptTemplate": prompt_template,
        "variables": variables,
        "code": sketch["code"],
    }
    # A control panel is optional and presentational, so it is normalised
    # rather than validated: a bad one degrades to the default panel and never
    # costs the piece. Dropping it here instead would strip every panel that
    # passes through this gate, the gallery's included.
    ui = normalize_ui(sketch.get("ui"), variables)
    if ui is not None:
        validated["ui"] = ui
    return validated
