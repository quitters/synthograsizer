# 02 — UX Requirements

Per-surface inventory of what the current UI does, what must be preserved, and where the current implementation hurts. Use this as a structural map, not a visual prescription.

---

## A. Main App — `sources/synthograsizer/index.html`

The center of gravity. A prompt template engine wrapped in live-performance controls.

### Current regions (top to bottom on wide viewports)

- **App bar** (sticky) — brand mark, template picker dropdown, mode switcher buttons (Studio / Perform / Composer / Taste Profile / Changelog). Currently styled as hardware bezel buttons.
- **Output section** — header label + action buttons (Copy, Like, Code, Send to Chat); main scrollable `#output-container` showing the assembled prompt; tag badges; optional history strip with thumbnails of recent generations.
- **Primary actions row** — three full-width buttons: **Randomize**, **Generate**, **Run Code**. A "beat navigator" appears here conditionally for story-mode templates.
- **P5.js canvas section** (hidden until activated) — live sketch mount + Scope video overlay + control buttons (External Display, Send to Scope, Capture).
- **Variable control section** (largest area) —
  - D-Pad ↔ Knobs mode toggle
  - Center: **5-button D-pad** (↑↓←→ + center) around a display showing current variable name and value
  - Knobs container (alternative mode, hidden by default)
  - Variable indicator dots
  - Keyboard hint strip
- **Connections group** (collapsible) —
  - **MIDI** bar + expandable panel (device name, auto-map, learn mode, mappings grid)
  - **Scope** bar + expandable panel (URL input, OSC section, video section, Spout section)
  - Display status indicators (colored dots) per connection

### Layout modes

Two modes toggled from the app bar:
- **Studio** — everything visible
- **Perform** — minimal: output, primary actions, D-pad/knobs, canvas. Connections collapsed by default.

### Must-keep behaviors

- D-pad keyboard navigation (arrow keys, no focus needed)
- MIDI learn mode + visible mappings grid
- Live p5.js canvas + Scope video overlay
- Studio ↔ Perform layout toggle
- Output history strip — glanceable trail of recent generations
- Tag badges that indicate template structure
- "Send to Chat" / "Send to Scope" affordances surface integrations without leaving the page

### Pain points to address

- Multiple competing dark themes layered on each other (`style.css` + `synth-hardware-theme.css` + `layout-options.css`). Component styling drifts across files.
- No central design tokens — colors hard-coded throughout.
- Connections panels feel like a settings drawer bolted onto the main UI; they should feel like part of the instrument.
- Output section visual weight is unclear — sometimes feels secondary even though it's the actual output.
- Hit targets on D-pad inconsistent with hit targets elsewhere.

---

## B. Taste Profile — `sources/taste-profile/index.html`

A linear 4-step onboarding flow that builds an AI "taste profile" + agent crew for the user. Single-file app with embedded styles. The closest thing in the suite to a *ceremonial* surface — it's run once or rarely, not lived in.

### Current regions

- **Top bar** (fixed) — centered brand mark + "Synthograsizer" title + "Taste Profile" badge. No nav.
- **Step indicator (stepper)** — four chips: Upload → Taste Pairs → Synthesizing → Your Profile. Numbered, labeled, active state highlighted.
- **Panel stack** (1100px max-width, centered, one panel at a time):
  - **Step 1 — Upload**: drag-drop zone, thumbnail grid, upload stats.
  - **Step 2 — Taste Pairs**: progress bar, two cards side-by-side (image + label + description), instruction text.
  - **Step 3 — Synthesizing**: spinner + status log (`#synthLog`).
  - **Step 4 — Your Profile**: profile header + stat cards (axes radar, color palette, subjects, tendencies, narratives) + "Your AI crew" section (agent cards) + profile JSON export.
- **Footer button row** — Back / Next / Submit / Export, right-aligned.

### Must-keep behaviors

- Linear stepper with explicit back/next; no skipping ahead
- Drag-and-drop image upload with live thumbnails
- A/B pair-choice card layout for taste pairs
- Visible synth log during the generation step (it can take a while; user needs to see progress)
- JSON export of the final profile

### Pain points to address

- Embedded `<style>` block means tokens duplicate everything in the main app's CSS.
- Step transitions feel like page reloads, not progression.
- The final "Your Profile" reveal moment should feel like a *result*, not just another panel.
- Color palette / radar / subject stats are powerful data — currently underplayed visually.

---

## C. Landing — `sources/landing/index.html`

The marketing / hub page. First impression for visitors; secondary purpose as the launch surface for the main app.

### Current sections (top to bottom)

- **Top nav** (fixed) — brand mark + logo + center links (Features, Inside, Workflow, Integrations, About) + theme toggle + **Launch App** CTA.
- **Hero** — gradient background, pill badge, headline, lede, two CTAs (Launch / See what it does), stats grid (50+ Templates / 10+ Tools / 46+ Agents / ∞ Variations), tech chip tags.
- **Feature highlights** — 3-card grid (Structured Control / Hardware Performance / End-to-End Generation), icons + bullet lists.
- **Inside the App** — tool grid, 7 cards (Synthograsizer + 6 built-ins: Agent Studio, Image/Video, Glitcher, P5.js, MIDI/OSC, Music). Badges per card.
- **Workflow** — 4-step flow (Compose → Control → Generate → Broadcast), numbered.
- **Agents** — feature grid (Turn-order routing, Prompt assembly, Trace capture).
- **Template Format** — code-split section (copy on one side, JSON code sample on the other).
- **Integrations** — 2-column grid (Models & APIs / Creative Surfaces), icon + label + description per item.
- **CTA section** — final call-to-action box.
- **Footer** — brand + links (App, About, GitHub, Daydream Scope).

### Must-keep behaviors

- Theme toggle (dark ↔ light)
- "Launch App" CTA always reachable (currently in top nav and hero and final CTA)
- Section anchor links from top nav
- Tool grid that links into the individual apps inside the suite

### Pain points to address

- Section density feels like a long-scroll product page when the actual product is a tool — visitors should reach "Launch App" fast.
- The hero stats are interesting; the workflow section is generic. Consider trimming.
- No visual continuity with the main app — landing and app feel like different products.

---

## Cross-surface concerns

- **No shared navbar component.** Each surface defines its own header inline. A unified header (or at least a consistent brand mark and "Launch / Home" affordance) would help.
- **Inconsistent button, slider, panel styling** across the three surfaces.
- **No central CSS custom-property token system.** A redesign should produce one.
- **The three surfaces don't need to look identical**, but they should feel like they belong to the same world. Taste Profile especially can be more ceremonial; the main app can be more workbench-like.
