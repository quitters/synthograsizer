/**
 * Integrated Sequencer for SynthograsizerDAW
 * 
 * This file extends the Synthograsizer class with improved sequencer functionality
 * based on the sequencer-demo.html implementation.
 */

// Global variable for melody transposition
let melodyTranspose = 0;

// Add the improved sequencer functionality to the Synthograsizer class
Synthograsizer.prototype.renderSequencers = function() {
    const melodySequencer = document.getElementById('melodySequencer');
    const drumSequencer = document.getElementById('drumSequencer');
    const melodyLabels = document.getElementById('melodyLabels');
    const drumLabels = document.getElementById('drumLabels');
    
    if (!melodySequencer || !drumSequencer || !melodyLabels || !drumLabels) {
        console.error('Missing sequencer elements');
        return;
    }
    
    // Clear existing content
    melodySequencer.innerHTML = '';
    drumSequencer.innerHTML = '';
    melodyLabels.innerHTML = '';
    drumLabels.innerHTML = '';
    
    // Set up grid containers with explicit styles
    melodySequencer.style.display = 'grid';
    melodySequencer.style.gridTemplateColumns = `repeat(${this.config.melodySteps}, 30px)`;
    melodySequencer.style.gridAutoRows = '30px';
    melodySequencer.style.gap = '2px';
    melodySequencer.style.padding = '8px';
    melodySequencer.style.backgroundColor = '#1a1a1a';
    
    drumSequencer.style.display = 'grid';
    drumSequencer.style.gridTemplateColumns = `repeat(${this.config.drumSteps}, 30px)`;
    drumSequencer.style.gridAutoRows = '30px';
    drumSequencer.style.gap = '2px';
    drumSequencer.style.padding = '8px';
    drumSequencer.style.backgroundColor = '#1a1a1a';
    
    // Clear step numbers
    const melodyStepNumbers = document.getElementById('melodyStepNumbers');
    const drumStepNumbers = document.getElementById('drumStepNumbers');
    if (melodyStepNumbers) melodyStepNumbers.innerHTML = '';
    if (drumStepNumbers) drumStepNumbers.innerHTML = '';
    
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
    this.updateKeyScaleLabel();
    
    // Set CSS variables for step count
    melodySequencer.style.setProperty('--step-count', this.config.melodySteps);
    drumSequencer.style.setProperty('--step-count', this.config.drumSteps);
    if (melodyStepNumbers) melodyStepNumbers.style.setProperty('--step-count', this.config.melodySteps);
    if (drumStepNumbers) drumStepNumbers.style.setProperty('--step-count', this.config.drumSteps);
    
    // Create melody grid - render in reverse order (highest to lowest)
    const totalMelodyRows = this.config.sequencerRows.melody;
    for (let displayRow = 0; displayRow < totalMelodyRows; displayRow++) {
        // Calculate the actual row index (reverse order)
        const actualRow = totalMelodyRows - 1 - displayRow;
        
        // Add label
        const label = document.createElement('div');
        label.className = 'note-label';
        label.textContent = this.getNoteLabel(actualRow);
        melodyLabels.appendChild(label);
        
        for (let j = 0; j < this.config.melodySteps; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            // Store actual row in data attribute for click handling
            cell.dataset.row = actualRow;
            cell.dataset.col = j;
            
            // Apply explicit inline styles to ensure visibility
            cell.style.width = '28px';
            cell.style.height = '28px';
            cell.style.margin = '1px';
            cell.style.backgroundColor = '#f8f8f8';
            cell.style.border = '1px solid #e0e0e0';
            cell.style.cursor = 'pointer';
            cell.style.borderRadius = '2px';
            cell.style.display = 'block';
            
            // Add beat marker styling for every 4th column
            if (j % 4 === 0) {
                cell.style.backgroundColor = '#e8e8e8';
                cell.style.borderColor = '#d0d0d0';
            }
            
            if (this.melodyGrid[actualRow] && this.melodyGrid[actualRow][j]) {
                cell.classList.add('active');
                cell.style.backgroundColor = '#4CAF50';
                cell.style.borderColor = '#388E3C';
            }
            
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                this.melodyGrid[row][col] = !this.melodyGrid[row][col];
                cell.classList.toggle('active');
            });
            
            melodySequencer.appendChild(cell);
        }
    }
    
    // Create drum grid (keep original order for drums)
    for (let i = 0; i < this.config.sequencerRows.drum; i++) {
        // Add label
        const label = document.createElement('div');
        label.className = 'note-label';
        label.textContent = this.getDrumLabel(i);
        drumLabels.appendChild(label);
        
        for (let j = 0; j < this.config.drumSteps; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = i;
            cell.dataset.col = j;
            
            // Apply explicit inline styles to ensure visibility
            cell.style.width = '28px';
            cell.style.height = '28px';
            cell.style.margin = '1px';
            cell.style.backgroundColor = '#f8f8f8';
            cell.style.border = '1px solid #e0e0e0';
            cell.style.cursor = 'pointer';
            cell.style.borderRadius = '2px';
            cell.style.display = 'block';
            
            // Add beat marker styling for every 4th column
            if (j % 4 === 0) {
                cell.style.backgroundColor = '#e8e8e8';
                cell.style.borderColor = '#d0d0d0';
            }
            
            if (this.drumGrid[i] && this.drumGrid[i][j]) {
                cell.classList.add('active');
                cell.style.backgroundColor = '#4CAF50';
                cell.style.borderColor = '#388E3C';
            }
            
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                this.drumGrid[row][col] = !this.drumGrid[row][col];
                cell.classList.toggle('active');
            });
            
            drumSequencer.appendChild(cell);
        }
    }
    
    // Create step numbers for both sequencers
    this.createStepNumbers('melody', this.config.melodySteps);
    this.createStepNumbers('drum', this.config.drumSteps);
    
    // Add current step indicators if playing
    if (this.isPlaying && this.currentStep !== undefined) {
        const currentMelodyCells = document.querySelectorAll(`#melodySequencer .cell[data-col="${this.currentStep}"]`);
        const currentDrumCells = document.querySelectorAll(`#drumSequencer .cell[data-col="${this.currentStep}"]`);
        
        currentMelodyCells.forEach(cell => cell.classList.add('current'));
        currentDrumCells.forEach(cell => cell.classList.add('current'));
    }
};

// Create step numbers for both sequencers
Synthograsizer.prototype.createStepNumbers = function(type, steps) {
    const stepNumbersContainer = document.getElementById(`${type}StepNumbers`);
    if (!stepNumbersContainer) return;
    
    stepNumbersContainer.innerHTML = '';
    stepNumbersContainer.style.display = 'flex';
    
    for (let i = 0; i < steps; i++) {
        const stepNumber = document.createElement('div');
        stepNumber.className = 'step-number';
        stepNumber.textContent = i + 1;
        
        // Add beat marker for every 4th step
        if (i % 4 === 0) {
            stepNumber.dataset.beat = 'true';
        }
        
        // Apply inline styles to ensure visibility
        stepNumber.style.width = '30px';
        stepNumber.style.height = '25px';
        stepNumber.style.display = 'flex';
        stepNumber.style.alignItems = 'center';
        stepNumber.style.justifyContent = 'center';
        stepNumber.style.fontSize = '10px';
        stepNumber.style.color = (i % 4 === 0) ? '#bbb' : '#888';
        stepNumber.style.fontWeight = 'bold';
        
        stepNumbersContainer.appendChild(stepNumber);
    }
};

// Update the key-scale labels based on current configuration
Synthograsizer.prototype.updateKeyScaleLabel = function() {
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
    
    const drumKit = document.getElementById('drumKitSelect').value || 'acoustic';
    drumKeyScale.textContent = `${drumKit.charAt(0).toUpperCase() + drumKit.slice(1)} Kit`;
};

// Gets the note label for a melody row
Synthograsizer.prototype.getNoteLabel = function(rowIndex) {
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
    
    // Apply octave transposition using the global variable
    adjustedOctave += melodyTranspose;
    
    const noteName = keys[noteIndex];
    return `${noteName}${adjustedOctave}`;
};

// Gets the drum label for a drum row
Synthograsizer.prototype.getDrumLabel = function(rowIndex) {
    const drumTypes = {
        'acoustic': ['Kick', 'Snare', 'ClosedHH', 'OpenHH', 'LowTom', 'HighTom', 'Crash', 'Ride'],
        'electronic': ['Kick', 'Snare', 'HiHat', 'Clap', 'Perc1', 'Perc2', 'Crash', 'FX'],
        '808': ['Kick', 'Snare', 'HiHat', 'Clap', 'Cowbell', 'Conga', 'Rimshot', 'Maracas']
    };
    
    const kit = document.getElementById('drumKitSelect').value || 'acoustic';
    return drumTypes[kit] ? drumTypes[kit][rowIndex] || `Drum ${rowIndex+1}` : `Drum ${rowIndex+1}`;
};

// Transpose the melody by a number of octaves
Synthograsizer.prototype.transposeMelody = function(octaves) {
    if (!octaves) return;
    
    const transposeValue = document.getElementById('transposeValue');
    if (!transposeValue) return;
    
    // Update transposition (limit to +/- 2 octaves)
    melodyTranspose = Math.max(-2, Math.min(2, melodyTranspose + octaves));
    
    // Update display
    transposeValue.textContent = melodyTranspose > 0 ? `+${melodyTranspose}` : melodyTranspose;
    
    // Re-render to update note labels
    this.renderSequencers();
};

// Setup event listeners for the sequencer controls
Synthograsizer.prototype.setupSequencerControls = function() {
    // Transpose controls
    const transposeUp = document.getElementById('transposeUp');
    if (transposeUp) {
        transposeUp.addEventListener('click', () => {
            this.transposeMelody(1);
        });
    }
    
    const transposeDown = document.getElementById('transposeDown');
    if (transposeDown) {
        transposeDown.addEventListener('click', () => {
            this.transposeMelody(-1);
        });
    }
    
    // Key and scale change
    const keySelect = document.getElementById('keySelect');
    if (keySelect) {
        keySelect.addEventListener('change', () => {
            this.updateKeyScaleLabel();
            this.renderSequencers();
        });
    }
    
    const scaleSelect = document.getElementById('scaleSelect');
    if (scaleSelect) {
        scaleSelect.addEventListener('change', () => {
            this.updateKeyScaleLabel();
            this.renderSequencers();
        });
    }
    
    // Drum kit change
    const drumKitSelect = document.getElementById('drumKitSelect');
    if (drumKitSelect) {
        drumKitSelect.addEventListener('change', () => {
            this.updateKeyScaleLabel();
            this.renderSequencers();
        });
    }
};

// Override the step function to work with our new sequencer implementation
Synthograsizer.prototype.originalStep = Synthograsizer.prototype.step || function() {};
Synthograsizer.prototype.step = function() {
    // Call the original step function if it exists
    if (typeof this.originalStep === 'function') {
        this.originalStep.call(this);
    }
    
    // Visual feedback - highlight current step
    // Remove previous highlights
    document.querySelectorAll('.cell.current').forEach(cell => {
        cell.classList.remove('current');
    });
    
    // Add highlight to current step cells
    const currentMelodyCells = document.querySelectorAll(`#melodySequencer .cell[data-col="${this.currentStep}"]`);
    const currentDrumCells = document.querySelectorAll(`#drumSequencer .cell[data-col="${this.currentStep}"]`);
    
    currentMelodyCells.forEach(cell => cell.classList.add('current'));
    currentDrumCells.forEach(cell => cell.classList.add('current'));
};

// Debug function to help identify rendering issues
function debugSequencerElements() {
    console.log('Debugging sequencer elements:');
    console.log('melodySequencer:', document.getElementById('melodySequencer'));
    console.log('drumSequencer:', document.getElementById('drumSequencer'));
    console.log('melodyLabels:', document.getElementById('melodyLabels'));
    console.log('drumLabels:', document.getElementById('drumLabels'));
    console.log('melodyStepNumbers:', document.getElementById('melodyStepNumbers'));
    console.log('drumStepNumbers:', document.getElementById('drumStepNumbers'));
    
    // Check if cells are being created
    const cells = document.querySelectorAll('.cell');
    console.log('Total cells found:', cells.length);
    
    // Check sequencer grid styles
    const melodyGrid = document.getElementById('melodySequencer');
    if (melodyGrid) {
        console.log('Melody grid computed style:', window.getComputedStyle(melodyGrid));
    }
}

// Initialize the improved sequencer when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for the app to be initialized
    setTimeout(() => {
        if (window.app && window.app instanceof Synthograsizer) {
            // Setup sequencer controls
            app.setupSequencerControls();
            
            // Initial render
            app.renderSequencers();
            
            // Initialize transpose value display
            const transposeValue = document.getElementById('transposeValue');
            if (transposeValue) {
                transposeValue.textContent = melodyTranspose > 0 ? `+${melodyTranspose}` : melodyTranspose;
            }
            
            // Initialize key-scale labels
            app.updateKeyScaleLabel();
            
            // Run debug function to help identify issues
            debugSequencerElements();
            
            // Force grid display with inline styles if needed
            const melodyGrid = document.getElementById('melodySequencer');
            const drumGrid = document.getElementById('drumSequencer');
            
            if (melodyGrid && melodyGrid.children.length === 0) {
                console.log('No melody grid cells found, forcing re-render');
                app.renderSequencers();
            }
            
            // Apply inline styles to ensure grid visibility
            if (melodyGrid) {
                melodyGrid.style.display = 'grid';
                melodyGrid.style.gridTemplateColumns = `repeat(${app.config.melodySteps}, 30px)`;
                melodyGrid.style.gridAutoRows = '30px';
                melodyGrid.style.gap = '2px';
                melodyGrid.style.backgroundColor = '#1a1a1a';
                melodyGrid.style.padding = '2px';
            }
            
            if (drumGrid) {
                drumGrid.style.display = 'grid';
                drumGrid.style.gridTemplateColumns = `repeat(${app.config.drumSteps}, 30px)`;
                drumGrid.style.gridAutoRows = '30px';
                drumGrid.style.gap = '2px';
                drumGrid.style.backgroundColor = '#1a1a1a';
                drumGrid.style.padding = '2px';
            }
            
            console.log('Integrated sequencer initialized');
        }
    }, 500);
});
