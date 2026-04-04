# Soft-Body Blob Physics Simulator — CLAUDE.md

## Quick Reference

- **Main file**: `Softbody_Physics_Blob.html` (1541 lines, fully self-contained HTML/CSS/JS)
- **Version**: v18
- **Canvas**: 520 x 420px, walls at 14px inset on all sides
- **Physics**: Verlet integration, 32 vertices per blob, 10 substeps per frame, 60Hz fixed timestep
- **Max blobs**: 8 (UI-capped, physics supports more but O(n²) collision)
- **Backups**: `backups/` dir contains v15 and broken-build snapshots
- **Deployed copy**: `synthograsizer-suite/static/fun-stuff/SoftbodyBlobs/index.html`
- **Dev server**: `npx serve -p 3847 .` (launch.json configured at both project root and blob dir)

---

## Architecture Overview

Everything lives in one HTML file. No build step, no dependencies, no modules. The code is organized in this order:

```
Lines 1-57       CSS (inline <style>)
Lines 59-119     HTML (canvas, toolbar, selection bar, mode panels, sliders)
Lines 122-1541   JavaScript (single <script> block, no strict mode)
```

### Code Sections (in order of appearance in JS)

| Section | What it does |
|---------|-------------|
| **Constants** (L131-139) | Canvas dims, wall bounds, N=32 vertices, SUBSTEPS=10 |
| **PHYSICS_PRESETS** (L141-159) | 15 named presets: text string → `{size,pres,tens,damp,mass,grav,bend}` |
| **COLOR_THEMES** (L161-172) | 10 named palettes: text string → array of 5 hex colors |
| **Game Mode State** (L174-200) | `currentMode`, `pictState`, `PICTIONARY_PROMPTS[30]` |
| **BroadcastChannel** (L202-258) | Listener on `'synthograsizer-blob-v1'`, handles 7 message types |
| **Preset/Spawn helpers** (L260-301) | `applyPresetByName()`, `handleTerrariumSpawn()` |
| **Game Mode UI** (L304-470) | `setGameMode()`, Pictionary timer/guess/scoring logic |
| **Canvas Capture** (L473-529) | `captureCanvas()` — renders + broadcasts PNG over channel |
| **Default params** (L531-534) | `DEFAULTS = {size:50, pres:50, tens:35, damp:20, mass:5, grav:5, bend:8}` |
| **Selection system** (L536-610) | `selectedBlobIdx`, `selectedBlobs` Set, `masterMode`, multi-select |
| **Randomize** (L612-640) | `randomPr()`, `applyPrToBlob()`, `randomizeSelected()` |
| **Sliders** (L642-668) | Bidirectional: range ↔ number input, drives `applySliderValue()` |
| **Color picker** (L670-690) | Applies to all `getTargetBlobs()` |
| **Blob count** (L692-698) | Slider drives `syncBlobCount()` |
| **Snap mode** (L700-738) | Toggle mode, joint creation, reset/resetAll |
| **Export/Import** (L740-800) | Full JSON serialization of all state including mode and labels |
| **Blob data structure** (L802-860) | `createBlob()`, `sliderToRadius()`, `dist()`, area/centroid |
| **Color utilities** (L862-880) | `hexToRGB()`, `lightenColor()`, `darkenColor()` |
| **Blob management** (L882-940) | `spawnPositions()`, `syncBlobCount()`, `rebuildBlob()`, `hardReset()` |
| **Drag system** (L942-1030) | `findBlobAt()`, `startDrag()`, `moveDrag()`, `endDrag()` + fling |
| **Snap joints** (L1032-1048) | `createSnapJoint()` — 9 vertex pairs per joint |
| **Mouse/Touch events** (L1050-1060) | Canvas listeners pass event to `startDrag(mx, my, evt)` |
| **Physics step** (L1062-1462) | `step()` — the main simulation loop (see Physics section below) |
| **Rendering** (L1464-1520) | `drawBlob()` with shadow, gradient, specular, label; `drawSnapLines()` |
| **Animation loop** (L1522-1541) | Fixed timestep accumulator, FPS limiter, `draw()` |

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
5. **Pressure** — signed area (shoelace formula) drives inflation/deflation via CW outward normals
6. **Wall collision** — bounce with 0.2 restitution, 0.92 friction. Velocity captured before position clamp.
7. **Per-blob rescue** — if NaN detected or area < 15% of rest area, rebuild blob in place preserving color/pr/label

### Collision System (per substep, all pairs)
Runs after all per-blob physics. Uses cached centroid and radius (`cachePerBlobState()`).

**Layer 1: Centroid safety net** — activates when centroids are closer than 65% of sumR. Pushes both px AND ox (zero velocity injection). Prevents deep interpenetration.

**Layer 2: Vertex-vertex surface repulsion** — for every pair of vertices across two blobs within `colDist` (scaled to average edge length × 1.1), apply 0.25 strength push. Creates squishy contact deformation.

### Critical Physics Invariants
- **CW winding order**: Vertices are created clockwise. Outward normal for edge (i→j) is `(-ey, ex)/len`. Do NOT use an `areaSign` variable — hardcode the CW convention.
- **Pressure magnitude clamped**: `[-0.5, 2.0]` — prevents runaway inflation/deflation
- **Rest area is always positive**: `if (restArea < 0) restArea = -restArea` in createBlob
- **Rescue preserves identity**: color, pr, label all survive rescue/rebuild
- **Centroid safety moves ox WITH px**: This is intentional. Moving only px would inject velocity.

### Fixed Timestep
Physics always runs at 60Hz internally via accumulator pattern. Render FPS (15/24/30) only controls how often `draw()` runs. `MAX_ACCUMULATED = 4 frames` prevents spiral of death.

### Performance (8 blobs, 10 substeps)
- `step()`: ~0.88ms per call
- `draw()`: ~0.09ms per call
- Total: ~1.0ms per frame at 30fps (97% headroom)
- sqrt calls: ~14,400 per step (down from 24,400 after caching optimization)
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
}
```

`sliderToRadius(v)` maps size slider value to pixel radius: `25 + (v - 1) / 124 * 75` → range [25, 100]px.

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
No special UI. Full access to all controls. Labels hidden.

### Terrarium
- Label input appears in selection bar
- Per-blob `label` property shown as a pill beneath each blob on canvas
- Labels rendered with white background pill, blob-colored text
- `handleTerrariumSpawn(creatures)` accepts `[{label, preset, color}, ...]` from BroadcastChannel
- Labels survive rescue, rebuild, export/import

### Pictionary
- 30 built-in prompts, or received from Synthograsizer
- Countdown timer (default 60s), turns red at ≤10s
- Guess input with fuzzy matching (strips articles "a/an/the", checks inclusion both ways)
- Score tracking across rounds
- Results broadcast back via BroadcastChannel `pictionary-result` message

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
[reset] [reset all] [●color] Blobs [N] ────── [snap] [unsnap] [15/24/30fps] [export] [import] [📷] [mode ▼] hint
[●dot] Blob N properties  [🎲 randomize] [☰ master] [label input]
┌─ Mode Panel (terrarium/pictionary description) ──────┐
├─ Pictionary UI: [60] [guess input] [Guess] score reveal [New Round] ─┤
├─ Slider Grid (2 columns): ───────────────────────────┤
│  Size ────────  Inflation ────────                    │
│  Rubber ──────  Damping ──────────                    │
│  Fluid mass ──  Gravity ──────────                    │
│  Bending ─────                                        │
└──────────────────────────────────────────────────────┘
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

Import rebuilds blobs at grid spawn positions with saved colors, properties, labels, and mode.

---

## Key Functions Reference

### Physics
- `step()` — main simulation (call once per 60Hz tick)
- `cachePerBlobState()` — computes `_cachedCen[]` and `_cachedR[]` for collision
- `rescueBlob(bi)` — rebuild blob in place, preserving identity
- `blobNeedsRescue(b)` — NaN check + area collapse detection
- `blobSignedArea(b)` — shoelace formula (returns negative for CW winding)
- `blobCentroid(b)` — average of all vertex positions

### Blob Management
- `createBlob(cx, cy, radius, color, pr)` → blob object
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
- `setGameMode(mode)` — switch sandbox/terrarium/pictionary, update UI
- `startPictionaryRound(prompt, duration)` — begin countdown
- `endPictionaryRound(guessedCorrectly)` — stop timer, show result
- `handleTerrariumSpawn(creatures)` — spawn from BroadcastChannel

### Rendering
- `drawBlob(b, isSelected)` — shadow, smooth path, glow, gradient, specular, label
- `drawSnapLines()` — dashed yellow lines between snapped pair centroids
- `captureCanvas()` — re-render + broadcast PNG (no physics advance)

---

## Known Issues & Future Work

### Open considerations
- `roundRect()` in label rendering requires modern browsers (Chrome 99+, Firefox 112+)
- Gradient objects created fresh every frame (24 allocations at 8 blobs) — could be cached
- Collision is O(n²) — spatial hash would enable >8 blobs
- TypedArrays for vertex data would improve cache coherence
- No undo/redo system
- No translucency/opacity control
- No mouse force field (proximity-based push without clicking)

### Past bugs (solved, do not re-introduce)
- **Never use `areaSign` variable** — hardcode CW outward normals `(-ey, ex)/len`
- **Never skip collision for freshly spawned blobs** — grace periods cause pile-up explosions
- **Never move only `px` in centroid safety** — must move `ox` equally to avoid velocity injection
- **Rescue must preserve label, color, pr** — never reset to defaults on NaN
- **Wall bounce must capture velocity before clamping** — `vx = px - ox` then `px = WALL`

---

## File Map

```
02_Generative_Art/Blob/
├── Softbody_Physics_Blob.html          ← THE file (1541 lines, everything)
├── CLAUDE.md                           ← this document
└── backups/
    ├── Softbody_Physics_Blob - Copy.html       (v15, single blob)
    ├── Softbody_Physics_Blob - Copy (2).html   (broken build backup)
    └── Softbody_Physics_Blob - Copy (3).html   (another backup)

synthograsizer-suite/
├── static/fun-stuff/
│   ├── index.html                      (embeds blob sim in iframe)
│   └── SoftbodyBlobs/index.html        (deployed copy of blob sim)
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
