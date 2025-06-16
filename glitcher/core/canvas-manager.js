/**
 * Canvas Manager for Glitcher App
 * Handles canvas operations, image loading, and basic canvas management
 */

import { calculateOptimalDimensions, copyImageData } from '../utils/image-utils.js';
import { UI_ELEMENTS } from '../config/constants.js';

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
    
    // Drag and drop functionality
    const fileUploadArea = document.querySelector('.file-upload-area');
    if (fileUploadArea) {
      fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.target.style.borderColor = '#4ecdc4';
      });

      fileUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.target.style.borderColor = 'rgba(255,255,255,0.3)';
      });

      fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.target.style.borderColor = 'rgba(255,255,255,0.3)';
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
          this.fileInput.files = files;
          this.handleFileSelect();
        }
      });
    }
  }

  /**
   * Handle file selection from input or drag/drop
   * @param {Event} e - File input event (optional)
   */
  handleFileSelect(e = null) {
    const file = this.fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => this.processLoadedImage(img);
      img.onerror = () => {
        console.error('Error loading image');
        this.showError('Failed to load image. Please try another file.');
      };
      img.src = readerEvent.target.result;
    };
    
    reader.onerror = () => {
      console.error('Error reading file');
      this.showError('Failed to read file. Please try again.');
    };
    
    reader.readAsDataURL(file);
  }

  /**
   * Process loaded image and prepare canvas
   * @param {HTMLImageElement} img - Loaded image element
   */
  processLoadedImage(img) {
    try {
      const originalW = img.width;
      const originalH = img.height;
      const { width: newWidth, height: newHeight } = calculateOptimalDimensions(originalW, originalH);

      this.imgWidth = newWidth;
      this.imgHeight = newHeight;
      this.canvas.width = this.imgWidth;
      this.canvas.height = this.imgHeight;

      // Draw image to canvas
      this.ctx.drawImage(img, 0, 0, this.imgWidth, this.imgHeight);
      
      // Store original image data
      this.originalImageData = this.ctx.getImageData(0, 0, this.imgWidth, this.imgHeight);
      
      // Create working copy for glitch effects
      this.glitchImageData = copyImageData(this.originalImageData);

      // Show canvas, hide placeholder
      this.showCanvas();
      
      // Notify callbacks that image is loaded
      this.notifyImageLoaded();
      
    } catch (error) {
      console.error('Error processing image:', error);
      this.showError('Failed to process image. Please try another file.');
    }
  }

  /**
   * Show canvas and hide placeholder
   */
  showCanvas() {
    if (this.canvas && this.canvasPlaceholder) {
      this.canvas.style.display = 'block';
      this.canvasPlaceholder.style.display = 'none';
    }
  }

  /**
   * Hide canvas and show placeholder
   */
  hideCanvas() {
    if (this.canvas && this.canvasPlaceholder) {
      this.canvas.style.display = 'none';
      this.canvasPlaceholder.style.display = 'block';
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
}
