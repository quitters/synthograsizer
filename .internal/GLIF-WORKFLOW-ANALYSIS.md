# Glif Workflow Analysis — Synthograsizer Adaptation Candidates

Scanned 33k-line export of Alexander's Glif workflows (2024–2026). Filtered for non-trivial multi-step pipelines with patterns adaptable to the Synthograsizer engine.

---

## 1. Style Transfer / Image Transformation

### Super Kontext Style Transfer (`cmcjeta1i0000js04uzwi2xa3`)
- **What:** Analyzes image subject via ImageToText, then applies one of 60+ style concepts (oil painting, claymation, cubism, datamosh, kintsugi, synesthesia, etc.) using Flux Kontext with the original image as reference.
- **Interesting:** Massive curated style menu with subject-interpolated prompts (`{subject}` inserted into each style description). Analyze → transform loop.
- **Synth mapping:** Existing Smart Transform, but the **style preset library** is new. → WorkflowEngine template: `analyzeSubject` → `selectStyle` → `generateWithReference`.

### Weird Style Transfer (`cm9x2dbke0000k104v8nm7hlw`)
- **What:** Simpler variant — image input + surreal concept picker (synesthesia, temporal collapse, recursive self-replication) → Kontext generation.
- **Interesting:** Conceptual transformations beyond traditional art styles.
- **Synth mapping:** Smart Transform presets. The concept list is directly usable.

### Parlours (`cm7nm3fbf0000ah8nx3lfzbb4`)
- **What:** Generates a seed image of a recursive art gallery, then analyzes the artworks within it via ImageToText, then LLM synthesizes a refined prompt, then regenerates at higher quality.
- **Interesting:** **Generate → analyze → regenerate** loop. Quality-refinement pattern.
- **Synth mapping:** New workflow template: `generateDraft` → `analyzeResult` → `refinedPrompt` → `generateFinal`.

---

## 2. Analysis → Generation Loops

### IMG2VID Workflow / 10-second Kling 2.1 (`cmcdljrpm0003ky04cs7pfnt2`)
- **What:** Three parallel ImageToText analyses (detailed caption, main subject, scene mood) → LLM prompt synthesis with cinematic/camera/effects parameters → video generation + audio design.
- **Interesting:** **Multi-aspect parallel analysis** feeding structured prompt gen. Parametric control surface (11 cinematic styles, 19 camera movements, 21 VFX).
- **Synth mapping:** WorkflowEngine DAG with parallel analysis steps. img-to-video template.

### IMG2VID Level 3 — FirstFrame + LastFrame (`cmevorwyt0002ik04nbrp55g3`)
- **What:** Two keyframe images → 8-step analysis chain: unified frame analysis → transition strategy → keyframe gen → conceptual bridge → fallback assessment → prompt architecture → validation → final video.
- **Interesting:** **Multi-pass reasoning chain with validation and fallback.** Most sophisticated DAG in the collection. Each LLM call produces structured JSON consumed by the next.
- **Synth mapping:** Model for "deep reasoning" workflow pattern.

### Opinion Viewer (`cmj7t05x60000jj04dbx4sirp`)
- **What:** Profile picture + comment text → visual metaphor extraction from text → PFP visual DNA analysis → fusion into image prompt → keyframe → video.
- **Interesting:** **Cross-modal fusion** — text sentiment analysis + image style analysis → unified visual output.
- **Synth mapping:** Template: `analyzeText` + `analyzeImage` → `fuseInsights` → `generate`.

---

## 3. Narrative / Story Generation

### Choose-Your-Own-Adventure Generator (`cma207tb30001kw05h29kfh8i`)
- **What:** Theme, scenario, optional reference image, page count, ending count, complexity → LLM generates a complete branching CYOA story as structured JSON page graph.
- **Interesting:** **Structured narrative DAG generation** — the LLM outputs a graph (pages with choices linking to targets). Branching story support.
- **Synth mapping:** Enhancement to existing story generation. Add branching narrative support with choice points.

### Profile Pic to Short Film (`cmeszgok40000ii041k2180h0`)
- **What:** Single profile picture → 5-scene movie plot with image/video prompts → 4 additional style-consistent scene images (Kontext reference chaining) → 5 video clips + 5 audio clips → composite.
- **Interesting:** **Full cinematic pipeline from a single image.** Style consistency via reference chaining. Parallel image/video/audio generation.
- **Synth mapping:** WorkflowEngine template: image → multi-scene video. The most complete single-image-to-video pipeline.

### Roasted! (`cmf2olngq0002l8044n8nhie6`)
- **What:** Research person → analyze for "uncanny" contradictions → map cultural entities → explain humor → design cartoon scenario → write caption → create visual prompt → generate illustration → HTML layout.
- **Interesting:** **7 sequential LLM calls**, each building on the last, culminating in image gen + layout. Deep analysis-to-creation arc.
- **Synth mapping:** Template for "analytical creative pipelines."

---

## 4. Biography / Personality Pipelines

### Personality Agent Builder (`cmebi9wlp0004if0479xjgsct`)
- **What:** Biographical transcript → 8 parallel LLM analyses (speech patterns, memory patterns, personality, knowledge mapping, conversation starters, identity, ethics) → assembled AI personality clone.
- **Interesting:** **Massively parallel analysis DAG** with 8 specialized agents extracting different facets. JSON extraction between steps. Relevant to PersonalClone project.
- **Synth mapping:** WorkflowEngine template. Could integrate with existing PersonalClone pipeline.

### Memories (`cmeae7jmu0005ky04fkd8c3nc`)
- **What:** Biographical transcript + life stage → memory visualization → image gen → re-described from a temporal perspective → degradation/entropy progression (fresh → fading → fragmenting → dissolving → lost) → ComfyUI processing.
- **Interesting:** **Generate → reinterpret loop** from specific emotional/temporal perspective. Memory degradation maps to generative art entropy.
- **Synth mapping:** Template. The degradation progression concept is directly relevant.

### Memory Tokens Triptych (`cmea0vsed0000k104i33pi01k`)
- **What:** Transcript → extract 3 symbolic objects + motto → generate 3 emblem images → compose triptych.
- **Interesting:** **Symbolic extraction + multi-image composition.** LLM identifies meaningful symbols; each becomes a separate generation; composed together.
- **Synth mapping:** Template for "extract symbols then generate each."

---

## 5. Multi-Modal Pipelines

### Theme Song Generator (`cmea5nmr20006ky04hsya5pc7`)
- **What:** Biography → musical analysis (era, tempo, genre) → music prompt refinement → audio generation → album cover prompt → album cover image → video composite.
- **Interesting:** **Text → analysis → audio + image + video** pipeline. First workflow crossing into audio. Musical analysis extracts structured creative parameters.
- **Synth mapping:** New feature — audio generation not in Synth yet. Analysis → creative parameter extraction → generation pattern is reusable.

### GenArtEdit_Test (`cmfxiu3s30009lh04fqhmu4st`)
- **What:** HTMLBlock generates generative art (p5.js/canvas code) → screenshot → user command applied via image editing model → LLM rewrites prompt for video → video gen.
- **Interesting:** **Code-generated art → image edit → video.** Cross-format pipeline.
- **Synth mapping:** Template. Synth could generate creative code, capture it, animate it.

### Txt-2-Img Model Comparison (`cmf5mdl7r0005jp04ut3hjm85`)
- **What:** Single prompt → 16 parallel image generations across different models → HTML grid comparison.
- **Interesting:** **Parallel model comparison** pattern. A/B testing and model selection.
- **Synth mapping:** "Model shootout" workflow template.

---

## 6. Interactive / Stateful Workflows

### Panorama Walk (`cmh5b86k00000jp04vu1fsz55`)
- **What:** Text command + memory state → command parser → location generator → panoramic image gen → state update.
- **Interesting:** **Stateful navigation with memory.** Maintains world state, generates new panoramic views based on navigation commands. Interactive generative world.
- **Synth mapping:** New feature concept — stateful workflows that persist context between runs.

### POINT AND CLICK (`cmbi4yquu0002l704kjo3o622`)
- **What:** Scene prompt → image generation → segmentation/analysis → interactive state update.
- **Interesting:** **Interactive point-and-click adventure** using generated images with analyzed clickable regions.
- **Synth mapping:** New feature — interactive image analysis feeding back into generation.

---

## 7. Novel Creative Techniques

### Entropy (`cmec65ww10000l804df0fvuys`)
- **What:** Image input → LLM describes → ComfyUI recursive processing with cfg/denoise parameters.
- **Interesting:** **Recursive image degradation.** Output → input loop with increasing entropy. Inspired by "Everywhere at the End of Time."
- **Synth mapping:** Template. Recursive feedback loop for progressive transformation. Needs loop support in WorkflowEngine.

### Synesthetic Singularity (`cm0zgeox20003qc6uhdyr04aq`)
- **What:** HTML generative art (particle system, 40 palettes) → screenshot → style-transferred image generation.
- **Interesting:** **Parameterized generative code → AI image generation.**
- **Synth mapping:** Existing capability enhancement. Adds capture-and-transform step.

### Fantastic Algorithmic Rainbow Temporalities (`cm7ko9p72000fxsl5ik419g7u`)
- **What:** Fetches real-time data from WorldTimeAPI → uses time as seed/variable in generative art → prompt refinement → image gen.
- **Interesting:** **External data as creative input.** Real-world API data drives generative parameters.
- **Synth mapping:** New workflow step type: `fetch_url` or `external_data`.

### PFP Group Photo (`cmh25c85d0000kw04bj04a4lv`)
- **What:** Up to 5 profile pictures + scene description → parallel analysis of each PFP → scene definition → integration plan → prompt gen → composite image.
- **Interesting:** **Multi-image analysis with AI-planned composition.** LLM acts as creative director.
- **Synth mapping:** Template for multi-source image composition.

---

## Priority Matrix

### Immediate (existing infra, template/config only)
1. **Style Transfer Preset Library** — 60+ styles from Super Kontext, subject interpolation ← *building now*
2. **Generate → Analyze → Regenerate loop** — quality refinement workflow template ← *building now*
3. **Branching narrative support** — CYOA page-graph structure for story gen

### Short-term (new workflow templates)
4. Image-to-Video with multi-aspect parallel analysis
5. Profile Pic to Short Film pipeline
6. Memory visualization with degradation progression
7. Multi-image composition with AI planning
8. Model comparison / A/B testing tool

### Medium-term (new features required)
9. Stateful interactive workflows with memory persistence
10. External API data as creative input (`fetch_url` step type)
11. Recursive feedback loops (loop/iteration in WorkflowEngine)
12. Code → capture → transform → animate pipeline (HTML render step type)
