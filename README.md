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
| **Fun Stuff** | Generative art gallery and character creator experiments | `/fun-stuff/` |

---

## What's New

### Synthograsizer — Major Feature Additions

**D-Pad / Knobs UI**
The main interface is now a D-pad navigator. Press ↑/↓ to move between variables, ←/→ to cycle through values. Knob-style controls display the current value and weight for each variable.

**MIDI Support**
Connect any MIDI controller to drive the D-pad UI with hardware knobs and pads. CC messages map to variable navigation; note messages trigger discrete actions. Configured via the MIDI panel in the sidebar.

**p5.js Live Panel**
Templates can embed a `p5Code` field containing a full p5.js sketch. When loaded, the sketch renders live inside the app and reads the current template variable values in real time via `p.getSynthVar("variableName")`. Changes to variables update the sketch instantly — no page reload needed.

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

**OSC Bridge**
Send the current prompt and variable state to [Daydream Scope](https://scope.daydream.fm) (or any OSC-compatible tool) over UDP. Configure host, port, and OSC address via the OSC panel. Supports auto-send on variable change or manual send-now. The Python backend includes `osc_bridge.py` — a FastAPI endpoint that forwards JSON payloads to OSC UDP.

**Scope Video Client**
Two WebRTC-based integration modes with Daydream Scope:
- **Frame capture** — POST the current canvas as a PNG to Scope's asset API for use as a reference image
- **Live stream** — Establish a WebRTC peer connection to stream the canvas at a configurable FPS with a data channel for real-time prompt updates

### Templates

Templates are JSON files shared across Synthograsizer and PromptCraft. The library has grown to 30+ templates across several categories:

**Generative Art (p5.js)** — Mathematical and procedural sketches with live variable control:
- `strange-attractors` — Lorenz, Clifford, DeJong, Rössler, and other dynamical systems
- `cellular-tapestry` — Game of Life, Brian's Brain, Cyclic CA, and other cellular automata
- `lissajous-lab` — Parametric Lissajous curves with frequency and phase variables
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

The Python backend (`backend/server.py`) provides:
- **Text generation** via Gemini (`gemini-2.0-flash`, configurable)
- **Image generation** via Imagen 3
- **Video generation** via Veo 2 (local only — requires FFmpeg)
- **Template generation** — LLM-powered JSON template creation from a description
- **OSC forwarding** (`osc_bridge.py`) — UDP relay to Daydream Scope or any OSC target
- **ChatRoom API** — SSE streaming for multi-agent conversations

---

## Deployment

### Option A — Vercel (recommended for static tools)

The static tools deploy instantly to Vercel. The AI generation API also works via Vercel serverless functions.

**What works on Vercel:**
- ✅ All static tools (Synthograsizer, PromptCraft, Glitcher, DAW, Metadata Manager, Legacy, Fun Stuff)
- ✅ Template generation (`TEMPLATE GEN` button)
- ✅ AI text generation
- ✅ Image generation (Gemini / Imagen)
- ⚠️ Batch operations (may hit 60s serverless timeout on large batches)

**What requires the local server:**
- ❌ Video generation (FFmpeg + long execution time)
- ❌ ChatRoom (needs the Node.js backend on port 3001)
- ❌ Real-time batch streaming
- ❌ OSC bridge

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

**Configure your API key (local):**

Option 1 — via environment variable:
```bash
set GOOGLE_API_KEY=your_key_here   # Windows
export GOOGLE_API_KEY=your_key_here  # macOS/Linux
python -m backend.server
```

Option 2 — via the UI:
Open the Synthograsizer page → AI Studio settings → enter your key. It saves to `ai_studio_config.json` (gitignored).

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
├── backend/                    # Python FastAPI server + AI integration
│   ├── server.py               #   API endpoints (image, video, template gen, chat)
│   ├── ai_manager.py           #   Google GenAI client (Gemini, Imagen, Veo)
│   ├── osc_bridge.py           #   OSC UDP relay to Daydream Scope / any OSC target
│   └── config.py               #   Model names and app settings
│
├── static/                     # All browser-based tools (served as web root)
│   ├── index.html              #   Hub / navigation page
│   ├── shared/                 #   Shared navbar, base CSS, favicon
│   ├── synthograsizer/         #   Main Synthograsizer app
│   │   ├── index.html          #     Main app page
│   │   ├── display.html        #     Fullscreen display window (OBS / projector output)
│   │   ├── css/
│   │   ├── js/
│   │   │   ├── app.js                    # D-pad UI, variable navigation, p5 panel
│   │   │   ├── studio-integration.js     # AI backend integration (image, video, batch)
│   │   │   ├── code-overlay-manager.js   # Template / p5.js code editor overlay
│   │   │   ├── template-loader.js        # Template import, export, normalization
│   │   │   ├── batch-generator.js        # Batch prompt generation with streaming
│   │   │   ├── midi-controller.js        # Web MIDI API (CC knobs + note triggers)
│   │   │   ├── osc-controller.js         # OSC bridge client (calls osc_bridge.py)
│   │   │   ├── osc-panel-ui.js           # OSC settings panel UI
│   │   │   ├── display-broadcaster.js    # BroadcastChannel relay to display.html
│   │   │   ├── display-glitcher.js       # Glitcher effects engine for display window
│   │   │   ├── glitcher-controls.js      # Glitcher panel UI (integrated sidebar)
│   │   │   └── scope-video-client.js     # WebRTC frame capture + stream to Scope
│   │   └── templates/          #     30+ JSON templates
│   │       ├── strange-attractors.json
│   │       ├── cellular-tapestry.json
│   │       ├── lissajous-lab.json
│   │       └── ...             #     (see Templates section above)
│   ├── promptcraft/            #   PromptCraft Sequencer
│   ├── glitcher/               #   Glitch Art Studio
│   ├── daw/                    #   Digital Audio Workstation
│   ├── metadata-manager/       #   PNG Metadata extractor
│   ├── legacy/                 #   Original Synthograsizer + ComfyUI bridge
│   ├── chatroom/               #   ChatRoom frontend (built)
│   ├── fun-stuff/              #   Character creator, generative art
│   └── about/                  #   About page
│
├── chatroom/                   # ChatRoom Node.js backend + React frontend source
│   ├── server/                 #   Express + SSE + Gemini multi-agent orchestration
│   └── client/                 #   React frontend (Vite)
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

**Generative art templates** add an optional `p5Code` field containing a full p5.js sketch. The sketch reads live variable values via `p.getSynthVar("variableName")`:

```json
{
  "promptTemplate": "{{attractor_type}} attractor, {{color_scheme}}",
  "variables": [...],
  "p5Code": "function setup() { createCanvas(800, 800); } function draw() { let type = p.getSynthVar('attractor_type'); ... }"
}
```

The sketch re-renders whenever a variable changes — no reload needed.

PromptCraft extends the base format with an optional `_promptcraft` block for sequencer state (BPM, step pattern, weights).

Exports from **Synthograsizer Mini** are also supported — PromptCraft automatically converts the mini export format on import.

See [SCHEMA.md](SCHEMA.md) for the full schema specification.

---

## License

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — Attribution required. Non-commercial use only.
