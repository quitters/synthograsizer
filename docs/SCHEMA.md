# Synthograsizer Suite — JSON Schema Specification

> Single source of truth for all JSON formats used across Synthograsizer Mini, PromptCraft Sequencer, the Story Engine, batch exports, and the backend API.

**Audience:** Template authors, LLMs generating templates, developers extending the platform.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Base Template Schema (Canonical Format)](#2-base-template-schema-canonical-format)
3. [Legacy Template Format (Deprecated)](#3-legacy-template-format-deprecated)
4. [Story Template Schema](#4-story-template-schema)
5. [PromptCraft Sequencer Schema](#5-promptcraft-sequencer-schema)
6. [Batch Export Formats](#6-batch-export-formats)
7. [Backend API Models](#7-backend-api-models)
8. [LLM Template Generation Instructions](#8-llm-template-generation-instructions)
9. [Template Normalization](#9-template-normalization)
10. [Validation](#10-validation)
11. [Migration Guide: Legacy to Canonical](#11-migration-guide-legacy-to-canonical)
12. [Appendix](#12-appendix)

---

## 1. Overview

The Synthograsizer Suite uses JSON as its primary data interchange format. Templates flow through several stages:

```
LLM / User → Template JSON → Synthograsizer Mini / PromptCraft → Batch Export → AI Image/Video Generation
```

There are three schema tiers:

| Tier | Description | Required Keys |
|------|-------------|---------------|
| **Base Template** | Core format used everywhere | `promptTemplate`, `variables[]` |
| **Story Template** | Extends base with narrative structure | Base + `story{}` |
| **Sequencer Template** | Extends base with 16-step sequencer data | Base + `_promptcraft{}` |

All tiers share the same base structure. The `story` and `_promptcraft` blocks are optional extensions.

---

## 2. Base Template Schema (Canonical Format)

### 2.1 Top-Level Structure

```jsonc
{
  "promptTemplate": "A {{style}} illustration of {{subject}} in {{lighting}}.",  // REQUIRED
  "variables": [ /* ... */ ],             // REQUIRED — array of Variable objects
  "tags": [ /* ... */ ],                  // OPTIONAL — provenance metadata
  "p5Code": "function setup() { ... }",  // OPTIONAL — embedded p5.js sketch
  "story": { /* ... */ },                // OPTIONAL — Story Engine extension (Section 4)
  "_promptcraft": { /* ... */ }          // OPTIONAL — Sequencer extension (Section 5)
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `promptTemplate` | `string` | Yes | Natural language sentence with `{{variable_name}}` placeholders. Must read naturally with any combination of substituted values. |
| `variables` | `Variable[]` | Yes | Array of variable definitions. Can be empty for blank templates. Maximum 20 variables (configurable via `maxKnobs`). |
| `tags` | `Tag[]` | No | Provenance metadata for lineage tracking. See [Section 2.4](#24-tags-and-provenance). |
| `p5Code` | `string` | No | Embedded p5.js sketch code (used by some legacy templates for visual effects). |
| `story` | `object` | No | Story Engine narrative structure. See [Section 4](#4-story-template-schema). |
| `_promptcraft` | `object` | No | PromptCraft 16-step sequencer state. See [Section 5](#5-promptcraft-sequencer-schema). |

### 2.2 Variable Object

```jsonc
{
  "name": "art_style",           // Token ID — used in {{art_style}} placeholders
  "feature_name": "Art Style",   // Display label — shown in the UI sidebar
  "values": [                    // Array of Value objects
    {"text": "watercolor", "weight": 3},
    {"text": "oil painting", "weight": 2},
    {"text": "pixel art", "weight": 1}
  ]
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `name` | `string` | Yes | `snake_case` identifier. Must **exactly** match the `{{placeholder}}` in `promptTemplate`. Examples: `"mood"`, `"art_style"`, `"time_period"`. |
| `feature_name` | `string` | Yes | **Title Case** display label for the UI. Keep short (1-3 words). Examples: `"Mood"`, `"Art Style"`, `"Time Period"`. |
| `values` | `Value[]` | Yes | Array of value objects. Minimum 6, recommended 8-12 for sequencer use. |

### 2.3 Value Object

```jsonc
{"text": "golden hour sunset", "weight": 3}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `text` | `string` | Yes | The substitution string. Should be a descriptive phrase (2-6 words) that AI image generators can interpret. Gets wrapped in SD/Comfy `(term:weight)` syntax in some output modes. |
| `weight` | `integer` | No | Rarity tier controlling random selection probability. Defaults to `1` if omitted. |

**Weight Tiers:**

| Weight | Tier | Frequency | Usage |
|--------|------|-----------|-------|
| `3` | Common | Appears most often | Default values, broadly useful options |
| `2` | Uncommon | Appears sometimes | Interesting alternatives, less typical choices |
| `1` | Rare | Appears least often | Exotic, unusual, or niche options |

**Recommended weight distribution for a list of 8 values:** 3 Common (weight 3), 3 Uncommon (weight 2), 2 Rare (weight 1).

**Critical rule:** Values must **always** be objects with `text` and optionally `weight`. Never use bare strings. Never use a separate parallel `weights` array on the variable.

### 2.4 Tags and Provenance

Tags provide lineage and attribution metadata. They are optional and managed through the Code Overlay panel in Synthograsizer Mini.

```jsonc
{
  "id": "tag_3f8a21cb",          // Auto-generated via generateTagId()
  "type": "source",             // One of: source, collection, event, creator, remix, custom
  "label": "Reference Photo",   // REQUIRED — display name
  "url": "https://...",         // OPTIONAL — reference URL
  "description": "Sunset from Malibu beach",  // OPTIONAL
  "chain": "tezos",             // OPTIONAL — blockchain name (only for type "collection")
  "date": "2025-03-09",         // OPTIONAL — ISO date string (only for type "event")
  "meta": {                     // OPTIONAL — extra metadata (only for type "remix")
    "parent_fingerprint": "3f8a21cb"
  }
}
```

**Tag Types:**

| Type | Purpose | Extra Fields |
|------|---------|-------------|
| `source` | Reference material (photos, artworks, URLs) | `url`, `description` |
| `collection` | NFT/Blockchain provenance | `chain`, `url` |
| `event` | Historical or cultural context | `date` |
| `creator` | Attribution to an artist or author | `url` |
| `remix` | Auto-generated lineage tracking (not user-created) | `meta.parent_fingerprint`, `date` |
| `custom` | User-defined metadata | Any |

### 2.5 Template Fingerprinting

Templates are fingerprinted for lineage tracking across remixes. The fingerprint is computed by `computeTemplateFingerprint()` in `template-normalizer.js`:

- **Input:** Deterministic JSON of `promptTemplate` + variable names + value texts (ignoring weights)
- **Output:** 8-character hex string (e.g., `"3f8a21cb"`)
- **Algorithm:** Simple 32-bit hash, consistent across calls with the same input

### 2.6 Complete Canonical Example

```json
{
  "promptTemplate": "A {{style}} illustration of {{subject}} in {{lighting}}.",
  "variables": [
    {
      "name": "style",
      "feature_name": "Style",
      "values": [
        {"text": "minimalist", "weight": 3},
        {"text": "detailed", "weight": 3},
        {"text": "watercolor", "weight": 2},
        {"text": "digital art", "weight": 3},
        {"text": "oil painting", "weight": 2},
        {"text": "sketch", "weight": 2},
        {"text": "3D render", "weight": 1},
        {"text": "pixel art", "weight": 1}
      ]
    },
    {
      "name": "subject",
      "feature_name": "Subject",
      "values": [
        {"text": "a mountain landscape", "weight": 3},
        {"text": "a futuristic city", "weight": 2},
        {"text": "a cozy cabin", "weight": 3},
        {"text": "an alien planet", "weight": 1},
        {"text": "an underwater scene", "weight": 2},
        {"text": "a desert canyon", "weight": 2},
        {"text": "a forest clearing", "weight": 3},
        {"text": "a space station", "weight": 1}
      ]
    },
    {
      "name": "lighting",
      "feature_name": "Lighting",
      "values": [
        {"text": "golden hour", "weight": 3},
        {"text": "moody twilight", "weight": 2},
        {"text": "harsh noon sun", "weight": 1},
        {"text": "soft morning light", "weight": 3},
        {"text": "dramatic sunset", "weight": 3},
        {"text": "moonlight", "weight": 2},
        {"text": "neon glow", "weight": 1},
        {"text": "candlelight", "weight": 2}
      ]
    }
  ],
  "tags": [
    {
      "id": "tag_a1b2c3d4",
      "type": "source",
      "label": "Landscape Photography Collection",
      "url": "https://example.com/landscapes"
    }
  ]
}
```

---

## 3. Legacy Template Format (Deprecated)

### 3.1 Format Description

The old format uses **bare string arrays** for values and an optional **parallel `weights` array** on the variable object:

```jsonc
{
  "name": "profession",
  "feature_name": "profession",    // NOT Title Case — should be "Profession"
  "values": [                      // Bare strings, not objects
    "enigmatic alchemist",
    "wandering bard",
    "master blacksmith"
  ],
  "weights": [3, 2, 1]            // DEPRECATED — parallel array (optional)
}
```

**Problems with this format:**
- Values are bare strings instead of `{text, weight}` objects
- `feature_name` often repeats the `name` field verbatim instead of using Title Case
- The optional parallel `weights` array is error-prone (easy to get out of sync with values)
- No weight information when the `weights` array is omitted

### 3.2 Legacy Files

All 12 template files in `/static/synthograsizer/templates/` use the legacy format:

| File | Variables | Has Weights | Notes |
|------|-----------|-------------|-------|
| `band-name.json` | 2 | No | Bare strings |
| `character-design.json` | 6 | No | Bare strings, feature_name not Title Case |
| `empty.json` | 0 | N/A | Blank template, includes `p5Code` |
| `face-generator.json` | 7 | No | Bare strings, includes `p5Code` |
| `face-generator-full.json` | 13 | No | Extended face generator |
| `fantasy-scene.json` | 7 | No | Bare strings |
| `mad-libs-creed.json` | 33 | No | Bare strings (large template) |
| `movie-logline.json` | 3 | No | Bare strings |
| `startup-slogan.json` | 3 | No | Bare strings |
| `synthograsizer-prompt.json` | 5 | No | Bare strings |
| `tattoo-concept.json` | 4 | No | Bare strings |
| `villain-motivation.json` | 3 | No | Bare strings |

**All 8 templates in `/static/promptcraft/templates/` already use the canonical format** with nested `{text, weight}` objects and proper Title Case `feature_name` values.

### 3.3 Runtime Compatibility

The template normalizer (`template-normalizer.js`) automatically converts legacy format to canonical format at load time. Both formats work at runtime, but **all new templates should use the canonical format.** See [Section 9](#9-template-normalization) for details and [Section 11](#11-migration-guide-legacy-to-canonical) for the migration guide.

---

## 4. Story Template Schema

The story schema extends a base template with narrative structure for sequential prompt generation. It is consumed by the `StoryEngine` class in `story-engine.js`.

### 4.1 Top-Level Structure

A story template has all base template fields plus a `story` object:

```jsonc
{
  "promptTemplate": "A {{shot_type}} of {{character}} in {{environment}}, {{mood}} atmosphere, {{lighting}}",
  "variables": [ /* standard variables */ ],
  "story": {
    "title": "The Wanderer's Journey",
    "characters": [ /* character anchors */ ],
    "acts": [ /* narrative structure */ ],
    "progressions": [ /* variable evolution arcs */ ]
  }
}
```

### 4.2 story.title

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `title` | `string` | No | `"Untitled Story"` |

A descriptive title for the narrative.

### 4.3 story.characters

Named entities with fixed visual descriptions for continuity across all beats.

```jsonc
{
  "id": "wanderer",                    // snake_case identifier
  "name": "The Wanderer",             // Human-readable display name
  "anchors": "a solitary traveler in a weathered dark green hooded cloak, leather armor underneath, carrying a carved wooden staff, angular face with deep-set hazel eyes, short gray-streaked brown hair, a faded scar across the left cheek, worn leather boots and a brass compass hanging from the belt"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `id` | `string` | Yes | `snake_case` identifier. Used in act locks: `{"character": "wanderer"}`. Auto-derived from `name` if omitted. |
| `name` | `string` | Yes | Display name. Defaults to `"Unnamed Character"`. |
| `anchors` | `string` | Yes | 50-100 word visual description that stays **constant** across all frames. This is the continuity anchor — include physical appearance, clothing/armor, distinctive features, color palette. Be specific enough for AI image generation to maintain visual consistency. |

If the template has a `{{character}}` variable, the engine substitutes the selected character's `anchors` text.

### 4.4 story.acts

The narrative structure. Each act defines a segment of the story with its own constraints.

```jsonc
{
  "name": "Act 1 - The Threshold",    // Display name
  "beats": 4,                          // Number of prompts this act produces
  "locks": {                           // Variable → forced value (overrides everything)
    "character": "wanderer",
    "mood": "mysterious"
  },
  "biases": {                          // Variable → preferred value subset
    "environment": ["ancient stone ruins", "misty forest path"],
    "shot_type": ["wide establishing shot", "medium shot"]
  }
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `name` | `string` | No | Display name. Defaults to `"Act N"`. |
| `beats` | `integer` | Yes | Number of prompts this act produces. Typically 2-8. Short acts (2-3) for intensity/transitions, longer acts (5-8) for development. |
| `locks` | `object` | No | Maps `variable_name` to a **forced value**. Overrides all other selection logic. For characters, use the character `id`: `{"character": "protagonist"}`. Use locks when a value is essential to the story (climax, punchline, emotional payoff). |
| `biases` | `object` | No | Maps `variable_name` to an **array of preferred values**. The engine picks randomly from this subset. Include 2-3+ options so the no-repeat heuristic has room to work. |

### 4.5 story.progressions

Variables that evolve across the **entire** story (not per-act). Progressions override both locks and biases for that variable.

```jsonc
{
  "variable": "lighting",
  "arc": ["soft dawn glow", "harsh midday sun", "dramatic storm light", "warm golden sunset"]
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `variable` | `string` | Yes | The variable name this progression controls. Must match a variable in the `variables` array. |
| `arc` | `string[]` | Yes | Evolution values mapped to 0.0 → 1.0 progress across the full story. Minimum 2 values. Arc values do **not** need to exist in the variable's `values` array — they are injected directly as overrides. |

Use progressions for story-wide arcs: time-of-day, emotional escalation, visual transformation, genre shifts.

### 4.6 Value Resolution Priority

When the Story Engine resolves the value for each variable at each beat, it follows this priority:

1. **Character injection** — If variable is `character`, substitute the selected character's anchors text
2. **Act locks** — Forced to the locked value (deterministic, no-repeat exempt)
3. **Progressions** — Interpolated along the arc based on global progress 0→1 (deterministic, no-repeat exempt)
4. **Act biases** — Random pick from the biased subset (with no-repeat heuristic: re-rolls up to 3 times if same as previous beat, only when pool > 1)
5. **Weighted random** — Pick from the full variable values using weight-based probability (with no-repeat heuristic)

### 4.7 Design Guidelines

- **Total beats:** Aim for 12-24 total across all acts
- **Lock vs. bias:** Lock when a value is essential to the beat's purpose. Bias when variety within a subset is acceptable
- **Character anchors:** The single most important element for visual consistency — be detailed and specific
- **Bias pool diversity:** Include 2-3+ options per biased variable so the no-repeat heuristic works
- **Progressions for genre shifts:** Express style transformations as a progression, not per-act locks — creates smoother visual transitions
- **Variables with progressions** should still have a full `values` array for non-story-mode previews

### 4.8 Complete Story Example

```json
{
  "promptTemplate": "A {{shot_type}} of {{character}} in {{environment}}, {{mood}} atmosphere with {{lighting}} lighting, {{detail}}",
  "variables": [
    {
      "name": "shot_type",
      "feature_name": "Shot Type",
      "values": [
        {"text": "wide establishing shot", "weight": 3},
        {"text": "medium shot", "weight": 3},
        {"text": "close-up", "weight": 2},
        {"text": "over-the-shoulder shot", "weight": 2},
        {"text": "low-angle hero shot", "weight": 1},
        {"text": "bird's eye view", "weight": 1}
      ]
    },
    {
      "name": "character",
      "feature_name": "Character",
      "values": [
        {"text": "a lone wanderer", "weight": 3},
        {"text": "a mysterious figure", "weight": 2}
      ]
    },
    {
      "name": "environment",
      "feature_name": "Environment",
      "values": [
        {"text": "ancient stone ruins", "weight": 3},
        {"text": "misty forest path", "weight": 3},
        {"text": "mountain summit", "weight": 2},
        {"text": "underground cavern", "weight": 2},
        {"text": "crumbling bridge over a chasm", "weight": 1}
      ]
    },
    {
      "name": "mood",
      "feature_name": "Mood",
      "values": [
        {"text": "mysterious", "weight": 3},
        {"text": "tense", "weight": 3},
        {"text": "awe-inspiring", "weight": 2},
        {"text": "melancholic", "weight": 2},
        {"text": "triumphant", "weight": 1}
      ]
    },
    {
      "name": "lighting",
      "feature_name": "Lighting",
      "values": [
        {"text": "soft dawn glow", "weight": 3},
        {"text": "harsh midday sun", "weight": 3},
        {"text": "dramatic storm light", "weight": 2},
        {"text": "warm golden sunset", "weight": 2},
        {"text": "moonlit silver", "weight": 1}
      ]
    },
    {
      "name": "detail",
      "feature_name": "Detail",
      "values": [
        {"text": "dust motes floating in light beams", "weight": 3},
        {"text": "wind-swept cloak and hair", "weight": 3},
        {"text": "glowing runes on ancient stones", "weight": 2},
        {"text": "scattered autumn leaves", "weight": 1}
      ]
    }
  ],
  "story": {
    "title": "The Wanderer's Journey",
    "characters": [
      {
        "id": "wanderer",
        "name": "The Wanderer",
        "anchors": "a solitary traveler in a weathered dark green hooded cloak, leather armor underneath, carrying a carved wooden staff, angular face with deep-set hazel eyes, short gray-streaked brown hair, a faded scar across the left cheek, worn leather boots and a brass compass hanging from the belt"
      }
    ],
    "acts": [
      {
        "name": "Act 1 - The Threshold",
        "beats": 4,
        "locks": {"character": "wanderer", "mood": "mysterious"},
        "biases": {
          "environment": ["ancient stone ruins", "misty forest path"],
          "shot_type": ["wide establishing shot", "medium shot"]
        }
      },
      {
        "name": "Act 2 - The Descent",
        "beats": 6,
        "locks": {"character": "wanderer"},
        "biases": {
          "mood": ["tense", "awe-inspiring"],
          "environment": ["underground cavern", "crumbling bridge over a chasm"],
          "shot_type": ["close-up", "low-angle hero shot"]
        }
      },
      {
        "name": "Act 3 - The Summit",
        "beats": 4,
        "locks": {"character": "wanderer", "mood": "triumphant"},
        "biases": {
          "environment": ["mountain summit"],
          "shot_type": ["wide establishing shot", "low-angle hero shot"]
        }
      }
    ],
    "progressions": [
      {
        "variable": "lighting",
        "arc": ["soft dawn glow", "harsh midday sun", "dramatic storm light", "warm golden sunset"]
      }
    ]
  }
}
```

---

## 5. PromptCraft Sequencer Schema

The `_promptcraft` block extends a base template with 16-step sequencer state. This data is saved alongside templates when exported from PromptCraft and restored on import.

### 5.1 _promptcraft Object

```jsonc
{
  "_promptcraft": {
    "steps": 16,                           // Number of sequencer steps
    "bpm": 120,                            // Beats per minute for playback
    "seqData": {                           // Per-variable step programming
      "camera_move": [0, 0, 1, 1, 2, 2, 3, 3, 0, -1, 1, 1, 3, 3, 0, 0],
      "environment": [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]
    },
    "weightData": [0.8, 0.9, 1.0, 0.7, 0.5, 0.6, 0.8, 1.0, 0.9, 0.7, 0.6, 0.8, 1.0, 0.9, 0.7, 0.5],
    "denoiseData": [0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.5, 0.5, 0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.5, 0.5],
    "adsr": {"a": 15, "d": 30, "s": 70, "r": 40}
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `steps` | `integer` | `16` | Number of sequencer steps. |
| `bpm` | `integer` | `120` | Beats per minute for playback tempo. |
| `seqData` | `object` | `{}` | Maps `variable_name` to an integer array of length `steps`. Each integer is an index into the variable's `values` array. **`-1` means "off"** (no value at this step). `0+` maps to the value at that index. |
| `weightData` | `float[]` | `[]` | Per-step prompt weight/strength. Length equals `steps`. Values range `0.0` to `1.0`. Controls how strongly each step's prompt is weighted in generation. |
| `denoiseData` | `float[]` | `[]` | Per-step denoising strength. Length equals `steps`. Values range `0.0` to `1.0`. |
| `adsr` | `object` | `{a:15, d:30, s:70, r:40}` | Envelope shape for visual display. Each field is an integer `0-100`. `a`=Attack, `d`=Decay, `s`=Sustain, `r`=Release. |

### 5.2 Additional Runtime State (Not Persisted in Templates)

PromptCraft maintains additional state in `localStorage` that is not part of the template JSON:

| Field | Type | Description |
|-------|------|-------------|
| `loopMode` | `string` | `"loop"`, `"oneshot"`, or `"pingpong"` |
| `direction` | `integer` | `1` (forward) or `-1` (backward) |
| `macroKnobs` | `object` | `{ intensity, chaos, morph, drift }` — each `0.0-1.0` |

---

## 6. Batch Export Formats

The Batch Generator (`batch-generator.js`) supports five output formats.

### 6.1 Plain Text

One prompt per line, newline-separated:

```
A watercolor illustration of a mountain landscape in golden hour.
A digital art illustration of a futuristic city in moody twilight.
A sketch illustration of a cozy cabin in soft morning light.
```

### 6.2 Numbered List

```
1. A watercolor illustration of a mountain landscape in golden hour.
2. A digital art illustration of a futuristic city in moody twilight.
3. A sketch illustration of a cozy cabin in soft morning light.
```

### 6.3 JSON Export

```json
{
  "prompts": [
    "A watercolor illustration of a mountain landscape in golden hour.",
    "A digital art illustration of a futuristic city in moody twilight.",
    "A sketch illustration of a cozy cabin in soft morning light."
  ]
}
```

### 6.4 AI Studio Batch JSON

Designed for import into the AI Studio Batch Image Generation tool:

```json
{
  "batch_name": "synthograsizer_batch_2025-03-09T14-30-00-000Z",
  "source": "synthograsizer-mini",
  "description": "Exported from Synthograsizer Mini for AI Studio batch generation",
  "template": {
    "promptTemplate": "A {{style}} illustration of {{subject}} in {{lighting}}.",
    "variables": [
      {
        "name": "style",
        "feature_name": "Style",
        "values": [
          {"text": "watercolor", "weight": 2},
          {"text": "digital art", "weight": 3}
        ]
      }
    ]
  },
  "prompts": [
    {
      "id": "prompt_1",
      "text": "A watercolor illustration of a mountain landscape in golden hour.",
      "variables": {
        "style": "watercolor",
        "subject": "a mountain landscape",
        "lighting": "golden hour"
      }
    },
    {
      "id": "prompt_2",
      "text": "A digital art illustration of a futuristic city in moody twilight.",
      "variables": {
        "style": "digital art",
        "subject": "a futuristic city",
        "lighting": "moody twilight"
      }
    }
  ],
  "tags": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `batch_name` | `string` | Auto-generated: `synthograsizer_batch_` + ISO timestamp |
| `source` | `string` | Always `"synthograsizer-mini"` |
| `description` | `string` | Static description string |
| `template` | `object` | The source template (`promptTemplate` + `variables`) |
| `prompts` | `array` | Each entry has `id` (`prompt_N`), `text` (expanded prompt), and `variables` (resolved values map) |
| `tags` | `Tag[]` | Provenance tags from the source template, if any |

### 6.5 Story JSON

Available when Story Mode is active. Groups beats by act:

```json
{
  "story_name": "The Wanderer's Journey",
  "source": "synthograsizer-story-engine",
  "description": "Story sequence: The Wanderer's Journey",
  "total_beats": 14,
  "characters": [
    {
      "id": "wanderer",
      "name": "The Wanderer",
      "anchors": "a solitary traveler in a weathered dark green hooded cloak..."
    }
  ],
  "acts": [
    {
      "name": "Act 1 - The Threshold",
      "beats": [
        {
          "beat": 1,
          "prompt": "A wide establishing shot of a solitary traveler...",
          "variables": {
            "shot_type": "wide establishing shot",
            "character": "a solitary traveler in a weathered dark green hooded cloak...",
            "environment": "ancient stone ruins",
            "mood": "mysterious",
            "lighting": "soft dawn glow",
            "detail": "dust motes floating in light beams"
          }
        }
      ]
    }
  ],
  "flat_prompts": [
    "A wide establishing shot of a solitary traveler...",
    "A medium shot of a solitary traveler..."
  ],
  "tags": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `story_name` | `string` | From `story.title` or auto-generated timestamp |
| `source` | `string` | Always `"synthograsizer-story-engine"` |
| `total_beats` | `integer` | Sum of all act beat counts |
| `characters` | `array` | Character definitions from the story block |
| `acts` | `array` | Grouped by act, each containing `name` and `beats[]` with `beat` number, `prompt` text, and `variables` map |
| `flat_prompts` | `string[]` | All prompts in order, ungrouped |
| `tags` | `Tag[]` | Provenance tags if present |

---

## 7. Backend API Models

The FastAPI backend (`server.py`) defines Pydantic models for all API requests.

### 7.1 Template Generation

**`POST /api/generate/template`**

```jsonc
// Request: TemplateRequest
{
  "prompt": "Create a template for sci-fi landscapes",   // Text description
  "mode": "text",           // "text" | "image" | "hybrid" | "multi-image" | "remix" | "workflow" | "story"
  "images": ["base64..."],  // Base64 images (for image/hybrid/multi-image/workflow modes)
  "current_template": {},   // Existing template JSON (for remix mode)
  "workflow": {},           // Workflow JSON to curate (for workflow mode)
  "preview": true,          // Include rationale (for workflow mode)
  "batch": false            // Multiple images = batch curation (for workflow mode)
}

// Response
{
  "status": "success",
  "template": { /* normalized canonical template JSON */ }
}
```

**Generation modes:**

| Mode | Input | LLM Task |
|------|-------|----------|
| `text` | `prompt` only | Generate template from text description |
| `image` | Single `images[]` entry | Analyze image, generate template matching its aesthetic |
| `hybrid` | `images[]` + `prompt` | Image defines style baseline, text defines variable structure |
| `multi-image` | Multiple `images[]` | Extract common patterns across images as fixed text, differences as variables |
| `remix` | `current_template` + `prompt` | Edit existing template per instructions, preserving unmentioned elements |
| `workflow` | `workflow` + `images[]` | Curate workflow to match reference image (single-value selection) |
| `story` | `prompt` only | Generate template with narrative `story` block |

### 7.2 Image Generation

**`POST /api/generate/image`**

```jsonc
// Request: ImageRequest
{
  "prompt": "A watercolor mountain landscape in golden hour",
  "model": "gemini-2.5-flash-image",    // Default
  "aspect_ratio": "1:1",
  "negative_prompt": null,
  "input_images": ["base64..."],         // Reference images for transformation
  "response_modalities": ["Image"],      // ["Image"], ["Text", "Image"]
  "thinking_level": null,                // "low", "high" (Gemini 3 models)
  "include_thoughts": false,
  "media_resolution": null,              // "media_resolution_low/medium/high"
  "person_generation": null,             // "allow_adult", "allow_all", "dont_allow"
  "safety_settings": null,               // [{category, threshold}]
  "image_count": 1,
  "add_watermark": true,
  "use_google_search": false,
  "temperature": null,                   // 0.0-2.0
  "top_k": null,                         // 1-100
  "top_p": null,                         // 0.0-1.0
  "tags": null                           // Provenance tags to embed in PNG metadata
}
```

### 7.3 Video Generation

**`POST /api/generate/video`**

```jsonc
// Request: VideoRequest
{
  "prompt": "A sweeping drone shot over mountains at sunrise",
  "model": "veo-3.1-generate-preview",
  "duration": null,
  "aspect_ratio": null,
  "start_frame_image": "base64...",
  "end_frame_image": "base64..."
}
```

### 7.4 Image Analysis

**`POST /api/analyze/image-to-prompt`**

```jsonc
// Request: AnalyzeRequest
{
  "image": "base64...",
  "auto_generate": false    // If true, also generate an image from the analysis
}

// Response
{
  "status": "success",
  "prompt": "A watercolor painting depicting a serene mountain valley..."
}
```

### 7.5 Smart Transform

**`POST /api/smart-transform`**

```jsonc
// Request: SmartTransformRequest
{
  "user_intent": "Make it look like a cyberpunk city",
  "input_image": "base64...",
  "reference_image": "base64...",       // Optional style reference
  "model": "gemini-3-flash-preview",
  "aspect_ratio": "1:1"
}

// Response
{
  "status": "success",
  "image": "base64...",
  "prompt": "Transform the mountain landscape into a cyberpunk cityscape..."
}
```

### 7.6 Narrative Generation

**`POST /api/generate/narrative`**

```jsonc
// Request: NarrativeRequest
{
  "descriptions": ["Image 1 description...", "Image 2 description..."],
  "user_prompt": "Tell a story about a journey through seasons",
  "mode": "story"           // "story" or "artwork"
}

// Response
{
  "status": "success",
  "prompts": ["Scene 1: A traveler sets out...", "Scene 2: The forest transforms..."]
}
```

### 7.7 Image Variation Prompts

**`POST /api/generate/image-variation-prompts`**

```jsonc
// Request: ImageVariationPromptsRequest
{
  "user_direction": "reimagine as different seasons",
  "image_analysis": "A detailed landscape with mountains and forest..."
}

// Response
{
  "status": "success",
  "prompts": [
    {"label": "Spring Bloom", "prompt": "A lush mountain landscape..."},
    {"label": "Summer Heat", "prompt": "The same mountain vista under harsh..."},
    {"label": "Autumn Fire", "prompt": "Mountains ablaze with fall colors..."},
    {"label": "Winter Silence", "prompt": "Snow-covered peaks in quiet..."},
    {"label": "Monsoon Drama", "prompt": "Dark storm clouds gathering..."}
  ]
}
```

### 7.8 Workflow Curation Response

When `mode: "workflow"`, the template endpoint returns a curated template with rationale:

```json
{
  "template": {
    "promptTemplate": "A {{style}} illustration of {{subject}} in {{lighting}}.",
    "variables": [
      {"name": "style", "feature_name": "Style", "values": [{"text": "watercolor"}]},
      {"name": "subject", "feature_name": "Subject", "values": [{"text": "a mountain landscape"}]},
      {"name": "lighting", "feature_name": "Lighting", "values": [{"text": "golden hour"}]}
    ]
  },
  "rationale": [
    {"variable": "Style", "selected": "watercolor", "reason": "Matches the soft, flowing quality of the reference image"},
    {"variable": "Subject", "selected": "a mountain landscape", "reason": "Direct match to the mountain scene in the reference"},
    {"variable": "Lighting", "selected": "golden hour", "reason": "The warm tones and long shadows indicate late afternoon light"}
  ]
}
```

---

## 8. LLM Template Generation Instructions

This section documents the system prompts used to instruct LLMs to generate valid templates. All prompts enforce the canonical format.

### 8.1 Common Rules Across All Prompts

These rules are consistent across all 7+ system prompts in `backend/services/template_engine.py`:

1. **Output format:** Valid JSON only. No markdown formatting, no explanatory text.
2. **Response mode:** All LLM calls use `response_mime_type="application/json"` (Gemini JSON mode).
3. **Value objects:** Every entry in `values` must be `{"text": "...", "weight": N}` — **never bare strings**.
4. **No parallel arrays:** Do NOT include a separate `weights` array. Weight lives inside each value object.
5. **Placeholder matching:** `{{variable_name}}` in `promptTemplate` must **exactly** match the variable's `name` field.
6. **Name format:** `snake_case` for `name`, **Title Case** for `feature_name` (1-3 words max).
7. **Weight range:** Integers `1`, `2`, or `3` only. Tier system: 3=Common, 2=Uncommon, 1=Rare.
8. **Sentence structure:** `promptTemplate` should be a complete, readable sentence that produces good AI-generated imagery when variables are substituted.
9. **Semantic diversity:** Values should be evocative, specific phrases (2-6 words). Avoid generic single words.

### 8.2 Mode-Specific Rules

| Mode | Variable Count | Values Per Variable | Special Rules |
|------|---------------|---------------------|---------------|
| **Text** (basic) | 2-4 | 6-12 | General-purpose template from text description |
| **Text** (synthograsizer) | 4-7 | 8-12 | Rich randomizable pool values for Synthograsizer knobs |
| **Image** | 4-7 | 8-12 | First value = observed from image, rest = creative alternatives |
| **Hybrid** | 4-7 | 8-12 | Image defines aesthetic baseline (fixed text), user defines variables |
| **Multi-image** | 4-7 | 8-12 | Common traits = fixed text, differences = variables. Observed values first. |
| **Remix** | 4-7 | 8-12 | Preserve unmentioned elements. Convert old format to new. |
| **Story** | 4-7 | 6-12 | Must include `{{character}}` and `{{shot_type}}`. 12-24 total beats. |
| **Workflow** | Same as input | 1 per variable | Distill to single best-matching value per variable |

### 8.3 Synthograsizer Design Principles

These apply to all Synthograsizer generation modes (text, image, hybrid, multi-image, remix):

1. **8-12 values per variable** — a rich pool gives users interesting variety when randomizing
2. **Interesting under random selection** — any combination of values drawn across variables should produce a coherent, visually compelling prompt
3. **Complementary variables** — variables should interact well (e.g., "lighting" pairs with "time_of_day")
4. **Good anchor values** — include 1-2 broadly compatible values per variable (weight 3) that work alongside any other variable's values
5. **Descriptive text values** — each value should be a clear, evocative phrase (2-6 words) that AI image generators can interpret
6. **Avoid redundancy** — each variable controls a distinct visual dimension

### 8.4 Story-Specific Guidelines

1. **Character anchors = continuity** — the anchor text is the most important element for visual consistency. 50-100 words of specific physical description.
2. **Acts = pacing** — short acts (2-3 beats) for intensity, longer acts (5-8) for development
3. **Progressions = story arcs** — use for elements that evolve over the whole story (time of day, mood, style transformation)
4. **Lock, don't bias, for climax** — when a value is essential to the payoff, use a lock (guarantee), not a bias (suggestion)
5. **Bias pool diversity** — include 2-3+ options per biased variable for the no-repeat heuristic
6. **Include `{{shot_type}}` or `{{camera}}`** — for cinematic variety across beats
7. **Total beats:** 12-24 for a coherent sequence

### 8.5 Full Canonical System Prompt (Basic Mode)

This is the complete system prompt from `LLM_TEMPLATE_GENERATOR_PROMPT.md`, used for basic text-mode template generation with 2-4 variables:

```
You are a template generator for a creative prompt manipulation tool. Your task is to create JSON templates that users can interact with by cycling through variable options to craft customized prompts.

## OUTPUT FORMAT

You MUST respond with valid JSON only. Set your output mode to JSON.

## TEMPLATE STRUCTURE

Generate a JSON object with this exact structure:

{
  "promptTemplate": "A sentence with {{variable1}} and {{variable2}} placeholders.",
  "variables": [
    {
      "name": "variable1",
      "feature_name": "Variable1",
      "values": [
        {"text": "option1", "weight": 3},
        {"text": "option2", "weight": 2},
        {"text": "option3", "weight": 1}
      ]
    },
    {
      "name": "variable2",
      "feature_name": "Variable2",
      "values": [
        {"text": "option1", "weight": 3},
        {"text": "option2", "weight": 2},
        {"text": "option3", "weight": 1}
      ]
    }
  ]
}

## VALUE OBJECT FORMAT

Each value in the "values" array MUST be an object with two properties:
- "text": (string) The display text and value used in prompt substitution.
- "weight": (integer, 1-3) A rarity tier that controls how often the value appears during random selection.

Weight tiers:
- 3 = Common (appears most often)
- 2 = Uncommon (appears sometimes)
- 1 = Rare (appears least often)

Distribute weights across values to create an interesting mix. A recommended distribution for a list of 8 values: 3 Common (weight 3), 3 Uncommon (weight 2), 2 Rare (weight 1).

Do NOT use parallel arrays for weights. The weight MUST be embedded inside each value object alongside the text.

## CRITICAL RULES

1. **Variable Count**: Templates MUST have between 2-4 variables (minimum 2, maximum 4)
2. **Placeholder Syntax**: Use {{variable_name}} format in promptTemplate
3. **Name Matching**: The placeholder name must EXACTLY match the variable's "name" field
4. **Feature Name**: The "feature_name" field must be the Title Case display label for the variable (e.g., name "art_style" -> feature_name "Art Style")
5. **Values Array**: Each variable must have at least 6-12 diverse value objects
6. **Value Objects**: Every entry in the values array must be an object with "text" and "weight" keys - never a bare string
7. **Weight Range**: Weights must be integers 1, 2, or 3
8. **Sentence Structure**: The promptTemplate should be a complete, readable sentence or phrase
9. **No Parallel Weight Arrays**: Do NOT include a separate "weights" array on the variable. Weight lives inside each value object.

## VARIABLE DESIGN GUIDELINES

### Good Variable Names
- Use lowercase with underscores: "art_style", "time_period", "color_scheme"
- Keep them short and descriptive: "mood", "setting", "subject"
- Single words when possible: "style", "tone", "medium"

### Feature Name Convention
- Use Title Case: "Art Style", "Time Period", "Color Scheme"
- Keep them human-readable: "Mood", "Setting", "Subject"

### Value List Best Practices
- Provide 6-16 diverse value objects per variable
- Make text values specific and evocative
- Vary the length and complexity
- Include both common and creative options
- Ensure values make sense in the sentence context
- Assign higher weights (3) to broadly useful options and lower weights (1) to niche or unusual options

## TEMPLATE CATEGORIES

Templates can serve different purposes:

1. **Creative Writing Prompts**
   - Story concepts, character ideas, plot hooks
   - Example: "A {{genre}} story about {{protagonist}} who must {{conflict}}."

2. **Visual Art Descriptions**
   - Image generation, art concepts, style combinations
   - Example: "A {{style}} painting of {{subject}} in {{lighting}} with {{mood}} atmosphere."

3. **Product Ideas**
   - Business concepts, app ideas, product names
   - Example: "A {{type}} app for {{audience}} that helps them {{benefit}}."

4. **Content Creation**
   - Social media, marketing, titles
   - Example: "{{tone}} {{format}} about {{topic}} for {{platform}}."

5. **Game/World Building**
   - Characters, locations, items, quests
   - Example: "A {{alignment}} {{race}} {{class}} from {{location}}."

## QUALITY CHECKLIST

Before outputting, verify:
- 2-4 variables (not more, not less)
- Each {{placeholder}} matches a variable name exactly
- Each variable has a Title Case "feature_name"
- Each variable has 6+ value objects
- Every value is an object with "text" and "weight" (not a bare string)
- Weights are integers 1, 2, or 3
- No separate "weights" array exists on any variable
- The promptTemplate reads naturally with any combination
- Values are diverse and interesting
- JSON is valid and properly formatted

## RESPONSE TO USER PROMPT

When you receive a user prompt, analyze it to determine:
1. What type of template they want (art, writing, product, etc.)
2. What the core concept is
3. What variables would give them creative control
4. What value options would be most useful
5. What weight distribution creates an interesting rarity curve

Then generate a complete, valid JSON template following all the rules above.

DO NOT include explanations, markdown formatting, or any text outside the JSON object.
ONLY output the raw JSON.
```

### 8.6 Full Synthograsizer Mode System Prompt

This is the system prompt used for Synthograsizer template generation (4-7 variables, 8-12 values per variable):

```
You are a template generator for Synthograsizer — a synthesizer-inspired creative prompt engineering tool. Templates define a set of variables ("knobs") that users randomize or dial to craft AI image/video generation prompts. Each variable's values are selected via weighted random draw, so templates should be designed as rich pools of interesting options rather than step-by-step sequences.

## OUTPUT FORMAT
You MUST respond with valid JSON only.

## TEMPLATE STRUCTURE
Generate a JSON object with this exact structure:
{
  "promptTemplate": "A sentence with {{variable_name}} and {{another_var}} placeholders.",
  "variables": [
    {
      "name": "variable_name",
      "feature_name": "Variable Name",
      "values": [
        {"text": "option1", "weight": 3},
        {"text": "option2", "weight": 3},
        {"text": "option3", "weight": 2},
        {"text": "option4", "weight": 1}
      ]
    }
  ]
}

## FIELD DEFINITIONS
- **name (Token ID)**: The exact string used inside {{...}} placeholders. Use snake_case (e.g., "cinematic_style"). MUST match the placeholder in promptTemplate exactly.
- **feature_name (Display Label)**: Human-readable Title Case label for the UI. Keep SHORT (1-3 words max) as these appear in a compact sidebar.
- **values**: Array of value objects. Each object MUST have a "text" key. The "weight" key is optional (defaults to 1).

## VALUE OBJECT FORMAT
Each entry in "values" is an object:  {"text": "the value string", "weight": 3}
- "text" (required): The substitution string. These will be wrapped in SD/Comfy weight syntax like (term:1.05) in the final output.
- "weight" (optional): Selection probability. 3-tier rarity system:
   - Common: weight 3 (default)
   - Uncommon: weight 2
   - Rare: weight 1

## SYNTHOGRASIZER DESIGN PRINCIPLES
Templates are used as randomizable prompt pools. Design variables with this in mind:
1. **8-12 values per variable** — a rich pool gives users interesting variety when randomizing.
2. **Interesting under random selection** — any combination of values drawn across variables should produce a coherent, visually compelling prompt.
3. **Complementary variables** — variables should interact well. E.g., a "lighting" variable that pairs naturally with a "time_of_day" variable.
4. **Good anchor values** — include 1-2 broadly compatible values per variable (weight 3) that work well alongside any other variable's values.
5. **Descriptive text values** — each value should be a clear, evocative phrase (2-6 words) that an AI image generator can interpret. Avoid single generic words.

## CRITICAL RULES
1. **Variable Count**: 4-7 variables is the sweet spot for the Synthograsizer UI.
2. **Bidirectional placeholder integrity**: Every `{{placeholder}}` in `promptTemplate` MUST match a variable's `name` field, AND every variable in `variables` MUST have a corresponding `{{placeholder}}` in `promptTemplate`. No orphaned placeholders or orphaned variables.
3. **Values Array**: 8-12 diverse value objects per variable. Each MUST be {"text": "...", "weight": N}.
4. **No parallel arrays**: Do NOT use separate "weights" array. Weight is nested inside each value object.
5. **Sentence Structure**: promptTemplate should be a complete, readable prompt sentence that produces good AI-generated imagery when variables are substituted.
6. **Avoid redundancy**: Each variable should control a distinct visual dimension (e.g., don't have both "style" and "aesthetic" variables with overlapping values).

## EXAMPLES
CORRECT:
  "values": [{"text": "volumetric god rays", "weight": 3}, {"text": "harsh chiaroscuro", "weight": 2}, {"text": "bioluminescent ambient glow", "weight": 1}]

WRONG (parallel arrays — NEVER use this):
  "values": ["cinematic", "noir"], "weights": [3, 2]
```

### 8.7 Image Analysis System Prompt

Used by `analyze_image_to_prompt()` to reverse-engineer an image into a detailed text prompt:

```
You are an expert at analyzing images and generating detailed text prompts suitable for text-to-image AI systems. Your goal is to reverse-engineer an image into a prompt that could recreate something similar.

Analyze the provided image and create a detailed descriptive prompt following this structure:
1. MEDIUM & STYLE (1-2 sentences)
2. SUBJECT & COMPOSITION (2-3 sentences)
3. ENVIRONMENT & SETTING (1-2 sentences)
4. LIGHTING & ATMOSPHERE (1-2 sentences)
5. COLOR PALETTE (1 sentence)
6. TECHNICAL DETAILS (1 sentence)
7. MOOD & AESTHETIC QUALITIES (1 sentence)

OUTPUT FORMAT:
Combine all sections into a single flowing prompt of 50-150 words, written in a natural descriptive style (not bullet points). Use precise, evocative terminology that would help a text-to-image AI understand exactly what to generate. Avoid subjective judgments — focus on observable, reproducible qualities.
```

---

## 9. Template Normalization

The normalizer converts legacy format templates to canonical format at runtime. It is implemented in both JavaScript (client-side) and Python (server-side).

### 9.1 JavaScript Normalizer

**Source:** `static/synthograsizer/js/template-normalizer.js`

| Function | Signature | Description |
|----------|-----------|-------------|
| `normalizeTemplate(template)` | `Object → Object` | Normalizes all variables in a template in-place. Returns the template. |
| `normalizeVariable(variable)` | `Object → Object` | Converts a single variable's values from flat arrays to nested objects. |
| `getValueText(value)` | `string\|Object → string` | Extracts the text string from a value (handles both formats). |
| `getValueWeight(value)` | `string\|Object → number` | Extracts the weight from a value (defaults to `1`). |
| `getWeightsArray(variable)` | `Object → number[]` | Returns an array of all weights from a variable's values. |
| `generateTagId(prefix)` | `string → string` | Generates a unique tag ID (e.g., `"tag_3f8a21cb"`). |
| `computeTemplateFingerprint(template)` | `Object → string` | 8-char hex fingerprint of template content. |

### 9.2 Normalization Behavior

1. **Detection:** Checks the first entry in `values[]`
   - If it's an object with a `text` key → already canonical → clean up any leftover `weights` array
   - If it's a string → legacy format → convert
2. **Conversion:** Each bare string becomes `{"text": string_value}`. If a parallel `weights` array exists, the weight is merged in: `{"text": string_value, "weight": weights[i]}`.
3. **Cleanup:** The parallel `weights` array is deleted after conversion.
4. **Missing weights:** If no weight is specified, the value object omits the `weight` key (runtime default: `1`).
5. **Idempotent:** Safe to call multiple times on the same template — already-normalized templates pass through unchanged.

### 9.3 Python Normalizer

**Source:** `backend/services/template_engine.py`, function `normalize_template()`

Same logic as the JS normalizer. Applied to all LLM-generated templates before returning to the client. Also preserves extra keys (`story`, `_promptcraft`, `tags`, `p5Code`).

---

## 10. Validation

### 10.1 Base Template Validation

Rules from `SynthograsizerSmall.validateTemplate()` in `app.js`:

| Rule | Check |
|------|-------|
| Template exists | `template` is not null/undefined |
| Has promptTemplate | `"promptTemplate" in template` |
| Has variables array | `template.variables` is an array |
| Variable count limit | `variables.length <= maxKnobs` (default 20) |
| Variables have names | Each variable has a `name` field |
| No duplicate names | No two variables share the same name (case-insensitive) |
| Values exist | Each variable has a `values` array |

Additional rules from the LLM system prompt (enforced at generation time, not at load time):

| Rule | Check |
|------|-------|
| Variable count | 2-4 (basic mode) or 4-7 (sequencer mode) |
| Placeholder matching | Every `{{name}}` in `promptTemplate` matches a variable's `name` |
| Value count | 6+ per variable (basic) or 8-12 (sequencer) |
| Value format | Every value is `{"text": string, "weight": 1\|2\|3}` |
| Feature name format | Title Case (e.g., `"Art Style"`, not `"art_style"`) |
| No parallel weights | No `weights` array on any variable |

### 10.2 Story Template Validation

Rules from `StoryEngine.validate()` in `story-engine.js`:

| Rule | Check |
|------|-------|
| Acts exist | `story.acts` is a non-empty array |
| Beats valid | Each act has `beats >= 1` |
| Lock references | Lock variable names exist in `variables[]` (or are `"character"`) |
| Bias references | Bias variable names exist in `variables[]` |
| Progression references | Progression variable names exist in `variables[]` |
| Progression arc length | Each progression has `arc.length >= 2` |
| Character consistency | If `{{character}}` is used in template, `story.characters` is non-empty |

### 10.3 Validation Script

A standalone JavaScript validation function combining all rules:

```javascript
function validateTemplate(json) {
  const template = typeof json === 'string' ? JSON.parse(json) : json;

  // --- Base template ---
  if (!template.promptTemplate || !template.variables) {
    return { valid: false, error: 'Missing required fields: promptTemplate and variables' };
  }

  if (template.variables.length < 2 || template.variables.length > 4) {
    return { valid: false, error: `Has ${template.variables.length} variables, need 2-4` };
  }

  for (const variable of template.variables) {
    if (!variable.name || !variable.feature_name || !variable.values) {
      return { valid: false, error: 'Variable missing required fields (name, feature_name, values)' };
    }

    // Reject parallel weights array (old format)
    if (variable.weights) {
      return { valid: false, error: `Variable "${variable.name}" has a separate "weights" array. Weight must be inside each value object.` };
    }

    if (variable.values.length < 6) {
      return { valid: false, error: `Variable "${variable.name}" has only ${variable.values.length} values, need at least 6` };
    }

    // Check that values are objects with text and weight
    for (let i = 0; i < variable.values.length; i++) {
      const val = variable.values[i];
      if (typeof val !== 'object' || val === null) {
        return { valid: false, error: `Variable "${variable.name}" value at index ${i} is not an object. Expected {"text": "...", "weight": N}` };
      }
      if (typeof val.text !== 'string' || !val.text) {
        return { valid: false, error: `Variable "${variable.name}" value at index ${i} missing or invalid "text" property` };
      }
      if (val.weight !== undefined && ![1, 2, 3].includes(val.weight)) {
        return { valid: false, error: `Variable "${variable.name}" value "${val.text}" has invalid weight ${val.weight}. Must be 1, 2, or 3` };
      }
    }

    // Check feature_name is Title Case
    const titleCase = variable.feature_name.replace(/\b\w/g, c => c.toUpperCase());
    if (variable.feature_name !== titleCase) {
      return { valid: false, error: `Variable "${variable.name}" feature_name "${variable.feature_name}" is not Title Case. Expected "${titleCase}"` };
    }

    // Check if placeholder exists in template
    const placeholder = `{{${variable.name}}}`;
    if (!template.promptTemplate.includes(placeholder)) {
      return { valid: false, error: `Template missing placeholder for "${variable.name}"` };
    }
  }

  // --- Story block (if present) ---
  if (template.story) {
    const story = template.story;
    const varNames = new Set(template.variables.map(v => v.name));

    if (!story.acts || story.acts.length === 0) {
      return { valid: false, error: 'Story has no acts defined' };
    }

    for (const act of story.acts) {
      if (!act.beats || act.beats < 1) {
        return { valid: false, error: `Act "${act.name}" has no beats` };
      }
      for (const varName of Object.keys(act.locks || {})) {
        if (!varNames.has(varName) && varName !== 'character') {
          return { valid: false, error: `Act "${act.name}" locks unknown variable "${varName}"` };
        }
      }
      for (const varName of Object.keys(act.biases || {})) {
        if (!varNames.has(varName)) {
          return { valid: false, error: `Act "${act.name}" biases unknown variable "${varName}"` };
        }
      }
    }

    for (const prog of (story.progressions || [])) {
      if (!varNames.has(prog.variable)) {
        return { valid: false, error: `Progression references unknown variable "${prog.variable}"` };
      }
      if (!prog.arc || prog.arc.length < 2) {
        return { valid: false, error: `Progression for "${prog.variable}" needs at least 2 arc steps` };
      }
    }

    if (template.promptTemplate.includes('{{character}}') &&
        (!story.characters || story.characters.length === 0)) {
      return { valid: false, error: 'Template uses {{character}} but no characters are defined' };
    }
  }

  return { valid: true };
}
```

---

## 11. Migration Guide: Legacy to Canonical

### 11.1 What Needs to Change

| Element | Legacy | Canonical |
|---------|--------|-----------|
| Values | `"values": ["bare string", ...]` | `"values": [{"text": "...", "weight": 3}, ...]` |
| Weights | `"weights": [3, 2, 1]` (separate array) | Weight embedded in each value object |
| Feature name | `"feature_name": "profession"` | `"feature_name": "Profession"` (Title Case) |
| `promptTemplate` | No change needed | No change needed |
| `name` | No change needed | No change needed |

### 11.2 Automated Migration

Use the normalizer to convert values automatically. Note: this handles value format but **not** feature_name Title Case — that must be fixed manually.

```javascript
import { normalizeTemplate } from './template-normalizer.js';

// Read legacy template
const legacy = JSON.parse(fs.readFileSync('templates/character-design.json', 'utf8'));

// Normalize values (bare strings → {text, weight} objects)
normalizeTemplate(legacy);

// Fix feature_name to Title Case (normalizer does NOT do this)
for (const variable of legacy.variables) {
  variable.feature_name = variable.name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Add weights (normalizer defaults to omitting weight — add distribution manually)
// Or leave weights omitted (all default to 1)

// Write canonical template
fs.writeFileSync('templates/character-design.json', JSON.stringify(legacy, null, 2));
```

### 11.3 Files Requiring Migration

All 12 files in `static/synthograsizer/templates/`:

- [ ] `band-name.json`
- [ ] `character-design.json`
- [ ] `empty.json`
- [ ] `face-generator.json`
- [ ] `face-generator-full.json`
- [ ] `fantasy-scene.json`
- [ ] `mad-libs-creed.json`
- [ ] `movie-logline.json`
- [ ] `startup-slogan.json`
- [ ] `synthograsizer-prompt.json`
- [ ] `tattoo-concept.json`
- [ ] `villain-motivation.json`

---

## 12. Appendix

### 12.1 Schema Quick Reference

| Schema | Required Keys | Optional Keys | Source Files |
|--------|---------------|---------------|-------------|
| Base Template | `promptTemplate`, `variables[]` | `tags[]`, `p5Code` | `template-normalizer.js` |
| Story Template | Base + `story{}` | — | `story-engine.js` |
| Sequencer Template | Base + `_promptcraft{}` | — | `promptcraft/script.js` |
| AI Studio Batch | `batch_name`, `source`, `prompts[]` | `tags[]`, `template` | `batch-generator.js` |
| Story Export | `story_name`, `source`, `acts[]` | `tags[]`, `flat_prompts[]` | `batch-generator.js` |

### 12.2 Weight Distribution Guidelines

| Values Count | Common (3) | Uncommon (2) | Rare (1) |
|-------------|------------|-------------|----------|
| 6 | 2 | 2 | 2 |
| 8 | 3 | 3 | 2 |
| 10 | 4 | 4 | 2 |
| 12 | 5 | 4 | 3 |

### 12.3 Model Reference

From `backend/config.py`:

| Constant | Model ID | Usage |
|----------|----------|-------|
| `MODEL_TEXT_CHAT` | `gemini-3-flash-preview` | Text chat, fast tasks |
| `MODEL_IMAGE_GEN_FAST` | `gemini-2.5-flash-image` | Fast image generation |
| `MODEL_IMAGE_GEN_NB2` | `gemini-3.1-flash-image-preview` | Newer image gen |
| `MODEL_IMAGE_GEN_HQ` | `gemini-3-pro-image-preview` | High-quality image gen |
| `MODEL_VIDEO_GEN` | `veo-3.1-generate-preview` | Video generation |
| `MODEL_ANALYSIS` | `gemini-3-flash-preview` | Image analysis |
| `MODEL_TEMPLATE_GEN` | `gemini-3.1-pro-preview` | Template generation (Pro for quality) |
| `MODEL_FAST` | `gemini-3-flash-preview` | Narrative, variations, lightweight tasks |

---

*Last updated: 2026-03-09*
