import { store } from '../modules/store';

export class StatusBar {
  constructor(container) {
    this.container = container;
    this.messageTimeout = null;
    this.initializeUI();
    this.setupEventListeners();
  }

  initializeUI() {
    this.container.innerHTML = `
      <div class="status-message"></div>
      <div class="status-indicators">
        <div class="midi-status" title="MIDI Status">
          <i class="fas fa-music"></i>
          <span>No MIDI</span>
        </div>
        <div class="fps-counter" title="Frames Per Second">
          <i class="fas fa-tachometer-alt"></i>
          <span>0 FPS</span>
        </div>
        <div class="memory-usage" title="Memory Usage">
          <i class="fas fa-memory"></i>
          <span>0 MB</span>
        </div>
      </div>
    `;

    this.messageElement = this.container.querySelector('.status-message');
    this.midiStatus = this.container.querySelector('.midi-status span');
    this.fpsCounter = this.container.querySelector('.fps-counter span');
    this.memoryUsage = this.container.querySelector('.memory-usage span');
  }

  setupEventListeners() {
    // Listen for status messages
    store.emitter.on('statusMessage', message => {
      this.showMessage(message);
    });

    // Listen for MIDI status changes
    store.emitter.on('midiStatusChange', status => {
      this.updateMIDIStatus(status);
    });

    // Update performance metrics
    this.startPerformanceMonitoring();
  }

  showMessage(message, duration = 3000) {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }

    this.messageElement.textContent = message;
    this.messageElement.classList.add('active');

    this.messageTimeout = setTimeout(() => {
      this.messageElement.classList.remove('active');
      this.messageTimeout = null;
    }, duration);
  }

  updateMIDIStatus(status) {
    if (status.connected) {
      this.midiStatus.innerHTML = `
        <i class="fas fa-music"></i>
        <span>${status.deviceName || 'Connected'}</span>
      `;
      this.midiStatus.classList.add('connected');
    } else {
      this.midiStatus.innerHTML = `
        <i class="fas fa-music"></i>
        <span>No MIDI</span>
      `;
      this.midiStatus.classList.remove('connected');
    }
  }

  startPerformanceMonitoring() {
    let lastTime = performance.now();
    let frames = 0;

    const updateMetrics = () => {
      const now = performance.now();
      frames++;

      if (now >= lastTime + 1000) {
        this.fpsCounter.textContent = `${frames} FPS`;
        frames = 0;
        lastTime = now;

        // Update memory usage if available
        if (window.performance && window.performance.memory) {
          const memoryMB = Math.round(window.performance.memory.usedJSHeapSize / 1048576);
          this.memoryUsage.textContent = `${memoryMB} MB`;
        }
      }

      requestAnimationFrame(updateMetrics);
    };

    requestAnimationFrame(updateMetrics);
  }
}
