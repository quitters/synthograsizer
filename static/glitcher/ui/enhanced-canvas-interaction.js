/**
 * Enhanced Canvas Interaction Handler
 * Advanced mouse and touch event handling with improved feedback
 */

export class EnhancedCanvasInteraction {
  constructor(canvasManager, selectionManager) {
    this.canvasManager = canvasManager;
    this.selectionManager = selectionManager;
    
    // Enhanced tool settings
    this.brushSize = 30;
    this.wandTolerance = 30;
    this.snapToGrid = false;
    this.gridSize = 10;
    
    // Gesture tracking
    this.gestureState = {
      isDrawing: false,
      startPoint: null,
      currentStroke: [],
      gestureType: 'none'
    };
    
    // Touch support
    this.touchState = {
      touches: [],
      lastTouchTime: 0,
      touchStartTime: 0
    };
    
    // Performance tracking
    this.performanceMetrics = {
      lastEventTime: 0,
      eventCount: 0,
      throttleInterval: 16 // ~60fps
    };
    
    this.setupEnhancedEventListeners();
    this.setupGestureRecognition();
  }

  /**
   * Set up enhanced event listeners with better performance
   */
  setupEnhancedEventListeners() {
    const canvas = this.canvasManager.canvas;
    if (!canvas) {
      console.warn('Canvas not available for enhanced interaction setup');
      return;
    }

    // Enhanced mouse events with throttling
    canvas.addEventListener('mousedown', (e) => this.handleEnhancedMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.throttledMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.handleEnhancedMouseUp(e));
    canvas.addEventListener('mouseleave', (e) => this.handleEnhancedMouseLeave(e));
    canvas.addEventListener('mouseenter', (e) => this.handleMouseEnter(e));

    // Enhanced touch events
    canvas.addEventListener('touchstart', (e) => this.handleEnhancedTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.handleEnhancedTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.handleEnhancedTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this.handleTouchCancel(e), { passive: false });

    // Keyboard modifiers for enhanced functionality
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    document.addEventListener('keyup', (e) => this.handleKeyUp(e));
    
    // Wheel events for brush size adjustment
    canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    console.log('🔧 Enhanced canvas interaction events set up');
  }

  /**
   * Throttled mouse move for better performance
   */
  throttledMouseMove(e) {
    const now = performance.now();
    if (now - this.performanceMetrics.lastEventTime < this.performanceMetrics.throttleInterval) {
      return;
    }
    
    this.performanceMetrics.lastEventTime = now;
    this.performanceMetrics.eventCount++;
    
    this.handleEnhancedMouseMove(e);
  }

  /**
   * Enhanced mouse down with gesture recognition
   */
  handleEnhancedMouseDown(e) {
    if (this.selectionManager.currentTool === 'none') return;
    
    e.preventDefault();
    const coords = this.getEnhancedCanvasCoordinates(e);
    
    // Start gesture tracking
    this.gestureState.isDrawing = true;
    this.gestureState.startPoint = coords;
    this.gestureState.currentStroke = [coords];
    this.gestureState.gestureType = this.selectionManager.currentTool;
    
    // Visual feedback
    this.showToolFeedback(coords, 'start');
    
    this.selectionManager.startDrawing(coords.x, coords.y, {
      brushSize: this.brushSize,
      tolerance: this.wandTolerance,
      snapToGrid: this.snapToGrid,
      gridSize: this.gridSize
    });
  }

  /**
   * Enhanced mouse move with gesture tracking
   */
  handleEnhancedMouseMove(e) {
    const coords = this.getEnhancedCanvasCoordinates(e);
    
    // Update brush cursor position for all tools
    this.updateCursorFeedback(coords);
    
    // Track gesture if drawing
    if (this.gestureState.isDrawing) {
      this.gestureState.currentStroke.push(coords);
      this.analyzeGesture();
    }
    
    // Continue drawing if mouse is down
    if (this.selectionManager.isDrawing) {
      this.selectionManager.continueDrawing(coords.x, coords.y, {
        brushSize: this.brushSize,
        tolerance: this.wandTolerance
      });
      
      // Show drawing feedback
      this.showToolFeedback(coords, 'draw');
    }
  }

  /**
   * Enhanced mouse up with gesture completion
   */
  handleEnhancedMouseUp(e) {
    if (this.selectionManager.isDrawing) {
      const coords = this.getEnhancedCanvasCoordinates(e);
      
      // Complete gesture
      this.gestureState.currentStroke.push(coords);
      this.completeGesture();
      
      // Show completion feedback
      this.showToolFeedback(coords, 'end');
      
      this.selectionManager.endDrawing();
    }
    
    // Reset gesture state
    this.gestureState.isDrawing = false;
    this.gestureState.currentStroke = [];
  }

  /**
   * Enhanced mouse leave
   */
  handleEnhancedMouseLeave(e) {
    // End drawing when mouse leaves canvas
    if (this.selectionManager.isDrawing) {
      this.selectionManager.endDrawing();
    }
    
    // Hide cursor feedback
    this.hideCursorFeedback();
    
    // Reset gesture state
    this.gestureState.isDrawing = false;
  }

  /**
   * Handle mouse enter for cursor setup
   */
  handleMouseEnter(e) {
    const coords = this.getEnhancedCanvasCoordinates(e);
    this.updateCursorFeedback(coords);
  }

  /**
   * Enhanced touch start with multi-touch support
   */
  handleEnhancedTouchStart(e) {
    e.preventDefault();
    
    this.touchState.touchStartTime = Date.now();
    this.touchState.touches = Array.from(e.touches);
    
    if (e.touches.length === 1) {
      // Single touch - treat as mouse
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        buttons: 1
      });
      this.handleEnhancedMouseDown(mouseEvent);
    } else if (e.touches.length === 2) {
      // Two finger gesture - could be used for brush size
      this.handleTwoFingerGesture(e);
    }
  }

  /**
   * Enhanced touch move
   */
  handleEnhancedTouchMove(e) {
    e.preventDefault();
    
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.handleEnhancedMouseMove(mouseEvent);
    } else if (e.touches.length === 2) {
      this.handleTwoFingerGesture(e);
    }
  }

  /**
   * Enhanced touch end
   */
  handleEnhancedTouchEnd(e) {
    e.preventDefault();
    
    const touchDuration = Date.now() - this.touchState.touchStartTime;
    
    if (e.touches.length === 0) {
      // All touches ended
      const mouseEvent = new MouseEvent('mouseup');
      this.handleEnhancedMouseUp(mouseEvent);
      
      // Check for tap gesture
      if (touchDuration < 200 && this.gestureState.currentStroke.length < 3) {
        this.handleTapGesture();
      }
    }
    
    this.touchState.touches = Array.from(e.touches);
  }

  /**
   * Handle touch cancel
   */
  handleTouchCancel(e) {
    e.preventDefault();
    this.handleEnhancedTouchEnd(e);
  }

  /**
   * Handle two finger gestures (pinch for brush size, etc.)
   */
  handleTwoFingerGesture(e) {
    if (e.touches.length !== 2) return;
    
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    
    const distance = Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) + 
      Math.pow(touch2.clientY - touch1.clientY, 2)
    );
    
    // Use distance to adjust brush size
    if (this.selectionManager.currentTool === 'brush') {
      const newBrushSize = Math.max(10, Math.min(100, distance / 4));
      this.setBrushSize(Math.floor(newBrushSize));
    }
  }

  /**
   * Handle tap gesture for tools like magic wand
   */
  handleTapGesture() {
    if (this.selectionManager.currentTool === 'wand' && this.gestureState.startPoint) {
      // Quick tap with wand tool
      console.log('🪄 Quick tap detected for magic wand');
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyDown(e) {
    const canvas = this.canvasManager.canvas;
    if (e.target !== canvas && !canvas.contains(e.target)) return;
    
    switch (e.key) {
      case '[':
        e.preventDefault();
        this.adjustBrushSize(-5);
        break;
      case ']':
        e.preventDefault();
        this.adjustBrushSize(5);
        break;
      case 'Shift':
        this.snapToGrid = true;
        break;
      case 'Alt':
        // Could toggle between add/subtract modes
        break;
    }
  }

  /**
   * Handle key up
   */
  handleKeyUp(e) {
    switch (e.key) {
      case 'Shift':
        this.snapToGrid = false;
        break;
    }
  }

  /**
   * Handle wheel events for brush size
   */
  handleWheel(e) {
    if (this.selectionManager.currentTool === 'brush') {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -2 : 2;
      this.adjustBrushSize(delta);
    }
  }

  /**
   * Get enhanced canvas coordinates with grid snapping
   */
  getEnhancedCanvasCoordinates(e) {
    let coords = this.canvasManager.getCanvasCoordinates(e);
    
    if (this.snapToGrid) {
      coords.x = Math.round(coords.x / this.gridSize) * this.gridSize;
      coords.y = Math.round(coords.y / this.gridSize) * this.gridSize;
    }
    
    return coords;
  }

  /**
   * Show visual feedback for tool usage
   */
  showToolFeedback(coords, phase) {
    const canvas = this.canvasManager.canvas;
    if (!canvas) return;
    
    switch (this.selectionManager.currentTool) {
      case 'brush':
        this.showBrushFeedback(coords, phase);
        break;
      case 'wand':
        this.showWandFeedback(coords, phase);
        break;
      case 'select':
        this.showSelectFeedback(coords, phase);
        break;
      case 'lasso':
        this.showLassoFeedback(coords, phase);
        break;
    }
  }

  /**
   * Show brush-specific feedback
   */
  showBrushFeedback(coords, phase) {
    if (phase === 'start') {
      // Create ripple effect at start point
      this.createRippleEffect(coords, this.brushSize);
    }
  }

  /**
   * Show magic wand feedback
   */
  showWandFeedback(coords, phase) {
    if (phase === 'start') {
      // Create sparkle effect
      this.createSparkleEffect(coords);
    }
  }

  /**
   * Show selection feedback
   */
  showSelectFeedback(coords, phase) {
    // Selection feedback is handled by the selection manager
  }

  /**
   * Show lasso feedback
   */
  showLassoFeedback(coords, phase) {
    // Lasso feedback with trail effect
    if (phase === 'draw') {
      this.createTrailEffect(coords);
    }
  }

  /**
   * Update cursor feedback based on tool and position
   */
  updateCursorFeedback(coords) {
    // Update brush cursor for brush tool
    if (this.selectionManager.currentTool === 'brush') {
      this.selectionManager.updateBrushCursor(coords.x, coords.y);
    }
    
    // Show coordinates for precision work
    this.updateCoordinateDisplay(coords);
  }

  /**
   * Hide cursor feedback
   */
  hideCursorFeedback() {
    if (this.selectionManager.currentTool === 'brush') {
      this.selectionManager.updateBrushCursor(-1, -1);
    }
    this.hideCoordinateDisplay();
  }

  /**
   * Update coordinate display
   */
  updateCoordinateDisplay(coords) {
    let coordDisplay = document.getElementById('coordinate-display');
    if (!coordDisplay) {
      coordDisplay = this.createCoordinateDisplay();
    }
    
    coordDisplay.textContent = `${Math.round(coords.x)}, ${Math.round(coords.y)}`;
    coordDisplay.style.display = 'block';
  }

  /**
   * Create coordinate display element
   */
  createCoordinateDisplay() {
    const display = document.createElement('div');
    display.id = 'coordinate-display';
    display.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: rgba(42, 42, 64, 0.9);
      color: #4ecdc4;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      border: 1px solid rgba(78, 205, 196, 0.3);
      z-index: 1000;
      display: none;
    `;
    document.body.appendChild(display);
    return display;
  }

  /**
   * Hide coordinate display
   */
  hideCoordinateDisplay() {
    const coordDisplay = document.getElementById('coordinate-display');
    if (coordDisplay) {
      coordDisplay.style.display = 'none';
    }
  }

  /**
   * Create ripple effect for visual feedback
   */
  createRippleEffect(coords, size) {
    const canvas = this.canvasManager.canvas;
    if (!canvas) return;
    
    // Get canvas position and dimensions
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.canvasManager.imgWidth;
    const scaleY = rect.height / this.canvasManager.imgHeight;
    
    // Convert canvas coordinates to screen coordinates relative to canvas position
    const screenX = rect.left + (coords.x * scaleX);
    const screenY = rect.top + (coords.y * scaleY);
    const screenSize = size * Math.min(scaleX, scaleY); // Use smaller scale to maintain aspect ratio
    
    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position: fixed;
      left: ${screenX - screenSize/2}px;
      top: ${screenY - screenSize/2}px;
      width: ${screenSize}px;
      height: ${screenSize}px;
      border: 2px solid rgba(78, 205, 196, 0.6);
      border-radius: 50%;
      pointer-events: none;
      animation: ripple-expand 0.6s ease-out forwards;
      z-index: 1000;
    `;
    
    // Add ripple animation if not exists
    if (!document.querySelector('#ripple-expand-animation')) {
      const style = document.createElement('style');
      style.id = 'ripple-expand-animation';
      style.textContent = `
        @keyframes ripple-expand {
          0% {
            transform: scale(0.5);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Append to document body since we're using fixed positioning
    document.body.appendChild(ripple);
    
    setTimeout(() => {
      if (ripple.parentNode) {
        ripple.remove();
      }
    }, 600);
  }

  /**
   * Create sparkle effect for magic wand
   */
  createSparkleEffect(coords) {
    const sparkles = 6;
    for (let i = 0; i < sparkles; i++) {
      setTimeout(() => {
        this.createSingleSparkle(coords, i);
      }, i * 50);
    }
  }

  /**
   * Create single sparkle element
   */
  createSingleSparkle(coords, index) {
    const canvas = this.canvasManager.canvas;
    if (!canvas) return;
    
    // Get canvas position and dimensions
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.canvasManager.imgWidth;
    const scaleY = rect.height / this.canvasManager.imgHeight;
    
    // Calculate sparkle position in canvas coordinates
    const angle = (index / 6) * Math.PI * 2;
    const distance = 20 + Math.random() * 20;
    const canvasX = coords.x + Math.cos(angle) * distance;
    const canvasY = coords.y + Math.sin(angle) * distance;
    
    // Convert canvas coordinates to screen coordinates relative to canvas position
    const screenX = rect.left + (canvasX * scaleX);
    const screenY = rect.top + (canvasY * scaleY);
    
    const sparkle = document.createElement('div');
    sparkle.innerHTML = '✨';
    sparkle.style.cssText = `
      position: fixed;
      left: ${screenX}px;
      top: ${screenY}px;
      font-size: 12px;
      pointer-events: none;
      animation: sparkle-fade 1s ease-out forwards;
      transform: translate(-50%, -50%);
      z-index: 1000;
    `;
    
    // Add sparkle animation if not exists
    if (!document.querySelector('#sparkle-fade-animation')) {
      const style = document.createElement('style');
      style.id = 'sparkle-fade-animation';
      style.textContent = `
        @keyframes sparkle-fade {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0);
          }
          50% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0) translateY(-20px);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Append to document body since we're using fixed positioning
    document.body.appendChild(sparkle);
    
    setTimeout(() => {
      if (sparkle.parentNode) {
        sparkle.remove();
      }
    }, 1000);
  }

  /**
   * Create trail effect for lasso
   */
  createTrailEffect(coords) {
    // Trail effect could be implemented here
    // For now, just a subtle visual indication
  }

  /**
   * Set up gesture recognition system
   */
  setupGestureRecognition() {
    this.gesturePatterns = {
      circle: { threshold: 0.8, action: 'circleSelection' },
      line: { threshold: 0.9, action: 'straightLine' },
      zigzag: { threshold: 0.7, action: 'eraseMode' }
    };
  }

  /**
   * Analyze current gesture for patterns
   */
  analyzeGesture() {
    if (this.gestureState.currentStroke.length < 10) return;
    
    // Simple gesture recognition could be implemented here
    // For now, just track drawing smoothness
    const smoothness = this.calculateSmoothness(this.gestureState.currentStroke);
    
    if (smoothness > 0.9 && this.selectionManager.currentTool === 'lasso') {
      // Very smooth - might want to convert to circle
      console.log('🔄 Smooth gesture detected');
    }
  }

  /**
   * Calculate smoothness of stroke
   */
  calculateSmoothness(stroke) {
    if (stroke.length < 3) return 1;
    
    let totalAngleChange = 0;
    for (let i = 2; i < stroke.length; i++) {
      const angle1 = Math.atan2(stroke[i-1].y - stroke[i-2].y, stroke[i-1].x - stroke[i-2].x);
      const angle2 = Math.atan2(stroke[i].y - stroke[i-1].y, stroke[i].x - stroke[i-1].x);
      let angleDiff = Math.abs(angle2 - angle1);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      totalAngleChange += angleDiff;
    }
    
    const maxAngleChange = (stroke.length - 2) * Math.PI;
    return 1 - (totalAngleChange / maxAngleChange);
  }

  /**
   * Complete gesture analysis
   */
  completeGesture() {
    const stroke = this.gestureState.currentStroke;
    if (stroke.length < 3) return;
    
    // Final gesture analysis
    const smoothness = this.calculateSmoothness(stroke);
    const duration = Date.now() - this.touchState.touchStartTime;
    
    console.log(`🎨 Gesture completed: smoothness=${smoothness.toFixed(2)}, duration=${duration}ms, points=${stroke.length}`);
  }

  /**
   * Adjust brush size with feedback
   */
  adjustBrushSize(delta) {
    const newSize = Math.max(5, Math.min(100, this.brushSize + delta));
    this.setBrushSize(newSize);
    
    // Show size feedback
    this.showBrushSizeIndicator(newSize);
  }

  /**
   * Set brush size with enhanced feedback
   */
  setBrushSize(size) {
    this.brushSize = Math.max(1, Math.min(100, size));
    
    // Update UI if brush size control exists
    const brushSizeRange = document.getElementById('brush-size');
    const brushSizeValue = document.getElementById('brush-size-value');
    if (brushSizeRange) brushSizeRange.value = this.brushSize;
    if (brushSizeValue) brushSizeValue.textContent = this.brushSize;
    
    console.log('🖌️ Brush size set to:', this.brushSize);
  }

  /**
   * Show brush size indicator
   */
  showBrushSizeIndicator(size) {
    let indicator = document.getElementById('brush-size-indicator');
    if (!indicator) {
      indicator = this.createBrushSizeIndicator();
    }
    
    indicator.textContent = `Brush: ${size}px`;
    indicator.style.opacity = '1';
    
    // Auto hide after delay
    setTimeout(() => {
      indicator.style.opacity = '0';
    }, 1000);
  }

  /**
   * Create brush size indicator
   */
  createBrushSizeIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'brush-size-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(42, 42, 64, 0.9);
      color: #4ecdc4;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 14px;
      border: 1px solid rgba(78, 205, 196, 0.3);
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    `;
    document.body.appendChild(indicator);
    return indicator;
  }

  /**
   * Update canvas cursor with enhanced feedback
   */
  updateCanvasCursor(tool) {
    const canvas = this.canvasManager.canvas;
    if (!canvas) return;

    // Remove existing cursor classes
    canvas.classList.remove('select-cursor', 'brush-cursor', 'wand-cursor', 'lasso-cursor');
    
    // Add appropriate cursor class with enhanced styling
    switch (tool) {
      case 'select':
        canvas.classList.add('select-cursor');
        canvas.style.cursor = 'crosshair';
        break;
      case 'brush':
        canvas.classList.add('brush-cursor');
        canvas.style.cursor = 'none'; // Custom brush cursor
        break;
      case 'wand':
        canvas.classList.add('wand-cursor');
        canvas.style.cursor = 'crosshair';
        break;
      case 'lasso':
        canvas.classList.add('lasso-cursor');
        canvas.style.cursor = 'crosshair';
        break;
      default:
        canvas.style.cursor = 'default';
        break;
    }
  }

  /**
   * Get current tool settings
   */
  getToolSettings() {
    return {
      brushSize: this.brushSize,
      wandTolerance: this.wandTolerance,
      snapToGrid: this.snapToGrid,
      gridSize: this.gridSize
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      eventsPerSecond: this.performanceMetrics.eventCount / ((Date.now() - this.performanceMetrics.lastEventTime) / 1000)
    };
  }

  /**
   * Destroy enhanced event listeners
   */
  destroy() {
    const canvas = this.canvasManager.canvas;
    if (!canvas) return;

    // Remove all event listeners
    canvas.removeEventListener('mousedown', this.handleEnhancedMouseDown);
    canvas.removeEventListener('mousemove', this.throttledMouseMove);
    canvas.removeEventListener('mouseup', this.handleEnhancedMouseUp);
    canvas.removeEventListener('mouseleave', this.handleEnhancedMouseLeave);
    canvas.removeEventListener('mouseenter', this.handleMouseEnter);
    canvas.removeEventListener('touchstart', this.handleEnhancedTouchStart);
    canvas.removeEventListener('touchmove', this.handleEnhancedTouchMove);
    canvas.removeEventListener('touchend', this.handleEnhancedTouchEnd);
    canvas.removeEventListener('touchcancel', this.handleTouchCancel);
    canvas.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);

    // Clean up UI elements
    const coordDisplay = document.getElementById('coordinate-display');
    if (coordDisplay) coordDisplay.remove();
    
    const brushIndicator = document.getElementById('brush-size-indicator');
    if (brushIndicator) brushIndicator.remove();

    console.log('🗑️ Enhanced canvas interaction cleaned up');
  }
}