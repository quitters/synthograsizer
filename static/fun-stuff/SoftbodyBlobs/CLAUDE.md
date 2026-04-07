# Soft-Body Blob Physics Simulator — CLAUDE.md

## Quick Reference

- **Main file**: `Softbody_Physics_Blob.html` (~1790 lines, fully self-contained HTML/CSS/JS)
- **Version**: v18 + face/personality layer + debug overlay
- **Canvas**: 520 x 420px, walls at 14px inset on all sides
- **Physics**: Verlet integration, 32 vertices per blob, 10 substeps per frame, 60Hz fixed timestep
- **Max blobs**: 8 (UI-capped, physics supports more but O(n²) collision)
- **Backups**: `backups/` dir contains v15 and broken-build snapshots
- **Deployed copy**: `synthograsizer-suite/static/fun-stuff/SoftbodyBlobs/index.html`
- **Dev server**: `npx serve -p 3847 .` (launch.json configured at both project root and blob dir)
- **Both files must be kept in sync** — dev master at `02_Generative_Art/Blob/Softbody_Physics_Blob.html` is authoritative

---

## Architecture Overview

Everything lives in one HTML file. No build step, no dependencies, no modules. The code is organized in this order:

```
Lines 1-57       CSS (inline <style>)
Lines 59-125     HTML (canvas, toolbar, selection bar, mode panels, sliders)
Lines 128+       JavaScript (single <script> block, no strict mode)
```

### Code Sections (in order of appearance in JS)

| Section | What it does |
|---------|-------------|
| **Constants** | Canvas dims, wall bounds, N=32 vertices, SUBSTEPS=10 |
| **PHYSICS_PRESETS** | 15 named presets: text string → `{size,pres,tens,damp,mass,grav,bend}` |
| **COLOR_THEMES** | 10 named palettes: text string → array of 5 hex colors |
| **Game Mode State** | `currentMode`, `pictState`, `PICTIONARY_PROMPTS[30]` |
| **BroadcastChannel** | Listener on `'synthograsizer-blob-v1'`, handles 7 message types |
| **Preset/Spawn helpers** | `applyPresetByName()`, `handleTerrariumSpawn()` |
| **Game Mode UI** | `setGameMode()`, Pictionary timer/guess/scoring logic |
| **Canvas Capture** | `captureCanvas()` — renders + broadcasts PNG over channel |
| **Default params** | `DEFAULTS = {size:50, pres:50, tens:35, damp:20, mass:5, grav:5, bend:8}` |
| **Selection system** | `selectedBlobIdx`, `selectedBlobs` Set, `masterMode`, multi-select |
| **Randomize** | `randomPr()`, `applyPrToBlob()`, `randomizeSelected()` |
| **Sliders** | Bidirectional: range ↔ number input, drives `applySliderValue()` |
| **Color picker** | Applies to all `getTargetBlobs()` |
| **Eyes toggle** | `showEyes` boolean, wired to `#eyesToggle` checkbox |
| **Blob count** | Slider drives `syncBlobCount()` |
| **Snap mode** | Toggle mode, joint creation, reset/resetAll |
| **Export/Import** | Full JSON serialization of all state including mode and labels |
| **Blob data structure** | `createBlob()`, `sliderToRadius()`, `dist()`, area/centroid |
| **Color utilities** | `hexToRGB()`, `lightenColor()`, `darkenColor()` |
| **Blob management** | `spawnPositions()`, `syncBlobCount()`, `rebuildBlob()`, `hardReset()` |
| **Drag system** | `findBlobAt()`, `startDrag()`, `moveDrag()`, `endDrag()` + fling |
| **Snap joints** | `createSnapJoint()` — 9 vertex pairs per joint |
| **Mouse/Touch events** | Canvas listeners pass event to `startDrag(mx, my, evt)` |
| **Physics step** | `step()` — main simulation loop (see Physics section) |
| **Face rendering** | `drawFace(b, cen, spanX, spanY)` — eyebrows, eyes, mouth |
| **Blob rendering** | `drawBlob()` with shadow, gradient, face, specular, label |
| **Debug overlay** | `drawDebug()` — vertices, velocity arrows, bounding boxes, HUD; only runs when `debugMode` is true |
| **Snap lines** | `drawSnapLines()` — dashed yellow lines between snapped centroids |
| **Animation loop** | Fixed timestep accumulator, FPS limiter, `draw()` |

> **Note on line numbers**: Line numbers shift as features are added. Grep for function names rather than relying on exact line numbers.

---

## Physics Engine

### Verlet Integration
Position-based dynamics. Each vertex stores current position `(px, py)` and old position `(ox, oy)`. Velocity is implicit: `v = px - ox`. No explicit velocity arrays.

```
vx = (px - ox) * dampFactor
vy = (py - oy) * dampFactor + gravity * dt²
ox = px; oy = py
px += vx; py += vy
```

### Constraint Pipeline (per substep, per blob)
1. **Verlet integration** — gravity + damping
2. **Soft drag** — if being dragged, pull grab region toward mouse (±6 vertices)
3. **Edge constraints** — 2 Gauss-Seidel iterations maintaining rest lengths between adjacent vertices
4. **Bending constraints** — skip-one-vertex distance constraints for shape rigidity
5. **Pressure** — signed area (shoelace formula) drives inflation/deflation via CW outward normals. A tiny sinusoidal `_breathPhase` offset is added here to create idle breathing.
6. **Wall collision** — bounce with 0.2 restitution, 0.92 friction. Velocity captured before position clamp.
7. **Per-blob rescue** — if NaN detected or area < 15% of rest area, rebuild blob in place preserving color/pr/label/breathPhase

### Collision System (per substep, all pairs)
Runs after all per-blob physics. Uses cached centroid and radius (`cachePerBlobState()`).

**Layer 1: Centroid safety net** — activates when centroids are closer than 65% of sumR. Pushes both px AND ox (zero velocity injection). Prevents deep interpenetration.

**Layer 2: Vertex-vertex surface repulsion** — for every pair of vertices across two blobs within `colDist` (scaled to average edge length × 1.1), apply 0.25 strength push. Creates squishy contact deformation.

### Critical Physics Invariants
- **CW winding order**: Vertices are created clockwise. Outward normal for edge (i→j) is `(-ey, ex)/len`. Do NOT use an `areaSign` variable — hardcode the CW convention.
- **Pressure magnitude clamped**: `[-0.5, 2.0]` — prevents runaway inflation/deflation. The breath offset (±0.025) is well within safe range.
- **Rest area is always positive**: `if (restArea < 0) restArea = -restArea` in createBlob
- **Rescue preserves identity**: color, pr, label, and `_breathPhase` all survive rescue/rebuild
- **Centroid safety moves ox WITH px**: This is intentional. Moving only px would inject velocity.

### Fixed Timestep
Physics always runs at 60Hz internally via accumulator pattern. Render FPS (15/24/30) only controls how often `draw()` runs. `MAX_ACCUMULATED = 4 frames` prevents spiral of death.

### Performance (8 blobs, 10 substeps)
- `step()`: ~0.88ms per call
- `draw()`: ~0.09ms per call
- Total: ~1.0ms per frame at 30fps (97% headroom)
- Bottleneck: O(N²×V²) vertex-vertex collision = 28 pairs × 1024 vertex checks × 10 substeps = 286,720 checks

---

## Blob Data Structure

```javascript
{
  px: number[32],        // current x positions (vertices)
  py: number[32],        // current y positions
  ox: number[32],        // old x positions (velocity = px - ox)
  oy: number[32],        // old y positions
  edgeRest: number[32],  // rest lengths between adjacent vertices
  bendRest: number[32],  // rest lengths between skip-one vertices
  restArea: number,      // initial signed area (always positive)
  restR: number,         // radius at creation time
  color: string,         // hex color e.g. '#e74c3c'
  pr: {                  // physics parameters (per-blob, mutable)
    size: number,        // 1-125, maps to radius via sliderToRadius()
    pres: number,        // 0-125, inflation pressure
    tens: number,        // 5-125, rubber tension (edge stiffness)
    damp: number,        // 1-50, velocity damping
    mass: number,        // 1-15, fluid mass (affects gravity)
    grav: number,        // 0-50, gravity strength
    bend: number,        // 0-38, bending stiffness
  },
  label: string,         // Terrarium mode creature name (empty string default)
  _breathPhase: number,  // idle breathing phase (radians, random init, advances each frame)
}
```

`sliderToRadius(v)` maps size slider value to pixel radius: `25 + (v - 1) / 124 * 75` → range [25, 100]px.

---

## Face System (Terrarium Mode)

### Overview
Faces are drawn in `drawFace(b, cen, spanX, spanY)`, called from `drawBlob()`. They only render in Terrarium mode when `showEyes === true`. The face has three layers rendered in order: **eyebrows → eyes → mouth**.

All face positions are derived from the blob's live **centroid** and **bounding box span** (`spanX`, `spanY`), so the face naturally deforms with the blob's physics — when the blob squishes flat, the eyes get closer and the mouth changes expression.

### Expression System
Expression is driven by the blob's current **aspect ratio** (`spanX / spanY`):

| Aspect | Shape | Expression |
|--------|-------|-----------|
| ~1.0 | Round (at rest) | Slight smile, neutral brows |
| > 1.4 | Wide/flat (squished) | Frown, worried brows (inner ends lower) |
| < 0.7 | Tall (stretched) | Bigger smile, relaxed brows |

`mood = clamp(0.2 + (1.0 - aspect) * 0.5, -0.5, 0.7)`

### Face Layout (relative to centroid)
- **Left eye**: `(cen.x - spanX*0.17, cen.y - spanY*0.16)`
- **Right eye**: `(cen.x + spanX*0.17, cen.y - spanY*0.16)`
- **Eyebrows**: above each eye by `er * 1.85`, angled by `innerSlant` derived from aspect ratio
- **Mouth**: center at `(cen.x, cen.y + spanY*0.20)`, width `±spanX*0.12`, bezier control point shifts by `mood * spanY * 0.09`

### Eye Rendering
- **Sclera**: white circle, radius `max(2.5, restR * 0.115)`
- **Pupil**: dark circle, radius `er * 0.55`
- **Shine**: small white dot offset upper-left by `er * 0.22`

### Toggle
- `showEyes` (boolean) — toggled by `#eyesToggle` checkbox in toolbar
- The checkbox wrapper `#eyesToggleWrap` is `display:none` in Sandbox/Pictionary, `display:inline-flex` in Terrarium
- `setGameMode()` handles show/hide when mode changes

---

## Idle Breathing

Each blob has `_breathPhase` (radians, random init in `createBlob()`). Each render frame: `b._breathPhase += 0.07` (~3s per breath cycle at 30fps, staggered between blobs by random init).

In `step()`, the breathing adds a tiny sinusoidal offset to the pressure target area:
```javascript
const breathe = Math.sin(b._breathPhase) * 0.025;
const targetArea = b.restArea * (0.6 + (p.pres / 100) * 0.9 + breathe);
```

Amplitude of ±2.5% of rest area is subtle but visible — enough to make blobs feel alive while not fighting the pressure constraint or approaching the rescue threshold (15%).

`_breathPhase` is not critical to blob identity and does not need to survive export/import (it reinitializes on load).

---

## Debug Overlay

### Toggle
- `debugMode` (boolean) — toggled by `#debugBtn` button in toolbar (`.active` CSS class applied when on)
- State variables: `_dbStepMs`, `_dbDrawMs`, `_dbFPS`, `_dbFrameCount`, `_dbFPSAccum`
- FPS is sampled every 500ms by accumulating `elapsed` and frame count; result stored in `_dbFPS`
- All timing uses `performance.now()` — zero overhead when `debugMode` is false

### What it renders (function: `drawDebug()`)
Called after `drawSnapLines()` at the end of each render frame when `debugMode === true`.

**Per-blob overlays** (drawn for every blob):
| Element | What it shows |
|---------|--------------|
| Dashed yellow bounding box | Live AABB from vertex min/max |
| Red crosshair at centroid | Average of all 32 vertex positions |
| Cyan velocity arrow | Average velocity vector (px-ox), scaled ×10; arrowhead included |
| Colored vertex dots (r=2px) | All 32 vertices; cyan (slow, 0px/frame) → red (fast, 4+px/frame) |
| Yellow info tag above AABB | `B{idx}  {area%}%  asp:{ratio}` — index, area as % of rest area, aspect ratio |

**Snap joint labels** (one per snapped pair):
- Shows `j{a}↔{b}  d:{dist}px` midway between the two blob centroids
- Only renders when there are active snap joints

**Global HUD (top-left, inside left wall)**:
| Line | Color | Content |
|------|-------|---------|
| FPS | bright green | `FPS   {actual} / {target}` — sampled actual vs target |
| step | pale green | `step  {ms} ms` — physics accumulator loop time, current frame |
| draw | pale green | `draw  {ms} ms` — render pass time, previous frame |
| blobs | pale green | `blobs {N}   joints {M}` — live blob and joint counts |
| config | pale green | `N=32   sub=10` — vertex count and substep count |

> **Note on draw timing**: `_dbDrawMs` is measured wrapping the full render pass including `drawDebug()` itself — so it includes its own rendering cost. The value shown is from the *previous* frame, which is the correct behavior for a non-intrusive profiler.

---

## Selection System

Three tiers, mutually exclusive:

| Mode | State | `getTargetBlobs()` returns |
|------|-------|---------------------------|
| **Single** | `selectedBlobs = {idx}` | `[blobs[idx]]` |
| **Multi** | `selectedBlobs = {a, b, c}` | `[blobs[a], blobs[b], blobs[c]]` |
| **Master** | `masterMode = true` | `blobs` (all) |

- `selectSingle(bi)` — clears set, adds one, exits master
- `toggleMultiSelect(bi)` — Ctrl/Cmd-click adds/removes from set
- `setMasterMode(on)` — toggles master, clears multi-select
- `isSelected(bi)` — used by draw loop for glow rendering
- `selectedBlobIdx` is always the "primary" — its values are shown in sliders

All controls use `getTargetBlobs()`: sliders, color picker, randomize, reset.

---

## Game Modes

### Sandbox (default)
No special UI. Full access to all controls. Labels hidden. Faces hidden.

### Terrarium
- Label input appears in selection bar
- Per-blob `label` property shown as a pill beneath each blob on canvas
- Labels rendered with white background pill, blob-colored text
- **Faces visible** when `showEyes` toggle is checked (default: on)
- Eyes toggle checkbox `#eyesToggleWrap` appears in toolbar
- `handleTerrariumSpawn(creatures)` accepts `[{label, preset, color}, ...]` from BroadcastChannel
- Labels survive rescue, rebuild, export/import

### Pictionary
- 30 built-in prompts, or received from Synthograsizer
- Countdown timer (default 60s), turns red at ≤10s
- Guess input with fuzzy matching (strips articles "a/an/the", checks inclusion both ways)
- Score tracking across rounds
- Results broadcast back via BroadcastChannel `pictionary-result` message
- Faces hidden (would interfere with shape-guessing gameplay)

---

## BroadcastChannel Protocol

**Channel name**: `'synthograsizer-blob-v1'`

### Messages FROM Synthograsizer → Blob Sim
| type | payload | action |
|------|---------|--------|
| `set-mode` | `{mode}` | Switch to sandbox/terrarium/pictionary |
| `terrarium-spawn` | `{creatures: [{label, preset, color}]}` | Spawn labeled creatures with presets |
| `apply-preset` | `{preset, blobIndex?}` | Apply named preset to one or all blobs |
| `set-labels` | `{labels: string[]}` | Set labels by index |
| `pictionary-start` | `{prompt, duration?}` | Start a Pictionary round |
| `set-colors` | `{theme}` or `{colors: string[]}` | Apply color theme or explicit colors |
| `ping` | — | Liveness check |

### Messages FROM Blob Sim → Synthograsizer
| type | payload | when |
|------|---------|------|
| `canvas-capture` | `{imageData, mode, blobCount, labels, prompt, presets, timestamp}` | User clicks 📷 capture |
| `mode-changed` | `{mode}` | Mode switch |
| `pictionary-result` | `{correct, prompt, score, total}` | Round ends |
| `pong` | `{mode}` | Response to ping |

### Synthograsizer-side bridge
`synthograsizer-suite/static/synthograsizer/js/blob-bridge.js` (213 lines):
- Listens on same channel
- `canvas-capture` → injects PNG into `studioIntegrationInstance.selectedRefImages` as a reference image
- Auto-populates studio prompt input with context
- Exposes `window.BlobBridge` API: `.setMode()`, `.spawnCreatures()`, `.applyPreset()`, `.setColorTheme()`, `.startPictionary()`, `.ping()`

---

## Synthograsizer Templates

Five template JSONs in `synthograsizer-suite/static/synthograsizer/templates/`:

| Template | Variables | Purpose |
|----------|-----------|---------|
| `blob-terrarium.json` | count, physics, creature, color_theme, personality | Terrarium creature generation |
| `blob-pictionary.json` | secret_prompt, difficulty, blob_count, time_limit, color_theme | Pictionary game setup |
| `blob-sketch-transform.json` | concept, style, image | Workflow: analyze blob canvas → generate illustration |
| `blob-terrarium-portrait.json` | creatures, environment, art_style, image | Workflow: creature names → portrait + wide scene |
| `blob-pictionary-reveal.json` | secret_prompt, reveal_style, blob_capture | Workflow: analyze attempt → reveal + verdict |

---

## UI Layout

```
┌─────────────────── Canvas 520×420 ───────────────────┐
│  Walls (14px dark), ceiling line, blobs render here  │
└──────────────────────────────────────────────────────┘
[reset] [reset all] [●color] Blobs [N] ── [snap] [unsnap] [fps▼] [export] [import] [📷] [mode▼] [☑eyes*] [🐛debug] hint
[●dot] Blob N properties  [🎲 randomize] [☰ master] [label input*]
┌─ Mode Panel (terrarium/pictionary description) ──────┐
├─ Pictionary UI: [60] [guess input] [Guess] score reveal [New Round] ─┤
├─ Slider Grid (2 columns): ───────────────────────────┤
│  Size ────────  Inflation ────────                    │
│  Rubber ──────  Damping ──────────                    │
│  Fluid mass ──  Gravity ──────────                    │
│  Bending ─────                                        │
└──────────────────────────────────────────────────────┘
* Terrarium mode only
```

---

## Export/Import JSON Format

```json
{
  "version": 1,
  "targetFPS": 30,
  "blobCount": 4,
  "masterMode": false,
  "selectedBlobIdx": 0,
  "mode": "terrarium",
  "blobs": [
    {
      "color": "#e74c3c",
      "pr": { "size": 80, "pres": 40, "tens": 25, "damp": 35, "mass": 8, "grav": 12, "bend": 15 },
      "label": "tardigrade"
    }
  ]
}
```

Import rebuilds blobs at grid spawn positions with saved colors, properties, labels, and mode. `_breathPhase` is not exported — blobs get fresh random phases on import.

---

## Key Functions Reference

### Physics
- `step()` — main simulation (call once per 60Hz tick). Contains breath offset in pressure calculation.
- `cachePerBlobState()` — computes `_cachedCen[]` and `_cachedR[]` for collision
- `rescueBlob(bi)` — rebuild blob in place, preserving identity (color, pr, label, `_breathPhase`)
- `blobNeedsRescue(b)` — NaN check + area collapse detection (threshold: 15% of restArea)
- `blobSignedArea(b)` — shoelace formula (returns negative for CW winding)
- `blobCentroid(b)` — average of all vertex positions

### Blob Management
- `createBlob(cx, cy, radius, color, pr)` → blob object (initializes `_breathPhase` randomly)
- `rebuildBlob(bi)` — recreate at current centroid with current pr (preserves label)
- `syncBlobCount()` — add/remove blobs to match `targetCount`
- `hardReset()` — nuke everything, respawn at grid positions with defaults
- `spawnPositions(total, r)` → array of `{x, y}` grid positions

### Selection
- `selectSingle(bi)` — single-select one blob
- `toggleMultiSelect(bi)` — add/remove from multi-selection
- `getTargetBlobs()` → array of blob objects that controls should affect
- `isSelected(bi)` → boolean for draw glow
- `syncSlidersToBlob(bi)` — update all UI from blob bi's state

### Presets
- `applyPresetByName(name, blobIndex?)` — look up PHYSICS_PRESETS, apply
- `applyPrToBlob(bi, pr)` — set pr, rebuild if size changed

### Modes
- `setGameMode(mode)` — switch sandbox/terrarium/pictionary, update UI (shows/hides eyes toggle)
- `startPictionaryRound(prompt, duration)` — begin countdown
- `endPictionaryRound(guessedCorrectly)` — stop timer, show result
- `handleTerrariumSpawn(creatures)` — spawn from BroadcastChannel

### Rendering
- `drawFace(b, cen, spanX, spanY)` — eyebrows, eyes, mouth; aspect-ratio driven expression
- `drawBlob(b, isSelected)` — shadow, smooth path, glow, gradient, face, specular, label
- `drawDebug()` — per-blob vertex dots + bounding box + velocity arrow + info tag; global HUD; snap joint distance labels
- `drawSnapLines()` — dashed yellow lines between snapped pair centroids
- `captureCanvas()` — re-render + broadcast PNG (no physics advance)

---

## Known Issues & Future Work

### Planned next features (from mound-to-blob-features.md)
- **Personality type field** — per-blob personality biasing physics randomization and face defaults
- **Background variation** — gradient, grid, stars, dots, underwater, animated waves
- **Surface patterns** — spots/stripes rendered via canvas clip inside blob body
- **Seasonal ambient particles** — cosmetic overlay, max 12 particles, real-date season detection

### Open considerations
- `roundRect()` in label rendering requires modern browsers (Chrome 99+, Firefox 112+)
- Gradient objects created fresh every frame (24 allocations at 8 blobs) — could be cached
- Collision is O(n²) — spatial hash would enable >8 blobs
- TypedArrays for vertex data would improve cache coherence
- No undo/redo system
- No translucency/opacity control
- No mouse force field (proximity-based push without clicking)
- Face expression types (sleepy, angry, surprised) — currently only aspect-ratio-driven neutral/smile/frown

### Past bugs (solved, do not re-introduce)
- **Never use `areaSign` variable** — hardcode CW outward normals `(-ey, ex)/len`
- **Never skip collision for freshly spawned blobs** — grace periods cause pile-up explosions
- **Never move only `px` in centroid safety** — must move `ox` equally to avoid velocity injection
- **Rescue must preserve label, color, pr** — never reset to defaults on NaN
- **Wall bounce must capture velocity before clamping** — `vx = px - ox` then `px = WALL`
- **Eye positioning**: do NOT use fixed vertex indices (v12/v20) for eye anchoring — they land at 2/10 o'clock and look too far apart. Use `cen ± spanX*0.17` instead.

---

## File Map

```
02_Generative_Art/Blob/
├── Softbody_Physics_Blob.html          ← THE file (~1620 lines, everything) — AUTHORITATIVE
├── CLAUDE.md                           ← this document (also at SoftbodyBlobs/CLAUDE.md)
└── backups/
    ├── Softbody_Physics_Blob - Copy.html       (v15, single blob)
    ├── Softbody_Physics_Blob - Copy (2).html   (broken build backup)
    └── Softbody_Physics_Blob - Copy (3).html   (another backup)

synthograsizer-suite/
├── static/fun-stuff/
│   ├── index.html                      (embeds blob sim in iframe)
│   └── SoftbodyBlobs/
│       ├── index.html                  (deployed copy — must stay in sync with dev master)
│       ├── CLAUDE.md                   (this document)
│       └── mound-to-blob-features.md   (feature integration planning doc)
└── static/synthograsizer/
    ├── js/blob-bridge.js               (BroadcastChannel receiver, 213 lines)
    ├── index.html                      (loads blob-bridge.js)
    └── templates/
        ├── blob-terrarium.json
        ├── blob-pictionary.json
        ├── blob-sketch-transform.json
        ├── blob-terrarium-portrait.json
        └── blob-pictionary-reveal.json
```
