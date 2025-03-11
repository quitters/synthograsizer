import { store } from '../modules/store';
import { SynthVariable } from '../modules/variable';

export class VariablesPanel {
  constructor(container) {
    this.container = container;
    this.variables = new Map();
    this.initializeUI();
  }

  initializeUI() {
    this.container.innerHTML = `
      <div class="panel-header">
        <h2>Variables</h2>
        <button class="add-variable-btn">Add Variable</button>
      </div>
      <div class="variables-list"></div>
    `;

    this.variablesList = this.container.querySelector('.variables-list');
    this.addButton = this.container.querySelector('.add-variable-btn');
    
    this.addButton.addEventListener('click', () => this.showAddVariableDialog());
  }

  showAddVariableDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <div class="dialog-content">
        <h3>Add Variable</h3>
        <form class="variable-form">
          <div class="form-group">
            <label>Name:</label>
            <input type="text" name="name" required>
          </div>
          <div class="form-group">
            <label>Type:</label>
            <select name="type">
              <option value="continuous">Continuous</option>
              <option value="discrete">Discrete</option>
              <option value="trigger">Trigger</option>
            </select>
          </div>
          <div class="form-group continuous-options">
            <label>Range:</label>
            <input type="number" name="min" placeholder="Min" value="0">
            <input type="number" name="max" placeholder="Max" value="1">
          </div>
          <div class="form-group discrete-options" style="display: none;">
            <label>Options:</label>
            <textarea name="options" placeholder="One option per line"></textarea>
          </div>
          <div class="dialog-buttons">
            <button type="submit">Add</button>
            <button type="button" class="cancel-btn">Cancel</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(dialog);

    const form = dialog.querySelector('form');
    const typeSelect = form.querySelector('[name="type"]');
    const continuousOptions = form.querySelector('.continuous-options');
    const discreteOptions = form.querySelector('.discrete-options');

    typeSelect.addEventListener('change', () => {
      const isContinuous = typeSelect.value === 'continuous';
      continuousOptions.style.display = isContinuous ? 'block' : 'none';
      discreteOptions.style.display = isContinuous ? 'none' : 'block';
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const config = {
        name: formData.get('name'),
        type: formData.get('type')
      };

      if (config.type === 'continuous') {
        config.range = [
          parseFloat(formData.get('min')),
          parseFloat(formData.get('max'))
        ];
      } else if (config.type === 'discrete') {
        config.values = formData.get('options')
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean);
      }

      this.addVariable(config);
      document.body.removeChild(dialog);
    });

    dialog.querySelector('.cancel-btn').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
  }

  addVariable(config) {
    const variable = new SynthVariable(config);
    this.variables.set(variable.id, variable);
    
    const element = document.createElement('div');
    element.className = 'variable-control';
    element.dataset.variableId = variable.id;

    if (variable.type === 'continuous') {
      this.createContinuousControl(element, variable);
    } else if (variable.type === 'discrete') {
      this.createDiscreteControl(element, variable);
    } else {
      this.createTriggerControl(element, variable);
    }

    this.variablesList.appendChild(element);
    store.eventBus.emit('variable-added', { variable });
    return variable;
  }

  createContinuousControl(element, variable) {
    element.innerHTML = `
      <div class="variable-header">
        <span class="variable-name">${variable.name}</span>
        <span class="variable-value">${variable.currentValue.toFixed(2)}</span>
      </div>
      <div class="knob-container">
        <div class="knob" style="transform: rotate(${this.valueToRotation(variable.currentValue, variable.range)}deg)"></div>
      </div>
    `;

    const knob = element.querySelector('.knob');
    let isDragging = false;
    let startY;
    let startValue;

    knob.addEventListener('mousedown', e => {
      isDragging = true;
      startY = e.clientY;
      startValue = variable.currentValue;
      document.body.style.cursor = 'ns-resize';
    });

    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      
      const deltaY = startY - e.clientY;
      const range = variable.range[1] - variable.range[0];
      const newValue = startValue + (deltaY / 100) * range;
      const clampedValue = Math.max(variable.range[0], 
                                  Math.min(variable.range[1], newValue));
      
      variable.update(clampedValue);
      knob.style.transform = `rotate(${this.valueToRotation(clampedValue, variable.range)}deg)`;
      element.querySelector('.variable-value').textContent = clampedValue.toFixed(2);
      
      store.eventBus.emit('variable-updated', { 
        id: variable.id, 
        value: clampedValue 
      });
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
      }
    });
  }

  createDiscreteControl(element, variable) {
    element.innerHTML = `
      <div class="variable-header">
        <span class="variable-name">${variable.name}</span>
      </div>
      <select class="discrete-select">
        ${variable.values.map(value => 
          `<option value="${value}">${value}</option>`
        ).join('')}
      </select>
    `;

    const select = element.querySelector('select');
    select.value = variable.currentValue;

    select.addEventListener('change', () => {
      variable.update(select.value);
      store.eventBus.emit('variable-updated', {
        id: variable.id,
        value: select.value
      });
    });
  }

  createTriggerControl(element, variable) {
    element.innerHTML = `
      <div class="variable-header">
        <span class="variable-name">${variable.name}</span>
      </div>
      <button class="trigger-button">Trigger</button>
    `;

    const button = element.querySelector('button');
    button.addEventListener('click', () => {
      store.eventBus.emit('variable-triggered', {
        id: variable.id
      });
      
      button.classList.add('active');
      setTimeout(() => button.classList.remove('active'), 100);
    });
  }

  valueToRotation(value, range) {
    const [min, max] = range;
    const percent = (value - min) / (max - min);
    return percent * 270 - 135; // -135 to 135 degrees
  }

  updateVariable(id, value) {
    const element = this.container.querySelector(`[data-variable-id="${id}"]`);
    if (!element) return;

    const variable = this.variables.get(id);
    if (!variable) return;

    if (variable.type === 'continuous') {
      const knob = element.querySelector('.knob');
      knob.style.transform = `rotate(${this.valueToRotation(value, variable.range)}deg)`;
      element.querySelector('.variable-value').textContent = value.toFixed(2);
    } else if (variable.type === 'discrete') {
      const select = element.querySelector('select');
      select.value = value;
    }
  }

  removeVariable(id) {
    const element = this.container.querySelector(`[data-variable-id="${id}"]`);
    if (element) {
      element.remove();
    }
    this.variables.delete(id);
    store.eventBus.emit('variable-removed', { id });
  }
}
