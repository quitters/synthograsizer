/**
 * Effect Factory
 * Creates effect modules from existing effect implementations
 */

import { EffectModule } from './effect-module.js';
import { registerAdvancedFilterEffects } from './advanced-effects-registry.js';

// Import existing effects
import { DirectionEffects } from '../../effects/destructive/direction-effects.js';
import { SpiralEffects } from '../../effects/destructive/spiral-effects.js';
import { SliceEffects } from '../../effects/destructive/slice-effects.js';
import { PixelSortEffects } from '../../effects/destructive/pixel-sort-effects.js';
import { ColorEffects } from '../../effects/destructive/color-effects.js';

export class EffectFactory {
  constructor() {
    // Registry of available effects
    this.effectRegistry = new Map();
    
    // Register all built-in effects
    this.registerBuiltInEffects();
  }

  /**
   * Register all built-in effects
   */
  registerBuiltInEffects() {
    // Direction Effects
    this.registerEffect({
      id: 'direction-movement',
      name: 'Direction Movement',
      type: 'movement',
      category: 'Movement',
      icon: '🧭',
      defaultMode: 'destructive',
      defaultParameters: {
        direction: 'down',
        speed: 2,
        selectionAware: true,
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        direction: {
          type: 'select',
          options: ['down', 'up', 'right', 'left', 'random', 'jitter'],
          label: 'Direction'
        },
        speed: {
          type: 'range',
          min: 1,
          max: 5,
          step: 1,
          label: 'Speed'
        },
        selectionAware: {
          type: 'checkbox',
          label: 'Selection Aware'
        }
      },
      processFunction: (imageData, params, selectionMask) => {
        // Create a clump for the effect
        const clump = {
          x: 0,
          y: 0,
          w: imageData.width,
          h: imageData.height,
          clumpDirection: params.direction
        };
        
        DirectionEffects.applyDirectionShift(
          imageData,
          clump,
          params.speed,
          params.direction,
          params.selectionAware ? selectionMask : null
        );
      }
    });

    // Spiral Effects
    this.registerEffect({
      id: 'spiral-distortion',
      name: 'Spiral Distortion',
      type: 'distortion',
      category: 'Distort',
      icon: '🌀',
      defaultMode: 'destructive',
      defaultParameters: {
        type: 'spiral',
        strength: 0.06,
        direction: 'cw',
        selectionAware: true,
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        type: {
          type: 'select',
          options: ['spiral', 'insideOut', 'outsideIn', 'random', 'cw', 'ccw'],
          label: 'Type'
        },
        strength: {
          type: 'range',
          min: 0.01,
          max: 0.15,
          step: 0.01,
          label: 'Strength'
        },
        direction: {
          type: 'select',
          options: ['cw', 'ccw'],
          label: 'Direction'
        },
        selectionAware: {
          type: 'checkbox',
          label: 'Selection Aware'
        }
      },
      processFunction: (imageData, params, selectionMask) => {
        const clump = {
          x: 0,
          y: 0,
          w: imageData.width,
          h: imageData.height
        };
        
        SpiralEffects.applySwirlEffect(
          imageData,
          clump,
          params.strength,
          params.type,
          params.direction,
          params.selectionAware ? selectionMask : null
        );
      }
    });

    // Slice Effects
    this.registerEffect({
      id: 'slice-glitch',
      name: 'Slice Glitch',
      type: 'distortion',
      category: 'Distort',
      icon: '✂️',
      defaultMode: 'destructive',
      defaultParameters: {
        mode: 'horizontal',
        offset: 20,
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        mode: {
          type: 'select',
          options: ['horizontal', 'vertical', 'both'],
          label: 'Mode'
        },
        offset: {
          type: 'range',
          min: 0,
          max: 50,
          step: 1,
          label: 'Color Offset'
        }
      },
      processFunction: (imageData, params) => {
        SliceEffects.applySliceGlitch(imageData, params.mode, params.offset);
      }
    });

    // Pixel Sort Effects
    this.registerEffect({
      id: 'pixel-sort',
      name: 'Pixel Sort',
      type: 'distortion',
      category: 'Distort',
      icon: '🔀',
      defaultMode: 'destructive',
      defaultParameters: {
        mode: 'columnBrightness',
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        mode: {
          type: 'select',
          options: [
            'columnBrightness',
            'rowBrightness',
            'columnHue',
            'rowHue',
            'randomLines',
            'diagonal',
            'circular',
            'wave'
          ],
          label: 'Sort Mode'
        }
      },
      processFunction: (imageData, params) => {
        PixelSortEffects.applyPixelSort(imageData, params.mode);
      }
    });

    // Color Effects
    this.registerColorEffects();
    
    // Filter Effects
    this.registerFilterEffects();
  }

  /**
   * Register color effects
   */
  registerColorEffects() {
    const colorEffectTypes = [
      { id: 'chromatic-aberration', name: 'Chromatic Aberration', icon: '📺' },
      { id: 'hue-shift', name: 'Hue Shift', icon: '🌈' },
      { id: 'saturation-boost', name: 'Saturation Boost', icon: '💎' },
      { id: 'color-invert', name: 'Color Invert', icon: '🔄' },
      { id: 'vintage', name: 'Vintage', icon: '📸' },
      { id: 'color-noise', name: 'Color Noise', icon: '🎆' }
    ];

    colorEffectTypes.forEach(effectType => {
      this.registerEffect({
        id: effectType.id,
        name: effectType.name,
        type: 'color',
        category: 'Color',
        icon: effectType.icon,
        defaultMode: 'destructive',
        defaultParameters: {
          intensity: 50,
          opacity: 1.0,
          blendMode: 'normal'
        },
        parameterConfig: {
          intensity: {
            type: 'range',
            min: 0,
            max: 100,
            step: 1,
            label: 'Intensity'
          }
        },
        processFunction: (imageData, params) => {
          const newData = ColorEffects.applyColorEffect(
            imageData,
            effectType.id.replace('-', ''),
            params.intensity
          );
          if (newData && newData !== imageData.data) {
            imageData.data.set(newData);
          }
        }
      });
    });
  }

  /**
   * Register filter effects (placeholder - these will need the FilterEffects instance)
   */
  registerFilterEffects() {
    // These will be registered dynamically when the app initializes
    // since they need access to the FilterEffects instance
  }

  /**
   * Register a new effect configuration
   */
  registerEffect(config) {
    this.effectRegistry.set(config.id, config);
  }

  /**
   * Create an effect module instance
   */
  createEffect(effectId, customParams = {}) {
    const config = this.effectRegistry.get(effectId);
    if (!config) {
      throw new Error(`Effect '${effectId}' not found in registry`);
    }
    
    // Merge custom parameters with defaults
    const parameters = {
      ...config.defaultParameters,
      ...customParams
    };
    
    return new EffectModule({
      ...config,
      defaultParameters: parameters
    });
  }

  /**
   * Get all available effects
   */
  getAvailableEffects() {
    const effects = [];
    this.effectRegistry.forEach((config, id) => {
      effects.push({
        id,
        name: config.name,
        type: config.type,
        category: config.category,
        icon: config.icon
      });
    });
    return effects;
  }

  /**
   * Get effects by category
   */
  getEffectsByCategory(category) {
    const effects = [];
    this.effectRegistry.forEach((config, id) => {
      if (config.category === category) {
        effects.push({
          id,
          name: config.name,
          type: config.type,
          icon: config.icon
        });
      }
    });
    return effects;
  }

  /**
   * Get effect configuration
   */
  getEffectConfig(effectId) {
    return this.effectRegistry.get(effectId);
  }

  /**
   * Register filter effects with app instance
   */
  registerFilterEffectsWithApp(filterEffectsInstance) {
    // Register basic filter effects first
    this.registerBasicFilterEffects(filterEffectsInstance);
    
    // Register all advanced filter effects
    registerAdvancedFilterEffects(this, filterEffectsInstance);
    
    console.log('✅ All filter effects registered with Studio Mode');
    console.log('📊 Studio Mode now has complete feature parity with Classic Mode');
  }

  /**
   * Register basic filter effects (moved from previous implementation)
   */
  registerBasicFilterEffects(filterEffectsInstance) {
    // Pop Art Filter
    this.registerEffect({
      id: 'pop-art-filter',
      name: 'Pop Art',
      type: 'filter',
      category: 'Filters',
      icon: '🎭',
      defaultMode: 'non-destructive',
      defaultParameters: {
        style: 'warhol',
        intensity: 50,
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        style: {
          type: 'select',
          options: ['warhol', 'lichtenstein', 'neon', 'psychedelic'],
          label: 'Style'
        },
        intensity: {
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          label: 'Intensity'
        }
      },
      processFunction: (imageData, params) => {
        const options = { style: params.style };
        const result = filterEffectsInstance.constructor.apply(
          imageData,
          'popArt',
          params.intensity,
          options
        );
        if (result !== imageData) {
          imageData.data.set(result.data);
        }
      }
    });

    // Vintage Filter
    this.registerEffect({
      id: 'vintage-filter',
      name: 'Vintage Film',
      type: 'filter',
      category: 'Filters',
      icon: '📽️',
      defaultMode: 'non-destructive',
      defaultParameters: {
        filmType: 'polaroid',
        grainAmount: 30,
        intensity: 50,
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        filmType: {
          type: 'select',
          options: ['polaroid', 'kodachrome', 'faded', 'sepia'],
          label: 'Film Type'
        },
        grainAmount: {
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          label: 'Film Grain'
        },
        intensity: {
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          label: 'Intensity'
        }
      },
      processFunction: (imageData, params) => {
        const options = { 
          filmType: params.filmType,
          grainAmount: params.grainAmount
        };
        const result = filterEffectsInstance.constructor.apply(
          imageData,
          'vintage',
          params.intensity,
          options
        );
        if (result !== imageData) {
          imageData.data.set(result.data);
        }
      }
    });

    // Emboss Filter
    this.registerEffect({
      id: 'emboss-filter',
      name: 'Emboss',
      type: 'filter',
      category: 'Filters',
      icon: '🔨',
      defaultMode: 'non-destructive',
      defaultParameters: {
        intensity: 50,
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        intensity: {
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          label: 'Intensity'
        }
      },
      processFunction: (imageData, params) => {
        const result = filterEffectsInstance.constructor.apply(
          imageData,
          'emboss',
          params.intensity,
          {}
        );
        if (result !== imageData) {
          imageData.data.set(result.data);
        }
      }
    });

    // Edge Detection Filter
    this.registerEffect({
      id: 'edge-detect-filter',
      name: 'Edge Detection',
      type: 'filter',
      category: 'Filters',
      icon: '📐',
      defaultMode: 'non-destructive',
      defaultParameters: {
        intensity: 50,
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        intensity: {
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          label: 'Intensity'
        }
      },
      processFunction: (imageData, params) => {
        const result = filterEffectsInstance.constructor.apply(
          imageData,
          'edgeDetect',
          params.intensity,
          {}
        );
        if (result !== imageData) {
          imageData.data.set(result.data);
        }
      }
    });

    // Motion Blur Filter
    this.registerEffect({
      id: 'motion-blur-filter',
      name: 'Motion Blur',
      type: 'filter',
      category: 'Filters',
      icon: '💨',
      defaultMode: 'non-destructive',
      defaultParameters: {
        direction: 'horizontal',
        intensity: 50,
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        direction: {
          type: 'select',
          options: ['horizontal', 'vertical', 'diagonal'],
          label: 'Direction'
        },
        intensity: {
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          label: 'Intensity'
        }
      },
      processFunction: (imageData, params) => {
        const options = { direction: params.direction };
        const result = filterEffectsInstance.constructor.apply(
          imageData,
          'motionBlur',
          params.intensity,
          options
        );
        if (result !== imageData) {
          imageData.data.set(result.data);
        }
      }
    });

    // Vignette Filter
    this.registerEffect({
      id: 'vignette-filter',
      name: 'Vignette',
      type: 'filter',
      category: 'Filters',
      icon: '🌑',
      defaultMode: 'non-destructive',
      defaultParameters: {
        intensity: 50,
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        intensity: {
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          label: 'Intensity'
        }
      },
      processFunction: (imageData, params) => {
        const result = filterEffectsInstance.constructor.apply(
          imageData,
          'vignette',
          params.intensity,
          {}
        );
        if (result !== imageData) {
          imageData.data.set(result.data);
        }
      }
    });

    // Halftone Filter
    this.registerEffect({
      id: 'halftone-filter',
      name: 'Halftone',
      type: 'filter',
      category: 'Filters',
      icon: '🔵',
      defaultMode: 'non-destructive',
      defaultParameters: {
        pattern: 'circle',
        dotSize: 4,
        intensity: 50,
        opacity: 1.0,
        blendMode: 'normal'
      },
      parameterConfig: {
        pattern: {
          type: 'select',
          options: ['circle', 'square', 'diamond', 'lines'],
          label: 'Pattern'
        },
        dotSize: {
          type: 'range',
          min: 2,
          max: 20,
          step: 1,
          label: 'Dot Size'
        },
        intensity: {
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          label: 'Intensity'
        }
      },
      processFunction: (imageData, params) => {
        const options = { 
          pattern: params.pattern,
          dotSize: params.dotSize
        };
        const result = filterEffectsInstance.constructor.apply(
          imageData,
          'halftone',
          params.intensity,
          options
        );
        if (result !== imageData) {
          imageData.data.set(result.data);
        }
      }
    });

    // Add more basic filter effects here...
  }
}