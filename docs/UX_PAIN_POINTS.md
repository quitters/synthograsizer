# UX pain points — found while writing the user manual (2026-07-28)

Collected by walking every surface of a **local install** to capture screenshots for
[Synthograsizer-Manual.pdf](Synthograsizer-Manual.pdf). Writing a manual turns out to be a good
audit: anywhere the manual needed a sentence to explain a control is somewhere the app could have
said it itself.

Feeds the standing **accessibility and simplicity** goal in
[HANDOFF_SERVICE_LAUNCH.md](HANDOFF_SERVICE_LAUNCH.md).

## The headline number

**11 of 60 visible controls carry a tooltip — 18%.** No control is *unnamed* any more (the
2026-07-27 pass closed that), but a name is not an explanation: `Scope`, `Composer` and
`Template Gen` are all correctly labelled and still tell a newcomer nothing.

## Ranked by value per unit of work

### 1 · The Connections strip is four pieces of jargon, unexplained
`MIDI · Scope · Display · API`, all dimmed when inactive, none with a tooltip. **Scope** is the
worst offender — it means Daydream Scope, a separate third-party renderer, which no first-time
reader can be expected to infer. **Display** sounds like a monitor setting rather than "open a
clean output window for OBS".

*Fix:* one `title` each. ~4 lines.

### 2 · `api-key-btn` is the most important control on a local install and says only "API"
Nothing generates without a key, and the only affordance is a three-letter chip with no tooltip.
It was the single control flagged by the icon-only-no-tooltip probe.

*Fix:* `title="Your Google AI Studio key — nothing can generate without it"`, plus a stronger
empty state when no key is set.

### 3 · Workflow card descriptions are truncated mid-word
The cards already carry a real description — the data is there — but it is cut with an ellipsis
(`"Analyzes the result a…"`). **This refines the standing note asking for workflow descriptions:
they exist, they are just unreadable.**

*Fix:* `title` with the full text on each card. One line in the card template.

### 4 · The Workflows panel sits blank for >1.6s when the backend is down
Measured on a local install:

| Backend state | Time to any visible text | Time to template cards |
|---|---|---|
| ChatRoom running | 357 ms | 358 ms (17 cards) |
| ChatRoom down | **> 1600 ms** | — (offline message) |

The offline message itself is good and honest — plug icon, what happened, the exact command to
fix it, and a Retry button. The problem is only the silent gap before it. There is already a
`#wfr-status` element in the markup sitting at `display:none`, so a "Connecting…" line has a home
and no new markup is needed.

> ⚠ I initially filed this as "Workflows renders completely empty" — a **wrong** reading, taken
> from a downscaled screenshot caught inside that blank window. The offline state renders
> correctly. Recorded because the mistake is instructive: a low-resolution screenshot is not
> evidence about small text.

### 5 · `PERFORM / STUDIO / COMPOSER` have no tooltips, and Composer is genuinely unguessable
Composer is an **agent-crew builder** (Library → Editor → Session), not a template or prompt
composer as its name suggests. **I got this wrong myself while writing the manual** and only
caught it when the screenshot showed a library of agent personas rather than anything about
templates. If the person writing the documentation with the app open in front of them infers the
wrong thing from the label, a user has no chance.

*Fix:* a tooltip per mode, and consider renaming Composer to something naming its subject
(e.g. "Agents" or "Crew").

### 6 · `GENERATE` vs `TEMPLATE GEN` sit side by side and do very different things
One makes an image from the current prompt; the other writes an entirely new template with AI.
Both are large, both are adjacent, both say "GEN". The keybind badges (`G` / `T`) are good and
should stay — the gap is the explanation, not the discoverability.

### 7 · The template chip shows `UNTITLED` with no unsaved-work signal
After editing a template the chip reads `UNTITLED`, which does not say "you have unsaved changes
that switching templates will discard". This is the **stranded-state pattern** the project keeps
rediscovering, in a new place.

*Fix:* a dirty marker (`UNTITLED •`) plus a tooltip, and ideally a confirm when loading over
unsaved edits. Worth noting this bit for real during this session: capturing screenshots would
have destroyed the operator's unsaved prompt had it not been checked first.

### 8 · Menu items are emoji + name with no one-line description
`Smart Transform`, `Image Analysis`, `Trace Viewer`, `Metadata` — the Workflows grid gets
descriptions (see #3) and the menus do not, though they carry the same kind of unfamiliar
capability.

### 9 · `PROMPT BATCH` and `LIKED PROMPTS` never say what they collect or where things go
Both are nouns without verbs. Where does a liked prompt go? What does a batch produce, and how
much does it cost?

### 10 · First-run still lands in Perform, where the tools are hidden
Unchanged from the standing note, now confirmed visually: the first screen offers Randomize /
Generate / Run Code and 13 knobs, with nothing indicating that STUDIO holds four menus of tools.
GENERATE going straight to an image is what rescues it.

## Not a pain point — checked and correct

- **The Workflows offline message** is a model of the honest-error pattern: what broke, the exact
  command to fix it, and a retry.
- **Keybind badges** on the primary buttons are clear and consistent.
- **Variable colour-coding** between the prompt text and the knob labels is genuinely good — it
  makes "which knob controls which words" legible at a glance, with no explanation needed.
- **The knob rack** now fits 13 knobs without clipping in Studio (4×4 grid), as intended by the
  2026-07-26 fix.
