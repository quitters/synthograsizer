import { store } from '../store';

export class MIDIMapping {
    constructor(midiController) {
        this.midiController = midiController;
        this.learningMode = false;
        this.learningCallback = null;
        this.setupMIDIListeners();
    }

    setupMIDIListeners() {
        // Listen for MIDI CC messages
        this.midiController.on('midi-message', (message) => {
            if (message.type === 'cc') {
                if (this.learningMode && this.learningCallback) {
                    // Handle MIDI learn
                    this.learningCallback({
                        channel: message.channel,
                        control: message.control
                    });
                    this.stopLearning();
                } else {
                    // Handle regular MIDI control
                    const variableId = this.midiController.getMappingForCC(message.channel, message.control);
                    if (variableId) {
                        this.updateVariable(variableId, message.value);
                    }
                }
            }
        });

        // Listen for device connection/disconnection
        this.midiController.on('device-connected', (device) => {
            store.dispatch('midi/deviceConnected', device);
        });

        this.midiController.on('device-disconnected', (device) => {
            store.dispatch('midi/deviceDisconnected', device);
        });
    }

    startLearning(callback) {
        this.learningMode = true;
        this.learningCallback = callback;
    }

    stopLearning() {
        this.learningMode = false;
        this.learningCallback = null;
    }

    mapVariable(variableId, channel, control) {
        // Remove any existing mappings for this control
        const existingMapping = this.midiController.getMappingForCC(channel, control);
        if (existingMapping) {
            store.dispatch('variables/clearMIDIMapping', existingMapping);
        }

        // Remove any existing mappings for this variable
        store.dispatch('variables/clearMIDIMapping', variableId);

        // Create new mapping
        this.midiController.mapControl(channel, control, variableId);
        store.dispatch('variables/setMIDIMapping', {
            variableId,
            mapping: { channel, control }
        });
    }

    unmapVariable(variableId) {
        const variable = store.state.variables.items.get(variableId);
        if (variable?.midiMapping) {
            const { channel, control } = variable.midiMapping;
            this.midiController.unmapControl(channel, control);
            store.dispatch('variables/clearMIDIMapping', variableId);
        }
    }

    updateVariable(variableId, midiValue) {
        const variable = store.state.variables.items.get(variableId);
        if (!variable) return;

        // Convert MIDI value (0-127) to variable range
        let normalizedValue;
        switch (variable.type) {
            case 'number':
                const range = variable.max - variable.min;
                normalizedValue = variable.min + (range * midiValue / 127);
                break;
            case 'boolean':
                normalizedValue = midiValue >= 64;
                break;
            case 'enum':
                const index = Math.floor((midiValue / 128) * variable.values.length);
                normalizedValue = variable.values[index];
                break;
            case 'vector':
                // For vectors, we need to know which component is being controlled
                if (variable.midiMapping.component !== undefined) {
                    const value = [...variable.value];
                    value[variable.midiMapping.component] = midiValue / 127;
                    normalizedValue = value;
                }
                break;
            default:
                return; // Unsupported type for MIDI control
        }

        store.dispatch('variables/updateValue', {
            id: variableId,
            value: normalizedValue,
            source: 'midi'
        });
    }

    // Load MIDI mappings from saved state
    loadMappings(mappings) {
        this.midiController.clearAllMappings();
        mappings.forEach(({ variableId, mapping }) => {
            this.mapVariable(variableId, mapping.channel, mapping.control);
        });
    }

    // Get all current MIDI mappings
    getMappings() {
        const mappings = [];
        store.state.variables.items.forEach((variable, id) => {
            if (variable.midiMapping) {
                mappings.push({
                    variableId: id,
                    mapping: variable.midiMapping
                });
            }
        });
        return mappings;
    }
}
