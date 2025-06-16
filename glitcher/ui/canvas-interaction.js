/**
 * Canvas Interaction Handler for Selection Tools
 * Manages mouse and touch events for interactive selection tools
 */

export class CanvasInteraction {
  constructor(canvasManager, selectionManager) {
    this.canvasManager = canvasManager;
    this.selectionManager = selectionManager;
    
    // Tool settings
    this.brushSize = 30;
    this.wandTolerance = 30;
    
    this.setupEventListeners();
  }

  /**
   * Set up canvas event listeners for mouse and touch interactions
   */
  setupEventListeners() {
    const canvas = this.canvasManager.canvas;
    if (!canvas) {
      console.warn('Canvas not available for interaction setup');
      return;
    }

    // Mouse events
    canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    canvas.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));

    // Touch events for mobile support
    canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

    console.log('🖱️ Canvas interaction events set up');
  }

  /**
   * Get canvas coordinates from mouse or touch event
   * @param {Event} e - Mouse or touch event
   * @returns {Object} {x, y} canvas coordinates
   */
  getCanvasCoordinates(e) {
    return this.canvasManager.getCanvasCoordinates(e);
  }

  /**
   * Handle mouse down event
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseDown(e) {
    if (this.selectionManager.currentTool === 'none') return;
    
    e.preventDefault();
    const coords = this.getCanvasCoordinates(e);
    
    this.selectionManager.startDrawing(coords.x, coords.y, {
      brushSize: this.brushSize,
      tolerance: this.wandTolerance
    });
  }

  /**
   * Handle mouse move event
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseMove(e) {
    const coords = this.getCanvasCoordinates(e);
    
    // Update brush cursor position for visual feedback
    if (this.selectionManager.currentTool === 'brush') {
      this.selectionManager.updateBrushCursor(coords.x, coords.y);
    }
    
    // Continue drawing if mouse is down
    if (this.selectionManager.isDrawing) {
      this.selectionManager.continueDrawing(coords.x, coords.y, {
        brushSize: this.brushSize,
        tolerance: this.wandTolerance
      });
    }
  }

  /**
   * Handle mouse up event
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseUp(e) {
    if (this.selectionManager.isDrawing) {
      this.selectionManager.endDrawing();
    }
  }

  /**
   * Handle mouse leave event
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseLeave(e) {
    // End drawing when mouse leaves canvas
    if (this.selectionManager.isDrawing) {
      this.selectionManager.endDrawing();
    }
    
    // Hide brush cursor
    if (this.selectionManager.currentTool === 'brush') {
      this.selectionManager.updateBrushCursor(-1, -1);
    }
  }

  /**
   * Handle touch start event
   * @param {TouchEvent} e - Touch event
   */
  handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.handleMouseDown(mouseEvent);
    }
  }

  /**
   * Handle touch move event
   * @param {TouchEvent} e - Touch event
   */
  handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.handleMouseMove(mouseEvent);
    }
  }

  /**
   * Handle touch end event
   * @param {TouchEvent} e - Touch event
   */
  handleTouchEnd(e) {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup');
    this.handleMouseUp(mouseEvent);
  }

  /**
   * Set brush size for brush tool
   * @param {number} size - Brush size in pixels
   */
  setBrushSize(size) {
    this.brushSize = Math.max(1, Math.min(100, size));
    console.log('🖌️ Brush size set to:', this.brushSize);
  }

  /**
   * Set magic wand tolerance
   * @param {number} tolerance - Color tolerance (0-255)
   */
  setWandTolerance(tolerance) {
    this.wandTolerance = Math.max(0, Math.min(255, tolerance));
    console.log('✨ Wand tolerance set to:', this.wandTolerance);
  }

  /**
   * Update canvas cursor based on current tool
   * @param {string} tool - Current tool name
   */
  updateCanvasCursor(tool) {
    const canvas = this.canvasManager.canvas;
    if (!canvas) return;

    // Remove existing cursor classes
    canvas.classList.remove('select-cursor', 'brush-cursor', 'wand-cursor', 'lasso-cursor');
    
    // Add appropriate cursor class
    switch (tool) {
      case 'select':
      case 'wand':
      case 'lasso':
        canvas.classList.add(`${tool}-cursor`);
        break;
      case 'brush':
        canvas.classList.add('brush-cursor');
        break;
      default:
        // Default cursor for 'none' or other tools
        break;
    }
  }

  /**
   * Get current tool settings
   * @returns {Object} Current tool settings
   */
  getToolSettings() {
    return {
      brushSize: this.brushSize,
      wandTolerance: this.wandTolerance
    };
  }

  /**
   * Destroy event listeners (cleanup)
   */
  destroy() {
    const canvas = this.canvasManager.canvas;
    if (!canvas) return;

    canvas.removeEventListener('mousedown', this.handleMouseDown);
    canvas.removeEventListener('mousemove', this.handleMouseMove);
    canvas.removeEventListener('mouseup', this.handleMouseUp);
    canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    canvas.removeEventListener('touchstart', this.handleTouchStart);
    canvas.removeEventListener('touchmove', this.handleTouchMove);
    canvas.removeEventListener('touchend', this.handleTouchEnd);

    console.log('🗑️ Canvas interaction events cleaned up');
  }
}
