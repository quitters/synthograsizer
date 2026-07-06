# Synthograsizer Suite — June 6 Handoff & Conceptual Blueprint

> **A creative technologist’s playground:** A browser-based suite of tools that treats prompt engineering, generative AI, and real-time glitch art as live, tactile performance instruments.

---

## 1. System Metaphor: From "Dashboard" to "Creative Instrument"

To properly contextualize and build upon the **Synthograsizer Suite**, one must stop thinking of it as a set of standard AI generation forms or dashboards. Instead, think of it as an **electronic music synthesizer** or a **live performance instrument** (like an MPC sampler, a modular rack, or a guitar pedalboard):

*   **The Templates are Patches:** A synthesizer patch configures oscillators and filters. A Synthograsizer template configures prompt structures and variable spaces. Loading a template is like loading a new instrument preset.
*   **The D-pad & MIDI are the Keybeds:** Twisting knobs, tapping the D-pad, or playing MIDI CCs doesn't just change values—it "plays" prompt values, outputting resolved text strings in real-time.
*   **Daydream Scope is the Amplifier/Cabinet:** The resolved prompt strings and WebRTC video feeds from the canvas aren't just saved to disk; they are pushed directly into Daydream Scope's diffusion pipelines to generate high-fidelity, real-time visual outputs.
*   **The ChatRoom is the Band:** Instead of solo prompting, ChatRoom is an autonomous backing band of Gemini-backed agents who listen to your goals, check out your generated images, criticize the aesthetics, and suggest variations.

---

## 2. Reconceptualization Grid

The table below maps the existing components, their current technical implementation, and how they should be reconceptualized for future design, UX, or architectural refactoring.

| Component | Current Implementation | Core Function | Reconceptualization (Future-Facing Mental Model) |
| :--- | :--- | :--- | :--- |
| **Synthograsizer (Main App)** | Multi-themed Vanilla HTML/CSS/JS page served by FastAPI. | Resolves prompt placeholders via D-pad, keyboard, or MIDI inputs. | **The Workstation.** A unified physical console. Redundant themes are replaced with a single, highly dense, low-chrome hardware rack layout. |
| **Taste Profile** | Single-file HTML onboarding app with inline CSS. | 4-step stepper (Upload → A/B Taste Test → Synthesize → Profile Card & Agent Crew). | **The Calibration / Tuning Fork.** A ceremonial rite of passage where the user "tunes" the AI's aesthetic compass, generating a tailored JSON agent profile. |
| **ChatRoom** | Node.js Express server + Vite React frontend. | Autonomous conversation loop of Gemini agents with branching state. | **The Live Creative Band.** An embedded jam session panel. Agents collaborate on prompts and suggest real-time "riffs" on your main template. |
| **Glitcher** | Canvas pixel displacement script (Vanilla JS). | Applies destructive/non-destructive pixel sort and color effects. | **The Preprocessor/Pedalboard.** A modular FX chain that treats video frames or static images as raw waveforms before sending them to diffusion. |
| **SignalChain** *(new offshoot)* | Standalone Vanilla HTML/CSS/JS app (`CascadeProjects/SignalChain/`) with a Python no-cache dev server. | A virtual guitar pedalboard: chain typed image/audio/CV pedals, drive a p5.js generator, remix the whole board from one prompt. | **The Pedalboard, realized.** Glitcher's effects ported into physical-looking enclosures, sharing Synthograsizer's template/variable contract (`getSynthVar`, weighted-value selectors). See [§8](#8-signalchain--pedalboard-instrument-june-9-addendum). |
| **Scope Plugin** | Pip-installable companion Python module. | Hosts local FastAPI server and feeds WebRTC / OSC / Spout textures to Daydream Scope. | **The Output Interface / Jack.** The core nervous-system connector bridging web tech (FastAPI, WebRTC) to native GPU render pipelines. |

---

## 3. System Topology

The following diagram illustrates how data, media, and control signals flow through the unified Synthograsizer Suite:

```mermaid
graph TD
    %% Client Layer
    subgraph Client [Browser Interfaces (served from /static)]
        Hub[index.html Hub] --> MainApp[synthograsizer/ Main App]
        Hub --> Taste[taste-profile/ Onboarding]
        Hub --> Glitch[glitcher/ Glitch Studio]
        
        MainApp -->|MIDI CC/Notes| MIDIInput[MIDI Controller]
        MainApp -->|Arrow Keys| DPad[D-pad / Knob UI]
    end

    %% Backends
    subgraph PythonBackend [Python Backend (FastAPI - Port 8000)]
        ServerPy[server.py Router]
        AIManager[ai_manager.py Coordinator]
        TempEngine[template_engine.py]
        OSCBridge[osc_bridge.py]
        
        ServerPy --> AIManager
        AIManager --> TempEngine
        OSCBridge -->|OSC UDP Data| ServerPy
    end

    subgraph NodeBackend [ChatRoom Subsystem (Node/React - Port 3001)]
        ChatClient[ChatRoom React UI]
        ChatServer[Express SSE Server]
        Orchestrator[orchestrator.js]
        MediaStore[mediaStore.js]
        
        ChatClient -->|SSE & REST API| ChatServer
        ChatServer --> Orchestrator
        Orchestrator --> MediaStore
    end

    %% External Connections
    subgraph External [AI & Production Environments]
        Gemini[Google Gemini / Imagen 3 / Veo 2 APIs]
        Scope[Daydream Scope App - Port 7860]
    end

    %% Data Flows
    MainApp -->|JSON Templates| TempEngine
    AIManager -->|Generate Prompts / Image / Video| Gemini
    Orchestrator -->|Multi-Agent Collaboration / Tools| Gemini
    
    %% Main App Integrations
    MainApp -->|Send to Chat API| ChatServer
    MainApp -->|WebRTC Web Stream / OSC Data| Scope
    MainApp -->|Spout GPU Texture| OBS[OBS Studio] --> Scope
    
    %% Plugin Integration
    ScopePlugin[scope-synthograsizer] -->|Pip Plugin / FastAPI Bridge| ServerPy
```

---

## 4. Key Directories & Architectural Map

```
synthograsizer-suite/
├── backend/                       # FastAPI Server (Python)
│   ├── server.py                  # Server entry point, configures and mounts all routers
│   ├── ai_manager.py              # Central facade for Gemini/Imagen/Veo API calls
│   ├── osc_bridge.py              # Bridges MIDI inputs to UDP OSC client connections
│   ├── music_manager.py           # Handles generative backing track synthesis & BPM sync
│   ├── routers/                   # Endpoint routers (chat, generation, templates, etc.)
│   └── services/                  # Business logic (text/image/video engines, template parser)
│
├── static/                        # Frontend Workspace (HTML/CSS/JS served as root)
│   ├── index.html                 # The Hub (Landing page & launcher)
│   ├── shared/                    # CSS resets and central brand assets
│   ├── synthograsizer/            # Main Workbench (D-Pad, MIDI, Agent Composer, Canvas)
│   │   ├── index.html
│   │   ├── css/                   # Layouts & Themes (style.css, hardware-theme.css)
│   │   ├── js/                    # State controllers, MIDI mapping, batch generators
│   │   └── templates/             # Pre-configured prompt/variable JSONs
│   ├── taste-profile/             # Onboarding & agent config flow
│   └── glitcher/                  # Generative pixel destruction lab
│
├── chatroom/                      # Independent Node.js + React ChatRoom subsystem
│   ├── server/                    # Express SSE backend (Gemini agent orchestrator)
│   └── client/                    # React frontend for agent group discussions
│
├── scope-synthograsizer/          # Daydream Scope Integration Package (Python)
│   ├── scope_synthograsizer/
│   │   ├── node.py                # Registers companion & glitcher pipelines inside Scope
│   │   ├── web_server.py          # FastAPI bridge connecting Scope inputs to Synthograsizer
│   │   └── pipelines/             # OpenCV preprocessors & WebRTC streaming nodes
│   └── README.md                  # Plugin usage and parameter documentation
│
├── workflow-engine/               # Curated multi-agent execution pipeline
│   ├── workflowEngine.js          # Core scheduler executing structured prompt steps
│   ├── traceStore.js              # Captures prompt execution data for audits and replay
│   └── workflowTemplates.js       # Predefined multi-agent collaborative workflows
```

---

## 5. Core Data Schemes

Understanding the suite's custom data schemas is critical to tweaking or extending its features. All templates share the same structural base:

### A. Base Template Schema
Defined in `docs/SCHEMA.md`, this is the unified format for the main app.
```json
{
  "promptTemplate": "A {{style}} illustration of {{subject}} in {{lighting}}.",
  "variables": [
    {
      "name": "style",
      "feature_name": "Style",
      "values": [
        { "text": "watercolor", "weight": 3 },
        { "text": "pixel art", "weight": 1 }
      ]
    }
  ]
}
```

### B. Story Mode (Bespoke-Beat Schema)
Instead of varying a single template, Bespoke-Beat mode maps out sequential scenes while referencing global visual anchors for narrative continuity.
```json
{
  "story": {
    "title": "High Noon Showdown",
    "duration_seconds": 96,
    "beat_duration_seconds": 8,
    "anchors": {
      "world": "A dusty 1880s frontier town...",
      "style": "Cinematic lighting, 35mm film grain..."
    },
    "characters": [
      {
        "id": "sheriff",
        "name": "Sheriff",
        "anchors": "A tall man in a weathered leather duster..."
      }
    ],
    "beats": [
      {
        "id": 1,
        "act": "Act 1 - Arrival",
        "shot": "Wide establishing shot",
        "prompt": "A wide establishing shot of {{world}}, looking down the main street. {{style}}",
        "characters": ["sheriff"]
      }
    ]
  }
}
```

### C. PromptCraft Sequencer Schema
Saves the 16-step play grid, BPM, and envelope attributes directly into the template.
```json
{
  "_promptcraft": {
    "steps": 16,
    "bpm": 120,
    "seqData": {
      "style": [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]
    },
    "weightData": [1.0, 0.9, 0.8, 1.0, 1.0, 0.9, 0.8, 1.0, 1.0, 0.9, 0.8, 1.0, 1.0, 0.9, 0.8, 1.0],
    "adsr": { "a": 15, "d": 30, "s": 70, "r": 40 }
  }
}
```

---

## 6. Integration Interfaces

The Synthograsizer communicates outside the browser environment using three distinct interfaces:

1.  **OSC (Open Sound Control):** UDP network signals containing parsed prompt text and normalized variable settings. Used to drive external audio/video software (Max/MSP, TouchDesigner, Daydream Scope).
2.  **WebRTC Data & Video Channel:** Establishes a direct peer-to-peer stream from the browser's p5.js canvas to Daydream Scope, bypassing intermediate recording layers.
3.  **Spout GPU Texture Share:** Uses an OBS browser source window to capture `display.html` (the perform view) at high framerates with zero CPU overhead, outputting it directly into Spout receiver nodes.

---

## 7. Open Questions & Future Paths (Redesign Vector)

As the suite prepares for its next version, several key architectural and design questions must be resolved:

### 1. Typography & Tokens
*   **The Problem:** The main app's stylesheets are fragmented (`style.css` competes with `synth-hardware-theme.css` and `layout-options.css`). Color variables are hardcoded, and the Taste Profile app duplicates styles inline.
*   **The Path:** Build a unified styling sheet in `static/shared/css/base.css` with a central custom-property CSS token system for colors (`--bg-primary`, `--accent-color`), spacing, and typography (Inter, Space Grotesk, JetBrains Mono).

### 2. The D-Pad UI
*   **The Problem:** While highly keyboard-friendly, a literal 5-button D-Pad UI can feel clumsy on modern touch tablets or when navigating high-dimensional variables.
*   **The Path:** Explore alternative hardware metaphors (e.g., an abstract circular jog wheel, an interactive XY pad, or a 2D slider grid) while preserving absolute keyboard focus override.

### 3. State Management & Scaling
*   **The Problem:** Both FastAPI sessions and ChatRoom's Orchestrator manage state, memory, and media stores directly in-memory. Relaunching the server wipes out active sessions and image generation histories.
*   **The Path:** Move toward database persistence (e.g., SQLite for local, PostgreSQL for cloud) and push generated media attachments to local disk folders or S3 buckets, mapping references in database schemas.

---

---

## 8. SignalChain — Pedalboard Instrument (June 9 Addendum)

**SignalChain** is a new, standalone offshoot of the suite living at `CascadeProjects/SignalChain/` (its own repo, not inside `synthograsizer-suite/`). It takes the **pedalboard** mental model literally: a Windows-XP-styled app where you chain modular effect pedals, patch them with typed Bézier cables, drive a p5.js generator, and remix the whole board from a single prompt. It ports the **Glitcher** effects into hardware-looking enclosures and **reuses the suite's template/variable contract** rather than inventing a new one.

### Why it matters to the suite
SignalChain is the first consumer of `backend/services/template_engine.py`'s **p5 template format** outside the main app. A generated sketch is the same shape the suite already speaks — `{ name, promptTemplate, p5Code, variables[] }` with `{"text","weight"}` value objects — and the sketch reads its controls live via `p.getSynthVar('name')`, resolving them through `const` **lookup maps keyed by each value's text**. Anything the suite's `generate_p5_template` emits can load directly into a SignalChain P5 GEN pedal, where the template's variables become physical LCD selectors and feed the live prompt readout.

### Two p5 generators (mirrors `template_engine.generate_p5_template`)
The single backend method is split, on the client, into two explicit generators so prompts account for whether a project **synthesizes** or **transforms** imagery:

| Mode | `usesInput` | Contract | Example board |
| :--- | :--- | :--- | :--- |
| **Generative** | `false` | self-contained motion art; never calls `getRefImage()` | `examples/rainbow-morph.signalchain` |
| **Image Processor** | `true` | reads `p.getRefImage()` (160×120 `p5.Image`), samples `ref.pixels`, re-renders the upstream frame | `examples/halftone-press.signalchain` |

Each carries its own system prompt (`SC.P5.GENERATORS[mode].systemPrompt`) sent via `SC.P5.generate(mode, prompt)` — to the Preferences AI endpoint if set, otherwise to the dev server's **local Gemini bridge** (`POST /api/generate`, model `gemini-3.1-pro-preview`, key from `ai_studio_config.json` / `GEMINI_API_KEY`, never exposed to the browser). Offline, a template JSON can be pasted into the sketch editor and applied with **Load as Template**.

### Implemented so far (June 9)
- **Working XP window shell** — functional minimize / maximize / close, real menu + toolbar actions (no dead placeholders), ✓-checked toggle items, rich `data-tip` hover tooltips.
- **Live typed image pipeline** — `Image In → P5 Gen → Preview` with ComfyUI-style typed sockets, optional cable labels + flow arrows, opt-in **advanced routing** (drag arbitrary cables) and a one-shot **feedback loop**.
- **p5 template system + two generators** (above), with the prompt readout filled by the variable selectors.
- **Live Gemini template generation** — `devserver.py` bridges `POST /api/generate` to Gemini (threaded server; JSON-mode responses; tolerates wrapped/snake-case output; `function(p){}`-wrapped sketches are unwrapped client-side since the runner executes `p5Code` as a function *body*). The Generate dialog picks the model: **Gemini Flash** (`gemini-3.5-flash`, ~30 s, default) or **Gemini Pro** (`gemini-3.1-pro-preview`, 1–2 min); the server allowlists both. The key file `ai_studio_config.json` is git-ignored **and** blocked from static serving (403).
- **Free pedal layout** — drag the enclosure to move a pedal anywhere, drag the bottom-right screw to resize (50–200%, dbl-click resets), View → Auto-Arrange resets all. Offsets/scale persist as `ui:{x,y,scale}` per board entry in `.signalchain`. Cables re-anchor live during drags and via a ResizeObserver whenever an enclosure changes size (this also fixed cables detaching from sockets after a tall template loaded). **Connections → Re-slot Chain by Position** rewires signal order to match the visual arrangement.

### Gap-closing pass (June 10)
- **Real graph engine** — `pipeline.js` now evaluates **topologically** over the non-feedback cables (patched graphs work regardless of board-array order) and **mixes multi-input** connections (per-pixel average; feedback cables read last frame's output = one-frame delay loops).
- **MIDI Learn implemented** — Ctrl+M, touch a knob, move a CC → mapped (`{cc: {pedal, ki, label}}`, persisted in `localStorage["sc.midimap"]`, re-attached on device hot-plug, applied live with pipeline re-eval). Show MIDI Map lists real bindings.
- **CV → p5** — sketches read `p.getSynthVar('cv_amp' | 'cv_pitch' | 'cv_bright')` from any active Vox pedal's analyser (cached ~16 Hz; autocorrelation pitch). The Vox scope display now draws the **real mic waveform**. Both Gemini generator system prompts document the taps.
- **Video In pedal** (`videoin`) — webcam (`getUserMedia`) or looping video file (click display); frames drive per-frame chain evaluation via `SC.anyVideoLive()`. Streams stopped on delete/rebuild.
- **Export & record** — File → Export Frame (PNG, 4× nearest-neighbour 640×480) and Record Video (MediaRecorder webm, canvas captureStream fed each rAF).
- **Remix via Gemini** — the prompt bar now POSTs `{task:"remix", prompt, board, catalog}` to `/api/generate`; the server wraps it in a schema system prompt; the client **sanitizes** the returned project (pipeline-capable pedal types only, indices remapped, cables/binds validated, linear fallback routing). Badge shows **⚙ Gemini** when the bridge has a key; offline workflows remain the fallback.
- **Library manager** — Pedals → Template Library → Manage Library…: per-item Load/Delete over the whole component library.
- **Smoke tests** — `node tests/smoke.js`: syntax-checks all modules, validates the pedal catalog, the example boards, and index.html script refs.

### Glitcher port wave 2 (June 10, `js/suitefx.js`)
Ported from `static/glitcher/effects/non-destructive/new-filters/` + `filter-effects.js` into five new pedals (36 modes): **ARTISTIC** (oil/water/pencil/comic/hatch/pointillism/stained-glass/mosaic), **CYBERPUNK** (neon glow map/synthwave/matrix/rain/scan/hologram), **EXPERIMENT** (kaleido/mirror/fractal/tunnel/warp-field/chroma/databend/reality-glitch — time-based modes re-evaluate per frame via `SC.SuiteFX.anyAnimated()`), **WARP** (pinch/bloat/twirl/liquify/push/pull), **TEXTURE** (4 edge kernels/emboss/moblur/vignette/grain). Plus two new pedal *classes* borrowed conceptually:
- **MASK MIX** (selection-engine concept) — 2 image inputs, per-socket `upstreamAt()`; select by bright/dark/edges/hue with threshold+feather+invert; Show=Mask previews the matte.
- **SEQ** (PromptCraft concept) — steps the right-hand neighbour's chosen toggle at BPM (cycle/ping-pong/random) from the display loop; `autoRoute` now bridges signals over non-matching pedals.
- 🎲 randomize honours template `{text, weight}` values (weighted picks; sketch selector exempt).
~~Remaining borrows~~ → **done (June 10, second pass):**
- **💡 Riffs** — prompt-bar button (visible when the bridge has a key) POSTs `{task:"riffs", board}` → Gemini returns 5 board-aware remix prompts rendered as clickable chips; click fills the prompt and remixes.
- **MIDI soft takeover** — hand-dragging a knob disengages its CC; the controller must sweep past the knob's current value (±5/127) to pick it up again. Status bar shows the pickup target. (`_engaged` is session-only, stripped from the persisted map.)
- **Suite template sync** — `devserver.py` mirrors every saved p5 template into `../synthograsizer-suite/static/synthograsizer/templates/signalchain-<name>.json` using the suite's `{promptTemplate, variables, tags}` schema (best-effort, only when the sibling checkout exists).
~~Hi-res render path~~ → **done:** `SC.renderHiRes(scale)` re-evaluates the whole chain at scale× (sources redrawn full-size, p5 canvases upscaled smooth, every effect re-processed) — Export Frame now produces a true 640×480 re-render in ~80 ms.
~~Perform view~~ → **done:** View → Open Perform View pops a chrome-less 640×480 output window fed from the display loop (the suite's `display.html`/OBS-capture pattern → Spout).
Still open: `scope-video-client.js` WebRTC out to Daydream Scope (needs Scope running on :7860 to build against and verify).
- **Auto-backing-up component library** — every created template / pedal preset is saved to `localStorage` **and** (when the dev server is up) to `library/<kind>/<name>.json` on disk via a small REST API (`GET/POST/DELETE /api/component(s)` added to `devserver.py`). Reload from **Pedals → Template Library**.
- **Projects & presets** — New / Open / Save / **Save As…** `.signalchain` boards, **Recent Boards**, single-pedal `.scpedal` presets — all inlining p5 code + the variable layer (Q4 "inline source" decision).
- **Prompt remix with hybrid cueing** — params apply live, structural changes stage a **CUE → ▶ Commit** (Q3 decision); full undo/redo.
- **Light Web Audio** — delay/echo + Vox mic, with **microphone / output device pickers** and Web-MIDI enumeration in Preferences (Q2 decision).

### Run / files
```bash
cd CascadeProjects/SignalChain
python devserver.py 5179        # no-cache static server + library API + Gemini bridge
# open http://localhost:5179
# AI generation: put {"api_key": "..."} in ai_studio_config.json (git-ignored)
# or set GEMINI_API_KEY; override the model with GEMINI_MODEL
```
Frontend modules: `js/{data,library,audio,p5node,board,pipeline,project,displays,interactions,main}.js`. Design + decisions live in `docs/DESIGN.md` and `docs/OPEN_QUESTIONS.md` (Q1–Q7 all resolved). Example boards in `examples/`.

### Next vectors
- ~~Wire `SC.P5.generate()` to a real endpoint~~ → **done (June 9).** ~~Route the board-remix prompt through Gemini~~ → **done (June 10).** ~~CV-reactive variables~~ → **done (June 10).**
- Output integrations: WebRTC / Spout / OSC out to Daydream Scope (the suite's "amplifier" tier) — recording/PNG export exist, the streaming jack doesn't yet.
- Quality dial: the working resolution is fixed at 160×120; a hi-res render path for export would lift the ceiling.
- Optional: sync the on-disk `library/` back into the suite's shared template store so components are portable across both apps.

---

> [!TIP]
> **To start both backends at once (Windows):** Double-click `launch-all.bat` at the root. This spins up the local Daydream Scope engine, runs npm start inside `chatroom/`, and boots the Python FastAPI backend on port 8000.
