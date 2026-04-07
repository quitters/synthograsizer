# From Mounds to Blobs: Feature Integration Guide

Cross-referencing MoundProject's character systems with the SoftbodyBlobs physics simulator to identify features that would add personality and generative variability to the blob scene.

---

## Overview

MoundProject is a generative character system built around **coherent trait relationships** — personality drives animation, animation drives easing, color drives background, all working together to make something that feels *designed* rather than random. SoftbodyBlobs is a physics-first sandbox where blobs are essentially interchangeable physics objects that happen to have labels and colors.

The gap is personality. A blob labeled "tardigrade" behaves identically to one labeled "ghost" — same physics, same visual presentation, same passive wait-to-be-poked behavior. Every feature below targets that gap.

---

## Feature 1: Personality Types

**What MoundProject does**: Six personalities (`shy`, `playful`, `grumpy`, `cheerful`, `sleepy`, `curious`) act as a primary trait that cascades into animation style, expression tendencies, accessory selection, and background preference. A `grumpy` mound won't get a halo; a `sleepy` mound favors the stars background.

**What SoftbodyBlobs has**: The `label` string is the only character identity. Physics presets exist but are independent of any personality concept.

**What to add**: A `personality` field on each blob (alongside `label`). Each personality would define:

- **Physics parameter biases** for the `randomPr()` function — rather than fully random params, weight the distribution toward personality-coherent values:
  - `playful` → higher pressure, lower damping, moderate gravity (bouncy, energetic)
  - `sleepy` → high damping, low gravity, medium tension (slow, floaty, barely moves)
  - `grumpy` → high tension, high bending stiffness, normal gravity (rigid, stiff, doesn't squish easily)
  - `shy` → medium-low pressure, high damping (soft, deflates easily, retreats from contact)
  - `cheerful` → moderate pressure, low damping, slightly high gravity (well-rounded, falls fast, bounces)
  - `curious` → low bending stiffness, moderate pressure (very deformable, stretchy, probes its environment)

- **Color theme affinity** — certain personalities favor certain palettes when randomizing. Moonlight/twilight themes lean `sleepy` or `shy`; candy/sunset lean `playful` or `cheerful`.

The `terrarium-spawn` BroadcastChannel message would be extended to include `personality`:
```json
{ "label": "tardigrade", "preset": "jelly", "color": "#aaccff", "personality": "curious" }
```

Export/import JSON format gains a `personality` field per blob.

**Impact**: Creates a reason for blobs to feel different from each other beyond label text.

---

## Feature 2: Autonomous Idle Animation

**What MoundProject does**: Five animation types (`jello`, `breathe`, `wobble`, `pulse`, `sway`) run continuously as per-vertex deformations. Each is paired with natural easing curves and personality-specific parameters (speed, intensity, asymmetry). A `sleepy` mound breathes slowly; a `playful` one does rapid jello.

**What SoftbodyBlobs has**: Blobs are completely passive. They move only when acted on by gravity, collisions, or dragging. There is no autonomous behavior whatsoever.

**What to add**: Idle behavior as subtle periodic forces injected into the Verlet integration inside `step()`. The key insight is that the physics system already handles everything — you just need to add small controlled perturbations.

- **Breathe**: Periodically modulate the `pres` value up and down using a sine wave. No vertex changes needed — just pulse the pressure constraint. The blob will naturally expand and contract.
- **Pulse**: A faster, sharper version of breathe using a different easing curve (quadratic ease-in-out vs. smooth sine).
- **Wobble**: Add a small periodic lateral impulse to `ox` values of vertices on one side, alternating left/right. Creates a rocking motion.
- **Jello**: On a timer, apply a small random directional velocity nudge to the centroid (add to all `ox` values equally). The blob jiggles and recovers naturally via its own constraints.
- **Sway**: Periodic slow horizontal drift via tiny horizontal impulses — the blob drifts left, slows, drifts right.

Each blob stores: `{ idleType: 'breathe', idlePhase: 0, idleIntensity: 0.4 }`. The `step()` loop increments phase and applies the appropriate perturbation. Intensity is personality-derived but also randomized within a range.

**Critical**: Keep perturbation magnitudes small. The physics system will amplify them. Start at 1/10th of what seems reasonable.

**Impact**: The scene goes from static-until-poked to alive. Blobs that breathe subtly while sitting still feel like creatures.

---

## Feature 3: Facial Expressions and Face Types

**What MoundProject does**: The README reveals a significantly deeper system than the overview describes. There are **15 distinct face types** (classic, sleepy, joyful, wide eyes, tall eyes, angry, sad, squint, special/starry, surprised, worried, derp, pixel, triangle face, square bot), **4 brow types** (none, angry, surprised, worried), a **blush system** (rosy cheeks, personality-driven), and **8 animated emotes** (wink, tongue out, head shake, nod, surprised, sleepy, blushing, shocked). Face type and emote are layered — the face type is the base style, emotes temporarily override it then return.

The README also specifies face type probabilities by personality:
- `sleepy`: 40% sleepy face, 20% squint, 20% classic
- `playful`/`cheerful`: 30% joyful, 20% wide eyes, 15% surprised
- `grumpy`: 30% angry, 20% squint, 15% sad/worried
- `shy`: 25% worried, 20% classic, 15% squint
- `curious`: 30% surprised, 25% wide eyes, 15% tall/special

Blush: 25% base chance, 60% for shy, only 10% for grumpy.

**What SoftbodyBlobs has**: Blobs are featureless colored shapes. The `drawBlob()` function renders shadow, gradient, specular highlight, and optionally a label pill — nothing face-like.

**What to add**: A two-layer face system drawn in `drawBlob()` using the blob's vertex positions to anchor features to the deforming surface.

**Layer 1 — Base face type** (stored as `faceType` per blob). A simpler set of the MoundProject types makes sense for round blobs:
- `classic` — two dot eyes, arc mouth
- `sleepy` — half-closed drooping eyes (D shapes), flat mouth
- `joyful` — wide circular eyes, big upward arc mouth
- `angry` — angled inner-tilted eyes (brow implied by shape), flat or down-arc mouth
- `surprised` — large circular open eyes, small open oval mouth
- `squint` — narrow horizontal eye slits, neutral mouth
- `derp` — asymmetric eyes (one larger, one smaller), lopsided mouth
- `pixel` — eyes drawn as small filled rectangles instead of circles (stylistic departure)

**Layer 2 — Brow overlay**: A `browType` field (`none`, `angry`, `surprised`, `worried`). Brows are short strokes above each eye, angled based on type. Adds expressive character with only 2 line draws.

**Blush**: A `blush` boolean. If true, render two soft semi-transparent circles (using `lightenColor(b.color, 30)`) at cheek positions — vertex ~index 8 and ~index 24. Blush intensity pulses gently with the idle animation phase.

**Reactive moods**: Rather than implementing all 8 emotes, tie 3 reactive states to physics events:
- High-velocity wall impact → brief `faceType` override to `surprised` (0.5s, then revert)
- Sustained squish (area < 60% restArea) → brief `squint` override
- Being dragged → `joyful` while drag is active

The `faceType` stores in the blob object and is included in export JSON. The Terrarium spawn message can include `faceType` and `browType` so Synthograsizer can craft specific-looking creatures.

**Impact**: Even basic dot-eyes on a softbody transform it from an abstract physics object into a character. The face deforming with the blob body as it squishes is a "free" visual win from the existing vertex system. Brows add enormous expressive range for two extra lines of draw code.

---

## Feature 4: Background Variation and Scene Theming

**What MoundProject does**: The README lists **22 background types** — significantly more than the 8 mentioned in the overview. These include stormy sky, underwater world, misty mountains, candy land, tech grid, forest hills, and others. Notably, some backgrounds are **animated** (waves with moving water, stormy clouds with lightning). There's also a **Background Showcase Mode** (press `B`) that cycles through all types interactively. Backgrounds are pre-rendered into an offscreen buffer and reused across frames.

**What SoftbodyBlobs has**: A fixed solid dark background (`#1a1a2e`). No variation of any kind.

**What to add**: A `BACKGROUND_TYPES` system, selectable from the UI or via BroadcastChannel `set-background` message.

**Static backgrounds** (pre-render once to offscreen canvas, `drawImage()` each frame — zero frame cost):
- **Solid** (current default)
- **Gradient** — radial gradient from canvas center, colors derived from active COLOR_THEME
- **Grid** — subtle orthographic grid lines, low opacity. Lab/sandbox aesthetic.
- **Stars** — sparse scattered dots of varying sizes. Good for `sleepy` scenes.
- **Dots** — evenly spaced small circles in a gentle pattern, palette-derived
- **Underwater** — horizontal wavy bands of blue/teal, coral-like shapes at the bottom edge. Good for aquatic terrarium scenes.
- **Candy Land** — soft pastel gradient with small scattered candy-like shapes

**Animated backgrounds** (update once per draw frame, not per physics substep):
- **Waves** — 2–3 sine wave lines drifting horizontally across the scene, very slow. Low vertex count, trivial cost.
- **Stormy** — occasional branching lightning bolt drawn and faded over 8 frames, cloud silhouettes at top. Rare flash intervals.

Background stored in scene state, included in export/import JSON. The personality-background affinity from MoundProject applies: `sleepy` defaults to stars, `playful` to dots or candy, `grumpy` to grid, `curious` to underwater.

**Implementation note**: Since the canvas is only 520×420 and most backgrounds are static, the offscreen buffer approach is straightforward vanilla JS: `const bgCanvas = document.createElement('canvas')` at init, draw once, then `ctx.drawImage(bgCanvas, 0, 0)` each frame. Animated backgrounds skip the buffer and draw directly but are kept cheap.

**Impact**: Different scenes feel distinct. A "terrarium" export set against underwater vs. starfield reads as entirely different content even with the same blobs.

---

## Feature 5: Personality-Coherent Trait Validation

**What MoundProject does**: `validateTraitCombination()` catches thematically clashing trait pairs and replaces them with something coherent (e.g., `grumpy + halo → eyebrows or glasses`).

**What SoftbodyBlobs has**: The `randomPr()` function assigns fully random physics values with no personality awareness. A "sleepy" creature could end up with extremely high gravity and low damping and fall straight to the floor and not move — technically valid but personality-incoherent.

**What to add**: A `buildPersonalityPr(personality)` function that returns physics parameter ranges keyed to personality, used by `randomPr()` when a personality is set:

```javascript
const PERSONALITY_PR_RANGES = {
  sleepy:  { pres:[20,45], damp:[30,50], mass:[3,8],  grav:[2,8],  tens:[20,40], bend:[5,15] },
  playful: { pres:[55,90], damp:[5,18],  mass:[3,8],  grav:[8,18], tens:[25,50], bend:[5,20] },
  grumpy:  { pres:[30,55], damp:[15,30], mass:[8,15], grav:[10,25],tens:[60,90], bend:[20,35] },
  shy:     { pres:[25,50], damp:[25,40], mass:[3,8],  grav:[3,12], tens:[25,45], bend:[5,18] },
  cheerful:{ pres:[50,80], damp:[10,22], mass:[4,10], grav:[12,22],tens:[30,55], bend:[8,22] },
  curious: { pres:[40,70], damp:[12,25], mass:[3,8],  grav:[5,15], tens:[15,35], bend:[2,10] },
};
```

When `randomizeSelected()` runs on a blob with a personality set, it samples from these ranges instead of the global random range. Manual slider overrides still work — this only affects the randomize button behavior.

The Terrarium `apply-preset` workflow would also check personality coherence: if a preset and personality strongly conflict (e.g., `personality: "sleepy"` + `preset: "bouncer"`), log a warning and favor the personality-derived params.

**Impact**: Randomization becomes a character tool rather than a chaos tool. Hitting "randomize" on a labeled creature produces something that still makes sense for that creature.

---

## Feature 6: Seasonal Ambient Particles

**What MoundProject does**: Detects the current season by month and spawns thematic particle elements — butterflies (spring), sun rays (summer), falling leaves (autumn), snowflakes (winter) — as a visual overlay layer.

**What SoftbodyBlobs has**: No ambient particle system. The scene is static aside from blob motion.

**What to add**: A lightweight particle overlay rendered after `draw()` completes, entirely on the canvas's 2D context as a separate pass. Particles do not interact with physics — they are purely cosmetic.

Each particle type is simple:

- **Spring (March–May)**: 3–6 small `+` or `×` shapes that drift upward slowly and fade, spawning from the bottom edge at random intervals
- **Summer (June–Aug)**: Faint radial lines emanating from a point near the top-center (sun ray effect), very low opacity, no animation needed — just draw them statically
- **Autumn (Sept–Nov)**: Small rotated rectangles (leaf shapes) that fall with slight horizontal drift; angle changes as they fall
- **Winter (Dec–Feb)**: Tiny circles that fall straight down slowly; randomly spawn at top edge

Particle system state: an array of `{x, y, vx, vy, life, maxLife, type}` objects. Updated once per draw frame (not substep — no need for physics-rate updates). Max 12 particles in the array to keep overhead negligible.

A `seasonalParticles` boolean in the UI toolbar toggles the system on/off. Off by default in Sandbox mode, on by default in Terrarium mode (where blobs are characters in a scene).

**Impact**: Near-zero performance cost; dramatically increases scene atmosphere without touching physics.

---

## Feature 7: Per-Blob Surface Patterns

**What MoundProject does**: Optional pattern overlay on the mound surface (`stripes`, `spots`, `grid`) rendered using the palette's secondary colors, applied during buffer generation.

**What SoftbodyBlobs has**: Solid color fill with a radial gradient (lighten center, darken edges) and a single specular highlight dot. No surface texture or pattern.

**What to add**: A `pattern` field per blob with values: `null`, `spots`, `stripes`, `dots`. Rendered inside `drawBlob()` after the gradient fill, using canvas clipping to the blob's path:

```
ctx.save()
ctx.clip()          // clip to blob outline (already drawn)
drawPattern(b)      // draw pattern inside clipped region
ctx.restore()
```

- **Spots**: 4–8 filled circles at fixed positions relative to the centroid, scaled with `restR`, colored using `darkenColor(b.color, 20)`. Positions are seeded from the blob index so they don't change each frame.
- **Stripes**: Diagonal lines across the clipped region, spacing proportional to radius.
- **Dots**: Lighter dots in a grid pattern.

Pattern is seeded from a stable value (e.g., blob creation timestamp mod) so it doesn't flicker. Stored in blob's export JSON.

**Impact**: Two blobs of the same color look different; spotted and striped creatures in a terrarium read as distinct species at a glance.

---

## Feature 8: Interaction Milestones / Reactive Events

**What MoundProject does**: The memory system tracks total interactions, specific interaction types, recent interaction sequences, and milestone achievements (10 interactions → special reaction). Detects repeated patterns and responds to them uniquely.

**What SoftbodyBlobs has**: No state persistence around user interaction. Each drag is independent.

**What to add**: A lightweight per-blob interaction counter (not the full MoundProject memory system):

```javascript
// Add to blob object:
interactionCount: 0,
lastVelocityAtRelease: 0,  // captured in endDrag()
```

Milestone reactions at counts: 5, 10, 25, 50. Reaction: a brief radial "pulse" visual effect (a circle expanding from centroid, fading out over 0.5s) rendered in `draw()` from a `pulseEffects[]` array. The pulse color matches the blob color. No physics change, purely visual.

A "hard throw" reaction: when `endDrag()` fling velocity exceeds a threshold (e.g., 15px/frame), trigger a brief 3-frame mood spike to `mood = 1.0` (excited face) regardless of personality.

This is a deliberately minimal version — a gesture toward the MoundProject memory system without the full complexity. It makes blobs feel like they "notice" what happens to them.

**Impact**: Repeated interaction with the same blob creates a micro-narrative. The blob that's been thrown 25 times has a history.

---

## Implementation Priority

Ranked by personality/variability impact relative to implementation complexity:

| # | Feature | Impact | Complexity | Notes |
|---|---------|--------|------------|-------|
| 1 | **Personality type field + physics biases** | High | Low | Foundation for features 2, 3, 5 |
| 2 | **Background variation** | High | Low | Pre-render buffer, 9 types (7 static + 2 animated) |
| 3 | **Autonomous idle animation** | High | Medium | Perturbations in `step()` |
| 4 | **Face types + brows + blush** | High | Medium | 8 face types, vertex-anchored; brows 2 extra lines each |
| 5 | **Surface patterns** | Medium | Low | Canvas clip + seeded draw |
| 6 | **Seasonal ambient particles** | Medium | Low | Purely cosmetic overlay |
| 7 | **Personality-coherent randomization** | Medium | Low | Replaces random ranges |
| 8 | **Interaction milestones** | Low | Low | Counter + pulse visual |

Features 1, 2, and 5 are essentially additive data — low risk, no physics changes, high visible return. Features 3 and 4 touch the render loop but are isolated enough to be safely flagged with a toggle. Feature 6 is entirely optional cosmetic code.

---

## Architecture Notes

All of these features slot into the existing single-file architecture without requiring structural changes:

- **Personality + pattern fields**: extend the blob data structure and export JSON schema
- **Background system**: new `BACKGROUND_TYPES` constant block and a `drawBackground()` function called at the start of `draw()`
- **Idle animation**: new `IDLE_TYPES` and `idlePhase` per blob, 10–15 lines inside `step()`
- **Face rendering**: 20–30 lines inside `drawBlob()` after the existing specular highlight
- **Seasonal particles**: new `particles[]` array and `updateParticles()` / `drawParticles()` called in the animation loop
- **Personality PR ranges**: new `PERSONALITY_PR_RANGES` constant, minor change to `randomPr()`

None of these require changes to the Verlet physics invariants or the collision system. The known-good physics core stays untouched.
