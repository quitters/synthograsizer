import { store } from '../store';

export class ConnectionRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.className = 'connection-canvas';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.position = 'fixed';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.zIndex = '1000';
    document.body.appendChild(this.canvas);
    
    this.resize();
    window.addEventListener('resize', this.resize.bind(this));
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  drawConnection(source, target, color = '#4CAF50', active = true) {
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    
    const startX = sourceRect.right;
    const startY = sourceRect.top + sourceRect.height/2;
    const endX = targetRect.left;
    const endY = targetRect.top + targetRect.height/2;
    
    const controlPointOffset = Math.min(100, Math.abs(endX - startX) / 2);
    
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    
    this.ctx.bezierCurveTo(
      startX + controlPointOffset,
      startY,
      endX - controlPointOffset,
      endY,
      endX,
      endY
    );
    
    this.ctx.strokeStyle = active ? color : '#666';
    this.ctx.lineWidth = active ? 2 : 1;
    this.ctx.stroke();
  }

  updateConnections() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    store.variables.forEach(variable => {
      const variableEl = document.querySelector(
        `[data-variable-id="${variable.id}"]`
      );
      
      if (variableEl) {
        variable.connections.forEach(paramPath => {
          const paramEl = document.querySelector(
            `[data-param-path="${paramPath}"]`
          );
          
          if (paramEl) {
            this.drawConnection(variableEl, paramEl);
          }
        });
      }
    });
  }
}
