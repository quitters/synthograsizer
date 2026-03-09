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
                            offset: 20
                        }
                    }
                ]
            }],
            ['vaporwave', {
                name: 'Vaporwave Aesthetic',
                description: 'Retro 80s/90s visual style',
                author: 'System',
                version: this.version,
                chain: [
                    {
                        type: 'color-effect',
                        mode: 'destructive',
                        enabled: true,
                        parameters: {
                            effect: 'hue-shift',
                            hueShift: 180,
                            intensity: 0.7
                        }
                    },
                    {
                        type: 'vintage-film-filter',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            filterType: 'vhs',
                            grain: 0.3,
                            opacity: 0.8,
                            blendMode: 'overlay'
                        }
                    },
                    {
                        type: 'slice-effect',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            mode: 'both',
                            offset: 5,
                            opacity: 0.5,
                            blendMode: 'screen'
                        }
                    }
                ]
            }],
            ['cyberpunk', {
                name: 'Cyberpunk Distortion',
                description: 'Futuristic digital corruption',
                author: 'System',
                version: this.version,
                chain: [
                    {
                        type: 'pixel-sort-effect',
                        mode: 'destructive',
                        enabled: true,
                        parameters: {
                            sortType: 'column-brightness',
                            threshold: 0.3
                        }
                    },
                    {
                        type: 'color-effect',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            effect: 'chromatic-aberration',
                            intensity: 0.8,
                            opacity: 0.9,
                            blendMode: 'normal'
                        }
                    },
                    {
                        type: 'pop-art-filter',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            style: 'neon-pop',
                            intensity: 0.6,
                            opacity: 0.7,
                            blendMode: 'multiply'
                        }
                    }
                ]
            }],
            ['subtle-enhancement', {
                name: 'Subtle Enhancement',
                description: 'Light artistic touches',
                author: 'System',
                version: this.version,
                chain: [
                    {
                        type: 'color-effect',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            effect: 'saturation-boost',
                            intensity: 0.3,
                            opacity: 0.5,
                            blendMode: 'soft-light'
                        }
                    },
                    {
                        type: 'vintage-film-filter',
                        mode: 'non-destructive',
                        enabled: true,
                        parameters: {
                            filterType: 'kodachrome',
                            grain: 0.1,
                            opacity: 0.3,
                            blendMode: 'overlay'
                        }
                    }
                ]
            }]
        ]);
        
        this.loadFromStorage();
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.version === this.version) {
                    data.presets.forEach(preset => {
                        this.presets.set(preset.id || preset.name, preset);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading presets from storage:', error);
        }
    }

    saveToStorage() {
        try {
            const data = {
                version: this.version,
                presets: Array.from(this.presets.values())
            };
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving presets to storage:', error);
        }
    }

    savePreset(name, effectChain, description = '') {
        const preset = {
            id: this.generateId(name),
            name: name,
            description: description,
            author: 'User',
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            version: this.version,
            chain: effectChain.map(effect => ({
                type: effect.type,
                name: effect.name,
                mode: effect.mode,
                enabled: effect.enabled,
                parameters: { ...effect.parameters }
            }))
        };
        
        this.presets.set(preset.id, preset);
        this.saveToStorage();
        
        return preset;
    }

    loadPreset(id) {
        // Check user presets first, then built-in presets
        return this.presets.get(id) || this.builtInPresets.get(id);
    }

    deletePreset(id) {
        // Can't delete built-in presets
        if (this.builtInPresets.has(id)) {
            throw new Error('Cannot delete built-in presets');
        }
        
        const deleted = this.presets.delete(id);
        if (deleted) {
            this.saveToStorage();
        }