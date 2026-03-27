/**
 * Client-side workflow UI constants.
 * Step type glyphs and status colours used by WorkflowInlineCard and StylePicker.
 */

export const STEP_GLYPHS = {
  synth_image:          '🖼',
  synth_video:          '🎬',
  synth_text:           '📝',
  synth_analyze:        '🔍',
  synth_transform:      '⚡',
  synth_fetch:          '🌐',
  synth_template:       '📋',
  synth_story:          '📖',
  synth_narrative:      '🗣',
  synth_remix_template: '🔀',
  loop:                 '↻',
};

export const STATUS_COLORS = {
  pending:   'var(--text-muted)',
  running:   '#f0a500',
  complete:  '#4caf50',
  failed:    '#e94560',
  cancelled: '#888',
};

/**
 * Metadata for template params — drives smart input rendering in TemplateParamForm.
 * type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'style_select' | 'aspect_select'
 */
export const PARAM_META = {
  // ── Shared ────────────────────────────────────────────────────────────────
  style: {
    type: 'style_select',
    label: 'Style Preset',
    defaultValue: 'oil_painting',
  },
  refine: {
    type: 'boolean',
    label: 'Refine result? (analyze → regenerate)',
    defaultValue: false,
  },
  aspect_ratio: {
    type: 'aspect_select',
    label: 'Aspect Ratio',
    defaultValue: '1:1',
  },
  negative_prompt: {
    type: 'text',
    label: 'Negative Prompt',
    placeholder: 'What to avoid in the image…',
  },

  // ── Refinement Loop ───────────────────────────────────────────────────────
  refinement_instruction: {
    type: 'text',
    label: 'Refinement Instruction',
    placeholder: 'enhance detail, improve composition…',
    defaultValue: 'enhance detail, improve composition, increase visual coherence',
  },

  // ── Style Comparison ──────────────────────────────────────────────────────
  styles: {
    type: 'text',
    label: 'Styles (comma-separated preset IDs)',
    placeholder: 'oil_painting, watercolor, glitch, claymation, ukiyo_e',
    defaultValue: 'oil_painting, watercolor, glitch, claymation, ukiyo_e',
  },

  // ── Narrative Dreamscape ──────────────────────────────────────────────────
  image_count: {
    type: 'number',
    label: 'Image Count',
    min: 2, max: 6,
    defaultValue: 3,
  },
  narrative_mode: {
    type: 'select',
    label: 'Narrative Mode',
    options: ['dream', 'noir', 'epic', 'lyrical', 'surreal'],
    defaultValue: 'dream',
  },

  // ── Progressive Transform ─────────────────────────────────────────────────
  transforms: {
    type: 'text',
    label: 'Transforms (comma-separated intents)',
    placeholder: 'aged and weathered, glitched and corrupted, neon-lit…',
  },

  // ── Image to Video ────────────────────────────────────────────────────────
  duration: {
    type: 'number',
    label: 'Duration (seconds)',
    min: 3, max: 10,
    defaultValue: 5,
  },
  cinematic_style: {
    type: 'select',
    label: 'Cinematic Style',
    options: ['cinematic', 'documentary', 'music_video', 'dreamy', 'horror', 'noir', 'anime', 'stop_motion', 'timelapse', 'vhs'],
    defaultValue: 'cinematic',
  },

  // ── Memory Visualization ──────────────────────────────────────────────────
  memory: {
    type: 'textarea',
    label: 'Memory',
    placeholder: 'Describe a specific memory or emotional moment to visualize…',
  },
  life_stage: {
    type: 'select',
    label: 'Life Stage',
    options: ['childhood', 'youth', 'adulthood', 'old_age'],
    defaultValue: 'childhood',
  },
  degradation_depth: {
    type: 'number',
    label: 'Degradation Depth (stages of decay)',
    min: 1, max: 5,
    defaultValue: 4,
  },

  // ── Multi-Image Composite ─────────────────────────────────────────────────
  subjects: {
    type: 'text',
    label: 'Subjects (comma-separated, 2–6)',
    placeholder: 'a medieval knight, a robot, a fox shaman…',
  },
  scene: {
    type: 'text',
    label: 'Scene / Setting',
    placeholder: 'a rainy alley at midnight in cyberpunk Tokyo',
  },

  // ── Branching Narrative ───────────────────────────────────────────────────
  scenario: {
    type: 'text',
    label: 'Opening Scenario',
    placeholder: 'leave blank for a random start',
    defaultValue: 'surprise me',
  },
  page_count: {
    type: 'number',
    label: 'Page Count (~)',
    min: 6, max: 24,
    defaultValue: 12,
  },
  endings: {
    type: 'number',
    label: 'Unique Endings',
    min: 2, max: 6,
    defaultValue: 3,
  },
  complexity: {
    type: 'select',
    label: 'Complexity',
    options: ['simple', 'medium', 'complex'],
    defaultValue: 'medium',
  },

  // ── Cinematic Short ───────────────────────────────────────────────────────
  scene_count: {
    type: 'number',
    label: 'Scene Count',
    min: 2, max: 5,
    defaultValue: 3,
  },
  mood: {
    type: 'text',
    label: 'Mood / Tone',
    placeholder: 'melancholic, triumphant, eerie…',
  },
};

export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'];

export const CAT_ICONS = {
  painting:     '🖌',
  sculpture:    '🗿',
  photography:  '📷',
  digital:      '💾',
  surreal:      '🌀',
  material:     '🪨',
  period:       '🏛',
  illustration: '✏️',
  experimental: '🧪',
};
