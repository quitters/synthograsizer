# Agent-Chat × Synthograsizer Integration Plan

## Overview

Two-phase integration that lets chatroom agents call the Synthograsizer generative pipeline (localhost:8001) via tag-based tool syntax, and orchestrate multi-step creative workflows.

---

## Phase 1 — Individual SYNTH_* Tools ✅ Complete

**Goal:** Agents can call individual Synthograsizer endpoints inline in conversation.

### Files changed
| File | Change |
|------|--------|
| `chatroom/server/services/synthClient.js` | New — HTTP wrapper for all Synthograsizer API routes |
| `chatroom/server/services/tools.js` | Added `parseSynthRequests`, `executeSynthRequests`, `stripSynthTags`, `formatSynthResults` |
| `chatroom/server/services/orchestrator.js` | Wired SYNTH_* parsing + execution into the conversation loop; media stored in mediaStore; SSE events broadcast |
| `chatroom/server/services/gemini.js` | System prompt updated with SYNTH_* tool descriptions (only shown when Synthograsizer is healthy) |

### Available SYNTH_* tags
```
[SYNTH_IMAGE: prompt | aspect_ratio=16:9 | negative_prompt=blurry | num_images=1]
[SYNTH_VIDEO: prompt | aspect_ratio=16:9 | duration=5]
[SYNTH_TEMPLATE: description | mode=text]        (modes: text|image|hybrid|story|workflow)
[SYNTH_STORY: story concept description]
[SYNTH_REMIX_TEMPLATE: {template JSON} | instructions]
[SYNTH_NARRATIVE: scene 1 | scene 2 | mode=story]  (modes: story|documentary|abstract|dream)
[SYNTH_TRANSFORM: imageId | intent description]
[SYNTH_ANALYZE: imageId]
```

### SSE events emitted
- `synth_executing` — step started
- `synth_media` — image/video stored (includes mediaId)
- `synth_result` — non-media result (template, narrative, analysis)
- `synth_error` — step failed

---

## Phase 2 — WorkflowEngine ✅ Complete

**Goal:** Agents can plan and execute multi-step creative pipelines. Steps run in dependency order, in parallel where possible. Intermediate results are threaded between steps via `{{stepId.field}}` template syntax.

### Files changed
| File | Change |
|------|--------|
| `chatroom/server/services/workflowEngine.js` | New — WorkflowEngine class + tag parsing helpers |
| `chatroom/server/services/tools.js` | Re-exports `parseWorkflowRequests`, `stripWorkflowTags`, `workflowEngine` from workflowEngine.js |
| `chatroom/server/services/orchestrator.js` | Wired workflow parsing after SYNTH_* block; dispatches WORKFLOW/STATUS/CANCEL; stores `workflowIds` in messages |
| `chatroom/server/services/gemini.js` | System prompt extended with workflow tool descriptions + example workflow JSON |

### Workflow tag syntax

**Submit a workflow:**
```
[WORKFLOW: {
  "name": "Dreamscape Series",
  "steps": [
    { "id": "tpl", "type": "synth_template", "params": { "description": "ethereal dreamscape", "mode": "story" } },
    { "id": "img1", "type": "synth_image", "params": { "prompt": "{{tpl.promptTemplate}}" }, "dependsOn": ["tpl"] },
    { "id": "img2", "type": "synth_image", "params": { "prompt": "{{tpl.promptTemplate}} at sunset" }, "dependsOn": ["tpl"] },
    { "id": "analyze", "type": "synth_analyze", "params": { "image_id": "{{img1.mediaId}}" }, "dependsOn": ["img1"] },
    { "id": "narr", "type": "synth_narrative", "params": { "descriptions": ["{{analyze.description}}", "dream sequence"], "mode": "dream" }, "dependsOn": ["analyze"] }
  ]
}]
```

**Check status:**
```
[WORKFLOW_STATUS: <workflow_id>]
```

**Cancel:**
```
[WORKFLOW_CANCEL: <workflow_id>]
```

### Template interpolation

`{{stepId.field}}` in any `params` string value is replaced at execution time with the named field from that step's result. Supported fields depend on step type:

| Step type | Useful result fields |
|-----------|---------------------|
| `synth_image` | `mediaId`, `mediaType` |
| `synth_video` | `mediaId`, `mediaType` |
| `synth_text` | `text` |
| `synth_template` | `promptTemplate`, `template` (JSON string) |
| `synth_story` | same as synth_template |
| `synth_remix_template` | `promptTemplate`, `template` (JSON string) |
| `synth_narrative` | `prompts` (array) |
| `synth_analyze` | `description`, `prompt` |
| `synth_transform` | `mediaId`, `mediaType` |

### Execution model

1. Steps are sorted into **waves** via topological sort.
2. Steps in the same wave execute in **parallel** (`Promise.all`).
3. If any step in a wave **fails**, subsequent waves are skipped.
4. Workflows run **in the background** — the conversation continues.
5. Media produced by steps is stored in `mediaStore` and can be referenced by ID in later steps.

### SSE events emitted
- `workflow_submitted` — workflow accepted, id assigned
- `workflow_start` — execution begins
- `workflow_step_start` — individual step starting
- `workflow_step_complete` — step succeeded (includes lightweight result summary)
- `workflow_step_error` — step failed
- `workflow_complete` — all steps done (or first wave failure)
- `workflow_cancelled` — cancelled via WORKFLOW_CANCEL
- `workflow_error` — engine-level error (e.g. invalid JSON in tag)
- `workflow_status` — response to WORKFLOW_STATUS query
- `workflow_cancel_result` — response to WORKFLOW_CANCEL

### Design notes / deviations from original spec

- The `transform` field described in the spec (per-step output transform function) was **not implemented**. The `{{stepId.field}}` template interpolation covers the same use case declaratively and is simpler for agents to express.
- Cancellation sets a flag checked between waves; currently-running steps within a wave finish before the engine halts.
- The `workflowEngine` singleton is exported from `workflowEngine.js` and re-exported via `tools.js` to keep orchestrator imports consolidated.

---

## Phase 3 — Style Presets & Workflow Templates ✅ Complete

**Goal:** Curated style preset library and pre-built named workflow templates. Agents can apply artistic styles with a single tag and invoke multi-step pipelines by name.

### Files changed
| File | Change |
|------|--------|
| `chatroom/server/services/stylePresets.js` | New — 55 curated style presets across 9 categories, with `{subject}` interpolation, lookup helpers, and `applyPreset()` |
| `chatroom/server/services/workflowTemplates.js` | New — 10 pre-built workflow templates |
| `chatroom/server/services/tools.js` | Added `parseSynthStyleRequests`, `parseWorkflowTemplateRequests`, `stripStyleAndTemplateTags`; re-exports from stylePresets.js and workflowTemplates.js |
| `chatroom/server/services/orchestrator.js` | Wired SYNTH_STYLE + WORKFLOW_TEMPLATE parsing after workflow block; SYNTH_STYLE → direct image gen with preset; WORKFLOW_TEMPLATE → buildWorkflow() → workflowEngine.submit() |
| `chatroom/server/services/gemini.js` | System prompt extended with style preset listing, SYNTH_STYLE tag syntax, WORKFLOW_TEMPLATE tag syntax + examples |
| `presentation/GLIF-WORKFLOW-ANALYSIS.md` | New — full analysis of Glif workflow export, priority matrix for Synthograsizer adaptation |

### New tag syntax

**Style preset image generation:**
```
[SYNTH_STYLE: subject description | style=preset_id]
```

**Named workflow template invocation:**
```
[WORKFLOW_TEMPLATE: template_id | param=value | ...]
```

### Style preset categories (55 presets)
| Category | Presets |
|----------|---------|
| painting | oil_painting, watercolor, impressionist, ukiyo_e, ink_wash, expressionist, pointillism |
| sculpture | claymation, marble_sculpture, kintsugi, origami, low_poly |
| photography | daguerreotype, polaroid, infrared, tilt_shift, noir, cinematic |
| digital | glitch, datamosh, vaporwave, pixel_art, ascii, wireframe |
| surreal | synesthesia, temporal_collapse, recursive, dream_logic, cosmic_horror, bioluminescent |
| material | stained_glass, embroidery, mosaic, neon_sign, ice_sculpture, woodcut |
| period | art_nouveau, art_deco, baroque, cyberpunk, solarpunk, soviet_constructivism |
| illustration | comic_book, manga, botanical_illustration, children_book, blueprint |
| experimental | double_exposure, cyanotype, risograph, generative_art, thermal_vision, x_ray |

### Workflow templates
| Template | Required | Optional | Description |
|----------|----------|----------|-------------|
| `style_transfer` | subject | style, refine | Generate image in a chosen style; optionally analyze + regenerate for quality |
| `refinement_loop` | prompt | aspect_ratio, negative_prompt, refinement_instruction | Draft → analyze → regenerate with enriched prompt |
| `style_comparison` | subject | styles | Same subject in multiple styles, all generated in parallel |
| `narrative_dreamscape` | concept | image_count, narrative_mode | Template → N images → analyze each → dream narrative |
| `progressive_transform` | prompt, transforms | aspect_ratio | Sequential transforms, each building on previous result |
| `img_to_video` | prompt | aspect_ratio, duration, cinematic_style | Image → multi-aspect analysis → cinematic video prompt → video |
| `memory_visualization` | memory | life_stage, degradation_depth | Memory image → progressive degradation (fading → fragmenting → dissolving → ghosting → lost) |
| `multi_image_composite` | subjects, scene | aspect_ratio | Generate + analyze N subjects → AI creative director → composite scene |
| `branching_narrative` | theme | scenario, page_count, endings, complexity, image_count | CYOA branching story JSON + illustrated key scenes |
| `cinematic_short` | concept | scene_count, mood, aspect_ratio | Plan scenes → generate + analyze each → narrative + hero video |

### New step types added
| Step type | Description |
|-----------|-------------|
| `synth_text` | Freeform LLM text generation (for prompt synthesis between steps). Result field: `text` |
| `synth_remix_template` | Remix an existing template with new instructions. Result fields: `promptTemplate`, `template` |

### Design notes
- Style presets adapted from Glif's "Super Kontext Style Transfer" workflow (60+ styles curated to 53)
- Refinement loop pattern adapted from the "Parlours" Glif workflow (generate → analyze → regenerate)
- `SYNTH_STYLE` is a convenience shortcut — it generates directly via synthClient without going through WorkflowEngine (single-step, no DAG needed)
- `WORKFLOW_TEMPLATE` builds a full workflow definition from the template, then submits it through WorkflowEngine — so all DAG/wave/SSE machinery applies
- Workflow template params support CSV expansion for array fields (e.g. `styles=a,b,c` → `['a','b','c']`)
- `synth_text` step type added to support LLM-as-glue patterns (e.g. cinematic prompt synthesis, creative director composition planning, CYOA story generation)
- `synth_remix_template` step type added to support template iteration within workflows
- `memory_visualization` degradation stages inspired by "Everywhere at the End of Time" / Glif "Memories" workflow
- `img_to_video` pipeline adapted from Glif "IMG2VID" workflow — uses synth_text for cinematic prompt engineering between analysis and video gen
- `multi_image_composite` adapted from Glif "PFP Group Photo" — LLM creative director plans spatial composition
- `cinematic_short` adapted from Glif "Profile Pic to Short Film" — narrative + hero_video run in parallel wave
- `branching_narrative` adapted from Glif "CYOA Generator" — story structure + style template run in parallel, then scene images generated

---

## Phase 4 — Planned (not yet started)

- Workflow library: save/load workflow definitions from disk
- Resume / retry: restart failed workflows from the last successful step
- Frontend workflow visualizer: DAG view of step status in the chatroom UI
- Stateful interactive workflows with memory persistence (from Glif "Panorama Walk")
- External API data as creative input (fetch_url step type, from Glif "FART")
- Recursive feedback loops / iteration support in WorkflowEngine (from Glif "Entropy")
