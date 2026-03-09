// KnobController - Handles button-based value cycling

export class Knob {
  constructor(element, variable, index, config, onValueChange) {
    this.element = element;
    this.variable = variable;
    this.index = index;
    this.config = config;
    this.onValueChange = onValueChange;

    this.currentIndex = 0;

    // Get sub-elements
    this.upButton = element.querySelector('.knob-button-up');
    this.downButton = element.querySelector('.knob-button-down');
    this.valueElement = element.querySelector('.knob-value');
    this.labelElement = element.querySelector('.knob-label');

    this.setupEventListeners();
    this.updateDisplay();
  }

  setupEventListeners() {
    // Up button - go to previous value (with looping)
    this.upButton.addEventListener('click', () => this.previous());

    // Down button - go to next value (with looping)
    this.downButton.addEventListener('click', () => this.next());

    // Keyboard navigation on buttons
    this.upButton.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.downButton.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Update ARIA labels
    this.upButton.setAttribute('aria-label', `Previous ${this.variable.name}`);
    this.downButton.setAttribute('aria-label', `Next ${this.variable.name}`);
  }

  // Move to next value (with looping)
  next() {
    this.currentIndex = (this.currentIndex + 1) % this.variable.values.length;
    this.updateDisplay();
    this.triggerValueChange();
  }

  // Move to previous value (with looping)
  previous() {
    this.currentIndex = (this.currentIndex - 1 + this.variable.values.length) % this.variable.values.length;
    this.updateDisplay();
    this.triggerValueChange();
  }

  // Keyboard navigation
  handleKeyDown(e) {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this.previous();
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.next();
        break;

      case 'Home':
        e.preventDefault();
        this.currentIndex = 0;
        this.updateDisplay();
        this.triggerValueChange();
        break;

      case 'End':
        e.preventDefault();
        this.currentIndex = this.variable.values.length - 1;
        this.updateDisplay();
        this.triggerValueChange();
        break;
    }
  }

  updateDisplay() {
    const currentValue = this.getCurrentValue();
    
    // Update value display (truncate if too long)
    const displayValue = currentValue.length > 16 
      ? currentValue.substring(0, 14) + '...' 
      : currentValue;
    this.valueElement.textContent = displayValue;
    this.valueElement.title = currentValue; // Full text on hover
  }

  triggerValueChange() {
    const currentValue = this.getCurrentValue();
    this.onValueChange(this.index, currentValue);
  }

  getCurrentValue() {
    return this.variable.values[this.currentIndex] || '';
  }

  disable() {
    this.upButton.disabled = true;
    this.downButton.disabled = true;
    this.element.classList.add('disabled');
  }

  enable() {
    this.upButton.disabled = false;
    this.downButton.disabled = false;
    this.element.classList.remove('disabled');
  }

  destroy() {
    // Cleanup if needed
  }
}
