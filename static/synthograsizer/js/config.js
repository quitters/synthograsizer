// Configuration for Synthograsizer Mini
export const DEFAULT_CONFIG = {
  maxKnobs: 35, // Support more variables for flexibility
  outputMaxLength: 1000,
  
  // 8-color palette matching CSS variables and text-renderer
  colorPalette: [
    '#3b82f6', // Blue
    '#f59e0b', // Yellow
    '#f97316', // Orange
    '#ec4899', // Pink
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#ef4444', // Red
    '#10b981', // Green
  ],
  
  rotation: {
    min: 0,
    max: 270,
    snapThreshold: 5 // degrees
  },
  
  // Default template loaded on first visit (svg-flow-particles)
  fallbackTemplate: {
    promptTemplate: "A generative flow field artwork with {{particle_density}} particle density flowing with {{flow_energy}} energy. Particles leave {{trail_length}} {{trail_style}} trails at {{trail_opacity}} opacity, guided by {{noise_texture}} noise patterns. Rendered in a {{color_palette}} color palette with {{color_shift}} color shifting. {{wave_pattern}} wave patterns are layered beneath the particles. The composition features {{grain_texture}} film grain, {{symmetry_mode}} symmetry, and {{distortion}} distortion effects, presented in a {{frame_style}} frame.",
    variables: [
      {
        name: "particle_density",
        values: [
          { text: "sparse" }, { text: "light" }, { text: "moderate" },
          { text: "dense" }, { text: "swarm" }, { text: "overwhelming" }
        ]
      },
      {
        name: "flow_energy",
        values: [
          { text: "still" }, { text: "gentle" }, { text: "moderate" },
          { text: "energetic" }, { text: "turbulent" }, { text: "chaotic" }
        ]
      },
      {
        name: "trail_length",
        values: [
          { text: "dots" }, { text: "short" }, { text: "medium" },
          { text: "flowing" }, { text: "ribbons" }, { text: "streams" }
        ]
      },
      {
        name: "trail_style",
        values: [
          { text: "linear" }, { text: "smooth" }, { text: "mixed" }
        ]
      },
      {
        name: "trail_opacity",
        values: [
          { text: "faint" }, { text: "subtle" }, { text: "medium" },
          { text: "visible" }, { text: "bright" }, { text: "vivid" }
        ]
      },
      {
        name: "noise_texture",
        values: [
          { text: "smooth" }, { text: "rolling" }, { text: "organic" },
          { text: "complex" }, { text: "turbulent" }, { text: "fractured" }
        ]
      },
      {
        name: "color_palette",
        values: [
          { text: "warm sunset" }, { text: "cool ocean" }, { text: "earth tones" },
          { text: "neon vivid" }, { text: "pastels" }, { text: "monochrome" }
        ]
      },
      {
        name: "color_shift",
        values: [
          { text: "none" }, { text: "subtle" }, { text: "moderate" }, { text: "dramatic" }
        ]
      },
      {
        name: "wave_pattern",
        values: [
          { text: "none" }, { text: "subtle" }, { text: "gentle" },
          { text: "rhythmic" }, { text: "bold" }, { text: "intense" }
        ]
      },
      {
        name: "grain_texture",
        values: [
          { text: "none" }, { text: "whisper" }, { text: "light" },
          { text: "medium" }, { text: "heavy" }, { text: "gritty" }
        ]
      },
      {
        name: "symmetry_mode",
        values: [
          { text: "none" }, { text: "bilateral" }, { text: "quadrilateral" },
          { text: "radial" }, { text: "kaleidoscope" }, { text: "snowflake" }
        ]
      },
      {
        name: "distortion",
        values: [
          { text: "none" }, { text: "subtle" }, { text: "gentle" },
          { text: "warped" }, { text: "melting" }, { text: "liquid" }
        ]
      },
      {
        name: "frame_style",
        values: [
          { text: "none" }, { text: "thin" }, { text: "classic" },
          { text: "matted" }, { text: "ornate" }, { text: "gallery" }
        ]
      }
    ]
  }
};

export const ERROR_MESSAGES = {
  TEMPLATE_LOAD_FAILED: 'Failed to load template. Using fallback.',
  TEMPLATE_INVALID: 'Template structure is invalid. Please check the JSON format.',
  TOO_MANY_VARIABLES: 'Template has too many variables. Maximum is 35.',
  EXPORT_FAILED: 'Failed to export prompt. Please try again.',
  IMPORT_FAILED: 'Failed to import template. Please check the JSON format.'
};
