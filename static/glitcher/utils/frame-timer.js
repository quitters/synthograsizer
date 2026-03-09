/**
 * FrameTimer - Manages frame timing and playback for animated media
 * Handles different source and output frame rates
 */
export class FrameTimer {
  constructor(sourceFrameRate = 30, outputFrameRate = 60) {
    this.sourceFrameRate = sourceFrameRate;
    this.outputFrameRate = outputFrameRate;
    this.frameCounter = 0;
    this.sourceFrameInterval = outputFrameRate / sourceFrameRate;
    this.playbackMode = 'loop'; // 'loop' or 'ping-pong'
    this.direction = 1; // 1 for forward, -1 for reverse
    this.currentFrame = 0;
    this.maxFrames = 0;
    this.speed = 1.0; // Playback speed multiplier
    this.lastTime = performance.now();
    this.accumulator = 0;
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
   * Set playback speed
   * @param {number} speed - Speed multiplier (0.1 to 3.0)
   */
  setSpeed(speed) {
    this.speed = Math.max(0.1, Math.min(3.0, speed));
  }
  
  /**
   * Set maximum frames
   * @param {number} maxFrames - Total number of frames
   */
  setMaxFrames(maxFrames) {
    this.maxFrames = maxFrames;
    this.currentFrame = Math.min(this.currentFrame, maxFrames - 1);
  }
  
  /**
   * Check if source frame should advance (simple counter method)
   * @returns {boolean} True if frame should advance
   */
  shouldAdvanceSourceFrame() {
    this.frameCounter += this.speed;
    if (this.frameCounter >= this.sourceFrameInterval) {
      this.frameCounter -= this.sourceFrameInterval;
      return true;
    }
    return false;
  }
  
  /**
   * Check if source frame should advance (time-based method)
   * @returns {boolean} True if frame should advance
   */
  shouldAdvanceSourceFrameTime() {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    // Accumulate time adjusted by speed
    this.accumulator += deltaTime * this.speed;
    
    // Frame interval in milliseconds
    const frameInterval = 1000 / this.sourceFrameRate;
    
    if (this.accumulator >= frameInterval) {
      this.accumulator -= frameInterval;
      return true;
    }
    
    return false;
  }
  
  /**
   * Get next frame index based on playback mode
   * @returns {number} Next frame index
   */
  getNextFrame() {
    if (this.maxFrames <= 1) return 0;
    
    if (this.playbackMode === 'loop') {
      this.currentFrame = (this.currentFrame + 1) % this.maxFrames;
    } else if (this.playbackMode === 'ping-pong') {
      this.currentFrame += this.direction;
      
      // Reverse direction at boundaries
      if (this.currentFrame >= this.maxFrames - 1) {
        this.direction = -1;
        this.currentFrame = this.maxFrames - 1;
      } else if (this.currentFrame <= 0) {
        this.direction = 1;
        this.currentFrame = 0;
      }
    }
    
    return this.currentFrame;
  }
  
  /**
   * Advance to next frame
   * @returns {number} New frame index
   */
  advance() {
    if (this.shouldAdvanceSourceFrameTime()) {
      return this.getNextFrame();
    }
    return this.currentFrame;
  }
  
  /**
   * Reset timer
   */
  reset() {
    this.frameCounter = 0;
    this.currentFrame = 0;
    this.direction = 1;
    this.lastTime = performance.now();
    this.accumulator = 0;
  }
  
  /**
   * Set current frame directly
   * @param {number} frame - Frame index
   */
  setCurrentFrame(frame) {
    this.currentFrame = Math.max(0, Math.min(frame, this.maxFrames - 1));
  }
  
  /**
   * Get timer info
   * @returns {Object} Timer state information
   */
  getInfo() {
    return {
      currentFrame: this.currentFrame,
      maxFrames: this.maxFrames,
      sourceFrameRate: this.sourceFrameRate,
      outputFrameRate: this.outputFrameRate,
      speed: this.speed,
      playbackMode: this.playbackMode,
      direction: this.direction
    };
  }
}
