let mode = 'A';
let variables = [];
let activeVariableGroupIndex = null;
let currentSettingIndex = 0;
let numKnobRows = 1;
const MAX_VARIABLES = 32; // Set a maximum number of variables
let midiAccess = null;
let midiInputs = [];
let knobMidiMappings = new Map();
let tooltipTimer = null;
let activeTooltipElement = null;


const numKnobs = 8;
const variableListContainer = document.getElementById('variableListContainer');
const variableListContent = document.querySelector('.variable-list-content');
const additionalSettings = document.querySelector('.additional-settings');
const p5Editor = document.getElementById('p5-editor');
const p5Output = document.getElementById('p5-output');

const settingsOrder = [
    'negative-prompt-container',
    'dimension-pair',
    'cfgScaleContainer',
    'samplingStepsContainer',
    'denoisingStrengthContainer',
    'img2imgSourceContainer'
];

function showNextSetting() {
    hideAllSettings();
    if (currentSettingIndex < settingsOrder.length) {
        const settingId = settingsOrder[currentSettingIndex];
        document.getElementById(settingId).style.display = 'block';
        currentSettingIndex++;
    } else {
        currentSettingIndex = 0;
    }
}

function hideAllSettings() {
    settingsOrder.forEach(setting => {
        document.getElementById(setting).style.display = 'none';
    });
}

document.getElementById('negativePromptToggle').addEventListener('click', () => {
    showNextSetting();
});

function handleJsonImport(json) {
    if (json.variables) {
        variables = json.variables;
        console.log('Imported Variables:', variables);
        
        numKnobRows = Math.ceil(variables.length / 8);
        updateKnobRows();
        
        if (json.stable_diffusion_input) {
            document.getElementById('inputText').value = json.stable_diffusion_input.prompt || '';
            document.getElementById('negativeInputText').value = json.stable_diffusion_input.negative_prompt || '';
            document.getElementById('heightInput').value = json.stable_diffusion_input.height || '';
            document.getElementById('widthInput').value = json.stable_diffusion_input.width || '';
            document.getElementById('cfgScaleInput').value = json.stable_diffusion_input.cfg_scale || '';
            document.getElementById('samplingStepsInput').value = json.stable_diffusion_input.steps || '';
            document.getElementById('denoisingStrengthInput').value = json.stable_diffusion_input.denoising_strength || '';
            document.getElementById('img2imgSourceInput').value = json.stable_diffusion_input.img2img_source || '';
        }
        if (json.p5_input && json.p5_input.code) {
            document.getElementById('p5-code').value = json.p5_input.code;
        }
        initializeModeA();
        if (mode === 'B') {
            initializeModeB();
        }
        if (mode === 'D') {
            initializeModeD();
        }
        updateAllKnobs();
        initMIDI();
    } else {
        console.error('Invalid JSON format: Missing `variables` field');
    }
}

function addVariable() {
  if (variables.length >= MAX_VARIABLES) {
    console.log('Maximum number of variables reached');
    return;
  }

  const newVariable = {
    name: `Variable ${variables.length + 1}`,
    feature_name: `var${variables.length + 1}`,
    value: {
      values: ['Value 1', 'Value 2', 'Value 3']
    }
  };

  variables.push(newVariable);
  updateKnobRows();
  console.log('New variable added:', newVariable);
}


function updateKnobRows() {
  const knobRowsContainer = document.getElementById('knobRowsContainer');
  knobRowsContainer.innerHTML = ''; // Clear existing knobs

  variables.forEach((variable, index) => {
    const knobContainer = createKnobContainer(index);
    knobRowsContainer.appendChild(knobContainer);
  });

  addEventListenersToKnobs();
  console.log('Knob rows updated');
}

function createKnobContainer(index) {
  const container = document.createElement('div');
  container.className = 'knob-container';
  container.id = `knob${index + 1}`;

  const knob = document.createElement('div');
  knob.className = 'knob';
  knob.style.backgroundColor = getKnobColor(index);
  knob.dataset.locked = "false";

  const knobDot = document.createElement('div');
  knobDot.className = 'knob-dot';
  knob.appendChild(knobDot);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'knob-value';
  input.value = '0';

  const groupName = document.createElement('div');
  groupName.className = 'variable-group-name';
  groupName.id = `group${index + 1}`;
  groupName.innerText = variables[index].feature_name || variables[index].name || "N/A";

  container.appendChild(knob);
  container.appendChild(input);
  container.appendChild(groupName);

  return container;
}

function getKnobColor(index) {
    const colors = ['#ff9999', '#ffcc99', '#ffff99', '#99ff99', '#99ffff', '#9999ff', '#cc99ff', '#ff99ff'];
    return colors[index % colors.length];
}

function updateAllKnobs() {
    document.querySelectorAll('.knob').forEach((knob, index) => {
        if (index < variables.length) {
            const valueA = parseFloat(knob.nextElementSibling.dataset.variableValueA) || 0;
            const valueB = parseFloat(knob.nextElementSibling.dataset.variableValueB) || 0;
            updateKnobText(knob, valueA, variables[index].value.values.length);
            updateKnob(knob, valueB);
        }
    });
}

function updateKnob(knob, value) {
    let angle = (value * 90) - 0; // Map value range [-1, 2] to angle range [-90, 180]
    knob.querySelector('.knob-dot').style.transform = `rotate(${angle}deg)`;
    knob.nextElementSibling.value = value.toFixed(2);
    if (mode === 'B' || mode === 'A') {
        knob.nextElementSibling.dataset.variableValueB = value.toFixed(2);
    }
    updateOutputText();
    updateNegativeOutputText();
}

function updateKnobText(knob, value, numValues) {
    if (variables.length > 0) {
        const index = Array.from(document.querySelectorAll('.knob')).indexOf(knob);
        const variableGroup = variables[index];
        if (variableGroup && variableGroup.value && variableGroup.value.values && variableGroup.value.values.length > 0) {
            const variableIndex = Math.max(0, Math.min(numValues - 1, Math.round(value)));
            const variableValue = variableGroup.value.values[variableIndex];
            knob.nextElementSibling.dataset.variableValueA = variableValue;

            const angle = -120 + (240 * variableIndex) / (numValues - 1);
            knob.querySelector('.knob-dot').style.transform = `rotate(${angle}deg)`;

            updateOutputText();
            updateNegativeOutputText();
        }
    }
}

function hidep5Elements() {
  document.getElementById('p5-editor').style.display = 'none';
  document.getElementById('p5-output').style.display = 'none';
}

function initializeModeA() {
  mode = 'A';
  document.getElementById('modeToggleButton').innerText = 'Mode A';
  document.querySelectorAll('.knob-container').forEach((container, index) => {
    if (index < variables.length) {
      container.querySelector('.knob').style.display = 'flex';
      container.querySelector('.knob-value').style.display = 'block';
      container.style.display = 'flex';
      
      const knob = container.querySelector('.knob');
      const inputValue = knob.nextElementSibling;
      const variableGroup = variables[index];
      
      if (variableGroup && variableGroup.value && variableGroup.value.values && variableGroup.value.values.length > 0) {
        // Use the existing value if available, otherwise use a random value
        const currentValue = parseInt(inputValue.value) || Math.floor(Math.random() * variableGroup.value.values.length);
        updateKnobText(knob, currentValue, variableGroup.value.values.length);
        inputValue.value = currentValue;
      } else {
        inputValue.value = 0;
        delete inputValue.dataset.variableGroupName;
        delete inputValue.dataset.variableValueA;
      }
    } else {
      container.style.display = 'none';
    }
  });
  updateOutputText();
  updateNegativeOutputText();
  document.querySelectorAll('.show-variable-button').forEach(button => button.remove());
  hidep5Elements();
    updateModeIndicator('A');
}

function initializeModeB() {
  mode = 'B';
  document.getElementById('modeToggleButton').innerText = 'Mode B';
  document.querySelectorAll('.knob-container').forEach((container, index) => {
    if (index < variables.length) {
      container.querySelector('.knob').style.display = 'flex';
      container.querySelector('.knob-value').style.display = 'block';
      container.style.display = 'flex';
      
      const knob = container.querySelector('.knob');
      const inputValue = knob.nextElementSibling;
      
      if (!inputValue.dataset.userAdjusted) {
        updateKnob(knob, 1);
        inputValue.value = '1.00';
        inputValue.dataset.variableValueB = '1.00';
      }
    } else {
      container.style.display = 'none';
    }
  });
  updateOutputText();
  updateNegativeOutputText();
    knobMidiMappings.clear();
    hidep5Elements();
      document.querySelectorAll('.show-variable-button').forEach(button => button.remove());
  hidep5Elements();
    updateModeIndicator('B');
}


function initializeModeC() {
  mode = 'C';
  document.getElementById('modeToggleButton').innerText = 'Mode C';
  document.querySelectorAll('.knob-container').forEach((container, index) => {
    if (index < variables.length) {
      container.style.display = 'flex';
      container.querySelector('.knob').style.display = 'none';
      container.querySelector('.knob-value').style.display = 'none';
      
      // Remove existing show button if present
      const existingButton = container.querySelector('.show-variable-button');
      if (existingButton) {
        existingButton.remove();
      }
      
      // Add new show button
      const showButton = document.createElement('button');
      showButton.innerText = 'Show';
      showButton.className = 'show-variable-button';
      showButton.style.display = 'block';
      showButton.addEventListener('click', () => showVariableDetails(index));
      container.appendChild(showButton);
    } else {
      container.style.display = 'none';
    }
  });
  hideVariableList();
    updateModeIndicator('C');
}

function initializeModeD() {
    mode = 'D';
    document.getElementById('modeToggleButton').innerText = 'Mode D';
    document.querySelectorAll('.knob-container').forEach(container => {
        container.style.display = 'none';
    });
    p5Editor.style.display = 'block';
    p5Output.style.display = 'block';
    knobMidiMappings.clear();
    updateModeIndicator('D');
}

function addShowButtons() {
  document.querySelectorAll('.knob-container').forEach((container, index) => {
    if (!container.querySelector('.show-variable-button')) {
      const showButton = document.createElement('button');
      showButton.innerText = 'Show';
      showButton.className = 'show-variable-button';
      showButton.addEventListener('click', () => showVariableDetails(index));
      container.appendChild(showButton);
    }
  });
}

function showVariableDetails(index) {
    const variable = variables[index];
    const variableListContent = document.querySelector('.variable-list-content');
    variableListContent.innerHTML = '';
    
    // Add variable name
    const nameRow = document.createElement('div');
    nameRow.className = 'variable-row';
    nameRow.innerHTML = `
        <div class="variable-column">Name:</div>
        <div class="value-column">
            <input type="text" value="${variable.name}" onchange="updateVariableName(${index}, this.value)">
        </div>
    `;
    variableListContent.appendChild(nameRow);
    
    // Add variable values
    if (Array.isArray(variable.value.values)) {
        variable.value.values.forEach((value, i) => {
            const valueRow = document.createElement('div');
            valueRow.className = 'variable-row';
            valueRow.innerHTML = `
                <div class="variable-column">Value ${i + 1}:</div>
                <div class="value-column">
                    <input type="text" value="${value}" onchange="updateVariableValue(${index}, ${i}, this.value)">
                </div>
            `;
            variableListContent.appendChild(valueRow);
        });
    }
    
    // Add "new value" row
    const newValueRow = document.createElement('div');
    newValueRow.className = 'variable-row new-value-row';
    newValueRow.innerHTML = `
        <div class="variable-column">New Value:</div>
        <div class="value-column">
            <input type="text" placeholder="Click to add new value">
        </div>
    `;
    variableListContent.appendChild(newValueRow);

    const newValueInput = newValueRow.querySelector('input');
    newValueInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const newValue = this.value.trim();
            if (newValue) {
                variable.value.values.push(newValue);
                showVariableDetails(index); // Refresh the display
                updateOutputText();
                updateNegativeOutputText();
            }
        }
    });

    document.getElementById('variableListContainer').style.display = 'block';
}

function updateVariableName(index, newName) {
    variables[index].name = newName;
    variables[index].feature_name = newName.toLowerCase().replace(/\s+/g, '_');
    updateOutputText();
    updateNegativeOutputText();
}

function updateVariableValue(variableIndex, valueIndex, newValue) {
    variables[variableIndex].value.values[valueIndex] = newValue;
    updateOutputText();
    updateNegativeOutputText();
}

function addVariableValueRow(container, value, valueIndex, variableIndex) {
    const valueRow = document.createElement('div');
    valueRow.className = 'variable-row';
    valueRow.innerHTML = `
        <div class="variable-column">Value ${valueIndex + 1}:</div>
        <div class="value-column">
            <input type="text" value="${value}" data-index="${valueIndex}" onchange="updateVariableValue(${variableIndex}, ${valueIndex}, this.value)">
        </div>
    `;
    return valueRow;  // Return the created row element
} 
function updateVariableName(index, newName) {
  const oldName = variables[index].name;
  const oldFeatureName = variables[index].feature_name;
  
  variables[index].name = newName;
  variables[index].feature_name = newName.toLowerCase().replace(/\s+/g, '_');
  
  // Update knob label
  const knobLabel = document.querySelector(`#knob${index + 1} .variable-group-name`);
  if (knobLabel) {
    knobLabel.innerText = newName;
  }
  
  // Update input and output texts
  updateVariableReferences(oldFeatureName, variables[index].feature_name);
  
  // Update knob datasets
  updateKnobDatasets(index, variables[index].feature_name);
  
  console.log(`Variable renamed: ${oldName} -> ${newName}`);
  
  // Refresh output texts
  updateOutputText();
  updateNegativeOutputText();
}

function updateVariableReferences(oldName, newName) {
  const inputText = document.getElementById('inputText');
  const negativeInputText = document.getElementById('negativeInputText');
  
  inputText.value = inputText.value.replace(
    new RegExp(`{{${oldName}}}`, 'g'), 
    `{{${newName}}}`
  );
  negativeInputText.value = negativeInputText.value.replace(
    new RegExp(`{{${oldName}}}`, 'g'), 
    `{{${newName}}}`
  );
}


function updateKnobDatasets(index, newFeatureName) {
  const knobValue = document.querySelector(`#knob${index + 1} .knob-value`);
  if (knobValue) {
    knobValue.dataset.variableGroupName = newFeatureName;
  }
}

function addNewValueRow(container, variable, variableIndex) {
    const newValueRow = document.createElement('div');
    newValueRow.className = 'variable-row new-value-row';
    newValueRow.innerHTML = `
        <div class="variable-column">New Value:</div>
        <div class="value-column">
            <input type="text" placeholder="Click to add new value" readonly>
        </div>
    `;
    container.appendChild(newValueRow);

    const input = newValueRow.querySelector('input');
    input.addEventListener('focus', function() {
        this.removeAttribute('readonly');
        this.placeholder = '';
    });
    input.addEventListener('blur', function() {
        if (!this.value.trim()) {
            this.setAttribute('readonly', true);
            this.placeholder = 'Click to add new value';
        }
    });
      input.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const newValue = this.value.trim();
      if (newValue) {
        variable.value.values.push(newValue);
        const newIndex = variable.value.values.length - 1;
        addVariableValueRow(container, newValue, newIndex, variableIndex);
        this.value = '';
        this.focus();
        updateOutputText();
        updateNegativeOutputText();
      }
    }
  });
}

function handleValueKeydown(event, input) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const newInput = input.closest('.variable-row').nextElementSibling.querySelector('input');
        if (newInput) {
            newInput.focus();
        }
    }
}

function hideVariableList() {
    document.getElementById('variableListContainer').style.display = 'none';
}

function showVariableList() {
    document.getElementById('variableListContainer').style.display = 'block';
}


function updateOutputText() {
  const inputText = document.getElementById('inputText').value;
  let outputText = inputText;

  document.querySelectorAll('.knob-value').forEach((input, index) => {
    if (index < variables.length) {
      const variableGroup = variables[index];
      const variableFeatureName = variableGroup.feature_name;
      const variableValueA = input.dataset.variableValueA;
      const variableValueB = parseFloat(input.dataset.variableValueB);

      if (variableFeatureName) {
        const regex = new RegExp(`{{${variableFeatureName}}}`, 'g');
        if (variableValueA && mode === 'A' && variableValueB && variableValueB !== 1 && variableValueB !== 0) {
          outputText = outputText.replace(regex, `[${variableValueA}:${variableValueB.toFixed(2)}]`);
        } else if (mode === 'B' && variableValueB && variableValueB !== 1 && variableValueB !== 0) {
          outputText = outputText.replace(regex, `[${variableValueA}:${variableValueB.toFixed(2)}]`);
        } else {
          outputText = outputText.replace(regex, variableValueA);
        }
      }
    }
  });

  document.getElementById('outputText').innerText = outputText;
}

function updateNegativeOutputText() {
  const inputText = document.getElementById('negativeInputText').value;
  let outputText = inputText;

  document.querySelectorAll('.knob-value').forEach((input, index) => {
    if (index < variables.length) {
      const variableGroup = variables[index];
      const variableFeatureName = variableGroup.feature_name;
      const variableValueA = input.dataset.variableValueA;
      const variableValueB = parseFloat(input.dataset.variableValueB);

      if (variableFeatureName) {
        const regex = new RegExp(`{{${variableFeatureName}}}`, 'g');
        if (variableValueA && mode === 'A' && variableValueB && variableValueB !== 1 && variableValueB !== 0) {
          outputText = outputText.replace(regex, `[${variableValueA}:${variableValueB.toFixed(2)}]`);
        } else if (mode === 'B' && variableValueB && variableValueB !== 1 && variableValueB !== 0) {
          outputText = outputText.replace(regex, `[${variableValueA}:${variableValueB.toFixed(2)}]`);
        } else {
          outputText = outputText.replace(regex, variableValueA);
        }
      }
    }
  });

  document.getElementById('negativeOutputText').innerText = outputText;
}

function addEventListenersToKnobs() {
    document.querySelectorAll('.knob').forEach((knob, index) => {
        let initialX, initialY, initialValue;
        let clickTimeout = null;

        knob.addEventListener('mousedown', (e) => {
            if (knob.dataset.locked === "true") return;
            e.preventDefault();
            initialX = e.clientX;
            initialY = e.clientY;
            initialValue = parseFloat(knob.nextElementSibling.value);

            const onMouseMove = (e) => {
                const deltaX = e.clientX - initialX;
                const deltaY = initialY - e.clientY;
                const change = (deltaX + deltaY) * 0.01;
                let newValue = initialValue + change;
                if (mode === 'B') {
                    newValue = Math.max(-1, Math.min(2, newValue));
                    updateKnob(knob, newValue);
                } else if (mode === 'A' && variables.length > 0) {
                    const numValues = variables[index].value.values.length;
                    newValue = Math.max(0, Math.min(numValues - 1, Math.round(newValue)));
                    updateKnobText(knob, newValue, numValues);
                    knob.nextElementSibling.value = newValue;
                }
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        knob.addEventListener('click', () => {
            if (mode === 'C') return;
            if (clickTimeout) {
                clearTimeout(clickTimeout);
                clickTimeout = null;
                toggleLock(knob);
            } else {
                clickTimeout = setTimeout(() => {
                    clickTimeout = null;
                }, 500);
            }
        });
    });
}

function toggleLock(knob) {
    const isLocked = knob.dataset.locked === "true";
    knob.dataset.locked = !isLocked;
    knob.style.opacity = !isLocked ? '0.5' : '1';
}

document.getElementById('modeToggleButton').addEventListener('click', () => {
    if (mode === 'A') {
        initializeModeB();
    } else if (mode === 'B') {
        initializeModeC();
    } else if (mode === 'C') {
        initializeModeD();
    } else {
        initializeModeA();
    }
});

document.getElementById('randomizeButton').addEventListener('click', () => {
    if (mode === 'A') {
        randomizeModeA();
    } else if (mode === 'B') {
        randomizeModeB();
    }
});

function randomizeModeA() {
    document.querySelectorAll('.knob').forEach((knob, index) => {
        if (knob.dataset.locked === "true") return;
        if (index < variables.length) {
            const variableGroup = variables[index];
            if (variableGroup && variableGroup.value && variableGroup.value.values && variableGroup.value.values.length > 0) {
                const randomIndex = Math.floor(Math.random() * variableGroup.value.values.length);
                updateKnobText(knob, randomIndex, variableGroup.value.values.length);
                knob.nextElementSibling.value = randomIndex;
            }
        }
    });
}

function randomizeModeB() {
    document.querySelectorAll('.knob').forEach((knob, index) => {
        if (knob.dataset.locked === "true") return;
        if (index < variables.length) {
            const randomValue = Math.random() * 3 - 1;
            updateKnob(knob, randomValue);
            knob.nextElementSibling.value = randomValue.toFixed(2);
        }
    });
}

document.getElementById('importJsonButton').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (event) => {
        const file = event.target.files[0];
        if (file) {
            const text = await file.text();
            try {
                const json = JSON.parse(text);
                handleJsonImport(json);
            } catch (error) {
                console.error('Error parsing JSON:', error);
            }
        }
    };
    input.click();
});

document.getElementById('saveButton').addEventListener('click', () => {
    const state = {
        mode,
        variables,
        inputText: document.getElementById('inputText').value,
        negativeInputText: document.getElementById('negativeInputText').value,
        height: document.getElementById('heightInput').value,
        width: document.getElementById('widthInput').value,
        cfgScale: document.getElementById('cfgScaleInput').value,
        samplingSteps: document.getElementById('samplingStepsInput').value,
        denoisingStrength: document.getElementById('denoisingStrengthInput').value,
        img2imgSource: document.getElementById('img2imgSourceInput').value,
        knobs: Array.from(document.querySelectorAll('.knob-value')).map(input => ({
            value: input.value,
            dataset: { ...input.dataset }
        })),
        p5Code: document.getElementById('p5-code').value
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'synthograsizer-state.json';
    link.click();
});

document.getElementById('loadButton').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (event) => {
        const file = event.target.files[0];
        if (file) {
            const text = await file.text();
            try {
                const state = JSON.parse(text);
                handleLoadState(state);
            } catch (error) {
                console.error('Error parsing JSON:', error);
            }
        }
    };
    input.click();
});

function handleLoadState(state) {
    mode = state.mode || 'A';
    variables = state.variables || [];
    document.getElementById('inputText').value = state.inputText || '';
    document.getElementById('negativeInputText').value = state.negativeInputText || '';
    document.getElementById('heightInput').value = state.height || '';
    document.getElementById('widthInput').value = state.width || '';
    document.getElementById('cfgScaleInput').value = state.cfgScale || '';
    document.getElementById('samplingStepsInput').value = state.samplingSteps || '';
    document.getElementById('denoisingStrengthInput').value = state.denoisingStrength || '';
    document.getElementById('img2imgSourceInput').value = state.img2imgSource || '';
    document.getElementById('p5-code').value = state.p5Code || '';

    numKnobRows = Math.ceil(variables.length / 8);
    updateKnobRows();

    state.knobs.forEach((knob, index) => {
        const input = document.querySelectorAll('.knob-value')[index];
        if (input) {
            input.value = knob.value;
            Object.keys(knob.dataset).forEach(key => {
                input.dataset[key] = knob.dataset[key];
            });
        }
    });

    if (mode === 'A') {
        initializeModeA();
    } else if (mode === 'B') {
        initializeModeB();
    } else if (mode === 'C') {
        initializeModeC();
    } else if (mode === 'D') {
        initializeModeD();
    }
}

function initMIDI() {
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess()
            .then(onMIDISuccess, onMIDIFailure);
    } else {
        console.log("WebMIDI is not supported in this browser.");
    }
}

function onMIDISuccess(access) {
    midiAccess = access;
    midiInputs = Array.from(midiAccess.inputs.values());
    console.log("MIDI Access Obtained");

    for (let input of midiInputs) {
        input.onmidimessage = onMIDIMessage;
    }
}

function onMIDIFailure(error) {
    console.log("Failed to get MIDI access - " + error);
}

function onMIDIMessage(message) {
    let command = message.data[0];
    let note = message.data[1];
    let velocity = (message.data.length > 2) ? message.data[2] : 0;

    if ((command & 0xF0) === 0xB0) {
        handleControlChange(note, velocity);
    }
}

function handleControlChange(controlNumber, value) {
    if (!knobMidiMappings.has(controlNumber)) {
        let availableKnob = Array.from(document.querySelectorAll('.knob'))
            .find(knob => !Array.from(knobMidiMappings.values()).includes(knob));
        
        if (availableKnob) {
            knobMidiMappings.set(controlNumber, availableKnob);
            console.log(`Mapped MIDI control ${controlNumber} to knob ${availableKnob.id}`);
        }
    }

    let knob = knobMidiMappings.get(controlNumber);
    if (knob) {
        updateKnobFromMIDI(knob, value);
    }
}

function updateModeIndicator(mode) {
  const modeToggleButton = document.getElementById('modeToggleButton');
  modeToggleButton.textContent = `Mode ${mode}`;
  
  let modeDescription = '';
  switch(mode) {
    case 'A':
      modeDescription = 'Variable Selection';
      break;
    case 'B':
      modeDescription = 'Continuous Adjustment';
      break;
    case 'C':
      modeDescription = 'Variable Editing';
      break;
    case 'D':
      modeDescription = 'P5.js Integration';
      break;
  }
  
  const modeDescriptionElement = document.getElementById('modeDescription');
  if (!modeDescriptionElement) {
    const newElement = document.createElement('div');
    newElement.id = 'modeDescription';
    modeToggleButton.parentNode.insertBefore(newElement, modeToggleButton.nextSibling);
  }
  document.getElementById('modeDescription').textContent = modeDescription;
}


function updateKnobFromMIDI(knob, midiValue) {
    let index = Array.from(document.querySelectorAll('.knob')).indexOf(knob);
    if (index < 0 || index >= variables.length) return;

    let variableGroup = variables[index];
    if (!variableGroup || !variableGroup.value || !variableGroup.value.values) return;

    let numValues = variableGroup.value.values.length;
    let normalizedValue = midiValue / 127;
    
    if (mode === 'A') {
        let valueIndex = Math.floor(normalizedValue * (numValues - 1));
        updateKnobText(knob, valueIndex, numValues);
        knob.nextElementSibling.value = valueIndex;
    } else if (mode === 'B') {
        let value = normalizedValue * 3 - 1; // Map 0-127 to -1 to 2
        updateKnob(knob, value);
        knob.nextElementSibling.value = value.toFixed(2);
    }
    
    updateOutputText();
    updateNegativeOutputText();
    knob.nextElementSibling.dataset.userAdjusted = 'true';
}

function runP5Code() {
    const code = document.getElementById('p5-code').value;
    const sketch = new Function('p', code);
    
    if (window.p5Instance) {
        window.p5Instance.remove();
    }
    
    window.p5Instance = new p5(sketch, 'p5-output');
}

function addTooltip(element, tooltipText) {
  // Store the tooltip text as a data attribute on the element
  element.setAttribute('data-tooltip', tooltipText);
  element.addEventListener('mouseenter', startTooltipTimer);
  element.addEventListener('mouseleave', clearTooltipTimer);
  element.addEventListener('mousemove', resetTooltipTimer);
}

function startTooltipTimer(event) {
  clearTooltipTimer();
  activeTooltipElement = event.target;
  const tooltipText = activeTooltipElement.getAttribute('data-tooltip');
  tooltipTimer = setTimeout(() => showTooltip(event.target, tooltipText), 2000);
}

function clearTooltipTimer() {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
  hideTooltip();
}

function resetTooltipTimer(event) {
  if (activeTooltipElement) {
    clearTooltipTimer();
    startTooltipTimer(event);
  }
}

function showTooltip(element, tooltipText) {
  hideTooltip(); // Ensure any existing tooltip is removed
  const tooltip = document.createElement('div');
  tooltip.className = 'subtle-tooltip';
  tooltip.textContent = tooltipText;
  document.body.appendChild(tooltip);
  const rect = element.getBoundingClientRect();
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
  // Trigger reflow before adding the 'visible' class
  tooltip.offsetHeight;
  tooltip.classList.add('visible');
}

function hideTooltip() {
  const tooltip = document.querySelector('.subtle-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
}

function updateModeToggleTooltip() {
  const modeToggleButton = document.getElementById('modeToggleButton');
  let tooltipText = "Switch between operation modes:\n" +
                    "A: Select discrete variable values\n" +
                    "B: Adjust variables continuously\n" +
                    "C: Edit variable details\n" +
                    "D: Use P5.js for custom processing";
  
  addTooltip(modeToggleButton, tooltipText);
}



document.addEventListener('DOMContentLoaded', () => {
  updateModeToggleTooltip();
  
  // Add tooltips for other elements
  addTooltip(document.getElementById('importJsonButton'), "Import a JSON file to load variables and settings");
  addTooltip(document.getElementById('saveButton'), "Save current variables and settings to a JSON file");
  addTooltip(document.getElementById('loadButton'), "Load previously saved variables and settings");
  addTooltip(document.getElementById('randomizeButton'), "Randomize variable values based on the current mode");
  
  document.getElementById('inputText').addEventListener('input', updateOutputText);
  document.getElementById('negativeInputText').addEventListener('input', updateNegativeOutputText);
  
  document.getElementById('addVariableButton').addEventListener('click', addVariable);
  
  // Initial setup
  updateKnobRows();
  initMIDI();
});