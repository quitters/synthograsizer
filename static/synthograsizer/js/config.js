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
  
  // Fallback template if import fails
  fallbackTemplate: {
    promptTemplate: "A {{style}} illustration of {{subject}} in {{mood}} lighting.",
    variables: [
      {
        name: "style",
        feature_name: "Style",
        values: [
          { text: "minimalist", weight: 3 },
          { text: "detailed", weight: 3 },
          { text: "abstract", weight: 2 },
          { text: "photorealistic", weight: 3 },
          { text: "watercolor", weight: 2 },
          { text: "digital", weight: 3 }
        ]
      },
      {
        name: "subject",
        feature_name: "Subject",
        values: [
          { text: "a mountain landscape", weight: 3 },
          { text: "a city skyline", weight: 3 },
          { text: "an ocean sunset", weight: 3 },
          { text: "a forest path", weight: 2 },
          { text: "a desert canyon", weight: 2 },
          { text: "a winter scene", weight: 1 }
        ]
      },
      {
        name: "mood",
        feature_name: "Mood",
        values: [
          { text: "warm golden hour", weight: 3 },
          { text: "cool twilight", weight: 3 },
          { text: "dramatic stormy", weight: 2 },
          { text: "soft morning", weight: 3 },
          { text: "vibrant midday", weight: 2 },
          { text: "moody evening", weight: 1 }
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
