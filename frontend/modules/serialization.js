import { store } from './store.js';

export const StateVersion = '2.1';

const StateSchema = {
  version: 'string',
  state: 'object'
};

export class StateSerializer {
  static validate(data) {
    if (!data || typeof data !== 'object') return false;
    
    return Object.keys(StateSchema).every(key => {
      return typeof data[key] === StateSchema[key];
    });
  }

  static serialize() {
    return {
      version: StateVersion,
      state: store.serialize()
    };
  }

  static deserialize(data) {
    if (!this.validate(data)) {
      throw new Error('Invalid state format');
    }

    if (data.version !== StateVersion) {
      data = this.migrate(data);
    }

    store.deserialize(data.state);
    return data.state;
  }

  static migrate(data) {
    // Handle migration from older versions
    switch (data.version) {
      case '2.0':
        return this.migrateFrom20(data);
      case '1.0':
        return this.migrateFrom10(data);
      default:
        throw new Error(`Unsupported state version: ${data.version}`);
    }
  }

  static migrateFrom20(data) {
    return {
      version: StateVersion,
      state: {
        variables: data.variables || new Map(),
        connections: data.connections || new Map(),
        nodes: new Map(),
        midiMappings: data.midiMappings || new Map(),
        mainPrompt: data.prompts?.mainPrompt || '',
        negativePrompt: data.prompts?.negativePrompt || '',
        isNegativeVisible: data.prompts?.isNegativeVisible || false
      }
    };
  }

  static migrateFrom10(data) {
    // First migrate to 2.0
    const v20Data = {
      version: '2.0',
      variables: new Map(
        (data.variables || []).map(v => [
          v.id,
          {
            id: v.id,
            name: v.name,
            value: v.currentValue || 0,
            type: v.type || 'continuous',
            range: v.range || [0, 1],
            midiMapping: v.midiMapping || null
          }
        ])
      ),
      connections: new Map(),
      midiMappings: new Map(),
      prompts: {
        mainPrompt: '',
        negativePrompt: '',
        isNegativeVisible: false
      }
    };

    // Then migrate to 2.1
    return this.migrateFrom20(v20Data);
  }
}
