# 03 — File Manifest

Annotated index of everything under `sources/`. Sizes are approximate.

## `sources/synthograsizer/`

### `index.html` (112 KB)
The main app shell. All major regions are defined inline. Look for `app-bar`, `output-container`, `dpad`, `knobs-container`, `midi-panel`, `scope-panel`, and the `connections-group` collapsibles. **Focus**: the HTML structure tells you the region taxonomy; the styling across the four CSS files tells you why it feels fragmented.

### `css/style.css` (53 KB)
Primary stylesheet. Covers app bar, output, D-pad, knobs, MIDI panel, Scope panel, sidebars. **Focus**: color tokens are hard-coded throughout — every redesign should consolidate these into custom properties. This is the file with the most surface area.

### `css/composer.css` (43 KB)
Agent Composer panel styling (the multi-agent prompt-assembly UI inside Studio mode). **Focus**: this is the most "dashboard-y" part of the app — heaviest information density, hardest to make instrument-like.

### `css/layout-options.css` (13 KB)
Studio ↔ Perform mode layout switching, app bar layout variants. **Focus**: see how the existing system collapses regions for Perform mode — your redesign will need an equivalent.

### `css/synth-hardware-theme.css` (34 KB)
Dark hardware-themed overrides. Competes with `style.css` rather than extending it. **Focus**: read for current aesthetic vocabulary (bezels, panel insets, indicator dots) — keep, transform, or replace deliberately.

## `sources/taste-profile/`

### `index.html` (60 KB)
Single-file onboarding app with embedded `<style>` block. Contains everything: stepper, panels for all 4 steps, results display, JSON export. **Focus**: read the `<style>` block to see the embedded color palette (indigo, teal, fuchsia, amber, rose on `#0a0a12`). The redesign should pull these into a shared token system rather than re-embedding.

## `sources/landing/`

### `index.html` (24 KB)
Landing/hub page markup. Sections are clearly delimited. **Focus**: section count is high; redesign may want to compress.

### `css/index.css` (23 KB)
Landing page styles, including top nav, hero, feature cards, tool grid, workflow, integrations. **Focus**: this is the only file in the suite that does light mode well — useful reference.

## `sources/shared/`

### `css/base.css` (4 KB)
Shared CSS resets and base tokens (font imports, body styling). **Focus**: small, but it's the only existing "shared" CSS file. A redesign's token system should live here or replace it.

---

## What's deliberately not included

- **JavaScript files** — Claude Design needs structure and style for visual reference, not behavior. The JS would balloon the bundle and isn't useful for redesign.
- **Template JSON / p5.js sketches** — data, not UI.
- **Images, fonts, assets** — fonts come from Google Fonts at runtime; assets are not load-bearing for redesign.
- **Glitcher, chatroom, promptcraft, character-creator, daw** — out of scope.
- **Backend** — no UI.

If Claude Design wants any of the above for context, request specific files and we'll add them.
