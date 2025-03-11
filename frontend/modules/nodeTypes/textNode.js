import { store } from '../../store';
import { TextProcessor } from '../textProcessing/textProcessor';
import { BaseNode } from './baseNode';

export class TextNode extends BaseNode {
    static type = 'text';
    static category = 'Text';
    static defaultName = 'Text Input';
    static defaultInputs = [];
    static defaultOutputs = [
        ['output', { type: 'text', connections: [] }]
    ];
    static defaultOptions = {
        placeholder: 'Enter text...'
    };
    static description = 'A node that allows text input';

    constructor(data = {}) {
        super(data);
        this.value = data.value || '';
    }

    getValue(port = 'output') {
        return this.value;
    }

    onValueChange(value) {
        this.value = value;
        // Notify connected nodes
        this.outputs.get('output').connections.forEach(connection => {
            const targetNode = store.getters['nodes/getNode'](connection.targetId);
            if (targetNode && targetNode.onInputReceived) {
                targetNode.onInputReceived(connection.targetPort, value);
            }
        });
    }

    async processText() {
        return this.value;
    }

    getOutputValue(port) {
        if (port === 'output') {
            return this.value;
        }
        return null;
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            position: this.position,
            value: this.value,
            placeholder: this.placeholder,
            inputs: Array.from(this.inputs.entries()),
            outputs: Array.from(this.outputs.entries())
        };
    }

    static fromJSON(json) {
        const node = new TextNode(json);
        node.id = json.id;
        node.inputs = new Map(json.inputs);
        node.outputs = new Map(json.outputs);
        return node;
    }

    getDisplayName() {
        return this.name;
    }

    getNodeComponent() {
        return 'text-input-node';
    }
}
