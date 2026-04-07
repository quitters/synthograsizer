# Pocket Prospector — Conversation Handoff Summary

## Origin: Academic Analysis → Game Design

This project began as a university-level essay exam comparing the UI/UX design philosophies of two incremental games: **Scritchy Scratchy** (2026) and **Cookie Clicker** (2013). The central thesis that emerged — and which drives every decision in this project — is:

> **Cookie Clicker is outcome-focused** (optimizing for the dopamine of watching numbers rise), while **Scritchy Scratchy is process-focused** (optimizing for the tactile pleasure of the scratch itself).

Pocket Prospector was then designed as a **final exam game jam project** that synthesizes the best of both: Scritchy Scratchy's atmospheric, process-focused scratch interaction with Cookie Clicker's transparent, always-visible economy sidebar.

## The Spatial Contract

The single most important UX principle in the game:

- **Center workbench = experience** (tactile, atmospheric, process-focused — Scritchy Scratchy's philosophy)
- **Side panels = information** (transparent, always-visible, outcome-focused — Cookie Clicker's philosophy)
- Players shift between modes **by moving their eyes, not navigating menus**

## Architecture: Modular, Event-Driven, Data-Not-Code

The codebase follows a strict principle: **new content = new data object, not new code**. The architecture consists of:

- **EventBus** — central communication; no module imports another directly
- **Reactive state store** — implemented as `useReducer` in the React prototype; each module owns a slice
- **Data-driven content** — claim types, upgrades, and geology tables are pure data objects
- **Split rendering** — Canvas for the scratch interaction (performance-critical), DOM for sidebars (reactivity-friendly)

### Key modules:
1. **ClaimEngine** — generates tile grids from geology templates, handles scratch damage
2. **EconomyManager** — tracks currencies, processes transactions
3. **UpgradeRegistry** — defines upgrade trees as data objects with cost curves
4. **CatalogSystem** — manages claim-type unlocks and collection tracking
5. **PrestigeLoop** — handles soft resets, stratum descent, permanent multipliers
6. **IdleEngine** — mining drones for offline production
7. **InputRouter** — normalizes mouse/touch into unified scratch stream
8. **SaveManager** — versioned localStorage with migration support

## Current Prototype State

The working React prototype (`pocket_prospector_prototype.jsx`) includes:

### Core mechanics:
- **Scratch tiles** with hardness-based progressive damage (tiles crack visually as damage accumulates)
- **Variable mineral rewards** with per-claim geology tables
- **Gold economy** with animated rolling counter
- **Four upgrade paths**: Pick power, Brush width, Keen eye (luck), Quick hands (auto-scratch)
- **Combo system** — consecutive valuable reveals build a multiplier (up to 20×, +5% per stage), resets on worthless rock, decays after 2.2s inactivity
- **Prestige system** — "Descend deeper" resets gold/upgrades, unlocks new strata, earns permanent multiplier picks

### Juice (what makes it fun):
- **Web Audio synthesis** — real-time scratch sounds tuned per claim type (frequency varies: gritty earth, sharp stone, low rumble for volcanic), ascending tones on mineral reveal, four-note arpeggio on rare finds, triangle-wave chirp on upgrade purchase
- **Screen shake** — scaled to rarity (gentle wobble → serious rattle → violent quake)
- **Sparkle particles** — radial burst on glowing minerals, 16-particle explosion on ultra-rares
- **Tile shimmer** — pulsing border preview at 70%+ damage showing mineral color beneath
- **Floating gold particles** — "+value" text that drifts upward with combo indicators
- **Completion bonus** — 20% value bonus for clearing entire claims
- **Touch support** — touchStart/touchMove with element-from-point resolution

### Three claim types implemented:
1. **Shallow Soil** (H:3) — warm browns, fast/loose, no hazards
2. **Deep Stone** (H:8) — cool grays, slow/resistant, gas pocket hazards
3. **Volcanic Core** (H:14) — black/orange, very slow, lava timer hazards

## The Mode System (Next Task)

We designed **six thematic modes** that share the same underlying architecture but completely transform the game's verb, visual identity, economy language, and audio profile. Each mode maps 1:1 onto the same variable structure — swapping modes means swapping one data object.

### Mode 1: Pocket Prospector (implemented)
- **Verb**: Scratch / chisel
- **Surface**: Rock slab → **Workspace**: Miner's workbench
- **Currency**: Gold → **Collection**: Field journal → **Display**: Specimen jars
- **Tiers**: Shallow soil → Deep stone → Volcanic core → Fossil beds
- **Prestige**: "Descend deeper" → earn Prestige picks
- **Palette**: Earth browns, slate grays, magma reds, gold accents
- **Audio**: Clinks, scraping stone, echoing cavern
- **Feel**: Gritty resistance, chips fly, cracks radiate

### Mode 2: Petit Patissier
- **Verb**: Tap / crack
- **Surface**: Brulee ramekin → **Workspace**: Pastry station
- **Currency**: Stars → **Collection**: Recipe book → **Display**: Tasting shelf
- **Tiers**: Vanilla custard → Dark chocolate → Citrus glaze → Salted caramel
- **Prestige**: "New kitchen" → earn Michelin points
- **Palette**: Cream, chocolate, citrus orange, caramel, gold star
- **Audio**: Tap-tap-crack, ceramic ring, sugar crunch
- **Feel**: Sharp crack, clean break, satisfying shatter
- **Hazards**: Burnt sugar (0 value), Over-whip (texture lost), Crystallization
- **Variables**: `dessertType`, `crustThickness`, `flavors`, `stars`, `spoonWeight`, `crackSpread`, `palate`

### Mode 3: Lost Layers
- **Verb**: Brush / scrape
- **Surface**: Plaster wall section → **Workspace**: Excavation table
- **Currency**: Prestige → **Collection**: Excavation log → **Display**: Restoration gallery
- **Tiers**: Roman villa → Byzantine chapel → Moorish palace → Renaissance crypt
- **Prestige**: "New dig site" → earn Grant funding
- **Palette**: Plaster tan, lapis blue, crimson tile, gold leaf, verdigris
- **Audio**: Gentle brush strokes, pebble clicks, whispered discovery
- **Feel**: Soft brushing, delicate precision, dust falls away
- **Hazards**: Water damage (faded), Structural crack (section lost), Forgery (worthless)
- **Variables**: `siteType`, `plasterDepth`, `tesserae`, `prestige`, `brushFineness`, `sweepWidth`, `expertise`

### Mode 4: Frost & Found
- **Verb**: Scrape / melt
- **Surface**: Frosted pane → **Workspace**: Cabin windowsill
- **Currency**: Warmth → **Collection**: View journal → **Display**: Snow globe shelf
- **Tiers**: Morning frost → Deep freeze → Blizzard glass → Permafrost
- **Prestige**: "Next winter" → earn Hearth stones
- **Palette**: Light frost, ice blue, deep cold, midnight, hearth orange
- **Audio**: High-pitched scraping, crystalline tinkle, wind howl
- **Feel**: Smooth glide, ice curls peel away, glass clears
- **Hazards**: Black ice (lose turn), Refreezing (tile re-seals), Fog (obscures view)
- **Variables**: `paneType`, `frostDepth`, `scenes`, `warmth`, `scraperEdge`, `meltRadius`, `perception`

### Mode 5: Hexharvest
- **Verb**: Uncap / slice
- **Surface**: Honeycomb frame → **Workspace**: Extraction bench
- **Currency**: Nectar → **Collection**: Hive ledger → **Display**: Honey jars
- **Tiers**: Clover field → Wildflower meadow → Manuka grove → Royal jelly chamber
- **Prestige**: "New season" → earn Queen's favor
- **Palette**: Light honey, dark honey, amber, propolis, wax, pollen
- **Audio**: Soft wax pop, liquid glug, buzzing ambience
- **Feel**: Waxy pop per cell, viscous reveal, satisfying slice
- **Hazards**: Empty cell, Drone cell (no honey), Mite damage (value halved)
- **Variables**: `frameType`, `waxThickness`, `harvest`, `nectar`, `bladeSharpness`, `heatSpread`, `beeSense`

### Mode 6: Sealed Secrets
- **Verb**: Break / pry
- **Surface**: Sealed envelope → **Workspace**: Candlelit desk
- **Currency**: Ink → **Collection**: Correspondence archive → **Display**: Wax impression case
- **Tiers**: Personal letters → Royal decrees → Spy dispatches → Ancient scrolls
- **Prestige**: "New era" → earn Seal fragments
- **Palette**: Wax red, ink black, gold leaf, navy, parchment, burgundy
- **Audio**: Crisp crack, paper rustling, candle flicker
- **Feel**: Rigid snap, wax crumbles, parchment unfolds
- **Hazards**: Forgery (worthless), Burned edges (partial reveal), Cipher (extra work)
- **Variables**: `sealType`, `waxHardness`, `contents`, `ink`, `leverForce`, `heatRadius`, `intuition`

## Implementation Plan for Mode Switching

The mode system should work as follows:

1. **Create a `MODE_DEFINITIONS` object** — each mode is a complete data package containing:
   - UI text overrides (all labels, button text, section headers)
   - Color theme (background gradients, accent colors, surface textures)
   - Audio profile (scratch frequency range, reveal tone base, rare arpeggio notes)
   - Claim type definitions (geology/flavor/tessera/scene tables)
   - Upgrade definitions (renamed and re-described per mode)
   - Prestige language (verb, currency name, what carries over)
   
2. **The game engine doesn't change** — the reducer, EventBus, scratch mechanics, combo system, particle system, and upgrade cost curves are all mode-agnostic. Only the data flowing through them changes.

3. **Mode selection UI** — either a top-level selector before entering the game, or a settings toggle. Switching modes should reset progress (each mode is its own save slot).

4. **Per-mode audio synthesis** — the `ScratchAudio` class already parameterizes frequency; extend it with mode-specific waveform shapes, filter types, and envelope curves.

5. **Per-mode tile rendering** — the `Tile` component already reads theme colors from the claim type. Extend with mode-specific crack patterns (sharp lines for brulee, soft dust for plaster, ice crystal patterns for frost).

## Files to Upload

- `scritchy_scratchy_vs_cookie_clicker_essay.md` — the foundational design analysis
- `pocket_prospector_brief_v2.html` — the full project specification
- `pocket_prospector_prototype.jsx` — the current working prototype with all juice

## Suggested Opening Prompt

> "I'm continuing a game design project called Pocket Prospector. I've uploaded three files: the design essay that established our philosophy, the project brief, and the current working prototype. The attached summary document explains where we are. The next task is implementing the mode-switching system — six thematic modes that share the same engine but transform every surface variable. Let's start by refactoring the prototype's data layer to support a `MODE_DEFINITIONS` object, then implement mode 2 (Petit Patissier) as the proof of concept."
