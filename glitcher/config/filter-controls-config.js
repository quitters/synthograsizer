/**
 * Filter Controls Configuration
 * Defines UI controls for all non-destructive filter effects
 */

export const FILTER_CONTROLS = {
  // Classic Filters
  'emboss': {
    controls: [
      { type: 'slider', id: 'emboss-angle', label: 'Light Direction', min: 0, max: 360, default: 45, unit: '°' },
      { type: 'slider', id: 'emboss-depth', label: 'Depth', min: 0.5, max: 3, step: 0.1, default: 1 },
      { type: 'select', id: 'emboss-blend', label: 'Blend Mode', default: 'gray',
        options: [
          { value: 'gray', label: 'Grayscale' },
          { value: 'color', label: 'Color Preserve' },
          { value: 'overlay', label: 'Overlay' }
        ]
      }
    ]
  },
  
  'edgeDetect': {
    controls: [
      { type: 'select', id: 'edge-method', label: 'Detection Method', default: 'sobel',
        options: [
          { value: 'sobel', label: 'Sobel' },
          { value: 'prewitt', label: 'Prewitt' },
          { value: 'roberts', label: 'Roberts Cross' },
          { value: 'laplacian', label: 'Laplacian' }
        ]
      },
      { type: 'slider', id: 'edge-threshold', label: 'Threshold', min: 0, max: 255, default: 50 },
      { type: 'color', id: 'edge-color', label: 'Edge Color', default: '#ffffff' },
      { type: 'select', id: 'edge-background', label: 'Background', default: 'black',
        options: [
          { value: 'black', label: 'Black' },
          { value: 'white', label: 'White' },
          { value: 'original', label: 'Original' },
          { value: 'transparent', label: 'Transparent' }
        ]
      }
    ]
  },
  
  'vignette': {
    controls: [
      { type: 'select', id: 'vignette-shape', label: 'Shape', default: 'circular',
        options: [
          { value: 'circular', label: 'Circular' },
          { value: 'elliptical', label: 'Elliptical' },
          { value: 'square', label: 'Square' }
        ]
      },
      { type: 'slider', id: 'vignette-size', label: 'Size', min: 10, max: 90, default: 50, unit: '%' },
      { type: 'slider', id: 'vignette-softness', label: 'Softness', min: 0, max: 100, default: 50, unit: '%' },
      { type: 'slider', id: 'vignette-x', label: 'Center X', min: 0, max: 100, default: 50, unit: '%' },
      { type: 'slider', id: 'vignette-y', label: 'Center Y', min: 0, max: 100, default: 50, unit: '%' },
      { type: 'color', id: 'vignette-color', label: 'Color', default: '#000000' }
    ]
  },

  'liquify': {
    controls: [
      {
        type: 'select',
        id: 'warpType',
        label: 'Warp Type',
        default: 'push',
        options: [
          { value: 'push',  label: 'Push' },
          { value: 'pull',  label: 'Pull' },
          { value: 'twirl', label: 'Twirl' },
          { value: 'bloat', label: 'Bloat' },
          { value: 'pinch', label: 'Pinch' }
        ]
      },
      {
        type: 'slider',
        id: 'coveragePercent', // Matches the key in filterOptions.liquify
        label: 'Coverage',     // Label for the UI
        min: 25, max: 150, default: 100, unit: '%'
      },
      {
        type: 'slider',
        id: 'strength',        // Matches the key in filterOptions.liquify
        label: 'Strength',       // Label for the UI
        min: 0, max: 100, default: 50, unit: '%'
      }
    ]
  },

  // Cyberpunk Filters
  'cyberpunk-neon': {
    controls: [
      { type: 'slider', id: 'glow-radius', label: 'Glow Radius', min: 1, max: 10, default: 3 }
    ]
  },
  
  'cyberpunk-matrix': {
    controls: [
      { type: 'slider', id: 'digital-noise', label: 'Digital Noise', min: 0, max: 0.5, step: 0.01, default: 0.1 }
    ]
  },
  
  'cyberpunk-synthwave': {
    controls: [
      { type: 'slider', id: 'gradient-strength', label: 'Gradient Strength', min: 0, max: 1, step: 0.1, default: 0.5 }
    ]
  },
  
  'cyberpunk-digital_rain': {
    controls: [
      { type: 'slider', id: 'rain-density', label: 'Rain Density', min: 0.01, max: 0.2, step: 0.01, default: 0.05 }
    ]
  },
  
  'cyberpunk-hologram': {
    controls: [
      { type: 'slider', id: 'flicker-rate', label: 'Flicker Rate', min: 0, max: 0.3, step: 0.01, default: 0.1 }
    ]
  },
  
  'cyberpunk-glitch_scan': {
    controls: [
      { type: 'slider', id: 'scan-speed', label: 'Scan Speed', min: 0.5, max: 3, step: 0.1, default: 1 }
    ]
  },

  // Artistic Filters
  'artistic-oil_painting': {
    controls: [
      { type: 'slider', id: 'brush-size', label: 'Brush Size', min: 3, max: 15, default: 5 },
      { type: 'slider', id: 'stroke-length', label: 'Stroke Length', min: 10, max: 30, default: 15 },
      { type: 'slider', id: 'texture-strength', label: 'Texture', min: 0, max: 1, step: 0.1, default: 0.3 },
      { type: 'slider', id: 'color-smearing', label: 'Color Smearing', min: 0, max: 1, step: 0.1, default: 0.5 }
    ]
  },
  
  'artistic-watercolor': {
    controls: [
      { type: 'slider', id: 'bleed-amount', label: 'Bleed Amount', min: 0, max: 1, step: 0.1, default: 0.5 },
      { type: 'slider', id: 'pigment-density', label: 'Pigment Density', min: 0, max: 1, step: 0.1, default: 0.6 },
      { type: 'slider', id: 'edge-darkening', label: 'Edge Darkening', min: 0, max: 1, step: 0.1, default: 0.3 },
      { type: 'slider', id: 'paper-texture', label: 'Paper Texture', min: 0, max: 0.5, step: 0.05, default: 0.1 }
    ]
  },
  
  'artistic-pencil_sketch': {
    controls: [
      { type: 'slider', id: 'stroke-width', label: 'Stroke Width', min: 1, max: 3, default: 1 },
      { type: 'slider', id: 'hatch-density', label: 'Hatch Density', min: 0, max: 1, step: 0.1, default: 0.3 },
      { type: 'slider', id: 'sketch-edge-threshold', label: 'Edge Threshold', min: 20, max: 100, default: 50 },
      { type: 'slider', id: 'graphite-shading', label: 'Graphite Shading', min: 0, max: 1, step: 0.1, default: 0.5 }
    ]
  },
  
  'artistic-mosaic': {
    controls: [
      { type: 'slider', id: 'tile-size', label: 'Tile Size', min: 5, max: 30, default: 10 },
      { type: 'slider', id: 'grout-thickness', label: 'Grout Thickness', min: 0, max: 3, default: 1 },
      { type: 'slider', id: 'colorVariation', label: 'Color Variation', min: 0, max: 100, step: 1, default: 30 },
      { type: 'color', id: 'groutColor', label: 'Grout Color', default: '#CCCCCC' }
    ]
  },
  
  'artistic-stained_glass': {
    controls: [
      { type: 'slider', id: 'cell-size', label: 'Cell Size', min: 10, max: 50, default: 20 },
      { type: 'slider', id: 'border-thickness', label: 'Border Thickness', min: 1, max: 5, default: 2 },
      { type: 'color', id: 'border-color', label: 'Border Color', default: '#0a0a0a' },
      { type: 'slider', id: 'light-refraction', label: 'Light Refraction', min: 0, max: 0.5, step: 0.05, default: 0.1 }
    ]
  },
  
  'artistic-comic_book': {
    controls: [
      { type: 'slider', id: 'ink-outline-strength', label: 'Ink Outline', min: 0, max: 1, step: 0.1, default: 0.7 },
      { type: 'slider', id: 'color-levels', label: 'Color Levels', min: 2, max: 8, default: 4 },
      { type: 'slider', id: 'halftone-dot-size', label: 'Halftone Dots', min: 0, max: 10, default: 0 },
      { type: 'slider', id: 'comic-edge-threshold', label: 'Edge Threshold', min: 30, max: 100, default: 60 }
    ]
  },
  
  'artistic-crosshatch': {
    controls: [
      { type: 'slider', id: 'line-spacing', label: 'Line Spacing', min: 3, max: 15, default: 6 },
      { type: 'slider', id: 'line-thickness', label: 'Line Thickness', min: 1, max: 3, default: 1 },
      { type: 'slider', id: 'angle-variation', label: 'Angle Variation', min: 0, max: 0.3, step: 0.05, default: 0.1 },
      { type: 'slider', id: 'hatch-darkness', label: 'Hatch Darkness', min: 0, max: 1, step: 0.1, default: 0.7 },
      { type: 'slider', id: 'background-lightness', label: 'Background', min: 0.8, max: 1, step: 0.05, default: 0.95 }
    ]
  },
  
  'artistic-pointillism': {
    controls: [
      { type: 'slider', id: 'dot-size', label: 'Dot Size', min: 2, max: 10, default: 4 },
      { type: 'slider', id: 'density', label: 'Density', min: 0.1, max: 1, step: 0.1, default: 0.6 },
      { type: 'slider', id: 'pointillism-color-variation', label: 'Color Variation', min: 0, max: 0.5, step: 0.05, default: 0.2 },
      { type: 'select', id: 'dot-shape', label: 'Dot Shape', default: 'circle',
        options: [
          { value: 'circle', label: 'Circle' },
          { value: 'square', label: 'Square' }
        ]
      },
      { type: 'slider', id: 'background-brightness', label: 'Background', min: 0.8, max: 1, step: 0.05, default: 0.95 }
    ]
  },

  // Atmospheric Filters
  'atmospheric-fog': {
    controls: [
      { type: 'slider', id: 'fog-density', label: 'Fog Density', min: 0.1, max: 0.8, step: 0.1, default: 0.3 },
      { type: 'color', id: 'fog-color', label: 'Fog Color', default: '#c8c8dc' }
    ]
  },
  
  'atmospheric-rain': {
    controls: [
      { type: 'slider', id: 'rain-density', label: 'Rain Density', min: 0.05, max: 0.3, step: 0.05, default: 0.1 },
      { type: 'slider', id: 'rain-length', label: 'Rain Length', min: 10, max: 40, default: 20 }
    ]
  },
  
  'atmospheric-snow': {
    controls: [
      { type: 'slider', id: 'snow-density', label: 'Snow Density', min: 0.02, max: 0.1, step: 0.01, default: 0.05 },
      { type: 'slider', id: 'snow-size', label: 'Snow Size', min: 1, max: 4, default: 2 }
    ]
  },
  
  'atmospheric-dust': {
    controls: [
      { type: 'slider', id: 'dust-density', label: 'Dust Density', min: 0.01, max: 0.05, step: 0.01, default: 0.02 },
      { type: 'color', id: 'dust-color', label: 'Dust Color', default: '#b4a078' }
    ]
  },
  
  'atmospheric-heat_haze': {
    controls: [
      { type: 'slider', id: 'distortion-strength', label: 'Distortion', min: 1, max: 5, default: 2 }
    ]
  },
  
  'atmospheric-underwater': {
    controls: [
      { type: 'slider', id: 'bubble-density', label: 'Bubble Density', min: 0, max: 0.03, step: 0.005, default: 0.01 },
      { type: 'slider', id: 'wave-strength', label: 'Wave Strength', min: 1, max: 5, default: 3 }
    ]
  },
  
  'atmospheric-aurora': {
    controls: []  // No parameters in current implementation
  },
  
  'atmospheric-lightning': {
    controls: [
      { type: 'slider', id: 'lightning-chance', label: 'Lightning Chance', min: 0, max: 0.3, step: 0.05, default: 0.1 }
    ]
  },

  // Experimental Filters
  'experimental-kaleidoscope': {
    controls: [
      { type: 'slider', id: 'segments', label: 'Segments', min: 3, max: 12, default: 6 }
    ]
  },
  
  'experimental-fractal': {
    controls: [
      { type: 'slider', id: 'iterations', label: 'Iterations', min: 3, max: 10, default: 5 },
      { type: 'slider', id: 'zoom', label: 'Zoom', min: 0.5, max: 3, step: 0.1, default: 1 }
    ]
  },
  
  'experimental-tunnel': {
    controls: [
      { type: 'slider', id: 'tunnel-speed', label: 'Tunnel Speed', min: 0.5, max: 3, step: 0.1, default: 1 }
    ]
  },
  
  'experimental-warp': {
    controls: [
      { type: 'slider', id: 'warp-strength', label: 'Warp Strength', min: 10, max: 50, default: 20 }
    ]
  },
  
  'experimental-chromatic_shift': {
    controls: [
      { type: 'slider', id: 'shift-amount', label: 'Shift Amount', min: 5, max: 20, default: 10 }
    ]
  },
  
  'experimental-data_bend': {
    controls: [
      { type: 'slider', id: 'bend-strength', label: 'Bend Strength', min: 0.05, max: 0.3, step: 0.05, default: 0.1 }
    ]
  },
  
  'experimental-mirror_world': {
    controls: [
      { type: 'select', id: 'mirror-type', label: 'Mirror Type', default: 'quad',
        options: [
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'vertical', label: 'Vertical' },
          { value: 'quad', label: 'Quad' },
          { value: 'radial', label: 'Radial' }
        ]
      }
    ]
  },
  
  'experimental-reality_glitch': {
    controls: [
      { type: 'slider', id: 'glitch-density', label: 'Glitch Density', min: 0.02, max: 0.1, step: 0.01, default: 0.05 }
    ]
  }
};

/**
 * Get control configuration for a filter
 * @param {string} filterType - The filter type (e.g., 'emboss', 'cyberpunk-neon')
 * @returns {Object|null} Control configuration or null if not found
 */
export function getFilterControlConfig(filterType) {
  return FILTER_CONTROLS[filterType] || null;
}

/**
 * Get all filter types that have controls defined
 * @returns {string[]} Array of filter types
 */
export function getAllFilterTypes() {
  return Object.keys(FILTER_CONTROLS);
}
