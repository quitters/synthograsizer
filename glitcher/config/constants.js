/**
 * Application Constants and Configuration
 * Centralized configuration for the Glitcher App
 */

export const CANVAS_CONFIG = {
  TARGET_PIXELS: 1048576,    // 1MP target resolution
  MAX_PIXELS: 2097152,       // 2MP maximum resolution
  BASE_UNIT: 64,             // Base unit for dimension calculations
  MAX_ASPECT_ERROR: 0.20     // 20% tolerance for aspect ratio
};

export const PERFORMANCE_CONFIG = {
  TARGET_FRAME_RATE: 60,     // Target FPS for animation
  FILTER_INTERVAL: 5,        // Apply heavy filters every N frames
  MAX_HISTORY_SIZE: 10       // Maximum selection history entries
};

export const EFFECT_DEFAULTS = {
  INTENSITY: 'medium',
  SPEED: 1,
  SWIRL_STRENGTH: 0.06,
  COLOR_OFFSET: 20,
  MIN_LIFETIME: 90,
  MAX_LIFETIME: 150,
  SORT_FREQUENCY: 30,
  COLOR_INTENSITY: 50,
  DATAMOSH_INTENSITY: 10,
  AUDIO_SENSITIVITY: 50,
  BRUSH_SIZE: 30,
  RECORD_DURATION: 5
};

export const SELECTION_DEFAULTS = {
  TARGET_HUE: 180,
  COLOR_TOLERANCE: 30,
  MIN_REGION_SIZE: 100,
  EDGE_THRESHOLD: 30,
  SHAPE_RANDOMNESS: 0.3,
  SHAPE_COUNT: 3,
  SENSITIVITY: 1.0
};

export const COLOR_PALETTES = {
  WARHOL: [
    [[255, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 0]],
    [[0, 255, 0], [255, 165, 0], [138, 43, 226], [255, 20, 147]],
    [[255, 215, 0], [50, 205, 50], [255, 69, 0], [30, 144, 255]],
    [[255, 105, 180], [124, 252, 0], [255, 140, 0], [186, 85, 211]]
  ],
  LICHTENSTEIN: [
    [[255, 0, 0], [255, 255, 0], [0, 0, 255], [0, 0, 0]],
    [[255, 192, 203], [173, 216, 230], [255, 255, 224], [128, 128, 128]]
  ],
  NEON: [
    [[255, 0, 255], [0, 255, 255], [255, 255, 0], [255, 0, 0]],
    [[57, 255, 20], [255, 20, 147], [0, 191, 255], [255, 165, 0]]
  ],
  PSYCHEDELIC: [
    [[255, 0, 255], [255, 255, 0], [0, 255, 0], [255, 0, 0]],
    [[138, 43, 226], [255, 20, 147], [50, 205, 50], [255, 140, 0]]
  ]
};

export const UI_ELEMENTS = {
  CANVAS_ID: 'canvas',
  CANVAS_PLACEHOLDER_ID: 'canvas-placeholder',
  IMAGE_INPUT_ID: 'image-input',
  
  // Control IDs
  DIRECTION_SELECT_ID: 'direction-select',
  SPIRAL_SELECT_ID: 'spiral-select',
  SLICE_SELECT_ID: 'slice-select',
  PIXEL_SORT_SELECT_ID: 'pixel-sort-select',
  INTENSITY_SELECT_ID: 'intensity-select',
  COLOR_EFFECT_SELECT_ID: 'color-effect-select',
  DATAMOSH_SELECT_ID: 'datamosh-select',
  
  // Button IDs
  PLAY_PAUSE_BTN_ID: 'play-pause-btn',
  RESET_BTN_ID: 'reset-btn',
  RANDOMIZE_BTN_ID: 'randomize-btn',
  SNAPSHOT_BTN_ID: 'snapshot-btn',
  RECORD_BTN_ID: 'record-btn'
};

export const BUILT_IN_PRESETS = {
  'vintage-tv': {
    name: 'Vintage TV',
    settings: {
      direction: 'down',
      spiral: 'off',
      slice: 'horizontal',
      pixelSort: 'off',
      colorEffect: 'vintage',
      datamosh: 'scanlines',
      intensity: 'medium',
      speed: 2,
      swirlStrength: 0.03,
      colorOffset: 15,
      colorIntensity: 70,
      datamoshIntensity: 25
    }
  },
  'digital-chaos': {
    name: 'Digital Chaos',
    settings: {
      direction: 'jitter',
      spiral: 'random',
      slice: 'both',
      pixelSort: 'randomLines',
      colorEffect: 'chromaticAberration',
      datamosh: 'randomBytes',
      intensity: 'extraLarge',
      speed: 4,
      swirlStrength: 0.12,
      colorOffset: 35,
      colorIntensity: 80,
      datamoshIntensity: 40
    }
  },
  'rainbow-sort': {
    name: 'Rainbow Sort',
    settings: {
      direction: 'off',
      spiral: 'off',
      slice: 'off',
      pixelSort: 'columnHue',
      colorEffect: 'hueShift',
      datamosh: 'off',
      intensity: 'large',
      speed: 1,
      swirlStrength: 0.06,
      colorOffset: 10,
      colorIntensity: 90,
      datamoshIntensity: 0
    }
  },
  'cyberpunk': {
    name: 'Cyberpunk',
    settings: {
      direction: 'right',
      spiral: 'cw',
      slice: 'vertical',
      pixelSort: 'diagonal',
      colorEffect: 'chromaticAberration',
      datamosh: 'bitShift',
      intensity: 'large',
      speed: 3,
      swirlStrength: 0.08,
      colorOffset: 25,
      colorIntensity: 75,
      datamoshIntensity: 30
    }
  },
  'film-burn': {
    name: 'Film Burn',
    settings: {
      direction: 'up',
      spiral: 'insideOut',
      slice: 'horizontal',
      pixelSort: 'rowBrightness',
      colorEffect: 'vintage',
      datamosh: 'compression',
      intensity: 'medium',
      speed: 2,
      swirlStrength: 0.04,
      colorOffset: 20,
      colorIntensity: 60,
      datamoshIntensity: 20
    }
  }
};
