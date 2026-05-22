# Synthograsizer Suite — Claude Design Handoff

## What this folder is

A self-contained brief for [Claude Design](https://claude.ai/design) to propose redesigns of three surfaces in the **Synthograsizer Suite**: the main app, the Taste Profile onboarding flow, and the landing/hub page.

Everything Claude Design needs is in this folder. You shouldn't need to reach into the parent repo.

## What Synthograsizer is

A browser-based creative toolkit for **prompt-driven generative art and live performance**. The core app is a D-pad/MIDI-controlled prompt template engine with a live p5.js canvas, AI image/video generation (Google Imagen / Veo), and a multi-agent "Agent Studio." It's used by a solo creative technologist for both studio work and live AV performance, often projected through OBS or piped into Daydream Scope.

The suite is a set of modular static web apps served by a Python FastAPI backend. Each tool (synthograsizer, taste-profile, glitcher, promptcraft, etc.) is its own HTML+CSS+JS app sharing a backend API.

## How to use this folder

Read in order:

1. **`01-DESIGN_PHILOSOPHY.md`** — Audience, tone constraints, the kind of directions we want to explore.
2. **`02-UX_REQUIREMENTS.md`** — Per-surface structural inventory, must-keep behaviors, known pain points.
3. **`03-FILE_MANIFEST.md`** — What each file in `sources/` is, what to focus on while reading it.
4. **`04-OPEN_QUESTIONS.md`** — Decisions to make together before producing v1.

Then look at `sources/` for the actual current HTML/CSS.

## Scope

**In scope:**
- `sources/synthograsizer/` — main app
- `sources/taste-profile/` — onboarding/agent configurator
- `sources/landing/` — marketing/hub page

**Out of scope:**
- Glitcher (separate in-progress refactor)
- Backend / API surfaces (no UI redesign needed)
- ChatRoom (separate Node/React app)
- Template editor internals (data-driven, governed by `docs/SCHEMA.md` in the parent repo)

## Ask

Propose **2–3 distinct directions** for the main app first. Don't commit to one aesthetic up front — see `01-DESIGN_PHILOSOPHY.md` for the constraints that should shape those directions.
