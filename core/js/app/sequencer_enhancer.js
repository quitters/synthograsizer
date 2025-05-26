/**
 * Sequencer Enhancer
 * 
 * This script enhances the sequencer grid cells with additional styling
 * to ensure they're properly displayed in the SynthograsizerDAW.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Wait for the app to be initialized
    setTimeout(function() {
        enhanceSequencerCells();
        
        // Set up a mutation observer to watch for new cells being added
        const melodySequencer = document.getElementById('melodySequencer');
        const drumSequencer = document.getElementById('drumSequencer');
        
        if (melodySequencer && drumSequencer) {
            const observer = new MutationObserver(function(mutations) {
                enhanceSequencerCells();
            });
            
            observer.observe(melodySequencer, { childList: true });
            observer.observe(drumSequencer, { childList: true });
        }
    }, 1000);
});

/**
 * Enhances all sequencer cells with additional styling
 * If no cells exist, creates them
 */
function enhanceSequencerCells() {
    console.log('Enhancing sequencer cells...');
    
    // Get all cells
    const cells = document.querySelectorAll('.cell');
    console.log(`Found ${cells.length} cells to enhance`);
    
    // If no cells exist, create them
    if (cells.length === 0) {
        console.log('No cells found, creating them...');
        createSequencerCells();
        return; // Will be called again after cells are created
    }
    
    // Apply enhanced styling to each cell
    cells.forEach(function(cell) {
        // Base styling
        cell.style.width = '28px';
        cell.style.height = '28px';
        cell.style.margin = '1px';
        cell.style.backgroundColor = '#f8f8f8';
        cell.style.border = '1px solid #e0e0e0';
        cell.style.cursor = 'pointer';
        cell.style.borderRadius = '2px';
        cell.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)';
        cell.style.display = 'block';
        
        // Beat marker styling (every 4th column)
        const col = parseInt(cell.dataset.col);
        if (col % 4 === 0) {
            cell.style.backgroundColor = '#e8e8e8';
            cell.style.borderColor = '#d0d0d0';
        }
        
        // Active cell styling
        if (cell.classList.contains('active')) {
            cell.style.backgroundColor = '#4CAF50';
            cell.style.borderColor = '#388E3C';
            cell.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
        }
    });
    
    // Create step numbers if they don't exist
    createStepNumbers();
    
    // Enhance sequencer containers
    enhanceSequencerContainers();
}

/**
 * Creates sequencer cells if they don't exist
 */
function createSequencerCells() {
    const melodySequencer = document.getElementById('melodySequencer');
    const drumSequencer = document.getElementById('drumSequencer');
    const melodyLabels = document.getElementById('melodyLabels');
    const drumLabels = document.getElementById('drumLabels');
    
    // Create note labels for melody sequencer
    if (melodyLabels && melodyLabels.children.length === 0) {
        // Define note names for melody labels (C major scale)
        const noteNames = ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'];
        
        for (let i = 0; i < noteNames.length; i++) {
            const label = document.createElement('div');
            label.className = 'note-label';
            label.textContent = noteNames[i];
            
            // Apply styling
            label.style.height = '30px';
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.justifyContent = 'flex-end';
            label.style.paddingRight = '8px';
            label.style.fontSize = '0.8rem';
            label.style.fontWeight = 'bold';
            label.style.color = '#d0d0d0';
            label.style.textShadow = '0 1px 1px rgba(0, 0, 0, 0.5)';
            label.style.borderBottom = '1px solid #3a3a3a';
            
            melodyLabels.appendChild(label);
        }
    }
    
    // Create note labels for drum sequencer
    if (drumLabels && drumLabels.children.length === 0) {
        // Define drum names
        const drumNames = ['Kick', 'Snare', 'HiHat', 'OpenHat', 'Tom', 'Crash', '808'];
        
        for (let i = 0; i < drumNames.length; i++) {
            const label = document.createElement('div');
            label.className = 'note-label';
            label.textContent = drumNames[i];
            
            // Apply styling
            label.style.height = '30px';
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.justifyContent = 'flex-end';
            label.style.paddingRight = '8px';
            label.style.fontSize = '0.8rem';
            label.style.fontWeight = 'bold';
            label.style.color = '#d0d0d0';
            label.style.textShadow = '0 1px 1px rgba(0, 0, 0, 0.5)';
            label.style.borderBottom = '1px solid #3a3a3a';
            
            drumLabels.appendChild(label);
        }
    }
    
    if (melodySequencer) {
        // Set up grid container
        melodySequencer.style.display = 'grid';
        melodySequencer.style.gridTemplateColumns = 'repeat(16, 30px)';
        melodySequencer.style.gridAutoRows = '30px';
        melodySequencer.style.gap = '2px';
        melodySequencer.style.padding = '8px';
        melodySequencer.style.backgroundColor = '#1a1a1a';
        
        // Create melody grid cells (8 rows, 16 columns)
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 16; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                // Apply styling
                cell.style.width = '28px';
                cell.style.height = '28px';
                cell.style.margin = '1px';
                cell.style.backgroundColor = col % 4 === 0 ? '#e8e8e8' : '#f8f8f8';
                cell.style.border = `1px solid ${col % 4 === 0 ? '#d0d0d0' : '#e0e0e0'}`;
                cell.style.cursor = 'pointer';
                cell.style.borderRadius = '2px';
                cell.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)';
                cell.style.display = 'block';
                
                // Add click event
                cell.addEventListener('click', function() {
                    cell.classList.toggle('active');
                    if (cell.classList.contains('active')) {
                        cell.style.backgroundColor = '#4CAF50';
                        cell.style.borderColor = '#388E3C';
                    } else {
                        cell.style.backgroundColor = col % 4 === 0 ? '#e8e8e8' : '#f8f8f8';
                        cell.style.borderColor = col % 4 === 0 ? '#d0d0d0' : '#e0e0e0';
                    }
                });
                
                melodySequencer.appendChild(cell);
            }
        }
    }
    
    if (drumSequencer) {
        // Set up grid container
        drumSequencer.style.display = 'grid';
        drumSequencer.style.gridTemplateColumns = 'repeat(16, 30px)';
        drumSequencer.style.gridAutoRows = '30px';
        drumSequencer.style.gap = '2px';
        drumSequencer.style.padding = '8px';
        drumSequencer.style.backgroundColor = '#1a1a1a';
        
        // Create drum grid cells (7 rows, 16 columns)
        for (let row = 0; row < 7; row++) {
            for (let col = 0; col < 16; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                // Apply styling
                cell.style.width = '28px';
                cell.style.height = '28px';
                cell.style.margin = '1px';
                cell.style.backgroundColor = col % 4 === 0 ? '#e8e8e8' : '#f8f8f8';
                cell.style.border = `1px solid ${col % 4 === 0 ? '#d0d0d0' : '#e0e0e0'}`;
                cell.style.cursor = 'pointer';
                cell.style.borderRadius = '2px';
                cell.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)';
                cell.style.display = 'block';
                
                // Add click event
                cell.addEventListener('click', function() {
                    cell.classList.toggle('active');
                    if (cell.classList.contains('active')) {
                        cell.style.backgroundColor = '#4CAF50';
                        cell.style.borderColor = '#388E3C';
                    } else {
                        cell.style.backgroundColor = col % 4 === 0 ? '#e8e8e8' : '#f8f8f8';
                        cell.style.borderColor = col % 4 === 0 ? '#d0d0d0' : '#e0e0e0';
                    }
                });
                
                drumSequencer.appendChild(cell);
            }
        }
    }
    
    console.log('Created sequencer cells');
}

/**
 * Creates step numbers for both sequencers
 */
function createStepNumbers() {
    const melodyStepNumbers = document.getElementById('melodyStepNumbers');
    const drumStepNumbers = document.getElementById('drumStepNumbers');
    
    if (melodyStepNumbers && melodyStepNumbers.children.length === 0) {
        melodyStepNumbers.style.display = 'flex';
        melodyStepNumbers.style.height = '25px';
        melodyStepNumbers.style.backgroundColor = '#1a1a1a';
        melodyStepNumbers.style.borderBottom = '1px solid #333';
        
        for (let i = 0; i < 16; i++) {
            const stepNumber = document.createElement('div');
            stepNumber.className = 'step-number';
            stepNumber.textContent = i + 1;
            
            // Apply styling
            stepNumber.style.width = '30px';
            stepNumber.style.height = '25px';
            stepNumber.style.display = 'flex';
            stepNumber.style.alignItems = 'center';
            stepNumber.style.justifyContent = 'center';
            stepNumber.style.fontSize = '10px';
            stepNumber.style.color = i % 4 === 0 ? '#bbb' : '#888';
            stepNumber.style.fontWeight = 'bold';
            
            melodyStepNumbers.appendChild(stepNumber);
        }
    }
    
    if (drumStepNumbers && drumStepNumbers.children.length === 0) {
        drumStepNumbers.style.display = 'flex';
        drumStepNumbers.style.height = '25px';
        drumStepNumbers.style.backgroundColor = '#1a1a1a';
        drumStepNumbers.style.borderBottom = '1px solid #333';
        
        for (let i = 0; i < 16; i++) {
            const stepNumber = document.createElement('div');
            stepNumber.className = 'step-number';
            stepNumber.textContent = i + 1;
            
            // Apply styling
            stepNumber.style.width = '30px';
            stepNumber.style.height = '25px';
            stepNumber.style.display = 'flex';
            stepNumber.style.alignItems = 'center';
            stepNumber.style.justifyContent = 'center';
            stepNumber.style.fontSize = '10px';
            stepNumber.style.color = i % 4 === 0 ? '#bbb' : '#888';
            stepNumber.style.fontWeight = 'bold';
            
            drumStepNumbers.appendChild(stepNumber);
        }
    }
}

/**
 * Enhances the sequencer containers with proper grid styling
 */
function enhanceSequencerContainers() {
    const melodySequencer = document.getElementById('melodySequencer');
    const drumSequencer = document.getElementById('drumSequencer');
    
    if (melodySequencer) {
        melodySequencer.style.display = 'grid';
        melodySequencer.style.gridTemplateColumns = 'repeat(16, 30px)';
        melodySequencer.style.gridAutoRows = '30px';
        melodySequencer.style.gap = '2px';
        melodySequencer.style.padding = '8px';
        melodySequencer.style.backgroundColor = '#1a1a1a';
        melodySequencer.style.minHeight = '240px';
    }
    
    if (drumSequencer) {
        drumSequencer.style.display = 'grid';
        drumSequencer.style.gridTemplateColumns = 'repeat(16, 30px)';
        drumSequencer.style.gridAutoRows = '30px';
        drumSequencer.style.gap = '2px';
        drumSequencer.style.padding = '8px';
        drumSequencer.style.backgroundColor = '#1a1a1a';
        drumSequencer.style.minHeight = '240px';
    }
    
    // Enhance step numbers
    const melodyStepNumbers = document.getElementById('melodyStepNumbers');
    const drumStepNumbers = document.getElementById('drumStepNumbers');
    
    if (melodyStepNumbers) {
        melodyStepNumbers.style.display = 'flex';
        melodyStepNumbers.style.height = '25px';
        melodyStepNumbers.style.backgroundColor = '#1a1a1a';
        melodyStepNumbers.style.borderBottom = '1px solid #333';
    }
    
    if (drumStepNumbers) {
        drumStepNumbers.style.display = 'flex';
        drumStepNumbers.style.height = '25px';
        drumStepNumbers.style.backgroundColor = '#1a1a1a';
        drumStepNumbers.style.borderBottom = '1px solid #333';
    }
}
