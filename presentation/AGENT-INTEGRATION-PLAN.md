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
| `synth_template` | `promptTemplate`, `template` (JSON string) |
| `synth_story` | same as synth_template |
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

## Phase 3 — Planned (not yet started)

- Workflow templates: pre-built named workflows agents can invoke by name
- Workflow library: save/load workflow definitions from disk
- Resume / retry: restart failed workflows from the last successful step
- Frontend workflow visualizer: DAG view of step status in the chatroom UI
