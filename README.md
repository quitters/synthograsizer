# Synthograsizer Suite

> Browser-based toolkit for generative art, AI image/video generation, and live performance — built for creative technologists.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/quitters/synthograsizer)](https://github.com/quitters/synthograsizer/commits/main)

---

## What's Inside

| Tool | Description |
|------|-------------|
| **Synthograsizer** | D-pad prompt template engine with MIDI, live p5.js canvas, Image/Video Studio, Agent Studio, and Display Window |
| **Glitcher** | Professional glitch-art studio — destructive & non-destructive pixel effects, selection system, recording |
| **ChatRoom** | Multi-agent autonomous AI conversations powered by Gemini — custom personas, memory, image generation |
| **Scope Plugin** | [`scope-synthograsizer`](scope-synthograsizer/) — pip-installable Daydream Scope preprocessor pipeline |

---

## Quick Start

### Option A — Local server (full features)

**Requirements:** Python 3.10+

```bash
git clone https://github.com/quitters/synthograsizer.git
cd synthograsizer
pip install -r requirements.txt
python -m backend.server
```

Open **http://127.0.0.1:8000** → pick a tool from the hub.

**API key:** Click the **API** button in the Synthograsizer sidebar and enter your [Google AI Studio](https://aistudio.google.com) key. It saves to `ai_studio_config.json` (gitignored, never committed). Or set `GOOGLE_API_KEY` as an environment variable before starting the server.

**Windows shortcut:** double-click `start.bat` (Python server) or `launch-all.bat` (Python + ChatRoom Node.js).

### Option B — Vercel (static tools + AI endpoints)

1. Fork this repo and connect it in your [Vercel dashboard](https://vercel.com)
2. Add environment variable `GOOGLE_API_KEY` → your key from [aistudio.google.com](https://aistudio.google.com)
3. Deploy — no build step required

> **Note:** Video generation, OSC bridge, and ChatRoom require the local server.

### ChatRoom (additional setup)

ChatRoom needs its own Node.js backend alongside the Python server:

```bash
# Terminal 1
python -m backend.server

# Terminal 2
cd chatroom && npm install && npm start
```

Or use `chatroom/start.bat` to launch both at once.

---

## Key Features

### Synthograsizer
- **D-pad / knob UI** — navigate variables with ↑↓←→ or a MIDI controller; weights and values update live
- **50+ templates** — p5.js generative art (attractors, boids, cellular automata, physics) and structured AI prompt templates
- **Image & Video Studio** — Imagen 3 image generation and Veo 2 video generation, driven by the current prompt
- **Agent Studio** — multi-agent AI conversation panel embedded in the tool; send generated images to agents for critique and receive back image prompts
- **Batch generation** — cycle or randomize across all variable combinations with streaming results
- **MIDI support** — map any CC or Note to variable navigation, template switching, or discrete actions
- **Live p5.js canvas** — sketches read variable values in real time via `p.getSynthVar()`; canvas streams to the Display Window
- **Display Window** — `display.html` outputs to OBS/projector via BroadcastChannel; runs Glitcher effects independently
- **Scope integration** — OSC prompt/variable relay, WebRTC canvas stream, and Spout GPU texture share for [Daydream Scope](https://scope.daydream.fm)
- **Perform mode** — minimal live layout with enlarged controls, hidden chrome, and full-screen output text

### Glitcher
- Pixel-level effects: direction shift, spiral, sort, slice, color channel displacement
- Non-destructive CSS filter layer: hue, saturation, brightness, blur, contrast
- Static image mode accumulates effects destructively across frames
- GIF/video mode resets per source frame
- Selection system, undo history, and recording

### ChatRoom
- Multiple Gemini-backed agents with distinct system prompts and memory
- Autonomous turn-taking with configurable speaking order
- Consensus detection — agents stop when they converge; adjustable sensitivity
- Image attachment support — agents see and discuss images in context

---

## Project Structure

```
synthograsizer-suite/
├── backend/                  # Python FastAPI server
│   ├── server.py             #   Entry point & router mounting
│   ├── ai_manager.py         #   AIManager façade (delegates to services/)
│   ├── routers/              #   Domain-specific API endpoints
│   └── services/             #   Generation engines (text, image, video, analysis)
│
├── static/                   # Browser tools (served as web root)
│   ├── index.html            #   Hub / navigation
│   ├── synthograsizer/       #   Main tool (templates/, js/, css/)
│   ├── glitcher/             #   Glitch Art Studio
│   └── shared/               #   Shared navbar, base CSS, favicon
│
├── chatroom/                 # ChatRoom Node.js backend + React frontend
│   ├── server/               #   Express + SSE + Gemini orchestration
│   └── client/               #   React (Vite)
│
├── scope-synthograsizer/     # Daydream Scope pip plugin
├── docs/                     # Reference documentation & schema specs
├── requirements.txt
├── vercel.json
└── launch-all.bat            # Windows: start Python + ChatRoom together
```

---

## Template Format

Templates are JSON files shared between Synthograsizer and any compatible tool:

```json
{
  "promptTemplate": "A {{style}} {{subject}} with {{lighting}} lighting",
  "variables": [
    {
      "name": "style",
      "values": [
        { "text": "cyberpunk", "weight": 1 },
        { "text": "art nouveau", "weight": 1 }
      ]
    }
  ]
}
```

P5.js templates add a `p5Code` field (instance-mode sketch). See [`docs/SCHEMA.md`](docs/SCHEMA.md) for the full specification.

---

## Scope Integration

Three integration channels connect Synthograsizer to [Daydream Scope](https://scope.daydream.fm):

| Channel | Transport | What it carries |
|---------|-----------|-----------------|
| OSC | UDP → Python backend | Prompt text + per-variable normalized values |
| WebRTC | Browser ↔ Scope | Live p5.js canvas stream + real-time prompt updates |
| Spout | OBS Browser Source → Spout plugin | GPU texture share of `display.html` |

All three are configured from the unified **Scope** panel in the sidebar.

---

## License

[MIT](LICENSE)
