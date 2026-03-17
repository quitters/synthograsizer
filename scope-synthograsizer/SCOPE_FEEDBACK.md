# Feedback for Daydream Scope Team

**From:** Alexander (Synthograsizer / EmProps)
**Re:** Plugin system extensibility & workflow composition
**Date:** March 2026

---

## Context

I've been building a Scope plugin (`scope-synthograsizer`) that ports my Synthograsizer creative tool into the Scope ecosystem. The Synthograsizer is a mad-libs style prompt crafter with skeuomorphic controls, template-driven variable cycling, MIDI/OSC integration, p5.js canvas rendering, and a glitch-art preprocessor.

After extensive development and testing, I found that **the glitcher preprocessor works beautifully** — it chains into any diffusion pipeline, all params render correctly in the UI, MIDI mapping works out of the box. This is exactly the kind of thing Scope's plugin system excels at.

However, I hit significant walls trying to bring the rest of the Synthograsizer experience into Scope. Here's what I ran into and what I think could make Scope dramatically more powerful for creative developers.

---

## What Works Well

- **Preprocessor pipeline pattern** — frame-in, frame-out with NumPy/OpenCV is clean and performant
- **Pydantic schema → auto-generated UI** — `Literal` types render as dropdowns, `float` with bounds renders as sliders. Simple and effective
- **Runtime parameter updates** — params editable during streaming without pipeline restart
- **MIDI mapping** — any schema field is automatically MIDI-mappable, which is huge for live performance
- **Plugin registration** via entry points — clean, standard Python packaging

## Feature Requests

### 1. Custom UI Components / Iframe Embedding

**The biggest limitation.** Plugins can only express UI through Pydantic field types — you get sliders, dropdowns, text inputs, and toggles. That's it.

For creative tools like the Synthograsizer, we need richer interaction: knobs, D-pads, colour-coded variable displays, canvas previews, template browsers. Currently the only option is to run a separate web server and have users open a second browser tab, which fragments the experience.

**Suggestion:** Allow plugins to register a custom UI panel via an iframe or web component URL. When a plugin pipeline is loaded, Scope could render the custom UI in a collapsible sidebar panel alongside the auto-generated params. The plugin provides the URL (could be a locally served page), and Scope embeds it with bidirectional messaging via `postMessage`.

This would let plugin developers build rich, interactive UIs while keeping everything inside Scope's window.

### 2. Pipeline Composition / Multi-Pipeline Loading

Scope currently loads **one main pipeline** plus optional pre/postprocessors. But many creative workflows need multiple "main" capabilities running together — for example:

- A prompt-crafting pipeline feeding prompts to a diffusion pipeline
- A canvas/drawing pipeline providing video input while a separate pipeline handles prompt logic
- Multiple preprocessors chained in sequence (the UI currently shows `+ Add` but it's unclear if multiple preprocessors stack)

**Suggestion:** A more explicit pipeline composition model where plugins can declare dependencies or connections. Something like:

```python
class MyConfig(BasePipelineConfig):
    usage = [UsageType.PROMPT_SOURCE]  # New usage type
    connects_to = ["diffusion"]  # Declares it feeds into diffusion pipelines
```

Or a visual node graph for connecting pipeline stages.

### 3. Dynamic Parameter Schemas

Scope schemas are static — defined at class level with fixed Pydantic fields. This means a plugin can't adapt its UI based on runtime state.

**My use case:** Template files have varying numbers of variables (3 to 12). I wanted to create a slider for each variable, but I had to pre-define 8 fixed slots because the schema can't change after class definition.

**Suggestion:** Support a `dynamic_fields()` method that returns additional field descriptors at pipeline load time (when `__init__` runs), not just at class definition. These would be added to the UI alongside the static schema fields.

### 4. Richer Widget Types

The current widget vocabulary (slider, dropdown, text, toggle, number) covers basics but misses common creative tool patterns:

- **Button** — trigger an action (randomize, reset, save preset)
- **Colour picker** — for colour-based parameters
- **2D pad** — X/Y control (common in audio/VJ tools, maps naturally to two params)
- **Read-only display** — show computed values like the resolved prompt text, FPS counters, status messages
- **Grouped/collapsible sections** — organize many params into logical groups (currently everything is a flat list under "Input & Controls" or "Settings")
- **Image/preview thumbnail** — show a small preview of the current input or a reference image

### 5. Plugin Lifecycle Hooks Beyond `__init__` and `__call__`

Currently plugins get `__init__` (load) and `__call__` (per-frame). Additional hooks would enable richer integrations:

- **`on_stream_start()` / `on_stream_stop()`** — setup/teardown for streaming sessions
- **`on_parameter_changed(name, old, new)`** — react to specific param changes (e.g., reload a template when the template selector changes)
- **`on_prompt_received(prompt)`** — for preprocessors to see/modify the current prompt
- **`on_unload()`** — cleanup when pipeline is switched

### 6. Inter-Plugin Communication

Plugins currently can't talk to each other. If I have a glitcher preprocessor and a prompt crafter both loaded, they can't coordinate.

**Suggestion:** A simple message bus or shared state dict that plugins in the same session can read/write:

```python
def __call__(self, **kwargs):
    # Read state set by another plugin
    prompt = kwargs.get("__shared__", {}).get("synthograsizer_prompt", "")
```

### 7. WebRTC Data Channel Access for Plugins

The Synthograsizer web UI already connects to Scope via WebRTC and sends prompts through the data channel. But there's no documented way for a plugin pipeline to **receive** those data channel messages in its `__call__` method.

If plugins could access incoming data channel messages, an external web UI could communicate with its companion plugin without needing a separate WebSocket/HTTP server.

---

## Summary

Scope's core streaming pipeline is excellent. The preprocessor pattern, auto-generated UI, and MIDI mapping are genuinely well-designed. The plugin system just needs to open up a few more doors for creative developers who want to build richer, more interactive experiences on top of it.

The single biggest unlock would be **custom UI panels** (request #1). Everything else is quality-of-life. With iframe embedding alone, the entire Synthograsizer experience could live inside Scope's window natively.

Happy to discuss any of these in more detail, or share the plugin code as a reference implementation.

— Alexander
