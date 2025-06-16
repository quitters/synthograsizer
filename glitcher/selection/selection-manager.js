/**
 * Selection Manager for Glitcher App
 * Coordinates all selection functionality including manual tools and automatic algorithms
 * Maintains selection state and provides interface for effects integration
 */

import { SelectionEngine } from './selection-engine.js';

export class SelectionManager {
  constructor(canvasManager) {
    this.canvasManager = canvasManager;
    
    // Selection state
    this.selectionMask = null;
    this.selectionEngine = null;
    this.isManualMode = false;
    this.currentTool = 'none';
    
    // Interactive tool state
    this.isDrawing = false;
    this.tempSelection = null;
    this.lastMousePos = { x: 0, y: 0 };
    this.lassoPath = [];
    this.brushCursorPos = { x: -1, y: -1 };
    
    // Selection history
    this.selectionHistory = [];
    this.maxHistorySize = 10;
    
    // Preview settings
    this.showSelectionPreview = false;
    this.selectionPreviewOpacity = 0.3;
    
    // Callbacks
    this.onSelectionChangeCallbacks = [];
    
    // Initialize when canvas manager has an image
    this.canvasManager.onImageLoad((imageData, width, height) => {
      this.initializeForImage(imageData, width, height);
    });
  }

  /**
   * Initialize selection system for a new image
   * @param {ImageData} imageData - Image data
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  initializeForImage(imageData, width, height) {
    console.log('🎯 Initializing selection system for image:', width, 'x', height);
    
    // Initialize selection mask
    this.initializeSelectionMask(width, height);
    
    // Initialize selection engine
    this.selectionEngine = new SelectionEngine(imageData, width, height);
    
    // Clear any existing selections
    this.clearSelections();
    
    console.log('✅ Selection system initialized');
  }

  /**
   * Initialize selection mask for current image dimensions
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  initializeSelectionMask(width, height) {
    if (width > 0 && height > 0) {
      this.selectionMask = new Uint8Array(width * height);
      console.log('📋 Selection mask initialized:', width * height, 'pixels');
    }
  }

  /**
   * Generate automatic selections using the selection engine
   * @param {string} method - Selection method
   * @param {Object} config - Configuration parameters
   * @returns {Array} Array of selection regions
   */
  generateAutomaticSelections(method, config) {
    if (!this.selectionEngine) {
      console.warn('Selection engine not initialized');
      return [];
    }

    const selections = this.selectionEngine.generateSelections(method, config);
    
    // Save to history
    if (selections.length > 0) {
      this.saveSelectionHistory(selections, method, config);
    }
    
    console.log(`🎯 Generated ${selections.length} selections using method: ${method}`);
    return selections;
  }

  /**
   * Convert selection regions to active clumps for effects
   * @param {Array} selections - Array of selection regions
   * @param {number} minLifetime - Minimum effect lifetime
   * @param {number} maxLifetime - Maximum effect lifetime
   * @returns {Array} Array of active clumps
   */
  selectionsToClumps(selections, minLifetime = 30, maxLifetime = 150) {
    const clumps = [];
    
    selections.forEach(selection => {
      const framesRemaining = Math.floor(Math.random() * (maxLifetime - minLifetime)) + minLifetime;
      
      // Determine direction for random movement
      let clumpDirection = null;
      const directions = ['down', 'up', 'left', 'right'];
      clumpDirection = directions[Math.floor(Math.random() * directions.length)];
      
      clumps.push({
        x: selection.x,
        y: selection.y,
        w: selection.w,
        h: selection.h,
        framesRemaining,
        clumpDirection
      });
    });
    
    return clumps;
  }

  /**
   * Convert selection mask to rectangular regions
   * @returns {Array} Array of rectangular regions from selection mask
   */
  maskToRegions() {
    if (!this.selectionMask || !this.canvasManager.isImageLoaded()) {
      return [];
    }

    const { width, height } = this.canvasManager.getImageDimensions();
    const regions = [];
    const visited = new Uint8Array(width * height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        if (this.selectionMask[idx] && !visited[idx]) {
          const region = this.findConnectedRegion(x, y, visited, width, height);
          if (region.pixels > 50) { // Minimum size threshold
            regions.push({
              x: region.minX,
              y: region.minY,
              w: region.maxX - region.minX + 1,
              h: region.maxY - region.minY + 1
            });
          }
        }
      }
    }
    
    console.log(`📍 Converted mask to ${regions.length} regions`);
    return regions;
  }

  /**
   * Find connected region starting from a point
   * @param {number} startX - Starting X coordinate
   * @param {number} startY - Starting Y coordinate
   * @param {Uint8Array} visited - Visited pixels array
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Object} Region information
   */
  findConnectedRegion(startX, startY, visited, width, height) {
    const stack = [[startX, startY]];
    const region = {
      pixels: 0,
      minX: startX,
      maxX: startX,
      minY: startY,
      maxY: startY
    };
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = y * width + x;
      
      if (x < 0 || x >= width || y < 0 || y >= height || 
          visited[idx] || !this.selectionMask[idx]) {
        continue;
      }
      
      visited[idx] = 1;
      region.pixels++;
      region.minX = Math.min(region.minX, x);
      region.maxX = Math.max(region.maxX, x);
      region.minY = Math.min(region.minY, y);
      region.maxY = Math.max(region.maxY, y);
      
      // Add neighbors
      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }
    
    return region;
  }

  /**
   * Apply rectangular selection to mask
   * @param {Object} selection - Selection rectangle {startX, startY, endX, endY}
   */
  applyRectSelection(selection) {
    if (!this.selectionMask) return;
    
    const { width, height } = this.canvasManager.getImageDimensions();
    const minX = Math.min(selection.startX, selection.endX);
    const maxX = Math.max(selection.startX, selection.endX);
    const minY = Math.min(selection.startY, selection.endY);
    const maxY = Math.max(selection.startY, selection.endY);
    
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          this.selectionMask[y * width + x] = 255;
        }
      }
    }
    
    this.notifySelectionChange();
    console.log('🔲 Applied rectangular selection:', minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * Apply brush selection to mask
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} brushSize - Brush size
   */
  applyBrushSelection(x, y, brushSize) {
    if (!this.selectionMask) return;
    
    const { width, height } = this.canvasManager.getImageDimensions();
    const radius = brushSize / 2;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const px = Math.floor(x + dx);
          const py = Math.floor(y + dy);
          
          if (px >= 0 && px < width && py >= 0 && py < height) {
            this.selectionMask[py * width + px] = 255;
          }
        }
      }
    }
    
    this.notifySelectionChange();
  }

  /**
   * Apply line selection between two points (for brush dragging)
   * @param {number} x1 - Start X coordinate
   * @param {number} y1 - Start Y coordinate
   * @param {number} x2 - End X coordinate
   * @param {number} y2 - End Y coordinate
   * @param {number} brushSize - Brush size
   */
  applyLineSelection(x1, y1, x2, y2, brushSize) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    
    while (true) {
      this.applyBrushSelection(x1, y1, brushSize);
      
      if (x1 === x2 && y1 === y2) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x1 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y1 += sy;
      }
    }
  }

  /**
   * Apply magic wand selection (select similar colors)
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} tolerance - Color tolerance
   */
  applyWandSelection(x, y, tolerance = 30) {
    if (!this.selectionMask || !this.canvasManager.glitchImageData) return;
    
    const { width, height } = this.canvasManager.getImageDimensions();
    const imageData = this.canvasManager.glitchImageData;
    
    const idx = (y * width + x) * 4;
    const targetR = imageData.data[idx];
    const targetG = imageData.data[idx + 1];
    const targetB = imageData.data[idx + 2];
    
    const visited = new Uint8Array(width * height);
    const stack = [[x, y]];
    
    while (stack.length > 0) {
      const [cx, cy] = stack.pop();
      const cidx = cy * width + cx;
      
      if (cx < 0 || cx >= width || cy < 0 || cy >= height || visited[cidx]) {
        continue;
      }
      
      visited[cidx] = 1;
      
      const pidx = cidx * 4;
      const r = imageData.data[pidx];
      const g = imageData.data[pidx + 1];
      const b = imageData.data[pidx + 2];
      
      const colorDiff = Math.sqrt(
        (r - targetR) ** 2 + 
        (g - targetG) ** 2 + 
        (b - targetB) ** 2
      );
      
      if (colorDiff <= tolerance) {
        this.selectionMask[cidx] = 255;
        
        // Add neighbors
        stack.push([cx + 1, cy]);
        stack.push([cx - 1, cy]);
        stack.push([cx, cy + 1]);
        stack.push([cx, cy - 1]);
      }
    }
    
    this.notifySelectionChange();
    console.log('✨ Applied magic wand selection at:', x, y);
  }

  /**
   * Apply lasso selection (polygon selection)
   * @param {Array} path - Array of {x, y} points defining the polygon
   */
  applyLassoSelection(path) {
    if (!this.selectionMask || path.length < 3) return;
    
    const { width, height } = this.canvasManager.getImageDimensions();
    
    // Find bounding box
    let minX = width, maxX = 0, minY = height, maxY = 0;
    
    path.forEach(point => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });
    
    // Check each point in bounding box
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.isPointInPolygon(x, y, path)) {
          if (x >= 0 && x < width && y >= 0 && y < height) {
            this.selectionMask[y * width + x] = 255;
          }
        }
      }
    }
    
    this.notifySelectionChange();
    console.log('🔗 Applied lasso selection with', path.length, 'points');
  }

  /**
   * Check if point is inside polygon using ray casting algorithm
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {Array} polygon - Array of {x, y} points
   * @returns {boolean} True if point is inside polygon
   */
  isPointInPolygon(x, y, polygon) {
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      const intersect = ((yi > y) !== (yj > y)) && 
                       (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }

  /**
   * Clear all selections
   */
  clearSelections() {
    if (this.selectionMask) {
      this.selectionMask.fill(0);
      this.notifySelectionChange();
      console.log('🗑️ Cleared all selections');
    }
  }

  /**
   * Invert current selection
   */
  invertSelection() {
    if (this.selectionMask) {
      for (let i = 0; i < this.selectionMask.length; i++) {
        this.selectionMask[i] = this.selectionMask[i] ? 0 : 255;
      }
      this.notifySelectionChange();
      console.log('🔄 Inverted selection');
    }
  }

  /**
   * Save selection to history
   * @param {Array} selections - Array of selection regions
   * @param {string} method - Selection method used
   * @param {Object} config - Configuration used
   */
  saveSelectionHistory(selections, method, config) {
    this.selectionHistory.push({
      timestamp: Date.now(),
      method: method,
      config: { ...config },
      selections: selections.map(s => ({ ...s }))
    });
    
    // Keep history size limited
    if (this.selectionHistory.length > this.maxHistorySize) {
      this.selectionHistory.shift();
    }
  }

  /**
   * Get last selection from history
   * @returns {Object|null} Last selection or null
   */
  getLastSelection() {
    if (this.selectionHistory.length > 0) {
      return this.selectionHistory[this.selectionHistory.length - 1];
    }
    return null;
  }

  /**
   * Replay last selection
   * @returns {Array} Array of clumps from last selection
   */
  replayLastSelection() {
    const lastSelection = this.getLastSelection();
    if (lastSelection && this.selectionEngine) {
      const clumps = this.selectionsToClumps(lastSelection.selections);
      console.log('🔄 Replayed last selection:', clumps.length, 'clumps');
      return clumps;
    }
    return [];
  }

  /**
   * Draw selection preview overlay on canvas
   * @param {Array} activeClumps - Currently active clumps
   */
  drawSelectionPreview(activeClumps) {
    if (!this.showSelectionPreview || !this.canvasManager.ctx) return;
    
    const ctx = this.canvasManager.ctx;
    ctx.save();
    
    // Draw automatic selections (clumps)
    if (activeClumps && activeClumps.length > 0) {
      ctx.fillStyle = `rgba(78, 205, 196, ${this.selectionPreviewOpacity})`;
      ctx.strokeStyle = 'rgba(78, 205, 196, 0.8)';
      ctx.lineWidth = 2;
      
      activeClumps.forEach(clump => {
        // Fill with semi-transparent color
        ctx.fillRect(clump.x, clump.y, clump.w, clump.h);
        
        // Draw border
        ctx.strokeRect(clump.x, clump.y, clump.w, clump.h);
      });
    }
    
    ctx.restore();
  }

  /**
   * Draw interactive selection overlay
   */
  drawInteractiveSelectionOverlay() {
    if (!this.canvasManager.ctx) return;
    
    // Always show active tool interactions, but only show selection mask when preview is enabled
    const showSelectionMask = this.showSelectionPreview;
    const showActiveToolOnly = this.currentTool !== 'none';
    
    const ctx = this.canvasManager.ctx;
    const { width, height } = this.canvasManager.getImageDimensions();
    
    ctx.save();
    
    // Draw selection mask as actual selected pixels (only when preview is enabled)
    if (showSelectionMask && this.selectionMask) {
      // Use globalCompositeOperation to overlay selection on top of image
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(78, 205, 196, 0.3)';
      
      // Draw each selected pixel as a small rectangle for overlay effect
      for (let i = 0; i < this.selectionMask.length; i++) {
        if (this.selectionMask[i]) {
          const x = i % width;
          const y = Math.floor(i / width);
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    
    // Draw temp selection (for select tool)
    if (this.tempSelection && this.currentTool === 'select' && this.isDrawing) {
      ctx.strokeStyle = 'rgba(78, 205, 196, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      const x = Math.min(this.tempSelection.startX, this.tempSelection.endX);
      const y = Math.min(this.tempSelection.startY, this.tempSelection.endY);
      const w = Math.abs(this.tempSelection.endX - this.tempSelection.startX);
      const h = Math.abs(this.tempSelection.endY - this.tempSelection.startY);
      
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
    
    // Draw lasso path
    if (this.lassoPath.length > 1 && this.currentTool === 'lasso' && this.isDrawing) {
      ctx.strokeStyle = 'rgba(78, 205, 196, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      ctx.beginPath();
      ctx.moveTo(this.lassoPath[0].x, this.lassoPath[0].y);
      
      for (let i = 1; i < this.lassoPath.length; i++) {
        ctx.lineTo(this.lassoPath[i].x, this.lassoPath[i].y);
      }
      
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // Draw brush cursor
    if (this.currentTool === 'brush' && this.brushCursorPos.x >= 0 && this.brushCursorPos.y >= 0) {
      const brushSize = 30; // Default brush size, should be passed as parameter
      ctx.strokeStyle = 'rgba(78, 205, 196, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.brushCursorPos.x, this.brushCursorPos.y, brushSize / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    ctx.restore();
  }

  /**
   * Helper function to find bounds of a selection region
   * @param {number} startX - Starting X coordinate
   * @param {number} startY - Starting Y coordinate
   * @param {Uint8Array} visited - Visited pixels array
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Object} Region bounds
   */
  findSelectionRegionBounds(startX, startY, visited, width, height) {
    const stack = [[startX, startY]];
    const region = {
      x: startX,
      y: startY,
      w: 1,
      h: 1,
      minX: startX,
      maxX: startX,
      minY: startY,
      maxY: startY
    };
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = y * width + x;
      
      if (x < 0 || x >= width || y < 0 || y >= height || 
          visited[idx] || !this.selectionMask[idx]) {
        continue;
      }
      
      visited[idx] = 1;
      region.minX = Math.min(region.minX, x);
      region.maxX = Math.max(region.maxX, x);
      region.minY = Math.min(region.minY, y);
      region.maxY = Math.max(region.maxY, y);
      
      // Add neighbors
      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }
    
    region.x = region.minX;
    region.y = region.minY;
    region.w = region.maxX - region.minX + 1;
    region.h = region.maxY - region.minY + 1;
    
    return region;
  }

  /**
   * Set manual selection mode
   * @param {boolean} isManual - True for manual mode
   */
  setManualMode(isManual) {
    this.isManualMode = isManual;
    console.log('👋 Manual selection mode:', isManual ? 'enabled' : 'disabled');
  }

  /**
   * Set current interactive tool
   * @param {string} tool - Tool name ('select', 'brush', 'wand', 'lasso', 'none')
   */
  setCurrentTool(tool) {
    this.currentTool = tool;
    console.log('🛠️ Current tool:', tool);
  }

  /**
   * Set selection preview visibility
   * @param {boolean} show - True to show preview
   */
  setPreviewVisibility(show) {
    this.showSelectionPreview = show;
  }

  /**
   * Update brush cursor position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  updateBrushCursor(x, y) {
    this.brushCursorPos.x = x;
    this.brushCursorPos.y = y;
  }

  /**
   * Start interactive drawing
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {Object} options - Tool options
   */
  startDrawing(x, y, options = {}) {
    this.isDrawing = true;
    this.lastMousePos = { x, y };
    
    switch (this.currentTool) {
      case 'select':
        this.tempSelection = { startX: x, startY: y, endX: x, endY: y };
        break;
        
      case 'brush':
        this.applyBrushSelection(x, y, options.brushSize || 30);
        break;
        
      case 'wand':
        this.applyWandSelection(x, y, options.tolerance || 30);
        break;
        
      case 'lasso':
        this.lassoPath = [{ x, y }];
        break;
    }
  }

  /**
   * Continue interactive drawing
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {Object} options - Tool options
   */
  continueDrawing(x, y, options = {}) {
    if (!this.isDrawing) return;
    
    switch (this.currentTool) {
      case 'select':
        if (this.tempSelection) {
          this.tempSelection.endX = x;
          this.tempSelection.endY = y;
        }
        break;
        
      case 'brush':
        this.applyLineSelection(
          this.lastMousePos.x, 
          this.lastMousePos.y, 
          x, 
          y, 
          options.brushSize || 30
        );
        this.lastMousePos = { x, y };
        break;
        
      case 'lasso':
        this.lassoPath.push({ x, y });
        break;
    }
  }

  /**
   * End interactive drawing
   */
  endDrawing() {
    if (!this.isDrawing) return;
    
    this.isDrawing = false;
    
    switch (this.currentTool) {
      case 'select':
        if (this.tempSelection) {
          this.applyRectSelection(this.tempSelection);
          this.tempSelection = null;
        }
        break;
        
      case 'lasso':
        if (this.lassoPath.length > 2) {
          this.applyLassoSelection(this.lassoPath);
        }
        this.lassoPath = [];
        break;
    }
  }

  /**
   * Get current selection mask
   * @returns {Uint8Array|null} Selection mask
   */
  getSelectionMask() {
    return this.selectionMask;
  }

  /**
   * Check if in manual selection mode
   * @returns {boolean} True if in manual mode
   */
  isInManualMode() {
    return this.isManualMode;
  }

  /**
   * Add callback for selection changes
   * @param {Function} callback - Callback function
   */
  onSelectionChange(callback) {
    this.onSelectionChangeCallbacks.push(callback);
  }

  /**
   * Notify all callbacks of selection change
   */
  notifySelectionChange() {
    this.onSelectionChangeCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in selection change callback:', error);
      }
    });
  }

  /**
   * Update selection engine with new image data
   * @param {ImageData} imageData - New image data
   */
  updateImageData(imageData) {
    if (this.selectionEngine) {
      const { width, height } = this.canvasManager.getImageDimensions();
      this.selectionEngine.updateImageData(imageData, width, height);
    }
  }

  /**
   * Get debug information about current state
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    const { width, height } = this.canvasManager.getImageDimensions() || { width: 0, height: 0 };
    
    return {
      isInitialized: !!this.selectionMask,
      imageSize: `${width}x${height}`,
      maskSize: this.selectionMask ? this.selectionMask.length : 0,
      isManualMode: this.isManualMode,
      currentTool: this.currentTool,
      isDrawing: this.isDrawing,
      selectionCount: this.selectionMask ? 
        this.selectionMask.reduce((sum, val) => sum + (val > 0 ? 1 : 0), 0) : 0,
      historyLength: this.selectionHistory.length
    };
  }
}
