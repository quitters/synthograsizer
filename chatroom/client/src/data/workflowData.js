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
