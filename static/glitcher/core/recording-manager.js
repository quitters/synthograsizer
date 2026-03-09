/**
 * @class EnhancedRecordingManager
 * @description Manages video recording with pre-rendering for consistent frame rates
 */
import { UI_ELEMENTS } from '../config/constants.js';

export class RecordingManager {
  constructor(glitcherApp) {
    this.glitcherApp = glitcherApp;
    this.canvas = document.getElementById(UI_ELEMENTS.CANVAS_ID);
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.currentFrameCount = 0;
    this.targetFrameCount = 0;
    this.requestAnimationFrameId = null;
    
    // Pre-rendering specific properties
    this.isPreRendering = false;
    this.preRenderedFrames = [];
    this.renderCanvas = null;
    this.renderContext = null;
    this.preRenderProgress = 0;

    this.initDOMElements();
    this.setupEventListeners();
    this.initRenderCanvas();

    console.log('🎥 RecordingManager initialized with pre-rendering support');
  }

  initDOMElements() {
    this.recordBtn = document.getElementById('record-btn');
    this.snapshotBtn = document.getElementById('snapshot-btn');
    this.batchExportBtn = document.getElementById('batch-export-btn');
    if (this.batchExportBtn) {
      this.batchExportBtnOriginalText = this.batchExportBtn.innerHTML;
    }
    this.framesSlider = document.getElementById('record-frames-range');
    this.framesValueDisplay = document.getElementById('record-frames-value');
    this.fpsSelect = document.getElementById('record-fps-select');
    this.reverseCheckbox = document.getElementById('reverse-checkbox');
  }

  setupEventListeners() {
    if (this.framesSlider) {
      this.framesSlider.addEventListener('input', () => {
        if (this.framesValueDisplay) {
          this.framesValueDisplay.textContent = `${this.framesSlider.value}`;
        }
      });
    }

    if (this.recordBtn) {
      // Check if shift key is held for image sequence export
      this.recordBtn.addEventListener('click', (e) => {
        if (e.shiftKey) {
          this.exportImageSequence();
        } else {
          this.startPreRenderedRecording();
        }
      });
    }

    if (this.snapshotBtn) {
      this.snapshotBtn.addEventListener('click', () => this.downloadSnapshot());
    }

    if (this.batchExportBtn) {
      this.batchExportBtn.addEventListener('click', () => this.batchExport());
    }
    
    // Add image sequence button
    this.addImageSequenceButton();
  }

  /**
   * Initialize off-screen canvas for rendering
   */
  initRenderCanvas() {
    this.renderCanvas = document.createElement('canvas');
    this.renderContext = this.renderCanvas.getContext('2d');
  }

  /**
   * Start the pre-rendered recording process
   */
  async startPreRenderedRecording() {
    if (this.isRecording || this.isPreRendering) {
      console.warn('Recording or pre-rendering already in progress.');
      return;
    }
    
    if (!this.glitcherApp.canvasManager.glitchImageData) {
      alert('Please load an image first.');
      return;
    }

    this.targetFrameCount = parseInt(this.framesSlider.value, 10);
    const targetFps = parseInt(this.fpsSelect.value, 10);
    const doReverse = this.reverseCheckbox.checked;
    
    console.log(`[RecordingManager] Starting pre-rendered recording: ${this.targetFrameCount} frames at ${targetFps} FPS`);
    
    // Update UI
    this.recordBtn.innerHTML = '⏳ Pre-rendering...';
    this.recordBtn.disabled = true;
    
    try {
      // Pre-render all frames
      await this.preRenderFrames();
      
      // Encode the pre-rendered frames
      await this.encodeFramesToVideo(targetFps, doReverse);
      
    } catch (error) {
      console.error('[RecordingManager] Recording failed:', error);
      alert('Recording failed. Check console for details.');
    } finally {
      // Reset UI
      this.recordBtn.innerHTML = '🎥 Record';
      this.recordBtn.disabled = false;
      this.isRecording = false;
      this.isPreRendering = false;
      
      // Clean up memory
      this.preRenderedFrames = [];
    }
  }

  /**
   * Pre-render all frames to memory
   */
  async preRenderFrames() {
    this.isPreRendering = true;
    this.preRenderedFrames = [];
    this.preRenderProgress = 0;
    
    // Store current state
    const originalPausedState = this.glitcherApp.isPaused;
    const originalFrameCount = this.glitcherApp.frameCount;
    const originalActiveClumps = [...this.glitcherApp.activeClumps];
    
    // Setup render canvas with same dimensions as main canvas
    const { width, height } = this.glitcherApp.canvasManager.getImageDimensions();
    this.renderCanvas.width = width;
    this.renderCanvas.height = height;
    
    // Create a clean copy of the original image data for rendering
    const originalImageData = this.glitcherApp.canvasManager.originalImageData;
    const renderImageData = new ImageData(
      new Uint8ClampedArray(originalImageData.data),
      width,
      height
    );
    
    // Temporarily replace the glitch image data
    const savedGlitchImageData = this.glitcherApp.canvasManager.glitchImageData;
    this.glitcherApp.canvasManager.glitchImageData = renderImageData;
    
    // Reset animation state for clean render
    this.glitcherApp.frameCount = 0;
    this.glitcherApp.activeClumps = [];
    
    console.log(`[RecordingManager] Pre-rendering ${this.targetFrameCount} frames...`);
    
    for (let frame = 0; frame < this.targetFrameCount; frame++) {
      // Update progress
      this.preRenderProgress = (frame / this.targetFrameCount) * 100;
      this.recordBtn.innerHTML = `⏳ Rendering: ${Math.round(this.preRenderProgress)}%`;
      
      // Simulate frame advancement
      await this.renderSingleFrame();
      
      // Capture the rendered frame
      this.renderContext.putImageData(this.glitcherApp.canvasManager.glitchImageData, 0, 0);
      
      // Convert to blob and store
      const blob = await this.canvasToBlob(this.renderCanvas);
      this.preRenderedFrames.push(blob);
      
      // Allow UI to update
      if (frame % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Restore original state
    this.glitcherApp.canvasManager.glitchImageData = savedGlitchImageData;
    this.glitcherApp.isPaused = originalPausedState;
    this.glitcherApp.frameCount = originalFrameCount;
    this.glitcherApp.activeClumps = originalActiveClumps;
    
    console.log(`[RecordingManager] Pre-rendering complete. ${this.preRenderedFrames.length} frames rendered.`);
  }

  /**
   * Render a single frame using the app's animation logic
   */
  async renderSingleFrame() {
    const app = this.glitcherApp;
    
    // Increment frame count
    app.frameCount++;
    
    // Manage selection-based clump spawning
    if (app.activeClumps.length === 0) {
      app.spawnNewClumps();
    }
    
    // Get current selection mask for effects
    const selectionMask = app.selectionManager.isInManualMode() ? 
      app.selectionManager.getSelectionMask() : null;
    
    // Process active clumps (destructive effects)
    app.activeClumps.forEach(clump => {
      if (app.testDirection !== 'off') {
        app.DirectionEffects.applyDirectionShift(
          app.canvasManager.glitchImageData,
          clump,
          app.testSpeed,
          app.testDirection,
          selectionMask
        );
      }
      
      if (app.testSpiral !== 'off') {
        let swirlType = app.testSpiral;
        if (app.testSpiral === 'spiral') {
          swirlType = app.spiralDirection;
        }
        app.SpiralEffects.applySwirlEffect(
          app.canvasManager.glitchImageData,
          clump,
          app.testSwirlStrength,
          swirlType,
          app.spiralDirection,
          selectionMask
        );
      }
      
      clump.framesRemaining--;
    });
    
    // Remove expired clumps
    app.activeClumps = app.activeClumps.filter(c => c.framesRemaining > 0);
    
    // Apply slice effects
    if (app.testSlice !== 'off') {
      app.SliceEffects.applySliceGlitch(
        app.canvasManager.glitchImageData,
        app.testSlice,
        app.testColorOffset
      );
    }
    
    // Apply pixel sort effects
    if (app.testPixelSort !== 'off' && app.frameCount % 5 === 0) {
      app.PixelSortEffects.applyPixelSort(
        app.canvasManager.glitchImageData,
        app.testPixelSort
      );
    }
    
    // Apply color effects
    if (app.testColorEffect !== 'off') {
      const newPixelData = app.ColorEffects.applyColorEffect(
        app.canvasManager.glitchImageData,
        app.testColorEffect,
        app.testColorIntensity
      );
      if (newPixelData && newPixelData !== app.canvasManager.glitchImageData.data) {
        app.canvasManager.glitchImageData.data.set(new Uint8ClampedArray(newPixelData));
      }
    }
    
    // Apply non-destructive filter effects
    if (app.filterEffect !== 'off') {
      let currentOptions = {};
      Object.assign(currentOptions, app.filterOptions);
      currentOptions.halftone = app.filterOptions.halftone;
      currentOptions.motionBlur = app.filterOptions.motionBlur;
      currentOptions.liquify = app.filterOptions.liquify;
      currentOptions.colorGrading = app.filterOptions.colorGrading;
      currentOptions.noise = app.filterOptions.noise;
      currentOptions.artisticParams = app.filterOptions.artisticParams;
      
      const filteredImageData = app.filterEffects.constructor.apply(
        app.canvasManager.glitchImageData,
        app.filterEffect,
        app.filterIntensity,
        currentOptions
      );
      
      if (filteredImageData !== app.canvasManager.glitchImageData) {
        app.canvasManager.glitchImageData.data.set(filteredImageData.data);
      }
    }
  }

  /**
   * Convert canvas to blob
   */
  canvasToBlob(canvas, type = 'image/webp', quality = 0.95) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, type, quality);
    });
  }

  /**
   * Encode pre-rendered frames to video
   */
  async encodeFramesToVideo(targetFps, doReverse) {
    console.log(`[RecordingManager] Encoding ${this.preRenderedFrames.length} frames at ${targetFps} FPS...`);
    
    this.recordBtn.innerHTML = '🎬 Encoding video...';
    
    // Create a temporary canvas for frame playback
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.renderCanvas.width;
    tempCanvas.height = this.renderCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Determine MediaRecorder options
    let options = { 
      mimeType: 'video/mp4; codecs=avc1.42E01E', 
      videoBitsPerSecond: 25000000 
    };
    
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { 
        mimeType: 'video/webm; codecs=vp9', 
        videoBitsPerSecond: 15000000 
      };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { 
          mimeType: 'video/webm', 
          videoBitsPerSecond: 15000000 
        };
      }
    }
    
    // Create stream from temporary canvas
    const stream = tempCanvas.captureStream(targetFps);
    this.mediaRecorder = new MediaRecorder(stream, options);
    this.recordedChunks = [];
    
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };
    
    // Setup completion handler
    const recordingComplete = new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: options.mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const extension = options.mimeType.includes('mp4') ? 'mp4' : 'webm';
        link.download = `glitch_recording_${this.targetFrameCount}frames_${targetFps}fps.${extension}`;
        link.click();
        URL.revokeObjectURL(url);
        resolve();
      };
    });
    
    // Start recording
    this.mediaRecorder.start();
    
    // Play back frames at exact target FPS
    const frameDuration = 1000 / targetFps;
    const frames = doReverse ? [...this.preRenderedFrames].reverse() : this.preRenderedFrames;
    
    for (let i = 0; i < frames.length; i++) {
      const frameBlob = frames[i];
      const img = await this.blobToImage(frameBlob);
      
      tempCtx.drawImage(img, 0, 0);
      
      // Update progress
      const encodeProgress = (i / frames.length) * 100;
      this.recordBtn.innerHTML = `🎬 Encoding: ${Math.round(encodeProgress)}%`;
      
      // Wait for exact frame duration
      await new Promise(resolve => setTimeout(resolve, frameDuration));
    }
    
    // Stop recording
    this.mediaRecorder.stop();
    await recordingComplete;
    
    console.log('[RecordingManager] Video encoding complete!');
  }

  /**
   * Convert blob to image
   */
  blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  downloadSnapshot() {
    if (!this.canvas) {
      console.error('RecordingManager: Canvas element not found for downloadSnapshot.');
      alert('Error: Canvas not available for snapshot.');
      return;
    }
    if (!this.glitcherApp.canvasManager.glitchImageData) {
      alert('Please load an image first.');
      return;
    }
    const dataURL = this.canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'glitch_snapshot.png';
    link.click();
    this.snapshotBtn.innerHTML = '📸 Saved!';
    setTimeout(() => { this.snapshotBtn.innerHTML = '📷 Snapshot'; }, 1500);
  }

  async batchExport() {
    if (!this.canvas) {
      console.error('RecordingManager: Canvas element not found for batchExport.');
      alert('Error: Canvas not available for batch export.');
      return;
    }
    if (!this.glitcherApp.canvasManager.originalImageData) {
      alert('Please load an image first.');
      return;
    }

    if (typeof JSZip === 'undefined') {
      try {
        await this._loadJSZip();
      } catch (error) {
        alert('Failed to load JSZip. Please check your internet connection.');
        return;
      }
    }

    const numVariations = 10;
    const zip = new JSZip();
    const imgFolder = zip.folder('glitch_variations');
    this.batchExportBtn.innerHTML = `⏳ Generating (0/${numVariations})`;
    this.batchExportBtn.disabled = true;

    const originalImageData = this.glitcherApp.canvasManager.originalImageData;
    if (!originalImageData) {
      console.error('RecordingManager: Original image data not found in CanvasManager for batchExport.');
      alert('Error: Original image data not available for batch export.');
      if (this.batchExportBtn) {
        this.batchExportBtn.innerHTML = this.batchExportBtnOriginalText || '📦 Batch Export';
        this.batchExportBtn.disabled = false;
      }
      return;
    }
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalImageData.width;
    tempCanvas.height = originalImageData.height;
    const tempCtx = tempCanvas.getContext('2d');

    for (let i = 0; i < numVariations; i++) {
      const randomParams = this._randomizeSettings();
      console.log(`[RecordingManager] Batch Export - Variation ${i+1} params:`, JSON.stringify(randomParams));
      let effectedImageData;
      try {
        effectedImageData = this._applyEffects(originalImageData, randomParams);
      } catch (e) {
        console.error(`[RecordingManager] Batch Export - Error applying effects for variation ${i+1}:`, e);
        alert(`Error during batch export on variation ${i+1}. Check console for details.`);
        this.batchExportBtn.innerHTML = this.batchExportBtnOriginalText || '📦 Batch Export';
        this.batchExportBtn.disabled = false;
        return;
      }
      if (!effectedImageData) {
        console.error(`[RecordingManager] Batch Export - _applyEffects returned null/undefined for variation ${i+1}`);
        alert(`Error: Effect application failed for variation ${i+1}. Check console.`);
        this.batchExportBtn.innerHTML = this.batchExportBtnOriginalText || '📦 Batch Export';
        this.batchExportBtn.disabled = false;
        return;
      }
      tempCtx.putImageData(effectedImageData, 0, 0);
      const dataURL = tempCanvas.toDataURL('image/png').split(',')[1];
      imgFolder.file(`variation_${i + 1}.png`, dataURL, { base64: true });
      this.batchExportBtn.innerHTML = `⏳ Generating (${i + 1}/${numVariations})`;
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = 'glitch_variations.zip';
    link.click();
    URL.revokeObjectURL(link.href);

    if (this.batchExportBtn) {
      this.batchExportBtn.innerHTML = this.batchExportBtnOriginalText || '📦 Batch Export';
    }
    this.batchExportBtn.disabled = false;
  }

  _applyEffects(imageData, params) {
    console.log('[RecordingManager] _applyEffects called with params:', JSON.stringify(params));
    const tempImageData = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
    const { direction, speed, spiral, swirlStrength, slice, colorOffset, pixelSort, colorEffect, colorIntensity } = params;

    if (direction !== 'off') {
      console.log('[RecordingManager] _applyEffects: Applying direction', direction, 'Speed:', speed);
      const clump = { x: 0, y: 0, w: tempImageData.width, h: tempImageData.height, clumpDirection: direction };
      this.glitcherApp.DirectionEffects.applyDirectionShift(tempImageData, clump, speed, direction);
    }
    if (spiral !== 'off') {
      console.log('[RecordingManager] _applyEffects: Applying spiral', spiral, 'Strength:', swirlStrength);
      const rect = { x: 0, y: 0, w: tempImageData.width, h: tempImageData.height };
      this.glitcherApp.SpiralEffects.applySwirlEffect(tempImageData, rect, swirlStrength, spiral);
    }
    if (slice !== 'off') {
      console.log('[RecordingManager] _applyEffects: Applying slice', slice, 'Offset:', colorOffset);
      this.glitcherApp.SliceEffects.applySliceGlitch(tempImageData, slice, colorOffset);
    }
    if (pixelSort !== 'off') {
      console.log('[RecordingManager] _applyEffects: Applying pixelSort', pixelSort);
      this.glitcherApp.PixelSortEffects.applyPixelSort(tempImageData, pixelSort);
    }
    if (colorEffect !== 'off') {
      console.log('[RecordingManager] _applyEffects: Applying colorEffect', colorEffect, 'Intensity:', colorIntensity);
      const returnedData = this.glitcherApp.ColorEffects.applyColorEffect(tempImageData, colorEffect, colorIntensity);
      if (returnedData && returnedData.data) {
        tempImageData.data.set(returnedData.data);
      } else if (returnedData) {
        tempImageData.data.set(returnedData);
      } else {
        console.warn('[RecordingManager] _applyEffects: colorEffects.applyColorEffect did not return valid data for effect:', colorEffect);
      }
    }
    return tempImageData;
  }

  _randomizeSettings() {
    const directions = ['off', 'left', 'right', 'up', 'down', 'jitter', 'random'];
    const spirals = ['off', 'insideOut', 'outsideIn', 'random'];
    const slices = ['off', 'horizontal', 'vertical', 'both'];
    const pixelSorts = ['off', 'row', 'column', 'randomLines', 'columnHue', 'columnBrightness'];
    const colorEffects = ['off', 'invert', 'hueShift', 'saturation', 'contrast', 'brightness', 'colorSeparation', 'vintage', 'posterize', 'threshold'];

    return {
      direction: directions[this._randomInt(0, directions.length - 1)],
      speed: this._randomInt(1, 10),
      spiral: spirals[this._randomInt(0, spirals.length - 1)],
      swirlStrength: this._randomFloat(0.01, 0.2),
      slice: slices[this._randomInt(0, slices.length - 1)],
      colorOffset: this._randomInt(1, 100),
      pixelSort: pixelSorts[this._randomInt(0, pixelSorts.length - 1)],
      colorEffect: colorEffects[this._randomInt(0, colorEffects.length - 1)],
      colorIntensity: this._randomInt(10, 100),
    };
  }

  _loadJSZip() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  _randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  _randomFloat(min, max, d = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(d)); }
  
  /**
   * Add image sequence export button
   */
  addImageSequenceButton() {
    // Check if button already exists
    if (document.getElementById('image-sequence-btn')) return;
    
    const sequenceBtn = document.createElement('button');
    sequenceBtn.id = 'image-sequence-btn';
    sequenceBtn.className = 'control-button';
    sequenceBtn.innerHTML = '🎞️ Image Sequence';
    sequenceBtn.title = 'Export as numbered image sequence (perfect quality)';
    
    sequenceBtn.addEventListener('click', () => this.exportImageSequence());
    
    // Find the record button's parent container
    const recordBtn = document.getElementById('record-btn');
    if (recordBtn && recordBtn.parentNode) {
      recordBtn.parentNode.insertBefore(sequenceBtn, recordBtn.nextSibling);
      
      // Add a small margin
      sequenceBtn.style.marginLeft = '10px';
    }
  }
  
  /**
   * Export frames as image sequence for perfect timing
   */
  async exportImageSequence() {
    if (this.isRecording || this.isPreRendering) {
      console.warn('Recording or pre-rendering already in progress.');
      return;
    }
    
    if (!this.glitcherApp.canvasManager.glitchImageData) {
      alert('Please load an image first.');
      return;
    }

    // Load JSZip if needed
    if (typeof JSZip === 'undefined') {
      try {
        await this._loadJSZip();
      } catch (error) {
        alert('Failed to load JSZip. Please check your internet connection.');
        return;
      }
    }

    this.targetFrameCount = parseInt(this.framesSlider.value, 10);
    const targetFps = parseInt(this.fpsSelect.value, 10);
    const doReverse = this.reverseCheckbox.checked;
    
    console.log(`[RecordingManager] Exporting ${this.targetFrameCount} frames as image sequence`);
    
    // Update UI
    const sequenceBtn = document.getElementById('image-sequence-btn');
    const originalText = sequenceBtn.innerHTML;
    sequenceBtn.innerHTML = '⏳ Rendering...';
    sequenceBtn.disabled = true;
    this.recordBtn.disabled = true;
    
    try {
      // Pre-render all frames
      await this.preRenderFrames();
      
      // Export as image sequence
      await this.saveImageSequence(targetFps, doReverse, sequenceBtn);
      
    } catch (error) {
      console.error('[RecordingManager] Export failed:', error);
      alert('Export failed. Check console for details.');
    } finally {
      // Reset UI
      sequenceBtn.innerHTML = originalText;
      sequenceBtn.disabled = false;
      this.recordBtn.disabled = false;
      this.isRecording = false;
      this.isPreRendering = false;
      
      // Clean up memory
      this.preRenderedFrames = [];
    }
  }
  
  /**
   * Save pre-rendered frames as image sequence
   */
  async saveImageSequence(targetFps, doReverse, sequenceBtn) {
    const zip = new JSZip();
    const framesFolder = zip.folder('frames');
    
    sequenceBtn.innerHTML = '📦 Creating ZIP...';
    
    // Get frames in correct order
    const frames = doReverse ? [...this.preRenderedFrames].reverse() : this.preRenderedFrames;
    
    // Convert frames to PNG for best quality
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.renderCanvas.width;
    tempCanvas.height = this.renderCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Add frames to ZIP
    for (let i = 0; i < frames.length; i++) {
      // Load frame as image
      const img = await this.blobToImage(frames[i]);
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.drawImage(img, 0, 0);
      
      // Convert to PNG
      const pngDataUrl = tempCanvas.toDataURL('image/png');
      const base64 = pngDataUrl.split(',')[1];
      
      // Create numbered filename
      const frameNumber = String(i).padStart(5, '0');
      const fileName = `frame_${frameNumber}.png`;
      
      framesFolder.file(fileName, base64, { base64: true });
      
      // Update progress
      const progress = ((i + 1) / frames.length) * 100;
      sequenceBtn.innerHTML = `📦 Packing: ${Math.round(progress)}%`;
      
      // Allow UI updates
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Add instructions file
    const instructions = `Glitch Art Image Sequence
========================

Frame Count: ${frames.length}
Target FPS: ${targetFps}
Duration: ${(frames.length / targetFps).toFixed(2)} seconds
Resolution: ${tempCanvas.width}x${tempCanvas.height}

To create a video from these frames:

Using FFmpeg (recommended):
---------------------------
ffmpeg -framerate ${targetFps} -i frames/frame_%05d.png -c:v libx264 -pix_fmt yuv420p -crf 18 output.mp4

For maximum quality:
ffmpeg -framerate ${targetFps} -i frames/frame_%05d.png -c:v libx264 -pix_fmt yuv420p -crf 15 -preset slow output.mp4

For smaller file size:
ffmpeg -framerate ${targetFps} -i frames/frame_%05d.png -c:v libx264 -pix_fmt yuv420p -crf 23 -preset fast output.mp4

Using Adobe After Effects:
--------------------------
1. File > Import > File
2. Select first frame (frame_00000.png)
3. Check "PNG Sequence"
4. Set frame rate to ${targetFps} FPS in Composition Settings
5. Export with desired codec

Using DaVinci Resolve:
----------------------
1. Media Pool > Import Media
2. Select all PNG files
3. Right-click > "New Timeline Using Selected Clips"
4. Set timeline frame rate to ${targetFps} FPS
5. Export with desired settings

Using Premiere Pro:
-------------------
1. File > Import
2. Select first frame, check "Image Sequence"
3. Drag to timeline
4. Right-click > Speed/Duration > Set to ${targetFps} FPS
5. Export with Media Encoder

Note: Image sequences provide perfect frame timing and maximum quality.
No frame drops or timing issues!`;
    
    zip.file('README.txt', instructions);
    
    // Generate and download ZIP
    sequenceBtn.innerHTML = '💾 Saving...';
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `glitch_sequence_${frames.length}frames_${targetFps}fps.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    console.log('[RecordingManager] Image sequence export complete!');
  }
}