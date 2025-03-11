import { v4 as uuidv4 } from 'uuid';
import { store } from './store';

export class SynthVariable {
  constructor(config) {
    this.id = uuidv4();
    this.name = config.name;
    this.type = config.type;
    
    if (this.type === 'continuous') {
      this.range = config.range || [0, 1];
      this.currentValue = config.initialValue || this.range[0];
    } else if (this.type === 'discrete') {
      this.values = config.values || [];
      this.currentValue = config.initialValue || this.values[0];
    } else if (this.type === 'trigger') {
      this.currentValue = false;
    }

    // MIDI mapping
    this.midiMapping = null;
    
    // Connection info
    this.connections = new Set();
  }

  update(value) {
    const previousValue = this.currentValue;
    
    if (this.type === 'continuous') {
      // Clamp value to range
      this.currentValue = Math.max(this.range[0], 
                                 Math.min(this.range[1], value));
    } else if (this.type === 'discrete') {
      // Ensure value is in the values array
      if (this.values.includes(value)) {
        this.currentValue = value;
      }
    } else if (this.type === 'trigger') {
      this.currentValue = value;
      // Auto-reset trigger after 100ms
      if (value) {
        setTimeout(() => {
          this.currentValue = false;
          this.notifyUpdate();
        }, 100);
      }
    }

    // Record action in history
    store.history.push({
      type: 'variable-updated',
      data: {
        id: this.id,
        value: this.currentValue,
        previousValue
      }
    });

    this.notifyUpdate();
  }

  notifyUpdate() {
    store.eventBus.emit('variable-updated', {
      id: this.id,
      value: this.currentValue
    });
  }

  addConnection(targetId) {
    this.connections.add(targetId);
  }

  removeConnection(targetId) {
    this.connections.delete(targetId);
  }

  setMIDIMapping(mapping) {
    this.midiMapping = mapping;
  }

  clearMIDIMapping() {
    this.midiMapping = null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      range: this.type === 'continuous' ? this.range : undefined,
      values: this.type === 'discrete' ? this.values : undefined,
      currentValue: this.currentValue,
      midiMapping: this.midiMapping,
      connections: Array.from(this.connections)
    };
  }

  static fromJSON(json) {
    const variable = new SynthVariable({
      name: json.name,
      type: json.type,
      range: json.range,
      values: json.values,
      initialValue: json.currentValue
    });

    variable.id = json.id;
    variable.midiMapping = json.midiMapping;
    json.connections.forEach(conn => variable.connections.add(conn));

    return variable;
  }
}
