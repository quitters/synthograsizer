class Synthograsizer {
    constructor() {
        this.initAudioContext();
        this.initializeModules();
        this.setupAudioNodes();
        this.setupEventListeners();
        this.renderUI();
    }

    initAudioContext() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.isPlaying = false;
        this.currentStep = 0;
        this.stepInterval = null;
    }

    setupAudioNodes() {
        this.masterGainNode = this.audioContext.createGain();
        this.setupEffects();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.masterGainNode.connect(this.compressor);
        this.compressor.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
    }

    setupEffects() {
        this.createEffectMixNodes();
        
        this.delayNode = this.audioContext.createDelay(2);
        this.delayFeedback = this.audioContext.createGain();
        this.delayFilter = this.audioContext.createBiquadFilter();
        this.delayGain = this.audioContext.createGain();
        
        this.delayNode.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayFilter);
        this.delayFilter.connect(this.delayNode);
        this.delayNode.connect(this.delayGain);
        this.delayGain.connect(this.masterGainNode);
        
        this.delayGain.gain.value = this.config.effects.delay.mix / 100;

        this.compressor = this.audioContext.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-24, this.audioContext.currentTime);
        this.compressor.knee.setValueAtTime(30, this.audioContext.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.audioContext.currentTime);
        this.compressor.release.setValueAtTime(0.25, this.audioContext.currentTime);
        
        this.distortion = this.audioContext.createWaveShaper();
        this.distortionGain = this.audioContext.createGain();
        this.distortion.connect(this.distortionGain);
        this.distortionGain.connect(this.masterGainNode);
        this.distortionGain.gain.value = 0;
        
        this.createDistortionCurve(this.config.effects.distortion.amount);
        
        this.reverbNode = this.audioContext.createConvolver();
        this.reverbGain = this.audioContext.createGain();
        this.reverbNode.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGainNode);
        this.reverbGain.gain.value = 0;
        
        this.createReverbImpulseResponse(this.config.effects.reverb.size);
        this.setupLFO();
    }
    
    createEffectMixNodes() {
        this.dryGain = this.audioContext.createGain();
        this.delaySend = this.audioContext.createGain();
        this.distortionSend = this.audioContext.createGain();
        this.reverbSend = this.audioContext.createGain();
        
        this.dryGain.gain.value = 1;
        this.delaySend.gain.value = 0;
        this.distortionSend.gain.value = 0;
        this.reverbSend.gain.value = 0;
    }
    
    setupLFO() {
        this.lfo = this.audioContext.createOscillator();
        this.lfoGain = this.audioContext.createGain();
        
        this.lfo.frequency.value = this.config.synthesis.lfo.rate;
        this.lfo.type = this.config.synthesis.lfo.waveform;
        this.lfoGain.gain.value = 0;
        
        this.lfo.connect(this.lfoGain);
        this.lfo.start();
    }
    
    createDistortionCurve(amount) {
        amount = Math.max(0, Math.min(1, amount / 100));
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
    
    createReverbImpulseResponse(size) {
        size = Math.max(0, Math.min(1, size / 100));
        
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * (0.5 + size * 3.0);
        const decay = 0.5 + size * 5.0;
        
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            
            for (let i = 0; i < length; i++) {
                const noise = Math.random() * 2 - 1;
                channelData[i] = noise * Math.pow(1 - i / length, decay);
            }
        }
        
        this.reverbNode.buffer = impulse;
    }

    initializeModules() {
        this.config = {
            stepsPerBeat: 4,
            beatsPerBar: 4,
            totalSteps: 16,
            sequencerRows: {
                melody: 8,
                drums: 7
            },
            melodyScaleSize: 8, // New: configurable melody sequencer rows
            melodyOctaveTranspose: 0, // New: octave transpose -3 to +3
            isScaleInverted: false, // Flag for scale direction (bottom-to-top vs. top-to-bottom)
            scales: {
                major: [0, 2, 4, 5, 7, 9, 11],
                minor: [0, 2, 3, 5, 7, 8, 10],
                pentatonic: [0, 2, 4, 7, 9],
                blues: [0, 3, 5, 6, 7, 10]
            },
            keys: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
            currentKey: 'C', // New: store current key
            currentScale: 'major', // New: store current scale
            drumTypes: ['Kick', 'Snare', 'Closed Hi-hat', 'Open Hi-hat', 'Tom', 'Cymbal', '808 Bass'],
            drumKit: 'default',
            synthesis: {
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
            effects: {
                delay: {
                    enabled: false,
                    time: 0,
                    feedback: 0,
                    mix: 50
                },
                distortion: {
                    enabled: false,
                    amount: 0
                },
                reverb: {
                    enabled: false,
                    size: 0,
                    mix: 50
                }
            },
            arpeggiator: {
                enabled: false,
                pattern: 'up',
                rate: 4,
                octaves: 1
            }
        };

        this.melodyGrid = Array(this.config.melodyScaleSize).fill().map(() => 
            Array(this.config.totalSteps).fill(false));
        this.drumGrid = Array(this.config.sequencerRows.drums).fill().map(() => 
            Array(this.config.totalSteps).fill(false));
        
        this.savedPatterns = [];
        this.chainedPatterns = [];
        this.quantizeValue = 16;
    }

    setupEventListeners() {
        // Invert scale button
        document.getElementById('invertScaleBtn').addEventListener('click', () => {
            this.config.isScaleInverted = !this.config.isScaleInverted;
            this.renderSequencers(); // Redraw sequencers with inverted notes
            document.getElementById('invertScaleBtn').classList.toggle('active', this.config.isScaleInverted);
        });

        document.getElementById('playButton').addEventListener('click', () => this.play());
        document.getElementById('stopButton').addEventListener('click', () => this.stop());
        document.getElementById('bpmInput').addEventListener('change', () => {
            if (this.isPlaying) {
                this.stop();
                this.play();
            }
        });

        // Key and Scale controls
        document.getElementById('keySelect').addEventListener('change', (e) => {
            this.config.currentKey = e.target.value;
            this.renderSequencers();
        });
        
        document.getElementById('scaleSelect').addEventListener('change', (e) => {
            this.config.currentScale = e.target.value;
            this.renderSequencers();
        });

        // Octave transpose controls
        document.getElementById('octaveDown').addEventListener('click', () => {
            if (this.config.melodyOctaveTranspose > -3) {
                this.config.melodyOctaveTranspose--;
                document.getElementById('octaveValue').textContent = this.config.melodyOctaveTranspose;
                this.renderSequencers();
            }
        });
        
        document.getElementById('octaveUp').addEventListener('click', () => {
            if (this.config.melodyOctaveTranspose < 3) {
                this.config.melodyOctaveTranspose++;
                document.getElementById('octaveValue').textContent = this.config.melodyOctaveTranspose;
                this.renderSequencers();
            }
        });

        // Scale size controls
        document.getElementById('scaleSizeDown').addEventListener('click', () => {
            if (this.config.melodyScaleSize > 8) {
                this.config.melodyScaleSize--;
                document.getElementById('scaleSizeValue').textContent = this.config.melodyScaleSize;
                this.resizeMelodyGrid();
            }
        });
        
        document.getElementById('scaleSizeUp').addEventListener('click', () => {
            if (this.config.melodyScaleSize < 16) {
                this.config.melodyScaleSize++;
                document.getElementById('scaleSizeValue').textContent = this.config.melodyScaleSize;
                this.resizeMelodyGrid();
            }
        });

        // Melody volume
        document.getElementById('melodyVolumeSlider').addEventListener('input', (e) => {
            document.getElementById('melodyVolumeValue').textContent = e.target.value;
        });

        document.getElementById('saveButton').addEventListener('click', () => this.saveSequence());
        document.getElementById('clearMelodyButton').addEventListener('click', () => this.clearGrid(this.melodyGrid, document.getElementById('melodySequencer')));
        document.getElementById('clearDrumButton').addEventListener('click', () => this.clearGrid(this.drumGrid, document.getElementById('drumSequencer')));
        document.getElementById('clearAllButton').addEventListener('click', () => {
            this.clearGrid(this.melodyGrid, document.getElementById('melodySequencer'));
            this.clearGrid(this.drumGrid, document.getElementById('drumSequencer'));
        });
        document.getElementById('randomizeButton').addEventListener('click', () => this.randomizePattern());
        document.getElementById('variationButton').addEventListener('click', () => this.randomizeVariation());
        
        document.getElementById('quantizeSelect').addEventListener('change', (e) => {
            this.quantizeValue = parseInt(e.target.value);
        });
        document.getElementById('quantizeButton').addEventListener('click', () => this.quantizeNotes());
        
        document.getElementById('playChainButton').addEventListener('click', () => this.playChain());
        document.getElementById('clearChainButton').addEventListener('click', () => this.clearChain());

        document.getElementById('drumKitSelect').addEventListener('change', (e) => {
            this.config.drumKit = e.target.value;
            this.renderSequencers();
        });

        document.getElementById('fmSynthToggle').addEventListener('change', (e) => {
            this.config.synthesis.fm.enabled = e.target.checked;
        });

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

        document.querySelectorAll('.toggle-panel').forEach(button => {
            button.addEventListener('click', (e) => {
                const targetId = e.target.getAttribute('data-target');
                const targetPanel = document.getElementById(targetId);
                
                targetPanel.classList.toggle('collapsed');
                button.classList.toggle('collapsed');
            });
        });

        const tabButtons = document.querySelectorAll('.tab-button');
        
        if (tabButtons.length > 0) {
            tabButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    
                    document.querySelectorAll('.tab-button').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    document.querySelectorAll('.tab-content').forEach(content => {
                        content.classList.remove('active');
                    });
                    
                    button.classList.add('active');
                    const tabId = button.getAttribute('data-tab');
                    const tabContent = document.getElementById(tabId);
                    
                    if (tabContent) {
                        tabContent.classList.add('active');
                    }
                });
            });
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

    setupSliderListeners() {
        const sliders = [
            'swingSlider', 'melodyVolumeSlider', 'kickVolumeSlider', 'snareVolumeSlider', 
            'hihatVolumeSlider', 'openhatVolumeSlider', 'tomVolumeSlider', 'cymbalVolumeSlider', 'bass808VolumeSlider',
            'delayTimeSlider', 'delayFeedbackSlider', 'delayMixSlider',
            'compressorThresholdSlider', 'compressorRatioSlider', 
            'compressorAttackSlider', 'compressorReleaseSlider',
            'distortionAmountSlider', 'reverbSizeSlider', 'reverbMixSlider',
            'lfoRateSlider', 'lfoAmountSlider'
        ];

        sliders.forEach(sliderId => {
            const slider = document.getElementById(sliderId);
            if (slider) {
                slider.addEventListener('input', () => this.updateSliderValues());
            }
        });
        
        document.getElementById('lfoWaveform').addEventListener('change', (e) => {
            this.config.synthesis.lfo.waveform = e.target.value;
            this.lfo.type = e.target.value;
        });
        
        document.getElementById('lfoDestination').addEventListener('change', (e) => {
            this.config.synthesis.lfo.destination = e.target.value;
            this.updateLfoRouting();
        });
    }

    renderUI() {
        this.renderSequencers();
        this.populateKeySelect();
        this.populateScaleSelect();
        this.updateSliderValues();
        this.updateSynthesisUIValues();
        this.updateMelodyControlValues();
        // Initialize visualizer after a short delay to ensure canvas is ready
        setTimeout(() => {
            this.drawVisualizer();
        }, 100);
    }

    // Populate scale select dropdown
    populateScaleSelect() {
        const scaleSelect = document.getElementById('scaleSelect');
        scaleSelect.innerHTML = '';
        
        Object.keys(this.config.scales).forEach(scale => {
            const option = document.createElement('option');
            option.value = scale;
            option.textContent = scale.charAt(0).toUpperCase() + scale.slice(1);
            scaleSelect.appendChild(option);
        });
        
        scaleSelect.value = this.config.currentScale;
    }

    // Update melody control values to current config
    updateMelodyControlValues() {
        document.getElementById('keySelect').value = this.config.currentKey;
        document.getElementById('scaleSelect').value = this.config.currentScale;
        document.getElementById('octaveValue').textContent = this.config.melodyOctaveTranspose;
        document.getElementById('scaleSizeValue').textContent = this.melodyGrid.length; // Use actual grid length
        document.getElementById('melodyVolumeValue').textContent = document.getElementById('melodyVolumeSlider').value;
    }

    // Resize melody grid when scale size changes
    resizeMelodyGrid() {
        const oldSize = this.melodyGrid.length;
        const newSize = this.config.melodyScaleSize;
        
        if (newSize > oldSize) {
            // Add new rows at the end
            for (let i = oldSize; i < newSize; i++) {
                this.melodyGrid.push(Array(this.config.totalSteps).fill(false));
            }
        } else if (newSize < oldSize) {
            // Remove rows from the end
            this.melodyGrid = this.melodyGrid.slice(0, newSize);
        }
        
        // Keep config in sync with actual grid size
        this.config.sequencerRows.melody = this.melodyGrid.length;
        
        // Re-render the sequencer
        this.renderSequencers();
    }

    renderSequencers() {
        const melodySequencer = document.getElementById('melodySequencer');
        const drumSequencer = document.getElementById('drumSequencer');
        const melodyLabels = document.getElementById('melodyLabels');
        const drumLabels = document.getElementById('drumLabels');
        const melodyStepNumbers = document.getElementById('melodyStepNumbers');
        const drumStepNumbers = document.getElementById('drumStepNumbers');

        // Clear existing content
        melodySequencer.innerHTML = '';
        drumSequencer.innerHTML = '';
        melodyLabels.innerHTML = '';
        drumLabels.innerHTML = '';
        melodyStepNumbers.innerHTML = '';
        drumStepNumbers.innerHTML = '';

        // Set grid columns based on total steps
        melodySequencer.style.gridTemplateColumns = `repeat(${this.config.totalSteps}, 30px)`;
        drumSequencer.style.gridTemplateColumns = `repeat(${this.config.totalSteps}, 30px)`;

        // Create melody labels (use actual grid length)
        for (let i = 0; i < this.melodyGrid.length; i++) {
            const label = document.createElement('div');
            label.className = 'sequencer-label';
            label.textContent = this.getNoteLabel(i);
            melodyLabels.appendChild(label);
        }

        // Create melody grid (use actual grid length)
        for (let i = 0; i < this.melodyGrid.length; i++) {
            for (let j = 0; j < this.config.totalSteps; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.addEventListener('click', () => this.toggleCell(this.melodyGrid, cell, i, j));
                if (this.melodyGrid && this.melodyGrid[i] && this.melodyGrid[i][j]) {
                    cell.classList.add('active');
                }
                melodySequencer.appendChild(cell);
            }
        }

        // Create melody step numbers
        for (let j = 0; j < this.config.totalSteps; j++) {
            const stepNumber = document.createElement('div');
            stepNumber.className = 'step-number';
            stepNumber.textContent = j + 1;
            if (j % 4 === 0) {
                stepNumber.setAttribute('data-beat', 'true');
            }
            melodyStepNumbers.appendChild(stepNumber);
        }

        // Create drum labels
        for (let i = 0; i < this.config.sequencerRows.drums; i++) {
            const label = document.createElement('div');
            label.className = 'sequencer-label';
            label.textContent = this.config.drumTypes[i];
            drumLabels.appendChild(label);
        }

        // Create drum grid
        for (let i = 0; i < this.config.sequencerRows.drums; i++) {
            for (let j = 0; j < this.config.totalSteps; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell drum-cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.addEventListener('click', () => this.toggleCell(this.drumGrid, cell, i, j));
                if (this.drumGrid && this.drumGrid[i] && this.drumGrid[i][j]) {
                    cell.classList.add('active');
                }
                drumSequencer.appendChild(cell);
            }
        }

        // Create drum step numbers
        for (let j = 0; j < this.config.totalSteps; j++) {
            const stepNumber = document.createElement('div');
            stepNumber.className = 'step-number';
            stepNumber.textContent = j + 1;
            if (j % 4 === 0) {
                stepNumber.setAttribute('data-beat', 'true');
            }
            drumStepNumbers.appendChild(stepNumber);
        }
    }

    updateSynthesisUIValues() {
        document.getElementById('carrierWaveform').value = this.config.synthesis.fm.carrierWaveform;
        document.getElementById('modulatorWaveform').value = this.config.synthesis.fm.modulatorWaveform;
        document.getElementById('modulationIndexSlider').value = this.config.synthesis.fm.modulationIndex;
        document.getElementById('modulationIndexValue').textContent = this.config.synthesis.fm.modulationIndex;
        document.getElementById('modulationRatioSlider').value = this.config.synthesis.fm.modulationRatio;
        document.getElementById('modulationRatioValue').textContent = this.config.synthesis.fm.modulationRatio;

        document.getElementById('attackSlider').value = this.config.synthesis.envelope.attack;
        document.getElementById('attackValue').textContent = this.config.synthesis.envelope.attack;
        document.getElementById('decaySlider').value = this.config.synthesis.envelope.decay;
        document.getElementById('decayValue').textContent = this.config.synthesis.envelope.decay;
        document.getElementById('sustainSlider').value = this.config.synthesis.envelope.sustain;
        document.getElementById('sustainValue').textContent = this.config.synthesis.envelope.sustain;
        document.getElementById('releaseSlider').value = this.config.synthesis.envelope.release;
        document.getElementById('releaseValue').textContent = this.config.synthesis.envelope.release;

        document.getElementById('filterTypeSelect').value = this.config.synthesis.filter.type;
        document.getElementById('filterFreqSlider').value = this.config.synthesis.filter.frequency;
        document.getElementById('filterFreqValue').textContent = this.config.synthesis.filter.frequency;
        document.getElementById('filterQSlider').value = this.config.synthesis.filter.resonance;
        document.getElementById('filterQValue').textContent = this.config.synthesis.filter.resonance;
        document.getElementById('filterEnvSlider').value = this.config.synthesis.filter.envelopeAmount;
        document.getElementById('filterEnvValue').textContent = this.config.synthesis.filter.envelopeAmount;
    }

    getNoteLabel(rowIndex) {
        const scale = this.config.scales[this.config.currentScale];
        // Use actual grid length as source of truth
        const totalRows = this.melodyGrid.length;

        // Calculate note index based on scale direction
        let noteIndex, octave;
        if (this.config.isScaleInverted) {
            // When inverted, first row is the highest note
            const totalNotes = scale.length * Math.ceil(totalRows / scale.length);
            const invertedIndex = totalNotes - 1 - rowIndex;
            octave = Math.floor(invertedIndex / scale.length);
            noteIndex = scale[invertedIndex % scale.length];
        } else {
            // Original direction: first row is the lowest note
            octave = Math.floor(rowIndex / scale.length);
            noteIndex = scale[rowIndex % scale.length];
        }

        // Get the base key index
        const keyIndex = this.config.keys.indexOf(this.config.currentKey);

        // Calculate the note within the chromatic scale
        const chromaticNote = (keyIndex + noteIndex) % 12;
        const noteName = this.config.keys[chromaticNote];

        // Calculate the final octave with transpose
        const baseOctave = 4; // C4 is our reference
        const finalOctave = baseOctave + octave + this.config.melodyOctaveTranspose;

        return `${noteName}${finalOctave}`;
    }

    populateKeySelect() {
        const keySelect = document.getElementById('keySelect');
        keySelect.innerHTML = '';
        
        this.config.keys.forEach((key, index) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            if (key === 'C') {
                option.selected = true;
            }
            keySelect.appendChild(option);
        });
    }

    toggleCell(grid, cell, row, col) {
        grid[row][col] = !grid[row][col];
        cell.classList.toggle('active');
    }

    play() {
        if (this.isPlaying) return;
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.isPlaying = true;
        this.currentStep = 0;
        const bpm = parseInt(document.getElementById('bpmInput').value);
        const interval = 60000 / bpm / 4;
        this.stepInterval = setInterval(() => this.step(), interval);
    }

    stop() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        clearInterval(this.stepInterval);
        
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('current');
        });
        document.querySelectorAll('.step-number').forEach(stepNum => {
            stepNum.classList.remove('current-step');
        });
    }

    step() {
        const swingAmount = parseInt(document.getElementById('swingSlider').value) / 100;
        const isSwingStep = this.currentStep % 2 === 1;
        const swingDelay = isSwingStep ? (60000 / parseInt(document.getElementById('bpmInput').value) / 4) * swingAmount : 0;

        setTimeout(() => {
            // Use the actual melody grid length instead of the fixed sequencerRows.melody value
            for (let i = 0; i < this.melodyGrid.length; i++) {
                if (this.melodyGrid[i][this.currentStep]) {
                    const frequency = this.noteToFrequency(i);
                    
                    if (this.config.arpeggiator.enabled) {
                        const arpNotes = this.processArpeggiator(i);
                        const arpRate = this.config.arpeggiator.rate;
                        const noteDuration = 60000 / parseInt(document.getElementById('bpmInput').value) / arpRate;
                        
                        arpNotes.forEach((noteIndex, index) => {
                            setTimeout(() => {
                                const arpFreq = this.noteToFrequency(noteIndex);
                                if (this.config.synthesis.fm.enabled) {
                                    this.createFMSynthOscillator(arpFreq);
                                } else {
                                    this.createOscillator(arpFreq, document.getElementById('soundProfile').value);
                                }
                            }, noteDuration * index);
                        });
                    } else {
                        if (this.config.synthesis.fm.enabled) {
                            this.createFMSynthOscillator(frequency);
                        } else {
                            this.createOscillator(frequency, document.getElementById('soundProfile').value);
                        }
                    }
                }
            }

            for (let i = 0; i < this.config.sequencerRows.drums; i++) {
                if (this.drumGrid[i][this.currentStep]) {
                    this.playDrumSound(this.config.drumTypes[i]);
                }
            }

            document.querySelectorAll('.cell').forEach(cell => {
                cell.classList.remove('current');
            });

            const currentMelodyCells = document.querySelectorAll(`#melodySequencer .cell[data-col="${this.currentStep}"]`);
            const currentDrumCells = document.querySelectorAll(`#drumSequencer .cell[data-col="${this.currentStep}"]`);
            
            currentMelodyCells.forEach(cell => cell.classList.add('current'));
            currentDrumCells.forEach(cell => cell.classList.add('current'));

            this.currentStep = (this.currentStep + 1) % this.config.totalSteps;

            if (this.currentStep === 0 && this.chainedPatterns.length > 0) {
                this.loadSequence(this.chainedPatterns.shift());
                this.updateChainDisplay();
            }
        }, swingDelay);
    }

    processArpeggiator(note) {
        if (!this.config.arpeggiator.enabled) {
            return [note];
        }
        
        const pattern = this.config.arpeggiator.pattern;
        const octaves = this.config.arpeggiator.octaves;
        const notes = [];
        
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
                for (let o = 0; o < octaves; o++) {
                    notes.push(note + (o * 12));
                }
                for (let o = octaves - 2; o > 0; o--) {
                    notes.push(note + (o * 12));
                }
                break;
            case 'random':
                for (let i = 0; i < octaves * 2; i++) {
                    const randomOctave = Math.floor(Math.random() * octaves);
                    notes.push(note + (randomOctave * 12));
                }
                break;
        }
        
        return notes;
    }

    createOscillator(frequency, type) {
        const now = this.audioContext.currentTime;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filterNode = this.audioContext.createBiquadFilter();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now);
        
        filterNode.type = this.config.synthesis.filter.type;
        filterNode.frequency.value = this.config.synthesis.filter.frequency;
        filterNode.Q.value = this.config.synthesis.filter.resonance;

        oscillator.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        
        if (this.config.effects.delay.enabled) {
            gainNode.connect(this.delayNode);
        }
        
        if (this.config.effects.distortion.enabled) {
            gainNode.connect(this.distortion);
        }
        
        if (this.config.effects.reverb.enabled) {
            gainNode.connect(this.reverbNode);
        }

        const attack = this.config.synthesis.envelope.attack / 1000;
        const decay = this.config.synthesis.envelope.decay / 1000;
        const sustain = this.config.synthesis.envelope.sustain / 100;
        const release = this.config.synthesis.envelope.release / 1000;
        
        const volume = parseFloat(document.getElementById('melodyVolumeSlider').value) / 100;

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + attack);
        gainNode.gain.linearRampToValueAtTime(volume * sustain, now + attack + decay);
        
        const filterEnvAmount = this.config.synthesis.filter.envelopeAmount / 100;
        if (filterEnvAmount > 0) {
            const baseFreq = this.config.synthesis.filter.frequency;
            const maxFreq = Math.min(baseFreq * 5, 20000);
            
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
        
        if (this.config.synthesis.voice.unison > 1) {
            const unisonCount = this.config.synthesis.voice.unison;
            const detuneAmount = this.config.synthesis.voice.detune;
            
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
        
        oscillator.start(now);
        oscillator.stop(now + attack + decay + release);
        
        gainNode.gain.linearRampToValueAtTime(0, now + attack + decay + release);
        
        return oscillator;
    }

    createFMSynthOscillator(frequency) {
        const now = this.audioContext.currentTime;
        
        const carrierType = this.config.synthesis.fm.carrierWaveform;
        const modulatorType = this.config.synthesis.fm.modulatorWaveform;
        const modulationIndex = this.config.synthesis.fm.modulationIndex * 10;
        const modulationRatio = this.config.synthesis.fm.modulationRatio;
        
        const carrier = this.audioContext.createOscillator();
        carrier.type = carrierType;
        carrier.frequency.value = frequency;
        
        const modulator = this.audioContext.createOscillator();
        modulator.type = modulatorType;
        modulator.frequency.value = frequency * modulationRatio;
        
        const modulationGain = this.audioContext.createGain();
        modulationGain.gain.value = modulationIndex;
        
        const gainNode = this.audioContext.createGain();
        
        const filterNode = this.audioContext.createBiquadFilter();
        filterNode.type = this.config.synthesis.filter.type;
        filterNode.frequency.value = this.config.synthesis.filter.frequency;
        filterNode.Q.value = this.config.synthesis.filter.resonance;
        
        modulator.connect(modulationGain);
        modulationGain.connect(carrier.frequency);
        
        carrier.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        
        if (this.config.effects.delay.enabled) {
            gainNode.connect(this.delayNode);
        }
        
        if (this.config.effects.distortion.enabled) {
            gainNode.connect(this.distortion);
        }
        
        if (this.config.effects.reverb.enabled) {
            gainNode.connect(this.reverbNode);
        }
        
        const attack = this.config.synthesis.envelope.attack / 1000;
        const decay = this.config.synthesis.envelope.decay / 1000;
        const sustain = this.config.synthesis.envelope.sustain / 100;
        const release = this.config.synthesis.envelope.release / 1000;
        
        const volume = parseFloat(document.getElementById('melodyVolumeSlider').value) / 100;
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + attack);
        gainNode.gain.linearRampToValueAtTime(volume * sustain, now + attack + decay);
        
        const filterEnvAmount = this.config.synthesis.filter.envelopeAmount / 100;
        if (filterEnvAmount > 0) {
            const baseFreq = this.config.synthesis.filter.frequency;
            const maxFreq = Math.min(baseFreq * 5, 20000);
            
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
        
        if (this.config.synthesis.voice.unison > 1) {
            const unisonCount = this.config.synthesis.voice.unison;
            const detuneAmount = this.config.synthesis.voice.detune;
            
            for (let i = 1; i < unisonCount; i++) {
                const detuneValue = (i % 2 === 0 ? 1 : -1) * detuneAmount * Math.ceil(i / 2);
                
                const unisonCarrier = this.audioContext.createOscillator();
                unisonCarrier.type = carrierType;
                unisonCarrier.frequency.value = frequency;
                unisonCarrier.detune.value = detuneValue;
                
                const unisonModulator = this.audioContext.createOscillator();
                unisonModulator.type = modulatorType;
                unisonModulator.frequency.value = frequency * modulationRatio;
                unisonModulator.detune.value = detuneValue;
                
                const unisonModGain = this.audioContext.createGain();
                unisonModGain.gain.value = modulationIndex;
                
                unisonModulator.connect(unisonModGain);
                unisonModGain.connect(unisonCarrier.frequency);
                unisonCarrier.connect(filterNode);
                
                unisonModulator.start(now);
                unisonCarrier.start(now);
                unisonModulator.stop(now + attack + decay + release);
                unisonCarrier.stop(now + attack + decay + release);
            }
        }
        
        modulator.start(now);
        carrier.start(now);
        
        const stopTime = now + attack + decay + release;
        modulator.stop(stopTime);
        carrier.stop(stopTime);
        
        gainNode.gain.linearRampToValueAtTime(0, stopTime);
        
        return {
            carrier: carrier,
            modulator: modulator
        };
    }

    playDrumSound(type) {
        const now = this.audioContext.currentTime;
        const kit = this.config.drumKit;
        
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
    
    playDefaultDrumSound(type, volume, now) {
        const osc = this.audioContext.createOscillator();
        const gainEnvelope = this.audioContext.createGain();
        
        osc.connect(gainEnvelope);
        gainEnvelope.connect(this.masterGainNode);
        
        switch(type) {
            case 'Kick':
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.5);
                gainEnvelope.gain.setValueAtTime(volume, now);
                gainEnvelope.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
                break;
                
            case 'Snare':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(100, now);
                gainEnvelope.gain.setValueAtTime(volume / 2, now);
                gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                
                // Add noise for snare character
                const noise = this.createNoiseBuffer(0.1);
                const noiseGain = this.audioContext.createGain();
                noise.connect(noiseGain);
                noiseGain.connect(this.masterGainNode);
                noiseGain.gain.setValueAtTime(volume / 2, now);
                noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                noise.start(now);
                
                osc.start(now);
                osc.stop(now + 0.1);
                break;
                
            case 'Closed Hi-hat':
                osc.type = 'square';
                osc.frequency.setValueAtTime(6000, now);
                gainEnvelope.gain.setValueAtTime(volume / 5, now);
                gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

                // Add noise for hi-hat character
                const hihatNoise = this.createNoiseBuffer(0.05);
                const hihatNoiseGain = this.audioContext.createGain();
                const bandpass = this.audioContext.createBiquadFilter();
                bandpass.type = 'bandpass';
                bandpass.frequency.value = 10000;
                
                hihatNoise.connect(bandpass);
                bandpass.connect(hihatNoiseGain);
                hihatNoiseGain.connect(this.masterGainNode);
                hihatNoiseGain.gain.setValueAtTime(volume / 3, now);
                hihatNoiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                hihatNoise.start(now);
                
                osc.start(now);
                osc.stop(now + 0.05);
                break;
                
            case 'Open Hi-hat':
                osc.type = 'square';
                osc.frequency.setValueAtTime(6000, now);
                gainEnvelope.gain.setValueAtTime(volume / 5, now);
                gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

                // Add noise for open hi-hat (longer duration)
                const openNoise = this.createNoiseBuffer(0.3);
                const openNoiseGain = this.audioContext.createGain();
                const openBandpass = this.audioContext.createBiquadFilter();
                openBandpass.type = 'bandpass';
                openBandpass.frequency.value = 10000;
                
                openNoise.connect(openBandpass);
                openBandpass.connect(openNoiseGain);
                openNoiseGain.connect(this.masterGainNode);
                openNoiseGain.gain.setValueAtTime(volume / 3, now);
                openNoiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                openNoise.start(now);
                
                osc.start(now);
                osc.stop(now + 0.3);
                break;
                
            case 'Tom':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(90, now);
                osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);
                gainEnvelope.gain.setValueAtTime(volume, now);
                gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                
                osc.start(now);
                osc.stop(now + 0.15);
                break;
                
            case 'Cymbal':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(8000, now);
                gainEnvelope.gain.setValueAtTime(volume / 8, now);
                gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

                // Add noise for cymbal character (long duration)
                const cymbalNoise = this.createNoiseBuffer(1.0);
                const cymbalNoiseGain = this.audioContext.createGain();
                const highpass = this.audioContext.createBiquadFilter();
                highpass.type = 'highpass';
                highpass.frequency.value = 8000;
                
                cymbalNoise.connect(highpass);
                highpass.connect(cymbalNoiseGain);
                cymbalNoiseGain.connect(this.masterGainNode);
                cymbalNoiseGain.gain.setValueAtTime(volume / 5, now);
                cymbalNoiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
                cymbalNoise.start(now);
                
                osc.start(now);
                osc.stop(now + 0.8);
                break;
                
            case '808 Bass':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(50, now);
                osc.frequency.exponentialRampToValueAtTime(30, now + 0.7);
                gainEnvelope.gain.setValueAtTime(volume, now);
                gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
                
                osc.start(now);
                osc.stop(now + 0.7);
                break;
        }
    }
    
    playAnalogDrumSound(type, volume, now) {
        // Similar implementation but with analog characteristics
        this.playDefaultDrumSound(type, volume, now);
    }
    
    playDigitalDrumSound(type, volume, now) {
        // Similar implementation but with digital characteristics  
        this.playDefaultDrumSound(type, volume, now);
    }
    
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

    noteToFrequency(note) {
        const keyIndex = this.config.keys.indexOf(this.config.currentKey);
        const scale = this.config.scales[this.config.currentScale];
        
        // Calculate note index based on scale direction to match getNoteLabel logic
        let octave, noteIndex;
        if (this.config.isScaleInverted) {
            // When inverted, first row is the highest note
            const totalNotes = scale.length * Math.ceil(this.melodyGrid.length / scale.length);
            const invertedIndex = totalNotes - 1 - note;
            octave = Math.floor(invertedIndex / scale.length);
            noteIndex = scale[invertedIndex % scale.length];
        } else {
            // Original direction: first row is the lowest note
            octave = Math.floor(note / scale.length);
            noteIndex = scale[note % scale.length];
        }
        
        // Calculate MIDI note with octave transpose
        const baseOctave = 4;
        const finalOctave = baseOctave + octave + this.config.melodyOctaveTranspose;
        
        const frequency = 440 * Math.pow(2, (keyIndex + noteIndex + (finalOctave - 4) * 12) / 12);
        return frequency;
    }

    changePatternLength(newLength) {
        const oldLength = this.config.totalSteps;
        this.config.totalSteps = newLength;
        
        if (newLength > oldLength) {
            this.melodyGrid.forEach(row => {
                for (let i = oldLength; i < newLength; i++) {
                    row.push(false);
                }
            });
            
            this.drumGrid.forEach(row => {
                for (let i = oldLength; i < newLength; i++) {
                    row.push(false);
                }
            });
        } else if (newLength < oldLength) {
            this.melodyGrid.forEach(row => {
                row.length = newLength;
            });
            
            this.drumGrid.forEach(row => {
                row.length = newLength;
            });
        }
        
        this.renderSequencers();
    }

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
        
        if (sequence.totalSteps && sequence.totalSteps !== this.config.totalSteps) {
            this.changePatternLength(sequence.totalSteps);
        }
        
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
        
        document.getElementById('soundProfile').value = sequence.soundProfile;
        document.getElementById('scaleSelect').value = sequence.scale;
        document.getElementById('keySelect').value = sequence.key;
        document.getElementById('bpmInput').value = sequence.bpm;
        document.getElementById('swingSlider').value = sequence.swing;
        document.getElementById('melodyVolumeSlider').value = sequence.melodyVolume;
        document.getElementById('kickVolumeSlider').value = sequence.kickVolume;
        document.getElementById('snareVolumeSlider').value = sequence.snareVolume;
        document.getElementById('hihatVolumeSlider').value = sequence.hihatVolume;
        
        if (sequence.synthesis) {
            this.config.synthesis = JSON.parse(JSON.stringify(sequence.synthesis));
            this.updateSynthesisUIValues();
            document.getElementById('fmSynthToggle').checked = this.config.synthesis.fm.enabled;
        }
        
        if (sequence.effects) {
            this.config.effects = JSON.parse(JSON.stringify(sequence.effects));
            
            document.getElementById('delayToggle').checked = this.config.effects.delay.enabled;
            document.getElementById('distortionToggle').checked = this.config.effects.distortion.enabled;
            document.getElementById('reverbToggle').checked = this.config.effects.reverb.enabled;
        }
        
        if (sequence.arpeggiator) {
            this.config.arpeggiator = JSON.parse(JSON.stringify(sequence.arpeggiator));
            
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

    clearGrid(grid, sequencer) {
        grid.forEach(row => row.fill(false));
        if (sequencer) {
            sequencer.querySelectorAll('.cell').forEach(cell => cell.classList.remove('active'));
        } else {
            // If no specific sequencer provided, clear both
            document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('active'));
        }
    }

    randomizePattern() {
        // Randomize melody using actual grid length
        for (let i = 0; i < this.melodyGrid.length; i++) {
            for (let j = 0; j < this.melodyGrid[i].length; j++) {
                this.melodyGrid[i][j] = Math.random() < 0.3;
                const cell = document.querySelector(`#melodySequencer .cell[data-row="${i}"][data-col="${j}"]`);
                if (cell) {
                    cell.classList.toggle('active', this.melodyGrid[i][j]);
                }
            }
        }

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
        // Create variation in melody using actual grid length
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
        
        // Quantize melody using actual grid length
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
            }, (60000 / parseInt(document.getElementById('bpmInput').value)) * 16);
        };
        
        playNextPattern();
    }

    updateSliderValues() {
        document.getElementById('swingValue').textContent = document.getElementById('swingSlider').value;
        document.getElementById('melodyVolumeValue').textContent = document.getElementById('melodyVolumeSlider').value;
        document.getElementById('kickVolumeValue').textContent = document.getElementById('kickVolumeSlider').value;
        document.getElementById('snareVolumeValue').textContent = document.getElementById('snareVolumeSlider').value;
        document.getElementById('hihatVolumeValue').textContent = document.getElementById('hihatVolumeSlider').value;
        document.getElementById('openhatVolumeValue').textContent = document.getElementById('openhatVolumeSlider').value;
        document.getElementById('tomVolumeValue').textContent = document.getElementById('tomVolumeSlider').value;
        document.getElementById('cymbalVolumeValue').textContent = document.getElementById('cymbalVolumeSlider').value;
        document.getElementById('bass808VolumeValue').textContent = document.getElementById('bass808VolumeSlider').value;
        
        document.getElementById('delayTimeValue').textContent = document.getElementById('delayTimeSlider').value;
        document.getElementById('delayFeedbackValue').textContent = document.getElementById('delayFeedbackSlider').value;
        document.getElementById('delayMixValue').textContent = document.getElementById('delayMixSlider').value;
        
        document.getElementById('compressorThresholdValue').textContent = document.getElementById('compressorThresholdSlider').value;
        document.getElementById('compressorRatioValue').textContent = document.getElementById('compressorRatioSlider').value;
        document.getElementById('compressorAttackValue').textContent = document.getElementById('compressorAttackSlider').value;
        document.getElementById('compressorReleaseValue').textContent = document.getElementById('compressorReleaseSlider').value;
        
        document.getElementById('distortionAmountValue').textContent = document.getElementById('distortionAmountSlider').value;
        
        document.getElementById('reverbSizeValue').textContent = document.getElementById('reverbSizeSlider').value;
        document.getElementById('reverbMixValue').textContent = document.getElementById('reverbMixSlider').value;
        
        document.getElementById('lfoRateValue').textContent = document.getElementById('lfoRateSlider').value;
        document.getElementById('lfoAmountValue').textContent = document.getElementById('lfoAmountSlider').value;
        
        this.updateConfigFromUI();
        this.updateEffects();
        this.updateLfoParameters();
    }
    
    updateConfigFromUI() {
        this.config.effects.delay.time = parseFloat(document.getElementById('delayTimeSlider').value);
        this.config.effects.delay.feedback = parseFloat(document.getElementById('delayFeedbackSlider').value);
        this.config.effects.delay.mix = parseFloat(document.getElementById('delayMixSlider').value);
        
        this.config.effects.distortion.amount = parseFloat(document.getElementById('distortionAmountSlider').value);
        
        this.config.effects.reverb.size = parseFloat(document.getElementById('reverbSizeSlider').value);
        this.config.effects.reverb.mix = parseFloat(document.getElementById('reverbMixSlider').value);
        
        this.config.synthesis.lfo.rate = parseFloat(document.getElementById('lfoRateSlider').value);
        this.config.synthesis.lfo.amount = parseFloat(document.getElementById('lfoAmountSlider').value);
    }
    
    updateEffects() {
        const now = this.audioContext.currentTime;
        
        this.delayNode.delayTime.setValueAtTime(this.config.effects.delay.time / 1000, now);
        this.delayFeedback.gain.setValueAtTime(this.config.effects.delay.feedback / 100, now);
        this.delayGain.gain.setValueAtTime(
            this.config.effects.delay.enabled ? this.config.effects.delay.mix / 100 : 0, 
            now
        );
        
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
        
        if (this.config.effects.distortion.enabled) {
            this.createDistortionCurve(this.config.effects.distortion.amount);
            this.distortionGain.gain.setValueAtTime(0.5, now);
        } else {
            this.distortionGain.gain.setValueAtTime(0, now);
        }
        
        if (this.config.effects.reverb.enabled) {
            this.createReverbImpulseResponse(this.config.effects.reverb.size);
            this.reverbGain.gain.setValueAtTime(this.config.effects.reverb.mix / 100, now);
        } else {
            this.reverbGain.gain.setValueAtTime(0, now);
        }
    }
    
    updateLfoParameters() {
        const now = this.audioContext.currentTime;
        
        this.lfo.frequency.setValueAtTime(this.config.synthesis.lfo.rate, now);
        this.lfo.type = this.config.synthesis.lfo.waveform;
        
        const lfoAmount = this.config.synthesis.lfo.amount / 100;
        this.lfoGain.gain.setValueAtTime(lfoAmount, now);
        
        this.updateLfoRouting();
    }
    
    updateLfoRouting() {
        try {
            this.lfoGain.disconnect();
        } catch (e) {
            // Already disconnected, ignore
        }
        
        switch (this.config.synthesis.lfo.destination) {
            case 'pitch':
                this.config.synthesis.lfo.enabled = true;
                break;
            case 'filter':
                this.lfoGain.connect(this.delayFilter.frequency);
                this.config.synthesis.lfo.enabled = true;
                break;
            case 'amplitude':
                this.lfoGain.connect(this.masterGainNode.gain);
                this.config.synthesis.lfo.enabled = true;
                break;
            default:
                this.config.synthesis.lfo.enabled = false;
        }
    }

    drawVisualizer() {
        const visualizer = document.getElementById('visualizer');
        const visualizerContext = visualizer.getContext('2d');
        
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
    window.app = new Synthograsizer();
});