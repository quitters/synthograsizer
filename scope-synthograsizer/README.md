# scope-synthograsizer

Scope plugin that brings the Synthograsizer's mad-libs prompt crafting, p5.js VJ canvas, and glitch art preprocessing into the [Daydream Scope](https://github.com/daydream-mx/scope) ecosystem.

## Pipelines

### synthograsizer-companion

Launches a FastAPI server serving the Synthograsizer web UI. The UI connects to Scope via WebRTC, streaming p5.js canvas frames as video input and sending prompt updates through the data channel.

- **Auto-opens** the web UI in your browser on load
- Serves the full Synthograsizer interface (knobs, D-Pad, MIDI/OSC, templates)
- OSC bridge endpoints for external controller integration

### synthograsizer-glitcher

Real-time video preprocessor applying destructive glitch art effects before diffusion.

**Effects:**
- **Pixel Sort** — 8 algorithms (column/row brightness, column/row hue, random lines, diagonal, circular, wave)
- **Slice** — Horizontal, vertical, or both with colour offset
- **Color** — Chromatic aberration, hue shift, vintage, invert, channel shift, colour noise
- **Direction** — Region shifts (up, down, left, right, random, jitter)
- **Spiral** — Swirl/ripple distortion via polar coordinate remapping

All parameters appear in Scope's Input & Controls panel and are mappable to MIDI/OSC.

## Installation

```bash
daydream-scope install /path/to/scope-synthograsizer
```

Or for development:

```bash
cd scope-synthograsizer
pip install -e .
```

## Usage

1. Load `synthograsizer-companion` in Scope to launch the web UI
2. Load your diffusion pipeline (e.g., LongLive) as the main pipeline
3. Optionally load `synthograsizer-glitcher` as a preprocessor for real-time glitch effects
4. In the web UI: load a template, tweak variables via knobs/D-Pad/MIDI, and start streaming

See `examples/sample_workflows/` for ready-to-use pipeline configurations.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNTHOGRASIZER_STATIC_DIR` | Auto-detected | Path to the Synthograsizer static files |
| `SCOPE_URL` | `http://127.0.0.1:7860` | Scope server URL for WebRTC connection |

### Glitcher Parameters

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `pixel_sort` | dropdown | off / columnBrightness / rowBrightness / columnHue / rowHue / randomLines / diagonal / circular / wave | off |
| `slice_mode` | dropdown | off / horizontal / vertical / both | off |
| `color_effect` | dropdown | off / chromaticAberration / hueShift / vintage / invert / channelShift / colorNoise | off |
| `spiral_type` | dropdown | off / spiral / insideOut / outsideIn / cw / ccw | off |
| `direction_mode` | dropdown | off / down / up / left / right / random / jitter | off |
| `intensity` | slider | 0.0 – 1.0 | 0.5 |
| `speed` | slider | 0.1 – 10.0 | 2.0 |
| `swirl_strength` | slider | 0.0 – 1.0 | 0.06 |

## Testing

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

## Architecture

```
scope-synthograsizer/
├── scope_synthograsizer/
│   ├── node.py                    # Plugin entry point (register_pipelines)
│   ├── web_server.py              # FastAPI companion server
│   ├── template_engine.py         # JSON template → prompt resolution
│   ├── workflow_generator.py      # Scope pipeline config generation
│   └── pipelines/
│       ├── companion/             # Web UI launcher pipeline
│       └── glitcher/              # Preprocessor pipeline
│           └── effects/           # NumPy/OpenCV effect implementations
├── tests/
└── examples/
```

## Dependencies

- `numpy` — Array operations for effects
- `opencv-python-headless` — Image processing (HSV conversion, remap)
- `fastapi` + `uvicorn` — Companion web server
- `python-osc` — OSC bridge for external controllers
- `torch` — Provided by Scope's host environment (not declared)
