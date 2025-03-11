import { store } from './store';
import { tokenProcessor } from './tokenProcessor';
import { EventEmitter } from './eventEmitter';

// Variable Types
export const VariableType = {
    NUMBER: 'number',
    STRING: 'string',
    BOOLEAN: 'boolean',
    ENUM: 'enum',
    COLOR: 'color',
    VECTOR: 'vector'
};

// Variable Constraints
export class VariableConstraints {
    constructor(type) {
        this.type = type;
        this.min = null;
        this.max = null;
        this.step = null;
        this.enum = null;
        this.format = null;
    }

    static forNumber(min = null, max = null, step = null) {
        const constraints = new VariableConstraints(VariableType.NUMBER);
        constraints.min = min;
        constraints.max = max;
        constraints.step = step;
        return constraints;
    }

    static forEnum(values) {
        const constraints = new VariableConstraints(VariableType.ENUM);
        constraints.enum = values;
        return constraints;
    }

    static forColor(format = 'hex') {
        const constraints = new VariableConstraints(VariableType.COLOR);
        constraints.format = format;
        return constraints;
    }

    static forVector(dimensions = 2, min = null, max = null) {
        const constraints = new VariableConstraints(VariableType.VECTOR);
        constraints.dimensions = dimensions;
        constraints.min = min;
        constraints.max = max;
        return constraints;
    }

    validate(value) {
        switch (this.type) {
            case VariableType.NUMBER:
                if (typeof value !== 'number') return false;
                if (this.min !== null && value < this.min) return false;
                if (this.max !== null && value > this.max) return false;
                if (this.step !== null && value % this.step !== 0) return false;
                return true;

            case VariableType.ENUM:
                return this.enum.includes(value);

            case VariableType.COLOR:
                switch (this.format) {
                    case 'hex':
                        return /^#[0-9A-Fa-f]{6}$/.test(value);
                    case 'rgb':
                        return Array.isArray(value) && 
                               value.length === 3 && 
                               value.every(v => v >= 0 && v <= 255);
                    default:
                        return false;
                }

            case VariableType.VECTOR:
                return Array.isArray(value) && 
                       value.length === this.dimensions &&
                       value.every(v => typeof v === 'number' &&
                           (this.min === null || v >= this.min) &&
                           (this.max === null || v <= this.max));

            default:
                return true;
        }
    }
}

// Variable Class
export class Variable {
    constructor(name, type, defaultValue = null, constraints = null) {
        this.name = name;
        this.type = type;
        this.value = defaultValue;
        this.defaultValue = defaultValue;
        this.constraints = constraints || new VariableConstraints(type);
        this.description = '';
        this.tags = [];
        this.midiMapping = null;
        this.connections = [];
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
    }

    setValue(value, source = 'user') {
        if (!this.constraints.validate(value)) {
            throw new Error(`Invalid value for variable ${this.name}: ${value}`);
        }

        // Add to history
        if (source === 'user') {
            this.history = this.history.slice(0, this.historyIndex + 1);
            this.history.push(this.value);
            if (this.history.length > this.maxHistory) {
                this.history.shift();
            }
            this.historyIndex = this.history.length - 1;
        }

        this.value = value;
        store.dispatch('updateVariable', { name: this.name, value });
        
        // Update connected nodes
        this.connections.forEach(connection => {
            connection.update(value);
        });

        return true;
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.setValue(this.history[this.historyIndex], 'history');
            return true;
        }
        return false;
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.setValue(this.history[this.historyIndex], 'history');
            return true;
        }
        return false;
    }

    reset() {
        this.setValue(this.defaultValue, 'reset');
    }

    toJSON() {
        return {
            name: this.name,
            type: this.type,
            value: this.value,
            defaultValue: this.defaultValue,
            constraints: this.constraints,
            description: this.description,
            tags: this.tags,
            midiMapping: this.midiMapping
        };
    }

    static fromJSON(json) {
        const variable = new Variable(
            json.name,
            json.type,
            json.defaultValue,
            json.constraints
        );
        variable.value = json.value;
        variable.description = json.description;
        variable.tags = json.tags;
        variable.midiMapping = json.midiMapping;
        return variable;
    }
}

// Variable Manager Class
export class VariableManager extends EventEmitter {
    constructor() {
        super();
        this.variables = new Map();
        this.groups = new Map();
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 100;

        // Subscribe to store changes
        store.subscribe(() => {
            const state = store.getState();
            if (state.variables) {
                this.syncWithStore(state.variables);
            }
        });
    }

    createVariable(name, type, defaultValue = null, constraints = null) {
        if (this.variables.has(name)) {
            throw new Error(`Variable ${name} already exists`);
        }

        const variable = new Variable(name, type, defaultValue, constraints);
        this.variables.set(name, variable);
        
        // Add to token processor
        tokenProcessor.addVariable(name, {
            type: 'variable',
            description: variable.description,
            defaultValue: variable.defaultValue
        });

        this.emit('variableCreated', variable);
        return variable;
    }

    getVariable(name) {
        return this.variables.get(name);
    }

    deleteVariable(name) {
        const variable = this.variables.get(name);
        if (variable) {
            this.variables.delete(name);
            tokenProcessor.removeVariable(name);
            this.emit('variableDeleted', variable);
        }
    }

    createGroup(name, variables = []) {
        if (this.groups.has(name)) {
            throw new Error(`Group ${name} already exists`);
        }
        this.groups.set(name, new Set(variables));
        this.emit('groupCreated', { name, variables });
    }

    addToGroup(groupName, variableName) {
        const group = this.groups.get(groupName);
        if (group && this.variables.has(variableName)) {
            group.add(variableName);
            this.emit('groupUpdated', { name: groupName, variables: Array.from(group) });
        }
    }

    removeFromGroup(groupName, variableName) {
        const group = this.groups.get(groupName);
        if (group) {
            group.delete(variableName);
            this.emit('groupUpdated', { name: groupName, variables: Array.from(group) });
        }
    }

    getGroup(name) {
        return Array.from(this.groups.get(name) || []);
    }

    deleteGroup(name) {
        if (this.groups.delete(name)) {
            this.emit('groupDeleted', name);
        }
    }

    // Bulk operations
    bulkUpdate(updates) {
        const oldValues = new Map();
        const newValues = new Map();

        // Validate all updates first
        for (const [name, value] of Object.entries(updates)) {
            const variable = this.variables.get(name);
            if (!variable || !variable.constraints.validate(value)) {
                return false;
            }
            oldValues.set(name, variable.value);
            newValues.set(name, value);
        }

        // Apply all updates
        for (const [name, value] of newValues) {
            this.variables.get(name).setValue(value, 'bulk');
        }

        // Add to undo stack
        this.undoStack.push({
            type: 'bulk',
            oldValues,
            newValues
        });

        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }

        this.redoStack = [];
        this.emit('bulkUpdate', updates);
        return true;
    }

    undo() {
        const action = this.undoStack.pop();
        if (action) {
            switch (action.type) {
                case 'bulk':
                    for (const [name, value] of action.oldValues) {
                        this.variables.get(name).setValue(value, 'undo');
                    }
                    break;
            }
            this.redoStack.push(action);
            this.emit('undo', action);
            return true;
        }
        return false;
    }

    redo() {
        const action = this.redoStack.pop();
        if (action) {
            switch (action.type) {
                case 'bulk':
                    for (const [name, value] of action.newValues) {
                        this.variables.get(name).setValue(value, 'redo');
                    }
                    break;
            }
            this.undoStack.push(action);
            this.emit('redo', action);
            return true;
        }
        return false;
    }

    // Serialization
    toJSON() {
        return {
            variables: Array.from(this.variables.entries()).map(([name, variable]) => ({
                name,
                ...variable.toJSON()
            })),
            groups: Array.from(this.groups.entries()).map(([name, variables]) => ({
                name,
                variables: Array.from(variables)
            }))
        };
    }

    fromJSON(json) {
        // Clear existing state
        this.variables.clear();
        this.groups.clear();

        // Restore variables
        json.variables.forEach(varData => {
            const variable = Variable.fromJSON(varData);
            this.variables.set(variable.name, variable);
        });

        // Restore groups
        json.groups.forEach(groupData => {
            this.groups.set(groupData.name, new Set(groupData.variables));
        });

        this.emit('restored', json);
    }

    // Store synchronization
    syncWithStore(storeVariables) {
        const updates = new Map();
        
        for (const [name, value] of Object.entries(storeVariables)) {
            const variable = this.variables.get(name);
            if (variable && variable.value !== value) {
                updates.set(name, value);
            }
        }

        if (updates.size > 0) {
            this.bulkUpdate(Object.fromEntries(updates));
        }
    }
}

// Create and export singleton instance
export const variableManager = new VariableManager();
