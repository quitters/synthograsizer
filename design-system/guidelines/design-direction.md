# Design direction — Synthograsizer Suite

This design system ships the identity for the suite's **landing / Videorama / Glitcher** surfaces: **cozy pastel minimalist, functional lo-fi — light-first, warm-cream, teal-forward.** That is the baseline the design agent builds from. (Synthograsizer's main app is a separate, deliberate look — see the note below.)

## The baseline: warm-cream, teal-forward instrument identity

The suite is a set of creative-technology tools for **prompt-driven generative art and live AV performance** — used in long studio sessions and often projected. The identity:

- **Light-first, warm cream.** The default canvas is warm cream paper (`--suite-bg #f5eedd`, panels lift to `--suite-bg-raised` paper), warm dark ink text — cozy, a little analog, not clinical white. Wrap any screen in `Surface` to establish it. A dark theme exists but is opt-in (`data-theme="dark"`), not the default.
- **Teal leads, not purple.** The signature accent/action color is **teal** (`--suite-teal`) — buttons, links, active states, tool titles. Indigo/fuchsia are secondary. Deliberately avoid the saturated-indigo "generic AI app" look.
- **Instruments, not dashboards.** Controls feel reachable and tactile — big enough hit targets to hit without hunting, current selection always obvious. Don't bury controls in menus.
- **Cozy but functional.** Soft warm palette, generous calm space, a slightly handmade/lo-fi feel — but still **dense enough for real power-user work**, not a toy. "Warm workshop," not "corporate SaaS," not "brutalist." Hierarchy over minimalism-for-its-own-sake.
- **The work is the focus.** The p5.js canvas and generated outputs are the point; chrome around them yields.

### Hard constraints (survive any redesign)
1. **Light mode is the default and must work first and well.** Dark is available (`data-theme="dark"`) but secondary.
2. **The p5.js canvas is sacred** — sizable, framable, never visually out-competed by chrome.
3. **D-pad / MIDI controls stay ergonomic for live use** — big hit targets, readable at a glance, no tiny dropdowns mid-set.
4. **Keyboard navigation can't regress** (the D-pad is keyboard-driven).
5. **History / output trail stays visible** — glancing back at the last several generations matters live.

## Scope & the cozy pastel lo-fi feel

The light-first warm-cream direction is for three surfaces: the **landing / hub page**, **Videorama** (prompt → stylized-video-set tool), and **Glitcher** (signal-chain image-effects tool).

> **Synthograsizer's main app is out of scope — it stays as it is.** Its hardware/cel-pastel skins are deliberate and shouldn't be redesigned. Treat the main app as fixed context; apply this direction only to landing, Videorama, and Glitcher.

"Cozy pastel minimalist, functional lo-fi" means: soft warm palettes, generous calm space, a slightly handmade/analog feel, but still **functional and dense enough for real work**. Keep the ergonomics (clear controls, visible state, legible small text).

### Existing pastel material in the repo (use as seeds, with real values)

These already exist and are the honest starting points — don't invent a palette from scratch when these define the intended feel:

**Landing page light mode** (`static/css/index.css`, `[data-theme="light"]`) — a soft-pastel 1980s palette:
- bg `#f5eedd` (cream), bg-2 `#ede6d8`
- indigo `#5e60ce`, indigo-2 `#8868a8`, teal `#4898a8`, fuchsia `#c06880`, amber `#c8962a`
- surfaces are warm translucent white over the cream; borders are warm brown-grey (`rgba(122,110,94,…)`)

**Cel-pastel theme** (`static/synthograsizer/css/cel-pastel-theme.css`) — 1990s animation pastels with navy-ink outlines and offset "sticker" shadows. This is the *loudest* pastel reference; borrow its warmth and the 8-pastel palette (bubblegum `#ffb6c8`, peach `#ffcb9a`, butter `#ffe79e`, mint `#b8e8c8`, sky `#b6dafd`, periwinkle `#c4c8f0`, lilac `#dbb8ec`, cherry `#ef7a7a`) over paper `#fff5e0` with ink `#1d2233`. Pull the coziness and palette; the heavy ink-outline "sticker" styling is optional — lean lighter/flatter for the "minimalist lo-fi" read.

**Glitcher v2** (`static/glitcher/v2.html`) — an existing unlinked cream-toned alternate layout; a reference for a lighter Glitcher.

### How this relates to the components in this DS
The components here already carry the **warm-cream, teal-forward** identity by default (the tokens resolve to the light values; `data-theme="dark"` flips them to the suite's dark palette). Keep the component **structure and ergonomics** — panels, field rows, state chips, cards, meters, the two-column app shell — and lean the palette further toward the pastel seeds above where a surface wants more warmth or character. This light identity is a design-system decision layered on top of the app's still-dark real CSS; when a pastel skin lands in the repo as real CSS, a re-sync will reconcile the two.
