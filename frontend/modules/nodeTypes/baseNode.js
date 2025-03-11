import { v4 as uuidv4 } from 'uuid';
import { store } from '../../store';

export class BaseNode {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.type = this.constructor.type;
        this.name = data.name || this.constructor.defaultName;
        this.position = data.position || { x: 0, y: 0 };
        this.inputs = new Map(data.inputs || this.constructor.defaultInputs);
        this.outputs = new Map(data.outputs || this.constructor.defaultOutputs);
        this.options = { ...this.constructor.defaultOptions, ...data.options };
        this.width = data.width || 280;
        this.height = data.height || null;
    }

    // Static properties that should be overridden by child classes
    static type = 'base';
    static category = 'General';
    static defaultName = 'Node';
    static defaultInputs = [];
    static defaultOutputs = [];
    static defaultOptions = {};
    static description = 'Base node type';

    // Standard methods that can be overridden by child classes
    onInputChange(port, value) {
        // Override this to handle input changes
    }

    onOptionChange(option, value) {
        // Override this to handle option changes
        this.options[option] = value;
    }

    getValue(port = 'output') {
        // Override this to provide output values
        return null;
    }

    // Utility methods that probably don't need to be overridden
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            position: this.position,
            inputs: Array.from(this.inputs.entries()),
            outputs: Array.from(this.outputs.entries()),
            options: this.options,
            width: this.width,
            height: this.height
        };
    }

    static fromJSON(json) {
        return new this(json);
    }

    isPortConnected(type, portName) {
        const connections = store.getters['nodes/getAllConnections'];
        return connections.some(conn => {
            if (type === 'input') {
                return conn.targetId === this.id && conn.targetPort === portName;
            } else {
                return conn.sourceId === this.id && conn.sourcePort === portName;
            }
        });
    }

    getConnectedNodes(type, portName) {
        const connections = store.getters['nodes/getAllConnections'];
        return connections
            .filter(conn => {
                if (type === 'input') {
                    return conn.targetId === this.id && conn.targetPort === portName;
                } else {
                    return conn.sourceId === this.id && conn.sourcePort === portName;
                }
            })
            .map(conn => {
                if (type === 'input') {
                    return store.getters['nodes/getNode'](conn.sourceId);
                } else {
                    return store.getters['nodes/getNode'](conn.targetId);
                }
            });
    }

    getInputValue(portName) {
        const connections = store.getters['nodes/getAllConnections'];
        const connection = connections.find(conn => 
            conn.targetId === this.id && conn.targetPort === portName
        );
        
        if (!connection) return null;

        const sourceNode = store.getters['nodes/getNode'](connection.sourceId);
        return sourceNode ? sourceNode.getValue(connection.sourcePort) : null;
    }
}
