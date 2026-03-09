/**
 * MediaManager - Handles different media types (static images, GIFs, videos)
 * Manages frame extraction, playback, and media metadata
 */
import { GIFLoader } from '../utils/gif-loader.js';
import { VideoLoader } from '../utils/video-loader.js';

export class MediaManager {
  constructor() {
    this.mediaType = 'static'; // 'static', 'gif', 'video'
    this.frames = [];
    this.currentFrame = 0;
    this.frameRate = 30;
    this.isPlaying = false;
    this.originalFrames = []; // Backup for reset
    this.playbackMode = 'loop'; // 'loop' or 'ping-pong'
    this.direction = 1; // 1 for forward, -1 for reverse (ping-pong mode)
    this.maxDuration = 20; // 20 second limit
    this.duration = 0;
    this.width = 0;
    this.height = 0;
  }
  
  /**
   * Load media file and extract frames based on type
   * @param {File} file - The media file to load
   * @returns {Promise} Resolves when media is loaded
   */
  async loadMedia(file) {
    const fileType = this.detectMediaType(file);
    
    try {
      let result;
      switch(fileType) {
        case 'gif':
          result = await this.loadGIF(file);
          break;
        case 'video':
          result = await this.loadVideo(file);
          break;
        default:
          result = await this.loadStaticImage(file);
      }
      
      this.mediaType = fileType;
      return result;
    } catch (error) {
      throw new Error(`Failed to load ${fileType}: ${error.message}`);
    }
  }
  
  /**
   * Detect media type from file
   * @param {File} file - The file to check
   * @returns {string} Media type: 'static', 'gif', or 'video'
   */
  detectMediaType(file) {
    const type = file.type.toLowerCase();
    
    if (type.includes('gif')) {
      return 'gif';
    } else if (type.includes('video') || type.includes('webm') || type.includes('mp4')) {
      return 'video';
    }
    
    return 'static';
  }
  
  /**
   * Load static image
   * @param {File} file - Image file
   * @returns {Promise<Object>} Image data
   */
  async loadStaticImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        this.frames = [imageData];
        this.originalFrames = [this.cloneImageData(imageData)];
        this.width = img.width;
        this.height = img.height;
        this.duration = 0;
        this.currentFrame = 0;
        
        resolve({
          frames: this.frames,
          width: this.width,
          height: this.height,
          duration: 0,
          frameRate: 1
        });
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }
  
  /**
   * Load GIF file
   * @param {File} file - GIF file
   * @returns {Promise<Object>} GIF data with frames
   */
  async loadGIF(file) {
    try {
      const result = await GIFLoader.loadGIF(file);
      
      // Validate duration
      this.validateDuration(result.duration);
      
      // Store frames and metadata
      this.frames = result.frames;
      this.originalFrames = result.frames.map(frame => this.cloneImageData(frame));
      this.frameRate = result.frameRate;
      this.duration = result.duration;
      this.width = result.width;
      this.height = result.height;
      this.currentFrame = 0;
      
      return result;
    } catch (error) {
      // Fallback to basic GIF loading if library not available
      if (error.message.includes('libgif-js')) {
        console.warn('libgif-js not found, using basic GIF loading');
        return GIFLoader.loadGIFBasic(file).then(result => {
          this.frames = result.frames;
          this.originalFrames = result.frames.map(frame => this.cloneImageData(frame));
          this.frameRate = result.frameRate;
          this.duration = result.duration;
          this.width = result.width;
          this.height = result.height;
          this.currentFrame = 0;
          return result;
        });
      }
      throw error;
    }
  }
  
  /**
   * Load video file
   * @param {File} file - Video file
   * @returns {Promise<Object>} Video data with frames
   */
  async loadVideo(file) {
    const result = await VideoLoader.loadVideo(file);
    
    // Store frames and metadata
    this.frames = result.frames;
    this.originalFrames = result.frames.map(frame => this.cloneImageData(frame));
    this.frameRate = result.frameRate;
    this.duration = result.duration;
    this.width = result.width;
    this.height = result.height;
    this.currentFrame = 0;
    
    return result;
  }
  
  /**
   * Set playback mode
   * @param {string} mode - 'loop' or 'ping-pong'
   */
  setPlaybackMode(mode) {
    if (['loop', 'ping-pong'].includes(mode)) {
      this.playbackMode = mode;
      this.direction = 1; // Reset direction when changing modes
    }
  }
  
  /**
   * Advance to next frame based on playback mode
   */
  advanceFrame() {
    if (this.frames.length <= 1) return;
    
    if (this.playbackMode === 'loop') {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    } else if (this.playbackMode === 'ping-pong') {
      this.currentFrame += this.direction;
      
      // Reverse direction at boundaries
      if (this.currentFrame >= this.frames.length - 1) {
        this.direction = -1;
        this.currentFrame = this.frames.length - 1;
      } else if (this.currentFrame <= 0) {
        this.direction = 1;
        this.currentFrame = 0;
      }
    }
  }
  
  /**
   * Get current frame data
   * @returns {ImageData|null} Current frame or null
   */
  getCurrentFrame() {
    return this.frames[this.currentFrame] || null;
  }
  
  /**
   * Get original frame data (unmodified)
   * @returns {ImageData|null} Original frame or null
   */
  getOriginalFrame() {
    return this.originalFrames[this.currentFrame] || null;
  }
  
  /**
   * Get total duration in seconds
   * @returns {number} Duration
   */
  getDuration() {
    return this.frames.length / this.frameRate;
  }
  
  /**
   * Validate duration against maximum
   * @param {number} duration - Duration to check
   * @throws {Error} If duration exceeds maximum
   */
  validateDuration(duration) {
    if (duration > this.maxDuration) {
      throw new Error(`Media duration (${duration.toFixed(1)}s) exceeds maximum limit of ${this.maxDuration} seconds`);
    }
  }
  
  /**
   * Clone ImageData object
   * @param {ImageData} imageData - ImageData to clone
   * @returns {ImageData} Cloned ImageData
   */
  cloneImageData(imageData) {
    const cloned = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
    return cloned;
  }
  
  /**
   * Reset to original frames
   */
  reset() {
    this.frames = this.originalFrames.map(frame => this.cloneImageData(frame));
    this.currentFrame = 0;
    this.direction = 1;
  }
  
  /**
   * Get media info for UI display
   * @returns {Object} Media information
   */
  getMediaInfo() {
    return {
      type: this.mediaType,
      frameCount: this.frames.length,
      currentFrame: this.currentFrame + 1,
      frameRate: this.frameRate,
      duration: this.getDuration(),
      width: this.width,
      height: this.height,
      playbackMode: this.playbackMode
    };
  }
}
