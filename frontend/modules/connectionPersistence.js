import { store } from './store';

export class ConnectionPersistence {
  constructor() {
    this.storageKey = 'synthograsizer_connections';
    this.connections = new Map();
    this.loadConnections();
  }

  saveConnection(variableId, paramPath) {
    const connection = {
      variableId,
      paramPath,
      timestamp: Date.now()
    };
    
    this.connections.set(variableId, connection);
    this.persistConnections();
  }

  loadConnections() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        this.connections = new Map(Object.entries(data));
      }
      return Array.from(this.connections.values());
    } catch (err) {
      console.warn('Failed to load connections:', err);
      return [];
    }
  }

  persistConnections() {
    try {
      const data = Object.fromEntries(this.connections);
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save connections:', err);
    }
  }

  removeConnection(variableId) {
    this.connections.delete(variableId);
    this.persistConnections();
  }

  clear() {
    this.connections.clear();
    this.persistConnections();
  }
}
