// Copied from SynthograsizerDAW/script.js
        // Drum kit selection
        document.getElementById('drumKitSelect').addEventListener('change', (e) => {
            this.config.drumKit = e.target.value;
            // Re-render drum labels to show kit name
            this.renderSequencers();
        });/**
 * Synthograsizer - Advanced Grid Sequencer
 * A modular Web Audio API based sequencer
 */

// Main application class
class Synthograsizer {
    constructor() {
        this.initAudioContext();
        this.initializeModules(); // Move this before setupAudioNodes
        this.setupAudioNodes();
        this.setupEventListeners();
        this.renderUI();
    }

    // Initialize Web Audio API context
    initAudioContext() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.isPlaying = false;
        this.currentStep = 0;
        this.stepInterval = null;
    }

    // Setup audio processing nodes
    setupAudioNodes() {
        // Master gain
        this.masterGainNode = this.audioContext.createGain();
        
        // Effects
        this.setupEffects();
        
        // Create analyzer for visualization
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        
        // Connect main audio path
        this.masterGainNode.connect(this.compressor);
        this.compressor.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
    }

    // Setup audio effects
    setupEffects() {
        // Create dry/wet mix nodes for each effect
        this.createEffectMixNodes();
        
        // Delay effect
        this.delayNode = this.audioContext.createDelay(2); // 2 seconds max delay
        this.delayFeedback = this.audioContext.createGain();
        this.delayFilter = this.audioContext.createBiquadFilter();
        this.delayGain = this.audioContext.createGain(); // Mix control
        
        this.delayNode.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayFilter);
        this.delayFilter.connect(this.delayNode);
        this.delayNode.connect(this.delayGain);
        this.delayGain.connect(this.masterGainNode);
        
        // Initial delay settings
        this.delayGain.gain.value = this.config.effects.delay.mix / 100;

        // Compressor
        this.compressor = this.audioContext.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-24, this.audioContext.currentTime);
        this.compressor.knee.setValueAtTime(30, this.audioContext.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.audioContext.currentTime);
        this.compressor.release.setValueAtTime(0.25, this.audioContext.currentTime);
        
        // Distortion
        this.distortion = this.audioContext.createWaveShaper();
        this.distortionGain = this.audioContext.createGain(); // Mix control
        this.distortion.connect(this.distortionGain);
        this.distortionGain.connect(this.masterGainNode);
        this.distortionGain.gain.value = 0; // Start disabled
        
        // Create distortion curve
        this.createDistortionCurve(this.config.effects.distortion.amount);
        
        // Reverb (using convolver node)
        this.reverbNode = this.audioContext.createConvolver();
        this.reverbGain = this.audioContext.createGain(); // Mix control
        this.reverbNode.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGainNode);
        this.reverbGain.gain.value = 0; // Start disabled
        
        // Create reverb impulse response
        this.createReverbImpulseResponse(this.config.effects.reverb.size);
        
        // Create LFO
        this.setupLFO();
    }
    
    // Create a mix system for effects
    createEffectMixNodes() {
        // Dry signal (no effects)
        this.dryGain = this.audioContext.createGain();
        
        // Effect send gain nodes
        this.delaySend = this.audioContext.createGain();
        this.distortionSend = this.audioContext.createGain();
        this.reverbSend = this.audioContext.createGain();
        
        // Set initial levels
        this.dryGain.gain.value = 1;
        this.delaySend.gain.value = 0;
        this.distortionSend.gain.value = 0;
        this.reverbSend.gain.value = 0;
    }
    
    // Setup LFO 
    setupLFO() {
        this.lfo = this.audioContext.createOscillator();
        this.lfoGain = this.audioContext.createGain();
        
        // Set initial LFO values
        this.lfo.frequency.value = this.config.synthesis.lfo.rate;
        this.lfo.type = this.config.synthesis.lfo.waveform;
        this.lfoGain.gain.value = 0; // Start with 0 amount
        
        // Start the LFO (it will run continuously)
        this.lfo.connect(this.lfoGain);
        this.lfo.start();
    }
    
    // Create distortion curve
    createDistortionCurve(amount) {
        amount = Math.max(0, Math.min(1, amount / 100)); // Normalize 0-1
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < samples; ++i) {
            const x = (i * 2) / samples - 1;
            curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
        }
        
        this.distortion.curve = curve;
        this.distortion.oversample = '4x';
    }
    
    // Create reverb impulse response
    createReverbImpulseResponse(size) {
        // Normalized size parameter (0-1)
        size = Math.max(0, Math.min(1, size / 100));
        
        // Calculate reverb parameters
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * (0.5 + size * 3.0); // 0.5-3.5 seconds
        const decay = 0.5 + size * 5.0; // Decay multiplier
        
        // Create impulse response buffer
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        
        // Fill buffer with noise and apply decay
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            
            for (let i = 0; i < length; i++) {
                // Random noise between -1 and 1
                const noise = Math.random() * 2 - 1;
                
                // Apply decay curve
                channelData[i] = noise * Math.pow(1 - i / length, decay);
            }
        }
        
        // Set the impulse response
        this.reverbNode.buffer = impulse;
    }

    // Initialize all modules
    initializeModules() {
        // Config and defaults
        this.config = {
            stepsPerBeat: 4,
            beatsPerBar: 4,
            totalSteps: 16,
            sequencerRows: {
                melody: 8,
                drums: 7  // Updated for 7 drum types
            },
            scales: {
                major: [0, 2, 4, 5, 7, 9, 11],
                minor: [0, 2, 3, 5, 7, 8, 10],
                pentatonic: [0, 2, 4, 7, 9],
                blues: [0, 3, 5, 6, 7, 10]
            },
            keys: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
            drumTypes: ['Kick', 'Snare', 'Closed Hi-hat', 'Open Hi-hat', 'Tom', 'Cymbal', '808 Bass'],
            drumKit: 'default', // Current drum kit: default, analog, digital
            synthesis: {
                // FM Synthesis defaults
                fm: {
                    enabled: false,
                    carrierWaveform: 'sine',
                    modulatorWaveform: 'sine',
                    modulationIndex: 0,
                    modulationRatio: 1
                },
                // ADSR envelope defaults
                envelope: {
                    attack: 10,  // ms
                    decay: 50,   // ms
                    sustain: 50, // % of max amplitude
                    release: 100 // ms
                },
                // Filter defaults
                filter: {
                    type: 'lowpass',
                    frequency: 1000, // Hz
                    resonance: 1,    // Q value
                    envelopeAmount: 0 // % of modulation
                },
                // LFO defaults
                lfo: {
                    enabled: false,
                    waveform: 'sine',
                    rate: 1,         // Hz
                    amount: 0,       // %
                    destination: 'none'
                },
                // Voice settings
                voice: {
                    polyphony: true,  // true = polyphonic, false = monophonic
                    unison: 1,        // number of unison voices (1 = off, 2+ = on)
                    detune: 0,        // cents of detune between unison voices
                    portamento: 0     // ms of portamento (0 = off)
                }
            },
            effects: {
                delay: {
                    enabled: false,
                    time: 0,     // ms
                    feedback: 0, // %
                    mix: 50      // %
                },
                distortion: {
                    enabled: false,
                    amount: 0    // %
                },
                reverb: {
                    enabled: false,
                    size: 0,     // %
                    mix: 50      // %
                }
            },
            arpeggiator: {
                enabled: false,
                pattern: 'up',  // up, down, updown, random
                rate: 4,        // 1 = whole notes, 2 = half notes, 4 = quarter notes, etc.
                octaves: 1      // Number of octaves to span
            }
        };

        // Initialize patterns
        this.melodyGrid = Array(this.config.sequencerRows.melody).fill().map(() => 
            Array(this.config.totalSteps).fill(false));
        this.drumGrid = Array(this.config.sequencerRows.drums).fill().map(() => 
            Array(this.config.totalSteps).fill(false));
        
        // Pattern management
        this.savedPatterns = [];
        this.chainedPatterns = [];
        this.quantizeValue = 16;
    }

    // Setup all event listeners
    setupEventListeners() {
        // Transport controls
        document.getElementById('playButton').addEventListener('click', () => this.play());
        document.getElementById('stopButton').addEventListener('click', () => this.stop());
        document.getElementById('bpmInput').addEventListener('change', () => {
            if (this.isPlaying) {
                this.stop();
                this.play();
            }
        });

        // Pattern controls
        document.getElementById('saveButton').addEventListener('click', () => this.saveSequence());
        document.getElementById('clearMelodyButton').addEventListener('click', () => this.clearGrid(this.melodyGrid, document.getElementById('melodySequencer')));
        document.getElementById('clearDrumButton').addEventListener('click', () => this.clearGrid(this.drumGrid, document.getElementById('drumSequencer')));
        document.getElementById('clearAllButton').addEventListener('click', () => {
            this.clearGrid(this.melodyGrid, document.getElementById('melodySequencer'));
            this.clearGrid(this.drumGrid, document.getElementById('drumSequencer'));
        });
        document.getElementById('randomizeButton').addEventListener('click', () => this.randomizePattern());
        document.getElementById('variationButton').addEventListener('click', () => this.randomizeVariation());
        
        // Quantize controls
        document.getElementById('quantizeSelect').addEventListener('change', (e) => {
            this.quantizeValue = parseInt(e.target.value);
        });
        document.getElementById('quantizeButton').addEventListener('click', () => this.quantizeNotes());
        
        // Chain controls
        document.getElementById('playChainButton').addEventListener('click', () => this.playChain());
        document.getElementById('clearChainButton').addEventListener('click', () => this.clearChain());

        // Drum kit selection
        document.getElementById('drumKitSelect').addEventListener('change', (e) => {
            this.config.drumKit = e.target.value;
            // Re-render drum labels to show kit name
            this.renderSequencers();
        });

        // FM Synthesis toggle
        document.getElementById('fmSynthToggle').addEventListener('change', (e) => {
            this.config.synthesis.fm.enabled = e.target.checked;
        });

        // Effect toggles
        document.getElementById('delayToggle').addEventListener('change', (e) => {
            this.config.effects.delay.enabled = e.target.checked;
            this.updateEffects();
        });
        
        document.getElementById('distortionToggle').addEventListener('change', (e) => {
            this.config.effects.distortion.enabled = e.target.checked;
            this.updateEffects();
        });
        
        document.getElementById('reverbToggle').addEventListener('change', (e) => {
            this.config.effects.reverb.enabled = e.target.checked;
            this.updateEffects();
        });

        // Panel toggle listeners
        document.querySelectorAll('.toggle-panel').forEach(button => {
            button.addEventListener('click', (e) => {
                const targetId = e.target.getAttribute('data-target');
                const targetPanel = document.getElementById(targetId);
                
                targetPanel.classList.toggle('collapsed');
                button.classList.toggle('collapsed');
            });
        });

        // Synthesis tabs - Enhanced to ensure proper tab switching
        const tabButtons = document.querySelectorAll('.tab-button');
        
        // Make sure we have tab buttons
        if (tabButtons.length > 0) {
            tabButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault(); // Prevent default button action
                    
                    // Remove active class from all tabs
                    document.querySelectorAll('.tab-button').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    document.querySelectorAll('.tab-content').forEach(content => {
                        content.classList.remove('active');
                    });
                    
                    // Set active tab
                    button.classList.add('active');
                    const tabId = button.getAttribute('data-tab');
                    const tabContent = document.getElementById(tabId);
                    
                    if (tabContent) {
                        tabContent.classList.add('active');
                        console.log('Activated tab:', tabId);
                    } else {
                        console.error('Tab content not found:', tabId);
                    }
                });
            });
            
            // Set initial tab state
            const activeTab = document.querySelector('.tab-button.active');
            if (activeTab) {
                const tabId = activeTab.getAttribute('data-tab');
                const tabContent = document.getElementById(tabId);
                if (tabContent) {
                    tabContent.classList.add('active');
                }
            }
        } else {
            console.error('No tab buttons found');
        }

        // FM Synthesis controls
        document.getElementById('carrierWaveform').addEventListener('change', (e) => {
            this.config.synthesis.fm.carrierWaveform = e.target.value;
        });
        document.getElementById('modulatorWaveform').addEventListener('change', (e) => {
            this.config.synthesis.fm.modulatorWaveform = e.target.value;
        });
        document.getElementById('modulationIndexSlider').addEventListener('input', (e) => {
            this.config.synthesis.fm.modulationIndex = parseInt(e.target.value);
            document.getElementById('modulationIndexValue').textContent = e.target.value;
        });
        document.getElementById('modulationRatioSlider').addEventListener('input', (e) => {
            this.config.synthesis.fm.modulationRatio = parseFloat(e.target.value);
            document.getElementById('modulationRatioValue').textContent = e.target.value;
        });

        // ADSR Envelope controls
        document.getElementById('attackSlider').addEventListener('input', (e) => {
            this.config.synthesis.envelope.attack = parseInt(e.target.value);
            document.getElementById('attackValue').textContent = e.target.value;
        });
        document.getElementById('decaySlider').addEventListener('input', (e) => {
            this.config.synthesis.envelope.decay = parseInt(e.target.value);
            document.getElementById('decayValue').textContent = e.target.value;
        });
        document.getElementById('sustainSlider').addEventListener('input', (e) => {
            this.config.synthesis.envelope.sustain = parseInt(e.target.value);
            document.getElementById('sustainValue').textContent = e.target.value;
        });
        document.getElementById('releaseSlider').addEventListener('input', (e) => {
            this.config.synthesis.envelope.release = parseInt(e.target.value);
            document.getElementById('releaseValue').textContent = e.target.value;
        });

        // Filter controls
        document.getElementById('filterTypeSelect').addEventListener('change', (e) => {
            this.config.synthesis.filter.type = e.target.value;
        });
        document.getElementById('filterFreqSlider').addEventListener('input', (e) => {
            this.config.synthesis.filter.frequency = parseInt(e.target.value);
            document.getElementById('filterFreqValue').textContent = e.target.value;
        });
        document.getElementById('filterQSlider').addEventListener('input', (e) => {
            this.config.synthesis.filter.resonance = parseFloat(e.target.value);
            document.getElementById('filterQValue').textContent = e.target.value;
        });
        document.getElementById('filterEnvSlider').addEventListener('input', (e) => {
            this.config.synthesis.filter.envelopeAmount = parseInt(e.target.value);
            document.getElementById('filterEnvValue').textContent = e.target.value;
        });

        // Setup slider listeners
        this.setupSliderListeners();
        
        // Voice settings
        document.getElementById('polyphonyToggle').addEventListener('change', (e) => {
            this.config.synthesis.voice.polyphony = e.target.checked;
        });
        
        document.getElementById('unisonSelect').addEventListener('change', (e) => {
            this.config.synthesis.voice.unison = parseInt(e.target.value);
        });
        
        document.getElementById('detuneSlider').addEventListener('input', (e) => {
            this.config.synthesis.voice.detune = parseInt(e.target.value);
            document.getElementById('detuneValue').textContent = e.target.value;
        });
        
        document.getElementById('portamentoSlider').addEventListener('input', (e) => {
            this.config.synthesis.voice.portamento = parseInt(e.target.value);
            document.getElementById('portamentoValue').textContent = e.target.value;
        });
        
        // Arpeggiator controls
        document.getElementById('arpToggle').addEventListener('change', (e) => {
            this.config.arpeggiator.enabled = e.target.checked;
        });
        
        document.getElementById('arpPatternSelect').addEventListener('change', (e) => {
            this.config.arpeggiator.pattern = e.target.value;
        });
        
        document.getElementById('arpRateSelect').addEventListener('change', (e) => {
            this.config.arpeggiator.rate = parseInt(e.target.value);
        });
        
        document.getElementById('arpOctaveSlider').addEventListener('input', (e) => {
            this.config.arpeggiator.octaves = parseInt(e.target.value);
            document.getElementById('arpOctaveValue').textContent = e.target.value;
        });
        
        // Pattern length
        document.getElementById('patternLengthSelect').addEventListener('change', (e) => {
            this.changePatternLength(parseInt(e.target.value));
        });
    }

    // Setup all slider control listeners
    setupSliderListeners() {
        const sliders = [
            // Sequencer controls
            'swingSlider', 'melodyVolumeSlider', 'kickVolumeSlider', 'snareVolumeSlider', 
            'hihatVolumeSlider', 
            
            // Delay effect
            'delayTimeSlider', 'delayFeedbackSlider', 'delayMixSlider',
            
            // Compressor
            'compressorThresholdSlider', 'compressorRatioSlider', 
            'compressorAttackSlider', 'compressorReleaseSlider',
            
            // Distortion
            'distortionAmountSlider',
            
            // Reverb
            'reverbSizeSlider', 'reverbMixSlider',
            
            // LFO
            'lfoRateSlider', 'lfoAmountSlider'
        ];

        sliders.forEach(sliderId => {
            const slider = document.getElementById(sliderId);
            if (slider) {
                slider.addEventListener('input', () => this.updateSliderValues());
            }
        });
        
        // Effect toggle switches
        document.getElementById('distortionToggle').addEventListener('change', (e) => {
            this.config.effects.distortion.enabled = e.target.checked;
            this.updateEffects();
        });
        
        document.getElementById('reverbToggle').addEventListener('change', (e) => {
            this.config.effects.reverb.enabled = e.target.checked;
            this.updateEffects();
        });
        
        // LFO controls
        document.getElementById('lfoWaveform').addEventListener('change', (e) => {
            this.config.synthesis.lfo.waveform = e.target.value;
            this.lfo.type = e.target.value;
        });
        
        document.getElementById('lfoDestination').addEventListener('change', (e) => {
            this.config.synthesis.lfo.destination = e.target.value;
            this.updateLfoRouting();
        });
    }

    // Render UI elements
    renderUI() {
        this.renderSequencers();
        this.populateKeySelect();
        this.updateSliderValues();
        this.drawVisualizer();
        this.updateSynthesisUIValues();
    }

    // Create sequencer grids
    renderSequencers() {
        const melodySequencer = document.getElementById('melodySequencer');
        const drumSequencer = document.getElementById('drumSequencer');
        const melodyLabels = document.getElementById('melodyLabels');
        const drumLabels = document.getElementById('drumLabels');

        melodySequencer.innerHTML = '';
        drumSequencer.innerHTML = '';
        melodyLabels.innerHTML = '';
        drumLabels.innerHTML = '';

        // Create melody grid
        for (let i = 0; i < this.config.sequencerRows.melody; i++) {
            // Create note label
            const label = document.createElement('div');
            label.className = 'note-label';
            label.textContent = this.getNoteLabel(i);
            melodyLabels.appendChild(label);

            for (let j = 0; j < this.config.totalSteps; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.addEventListener('click', () => this.toggleCell(this.melodyGrid, cell, i, j));
                // Restore active state from grid
                if (this.melodyGrid && this.melodyGrid[i] && this.melodyGrid[i][j]) {
                    cell.classList.add('active');
                }
                melodySequencer.appendChild(cell);
            }
        }

        // Create drum grid
        for (let i = 0; i < this.config.sequencerRows.drums; i++) {
            // Create drum label
            const label = document.createElement('div');
            label.className = 'note-label';
            label.textContent = this.config.drumTypes[i];
            drumLabels.appendChild(label);

            for (let j = 0; j < this.config.totalSteps; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell drum-cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.addEventListener('click', () => this.toggleCell(this.drumGrid, cell, i, j));
                // Restore active state from grid
                if (this.drumGrid && this.drumGrid[i] && this.drumGrid[i][j]) {
                    cell.classList.add('active');
                }
                drumSequencer.appendChild(cell);
            }
        }
    }

    // Update synthesis UI values
    updateSynthesisUIValues() {
        // Update FM synthesis controls
        document.getElementById('carrierWaveform').value = this.config.synthesis.fm.carrierWaveform;
        document.getElementById('modulatorWaveform').value = this.config.synthesis.fm.modulatorWaveform;
        document.getElementById('modulationIndexSlider').value = this.config.synthesis.fm.modulationIndex;
        document.getElementById('modulationIndexValue').textContent = this.config.synthesis.fm.modulationIndex;
        document.getElementById('modulationRatioSlider').value = this.config.synthesis.fm.modulationRatio;
        document.getElementById('modulationRatioValue').textContent = this.config.synthesis.fm.modulationRatio;

        // Update ADSR envelope controls
        document.getElementById('attackSlider').value = this.config.synthesis.envelope.attack;
        document.getElementById('attackValue').textContent = this.config.synthesis.envelope.attack;
        document.getElementById('decaySlider').value = this.config.synthesis.envelope.decay;
        document.getElementById('decayValue').textContent = this.config.synthesis.envelope.decay;
        document.getElementById('sustainSlider').value = this.config.synthesis.envelope.sustain;
        document.getElementById('sustainValue').textContent = this.config.synthesis.envelope.sustain;
        document.getElementById('releaseSlider').value = this.config.synthesis.envelope.release;
        document.getElementById('releaseValue').textContent = this.config.synthesis.envelope.release;

        // Update filter envelope controls
        document.getElementById('filterTypeSelect').value = this.config.synthesis.filter.type;
        document.getElementById('filterFreqSlider').value = this.config.synthesis.filter.frequency;
        document.getElementById('filterFreqValue').textContent = this.config.synthesis.filter.frequency;
        document.getElementById('filterQSlider').value = this.config.synthesis.filter.resonance;
        document.getElementById('filterQValue').textContent = this.config.synthesis.filter.resonance;
        document.getElementById('filterEnvSlider').value = this.config.synthesis.filter.envelopeAmount;
        document.getElementById('filterEnvValue').textContent = this.config.synthesis.filter.envelopeAmount;
    }

    // Get note label for melody sequencer
    getNoteLabel(rowIndex) {
        const scaleType = document.getElementById('scaleSelect').value;
        const scale = this.config.scales[scaleType];
        const octave = Math.floor(rowIndex / scale.length) + 4;
        const noteIndex = scale[rowIndex % scale.length];
        const noteName = this.config.keys[(noteIndex) % this.config.keys.length];
        return `${noteName}${octave}`;
    }

    // Populate key select dropdown
    populateKeySelect() {
        const keySelect = document.getElementById('keySelect');
        keySelect.innerHTML = '';
        
        this.config.keys.forEach((key, index) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            // Set C as default
            if (key === 'C') {
                option.selected = true;
            }
            keySelect.appendChild(option);
        });
    }

    // Toggle sequencer cell
    toggleCell(grid, cell, row, col) {
        grid[row][col] = !grid[row][col];
        cell.classList.toggle('active');
    }

    // Play/stop functions
    play() {
        if (this.isPlaying) return;
        
        // Resume audio context if it's suspended (autoplay policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.isPlaying = true;
        this.currentStep = 0;
        const bpm = parseInt(document.getElementById('bpmInput').value);
        const interval = 60000 / bpm / 4; // 16th notes
        this.stepInterval = setInterval(() => this.step(), interval);
    }

    stop() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        clearInterval(this.stepInterval);
        
        // Reset visual feedback
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('current');
        });
    }

    // Sequencer step function
    step() {
        // Apply swing
        const swingAmount = parseInt(document.getElementById('swingSlider').value) / 100;
        const isSwingStep = this.currentStep % 2 === 1;
        const swingDelay = isSwingStep ? (60000 / parseInt(document.getElementById('bpmInput').value) / 4) * swingAmount : 0;

        setTimeout(() => {
            // Play melody notes
            for (let i = 0; i < this.config.sequencerRows.melody; i++) {
                if (this.melodyGrid[i][this.currentStep]) {
                    const frequency = this.noteToFrequency(i);
                    
                    // Process through arpeggiator if enabled
                    if (this.config.arpeggiator.enabled) {
                        const arpNotes = this.processArpeggiator(i);
                        const arpRate = this.config.arpeggiator.rate;
                        const noteDuration = 60000 / parseInt(document.getElementById('bpmInput').value) / arpRate;
                        
                        // Play arpeggio notes with timing
                        arpNotes.forEach((noteIndex, index) => {
                            setTimeout(() => {
                                const arpFreq = this.noteToFrequency(noteIndex);
                                // Check if FM synthesis is enabled
                                if (this.config.synthesis.fm.enabled) {
                                    this.createFMSynthOscillator(arpFreq);
                                } else {
                                    this.createOscillator(arpFreq, document.getElementById('soundProfile').value);
                                }
                            }, noteDuration * index);
                        });
                    } else {
                        // Regular playback (no arpeggiator)
                        // Check if FM synthesis is enabled
                        if (this.config.synthesis.fm.enabled) {
                            this.createFMSynthOscillator(frequency);
                        } else {
                            this.createOscillator(frequency, document.getElementById('soundProfile').value);
                        }
                    }
                }
            }

            // Play drum sounds
            for (let i = 0; i < this.config.sequencerRows.drums; i++) {
                if (this.drumGrid[i][this.currentStep]) {
                    this.playDrumSound(this.config.drumTypes[i]);
                }
            }

            // Visual feedback - highlight current step
            document.querySelectorAll('.cell').forEach(cell => {
                cell.classList.remove('current');
            });

            const currentMelodyCells = document.querySelectorAll(`#melodySequencer .cell[data-col="${this.currentStep}"]`);
            const currentDrumCells = document.querySelectorAll(`#drumSequencer .cell[data-col="${this.currentStep}"]`);
            
            currentMelodyCells.forEach(cell => cell.classList.add('current'));
            currentDrumCells.forEach(cell => cell.classList.add('current'));

            // Advance step
            this.currentStep = (this.currentStep + 1) % this.config.totalSteps;

            // Handle pattern chaining
            if (this.currentStep === 0 && this.chainedPatterns.length > 0) {
                this.loadSequence(this.chainedPatterns.shift());
                this.updateChainDisplay();
            }
        }, swingDelay);
    }

    // Process arpeggiator
    processArpeggiator(note) {
        if (!this.config.arpeggiator.enabled) {
            return [note]; // Return original note if arpeggiator is disabled
        }
        
        const pattern = this.config.arpeggiator.pattern;
        const octaves = this.config.arpeggiator.octaves;
        const notes = [];
        
        // Create a sequence of notes based on the pattern
        switch (pattern) {
            case 'up':
                for (let o = 0; o < octaves; o++) {
                    notes.push(note + (o * 12));
                }
                break;
            case 'down':
                for (let o = octaves - 1; o >= 0; o--) {
                    notes.push(note + (o * 12));
                }
                break;
            case 'updown':
                // Ascending
                for (let o = 0; o < octaves; o++) {
                    notes.push(note + (o * 12));
                }
                // Descending (skipping duplicates at turnaround)
                for (let o = octaves - 2; o > 0; o--) {
                    notes.push(note + (o * 12));
                }
                break;
            case 'random':
                // Random selection from possible octaves
                for (let i = 0; i < octaves * 2; i++) {
                    const randomOctave = Math.floor(Math.random() * octaves);
                    notes.push(note + (randomOctave * 12));
                }
                break;
        }
        
        return notes;
    }

    // Create an oscillator for melody notes
    createOscillator(frequency, type) {
        const now = this.audioContext.currentTime;
        
        // Create oscillator and nodes
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filterNode = this.audioContext.createBiquadFilter();

        // Set up oscillator
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now);
        
        // Set up filter
        filterNode.type = this.config.synthesis.filter.type;
        filterNode.frequency.value = this.config.synthesis.filter.frequency;
        filterNode.Q.value = this.config.synthesis.filter.resonance;

        // Connect audio nodes
        oscillator.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        
        // Only connect to delay if it's enabled
        if (this.config.effects.delay.enabled) {
            gainNode.connect(this.delayNode);
        }
        
        // Connect to distortion if enabled
        if (this.config.effects.distortion.enabled) {
            gainNode.connect(this.distortion);
        }
        
        // Connect to reverb if enabled
        if (this.config.effects.reverb.enabled) {
            gainNode.connect(this.reverbNode);
        }

        // Get envelope settings
        const attack = this.config.synthesis.envelope.attack / 1000; // convert to seconds
        const decay = this.config.synthesis.envelope.decay / 1000;
        const sustain = this.config.synthesis.envelope.sustain / 100; // convert to 0-1 range
        const release = this.config.synthesis.envelope.release / 1000;
        
        // Get volume
        const volume = parseFloat(document.getElementById('melodyVolumeSlider').value) / 100;

        // Apply ADSR envelope
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + attack);
        gainNode.gain.linearRampToValueAtTime(volume * sustain, now + attack + decay);
        
        // Apply filter envelope if enabled
        const filterEnvAmount = this.config.synthesis.filter.envelopeAmount / 100;
        if (filterEnvAmount > 0) {
            const baseFreq = this.config.synthesis.filter.frequency;
            const maxFreq = Math.min(baseFreq * 5, 20000); // limit to 20kHz
            
            filterNode.frequency.setValueAtTime(baseFreq, now);
            filterNode.frequency.linearRampToValueAtTime(
                baseFreq + (maxFreq - baseFreq) * filterEnvAmount, 
                now + attack
            );
            filterNode.frequency.exponentialRampToValueAtTime(
                baseFreq, 
                now + attack + decay + release
            );
        }
        
        // Handle unison voices if enabled
        if (this.config.synthesis.voice.unison > 1) {
            const unisonCount = this.config.synthesis.voice.unison;
            const detuneAmount = this.config.synthesis.voice.detune;
            
            // Create detune spread around center frequency
            for (let i = 1; i < unisonCount; i++) {
                const detuneValue = (i % 2 === 0 ? 1 : -1) * detuneAmount * Math.ceil(i / 2);
                const unisonOsc = this.audioContext.createOscillator();
                
                unisonOsc.type = type;
                unisonOsc.frequency.value = frequency;
                unisonOsc.detune.value = detuneValue;
                
                unisonOsc.connect(filterNode);
                unisonOsc.start(now);
                unisonOsc.stop(now + attack + decay + release);
            }
        }
        
        // Start and stop oscillator
        oscillator.start(now);
        oscillator.stop(now + attack + decay + release);
        
        // Release phase
        gainNode.gain.linearRampToValueAtTime(0, now + attack + decay + release);
        
        return oscillator;
    }

    // Create an FM synthesis oscillator
    createFMSynthOscillator(frequency) {
        const now = this.audioContext.currentTime;
        
        // Get FM parameters
        const carrierType = this.config.synthesis.fm.carrierWaveform;
        const modulatorType = this.config.synthesis.fm.modulatorWaveform;
        const modulationIndex = this.config.synthesis.fm.modulationIndex * 10; // scale for better range
        const modulationRatio = this.config.synthesis.fm.modulationRatio;
        
        // Create carrier oscillator
        const carrier = this.audioContext.createOscillator();
        carrier.type = carrierType;
        carrier.frequency.value = frequency;
        
        // Create modulator oscillator
        const modulator = this.audioContext.createOscillator();
        modulator.type = modulatorType;
        modulator.frequency.value = frequency * modulationRatio;
        
        // Create modulation depth gain node
        const modulationGain = this.audioContext.createGain();
        modulationGain.gain.value = modulationIndex;
        
        // Create envelope gain node
        const gainNode = this.audioContext.createGain();
        
        // Create filter node
        const filterNode = this.audioContext.createBiquadFilter();
        filterNode.type = this.config.synthesis.filter.type;
        filterNode.frequency.value = this.config.synthesis.filter.frequency;
        filterNode.Q.value = this.config.synthesis.filter.resonance;
        
        // Connect modulator to carrier frequency
        modulator.connect(modulationGain);
        modulationGain.connect(carrier.frequency);
        
        // Connect carrier to audio output through envelope and filter
        carrier.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        
        // Only connect to effects if they're enabled
        if (this.config.effects.delay.enabled) {
            gainNode.connect(this.delayNode);
        }
        
        if (this.config.effects.distortion.enabled) {
            gainNode.connect(this.distortion);
        }
        
        if (this.config.effects.reverb.enabled) {
            gainNode.connect(this.reverbNode);
        }
        
        // Get envelope settings
        const attack = this.config.synthesis.envelope.attack / 1000; // convert to seconds
        const decay = this.config.synthesis.envelope.decay / 1000;
        const sustain = this.config.synthesis.envelope.sustain / 100; // convert to 0-1 range
        const release = this.config.synthesis.envelope.release / 1000;
        
        // Get volume
        const volume = parseFloat(document.getElementById('melodyVolumeSlider').value) / 100;
        
        // Apply ADSR envelope
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + attack);
        gainNode.gain.linearRampToValueAtTime(volume * sustain, now + attack + decay);
        
        // Apply filter envelope if enabled
        const filterEnvAmount = this.config.synthesis.filter.envelopeAmount / 100;
        if (filterEnvAmount > 0) {
            const baseFreq = this.config.synthesis.filter.frequency;
            const maxFreq = Math.min(baseFreq * 5, 20000); // limit to 20kHz
            
            filterNode.frequency.setValueAtTime(baseFreq, now);
            filterNode.frequency.linearRampToValueAtTime(
                baseFreq + (maxFreq - baseFreq) * filterEnvAmount, 
                now + attack
            );
            filterNode.frequency.exponentialRampToValueAtTime(
                baseFreq, 
                now + attack + decay + release
            );
        }
        
        // Handle unison voices if enabled
        if (this.config.synthesis.voice.unison > 1) {
            const unisonCount = this.config.synthesis.voice.unison;
            const detuneAmount = this.config.synthesis.voice.detune;
            
            // Create detune spread around center frequency
            for (let i = 1; i < unisonCount; i++) {
                const detuneValue = (i % 2 === 0 ? 1 : -1) * detuneAmount * Math.ceil(i / 2);
                
                // Create detune carrier
                const unisonCarrier = this.audioContext.createOscillator();
                unisonCarrier.type = carrierType;
                unisonCarrier.frequency.value = frequency;
                unisonCarrier.detune.value = detuneValue;
                
                // Create detune modulator
                const unisonModulator = this.audioContext.createOscillator();
                unisonModulator.type = modulatorType;
                unisonModulator.frequency.value = frequency * modulationRatio;
                unisonModulator.detune.value = detuneValue;
                
                // Create modulation gain
                const unisonModGain = this.audioContext.createGain();
                unisonModGain.gain.value = modulationIndex;
                
                // Connect
                unisonModulator.connect(unisonModGain);
                unisonModGain.connect(unisonCarrier.frequency);
                unisonCarrier.connect(filterNode);
                
                // Start/stop
                unisonModulator.start(now);
                unisonCarrier.start(now);
                unisonModulator.stop(now + attack + decay + release);
                unisonCarrier.stop(now + attack + decay + release);
            }
        }
        
        // Start and stop oscillators
        modulator.start(now);
        carrier.start(now);
        
        const stopTime = now + attack + decay + release;
        modulator.stop(stopTime);
        carrier.stop(stopTime);
        
        // Release phase
        gainNode.gain.linearRampToValueAtTime(0, stopTime);
        
        return {
            carrier: carrier,
            modulator: modulator
        };
    }

    // Play drum sound
    playDrumSound(type) {
        const now = this.audioContext.currentTime;
        const kit = this.config.drumKit; // Get the current drum kit
        
        // Get volume control for the drum type
        let volumeControl;
        switch(type) {
            case 'Kick':
                volumeControl = document.getElementById('kickVolumeSlider');
                break;
            case 'Snare':
                volumeControl = document.getElementById('snareVolumeSlider');
                break;
            case 'Closed Hi-hat':
                volumeControl = document.getElementById('hihatVolumeSlider');
                break;
            case 'Open Hi-hat':
                volumeControl = document.getElementById('openhatVolumeSlider');
                break;
            case 'Tom':
                volumeControl = document.getElementById('tomVolumeSlider');
                break;
            case 'Cymbal':
                volumeControl = document.getElementById('cymbalVolumeSlider');
                break;
            case '808 Bass':
                volumeControl = document.getElementById('bass808VolumeSlider');
                break;
            default:
                volumeControl = { value: 100 };
        }
        
        // Get volume from slider (or default if not found)
        const volume = parseFloat(volumeControl.value) / 100;
        
        switch(kit) {
            case 'analog':
                this.playAnalogDrumSound(type, volume, now);
                break;
            case 'digital':
                this.playDigitalDrumSound(type, volume, now);
                break;
            default:
                this.playDefaultDrumSound(type, volume, now);
        }
    }
    
    // Default drum kit sounds
    playDefaultDrumSound(type, volume, now) {
        const osc = this.audioContext.createOscillator();
        const gainEnvelope = this.audioContext.createGain();
        
        osc.connect(gainEnvelope);
        gainEnvelope.connect(this.masterGainNode);
        
        switch(type) {
            case 'Kick':
                this.playDefaultKick(osc, gainEnvelope, volume, now);
                break;
            case 'Snare':
                this.playDefaultSnare(osc, gainEnvelope, volume, now);
                break;
            case 'Closed Hi-hat':
                this.playDefaultClosedHat(osc, gainEnvelope, volume, now);
                break;
            case 'Open Hi-hat':
                this.playDefaultOpenHat(osc, gainEnvelope, volume, now);
                break;
            case 'Tom':
                this.playDefaultTom(osc, gainEnvelope, volume, now);
                break;
            case 'Cymbal':
                this.playDefaultCymbal(osc, gainEnvelope, volume, now);
                break;
            case '808 Bass':
                this.playDefault808(osc, gainEnvelope, volume, now);
                break;
        }
    }
    
    // Analog-style drum kit sounds
    playAnalogDrumSound(type, volume, now) {
        const osc = this.audioContext.createOscillator();
        const gainEnvelope = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        osc.connect(filter);
        filter.connect(gainEnvelope);
        gainEnvelope.connect(this.masterGainNode);
        
        switch(type) {
            case 'Kick':
                this.playAnalogKick(osc, filter, gainEnvelope, volume, now);
                break;
            case 'Snare':
                this.playAnalogSnare(osc, filter, gainEnvelope, volume, now);
                break;
            case 'Closed Hi-hat':
                this.playAnalogClosedHat(osc, filter, gainEnvelope, volume, now);
                break;
            case 'Open Hi-hat':
                this.playAnalogOpenHat(osc, filter, gainEnvelope, volume, now);
                break;
            case 'Tom':
                this.playAnalogTom(osc, filter, gainEnvelope, volume, now);
                break;
            case 'Cymbal':
                this.playAnalogCymbal(osc, filter, gainEnvelope, volume, now);
                break;
            case '808 Bass':
                this.playAnalog808(osc, filter, gainEnvelope, volume, now);
                break;
        }
    }
    
    // Digital-style drum kit sounds
    playDigitalDrumSound(type, volume, now) {
        const osc = this.audioContext.createOscillator();
        const gainEnvelope = this.audioContext.createGain();
        const waveshaper = this.audioContext.createWaveShaper();
        
        // Create a basic distortion curve for digital crunch
        const makeDistortionCurve = (amount) => {
            const samples = 44100;
            const curve = new Float32Array(samples);
            const deg = Math.PI / 180;
            for (let i = 0; i < samples; ++i) {
                const x = i * 2 / samples - 1;
                curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
            }
            return curve;
        };
        
        waveshaper.curve = makeDistortionCurve(10);
        waveshaper.oversample = '4x';
        
        osc.connect(waveshaper);
        waveshaper.connect(gainEnvelope);
        gainEnvelope.connect(this.masterGainNode);
        
        switch(type) {
            case 'Kick':
                this.playDigitalKick(osc, waveshaper, gainEnvelope, volume, now);
                break;
            case 'Snare':
                this.playDigitalSnare(osc, waveshaper, gainEnvelope, volume, now);
                break;
            case 'Closed Hi-hat':
                this.playDigitalClosedHat(osc, waveshaper, gainEnvelope, volume, now);
                break;
            case 'Open Hi-hat':
                this.playDigitalOpenHat(osc, waveshaper, gainEnvelope, volume, now);
                break;
            case 'Tom':
                this.playDigitalTom(osc, waveshaper, gainEnvelope, volume, now);
                break;
            case 'Cymbal':
                this.playDigitalCymbal(osc, waveshaper, gainEnvelope, volume, now);
                break;
            case '808 Bass':
                this.playDigital808(osc, waveshaper, gainEnvelope, volume, now);
                break;
        }
    }
    
    // Default kit individual drum sounds
    playDefaultKick(osc, gainEnvelope, volume, now) {
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.5);
        gainEnvelope.gain.setValueAtTime(volume, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        osc.start(now);
        osc.stop(now + 0.5);
    }
    
    playDefaultSnare(osc, gainEnvelope, volume, now) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now);
        gainEnvelope.gain.setValueAtTime(volume / 2, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        // Add noise to the snare
        const noise = this.createNoiseBuffer(0.1);
        const noiseGain = this.audioContext.createGain();
        noise.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume / 2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        noise.start(now);
        
        osc.start(now);
        osc.stop(now + 0.1);
    }
    
    playDefaultClosedHat(osc, gainEnvelope, volume, now) {
        osc.type = 'square';
        osc.frequency.setValueAtTime(6000, now);
        gainEnvelope.gain.setValueAtTime(volume / 5, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

        // Add noise to the hi-hat
        const noise = this.createNoiseBuffer(0.05);
        const noiseGain = this.audioContext.createGain();
        const bandpass = this.audioContext.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 10000;
        noise.connect(bandpass);
        bandpass.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume / 5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        noise.start(now);
        
        osc.start(now);
        osc.stop(now + 0.05);
    }
    
    playDefaultOpenHat(osc, gainEnvelope, volume, now) {
        osc.type = 'square';
        osc.frequency.setValueAtTime(6000, now);
        gainEnvelope.gain.setValueAtTime(volume / 5, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        // Add noise to the open hi-hat (longer duration)
        const noise = this.createNoiseBuffer(0.3);
        const noiseGain = this.audioContext.createGain();
        const bandpass = this.audioContext.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 10000;
        noise.connect(bandpass);
        bandpass.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume / 5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        noise.start(now);
        
        osc.start(now);
        osc.stop(now + 0.3);
    }
    
    playDefaultTom(osc, gainEnvelope, volume, now) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);
        gainEnvelope.gain.setValueAtTime(volume, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        
        osc.start(now);
        osc.stop(now + 0.15);
    }
    
    playDefaultCymbal(osc, gainEnvelope, volume, now) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(8000, now);
        gainEnvelope.gain.setValueAtTime(volume / 8, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

        // Add noise to the cymbal (long duration)
        const noise = this.createNoiseBuffer(1.0);
        const noiseGain = this.audioContext.createGain();
        const highpass = this.audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 8000;
        noise.connect(highpass);
        highpass.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume / 5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        noise.start(now);
        
        osc.start(now);
        osc.stop(now + 0.8);
    }
    
    playDefault808(osc, gainEnvelope, volume, now) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(50, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.7);
        gainEnvelope.gain.setValueAtTime(volume, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
        
        osc.start(now);
        osc.stop(now + 0.7);
    }
    
    // Analog kit individual drum sounds
    playAnalogKick(osc, filter, gainEnvelope, volume, now) {
        // Simulated analog kick with slight distortion and rounding
        osc.type = 'sine';
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        filter.Q.value = 2; // Resonance for analog character
        
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
        gainEnvelope.gain.setValueAtTime(volume * 1.2, now); // Slightly louder for analog character
        gainEnvelope.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        
        osc.start(now);
        osc.stop(now + 0.4);
    }
    
    playAnalogSnare(osc, filter, gainEnvelope, volume, now) {
        // Simulated analog snare with body and noise components
        osc.type = 'triangle';
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        filter.Q.value = 1.5;
        
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
        gainEnvelope.gain.setValueAtTime(volume / 2, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        // Add filtered noise for the snare "rattle"
        const noise = this.createNoiseBuffer(0.2);
        const noiseGain = this.audioContext.createGain();
        const noiseBandpass = this.audioContext.createBiquadFilter();
        noiseBandpass.type = 'bandpass';
        noiseBandpass.frequency.value = 2000;
        noiseBandpass.Q.value = 0.7; // Wider bandwidth for analog feel
        
        noise.connect(noiseBandpass);
        noiseBandpass.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume * 0.7, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        noise.start(now);
        
        osc.start(now);
        osc.stop(now + 0.2);
    }
    
    playAnalogClosedHat(osc, filter, gainEnvelope, volume, now) {
        // Analog closed hat - more metallic with filtering
        osc.type = 'square';
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(7000, now);
        filter.Q.value = 3;
        
        osc.frequency.setValueAtTime(8000, now);
        gainEnvelope.gain.setValueAtTime(volume / 4, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

        // Multiple noise layers for analog character
        const noise1 = this.createNoiseBuffer(0.06);
        const noise2 = this.createNoiseBuffer(0.03);
        const noiseGain = this.audioContext.createGain();
        const noiseBandpass = this.audioContext.createBiquadFilter();
        noiseBandpass.type = 'bandpass';
        noiseBandpass.frequency.value = 9000;
        noiseBandpass.Q.value = 1.2;
        
        noise1.connect(noiseBandpass);
        noise2.connect(noiseBandpass);
        noiseBandpass.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume / 4, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        noise1.start(now);
        noise2.start(now + 0.01);
        
        osc.start(now);
        osc.stop(now + 0.06);
    }
    
    playAnalogOpenHat(osc, filter, gainEnvelope, volume, now) {
        // Analog open hat with ringing
        osc.type = 'square';
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(6000, now);
        filter.Q.value = 2;
        
        osc.frequency.setValueAtTime(7500, now);
        gainEnvelope.gain.setValueAtTime(volume / 4, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        // Multiple noise layers with longer decay
        const noise = this.createNoiseBuffer(0.4);
        const noiseGain = this.audioContext.createGain();
        const noiseBandpass = this.audioContext.createBiquadFilter();
        noiseBandpass.type = 'bandpass';
        noiseBandpass.frequency.value = 8000;
        noiseBandpass.Q.value = 0.9;
        
        noise.connect(noiseBandpass);
        noiseBandpass.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume / 4, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        noise.start(now);
        
        osc.start(now);
        osc.stop(now + 0.4);
    }
    
    playAnalogTom(osc, filter, gainEnvelope, volume, now) {
        // Analog tom with body and resonance
        osc.type = 'triangle';
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + 0.2);
        filter.Q.value = 1.5; // Resonance for analog character
        
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
        gainEnvelope.gain.setValueAtTime(volume * 1.1, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        
        osc.start(now);
        osc.stop(now + 0.2);
    }
    
    playAnalogCymbal(osc, filter, gainEnvelope, volume, now) {
        // Analog cymbal with complex harmonics
        osc.type = 'square';
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(9000, now);
        filter.Q.value = 1.5;
        
        osc.frequency.setValueAtTime(7000, now);
        gainEnvelope.gain.setValueAtTime(volume / 6, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

        // Complex noise structure for cymbal
        const noise = this.createNoiseBuffer(1.2);
        const noiseGain = this.audioContext.createGain();
        const noiseBandpass = this.audioContext.createBiquadFilter();
        noiseBandpass.type = 'bandpass';
        noiseBandpass.frequency.value = 10000;
        noiseBandpass.Q.value = 0.5; // Wide bandwidth
        
        noise.connect(noiseBandpass);
        noiseBandpass.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume / 4, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
        noise.start(now);
        
        osc.start(now);
        osc.stop(now + 1.0);
    }
    
    playAnalog808(osc, filter, gainEnvelope, volume, now) {
        // Classic analog 808-style bass with sine foundation
        osc.type = 'sine';
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, now);
        filter.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        filter.Q.value = 1.2;
        
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.8);
        gainEnvelope.gain.setValueAtTime(volume * 1.3, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        
        osc.start(now);
        osc.stop(now + 0.8);
    }
    
    // Digital kit individual drum sounds
    playDigitalKick(osc, waveshaper, gainEnvelope, volume, now) {
        // Digital kick with clipping and precise envelope
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
        
        gainEnvelope.gain.setValueAtTime(volume * 1.5, now); // Higher initial gain for more distortion
        gainEnvelope.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        
        osc.start(now);
        osc.stop(now + 0.3);
    }
    
    playDigitalSnare(osc, waveshaper, gainEnvelope, volume, now) {
        // Digital snare with hard attack and distortion
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.05); // Sharp pitch shift
        
        gainEnvelope.gain.setValueAtTime(volume * 0.5, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        // Add digital noise burst for the snare
        const noise = this.createNoiseBuffer(0.15);
        const noiseGain = this.audioContext.createGain();
        const noiseShaper = this.audioContext.createWaveShaper();
        
        const makeNoiseDistortionCurve = (amount) => {
            const samples = 44100;
            const curve = new Float32Array(samples);
            for (let i = 0; i < samples; ++i) {
                const x = i * 2 / samples - 1;
                // Hard clipping for digital character
                curve[i] = Math.max(-0.8, Math.min(0.8, x * amount));
            }
            return curve;
        };
        
        noiseShaper.curve = makeNoiseDistortionCurve(3);
        
        noise.connect(noiseShaper);
        noiseShaper.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume * 0.8, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        noise.start(now);
        
        osc.start(now);
        osc.stop(now + 0.15);
    }
    
    playDigitalClosedHat(osc, waveshaper, gainEnvelope, volume, now) {
        // Digital closed hat with hard square wave character
        osc.type = 'square';
        osc.frequency.setValueAtTime(12000, now);
        
        gainEnvelope.gain.setValueAtTime(volume / 6, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.04); // Very short decay

        // Add filtered noise burst
        const noise = this.createNoiseBuffer(0.04);
        const noiseGain = this.audioContext.createGain();
        const highpass = this.audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 9000;
        
        noise.connect(highpass);
        highpass.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume / 5, now);
        noiseGain.gain.linearRampToValueAtTime(0.001, now + 0.04); // Linear for digital precision
        noise.start(now);
        
        osc.start(now);
        osc.stop(now + 0.04);
    }
    
    playDigitalOpenHat(osc, waveshaper, gainEnvelope, volume, now) {
        // Digital open hat with precise decay
        osc.type = 'square';
        osc.frequency.setValueAtTime(10000, now);
        
        gainEnvelope.gain.setValueAtTime(volume / 6, now);
        // More precise envelope shape for digital feel
        gainEnvelope.gain.setValueAtTime(volume / 6, now);
        gainEnvelope.gain.linearRampToValueAtTime(volume / 8, now + 0.1);
        gainEnvelope.gain.linearRampToValueAtTime(0.001, now + 0.3);

        // Add filtered noise with longer duration
        const noise = this.createNoiseBuffer(0.3);
        const noiseGain = this.audioContext.createGain();
        const highpass = this.audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 9000;
        
        noise.connect(highpass);
        highpass.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        noiseGain.gain.setValueAtTime(volume / 5, now);
        noiseGain.gain.setValueAtTime(volume / 5, now);
        noiseGain.gain.linearRampToValueAtTime(volume / 7, now + 0.1);
        noiseGain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        noise.start(now);
        
        osc.start(now);
        osc.stop(now + 0.3);
    }
    
    playDigitalTom(osc, waveshaper, gainEnvelope, volume, now) {
        // Digital tom with precise pitch envelope
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.05); // Sharp pitch change
        osc.frequency.linearRampToValueAtTime(40, now + 0.2);
        
        gainEnvelope.gain.setValueAtTime(volume, now);
        gainEnvelope.gain.linearRampToValueAtTime(volume * 0.7, now + 0.05);
        gainEnvelope.gain.linearRampToValueAtTime(0.001, now + 0.2);
        
        osc.start(now);
        osc.stop(now + 0.2);
    }
    
    playDigitalCymbal(osc, waveshaper, gainEnvelope, volume, now) {
        // Digital cymbal with metallic harmonics
        osc.type = 'square';
        osc.frequency.setValueAtTime(12000, now);
        
        gainEnvelope.gain.setValueAtTime(volume / 8, now);
        // Multi-stage decay for digital precision
        gainEnvelope.gain.linearRampToValueAtTime(volume / 12, now + 0.1);
        gainEnvelope.gain.linearRampToValueAtTime(volume / 20, now + 0.4);
        gainEnvelope.gain.linearRampToValueAtTime(0.001, now + 0.8);

        // Multiple noise layers for complexity
        const noise1 = this.createNoiseBuffer(0.8);
        const noise2 = this.createNoiseBuffer(0.4);
        const noiseGain = this.audioContext.createGain();
        const highpass = this.audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 10000;
        
        noise1.connect(highpass);
        noise2.connect(highpass);
        highpass.connect(noiseGain);
        noiseGain.connect(this.masterGainNode);
        
        noiseGain.gain.setValueAtTime(volume / 6, now);
        noiseGain.gain.linearRampToValueAtTime(volume / 10, now + 0.1);
        noiseGain.gain.linearRampToValueAtTime(volume / 15, now + 0.4);
        noiseGain.gain.linearRampToValueAtTime(0.001, now + 0.8);
        
        noise1.start(now);
        noise2.start(now + 0.05); // Slight delay for complexity
        
        osc.start(now);
        osc.stop(now + 0.8);
    }
    
    playDigital808(osc, waveshaper, gainEnvelope, volume, now) {
        // Digital 808 bass with precise tuning and envelope
        osc.type = 'sine';
        osc.frequency.setValueAtTime(50, now);
        osc.frequency.setValueAtTime(50, now); // Hold at 50Hz
        osc.frequency.linearRampToValueAtTime(45, now + 0.1);
        osc.frequency.linearRampToValueAtTime(35, now + 0.6);
        
        // Multi-stage envelope for precision
        gainEnvelope.gain.setValueAtTime(volume * 1.2, now);
        gainEnvelope.gain.linearRampToValueAtTime(volume, now + 0.1);
        gainEnvelope.gain.linearRampToValueAtTime(volume * 0.8, now + 0.3);
        gainEnvelope.gain.linearRampToValueAtTime(0.001, now + 0.9);
        
        osc.start(now);
        osc.stop(now + 0.9);
    }

    // Create a noise buffer source
    createNoiseBuffer(duration) {
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        return noise;
    }

    // Convert note to frequency
    noteToFrequency(note) {
        const keySelect = document.getElementById('keySelect');
        const scaleSelect = document.getElementById('scaleSelect');
        
        const keyIndex = this.config.keys.indexOf(keySelect.value);
        const scaleType = scaleSelect.value;
        const octave = Math.floor(note / this.config.scales[scaleType].length) + 4;
        const noteIndex = this.config.scales[scaleType][note % this.config.scales[scaleType].length];
        const frequency = 440 * Math.pow(2, (keyIndex + noteIndex + (octave - 4) * 12) / 12);
        return frequency;
    }

    // Change pattern length
    changePatternLength(newLength) {
        const oldLength = this.config.totalSteps;
        this.config.totalSteps = newLength;
        
        // If increasing length, extend existing patterns
        if (newLength > oldLength) {
            // Extend melody grid
            this.melodyGrid.forEach(row => {
                for (let i = oldLength; i < newLength; i++) {
                    row.push(false);
                }
            });
            
            // Extend drum grid
            this.drumGrid.forEach(row => {
                for (let i = oldLength; i < newLength; i++) {
                    row.push(false);
                }
            });
        } else if (newLength < oldLength) {
            // If reducing length, truncate patterns
            this.melodyGrid.forEach(row => {
                row.length = newLength;
            });
            
            this.drumGrid.forEach(row => {
                row.length = newLength;
            });
        }
        
        // Redraw the sequencer grids
        this.renderSequencers();
    }

    // Pattern management functions
    saveSequence() {
        if (this.savedPatterns.length >= 8) {
            alert('Maximum number of saved sequences reached. Please delete one to save a new sequence.');
            return;
        }

        const sequence = {
            melodyGrid: JSON.parse(JSON.stringify(this.melodyGrid)),
            drumGrid: JSON.parse(JSON.stringify(this.drumGrid)),
            soundProfile: document.getElementById('soundProfile').value,
            scale: document.getElementById('scaleSelect').value,
            key: document.getElementById('keySelect').value,
            bpm: document.getElementById('bpmInput').value,
            swing: document.getElementById('swingSlider').value,
            melodyVolume: document.getElementById('melodyVolumeSlider').value,
            kickVolume: document.getElementById('kickVolumeSlider').value,
            snareVolume: document.getElementById('snareVolumeSlider').value,
            hihatVolume: document.getElementById('hihatVolumeSlider').value,
            // Save all effect and synthesis settings
            synthesis: JSON.parse(JSON.stringify(this.config.synthesis)),
            effects: JSON.parse(JSON.stringify(this.config.effects)),
            arpeggiator: JSON.parse(JSON.stringify(this.config.arpeggiator)),
            totalSteps: this.config.totalSteps
        };

        this.savedPatterns.push(sequence);
        this.updateSavedSequences();
    }

    loadSequence(index) {
        const sequence = this.savedPatterns[index];
        
        // Check if pattern length has changed and adjust if needed
        if (sequence.totalSteps && sequence.totalSteps !== this.config.totalSteps) {
            this.changePatternLength(sequence.totalSteps);
        }
        
        // Load grid patterns
        this.melodyGrid.forEach((row, i) => row.forEach((cell, j) => {
            if (j < sequence.melodyGrid[i].length) {
                this.melodyGrid[i][j] = sequence.melodyGrid[i][j];
                const melodyCell = document.querySelector(`#melodySequencer .cell[data-row="${i}"][data-col="${j}"]`);
                if (melodyCell) {
                    melodyCell.classList.toggle('active', sequence.melodyGrid[i][j]);
                }
            }
        }));
        
        this.drumGrid.forEach((row, i) => row.forEach((cell, j) => {
            if (j < sequence.drumGrid[i].length) {
                this.drumGrid[i][j] = sequence.drumGrid[i][j];
                const drumCell = document.querySelector(`#drumSequencer .cell[data-row="${i}"][data-col="${j}"]`);
                if (drumCell) {
                    drumCell.classList.toggle('active', sequence.drumGrid[i][j]);
                }
            }
        }));
        
        // Load basic parameters
        document.getElementById('soundProfile').value = sequence.soundProfile;
        document.getElementById('scaleSelect').value = sequence.scale;
        document.getElementById('keySelect').value = sequence.key;
        document.getElementById('bpmInput').value = sequence.bpm;
        document.getElementById('swingSlider').value = sequence.swing;
        document.getElementById('melodyVolumeSlider').value = sequence.melodyVolume;
        document.getElementById('kickVolumeSlider').value = sequence.kickVolume;
        document.getElementById('snareVolumeSlider').value = sequence.snareVolume;
        document.getElementById('hihatVolumeSlider').value = sequence.hihatVolume;
        
        // Load synthesis settings if present
        if (sequence.synthesis) {
            this.config.synthesis = JSON.parse(JSON.stringify(sequence.synthesis));
            this.updateSynthesisUIValues();
            
            // Update FM toggle
            document.getElementById('fmSynthToggle').checked = this.config.synthesis.fm.enabled;
        }
        
        // Load effects settings if present
        if (sequence.effects) {
            this.config.effects = JSON.parse(JSON.stringify(sequence.effects));
            
            // Update effect toggles
            document.getElementById('delayToggle').checked = this.config.effects.delay.enabled;
            document.getElementById('distortionToggle').checked = this.config.effects.distortion.enabled;
            document.getElementById('reverbToggle').checked = this.config.effects.reverb.enabled;
        }
        
        // Load arpeggiator settings if present
        if (sequence.arpeggiator) {
            this.config.arpeggiator = JSON.parse(JSON.stringify(sequence.arpeggiator));
            
            // Update arpeggiator toggle and controls
            document.getElementById('arpToggle').checked = this.config.arpeggiator.enabled;
            document.getElementById('arpPatternSelect').value = this.config.arpeggiator.pattern;
            document.getElementById('arpRateSelect').value = this.config.arpeggiator.rate;
            document.getElementById('arpOctaveSlider').value = this.config.arpeggiator.octaves;
            document.getElementById('arpOctaveValue').textContent = this.config.arpeggiator.octaves;
        }
        
        this.updateSliderValues();
        this.updateEffects();
    }

    updateSavedSequences() {
        const savedSequences = document.getElementById('savedSequences');
        savedSequences.innerHTML = '';
        
        this.savedPatterns.forEach((_, index) => {
            const sequenceItem = document.createElement('div');
            sequenceItem.className = 'sequence-item';
            
            const button = document.createElement('button');
            button.textContent = index + 1;
            button.className = 'sequence-button';
            button.addEventListener('click', () => this.loadSequence(index));
            
            const chainButton = document.createElement('button');
            chainButton.textContent = 'Add to Chain';
            chainButton.className = 'small-button';
            chainButton.addEventListener('click', () => this.addToChain(index));
            
            sequenceItem.appendChild(button);
            sequenceItem.appendChild(chainButton);
            savedSequences.appendChild(sequenceItem);
        });
    }

    // Pattern manipulation functions
    clearGrid(grid, sequencer) {
        grid.forEach(row => row.fill(false));
        sequencer.querySelectorAll('.cell').forEach(cell => cell.classList.remove('active'));
    }

    randomizePattern() {
        // Randomize melody
        for (let i = 0; i < this.melodyGrid.length; i++) {
            for (let j = 0; j < this.melodyGrid[i].length; j++) {
                this.melodyGrid[i][j] = Math.random() < 0.3;
                const cell = document.querySelector(`#melodySequencer .cell[data-row="${i}"][data-col="${j}"]`);
                if (cell) {
                    cell.classList.toggle('active', this.melodyGrid[i][j]);
                }
            }
        }

        // Randomize drums
        for (let i = 0; i < this.drumGrid.length; i++) {
            for (let j = 0; j < this.drumGrid[i].length; j++) {
                this.drumGrid[i][j] = Math.random() < 0.2;
                const cell = document.querySelector(`#drumSequencer .cell[data-row="${i}"][data-col="${j}"]`);
                if (cell) {
                    cell.classList.toggle('active', this.drumGrid[i][j]);
                }
            }
        }
    }

    randomizeVariation() {
        // Create variation in melody
        for (let i = 0; i < this.melodyGrid.length; i++) {
            for (let j = 0; j < this.melodyGrid[i].length; j++) {
                if (Math.random() < 0.1) {
                    this.melodyGrid[i][j] = !this.melodyGrid[i][j];
                    const cell = document.querySelector(`#melodySequencer .cell[data-row="${i}"][data-col="${j}"]`);
                    if (cell) {
                        cell.classList.toggle('active');
                    }
                }
            }
        }

        // Create variation in drums
        for (let i = 0; i < this.drumGrid.length; i++) {
            for (let j = 0; j < this.drumGrid[i].length; j++) {
                if (Math.random() < 0.1) {
                    this.drumGrid[i][j] = !this.drumGrid[i][j];
                    const cell = document.querySelector(`#drumSequencer .cell[data-row="${i}"][data-col="${j}"]`);
                    if (cell) {
                        cell.classList.toggle('active');
                    }
                }
            }
        }
    }

    quantizeNotes() {
        const quantizeSteps = 16 / this.quantizeValue;
        
        // Quantize melody
        for (let i = 0; i < this.melodyGrid.length; i++) {
            for (let j = 0; j < this.melodyGrid[i].length; j++) {
                if (j % quantizeSteps !== 0) {
                    if (this.melodyGrid[i][j]) {
                        this.melodyGrid[i][j] = false;
                        const cell = document.querySelector(`#melodySequencer .cell[data-row="${i}"][data-col="${j}"]`);
                        if (cell) {
                            cell.classList.remove('active');
                        }
                        
                        const newIndex = Math.round(j / quantizeSteps) * quantizeSteps;
                        if (newIndex < this.melodyGrid[i].length) {
                            this.melodyGrid[i][newIndex] = true;
                            const newCell = document.querySelector(`#melodySequencer .cell[data-row="${i}"][data-col="${newIndex}"]`);
                            if (newCell) {
                                newCell.classList.add('active');
                            }
                        }
                    }
                }
            }
        }

        // Quantize drums
        for (let i = 0; i < this.drumGrid.length; i++) {
            for (let j = 0; j < this.drumGrid[i].length; j++) {
                if (j % quantizeSteps !== 0) {
                    if (this.drumGrid[i][j]) {
                        this.drumGrid[i][j] = false;
                        const cell = document.querySelector(`#drumSequencer .cell[data-row="${i}"][data-col="${j}"]`);
                        if (cell) {
                            cell.classList.remove('active');
                        }
                        
                        const newIndex = Math.round(j / quantizeSteps) * quantizeSteps;
                        if (newIndex < this.drumGrid[i].length) {
                            this.drumGrid[i][newIndex] = true;
                            const newCell = document.querySelector(`#drumSequencer .cell[data-row="${i}"][data-col="${newIndex}"]`);
                            if (newCell) {
                                newCell.classList.add('active');
                            }
                        }
                    }
                }
            }
        }
    }

    // Chain management functions
    addToChain(patternIndex) {
        this.chainedPatterns.push(patternIndex);
        this.updateChainDisplay();
    }

    clearChain() {
        this.chainedPatterns = [];
        this.updateChainDisplay();
    }

    updateChainDisplay() {
        const chainDisplay = document.getElementById('chainDisplay');
        chainDisplay.textContent = 'Chained Patterns: ' + this.chainedPatterns.map(i => i + 1).join(' > ');
    }

    playChain() {
        if (this.chainedPatterns.length === 0) return;
        
        let currentPatternIndex = 0;
        
        const playNextPattern = () => {
            if (currentPatternIndex >= this.chainedPatterns.length) {
                this.stop();
                return;
            }
            
            this.loadSequence(this.chainedPatterns[currentPatternIndex]);
            this.play();
            
            setTimeout(() => {
                this.stop();
                currentPatternIndex++;
                playNextPattern();
            }, (60000 / parseInt(document.getElementById('bpmInput').value)) * 16); // Play each pattern for 16 beats
        };
        
        playNextPattern();
    }

    // Update all slider values and effect parameters
    updateSliderValues() {
        // Update UI values - Sequencer controls
        document.getElementById('swingValue').textContent = document.getElementById('swingSlider').value;
        document.getElementById('melodyVolumeValue').textContent = document.getElementById('melodyVolumeSlider').value;
        document.getElementById('kickVolumeValue').textContent = document.getElementById('kickVolumeSlider').value;
        document.getElementById('snareVolumeValue').textContent = document.getElementById('snareVolumeSlider').value;
        document.getElementById('hihatVolumeValue').textContent = document.getElementById('hihatVolumeSlider').value;
        
        // Update UI values - Delay effect
        document.getElementById('delayTimeValue').textContent = document.getElementById('delayTimeSlider').value;
        document.getElementById('delayFeedbackValue').textContent = document.getElementById('delayFeedbackSlider').value;
        document.getElementById('delayMixValue').textContent = document.getElementById('delayMixSlider').value;
        
        // Update UI values - Compressor
        document.getElementById('compressorThresholdValue').textContent = document.getElementById('compressorThresholdSlider').value;
        document.getElementById('compressorRatioValue').textContent = document.getElementById('compressorRatioSlider').value;
        document.getElementById('compressorAttackValue').textContent = document.getElementById('compressorAttackSlider').value;
        document.getElementById('compressorReleaseValue').textContent = document.getElementById('compressorReleaseSlider').value;
        
        // Update UI values - Distortion
        document.getElementById('distortionAmountValue').textContent = document.getElementById('distortionAmountSlider').value;
        
        // Update UI values - Reverb
        document.getElementById('reverbSizeValue').textContent = document.getElementById('reverbSizeSlider').value;
        document.getElementById('reverbMixValue').textContent = document.getElementById('reverbMixSlider').value;
        
        // Update UI values - LFO
        document.getElementById('lfoRateValue').textContent = document.getElementById('lfoRateSlider').value;
        document.getElementById('lfoAmountValue').textContent = document.getElementById('lfoAmountSlider').value;
        
        // Update config with current values
        this.updateConfigFromUI();
        
        // Update audio parameters
        this.updateEffects();
        this.updateLfoParameters();
    }
    
    // Update config object from UI controls
    updateConfigFromUI() {
        // Delay effect
        this.config.effects.delay.time = parseFloat(document.getElementById('delayTimeSlider').value);
        this.config.effects.delay.feedback = parseFloat(document.getElementById('delayFeedbackSlider').value);
        this.config.effects.delay.mix = parseFloat(document.getElementById('delayMixSlider').value);
        
        // Distortion
        this.config.effects.distortion.amount = parseFloat(document.getElementById('distortionAmountSlider').value);
        
        // Reverb
        this.config.effects.reverb.size = parseFloat(document.getElementById('reverbSizeSlider').value);
        this.config.effects.reverb.mix = parseFloat(document.getElementById('reverbMixSlider').value);
        
        // LFO
        this.config.synthesis.lfo.rate = parseFloat(document.getElementById('lfoRateSlider').value);
        this.config.synthesis.lfo.amount = parseFloat(document.getElementById('lfoAmountSlider').value);
    }
    
    // Update all effects parameters
    updateEffects() {
        const now = this.audioContext.currentTime;
        
        // Update delay parameters
        this.delayNode.delayTime.setValueAtTime(this.config.effects.delay.time / 1000, now);
        this.delayFeedback.gain.setValueAtTime(this.config.effects.delay.feedback / 100, now);
        this.delayGain.gain.setValueAtTime(
            this.config.effects.delay.enabled ? this.config.effects.delay.mix / 100 : 0, 
            now
        );
        
        // Update compressor parameters
        this.compressor.threshold.setValueAtTime(
            parseFloat(document.getElementById('compressorThresholdSlider').value), now
        );
        this.compressor.ratio.setValueAtTime(
            parseFloat(document.getElementById('compressorRatioSlider').value), now
        );
        this.compressor.attack.setValueAtTime(
            parseFloat(document.getElementById('compressorAttackSlider').value) / 1000, now
        );
        this.compressor.release.setValueAtTime(
            parseFloat(document.getElementById('compressorReleaseSlider').value) / 1000, now
        );
        
        // Update distortion
        if (this.config.effects.distortion.enabled) {
            this.createDistortionCurve(this.config.effects.distortion.amount);
            this.distortionGain.gain.setValueAtTime(0.5, now);
        } else {
            this.distortionGain.gain.setValueAtTime(0, now);
        }
        
        // Update reverb
        if (this.config.effects.reverb.enabled) {
            this.createReverbImpulseResponse(this.config.effects.reverb.size);
            this.reverbGain.gain.setValueAtTime(this.config.effects.reverb.mix / 100, now);
        } else {
            this.reverbGain.gain.setValueAtTime(0, now);
        }
    }
    
    // Update LFO parameters
    updateLfoParameters() {
        const now = this.audioContext.currentTime;
        
        // Update LFO rate and type
        this.lfo.frequency.setValueAtTime(this.config.synthesis.lfo.rate, now);
        this.lfo.type = this.config.synthesis.lfo.waveform;
        
        // Update LFO amount/depth
        const lfoAmount = this.config.synthesis.lfo.amount / 100;
        this.lfoGain.gain.setValueAtTime(lfoAmount, now);
        
        // Update LFO routing
        this.updateLfoRouting();
    }
    
    // Update LFO routing
    updateLfoRouting() {
        // Disconnect LFO from all destinations
        try {
            this.lfoGain.disconnect();
        } catch (e) {
            // Already disconnected, ignore
        }
        
        // Connect to the appropriate destination based on user selection
        switch (this.config.synthesis.lfo.destination) {
            case 'pitch':
                // We'll connect to oscillator frequency during sound creation
                this.config.synthesis.lfo.enabled = true;
                break;
            case 'filter':
                // Connect to filter frequency
                this.lfoGain.connect(this.delayFilter.frequency);
                this.config.synthesis.lfo.enabled = true;
                break;
            case 'amplitude':
                // Connect to master gain
                this.lfoGain.connect(this.masterGainNode.gain);
                this.config.synthesis.lfo.enabled = true;
                break;
            default:
                // None - disable LFO
                this.config.synthesis.lfo.enabled = false;
        }
    }

    // Draw audio visualizer
    drawVisualizer() {
        const visualizer = document.getElementById('visualizer');
        const visualizerContext = visualizer.getContext('2d');
        
        // Set canvas dimensions to match display size
        visualizer.width = visualizer.clientWidth;
        visualizer.height = visualizer.clientHeight;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            requestAnimationFrame(draw);
            
            this.analyser.getByteFrequencyData(dataArray);
            
            visualizerContext.fillStyle = 'rgb(240, 240, 240)';
            visualizerContext.fillRect(0, 0, visualizer.width, visualizer.height);
            
            const barWidth = (visualizer.width / bufferLength) * 2.5;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] / 2;
                
                // Create gradient for visualizer bars
                const gradient = visualizerContext.createLinearGradient(0, visualizer.height, 0, visualizer.height - barHeight);
                gradient.addColorStop(0, '#2196F3');
                gradient.addColorStop(1, '#4CAF50');
                
                visualizerContext.fillStyle = gradient;
                visualizerContext.fillRect(x, visualizer.height - barHeight, barWidth, barHeight);
                
                x += barWidth + 1;
            }
        };
        
        draw();
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create app instance
    window.app = new Synthograsizer();
    
    // Listen for scale/key changes to update note labels
    document.getElementById('scaleSelect').addEventListener('change', () => {
        window.app.renderSequencers();
    });
    
    document.getElementById('keySelect').addEventListener('change', () => {
        window.app.renderSequencers();
    });
});