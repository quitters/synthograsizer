/**
 * Workflow Templates
 * ──────────────────
 * Pre-built named workflow definitions that agents can invoke by name
 * instead of writing raw workflow JSON. Each template is a function that
 * takes user-supplied params and returns a full workflow definition
 * compatible with WorkflowEngine.submit().
 *
 * Usage:
 *   import { getTemplate, listTemplates, buildWorkflow } from './workflowTemplates.js';
 *   const wfDef = buildWorkflow('style_transfer', { subject: 'a fox in snow', style: 'oil_painting' });
 *   workflowEngine.submit(wfDef, { broadcast, agentId, agentName });
 */

import { getPreset, applyPreset, stylePresets, listPresetsCompact } from './stylePresets.js';

// ─── Template registry ───────────────────────────────────────────────────────

const templates = new Map();

/**
 * Register a workflow template.
 * @param {string}   id          - unique template id
 * @param {object}   meta        - { name, description, requiredParams, optionalParams }
 * @param {Function} builderFn   - (params) => workflowDefinition
 */
function register(id, meta, builderFn) {
  templates.set(id, { id, ...meta, build: builderFn });
}

// ─── 1. Style Transfer ──────────────────────────────────────────────────────

register(
  'style_transfer',
  {
    name: 'Style Transfer',
    description: 'Generate an image of a subject in a chosen artistic style. Analyzes the result and optionally regenerates for quality refinement.',
    requiredParams: ['subject'],
    optionalParams: ['style', 'refine'],
  },
  (params) => {
    const { subject, style = 'oil_painting', refine = false } = params;
    const preset = getPreset(style);

    if (!preset) {
      throw new Error(`Unknown style preset: "${style}". Available: ${stylePresets.map(p => p.id).join(', ')}`);
    }

    const applied = applyPreset(preset, subject);

    const steps = [
      {
        id: 'generate',
        type: 'synth_image',
        params: {
          prompt: applied.prompt,
          ...(applied.negative_prompt ? { negative_prompt: applied.negative_prompt } : {}),
          ...(applied.aspect_ratio ? { aspect_ratio: applied.aspect_ratio } : {}),
        },
      },
    ];

    if (refine) {
      // Analyze the generated image
      steps.push({
        id: 'analyze',
        type: 'synth_analyze',
        params: { image_id: '{{generate.mediaId}}' },
        dependsOn: ['generate'],
      });

      // Regenerate with analysis-informed prompt
      steps.push({
        id: 'refine',
        type: 'synth_image',
        params: {
          prompt: `${applied.prompt}, refined: {{analyze.description}}`,
          ...(applied.negative_prompt ? { negative_prompt: applied.negative_prompt } : {}),
          ...(applied.aspect_ratio ? { aspect_ratio: applied.aspect_ratio } : {}),
        },
        dependsOn: ['analyze'],
      });
    }

    return {
      name: `Style Transfer: ${preset.name} — ${subject}`,
      steps,
    };
  }
);

// ─── 2. Refinement Loop ─────────────────────────────────────────────────────

register(
  'refinement_loop',
  {
    name: 'Generate → Analyze → Regenerate',
    description: 'Generates a draft image, analyzes it to extract a detailed description, then regenerates with the enriched prompt for higher quality. Inspired by the Parlours workflow pattern.',
    requiredParams: ['prompt'],
    optionalParams: ['aspect_ratio', 'negative_prompt', 'refinement_instruction'],
  },
  (params) => {
    const {
      prompt,
      aspect_ratio = '1:1',
      negative_prompt = '',
      refinement_instruction = 'enhance detail, improve composition, increase visual coherence',
    } = params;

    return {
      name: `Refinement Loop: ${prompt.slice(0, 50)}`,
      steps: [
        // Wave 1: generate draft
        {
          id: 'draft',
          type: 'synth_image',
          params: {
            prompt,
            aspect_ratio,
            ...(negative_prompt ? { negative_prompt } : {}),
          },
        },
        // Wave 2: analyze draft
        {
          id: 'analyze',
          type: 'synth_analyze',
          params: { image_id: '{{draft.mediaId}}' },
          dependsOn: ['draft'],
        },
        // Wave 3: regenerate with analysis
        {
          id: 'final',
          type: 'synth_image',
          params: {
            prompt: `${prompt}. Visual reference: {{analyze.description}}. ${refinement_instruction}`,
            aspect_ratio,
            ...(negative_prompt ? { negative_prompt } : {}),
          },
          dependsOn: ['analyze'],
        },
      ],
    };
  }
);

// ─── 3. Style Comparison ─────────────────────────────────────────────────────

register(
  'style_comparison',
  {
    name: 'Style Comparison',
    description: 'Generates the same subject in multiple artistic styles side by side for comparison. All style generations run in parallel.',
    requiredParams: ['subject'],
    optionalParams: ['styles'],
  },
  (params) => {
    const {
      subject,
      styles = ['oil_painting', 'watercolor', 'glitch', 'claymation', 'ukiyo_e'],
    } = params;

    const styleList = Array.isArray(styles) ? styles : styles.split(',').map(s => s.trim());

    const steps = styleList.map(styleId => {
      const preset = getPreset(styleId);
      if (!preset) return null;
      const applied = applyPreset(preset, subject);
      return {
        id: `style_${styleId}`,
        type: 'synth_image',
        params: {
          prompt: applied.prompt,
          ...(applied.negative_prompt ? { negative_prompt: applied.negative_prompt } : {}),
          ...(applied.aspect_ratio ? { aspect_ratio: applied.aspect_ratio } : {}),
        },
      };
    }).filter(Boolean);

    if (steps.length === 0) {
      throw new Error('No valid style presets found');
    }

    return {
      name: `Style Comparison: ${subject}`,
      steps,
    };
  }
);

// ─── 4. Narrative Dreamscape ─────────────────────────────────────────────────

register(
  'narrative_dreamscape',
  {
    name: 'Narrative Dreamscape',
    description: 'Generates a template from a concept, creates multiple images from it, analyzes each, then weaves the analyses into a dream narrative.',
    requiredParams: ['concept'],
    optionalParams: ['image_count', 'narrative_mode'],
  },
  (params) => {
    const { concept, image_count = 3, narrative_mode = 'dream' } = params;
    const count = Math.min(Math.max(Number(image_count) || 3, 2), 6);

    const steps = [
      // Wave 1: generate template
      {
        id: 'tpl',
        type: 'synth_template',
        params: { description: concept, mode: 'story' },
      },
    ];

    // Wave 2: generate images in parallel from template
    for (let i = 0; i < count; i++) {
      const suffix = i === 0 ? '' : `, variation ${i + 1}`;
      steps.push({
        id: `img${i}`,
        type: 'synth_image',
        params: { prompt: `{{tpl.promptTemplate}}${suffix}` },
        dependsOn: ['tpl'],
      });
    }

    // Wave 3: analyze each image in parallel
    for (let i = 0; i < count; i++) {
      steps.push({
        id: `analyze${i}`,
        type: 'synth_analyze',
        params: { image_id: `{{img${i}.mediaId}}` },
        dependsOn: [`img${i}`],
      });
    }

    // Wave 4: generate narrative from all analyses
    const descriptions = [];
    for (let i = 0; i < count; i++) {
      descriptions.push(`{{analyze${i}.description}}`);
    }
    steps.push({
      id: 'narrative',
      type: 'synth_narrative',
      params: { descriptions, mode: narrative_mode },
      dependsOn: Array.from({ length: count }, (_, i) => `analyze${i}`),
    });

    return {
      name: `Narrative Dreamscape: ${concept}`,
      steps,
    };
  }
);

// ─── 5. Progressive Transform ────────────────────────────────────────────────

register(
  'progressive_transform',
  {
    name: 'Progressive Transform',
    description: 'Generates an image then applies a series of transformations, each building on the previous result. Creates a visual progression / evolution strip.',
    requiredParams: ['prompt', 'transforms'],
    optionalParams: ['aspect_ratio'],
  },
  (params) => {
    const { prompt, transforms, aspect_ratio = '1:1' } = params;
    const transformList = Array.isArray(transforms) ? transforms : [transforms];

    if (transformList.length === 0) {
      throw new Error('At least one transform intent is required');
    }

    const steps = [
      {
        id: 'origin',
        type: 'synth_image',
        params: { prompt, aspect_ratio },
      },
    ];

    let prevId = 'origin';
    transformList.forEach((intent, i) => {
      const stepId = `transform_${i}`;
      steps.push({
        id: stepId,
        type: 'synth_transform',
        params: {
          image_id: `{{${prevId}.mediaId}}`,
          intent,
        },
        dependsOn: [prevId],
      });
      prevId = stepId;
    });

    return {
      name: `Progressive Transform: ${prompt.slice(0, 40)}`,
      steps,
    };
  }
);

// ─── 6. Image-to-Video Pipeline ──────────────────────────────────────────────

register(
  'img_to_video',
  {
    name: 'Image to Video',
    description: 'Generates an image from a prompt, performs multi-aspect analysis (scene description, mood, motion potential), synthesizes a cinematic video prompt, then generates the video. Adapted from the Glif IMG2VID workflow.',
    requiredParams: ['prompt'],
    optionalParams: ['aspect_ratio', 'duration', 'cinematic_style'],
  },
  (params) => {
    const {
      prompt,
      aspect_ratio = '16:9',
      duration = 5,
      cinematic_style = 'cinematic',
    } = params;

    const CINEMATIC_STYLES = [
      'cinematic', 'documentary', 'music_video', 'dreamy', 'horror',
      'noir', 'anime', 'stop_motion', 'timelapse', 'surveillance', 'vhs',
    ];
    const style = CINEMATIC_STYLES.includes(cinematic_style) ? cinematic_style : 'cinematic';

    return {
      name: `Image to Video: ${prompt.slice(0, 50)}`,
      steps: [
        // Wave 1: generate keyframe image
        {
          id: 'keyframe',
          type: 'synth_image',
          params: { prompt, aspect_ratio },
        },
        // Wave 2: analyze the keyframe
        {
          id: 'analyze',
          type: 'synth_analyze',
          params: { image_id: '{{keyframe.mediaId}}' },
          dependsOn: ['keyframe'],
        },
        // Wave 3: synthesize a cinematic video prompt from analysis
        {
          id: 'video_prompt',
          type: 'synth_text',
          params: {
            prompt: `You are a cinematic prompt engineer. Given this image description, write a single detailed video generation prompt. Style: ${style}. Duration: ${duration} seconds. Include camera movement, lighting changes, and atmospheric effects. Image description: {{analyze.description}}. Original concept: ${prompt}. Output ONLY the video prompt, nothing else.`,
          },
          dependsOn: ['analyze'],
        },
        // Wave 4: generate video
        {
          id: 'video',
          type: 'synth_video',
          params: {
            prompt: '{{video_prompt.text}}',
            aspect_ratio,
            duration: String(duration),
          },
          dependsOn: ['video_prompt'],
        },
      ],
    };
  }
);

// ─── 7. Memory Visualization ─────────────────────────────────────────────────

register(
  'memory_visualization',
  {
    name: 'Memory Visualization',
    description: 'Visualizes a memory or biographical moment, then progressively degrades it through temporal stages (fresh → fading → fragmenting → dissolving → lost). Adapted from the Glif "Memories" workflow, inspired by "Everywhere at the End of Time."',
    requiredParams: ['memory'],
    optionalParams: ['life_stage', 'degradation_depth'],
  },
  (params) => {
    const {
      memory,
      life_stage = 'childhood',
      degradation_depth = 4,
    } = params;

    const depth = Math.min(Math.max(Number(degradation_depth) || 4, 1), 5);

    const DEGRADATION_STAGES = [
      { id: 'fading', intent: 'make the image slightly faded and soft, as if recalled through time — gentle blur, slightly desaturated colors, warm nostalgic haze' },
      { id: 'fragmenting', intent: 'fragment the image — parts are dissolving, edges are breaking apart, some areas are becoming abstract shapes, memory is becoming unreliable' },
      { id: 'dissolving', intent: 'heavily dissolve the image — forms are barely recognizable, colors are bleeding and shifting, abstract patterns overtaking the original scene, deep entropy' },
      { id: 'ghosting', intent: 'ghost the image — transparent overlapping copies of the scene at different angles, temporal echoes, almost entirely abstract, only faint traces of the original remain' },
      { id: 'lost', intent: 'completely abstract — the original image is gone, replaced by noise, color field, and texture. Only the emotional residue remains as abstract marks and shapes' },
    ];

    const stages = DEGRADATION_STAGES.slice(0, depth);

    const steps = [
      // Wave 1: generate the vivid original memory
      {
        id: 'memory',
        type: 'synth_image',
        params: {
          prompt: `A vivid, emotionally resonant visualization of this ${life_stage} memory: ${memory}. Warm, detailed, sharply focused, as if perfectly preserved in the mind's eye.`,
        },
      },
      // Wave 2: analyze the memory image
      {
        id: 'describe',
        type: 'synth_analyze',
        params: { image_id: '{{memory.mediaId}}' },
        dependsOn: ['memory'],
      },
    ];

    // Wave 3+: sequential degradation, each building on the previous
    let prevId = 'memory';
    for (const stage of stages) {
      steps.push({
        id: stage.id,
        type: 'synth_transform',
        params: {
          image_id: `{{${prevId}.mediaId}}`,
          intent: stage.intent,
        },
        dependsOn: [prevId],
      });
      prevId = stage.id;
    }

    return {
      name: `Memory Visualization: ${memory.slice(0, 50)}`,
      steps,
    };
  }
);

// ─── 8. Multi-Image Composite ────────────────────────────────────────────────

register(
  'multi_image_composite',
  {
    name: 'Multi-Image Composite',
    description: 'Generates multiple subjects, analyzes each, then uses an AI "creative director" to plan how they should be composed together in a final scene. Adapted from the Glif "PFP Group Photo" workflow.',
    requiredParams: ['subjects', 'scene'],
    optionalParams: ['aspect_ratio'],
  },
  (params) => {
    const { subjects, scene, aspect_ratio = '16:9' } = params;
    const subjectList = Array.isArray(subjects) ? subjects : subjects.split(',').map(s => s.trim());

    if (subjectList.length < 2) {
      throw new Error('multi_image_composite requires at least 2 subjects');
    }
    if (subjectList.length > 6) {
      throw new Error('multi_image_composite supports up to 6 subjects');
    }

    const steps = [];

    // Wave 1: generate each subject in parallel
    for (let i = 0; i < subjectList.length; i++) {
      steps.push({
        id: `subj${i}`,
        type: 'synth_image',
        params: { prompt: `Portrait of ${subjectList[i]}, clean background, detailed features, studio lighting` },
      });
    }

    // Wave 2: analyze each subject in parallel
    for (let i = 0; i < subjectList.length; i++) {
      steps.push({
        id: `analyze${i}`,
        type: 'synth_analyze',
        params: { image_id: `{{subj${i}.mediaId}}` },
        dependsOn: [`subj${i}`],
      });
    }

    // Wave 3: creative director synthesizes the composite prompt
    const analysisRefs = subjectList.map((subj, i) =>
      `Subject ${i + 1} ("${subj}"): {{analyze${i}.description}}`
    ).join(' | ');

    steps.push({
      id: 'director',
      type: 'synth_text',
      params: {
        prompt: `You are a creative director composing a group scene. You have these subjects:\n${analysisRefs}\n\nScene setting: ${scene}\n\nWrite a single, detailed image generation prompt that places all subjects together in the scene. Consider: spatial arrangement, lighting consistency, scale relationships, interaction between subjects, and overall composition. Style should be cohesive. Output ONLY the image prompt.`,
      },
      dependsOn: subjectList.map((_, i) => `analyze${i}`),
    });

    // Wave 4: generate the composite image
    steps.push({
      id: 'composite',
      type: 'synth_image',
      params: {
        prompt: '{{director.text}}',
        aspect_ratio,
      },
      dependsOn: ['director'],
    });

    return {
      name: `Multi-Image Composite: ${scene}`,
      steps,
    };
  }
);

// ─── 9. Branching Narrative (CYOA) ───────────────────────────────────────────

register(
  'branching_narrative',
  {
    name: 'Branching Narrative (CYOA)',
    description: 'Generates a Choose-Your-Own-Adventure branching story structure as JSON, then creates images for key scenes. Adapted from the Glif CYOA Generator workflow.',
    requiredParams: ['theme'],
    optionalParams: ['scenario', 'page_count', 'endings', 'complexity', 'image_count'],
  },
  (params) => {
    const {
      theme,
      scenario = 'surprise me',
      page_count = 12,
      endings = 3,
      complexity = 'medium',
      image_count = 3,
    } = params;

    const imgCount = Math.min(Math.max(Number(image_count) || 3, 1), 5);

    return {
      name: `Branching Narrative: ${theme}`,
      steps: [
        // Wave 1: generate the branching story structure
        {
          id: 'story',
          type: 'synth_text',
          params: {
            prompt: `You are an expert Choose-Your-Own-Adventure story generator. Create a branching narrative with these parameters:
- Theme: ${theme}
- Starting scenario: ${scenario}
- Page count: ~${page_count}
- Minimum unique endings: ${endings}
- Complexity: ${complexity}

Output a valid JSON object with this structure:
{
  "story_title": "...",
  "page_count": N,
  "unique_endings": N,
  "narrative_arcs": ["arc1", "arc2"],
  "story_structure": {
    "page_1": { "page_id": "page_1", "text": "narrative text...", "choices": [{ "text": "choice text", "target_page_id": "page_2a" }] },
    ...
  },
  "key_scenes": ["description of 1st key visual moment", "description of 2nd key visual moment", ...]
}

Every target_page_id must exist. Ending pages must have "choices": []. Include ${imgCount} entries in key_scenes describing the most visually striking moments.
Output ONLY valid JSON.`,
          },
        },
        // Wave 2: generate a template from the story for prompt consistency
        {
          id: 'style_tpl',
          type: 'synth_template',
          params: {
            description: `Visual style template for a ${theme} ${complexity}-complexity branching narrative. ${scenario}`,
            mode: 'story',
          },
        },
        // Wave 3: generate images for key scenes (up to imgCount, using template style)
        // Since we can't dynamically determine how many scenes the LLM picks,
        // we generate a fixed number and reference the story text for context
        ...Array.from({ length: imgCount }, (_, i) => ({
          id: `scene_img_${i}`,
          type: 'synth_image',
          params: {
            prompt: `Scene ${i + 1} from a ${theme} adventure story. {{style_tpl.promptTemplate}}. Dramatic moment, narrative illustration style.`,
          },
          dependsOn: ['story', 'style_tpl'],
        })),
      ],
    };
  }
);

// ─── 10. Cinematic Short Film ────────────────────────────────────────────────

register(
  'cinematic_short',
  {
    name: 'Cinematic Short Film',
    description: 'From a single concept, generates a multi-scene storyboard: plans 3-5 scenes, generates an image for each, analyzes them, produces a narrative, then generates a video from the hero scene. Adapted from the Glif "Profile Pic to Short Film" workflow.',
    requiredParams: ['concept'],
    optionalParams: ['scene_count', 'mood', 'aspect_ratio'],
  },
  (params) => {
    const {
      concept,
      scene_count = 4,
      mood = 'cinematic',
      aspect_ratio = '16:9',
    } = params;

    const count = Math.min(Math.max(Number(scene_count) || 4, 3), 5);

    const steps = [
      // Wave 1: plan the scenes via LLM
      {
        id: 'plan',
        type: 'synth_text',
        params: {
          prompt: `You are a film director planning a short film. Concept: "${concept}". Mood: ${mood}.
Plan exactly ${count} scenes. For each scene, write a vivid image generation prompt (2-3 sentences) describing the visual.
Output ONLY a JSON array of strings, one prompt per scene. Example: ["scene 1 prompt", "scene 2 prompt"]`,
        },
      },
      // Wave 1 (parallel): create a style template for visual consistency
      {
        id: 'style',
        type: 'synth_template',
        params: {
          description: `${mood} visual style for a short film about: ${concept}`,
          mode: 'image',
        },
      },
    ];

    // Wave 2: generate scene images in parallel
    // We use a fixed count since we can't parse the LLM JSON at template-build time
    for (let i = 0; i < count; i++) {
      steps.push({
        id: `scene${i}`,
        type: 'synth_image',
        params: {
          prompt: `Scene ${i + 1} of ${count} from a ${mood} short film: ${concept}. {{style.promptTemplate}}`,
          aspect_ratio,
        },
        dependsOn: ['plan', 'style'],
      });
    }

    // Wave 3: analyze each scene in parallel
    for (let i = 0; i < count; i++) {
      steps.push({
        id: `desc${i}`,
        type: 'synth_analyze',
        params: { image_id: `{{scene${i}.mediaId}}` },
        dependsOn: [`scene${i}`],
      });
    }

    // Wave 4: generate narrative from all scene descriptions
    const descriptions = Array.from({ length: count }, (_, i) => `{{desc${i}.description}}`);
    steps.push({
      id: 'narrative',
      type: 'synth_narrative',
      params: { descriptions, mode: 'story' },
      dependsOn: Array.from({ length: count }, (_, i) => `desc${i}`),
    });

    // Wave 4 (parallel): generate video from the first scene (hero shot)
    steps.push({
      id: 'hero_video',
      type: 'synth_video',
      params: {
        prompt: `${mood} cinematic shot: {{desc0.description}}. Slow camera movement, atmospheric lighting.`,
        aspect_ratio,
        duration: '5',
      },
      dependsOn: ['desc0'],
    });

    return {
      name: `Cinematic Short: ${concept.slice(0, 50)}`,
      steps,
    };
  }
);

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get a template definition by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getTemplate(id) {
  return templates.get(id) || null;
}

/**
 * List all available templates (metadata only, no build function).
 * @returns {Array<{id, name, description, requiredParams, optionalParams}>}
 */
export function listTemplates() {
  return [...templates.values()].map(({ id, name, description, requiredParams, optionalParams }) => ({
    id, name, description, requiredParams, optionalParams,
  }));
}

/**
 * Build a workflow definition from a named template and params.
 * @param {string} templateId
 * @param {object} params
 * @returns {object} workflow definition for WorkflowEngine.submit()
 * @throws {Error} if template not found or params invalid
 */
export function buildWorkflow(templateId, params) {
  const tpl = templates.get(templateId);
  if (!tpl) {
    const available = [...templates.keys()].join(', ');
    throw new Error(`Unknown workflow template: "${templateId}". Available: ${available}`);
  }

  // Validate required params
  for (const req of tpl.requiredParams || []) {
    if (params[req] === undefined || params[req] === null || params[req] === '') {
      throw new Error(`Template "${templateId}" requires param "${req}"`);
    }
  }

  return tpl.build(params);
}

/**
 * Generate a compact listing for system prompts.
 * @returns {string}
 */
export function listTemplatesForPrompt() {
  const lines = [];
  for (const tpl of templates.values()) {
    const req = (tpl.requiredParams || []).join(', ');
    const opt = (tpl.optionalParams || []).map(p => `${p}?`).join(', ');
    const allParams = [req, opt].filter(Boolean).join(', ');
    lines.push(`  - ${tpl.id}(${allParams}): ${tpl.description.split('.')[0]}`);
  }
  return lines.join('\n');
}

/**
 * Generate the style preset listing for system prompts.
 * @returns {string}
 */
export function listStylesForPrompt() {
  return listPresetsCompact();
}
