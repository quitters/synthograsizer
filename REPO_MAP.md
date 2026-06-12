# Repository Map — Synthograsizer Suite

> **Purpose of this file:** an orientation map for humans and LLMs. It explains what every top-level folder is for, where the important editable files live, how requests are routed, and which directories are stale / duplicated / untracked so they can be safely ignored or cleaned up. Paths are relative to the repo root.

**One-line description:** Browser-based toolkit (FastAPI + static JS front-ends) for generative art, AI image/video generation, multi-agent chat, and live performance.

---

## 1. The big picture — how it runs

There are **two independent servers** plus a pile of static browser tools:

| Server | Stack | Entry point | Serves |
|--------|-------|-------------|--------|
| **Main API** | Python / FastAPI | [`backend/server.py`](backend/server.py) (`python -m backend.server`, port 8000) | All `/api/*` endpoints **and** mounts `static/` as the web root |
| **ChatRoom** | Node.js / Express + React | [`chatroom/server/index.js`](chatroom/server/index.js) (`npm start` in `chatroom/`) | The ChatRoom app only |

- **Local dev:** `start.bat` (Python only) or `launch-all.bat` (Python + ChatRoom). The Python server mounts `static/` at `/`, so browser tools and API live on the same origin.
- **Vercel deploy:** [`vercel.json`](vercel.json) routes `/api/*` → `backend/server.py` and everything else → `static/`. Video gen, OSC, music, and ChatRoom do **not** work on Vercel (need the local server).
- **Request flow:** browser tool in `static/` → `fetch('/api/...')` → a router in `backend/routers/` → `AIManager` façade → a service in `backend/services/` → Google GenAI (Gemini / Imagen / Veo / Lyria). **Text** generation routes through `services/llm_router.py`, which follows the backend tier in `backend/policy.py`: `google` (default) or `local` (OpenAI-compatible endpoint — Ollama / LM Studio). Image/video/music are Google-only (mixed-mode v1).

---

## 2. `backend/` — Python FastAPI server ⭐ (primary editable surface)

The AI brain. Routers are thin HTTP handlers; real logic lives in `services/`, fronted by the `AIManager` singleton.

```
backend/
├── server.py            # Entry point. Mounts all routers + static/. Hosted-mode rate limiting + retention task live here.
├── ai_manager.py        # AIManager façade — delegates to every service in services/. Also exports normalize_template().
├── config.py            # API key loading (ai_studio_config.json / GOOGLE_API_KEY), model names, constants.
├── policy.py            # ⭐ Backend-tier + safety policy: google|local tier, hosted pinning (SYNTH_HOSTED), safety precedence.
├── providers/           # Text-generation providers: google_text.py (genai wrapper), openai_compat.py (Ollama/LM Studio).
├── helpers.py           # decode_base64_image(), parse_llm_json(), SafetyBlockedError — shared by routers.
├── osc_bridge.py         # Singleton UDP OSC client → Daydream Scope. Used by routers/osc.py.
├── music_manager.py     # Lyria RealTime music session (Google GenAI WebSocket). Used by routers/music.py.
│
├── routers/             # ── One file per API domain. This is where endpoints are defined. ──
│   ├── chat.py          #   POST /api/chat
│   ├── generation.py    #   POST /api/generate/{text,text/stream,image,video,narrative,...}, /api/batch/text
│   ├── templates.py     #   POST /api/generate/template, /template-from-analysis, /api/save-template
│   ├── analysis.py      #   POST /api/analyze/image-to-prompt, /api/analyze/batch
│   ├── video_tools.py   #   POST /api/video/combine
│   ├── metadata.py      #   POST /api/extract-metadata(/bulk)
│   ├── scope.py         #   POST/GET /api/scope/{save-asset,discover}
│   ├── osc.py           #   POST/GET /api/osc/{send-prompt,send-param,config,status}
│   ├── music.py         #   GET /api/music/status, WS /ws/music
│   ├── sessions.py      #   CRUD /api/sessions — saved Composer session presets (disk-backed)
│   ├── outputs.py       #   /api/save-output, /api/list-outputs/{kind}, get/delete — local-disk persistence for browser stores
│   ├── feedback.py      #   POST /api/feedback — JSONL store (block reports + general feedback)
│   └── system.py        #   POST /api/config (key/tier/safety), GET /api/health, GET /api/backend/local/models
│
├── services/            # ── Generation engines (the actual model calls / logic). ──
│   ├── llm_router.py    #   Text-generation choke point — routes to Google or local tier per policy.py
│   ├── text_gen.py      #   Text + streaming + chat (via llm_router)
│   ├── retention.py     #   Hosted-mode hourly purge of old outputs (RETENTION_DAYS)
│   ├── image_gen.py     #   Imagen image generation (uses utils/retry.py)
│   ├── video_gen.py     #   Veo video generation (long-poll)
│   ├── analysis.py      #   Image→prompt and batch analysis
│   ├── template_engine.py # Template generation/normalization logic
│   ├── narrative.py     #   Story/narrative generation
│   └── workflow.py      #   Multi-step workflow execution (Python side)
│
├── models/requests.py   # Pydantic request models
└── utils/
    ├── image_utils.py
    └── retry.py         # retry_on_transient() decorator
```

**To add/modify an endpoint:** edit the relevant `routers/*.py`, put heavy logic in `services/*.py`, wire it through `ai_manager.py`, and (if it's a new router file) register it in `server.py`.

---

## 3. `static/` — browser tools ⭐ (primary front-end surface, = web root)

Everything here is served at `/`. `static/index.html` is the hub that links to each tool.

```
static/
├── index.html            # Hub / landing page navigation
├── about/index.html
├── css/index.css         # Landing page styles
├── shared/               # Shared across all tools: navbar.js, base.css, favicon
│
├── synthograsizer/       # ⭐ THE MAIN TOOL — D-pad prompt engine + studios
│   ├── index.html        #   Main app shell
│   ├── display.html      #   Output window (OBS/projector via BroadcastChannel)
│   ├── av.html, demo.html, agent-composer.html, changelog.html
│   ├── js/               #   ~45 modules — see "Synthograsizer JS map" below
│   ├── css/              #   style.css + per-feature stylesheets + themes
│   ├── templates/        #   ~60 JSON templates (p5.js art + AI prompt templates)
│   ├── templates-av/     #   Audio-visual templates (+ _index.json manifest)
│   └── *.md / *.txt      #   LLM template-authoring guides & system prompts (docs, not code)
│
├── glitcher/             # ⭐ Glitch Art Studio — standalone pixel-effects app
│   ├── index.html, v2.html, main.js
│   ├── core/             #   canvas-manager, media-manager, recording, preset-manager,
│   │   └── effect-system/ #     effect-chain-manager, effect-factory, render-pipeline, registry
│   ├── effects/
│   │   ├── destructive/      #  color, direction, pixel-sort, slice, spiral
│   │   └── non-destructive/  #  CSS-filter effects + new-filters/ (artistic, cyberpunk, dithering...)
│   ├── selection/, ui/, utils/, config/
│   └── styles/           #   effect-studio.css (Studio mode — flattened, was an 8-file @import chain),
│                         #     default-mode-modern.css + ui-tidying.css (loaded by index.html), embed.css
│
├── taste-profile/index.html   # Standalone "taste profile" surface
├── terms/index.html      # Terms & Privacy page (draft v0.1, hardware-themed; linked from hub + about footers)
└── chatroom/             # ⚠️ BUILT ARTIFACT — compiled ChatRoom client (assets/index-*.js/.css)
                          #   Generated from chatroom/client/ via Vite. Do NOT hand-edit; rebuild instead.
```

### Synthograsizer JS map (`static/synthograsizer/js/`)
Grouped by concern, since this is the densest editable area:

- **Core app:** `app.js`, `config.js`, `template-loader.js`, `template-normalizer.js`, `text-renderer.js`, `debug-log.js`, `demo-mode.js`
- **Controls / input:** `knob-controller.js`, `control-surface.js`, `midi-controller.js`, `composer.js`
- **Studios:** `agent-studio.js`, `agent-profiles.js`, `music-studio.js`, `glitcher-studio.js`, `studio-integration.js`, `batch-generator.js`
- **Output / display:** `display-broadcaster.js`, `display.html` logic, `display-glitcher.js`, `glitcher-controls.js`, `code-overlay-manager.js`
- **Scope integration:** `scope-connector.js`, `scope-video-client.js`, `osc-controller.js`, `osc-mapping-ui.js`, `osc-panel-ui.js`, `resolume-presets.js`
- **Storyboard / narrative:** `story-engine.js`, `storyboard-panel.js`
- **Workflow / persistence:** `workflow-runner.js`, `trace-viewer.js`, `taste-profile-store.js`
- **Backend tier / consent:** `backend-safety-panel.js` (Backend & Safety section in the settings modal), `upload-consent.js` (one-time upload notice, capture-phase, also loaded by taste-profile)
- **AV mode:** `av-mode.js`, `analysis-functions.js`, `blob-bridge.js`, `bulk-import-method.js`

---

## 4. `chatroom/` — Multi-agent AI conversation app (separate Node stack)

Self-contained app with its own README, CHANGELOG, ARCHITECTURE.md. Powered by Gemini.

```
chatroom/
├── server/               # Express + SSE backend
│   ├── index.js          #   Entry
│   ├── routes/           #   agents.js, artifacts.js, chat.js
│   ├── services/         #   orchestrator.js (turn-taking), gemini.js, imageGen.js, tools.js, *Store.js
│   └── utils/tokenCounter.js
├── client/               # React (Vite) — SOURCE of static/chatroom build artifact
│   └── src/{components,hooks,utils,data,styles}/
├── data/workflows/       #   Saved workflows + traces/ (traces are gitignored debug output)
└── start*.bat            #   Launch helpers
```

**Edit the source here (`chatroom/client/`), not `static/chatroom/`.** The latter is the compiled output.

**Depends on `workflow-engine/`** (root-level, untracked) via `"workflow-engine": "file:../workflow-engine"` in `chatroom/package.json`. The server's `gemini.js` and `tools.js` import the workflow engine, style presets, and workflow templates from it — it is live infrastructure, not a superseded experiment. `workflow-engine/urlGuard.js` is the shared SSRF guard for server-side fetches (`synth_fetch`, ANALYZE_URL pre-check).

---

## 5. `scope-synthograsizer/` — Daydream Scope plugin ⚠️ (untracked / gitignored)

Pip-installable preprocessor pipeline for [Daydream Scope](https://scope.daydream.fm). **Excluded from git** via `.gitignore` ("Dev References"), but referenced by the README and present on disk.

```
scope-synthograsizer/
├── pyproject.toml
├── scope_synthograsizer/   # Package: node.py, template_engine.py, pipelines/
├── examples/, tests/
└── README.md, SCOPE_FEEDBACK.md
```

Per project memory, the glitcher is the only component intended to become a Scope plugin.

---

## 6. `docs/` — reference documentation

```
docs/
├── README.md             # Index
├── SCHEMA.md             # ⭐ Full template JSON schema — authoritative spec for template format
├── COMPLIANCE_ROADMAP.md # Risk self-assessment + Canada/GDPR/EU-AI-Act compliance phases (pairs with static/terms/)
├── agent-composer-plan.md
└── weekly-recap-2026-05-13.md
```

---

## 7. Support / config / meta

| Path | Purpose |
|------|---------|
| `tests/` | Pytest suite — backend only. Delegation + helpers, plus the tier system: `test_policy.py` (tier/hosted/safety precedence), `test_openai_compat.py` (local provider incl. the no-safety-params contract), `test_llm_router.py`, `test_system_config.py`, `test_feedback.py` |
| `requirements.txt` | Python deps |
| `start.bat` / `launch-all.bat` | Windows launchers |
| `.github/` | Issue/PR templates + `workflows/lint.yml` |
| `LICENSE` | MIT |
| `ai_studio_config.json` | **Secret** — API key, gitignored (present locally) |
| `design-handoff/` (tracked) | Design handoff package: philosophy/UX/manifest MD + `sources/` snapshot of landing/synth/taste-profile HTML+CSS for a designer. Static snapshot — diverges from live `static/` over time. |

---

## 8. ⚠️ Stale / duplicated / audit candidates

Flagged for cleanup review — an LLM auditing this repo should treat these with suspicion.

> **Cleanup log (2026-06-11):** Deleted four old design-concept notes from `static/glitcher/` that described already-completed redesigns and were not referenced by any code: `DEFAULT_MODE_REDESIGN.md`, `IMPROVEMENTS.md`, `UI_TIDYING.md`, `VISUAL_COMPARISON.md`. Kept `static/glitcher/libs/README.md` (install instructions). _(The `styles/fixes/README.md` mentioned in the original note was later removed in pass 4 below, when the fix CSS it documented was flattened into `effect-studio.css`.)_
>
> **Cleanup log (2026-06-11, pass 2):** Deleted `tmp/` + `scratch/` (duplicate throwaway model-listing scripts), `presentation/` (held only a node_modules, no source), root-level `node_modules/` (stray puppeteer leftovers — no root package.json; verified `chatroom/` and `workflow-engine/` carry their own complete node_modules), `static/synthograsizer/tweaks-panel.jsx` (orphan JSX, referenced by nothing), and stale ChatRoom bundles `index-BUUK5UFu.css` + `index-BmmzFUFp.js` (only `index-C3vqynrH.css` / `index-YBvEzLrD.js` are referenced by `static/chatroom/index.html`). Also removed the dead `generateAgentResponseSync` export from `chatroom/server/services/gemini.js` (never imported; referenced an undefined variable). **Reclassified `workflow-engine/`:** it is a live `file:../workflow-engine` dependency of `chatroom/` (imported by `gemini.js` and `tools.js`) — not superseded; do not delete.
>
> **Cleanup log (2026-06-11, pass 3):** Deleted `.design-handoff/` (untracked) — a raw Claude Design export bundle (chat transcripts + `.jsx` prototypes) superseded by the curated, tracked `design-handoff/` deliverable.
>
> **Cleanup log (2026-06-11, pass 4):** Glitcher CSS. Deleted `styles/fixes/quick-fixes.css` (orphan — not in the `@import` chain, referenced nowhere). **Flattened** the remaining `styles/fixes/` cascade into `styles/effect-studio.css`: the 7 imported fix files + `enhanced-effect-chain.css` were inlined in their exact original load order, so the resolved cascade is byte-identical (verified in-browser: Studio mode renders correctly, `.right-panel` responsive widths intact, zero console errors). Removed the now-empty `styles/fixes/` dir (its README documented files that no longer exist; the consolidated `effect-studio.css` header explains the history). The accreted-override redundancy (e.g. `.effect-module` was redefined 11× across the chain) is now visible in one file — deeper property-level dedup is a possible future pass but needs interactive UI-state testing to verify safely.

| Path | Issue |
|------|-------|
| `data/workflows/` (untracked) | Workflow checkpoints + traces. Runtime output, not source. |
| `.internal/` (gitignored) | Private planning/debug: AGENT-INTEGRATION-PLAN.md, GLIF-WORKFLOW-ANALYSIS.md, studio-effects-verification.js. Not public. |
| `static/synthograsizer/*.md/.txt` | LLM template-authoring guides + system prompts shipped inside the served static dir (publicly reachable). Functional (kept; `SYSTEM_PROMPT.txt` is the canonical external-LLM prompt, `QUICK_START_LLM.md` now references it instead of duplicating), but consider moving to `docs/`. |
| `static/` archived surfaces | `.gitignore` preserves but untracks `static/{legacy,promptcraft,daw,fun-stuff,metadata-manager}/` and `templates/_private/` — exist on disk, intentionally not in repo. |

---

## 9. Routing cheat-sheet (for mismatch audits)

- **Static page not loading?** Check `vercel.json` rewrites — only `/api/*`, `/synthograsizer`, and `/(.*)→static/$1` are defined. Anything else 404s on Vercel.
- **Endpoint 404?** Confirm the router is `include_router`-ed in `server.py:58-69` and the path prefix in the router matches (`/api/...`).
- **Feature works locally but not on Vercel?** Video (`video_tools`, `generation` video), OSC (`osc`), music (`music`), and ChatRoom require the local Python/Node servers — they're not in the Vercel build.
- **Template not appearing?** `static/synthograsizer/templates/` JSON must conform to `docs/SCHEMA.md`; AV templates also need an entry in `templates-av/_index.json`.
