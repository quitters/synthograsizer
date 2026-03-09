/**
 * Effect Presets Manager
 * Provides quick access to pre-configured effect combinations
 */

export class EffectPresets {
  static presets = {
    'subtle_glitch': {
      name: '✨ Subtle Glitch',
      description: 'Light distortion with vintage feel',
      settings: {
        direction: 'down',
        speed: 1,
        spiral: 'off',
        slice: 'off',
        pixelSort: 'off',
        colorEffect: 'off',
        filterEffect: 'vintage',
        filterIntensity: 30,
        minLifetime: 60,
        maxLifetime: 90
      }
    },
    'aggressive_corruption': {
      name: '💥 Aggressive Corruption',
      description: 'Heavy data corruption effects',
      settings: {
        direction: 'random',
        speed: 5,
        spiral: 'off',
        slice: 'both',
        colorOffset: 30,
        pixelSort: 'randomLines',
        colorEffect: 'chromaticAberration',
        colorIntensity: 80,
        filterEffect: 'off',
        minLifetime: 30,
        maxLifetime: 60
      }
    },
    'vaporwave': {
      name: '🌅 Vaporwave Dreams',
      description: 'Retro-futuristic aesthetic',
      settings: {
        direction: 'off',
        spiral: 'spiral',
        swirlStrength: 0.08,
        spiralDirection: 'cw',
        slice: 'off',
        pixelSort: 'off',
        colorEffect: 'hueShift',
        colorIntensity: 60,
        filterEffect: 'cyberpunk',
        cyberpunkStyle: 'synthwave',
        filterIntensity: 70,
        minLifetime: 90,
        maxLifetime: 150
      }
    },
    'data_mosh': {
      name: '📊 Data Mosh',
      description: 'Digital compression artifacts',
      settings: {
        direction: 'off',
        spiral: 'off',
        slice: 'both',
        colorOffset: 40,
        pixelSort: 'wave',
        colorEffect: 'off',
        filterEffect: 'experimental',
        experimentalStyle: 'data_bend',
        filterIntensity: 60,
        minLifetime: 45,
        maxLifetime: 90
      }
    },
    'cyberpunk_city': {
      name: '🌃 Cyberpunk City',
      description: 'Neon-lit dystopian vibes',
      settings: {
        direction: 'up',
        speed: 2,
        spiral: 'off',
        slice: 'horizontal',
        colorOffset: 15,
        pixelSort: 'off',
        colorEffect: 'chromaticAberration',
        colorIntensity: 50,
        filterEffect: 'cyberpunk',
        cyberpunkStyle: 'neon',
        filterIntensity: 80,
        minLifetime: 60,
        maxLifetime: 120
      }
    },
    'artistic_glitch': {
      name: '🎨 Artistic Glitch',
      description: 'Painterly digital artifacts',
      settings: {
        direction: 'off',
        spiral: 'insideOut',
        swirlStrength: 0.05,
        spiralDirection: 'ccw',
        slice: 'off',
        pixelSort: 'circular',
        colorEffect: 'saturation',
        colorIntensity: 70,
        filterEffect: 'artistic',
        artisticStyle: 'oil_painting',
        filterIntensity: 60,
        minLifetime: 120,
        maxLifetime: 180
      }
    }
  };

  /**
   * Apply a preset to the app
   */
  static applyPreset(app, presetName) {
    const preset = this.presets[presetName];
    if (!preset) {
      console.warn(`Preset "${presetName}" not found`);
      return false;
    }

    console.log(`🎨 Applying preset: ${preset.name}`);
    
    // Apply all settings from preset
    Object.entries(preset.settings).forEach(([key, value]) => {
      switch(key) {
        // Destructive effects
        case 'direction':
          app.testDirection = value;
          this.updateUIControl('direction-select', value);
          break;
        case 'speed':
          app.testSpeed = value;
          this.updateUIControl('speed-range', value);
          this.updateUIValue('speed-value', value);
          break;
        case 'spiral':
          app.testSpiral = value;
          this.updateUIControl('spiral-select', value);
          break;
        case 'swirlStrength':
          app.testSwirlStrength = value;
          this.updateUIControl('swirl-range', value);
          this.updateUIValue('swirl-value', value);
          break;
        case 'spiralDirection':
          app.spiralDirection = value;
          const btn = document.getElementById('spiral-direction-btn');
          if (btn) btn.textContent = value.toUpperCase();
          break;
        case 'slice':
          app.testSlice = value;
          this.updateUIControl('slice-select', value);
          break;
        case 'colorOffset':
          app.testColorOffset = value;
          this.updateUIControl('color-offset-range', value);
          this.updateUIValue('color-offset-value', value);
          break;
        case 'pixelSort':
          app.testPixelSort = value;
          this.updateUIControl('pixel-sort-select', value);
          break;
        case 'colorEffect':
          app.testColorEffect = value;
          this.updateUIControl('color-effect-select', value);
          break;
        case 'colorIntensity':
          app.testColorIntensity = value;
          this.updateUIControl('color-intensity-range', value);
          this.updateUIValue('color-intensity-value', value);
          break;
          
        // Filter effects
        case 'filterEffect':
          app.filterEffect = value;
          this.updateUIControl('filter-effect-select', value);
          app.showFilterControls(value);
          break;
        case 'filterIntensity':
          app.filterIntensity = value;
          this.updateUIControl('filter-intensity-range', value);
          this.updateUIValue('filter-intensity-value', value);
          break;
        case 'cyberpunkStyle':
          app.filterOptions.cyberpunkStyle = value;
          this.updateUIControl('cyberpunk-style', value);
          break;
        case 'artisticStyle':
          app.filterOptions.artisticStyle = value;
          this.updateUIControl('artistic-style', value);
          break;
        case 'experimentalStyle':
          app.filterOptions.experimentalStyle = value;
          this.updateUIControl('experimental-style', value);
          break;
          
        // Timing
        case 'minLifetime':
          app.minLifetime = value;
          this.updateUIControl('min-lifetime', value);
          this.updateUIValue('min-lifetime-value', value);
          break;
        case 'maxLifetime':
          app.maxLifetime = value;
          this.updateUIControl('max-lifetime', value);
          this.updateUIValue('max-lifetime-value', value);
          break;
      }
    });

    // Show notification
    this.showPresetNotification(preset);
    
    return true;
  }

  /**
   * Update UI control value
   */
  static updateUIControl(controlId, value) {
    const control = document.getElementById(controlId);
    if (control) {
      control.value = value;
      // Trigger change event for any listeners
      control.dispatchEvent(new Event('change'));
    }
  }

  /**
   * Update UI display value
   */
  static updateUIValue(valueId, value) {
    const element = document.getElementById(valueId);
    if (element) {
      element.textContent = value;
    }
  }

  /**
   * Show preset applied notification
   */
  static showPresetNotification(preset) {
    // Check if enhanced UI is available
    if (window.glitcherApp && window.glitcherApp.selectionUI && window.glitcherApp.selectionUI.showNotification) {
      window.glitcherApp.selectionUI.showNotification(
        `Preset applied: ${preset.name}`, 
        'success', 
        3000
      );
    } else {
      console.log(`✅ Preset applied: ${preset.name} - ${preset.description}`);
    }
  }

  /**
   * Create preset buttons UI
   */
  static createPresetButtons() {
    const container = document.createElement('div');
    container.className = 'preset-buttons';
    container.innerHTML = `
      <div class="preset-grid">
        ${Object.entries(this.presets).map(([key, preset]) => `
          <button class="preset-button" data-preset="${key}" title="${preset.description}">
            ${preset.name}
          </button>
        `).join('')}
      </div>
      <div class="preset-info">
        <span class="text-small">Click any preset for instant effect combinations</span>
      </div>
    `;
    
    // Add event listeners
    container.querySelectorAll('.preset-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const presetName = e.target.dataset.preset;
        if (window.glitcherApp) {
          this.applyPreset(window.glitcherApp, presetName);
          
          // Add active class
          container.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
        }
      });
    });
    
    return container;
  }
}
