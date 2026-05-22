# 04 — Open Questions

Decisions to surface before producing v1. Some have leanings noted; treat them as defaults to argue with, not settled.

## 1. Responsive / mobile strategy

The suite is desktop-first today. Should Perform mode have a **tablet-optimized layout** for live use (iPad on a mixer stand, etc.)?

- *Lean*: yes for Perform mode, no for everything else. Studio mode and Composer don't make sense on touch.
- Question for Claude Design: how disruptive is it to maintain a tablet-friendly Perform layout alongside the desktop default?

## 2. Accessibility targets

- Contrast: aim for WCAG AA on text in dark mode. Some current panels likely fail.
- Keyboard nav: D-pad is already keyboard-driven. Don't regress; ideally extend (Tab order across panels is currently incoherent).
- Reduced motion: any motion you introduce should respect `prefers-reduced-motion`.

Open: should focus indicators be visually loud (instrument-like, owns the look) or restrained (default platform feel)?

## 3. Unified visual language vs. distinct moments

The three surfaces have different jobs:

- Main app — workbench, lived-in
- Taste Profile — ceremonial, run once
- Landing — marketing, first impression

Do we want a **single design system** spanning all three, or a **shared token base** with deliberately different feels per surface?

- *Lean*: shared tokens (color, type, spacing scale), distinct surface treatments. Taste Profile gets to feel more cinematic than the main app.

## 4. Export format

What should Claude Design hand back?

- *Preferred*: **standalone HTML** for each surface so we can drop into `static/` and iterate. CSS as a single file per surface is fine; we'll refactor into tokens.
- Acceptable: design system spec (tokens + component sheet) + key-screen mockups, with us implementing in HTML/CSS ourselves.
- Not useful here: PPTX, PDF, Canva. This is a code product.

## 5. Component scope of v1

Do we want Claude Design to:

- *(a)* Produce **2–3 directions for the main app's hero screen** (Studio mode, default state), then we pick one and expand to other states?
- *(b)* Produce **one direction across all three surfaces' primary screens** in parallel?
- *(c)* Produce a **token system + a few key components** (button, slider, panel, D-pad cell, output card) and we'll compose them?

- *Lean*: (a) — diverge first on the highest-stakes screen, converge on a direction, then expand.

## 6. The D-pad

This is the most idiosyncratic component in the suite. Options Claude Design should consider:

- Keep as a literal D-pad (current)
- Reimagine as a different physical-metaphor input (jog wheel, XY pad, joystick, modwheel)
- Abstract to a more generic step-and-cycle control

Preference is for *whatever makes single-handed, eyes-on-canvas live use easiest*. Not the metaphor itself.

## 7. Light mode

Is light mode a real product surface or a courtesy?

- *Lean*: courtesy. Don't spend equal design budget on it. Make it usable; don't make it beautiful at dark mode's expense.
