import { store } from '../modules/store';

export class ParametersPanel {
  constructor(container) {
    this.container = container;
    this.parameters = new Map();
    this.initializeUI();
  }

  initializeUI() {
    this.container.innerHTML = `
      <div class="panel-header">
        <h2>Parameters</h2>
        <button class="refresh-params-btn">Refresh</button>
      </div>
      <div class="parameters-list"></div>
    `;

    this.parametersList = this.container.querySelector('.parameters-list');
    this.refreshButton = this.container.querySelector('.refresh-params-btn');
    
    this.refreshButton.addEventListener('click', () => this.refreshParameters());
  }

  refreshParameters() {
    const sketch = store.currentSketch;
    if (!sketch) return;

    // Clear existing parameters
    this.parametersList.innerHTML = '';
    this.parameters.clear();

    // Analyze sketch for bindable parameters
    const params = store.autoMapper.analyze(sketch);
    params.forEach(param => this.addParameter(param));
  }

  addParameter(param) {
    const element = document.createElement('div');
    element.className = 'parameter-item';
    element.dataset.paramPath = param.path;
    
    element.innerHTML = `
      <div class="parameter-header">
        <span class="parameter-name">${param.path}</span>
        <span class="parameter-type">${param.type}</span>
      </div>
      <div class="parameter-value">${param.current}</div>
      <div class="parameter-meta">
        ${param.type === 'continuous' 
          ? `Range: ${param.suggestedRange[0]} - ${param.suggestedRange[1]}`
          : ''}
      </div>
      <div class="parameter-binding"></div>
    `;

    // Make parameter droppable for variables
    element.addEventListener('dragover', e => {
      e.preventDefault();
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove('drag-over');
    });

    element.addEventListener('drop', e => {
      e.preventDefault();
      element.classList.remove('drag-over');
      
      const variableId = e.dataTransfer.getData('text/plain');
      if (variableId) {
        this.bindParameter(param.path, variableId);
      }
    });

    this.parametersList.appendChild(element);
    this.parameters.set(param.path, param);
  }

  bindParameter(paramPath, variableId) {
    const param = this.parameters.get(paramPath);
    const variable = store.variables.get(variableId);
    
    if (!param || !variable) return;

    // Create binding in p5Binder
    store.p5Binder.createBinding(variableId, store.currentSketch, paramPath);

    // Update UI to show binding
    const element = this.container.querySelector(`[data-param-path="${paramPath}"]`);
    if (element) {
      const bindingDiv = element.querySelector('.parameter-binding');
      bindingDiv.innerHTML = `
        <div class="binding-info">
          <span>Bound to: ${variable.name}</span>
          <button class="remove-binding-btn">×</button>
        </div>
      `;

      element.querySelector('.remove-binding-btn').addEventListener('click', () => {
        this.unbindParameter(paramPath);
      });
    }
  }

  unbindParameter(paramPath) {
    store.p5Binder.removeBinding(paramPath);
    
    const element = this.container.querySelector(`[data-param-path="${paramPath}"]`);
    if (element) {
      const bindingDiv = element.querySelector('.parameter-binding');
      bindingDiv.innerHTML = '';
    }
  }

  updateParameterValue(paramPath, value) {
    const element = this.container.querySelector(`[data-param-path="${paramPath}"]`);
    if (element) {
      const valueDiv = element.querySelector('.parameter-value');
      valueDiv.textContent = typeof value === 'number' ? value.toFixed(2) : value;
    }
  }
}
