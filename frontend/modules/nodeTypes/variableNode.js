import { store } from '../../store';

export class VariableNode {
    static type = 'variable';
    static category = 'Variables';

    constructor(data = {}) {
        this.id = data.id || null;
        this.variableId = data.variableId || null;
        this.type = VariableNode.type;
        this.position = data.position || { x: 0, y: 0 };
        this.inputs = new Map();
        this.outputs = new Map([
            ['value', { type: 'any', connections: [] }]
        ]);
        this.width = 180;
        this.height = 100;
    }

    get name() {
        const variable = this.getVariable();
        return variable ? variable.name : 'Undefined Variable';
    }

    get variableType() {
        const variable = this.getVariable();
        return variable ? variable.type : 'any';
    }

    static createFromVariable(variable, position) {
        return new VariableNode({
            variableId: variable.id,
            position
        });
    }

    getVariable() {
        return store.getters['variables/getVariable'](this.variableId);
    }

    getValue() {
        const variable = this.getVariable();
        return variable ? variable.value : null;
    }

    onValueChange(value) {
        store.dispatch('variables/updateValue', {
            id: this.variableId,
            value,
            source: 'user'
        });
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            variableId: this.variableId,
            position: this.position,
            inputs: Array.from(this.inputs.entries()),
            outputs: Array.from(this.outputs.entries())
        };
    }

    static fromJSON(json) {
        const node = new VariableNode(json);
        node.id = json.id;
        node.inputs = new Map(json.inputs);
        node.outputs = new Map(json.outputs);
        return node;
    }

    getDisplayName() {
        return this.name;
    }

    getControlComponent() {
        const variable = this.getVariable();
        if (!variable) return null;

        switch (variable.type) {
            case 'number':
                return 'node-number-control';
            case 'boolean':
                return 'node-boolean-control';
            case 'string':
                return 'node-string-control';
            case 'enum':
                return 'node-enum-control';
            case 'color':
                return 'node-color-control';
            case 'vector':
                return 'node-vector-control';
            default:
                return null;
        }
    }

    getOutputType(outputName) {
        const variable = this.getVariable();
        if (!variable) return 'any';

        switch (variable.type) {
            case 'number':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'string':
                return 'string';
            case 'color':
                return 'color';
            case 'vector':
                return 'vector';
            default:
                return 'any';
        }
    }
}
