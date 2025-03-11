import { store } from '../modules/store';
import p5 from 'p5';

export class CanvasArea {
  constructor(container) {
    this.container = container;
    this.sketch = null;
    this.p5Instance = null;
    this.connectionLayer = null;
    this.initializeUI();
  }

  initializeUI() {
    this.container.innerHTML = `
      <div class="canvas-toolbar">
        <div class="sketch-controls">
          <button class="play-pause-btn">
            <i class="fas fa-play"></i>
          </button>
          <button class="reset-btn">
            <i class="fas fa-undo"></i>
          </button>
        </div>
        <div class="view-controls">
          <button class="zoom-in-btn">
            <i class="fas fa-search-plus"></i>
          </button>
          <button class="zoom-out-btn">
            <i class="fas fa-search-minus"></i>
          </button>
          <button class="fit-btn">
            <i class="fas fa-expand"></i>
          </button>
        </div>
      </div>
      <div class="canvas-container">
        <div class="sketch-container"></div>
        <canvas class="connection-layer"></canvas>
      </div>
    `;

    this.sketchContainer = this.container.querySelector('.sketch-container');
    this.connectionLayer = this.container.querySelector('.connection-layer');
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Play/Pause button
    const playPauseBtn = this.container.querySelector('.play-pause-btn');
    playPauseBtn.addEventListener('click', () => {
      if (this.p5Instance) {
        if (this.p5Instance.isLooping()) {
          this.p5Instance.noLoop();
          playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        } else {
          this.p5Instance.loop();
          playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        }
      }
    });

    // Reset button
    this.container.querySelector('.reset-btn').addEventListener('click', () => {
      if (this.sketch) {
        this.loadSketch(this.sketch);
      }
    });

    // Zoom controls
    let scale = 1;
    const scaleStep = 0.1;
    const minScale = 0.5;
    const maxScale = 2;

    this.container.querySelector('.zoom-in-btn').addEventListener('click', () => {
      if (scale < maxScale) {
        scale += scaleStep;
        this.updateScale(scale);
      }
    });

    this.container.querySelector('.zoom-out-btn').addEventListener('click', () => {
      if (scale > minScale) {
        scale -= scaleStep;
        this.updateScale(scale);
      }
    });

    this.container.querySelector('.fit-btn').addEventListener('click', () => {
      scale = 1;
      this.updateScale(scale);
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.resizeCanvas();
    });

    // Handle connection layer interactions
    this.setupConnectionLayerInteractions();
  }

  setupConnectionLayerInteractions() {
    const ctx = this.connectionLayer.getContext('2d');
    let isDragging = false;
    let startPoint = null;
    let currentPoint = null;

    this.connectionLayer.addEventListener('mousedown', e => {
      const point = this.getCanvasPoint(e);
      const connection = this.findConnectionAtPoint(point);

      if (connection) {
        // Start dragging existing connection
        isDragging = true;
        startPoint = point;
        store.eventBus.emit('connection-drag-start', connection);
      }
    });

    this.connectionLayer.addEventListener('mousemove', e => {
      const point = this.getCanvasPoint(e);
      currentPoint = point;

      if (isDragging) {
        this.drawConnectionPreview(startPoint, currentPoint);
        store.eventBus.emit('connection-drag-update', { start: startPoint, current: point });
      } else {
        // Highlight connection under cursor
        const connection = this.findConnectionAtPoint(point);
        this.highlightConnection(connection);
      }
    });

    this.connectionLayer.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        store.eventBus.emit('connection-drag-end', { start: startPoint, end: currentPoint });
        this.clearConnectionPreview();
      }
    });
  }

  loadSketch(sketch) {
    // Remove existing p5 instance if any
    if (this.p5Instance) {
      this.p5Instance.remove();
    }

    this.sketch = sketch;
    
    // Create new p5 instance
    this.p5Instance = new p5(p => {
      p.setup = () => {
        const canvas = p.createCanvas(this.sketchContainer.clientWidth, 
                                    this.sketchContainer.clientHeight);
        canvas.parent(this.sketchContainer);
        
        if (typeof sketch.setup === 'function') {
          sketch.setup(p);
        }
      };

      p.draw = () => {
        if (typeof sketch.draw === 'function') {
          sketch.draw(p);
        }
      };

      // Forward other p5 events to the sketch
      const events = ['mousePressed', 'mouseReleased', 'mouseMoved', 
                     'keyPressed', 'keyReleased'];
      
      events.forEach(event => {
        if (typeof sketch[event] === 'function') {
          p[event] = () => sketch[event](p);
        }
      });
    });

    store.currentSketch = this.sketch;
    store.eventBus.emit('sketch-loaded', this.sketch);
  }

  resizeCanvas() {
    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(
        this.sketchContainer.clientWidth,
        this.sketchContainer.clientHeight
      );
    }

    // Resize connection layer
    this.connectionLayer.width = this.container.clientWidth;
    this.connectionLayer.height = this.container.clientHeight;
    this.redrawConnections();
  }

  updateScale(scale) {
    this.sketchContainer.style.transform = `scale(${scale})`;
    this.redrawConnections();
  }

  getCanvasPoint(event) {
    const rect = this.connectionLayer.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  findConnectionAtPoint(point) {
    // Implement connection hit testing
    return store.connections.find(conn => this.isPointNearConnection(point, conn));
  }

  isPointNearConnection(point, connection) {
    // Implement connection proximity testing
    const threshold = 5;
    // ... implement bezier curve distance calculation
    return false; // Placeholder
  }

  drawConnectionPreview(start, end) {
    const ctx = this.connectionLayer.getContext('2d');
    ctx.clearRect(0, 0, this.connectionLayer.width, this.connectionLayer.height);
    
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    
    // Calculate control points for bezier curve
    const dx = end.x - start.x;
    const cp1x = start.x + dx * 0.5;
    const cp2x = end.x - dx * 0.5;
    
    ctx.bezierCurveTo(cp1x, start.y, cp2x, end.y, end.x, end.y);
    
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  clearConnectionPreview() {
    const ctx = this.connectionLayer.getContext('2d');
    ctx.clearRect(0, 0, this.connectionLayer.width, this.connectionLayer.height);
    this.redrawConnections();
  }

  highlightConnection(connection) {
    if (connection) {
      // Implement connection highlighting
    }
  }

  redrawConnections() {
    // Implement connection redrawing
    store.connections.forEach(conn => {
      // Draw each connection...
    });
  }
}
