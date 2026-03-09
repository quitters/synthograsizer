/**
 * Base class for all effect modules in the new effects studio architecture.
 * Supports both destructive and non-destructive processing modes.
 */

import { copyImageData } from '../../utils/image-utils.js';

export class EffectModule {
  constructor(config) {
    // Basic identification
    this.id = config.id;
    this.name = config.name;
    this.type = config.type; // 'movement', 'distortion', 'color', 'filter', etc.
    this.category = config.category; // 'destructive', 'filter', 'adjustment'
    this.icon = config.icon || '◆';
    
    // Processing mode
    this.mode = config.defaultMode || 'destructive'; // 'destructive' or 'non-destructive'
    
    // State
    this.enabled = true;
    this.solo = false;
    this.locked = false;
    
    // Parameters with defaults
    this.parameters = { ...config.defaultParameters };
    this.parameterConfig = config.parameterConfig || {};
    
    // Processing function
    this.processFunction = config.processFunction;
    
    // Non-destructive mode data
    this.nonDestructiveData = null;
    
    // Performance metrics
    this.lastProcessTime = 0;
    this.averageProcessTime = 0;
    this.processCount = 0;
  }

  /**
   * Main processing entry point
   */
  process(inputData, selectionMask, context) {
    if (!this.enabled) return inputData;
    
    const startTime = performance.now();
    
    let result;
    if (this.mode === 'destructive') {
      result = this.processDestructive(inputData, selectionMask, context);
    } else {
      result = this.processNonDestructive(inputData, selectionMask, context);
    }
    
    // Update performance metrics
    const processingTime = performance.now() - startTime;
    this.updatePerformanceMetrics(processingTime);
    
    return result;
  }

  /**
   * Destructive processing - modifies input data directly
   */
  processDestructive(inputData, selectionMask, context) {
    // For destructive mode, we modify the input directly
    this.processFunction(inputData, this.parameters, selectionMask, context);
    return inputData;
  }

  /**
   * Non-destructive processing - creates new data
   */
  processNonDestructive(inputData, selectionMask, context) {
    // Create a working copy
    const workingData = copyImageData(inputData);
    
    // Store original for blending
    this.nonDestructiveData = {
      original: inputData,
      processed: workingData
    };
    
    // Apply effect to the copy
    this.processFunction(workingData, this.parameters, selectionMask, context);
    
    // Blend with original based on opacity
    const opacity = this.parameters.opacity !== undefined ? this.parameters.opacity : 1.0;
    const blendMode = this.parameters.blendMode || 'normal';
    
    return this.blendImageData(inputData, workingData, opacity, blendMode);
  }

  /**
   * Blend two ImageData objects
   */
  blendImageData(original, processed, opacity, blendMode = 'normal') {
    const output = copyImageData(original);
    const data = output.data;
    const origData = original.data;
    const procData = processed.data;
    
    for (let i = 0; i < data.length; i += 4) {
      let r, g, b;
      
      switch (blendMode) {
        case 'multiply':
          r = (origData[i] * procData[i]) / 255;
          g = (origData[i + 1] * procData[i + 1]) / 255;
          b = (origData[i + 2] * procData[i + 2]) / 255;
          break;
          
        case 'screen':
          r = 255 - ((255 - origData[i]) * (255 - procData[i])) / 255;
          g = 255 - ((255 - origData[i + 1]) * (255 - procData[i + 1])) / 255;
          b = 255 - ((255 - origData[i + 2]) * (255 - procData[i + 2])) / 255;
          break;
          
        case 'overlay':
          r = origData[i] < 128 ? 
            (2 * origData[i] * procData[i]) / 255 : 
            255 - (2 * (255 - origData[i]) * (255 - procData[i])) / 255;
          g = origData[i + 1] < 128 ? 
            (2 * origData[i + 1] * procData[i + 1]) / 255 : 
            255 - (2 * (255 - origData[i + 1]) * (255 - procData[i + 1])) / 255;
          b = origData[i + 2] < 128 ? 
            (2 * origData[i + 2] * procData[i + 2]) / 255 : 
            255 - (2 * (255 - origData[i + 2]) * (255 - procData[i + 2])) / 255;
          break;
          
        case 'normal':
        default:
          r = procData[i];
          g = procData[i + 1];
          b = procData[i + 2];
          break;
      }
      
      // Apply opacity
      data[i] = origData[i] + (r - origData[i]) * opacity;
      data[i + 1] = origData[i + 1] + (g - origData[i + 1]) * opacity;
      data[i + 2] = origData[i + 2] + (b - origData[i + 2]) * opacity;
      data[i + 3] = origData[i + 3]; // Keep original alpha
    }
    
    return output;
  }

  /**
   * Update parameter value
   */
  setParameter(name, value) {
    if (this.parameters.hasOwnProperty(name)) {
      this.parameters[name] = value;
      return true;
    }
    return false;
  }

  /**
   * Get parameter value
   */
  getParameter(name) {
    return this.parameters[name];
  }

  /**
   * Set all parameters at once
   */
  setParameters(params) {
    Object.assign(this.parameters, params);
  }

  /**
   * Toggle between destructive and non-destructive modes
   */
  toggleMode() {
    this.mode = this.mode === 'destructive' ? 'non-destructive' : 'destructive';
    // Clear non-destructive data when switching modes
    this.nonDestructiveData = null;
  }

  /**
   * Set processing mode
   */
  setMode(mode) {
    if (mode === 'destructive' || mode === 'non-destructive') {
      this.mode = mode;
      this.nonDestructiveData = null;
    }
  }

  /**
   * Toggle enabled state
   */
  toggleEnabled() {
    this.enabled = !this.enabled;
  }

  /**
   * Toggle solo state
   */
  toggleSolo() {
    this.solo = !this.solo;
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(processingTime) {
    this.lastProcessTime = processingTime;
    this.processCount++;
    
    // Calculate running average
    this.averageProcessTime = 
      (this.averageProcessTime * (this.processCount - 1) + processingTime) / this.processCount;
  }

  /**
   * Get performance info
   */
  getPerformanceInfo() {
    return {
      lastProcessTime: this.lastProcessTime,
      averageProcessTime: this.averageProcessTime,
      processCount: this.processCount
    };
  }

  /**
   * Clone this effect module
   */
  clone() {
    return new EffectModule({
      id: this.id + '_clone_' + Date.now(),
      name: this.name + ' (Copy)',
      type: this.type,
      category: this.category,
      icon: this.icon,
      defaultMode: this.mode,
      defaultParameters: { ...this.parameters },
      parameterConfig: this.parameterConfig,
      processFunction: this.processFunction
    });
  }

  /**
   * Export effect configuration
   */
  export() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      category: this.category,
      mode: this.mode,
      enabled: this.enabled,
      parameters: { ...this.parameters }
    };
  }

  /**
   * Import effect configuration
   */
  import(config) {
    if (config.mode) this.mode = config.mode;
    if (config.enabled !== undefined) this.enabled = config.enabled;
    if (config.parameters) this.setParameters(config.parameters);
  }

  /**
   * Reset to default parameters
   */
  reset() {
    // This would need access to the original default parameters
    // For now, just reset some common ones
    if (this.parameters.opacity !== undefined) this.parameters.opacity = 1.0;
    if (this.parameters.blendMode !== undefined) this.parameters.blendMode = 'normal';
    this.enabled = true;
    this.solo = false;
    this.mode = 'destructive';
  }
}