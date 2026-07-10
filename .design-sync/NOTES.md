# design-sync notes — Synthograsizer Suite

Repo-specific gotchas for future syncs. Read this before re-running.

## Shape & layout
- The suite is a static HTML/CSS/JS app with **no component library**. The synced DS is a purpose-built wrapper package at `design-system/` — thin React wrappers that emit the suite's **real class vocabulary** (`.vr-*` from Videorama + the `--suite-*` tokens). The wrappers add no styling; the CSS is imported **verbatim** from `static/` by `design-system/build.mjs`. `static/` stays the single source of truth.
- Scope: **Synthograsizer + Videorama**. The Videorama stylesheet (`static/videorama/css/videorama.css`) is the cleanest, fully-tokenized exemplar and is what the vocabulary was drawn from.
- There is **no root package manager**. Install/build happen inside `design-system/` only (`npm --prefix design-system ...`). `cfg.buildCmd` = `npm --prefix design-system run build`.

## Build order (every sync)
1. `npm --prefix design-system run build` — runs `tsc` → `dist/*.js`+`*.d.ts`, writes `dist/component-styles.css` (tokens.css + videorama.css, verbatim), and copies the self-hosted latin woff2 into `design-system/fonts/files/`.
2. `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules design-system/node_modules --entry design-system/dist/index.js --out ./ds-bundle`
3. Validate: `node .ds-sync/package-validate.mjs ./ds-bundle` (see render-check note below).

## Fonts
- Self-hosted (Inter, Space Grotesk, JetBrains Mono — latin subsets) so designs never depend on the Google Fonts CDN. `cfg.extraFonts: ["fonts/fonts.css"]`; the woff2 come from the `@fontsource/*` devDeps and are copied by `build.mjs`. `design-system/fonts/files/` is generated (gitignored) — a fresh clone regenerates it via the build.
- **`cfg.runtimeFontPrefixes: ["roboto mono"]`** suppresses a `[FONT_MISSING]` for "Roboto Mono". It is a *fallback-only* family in `--suite-font-mono: 'JetBrains Mono', 'Roboto Mono', monospace` — JetBrains Mono is shipped and primary, so Roboto Mono never actually renders. Not a substitute; a fallback that never activates.

## Theme: LIGHT-first (warm cream, teal-forward) — a DS decision
- The synced DS defaults to a **warm-cream, teal-forward light** identity for the landing / Videorama / Glitcher surfaces (user direction, 2026-07-07: dark + saturated indigo read as "generic AI app"). Dark is preserved as opt-in `[data-theme="dark"]`.
- **This diverges from the live app on purpose.** The app's real `static/` CSS is still dark-first; we do NOT change it. The light identity lives entirely in **`design-system/src/theme.css`**, appended LAST in `build.mjs` after the verbatim `tokens.css` + `videorama.css`, so its `:root` wins. Values derive from the repo's real light material (landing `[data-theme="light"]` + cel-pastel).
- `theme.css` also defines **`--suite-bg-raised`** (paper; used by Videorama panels/header/toasts — tokens.css never defined it, so it had been falling back to hard-coded dark `#14141f`).
- **De-purple**: Videorama hardcodes `var(--suite-indigo)` for primaries/links/active accents. `theme.css` retargets those specific classes to **teal** in the light skin only (`:root:not([data-theme="dark"]) .vr-btn-primary { background: var(--suite-teal) } …`), leaving the `--suite-indigo` token honestly indigo (ColorPalette stays truthful) and dark mode's indigo-forward look intact. If a future run wants indigo primaries back in light, remove that override block.
- **`Surface`** (real DS primitive: establishes the page canvas — bg + text + UI font, tokens only) is wired as **`cfg.provider`** so every preview renders on the correct canvas (the converter's cards hardcode `body{background:#fff}`, which otherwise fights the identity). Also genuine guidance for the design agent, not a preview-only hack.

## Review-page browser caching (gotcha)
- `ds-review` serves via `python -m http.server` (no cache-control headers), so browsers **heuristically cache** `_ds_bundle.css`. After a rebuild the review page can show the OLD stylesheet until a **hard refresh (Ctrl+Shift+R)**. When verifying via the Preview MCP after a rebuild, bust the links: `document.querySelectorAll('link[rel=stylesheet]').forEach(l => l.href = l.href.split('?')[0] + '?b=' + Date.now())`, or restart the server AND hard-navigate. Fetching `/_ds_bundle.css` with `{cache:'no-store'}` confirms what's actually on disk.

## Render check / grading
- Playwright + Chromium is **not installed** (user declined the ~200 MB download, 2026-07-06). So `package-validate.mjs` runs with the render check skipped, and `package-capture.mjs` (machine grading) can't run.
- Verification was done instead by driving the **Preview MCP browser** over `ds-bundle/.review.html` (served via the `ds-review` launch config, `python -m http.server 8095 --directory ds-bundle`) and by the user eyeballing the same page. All 25 components confirmed rendering correctly on the dark canvas with the right fonts/colors/semantics.
- If a future run installs Playwright, the normal capture+grade+driver flow applies and this section can be revisited.

## Known render warns (triaged, expected — not new)
- `[RENDER_SKIPPED]` — expected while Playwright is absent (see above).
- `guidelinesGlob` "not found — skipped" only fires if `design-system/guidelines/` is missing; it exists now.

## Component overrides (`cfg.overrides`)
- `AppShell`/`Modal` → `cardMode: single` (full-page / overlay — need one framed export at a set viewport).
- `HeaderBar`/`CardGrid`/`TitleRow`/`TakesTable` → `cardMode: column` (wide; one export per row).

## Minor follow-ups
- **Guidelines path double-nest**: `guidelinesGlob: ["guidelines/**/*.md"]` preserves the source prefix, so `design-system/guidelines/design-direction.md` lands at `ds-bundle/guidelines/guidelines/design-direction.md` (the generated `guidelines/index.md` links it correctly, so it's functional, just untidy). To flatten, adjust the glob/copy so it lands at `guidelines/design-direction.md`.

## Uploaded project
- Claude Design project **"Synthograsizer Suite"**, projectId `8e4af2e9-913b-4b2d-ba7b-8c2dce243b93` (pinned in config.json). First sync: 2026-07-07, 25 components, incremental path into a fresh empty project.

## Re-sync risks (watch-list)
- **Vocabulary drift**: the wrappers hard-code `.vr-*` class names. If `static/videorama/css/videorama.css` renames/removes a class, the matching wrapper silently emits a dead class. On re-sync, diff the wrapper class names against the current stylesheet.
- **Font weights**: `build.mjs` copies a fixed weight list. If the suite starts using a weight not in that list, add it to `FONTS` in `build.mjs` (and a matching `@font-face` in `fonts/fonts.css`).
- **New pastel theme**: the pastel-lofi direction (see `guidelines/design-direction.md`) is a *design target*, not yet real CSS. When Claude Design's pastel tokens land in the repo as actual stylesheets, add them to the sync (new tokens file / theme) so the DS carries both the dark identity and the pastel skin.
- **Playwright**: verification currently leans on manual/Preview-MCP review. A future automated re-run should install Playwright to get machine grading back.
