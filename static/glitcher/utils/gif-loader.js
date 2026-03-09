/**
 * GIFLoader - Handles GIF file parsing and frame extraction
 * Requires libgif-js library for GIF parsing
 */
export class GIFLoader {
  static MAX_DURATION = 20; // 20 second limit
  
  /**
   * Load and parse GIF file
   * @param {File} file - GIF file to load
   * @returns {Promise<Object>} Parsed GIF data with frames
   */
  static async loadGIF(file) {
    return new Promise((resolve, reject) => {
      // Check if SuperGif is available
      if (typeof SuperGif === 'undefined') {
        reject(new Error('libgif-js library not loaded. Please include libgif.js'));
        return;
      }
      
      // Create container for GIF parsing
      const container = document.createElement('div');
      container.style.display = 'none';
      document.body.appendChild(container);
      
      const img = document.createElement('img');
      container.appendChild(img);
      
      const reader = new FileReader();
      
      reader.onload = (e) => {
        img.src = e.target.result;
        
        const gif = new SuperGif({
          gif: img,
          auto_play: false,
          show_progress_bar: false,
          draw_while_loading: false
        });
        
        gif.load(() => {
          try {
            const frames = [];
            const frameCount = gif.get_length();
            const delays = gif.get_delays(); // Frame delays in centiseconds
            
            // Calculate actual frame rate and duration
            let totalDelay = 0;
            for (let i = 0; i < frameCount; i++) {
              totalDelay += delays[i] || 10; // Default 10cs if no delay
            }
            const duration = totalDelay / 100; // Convert to seconds
            
            // Enforce 20-second maximum duration
            if (duration > this.MAX_DURATION) {
              document.body.removeChild(container);
              reject(new Error(`GIF duration (${duration.toFixed(1)}s) exceeds maximum limit of ${this.MAX_DURATION} seconds. Please use a shorter GIF.`));
              return;
            }
            
            // Extract frames
            for (let i = 0; i < frameCount; i++) {
              gif.move_to(i);
              const canvas = gif.get_canvas();
              const ctx = canvas.getContext('2d');
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              frames.push(imageData);
            }
            
            // Calculate average frame rate
            const avgDelay = totalDelay / frameCount;
            const frameRate = 100 / avgDelay; // Convert from centiseconds to fps
            
            // Clean up
            document.body.removeChild(container);
            
            resolve({
              frames,
              frameRate,
              duration,
              width: frames[0].width,
              height: frames[0].height,
              playbackMode: 'loop' // Default playback mode for GIFs
            });
          } catch (error) {
            document.body.removeChild(container);
            reject(new Error(`Failed to parse GIF: ${error.message}`));
          }
        });
        
        gif.load_error = (error) => {
          document.body.removeChild(container);
          reject(new Error(`Failed to load GIF: ${error}`));
        };
      };
      
      reader.onerror = () => reject(new Error('Failed to read GIF file'));
      reader.readAsDataURL(file);
    });
  }
  
  /**
   * Simple GIF parser without external library (fallback)
   * This is a basic implementation that extracts the first frame only
   */
  static async loadGIFBasic(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // For basic loading, just return single frame
        resolve({
          frames: [imageData],
          frameRate: 10,
          duration: 0.1,
          width: img.width,
          height: img.height,
          playbackMode: 'loop'
        });
      };
      
      img.onerror = () => reject(new Error('Failed to load GIF as image'));
      img.src = URL.createObjectURL(file);
    });
  }
}
