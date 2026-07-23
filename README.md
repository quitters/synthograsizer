# Synthograsizer Suite

> Browser-based toolkit for generative art, AI image/video generation, and live performance — built for creative technologists.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/quitters/synthograsizer)](https://github.com/quitters/synthograsizer/commits/main)

---

## What's Inside

| Tool | Description |
|------|-------------|
| **Synthograsizer** | D-pad prompt template engine with MIDI, live p5.js canvas, Image/Video Studio, Agent Studio, and Display Window |
| **Taste Profile** | Onboarding flow — drop your finished work, take an A/B taste test, get an AI agent crew tuned to how you create |
| **Glitcher** | Professional glitch-art studio — destructive & non-destructive pixel effects, selection system, recording |
| **ChatRoom** | Multi-agent autonomous AI conversations powered by Gemini — custom personas, memory, image generation |
| **Videorama** | Prompt → a finished set of stylized Veo video clips — brief writer, checkpointed shot-by-shot pipeline, per-shot Inspector (retake, extend, reimagine), QC grading, budget caps. Local-only. |
| **Scope Plugin** | [`scope-synthograsizer`](scope-synthograsizer/) — pip-installable Daydream Scope preprocessor pipeline |

---

## Quick Start

### Option A — Hosted (no install)

**[synthograsizer.com](https://synthograsizer.com)** — sign in with Google, get **300 credits a
month, free**. Text costs ⚡1–5 per call, images ⚡4–15; the balance refills on your first visit
each month. Anonymous visitors can open the app and play with templates, variables, and knobs —
only the AI calls need an account.

Generated images and video can be saved to **My creations** (in the account menu) — stored
privately to your account, kept until you delete them. Video and music generation are local-only
for now: a single Veo clip can cost more than a month of everyone else's text generation.

Everything below applies to running it yourself, which has no credit limits and unlocks the
local-only tools.

### Option B — Local server (full features)

**Requirements:** Python 3.10+

```bash
git clone https://github.com/quitters/synthograsizer.git
cd synthograsizer
pip install -r requirements.txt
python -m backend.server
```

Open **http://127.0.0.1:8000** → pick a tool from the hub.

**API key:** Click **⚙ Settings** in the Synthograsizer header (or the **API** chip in the connections strip) and enter your [Google AI Studio](https://aistudio.google.com) key. It saves to `ai_studio_config.json` (gitignored, never committed). Or set `GOOGLE_API_KEY` as an environment variable before starting the server.

### Gemini API mode

Gemini-model calls (text, vision, image generation) use Google's **Interactions API** by
default — every request is sent stateless (`store=false`), so nothing is retained
server-side at Google. Content filtering in this mode is Google-managed. If the managed
filtering blocks too much of your artistic work, **⚙ Settings → Backend & Safety →
Google API** switches to the legacy **generateContent** API, which honors the
per-category safety thresholds in the same panel. Veo video, Imagen, and Lyria music are
unaffected by this switch.

### Local models (Ollama / LM Studio) — optional

Text generation (templates, narratives, agent profiles, chat) can run on your own
hardware instead of Google: open **Settings → Backend & Safety**, pick **Local model**,
and point it at any OpenAI-compatible endpoint (Ollama default: `http://localhost:11434/v1`).

- **Tier semantics:** on the local tier Synthograsizer applies no content filters of its
  own — your hardware, your discretion, within the [Terms](static/terms/index.html)
  acceptable-use rules, which apply regardless of backend. On the Google tier, Google's
  safety filters and Prohibited Use Policy apply; the panel's per-category thresholds are
  honored in the legacy generateContent API mode (on the default Interactions API,
  filtering is Google-managed — see *Gemini API mode* above).
- **Mixed-mode v1:** images, video, and music always generate via Google (a key is still
  needed for those). Multimodal template modes (image-reference remix, hybrid) also use Google.
- **Caveat:** strict-JSON features (template generation, p5 sketches) are demanding —
  small local models will sometimes fail schema validation; errors surface honestly.
- **ChatRoom is separate:** the multi-agent ChatRoom app is hard-wired to Gemini and does
  not follow the backend tier.

Compliance posture, risk register, and the hosted-mode hardening switches
(`SYNTH_HOSTED`, `RETENTION_DAYS`, rate limits) are documented in
[docs/COMPLIANCE_ROADMAP.md](docs/COMPLIANCE_ROADMAP.md).

**Windows shortcut:** double-click `start.bat` (Python server) or `launch-all.bat` (Python + ChatRoom Node.js).

### Option C — Deploy your own hosted instance

The service that runs `synthograsizer.com` is in this repo: Cloud Run + Cloud SQL, Google
sign-in, credit metering, and per-user storage, all behind env flags that are **off by default**
(a plain local install is unaffected by any of it). See
[docs/DEPLOY_CLOUDRUN.md](docs/DEPLOY_CLOUDRUN.md) for the runbook and
[docs/HANDOFF_SERVICE_LAUNCH.md](docs/HANDOFF_SERVICE_LAUNCH.md) for what's running and why.

> **Note:** `vercel.json` in this repo is a **reverse proxy to Cloud Run**, not a deploy target —
> Vercel can't run the Python backend. Video generation, OSC bridge, and ChatRoom require a real
> server either way.

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
- **Image & Video Studio** — Gemini image generation (Flash / NB2 / Pro) and Veo video generation, driven by the current prompt
- **Agent Studio** — multi-agent AI conversation panel embedded in the tool; send generated images to agents for critique and receive back image prompts
- **Glitcher Studio** — the full Glitcher app embedded as a modal; pull the latest Image Studio output or a live p5.js frame, glitch it, and send the result back to the output or save it as an artifact
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
│   ├── videorama/            #   Batch video synthesis dashboard (local-only)
│   └── shared/               #   Shared navbar, base CSS, favicon
│
├── chatroom/                 # ChatRoom Node.js backend + React frontend
│   ├── server/               #   Express + SSE + Gemini orchestration
│   └── client/                #   React (Vite)
│
├── scripts/film_factory/     # Videorama's pipeline engine (develop/render/assemble)
│                              #   + CLI (`python -m scripts.film_factory <stage>`)
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

## Roadmap

The 2026-07-20 gallery slice is **done** — download button (live), thumbnails, and
templates-in-My-creations with Load-template all shipped; engineering detail and the consent
analysis are in
[docs/HANDOFF_CLOUD_STORAGE.md](docs/HANDOFF_CLOUD_STORAGE.md#roadmap--next-slice-requested-2026-07-20).
Template saves are **explicit only** (auto-save still needs Terms v0.4).

Next up:

| | Item | Notes |
|---|---|---|
| 1 | **Save buttons on batch-grid & Smart Transform results** | `generation_id` already flows from those endpoints; `saveArtifact` / `makeThumb` are reusable — frontend-only. |
| 2 | **Stripe paid tier** | Schema already has `tier` + `purchase` ledger rows; needs the webhook + checkout flow. |
| 3 | **Hosted ChatRoom** | Currently local-only (the launch is gated with an honest message on hosted). Needs the Node backend hosted **and** its autonomous multi-agent Gemini spend routed through credit metering first — a project in its own right. |

Also open: multi-instance scaling (needs shared rate-limit/budget state first); auto-save
templates behind Terms v0.4.

---

## License

[MIT](LICENSE)
