/**
 * SynthograsizerDAW Extensions
 * Additional methods and functionality for the refactored Synthograsizer class
 * This file should be included after the main class file
 */

// Extend the Synthograsizer prototype with additional synthesis control methods
Synthograsizer.prototype.setupSynthesisControls = function() {
    // FM Synthesis controls
    this.setupFMControls();
    
    // ADSR Envelope controls
    this.setupEnvelopeControls();
    
    // Filter controls
    this.setupFilterControls();
    
    // LFO controls
    this.setupLFOControls();
    
    // Voice controls
    this.setupVoiceControls();
    
    // Arpeggiator controls
    this.setupArpeggiatorControls();
};

Synthograsizer.prototype.setupFMControls = function() {
    // Carrier waveform
    const carrierWaveform = document.getElementById('carrierWaveform');
    if (carrierWaveform) {
        carrierWaveform.addEventListener('change', (e) => {
            this.config.synthesis.fm.carrierWaveform = e.target.value;
        });
    }
    
    // Modulator waveform
    const modulatorWaveform = document.getElementById('modulatorWaveform');
    if (modulatorWaveform) {
        modulatorWaveform.addEventListener('change', (e) => {
            this.config.synthesis.fm.modulatorWaveform = e.target.value;
        });
    }
    
    // Modulation index
    const modulationIndexSlider = document.getElementById('modulationIndexSlider');
    if (modulationIndexSlider) {
        modulationIndexSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.synthesis.fm.modulationIndex = value;
            document.getElementById('modulationIndexValue').textContent = value;
        });
    }
    
    // Modulation ratio
    const modulationRatioSlider = document.getElementById('modulationRatioSlider');
    if (modulationRatioSlider) {
        modulationRatioSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.config.synthesis.fm.modulationRatio = value;
            document.getElementById('modulationRatioValue').textContent = value;
        });
    }
};

Synthograsizer.prototype.setupEnvelopeControls = function() {
    // Attack
    const attackSlider = document.getElementById('attackSlider');
    if (attackSlider) {
        attackSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.synthesis.envelope.attack = value;
            document.getElementById('attackValue').textContent = value;
        });
    }
    
    // Decay
    const decaySlider = document.getElementById('decaySlider');
    if (decaySlider) {
        decaySlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.synthesis.envelope.decay = value;
            document.getElementById('decayValue').textContent = value;
        });
    }
    
    // Sustain
    const sustainSlider = document.getElementById('sustainSlider');
    if (sustainSlider) {
        sustainSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.synthesis.envelope.sustain = value;
            document.getElementById('sustainValue').textContent = value;
        });
    }
    
    // Release
    const releaseSlider = document.getElementById('releaseSlider');
    if (releaseSlider) {
        releaseSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.synthesis.envelope.release = value;
            document.getElementById('releaseValue').textContent = value;
        });
    }
};

Synthograsizer.prototype.setupFilterControls = function() {
    // Filter type
    const filterTypeSelect = document.getElementById('filterTypeSelect');
    if (filterTypeSelect) {
        filterTypeSelect.addEventListener('change', (e) => {
            this.config.synthesis.filter.type = e.target.value;
        });
    }
    
    // Filter frequency
    const filterFreqSlider = document.getElementById('filterFreqSlider');
    if (filterFreqSlider) {
        filterFreqSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.synthesis.filter.frequency = value;
            document.getElementById('filterFreqValue').textContent = value;
        });
    }
    
    // Filter Q (resonance)
    const filterQSlider = document.getElementById('filterQSlider');
    if (filterQSlider) {
        filterQSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.config.synthesis.filter.resonance = value;
            document.getElementById('filterQValue').textContent = value;
        });
    }
    
    // Filter envelope amount
    const filterEnvSlider = document.getElementById('filterEnvSlider');
    if (filterEnvSlider) {
        filterEnvSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.synthesis.filter.envelopeAmount = value;
            document.getElementById('filterEnvValue').textContent = value;
        });
    }
};

Synthograsizer.prototype.setupLFOControls = function() {
    // LFO waveform
    const lfoWaveform = document.getElementById('lfoWaveform');
    if (lfoWaveform) {
        lfoWaveform.addEventListener('change', (e) => {
            this.config.synthesis.lfo.waveform = e.target.value;
            if (this.lfo && this.lfo.oscillator) {
                this.lfo.oscillator.type = e.target.value;
            }
        });
    }
    
    // LFO rate
    const lfoRateSlider = document.getElementById('lfoRateSlider');
    if (lfoRateSlider) {
        lfoRateSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.config.synthesis.lfo.rate = value;
            document.getElementById('lfoRateValue').textContent = value;
            if (this.lfo && this.lfo.oscillator) {
                this.lfo.oscillator.frequency.value = value;
            }
        });
    }
    
    // LFO amount
    const lfoAmountSlider = document.getElementById('lfoAmountSlider');
    if (lfoAmountSlider) {
        lfoAmountSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.synthesis.lfo.amount = value;
            document.getElementById('lfoAmountValue').textContent = value;
            if (this.lfo && this.lfo.gain) {
                this.lfo.gain.gain.value = value / 100;
            }
        });
    }
    
    // LFO destination
    const lfoDestination = document.getElementById('lfoDestination');
    if (lfoDestination) {
        lfoDestination.addEventListener('change', (e) => {
            this.config.synthesis.lfo.destination = e.target.value;
            // TODO: Reconnect LFO to new destination
        });
    }
};

Synthograsizer.prototype.setupVoiceControls = function() {
    // Polyphony toggle
    const polyphonyToggle = document.getElementById('polyphonyToggle');
    if (polyphonyToggle) {
        polyphonyToggle.addEventListener('change', (e) => {
            this.config.synthesis.voice.polyphony = e.target.checked;
        });
    }
    
    // Unison voices
    const unisonSelect = document.getElementById('unisonSelect');
    if (unisonSelect) {
        unisonSelect.addEventListener('change', (e) => {
            this.config.synthesis.voice.unison = parseInt(e.target.value);
        });
    }
    
    // Detune
    const detuneSlider = document.getElementById('detuneSlider');
    if (detuneSlider) {
        detuneSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.synthesis.voice.detune = value;
            document.getElementById('detuneValue').textContent = value;
        });
    }
    
    // Portamento
    const portamentoSlider = document.getElementById('portamentoSlider');
    if (portamentoSlider) {
        portamentoSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.synthesis.voice.portamento = value;
            document.getElementById('portamentoValue').textContent = value;
        });
    }
};

Synthograsizer.prototype.setupArpeggiatorControls = function() {
    // Arpeggiator toggle
    const arpToggle = document.getElementById('arpToggle');
    if (arpToggle) {
        arpToggle.addEventListener('change', (e) => {
            this.config.arpeggiator.enabled = e.target.checked;
        });
    }
    
    // Arpeggiator pattern
    const arpPatternSelect = document.getElementById('arpPatternSelect');
    if (arpPatternSelect) {
        arpPatternSelect.addEventListener('change', (e) => {
            this.config.arpeggiator.pattern = e.target.value;
        });
    }
    
    // Arpeggiator rate
    const arpRateSelect = document.getElementById('arpRateSelect');
    if (arpRateSelect) {
        arpRateSelect.addEventListener('change', (e) => {
            this.config.arpeggiator.rate = parseInt(e.target.value);
        });
    }
    
    // Arpeggiator octaves
    const arpOctaveSlider = document.getElementById('arpOctaveSlider');
    if (arpOctaveSlider) {
        arpOctaveSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.arpeggiator.octaves = value;
            document.getElementById('arpOctaveValue').textContent = value;
        });
    }
};

// Setup remaining effect controls
Synthograsizer.prototype.setupDistortionControls = function() {
    const toggle = document.getElementById('distortionToggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            this.config.effects.distortion.enabled = e.target.checked;
            this.updateDistortionEffect();
        });
    }
    
    const amountSlider = document.getElementById('distortionAmountSlider');
    if (amountSlider) {
        amountSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.effects.distortion.amount = value;
            document.getElementById('distortionAmountValue').textContent = value;
            this.updateDistortionCurve(value);
            this.updateDistortionEffect();
        });
    }
};

Synthograsizer.prototype.updateDistortionEffect = function() {
    if (!this.distortion) return;
    
    const enabled = this.config.effects.distortion.enabled;
    const mix = this.config.effects.distortion.mix;
    
    this.distortion.wetGain.gain.value = enabled ? mix : 0;
    this.distortion.dryGain.gain.value = enabled ? (1 - mix) : 1;
};

Synthograsizer.prototype.setupReverbControls = function() {
    const toggle = document.getElementById('reverbToggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            this.config.effects.reverb.enabled = e.target.checked;
            this.updateReverbEffect();
        });
    }
    
    const sizeSlider = document.getElementById('reverbSizeSlider');
    if (sizeSlider) {
        sizeSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.effects.reverb.size = value / 100;
            document.getElementById('reverbSizeValue').textContent = value;
            this.createReverbImpulse(this.config.effects.reverb.size);
        });
    }
    
    const mixSlider = document.getElementById('reverbMixSlider');
    if (mixSlider) {
        mixSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.effects.reverb.mix = value / 100;
            document.getElementById('reverbMixValue').textContent = value;
            this.updateReverbEffect();
        });
    }
};

Synthograsizer.prototype.updateReverbEffect = function() {
    if (!this.reverb) return;
    
    const enabled = this.config.effects.reverb.enabled;
    const mix = this.config.effects.reverb.mix;
    
    this.reverb.wetGain.gain.value = enabled ? mix : 0;
    this.reverb.dryGain.gain.value = enabled ? (1 - mix) : 1;
};

Synthograsizer.prototype.setupCompressorControls = function() {
    const thresholdSlider = document.getElementById('compressorThresholdSlider');
    if (thresholdSlider) {
        thresholdSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.effects.compressor.threshold = value;
            document.getElementById('compressorThresholdValue').textContent = value;
            if (this.compressor) {
                this.compressor.threshold.value = value;
            }
        });
    }
    
    const ratioSlider = document.getElementById('compressorRatioSlider');
    if (ratioSlider) {
        ratioSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.effects.compressor.ratio = value;
            document.getElementById('compressorRatioValue').textContent = value;
            if (this.compressor) {
                this.compressor.ratio.value = value;
            }
        });
    }
    
    const attackSlider = document.getElementById('compressorAttackSlider');
    if (attackSlider) {
        attackSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.effects.compressor.attack = value / 1000;
            document.getElementById('compressorAttackValue').textContent = value;
            if (this.compressor) {
                this.compressor.attack.value = this.config.effects.compressor.attack;
            }
        });
    }
    
    const releaseSlider = document.getElementById('compressorReleaseSlider');
    if (releaseSlider) {
        releaseSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.config.effects.compressor.release = value / 1000;
            document.getElementById('compressorReleaseValue').textContent = value;
            if (this.compressor) {
                this.compressor.release.value = this.config.effects.compressor.release;
            }
        });
    }
};

// Visualization methods
Synthograsizer.prototype.startVisualization = function() {
    const canvas = document.getElementById('visualizer');
    if (!canvas) return;
    
    this.visualizerCanvas = canvas;
    this.visualizerCtx = canvas.getContext('2d');
    
    // Set canvas size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Start animation
    this.animateVisualizer();
};

Synthograsizer.prototype.resizeCanvas = function() {
    if (!this.visualizerCanvas) return;
    
    const rect = this.visualizerCanvas.getBoundingClientRect();
    this.visualizerCanvas.width = rect.width;
    this.visualizerCanvas.height = rect.height;
};

Synthograsizer.prototype.animateVisualizer = function() {
    if (!this.analyzer || !this.visualizerCtx) return;
    
    const bufferLength = this.analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
        requestAnimationFrame(draw);
        
        this.analyzer.getByteFrequencyData(dataArray);
        
        const ctx = this.visualizerCtx;
        const width = this.visualizerCanvas.width;
        const height = this.visualizerCanvas.height;
        
        // Clear canvas
        ctx.fillStyle = 'rgb(245, 245, 245)';
        ctx.fillRect(0, 0, width, height);
        
        // Draw frequency bars
        const barWidth = (width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            barHeight = (dataArray[i] / 255) * height;
            
            const r = 94 + (dataArray[i] / 255) * 50;
            const g = 96 - (dataArray[i] / 255) * 50;
            const b = 206;
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(x, height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
    };
    
    draw();
};

// Pattern management implementation
Synthograsizer.prototype.savePattern = function(type) {
    const pattern = {
        type: type,
        timestamp: Date.now(),
        config: {
            key: this.config.currentKey,
            scale: this.config.currentScale,
            bpm: this.config.bpm,
            melodySteps: this.config.melodySteps,
            drumSteps: this.config.drumSteps
        },
        data: type === 'melody' ? 
            JSON.parse(JSON.stringify(this.melodyGrid)) : 
            JSON.parse(JSON.stringify(this.drumGrid))
    };
    
    this.savedPatterns.push(pattern);
    this.currentPatternIndex = this.savedPatterns.length - 1;
    this.updatePatternDisplay();
    
    console.log(`Saved ${type} pattern:`, pattern);
};

Synthograsizer.prototype.loadPattern = function(index) {
    if (index < 0 || index >= this.savedPatterns.length) return;
    
    const pattern = this.savedPatterns[index];
    
    // Update configuration
    this.config.currentKey = pattern.config.key;
    this.config.currentScale = pattern.config.scale;
    this.config.bpm = pattern.config.bpm;
    
    // Update UI
    document.getElementById('keySelect').value = pattern.config.key;
    document.getElementById('scaleSelect').value = pattern.config.scale;
    document.getElementById('bpmInput').value = pattern.config.bpm;
    
    // Load pattern data
    if (pattern.type === 'melody') {
        this.config.melodySteps = pattern.config.melodySteps;
        this.melodyGrid = JSON.parse(JSON.stringify(pattern.data));
        document.getElementById('melodyPatternLengthSelect').value = pattern.config.melodySteps;
    } else {
        this.config.drumSteps = pattern.config.drumSteps;
        this.drumGrid = JSON.parse(JSON.stringify(pattern.data));
        document.getElementById('drumPatternLengthSelect').value = pattern.config.drumSteps;
    }
    
    this.currentPatternIndex = index;
    this.renderSequencers();
};

Synthograsizer.prototype.updatePatternDisplay = function() {
    const container = document.getElementById('savedSequences');
    if (!container) return;
    
    container.innerHTML = '';
    
    this.savedPatterns.forEach((pattern, index) => {
        const item = document.createElement('div');
        item.className = 'sequence-item';
        
        const button = document.createElement('button');
        button.className = 'sequence-button';
        button.textContent = `${pattern.type.charAt(0).toUpperCase()}${index + 1}`;
        button.title = `${pattern.type} pattern ${index + 1}`;
        
        if (index === this.currentPatternIndex) {
            button.classList.add('active');
        }
        
        button.addEventListener('click', () => this.loadPattern(index));
        
        const addToChainBtn = document.createElement('button');
        addToChainBtn.className = 'small-button';
        addToChainBtn.textContent = '+';
        addToChainBtn.title = 'Add to chain';
        addToChainBtn.addEventListener('click', () => this.addToChain(index));
        
        item.appendChild(button);
        item.appendChild(addToChainBtn);
        container.appendChild(item);
    });
};

Synthograsizer.prototype.addToChain = function(patternIndex) {
    this.chainedPatterns.push(patternIndex);
    this.updateChainDisplay();
};

Synthograsizer.prototype.updateChainDisplay = function() {
    const container = document.getElementById('chainDisplay');
    if (!container) return;
    
    if (this.chainedPatterns.length === 0) {
        container.textContent = 'No patterns in chain';
        return;
    }
    
    container.innerHTML = this.chainedPatterns
        .map((index, i) => {
            const pattern = this.savedPatterns[index];
            return `<span class="chain-item">${pattern.type.charAt(0).toUpperCase()}${index + 1}</span>`;
        })
        .join(' → ');
};

Synthograsizer.prototype.playChain = function() {
    if (this.chainedPatterns.length === 0) {
        console.log('No patterns in chain');
        return;
    }
    
    // Load first pattern
    this.loadPattern(this.chainedPatterns[0]);
    
    // Remove first pattern from chain (it's now loaded)
    this.chainedPatterns.shift();
    this.updateChainDisplay();
    
    // Start playback
    this.play();
};

Synthograsizer.prototype.loadNextChainedPattern = function() {
    if (this.chainedPatterns.length > 0) {
        const nextIndex = this.chainedPatterns.shift();
        this.loadPattern(nextIndex);
        this.updateChainDisplay();
    }
};

// Export/Import functionality
Synthograsizer.prototype.exportCurrent = function() {
    const exportData = {
        version: '1.0',
        type: 'pattern',
        created: new Date().toISOString(),
        config: {
            key: this.config.currentKey,
            scale: this.config.currentScale,
            bpm: this.config.bpm,
            melodySteps: this.config.melodySteps,
            drumSteps: this.config.drumSteps,
            synthesis: this.config.synthesis,
            effects: this.config.effects
        },
        melody: this.melodyGrid,
        drums: this.drumGrid
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `synthograsizer-pattern-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

Synthograsizer.prototype.exportChain = function() {
    if (this.chainedPatterns.length === 0) {
        console.log('No chain to export');
        return;
    }
    
    const chainData = {
        version: '1.0',
        type: 'chain',
        created: new Date().toISOString(),
        patterns: this.chainedPatterns.map(index => this.savedPatterns[index])
    };
    
    const blob = new Blob([JSON.stringify(chainData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `synthograsizer-chain-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

Synthograsizer.prototype.importPattern = function(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.type === 'pattern') {
                // Import single pattern
                this.importSinglePattern(data);
            } else if (data.type === 'chain') {
                // Import chain
                this.importChain(data);
            } else {
                console.error('Unknown import type:', data.type);
            }
        } catch (error) {
            console.error('Failed to import:', error);
            alert('Failed to import file. Please check the file format.');
        }
    };
    
    reader.readAsText(file);
};

Synthograsizer.prototype.importSinglePattern = function(data) {
    // Update configuration
    this.config.currentKey = data.config.key;
    this.config.currentScale = data.config.scale;
    this.config.bpm = data.config.bpm;
    this.config.melodySteps = data.config.melodySteps;
    this.config.drumSteps = data.config.drumSteps;
    
    // Import synthesis and effects settings if available
    if (data.config.synthesis) {
        Object.assign(this.config.synthesis, data.config.synthesis);
    }
    if (data.config.effects) {
        Object.assign(this.config.effects, data.config.effects);
    }
    
    // Import grids
    this.melodyGrid = data.melody;
    this.drumGrid = data.drums;
    
    // Update UI
    this.renderSequencers();
    this.updateAllUIValues();
    
    console.log('Pattern imported successfully');
};

Synthograsizer.prototype.importChain = function(data) {
    // Add all patterns to saved patterns
    const startIndex = this.savedPatterns.length;
    
    data.patterns.forEach(pattern => {
        this.savedPatterns.push(pattern);
    });
    
    // Create chain with new indices
    this.chainedPatterns = data.patterns.map((_, i) => startIndex + i);
    
    // Update displays
    this.updatePatternDisplay();
    this.updateChainDisplay();
    
    console.log('Chain imported successfully');
};

Synthograsizer.prototype.updateAllUIValues = function() {
    // Update all UI elements to match current configuration
    document.getElementById('keySelect').value = this.config.currentKey;
    document.getElementById('scaleSelect').value = this.config.currentScale;
    document.getElementById('bpmInput').value = this.config.bpm;
    document.getElementById('melodyPatternLengthSelect').value = this.config.melodySteps;
    document.getElementById('drumPatternLengthSelect').value = this.config.drumSteps;
    
    // Update synthesis parameters
    document.getElementById('soundProfile').value = this.config.synthesis.waveform;
    document.getElementById('fmSynthToggle').checked = this.config.synthesis.fm.enabled;
    
    // Update all sliders
    this.updateSliderUIValues();
};

Synthograsizer.prototype.updateSliderUIValues = function() {
    // Helper function to update slider and display
    const updateSlider = (sliderId, displayId, value, multiplier = 1) => {
        const slider = document.getElementById(sliderId);
        const display = document.getElementById(displayId);
        if (slider) slider.value = value * multiplier;
        if (display) display.textContent = Math.round(value * multiplier);
    };
    
    // Volume sliders
    updateSlider('melodyVolumeSlider', 'melodyVolumeValue', this.config.volumes.melody, 100);
    
    // Effect sliders
    updateSlider('delayTimeSlider', 'delayTimeValue', this.config.effects.delay.time, 1000);
    updateSlider('delayFeedbackSlider', 'delayFeedbackValue', this.config.effects.delay.feedback, 100);
    updateSlider('delayMixSlider', 'delayMixValue', this.config.effects.delay.mix, 100);
    
    // Synthesis sliders
    updateSlider('attackSlider', 'attackValue', this.config.synthesis.envelope.attack);
    updateSlider('decaySlider', 'decayValue', this.config.synthesis.envelope.decay);
    updateSlider('sustainSlider', 'sustainValue', this.config.synthesis.envelope.sustain);
    updateSlider('releaseSlider', 'releaseValue', this.config.synthesis.envelope.release);
    
    // Update toggles
    document.getElementById('delayToggle').checked = this.config.effects.delay.enabled;
    document.getElementById('distortionToggle').checked = this.config.effects.distortion.enabled;
    document.getElementById('reverbToggle').checked = this.config.effects.reverb.enabled;
};

// Quantization implementation
Synthograsizer.prototype.quantizePattern = function() {
    const quantizeGrid = (grid, steps) => {
        return grid.map(row => {
            const newRow = Array(steps).fill(false);
            
            // Find active cells and quantize them
            row.forEach((cell, index) => {
                if (cell) {
                    // Find nearest quantize position
                    const quantizedIndex = Math.round(index / this.quantizeValue) * this.quantizeValue;
                    if (quantizedIndex < steps) {
                        newRow[quantizedIndex] = true;
                    }
                }
            });
            
            return newRow;
        });
    };
    
    // Quantize both grids
    this.melodyGrid = quantizeGrid(this.melodyGrid, this.config.melodySteps);
    this.drumGrid = quantizeGrid(this.drumGrid, this.config.drumSteps);
    
    // Re-render
    this.renderSequencers();
    
    console.log(`Patterns quantized to 1/${this.quantizeValue} notes`);
};
