/**
 * Fixed playback functionality for SynthograsizerDAW
 * This file contains the properly structured play and stop methods
 * and the related audio initialization code.
 */

// These methods are intended to be used within the Synthograsizer class
// The file is included in the HTML and the methods are added to the Synthograsizer prototype

// Play method - starts the sequencer playback
Synthograsizer.prototype.play = function() {
    try {
        // Check if AudioContext exists, if not initialize it
        if (!this.audioContext) {
            this.initAudioContext();
        }
        
        // Check if AudioContext is in suspended state and resume it
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        // Ensure grids are initialized
        if (!this.melodyGrid || !this.drumGrid) {
            console.log('Initializing sequencer grids');
            // Create empty grids for the sequencers if they don't exist
            if (!this.config.sequencerRows) {
                this.config.sequencerRows = {
                    melody: 16,
                    drum: 8
                };
            }
            
            if (!this.config.totalSteps) {
                this.config.totalSteps = 16;
            }
            
            if (!this.config.melodySteps) {
                this.config.melodySteps = 16;
            }
            
            if (!this.config.drumSteps) {
                this.config.drumSteps = 16;
            }
            
            this.melodyGrid = Array(this.config.sequencerRows.melody).fill().map(() => Array(this.config.totalSteps).fill(false));
            this.drumGrid = Array(this.config.sequencerRows.drum).fill().map(() => Array(this.config.totalSteps).fill(false));
        }
        
        // Only start if not already playing
        if (!this.isPlaying) {
            // Get BPM value with fallback
            const bpmInput = document.getElementById('bpmInput');
            let bpm = 120; // Default BPM
            
            if (bpmInput && bpmInput.value) {
                const parsedBpm = parseFloat(bpmInput.value);
                if (!isNaN(parsedBpm) && parsedBpm > 0) {
                    bpm = parsedBpm;
                }
            }
            
            console.log(`Starting playback at ${bpm} BPM`);
            
            const stepTime = 60000 / bpm / 4; // 16th notes
            
            // Set flag and reset step counter
            this.isPlaying = true;
            this.currentStep = 0;
            
            // Update UI to show playing state
            const playButton = document.getElementById('playButton');
            if (playButton) {
                playButton.classList.add('active');
            }
            
            // Start the step sequencer interval
            this.stepInterval = setInterval(() => {
                // Ensure currentStep is valid before each step
                if (isNaN(this.currentStep) || this.currentStep === undefined) {
                    console.warn('Invalid step counter, resetting to 0');
                    this.currentStep = 0;
                }
                this.step();
            }, stepTime);
            
            console.log(`Step interval set to ${stepTime}ms`);
        }
    } catch (e) {
        console.error('Error starting playback:', e);
    }
}

// Pause method - pauses the sequencer playback without resetting position
Synthograsizer.prototype.pausePlayback = function() {
    if (this.isPlaying) {
        // Clear the interval
        clearInterval(this.stepInterval);
        this.stepInterval = null;
        
        // Update state but keep current step position
        this.isPlaying = false;
        
        // Update UI
        document.getElementById('playButton').classList.remove('active');
    }
}

// Stop method - stops the sequencer playback
Synthograsizer.prototype.stop = function() {
    if (this.isPlaying) {
        // Clear the interval
        clearInterval(this.stepInterval);
        this.stepInterval = null;
        
        // Reset state
        this.isPlaying = false;
        this.currentStep = 0;
        
        // Update UI
        document.getElementById('playButton').classList.remove('active');
        
        // Reset all sequence indicators
        document.querySelectorAll('.step-indicator').forEach(indicator => {
            indicator.classList.remove('current');
        });
    }
}

// Initialize Web Audio API context
Synthograsizer.prototype.initAudioContext = function() {
    if (!this.audioContext) {
        try {
            // Create new audio context with fallbacks for different browsers
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            // Setup audio nodes once the context is created
            this.setupAudioNodes();
            
            // Don't call setupEffects here - it's defined in daw_script.js
            // and will be called from there
            
            console.log('Audio context initialized successfully');
            
            // Remove the start button if present
            const startOverlay = document.getElementById('startOverlay');
            if (startOverlay) {
                startOverlay.remove();
            }
            
            return true;
        } catch (e) {
            console.error('Failed to initialize audio context:', e);
            return false;
        }
    }
    return true;
}

// Setup audio processing nodes
Synthograsizer.prototype.setupAudioNodes = function() {
    if (!this.audioContext) return;
    
    // Create master gain node
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.7; // Default volume
    this.masterGain.connect(this.audioContext.destination);
    
    // Create analyzer for visualizations
    this.analyzer = this.audioContext.createAnalyser();
    this.analyzer.fftSize = 2048;
    this.analyzer.connect(this.masterGain);
}

// Sequencer step function - called on each beat
// This is the main playback function that will be called by the integrated sequencer
Synthograsizer.prototype.coreStep = function() {
    if (!this.isPlaying || !this.audioContext) {
        console.warn('Step called but not playing or no audio context');
        return;
    }
    
    try {
        // Ensure currentStep is valid
        if (isNaN(this.currentStep) || this.currentStep === undefined) {
            console.warn('Invalid currentStep value, resetting to 0');
            this.currentStep = 0;
        }
        
        const now = this.audioContext.currentTime;
        
        // Get swing amount (0-100)
        const swingSlider = document.getElementById('swingSlider');
        const swingAmount = parseInt(swingSlider?.value || 0);
        
        // Apply swing to even-numbered steps
        let swingDelay = 0;
        if (this.currentStep % 2 === 1 && swingAmount > 0) {
            // Convert swing amount to a time delay (0-50ms)
            swingDelay = (swingAmount / 100) * 0.05;
        }
        
        console.log(`Playing step ${this.currentStep}`);
        
        // Play melody notes for current step
        if (this.melodyGrid && Array.isArray(this.melodyGrid)) {
            for (let i = 0; i < (this.config.sequencerRows?.melody || 16); i++) {
                if (this.melodyGrid[i] && Array.isArray(this.melodyGrid[i]) && 
                    this.currentStep >= 0 && this.currentStep < this.melodyGrid[i].length && 
                    this.melodyGrid[i][this.currentStep]) {
                    // Get note frequency based on scale and key
                    const frequency = this.noteToFrequency(i);
                    
                    // Create oscillator with the selected waveform
                    const soundProfile = document.getElementById('soundProfile');
                    const waveform = soundProfile?.value || 'sine';
                    this.createOscillator(frequency, waveform);
                    console.log(`Playing melody note at row ${i}, frequency ${frequency}Hz`);
                }
            }
        } else {
            console.warn('Melody grid not initialized');
        }
        
        // Play drum sounds for current step
        if (this.drumGrid && Array.isArray(this.drumGrid)) {
            for (let i = 0; i < (this.config.sequencerRows?.drum || 8); i++) {
                if (this.drumGrid[i] && Array.isArray(this.drumGrid[i]) && 
                    this.currentStep >= 0 && this.currentStep < this.drumGrid[i].length && 
                    this.drumGrid[i][this.currentStep]) {
                    // Play the appropriate drum sound based on row
                    this.playDrumSound(i);
                    console.log(`Playing drum sound at row ${i}`);
                }
            }
        } else {
            console.warn('Drum grid not initialized');
        }
        
        // Ensure we have valid steps configuration
        if (!this.config.melodySteps || isNaN(this.config.melodySteps) || this.config.melodySteps <= 0) {
            this.config.melodySteps = 16; // Default to 16 steps
        }
        
        // Advance to next step
        this.currentStep = (this.currentStep + 1) % this.config.melodySteps;
        
        // If we've reached the end of the pattern and we're playing a chain, load the next pattern
        if (this.currentStep === 0 && this.chainedPatterns && Array.isArray(this.chainedPatterns) && this.chainedPatterns.length > 0) {
            const nextPatternIndex = this.chainedPatterns.shift();
            if (typeof this.loadSequence === 'function') {
                this.loadSequence(nextPatternIndex);
                if (typeof this.updateChainDisplay === 'function') {
                    this.updateChainDisplay();
                }
            }
        }
    } catch (e) {
        console.error('Error in sequencer step:', e);
    }
}

// This is the step function that will be called by the setInterval
// It will call the coreStep function and handle the visual updates
Synthograsizer.prototype.step = function() {
    // Call the core step function to handle audio playback
    this.coreStep();
    
    try {
        // Ensure currentStep is valid
        if (isNaN(this.currentStep) || this.currentStep === undefined) {
            console.warn('Invalid currentStep value in visual update, resetting to 0');
            this.currentStep = 0;
        }
        
        // Visual feedback - highlight current step
        // Remove previous highlights
        document.querySelectorAll('.cell.current').forEach(cell => {
            cell.classList.remove('current');
        });
        
        // Add highlight to current step cells
        try {
            // Use a valid selector with the current step
            const currentStep = Math.max(0, Math.min(15, this.currentStep)); // Ensure it's between 0-15
            const currentMelodyCells = document.querySelectorAll(`#melodySequencer .cell[data-col="${currentStep}"]`);
            const currentDrumCells = document.querySelectorAll(`#drumSequencer .cell[data-col="${currentStep}"]`);
            
            currentMelodyCells.forEach(cell => cell.classList.add('current'));
            currentDrumCells.forEach(cell => cell.classList.add('current'));
        } catch (selectorError) {
            console.warn('Error selecting cells:', selectorError);
        }
    } catch (e) {
        console.warn('Error updating sequencer UI:', e);
    }
}

// Convert note to frequency
Synthograsizer.prototype.noteToFrequency = function(note) {
    try {
        const keySelect = document.getElementById('keySelect');
        const scaleSelect = document.getElementById('scaleSelect');
        
        if (!keySelect || !scaleSelect) {
            console.warn('Key or scale select elements not found');
            return 440; // Default to A4 if elements not found
        }
        
        if (!this.config.keys) {
            this.config.keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        }
        
        const keyIndex = this.config.keys.indexOf(keySelect.value);
        const scaleType = scaleSelect.value;
        
        if (!this.config.scales || !this.config.scales[scaleType]) {
            console.warn('Scale not found:', scaleType);
            return 440; // Default to A4 if scale not found
        }
        
        const octave = Math.floor(note / this.config.scales[scaleType].length) + 4;
        const noteIndex = this.config.scales[scaleType][note % this.config.scales[scaleType].length];
        const frequency = 440 * Math.pow(2, (keyIndex + noteIndex + (octave - 4) * 12) / 12);
        
        return frequency;
    } catch (e) {
        console.error('Error calculating frequency:', e);
        return 440; // Default to A4 on error
    }
}

// Create oscillator for melody notes
Synthograsizer.prototype.createOscillator = function(frequency, waveform = 'sine') {
    try {
        if (!this.audioContext) {
            console.warn('Audio context not initialized');
            return;
        }
        
        const now = this.audioContext.currentTime;
        
        // Create oscillator and gain nodes
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Set oscillator properties
        osc.type = waveform;
        osc.frequency.setValueAtTime(frequency, now);
        
        // Connect oscillator to gain node and then to master gain
        osc.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        
        // Set envelope
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01); // Attack
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.1); // Decay
        gainNode.gain.linearRampToValueAtTime(0, now + 0.5); // Release
        
        // Start and stop oscillator
        osc.start(now);
        osc.stop(now + 0.5);
        
        console.log(`Playing note at ${frequency}Hz with ${waveform} waveform`);
        
        return osc;
    } catch (e) {
        console.error('Error creating oscillator:', e);
        return null;
    }
}

// Play drum sound
Synthograsizer.prototype.playDrumSound = function(index) {
    try {
        if (!this.audioContext) {
            console.warn('Audio context not initialized');
            return;
        }
        
        const now = this.audioContext.currentTime;
        
        // Map index to drum type
        const drumTypes = ['Kick', 'Snare', 'Closed Hi-hat', 'Open Hi-hat', 'Tom', 'Cymbal', '808 Bass', 'Clap'];
        const type = drumTypes[index] || 'Kick';
        
        console.log(`Playing drum sound: ${type} at index ${index}`);
        
        // Create oscillator and gain nodes
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const noiseGain = this.audioContext.createGain();
        
        // Connect to master gain
        osc.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        
        // Default volume
        const volume = 0.5;
        
        // Set parameters based on drum type
        switch(type) {
            case 'Kick':
                // Kick drum - low frequency with pitch drop
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
                
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(volume, now + 0.005);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
                
                osc.type = 'sine';
                osc.start(now);
                osc.stop(now + 0.4);
                break;
                
            case 'Snare':
                // Snare - noise + tone
                osc.frequency.setValueAtTime(250, now);
                osc.type = 'triangle';
                
                // Create noise for the snare
                const noise = this.createNoise();
                noise.connect(noiseGain);
                noiseGain.connect(this.masterGainNode);
                
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(volume * 0.5, now + 0.005);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
                
                noiseGain.gain.setValueAtTime(0, now);
                noiseGain.gain.linearRampToValueAtTime(volume * 0.8, now + 0.005);
                noiseGain.gain.linearRampToValueAtTime(0, now + 0.2);
                
                osc.start(now);
                osc.stop(now + 0.2);
                noise.start(now);
                noise.stop(now + 0.2);
                break;
                
            case 'Closed Hi-hat':
                // Hi-hat - filtered noise with short decay
                const closedHat = this.createNoise();
                const closedHatFilter = this.audioContext.createBiquadFilter();
                
                closedHatFilter.type = 'highpass';
                closedHatFilter.frequency.value = 8000;
                
                closedHat.connect(closedHatFilter);
                closedHatFilter.connect(gainNode);
                
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(volume * 0.7, now + 0.005);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
                
                closedHat.start(now);
                closedHat.stop(now + 0.1);
                break;
                
            default:
                // Default sound for other drum types
                osc.frequency.setValueAtTime(200, now);
                osc.type = 'triangle';
                
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(volume, now + 0.005);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
                
                osc.start(now);
                osc.stop(now + 0.3);
        }
        
    } catch (e) {
        console.error('Error playing drum sound:', e);
    }
}

// Create noise for drum sounds
Synthograsizer.prototype.createNoise = function() {
    try {
        const bufferSize = 2 * this.audioContext.sampleRate;
        const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;
        
        return noise;
    } catch (e) {
        console.error('Error creating noise:', e);
        return null;
    }
}
