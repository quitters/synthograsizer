/**
 * Preset Manager
 * Handles saving, loading, importing, and exporting effect chain presets
 */

export class PresetManager {
    constructor() {
        this.presets = new Map();
        this.storageKey = 'glitcher-studio-presets';
        this.version = '1.0';
        
        // Built-in presets
        this.builtInPresets = new Map([
            ['glitch-classic', {
                name: 'Glitch Classic',
                description: 'Traditional glitch art effects',
                author: 'System',
                version: this.version,
                chain: [
                    {
                        type: 'direction-effect',
                        mode: 'destructive',
                        enabled: true,
                        parameters: {
                            direction: 'down',
                            speed: 3,
                            selectionAware: true
                        }
                    },
                    {
                        type: 'slice-effect',
                        mode: 'destructive',
                        enabled: true,
                        parameters: {
                            mode: 'horizontal',
                            offset: 15
                        }
                    },
                    {
                        type: 'color-effect',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            mode: 'chromatic',
                            intensity: 0.5,
                            opacity: 0.8,
                            blendMode: 'normal'
                        }
                    }
                ]
            }],
            ['vaporwave-aesthetic', {
                name: 'Vaporwave Aesthetic',
                description: 'Dreamy vaporwave-inspired effects',
                author: 'System',
                version: this.version,
                chain: [
                    {
                        type: 'color-effect',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            mode: 'hue-shift',
                            intensity: 0.3,
                            opacity: 1,
                            blendMode: 'normal'
                        }
                    },
                    {
                        type: 'pop-art-filter',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            style: 'neon',
                            intensity: 0.7,
                            opacity: 0.6,
                            blendMode: 'screen'
                        }
                    },
                    {
                        type: 'vintage-film-filter',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            style: 'polaroid',
                            grain: 0.2,
                            opacity: 0.4,
                            blendMode: 'overlay'
                        }
                    }
                ]
            }],
            ['datamosh-chaos', {
                name: 'Datamosh Chaos',
                description: 'Aggressive datamoshing simulation',
                author: 'System',
                version: this.version,
                chain: [
                    {
                        type: 'pixel-sort-effect',
                        mode: 'destructive',
                        enabled: true,
                        parameters: {
                            mode: 'column-brightness',
                            threshold: 0.5
                        }
                    },
                    {
                        type: 'spiral-effect',
                        mode: 'destructive',
                        enabled: true,
                        parameters: {
                            type: 'random',
                            strength: 0.08
                        }
                    },
                    {
                        type: 'direction-effect',
                        mode: 'destructive',
                        enabled: true,
                        parameters: {
                            direction: 'jitter',
                            speed: 5,
                            selectionAware: false
                        }
                    }
                ]
            }],
            ['subtle-enhancement', {
                name: 'Subtle Enhancement',
                description: 'Light non-destructive enhancements',
                author: 'System',
                version: this.version,
                chain: [
                    {
                        type: 'color-effect',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            mode: 'saturation',
                            intensity: 0.2,
                            opacity: 0.5,
                            blendMode: 'normal'
                        }
                    },
                    {
                        type: 'edge-detection-filter',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            strength: 0.3,
                            opacity: 0.15,
                            blendMode: 'overlay'
                        }
                    }
                ]
            }]
        ]);
        
        this.loadFromStorage();
    }

    // Load user presets from localStorage
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.version === this.version) {
                    data.presets.forEach(preset => {
                        this.presets.set(preset.id || this.generateId(preset.name), preset);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading presets:', error);
        }
    }

    // Save user presets to localStorage
    saveToStorage() {
        try {
            const data = {
                version: this.version,
                presets: Array.from(this.presets.values())
            };
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving presets:', error);
        }
    }

    // Generate unique ID for preset
    generateId(name) {
        const base = name.toLowerCase().replace(/\s+/g, '-');
        let id = base;
        let counter = 1;
        
        while (this.presets.has(id) || this.builtInPresets.has(id)) {
            id = `${base}-${counter}`;
            counter++;
        }
        
        return id;
    }

    // Save current chain as preset
    savePreset(name, description, chain, metadata = {}) {
        const id = this.generateId(name);
        const preset = {
            id,
            name,
            description,
            author: metadata.author || 'User',
            version: this.version,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            tags: metadata.tags || [],
            chain: this.serializeChain(chain),
            thumbnail: metadata.thumbnail || null
        };
        
        this.presets.set(id, preset);
        this.saveToStorage();
        
        return preset;
    }

    // Update existing preset
    updatePreset(id, updates) {
        const preset = this.presets.get(id);
        if (preset) {
            Object.assign(preset, updates);
            preset.modified = new Date().toISOString();
            this.saveToStorage();
            return preset;
        }
        return null;
    }

    // Delete preset
    deletePreset(id) {
        if (this.presets.has(id)) {
            this.presets.delete(id);
            this.saveToStorage();
            return true;
        }
        return false;
    }

    // Get preset by ID
    getPreset(id) {
        return this.presets.get(id) || this.builtInPresets.get(id);
    }

    // Get all presets (user + built-in)
    getAllPresets() {
        const all = new Map();
        
        // Add built-in presets first
        this.builtInPresets.forEach((preset, id) => {
            all.set(id, { ...preset, isBuiltIn: true });
        });
        
        // Add user presets (can override built-in)
        this.presets.forEach((preset, id) => {
            all.set(id, { ...preset, isBuiltIn: false });
        });
        
        return Array.from(all.values());
    }

    // Search presets
    searchPresets(query) {
        const searchLower = query.toLowerCase();
        return this.getAllPresets().filter(preset => 
            preset.name.toLowerCase().includes(searchLower) ||
            preset.description.toLowerCase().includes(searchLower) ||
            (preset.tags && preset.tags.some(tag => tag.toLowerCase().includes(searchLower)))
        );
    }

    // Export preset to JSON file
    exportPreset(id) {
        const preset = this.getPreset(id);
        if (!preset) return null;
        
        const exportData = {
            ...preset,
            exported: new Date().toISOString(),
            exportVersion: this.version
        };
        
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${preset.name.replace(/\s+/g, '_')}_preset.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        return true;
    }

    // Import preset from JSON file
    async importPreset(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Validate preset structure
                    if (!this.validatePreset(data)) {
                        throw new Error('Invalid preset format');
                    }
                    
                    // Check version compatibility
                    if (data.exportVersion && data.exportVersion !== this.version) {
                        console.warn(`Preset version mismatch: ${data.exportVersion} vs ${this.version}`);
                    }
                    
                    // Generate new ID to avoid conflicts
                    const preset = {
                        ...data,
                        id: this.generateId(data.name),
                        imported: new Date().toISOString()
                    };
                    
                    this.presets.set(preset.id, preset);
                    this.saveToStorage();
                    
                    resolve(preset);
                } catch (error) {
                    reject(new Error(`Failed to import preset: ${error.message}`));
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // Export all user presets
    exportAllPresets() {
        const exportData = {
            version: this.version,
            exported: new Date().toISOString(),
            presets: Array.from(this.presets.values())
        };
        
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `glitcher_presets_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }

    // Import multiple presets
    async importMultiplePresets(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (!data.presets || !Array.isArray(data.presets)) {
                        throw new Error('Invalid backup format');
                    }
                    
                    const imported = [];
                    data.presets.forEach(presetData => {
                        if (this.validatePreset(presetData)) {
                            const preset = {
                                ...presetData,
                                id: this.generateId(presetData.name),
                                imported: new Date().toISOString()
                            };
                            this.presets.set(preset.id, preset);
                            imported.push(preset);
                        }
                    });
                    
                    this.saveToStorage();
                    resolve(imported);
                } catch (error) {
                    reject(new Error(`Failed to import presets: ${error.message}`));
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // Validate preset structure
    validatePreset(data) {
        return data &&
               data.name &&
               data.chain &&
               Array.isArray(data.chain) &&
               data.chain.length > 0 &&
               data.chain.every(effect => 
                   effect.type &&
                   effect.mode &&
                   effect.parameters
               );
    }

    // Serialize effect chain for storage
    serializeChain(chain) {
        return chain.map(effect => ({
            type: effect.type,
            mode: effect.mode,
            enabled: effect.enabled,
            parameters: { ...effect.parameters }
        }));
    }

    // Create thumbnail for preset
    async createThumbnail(canvas, maxSize = 200) {
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        
        // Calculate dimensions maintaining aspect ratio
        const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height);
        tempCanvas.width = canvas.width * scale;
        tempCanvas.height = canvas.height * scale;
        
        // Draw scaled image
        ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Convert to data URL
        return tempCanvas.toDataURL('image/jpeg', 0.8);
    }

    // Get preset statistics
    getStatistics() {
        return {
            total: this.presets.size + this.builtInPresets.size,
            user: this.presets.size,
            builtIn: this.builtInPresets.size,
            tags: this.getAllTags(),
            mostUsedEffects: this.getMostUsedEffects()
        };
    }

    // Get all unique tags
    getAllTags() {
        const tags = new Set();
        this.getAllPresets().forEach(preset => {
            if (preset.tags) {
                preset.tags.forEach(tag => tags.add(tag));
            }
        });
        return Array.from(tags);
    }

    // Get most used effects across all presets
    getMostUsedEffects() {
        const effectCount = new Map();
        
        this.getAllPresets().forEach(preset => {
            preset.chain.forEach(effect => {
                const count = effectCount.get(effect.type) || 0;
                effectCount.set(effect.type, count + 1);
            });
        });
        
        return Array.from(effectCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
    }

    // Clone a preset
    clonePreset(id, newName) {
        const original = this.getPreset(id);
        if (!original) return null;
        
        return this.savePreset(
            newName || `${original.name} (Copy)`,
            original.description,
            original.chain,
            {
                author: original.author,
                tags: original.tags,
                thumbnail: original.thumbnail
            }
        );
    }
}
