# Pocket Prospector — Meta-Game Design Document

## Guiding Philosophy

> Cookie Clicker is outcome-focused. Scritchy Scratchy is process-focused. Pocket Prospector synthesizes both — and the Workshop Cabinet extends that synthesis across seven parallel worlds.

**The Spatial Contract, scaled up:**
- **Active drawer** = process (tactile, atmospheric, the scratch itself)
- **Background drawers** = outcome (numbers ticking, idle accumulation)
- **Specimen Wall** = collection (cross-mode discovery, the metagame's metagame)
- **Players shift between layers by moving their eyes and pulling drawers, never navigating menus**

---

## System Architecture

### Three Meta-Layers

```
Layer 3: SPECIMEN WALL ............. Shared collection, Revelations, Grand Renovation
Layer 2: WORKSHOP CABINET ......... Drawer management, background idle, cross-mode bonuses
Layer 1: ACTIVE DRAWER ............ Individual mode gameplay (what exists now)
```

Each layer has its own state slice. Layer 1 is per-mode (7 save slots). Layer 2 and 3 are global (one shared save).

---

## Layer 1: Active Drawer (Existing)

The seven modes, each a complete game:

| Mode | Icon | Verb | Currency | Surface | Crack Style |
|------|------|------|----------|---------|-------------|
| Pocket Prospector | ⛏ | Scratch | Gold | Rock slab | Stone |
| Petit Patissier | 🍮 | Tap | Stars | Brulee ramekin | Fracture |
| Lost Layers | 🏛 | Brush | Prestige | Plaster wall | Dust |
| Frost & Found | ❄ | Scrape | Warmth | Frosted pane | Crystal |
| Hexharvest | 🍯 | Uncap | Nectar | Honeycomb | Hex |
| Sealed Secrets | ✉ | Break | Ink | Sealed envelope | Wax |
| Eggbound | 🥚 | Crack | Wonder | Egg shell | Eggshell |

Each mode runs independently with its own prestige loop. No changes needed to existing gameplay.

---

## Layer 2: The Workshop Cabinet

### Background Idle System

When you switch away from a mode, it enters **background state**. Background drawers produce at **15% of active manual rate**, calculated as:

```
backgroundRate = (baseCurrencyPerSecond * upgradeMultipliers * 0.15) * elapsedSeconds
```

Capped at **4 hours** per drawer to prevent absurd overnight accumulation. Active scratching must always feel meaningfully better.

**On return to a drawer, the player sees a "While You Were Away" mini-report:**
- Total currency earned
- Any notable finds (rolls still happen in background, but at reduced luck)
- Time elapsed
- One-line flavor text per mode ("Your drones chipped away at the rock face..." / "The egg rocked gently in its nest...")

### Drawer States

```
ACTIVE ......... Full gameplay, all juice, player is here now
BACKGROUND ..... Idle accumulation at 15%, reduced luck rolls
LOCKED ......... Not yet unlocked (see Workshop Tiers)
```

### Drawer Unlock Sequence

Not all 7 modes are available immediately. This paces the meta-game:

| Workshop Tier | Drawers Available | Unlock Condition |
|---|---|---|
| Tier 1 (start) | Prospector + 1 choice of 2nd | New game |
| Tier 2 | +2 more drawers | Prestige once in any mode |
| Tier 3 | +2 more drawers | Prestige in 3 different modes |
| Tier 4 | All 7 + Eggbound | Complete 1 Revelation |
| Tier 5+ | Grand Renovation tiers | See Layer 3 |

**The player's first choice of 2nd drawer is a meaningful moment** — it sets the tone for their early meta-game and determines which Revelations become available first.

### Cross-Mode Essence

Each mode passively generates an **Essence** as a secondary output, distinct from its primary currency. Essences provide small global bonuses when accumulated:

| Mode | Essence | Passive Bonus (scales with amount) |
|------|---------|-----|
| Prospector | Mineral Dust | +% base currency earned, all modes |
| Patissier | Sugar Glaze | +% combo duration, all modes |
| Lost Layers | Ancient Knowledge | +% prestige pick yield, all modes |
| Frost & Found | Chill Factor | -% hazard frequency, all modes |
| Hexharvest | Wax Coating | +% idle background rate, all modes |
| Sealed Secrets | Cipher Fragments | +% upgrade cost reduction, all modes |
| Eggbound | Strange Vitality | +% luck / rare chance, all modes |

**Essences accumulate slowly during both active and background play.** They are never spent — they're permanent counters that grow over time. This means every mode you play, even casually, contributes to the health of every other mode. Players feel rewarded for rotating.

### Essence Scaling

Diminishing returns to prevent any single essence from dominating:

```
bonus = baseRate * log2(1 + essenceCount / scaleFactor)
```

At low counts: noticeable jumps. At high counts: gentle growth. Players always benefit from spreading play across modes rather than grinding one.

---

## Layer 3: The Specimen Wall

### Overview

A persistent, always-visible display above the Workshop Cabinet. Rare and ultra-rare finds from any mode are mounted here as **specimens**. The wall fills over time, becoming a visual record of the player's total journey.

**Not every find goes on the wall.** Only items with `glow: true` (the rare+ tier in each mode's geology table) qualify. This keeps the wall curated and meaningful.

### Revelations

Certain **combinations** of specimens across modes unlock **Revelations** — permanent global bonuses with thematic names and lore. Revelations are the primary incentive to play multiple modes and the core reward of the meta-game.

Revelations come in four tiers based on how many modes they span:

---

#### Pair Revelations (2 modes, small bonus)

| Revelation | Specimens Required | Bonus | Flavor |
|---|---|---|---|
| **What Stares Back** | Void Gem (Prospector) + Void Pupil (Eggbound) | +10% rare chance, all modes | "You looked into the void. Something looked back." |
| **Midas Touch** | Gold Leaf (Archaeology) + Edible Gold (Patissier) | +12% currency gain, all modes | "Everything you touch turns to gold — even dessert." |
| **Prismatic** | Aurora (Frost) + Crystal Feather (Eggbound) | All sparkle particles gain rainbow hue shift | "Light bends differently near the creature." |
| **Acquired Taste** | Royal Jelly (Beekeeper) + Truffle (Patissier) | Hazard damage reduced 40% | "Refined palates know what to avoid." |
| **Crystalline Palace** | Diamond (Prospector) + Ice Palace (Frost) | +15% value for glow-tier finds | "A palace built of everything that sparkles." |
| **Volcanic Heritage** | Obsidian (Prospector) + Obsidian Claw (Eggbound) | +8% crack/scratch power, all modes | "Forged in the same fire." |
| **The Cartographer** | Secret Map (Letters) + Star Pattern (Archaeology) | Background idle luck +25% | "X marks every spot." |
| **First Light** | Fire Opal (Prospector) + Sunrise (Frost) | Combo decay timer +1s, all modes | "The world holds its breath at dawn." |
| **Patina** | Emerald (Prospector) + Verdigris (Archaeology) | +10% currency from 0-value (junk) tiles | "Even decay has beauty — and value." |
| **Essence Garden** | Saffron (Patissier) + Lavender (Beekeeper) | Essence generation rate +20% | "A garden that feeds every sense." |
| **Polyglot** | Rosetta Key (Letters) + Calligraphy (Archaeology) | Upgrade costs -8%, all modes | "Understanding is the ultimate currency." |
| **All-Seeing** | Compound Eye (Eggbound) + Bio-eye (Eggbound) | Tile shimmer starts at 50% instead of 70% | "More eyes, more truth." |
| **Armored Birth** | Egg Tooth (Eggbound) + Bone Plate (Eggbound) | +5% power per prestige tier | "Built to break free." |
| **Sealed with Honey** | Propolis (Beekeeper) + Crown Seal (Letters) | Prestige pick yield +15% | "The sweetest secrets are the best kept." |
| **Frozen Feast** | Passion Fruit (Patissier) + Frozen Lake (Frost) | Completion bonus +10% (stacks) | "Some things are better cold." |
| **Living Mosaic** | Intact Mosaic (Archaeology) + Membrane Wing (Eggbound) | Background drawers earn at 18% instead of 15% | "Ancient patterns in living flesh." |

---

#### Triad Revelations (3 modes, medium bonus)

| Revelation | Specimens Required | Bonus | Flavor |
|---|---|---|---|
| **Crystal Triad** | Diamond (Prospector) + Ice Crystal (Frost) + Crystal Feather (Eggbound) | Ultra-rare finds worth +25% | "Three facets of the same impossible geometry." |
| **Grand Architect** | Intact Mosaic (Archaeology) + Muqarnas (Archaeology) + Star Pattern (Archaeology) | Archaeology mode earns double essence | "You've reconstructed the blueprint of beauty itself." |
| **The Naturalist** | Royal Jelly (Beekeeper) + Aurora (Frost) + Wet Feather (Eggbound) | Luck upgrades cost 15% less, all modes | "Patient observation reveals nature's rarest gifts." |
| **Forbidden Library** | Rosetta Key (Letters) + Saint's Face (Archaeology) + Calligraphy (Archaeology) | Journal/collection entries worth +10% currency on discovery | "Every find is a page in a book no one has finished reading." |
| **Alchemist's Table** | Fire Opal (Prospector) + Saffron (Patissier) + Manuka (Beekeeper) | Combo multiplier cap raised from 20 to 25 | "Gold from lead, honey from fire, flavor from stone." |
| **Through the Glass** | Yeti Sighting (Frost) + Void Pupil (Eggbound) + Plot Letter (Letters) | Background finds can now trigger notifications | "You can't unsee what's on the other side." |
| **Deep Time** | Void Gem (Prospector) + Muqarnas (Archaeology) + Prehensile Tongue (Eggbound) | Prestige multiplier formula improved: `picks * 0.12` instead of `0.10` | "Geology, history, and biology share the same clock." |

---

#### Tetrad Revelations (4 modes, large bonus)

| Revelation | Specimens Required | Bonus | Flavor |
|---|---|---|---|
| **Renaissance Soul** | Gold Leaf (Archaeology) + Edible Gold (Patissier) + Comb Gold (Beekeeper) + Crown Seal (Letters) | All currency gains +20%, permanent | "A mind that sees gold in everything finds it everywhere." |
| **Cabinet of Curiosities** | Diamond (Prospector) + Passion Fruit (Patissier) + Muqarnas (Archaeology) + Queen Cell (Beekeeper) | Unlock a 5th upgrade slot in all modes: "Curator's Eye" — boosts completion bonus | "Every shelf tells a story. Together they tell yours." |
| **The Expedition** | Void Gem (Prospector) + Aurora City (Frost) + Rosetta Key (Letters) + Bio-eye (Eggbound) | Grand Renovation prestige picks doubled | "You've been everywhere. Now go deeper." |
| **Strange Weather** | Aurora (Frost) + Sunrise (Frost) + Crystal Feather (Eggbound) + Bergamot (Patissier) | Particle effects doubled in all modes, new ambient "shimmer" layer | "The air itself tastes different at this altitude." |

---

#### Grand Revelations (5+ modes, transformative)

| Revelation | Specimens Required | Bonus | Flavor |
|---|---|---|---|
| **The Collection** | One ultra-rare from 5 different modes | Workshop Tier +1, all essences doubled | "A collection this complete changes the collector." |
| **Convergence** | One ultra-rare from ALL 7 modes | Unlock **Chimera Mode** — a special 8th drawer that combines elements from all modes (see Future Expansion) | "Seven drawers open. One truth emerges." |

---

### Revelation UX

- Revelations are **discovered, not purchased**. When the required specimens are on the wall, the Revelation triggers automatically with a special animation.
- A "constellation" view connects the contributing specimens with glowing lines, making the synergy visible.
- Undiscovered Revelations show as silhouettes with hints: "Requires something from the deep earth and something that hatches..."
- Players can view all discovered Revelations in a dedicated panel, with flavor text and active bonus listed.

---

## Grand Renovation (Meta-Prestige)

The prestige system for the Workshop itself. Available once you've completed at least **3 Revelations**.

### What resets:
- All 7 mode currencies (gold, stars, warmth, etc.)
- All 7 mode upgrade levels
- All 7 mode prestige tiers return to 0

### What persists:
- The Specimen Wall (all specimens stay mounted)
- All discovered Revelations (and their bonuses)
- Essence counters (never reset)
- All collection/journal entries
- Drawer unlock state

### What improves:
- **Workshop Tier** advances (+1)
- **Renovation Bonus**: a permanent global multiplier (stacking)
- **New Revelation slots** may open (some Revelations require Workshop Tier 2+)
- **Visual upgrade** to the cabinet (richer wood, better lighting, new ambient details)
- **Background idle cap** increases by 1 hour per tier (4h → 5h → 6h...)

### Renovation Scaling

| Workshop Tier | Renovation Bonus | Idle Cap | Revelations Available |
|---|---|---|---|
| 1 | 1.0× | 4h | Pairs only |
| 2 | 1.3× | 5h | + Triads |
| 3 | 1.6× | 6h | + Tetrads |
| 4 | 2.0× | 7h | + Grand |
| 5+ | +0.5× per tier | +1h | All |

---

## Balance Principles

### The Active/Idle Hierarchy
Active play must ALWAYS feel meaningfully better than idle. Ratios:
- Active manual: **100%** efficiency
- Active with upgrades: **150-400%** (the upgrade treadmill)
- Background idle: **15%** (essences incentivize rotation, not AFK grinding)
- Offline return: **15% × hours** (capped, with stability decay)

### The Rotation Incentive
Essences use diminishing returns. Playing one mode for 10 hours gives less total essence than playing 3 modes for 3 hours each. The system rewards breadth without punishing depth — you're never told to stop, you're just gently rewarded for variety.

### Revelation Pacing
- Pair Revelations should start triggering within the first 2-3 hours of multi-mode play
- Triads within 5-8 hours
- Tetrads within 15-20 hours
- Grand Revelations are endgame goals (50+ hours)
- This pacing assumes casual rotation, not focused grinding

### Hazard-Reward Tension
Higher-tier claim types have more hazards but dramatically better loot tables. The meta-game amplifies this: Revelations that reduce hazard damage or increase rare finds shift the risk/reward curve, making previously dangerous claim types feel conquerable. **Progression should feel like mastery, not just bigger numbers.**

---

## Future Expansion Hooks

### Chimera Mode (Convergence Revelation unlock)
A special 8th drawer that mashes together elements from all 7 modes. The tile grid contains mixed geology from every mode — you might crack an egg tile next to a brulee tile next to a frost tile. Currency earned is a new type: "Essence Prime." This is the true endgame content.

### Seasonal Events
Time-limited claim types that appear in any mode (e.g., a "harvest moon" variant of Hexharvest with unique geology). Specimens from events are marked with a date, making the wall a timeline.

### Community Wall
If ever multiplayer: a shared specimen wall where players contribute finds. Community Revelations unlock based on aggregate collection across all players.

### The Creature
Eggbound's meta-narrative: as the player collects more creature parts across multiple eggs, a composite sketch builds in the Field Sketches collection. The creature is never fully revealed — each new part raises more questions. Parts from different egg tiers are anatomically contradictory. **The mystery is the point.**

---

## Implementation Priority

```
Phase 1: Workshop Cabinet UI
  - Replace mode select with cabinet view
  - Drawer open/close animations
  - Per-mode save slots in localStorage
  - "While You Were Away" reports

Phase 2: Background Idle
  - Background ticker for closed drawers
  - Idle rate calculation (15%, capped)
  - Offline time detection on load

Phase 3: Specimen Wall
  - Shared glow-tier specimen collection
  - Wall display UI above cabinet
  - Specimen mounting animation

Phase 4: Revelations
  - Revelation data table (pure data, like geology)
  - Auto-detection when combinations are met
  - Constellation connection animation
  - Bonus application to global state

Phase 5: Essences
  - Per-mode essence counters
  - Diminishing returns formula
  - Global bonus application
  - Essence display in cabinet view

Phase 6: Grand Renovation
  - Meta-prestige trigger and confirmation
  - Workshop tier state
  - Visual cabinet upgrades
  - Revelation slot gating by tier
```

---

## State Schema (Draft)

```javascript
// Global workshop state (one save slot)
workshopState = {
  tier: 1,
  renovationCount: 0,
  renovationMult: 1.0,
  unlockedDrawers: ["prospector"],
  drawerStates: {
    prospector: { status: "active", lastActiveTime: timestamp },
    patissier:  { status: "background", lastActiveTime: timestamp },
    // ...
  },
  essences: {
    mineralDust: 0,
    sugarGlaze: 0,
    ancientKnowledge: 0,
    chillFactor: 0,
    waxCoating: 0,
    cipherFragments: 0,
    strangeVitality: 0,
  },
  specimenWall: [
    { label: "Diamond", color: "#A8E8F8", mode: "prospector", foundAt: timestamp },
    { label: "Void Pupil", color: "#000000", mode: "hatchling", foundAt: timestamp },
    // ...
  ],
  revelations: {
    "what_stares_back": { discovered: true, discoveredAt: timestamp },
    "midas_touch": { discovered: false },
    // ...
  },
  idleCap: 14400, // seconds (4 hours)
}

// Per-mode state (7 save slots, existing structure + essence counter)
modeState = {
  // ... existing state (gold, upgrades, claim, journal, etc.)
  essenceGenerated: 0,  // lifetime essence produced by this mode
}
```
