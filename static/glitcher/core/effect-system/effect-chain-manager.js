/**
 * Effect Chain Manager
 * Manages the chain of effects, their order, and processing pipeline
 */

export class EffectChainManager {
  constructor() {
    this.chain = [];
    this.snapshots = [];
    this.currentSnapshot = -1;
    this.maxSnapshots = 10;
    this.selectedEffectId = null;
    
    // Event listeners
    this.listeners = {
      chainUpdate: [],
      effectUpdate: [],
      snapshotUpdate: [],
      chainUpdated: [],
      effectAdded: [],
      effectRemoved: [],
      effectSelected: [],
      effectMoved: [],
      chainCleared: [],
      effectEnabledChanged: [],
      soloChanged: []
    };
    
    // Performance tracking
    this.lastChainProcessTime = 0;
  }

  /**
   * Add an effect to the chain
   */
  addEffect(effectModule, position = -1) {
    if (position === -1) {
      this.chain.push(effectModule);
    } else {
      this.chain.splice(position, 0, effectModule);
    }
    
    this.notifyListeners('chainUpdate', {
      type: 'add',
      effect: effectModule,
      position: position === -1 ? this.chain.length - 1 : position
    });
    
    // Emit additional events for studio UI
    this.emit('chainUpdated', this.chain);
    this.emit('effectAdded', effectModule);
  }

  /**
   * Remove an effect from the chain
   */
  removeEffect(effectId) {
    const index = this.chain.findIndex(effect => effect.id === effectId);
    if (index !== -1) {
      const removed = this.chain.splice(index, 1)[0];
      this.notifyListeners('chainUpdate', {
        type: 'remove',
        effect: removed,
        position: index
      });
      
      // Emit additional events for studio UI
      this.emit('chainUpdated', this.chain);
      this.emit('effectRemoved', removed);
      
      // Clear selection if removed effect was selected
      if (this.selectedEffectId === effectId) {
        this.selectedEffectId = null;
        this.emit('effectSelected', null);
      }
      
      return removed;
    }
    return null;
  }

  /**
   * Move an effect to a new position
   */
  moveEffect(effectId, newPosition) {
    const currentIndex = this.chain.findIndex(e => e.id === effectId);
    if (currentIndex === -1 || currentIndex === newPosition) return false;
    
    const [effect] = this.chain.splice(currentIndex, 1);
    
    // Adjust position if needed after removal
    const adjustedPosition = newPosition > currentIndex ? newPosition - 1 : newPosition;
    this.chain.splice(adjustedPosition, 0, effect);
    
    this.notifyListeners('chainUpdate', {
      type: 'move',
      effect: effect,
      oldPosition: currentIndex,
      newPosition: adjustedPosition
    });
    
    // Emit additional events for studio UI
    this.emit('chainUpdated', this.chain);
    this.emit('effectMoved', { effect, oldPosition: currentIndex, newPosition: adjustedPosition });
    
    return true;
  }

  /**
   * Get effect by ID
   */
  getEffect(effectId) {
    return this.chain.find(effect => effect.id === effectId);
  }

  /**
   * Get effect position
   */
  getEffectPosition(effectId) {
    return this.chain.findIndex(effect => effect.id === effectId);
  }

  /**
   * Process the entire chain
   */
  processChain(inputImageData, selectionMask, context) {
    const startTime = performance.now();
    
    let currentData = inputImageData;
    
    // Check if any effects are soloed
    const soloedEffects = this.chain.filter(e => e.solo && e.enabled);
    const effectsToProcess = soloedEffects.length > 0 ? soloedEffects : this.chain.filter(e => e.enabled);
    
    // Process each effect in order
    for (const effect of effectsToProcess) {
      try {
        currentData = effect.process(currentData, selectionMask, context);
      } catch (error) {
        console.error(`Error processing effect ${effect.name}:`, error);
        // Continue with other effects
      }
    }
    
    this.lastChainProcessTime = performance.now() - startTime;
    
    return currentData;
  }

  /**
   * Save current chain state as snapshot
   */
  saveSnapshot(name) {
    const snapshot = {
      id: Date.now(),
      name: name || `Snapshot ${new Date().toLocaleTimeString()}`,
      timestamp: Date.now(),
      chain: this.chain.map(effect => effect.export())
    };
    
    // Add to snapshots, maintaining max limit
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
    
    this.currentSnapshot = this.snapshots.length - 1;
    
    this.notifyListeners('snapshotUpdate', {
      type: 'save',
      snapshot: snapshot
    });
    
    return snapshot;
  }

  /**
   * Load a snapshot
   */
  loadSnapshot(snapshotId) {
    const snapshotIndex = this.snapshots.findIndex(s => s.id === snapshotId);
    if (snapshotIndex === -1) return false;
    
    const snapshot = this.snapshots[snapshotIndex];
    
    // Import each effect's state
    snapshot.chain.forEach(effectConfig => {
      const effect = this.getEffect(effectConfig.id);
      if (effect) {
        effect.import(effectConfig);
      }
    });
    
    this.currentSnapshot = snapshotIndex;
    
    this.notifyListeners('snapshotUpdate', {
      type: 'load',
      snapshot: snapshot
    });
    
    return true;
  }

  /**
   * Clear all effects
   */
  clearChain() {
    this.chain = [];
    this.selectedEffectId = null;
    this.notifyListeners('chainUpdate', {
      type: 'clear'
    });
    
    // Emit additional events for studio UI
    this.emit('chainUpdated', this.chain);
    this.emit('chainCleared');
    this.emit('effectSelected', null);
  }

  /**
   * Enable all effects
   */
  enableAll() {
    this.chain.forEach(effect => {
      effect.enabled = true;
    });
    this.notifyListeners('chainUpdate', {
      type: 'enableAll'
    });
  }

  /**
   * Disable all effects
   */
  disableAll() {
    this.chain.forEach(effect => {
      effect.enabled = false;
    });
    this.notifyListeners('chainUpdate', {
      type: 'disableAll'
    });
  }

  /**
   * Clear solo on all effects
   */
  clearSolo() {
    this.chain.forEach(effect => {
      effect.solo = false;
    });
    this.notifyListeners('chainUpdate', {
      type: 'clearSolo'
    });
    
    // Emit for studio UI
    this.emit('soloChanged', null);
    this.emit('chainUpdated', this.chain);
  }

  /**
   * Update an effect and notify listeners
   */
  updateEffect(effect) {
    // Find the effect in the chain to ensure it exists
    const chainEffect = this.chain.find(e => e.id === effect.id);
    if (!chainEffect) {
      console.warn(`Effect ${effect.id} not found in chain`);
      return false;
    }
    
    // Notify listeners about the update
    this.notifyListeners('effectUpdate', {
      type: 'update',
      effect: effect
    });
    
    // Also notify chain update for UI refresh
    this.notifyListeners('chainUpdate', {
      type: 'effectUpdate',
      effect: effect
    });
    
    // Emit for studio UI
    this.emit('chainUpdated', this.chain);
    
    return true;
  }

  /**
   * Set solo on specific effect (clearing others)
   */
  setSolo(effectId) {
    this.chain.forEach(effect => {
      effect.solo = effect.id === effectId;
    });
    this.notifyListeners('chainUpdate', {
      type: 'setSolo',
      effectId: effectId
    });
    
    // Emit for studio UI
    this.emit('soloChanged', effectId);
    this.emit('chainUpdated', this.chain);
  }

  /**
   * Get chain performance info
   */
  getPerformanceInfo() {
    const effectPerformance = this.chain.map(effect => ({
      id: effect.id,
      name: effect.name,
      ...effect.getPerformanceInfo()
    }));
    
    return {
      chainProcessTime: this.lastChainProcessTime,
      effectCount: this.chain.length,
      enabledCount: this.chain.filter(e => e.enabled).length,
      effects: effectPerformance
    };
  }

  /**
   * Export entire chain configuration
   */
  exportChain() {
    return {
      version: '1.0',
      timestamp: Date.now(),
      chain: this.chain.map(effect => effect.export())
    };
  }

  /**
   * Import chain configuration
   */
  importChain(config) {
    if (!config || config.version !== '1.0') {
      console.error('Invalid chain configuration');
      return false;
    }
    
    // Clear current chain
    this.clearChain();
    
    // Import effects (this assumes effects are already created and just need config)
    // In a full implementation, you'd need an effect factory to recreate effects
    config.chain.forEach(effectConfig => {
      // This is a placeholder - you'd need to recreate effects from config
      console.log('Would import effect:', effectConfig);
    });
    
    return true;
  }

  /**
   * Get chain summary for UI
   */
  getChainSummary() {
    return this.chain.map(effect => ({
      id: effect.id,
      name: effect.name,
      type: effect.type,
      category: effect.category,
      mode: effect.mode,
      enabled: effect.enabled,
      solo: effect.solo,
      position: this.chain.indexOf(effect)
    }));
  }

  /**
   * Optimize chain for performance
   */
  optimizeChain() {
    // Sort effects by category for better cache usage
    // Keep relative order within categories
    const optimized = [];
    const categories = ['adjustment', 'destructive', 'filter'];
    
    categories.forEach(category => {
      optimized.push(...this.chain.filter(e => e.category === category));
    });
    
    this.chain = optimized;
    this.notifyListeners('chainUpdate', {
      type: 'optimize'
    });
  }

  /**
   * Add event listener
   */
  addEventListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Remove event listener
   */
  removeEventListener(event, callback) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(callback);
      if (index !== -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }

  /**
   * Notify listeners
   */
  notifyListeners(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }
  
  /**
   * Select an effect
   */
  selectEffect(effectId) {
    this.selectedEffectId = effectId;
    const effect = this.chain.find(e => e.id === effectId);
    this.emit('effectSelected', effect);
  }
  
  /**
   * Set effect enabled state
   */
  setEffectEnabled(effectId, enabled) {
    const effect = this.chain.find(e => e.id === effectId);
    if (effect) {
      effect.enabled = enabled;
      this.emit('effectEnabledChanged', { effect, enabled });
      this.emit('chainUpdated', this.chain);
    }
  }
  
  /**
   * Alias for addEventListener to match expected API
   */
  on(event, callback) {
    this.addEventListener(event, callback);
  }
  
  /**
   * Alias for removeEventListener to match expected API
   */
  off(event, callback) {
    this.removeEventListener(event, callback);
  }
  
  /**
   * Alias for notifyListeners to match expected API
   */
  emit(event, data) {
    this.notifyListeners(event, data);
  }
}