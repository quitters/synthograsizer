/**
 * Sequencer Functions for SynthograsizerDAW
 * Implements improved sequencer UI based on the sequencer-demo.html
 *
 * This file extends the Synthograsizer class with new sequencer functionality
 */

// Global variables for sequencer state
let melodyTranspose = 0;

/**
 * Renders both sequencers with the current configuration
 */
function renderSequencers() {
    const melodySequencer = document.getElementById('melodySequencer');
    const drumSequencer = document.getElementById('drumSequencer');
    const melodyLabels = document.getElementById('melodyLabels');
    const drumLabels = document.getElementById('drumLabels');
    
    // Clear existing content
    melodySequencer.innerHTML = '';
    drumSequencer.innerHTML = '';
    melodyLabels.innerHTML = '';
    drumLabels.innerHTML = '';
    document.getElementById('melodyStepNumbers').innerHTML = '';
    document.getElementById('drumStepNumbers').innerHTML = '';
    
    // Add the key-scale label back after clearing
    const melodyKeyScaleLabel = document.createElement('div');
    melodyKeyScaleLabel.className = 'key-scale-label';
    melodyKeyScaleLabel.id = 'melodyKeyScale';
    melodyLabels.appendChild(melodyKeyScaleLabel);
    
    const drumKeyScaleLabel = document.createElement('div');
    drumKeyScaleLabel.className = 'key-scale-label';
    drumKeyScaleLabel.id = 'drumKeyScale';
    drumLabels.appendChild(drumKeyScaleLabel);
    
    // Update key-scale labels
    updateKeyScaleLabel();
    
    // Set CSS variables for step count
    melodySequencer.style.setProperty('--step-count', app.config.melodySteps);
    drumSequencer.style.setProperty('--step-count', app.config.drumSteps);
    document.getElementById('melodyStepNumbers').style.setProperty('--step-count', app.config.melodySteps);
    document.getElementById('drumStepNumbers').style.setProperty('--step-count', app.config.drumSteps);
    
    // Create melody grid - render in reverse order (highest to lowest)
    const totalMelodyRows = app.config.sequencerRows.melody;
    for (let displayRow = 0; displayRow < totalMelodyRows; displayRow++) {
        // Calculate the actual row index (reverse order)
        const actualRow = totalMelodyRows - 1 - displayRow;
        
        // Add label
        const label = document.createElement('div');
        label.className = 'note-label';
        label.textContent = getNoteLabel(actualRow);
        melodyLabels.appendChild(label);
        
        for (let j = 0; j < app.config.melodySteps; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            // Store actual row in data attribute for click handling
            cell.dataset.row = actualRow;
            cell.dataset.col = j;
            
            if (app.melodyGrid[actualRow] && app.melodyGrid[actualRow][j]) {
                cell.classList.add('active');
            }
            
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                app.melodyGrid[row][col] = !app.melodyGrid[row][col];
                cell.classList.toggle('active');
            });
            
            melodySequencer.appendChild(cell);
        }
    }
    
    // Create drum grid (keep original order for drums)
    for (let i = 0; i < app.config.sequencerRows.drum; i++) {
        // Add label
        const label = document.createElement('div');
        label.className = 'note-label';
        label.textContent = getDrumLabel(i);
        drumLabels.appendChild(label);
        
        for (let j = 0; j < app.config.drumSteps; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = i;
            cell.dataset.col = j;
            
            if (app.drumGrid[i] && app.drumGrid[i][j]) {
                cell.classList.add('active');
            }
            
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                app.drumGrid[row][col] = !app.drumGrid[row][col];
                cell.classList.toggle('active');
            });
            
            drumSequencer.appendChild(cell);
        }
    }
    
    // Create step numbers for both sequencers
    createStepNumbers('melody', app.config.melodySteps);
    createStepNumbers('drum', app.config.drumSteps);
    
    // Add current step indicators if playing
    if (app.isPlaying && app.currentStep !== undefined) {
        const currentMelodyCells = document.querySelectorAll(`#melodySequencer .cell[data-col="${app.currentStep}"]`);
        const currentDrumCells = document.querySelectorAll(`#drumSequencer .cell[data-col="${app.currentStep}"]`);
        
        currentMelodyCells.forEach(cell => cell.classList.add('current'));
        currentDrumCells.forEach(cell => cell.classList.add('current'));
    }
}

/**
 * Creates step numbers row for a sequencer
 * @param {string} type - Type of sequencer ('melody' or 'drum')
 * @param {number} steps - Number of steps
 */
function createStepNumbers(type, steps) {
    const stepNumbersContainer = document.getElementById(`${type}StepNumbers`);
    stepNumbersContainer.innerHTML = '';
    
    for (let i = 0; i < steps; i++) {
        const stepNumber = document.createElement('div');
        stepNumber.className = 'step-number';
        stepNumber.textContent = i + 1;
        
        // Mark every 4th step (beat markers)
        if (i % 4 === 0) {
            stepNumber.dataset.beat = 'true';
        }
        
        stepNumbersContainer.appendChild(stepNumber);
    }
}

/**
 * Updates the key-scale labels based on current configuration
 */
function updateKeyScaleLabel() {
    const melodyKeyScale = document.getElementById('melodyKeyScale');
    const drumKeyScale = document.getElementById('drumKeyScale');
    
    if (!melodyKeyScale || !drumKeyScale) return;
    
    // Format the key-scale label based on the current configuration
    let scaleDisplay = '';
    const scale = document.getElementById('scaleSelect').value;
    
    switch(scale) {
        case 'major':
            scaleDisplay = 'Maj';
            break;
        case 'minor':
            scaleDisplay = 'Min';
            break;
        case 'pentatonic':
            scaleDisplay = 'Penta';
            break;
        case 'blues':
            scaleDisplay = 'Blues';
            break;
        case 'chromatic':
            scaleDisplay = 'Chrom';
            break;
        default:
            scaleDisplay = scale;
    }
    
    const key = document.getElementById('keySelect').value;
    
    // Update the labels
    melodyKeyScale.textContent = `${key}-${scaleDisplay}`;
    
    const drumKit = document.getElementById('drumKitSelect').value;
    drumKeyScale.textContent = `${drumKit.charAt(0).toUpperCase() + drumKit.slice(1)} Kit`;
}

/**
 * Gets the note label for a melody row
 * @param {number} rowIndex - Row index
 * @returns {string} Note label
 */
function getNoteLabel(rowIndex) {
    // Define scale patterns for different scales
    const scalePatterns = {
        'major': [0, 2, 4, 5, 7, 9, 11],
        'minor': [0, 2, 3, 5, 7, 8, 10],
        'pentatonic': [0, 2, 4, 7, 9],
        'blues': [0, 3, 5, 6, 7, 10],
        'chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    };
    
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // Get the pattern for the current scale
    const scale = document.getElementById('scaleSelect').value;
    const pattern = scalePatterns[scale] || scalePatterns['major'];
    
    // Find the root note index based on the selected key
    const key = document.getElementById('keySelect').value;
    const rootIndex = keys.indexOf(key);
    
    // Apply transposition logic
    const patternIndex = rowIndex % pattern.length;
    const noteIndex = (rootIndex + pattern[patternIndex]) % 12;
    let adjustedOctave = Math.floor(rowIndex / pattern.length) + 4;
    
    // Apply octave transposition
    adjustedOctave += melodyTranspose;
    
    const noteName = keys[noteIndex];
    return `${noteName}${adjustedOctave}`;
}

/**
 * Gets the drum label for a drum row
 * @param {number} rowIndex - Row index
 * @returns {string} Drum label
 */
function getDrumLabel(rowIndex) {
    const drumTypes = {
        'acoustic': ['Kick', 'Snare', 'ClosedHH', 'OpenHH', 'LowTom', 'HighTom', 'Crash', 'Ride'],
        'electronic': ['Kick', 'Snare', 'HiHat', 'Clap', 'Perc1', 'Perc2', 'Crash', 'FX'],
        '808': ['Kick', 'Snare', 'HiHat', 'Clap', 'Cowbell', 'Conga', 'Rimshot', 'Maracas']
    };
    
    const kit = document.getElementById('drumKitSelect').value || 'acoustic';
    return drumTypes[kit] ? drumTypes[kit][rowIndex] || `Drum ${rowIndex+1}` : `Drum ${rowIndex+1}`;
}

/**
 * Changes the pattern length for both sequencers
 * @param {number} steps - New pattern length
 */
function changePatternLength(steps) {
    if (!steps || steps < 1) return;
    
    app.config.melodySteps = steps;
    app.config.drumSteps = steps;
    
    // Resize grids while preserving existing data
    for (let i = 0; i < app.config.sequencerRows.melody; i++) {
        const newMelodyRow = Array(steps).fill(false);
        for (let j = 0; j < Math.min(steps, app.melodyGrid[i].length); j++) {
            newMelodyRow[j] = app.melodyGrid[i][j];
        }
        app.melodyGrid[i] = newMelodyRow;
    }
    
    for (let i = 0; i < app.config.sequencerRows.drum; i++) {
        const newDrumRow = Array(steps).fill(false);
        for (let j = 0; j < Math.min(steps, app.drumGrid[i].length); j++) {
            newDrumRow[j] = app.drumGrid[i][j];
        }
        app.drumGrid[i] = newDrumRow;
    }
    
    renderSequencers();
}

/**
 * Transposes the melody by a number of octaves
 * @param {number} octaves - Number of octaves to transpose
 */
function transposeMelody(octaves) {
    if (!octaves) return;
    
    // Update transposition (limit to +/- 2 octaves)
    melodyTranspose = Math.max(-2, Math.min(2, melodyTranspose + octaves));
    
    // Update display
    document.getElementById('transposeValue').textContent = melodyTranspose > 0 ? `+${melodyTranspose}` : melodyTranspose;
    
    // Re-render to update note labels
    renderSequencers();
}

/**
 * Clears both sequencer grids
 */
function clearGrid() {
    for (let i = 0; i < app.config.sequencerRows.melody; i++) {
        app.melodyGrid[i].fill(false);
    }
    
    for (let i = 0; i < app.config.sequencerRows.drum; i++) {
        app.drumGrid[i].fill(false);
    }
    
    renderSequencers();
}

/**
 * Setup event listeners for the new sequencer UI
 */
function setupSequencerEventListeners() {
    // Pattern length change
    const patternLengthSelect = document.getElementById('patternLength');
    if (patternLengthSelect) {
        patternLengthSelect.addEventListener('change', (e) => {
            changePatternLength(parseInt(e.target.value));
        });
    }
    
    // Melody pattern length change
    const melodyPatternLengthSelect = document.getElementById('melodyPatternLengthSelect');
    if (melodyPatternLengthSelect) {
        melodyPatternLengthSelect.addEventListener('change', (e) => {
            app.config.melodySteps = parseInt(e.target.value);
            renderSequencers();
        });
    }
    
    // Drum pattern length change
    const drumPatternLengthSelect = document.getElementById('drumPatternLengthSelect');
    if (drumPatternLengthSelect) {
        drumPatternLengthSelect.addEventListener('change', (e) => {
            app.config.drumSteps = parseInt(e.target.value);
            renderSequencers();
        });
    }
    
    // Transpose controls
    const transposeUp = document.getElementById('transposeUp');
    if (transposeUp) {
        transposeUp.addEventListener('click', () => {
            transposeMelody(1);
        });
    }
    
    const transposeDown = document.getElementById('transposeDown');
    if (transposeDown) {
        transposeDown.addEventListener('click', () => {
            transposeMelody(-1);
        });
    }
    
    // Clear buttons
    const clearMelodyButton = document.getElementById('clearMelodyButton');
    if (clearMelodyButton) {
        clearMelodyButton.addEventListener('click', () => {
            for (let i = 0; i < app.config.sequencerRows.melody; i++) {
                app.melodyGrid[i].fill(false);
            }
            renderSequencers();
        });
    }
    
    const clearDrumButton = document.getElementById('clearDrumButton');
    if (clearDrumButton) {
        clearDrumButton.addEventListener('click', () => {
            for (let i = 0; i < app.config.sequencerRows.drum; i++) {
                app.drumGrid[i].fill(false);
            }
            renderSequencers();
        });
    }
    
    // Key and scale change
    const keySelect = document.getElementById('keySelect');
    if (keySelect) {
        keySelect.addEventListener('change', () => {
            updateKeyScaleLabel();
            renderSequencers();
        });
    }
    
    const scaleSelect = document.getElementById('scaleSelect');
    if (scaleSelect) {
        scaleSelect.addEventListener('change', () => {
            updateKeyScaleLabel();
            renderSequencers();
        });
    }
    
    // Drum kit change
    const drumKitSelect = document.getElementById('drumKitSelect');
    if (drumKitSelect) {
        drumKitSelect.addEventListener('change', () => {
            updateKeyScaleLabel();
            renderSequencers();
        });
    }
}

// Initialize sequencer when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Setup event listeners
    setupSequencerEventListeners();
    
    // Initial render will be called by the main app
});
