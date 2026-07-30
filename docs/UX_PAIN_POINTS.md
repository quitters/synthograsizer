# UX pain points and how to fix them

Collected by walking every surface of a local install and the hosted service to capture
screenshots for the two guides (`scripts/manual/`). Writing a manual is a good audit: anywhere
the manual needed a sentence to explain a control is somewhere the app could have said it itself.

Feeds the standing **accessibility and simplicity** goal in
[HANDOFF_SERVICE_LAUNCH.md](HANDOFF_SERVICE_LAUNCH.md).

---

## ⚠ Correction to the first version of this document

The first draft led with *"11 of 60 visible controls carry a tooltip — 18%"* and proposed adding
a tooltip system. **Both were wrong.** A complete tooltip system already existed, inline in
`index.html` (`<style id="v6-tooltip-styles">`): `[data-tip]::before` carries the text via
`content: attr(data-tip)` and `::after` draws the arrow.

The measurement error: the probe checked the `title` attribute and then, on the second pass,
`::after` — **the arrow** — and concluded from `content: ""` that nothing rendered. The text was
on `::before` the whole time.

This is the "check whether the fix already exists" lesson for the third time in this project,
after the knob-rack grid and the keyboard path to the knobs. **Before proposing a mechanism,
check whether a working one is already in the file.**

What was *actually* missing is narrower and is now fixed — see Wave 1 below.

⚠ **It happened a fourth time in this same document** — see Wave 2 item 8. `knob-controller.js` was
written up here as "a fully accessible knob implementation that nothing imports", with the open
question being whether to wire it in. Two files in the repo (`static/synthograsizer/README.md` and
`CHANGELOG.md`) had it labelled **"(Legacy, unused)"**, and it targets markup that no longer exists.
One `grep` for the class names it queries settled a question this document had left open as a
design call.

⚠ **Second recurring theme, new this pass: a probe that is wrong in a way that looks right.** Three
separate contrast probes gave three different wrong answers before one gave a usable one — walking
`backgroundColor` only (a `linear-gradient` ancestor reads as transparent, so a near-black panel
measured as `#ffffff`), then averaging gradient stops while ignoring their alpha (a 3%-opacity glow
counted as solid teal), then a stop cross-product so conservative it was meaningless. **A computed
"effective background" under stacked gradients is not trustworthy; a solid `backgroundColor` is.**
Where it could not be measured, the Glitcher was settled from source instead. Same lesson as
`::after`-vs-`::before` and `outlineWidth`-vs-`outline`, in a third costume.

---

## Wave 1 — DONE (2026-07-29)

| # | Pain point | What was done |
|---|---|---|
| 1 | **Studio menu items had no tooltip text.** 12 items, 0 with `data-tip`. `Smart Transform`, `Trace Viewer`, `Metadata` explained themselves nowhere. | `data-tip` on all 11 menu items, each naming what the tool **produces** rather than restating its label. |
| 2 | **`GENERATE` vs `TEMPLATE GEN`** sit adjacent, both say "GEN", and do very different things. | Tooltips name the output: *"Make an image from this prompt"* vs *"Write a whole new template with AI — not an image"*. All four primary buttons tipped. |
| 3 | **Tooltips answered the mouse only.** The system was `:hover`-only, so a keyboard user reached a control and got nothing — and these tips are now the only place several controls explain themselves. | `:focus-visible` added alongside `:hover` in all three pages. Verified with a real Tab press: opacity 1, text rendering. |
| 4 | **Workflow descriptions truncate mid-word** (`"Analyzes the result a…"`). The full text was already in the data. | `title` on the card carries the untruncated description. Card text also went `#888` → `#666` (`#888` = 3.4:1, fails AA). |
| 5 | **Workflows sat visibly blank for >1.6s when the backend was down.** Measured: 357 ms to cards when it is up; over 1600 ms of empty box when it is not, which reads as broken rather than busy. | `#wfr-status` already existed for this and was never used on the path — now shows *"Looking for the workflow engine…"* during the probe. |

Tooltip coverage went from **21 controls to 35**.

---

## Wave 2 — DONE (2026-07-30)

### 6 · The `UNTITLED` chip gives no unsaved-work signal — FIXED
Dirty mark (`NAME •`) on the chip plus a tooltip that says what the dot means, and a confirm before
loading a template over unsaved edits.

Two decisions worth keeping:
- **The dirty check reads the editors, not just the template object.** Typing a new prompt and then
  switching template is exactly how work is lost, and at that moment `currentTemplate` is still
  pristine — a fingerprint comparison alone would have said "clean" and let it go.
- **The confirm sits on `app.loadTemplate()`, not on the picker.** The picker is one of six ways in;
  restore-from-disk, My creations, a generated template and the JSON importer all land at the same
  choke point. Verified: the real picker path asks **exactly once**, not twice.
- Loading a template now calls `codeOverlayManager.updateContent()` rather than only
  `updateP5CodeEditor()`. Without it the template editor kept the *previous* template's prompt while
  the overlay was closed, so every load would have read as dirty — a false positive that trains
  people to click through the confirm.

Verified both directions: 3 back-to-back clean loads ask **0** times; a dirty load asks once, Cancel
returns `false` and leaves the template untouched, OK proceeds and clears the mark.

### 7 · Caption greys fail AA — FIXED, and the doc's numbers were optimistic
**87 sites changed to `#565656`.** Measured after: **zero failing**, 83 elements on the main app
between **4.61:1 and 7.34:1**.

What the original note got wrong: `#fafafa` is not the background that matters. The worst offenders
sit on the hardware theme's **tan chassis** — `#999` on `#d4ccbe` measured **1.79:1**, and 46
elements sat between 1.79 and 2.51. `#767676` (the "darkest grey that passes" on `#fafafa`) still
**fails at 3.21:1 there**. `#565656` is the single value that clears 4.5:1 against every light
background in the app, which is why it is one constant rather than fifteen judgement calls.

Left alone, deliberately, each measured rather than assumed:
- **All 22 in `glitcher/styles/effect-studio.css`** — dark chrome, `#888` measures **5.2–5.5:1**.
  Darkening these would have broken them. One exception: `.chain-btn` measured **4.47:1** on
  `#21212e` and went two steps *lighter* to `#8a8a8a` (4.60:1).
- **`glitcher-studio.js`'s `.gs-status`** and **`.p5-fx-row label`** — both on `#111`, both 5.33:1.
  The p5 drawer one was caught as a **regression I introduced** and reverted: the bulk pass dropped
  it to 2.57:1. It is the one dark island inside otherwise-light chrome.
- `background:` uses (dots, chips, status fills) — a different 3:1 rule, and decorative.
- `static/chatroom/assets/*` (build artifacts), `templates/*.json` (art content), and
  `static/{legacy,fun-stuff,daw}/` (gitignored archived surfaces, not in the repo at all).

Separately found: **`opacity` is a contrast trap.** The Glitcher's `.panel-subtitle` was failing not
on its colour but because it was composited at 0.7 over its background. Opacity dropped rather than
lowered — on a dark panel it moves text *toward* the background, which is the one direction that is
certain without knowing the exact gradient pixel.

### 8 · 13 knobs and 17 workflow cards are unfocusable — FIXED

**`knob-controller.js` was never a candidate, and the repo already said so.** It queries
`.knob-button-up` / `.knob-button-down` / `.knob-value` / `.knob-label` — four class names that
appear **nowhere else in the repository**. It targets an up/down-button knob design that was
replaced by the rotary dial. "Wiring it in" would have meant rebuilding the rack and throwing away
the dial, not "risking visual change". `static/synthograsizer/README.md` and `CHANGELOG.md` had both
labelled it *"(Legacy, unused)"* the whole time — **the fourth instance of the answer already being
in the file.** Deleted; the three file trees that listed it updated.

Knobs: **roving tabindex**, so the rack costs **one** Tab stop rather than thirteen — verified at
position 13 of 42 with exactly one knob tabbable. `role="slider"` with
`aria-orientation="horizontal"`, which is what makes Left/Right the adjust keys and leaves Up/Down
free to move between knobs — the same map the document-level handler already taught, so the two
cannot teach different things. `aria-valuetext` carries the **full** value; the dial's label is
truncated. Home/End jump to first/last value.
- **Active follows focus**, so "the knob I am on" and "the knob the arrows act on" cannot drift.
  Verified: focus, the `active` class and the roving tabindex all agree after navigation.
- **No double-fire**: a real ArrowRight moves the value exactly one step, not two.
- **`#knob-announcer` is suppressed while a knob has focus**, or the slider's own announcement and
  the live region would say the same thing twice. Keyed off `document.activeElement`, not the call
  site. Verified in both directions — silent with a knob focused, still firing without.

Cards: `role="button"`, `tabindex`, Enter/Space. `aria-label` is the name and `aria-describedby`
points at the description, rather than letting the button's name be computed from its contents —
that would read icon + name + description as one run-on label, seventeen times. Locked (Veo) cards
refuse Enter exactly as they refuse clicks, and fire the same explanatory toast; verified against a
simulated hosted free tier, where 3 of 17 lock.

**Card copy left as-is** — Alexander confirmed the truncated description plus Wave 1's `title` is
enough.

---

## Wave 3 — DONE (2026-07-30). Both were Alexander's calls to make; he said proceed.

### 9 · "Composer" is unguessable — RENAMED TO "AGENTS"
"Agents" over "Crew": it matches the vocabulary already in the codebase (`agent-studio.js`,
`agent-profiles.js`, `agent-composer.html`), where "Crew" is a metaphor that needs its own
explanation. **One edit to change if you prefer Crew** — the label, and the tooltip beside it.

`data-mode="composer"` is **deliberately unchanged**: the mode key is wired through the layout
script, CSS `@scope`, keyboard shortcuts and the public `window.Composer` API, none of which the
user reads. Verified the mode still switches and mounts after the rename. Three user-visible strings
inside the Composer itself followed the name, applied **identically to `composer.jsx` and the
generated `composer.js`** (3 changed lines each).

Historical changelog entries were **not** rewritten — they record what shipped under the old name.

### 10 · First-run lands in Perform — POINTER ADDED
Of the three options, the **one-time pointer**: relanding everyone in Studio changes the app's
character for returning users too, and a tour is a build. Pointing at what already exists is also
the answer this codebase keeps reaching for stranded state.

- Shown on a **genuine** first run only. `isFirstRun` is captured **before** `applyLayout()` writes
  `synthograsizerLayout`, which it does on every load including the first — asking afterwards always
  answers "returning user".
- Two independent guards, both verified: clearing the seen-flag does **not** bring it back for an
  existing user, and dismissing persists across reload.
- **Never steals focus** (same call as the results announcer — verified `activeElement` stays on
  `<body>`). Dismisses on the button, Escape, or clicking Studio.
- Appended to `<body>` and `position:fixed`, so it adds **no sibling to the mode segment** and costs
  the app-bar no layout. Verified `#layout-switcher` still has exactly 3 children and
  `.app-bar` is still `justify-content: flex-start`.

⚠ **Probe note:** checking "does exactly one app-bar element own an auto margin" by comparing
`getComputedStyle(...).marginLeft === 'auto'` reports **zero**, because computed style returns the
*used* value (`415.469px`). Same family as the `outlineWidth`-vs-`outline` trap.

---

## Checked and correct — do not "fix" these

- **The Workflows offline message** is a model of the honest-error pattern: a plug icon, what
  broke, the exact command to fix it, and a Retry button. It was initially filed as "renders
  completely empty" — a misreading of a downscaled screenshot caught during the blank probe window.
- **Variable colour-coding** between the prompt text and the knob labels makes "which knob controls
  which words" legible at a glance, with no explanation needed.
- **Cost quotes before you spend** — `Run Smart Transform — ⚡6`, and per-model prices in the picker.
- **The tier gate**: on hosted, Video/Music Studio are absent from the menus, Scope is absent from
  Connections, and the result panel's video/Scope buttons are `display:none`. Verified live.
- **Keybind badges** on the primary buttons.
- **The knob rack** fits 13 knobs without clipping in Studio (4×4), as the 2026-07-26 fix intended.
