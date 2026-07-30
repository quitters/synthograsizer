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

## Wave 2 — open, needs copy or a small design call

### 6 · The `UNTITLED` chip gives no unsaved-work signal
After editing a template the chip reads `UNTITLED`, which does not say "you have unsaved changes
that switching templates will discard". This is the **stranded-state pattern** in a new place, and
it bit for real: capturing screenshots would have destroyed the operator's unsaved prompt had it
not been checked first.

**Fix:** dirty marker (`UNTITLED •`) plus a tooltip, and a confirm when loading over unsaved edits.
~20 lines.

### 7 · Caption greys fail AA
`#888` = **3.4:1**, `#999` = **2.7:1** on `#fafafa`. AA body text wants 4.5:1; `#999` fails even
the 3:1 large-text bar. **109 occurrences across 16 files.**

**Fix:** `#767676` is the darkest grey that passes — but this is **not** a find-and-replace. Some
occurrences sit on dark theme backgrounds where `#767676` is *worse*, and four of the files are
vendored ChatRoom build artifacts or template JSON art content that must not be touched. Needs a
per-context pass with a contrast check per site.

### 8 · 13 knobs and 17 workflow cards are unfocusable `<div>`s
Zero `tabindex` in `workflow-runner.js`, `studio-integration.js`, `auth.js`.

**Fix:** the planned next slice. Note `knob-controller.js` is a **fully accessible knob
implementation that nothing imports** — real `<button>`s, `aria-label`, Arrow/Home/End. The live
rack is `app.js:renderKnobs()` building plain divs. Decide whether to wire the existing one in or
add roles to the current markup; wiring it in risks visual change, so measure first.

---

## Wave 3 — genuine product decisions

### 9 · "Composer" is unguessable
It is an **agent-crew builder** (Library → Editor → Session), not a prompt or template composer.
**The manual shipped a wrong description of it**, written with the app open, and the error was only
caught from a screenshot showing a library of agent personas. If the person writing the
documentation infers the wrong thing from the label, a user has no chance.

**Fix:** a tooltip is the patch. The real fix is renaming it to name its subject — "Agents" or
"Crew". User-visible, so it needs a decision.

### 10 · First-run lands in Perform, where the tools are hidden
A newcomer sees Randomize / Generate / Run Code and 13 knobs, with nothing indicating that STUDIO
holds four menus of tools. GENERATE going straight to an image is what rescues it.

**Options:** land in Studio; keep Perform but add a one-time pointer; or a real first-run tour.
Each is a different bet on who the app is for.

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
