import { store } from './store.js';

export class KnobComponent {
  constructor(knobData) {
    this.element = this.createKnobElement(knobData);
    this.setupEventListeners();
  }

  createKnobElement({ id, label, value }) {
    const knob = document.createElement('div');
    knob.className = 'knob-container';
    knob.innerHTML = `
      <div class="knob" data-id="${id}">
        <div class="knob-dial"></div>
        <div class="knob-value">${value}</div>
        <label>${label}</label>
      </div>
    `;
    return knob;
  }

  setupEventListeners() {
    const dial = this.element.querySelector('.knob-dial');
    dial.addEventListener('mousedown', this.handleDragStart.bind(this));
  }

  updateDisplay(value) {
    this.element.querySelector('.knob-value').textContent = value;
    const rotation = (value / 127) * 270 - 135;
    this.element.querySelector('.knob-dial').style.transform = `rotate(${rotation}deg)`;
  }

  handleDragStart(e) {
    // Drag handling logic
  }
}
