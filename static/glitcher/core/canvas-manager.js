/**
 * Canvas Manager for Glitcher App
 * Handles canvas operations, image loading, and basic canvas management
 */

import { calculateOptimalDimensions, copyImageData } from '../utils/image-utils.js';
import { UI_ELEMENTS } from '../config/constants.js';
import { MediaManager } from './media-manager.js';

export class CanvasManager {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.canvasPlaceholder = null;
    this.fileInput = null;
    
    this.originalImageData = null;
    this.glitchImageData = null;
    this.imgWidth = 0;
    this.imgHeight = 0;
    
    this.onImageLoadCallbacks = [];
    
    // Frame management for animated media
    this.mediaManager = new MediaManager();
    this.frames = [];
    this.currentFrameIndex = 0;
    this.animationMode = false;

    // Feedback buffer for effect accumulation across frames
    this.feedbackBuffer = null;
    this.feedbackEnabled = false;
    this.feedbackMix = 0.5; // 0 = clean source only, 1 = full feedback (no source)
  }

  /**
   * Initialize canvas manager and bind DOM elements
   */
  init() {
    this.canvas = document.getElementById(UI_ELEMENTS.CANVAS_ID);
    this.ctx = this.canvas.getContext('2d');
    this.canvasPlaceholder = document.getElementById(UI_ELEMENTS.CANVAS_PLACEHOLDER_ID);
    this.fileInput = document.getElementById(UI_ELEMENTS.IMAGE_INPUT_ID);
    
    if (!this.canvas || !this.ctx) {
      throw new Error('Canvas element not found or 2D context not supported');
    }
    
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for file input and drag/drop
   */
  setupEventListeners() {
    // File input change
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    
    // Set up drag and drop for both file upload area and canvas placeholder
    const dropZones = [
      document.querySelector('.file-upload-area'),
      document.getElementById('canvas-placeholder')
    ].filter(Boolean); // Remove any null elements
    
    dropZones.forEach(dropZone => {
      if (dropZone) {
        this.setupDropZone(dropZone);
      }
    });
  }
  
  /**
   * Set up drag and drop functionality for a drop zone
   * @param {HTMLElement} dropZone - Element to set up as drop zone
   */
  setupDropZone(dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
      // For legacy file upload area, also change border color
      if (dropZone.classList.contains('file-upload-area')) {
        dropZone.style.borderColor = '#4ecdc4';
      }
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      // Only remove if we're actually leaving the element (not entering a child)
      if (!dropZone.contains(e.relatedTarget)) {
        dropZone.classList.remove('drag-over');
        if (dropZone.classList.contains('file-upload-area')) {
          dropZone.style.borderColor = 'rgba(255,255,255,0.3)';
        }
      }
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (dropZone.classList.contains('file-upload-area')) {
        dropZone.style.borderColor = 'rgba(255,255,255,0.3)';
      }
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        const type = file.type.toLowerCase();
        if (type.startsWith('image/') || type.includes('video') || type.includes('webm') || type.includes('mp4')) {
          // Create a new FileList-like object and assign to input
          const dt = new DataTransfer();
          dt.items.add(file);
          this.fileInput.files = dt.files;
          this.handleFileSelect();
        } else {
          this.showError('Please drop an image, GIF, or video file (max 20s)');
        }
      }
    });
  }

  /**
   * Handle file selection from input or drag/drop
   * @param {Event} e - File input event (optional)
   */
  async handleFileSelect(e = null) {
    const file = this.fileInput.files[0];
    if (!file) return;

    try {
      // Show loading state
      this.showLoading('Loading media...');
      
      // Load media through MediaManager
      const mediaData = await this.mediaManager.loadMedia(file);
      
      // Process based on media type
      if (this.mediaManager.mediaType === 'static') {
        this.processStaticImage(mediaData);
      } else {
        this.processAnimatedMedia(mediaData);
      }
      
      // Hide loading state
      this.hideLoading();
      
    } catch (error) {
      console.error('Error loading media:', error);
      this.showError(error.message || 'Failed to load media. Please try another file.');
      this.hideLoading();
    }
  }

  /**
   * Process static image
   * @param {Object} mediaData - Media data from MediaManager
   */
  processStaticImage(mediaData) {
    try {
      this.animationMode = false;
      this.frames = mediaData.frames;
      this.currentFrameIndex = 0;
      
      const imageData = mediaData.frames[0];
      this.imgWidth = imageData.width;
      this.imgHeight = imageData.height;
      this.canvas.width = this.imgWidth;
      this.canvas.height = this.imgHeight;
      
      // Store original image data
      this.originalImageData = imageData;
      this.glitchImageData = copyImageData(this.originalImageData);
      
      // Draw to canvas
      this.ctx.putImageData(this.glitchImageData, 0, 0);
      
      // Show canvas, hide placeholder
      this.showCanvas();
      this.hideAnimationControls();
      
      // Update UI for static image
      this.updateMediaInfo();
      
      // Notify callbacks that image is loaded
      this.notifyImageLoaded();
      
    } catch (error) {
      console.error('Error processing static image:', error);
      this.showError('Failed to process image. Please try another file.');
    }
  }
  
  /**
   * Process animated media (GIF/Video)
   * @param {Object} mediaData - Media data from MediaManager
   */
  processAnimatedMedia(mediaData) {
    try {
      this.animationMode = true;
      this.frames = mediaData.frames;
      this.currentFrameIndex = 0;
      // DEBUG: Log frame count for animated media
      console.log('[DEBUG] Loaded animated media. Frame count:', this.frames.length);
      // Set canvas dimensions based on first frame
      const firstFrame = mediaData.frames[0];
      this.imgWidth = firstFrame.width;
      this.imgHeight = firstFrame.height;
      this.canvas.width = this.imgWidth;
      this.canvas.height = this.imgHeight;
      
      // Store first frame as initial state
      this.originalImageData = firstFrame;
      this.glitchImageData = copyImageData(this.originalImageData);
      
      // Draw first frame
      this.ctx.putImageData(this.glitchImageData, 0, 0);
      
      // Show canvas and animation controls
      this.showCanvas();
      this.showAnimationControls();
      
      // Update UI for animated media
      this.updateMediaInfo();
      
      // Notify callbacks
      this.notifyImageLoaded();
      
      console.log(`Loaded ${mediaData.frames.length} frames at ${mediaData.frameRate} fps`);
      
    } catch (error) {
      console.error('Error processing animated media:', error);
      this.showError('Failed to process animated media. Please try another file.');
    }
  }

  /**
   * Show canvas and hide appropriate placeholder based on current mode
   */
  showCanvas() {
    if (this.canvas) {
      this.canvas.style.display = 'block';
      this.canvas.style.visibility = 'visible';
      this.canvas.style.width = '';
      this.canvas.style.height = '';
    }
    
    // Hide both classic and studio drop zones when image is loaded
    if (this.canvasPlaceholder) {
      this.canvasPlaceholder.style.display = 'none';
    }
    
    const studioDropZone = document.getElementById('studio-canvas-placeholder');
    if (studioDropZone) {
      studioDropZone.style.display = 'none';
    }
    
    console.log('📷 Canvas shown, drop zones hidden');
  }

  /**
   * Hide canvas and show appropriate placeholder based on current mode
   */
  hideCanvas() {
    if (this.canvas) {
      this.canvas.style.display = 'none';
      this.canvas.style.visibility = 'hidden';
      this.canvas.style.width = '0';
      this.canvas.style.height = '0';
    }
    
    // Show appropriate drop zone based on current mode
    const isStudioMode = document.body.classList.contains('studio-mode');
    
    console.log(`🔍 hideCanvas called, studio mode: ${isStudioMode}`);
    
    if (isStudioMode) {
      // Studio mode - show studio drop zone, hide classic
      if (this.canvasPlaceholder) {
        this.canvasPlaceholder.style.display = 'none';
      }
      const studioDropZone = document.getElementById('studio-canvas-placeholder');
      if (studioDropZone) {
        studioDropZone.style.display = 'block';
        console.log('🏛️ Studio drop zone shown');
      } else {
        console.warn('⚠️ Studio drop zone not found');
      }
    } else {
      // Classic mode - show classic drop zone, hide studio
      if (this.canvasPlaceholder) {
        this.canvasPlaceholder.style.display = 'block';
        console.log('🎨 Classic drop zone shown');
      }
      const studioDropZone = document.getElementById('studio-canvas-placeholder');
      if (studioDropZone) {
        studioDropZone.style.display = 'none';
      }
    }
  }

  /**
   * Reset image to original state
   */
  resetImage() {
    if (this.originalImageData) {
      this.glitchImageData = copyImageData(this.originalImageData);
      this.ctx.putImageData(this.glitchImageData, 0, 0);
    }
  }

  /**
   * Clear canvas and reset to initial state
   */
  clearCanvas() {
    this.originalImageData = null;
    this.glitchImageData = null;
    this.imgWidth = 0;
    this.imgHeight = 0;
    
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    this.hideCanvas();
  }

  /**
   * Get current canvas as data URL
   * @param {string} format - Image format ('image/png', 'image/jpeg', etc.)
   * @param {number} quality - Quality for lossy formats (0-1)
   * @returns {string} Data URL of canvas content
   */
  getCanvasDataURL(format = 'image/png', quality = 0.92) {
    return this.canvas.toDataURL(format, quality);
  }

  /**
   * Download current canvas as image
   * @param {string} filename - Download filename
   * @param {string} format - Image format
   */
  downloadCanvas(filename = 'glitch-art', format = 'image/png') {
    const link = document.createElement('a');
    link.download = `${filename}.${format.split('/')[1]}`;
    link.href = this.getCanvasDataURL(format);
    link.click();
  }

  /**
   * Add callback for when image is loaded
   * @param {Function} callback - Callback function
   */
  onImageLoad(callback) {
    this.onImageLoadCallbacks.push(callback);
  }

  /**
   * Notify all callbacks that image is loaded
   */
  notifyImageLoaded() {
    this.onImageLoadCallbacks.forEach(callback => {
      try {
        callback(this.originalImageData, this.imgWidth, this.imgHeight);
      } catch (error) {
        console.error('Error in image load callback:', error);
      }
    });
  }

  /**
   * Show error message to user
   * @param {string} message - Error message
   */
  showError(message) {
    // For now, just console.error - could be enhanced with UI notifications
    console.error(message);
    // TODO: Implement user-facing error display
  }

  /**
   * Get canvas coordinates from mouse event
   * @param {MouseEvent} e - Mouse event
   * @returns {Object} {x, y} canvas coordinates
   */
  getCanvasCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.imgWidth / rect.width;
    const scaleY = this.imgHeight / rect.height;
    
    return {
      x: Math.floor((e.clientX - rect.left) * scaleX),
      y: Math.floor((e.clientY - rect.top) * scaleY)
    };
  }

  /**
   * Check if image is loaded
   * @returns {boolean} True if image is loaded
   */
  isImageLoaded() {
    return this.originalImageData !== null;
  }

  /**
   * Get image dimensions
   * @returns {Object} {width, height} or null if no image loaded
   */
  getImageDimensions() {
    if (!this.isImageLoaded()) return null;
    return { width: this.imgWidth, height: this.imgHeight };
  }
  
  /**
   * Set frames for animated media
   * @param {Array<ImageData>} frames - Array of frame data
   */
  setFrames(frames) {
    this.frames = frames;
    this.animationMode = frames.length > 1;
  }
  
  /**
   * Get current frame
   * @returns {ImageData} Current frame data
   */
  getCurrentFrame() {
    return this.frames[this.currentFrameIndex] || this.originalImageData;
  }
  
  /**
   * Set current frame by index
   * @param {number} index - Frame index
   */
  setCurrentFrame(index) {
    if (index >= 0 && index < this.frames.length) {
      this.currentFrameIndex = index;
      this.originalImageData = this.frames[index];
      // When feedback is enabled, blending is handled in the animate loop
      if (!this.feedbackEnabled) {
        this.glitchImageData = copyImageData(this.originalImageData);
      }
    }
  }
  
  /**
   * Blend feedback buffer with current source frame into glitchImageData.
   * mix=0 → pure source, mix=1 → pure feedback (no new source information)
   */
  applyFeedbackBlend() {
    const src = this.originalImageData.data;
    const fb = this.feedbackBuffer.data;
    const out = this.glitchImageData.data;
    const mix = this.feedbackMix;
    const inv = 1 - mix;
    for (let i = 0; i < src.length; i += 4) {
      out[i]     = (fb[i]     * mix + src[i]     * inv) | 0;
      out[i + 1] = (fb[i + 1] * mix + src[i + 1] * inv) | 0;
      out[i + 2] = (fb[i + 2] * mix + src[i + 2] * inv) | 0;
      out[i + 3] = 255;
    }
  }

  /**
   * Store the current output as the feedback buffer for the next frame.
   */
  captureFeedback(imageData) {
    this.feedbackBuffer = copyImageData(imageData);
  }

  /**
   * Advance to next frame
   */
  advanceFrame() {
    if (this.animationMode && this.frames.length > 1) {
      this.currentFrameIndex = (this.currentFrameIndex + 1) % this.frames.length;
      this.setCurrentFrame(this.currentFrameIndex);
    }
  }
  
  /**
   * Update media info in UI
   */
  updateMediaInfo() {
    const mediaInfo = this.mediaManager.getMediaInfo();
    
    // Show media info container
    const mediaInfoContainer = document.querySelector('.media-info');
    if (mediaInfoContainer) {
      mediaInfoContainer.style.display = 'block';
    }
    
    // Update media type display
    const mediaTypeEl = document.getElementById('media-type');
    if (mediaTypeEl) {
      mediaTypeEl.textContent = mediaInfo.type === 'static' ? 'Static Image' : 
                               mediaInfo.type === 'gif' ? 'GIF Animation' : 'Video';
    }
    
    // Update frame info
    const frameInfoEl = document.getElementById('frame-info');
    const currentFrameEl = document.getElementById('current-frame');
    const totalFramesEl = document.getElementById('total-frames');
    
    if (frameInfoEl && mediaInfo.frameCount > 1) {
      frameInfoEl.style.display = 'inline';
      if (currentFrameEl) currentFrameEl.textContent = mediaInfo.currentFrame;
      if (totalFramesEl) totalFramesEl.textContent = mediaInfo.frameCount;
    } else if (frameInfoEl) {
      frameInfoEl.style.display = 'none';
    }
    
    // Update duration info
    const durationEl = document.getElementById('media-duration');
    if (durationEl && mediaInfo.duration > 0) {
      durationEl.textContent = `${mediaInfo.duration.toFixed(1)}s`;
    }
  }
  
  /**
   * Show animation controls
   */
  showAnimationControls() {
    const animationControls = document.getElementById('animation-controls');
    if (animationControls) {
      animationControls.style.display = 'block';
    }
  }

  /**
   * Hide animation controls
   */
  hideAnimationControls() {
    const animationControls = document.getElementById('animation-controls');
    if (animationControls) {
      animationControls.style.display = 'none';
    }
  }
  
  /**
   * Show loading indicator
   * @param {string} message - Loading message
   */
  showLoading(message = 'Loading...') {
    // Create or update loading overlay
    let loadingEl = document.getElementById('loading-overlay');
    if (!loadingEl) {
      loadingEl = document.createElement('div');
      loadingEl.id = 'loading-overlay';
      loadingEl.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        color: white;
        font-size: 20px;
      `;
      document.body.appendChild(loadingEl);
    }
    loadingEl.textContent = message;
    loadingEl.style.display = 'flex';
  }
  
  /**
   * Hide loading indicator
   */
  hideLoading() {
    const loadingEl = document.getElementById('loading-overlay');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  }

  /**
   * Update media info display
   */
  updateMediaInfo() {
    // Update frame counter
    const currentFrameEl = document.getElementById('current-frame');
    const totalFramesEl = document.getElementById('total-frames');
    
    if (currentFrameEl && totalFramesEl) {
      currentFrameEl.textContent = this.currentFrameIndex + 1;
      totalFramesEl.textContent = this.frames.length;
    }

    // Update media duration
    const mediaDurationEl = document.getElementById('media-duration');
    if (mediaDurationEl && this.mediaManager) {
      const mediaInfo = this.mediaManager.getMediaInfo();
      const duration = mediaInfo.duration || 0;
      mediaDurationEl.textContent = `${duration.toFixed(1)}s`;
    }
  }

  /**
   * Set current frame for animated media
   * @param {number} frameIndex - Frame index to set
   */
  setCurrentFrame(frameIndex) {
    if (this.frames && frameIndex >= 0 && frameIndex < this.frames.length) {
      this.currentFrameIndex = frameIndex;
      this.originalImageData = this.frames[frameIndex];
      this.glitchImageData = copyImageData(this.originalImageData);
    }
  }
}
