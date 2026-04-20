# Synthograsizer Suite

A collection of creative browser-based tools for prompt engineering, generative art, glitch effects, and AI-assisted image/video generation.

---

## Tools

| Tool | Description | Path |
|------|-------------|------|
| **Synthograsizer** | D-pad prompt template engine with MIDI, p5.js live panel, batch generation, Image Studio, Display Window, OSC/WebRTC integration | `/synthograsizer/` |
| **PromptCraft Sequencer** | VST-inspired step sequencer for prompts — sequence variables across 16 steps, glitch engine, lock/unlock variables | `/promptcraft/` |
| **Glitcher** | Professional glitch art studio — destructive & non-destructive effects, selection system, recording | `/glitcher/` |
| **ChatRoom** | Multi-agent autonomous AI conversations with Gemini — customizable personas, memory, image generation (requires local server) | `/chatroom/` |
| **DAW** | Web-based digital audio workstation — FM synthesis, step sequencers, effects | `/daw/` |
| **Metadata Manager** | Extract prompts from PNG metadata, convert to reusable Synthograsizer templates | `/metadata-manager/` |
| **Legacy Synthograsizer** | Original version — 4 operating modes, MIDI support, p5.js sketch editor, ComfyUI bridge | `/legacy/` |

---

## What's New

### Synthograsizer — Recent Updates

**Keyboard Shortcuts**

| Key | Action |
|-----|--------|
| `R` | Randomize all variables |
| `G` | Generate (send prompt to AI) |
| `F` | Favorite / save current prompt |
| `T` | Open Template Generator modal |

**MIDI Template Navigation**

The MIDI panel now includes **Prev Template** and **Next Template** mappings in the Template Navigation section. Assign any CC or Note to cycle backwards or forwards through the template list — useful for live performance without touching the keyboard.

**API Key Button**

The Google GenAI API key is now configured via a dedicated **API** button in the Connections sidebar (alongside MIDI and OSC). A green dot indicates the key is configured. Click to open the settings modal where you can enter or update your key.

> ⚠️ **Security note:** If you are using the Vercel-hosted version of this app, your API key is transmitted to a shared serverless environment with no session isolation or authentication on the endpoints. For production use with real API keys, run the local server (Option B below) or add authentication middleware. The local server stores your key in `ai_studio_config.json` (gitignored) and never transmits it.

**Perform Mode Improvements**

Performance layout (`layout-a`) is now a cleaner live surface:
- Navbar links hidden (title remains visible)
- Copy, Code, Add (❤️), and Send to Chat buttons hidden
- Output header label hidden
- Output text enlarged to 22px / 1.7 line-height
- Tag badges and keyboard hint hidden
- Primary buttons (Randomize, Generate, Run Code) enlarged to 80px height / 22px font

**Template Picker — Reorganized**

Templates are now grouped into two sections in the picker:
1. **P5.js Templates** — ordered from most to least complex (by p5Code character length)
2. **Prompt Templates** — ordered from most coherent/detailed to least
3. **Empty Template** — always last

**Quantico Font**

The output/prompt area now uses **Quantico** throughout (not just variable tokens). The Randomize, Generate, and Run Code buttons use **Inter** for clean legibility.

---

### Synthograsizer — Full Feature Reference

**D-Pad / Knobs UI**
The main interface is a D-pad navigator. Press ↑/↓ to move between variables, ←/→ to cycle through values. Knob-style controls display the current value and weight for each variable.

**MIDI Support**
Connect any MIDI controller to drive the D-pad UI with hardware knobs and pads. CC messages map to variable navigation; note messages trigger discrete actions. Configured via the MIDI panel in the sidebar. Supports CC and Note mappings for template navigation (Prev/Next).

**p5.js Live Panel**
Templates can embed a `p5Code` field containing a full p5.js sketch written in **instance mode**. When loaded, the sketch renders live inside the app and reads the current template variable values in real time via `p.getSynthVar("variableName")`. Changes to variables update the sketch instantly — no page reload needed.

**Batch Generation**
Generate multiple prompt variations in one click using cycle or randomize modes. Results stream back progressively. Available via the batch toolbar.

**Image Studio**
Capture the current p5.js canvas frame and send it directly to the AI image pipeline as a reference image. Use it as a starting point for Imagen conditioning or as a visual seed for Veo video generation.

**Glitcher Controls (Integrated)**
A Glitcher effects panel is now built into the Synthograsizer sidebar. Toggle pixel sort, slice, color shift, spiral, and CSS filter effects directly on the displayed image or canvas — no need to switch to the standalone Glitcher tool.

**Display Window**
Open `display.html` as a dedicated fullscreen output for OBS, a projector, or an installation monitor. It receives content from the main app via BroadcastChannel (no server needed). Supports four content layers:
- Live p5.js canvas
- Latest generated image
- Generated or looped video
- Idle state

The display window also runs Glitcher effects independently, controlled from the main app.

**Studio / Performance Modes**
The layout switcher offers two named modes:
- **Studio** — single-column layout with the full AI Studio Tools panel visible (Image Studio, Video Studio, Transform, AI Chat, Template Gen, Image Analysis, Metadata, Music Studio)
- **Performance** — two-column layout (output + D-pad side by side) with the AI Studio Tools panel hidden and UI chrome minimized — a clean performance surface for live use

**Hardware Synth Theme**
A drop-in CSS override (`css/synth-hardware-theme.css`) applies a cohesive hardware synthesizer aesthetic to the entire UI:
- Cream/parchment chassis inspired by the Roland Juno-106 and Casio PT-1
- Teal/mint accent color (`#3dbdad`) on the title, nav links, section labels, and active states
- NeoBrutalism design language: bold 2px borders, offset box-shadows, physical press animations
- No external CSS framework — all creative coding; Google Fonts CDN is the only external dependency (Orbitron, VT323, Share Tech Mono, Quantico)

**Music Studio**
A new Music Studio panel is available in the AI Studio Tools grid. Generates music via the backend `music_manager.py` module with play/pause/stop transport controls.

**Unified Scope Panel**
A single "Scope" button in the sidebar manages all integration with [Daydream Scope](https://scope.daydream.fm) from one place. The panel auto-detects a running Scope instance on startup (green ONLINE badge) and provides four collapsible sections: Prompt via OSC, Video Stream via WebRTC, Display → Spout setup guide, and Image Push.

**OSC Bridge**
Send the current prompt and per-variable values to Scope (or any OSC-compatible tool) over UDP. Supports auto-send on every variable change or manual send-now. See [Scope Integration](#scope-integration) below for the full architecture.

**Scope Video Client**
Stream the p5.js canvas to Scope as a live video input via WebRTC, or push individual canvas snapshots as VACE reference images. Includes 10-second connection timeout and automatic reconnection. See [Scope Integration](#scope-integration) below.

### Templates

Templates are JSON files shared across Synthograsizer and PromptCraft. The library has grown to 50+ templates across several categories:

**Generative Art (p5.js)** — Mathematical and procedural sketches with live variable control, listed from most to least complex:
- `spring-physics-v2` — Spring-chain physics simulation with WEBGL rendering
- `boids-flocking` — Emergent flocking simulation
- `strange-attractors` — Lorenz, Clifford, DeJong, Rössler, and other dynamical systems
- `cellular-tapestry` — Game of Life, Brian's Brain, Cyclic CA, and other cellular automata
- `lissajous-lab` — Parametric Lissajous curves with frequency and phase variables
- `fractal-tree` — Recursive fractal tree generator
- `moire-waves` — Interference pattern generation
- `recursive-subdivisions` — Recursive geometric subdivision
- `smiley-mound`, `breakdance`, `hollywood-squares`, `monster-maker`, and more character/figure sketches
- SVG Flow *(loaded by default)*

**Image / Video Generation** — Structured prompt templates for Imagen and Veo:
- `img2vid-cinematographer` — Cinematic motion prompt builder for Veo
- `jacket_weather_v2`, `blurred_autonomy`, `synesthetic_singularity`, and more

**Character / Narrative** — Text prompt templates with weighted value lists:
- `glorpy_heads`, `nimby`, `the_harlequins_of_neptune`, `lovebombing`, `cinematic-plot-twist`, and others

### ChatRoom — Multi-Agent Autonomous Conversations

ChatRoom now supports fully autonomous multi-agent conversations. Configure multiple Gemini-backed agents with distinct personas, memory buffers, and speaking order. Agents converse with each other without manual prompting — useful for simulating character interactions, debate formats, or generative dialogue for creative projects.

Requires the Node.js backend on port 3001 (see setup below).

### Backend — Python FastAPI + Google AI

The Python backend follows a modular service-oriented architecture:

- **Centralized Logic:** `ai_manager.py` acts as a façade, delegating requests to specialized domain modules in `backend/services/`.
- **Domain Services:** Dedicated generation engines for Text, Image (Imagen 3), Video (Veo 2), Analysis, and Template Engineering.
- **FastAPI Routing:** Endpoints are decoupled into domain-specific routers in `backend/routers/` for better maintainability.
- **Config Management:** Centralized `config.py` using pure-stdlib `.env` loading and `pathlib` for cross-platform compatibility.
- **OSC & Scope:** Native UDP relaying (`osc_bridge.py`) and WebRTC/Asset proxying for Daydream Scope integration.

---

## Scope Integration

The Synthograsizer connects to [Daydream Scope](https://scope.daydream.fm) through three independent channels, all managed from the unified **Scope** sidebar panel.

```
┌─────────────────────────────────────┐     ┌──────────────────────────┐
│   SYNTHOGRASIZER (browser :8001)    │     │   SCOPE (:7860)          │
│                                     │     │                          │
│  Prompts + variable values ─────────┼─OSC─▶  OSC listener (:9000)   │
│  osc-controller.js → /api/osc/*     │ UDP │  /prompts, /synth/var/n  │
│  → osc_bridge.py                    │     │                          │
│                                     │     │                          │
│  p5.js canvas stream ───────────────┼─────▶  WebRTC video input      │
│  scope-video-client.js              │ WRT │  (canvas.captureStream)  │
│                                     │  C  │                          │
│  Canvas snapshots ──────────────────┼─────▶  /api/v1/assets          │
│  (Image Push)                       │HTTP │  VACE reference images   │
│                                     │     │                          │
│  display.html ──────────────────────┼─OBS─▶  Spout Receiver          │
│  → OBS Browser Source               │ SPT │  (GPU texture share)     │
│  → obs-spout2-plugin                │     │                          │
└─────────────────────────────────────┘     └──────────────────────────┘
```

### Channel 1 — OSC (Prompt + Variables)

**Architecture:** The browser cannot send UDP directly. Every OSC message goes through the Python backend:

```
osc-controller.js  →  POST /api/osc/send-prompt   →  osc_bridge.py  →  UDP  →  Scope
                       POST /api/osc/send-param
```

`osc_bridge.py` is a singleton `OSCBridge` instance created at import time using `python-osc`'s `SimpleUDPClient`. It holds the current target host and port and is reconfigured via `POST /api/osc/config`.

**Default addresses:**

| OSC Address | Type | Content |
|---|---|---|
| `/prompts` | string | Full resolved prompt text |
| `/synthograsizer/var/{n}` | float (0–1) | Per-variable normalised value |
| `/synthograsizer/var/{n}/text` | string | Variable name + current value text |

**Default ports:** OSC target `127.0.0.1:9000` (Scope's default OSC port).

**Auto-discovery:** On startup, `ScopeConnector` (`scope-connector.js`) calls `POST /api/scope/discover`, which probes `http://127.0.0.1:7860/health`. If Scope is found, OSC is automatically enabled and the target is configured. The connector polls every 10 seconds to detect Scope going online or offline.

**Configuring in the UI:** Open the Scope panel → **Prompt (OSC)** section. Toggle *Enabled*, set *Auto-send on change* for live knob-to-Scope updates, and adjust port/address if needed.

### Channel 2 — WebRTC (Live Canvas Stream)

`scope-video-client.js` captures the p5.js canvas via `canvas.captureStream()` and establishes a WebRTC peer connection to Scope:

1. POST offer to `{scopeUrl}/api/v1/webrtc/offer` with `initialParameters` (input mode, initial prompt)
2. Scope returns an SDP answer and a session ID
3. ICE candidates are exchanged via PATCH to `{scopeUrl}/api/v1/webrtc/offer/{sessionId}`
4. A `parameters` data channel carries real-time prompt updates in both directions

Prompt changes while streaming are sent through **both** the WebRTC data channel (sub-frame latency) and OSC (so other tools can receive them too).

Connection timeout: 10 seconds. Auto-reconnects up to 3 times on unexpected disconnect.

### Channel 3 — Spout (via OBS)

Browsers can't send Spout (GPU texture sharing) directly. The path is:

1. Open the **Display Window** (`display.html`) — fullscreen canvas output
2. Add it as an **OBS Browser Source**: `http://127.0.0.1:8001/synthograsizer/display.html`
3. In OBS: **Tools → Spout Output**, set sender name `Synthograsizer`
4. In Scope: enable **Spout Receiver** as video input, select `Synthograsizer`

The Scope panel's **Display → Spout** section shows these steps and provides a copy-URL button for the OBS Browser Source field.

### Channel 4 — Image Push

The **Image Push** section sends the current p5.js canvas frame as a PNG to Scope for use as a VACE reference image. Also accessible via the **→ Scope** button in the p5.js live panel.

**Architecture (local Scope):** Rather than calling Scope's `/api/v1/assets` endpoint directly (which requires CDN auth tokens in cloud mode), image push routes through the Synthograsizer Python backend:

```
browser  →  POST /api/scope/save-asset  →  backend writes PNG to ~/.daydream-scope/assets/
         →  data channel / WebRTC offer carries vace_ref_images: [filename]  →  Scope
```

When a WebRTC stream is active, `vace_ref_images` is delivered via the existing data channel. When not streaming, a minimal text-mode WebRTC offer is created with `initialParameters: { vace_ref_images: [path] }` to set the reference image in Scope without starting a full video stream.

---

## Deployment

### Option A — Vercel (recommended for static tools)

The static tools deploy instantly to Vercel. The AI generation API also works via Vercel serverless functions.

**What works on Vercel:**
- ✅ All static tools (Synthograsizer, PromptCraft, Glitcher, DAW, Metadata Manager, Legacy)
- ✅ Template generation (`TEMPLATE GEN` button)
- ✅ AI text generation
- ✅ Image generation (Gemini / Imagen)
- ⚠️ Batch operations (may hit 60s serverless timeout on large batches)

**What requires the local server:**
- ❌ Video generation (FFmpeg + long execution time)
- ❌ ChatRoom (needs the Node.js backend on port 3001)
- ❌ Real-time batch streaming
- ❌ OSC bridge

> ⚠️ **API key security on Vercel:** When using the hosted Vercel deployment, API keys entered via the in-app API button are transmitted to a shared serverless environment. There is no session isolation or authentication on the API endpoints. Use the local server for any real-key usage, or add authentication middleware before deploying to a shared host.

**Deploy to Vercel:**

1. Fork or connect this repo in your [Vercel dashboard](https://vercel.com)
2. Add your Google AI Studio API key as an environment variable:
   - Name: `GOOGLE_API_KEY`
   - Value: your key from [aistudio.google.com](https://aistudio.google.com)
3. Deploy — no build step needed

---

### Option B — Local Server (full features)

Runs the full FastAPI backend with all features including video generation, OSC bridge, and ChatRoom.

**Requirements:** Python 3.10+, pip

```bash
# Clone the repo
git clone https://github.com/quitters/synthograsizer.git
cd synthograsizer

# Install Python dependencies
pip install -r requirements.txt

# Start the server
python -m backend.server
```

Or on Windows, double-click / run:
```
start.bat
```

Then open **http://127.0.0.1:8000** in your browser.

**Configure your API key:**

Option 1 — via environment variable:
```bash
set GOOGLE_API_KEY=your_key_here   # Windows
export GOOGLE_API_KEY=your_key_here  # macOS/Linux
python -m backend.server
```

Option 2 — via the UI:
Open the Synthograsizer page → click the **API** button in the Connections sidebar → enter your key. It saves to `ai_studio_config.json` (gitignored, never committed).

---

### ChatRoom (local only)

ChatRoom requires its own Node.js backend in addition to the Python server:

```bash
# Terminal 1 — Python API server
python -m backend.server

# Terminal 2 — ChatRoom Node.js server
cd chatroom
npm install
npm start
```

Or use the provided batch scripts:
```
chatroom/start.bat           # starts both servers
chatroom/start-server-only.bat
chatroom/start-client-only.bat
```

To start everything at once (Python server + ChatRoom):
```
launch-all.bat
```

---

## Project Structure

```
synthograsizer-suite/
│
├── backend/                    # Python FastAPI server + Modular AI integration
│   ├── server.py               #   FastAPI app entry point & router mounting
│   ├── ai_manager.py           #   AIManager Façade (delegates to services)
│   ├── config.py               #   Centralized configuration & .env path loader
│   ├── helpers.py              #   API utilities (image decoding, JSON parsing)
│   ├── music_manager.py        #   Music generation backend (Lyria RealTime)
│   ├── osc_bridge.py           #   OSC UDP relay to Daydream Scope
│   ├── models/                 #   Pydantic request/response models
│   ├── routers/                #   Domain-specific API routers (chat, generation, templates, etc.)
│   ├── services/               #   Logic-heavy generation & analysis services
│   └── utils/                  #   Shared utilities (retry logic, image processing)
│
├── static/                     # All browser-based tools (served as web root)
│   ├── index.html              #   Hub / navigation page
│   ├── shared/                 #   Shared navbar, base CSS, favicon
│   ├── synthograsizer/         #   Main Synthograsizer app
│   │   ├── index.html          #     Main app page
│   │   ├── display.html        #     Fullscreen display window (OBS / projector output)
│   │   ├── css/
│   │   │   ├── style.css                 #   Base styles (Quantico font for output area)
│   │   │   ├── layout-options.css        #   Studio / Performance layout rules
│   │   │   └── synth-hardware-theme.css  #   Hardware synth theme (Casio PT-1 / Roland Juno aesthetic)
│   │   ├── js/
│   │   │   ├── app.js                    # D-pad UI, variable navigation, p5 panel, keyboard shortcuts
│   │   │   ├── studio-integration.js     # AI backend integration (image, video, batch, API key management)
│   │   │   ├── music-studio.js           # Music Studio panel (generation + transport)
│   │   │   ├── code-overlay-manager.js   # Template / p5.js code editor overlay
│   │   │   ├── template-loader.js        # Template import, export, normalization
│   │   │   ├── batch-generator.js        # Batch prompt generation with streaming
│   │   │   ├── midi-controller.js        # Web MIDI API (CC knobs + note triggers + action mappings)
│   │   │   ├── osc-controller.js         # OSC bridge client → POST /api/osc/* → osc_bridge.py
│   │   │   ├── scope-connector.js        # Unified Scope manager (auto-discovery, health polling)
│   │   │   ├── scope-video-client.js     # WebRTC canvas stream + image push via backend proxy
│   │   │   ├── display-broadcaster.js    # BroadcastChannel relay to display.html
│   │   │   ├── display-glitcher.js       # Glitcher effects engine for display window
│   │   │   └── glitcher-controls.js      # Glitcher panel UI (integrated sidebar)
│   │   └── templates/          #     50+ JSON templates
│   │       ├── strange-attractors.json
│   │       ├── cellular-tapestry.json
│   │       ├── lissajous-lab.json
│   │       ├── spring-physics-v2.json
│   │       └── ...             #     (see Templates section above)
│   ├── promptcraft/            #   PromptCraft Sequencer
│   ├── glitcher/               #   Glitch Art Studio
│   ├── daw/                    #   Digital Audio Workstation
│   ├── metadata-manager/       #   PNG Metadata extractor
│   ├── legacy/                 #   Original Synthograsizer + ComfyUI bridge
│   ├── chatroom/               #   ChatRoom frontend (built)
│   └── about/                  #   About page
│
├── chatroom/                   # ChatRoom Node.js backend + React frontend source
│   ├── server/                 #   Express + SSE + Gemini multi-agent orchestration
│   └── client/                 #   React frontend (Vite)
│
├── scope-synthograsizer/       # Daydream Scope plugin package (pip install)
│   ├── pyproject.toml          #   Package definition + entry point
│   └── scope_synthograsizer/
│       ├── node.py             #   Registers GlitcherPreprocessorPipeline with Scope
│       ├── template_engine.py  #   Template loading + prompt resolution utility
│       └── pipelines/glitcher/ #   NumPy/OpenCV glitch-art preprocessor pipeline
│           ├── pipeline.py     #   Pipeline class (frame in → effects → frame out)
│           ├── schema.py       #   Pydantic config (Literal dropdowns, float sliders)
│           └── effects/        #   pixel_sort, slice_fx, color_fx, direction_fx, spiral_fx
│
├── docs/                       # Reference documentation
│   └── scope/                  #   Daydream Scope API reference mirror
│
├── requirements.txt            # Python dependencies
├── vercel.json                 # Vercel deployment config
├── start.bat                   # Windows quick-start (Python server only)
└── launch-all.bat              # Windows quick-start (Python + ChatRoom Node.js)
```

---

## Template Format

Synthograsizer and PromptCraft share a common JSON template format, making templates portable between tools:

```json
{
  "promptTemplate": "A {{style}} {{subject}} with {{lighting}} lighting",
  "variables": [
    {
      "name": "style",
      "feature_name": "Art Style",
      "values": [
        { "text": "cyberpunk", "weight": 1 },
        { "text": "art nouveau", "weight": 1 }
      ]
    }
  ]
}
```

**Generative art templates** add an optional `p5Code` field containing a full p5.js sketch written in **instance mode** (the sketch receives a `p` argument — use `p.setup`, `p.draw`, `p.createCanvas`, etc.). The sketch reads live variable values via `p.getSynthVar("variableName")`:

```json
{
  "promptTemplate": "{{attractor_type}} attractor, {{color_scheme}}",
  "variables": [...],
  "p5Code": "p.setup = function() { p.createCanvas(800, 800); }; p.draw = function() { let type = p.getSynthVar('attractor_type'); ... };"
}
```

The sketch re-renders whenever a variable changes — no reload needed.

PromptCraft extends the base format with an optional `_promptcraft` block for sequencer state (BPM, step pattern, weights).

Exports from **Synthograsizer Mini** are also supported — PromptCraft automatically converts the mini export format on import.

See [SCHEMA.md](SCHEMA.md) for the full schema specification.

---

## License

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — Attribution required. Non-commercial use only.
