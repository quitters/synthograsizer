// Central state management
import mitt from 'mitt';

export const store = {
    emitter: mitt(),
    state: {
        variables: new Map(),
        connections: new Map(),
        nodes: new Map(),
        midiMappings: new Map(),
        mainPrompt: '',
        negativePrompt: '',
        isNegativeVisible: false,
        midiLearnMode: false,
        selectedDevice: null,
        settings: {
            autoSave: true,
            autoSaveInterval: 30,
            theme: 'dark',
            showTooltips: true,
            midiVelocitySensitivity: 0.7
        }
    },

    // Getters
    getState() {
        return this.state;
    },

    getVariable(id) {
        return this.state.variables.get(id);
    },

    getConnection(id) {
        return this.state.connections.get(id);
    },

    getNode(id) {
        return this.state.nodes.get(id);
    },

    // Actions
    dispatch(action, payload) {
        switch (action) {
            case 'updatePrompt':
                this.updatePrompt(payload);
                break;
            case 'updateVariable':
                this.updateVariable(payload);
                break;
            case 'addConnection':
                this.addConnection(payload);
                break;
            case 'removeConnection':
                this.removeConnection(payload);
                break;
            case 'updateConnections':
                this.updateConnections(payload);
                break;
            case 'addNode':
                this.addNode(payload);
                break;
            case 'updateNode':
                this.updateNode(payload);
                break;
            case 'removeNode':
                this.removeNode(payload);
                break;
            case 'nodeMove':
                this.handleNodeMove(payload);
                break;
            case 'updateMidiMapping':
                this.updateMidiMapping(payload);
                break;
            case 'setMidiLearnMode':
                this.setMidiLearnMode(payload);
                break;
            case 'updateMidiDevice':
                this.updateMidiDevice(payload);
                break;
            case 'updateSettings':
                this.updateSettings(payload);
                break;
            case 'openSettings':
                this.emitter.emit('openSettings');
                break;
            default:
                console.warn('Unknown action:', action);
        }

        // Emit state change event
        this.emitter.emit('stateChange', this.state);
    },

    // Event subscription
    subscribe(event, callback) {
        this.emitter.on(event, callback);
    },

    unsubscribe(event, callback) {
        this.emitter.off(event, callback);
    },

    // Action handlers
    updatePrompt(payload) {
        if (payload.mainPrompt !== undefined) {
            this.state.mainPrompt = payload.mainPrompt;
        }
        if (payload.negativePrompt !== undefined) {
            this.state.negativePrompt = payload.negativePrompt;
        }
        if (payload.isNegativeVisible !== undefined) {
            this.state.isNegativeVisible = payload.isNegativeVisible;
        }
        
        this.emitter.emit('promptUpdate', payload);
    },

    updateVariable(payload) {
        const { id, value, ...rest } = payload;
        const variable = this.state.variables.get(id);
        
        if (variable) {
            Object.assign(variable, { value, ...rest });
            
            // Update history
            if (!variable.history) variable.history = [];
            variable.history.push({
                value,
                time: new Date().toISOString()
            });
            
            // Keep history limited to last 10 changes
            if (variable.history.length > 10) {
                variable.history.shift();
            }
            
            this.emitter.emit('variableUpdate', { id, value, ...rest });
            
            // Update connected nodes
            this.updateConnectedNodes(id, value);
        }
    },

    addConnection(payload) {
        const { id, source, target, ...rest } = payload;
        const connection = {
            id,
            source,
            target,
            active: true,
            ...rest
        };
        
        this.state.connections.set(id, connection);
        this.emitter.emit('connectionUpdate', { 
            type: 'add',
            id,
            connection
        });
    },

    removeConnection(id) {
        if (this.state.connections.has(id)) {
            this.state.connections.delete(id);
            this.emitter.emit('connectionUpdate', {
                type: 'remove',
                id
            });
        }
    },

    updateConnections(connections) {
        connections.forEach(conn => {
            this.state.connections.set(conn.id, conn);
        });
        
        this.emitter.emit('connectionsSync', connections);
    },

    addNode(payload) {
        const { id, type, ...rest } = payload;
        const node = {
            id,
            type,
            position: { x: 0, y: 0 },
            ...rest
        };
        
        this.state.nodes.set(id, node);
        this.emitter.emit('nodeUpdate', {
            type: 'add',
            id,
            node
        });
    },

    updateNode(payload) {
        const { id, ...updates } = payload;
        const node = this.state.nodes.get(id);
        
        if (node) {
            Object.assign(node, updates);
            this.emitter.emit('nodeUpdate', {
                type: 'update',
                id,
                node
            });
        }
    },

    removeNode(id) {
        if (this.state.nodes.has(id)) {
            // Remove associated connections
            this.state.connections.forEach((conn, connId) => {
                if (conn.source === id || conn.target === id) {
                    this.removeConnection(connId);
                }
            });
            
            this.state.nodes.delete(id);
            this.emitter.emit('nodeUpdate', {
                type: 'remove',
                id
            });
        }
    },

    handleNodeMove(payload) {
        const { nodeId, position } = payload;
        const node = this.state.nodes.get(nodeId);
        
        if (node) {
            node.position = position;
            this.emitter.emit('nodeMove', payload);
        }
    },

    updateMidiMapping(payload) {
        const { control, target } = payload;
        this.state.midiMappings.set(target, control);
        this.emitter.emit('midiMappingUpdate', payload);
    },

    setMidiLearnMode(payload) {
        this.state.midiLearnMode = payload.active;
        this.emitter.emit('midiLearnModeChange', payload.active);
    },

    updateMidiDevice(payload) {
        this.state.selectedDevice = payload.deviceId;
        this.emitter.emit('midiDeviceChange', payload.deviceId);
    },

    updateSettings(payload) {
        Object.assign(this.state.settings, payload);
        this.emitter.emit('settingsUpdate', this.state.settings);
    },

    updateConnectedNodes(sourceId, value) {
        this.state.connections.forEach((conn, id) => {
            if (conn.source === sourceId) {
                const targetNode = this.state.nodes.get(conn.target);
                if (targetNode) {
                    targetNode.value = value;
                    this.emitter.emit('nodeUpdate', {
                        type: 'update',
                        id: conn.target,
                        node: targetNode
                    });
                }
            }
        });
    },

    // Serialization
    serialize() {
        return {
            variables: Array.from(this.state.variables.entries()),
            connections: Array.from(this.state.connections.entries()),
            nodes: Array.from(this.state.nodes.entries()),
            midiMappings: Array.from(this.state.midiMappings.entries()),
            mainPrompt: this.state.mainPrompt,
            negativePrompt: this.state.negativePrompt,
            isNegativeVisible: this.state.isNegativeVisible,
            settings: this.state.settings
        };
    },

    deserialize(data) {
        this.state.variables = new Map(data.variables || []);
        this.state.connections = new Map(data.connections || []);
        this.state.nodes = new Map(data.nodes || []);
        this.state.midiMappings = new Map(data.midiMappings || []);
        this.state.mainPrompt = data.mainPrompt || '';
        this.state.negativePrompt = data.negativePrompt || '';
        this.state.isNegativeVisible = data.isNegativeVisible || false;
        this.state.settings = { ...this.state.settings, ...(data.settings || {}) };
        
        // Emit events for initial state
        this.emitter.emit('stateLoaded', this.state);
    }
};
