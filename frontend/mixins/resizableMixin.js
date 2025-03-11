export const resizableMixin = {
  data() {
    return {
      isResizing: false,
      resizeDirection: null,
      startWidth: 0,
      startHeight: 0,
      startX: 0,
      startY: 0,
      minWidth: 240,
      maxWidth: 600,
      minHeight: 120,
      maxHeight: 800
    };
  },

  methods: {
    startResize(event, direction) {
      this.isResizing = true;
      this.resizeDirection = direction;
      this.startX = event.clientX;
      this.startY = event.clientY;
      
      const rect = event.target.closest('.node').getBoundingClientRect();
      this.startWidth = rect.width;
      this.startHeight = rect.height;

      window.addEventListener('mousemove', this.onResize);
      window.addEventListener('mouseup', this.stopResize);
      
      // Prevent text selection during resize
      event.preventDefault();
    },

    onResize(event) {
      if (!this.isResizing) return;

      const deltaX = event.clientX - this.startX;
      const deltaY = event.clientY - this.startY;

      const node = event.target.closest('.node') || this.$el;
      
      if (this.resizeDirection.includes('e')) {
        const newWidth = Math.min(Math.max(this.startWidth + deltaX, this.minWidth), this.maxWidth);
        node.style.width = `${newWidth}px`;
      }
      
      if (this.resizeDirection.includes('s')) {
        const newHeight = Math.min(Math.max(this.startHeight + deltaY, this.minHeight), this.maxHeight);
        node.style.height = `${newHeight}px`;
      }

      // Emit resize event for other components that might need to update
      this.$emit('resize', {
        width: node.style.width,
        height: node.style.height
      });
    },

    stopResize() {
      this.isResizing = false;
      this.resizeDirection = null;
      window.removeEventListener('mousemove', this.onResize);
      window.removeEventListener('mouseup', this.stopResize);
    }
  },

  beforeUnmount() {
    if (this.isResizing) {
      window.removeEventListener('mousemove', this.onResize);
      window.removeEventListener('mouseup', this.stopResize);
    }
  }
};
