/**
 * FrameCache - LRU cache for storing processed frames
 * Helps improve performance for animated media
 */
export class FrameCache {
  constructor(maxFrames = 100) {
    this.cache = new Map();
    this.maxFrames = maxFrames;
    this.lruOrder = [];
  }
  
  /**
   * Set a frame in the cache
   * @param {number} frameIndex - Frame index
   * @param {ImageData} imageData - Frame data
   */
  set(frameIndex, imageData) {
    // If we're at capacity, evict the least recently used frame
    if (this.cache.size >= this.maxFrames && !this.cache.has(frameIndex)) {
      this.evictLRU();
    }
    
    // Clone the image data to prevent mutations
    const cloned = this.cloneImageData(imageData);
    this.cache.set(frameIndex, cloned);
    this.updateLRU(frameIndex);
  }
  
  /**
   * Get a frame from the cache
   * @param {number} frameIndex - Frame index
   * @returns {ImageData|null} Cached frame or null
   */
  get(frameIndex) {
    if (this.cache.has(frameIndex)) {
      this.updateLRU(frameIndex);
      return this.cache.get(frameIndex);
    }
    return null;
  }
  
  /**
   * Check if frame is in cache
   * @param {number} frameIndex - Frame index
   * @returns {boolean} True if cached
   */
  has(frameIndex) {
    return this.cache.has(frameIndex);
  }
  
  /**
   * Clear the cache
   */
  clear() {
    this.cache.clear();
    this.lruOrder = [];
  }
  
  /**
   * Get cache size
   * @returns {number} Number of cached frames
   */
  size() {
    return this.cache.size;
  }
  
  /**
   * Update LRU order for a frame
   * @param {number} frameIndex - Frame index
   */
  updateLRU(frameIndex) {
    // Remove from current position
    const index = this.lruOrder.indexOf(frameIndex);
    if (index > -1) {
      this.lruOrder.splice(index, 1);
    }
    // Add to end (most recently used)
    this.lruOrder.push(frameIndex);
  }
  
  /**
   * Evict least recently used frame
   */
  evictLRU() {
    if (this.lruOrder.length > 0) {
      const lruFrame = this.lruOrder.shift();
      this.cache.delete(lruFrame);
    }
  }
  
  /**
   * Clone ImageData object
   * @param {ImageData} imageData - ImageData to clone
   * @returns {ImageData} Cloned ImageData
   */
  cloneImageData(imageData) {
    return new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
  }
  
  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxFrames,
      hitRate: this.hits / (this.hits + this.misses) || 0,
      lruOrder: [...this.lruOrder]
    };
  }
}
