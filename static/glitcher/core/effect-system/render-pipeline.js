/**
 * Render Pipeline
 * Manages different rendering modes and visualization options
 */

import { copyImageData } from '../../utils/image-utils.js';

export class RenderPipeline {
  constructor(canvasManager) {
    this.canvasManager = canvasManager;
    
    // Rendering modes
    this.renderMode = 'final'; // 'final', 'preview', 'comparison'
    this.comparisonMode = 'side-by-side'; // 'side-by-side', 'split', 'onion-skin'
    
    // Split view position
    this.splitPosition = 0.5; // 0-1 normalized position
    this.splitOrientation = 'vertical'; // 'vertical' or 'horizontal'
    
    // Preview settings
    this.previewOpacity = 0.5;
    this.showOriginal = false;
    
    // Comparison canvas for complex renders
    this.comparisonCanvas = null;
    this.comparisonCtx = null;
    this.initComparisonCanvas();
    
    // Performance
    this.lastRenderTime = 0;
  }

  /**
   * Initialize comparison canvas for complex rendering modes
   */
  initComparisonCanvas() {
    this.comparisonCanvas = document.createElement('canvas');
    this.comparisonCtx = this.comparisonCanvas.getContext('2d');
  }

  /**
   * Main render method
   */
  render(originalData, processedData, options = {}) {
    const startTime = performance.now();
    
    switch (this.renderMode) {
      case 'final':
        this.renderFinal(processedData);
        break;
        
      case 'preview':
        this.renderPreview(originalData, processedData, options);
        break;
        
      case 'comparison':
        this.renderComparison(originalData, processedData, options);
        break;
        
      default:
        this.renderFinal(processedData);
    }
    
    this.lastRenderTime = performance.now() - startTime;
  }

  /**
   * Render final processed image
   */
  renderFinal(imageData) {
    this.canvasManager.ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Render preview with original visible
   */
  renderPreview(originalData, processedData, options = {}) {
    const ctx = this.canvasManager.ctx;
    const canvas = this.canvasManager.canvas;
    
    // Put original first
    ctx.putImageData(originalData, 0, 0);
    
    // Create temp canvas for processed
    this.comparisonCanvas.width = canvas.width;
    this.comparisonCanvas.height = canvas.height;
    this.comparisonCtx.putImageData(processedData, 0, 0);
    
    // Draw processed with opacity
    ctx.save();
    ctx.globalAlpha = options.opacity || this.previewOpacity;
    ctx.drawImage(this.comparisonCanvas, 0, 0);
    ctx.restore();
  }

  /**
   * Render comparison view
   */
  renderComparison(originalData, processedData, options = {}) {
    switch (this.comparisonMode) {
      case 'side-by-side':
        this.renderSideBySide(originalData, processedData, options);
        break;
        
      case 'split':
        this.renderSplit(originalData, processedData, options);
        break;
        
      case 'onion-skin':
        this.renderOnionSkin(originalData, processedData, options);
        break;
        
      case 'difference':
        this.renderDifference(originalData, processedData, options);
        break;
        
      case 'checkerboard':
        this.renderCheckerboard(originalData, processedData, options);
        break;
    }
  }

  /**
   * Render side-by-side comparison
   */
  renderSideBySide(originalData, processedData, options = {}) {
    const ctx = this.canvasManager.ctx;
    const width = this.canvasManager.canvas.width;
    const height = this.canvasManager.canvas.height;
    
    // Prepare comparison canvas
    this.comparisonCanvas.width = width;
    this.comparisonCanvas.height = height;
    
    if (this.splitOrientation === 'vertical') {
      const splitX = Math.floor(width / 2);
      
      // Draw original on left
      this.comparisonCtx.putImageData(originalData, 0, 0);
      ctx.drawImage(this.comparisonCanvas, 0, 0, splitX, height, 0, 0, splitX, height);
      
      // Draw processed on right
      this.comparisonCtx.putImageData(processedData, 0, 0);
      ctx.drawImage(this.comparisonCanvas, splitX, 0, width - splitX, height, splitX, 0, width - splitX, height);
      
      // Draw divider line
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, height);
      ctx.stroke();
    } else {
      const splitY = Math.floor(height / 2);
      
      // Draw original on top
      this.comparisonCtx.putImageData(originalData, 0, 0);
      ctx.drawImage(this.comparisonCanvas, 0, 0, width, splitY, 0, 0, width, splitY);
      
      // Draw processed on bottom
      this.comparisonCtx.putImageData(processedData, 0, 0);
      ctx.drawImage(this.comparisonCanvas, 0, splitY, width, height - splitY, 0, splitY, width, height - splitY);
      
      // Draw divider line
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, splitY);
      ctx.lineTo(width, splitY);
      ctx.stroke();
    }
  }

  /**
   * Render split view with movable divider
   */
  renderSplit(originalData, processedData, options = {}) {
    const ctx = this.canvasManager.ctx;
    const width = this.canvasManager.canvas.width;
    const height = this.canvasManager.canvas.height;
    
    // Prepare canvases
    this.comparisonCanvas.width = width;
    this.comparisonCanvas.height = height;
    
    const splitPos = options.splitPosition || this.splitPosition;
    
    if (this.splitOrientation === 'vertical') {
      const splitX = Math.floor(width * splitPos);
      
      // Draw original up to split
      this.comparisonCtx.putImageData(originalData, 0, 0);
      ctx.drawImage(this.comparisonCanvas, 0, 0, splitX, height, 0, 0, splitX, height);
      
      // Draw processed after split
      this.comparisonCtx.putImageData(processedData, 0, 0);
      ctx.drawImage(this.comparisonCanvas, splitX, 0, width - splitX, height, splitX, 0, width - splitX, height);
      
      // Draw handle
      this.drawSplitHandle(splitX, 0, splitX, height);
    } else {
      const splitY = Math.floor(height * splitPos);
      
      // Draw original up to split
      this.comparisonCtx.putImageData(originalData, 0, 0);
      ctx.drawImage(this.comparisonCanvas, 0, 0, width, splitY, 0, 0, width, splitY);
      
      // Draw processed after split
      this.comparisonCtx.putImageData(processedData, 0, 0);
      ctx.drawImage(this.comparisonCanvas, 0, splitY, width, height - splitY, 0, splitY, width, height - splitY);
      
      // Draw handle
      this.drawSplitHandle(0, splitY, width, splitY);
    }
  }

  /**
   * Draw split handle
   */
  drawSplitHandle(x1, y1, x2, y2) {
    const ctx = this.canvasManager.ctx;
    
    ctx.save();
    
    // White line with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    // Handle decoration
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(midX, midY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(midX, midY, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  /**
   * Render onion skin comparison
   */
  renderOnionSkin(originalData, processedData, options = {}) {
    const ctx = this.canvasManager.ctx;
    const opacity = options.opacity || 0.5;
    
    // Draw original
    ctx.putImageData(originalData, 0, 0);
    
    // Prepare processed on temp canvas
    this.comparisonCanvas.width = this.canvasManager.canvas.width;
    this.comparisonCanvas.height = this.canvasManager.canvas.height;
    this.comparisonCtx.putImageData(processedData, 0, 0);
    
    // Draw processed with opacity
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(this.comparisonCanvas, 0, 0);
    ctx.restore();
  }

  /**
   * Render difference view
   */
  renderDifference(originalData, processedData, options = {}) {
    const width = originalData.width;
    const height = originalData.height;
    const diffData = new ImageData(width, height);
    
    const origPixels = originalData.data;
    const procPixels = processedData.data;
    const diffPixels = diffData.data;
    
    for (let i = 0; i < origPixels.length; i += 4) {
      diffPixels[i] = Math.abs(origPixels[i] - procPixels[i]);
      diffPixels[i + 1] = Math.abs(origPixels[i + 1] - procPixels[i + 1]);
      diffPixels[i + 2] = Math.abs(origPixels[i + 2] - procPixels[i + 2]);
      diffPixels[i + 3] = 255;
    }
    
    this.canvasManager.ctx.putImageData(diffData, 0, 0);
  }

  /**
   * Render checkerboard comparison
   */
  renderCheckerboard(originalData, processedData, options = {}) {
    const blockSize = options.blockSize || 32;
    const width = originalData.width;
    const height = originalData.height;
    
    const outputData = copyImageData(originalData);
    const origPixels = originalData.data;
    const procPixels = processedData.data;
    const outPixels = outputData.data;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const blockX = Math.floor(x / blockSize);
        const blockY = Math.floor(y / blockSize);
        const useProcessed = (blockX + blockY) % 2 === 0;
        
        const idx = (y * width + x) * 4;
        
        if (useProcessed) {
          outPixels[idx] = procPixels[idx];
          outPixels[idx + 1] = procPixels[idx + 1];
          outPixels[idx + 2] = procPixels[idx + 2];
          outPixels[idx + 3] = procPixels[idx + 3];
        }
      }
    }
    
    this.canvasManager.ctx.putImageData(outputData, 0, 0);
  }

  /**
   * Set render mode
   */
  setRenderMode(mode) {
    const validModes = ['final', 'preview', 'comparison'];
    if (validModes.includes(mode)) {
      this.renderMode = mode;
    }
  }

  /**
   * Set comparison mode
   */
  setComparisonMode(mode) {
    const validModes = ['side-by-side', 'split', 'onion-skin', 'difference', 'checkerboard'];
    if (validModes.includes(mode)) {
      this.comparisonMode = mode;
    }
  }

  /**
   * Set split position
   */
  setSplitPosition(position) {
    this.splitPosition = Math.max(0, Math.min(1, position));
  }

  /**
   * Set split orientation
   */
  setSplitOrientation(orientation) {
    if (orientation === 'vertical' || orientation === 'horizontal') {
      this.splitOrientation = orientation;
    }
  }

  /**
   * Get render info
   */
  getRenderInfo() {
    return {
      renderMode: this.renderMode,
      comparisonMode: this.comparisonMode,
      splitPosition: this.splitPosition,
      splitOrientation: this.splitOrientation,
      lastRenderTime: this.lastRenderTime
    };
  }
}