import { store } from './store';
import { ConnectionPersistence } from './connectionPersistence';
import _ from 'lodash';

export class P5Binder {
  constructor() {
    this.bindings = new Map();
    this.persistence = new ConnectionPersistence();
  }

  createBinding(variableId, p5sketch, paramPath) {
    // Remove existing binding if any
    this.removeBinding(paramPath);
    
    const binding = {
      variableId,
      paramPath,
      unsubscribe: store.eventBus.on('variable-updated', ({ id, value }) => {
        if (id === variableId) {
          this.updateSketch(paramPath, value);
        }
      })
    };
    
    this.bindings.set(paramPath, binding);
    this.persistence.saveConnection(variableId, paramPath);
    
    store.eventBus.emit('binding-created', { variableId, paramPath });
  }

  removeBinding(paramPath) {
    const binding = this.bindings.get(paramPath);
    if (binding) {
      binding.unsubscribe();
      this.bindings.delete(paramPath);
      this.persistence.removeConnection(binding.variableId);
      store.eventBus.emit('binding-removed', { 
        variableId: binding.variableId, 
        paramPath 
      });
    }
  }

  restoreBindings() {
    const connections = this.persistence.loadConnections();
    connections.forEach(conn => {
      const variable = store.variables.get(conn.variableId);
      if (variable) {
        this.createBinding(conn.variableId, store.currentSketch, conn.paramPath);
      }
    });
  }

  updateSketch(paramPath, value) {
    if (store.currentSketch) {
      _.set(store.currentSketch, paramPath, value);
    }
  }
}
