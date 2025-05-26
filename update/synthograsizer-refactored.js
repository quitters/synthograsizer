/**
 * Refactored Synthograsizer DAW
 * This is a cleaned up and properly structured version of the main class
 */

class Synthograsizer {
    constructor() {
        // Initialize state variables
        this.audioContext = null;
        this.isPlaying = false;
        this.currentStep = 0;
        this.stepInterval = null;
        this.activeOscillators = new Set(); // Track active oscillators for cleanup
        
        // Initialize configuration
        this.initializeConfig();
        
        // Initialize grids with proper sizes
        this.initializeGrids();
        
        // Initialize pattern management
        this.savedPatterns = [];
        this.currentPatternIndex = -1;
        this.patternChain = [];
        this.chainedPatterns = [];
        
        // Set initial values
        this.quantizeValue = 16;
        this.melodyTranspose = 0;
        
        // Setup UI and event listeners ONCE
        this.renderUI();
        this.setupAllEventListeners();
        
        // Create start button overlay for audio context initialization
        this.createStartButton();
    }
    
    initializeConfig() {
        this.config = {
            // Pattern configuration
            bpm: 120,
            totalSteps: 16, // Default total steps
            melodySteps: 16, // Current melody pattern length
            drumSteps: 16, // Current drum pattern length
            
            // Sequencer configuration
            sequencerRows: {
                melody: 16,
                drum: 8
            },
            
            // Music theory
            scales: {
                'major': [0, 2, 4, 5, 7, 9, 11],
                'minor': [0, 2, 3, 5, 7, 8, 10],
                'pentatonic': [0, 2, 4, 7, 9],
                'blues': [0, 3, 5, 6, 7, 10],
                'chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
            },
            keys: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
            currentKey: 'C',
            currentScale: 'major',
            
            // Drum configuration
            drumTypes: ['Kick', 'Snare', 'Closed Hi-hat', 'Open Hi-hat', 'Tom', 'Cymbal', '808 Bass', 'Clap'],
            drumKit: 'acoustic',
            
            // Synthesis parameters
            synthesis: {
                waveform: 'sine',
                fm: {
                    enabled: false,
                    carrierWaveform: 'sine',
                    modulatorWaveform: 'sine',
                    modulationIndex: 0,
                    modulationRatio: 1
                },
                envelope: {
                    attack: 10,
                    decay: 50,
                    sustain: 50,
                    release: 100
                },
                filter: {
                    type: 'lowpass',
                    frequency: 1000,
                    resonance: 1,
                    envelopeAmount: 0
                },
                lfo: {
                    enabled: false,
                    waveform: 'sine',
                    rate: 1,
                    amount: 0,
                    destination: 'none'
                },
                voice: {
                    polyphony: true,
                    unison: 1,
                    detune: 0,
                    portamento: 0
                }
            },
            
            // Effects configuration
            effects: {
                delay: {
                    enabled: false,
                    time: 0.3,
                    feedback: 0.4,
                    mix: 0.3
                },
                distortion: {
                    enabled: false,
                    amount: 10,
                    mix: 0.3
                },
                reverb: {
                    enabled: false,
                    size: 0.8,
                    mix: 0.3
                },
                compressor: {
                    enabled: true,
                    threshold: -24,
                    ratio: 12,
                    attack: 0.003,
                    release: 0.25
                }
            },
            
            // Arpeggiator configuration
            arpeggiator: {
                enabled: false,
                pattern: 'up',
                rate: 16,
                octaves: 1
            },
            
            // Volume configuration
            volumes: {
                master: 0.7,
                melody: 1.0,
                kick: 1.0,
                snare: 1.0,
                hihat: 1.0,
                openhat: 1.0,
                tom: 1.0,
                cymbal: 1.0,
                bass808: 1.0,
                clap: 1.0
            },
            
            // Swing configuration
            swing: 0
        };
    }
    
    initializeGrids() {
        // Initialize grids with current step counts
        this.melodyGrid = Array(this.config.sequencerRows.melody).fill(null).map(() => 
            Array(this.config.melodySteps).fill(false)
        );
        
        this.drumGrid = Array(this.config.sequencerRows.drum).fill(null).map(() => 
            Array(this.config.drumSteps).fill(false)
        );
    }
    
    // Create start button overlay
    createStartButton() {
        const overlay = document.createElement('div');
        overlay.id = 'startOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const startButton = document.createElement('button');
        startButton.textContent = 'Start SynthograsizerDAW';
        startButton.style.cssText = `
            padding: 15px 30px;
            font-size: 18px;
            background-color: #5e60ce;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: background-color 0.3s;
        `;
        
        startButton.addEventListener('mouseover', () => {
            startButton.style.backgroundColor = '#4e4fbc';
        });
        
        startButton.addEventListener('mouseout', () => {
            startButton.style.backgroundColor = '#5e60ce';
        });
        
        startButton.addEventListener('click', () => {
            this.initializeAudio();
            overlay.remove();
        });
        
        overlay.appendChild(startButton);
        document.body.appendChild(overlay);
    }
    
    // Initialize audio system
    initializeAudio() {
        try {
            // Create audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            // Setup audio nodes
            this.setupAudioNodes();
            
            // Setup effects chain
            this.setupEffectsChain();
            
            // Start visualization if available
            if (typeof this.startVisualization === 'function') {
                this.startVisualization();
            }
            
            console.log('Audio system initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize audio system:', error);
            return false;
        }
    }
    
    // Setup basic audio nodes
    setupAudioNodes() {
        // Master gain node
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.config.volumes.master;
        
        // Create analyzer for visualization
        this.analyzer = this.audioContext.createAnalyser();
        this.analyzer.fftSize = 2048;
        
        // Don't connect to destination yet - will be done after effects chain
    }
    
    // Setup complete effects chain
    setupEffectsChain() {
        // Create input node for effects chain
        this.effectsChainInput = this.audioContext.createGain();
        
        // Create effects nodes
        this.setupDelayEffect();
        this.setupDistortionEffect();
        this.setupReverbEffect();
        this.setupCompressor();
        this.setupLFO();
        
        // Connect the chain
        this.connectEffectsChain();
    }
    
    setupDelayEffect() {
        this.delay = {
            delayNode: this.audioContext.createDelay(5.0),
            feedbackGain: this.audioContext.createGain(),
            wetGain: this.audioContext.createGain(),
            dryGain: this.audioContext.createGain(),
            output: this.audioContext.createGain()
        };
        
        const config = this.config.effects.delay;
        this.delay.delayNode.delayTime.value = config.time;
        this.delay.feedbackGain.gain.value = config.feedback;
        this.delay.wetGain.gain.value = config.enabled ? config.mix : 0;
        this.delay.dryGain.gain.value = config.enabled ? (1 - config.mix) : 1;
        
        // Wire up delay
        this.delay.delayNode.connect(this.delay.feedbackGain);
        this.delay.feedbackGain.connect(this.delay.delayNode);
        this.delay.delayNode.connect(this.delay.wetGain);
        this.delay.wetGain.connect(this.delay.output);
        this.delay.dryGain.connect(this.delay.output);
    }
    
    setupDistortionEffect() {
        this.distortion = {
            waveShaper: this.audioContext.createWaveShaper(),
            wetGain: this.audioContext.createGain(),
            dryGain: this.audioContext.createGain(),
            output: this.audioContext.createGain()
        };
        
        const config = this.config.effects.distortion;
        this.updateDistortionCurve(config.amount);
        this.distortion.wetGain.gain.value = config.enabled ? config.mix : 0;
        this.distortion.dryGain.gain.value = config.enabled ? (1 - config.mix) : 1;
        
        // Wire up distortion
        this.distortion.waveShaper.connect(this.distortion.wetGain);
        this.distortion.wetGain.connect(this.distortion.output);
        this.distortion.dryGain.connect(this.distortion.output);
    }
    
    setupReverbEffect() {
        this.reverb = {
            convolver: this.audioContext.createConvolver(),
            wetGain: this.audioContext.createGain(),
            dryGain: this.audioContext.createGain(),
            output: this.audioContext.createGain()
        };
        
        const config = this.config.effects.reverb;
        this.createReverbImpulse(config.size);
        this.reverb.wetGain.gain.value = config.enabled ? config.mix : 0;
        this.reverb.dryGain.gain.value = config.enabled ? (1 - config.mix) : 1;
        
        // Wire up reverb
        this.reverb.convolver.connect(this.reverb.wetGain);
        this.reverb.wetGain.connect(this.reverb.output);
        this.reverb.dryGain.connect(this.reverb.output);
    }
    
    setupCompressor() {
        this.compressor = this.audioContext.createDynamicsCompressor();
        const config = this.config.effects.compressor;
        
        this.compressor.threshold.value = config.threshold;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = config.ratio;
        this.compressor.attack.value = config.attack;
        this.compressor.release.value = config.release;
    }
    
    setupLFO() {
        this.lfo = {
            oscillator: this.audioContext.createOscillator(),
            gain: this.audioContext.createGain()
        };
        
        const config = this.config.synthesis.lfo;
        this.lfo.oscillator.frequency.value = config.rate;
        this.lfo.oscillator.type = config.waveform;
        this.lfo.gain.gain.value = config.amount / 100;
        
        this.lfo.oscillator.connect(this.lfo.gain);
        this.lfo.oscillator.start();
    }
    
    connectEffectsChain() {
        // Connect input to delay
        this.effectsChainInput.connect(this.delay.dryGain);
        this.effectsChainInput.connect(this.delay.delayNode);
        
        // Delay to distortion
        this.delay.output.connect(this.distortion.dryGain);
        this.delay.output.connect(this.distortion.waveShaper);
        
        // Distortion to reverb
        this.distortion.output.connect(this.reverb.dryGain);
        this.distortion.output.connect(this.reverb.convolver);
        
        // Reverb to compressor
        this.reverb.output.connect(this.compressor);
        
        // Compressor to analyzer and master gain
        this.compressor.connect(this.analyzer);
        this.analyzer.connect(this.masterGain);
        
        // Master gain to destination
        this.masterGain.connect(this.audioContext.destination);
    }
    
    // Update distortion curve
    updateDistortionCurve(amount) {
        const k = amount;
        const nSamples = 44100;
        const curve = new Float32Array(nSamples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < nSamples; i++) {
            const x = (i * 2) / nSamples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
        }
        
        this.distortion.waveShaper.curve = curve;
        this.distortion.waveShaper.oversample = '4x';
    }
    
    // Create reverb impulse response
    createReverbImpulse(size) {
        const length = this.audioContext.sampleRate * size * 3;
        const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }
        
        this.reverb.convolver.buffer = impulse;
    }
    
    // Render initial UI
    renderUI() {
        this.renderSequencers();
        this.updatePatternDisplay();
    }
    
    // Main sequencer rendering method
    renderSequencers() {
        const melodySequencer = document.getElementById('melodySequencer');
        const drumSequencer = document.getElementById('drumSequencer');
        const melodyLabels = document.getElementById('melodyLabels');
        const drumLabels = document.getElementById('drumLabels');
        
        if (!melodySequencer || !drumSequencer) {
            console.error('Sequencer elements not found');
            return;
        }
        
        // Clear existing content
        melodySequencer.innerHTML = '';
        drumSequencer.innerHTML = '';
        melodyLabels.innerHTML = '';
        drumLabels.innerHTML = '';
        
        // Set grid styles
        melodySequencer.style.gridTemplateColumns = `repeat(${this.config.melodySteps}, 30px)`;
        drumSequencer.style.gridTemplateColumns = `repeat(${this.config.drumSteps}, 30px)`;
        
        // Render melody grid
        this.renderMelodyGrid(melodySequencer, melodyLabels);
        
        // Render drum grid
        this.renderDrumGrid(drumSequencer, drumLabels);
        
        // Create step numbers
        this.createStepNumbers('melody', this.config.melodySteps);
        this.createStepNumbers('drum', this.config.drumSteps);
        
        // Update labels
        this.updateKeyScaleLabel();
    }
    
    renderMelodyGrid(container, labelsContainer) {
        const rows = this.config.sequencerRows.melody;
        
        // Create labels and cells
        for (let row = 0; row < rows; row++) {
            // Create label
            const label = document.createElement('div');
            label.className = 'note-label';
            label.textContent = this.getNoteLabel(rows - 1 - row); // Reverse order
            labelsContainer.appendChild(label);
            
            // Create cells for this row
            for (let col = 0; col < this.config.melodySteps; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = rows - 1 - row; // Store actual row index
                cell.dataset.col = col;
                
                // Check if cell should be active
                if (this.melodyGrid[rows - 1 - row][col]) {
                    cell.classList.add('active');
                }
                
                // Add beat marker class
                if (col % 4 === 0) {
                    cell.classList.add('beat-marker');
                }
                
                // Add click handler
                cell.addEventListener('click', () => this.toggleMelodyCell(rows - 1 - row, col));
                
                container.appendChild(cell);
            }
        }
    }
    
    renderDrumGrid(container, labelsContainer) {
        const rows = this.config.sequencerRows.drum;
        
        // Create labels and cells
        for (let row = 0; row < rows; row++) {
            // Create label
            const label = document.createElement('div');
            label.className = 'note-label';
            label.textContent = this.config.drumTypes[row];
            labelsContainer.appendChild(label);
            
            // Create cells for this row
            for (let col = 0; col < this.config.drumSteps; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell drum-cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                // Check if cell should be active
                if (this.drumGrid[row][col]) {
                    cell.classList.add('active');
                }
                
                // Add beat marker class
                if (col % 4 === 0) {
                    cell.classList.add('beat-marker');
                }
                
                // Add click handler
                cell.addEventListener('click', () => this.toggleDrumCell(row, col));
                
                container.appendChild(cell);
            }
        }
    }
    
    // Toggle cell methods
    toggleMelodyCell(row, col) {
        if (row >= 0 && row < this.melodyGrid.length && col >= 0 && col < this.melodyGrid[row].length) {
            this.melodyGrid[row][col] = !this.melodyGrid[row][col];
            
            // Update visual
            const cell = document.querySelector(`#melodySequencer .cell[data-row="${row}"][data-col="${col}"]`);
            if (cell) {
                cell.classList.toggle('active');
            }
        }
    }
    
    toggleDrumCell(row, col) {
        if (row >= 0 && row < this.drumGrid.length && col >= 0 && col < this.drumGrid[row].length) {
            this.drumGrid[row][col] = !this.drumGrid[row][col];
            
            // Update visual
            const cell = document.querySelector(`#drumSequencer .cell[data-row="${row}"][data-col="${col}"]`);
            if (cell) {
                cell.classList.toggle('active');
            }
        }
    }
    
    // Get note label for a row
    getNoteLabel(row) {
        const scale = this.config.scales[this.config.currentScale];
        const keyIndex = this.config.keys.indexOf(this.config.currentKey);
        
        const octave = Math.floor(row / scale.length) + 4 + this.melodyTranspose;
        const noteInScale = row % scale.length;
        const semitone = (keyIndex + scale[noteInScale]) % 12;
        
        return `${this.config.keys[semitone]}${octave}`;
    }
    
    // Create step numbers
    createStepNumbers(type, steps) {
        const container = document.getElementById(`${type}StepNumbers`);
        if (!container) return;
        
        container.innerHTML = '';
        
        for (let i = 0; i < steps; i++) {
            const stepNumber = document.createElement('div');
            stepNumber.className = 'step-number';
            stepNumber.textContent = i + 1;
            
            if (i % 4 === 0) {
                stepNumber.dataset.beat = 'true';
            }
            
            container.appendChild(stepNumber);
        }
    }
    
    // Update key/scale label
    updateKeyScaleLabel() {
        const melodyLabel = document.getElementById('melodyKeyScale');
        const drumLabel = document.getElementById('drumKeyScale');
        
        if (melodyLabel) {
            const scaleAbbrev = {
                'major': 'Maj',
                'minor': 'Min',
                'pentatonic': 'Penta',
                'blues': 'Blues',
                'chromatic': 'Chrom'
            };
            
            melodyLabel.textContent = `${this.config.currentKey}-${scaleAbbrev[this.config.currentScale] || this.config.currentScale}`;
        }
        
        if (drumLabel) {
            drumLabel.textContent = `${this.config.drumKit.charAt(0).toUpperCase() + this.config.drumKit.slice(1)} Kit`;
        }
    }
    
    // Setup all event listeners
    setupAllEventListeners() {
        // Playback controls
        this.setupPlaybackControls();
        
        // Sequencer controls
        this.setupSequencerControls();
        
        // Pattern controls
        this.setupPatternControls();
        
        // Audio parameter controls
        this.setupAudioControls();
        
        // UI controls
        this.setupUIControls();
    }
    
    setupPlaybackControls() {
        // Play button
        const playButton = document.getElementById('playButton');
        if (playButton) {
            playButton.addEventListener('click', () => {
                if (this.isPlaying) {
                    this.pause();
                } else {
                    this.play();
                }
            });
        }
        
        // Stop button
        const stopButton = document.getElementById('stopButton');
        if (stopButton) {
            stopButton.addEventListener('click', () => this.stop());
        }
        
        // BPM control
        const bpmInput = document.getElementById('bpmInput');
        if (bpmInput) {
            bpmInput.addEventListener('change', (e) => {
                this.config.bpm = parseFloat(e.target.value) || 120;
                if (this.isPlaying) {
                    this.stop();
                    this.play();
                }
            });
        }
    }
    
    setupSequencerControls() {
        // Scale and key selects
        const scaleSelect = document.getElementById('scaleSelect');
        if (scaleSelect) {
            scaleSelect.addEventListener('change', (e) => {
                this.config.currentScale = e.target.value;
                this.renderSequencers();
            });
        }
        
        const keySelect = document.getElementById('keySelect');
        if (keySelect) {
            keySelect.addEventListener('change', (e) => {
                this.config.currentKey = e.target.value;
                this.renderSequencers();
            });
        }
        
        // Transpose controls
        const transposeUp = document.getElementById('transposeUp');
        if (transposeUp) {
            transposeUp.addEventListener('click', () => this.transpose(1));
        }
        
        const transposeDown = document.getElementById('transposeDown');
        if (transposeDown) {
            transposeDown.addEventListener('click', () => this.transpose(-1));
        }
        
        // Pattern length controls
        const melodyLengthSelect = document.getElementById('melodyPatternLengthSelect');
        if (melodyLengthSelect) {
            melodyLengthSelect.addEventListener('change', (e) => {
                this.updatePatternLength('melody', parseInt(e.target.value));
            });
        }
        
        const drumLengthSelect = document.getElementById('drumPatternLengthSelect');
        if (drumLengthSelect) {
            drumLengthSelect.addEventListener('change', (e) => {
                this.updatePatternLength('drum', parseInt(e.target.value));
            });
        }
        
        // Drum kit select
        const drumKitSelect = document.getElementById('drumKitSelect');
        if (drumKitSelect) {
            drumKitSelect.addEventListener('change', (e) => {
                this.config.drumKit = e.target.value;
                this.updateKeyScaleLabel();
            });
        }
    }
    
    setupPatternControls() {
        // Clear buttons
        document.getElementById('clearMelodyButton')?.addEventListener('click', () => this.clearMelody());
        document.getElementById('clearDrumButton')?.addEventListener('click', () => this.clearDrums());
        document.getElementById('clearAllButton')?.addEventListener('click', () => this.clearAll());
        
        // Pattern buttons
        document.getElementById('saveMelodyButton')?.addEventListener('click', () => this.savePattern('melody'));
        document.getElementById('saveDrumButton')?.addEventListener('click', () => this.savePattern('drum'));
        
        document.getElementById('randomizeMelodyButton')?.addEventListener('click', () => this.randomizePattern('melody'));
        document.getElementById('randomizeDrumButton')?.addEventListener('click', () => this.randomizePattern('drum'));
        
        document.getElementById('variationMelodyButton')?.addEventListener('click', () => this.createVariation('melody'));
        document.getElementById('variationDrumButton')?.addEventListener('click', () => this.createVariation('drum'));
        
        // Chain controls
        document.getElementById('playChainButton')?.addEventListener('click', () => this.playChain());
        document.getElementById('clearChainButton')?.addEventListener('click', () => this.clearChain());
        
        // Export/Import
        document.getElementById('exportCurrentButton')?.addEventListener('click', () => this.exportCurrent());
        document.getElementById('exportChainButton')?.addEventListener('click', () => this.exportChain());
        
        const importButton = document.getElementById('importButton');
        const importInput = document.getElementById('importFileInput');
        if (importButton && importInput) {
            importButton.addEventListener('click', () => importInput.click());
            importInput.addEventListener('change', (e) => this.importPattern(e.target.files[0]));
        }
        
        // Quantize
        document.getElementById('quantizeButton')?.addEventListener('click', () => this.quantizePattern());
        document.getElementById('quantizeSelect')?.addEventListener('change', (e) => {
            this.quantizeValue = parseInt(e.target.value);
        });
        
        // Sync patterns
        document.getElementById('syncPatternsButton')?.addEventListener('click', () => this.syncPatternLengths());
        
        // Swing
        document.getElementById('swingSlider')?.addEventListener('input', (e) => {
            this.config.swing = parseInt(e.target.value);
            document.getElementById('swingValue').textContent = this.config.swing;
        });
    }
    
    setupAudioControls() {
        // Waveform
        document.getElementById('soundProfile')?.addEventListener('change', (e) => {
            this.config.synthesis.waveform = e.target.value;
        });
        
        // FM Synthesis
        document.getElementById('fmSynthToggle')?.addEventListener('change', (e) => {
            this.config.synthesis.fm.enabled = e.target.checked;
        });
        
        // Volume controls
        this.setupVolumeControls();
        
        // Effect controls
        this.setupEffectControls();
        
        // Synthesis parameter controls
        this.setupSynthesisControls();
    }
    
    setupUIControls() {
        // Panel toggles
        document.querySelectorAll('.toggle-panel').forEach(button => {
            button.addEventListener('click', () => {
                const targetId = button.getAttribute('data-target');
                const target = document.getElementById(targetId);
                if (target) {
                    target.classList.toggle('collapsed');
                    button.classList.toggle('collapsed');
                }
            });
        });
        
        // Tab controls
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                // Remove active from all tabs
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                // Add active to clicked tab
                button.classList.add('active');
                const tabId = button.getAttribute('data-tab');
                document.getElementById(tabId)?.classList.add('active');
            });
        });
    }
    
    // Playback methods
    play() {
        if (!this.audioContext) {
            this.initializeAudio();
            if (!this.audioContext) return;
        }
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        if (!this.isPlaying) {
            this.isPlaying = true;
            this.currentStep = 0;
            
            const stepTime = 60000 / this.config.bpm / 4; // 16th notes
            this.stepInterval = setInterval(() => this.step(), stepTime);
            
            document.getElementById('playButton')?.classList.add('active');
        }
    }
    
    pause() {
        if (this.isPlaying) {
            clearInterval(this.stepInterval);
            this.isPlaying = false;
            document.getElementById('playButton')?.classList.remove('active');
        }
    }
    
    stop() {
        this.pause();
        this.currentStep = 0;
        this.updateStepHighlight();
    }
    
    step() {
        // Clear previous highlights
        document.querySelectorAll('.cell.current').forEach(cell => {
            cell.classList.remove('current');
        });
        
        // Play sounds for current step
        this.playMelodyStep();
        this.playDrumStep();
        
        // Highlight current step
        this.updateStepHighlight();
        
        // Advance step with proper bounds checking
        const maxSteps = Math.max(this.config.melodySteps, this.config.drumSteps);
        this.currentStep = (this.currentStep + 1) % maxSteps;
        
        // Handle pattern chaining
        if (this.currentStep === 0 && this.chainedPatterns.length > 0) {
            this.loadNextChainedPattern();
        }
    }
    
    playMelodyStep() {
        const step = this.currentStep % this.config.melodySteps;
        
        for (let row = 0; row < this.config.sequencerRows.melody; row++) {
            if (this.melodyGrid[row][step]) {
                const frequency = this.noteToFrequency(row);
                this.playNote(frequency);
            }
        }
    }
    
    playDrumStep() {
        const step = this.currentStep % this.config.drumSteps;
        
        for (let row = 0; row < this.config.sequencerRows.drum; row++) {
            if (this.drumGrid[row][step]) {
                this.playDrum(row);
            }
        }
    }
    
    updateStepHighlight() {
        // Highlight melody cells
        const melodyStep = this.currentStep % this.config.melodySteps;
        document.querySelectorAll(`#melodySequencer .cell[data-col="${melodyStep}"]`).forEach(cell => {
            cell.classList.add('current');
        });
        
        // Highlight drum cells
        const drumStep = this.currentStep % this.config.drumSteps;
        document.querySelectorAll(`#drumSequencer .cell[data-col="${drumStep}"]`).forEach(cell => {
            cell.classList.add('current');
        });
    }
    
    // Note/frequency calculations
    noteToFrequency(row) {
        const scale = this.config.scales[this.config.currentScale];
        const keyIndex = this.config.keys.indexOf(this.config.currentKey);
        
        const octave = Math.floor(row / scale.length) + 4 + this.melodyTranspose;
        const noteInScale = row % scale.length;
        const semitone = keyIndex + scale[noteInScale] + (octave - 4) * 12;
        
        return 440 * Math.pow(2, (semitone - 9) / 12); // A4 = 440Hz
    }
    
    // Play methods
    playNote(frequency) {
        if (!this.audioContext || !this.effectsChainInput) return;
        
        const now = this.audioContext.currentTime;
        const envelope = this.config.synthesis.envelope;
        
        // Create oscillator based on synthesis mode
        let source;
        if (this.config.synthesis.fm.enabled) {
            source = this.createFMOscillator(frequency);
        } else {
            source = this.createSimpleOscillator(frequency);
        }
        
        // Create envelope
        const gainNode = this.audioContext.createGain();
        source.connect(gainNode);
        gainNode.connect(this.effectsChainInput);
        
        // Apply ADSR envelope
        const attackTime = envelope.attack / 1000;
        const decayTime = envelope.decay / 1000;
        const sustainLevel = envelope.sustain / 100;
        const releaseTime = envelope.release / 1000;
        const volume = this.config.volumes.melody;
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + attackTime);
        gainNode.gain.linearRampToValueAtTime(volume * sustainLevel, now + attackTime + decayTime);
        gainNode.gain.setValueAtTime(volume * sustainLevel, now + attackTime + decayTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, now + attackTime + decayTime + 0.1 + releaseTime);
        
        // Start and stop
        source.start(now);
        source.stop(now + attackTime + decayTime + 0.1 + releaseTime);
        
        // Track for cleanup
        this.activeOscillators.add(source);
        source.onended = () => this.activeOscillators.delete(source);
    }
    
    createSimpleOscillator(frequency) {
        const osc = this.audioContext.createOscillator();
        osc.frequency.value = frequency;
        osc.type = this.config.synthesis.waveform;
        return osc;
    }
    
    createFMOscillator(frequency) {
        const carrier = this.audioContext.createOscillator();
        const modulator = this.audioContext.createOscillator();
        const modulatorGain = this.audioContext.createGain();
        
        carrier.frequency.value = frequency;
        carrier.type = this.config.synthesis.fm.carrierWaveform;
        
        modulator.frequency.value = frequency * this.config.synthesis.fm.modulationRatio;
        modulator.type = this.config.synthesis.fm.modulatorWaveform;
        
        modulatorGain.gain.value = this.config.synthesis.fm.modulationIndex * 10;
        
        modulator.connect(modulatorGain);
        modulatorGain.connect(carrier.frequency);
        modulator.start();
        
        return carrier;
    }
    
    playDrum(drumIndex) {
        if (!this.audioContext || !this.effectsChainInput) return;
        
        const drumType = this.config.drumTypes[drumIndex];
        const now = this.audioContext.currentTime;
        
        switch (drumType) {
            case 'Kick':
                this.playKick(now);
                break;
            case 'Snare':
                this.playSnare(now);
                break;
            case 'Closed Hi-hat':
                this.playHiHat(now, false);
                break;
            case 'Open Hi-hat':
                this.playHiHat(now, true);
                break;
            case 'Tom':
                this.playTom(now);
                break;
            case 'Cymbal':
                this.playCymbal(now);
                break;
            case '808 Bass':
                this.play808Bass(now);
                break;
            case 'Clap':
                this.playClap(now);
                break;
        }
    }
    
    playKick(time) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(50, time + 0.1);
        
        gain.gain.setValueAtTime(this.config.volumes.kick, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
        
        osc.connect(gain);
        gain.connect(this.effectsChainInput);
        
        osc.start(time);
        osc.stop(time + 0.5);
    }
    
    playSnare(time) {
        // Tone component
        const osc = this.audioContext.createOscillator();
        const oscGain = this.audioContext.createGain();
        
        osc.type = 'triangle';
        osc.frequency.value = 200;
        
        oscGain.gain.setValueAtTime(this.config.volumes.snare * 0.5, time);
        oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        
        // Noise component
        const noise = this.createNoise();
        const noiseGain = this.audioContext.createGain();
        const noiseFilter = this.audioContext.createBiquadFilter();
        
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;
        
        noiseGain.gain.setValueAtTime(this.config.volumes.snare, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        
        // Connect
        osc.connect(oscGain);
        oscGain.connect(this.effectsChainInput);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.effectsChainInput);
        
        // Play
        osc.start(time);
        osc.stop(time + 0.2);
        noise.start(time);
        noise.stop(time + 0.2);
    }
    
    playHiHat(time, open) {
        const noise = this.createNoise();
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        filter.type = 'highpass';
        filter.frequency.value = open ? 5000 : 8000;
        
        const volume = open ? this.config.volumes.openhat : this.config.volumes.hihat;
        const duration = open ? 0.3 : 0.1;
        
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.effectsChainInput);
        
        noise.start(time);
        noise.stop(time + duration);
    }
    
    createNoise() {
        const bufferSize = this.audioContext.sampleRate * 0.5;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        return noise;
    }
    
    // Pattern methods
    clearMelody() {
        this.melodyGrid = this.melodyGrid.map(row => row.map(() => false));
        this.renderSequencers();
    }
    
    clearDrums() {
        this.drumGrid = this.drumGrid.map(row => row.map(() => false));
        this.renderSequencers();
    }
    
    clearAll() {
        this.clearMelody();
        this.clearDrums();
    }
    
    randomizePattern(type) {
        if (type === 'melody') {
            const density = 0.2; // 20% chance of note
            this.melodyGrid = this.melodyGrid.map(row => 
                row.map(() => Math.random() < density)
            );
        } else {
            const density = 0.3; // 30% chance for drums
            this.drumGrid = this.drumGrid.map(row => 
                row.map(() => Math.random() < density)
            );
        }
        this.renderSequencers();
    }
    
    createVariation(type) {
        const variationAmount = 0.2; // 20% chance to flip each cell
        
        if (type === 'melody') {
            this.melodyGrid = this.melodyGrid.map(row => 
                row.map(cell => Math.random() < variationAmount ? !cell : cell)
            );
        } else {
            this.drumGrid = this.drumGrid.map(row => 
                row.map(cell => Math.random() < variationAmount ? !cell : cell)
            );
        }
        this.renderSequencers();
    }
    
    transpose(octaves) {
        this.melodyTranspose = Math.max(-2, Math.min(2, this.melodyTranspose + octaves));
        document.getElementById('transposeValue').textContent = 
            this.melodyTranspose > 0 ? `+${this.melodyTranspose}` : this.melodyTranspose;
        this.renderSequencers();
    }
    
    updatePatternLength(type, newLength) {
        if (type === 'melody') {
            const oldLength = this.config.melodySteps;
            this.config.melodySteps = newLength;
            
            // Resize grid
            this.melodyGrid = this.melodyGrid.map(row => {
                const newRow = Array(newLength).fill(false);
                for (let i = 0; i < Math.min(oldLength, newLength); i++) {
                    newRow[i] = row[i] || false;
                }
                return newRow;
            });
        } else {
            const oldLength = this.config.drumSteps;
            this.config.drumSteps = newLength;
            
            // Resize grid
            this.drumGrid = this.drumGrid.map(row => {
                const newRow = Array(newLength).fill(false);
                for (let i = 0; i < Math.min(oldLength, newLength); i++) {
                    newRow[i] = row[i] || false;
                }
                return newRow;
            });
        }
        
        // Adjust current step if needed
        const maxSteps = Math.max(this.config.melodySteps, this.config.drumSteps);
        if (this.currentStep >= maxSteps) {
            this.currentStep = 0;
        }
        
        this.renderSequencers();
    }
    
    syncPatternLengths() {
        const syncLength = this.config.melodySteps;
        this.updatePatternLength('drum', syncLength);
        document.getElementById('drumPatternLengthSelect').value = syncLength;
    }
    
    // Placeholder methods for features to be implemented
    savePattern(type) {
        console.log(`Saving ${type} pattern...`);
        // TODO: Implement pattern saving
    }
    
    quantizePattern() {
        console.log('Quantizing pattern...');
        // TODO: Implement quantization
    }
    
    playChain() {
        console.log('Playing pattern chain...');
        // TODO: Implement chain playback
    }
    
    clearChain() {
        this.chainedPatterns = [];
        this.updatePatternDisplay();
    }
    
    exportCurrent() {
        console.log('Exporting current pattern...');
        // TODO: Implement export
    }
    
    exportChain() {
        console.log('Exporting pattern chain...');
        // TODO: Implement chain export
    }
    
    importPattern(file) {
        console.log('Importing pattern:', file);
        // TODO: Implement import
    }
    
    updatePatternDisplay() {
        // TODO: Update pattern display UI
    }
    
    // Volume control setup
    setupVolumeControls() {
        // Melody volume
        const melodySlider = document.getElementById('melodyVolumeSlider');
        if (melodySlider) {
            melodySlider.addEventListener('input', (e) => {
                this.config.volumes.melody = parseInt(e.target.value) / 100;
                document.getElementById('melodyVolumeValue').textContent = e.target.value;
            });
        }
        
        // Drum volumes
        ['kick', 'snare', 'hihat', 'openhat', 'tom', 'cymbal', 'bass808'].forEach(drum => {
            const slider = document.getElementById(`${drum}VolumeSlider`);
            if (slider) {
                slider.addEventListener('input', (e) => {
                    this.config.volumes[drum] = parseInt(e.target.value) / 100;
                    document.getElementById(`${drum}VolumeValue`).textContent = e.target.value;
                });
            }
        });
    }
    
    // Effect control setup
    setupEffectControls() {
        // Delay controls
        this.setupDelayControls();
        
        // Distortion controls
        this.setupDistortionControls();
        
        // Reverb controls
        this.setupReverbControls();
        
        // Compressor controls
        this.setupCompressorControls();
    }
    
    setupDelayControls() {
        const toggle = document.getElementById('delayToggle');
        if (toggle) {
            toggle.addEventListener('change', (e) => {
                this.config.effects.delay.enabled = e.target.checked;
                this.updateDelayEffect();
            });
        }
        
        const timeSlider = document.getElementById('delayTimeSlider');
        if (timeSlider) {
            timeSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.config.effects.delay.time = value / 1000;
                document.getElementById('delayTimeValue').textContent = value;
                if (this.delay) {
                    this.delay.delayNode.delayTime.value = this.config.effects.delay.time;
                }
            });
        }
        
        const feedbackSlider = document.getElementById('delayFeedbackSlider');
        if (feedbackSlider) {
            feedbackSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.config.effects.delay.feedback = value / 100;
                document.getElementById('delayFeedbackValue').textContent = value;
                if (this.delay) {
                    this.delay.feedbackGain.gain.value = this.config.effects.delay.feedback;
                }
            });
        }
        
        const mixSlider = document.getElementById('delayMixSlider');
        if (mixSlider) {
            mixSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.config.effects.delay.mix = value / 100;
                document.getElementById('delayMixValue').textContent = value;
                this.updateDelayEffect();
            });
        }
    }
    
    updateDelayEffect() {
        if (!this.delay) return;
        
        const enabled = this.config.effects.delay.enabled;
        const mix = this.config.effects.delay.mix;
        
        this.delay.wetGain.gain.value = enabled ? mix : 0;
        this.delay.dryGain.gain.value = enabled ? (1 - mix) : 1;
    }
    
    // Additional drum sounds
    playTom(time) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.frequency.setValueAtTime(100, time);
        osc.frequency.exponentialRampToValueAtTime(80, time + 0.1);
        
        gain.gain.setValueAtTime(this.config.volumes.tom, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
        
        osc.connect(gain);
        gain.connect(this.effectsChainInput);
        
        osc.start(time);
        osc.stop(time + 0.3);
    }
    
    playCymbal(time) {
        const noise = this.createNoise();
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        filter.type = 'highpass';
        filter.frequency.value = 3000;
        filter.Q.value = 0.5;
        
        gain.gain.setValueAtTime(this.config.volumes.cymbal, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 2);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.effectsChainInput);
        
        noise.start(time);
        noise.stop(time + 2);
    }
    
    play808Bass(time) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.5);
        
        gain.gain.setValueAtTime(this.config.volumes.bass808, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 1);
        
        osc.connect(gain);
        gain.connect(this.effectsChainInput);
        
        osc.start(time);
        osc.stop(time + 1);
    }
    
    playClap(time) {
        // Multiple short bursts of filtered noise
        for (let i = 0; i < 3; i++) {
            const noise = this.createNoise();
            const gain = this.audioContext.createGain();
            const filter = this.audioContext.createBiquadFilter();
            
            filter.type = 'bandpass';
            filter.frequency.value = 1500;
            filter.Q.value = 1;
            
            const startTime = time + i * 0.01;
            gain.gain.setValueAtTime(this.config.volumes.clap * 0.5, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.02);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.effectsChainInput);
            
            noise.start(startTime);
            noise.stop(startTime + 0.02);
        }
    }
    
    // Cleanup method
    cleanup() {
        // Stop playback
        this.stop();
        
        // Stop all active oscillators
        this.activeOscillators.forEach(osc => {
            try {
                osc.stop();
            } catch (e) {
                // Already stopped
            }
        });
        this.activeOscillators.clear();
        
        // Close audio context
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new Synthograsizer();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.cleanup();
    }
});