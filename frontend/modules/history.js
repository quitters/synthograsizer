import { store } from './store';

export class History {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = 50;
  }

  push(action) {
    // Create inverse action for undo
    const inverse = this.createInverseAction(action);
    
    this.undoStack.push(inverse);
    this.redoStack = []; // Clear redo stack on new action
    
    // Limit stack size
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  undo() {
    if (this.undoStack.length === 0) return;
    
    const action = this.undoStack.pop();
    const inverse = this.createInverseAction(action);
    
    this.redoStack.push(inverse);
    this.executeAction(action);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    
    const action = this.redoStack.pop();
    const inverse = this.createInverseAction(action);
    
    this.undoStack.push(inverse);
    this.executeAction(action);
  }

  createInverseAction(action) {
    switch (action.type) {
      case 'connection-created':
        return {
          type: 'connection-removed',
          data: action.data
        };
        
      case 'connection-removed':
        return {
          type: 'connection-created',
          data: action.data
        };
        
      case 'variable-updated':
        return {
          type: 'variable-updated',
          data: {
            id: action.data.id,
            value: action.data.previousValue
          }
        };
        
      case 'variable-created':
        return {
          type: 'variable-deleted',
          data: action.data
        };
        
      case 'variable-deleted':
        return {
          type: 'variable-created',
          data: action.data
        };
        
      default:
        return action;
    }
  }

  executeAction(action) {
    switch (action.type) {
      case 'connection-created':
        store.eventBus.emit('connection-created', action.data);
        break;
        
      case 'connection-removed':
        store.eventBus.emit('connection-removed', action.data);
        break;
        
      case 'variable-updated':
        const variable = store.variables.get(action.data.id);
        if (variable) {
          variable.update(action.data.value);
          store.eventBus.emit('variable-updated', action.data);
        }
        break;
        
      case 'variable-created':
        store.variables.set(action.data.id, action.data.variable);
        store.eventBus.emit('variable-created', action.data);
        break;
        
      case 'variable-deleted':
        store.variables.delete(action.data.id);
        store.eventBus.emit('variable-deleted', action.data);
        break;
    }
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
