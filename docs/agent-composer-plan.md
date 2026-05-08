# Agent Composer — Integration Plan

**Status:** in progress · Chunk A under way as of 2026-05-07
**Goal:** fold the v5 Agent Composer mockup ([`static/synthograsizer/agent-composer.html`](../static/synthograsizer/agent-composer.html)) into the main synthograsizer as a first-class mode and bridge it cleanly to the existing Agent Studio modal.

The mockup landed as a standalone page wired to real backends for profile load/save, AI generation (`/api/generate/template?mode=agent_profile`), and chatroom agent creation. Many surfaces are visual-only — variable knobs don't drag, drag-and-drop in the session builder is missing, the Run room shows a fake chat. This plan turns the mockup into a real product.

---

## Phase 0 — Architectural decisions

Settled before any code. Each line is a commitment, not a question.

1. **Mode model:** Composer is a third entry in the layout switcher (Studio / Perform / Composer), additive — Studio remains the prompt-template tool, Composer is the agent tool.
2. **Mounting strategy:** keep React + Babel-standalone (chatroom is already React; Babel-standalone is acceptable here too). Don't port to vanilla JS.
3. **Run-room semantics:** Composer Room 4 hands off to the existing Agent Studio modal. Composer is the authoring surface; Agent Studio is the execution surface. One source of truth for live conversation.
4. **Profile schema:** v5 is canonical — `{ id, name, icon, color, category, description, bioTemplate, variables[{name, feature_name, valueIdx, values[{text, weight}]}], anchors{}, tags[] }`. Older profiles get migrated on load.

---

## Phase 1 — Mode toggle infrastructure

Composer becomes a synthograsizer mode rather than a standalone page.

- [`static/synthograsizer/index.html`](../static/synthograsizer/index.html): replace the standalone link with a real mode button (`<button class="layout-btn" data-mode="composer">`). Add `<div id="composer-mount">` in the main content area.
- Extract composer styles from [`agent-composer.html`](../static/synthograsizer/agent-composer.html) → [`static/synthograsizer/css/composer.css`](../static/synthograsizer/css/composer.css).
- Extract composer JSX → [`static/synthograsizer/js/composer.jsx`](../static/synthograsizer/js/composer.jsx). Include via `<script type="text/babel" src="js/composer.jsx">` in `index.html`.
- Add React + ReactDOM + Babel-standalone CDN scripts to `index.html`.
- Extend the existing layout-switcher JS to swap between `.synthograsizer-small` (default UI) and `#composer-mount`.
- Persist mode in `localStorage` under `synthograsizerMode` (do not collide with existing `synthograsizerLayout`).
- Decision: keep `agent-composer.html` as a fallback / dev page after extraction; revisit removal later.

---

## Phase 2 — Data model unification

The single hardest dependency for everything else.

- Promote v5 schema to canonical in [`static/synthograsizer/js/agent-profiles.js`](../static/synthograsizer/js/agent-profiles.js).
- Add `migrateProfileSchema(p)`: normalise legacy entries — string values become `{text, weight: 1}` objects, missing `valueIdx` defaults to 0, missing `tags`/`icon`/`color`/`description` get sensible defaults.
- Run migration once inside `AgentProfileStore.loadAll()` and write back via `save`.
- Update `migrateLegacyAgentToProfile` so legacy `AS_AGENT_TEMPLATES` entries land with `tags: [{type:'builtin', label:'Built-in'}]`, an icon (extract leading emoji from name when present), a category (already there), and a description (use first sentence of bio).
- Replace the `SEED_PROFILES` array in the composer with a thin first-run check that uses the migrated AgentProfileStore as the source of truth.

---

## Phase 3 — Library room (real)

- Replace seed-data filtering with live filtering against AgentProfileStore + AS_AGENT_TEMPLATES.
- "My Profiles" filter: `tags.some(t => t.type === 'creator' && t.label === 'You')`.
- "Built-in" filter: `tags.some(t => t.type === 'builtin')`.
- Wire the four sidebar quick-actions:
  - **+ New Profile** → already wired (`createNew`).
  - **↑ Import JSON** → file input, parse, validate against schema, save.
  - **↓ Export All** → JSON download of `AgentProfileStore.loadAll()`.
  - **✦ Generate from Image** → call `/api/analyze/image-to-prompt` then feed result into the agent_profile template generator.
- Wire **⎘ Remix** on cards → clones profile with new id and `tags: [{type:'remix', label:'Remixed'}]`.
- Wire **▷ Test** → opens a small popover that sends one resolved-bio message to `/api/generate/text`.
- Add delete (long-press or right-click context menu — design needs this; mockup omits it).

---

## Phase 4 — Editor room

The variable-knob and bio-template surfaces in v5 are visual; making them interactive is most of this phase.

### Variable knobs (the headline gap)

- Replace static `KnobSVG` with a draggable component: pointer events, vertical drag = step through `valueIdx`, click = next value, double-click = reset to 0.
- Add keyboard support: focus + arrow keys.
- Persist `valueIdx` changes immediately via `setProfile`.
- Show a numeric weight editor on hover (inline +/- buttons next to the value pills).

### Bio template editing

- Token chip click currently calls `insertToken` — verify the textarea selection logic survives React re-renders (currently uses `document.querySelector('#bio-area')` which is fragile across multiple editors).
- Live token classification (var/anchor/unbound) on every keystroke — already works; debounce on large templates.
- "Click an unbound chip" should offer to add it as a variable or anchor (currently just shows `?`).

### Variables panel

- Drag-to-reorder rows (lightweight pointer-event implementation; no react-dnd dependency).
- Inline weight editing on value pills (currently only display).
- "Generate values for this variable" per row → calls Gemini with the variable name + a few existing values → suggests more.

### Anchors panel

- Anchor key rename (currently disabled input).
- Per-anchor "lock to display name" auto-binding for `agent_name` (currently re-bound on every name change — works, but should be visually flagged).

### Save / Save As / Auto-save

- **💾 Save Profile** → already happens via `updateProfile`; show "saved" toast.
- **⎘ Save As…** → prompt for new name, clone with new id, save.
- Auto-save indicator: debounced 1s timer, update the "Auto-saved 2s ago" footer in real time.

### Test Run

- Already wired to `/api/generate/text`. Needs polish: loading spinner on bubble, error retry, history persistence to localStorage so it survives navigation.

---

## Phase 5 — Session builder

### Drag-and-drop

- HTML5 drag/drop or pointer-event-based DnD: drag from roster → drop on a channel slot.
- Drag between channels to reorder.
- Drag back to roster to remove (or keep current ✕ button).

### Channel knobs

- Currently click toggles "lock". Keep, but also support knob drag inside each channel for live adjustment.
- "Locked" means the variable's current `valueIdx` is captured into `slot.overrides` and won't be re-randomised on launch.
- On hover preview a randomised value (so user understands what locking prevents).

### Channel volume fader

- Currently visual-only. **Recommendation: drop for v1.** Volume on a chat-agent is metaphor without mechanism unless the orchestrator respects per-agent turn-frequency weights — which would require Phase 8 work.

### Resolution mode toggle

- "once at start" — already implicit in current launch (each bio resolved once, agent created with that bio).
- "each turn" — needs Phase 8 backend support; ship UI greyed out with tooltip until then.

### Shared anchors

- Already wired. Need: anchor key rename, per-anchor delete (currently no delete), anchor templates ("Add common anchor → tone / output_rules / context").

### Session presets

- Whole-session save/load: `{name, agents:[{profileId, overrides}], sharedAnchors, goal, resolutionMode}`.
- Backend: extend [`backend/services/template_engine.py`](../backend/services/template_engine.py) or create `backend/routers/sessions.py` with CRUD endpoints, persist to `~/Synthograsizer_Output/JSON/Sessions/`.
- Frontend: **💾 Save Session** in launch-card, **▾ Load Session** dropdown in session header.

---

## Phase 6 — Run handoff to Agent Studio modal

Stop rendering a fake chat in Composer Room 4. Hand off cleanly.

- Drop the current Composer Room 4 chat surface (or hide it behind a feature flag).
- Replace **▶ Launch Session** behaviour:
  1. POST resolved agents to `/chatroom/api/agents` (already done).
  2. Set the goal in chatroom session state via existing chatroom API.
  3. Open the Agent Studio modal programmatically by triggering its existing `open()` method on `window.AgentStudio` (or whatever singleton the modal exposes).
  4. Switch the modal to "Group Chat" mode and trigger its **▶ Start** equivalent.
- The composer fades to background; the modal becomes the live surface.
- On modal close, optionally return user to Composer Room 3 with a "Continue editing this session" affordance.

What needs adding to [`static/synthograsizer/js/agent-studio.js`](../static/synthograsizer/js/agent-studio.js):

- A public `openWithSession({agents, goal, sharedAnchors})` method that bypasses the preset browser, takes a pre-built roster, sets the goal, and starts the session.
- A `showBackToComposerLink()` flag that, when true, renders a "← Back to Composer" pill in the modal header that emits an event Composer can listen for.

---

## Phase 7 — Bidirectional bridges

- **Agent Studio → Composer:** clicking ✎ next to an agent in the existing roster popover should open Composer's Editor room loaded with that agent's profile (read from AgentProfileStore by name match).
- **Existing "+ Add agent" form** in the modal stays — add a "Compose new agent" button next to it that links to Composer Library.
- **Recipes tab:** convert each recipe's `agentRoles` into a Composer session preset, so users can "Open this recipe in Composer" to customise before running.
- **Solo Chat mode:** the existing one-on-one mode should accept a Composer-created profile too; map agent profile → Solo Chat counterpart trivially.

---

## Phase 8 — Backend gaps

These are the things v1 cannot fake.

- **Per-turn re-roll** ("each turn" resolution mode): Node.js chatroom orchestrator needs to support a per-agent "bioResolver" callback that runs each turn. Today bios are static after `POST /chatroom/api/agents`. Significant engineering — defer for v1.
- **Hot bio swap** for live knob tweaks during a Run: new endpoint `PATCH /chatroom/api/agents/:name {bio}` that updates the running agent's bio mid-session. Lower lift than per-turn reroll.
- **Session presets persistence:** see Phase 5. Add `backend/routers/sessions.py` with GET/POST/DELETE.
- **Live taste vector:** wire the existing artifact-mining endpoint (`/api/generate/template?mode=taste_vector`) into Composer's `✦ Generate` flow — extract a taste vector from existing profiles and prepend it to the system prompt so generated profiles feel personal.
- **Recording:** Composer Run room shows a "⏺ Record transcript" button. Define what gets captured: messages + final knob states + timestamps. Add a backend endpoint to dump as JSON.

---

## Phase 9 — Polish, persistence, edge cases

- Mode persistence in localStorage; default to last-used mode on load.
- Keyboard shortcuts: `1/2/3/4` jump between Composer rooms; `Cmd/Ctrl+S` save profile in editor.
- Empty states: Library with zero profiles, Editor with empty bio template, Session with zero agents, Run with no messages.
- Loading states for every async call (currently only Test Run shows pending).
- Error boundaries: if the React app crashes, fall back to the existing synthograsizer UI — not a white screen.
- Mobile: Composer is desktop-only as drawn. Decide: make it responsive or gate it to ≥1024px.
- Accessibility: ARIA labels on knobs, focus rings, keyboard knob control, screen-reader-friendly token chips.
- Telemetry hook (optional): log mode-switches, profile creates, session launches.

---

## Suggested execution order

| Chunk | Phases | What ships |
|---|---|---|
| **A** | 0, 1, 2 | Composer as a real mode, real data layer, no behaviour change |
| **B** | 3, partial 4 | Library against real profiles; Editor variable knobs become interactive |
| **C** | 6, 7 | Run handoff to Agent Studio works; bridges in both directions |
| **D** | 5 | Session builder gets DnD, save/load |
| **E** | rest of 4 | Editor polish (drag-reorder, weight editing, value generation) |
| **F** | 8 | Backend gaps as user demand surfaces |
| **G** | 9 | Polish |

Chunk A unblocks everything. Chunk C is the moment Composer becomes useful. Everything after is refinement.
