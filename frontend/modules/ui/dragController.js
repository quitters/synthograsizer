export class DragController {
  constructor() {
    this.activeDrag = null;
    this.connectionPreview = document.createElement('div');
    this.connectionPreview.className = 'connection-preview';
    document.body.appendChild(this.connectionPreview);
    
    document.addEventListener('mousemove', this.updatePreview.bind(this));
    document.addEventListener('mouseup', this.endDrag.bind(this));
  }

  startDrag(event, variableId) {
    this.activeDrag = {
      variableId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY
    };
    
    this.connectionPreview.style.display = 'block';
    this.updatePreview(event);
  }

  updatePreview(event) {
    if (!this.activeDrag) return;
    
    this.activeDrag.currentX = event.clientX;
    this.activeDrag.currentY = event.clientY;
    
    this.connectionPreview.style.transform = `
      translate(${this.activeDrag.startX}px, ${this.activeDrag.startY}px)
      scaleX(${Math.hypot(
        this.activeDrag.currentX - this.activeDrag.startX,
        this.activeDrag.currentY - this.activeDrag.startY
      ) / 100})
    `;
    
    this.connectionPreview.style.opacity = '0.7';
  }

  endDrag(event) {
    if (!this.activeDrag) return;
    
    const dropTarget = document.elementFromPoint(
      event.clientX, 
      event.clientY
    )?.closest('[data-param-path]');
    
    if (dropTarget) {
      const paramPath = dropTarget.dataset.paramPath;
      store.p5Binder.createBinding(
        this.activeDrag.variableId,
        store.currentSketch,
        paramPath
      );
    }

    this.cleanup();
  }

  cleanup() {
    this.activeDrag = null;
    this.connectionPreview.style.display = 'none';
    this.connectionPreview.style.opacity = '0';
  }
}
