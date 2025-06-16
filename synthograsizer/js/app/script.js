// Function to reset and refresh MIDI connections
function refreshMidiConnection() {
    console.log("Manual MIDI refresh requested...");
    
    // Reset the initialization flag to force a new permission request
    midiInitialized = false;
    
    // If we already have MIDI access, try to close connections
    if (midiAccess) {
        try {
            // Remove event listeners from inputs
            midiInputs.forEach(input => {
                try {
                    input.onmidimessage = null;
                    input.removeEventListener('midimessage', onMIDIMessage);
                } catch (e) {
                    // Ignore errors during cleanup
                }
            });
            
            // Clear input references
            midiInputs = [];
            
            console.log("Cleared existing MIDI connections");
        } catch (error) {
            console.error("Error clearing MIDI connections:", error);
        }
    }
    
    // Re-initialize MIDI
    initMIDI();
    
    // Update UI message
    if (midiStatusPanel) {
        const noMappingsMessage = midiMappingsContainer.querySelector('.no-mappings-message');
        if (noMappingsMessage) {
            noMappingsMessage.textContent = "Refreshing MIDI connections... Move a controller to establish mappings.";
        }
    }
    
    // Show success message after a short delay to allow MIDI initialization
    setTimeout(() => {
        alert(`MIDI connections refreshed! Found ${midiInputs.length} devices.`);
        updateMidiStatusPanel();
    }, 1000);
}// Process MIDI input directly in Mode D (bypassing knob updates)
function handleMidiInModeD(controlNumber, midiValue) {
    console.log(`Direct Mode D MIDI handler: CC ${controlNumber}: ${midiValue}`);
    
    // Find which knob was mapped to this CC in a previous mode
    // or auto-assign to the first available knob if none mapped
    let knobIndex = -1;
    
    // Check if we have an existing mapping
    const mappedKnob = knobMidiMappings.get(controlNumber);
    if (mappedKnob) {
        knobIndex = parseInt(mappedKnob.dataset.index);
        console.log(`Using existing mapping: CC ${controlNumber} -> knob ${knobIndex}`);
    } else {
        // Auto-assign to first available variable
        // Use Array.from().find() approach for consistency with handleControlChange
        const availableKnob = Array.from(document.querySelectorAll('.knob')).find(knob => {
            const index = parseInt(knob.dataset.index);
            // Check if locked, if variable exists, and if not already mapped
            return knob.dataset.locked === "false" &&
                   index < variables.length &&
                   !Array.from(knobMidiMappings.values()).includes(knob);
        });

        if (availableKnob) {
            knobIndex = parseInt(availableKnob.dataset.index);
            knobMidiMappings.set(controlNumber, availableKnob);
            console.log(`Auto-mapped CC ${controlNumber} to knob ${knobIndex} (${variables[knobIndex]?.name || 'N/A'})`);
        } else {
            console.warn(`No available unlocked knob found for CC ${controlNumber}`);
        }
    }
    
    // Ensure we have a valid variable
    if (knobIndex < 0 || knobIndex >= variables.length) {
        console.warn(`No available variable found for CC ${controlNumber}`);
        return;
    }
    
    const variable = variables[knobIndex];
    const numValues = variable.value?.values?.length || 0;
    
    if (numValues === 0) {
        console.warn(`Variable ${variable.name} has no values`);
        return;
    }
    
    // Map MIDI value to a discrete index
    const normalizedValue = midiValue / 127.0;
    const valueIndex = Math.round(normalizedValue * (numValues - 1));
    const clampedIndex = Math.max(0, Math.min(numValues - 1, valueIndex));
    const discreteValue = variable.value.values[clampedIndex];
    
    console.log(`MIDI direct: ${variable.feature_name}[${clampedIndex}] = "${discreteValue}"`);
    
    // Update the valueInput dataset and displayed value
    if (mappedKnob) {
        const valueInput = mappedKnob.nextElementSibling;
        if (valueInput) {
            valueInput.dataset.variableValueA = discreteValue;
            valueInput.value = discreteValue; // Also update visible value
            
            // Update the knob visual indicator
            updateKnobVisualDiscrete(mappedKnob, clampedIndex, numValues);
        }
    }
    
    // Update the MIDI status panel
    updateMidiStatusPanel();
    highlightMidiMapping(controlNumber);
    
    // Directly notify listeners
    notifyVariableChanged(variable.feature_name, discreteValue);
}// --- Variable Change Notification System ---
function notifyVariableChanged(featureName, value) {
    // Only log in debug mode or first few notifications
    const shouldLog = midiNotificationCount < 10;
    midiNotificationCount++;
    
    if (shouldLog) {
        console.log(`[MIDI_EVENT] ${featureName} = ${value}`);
    }
    
    // Minimize DOM operations during MIDI updates
    const isRunningSketch = p5Instance && mode === 'D';
    
    // Only add to console occasionally to reduce DOM operations
    if (isRunningSketch && midiNotificationCount % 5 === 0) {
        // Batch console updates to improve performance
        if (!pendingConsoleUpdate) {
            pendingConsoleUpdate = true;
            setTimeout(() => {
                addToP5Console(`MIDI update: ${featureName} = ${value}`, 'info');
                pendingConsoleUpdate = false;
            }, 50);
        }
    }
    
    // Fast path: no listeners
    if (variableChangeListeners.length === 0) {
        if (shouldLog) console.warn('No variable change listeners registered');
        return;
    }
    
    if (shouldLog) {
        console.log(`Notifying ${variableChangeListeners.length} listeners`);
    }
    
    // Optimized listener notification - avoid excessive array copying
    // and only log errors, not regular notifications
    for (let i = 0; i < variableChangeListeners.length; i++) {
        try {
            variableChangeListeners[i](featureName, value);
        } catch (error) {
            console.error(`Error in listener for ${featureName}:`, error);
            // Throttle error message updates to console
            setTimeout(() => addToP5Console(`Error in MIDI handler: ${error.message}`, 'error'), 100);
        }
    }
}

// Add a function to register a listener
function addVariableChangeListener(listener) {
    if (typeof listener === 'function') {
        // Check if listener is already registered to avoid duplicates
        if (variableChangeListeners.indexOf(listener) === -1) {
            variableChangeListeners.push(listener);
            console.log(`Added variable change listener. Now have ${variableChangeListeners.length} listeners`);
            return true;
        } else {
            console.warn("Listener already registered. Skipping duplicate registration.");
            return false;
        }
    }
    console.warn("Invalid listener provided - must be a function.");
    return false;
}

// Remove a listener
function removeVariableChangeListener(listener) {
    const index = variableChangeListeners.indexOf(listener);
    if (index !== -1) {
        variableChangeListeners.splice(index, 1);
        console.log(`Removed variable change listener. Now have ${variableChangeListeners.length} listeners`);
        return true;
    }
    return false;
}

// Clear all listeners
function clearVariableChangeListeners() {
    const count = variableChangeListeners.length;
    variableChangeListeners = [];
    console.log(`Cleared all ${count} variable change listeners`);
}

// Call this when stopping a p5 sketch to ensure we don't notify old sketches
function cleanupP5ListenersOnStop() {
    // Count listeners before clearing for logging
    const listenerCount = variableChangeListeners.length;
    
    // Clear the listeners array
    clearVariableChangeListeners();
    
    // Log the cleanup
    console.log(`Cleaned up ${listenerCount} variable change listeners during sketch stop.`);
    addToP5Console(`Removed ${listenerCount} MIDI/variable listeners.`, 'info');
}
// --- State Variables ---
let mode = 'A'; // Current operating mode: 'A', 'B', 'C', 'D'
// --- Global Declarations for Robustness ---
let knobMidiMappings = new Map();
let midiInputs = [];

// MIDI optimization flags
let pendingOutputUpdate = false;
let pendingMidiPanelUpdate = false;
let pendingConsoleUpdate = false;
let midiNotificationCount = 0;
let variableChangeListeners = [];
let tooltipTimer = null;
let activeTooltipElement = null;
let autoSaveTimer = null; // Deprecated, but stubbed for error-free code
let p5Instance = null; // Global p5.js instance for Mode D and sketch management
// --- End Global Declarations ---
let variables = []; // Array to hold variable definitions: [{ name, feature_name, value: { values: [], weights: [] } }, ...]
let isSettingsExpanded = false; // Track if the settings area is open
let midiAccess = null; // MIDI access object

// --- Pastel Color Palette ---
const VARIABLE_COLORS = [
  '#3A86FF', // vibrant blue
  '#FFBE0B', // vibrant yellow
  '#FB5607', // vibrant orange
  '#FF006E', // vibrant magenta
  '#8338EC', // vibrant purple
  '#43AA8B', // vibrant teal
  '#FF4D6D', // vibrant pink-red
  '#5FAD56'  // vibrant green
];

function getVariableColor(index) {
  return VARIABLE_COLORS[index % VARIABLE_COLORS.length];
}

// --- Constants ---
const MAX_VARIABLES = 16;

// --- Default State Injection ---
const DEFAULT_SYNTHOGRASIZER_STATE = {
  promptTemplate: "The {{adjective1}} {{color1}} {{animal1}} {{verbphrase}} the {{adjective2}} {{color2}} {{animal2}} {{adverb}}",
  variables: [
    { name: "adjective1", values: ["quick", "silly", "brave", "lazy", "clever", "happy", "sleepy", "wild"] },
    { name: "color1", values: ["brown", "purple", "yellow", "red", "blue", "green", "orange", "pink"] },
    { name: "animal1", values: ["fox", "penguin", "cat", "dog", "rabbit", "bear", "lion", "mouse"] },
    { name: "verbphrase", values: ["jumps over", "ate with", "danced beside", "chased", "hugged", "ran past", "sang to", "looked at"] },
    { name: "adjective2", values: ["lazy", "brave", "happy", "wild", "clever", "sleepy", "silly", "quick"] },
    { name: "color2", values: ["red", "yellow", "blue", "green", "orange", "brown", "purple", "pink"] },
    { name: "animal2", values: ["dog", "cat", "rabbit", "bear", "lion", "mouse", "fox", "penguin"] },
    { name: "adverb", values: ["quickly", "slowly", "gracefully", "awkwardly", "loudly", "quietly", "cheerfully", "angrily"] }
  ]
};

function initializeDefaultStateIfNeeded() {
  // Always set the default prompt and variables on load (no localStorage check)
  const inputTextEl = document.getElementById('inputText');
  if (inputTextEl) inputTextEl.value = DEFAULT_SYNTHOGRASIZER_STATE.promptTemplate;

  // Set variables array
  variables = DEFAULT_SYNTHOGRASIZER_STATE.variables.map(v => ({
    name: v.name,
    feature_name: v.name,
    value: { values: v.values.slice(), weights: v.values.map(() => 1) }
  }));

  // Update UI with variables
  if (typeof updateKnobRowsAndUI === 'function') updateKnobRowsAndUI();
  if (typeof updateOutputText === 'function') updateOutputText();
}
// (Declare vars, assign in DOMContentLoaded)
let importJsonButton, exportJsonButton, syncMidiButton, modeToggleButton, modeDescription,
    randomizeButton, inputText, outputText, settingsToggle, settingsArea,
    negativePromptContainer, negativeInputText, negativeOutputText,
    dimensionPair, heightInput, widthInput, additionalSettings, cfgScaleContainer,
    cfgScaleInput, samplingStepsContainer, samplingStepsInput,
    denoisingStrengthContainer, denoisingStrengthInput, img2imgSourceContainer,
    img2imgSourceInput, dynamicContent, knobRowsContainer, addVariableButton,
    variableListContainer, variableListContent, variableListHeader, // Added header ref
    p5Editor, p5Code, runP5Button, stopP5Button, // Added stop button ref
    p5Output, p5ExamplesSelect, createRequiredVarsButton,
    p5ConsoleContainer, p5Console, clearConsoleButton,
    midiStatusPanel, midiMappingsContainer, refreshMidiButton,
    templateDropdown; // Added templateDropdown ref

// ... (rest of the code remains the same)

document.addEventListener('DOMContentLoaded', function() {
  // --- Project Template Dropdown Logic ---
  // --- Project Template Dropdown Button Logic ---
  const templateDropdownButton = document.getElementById('templateDropdownButton');
  const templateDropdownMenu = document.getElementById('templateDropdownMenu');
  let templateList = [];
  if (templateDropdownButton && templateDropdownMenu) {
    fetch('synthograsizer/project-templates/templates.json')
      .then(resp => resp.json())
      .then(templates => {
        templateList = templates;
        templateDropdownMenu.innerHTML = '';
        templateDropdownMenu.style.display = 'none'; // Ensure hidden on load
        templates.forEach((tpl, idx) => {
          const btn = document.createElement('button');
          btn.className = 'template-option';
          btn.textContent = tpl.name;
          btn.tabIndex = 0;
          btn.addEventListener('click', () => {
            fetch('synthograsizer/project-templates/' + tpl.file)
              .then(resp => {
                if (!resp.ok) throw new Error('Failed to fetch template: ' + tpl.file);
                return resp.json();
              })
              .then(json => {
                window.__suppressImportFeedback = true;
                handleLoadState(json, true);
                setTimeout(() => { window.__suppressImportFeedback = false; }, 100);
                templateDropdownMenu.style.display = 'none';
              })
              .catch(err => {
                alert('Error loading template: ' + err.message);
              });
          });
          templateDropdownMenu.appendChild(btn);
        });
      }).catch(err => {
        templateDropdownMenu.innerHTML = '<div style="padding:10px 20px;color:#c00;">No templates found</div>';
      });

    // Toggle menu visibility
    templateDropdownButton.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = templateDropdownMenu.style.display === 'block';
      templateDropdownMenu.style.display = isOpen ? 'none' : 'block';
    });
    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!templateDropdownMenu.contains(e.target) && e.target !== templateDropdownButton) {
        templateDropdownMenu.style.display = 'none';
      }
    });
    // Keyboard accessibility
    templateDropdownButton.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        const first = templateDropdownMenu.querySelector('.template-option');
        if (first) first.focus();
        templateDropdownMenu.style.display = 'block';
        e.preventDefault();
      }
    });
    templateDropdownMenu.addEventListener('keydown', (e) => {
      const options = Array.from(templateDropdownMenu.querySelectorAll('.template-option'));
      const idx = options.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        if (idx >= 0 && idx < options.length - 1) options[idx + 1].focus();
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        if (idx > 0) options[idx - 1].focus();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        templateDropdownMenu.style.display = 'none';
        templateDropdownButton.focus();
      }
    });
  }


  console.log("DOM Loaded. Initializing Synthograsizer v2.2.0 (UI + p5)...");
  assignElementReferences();
  // Add event listener for Copy Output button
  const copyOutputButton = document.getElementById('copyOutputButton');
  if (copyOutputButton) {
    copyOutputButton.addEventListener('click', function() {
      const outputDiv = document.getElementById('outputText');
      if (outputDiv) {
        const text = outputDiv.textContent || '';
        if (text.length > 0) {
          navigator.clipboard.writeText(text).then(() => {
            const oldText = copyOutputButton.textContent;
            copyOutputButton.textContent = 'Copied!';
            setTimeout(() => { copyOutputButton.textContent = oldText; }, 1000);
          });
        }
      }
    });
  }
  initializeDefaultStateIfNeeded(); // Ensure prompt and variables are set before UI/event listeners
  addEventListeners();
  addTooltips();
  initializeModeA(); // Start in Mode A
  updateKnobRowsAndUI(); // Initial draw
  collapseSettingsArea(); // Start with settings collapsed
  console.log("Ready. Use 'Import JSON', 'Export JSON', 'Sync MIDI', or 'Add Variable'.");
    initializeModeA(); // Start in Mode A
    updateKnobRowsAndUI(); // Initial draw
    collapseSettingsArea(); // Start with settings collapsed
    console.log("Ready. Use 'Import JSON', 'Export JSON', 'Sync MIDI', or 'Add Variable'.");
});

function assignElementReferences() {
    importJsonButton = document.getElementById('importJsonButton');
    exportJsonButton = document.getElementById('exportJsonButton');
    syncMidiButton = document.getElementById('syncMidiButton');
    modeToggleButton = document.getElementById('modeToggleButton');
    modeDescription = document.getElementById('modeDescription');
    randomizeButton = document.getElementById('randomizeButton');
    inputText = document.getElementById('inputText');
    outputText = document.getElementById('outputText');
    // ... (rest of the code remains the same)
    settingsToggle = document.getElementById('settingsToggle');
    settingsArea = document.getElementById('settingsArea');
    negativePromptContainer = document.getElementById('negative-prompt-container');
    negativeInputText = document.getElementById('negativeInputText');
    negativeOutputText = document.getElementById('negativeOutputText');
    dimensionPair = document.getElementById('dimension-pair');
    heightInput = document.getElementById('heightInput');
    widthInput = document.getElementById('widthInput');
    additionalSettings = document.querySelector('.additional-settings');
    cfgScaleContainer = document.getElementById('cfgScaleContainer');
    cfgScaleInput = document.getElementById('cfgScaleInput');
    samplingStepsContainer = document.getElementById('samplingStepsContainer');
    samplingStepsInput = document.getElementById('samplingStepsInput');
    denoisingStrengthContainer = document.getElementById('denoisingStrengthContainer');
    denoisingStrengthInput = document.getElementById('denoisingStrengthInput');
    img2imgSourceContainer = document.getElementById('img2imgSourceContainer');
    img2imgSourceInput = document.getElementById('img2imgSourceInput');
    dynamicContent = document.querySelector('.dynamic-content');
    knobRowsContainer = document.getElementById('knobRowsContainer');
    addVariableButton = document.getElementById('addVariableButton');
    variableListContainer = document.getElementById('variableListContainer');
    // Don't try to access these yet as they might not exist
    variableListHeader = null;
    variableListContent = null;
    p5Editor = document.getElementById('p5-editor');
    p5Code = document.getElementById('p5-code');
    runP5Button = document.getElementById('runP5Button');
    stopP5Button = document.getElementById('stopP5Button'); // Assign stop button
    p5Output = document.getElementById('p5-output');
    p5ExamplesSelect = document.getElementById('p5ExamplesSelect');
    createRequiredVarsButton = document.getElementById('createRequiredVarsButton');
    p5ConsoleContainer = document.getElementById('p5-console-container');
    p5Console = document.getElementById('p5-console');
    clearConsoleButton = document.getElementById('clearConsoleButton');
    midiStatusPanel = document.getElementById('midi-status-panel');
    midiMappingsContainer = document.getElementById('midi-mappings-container');
}

// --- Event Listeners ---
function addEventListeners() {
    // Only add listeners that are not already handled in DOMContentLoaded
    if (importJsonButton) importJsonButton.addEventListener('click', handleImportClick);
    if (exportJsonButton) exportJsonButton.addEventListener('click', () => {
        const state = {
            promptTemplate: inputText.value,
            variables: variables.map(v => ({
                name: v.name,
                feature_name: v.feature_name,
                values: v.value.values.slice()
            })),
            p5_input: {
                code: p5Code && p5Code.value ? p5Code.value : ''
            }
        };
        const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'synthograsizer_state.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
    if (syncMidiButton) syncMidiButton.addEventListener('click', () => initMIDI());
    if (modeToggleButton) modeToggleButton.addEventListener('click', handleModeToggle);
    if (randomizeButton) randomizeButton.addEventListener('click', handleRandomize);
    if (addVariableButton) addVariableButton.addEventListener('click', handleAddVariable);
    if (runP5Button) runP5Button.addEventListener('click', runP5Code);
    if (stopP5Button) stopP5Button.addEventListener('click', stopP5Sketch);
    if (settingsToggle) settingsToggle.addEventListener('click', toggleSettingsArea);
    if (p5ExamplesSelect) p5ExamplesSelect.addEventListener('change', loadP5Example);
    if (createRequiredVarsButton) createRequiredVarsButton.addEventListener('click', createRequiredVariables);
    if (clearConsoleButton) clearConsoleButton.addEventListener('click', clearP5Console);
    if (refreshMidiButton) refreshMidiButton.addEventListener('click', refreshMidiConnection);
    if (inputText) inputText.addEventListener('input', updateAllOutputs);
    if (negativeInputText) negativeInputText.addEventListener('input', updateAllOutputs);
}

// --- Tooltips ---
function addTooltip(element, tooltipText) {
    if (!element) return;
    element.setAttribute('data-tooltip', tooltipText);
    element.removeEventListener('mouseenter', startTooltipTimer);
    element.removeEventListener('mouseleave', clearTooltipTimer);
    element.removeEventListener('mousemove', resetTooltipTimer);
    element.addEventListener('mouseenter', startTooltipTimer);
    element.addEventListener('mouseleave', clearTooltipTimer);
    element.addEventListener('mousemove', resetTooltipTimer);
}

function startTooltipTimer(event) {
    clearTooltipTimer();
    activeTooltipElement = event.target;
    const tooltipText = activeTooltipElement.getAttribute('data-tooltip');
    if (tooltipText) {
        // Short delay for buttons, longer for complex elements like knobs
        const delay = activeTooltipElement.tagName === 'BUTTON' ? 500 : 800;
        tooltipTimer = setTimeout(() => showTooltip(activeTooltipElement, tooltipText), delay);
    }
}

function clearTooltipTimer() {
    if (tooltipTimer) {
        clearTimeout(tooltipTimer);
        tooltipTimer = null;
    }
    // Hide tooltip only if the timer is fully cleared (not just reset)
    hideTooltip(); // Call hide immediately on mouseleave/clear
    activeTooltipElement = null;
}

function resetTooltipTimer(event) {
    // If moving over the same element, clear and restart the timer
    if (activeTooltipElement === event.target && tooltipTimer) {
        clearTimeout(tooltipTimer);
        tooltipTimer = null; // Prevent showing if cleared quickly
        startTooltipTimer(event); // Restart timer immediately
    } else if (activeTooltipElement !== event.target) {
        // If moved to a different element, clear the old timer
        clearTooltipTimer();
    }
}

function showTooltip(element, tooltipText) {
    if (!element || !tooltipText || !activeTooltipElement || activeTooltipElement !== element) return; // Ensure we are still over the target
    hideTooltip(); // Remove any existing tooltip first

    const tooltip = document.createElement('div');
    tooltip.className = 'subtle-tooltip';
    tooltip.textContent = tooltipText;
    document.body.appendChild(tooltip);

    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect(); // Get tooltip size *after* adding content

    // Default position below element, centered
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX + (rect.width / 2) - (tooltipRect.width / 2);

    // Adjust vertical position if off-screen below
    if (top + tooltipRect.height > window.innerHeight + window.scrollY - 5) {
         top = rect.top + window.scrollY - tooltipRect.height - 8; // Position above
    }

    // Adjust horizontal position if off-screen left/right
    const screenPadding = 5;
    if (left < screenPadding) {
        left = screenPadding;
    } else if (left + tooltipRect.width > window.innerWidth - screenPadding) {
        left = window.innerWidth - tooltipRect.width - screenPadding;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    // Force reflow before adding class for transition
    tooltip.offsetHeight;
    tooltip.classList.add('visible');
}


function hideTooltip() {
    const tooltip = document.querySelector('.subtle-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// --- Auto-Save Functionality ---
function setupAutoSave() {
    // Clear any existing timer
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
    }
    
    // Set up new timer
    autoSaveTimer = setInterval(autoSaveState, AUTO_SAVE_INTERVAL);
    console.log(`Auto-save initialized (every ${AUTO_SAVE_INTERVAL/1000} seconds).`);
}

function autoSaveState() {
    // Create the same state object as in handleSaveState
    const state = {
        variables: variables,
        stable_diffusion_input: {
            prompt: inputText.value, negative_prompt: negativeInputText.value,
            height: heightInput.value, width: widthInput.value,
            cfg_scale: cfgScaleInput.value, steps: samplingStepsInput.value,
            denoising_strength: denoisingStrengthInput.value,
            img2img_source: img2imgSourceInput.value,
        },
        p5_input: { code: p5Code.value },
        synth_state: {
            mode: mode,
            isSettingsExpanded: isSettingsExpanded,
            knobs: Array.from(document.querySelectorAll('.knob-container')).map(container => {
                 const knob = container.querySelector('.knob');
                 if (!knob || knob.dataset.index === undefined) return null;
                 const index = parseInt(knob.dataset.index);
                 if (index >= variables.length) return null;
                 const input = container.querySelector('.knob-value');
                 return {
                    index: index,
                    value: input.value,
                    locked: knob.dataset.locked === "true",
                    variableValueA: input.dataset.variableValueA,
                    variableValueB: input.dataset.variableValueB
                };
            }).filter(k => k !== null && k.index < variables.length),
        }
    };
    
    try {
        localStorage.setItem('synthograsizerAutoSave', JSON.stringify(state));
        console.log("State auto-saved to localStorage.");
    } catch (error) {
        console.warn("Auto-save failed:", error);
    }
}

// Auto-save restore check removed for simplicity. Always start with default state unless user manually loads/imports.
function checkForAutoSave() {
    // No-op: intentionally left blank
}

function addTooltips() {
    addTooltip(importJsonButton, "Import variables and settings from a JSON file.");
    addTooltip(randomizeButton, "Randomize knob values (Mode A: discrete index, Mode B: continuous value).");
    addTooltip(modeToggleButton, `Current: Mode ${mode} (${modeDescription.textContent})\nClick to cycle modes.`);
    addTooltip(settingsToggle, "Show/Hide additional settings like Negative Prompt, Dimensions, CFG Scale, etc.");
    addTooltip(addVariableButton, "Add a new variable knob.");
    addTooltip(runP5Button, "Execute the p5.js code in the editor below."); // Added
    addTooltip(stopP5Button, "Stop the currently running p5.js sketch."); // Added
    addTooltip(p5ExamplesSelect, "Load a pre-made p5.js example.");
    addTooltip(createRequiredVarsButton, "Creates the variables needed for the currently selected example.\n\nbasic_shapes: shape, size, color, rotation\nparticle_system: count, speed, size, color\naudio_visualizer: bass, mid, treble, tempo, style\nfractal_tree: branches, angle, length_reduction, min_size, color_mode\ngame_of_life: cell_size, birth_rule, survive_lower, survive_upper, color_scheme");
    // Knobs tooltips are added dynamically in createKnobContainer and toggleLock
}


// --- UI Toggling & Mode Indicator ---
function toggleSettingsArea() {
    isSettingsExpanded = !isSettingsExpanded;
    if (isSettingsExpanded) {
        expandSettingsArea();
    } else {
        collapseSettingsArea();
    }
}

function expandSettingsArea() {
    isSettingsExpanded = true;
    settingsArea.classList.remove('collapsed');
    settingsArea.classList.add('expanded');
    settingsToggle.textContent = "Hide Settings ▲";
    settingsToggle.setAttribute('aria-expanded', 'true');
    addTooltip(settingsToggle, "Hide additional settings");
}

function collapseSettingsArea() {
    isSettingsExpanded = false;
    settingsArea.classList.add('collapsed');
    settingsArea.classList.remove('expanded');
    settingsToggle.textContent = "Show Settings ▼";
    settingsToggle.setAttribute('aria-expanded', 'false');
    addTooltip(settingsToggle, "Show additional settings");
}

function updateModeIndicator(currentMode) {
    modeToggleButton.textContent = `Mode ${currentMode}`;
    let description = '';
    switch (currentMode) {
        case 'A': description = 'Discrete Selection'; break;
        case 'B': description = 'Continuous Adjust'; break;
        case 'C': description = 'Edit Variables'; break;
        case 'D': description = 'P5.js Mode'; break;
        default: description = '';
    }
    modeDescription.textContent = description;
    addTooltip(modeToggleButton, `Current: Mode ${currentMode} (${description})\nClick to cycle modes.`);
}


// --- Add Variable ---
function handleAddVariable() {
    if (variables.length >= MAX_VARIABLES) {
        alert(`Maximum number of variables (${MAX_VARIABLES}) reached.`);
        console.warn('Maximum number of variables reached');
        return;
    }

    const nextVarNum = variables.length + 1;
    const newVariable = {
        name: `Variable ${nextVarNum}`, // User-friendly name
        feature_name: `var${nextVarNum}`, // Name used in template {{...}}
        value: {
            values: ['Option 1', 'Option 2'], // Default values
            weights: [] // Optional weights (not heavily used yet)
        }
    };

    variables.push(newVariable);
    console.log('Added new variable:', newVariable);

    updateKnobRowsAndUI(); // Re-render knobs (which includes applying mode styling)

    // Switch to Mode C and show details for the new variable
    initializeModeC(); // Switch to Mode C (will handle showing details)
    showVariableDetails(variables.length - 1); // Explicitly show editor for the newly added var

    updateAllOutputs(); // Refresh output text
}


// --- JSON Import / State Loading ---
function handleImportClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (event) => {
        const file = event.target.files[0];
        if (file) {
            const text = await file.text();
            try {
                const json = JSON.parse(text);
                handleLoadState(json, true); // Pass flag indicating it's an import
            } catch (error) {
                console.error('Error parsing JSON:', error);
                alert('Error parsing JSON file. See console for details.');
            }
        }
    };
    input.click();
}

function handleLoadClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (event) => {
        const file = event.target.files[0];
        if (file) {
            const text = await file.text();
            try {
                const state = JSON.parse(text);
                handleLoadState(state, false); // Not an import, a full state load
            } catch (error) {
                console.error('Error parsing JSON:', error);
                alert('Error loading state file. See console for details.');
            }
        }
    };
    input.click();
}

// --- State Saving & Loading ---
// Save/Load State functions removed as per new requirements.
// ---

function handleLoadState(state, isImport = false) {
    let importFeedback = [];
    console.log("Loading state:", state);
     if (!state || !state.variables || !Array.isArray(state.variables)) {
         console.error('Invalid state/import file: Missing or invalid `variables` array.');
         alert('Invalid state/import file: Missing or invalid `variables` array.');
         return;
     }

     // Stop any running p5 sketch before loading
     stopP5Sketch();

    // Restore Core Data
    // Normalize variables to internal format if needed
    variables = state.variables.map((v, idx) => {
        if (v.value && v.value.values) {
            // Already in internal format
            // Check for missing fields
            if (!v.name) importFeedback.push(`Variable #${idx+1} missing 'name', auto-filled as 'Var${idx+1}'.`);
            if (!v.feature_name) importFeedback.push(`Variable '${v.name || 'Var'+(idx+1)}' missing 'feature_name', auto-filled.`);
            if (!Array.isArray(v.value.values)) importFeedback.push(`Variable '${v.name || 'Var'+(idx+1)}' has invalid 'values', auto-filled as empty array.`);
            return {
                ...v,
                name: v.name || `Var${idx+1}`,
                feature_name: v.feature_name || (v.name || `Var${idx+1}`),
                value: {
                    values: Array.isArray(v.value.values) ? v.value.values : [],
                    weights: Array.isArray(v.value.weights) ? v.value.weights : (Array.isArray(v.value.values) ? v.value.values.map(() => 1) : [])
                }
            };
        } else {
            // Legacy/simple format: wrap values and add default weights
            if (!v.name) importFeedback.push(`Variable #${idx+1} missing 'name', auto-filled as 'Var${idx+1}'.`);
            if (!Array.isArray(v.values)) importFeedback.push(`Variable '${v.name || 'Var'+(idx+1)}' has invalid 'values', auto-filled as empty array.`);
            return {
                name: v.name || `Var${idx+1}`,
                feature_name: v.feature_name || v.name || `Var${idx+1}`,
                value: {
                    values: Array.isArray(v.values) ? v.values.slice() : [],
                    weights: Array.isArray(v.values) ? v.values.map(() => 1) : []
                }
            };
        }
    });
    if (variables.length > MAX_VARIABLES) {
       console.warn(`Loaded state exceeds MAX_VARIABLES (${MAX_VARIABLES}). Truncating.`);
       variables = variables.slice(0, MAX_VARIABLES);
    }

    // Only show import feedback if this is a true file import (not template dropdown)
    if (!window.__suppressImportFeedback && isImport === true) {
        if (importFeedback.length > 0) {
            alert('Import completed with the following notes:\n\n' + importFeedback.join('\n'));
        } else {
            alert('JSON imported successfully.');
        }
    }
    // If suppression is active, clear feedback so no alert is shown
    if (window.__suppressImportFeedback) importFeedback = [];
    // Always reset the flag after use
    if (window.__suppressImportFeedback) window.__suppressImportFeedback = false;


    // Restore Settings Inputs
    // Support both new and legacy prompt template fields
    if (typeof state.promptTemplate === 'string' && state.promptTemplate.length > 0) {
        inputText.value = state.promptTemplate;
    } else {
        const sdInput = state.stable_diffusion_input || {};
        if (!sdInput.prompt) importFeedback.push("Prompt template missing, set to blank.");
        inputText.value = sdInput.prompt || '';
    }
    // Other settings (legacy only)
    negativeInputText.value = (state.stable_diffusion_input && state.stable_diffusion_input.negative_prompt) || '';
    heightInput.value = (state.stable_diffusion_input && state.stable_diffusion_input.height) || '';
    widthInput.value = (state.stable_diffusion_input && state.stable_diffusion_input.width) || '';
    cfgScaleInput.value = (state.stable_diffusion_input && state.stable_diffusion_input.cfg_scale) || '';
    samplingStepsInput.value = (state.stable_diffusion_input && state.stable_diffusion_input.steps) || '';
    denoisingStrengthInput.value = (state.stable_diffusion_input && state.stable_diffusion_input.denoising_strength) || '';
    img2imgSourceInput.value = (state.stable_diffusion_input && state.stable_diffusion_input.img2img_source) || '';
    const p5Input = state.p5_input || {};
    if (p5Code) {
        if (!p5Input.code) importFeedback.push("p5.js code missing, left blank.");
        p5Code.value = p5Input.code || '';
    }

    // Restore Synth UI State
    let synthState = state.synth_state;
     if (isImport && !synthState) {
        console.log("Importing simple format, using default UI state.");
        synthState = { mode: 'A', isSettingsExpanded: false, knobs: [] };
     } else if (!synthState) {
        console.error('Invalid state file: Missing `synth_state` section.');
        alert('Invalid state file: Missing `synth_state` section.');
        return;
    }

    const loadedMode = synthState.mode || 'A';
    isSettingsExpanded = synthState.isSettingsExpanded || false;

    // Rebuild Knobs Based on Loaded Variables FIRST
    updateKnobRowsAndUI(); // Rebuilds DOM structure

    // --- Restore Knob UI State AFTER Rebuilding ---
    const loadedKnobStates = new Map();
    if (synthState.knobs) {
        synthState.knobs.forEach(kState => {
            if (kState.index !== undefined && kState.index < variables.length) { // Only map valid indices
                 loadedKnobStates.set(kState.index, kState);
             }
         });
    }

    document.querySelectorAll('.knob').forEach(knob => {
         const index = parseInt(knob.dataset.index);
         // Ensure this index corresponds to a loaded variable
         if (index >= variables.length) return;

         const container = knob.closest('.knob-container');
         const valueInput = container.querySelector('.knob-value');
         const variable = variables[index]; // Should always exist here
         const knobState = loadedKnobStates.get(index);

         if (knobState) {
             // Restore data attributes first
             valueInput.dataset.variableValueA = knobState.variableValueA || (variable?.value?.values?.[0] || '');
             valueInput.dataset.variableValueB = knobState.variableValueB || '0';
             knob.dataset.locked = knobState.locked ? "true" : "false";

             // Set visual state based on *loaded* mode, not necessarily the mode we are switching to yet
             if (loadedMode === 'A') {
                 const numValues = variable?.value?.values?.length || 0;
                 let valueIndex = variable.value.values.findIndex(v => v === valueInput.dataset.variableValueA);
                 // Fallback to saved numeric index if text doesn't match
                 if (valueIndex === -1) valueIndex = parseInt(knobState.value) || 0;
                 valueIndex = Math.max(0, Math.min(numValues - 1, valueIndex)); // Clamp index
                 valueInput.value = variable.value.values[valueIndex] || ''; // Display the actual value, not the index
                 // Visual update will happen during initializeModeX
             } else if (loadedMode === 'B') {
                 const continuousValue = parseFloat(valueInput.dataset.variableValueB);
                 valueInput.value = continuousValue.toFixed(2);
                 // Visual update will happen during initializeModeX
             } else { // Mode C or D - just store the raw value? Or default? Let's default A's index.
                 valueInput.value = '0'; // Default visual value if loaded in C/D
                 // Visual update will happen during initializeModeX
             }
         } else { // Initialize defaults if no state for this knob index
            valueInput.dataset.variableValueA = variable?.value?.values?.[0] || '';
            valueInput.dataset.variableValueB = '0';
            knob.dataset.locked = "false";
            valueInput.value = '0'; // Default display value
            // Visual update will happen during initializeModeX
         }

         // Update lock visuals immediately
         knob.style.opacity = knob.dataset.locked === "true" ? '0.6' : '1';
         knob.style.cursor = knob.dataset.locked === "true" ? 'not-allowed' : 'pointer';
         addTooltip(knob, `Control: ${variable?.name || 'N/A'} ${knob.dataset.locked === "true" ? '(Locked)' : ''}\nMode A: Click/Drag Index\nMode B: Drag Value\nDouble-Click: Lock/Unlock`);
    });

    // Set Correct Mode and Settings Visibility AFTER restoring knob data
    switch (loadedMode) {
        case 'A': initializeModeA(); break;
        case 'B': initializeModeB(); break;
        case 'C': initializeModeC(); break;
        case 'D': initializeModeD(); break;
        default:
            console.warn(`Loaded unknown mode "${loadedMode}", defaulting to A.`);
            initializeModeA();
    }
    if (isSettingsExpanded) expandSettingsArea(); else collapseSettingsArea();

    updateAllOutputs(); // Update text outputs based on restored state
    console.log("State loaded successfully.");
    if (importFeedback.length > 0) {
        alert((isImport ? "Imported with warnings:\n" : "Loaded with warnings:\n") + importFeedback.join("\n"));
    } else {
        if (!(window.__suppressImportFeedback)) {
            alert(isImport ? "JSON imported successfully." : "State loaded successfully.");
        }
        window.__suppressImportFeedback = false;
    }
}


// --- Knob Management ---
function updateKnobRowsAndUI() {
    knobRowsContainer.innerHTML = ''; // Clear existing knobs

    variables.forEach((variable, index) => {
        const knobContainer = createKnobContainer(index);
        knobRowsContainer.appendChild(knobContainer); // Append directly
    });

    addEventListenersToKnobs();
    applyCurrentModeStyling(); // Apply styling for the *current* mode
    refreshAllKnobVisuals(); // Update visuals for the *current* mode
}

function createKnobContainer(index) {
    const variableColor = getVariableColor(index);
    const variable = variables[index];
    const container = document.createElement('div');
    container.className = 'knob-container';
    container.id = `knob-container-${index}`;

    const knob = document.createElement('div');
    knob.className = 'knob';
    knob.style.backgroundColor = variableColor + '22'; // Add transparency for pastel hue
    knob.style.borderColor = variableColor;
    knob.style.boxShadow = `0 2px 8px 1px ${variableColor}33`;
    knob.dataset.locked = "false";
    knob.dataset.index = index;

    const knobDot = document.createElement('div');
    knobDot.className = 'knob-dot';
    knob.appendChild(knobDot);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'knob-value';
    valueInput.value = '0'; // Default display value
    valueInput.readOnly = true;
    // Initialize data attributes based on the variable definition
    const initialDiscreteValue = variable?.value?.values?.[0] || '';
    valueInput.dataset.variableValueA = initialDiscreteValue;
    valueInput.dataset.variableValueB = '0'; // Default continuous value
    valueInput.dataset.variableFeatureName = variable?.feature_name || ''; // Store feature name for lookup

    const groupName = document.createElement('div');
    groupName.className = 'variable-group-name';
    groupName.id = `group-name-${index}`;
    groupName.innerText = variable?.name || `Var ${index + 1}`;
    groupName.title = `{{${variable?.feature_name || 'unknown'}}}`; // Use title for feature name hint
    groupName.style.color = variableColor;

    container.appendChild(knob);
    container.appendChild(valueInput);
    container.appendChild(groupName);

    // Add initial tooltip
    addTooltip(knob, `Control: ${variable?.name || 'N/A'}\nMode A: Click/Drag (mouse) or finger-drag (touch) to change value\nMode B: Drag (mouse) or finger-drag (touch) for continuous\nDouble-click (mouse) or double-tap (touch): Lock/Unlock\n\nTip: On mobile, use your finger to drag the knob. On desktop, use mouse drag or double-click.`);

    return container;
}

function getKnobColor(index) {
    // Simple color cycling
    const colors = ['#ffabab', '#ffd3a1', '#fff7a1', '#a1ffa1', '#a1ffff', '#a1a1ff', '#d3a1ff', '#ffa1f8'];
    return colors[index % colors.length];
 }

function addEventListenersToKnobs() {
    document.querySelectorAll('.knob').forEach(knob => {
        // Detach and reattach listeners to prevent duplicates if called multiple times
        const newKnob = knob.cloneNode(true); // Clone keeps data attributes
        knob.parentNode.replaceChild(newKnob, knob);

        let isDragging = false;
        let dragStartY, dragStartValueA, dragStartValueB;
        let clickTimeout = null;
        let lastClickTime = 0;
        const DOUBLE_CLICK_THRESHOLD = 300; // ms

        const index = parseInt(newKnob.dataset.index);

        // --- MOUSE DOWN ---
        newKnob.addEventListener('mousedown', (e) => {
            if (newKnob.dataset.locked === "true" || mode === 'C') return; // No interaction in C
            // Allow interaction in Mode D just like Mode A
            e.preventDefault(); // Prevent text selection

            // Double click detection
            const now = Date.now();
            if (now - lastClickTime < DOUBLE_CLICK_THRESHOLD) {
                 clearTimeout(clickTimeout); // Prevent single click fire
                 clickTimeout = null;
                 toggleLock(newKnob);
                 lastClickTime = 0; // Reset timer
                 return; // Don't start drag on double click
             }
             lastClickTime = now;

            isDragging = true;
            dragStartY = e.clientY;
            dragStartX = e.clientX; // Store X position too for horizontal dragging
            const valueInput = newKnob.nextElementSibling;
            if ((mode === 'A' || mode === 'D') && index < variables.length) {
                // FIXED: Find the actual index of the current value instead of parsing it
                const currentValue = valueInput.value;
                const variable = variables[index];
                dragStartValueA = variable.value.values.findIndex(v => v === currentValue);
                if (dragStartValueA === -1) dragStartValueA = 0; // Fallback to first item if not found
             } else if (mode === 'B' && index < variables.length) {
                 dragStartValueB = parseFloat(valueInput.dataset.variableValueB) || 0;
             }

            newKnob.style.cursor = 'grabbing';
            newKnob.classList.add('active'); // Optional styling for active drag
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('touchmove', onTouchMove);
            document.addEventListener('touchend', onTouchEnd);
        });

        // --- TOUCH START ---
        newKnob.addEventListener('touchstart', (e) => {
            if (newKnob.dataset.locked === "true" || mode === 'C') return; // No interaction in C
            // Allow interaction in Mode D just like Mode A
            e.preventDefault(); // Prevent text selection

            // Double click detection
            const now = Date.now();
            if (now - lastClickTime < DOUBLE_CLICK_THRESHOLD) {
                 clearTimeout(clickTimeout); // Prevent single click fire
                 clickTimeout = null;
                 toggleLock(newKnob);
                 lastClickTime = 0; // Reset timer
                 return; // Don't start drag on double click
             }
             lastClickTime = now;

            isDragging = true;
            dragStartY = e.touches[0].clientY;
            dragStartX = e.touches[0].clientX; // Store X position too for horizontal dragging
            const valueInput = newKnob.nextElementSibling;
            if ((mode === 'A' || mode === 'D') && index < variables.length) {
                // FIXED: Find the actual index of the current value instead of parsing it
                const currentValue = valueInput.value;
                const variable = variables[index];
                dragStartValueA = variable.value.values.findIndex(v => v === currentValue);
                if (dragStartValueA === -1) dragStartValueA = 0; // Fallback to first item if not found
             } else if (mode === 'B' && index < variables.length) {
                 dragStartValueB = parseFloat(valueInput.dataset.variableValueB) || 0;
             }

            newKnob.style.cursor = 'grabbing';
            newKnob.classList.add('active'); // Optional styling for active drag
            document.addEventListener('touchmove', onTouchMove);
            document.addEventListener('touchend', onTouchEnd);
        });

        // --- MOUSE MOVE ---
        const onMouseMove = (e) => {
            if (!isDragging) return; // Exit if mouseup happened between events
            if (newKnob.dataset.locked === "true" || mode === 'C') {
                // Should not happen if started correctly, but safety check
                 isDragging = false; // Stop drag if mode changed or locked during drag
                 document.removeEventListener('mousemove', onMouseMove);
                 document.removeEventListener('mouseup', onMouseUp);
                 return;
            }

            // Calculate change based on both vertical and horizontal movement
            const deltaY = dragStartY - e.clientY; // Positive delta = mouse moved up
            const deltaX = e.clientX - dragStartX; // Positive delta = mouse moved right
            
            // Use the larger of the two deltas to determine direction
            // This gives the user the ability to use whichever direction feels more natural
            const netDelta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
            
            const sensitivity = (mode === 'A') ? 0.04 : 0.015; // Adjust sensitivity per mode
            const change = netDelta * sensitivity;

            if ((mode === 'A' || mode === 'D') && index < variables.length) {
                const variable = variables[index];
                const numValues = variable?.value?.values?.length || 0;
                if (numValues <= 1) return; // No change if 0 or 1 value

                 let newValueIndex = Math.round(dragStartValueA + change);
                 newValueIndex = Math.max(0, Math.min(numValues - 1, newValueIndex)); // Clamp index
                 updateKnobValue(newKnob, newValueIndex, 'A');

            } else if (mode === 'B' && index < variables.length) {
                 let newValue = dragStartValueB + change;
                 newValue = Math.max(-1, Math.min(2, newValue)); // Clamp value between -1 and 2
                 updateKnobValue(newKnob, newValue, 'B');
            }
        };

        // --- TOUCH MOVE ---
        const onTouchMove = (e) => {
            if (!isDragging) return; // Exit if touchend happened between events
            if (newKnob.dataset.locked === "true" || mode === 'C') {
                // Should not happen if started correctly, but safety check
                 isDragging = false; // Stop drag if mode changed or locked during drag
                 document.removeEventListener('touchmove', onTouchMove);
                 document.removeEventListener('touchend', onTouchEnd);
                 return;
            }

            // Calculate change based on both vertical and horizontal movement
            const deltaY = dragStartY - e.touches[0].clientY; // Positive delta = touch moved up
            const deltaX = e.touches[0].clientX - dragStartX; // Positive delta = touch moved right
            
            // Use the larger of the two deltas to determine direction
            // This gives the user the ability to use whichever direction feels more natural
            const netDelta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
            
            const sensitivity = (mode === 'A') ? 0.04 : 0.015; // Adjust sensitivity per mode
            const change = netDelta * sensitivity;

            if ((mode === 'A' || mode === 'D') && index < variables.length) {
                const variable = variables[index];
                const numValues = variable?.value?.values?.length || 0;
                if (numValues <= 1) return; // No change if 0 or 1 value

                 let newValueIndex = Math.round(dragStartValueA + change);
                 newValueIndex = Math.max(0, Math.min(numValues - 1, newValueIndex)); // Clamp index
                 updateKnobValue(newKnob, newValueIndex, 'A');

            } else if (mode === 'B' && index < variables.length) {
                 let newValue = dragStartValueB + change;
                 newValue = Math.max(-1, Math.min(2, newValue)); // Clamp value between -1 and 2
                 updateKnobValue(newKnob, newValue, 'B');
            }
        };

        // --- MOUSE UP ---
        const onMouseUp = () => {
             if (!isDragging) return; // Prevent multiple triggers if logic flow is odd
             isDragging = false;

             // Single click action timeout handling
             if ((mode === 'A' || mode === 'D') && !newKnob.classList.contains('active')) { // Check if it was just a click, not a drag end
                 // Use timeout to handle single click vs double click
                 if (clickTimeout === null) { // Only set timeout if one isn't already running
                    clickTimeout = setTimeout(() => {
                        if (!isDragging && newKnob.dataset.locked !== "true" && (mode === 'A' || mode === 'D')) {
                            const variable = variables[index];
                            if (variable && variable.value.values.length > 0) {
                                const numValues = variable.value.values.length;
                                                                // FIXED: Find the actual index of the current value instead of parsing it
                                 const currentValue = newKnob.nextElementSibling.dataset.variableValueA;
                                 let currentValueIndex = variable.value.values.findIndex(v => v === currentValue);
                                 if (currentValueIndex === -1) currentValueIndex = 0; // Fallback to first item if not found
                                
                                currentValueIndex = (currentValueIndex + 1) % numValues; // Increment and wrap
                                updateKnobValue(newKnob, currentValueIndex, 'A');
                            }
                        }
                        clickTimeout = null;
                    }, DOUBLE_CLICK_THRESHOLD - 50);
                 }
             }

             newKnob.style.cursor = newKnob.dataset.locked === "true" ? 'not-allowed' : 'pointer';
             newKnob.classList.remove('active'); // Remove active drag style

             document.removeEventListener('mousemove', onMouseMove);
             document.removeEventListener('mouseup', onMouseUp);
         };
    });
}


function toggleLock(knob) {
    const isLocked = knob.dataset.locked === "true";
    knob.dataset.locked = !isLocked;
    knob.style.opacity = !isLocked ? '0.6' : '1';
    knob.style.cursor = !isLocked ? 'not-allowed' : 'pointer';
    const index = parseInt(knob.dataset.index);
    console.log(`Knob ${index} ${!isLocked ? 'locked' : 'unlocked'}`);

    // Update tooltip to reflect lock state
    const variable = variables[index];
    addTooltip(knob, `Control: ${variable?.name || 'N/A'} ${!isLocked ? '(Locked)' : ''}\nMode A: Click/Drag (mouse) or finger-drag (touch) to change value\nMode B: Drag (mouse) or finger-drag (touch) for continuous\nDouble-click (mouse) or double-tap (touch): Lock/Unlock\n\nTip: On mobile, use your finger to drag the knob. On desktop, use mouse drag or double-click.`);

    // Potentially remap MIDI if a knob becomes unlocked
    if (isLocked) { // If it just became locked, remove any mapping TO it
        for (let [cc, mappedKnob] of knobMidiMappings.entries()) {
             if (mappedKnob === knob) {
                 knobMidiMappings.delete(cc);
                 console.log(`Unmapped MIDI CC ${cc} from locked Knob ${index}`);
                 // Remove MIDI indicator
                 const knobContainer = knob.closest('.knob-container');
                 if (knobContainer) {
                     knobContainer.querySelectorAll('.midi-indicator').forEach(el => el.remove());
                 }
                 break;
             }
         }
    } else {
        // If unlocked, it *could* be mapped, but we wait for a CC message
        // to trigger the auto-mapping logic in handleControlChange.
    }
}


// --- Knob Value & Visual Updates ---
function updateKnobValue(knob, value, targetMode) {
    // ...existing logic...
    updateOutputText(); // Ensure output updates live

    const index = parseInt(knob.dataset.index);
    if (index >= variables.length) return; // Safety check

    const variable = variables[index];
    const valueInput = knob.nextElementSibling; // The <input type="text"> element

    if (!variable || !valueInput) return; // More safety checks
    
    // Add visual feedback for knob activity
    knob.classList.add('knob-active');
    setTimeout(() => knob.classList.remove('knob-active'), 300);

    if (targetMode === 'A') {
        const numValues = variable.value?.values?.length || 0;
        if (numValues === 0) return; // Cannot set index if no values

        const valueIndex = Math.max(0, Math.min(numValues - 1, Math.round(value))); // Clamp index
        const discreteValueText = variable.value.values[valueIndex] || '';

        // Update the displayed value (showing the actual text value instead of index)
        valueInput.value = discreteValueText;
        // Update the underlying discrete text value
        valueInput.dataset.variableValueA = discreteValueText;

        // Update visual indicator (dot position)
        updateKnobVisualDiscrete(knob, valueIndex, numValues);
        
        // If in Mode D, also notify listeners for real-time p5 updates
        if (mode === 'D') {
            notifyVariableChanged(variable.feature_name, discreteValueText);
            updateMidiStatusPanel(); // Update the MIDI status panel to match the new value
        }

    } else if (targetMode === 'B') {
         const continuousValue = Math.max(-1, Math.min(2, value)); // Clamp value

         // Update the displayed value (the float, formatted)
         valueInput.value = continuousValue.toFixed(2);
         // Update the underlying continuous value
         valueInput.dataset.variableValueB = continuousValue.toFixed(2);

         // Also update the associated discrete value (for prompt generation)
         const numValues = variable.value?.values?.length || 0;
         if (numValues > 0) {
             // Map the -1 to 2 range to an approximate index
             const normalized = (continuousValue + 1) / 3; // Map to 0..1 range
             const approxIndex = Math.max(0, Math.min(numValues - 1, Math.round(normalized * (numValues - 1))));
             valueInput.dataset.variableValueA = variable.value.values[approxIndex] || '';
         } else {
             valueInput.dataset.variableValueA = ''; // No discrete value if none exist
         }

         // Update visual indicator (dot position)
         updateKnobVisualContinuous(knob, continuousValue);
         
         // If in Mode D, also notify listeners for real-time p5 updates
         if (mode === 'D') {
             notifyVariableChanged(variable.feature_name, valueInput.dataset.variableValueA);
             updateMidiStatusPanel(); // Update the MIDI status panel to match the new value
         }
    }

    // Update the main output text whenever a knob changes
    updateAllOutputs();
}

function updateKnobVisualDiscrete(knob, valueIndex, numValues) {
    const dot = knob.querySelector('.knob-dot');
    if (!dot) return;
    let angle = -120; // Start position (approx 7 o'clock)
    if (numValues > 1) {
        // Spread 240 degrees across the number of steps
        angle = -120 + (240 * valueIndex) / (numValues - 1);
    } else if (numValues === 1) {
        angle = 0; // Center position (12 o'clock) if only one value
    } // If numValues is 0, angle remains -120

    dot.style.transform = `rotate(${angle}deg)`;
}

function updateKnobVisualContinuous(knob, value) {
    const dot = knob.querySelector('.knob-dot');
    if (!dot) return;
    // Map the -1 to 2 range to a 0 to 1 range
    const normalizedValue = (value + 1) / 3.0;
    // Map the 0 to 1 range to an angle from -120 to +120 degrees (240 degree sweep)
    const angle = -120 + (normalizedValue * 240);
    dot.style.transform = `rotate(${angle}deg)`;
}

function refreshAllKnobVisuals() {
    // Updates knob visuals and displayed text based on current mode and stored data attributes
    document.querySelectorAll('.knob').forEach(knob => {
        const index = parseInt(knob.dataset.index);
        if (index >= variables.length) return; // Skip if variable doesn't exist

        const valueInput = knob.nextElementSibling;
        const variable = variables[index];

        if (!variable || !valueInput) return;

        if (mode === 'A' || mode === 'D') { // Show text values in both Mode A and Mode D
             const numValues = variable.value?.values?.length || 0;
             let valueIndex = 0;
             if (numValues > 0) {
                 // Find index matching stored text value, default to 0 if not found
                 const currentTextValue = valueInput.dataset.variableValueA;
                 const foundIndex = variable.value.values.findIndex(v => v === currentTextValue);
                 valueIndex = (foundIndex !== -1) ? foundIndex : 0;
                 // Ensure index is within bounds (e.g., if values were deleted)
                 valueIndex = Math.max(0, Math.min(numValues - 1, valueIndex));
                 // Update the stored text value in case it was invalid before
                 valueInput.dataset.variableValueA = variable.value.values[valueIndex] || '';
             } else {
                valueInput.dataset.variableValueA = ''; // Clear if no values
             }
             valueInput.value = valueInput.dataset.variableValueA; // Display the text value instead of index
             updateKnobVisualDiscrete(knob, valueIndex, numValues);

         } else if (mode === 'B') {
             const continuousValue = parseFloat(valueInput.dataset.variableValueB) || 0;
             valueInput.value = continuousValue.toFixed(2); // Display the float
             updateKnobVisualContinuous(knob, continuousValue);
             // Ensure discrete value is also updated (in case it wasn't before)
             const numValues = variable.value?.values?.length || 0;
             if (numValues > 0) {
                const normalized = (continuousValue + 1) / 3;
                const approxIndex = Math.max(0, Math.min(numValues - 1, Math.round(normalized * (numValues - 1))));
                valueInput.dataset.variableValueA = variable.value.values[approxIndex] || '';
             } else {
                 valueInput.dataset.variableValueA = '';
             }

         } else {
             // Mode C - Knobs are hidden, but reset display value just in case
             valueInput.value = 'N/A';
         }
    });
}


// --- Output Text Generation ---
function generateProcessedText(template) {
    let output = template;
    variables.forEach((variable, index) => {
        const featureName = variable.feature_name;
        // Find the corresponding knob container using the index
        const container = document.getElementById(`knob-container-${index}`);

        if (!container || !featureName) return; // Skip if no container or feature name

        const valueInput = container.querySelector('.knob-value');
        if (!valueInput) return; // Skip if no value input found

        // Prepare regex for replacement (escape special characters in feature name)
        const placeholder = `{{${featureName}}}`;
        const escapedFeatureName = featureName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`{{${escapedFeatureName}}}`, 'g');

        // Get values from the data attributes
        const discreteValue = valueInput.dataset.variableValueA || '';
        const continuousValue = parseFloat(valueInput.dataset.variableValueB || '0');

        let replacement = discreteValue; // Default replacement is the discrete text

        // In Mode B, apply weighting syntax if continuous value is not close to 0
        if (mode === 'B') {
            // Calculate weight: range -1 to 0 maps to 0.1 to 1.0, range 0 to 2 maps to 1.0 to ~1.6
            let weight = 1.0;
            if (continuousValue > 0) {
                // Example mapping: 0->1, 1->1.3, 2->1.6
                weight = 1.0 + (continuousValue / 2.0) * 0.6;
            } else if (continuousValue < 0) {
                // Example mapping: 0->1, -0.5->0.5, -1->0.1 (approx)
                weight = Math.max(0.1, 1.0 + continuousValue); // Ensure weight doesn't go below 0.1
            }

            // Only add weight syntax if significantly different from 1.0
            if (Math.abs(weight - 1.0) > 0.05) {
                replacement = `(${discreteValue}:${weight.toFixed(2)})`;
            }
        }

        // Perform the replacement in the output string
        output = output.replace(regex, replacement);
    });
    return output;
}

function updateOutputText() {
    outputText.innerHTML = generateProcessedTextColored(inputText.value);
}

// New: Generate processed text with colored spans for variables and their values
function generateProcessedTextColored(template) {
    // Replace each variable token with its colored, parsed value span in a single pass
    return template.replace(/\{\{(.*?)\}\}/g, (match, varName) => {
        // Find the variable by feature_name
        const varIndex = variables.findIndex(v => v.feature_name === varName);
        if (varIndex === -1) return match; // Not found, leave as-is
        const variable = variables[varIndex];
        const container = document.getElementById(`knob-container-${varIndex}`);
        if (!container) return match;
        const valueInput = container.querySelector('.knob-value');
        if (!valueInput) return match;
        const discreteValue = valueInput.dataset.variableValueA || '';
        const continuousValue = parseFloat(valueInput.dataset.variableValueB || '0');
        let replacement = discreteValue;
        if (mode === 'B') {
            let weight = 1.0;
            if (continuousValue > 0) {
                weight = 1.0 + (continuousValue / 2.0) * 0.6;
            } else if (continuousValue < 0) {
                weight = Math.max(0.1, 1.0 + continuousValue);
            }
            if (Math.abs(weight - 1.0) > 0.05) {
                replacement = `(${discreteValue}:${weight.toFixed(2)})`;
            }
        }
        const color = getVariableColor(varIndex);
        return `<span class="variable-value" style="color: ${color}; font-weight: 700; background: #fff; border-radius: 4px; padding: 0 2px; text-shadow: 0 1px 2px #fff, 0 0 2px #fff;">${replacement}</span>`;
    });
}

function updateNegativeOutputText() {
    negativeOutputText.innerText = generateProcessedText(negativeInputText.value);
}

function updateAllOutputs() {
    updateOutputText();
    updateNegativeOutputText();
    // Update the MIDI status panel if in Mode D
    if (mode === 'D') {
        updateMidiStatusPanel();
    }
    // If p5 sketch is running, it will pull updates via getSynthVar on its own draw loop
    
    // Reset auto-save timer on significant state changes
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = setInterval(autoSaveState, AUTO_SAVE_INTERVAL);
    }
}

// --- MIDI Status Panel Functions ---
function showMidiStatusPanel() {
    if (midiStatusPanel) {
        midiStatusPanel.style.display = 'block';
    }
}

function hideMidiStatusPanel() {
    if (midiStatusPanel) {
        midiStatusPanel.style.display = 'none';
    }
}

function updateMidiStatusPanel() {
    if (!midiStatusPanel || !midiMappingsContainer) return;
    
    // Clear existing entries
    const noMappingsMessage = midiMappingsContainer.querySelector('.no-mappings-message');
    if (noMappingsMessage) {
        noMappingsMessage.style.display = knobMidiMappings.size === 0 ? 'block' : 'none';
    }
    
    // Remove old entries except no-mappings-message
    Array.from(midiMappingsContainer.children).forEach(child => {
        if (!child.classList.contains('no-mappings-message')) {
            child.remove();
        }
    });
    
    // Create entries for each mapping
    for (let [cc, knob] of knobMidiMappings.entries()) {
        const index = parseInt(knob.dataset.index);
        if (index >= variables.length) continue; // Skip if variable doesn't exist
        
        const variable = variables[index];
        const valueInput = knob.nextElementSibling;
        
        // Always fetch the current value directly, not from a cached property
        const currentValue = valueInput.dataset.variableValueA || 'N/A';
        
        // Create mapping entry
        const entry = document.createElement('div');
        entry.className = 'midi-mapping-entry';
        entry.id = `midi-mapping-${cc}`;
        
        // CC number
        const ccNumber = document.createElement('div');
        ccNumber.className = 'midi-cc-number';
        ccNumber.textContent = cc;
        
        // Variable name
        const varName = document.createElement('div');
        varName.className = 'midi-variable-name';
        varName.textContent = variable.name;
        
        // Current value
        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'midi-current-value';
        valueDisplay.textContent = currentValue;
        console.log(`Updating MIDI panel for CC ${cc} (${variable.name}) to ${currentValue}`);
        
        // Assemble
        entry.appendChild(ccNumber);
        entry.appendChild(varName);
        entry.appendChild(valueDisplay);
        
        // Add to container (before the no-mappings message)
        if (noMappingsMessage) {
            midiMappingsContainer.insertBefore(entry, noMappingsMessage);
        } else {
            midiMappingsContainer.appendChild(entry);
        }
    }
}

function highlightMidiMapping(controlNumber) {
    if (!midiMappingsContainer) return;
    
    // Reset any active highlights
    midiMappingsContainer.querySelectorAll('.midi-mapping-entry.active').forEach(el => {
        el.classList.remove('active');
    });
    
    // Add highlight to the active mapping
    const entry = document.getElementById(`midi-mapping-${controlNumber}`);
    if (entry) {
        entry.classList.add('active');
        
        // Update the value display with the MOST current value from the dataset
        const knob = knobMidiMappings.get(controlNumber);
        if (knob) {
            const valueInput = knob.nextElementSibling;
            const valueDisplay = entry.querySelector('.midi-current-value');
            if (valueDisplay && valueInput) {
                // Always get current value from the dataset
                const currentValue = valueInput.dataset.variableValueA || 'N/A';
                valueDisplay.textContent = currentValue;
                console.log(`Highlighting MIDI entry for CC ${controlNumber}: ${currentValue}`);
            }
        }
        
        // Ensure the entry is visible by scrolling if needed
        entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// --- Mode Switching ---
function handleModeToggle() {
    const previousMode = mode;
    let nextMode;

    if (mode === 'A') nextMode = 'B';
    else if (mode === 'B') nextMode = 'C';
    else if (mode === 'C') nextMode = 'D';
    else if (mode === 'D') nextMode = 'A'; // Explicitly handle D -> A
    else nextMode = 'A'; // Fallback

    // Stop p5 sketch if switching *away* from Mode D
    if (previousMode === 'D' && nextMode !== 'D') {
        stopP5Sketch();
    }

    // Initialize the new mode
    switch (nextMode) {
        case 'A': initializeModeA(); break;
        case 'B': initializeModeB(); break;
        case 'C': initializeModeC(); break;
        case 'D': initializeModeD(); break;
    }
    updateAllOutputs(); // Update text outputs after mode switch (relevant for Mode B weighting)
}

function applyCurrentModeStyling() {
    const isModeC = (mode === 'C');
    const isModeD = (mode === 'D');
    const showKnobs = !isModeC; // Now show knobs in all modes except Mode C

    // Show/Hide major dynamic content sections
    knobRowsContainer.style.display = showKnobs ? 'flex' : 'none';
    
    // Add mode-specific class to dynamic content for CSS targeting
    dynamicContent.classList.remove('mode-a', 'mode-b', 'mode-c', 'mode-d');
    dynamicContent.classList.add(`mode-${mode.toLowerCase()}`);
    
    // For Mode C, explicitly make sure the variable list container is shown
    if (isModeC) {
        if (variableListContainer) {
            variableListContainer.style.display = 'block';
        }
    } else {
        if (variableListContainer) {
            variableListContainer.style.display = 'none';
        }
    }
    
    // For Mode D, show the p5 editor
    p5Editor.style.display = isModeD ? 'flex' : 'none';

    // Show/Hide elements *within* knob containers based on mode
    document.querySelectorAll('.knob-container').forEach((container, index) => {
        if (index >= variables.length) {
            container.style.display = 'none'; // Hide containers for non-existent variables
            return;
        }

        // Ensure container itself is visible unless it's for a non-existent variable
        container.style.display = 'flex';

        const knob = container.querySelector('.knob');
        const valueInput = container.querySelector('.knob-value');
        const groupName = container.querySelector('.variable-group-name');
        let showButton = container.querySelector('.show-variable-button'); // Check if button exists

        if (isModeC) { // Mode C: Hide knob/value, show 'Details' button
            if (knob) knob.style.display = 'none';
            if (valueInput) valueInput.style.display = 'none';
            if (groupName) groupName.style.marginTop = '10px'; // Adjust spacing

            if (!showButton) { // If button doesn't exist, create and add it
                showButton = document.createElement('button');
                showButton.innerText = 'Details';
                showButton.className = 'show-variable-button'; // Add class for styling/selection
                // Use closure to capture correct index for the event listener
                showButton.addEventListener('click', ((idx) => () => showVariableDetails(idx))(index));
                container.appendChild(showButton);
            } else {
                showButton.style.display = 'block'; // Ensure existing button is visible
            }
        } else { // Modes A, B, D: Show knob/value (if showKnobs), hide 'Details' button
             if (knob) knob.style.display = showKnobs ? 'flex' : 'none';
             if (valueInput) valueInput.style.display = showKnobs ? 'block' : 'none';
             if (groupName) groupName.style.marginTop = '4px'; // Reset spacing

             if (showButton) { // If 'Details' button exists, remove it
                 showButton.remove();
             }
        }
    });
}

function initializeModeA() {
    mode = 'A';
    updateModeIndicator('A');
    console.log("Switched to Mode A");
    applyCurrentModeStyling();
    collapseSettingsArea(); // Collapse settings when switching modes
    hideVariableList();
    hideMidiStatusPanel();
    refreshAllKnobVisuals(); // Update visuals based on Mode A logic
    // Don't clear MIDI mappings on mode change to preserve them
    // Clear MIDI indicators - they'll get recreated when needed
    document.querySelectorAll('.midi-indicator').forEach(el => el.remove());
}

function initializeModeB() {
    mode = 'B';
    updateModeIndicator('B');
    console.log("Switched to Mode B");
    applyCurrentModeStyling();
    collapseSettingsArea();
    hideVariableList();
    hideMidiStatusPanel();
    refreshAllKnobVisuals(); // Update visuals based on Mode B logic
    // Don't clear MIDI mappings on mode change
    // Clear MIDI indicators - they'll get recreated when needed
    document.querySelectorAll('.midi-indicator').forEach(el => el.remove());
}

function initializeModeC() {
    mode = 'C';
    updateModeIndicator('C');
    console.log("Switched to Mode C");
    applyCurrentModeStyling();
    collapseSettingsArea();
    hideMidiStatusPanel();
    
    // Create the header if it doesn't exist
    if (!variableListContainer.querySelector('.variable-list-header')) {
        const header = document.createElement('div');
        header.className = 'variable-list-header';
        header.innerHTML = `
            <div class="variable-column variable-name-header">Variable Info</div>
            <div class="value-column variable-values-header">Values</div>
        `;
        variableListContainer.appendChild(header);
    }
    
    // Create the content container if it doesn't exist
    if (!variableListContainer.querySelector('.variable-list-content')) {
        const content = document.createElement('div');
        content.className = 'variable-list-content';
        variableListContainer.appendChild(content);
    }
    
    // Store references to header and content
    variableListHeader = variableListContainer.querySelector('.variable-list-header');
    variableListContent = variableListContainer.querySelector('.variable-list-content');
    
    // Rebuild the editor list
    buildVariableListEditor();
    showVariableList(); // Ensure container is visible
    
    // In Mode C we do clear MIDI mappings as structure is changing
    knobMidiMappings.clear();
    // Clear MIDI indicators
    document.querySelectorAll('.midi-indicator').forEach(el => el.remove());
}

function initializeModeD() {
    console.log("Initializing Mode D...");
    mode = 'D';
    updateModeIndicator('D');
    console.log("Switched to Mode D");
    applyCurrentModeStyling();
    collapseSettingsArea();
    hideVariableList();
    
    // Debug MIDI status
    console.log(`MIDI status for Mode D: ${midiInitialized ? 'Initialized' : 'Not initialized'}, ${midiInputs.length} device(s)`);
    console.log(`Active MIDI mappings: ${knobMidiMappings.size}`);
    if (knobMidiMappings.size > 0) {
        console.log("MIDI Mappings:");
        for (let [cc, knob] of knobMidiMappings.entries()) {
            const index = parseInt(knob.dataset.index);
            if (index < variables.length) {
                console.log(`  CC ${cc} -> Knob ${index} (${variables[index].name})`);
            }
        }
    }
    
    // Ensure p5 output area is ready, but don't clear it automatically
    // unless stopping a sketch. runP5Code will clear it.
    if(p5Output) {
        p5Output.style.display = 'block'; // Make sure the container is visible
        // If no sketch is running, maybe show a placeholder message?
        if (!p5Instance && p5Output.innerHTML.trim() === '') {
             p5Output.innerText = 'Enter p5.js code above and click "Run Code".';
             p5Output.style.color = '#666'; // Style placeholder text
        } else if (!p5Instance && p5Output.querySelector('canvas')) {
            // If there's a canvas but no instance (e.g., after error), clear it
            p5Output.innerHTML = 'Previous sketch stopped or encountered an error.';
            p5Output.style.color = '#e53e3e';
        }
    }
    
    // Show the console container
    if(p5ConsoleContainer) {
        p5ConsoleContainer.style.display = 'flex'; // Use flex to enable the column layout
    }
    
    // Refresh knob visual states for proper display in Mode D
    refreshAllKnobVisuals();
    
    // Show and update MIDI status panel
    console.log("Showing MIDI status panel in Mode D");
    showMidiStatusPanel();
    updateMidiStatusPanel();
    
    // Preserve MIDI mappings when entering Mode D, rather than clearing them
    // This allows knob controls mapped in Modes A/B to continue working in Mode D
    console.log(`Preserving ${knobMidiMappings.size} MIDI mappings in Mode D`);
    
    // Clear MIDI indicators since the knobs are hidden
    document.querySelectorAll('.midi-indicator').forEach(el => el.remove());
    
    // Make sure we have at least one listener registered
    if (variableChangeListeners.length === 0) {
        console.log("Registering default MIDI listener for Mode D");
        const defaultHandler = (name, value) => {
            console.log(`[DEFAULT_HANDLER] Variable ${name} changed to ${value}`);
            // Just a basic handler to ensure the notification system is working
        };
        addVariableChangeListener(defaultHandler);
    }
    
    console.log(`Mode D initialized with ${variableChangeListeners.length} variable listeners`);
}

// --- Mode C: Variable Editing ---

// New function to build the entire list editor structure
function buildVariableListEditor() {
    // Ensure header and content containers exist
    if (!variableListHeader) {
        variableListHeader = variableListContainer.querySelector('.variable-list-header');
        if (!variableListHeader) {
            variableListHeader = document.createElement('div');
            variableListHeader.className = 'variable-list-header';
            variableListHeader.innerHTML = `
                <div class="variable-column variable-name-header">Variable Info</div>
                <div class="value-column variable-values-header">Values</div>
            `;
            variableListContainer.appendChild(variableListHeader);
        }
    }
    
    if (!variableListContent) {
        variableListContent = variableListContainer.querySelector('.variable-list-content');
        if (!variableListContent) {
            variableListContent = document.createElement('div');
            variableListContent.className = 'variable-list-content';
            variableListContainer.appendChild(variableListContent);
        }
    }
    
    // Clear previous content
    variableListContent.innerHTML = '';

    if (variables.length === 0) {
        variableListContent.innerHTML = '<div class="variable-row" style="text-align:center; color:#888; padding:20px;">No variables defined. Use the + button to add one.</div>';
    } else {
        variables.forEach((variable, index) => {
            variableListContent.appendChild(createVariableEditorRow(variable, index));
        });
    }
}

// Creates a single row in the variable editor list
function createVariableEditorRow(variable, index) {
    const detailRow = document.createElement('div');
    detailRow.className = 'variable-row';
    detailRow.id = `variable-row-${index}`;

    // --- Info Column ---
    const infoCol = document.createElement('div');
    infoCol.className = 'variable-info-column';

    // Feature Name Input
    infoCol.innerHTML += `
        <div>
            <label for="featureNameInput-${index}">Template Name <span style="font-weight:normal; font-style:italic;">(used in {{...}})</span></label>
            <input type="text" id="featureNameInput-${index}" value="${variable.feature_name || ''}"
                   placeholder="e.g., style, color" data-varindex="${index}" data-field="feature_name">
        </div>`;

    // Display Name Input
    infoCol.innerHTML += `
        <div>
            <label for="displayNameInput-${index}">Display Name <span style="font-weight:normal; font-style:italic;">(UI Knob Label)</span></label>
            <input type="text" id="displayNameInput-${index}" value="${variable.name || ''}"
                   placeholder="e.g., Art Style" data-varindex="${index}" data-field="name">
        </div>`;
    detailRow.appendChild(infoCol);

    // --- Values Column ---
    const valuesCol = document.createElement('div');
    valuesCol.className = 'variable-values-column';

    // Add existing value entries
    if (Array.isArray(variable.value?.values)) {
        variable.value.values.forEach((value, i) => {
            valuesCol.appendChild(createValueEntryElement(value, index, i));
        });
    }

    // Add "New Value" input
    const newValueInput = document.createElement('input');
    newValueInput.type = 'text';
    newValueInput.className = 'new-value-input';
    newValueInput.placeholder = 'Type new value and press Enter...';
    newValueInput.dataset.varindex = index;
    newValueInput.addEventListener('keydown', handleAddNewValue);
    valuesCol.appendChild(newValueInput);

    detailRow.appendChild(valuesCol);

    // Add event listeners to the info inputs
    detailRow.querySelectorAll('.variable-info-column input').forEach(input => {
        input.addEventListener('change', updateVariableData); // Update on change (blur/enter)
        input.addEventListener('input', handleInfoInput);   // Update label live
    });

    return detailRow;
}

// Creates a single value entry (input + delete button)
function createValueEntryElement(value, varIndex, valueIndex) {
    const valueEntry = document.createElement('div');
    valueEntry.className = 'value-entry';
    valueEntry.innerHTML = `
        <input type="text" value="${value}" data-varindex="${varIndex}" data-valueindex="${valueIndex}" placeholder="Value text">
        <button class="delete-value-button" data-varindex="${varIndex}" data-valueindex="${valueIndex}" title="Delete Value">X</button>`;

    // Add listeners for this specific entry
    valueEntry.querySelector('input').addEventListener('change', updateVariableData);
    valueEntry.querySelector('.delete-value-button').addEventListener('click', handleDeleteVariableValue);

    return valueEntry;
}

// Live update for UI elements based on input
function handleInfoInput(event) {
    const input = event.target;
    const varIndex = parseInt(input.dataset.varindex);
    const field = input.dataset.field;

    if (varIndex >= variables.length) return; // Safety

    const knobLabel = document.getElementById(`group-name-${varIndex}`);

    if (field === 'name' && knobLabel) {
        knobLabel.innerText = input.value || `Var ${varIndex + 1}`; // Update display name
    } else if (field === 'feature_name' && knobLabel) {
        knobLabel.title = `{{${input.value || 'unknown'}}}`; // Update tooltip (feature name)
    }
}

// Update the 'variables' array when data changes in Mode C editor
function updateVariableData(event) {
    const input = event.target;
    const varIndex = parseInt(input.dataset.varindex);
    const field = input.dataset.field; // 'name' or 'feature_name'
    const valueIndex = input.dataset.valueindex !== undefined ? parseInt(input.dataset.valueindex) : null; // Index for value edits
    const newValue = input.value.trim(); // Trim whitespace

    if (varIndex >= variables.length) return; // Safety check

    const variable = variables[varIndex];
    let needsOutputUpdate = false;
    let oldFeatureName = null;

    if (field === 'name') { // Updating Variable Display Name
        if (variable.name !== newValue) {
            console.log(`Updating var ${varIndex} name: "${variable.name}" -> "${newValue}"`);
            variable.name = newValue;
            // Live update already handled by handleInfoInput
        }
    } else if (field === 'feature_name') { // Updating Variable Feature Name (used in {{...}})
        const cleanNewValue = newValue.replace(/[^a-zA-Z0-9_]/g, '_'); // Basic sanitization
         if (input.value !== cleanNewValue) {
            input.value = cleanNewValue; // Update input if sanitized
             alert("Feature names should only contain letters, numbers, and underscores. Automatically sanitized.");
         }
        if (variable.feature_name !== cleanNewValue && cleanNewValue !== '') {
            console.log(`Updating var ${varIndex} feature_name: "${variable.feature_name}" -> "${cleanNewValue}"`);
            oldFeatureName = variable.feature_name;
            variable.feature_name = cleanNewValue;
            // Live update already handled by handleInfoInput
            if (oldFeatureName) {
                updateVariableReferences(oldFeatureName, cleanNewValue); // Update prompts
            }
            needsOutputUpdate = true; // Prompt template might change
        } else if (cleanNewValue === '') {
            input.value = variable.feature_name; // Revert if trying to make it empty
             alert("Feature name cannot be empty.");
        }
    } else if (valueIndex !== null && Array.isArray(variable.value?.values) && valueIndex < variable.value.values.length) { // Updating an existing value
        if (variable.value.values[valueIndex] !== newValue) {
            console.log(`Updating var ${varIndex}, value ${valueIndex}: "${variable.value.values[valueIndex]}" -> "${newValue}"`);
            const oldValue = variable.value.values[valueIndex];
            variable.value.values[valueIndex] = newValue;

            // Update knob data attribute if this value was selected
            const knobContainer = document.getElementById(`knob-container-${varIndex}`);
            if (knobContainer) {
                const knobValueInput = knobContainer.querySelector('.knob-value');
                if (knobValueInput.dataset.variableValueA === oldValue) {
                     knobValueInput.dataset.variableValueA = newValue;
                 }
            }
            needsOutputUpdate = true;
        }
    }

    if (needsOutputUpdate) {
        updateAllOutputs(); // Update main text output if feature name or active value changed
    }
}


// Update template references when a feature_name changes
function updateVariableReferences(oldName, newName) {
  if (!oldName || oldName === newName) return;
  const oldPlaceholder = `{{${oldName}}}`;
  const newPlaceholder = `{{${newName}}}`;
  // Escape old name for regex
  const escapedOldName = oldName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`{{${escapedOldName}}}`, 'g');

  // Update main prompt
  if (inputText.value.includes(oldPlaceholder)) {
      inputText.value = inputText.value.replace(regex, newPlaceholder);
      console.log(`Replaced "${oldPlaceholder}" with "${newPlaceholder}" in main prompt.`);
  }
  // Update negative prompt
  if (negativeInputText.value.includes(oldPlaceholder)) {
      negativeInputText.value = negativeInputText.value.replace(regex, newPlaceholder);
      console.log(`Replaced "${oldPlaceholder}" with "${newPlaceholder}" in negative prompt.`);
  }
  // Output fields will be updated automatically by updateAllOutputs() shortly after
}

// Handle Enter key in "New Value" input
function handleAddNewValue(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission/blur
        const input = event.target;
        const newValue = input.value.trim();
        const varIndex = parseInt(input.dataset.varindex);

        if (newValue && varIndex < variables.length && Array.isArray(variables[varIndex].value?.values)) {
            variables[varIndex].value.values.push(newValue);
            console.log(`Added value "${newValue}" to variable ${varIndex}`);

            // Add the new value element to the DOM
            const valuesCol = input.closest('.variable-values-column');
            if (valuesCol) {
                const newIndex = variables[varIndex].value.values.length - 1;
                const newEntry = createValueEntryElement(newValue, varIndex, newIndex);
                valuesCol.insertBefore(newEntry, input); // Insert before the "add new" input
            }

            input.value = ''; // Clear the input field
            updateAllOutputs(); // Refresh outputs as available values changed
            refreshAllKnobVisuals(); // Update knob visuals if in A/B
        } else if (!newValue) {
            input.blur(); // Just blur if Enter pressed on empty input
        }
    }
}

// Handle clicking the delete 'X' button for a value
function handleDeleteVariableValue(event) {
    const button = event.target;
    const varIndex = parseInt(button.dataset.varindex);
    const valueIndex = parseInt(button.dataset.valueindex);

    if (varIndex < variables.length && Array.isArray(variables[varIndex].value?.values) && valueIndex < variables[varIndex].value.values.length) {
        const valueToDelete = variables[varIndex].value.values[valueIndex];
        const confirmDelete = confirm(`Are you sure you want to delete the value "${valueToDelete}"?`);

        if (confirmDelete) {
            variables[varIndex].value.values.splice(valueIndex, 1);
            console.log(`Deleted value "${valueToDelete}" at index ${valueIndex} from variable ${varIndex}`);

            // Remove the corresponding DOM element
            const valueEntryElement = button.closest('.value-entry');
            if (valueEntryElement) {
                valueEntryElement.remove();
            }

            // Re-index subsequent value elements in the same column
            const valuesCol = document.querySelector(`#variable-row-${varIndex} .variable-values-column`);
             if (valuesCol) {
                 valuesCol.querySelectorAll('.value-entry').forEach((entry, newIndex) => {
                     entry.querySelector('input').dataset.valueindex = newIndex;
                     entry.querySelector('button').dataset.valueindex = newIndex;
                 });
             }

            updateAllOutputs(); // Refresh outputs
            refreshAllKnobVisuals(); // Update knobs as max index might change
        }
    }
}


// Wrapper functions for clarity
function hideVariableList() { 
    if(variableListContainer) {
        variableListContainer.style.display = 'none'; 
    }
}

function showVariableList() { 
    if(variableListContainer) {
        variableListContainer.style.display = 'block';
    }
}

// Function required by Mode C initialization, now just calls build
function showVariableDetails(index) {
    // This function is now less relevant as buildVariableListEditor handles the display.
    // We keep it for potential future use (e.g., highlighting a specific row).
    console.log("Showing details for variable index (via build):", index);
    // Could potentially add highlighting logic here later
}

// --- Randomization ---
function handleRandomize() {
    if (mode === 'A') { randomizeModeA(); }
    else if (mode === 'B') { randomizeModeB(); }
    else if (mode === 'D') { randomizeModeD(); }
    else { console.log("Randomize button inactive in current mode."); return; }
    updateAllOutputs(); // Update text outputs after randomization
}
function randomizeModeA() {
    console.log("Randomizing Mode A");
    document.querySelectorAll('.knob').forEach(knob => {
        if (knob.dataset.locked === "true") return; // Skip locked knobs
        const index = parseInt(knob.dataset.index);
        if (index < variables.length) {
            const variable = variables[index];
            const numValues = variable?.value?.values?.length || 0;
            if (numValues > 0) {
                const randomIndex = Math.floor(Math.random() * numValues);
                updateKnobValue(knob, randomIndex, 'A'); // Update using the standard function
            }
        }
    });
}
function randomizeModeB() {
    console.log("Randomizing Mode B");
    document.querySelectorAll('.knob').forEach(knob => {
        if (knob.dataset.locked === "true") return; // Skip locked knobs
        const index = parseInt(knob.dataset.index);
        if (index < variables.length) {
            // Generate random float between -1 and 2
            const randomValue = Math.random() * 3 - 1;
            updateKnobValue(knob, randomValue, 'B'); // Update using the standard function
        }
    });
}

function randomizeModeD() {
    console.log("Randomizing Mode D");
    // In Mode D, we'll use the same behavior as Mode A for randomization
    // but ensure the visual updates are properly handled for Mode D
    document.querySelectorAll('.knob').forEach(knob => {
        if (knob.dataset.locked === "true") return; // Skip locked knobs
        
        const index = parseInt(knob.dataset.index);
        if (index >= variables.length) return;
        
        const variable = variables[index];
        const numValues = variable?.value?.values?.length || 0;
        if (numValues === 0) return;
        
        // Get a random index
        const randomIndex = Math.floor(Math.random() * numValues);
        const valueText = variable.value.values[randomIndex];
        
        // Update the knob's visual state directly
        const valueInput = knob.nextElementSibling;
        if (valueInput) {
            valueInput.value = valueText;
            valueInput.dataset.variableValueA = valueText;
            
            // Update the knob's visual indicator
            updateKnobVisualDiscrete(knob, randomIndex, numValues);
            
            // Trigger any Mode D specific updates
            if (mode === 'D') {
                notifyVariableChanged(variable.feature_name, valueText);
                updateMidiStatusPanel();
            }
            
            // Add visual feedback
            knob.classList.add('knob-active');
            setTimeout(() => knob.classList.remove('knob-active'), 300);
        }
    });
    
    // Update all outputs to reflect the changes
    updateAllOutputs();
}

// --- MIDI Handling ---
// Keep track of whether we've already initialized MIDI to prevent repeated permission requests
let midiInitialized = false;

function initMIDI() {
    // Only initialize once to prevent repeated permission prompts
    if (midiInitialized) {
        console.log("MIDI already initialized, skipping repeated initialization");
        if (midiAccess) {
            // Log current MIDI status even if already initialized
            console.log(`MIDI status: Access available, ${Array.from(midiAccess.inputs.values()).length} input device(s) connected`);
            if (midiInputs.length > 0) {
                midiInputs.forEach((input, i) => {
                    console.log(`  Input ${i}: ${input.name} (${input.state})`);
                });
            }
        }
        return;
    }
    
    console.log("Initializing MIDI...");
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess({ sysex: false })
            .then(onMIDISuccess, onMIDIFailure)
            .finally(() => {
                midiInitialized = true;
                console.log("MIDI initialization complete");
            });
    } else {
        console.warn("WebMIDI is not supported in this browser.");
        midiInitialized = true; // Mark as initialized even if not supported
    }
}
function onMIDISuccess(access) {
    console.log("MIDI access granted successfully!");
    midiAccess = access;
    
    // Clear old inputs and get fresh list
    midiInputs = [];
    midiInputs = Array.from(midiAccess.inputs.values());
    
    // Clear old mappings when we get a fresh MIDI access
    // This should happen rarely, only at first initialization
    if (knobMidiMappings.size > 0) {
        console.log("Preserving existing MIDI mappings during initialization");
    }

    if (midiInputs.length === 0) {
        console.log("No MIDI input devices found. Connect a device and it will be detected automatically.");
        return;
    }

    console.log(`Found ${midiInputs.length} MIDI input(s):`);
    midiInputs.forEach((input, index) => {
        console.log(`  [${index}] ${input.name} (Manufacturer: ${input.manufacturer}, State: ${input.state})`);
        // Remove previous listener before adding a new one to avoid duplicates
        try {
            input.onmidimessage = null;
            input.addEventListener('midimessage', onMIDIMessage);
            console.log(`  → Added event listener to ${input.name}`);
        } catch (error) {
            console.error(`  → Error attaching event listener to ${input.name}:`, error);
        }
    });

    // Listen for device connection/disconnection changes
    try {
        midiAccess.onstatechange = onMIDIStateChange;
        console.log("MIDI state change handler installed successfully");
    } catch (error) {
        console.error("Error setting up MIDI state change handler:", error);
    }
}
function onMIDIFailure(error) {
    console.error("Failed to get MIDI access - " + error);
    midiAccess = null;
}
function onMIDIStateChange(event) {
    const port = event.port;
    console.log(`MIDI state change: ${port.name}, Type: ${port.type}, State: ${port.state}, Connection: ${port.connection}`);
    
    // This event fires when devices connect or disconnect
    if (midiAccess) {
        // Get a fresh list of inputs
        const oldInputCount = midiInputs.length;
        const oldInputNames = midiInputs.map(input => input.name).join(', ');
        
        // Update our input list
        midiInputs = Array.from(midiAccess.inputs.values());
        
        const newInputCount = midiInputs.length;
        const newInputNames = midiInputs.map(input => input.name).join(', ');
        
        console.log(`MIDI inputs changed: ${oldInputCount} -> ${newInputCount} devices`);
        console.log(`  Before: ${oldInputNames || 'none'}`);
        console.log(`  After: ${newInputNames || 'none'}`);
        
        // Re-attach listeners to all inputs, including the new ones
        midiInputs.forEach((input, index) => {
            // Remove any existing listener and add a fresh one
            try {
                input.onmidimessage = null; // Clear old style first
                input.removeEventListener('midimessage', onMIDIMessage); // Remove if exists
                input.addEventListener('midimessage', onMIDIMessage); // Add fresh
                console.log(`  → Attached listener to ${input.name} (${input.state})`);
            } catch (error) {
                console.error(`  → Error updating listener for ${input.name}:`, error);
            }
        });
        
        // Rebuild MIDI status panel if open
        if (mode === 'D' && midiStatusPanel && midiStatusPanel.style.display !== 'none') {
            console.log("Updating MIDI status panel after device change");
            updateMidiStatusPanel();
        }
    }
}
function onMIDIMessage(message) {
    try {
        const data = message.data;
        // Debug: dump all MIDI messages in hex format
        // console.log(`MIDI message: ${Array.from(data).map(byte => byte.toString(16).padStart(2, '0')).join(' ')}`);
        
        const command = message.data[0] & 0xF0; // Get command type (NoteOn, NoteOff, CC) - top 4 bits
        const channel = message.data[0] & 0x0F; // Get channel (0-15) - bottom 4 bits

        // We are primarily interested in Control Change (CC) messages (0xB0-0xBF)
        if (command === 0xB0) {
            const controlNumber = message.data[1]; // CC number (0-127)
            const value = (message.data.length > 2) ? message.data[2] : 0; // CC value (0-127)
            
            // Log CC message details
            console.log(`MIDI CC ch=${channel+1} cc=${controlNumber} val=${value}/127`);
            
            // Process the CC message
            handleControlChange(controlNumber, value);
        }
        // Optionally handle other MIDI message types
        // else if (command === 0x90) { // Note On (0x90-0x9F)
        //     const note = message.data[1];
        //     const velocity = message.data[2];
        //     if (velocity > 0) {
        //         // Note On with velocity > 0
        //         console.log(`Note On: ch=${channel+1} note=${note} vel=${velocity}`);
        //     } else {
        //         // Note On with velocity = 0 is a Note Off in some devices
        //         console.log(`Note Off: ch=${channel+1} note=${note} (velocity=0)`);
        //     }
        // }
        // else if (command === 0x80) { // Note Off (0x80-0x8F)
        //     const note = message.data[1];
        //     const velocity = message.data[2];
        //     console.log(`Note Off: ch=${channel+1} note=${note} vel=${velocity}`);
        // }
    } catch (error) {
        console.error("Error processing MIDI message:", error);
        console.error("Message data:", message.data);
    }
}
function handleControlChange(controlNumber, midiValue) {
    // Allow MIDI in Mode A, B, and D
    if (mode !== 'A' && mode !== 'B' && mode !== 'D') return;
    
    console.log(`MIDI CC ${controlNumber}: ${midiValue}/127 received in Mode ${mode}`);
    console.log(`Current MIDI mappings: ${knobMidiMappings.size} mappings`);

    // Special direct handling for Mode D
    if (mode === 'D') {
        console.log(`Using direct Mode D MIDI handler for CC ${controlNumber}`);
        if (variableChangeListeners.length === 0) {
            console.warn('No variable change listeners registered - Mode D MIDI may not work');
        }
        
        // Use the handleMidiInModeD function
        try {
            handleMidiInModeD(controlNumber, midiValue);
            return; // Skip standard processing
        } catch (error) {
            console.error(`Error in direct Mode D handler:`, error);
            // Fall back to standard processing if direct method fails
        }
    }
    
    // Standard processing for Modes A and B
    let targetKnob = knobMidiMappings.get(controlNumber);
    console.log(`MIDI CC ${controlNumber} -> ${targetKnob ? 'Mapped to knob ' + targetKnob.dataset.index : 'Not mapped yet'}`);


    // If this CC is not yet mapped, try to find an available unlocked knob
    if (!targetKnob) {
         const availableKnob = Array.from(document.querySelectorAll('.knob')).find(knob => {
             const index = parseInt(knob.dataset.index);
             // Check if locked, if variable exists, and if not already mapped
             return knob.dataset.locked === "false" &&
                    index < variables.length &&
                    !Array.from(knobMidiMappings.values()).includes(knob);
         });

        if (availableKnob) {
            targetKnob = availableKnob;
            knobMidiMappings.set(controlNumber, targetKnob);
            const index = targetKnob.dataset.index;
            console.log(`Mapped MIDI CC ${controlNumber} to Knob ${index} (${variables[index]?.name || 'N/A'})`);
            
            // Add visual MIDI indicator to knob container
            const knobContainer = targetKnob.closest('.knob-container');
            if (knobContainer) {
                // Remove any existing indicators first
                knobContainer.querySelectorAll('.midi-indicator').forEach(el => el.remove());
                
                // Add new indicator
                const midiIndicator = document.createElement('div');
                midiIndicator.className = 'midi-indicator';
                midiIndicator.textContent = `CC ${controlNumber}`;
                knobContainer.appendChild(midiIndicator);
            }
            
            // Update MIDI status panel
            updateMidiStatusPanel();
        } else {
            console.warn(`No available unlocked knob to map MIDI CC ${controlNumber}`);
            return; // No available knob to map to
        }
    }

    // If we have a target knob, ensure it's still valid and unlocked
    if (targetKnob && targetKnob.dataset.locked === "false") {
        const index = parseInt(targetKnob.dataset.index);
        // Double check variable still exists (might happen if state loaded weirdly)
        if (index < variables.length) {
             updateKnobFromMIDI(targetKnob, midiValue);
         } else {
            // Knob exists but variable doesn't - remove mapping
             console.warn(`Knob ${index} mapped to CC ${controlNumber} exists, but variable ${index} does not. Removing mapping.`);
             knobMidiMappings.delete(controlNumber);
         }
    } else if (targetKnob && targetKnob.dataset.locked === "true") {
        // Knob is mapped but now locked - ignore MIDI input for it
        console.log(`MIDI CC ${controlNumber} received for locked Knob ${targetKnob.dataset.index}. Ignoring.`);
    }
}
function updateKnobFromMIDI(knob, midiValue) {
    const index = parseInt(knob.dataset.index);
    if (index >= variables.length) {
        console.warn(`Cannot update knob ${index} - variable doesn't exist`);
        return;
    }

    console.log(`MIDI updating knob ${index} with value ${midiValue}/127 in Mode ${mode}`);

    const variable = variables[index];
    const normalizedValue = midiValue / 127.0; // Normalize MIDI value 0-127 to 0.0-1.0
    
    // Add visual MIDI activity indicator (only if knob is visible)
    if (mode === 'A' || mode === 'B') {
        knob.classList.add('knob-active');
        setTimeout(() => knob.classList.remove('knob-active'), 300);
    }

    // Get the corresponding valueInput element
    const valueInput = knob.nextElementSibling;
    if (!valueInput) {
        console.warn(`Cannot find value input for knob ${index}`);
        return;
    }

    // Handle Mode A and Mode D (discrete values)
    if (mode === 'A' || mode === 'D') {
        const numValues = variable?.value?.values?.length || 0;
        if (numValues > 0) {
            // Map normalized 0-1 value to discrete index 0 to numValues-1
            let valueIndex = Math.round(normalizedValue * (numValues - 1));
            valueIndex = Math.max(0, Math.min(numValues - 1, valueIndex)); // Clamp index
            
            // Get the actual text value
            const discreteValue = variable.value.values[valueIndex];
            console.log(`MIDI selected value[${valueIndex}] = "${discreteValue}" for ${variable.feature_name}`);
            
            // Update data attributes
            valueInput.dataset.variableValueA = discreteValue;
            
            // Update visual knob and display (only in Mode A)
            if (mode === 'A') {
                valueInput.value = discreteValue; // Display the actual text value, not the index
                updateKnobVisualDiscrete(knob, valueIndex, numValues);
            }
            
            // If in Mode D, directly notify listeners without calling the full updateKnobValue
            if (mode === 'D') {
                console.log(`Mode D direct notify: ${variable.feature_name} = ${discreteValue}`);
                // Store the value in the dataset so getSynthVar can access it
                valueInput.dataset.variableValueA = discreteValue;
                valueInput.value = discreteValue; // Update visual display too
                notifyVariableChanged(variable.feature_name, discreteValue);
            }
        }
    } 
    // Handle Mode B (continuous values)
    else if (mode === 'B') {
        // Map normalized 0-1 value to continuous range -1 to 2
        const continuousValue = (normalizedValue * 3.0) - 1.0;
        updateKnobValue(knob, continuousValue, 'B'); // Use the standard update function
    }
    
    // Make sure to update outputs (text replacement, etc.)
    updateAllOutputs();
}

// Helper to find CC mapped to a knob
function findCCTorKnob(knobElement) {
    for (const [cc, knob] of knobMidiMappings.entries()) {
        if (knob === knobElement) {
            return cc;
        }
    }
    return null;
}

// MIDI throttle timers and configuration
const midiThrottleTimers = {};
const MIDI_THROTTLE_DELAY = 5; // Faster response time (was likely much higher before)

// This function handles the optimized MIDI update logic
function updateKnobFromMIDI(knob, midiValue) {
    const index = parseInt(knob.dataset.index);
    if (index >= variables.length) {
        // No need to throttle if the variable doesn't exist
        console.warn(`MIDI Update Ignored: Knob ${index} variable doesn't exist.`);
        return;
    }

    // --- Throttling Start ---
    // Clear any pending throttled update for this knob index
    if (midiThrottleTimers[index]) {
        clearTimeout(midiThrottleTimers[index]);
    }
 
    // For immediate response, start the visual feedback now
    knob.classList.add('knob-active');
    setTimeout(() => knob.classList.remove('knob-active'), 100); // Shorter flash
    
    // Schedule the actual update after minimal delay to batch updates
    midiThrottleTimers[index] = setTimeout(() => {
        // --- Actual Update Logic (moved inside timeout) ---
        const currentVariable = variables[index]; // Re-fetch in case state changed
        if (!currentVariable) {
            console.warn(`MIDI Throttled Update Aborted: Variable ${index} missing.`);
            delete midiThrottleTimers[index];
            return;
        }
        
        console.log(`MIDI Throttled Update: knob ${index} (${currentVariable.feature_name}) with value ${midiValue}/127 in Mode ${mode}`);
        
        const normalizedValue = midiValue / 127.0;
        
        const valueInput = knob.nextElementSibling;
        if (!valueInput) {
            console.warn(`MIDI Throttled Update Aborted: Cannot find value input for knob ${index}`);
            delete midiThrottleTimers[index];
            return;
        }
        
        let valueChanged = false;
        let newValueForNotification = null;
        
        // Handle Mode A and Mode D (discrete values)
        if (mode === 'A' || mode === 'D') {
            const numValues = currentVariable?.value?.values?.length || 0;
            if (numValues > 0) {
                let valueIndex = Math.round(normalizedValue * (numValues - 1));
                valueIndex = Math.max(0, Math.min(numValues - 1, valueIndex));
                const discreteValue = currentVariable.value.values[valueIndex];
                
                // Check if value actually changed
                const currentStoredValueA = valueInput.dataset.variableValueA;
                if (currentStoredValueA !== discreteValue) {
                    console.log(` -> MIDI New Value (Discrete): ${discreteValue} (was ${currentStoredValueA})`);
                    valueInput.dataset.variableValueA = discreteValue; // Update data attribute
                    newValueForNotification = discreteValue;
                    valueChanged = true;
                    
                    // Update visual knob/display only in Mode A
                    if (mode === 'A') {
                        valueInput.value = discreteValue; // Display the actual text value, not the index
                        updateKnobVisualDiscrete(knob, valueIndex, numValues);
                    }
                    // Update display in Mode D too
                    if (mode === 'D') {
                        valueInput.value = discreteValue;
                    }
                }
            }
        }
        // Handle Mode B (continuous values)
        else if (mode === 'B') {
            const continuousValue = (normalizedValue * 3.0) - 1.0;
            const currentStoredValueB = parseFloat(valueInput.dataset.variableValueB);
            
            // Compare with reasonable precision
            if (isNaN(currentStoredValueB) || Math.abs(currentStoredValueB - continuousValue) > 0.001) {
                console.log(` -> MIDI New Value (Continuous): ${continuousValue.toFixed(3)} (was ${isNaN(currentStoredValueB) ? 'NaN' : currentStoredValueB.toFixed(3)})`);
                valueInput.dataset.variableValueB = continuousValue.toFixed(4); // Store precise
                valueInput.value = continuousValue.toFixed(2); // Display rounded
                updateKnobVisualContinuous(knob, continuousValue);
                newValueForNotification = continuousValue; // Use the precise value for notifications if needed
                valueChanged = true;
            }
        }
        
        // If the value actually changed, perform updates
        if (valueChanged) {
            // Visual feedback already handled at the start for immediate response
            
            // Notify listeners / Update outputs
            if (mode === 'D') {
                // Mode D: Directly notify p5 listener
                console.log(`Mode D throttled notify: ${currentVariable.feature_name} = ${newValueForNotification}`);
                notifyVariableChanged(currentVariable.feature_name, newValueForNotification);
            } else {
                // Mode A/B: Update main text outputs only when needed
                // Use requestAnimationFrame for better performance
                if (!pendingOutputUpdate) {
                    pendingOutputUpdate = true;
                    requestAnimationFrame(() => {
                        updateAllOutputs();
                        pendingOutputUpdate = false;
                    });
                }
            }
            
            // Throttle MIDI status panel updates
            const cc = findCCTorKnob(knob); // Find the CC# for highlighting
            if (cc !== null) {
                // Update visuals for immediate feedback
                highlightMidiMapping(cc);
                
                // Throttle full panel updates for better performance
                if (!pendingMidiPanelUpdate) {
                    pendingMidiPanelUpdate = true;
                    setTimeout(() => {
                        updateMidiStatusPanel();
                        pendingMidiPanelUpdate = false;
                    }, 150); // Batch panel updates
                }
            }
        }
        
        // Clear the stored timeout ID after execution
        delete midiThrottleTimers[index];
        
    }, MIDI_THROTTLE_DELAY); // Use the constant for delay
    // --- Throttling End ---
}

// --- P5.js Console Functions ---
function addToP5Console(text, type = 'log') {
    if (!p5Console) return;
    
    // Create timestamp
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    // Create log element
    const logEntry = document.createElement('div');
    logEntry.className = `log ${type}`;
    
    // Create timestamp span
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = timestamp;
    
    // Create content span
    const contentSpan = document.createElement('span');
    contentSpan.className = 'content';
    contentSpan.textContent = text;
    
    // Assemble and append
    logEntry.appendChild(timestampSpan);
    logEntry.appendChild(contentSpan);
    p5Console.appendChild(logEntry);
    
    // Auto-scroll to bottom
    p5Console.scrollTop = p5Console.scrollHeight;
}

function clearP5Console() {
    if (p5Console) {
        p5Console.innerHTML = '';
    }
}

// --- P5.js Integration (Mode D) ---

function runP5Code() {
    const code = p5Code.value;

    // Ensure output area is visible and clear previous content/errors
    if (!p5Output) {
        console.error("p5Output element not found!");
        return;
    }
    p5Output.innerHTML = ''; // Clear previous canvas or error messages
    p5Output.style.display = 'block'; // Ensure visibility
    p5Output.style.color = ''; // Reset error color styling
    
    // Make sure console is visible and clear it
    if (p5ConsoleContainer) {
        p5ConsoleContainer.style.display = 'flex';
        clearP5Console();
    }

    // Stop and remove any existing p5 instance first
    stopP5Sketch(); // stopP5Sketch now handles removal and nullifying p5Instance

    if (!code.trim()) {
        p5Output.innerText = "Enter p5.js code in the editor and click 'Run Code'.";
        p5Output.style.color = '#666';
        addToP5Console("p5 code editor is empty.", "warn");
        console.log("p5 code editor is empty.");
        return;
    }

    addToP5Console("Starting new p5.js sketch...", "info");
    console.log("Attempting to create and run new p5.js sketch...");
    
    // Save original console methods before overriding
    if (typeof originalConsoleLog === 'undefined') {
        originalConsoleLog = console.log;
        originalConsoleWarn = console.warn;
        originalConsoleError = console.error;
    }
    
    // Override console methods to intercept logs from the p5 sketch
    console.log = function() {
        addToP5Console(Array.from(arguments).join(' '), 'log');
        originalConsoleLog.apply(console, arguments);
    };
    
    console.warn = function() {
        addToP5Console(Array.from(arguments).join(' '), 'warn');
        originalConsoleWarn.apply(console, arguments);
    };
    
    console.error = function() {
        addToP5Console(Array.from(arguments).join(' '), 'error');
        originalConsoleError.apply(console, arguments);
    };

    // --- Outer Try/Catch for p5 INSTANCE CREATION ---
    try {
        // Define the sketch function that p5 will receive
        const sketch = (p) => {

            // --- Inject getSynthVar function into the p5 instance (p) ---
            p.getSynthVar = (featureName) => {
                const variableIndex = variables.findIndex(v => v.feature_name === featureName);
                if (variableIndex === -1) {
                    // console.warn(`Synthograsizer: Variable with feature_name "${featureName}" not found in p5 sketch.`);
                    return undefined; // Return undefined if variable doesn't exist
                }
                const container = document.getElementById(`knob-container-${variableIndex}`);
                if (!container) {
                    console.warn(`Synthograsizer: DOM element for variable "${featureName}" (index ${variableIndex}) not found.`);
                    return undefined;
                }
                const valueInput = container.querySelector('.knob-value');
                if (!valueInput) {
                     console.warn(`Synthograsizer: Value input for variable "${featureName}" not found.`);
                     return undefined;
                }

                // Return value based on the CURRENT Synthograsizer mode
                if (mode === 'A') {
                    return valueInput.dataset.variableValueA; // Return the discrete text value
                } else if (mode === 'B') {
                    return parseFloat(valueInput.dataset.variableValueB) || 0; // Return the continuous float value
                } else if (mode === 'D') {
                    // In Mode D, return the stored discrete value for compatibility with MIDI controls
                    return valueInput.dataset.variableValueA;
                } else {
                    // In Mode C, knobs aren't active
                    // console.warn(`Synthograsizer: getSynthVar called for "${featureName}" while in mode ${mode}. Returning undefined.`);
                    return undefined;
                }
            };

            // --- Inject getSynthMode function ---
            p.getSynthMode = () => {
                return mode; // Return the current global mode variable
            };
            
            // --- Inject print function to capture p5 sketch print output ---
            p.print = function() {
                const args = Array.from(arguments);
                addToP5Console(args.join(' '), 'log');
                console.log.apply(console, args);
            };
            
            // --- Add additional helper functions ---
            p.getVariableDefinition = (featureName) => {
                const variableIndex = variables.findIndex(v => v.feature_name === featureName);
                if (variableIndex === -1) return null;
                return JSON.parse(JSON.stringify(variables[variableIndex])); // Return deep copy
            };
            
            p.getAllVariables = () => {
                const result = {};
                variables.forEach(v => {
                    if (v.feature_name) {
                        result[v.feature_name] = p.getSynthVar(v.feature_name);
                    }
                });
                return result;
            };
            
            // Add MIDI variable change listener capability
            p.onVariableChange = (callback) => {
                if (typeof callback !== 'function') {
                    console.warn('onVariableChange requires a function callback');
                    return false;
                }
                console.log('Registering p5 variable change callback');
                return addVariableChangeListener(callback);
            };
            
            // Register a default handler to ensure at least one listener exists
            const defaultHandler = (name, value) => {
                console.log(`[DEFAULT_HANDLER] Variable ${name} changed to ${value}`);
                // This is intentionally empty - we'll rely on sketch-provided handlers
            };
            addVariableChangeListener(defaultHandler);
            
            // Log MIDI integration readiness
            p.print("MIDI Integration: Ready. Use p.onVariableChange(callback) to respond to MIDI changes in real-time.");

            // --- Inner Try/Catch for USER SKETCH CODE EXECUTION ---
            try {
                 // Execute the user's code within the p5 instance's scope
                 // This expects the user code to define p.setup, p.draw, etc.
                 new Function('p', code)(p);

            } catch (sketchExecError) {
                console.error("Error executing p5 sketch code (inside setup/draw or global scope):", sketchExecError);
                // Define fallback setup/draw to display the error ON the canvas
                p.setup = () => {
                    p.createCanvas(400, 150).parent(p5Output); // Create canvas inside the designated div
                    console.log("Created fallback error canvas.");
                 };
                 p.draw = () => {
                    p.background(255, 100, 100); // Red background for error
                    p.fill(0);
                    p.noStroke();
                    p.textSize(12);
                    p.textAlign(p.LEFT, p.TOP);
                    p.textFont('monospace');
                    const errorMessage = `RUNTIME ERROR in p5 sketch:\n\n${sketchExecError.name}: ${sketchExecError.message}\n\n(Check browser console for stack trace)`;
                    p.text(errorMessage, 10, 10, p.width - 20, p.height - 20); // Wrap text
                 };
                 // Manually call setup and draw once for the error message
                 // because the original setup/draw might have failed before p5's loop started.
                 if (typeof p.setup === 'function') p.setup();
                 if (typeof p.draw === 'function') p.draw();
            }
        }; // End of sketch function definition

        // --- Create the p5 instance ---
        // This line can throw if p5.js library has issues or the sketch function itself has fundamental syntax errors
        p5Instance = new p5(sketch, p5Output); // Pass the sketch function and the target DOM element
        console.log("p5 instance created successfully.");

    } catch (initError) {
        // --- Catch errors during p5 INSTANCE INITIALIZATION ---
        console.error("FATAL Error initializing p5.js sketch:", initError);
        // Display the error message directly in the output div as text
        p5Output.innerText = `ERROR initializing p5 sketch:\n\n${initError.message}\n\nThis usually means a syntax error in the sketch code outside setup()/draw() or a problem with the p5.js library itself.\n(Check browser console for more details)`;
        p5Output.style.color = '#e53e3e'; // Style as error text
        p5Instance = null; // Ensure instance is null if creation failed
    }
}

function stopP5Sketch() {
    // Restore original console functions if they've been overridden
    if (typeof originalConsoleLog !== 'undefined') {
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;
    }
    
    // Clean up variable change listeners
    cleanupP5ListenersOnStop();
    
    if (p5Instance) {
        try {
            // Remove the p5 instance
            p5Instance.remove();
            console.log("p5 sketch removed successfully.");
        } catch (error) {
            console.error("Error removing p5 sketch:", error);
            addToP5Console("Error during sketch cleanup: " + error.message, "error");
        } finally {
            // Always set p5Instance to null even if there was an error
            p5Instance = null;
        }
        
        // Update UI to indicate sketch is stopped
        if (p5Output) {
            p5Output.innerHTML = 'Sketch stopped. Click "Run Code" to restart.';
            p5Output.style.color = '#666';
        }
        
        // Add message to console
        addToP5Console("Sketch stopped.", "info");
    }
}

// --- P5.js Example Loading ---

// Fallback function to get hardcoded examples when fetch fails
function getHardcodedExample(exampleName) {
    const examples = {
        'basic_shapes': `// SYNTHOGRASIZER P5.JS EXAMPLE: Basic Shapes
// 
// This example shows how to control basic properties of shapes
// using Synthograsizer variables. It demonstrates:
// - Reading both discrete (Mode A) and continuous (Mode B) values
// - Using type checking to handle different modes
// - Animating based on variable values
//
// REQUIRED VARIABLES:
// - "shape" with values like "circle", "square", "triangle"
// - "size" for controlling shape size
// - "color" with color name values
// - "rotation" for controlling rotation speed

let angle = 0;

p.setup = function() {
  p.createCanvas(400, 300).parent(p5Output);
  p.angleMode(p.DEGREES);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(16);
  p.strokeWeight(2);
};

p.draw = function() {
  p.background(20);
  
  // Get variables from Synthograsizer (use exact template names as defined in Mode C)
  const shapeType = p.getSynthVar('shape') || 'circle';  // Default if undefined
  let shapeSize = p.getSynthVar('size');
  let rotSpeed = p.getSynthVar('rotation');
  let colorValue = p.getSynthVar('color') || 'white';
  
  // Display current mode in corner
  p.textSize(12);
  p.fill(200);
  p.noStroke();
  p.text(\`Current Mode: \${p.getSynthMode()}\`, 70, 20);
  
  // Handle size based on type (Mode A = string, Mode B = number)
  let size;
  if (typeof shapeSize === 'number') {
    // Mode B: Map the -1 to 2 range to a reasonable size
    size = p.map(shapeSize, -1, 2, 20, 150);
  } else if (typeof shapeSize === 'string') {
    // Mode A: Try to parse as a number or use a default
    size = parseInt(shapeSize) || 75;
  } else {
    // Default if not defined
    size = 75;
  }
  
  // Handle rotation based on type
  let rotationSpeed;
  if (typeof rotSpeed === 'number') {
    // Mode B: Map the -1 to 2 range to a rotation speed
    rotationSpeed = p.map(rotSpeed, -1, 2, -5, 5);
  } else if (typeof rotSpeed === 'string') {
    // Mode A: Try to parse or use a default
    rotationSpeed = parseFloat(rotSpeed) || 1;
  } else {
    // Default if not defined
    rotationSpeed = 1;
  }
  
  // Update rotation angle
  angle += rotationSpeed;
  
  // Draw shape at center of canvas
  p.push();
  p.translate(p.width/2, p.height/2);
  p.rotate(angle);
  
  // Apply color (works with standard web color names)
  p.fill(colorValue);
  p.stroke(255);
  
  // Draw the selected shape
  if (shapeType.toLowerCase().includes('circle')) {
    p.ellipse(0, 0, size, size);
  } else if (shapeType.toLowerCase().includes('square')) {
    p.rectMode(p.CENTER);
    p.rect(0, 0, size, size);
  } else if (shapeType.toLowerCase().includes('triangle')) {
    const halfSize = size / 2;
    p.triangle(0, -halfSize, -halfSize, halfSize, halfSize, halfSize);
  } else {
    // Default or unknown shape
    p.ellipse(0, 0, size, size);
  }
  
  p.pop();
  
  // Instructions
  p.textSize(14);
  p.fill(255);
  p.noStroke();
  p.text("Use knobs to control shape, size, color & rotation", p.width/2, p.height - 20);
};`,

        'particle_system': `// SYNTHOGRASIZER P5.JS EXAMPLE: Particle System
// 
// This example simulates an animated particle system
// controlled by Synthograsizer variables. It demonstrates:
// - Maintaining and updating a collection of objects
// - Mapping variable values to multiple parameters
// - Responding to both Mode A and Mode B values
//
// REQUIRED VARIABLES:
// - "count" for controlling number of particles
// - "speed" for controlling particle movement speed
// - "size" for controlling particle size
// - "color" for particle color theme (e.g., "fire", "ocean", "rainbow")

// Particle class
class Particle {
  constructor(x, y, size, speed, colorScheme) {
    this.pos = p.createVector(x, y);
    this.vel = p.createVector(p.random(-1, 1), p.random(-1, 1));
    this.vel.normalize().mult(speed);
    this.size = size;
    this.colorScheme = colorScheme;
    this.lifespan = 255;
    this.decay = p.random(1, 3);
  }
  
  update() {
    this.pos.add(this.vel);
    this.lifespan -= this.decay;
    
    // Bounce off edges
    if (this.pos.x < 0 || this.pos.x > p.width) {
      this.vel.x *= -1;
    }
    if (this.pos.y < 0 || this.pos.y > p.height) {
      this.vel.y *= -1;
    }
  }
  
  display() {
    p.noStroke();
    
    // Choose color based on scheme
    let particleColor;
    
    switch(this.colorScheme.toLowerCase()) {
      case 'fire':
        particleColor = p.color(
          p.random(200, 255),
          p.random(50, 150),
          p.random(0, 50),
          this.lifespan
        );
        break;
      case 'ocean':
        particleColor = p.color(
          p.random(0, 50),
          p.random(100, 150),
          p.random(200, 255),
          this.lifespan
        );
        break;
      case 'rainbow':
        const hue = (p.frameCount + this.pos.x) % 360;
        particleColor = p.color(
          p.colorMode(p.HSB, 360, 100, 100, 255),
          hue,
          80,
          90,
          this.lifespan
        );
        p.colorMode(p.RGB, 255, 255, 255, 255); // Reset color mode
        break;
      default:
        particleColor = p.color(200, 200, 200, this.lifespan);
    }
    
    p.fill(particleColor);
    p.ellipse(this.pos.x, this.pos.y, this.size);
  }
  
  isDead() {
    return this.lifespan <= 0;
  }
}

// Main sketch variables
let particles = [];

p.setup = function() {
  p.createCanvas(400, 300).parent(p5Output);
};

p.draw = function() {
  p.background(10, 20, 30, 40); // Semi-transparent background for trails
  
  // Get Synthograsizer variables
  const colorTheme = p.getSynthVar('color') || 'rainbow';
  
  // Handle count based on type (Mode A or B)
  let count;
  const countVar = p.getSynthVar('count');
  if (typeof countVar === 'number') {
    // Mode B: Map from -1..2 range to realistic particle count
    count = p.map(countVar, -1, 2, 1, 200);
  } else if (typeof countVar === 'string') {
    // Mode A: Parse value or use default
    count = parseInt(countVar) || 50;
  } else {
    count = 50; // Default
  }
  count = p.constrain(Math.floor(count), 1, 200);
  
  // Handle particle size
  let size;
  const sizeVar = p.getSynthVar('size');
  if (typeof sizeVar === 'number') {
    size = p.map(sizeVar, -1, 2, 1, 15);
  } else if (typeof sizeVar === 'string') {
    size = parseFloat(sizeVar) || 5;
  } else {
    size = 5;
  }
  
  // Handle speed
  let speed;
  const speedVar = p.getSynthVar('speed');
  if (typeof speedVar === 'number') {
    speed = p.map(speedVar, -1, 2, 0.5, 5);
  } else if (typeof speedVar === 'string') {
    speed = parseFloat(speedVar) || 2;
  } else {
    speed = 2;
  }
  
  // Create new particles to maintain the count
  while (particles.length < count) {
    particles.push(new Particle(
      p.random(p.width),
      p.random(p.height),
      size,
      speed,
      colorTheme
    ));
  }
  
  // If we have too many particles, remove some
  if (particles.length > count) {
    particles.splice(count);
  }
  
  // Update and display particles
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].display();
    
    // Remove dead particles
    if (particles[i].isDead()) {
      particles.splice(i, 1);
    }
  }
  
  // Show info
  p.fill(255);
  p.noStroke();
  p.textSize(12);
  p.textAlign(p.LEFT, p.TOP);
  p.text(\`Mode: \${p.getSynthMode()}\`, 10, 10);
  p.text(\`Particles: \${particles.length}\`, 10, 30);
  p.text(\`Theme: \${colorTheme}\`, 10, 50);
  p.text(\`Size: \${size.toFixed(1)}\`, 10, 70);
  p.text(\`Speed: \${speed.toFixed(1)}\`, 10, 90);
};`,

        'audio_visualizer': `// SYNTHOGRASIZER P5.JS EXAMPLE: Audio Visualizer
// 
// This example simulates an audio responsive visualization
// controlled by Synthograsizer variables. It demonstrates:
// - Creating a more complex visual effect
// - Using multiple interacting variables
// - Simulating an audio responsive visualization
//
// REQUIRED VARIABLES:
// - "bass" for controlling low frequency response
// - "mid" for controlling mid frequency response
// - "treble" for controlling high frequency response
// - "tempo" for controlling animation speed
// - "style" with values like "bars", "circles", "lines"

// Animation variables
let time = 0;
let bars = [];
const NUM_BARS = 64;

p.setup = function() {
  p.createCanvas(400, 300).parent(p5Output);
  p.colorMode(p.HSB, 360, 100, 100, 1);
  
  // Initialize bars
  for (let i = 0; i < NUM_BARS; i++) {
    bars[i] = 0;
  }
};

p.draw = function() {
  p.background(0);
  
  // Get Synthograsizer variables
  const bassVar = p.getSynthVar('bass') || 0.5;
  const midVar = p.getSynthVar('mid') || 0.5;
  const trebleVar = p.getSynthVar('treble') || 0.5;
  const tempoVar = p.getSynthVar('tempo') || 1;
  const styleVar = p.getSynthVar('style') || 'bars';
  
  // Normalize values based on mode
  const bass = typeof bassVar === 'number' ? p.map(bassVar, -1, 2, 0, 1) : parseFloat(bassVar) || 0.5;
  const mid = typeof midVar === 'number' ? p.map(midVar, -1, 2, 0, 1) : parseFloat(midVar) || 0.5;
  const treble = typeof trebleVar === 'number' ? p.map(trebleVar, -1, 2, 0, 1) : parseFloat(trebleVar) || 0.5;
  const tempo = typeof tempoVar === 'number' ? p.map(tempoVar, -1, 2, 0.25, 4) : parseFloat(tempoVar) || 1;
  
  // Update time
  time += 0.02 * tempo;
  
  // Update bar heights using bass/mid/treble values
  for (let i = 0; i < NUM_BARS; i++) {
    // Create the illusion of frequency bands
    const freq = i / NUM_BARS;
    let freqMult;
    
    // Apply frequency band multipliers (bass/mid/treble)
    if (freq < 0.33) {
      // Low frequencies (bass)
      freqMult = bass * 2.5;
    } else if (freq < 0.66) {
      // Mid frequencies
      freqMult = mid * 2.0;
    } else {
      // High frequencies (treble)
      freqMult = treble * 1.5;
    }
    
    // Generate a value using noise for a natural look
    const noiseVal = p.noise(i * 0.05, time * 0.2) * freqMult;
    
    // Add a beat emphasis based on time
    const beat = Math.pow(Math.sin(time * 0.8) * 0.5 + 0.5, 3) * bass;
    
    // Smooth transitions with easing
    bars[i] = p.lerp(bars[i], noiseVal + beat, 0.2);
  }
  
  // Render based on selected style
  if (styleVar.toLowerCase().includes('circle')) {
    drawCircleVisualizer();
  } else if (styleVar.toLowerCase().includes('line')) {
    drawLineVisualizer();
  } else {
    // Default to bars
    drawBarVisualizer();
  }
  
  // Display info
  p.colorMode(p.RGB);
  p.fill(255);
  p.noStroke();
  p.textSize(12);
  p.textAlign(p.LEFT, p.TOP);
  p.text(\`Mode: \${p.getSynthMode()}\`, 10, 10);
  p.text(\`Style: \${styleVar}\`, 10, 30);
  p.text(\`Bass: \${bass.toFixed(2)}\`, 10, 50);
  p.text(\`Mid: \${mid.toFixed(2)}\`, 10, 70);
  p.text(\`Treble: \${treble.toFixed(2)}\`, 10, 90);
  p.text(\`Tempo: \${tempo.toFixed(2)}x\`, 10, 110);
  
  // Function to draw bar visualizer
  function drawBarVisualizer() {
    const barWidth = p.width / NUM_BARS;
    
    for (let i = 0; i < NUM_BARS; i++) {
      const barHeight = bars[i] * p.height * 0.8;
      const hue = (i / NUM_BARS * 360) % 360;
      p.noStroke();
      p.fill(hue, 80, 100, 0.7);
      p.rect(i * barWidth, p.height - barHeight, barWidth - 1, barHeight);
    }
  }
  
  // Function to draw circle visualizer
  function drawCircleVisualizer() {
    p.translate(p.width/2, p.height/2);
    
    // Inner circle pulse with bass
    p.fill(240, 80, 100, 0.4);
    p.ellipse(0, 0, 100 * bass);
    
    // Outer frequency circles
    for (let i = 0; i < NUM_BARS; i += 2) {
      const angle = (i / NUM_BARS) * p.TWO_PI;
      const radius = 50 + bars[i] * 100;
      const hue = (i / NUM_BARS * 360) % 360;
      
      p.noFill();
      p.stroke(hue, 80, 100, 0.7);
      p.strokeWeight(3);
      const x = p.cos(angle) * radius;
      const y = p.sin(angle) * radius;
      p.ellipse(x * 0.2, y * 0.2, radius * 0.4);
    }
  }
  
  // Function to draw line visualizer
  function drawLineVisualizer() {
    p.noFill();
    p.strokeWeight(2);
    
    // Draw 3 frequency lines (bass, mid, treble)
    const centerY = p.height / 2;
    
    // Bass wave (red)
    p.stroke(0, 80, 100, 0.7);
    p.beginShape();
    for (let i = 0; i < p.width; i++) {
      const index = Math.floor((i / p.width) * (NUM_BARS / 3));
      const y = centerY - (bars[index] * 100) - 50;
      p.vertex(i, y);
    }
    p.endShape();
    
    // Mid wave (green)
    p.stroke(120, 80, 100, 0.7);
    p.beginShape();
    for (let i = 0; i < p.width; i++) {
      const index = Math.floor((i / p.width) * (NUM_BARS / 3)) + Math.floor(NUM_BARS / 3);
      const y = centerY - (bars[index] * 100);
      p.vertex(i, y);
    }
    p.endShape();
    
    // Treble wave (blue)
    p.stroke(240, 80, 100, 0.7);
    p.beginShape();
    for (let i = 0; i < p.width; i++) {
      const index = Math.floor((i / p.width) * (NUM_BARS / 3)) + Math.floor(2 * NUM_BARS / 3);
      const y = centerY - (bars[index] * 100) + 50;
      p.vertex(i, y);
    }
    p.endShape();
  }
};`
    };
    
    // Return the requested example or a simple default if not found
    return examples[exampleName] || 
        `// Example not found: ${exampleName}\n\n` + 
        `// Here's a simple p5.js sketch instead:\n\n` + 
        `p.setup = function() {\n  p.createCanvas(400, 300).parent(p5Output);\n};\n\n` + 
        `p.draw = function() {\n  p.background(51);\n  p.fill(255);\n  p.noStroke();\n  p.textSize(18);\n  p.textAlign(p.CENTER, p.CENTER);\n  p.text("Example '${exampleName}' not found", p.width/2, p.height/2 - 20);\n  p.textSize(14);\n  p.text("You can still edit this code and run it", p.width/2, p.height/2 + 20);\n};`;
}

function loadP5Example() {
    const selectedValue = p5ExamplesSelect.value;
    
    if (!selectedValue) {
        return; // User selected the placeholder option
    }
    
    // First stop any running sketch
    stopP5Sketch();
    
    // Show loading message
    p5Code.value = "Loading example...";
    
    // Create an array of possible paths to try
    const pathsToTry = [
        `./p5-examples/${selectedValue}.js`,
        `../p5-examples/${selectedValue}.js`,
        `p5-examples/${selectedValue}.js`,
        `/p5-examples/${selectedValue}.js`
    ];
    
    // Function to handle when all paths fail
    const handleAllPathsFailed = () => {
        console.error("Error loading p5.js example - tried all paths");
        p5Code.value = `// Error loading example: Failed to fetch after trying multiple paths\n` +
                      `// Make sure example files are in the p5-examples directory\n` +
                      `// Paths tried: ${pathsToTry.join(', ')}\n\n` +
                      `// As a fallback, here is the hard-coded example:\n` + 
                      getHardcodedExample(selectedValue);
    };
    
    // Try loading with the first path
    let currentPathIndex = 0;
    
    const tryNextPath = () => {
        if (currentPathIndex >= pathsToTry.length) {
            // We've tried all paths, use the hardcoded example as a fallback
            handleAllPathsFailed();
            return;
        }
        
        const currentPath = pathsToTry[currentPathIndex];
        console.log(`Trying to load example from: ${currentPath}`);
        
        fetch(currentPath)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load example: ${response.status} ${response.statusText}`);
                }
                return response.text();
            })
            .then(code => {
                // Update the code editor with the example
                p5Code.value = code;
                console.log(`Successfully loaded p5.js example: ${selectedValue} from ${currentPath}`);
                
                // Reset the dropdown
                // p5ExamplesSelect.value = ""; // REMOVED
            })
            .catch(error => {
                console.warn(`Error loading from ${currentPath}: ${error.message}`);
                // Try the next path
                currentPathIndex++;
                tryNextPath();
            });
    };
    
    // Start the path-trying process
    tryNextPath();
}

// Function to create variables required by the current example
function createRequiredVariables() {
    const selectedValue = p5ExamplesSelect.value || '';
    
    // If nothing selected, prompt to select an example first
    if (!selectedValue) {
        alert('Please select an example first to see which variables are required.');
        return;
    }
    
    let requiredVars = [];
    let examplePrompt = '';
    // Define required variables and prompt for each example
    if (selectedValue === 'basic_shapes') {
        requiredVars = [
            { name: 'Shape', feature_name: 'shape', values: ['circle', 'square', 'triangle'] },
            { name: 'Size', feature_name: 'size', values: ['50', '75', '100', '125'] },
            { name: 'Color', feature_name: 'color', values: ['white', 'red', 'blue', 'green', 'yellow'] },
            { name: 'Rotation', feature_name: 'rotation', values: ['0.5', '1', '2', '3'] }
        ];
        examplePrompt = 'A {{color}} {{shape}} with size {{size}} and rotation {{rotation}}';
    } else if (selectedValue === 'particle_system') {
        requiredVars = [
            { name: 'Count', feature_name: 'count', values: ['20', '50', '100', '150'] },
            { name: 'Speed', feature_name: 'speed', values: ['0.5', '1', '2', '3'] },
            { name: 'Size', feature_name: 'size', values: ['2', '5', '8', '12'] },
            { name: 'Color', feature_name: 'color', values: ['rainbow', 'fire', 'ocean', 'grayscale'] }
        ];
        examplePrompt = 'A particle system with {{count}} particles, speed {{speed}}, size {{size}}, color {{color}}';
    } else if (selectedValue === 'audio_visualizer') {
        requiredVars = [
            { name: 'Bass', feature_name: 'bass', values: ['0.2', '0.5', '0.8', '1.0'] },
            { name: 'Mid', feature_name: 'mid', values: ['0.2', '0.5', '0.8', '1.0'] },
            { name: 'Treble', feature_name: 'treble', values: ['0.2', '0.5', '0.8', '1.0'] },
            { name: 'Tempo', feature_name: 'tempo', values: ['0.5', '1', '1.5', '2'] },
            { name: 'Style', feature_name: 'style', values: ['bars', 'circles', 'lines'] }
        ];
        examplePrompt = 'Audio visualizer with bass {{bass}}, mid {{mid}}, treble {{treble}}, tempo {{tempo}}, style {{style}}';
    } else if (selectedValue === 'fractal_tree') {
        requiredVars = [
            { name: 'Branches', feature_name: 'branches', values: ['2', '3', '4', '5'] },
            { name: 'Angle', feature_name: 'angle', values: ['15', '30', '45', '60'] },
            { name: 'Length Reduction', feature_name: 'length_reduction', values: ['0.5', '0.6', '0.7', '0.8'] },
            { name: 'Min Size', feature_name: 'min_size', values: ['5', '10', '15', '20'] },
            { name: 'Color Mode', feature_name: 'color_mode', values: ['autumn', 'spring', 'winter', 'rainbow'] }
        ];
        examplePrompt = 'Fractal tree with {{branches}} branches, angle {{angle}}, reduction {{length_reduction}}, min size {{min_size}}, color mode {{color_mode}}';
    } else if (selectedValue === 'game_of_life') {
        requiredVars = [
            { name: 'Cell Size', feature_name: 'cell_size', values: ['5', '10', '15', '20'] },
            { name: 'Birth Rule', feature_name: 'birth_rule', values: ['3', '2', '4', '5'] },
            { name: 'Survive Lower', feature_name: 'survive_lower', values: ['2', '1', '3', '4'] },
            { name: 'Survive Upper', feature_name: 'survive_upper', values: ['3', '2', '4', '5'] },
            { name: 'Color Scheme', feature_name: 'color_scheme', values: ['classic', 'heat', 'rainbow', 'neon'] }
        ];
        examplePrompt = 'Game of Life with cell size {{cell_size}}, birth rule {{birth_rule}}, survive {{survive_lower}}-{{survive_upper}}, color scheme {{color_scheme}}';
    } else {
        alert(`No pre-defined variables for example '${selectedValue}'`);
        return;
    }
    
    // Do NOT switch modes; just create variables and update UI
    // Only rebuild the variable editor if already in Mode C
    const wasModeC = (typeof mode !== 'undefined' && mode === 'C');
    const wasModeD = (typeof mode !== 'undefined' && mode === 'D');
    
    // Clear current variables and set the prompt to the example's prompt
    variables = [];
    if (inputText) inputText.value = examplePrompt;
    
    // Add only the required variables
    for (const requiredVar of requiredVars) {
        const newVar = {
            name: requiredVar.name,
            feature_name: requiredVar.feature_name,
            value: {
                values: requiredVar.values,
                weights: []
            }
        };
        variables.push(newVar);
    }
    
    // Rebuild UI with new variables
    updateKnobRowsAndUI();
    if (wasModeC) buildVariableListEditor();
    if (wasModeD) initializeModeD();
    updateAllOutputs();
    
    // Show success message
    alert(`Created ${requiredVars.length} variables for '${selectedValue}' example.`);
}