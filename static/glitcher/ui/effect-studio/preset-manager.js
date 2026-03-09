/**
 * Preset Manager
 * Handles saving, loading, and managing effect chain presets
 */
export class PresetManager {
  constructor() {
    this.presets = this.loadPresetsFromStorage();
    this.defaultPresets = this.createDefaultPresets();
  }

  createDefaultPresets() {
    return {
      'Classic Glitch': {
        name: 'Classic Glitch',
        description: 'Traditional glitch art effects',
        version: '1.0',
        chain: [
          {
            type: 'direction',
            mode: 'destructive',
            enabled: true,
            parameters: {
              direction: 'down',
              speed: 3,
              selectionAware: true
            }
          },
          {
            type: 'slice',
            mode: 'destructive',
            enabled: true,
            parameters: {
              mode: 'horizontal',
              offset: 20
            }
          }
        ]
      },
      'Psychedelic': {
        name: 'Psychedelic',
        description: 'Trippy color effects',
        version: '1.0',
        chain: [
          {
            type: 'spiral',
            mode: 'non-destructive',
            enabled: true,
            parameters: {
              type: 'spiral',
              strength: 0.08,
              opacity: 0.7,
              blendMode: 'overlay'
            }
          },
          {
            type: 'color',
            mode: 'non-destructive',
            enabled: true,
            parameters: {
              effect: 'hue-shift',
              intensity: 0.8,
              opacity: 0.6,
              blendMode: 'screen'
            }
          }
        ]
      },
      'Datamosh': {
        name: 'Datamosh',
        description: 'Digital compression artifacts',
        version: '1.0',
        chain: [
          {
            type: 'pixel-sort',
            mode: 'destructive',
            enabled: true,
            parameters: {
              method: 'column-brightness',
              threshold: 0.3
            }
          },
          {
            type: 'slice',
            mode: 'destructive',
            enabled: true,
            parameters: {
              mode: 'both',
              offset: 30
            }
          },
          {
            type: 'color',
            mode: 'non-destructive',
            enabled: true,
            parameters: {
              effect: 'chromatic-aberration',
              intensity: 0.5,
              opacity: 0.8,
              blendMode: 'normal'
            }
          }
        ]
      },
      'Retro VHS': {
        name: 'Retro VHS',
        description: 'VHS tape degradation effects',
        version: '1.0',
        chain: [
          {
            type: 'filter',
            mode: 'non-destructive',
            enabled: true,
            parameters: {
              filter: 'vintage-film',
              style: 'vhs',
              grain: 0.4,
              opacity: 0.9,
              blendMode: 'normal'
            }
          },
          {
            type: 'slice',
            mode: 'destructive',
            enabled: true,
            parameters: {
              mode: 'horizontal',
              offset: 15
            }
          },
          {
            type: 'color',
            mode: 'non-destructive',
            enabled: true,
            parameters: {
              effect: 'color-noise',
              intensity: 0.3,
              opacity: 0.5,
              blendMode: 'screen'
            }
          }
        ]
      }
    };
  }

  savePreset(name, effectChain, options = {}) {
    const preset = {
      name: name,
      description: options.description || '',
      version: '1.0',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      author: options.author || 'User',
      tags: options.tags || [],
      thumbnail: options.thumbnail || null,
      chain: effectChain.map(effect => ({
        type: effect.type,
        name: effect.name,
        mode: effect.mode,
        enabled: effect.enabled,
        parameters: { ...effect.parameters }
      }))
    };
    
    this.presets[name] = preset;
    this.savePresetsToStorage();
    
    // Notify listeners
    const event = new CustomEvent('presetSaved', { 
      detail: { preset } 
    });
    document.dispatchEvent(event);
    
    return preset;
  }

  loadPreset(name) {
    const preset = this.presets[name] || this.defaultPresets[name];
    if (!preset) {
      console.warn(`Preset "${name}" not found`);
      return null;
    }
    
    // Update modified time when loading
    if (this.presets[name]) {
      this.presets[name].lastUsed = new Date().toISOString();
      this.savePresetsToStorage();
    }
    
    return preset;
  }

  deletePreset(name) {
    if (this.defaultPresets[name]) {
      console.warn('Cannot delete default presets');
      return false;
    }
    
    if (this.presets[name]) {
      delete this.presets[name];
      this.savePresetsToStorage();
      
      // Notify listeners
      const event = new CustomEvent('presetDeleted', { 
        detail: { name } 
      });
      document.dispatchEvent(event);
      
      return true;
    }
    
    return false;
  }

  renamePreset(oldName, newName) {
    if (this.defaultPresets[oldName]) {
      console.warn('Cannot rename default presets');
      return false;
    }
    
    if (this.presets[oldName] && !this.presets[newName]) {
      this.presets[newName] = this.presets[oldName];
      this.presets[newName].name = newName;
      this.presets[newName].modified = new Date().toISOString();
      delete this.presets[oldName];
      this.savePresetsToStorage();
      
      return true;
    }
    
    return false;
  }

  getAllPresets() {
    // Combine user and default presets
    const allPresets = {
      ...this.defaultPresets,
      ...this.presets
    };
    
    // Sort by last used, then by name
    return Object.values(allPresets).sort((a, b) => {
      if (a.lastUsed && b.lastUsed) {
        return new Date(b.lastUsed) - new Date(a.lastUsed);
      }
      return a.name.localeCompare(b.name);
    });
  }

  getUserPresets() {
    return Object.values(this.presets);
  }

  getDefaultPresets() {
    return Object.values(this.defaultPresets);
  }

  exportPreset(name) {
    const preset = this.presets[name] || this.defaultPresets[name];
    if (!preset) return;
    
    const exportData = {
      ...preset,
      exported: new Date().toISOString(),
      application: 'Glitcher Effects Studio',
      version: '1.0'
    };
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}_preset.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  async importPreset(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const preset = JSON.parse(e.target.result);
          
          // Validate preset structure
          if (!this.validatePreset(preset)) {
            throw new Error('Invalid preset format');
          }
          
          // Handle name conflicts
          let name = preset.name;
          let counter = 1;
          while (this.presets[name] || this.defaultPresets[name]) {
            name = `${preset.name} (${counter})`;
            counter++;
          }
          
          preset.name = name;
          preset.imported = new Date().toISOString();
          
          this.presets[name] = preset;
          this.savePresetsToStorage();
          
          // Notify listeners
          const event = new CustomEvent('presetImported', { 
            detail: { preset } 
          });
          document.dispatchEvent(event);
          
          resolve(preset);
        } catch (error) {
          console.error('Error importing preset:', error);
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  }

  validatePreset(preset) {
    // Check required fields
    if (!preset.name || !preset.chain || !Array.isArray(preset.chain)) {
      return false;
    }
    
    // Validate each effect in the chain
    for (const effect of preset.chain) {
      if (!effect.type || !effect.parameters) {
        return false;
      }
    }
    
    return true;
  }

  searchPresets(query) {
    const searchTerm = query.toLowerCase();
    const allPresets = this.getAllPresets();
    
    return allPresets.filter(preset => 
      preset.name.toLowerCase().includes(searchTerm) ||
      preset.description?.toLowerCase().includes(searchTerm) ||
      preset.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
    );
  }

  getPresetsByTag(tag) {
    const allPresets = this.getAllPresets();
    return allPresets.filter(preset => preset.tags?.includes(tag));
  }

  addTagToPreset(presetName, tag) {
    const preset = this.presets[presetName];
    if (preset) {
      if (!preset.tags) preset.tags = [];
      if (!preset.tags.includes(tag)) {
        preset.tags.push(tag);
        preset.modified = new Date().toISOString();
        this.savePresetsToStorage();
      }
    }
  }

  removeTagFromPreset(presetName, tag) {
    const preset = this.presets[presetName];
    if (preset && preset.tags) {
      const index = preset.tags.indexOf(tag);
      if (index > -1) {
        preset.tags.splice(index, 1);
        preset.modified = new Date().toISOString();
        this.savePresetsToStorage();
      }
    }
  }

  loadPresetsFromStorage() {
    try {
      const stored = localStorage.getItem('glitcherPresets');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Error loading presets:', error);
      return {};
    }
  }

  savePresetsToStorage() {
    try {
      localStorage.setItem('glitcherPresets', JSON.stringify(this.presets));
    } catch (error) {
      console.error('Error saving presets:', error);
    }
  }

  // Create a shareable link for a preset
  createShareableLink(presetName) {
    const preset = this.presets[presetName] || this.defaultPresets[presetName];
    if (!preset) return null;
    
    // Compress the preset data
    const compressed = btoa(JSON.stringify(preset));
    const url = new URL(window.location.href);
    url.searchParams.set('preset', compressed);
    
    return url.toString();
  }

  // Load preset from URL
  loadFromShareableLink(compressed) {
    try {
      const preset = JSON.parse(atob(compressed));
      if (this.validatePreset(preset)) {
        return preset;
      }
    } catch (error) {
      console.error('Error loading shared preset:', error);
    }
    return null;
  }
}