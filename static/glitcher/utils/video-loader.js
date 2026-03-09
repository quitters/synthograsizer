/**
 * VideoLoader - Handles video file parsing and frame extraction
 * Uses HTML5 Video API for frame extraction
 */
export class VideoLoader {
  static MAX_DURATION = 20; // 20 second limit
  static DEFAULT_FRAME_RATE = 30; // Target frame rate for extraction
  
  /**
   * Load video file and extract frames
   * @param {File} file - Video file to load
   * @returns {Promise<Object>} Video data with extracted frames
   */
  static async loadVideo(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      video.onloadedmetadata = async () => {
        try {
          // Enforce 20-second maximum duration
          if (video.duration > this.MAX_DURATION) {
            URL.revokeObjectURL(video.src);
            reject(new Error(`Video duration (${video.duration.toFixed(1)}s) exceeds maximum limit of ${this.MAX_DURATION} seconds. Please use a shorter video or trim to 20 seconds.`));
            return;
          }
          
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          const frames = [];
          const frameRate = this.DEFAULT_FRAME_RATE;
          const duration = Math.min(video.duration, this.MAX_DURATION);
          const frameCount = Math.floor(duration * frameRate);
          
          // Show loading progress
          console.log(`Extracting ${frameCount} frames from video...`);
          
          // Extract frames
          const extractedFrames = await this.extractFrames(video, canvas, ctx, frameCount, frameRate, duration);
          
          // Clean up
          URL.revokeObjectURL(video.src);
          
          resolve({
            frames: extractedFrames,
            frameRate,
            duration,
            width: canvas.width,
            height: canvas.height,
            playbackMode: 'loop' // Default playback mode
          });
        } catch (error) {
          URL.revokeObjectURL(video.src);
          reject(error);
        }
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Failed to load video file. Ensure the video format is supported (MP4, WebM).'));
      };
      
      video.src = URL.createObjectURL(file);
      video.load();
    });
  }
  
  /**
   * Extract frames from video
   * @param {HTMLVideoElement} video - Video element
   * @param {HTMLCanvasElement} canvas - Canvas for frame extraction
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} frameCount - Number of frames to extract
   * @param {number} frameRate - Target frame rate
   * @param {number} maxDuration - Maximum duration to extract
   * @returns {Promise<Array>} Array of ImageData frames
   */
  static async extractFrames(video, canvas, ctx, frameCount, frameRate, maxDuration) {
    const frames = [];
    const timeStep = maxDuration / frameCount;
    
    // Create a more efficient frame extraction process
    for (let i = 0; i < frameCount; i++) {
      const targetTime = i * timeStep;
      
      // Seek to target time
      video.currentTime = targetTime;
      await this.waitForSeek(video);
      
      // Draw frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Extract ImageData
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      frames.push(imageData);
      
      // Progress update (every 10 frames)
      if (i % 10 === 0) {
        console.log(`Extracted ${i + 1}/${frameCount} frames (${Math.round((i + 1) / frameCount * 100)}%)`);
      }
    }
    
    console.log(`Frame extraction complete: ${frames.length} frames`);
    return frames;
  }
  
  /**
   * Wait for video seek to complete
   * @param {HTMLVideoElement} video - Video element
   * @returns {Promise} Resolves when seek is complete
   */
  static waitForSeek(video) {
    return new Promise((resolve) => {
      if (video.seeking) {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      } else {
        resolve();
      }
    });
  }
  
  /**
   * Extract single frame from video at specific time
   * @param {File} file - Video file
   * @param {number} time - Time in seconds
   * @returns {Promise<ImageData>} Single frame
   */
  static async extractSingleFrame(file, time = 0) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      video.onloadedmetadata = async () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        video.currentTime = Math.min(time, video.duration);
        await this.waitForSeek(video);
        
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        URL.revokeObjectURL(video.src);
        resolve(imageData);
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Failed to load video'));
      };
      
      video.src = URL.createObjectURL(file);
      video.load();
    });
  }
}
