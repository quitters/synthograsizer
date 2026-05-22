# 01 — Design Philosophy

## Audience & use case

A **solo creative technologist** building generative-art and live-performance tools. Two primary use modes:

- **Studio mode** — long, dense sessions exploring prompts, iterating on templates, generating images/video.
- **Performance mode** — live AV sets, often in dim rooms, often projected. Hands on MIDI controllers, eyes on the canvas, minimal cognitive overhead for menu hunting.

Secondary audience: other creative technologists who fork or self-host the suite.

## Tone constraints (not aesthetic — keep these open)

These are feel constraints, not visual prescriptions:

- Tools should feel like **instruments**, not dashboards. A musician doesn't read labels on their synth — they reach for the knob.
- **Dense information without feeling cluttered.** This is a power-user tool; we don't need to hide controls behind menus to feel calm. The challenge is hierarchy, not minimalism for its own sake.
- **Comfortable for long sessions in dim rooms.** Strong default to dark backgrounds. Light mode optional, not primary.
- **The work should be the focus.** The p5.js canvas and the generated outputs are the point. Chrome around them should yield.

## What we're asking for

**Propose 2–3 distinct exploratory directions for the main app**, not a single polished mockup. Examples of the kind of spread we'd find useful (not a menu — feel free to invent):

- *Hardware/instrument* — physical-feeling controls, panel-and-bezel layouts, tactile affordances. (Closest to the current aesthetic; would represent a refinement direction.)
- *Minimal creative tool* — Linear/Figma sensibility, restrained palette, surface-level calm with depth on demand.
- *Expressive generative* — let the medium leak into the UI. Color, motion, type as material. Match the work being made.

We will pick one (or remix) after seeing them side by side. For Taste Profile and Landing, lean toward whichever direction(s) feel most appropriate — they don't have to match the main app.

## Existing typographic inputs

In use today (keep or replace per direction):
- **Inter** — body/UI (weights 300–900)
- **Space Grotesk** — display/headings
- **JetBrains Mono** — code, monospace data, prompt previews

## Hard constraints

These must survive any redesign:

1. **Dark mode must work first and well.** Light mode is a nice-to-have, not a baseline.
2. **The p5.js canvas is sacred.** It needs to be sizable, framable, and not visually competed with by surrounding chrome.
3. **D-pad and MIDI controls must remain ergonomic for live use.** Big enough hit targets, readable at a glance, current selection always obvious. No tiny dropdowns mid-set.
4. **Keyboard navigation can't regress** — D-pad is already keyboard-driven; that's a feature, not an accident.
5. **History/output trail must remain visible** — being able to glance back at the last several generations matters for live work.

## Anti-constraints

What we explicitly don't care about:

- Brand consistency with anything external. There is no parent brand to match.
- Mobile-first responsive design. Desktop is primary; Perform mode on a tablet is the most we'd want.
- Pixel-perfect parity with the current layout. The current layout has accreted; treat it as data, not as a target.

## What "good" looks like

After Claude Design's first round, we should be able to say: *"That direction makes the live-performance flow feel like reaching for a knob, and the studio flow feel like sitting at a workbench."* If a direction is pretty but the D-pad got demoted to a sidebar, that's a miss.
