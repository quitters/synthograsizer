/**
 * Direction Effects for Glitcher App
 * Handles all directional movement and shifting effects
 */

import { clamp } from '../../utils/math-utils.js';

export class DirectionEffects {
  /**
   * Apply directional shift to a rectangular region
   * @param {ImageData} imageData - Target image data
   * @param {Object} clump - {x, y, w, h} rectangle to shift
   * @param {number} speed - Shift speed/distance
   * @param {string} globalDir - Direction: 'down', 'up', 'left', 'right', 'random', 'jitter'
   * @param {Uint8Array} selectionMask - Optional selection mask for manual selection mode
   */
  static applyDirectionShift(imageData, clump, speed, globalDir, selectionMask = null) {
    let dir = globalDir;
    
    if (globalDir === 'random') {
      dir = clump.clumpDirection;
    } else if (globalDir === 'jitter') {
      const dirs = ['up', 'down', 'left', 'right'];
      dir = dirs[Math.floor(Math.random() * dirs.length)];
    }

    switch (dir) {
      case 'down':  this.shiftRectDown(imageData, clump, speed, selectionMask);  break;
      case 'up':    this.shiftRectUp(imageData, clump, speed, selectionMask);    break;
      case 'left':  this.shiftRectLeft(imageData, clump, speed, selectionMask);  break;
      case 'right': this.shiftRectRight(imageData, clump, speed, selectionMask); break;
    }
  }

  /**
   * Shift rectangle pixels downward
   * @param {ImageData} imageData - Target image data
   * @param {Object} rect - {x, y, w, h} rectangle bounds
   * @param {number} shift - Pixels to shift
   * @param {Uint8Array} mask - Optional selection mask
   */
  static shiftRectDown(imageData, {x, y, w, h}, shift, mask = null) {
    const { data, width, height } = imageData;
    
    for (let row = y + h - 1; row >= y; row--) {
      const destRow = row + shift;
      if (destRow >= height) continue;
      
      for (let col = x; col < x + w; col++) {
        const maskIdx = row * width + col;
        
        // Only shift if pixel is selected (or no mask)
        if (!mask || mask[maskIdx] === 255) {
          const srcIdx = (row * width + col) * 4;
          const dstIdx = (destRow * width + col) * 4;
          
          data[dstIdx]     = data[srcIdx];
          data[dstIdx + 1] = data[srcIdx + 1];
          data[dstIdx + 2] = data[srcIdx + 2];
          data[dstIdx + 3] = data[srcIdx + 3];
        }
      }
    }
  }

  /**
   * Shift rectangle pixels upward
   * @param {ImageData} imageData - Target image data
   * @param {Object} rect - {x, y, w, h} rectangle bounds
   * @param {number} shift - Pixels to shift
   * @param {Uint8Array} mask - Optional selection mask
   */
  static shiftRectUp(imageData, {x, y, w, h}, shift, mask = null) {
    const { data, width } = imageData;
    
    for (let row = y; row < y + h; row++) {
      const destRow = row - shift;
      if (destRow < 0) continue;
      
      for (let col = x; col < x + w; col++) {
        const maskIdx = row * width + col;
        
        // Only shift if pixel is selected (or no mask)
        if (!mask || mask[maskIdx] === 255) {
          const srcIdx = (row * width + col) * 4;
          const dstIdx = (destRow * width + col) * 4;
          
          data[dstIdx]     = data[srcIdx];
          data[dstIdx + 1] = data[srcIdx + 1];
          data[dstIdx + 2] = data[srcIdx + 2];
          data[dstIdx + 3] = data[srcIdx + 3];
        }
      }
    }
  }

  /**
   * Shift rectangle pixels leftward
   * @param {ImageData} imageData - Target image data
   * @param {Object} rect - {x, y, w, h} rectangle bounds
   * @param {number} shift - Pixels to shift
   * @param {Uint8Array} mask - Optional selection mask
   */
  static shiftRectLeft(imageData, {x, y, w, h}, shift, mask = null) {
    const { data, width } = imageData;
    
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        const maskIdx = row * width + col;
        
        // Only shift if pixel is selected (or no mask)
        if (!mask || mask[maskIdx] === 255) {
          const destCol = col - shift;
          if (destCol < 0) continue;
          
          const srcIdx  = (row * width + col) * 4;
          const dstIdx  = (row * width + destCol) * 4;
          
          data[dstIdx]     = data[srcIdx];
          data[dstIdx + 1] = data[srcIdx + 1];
          data[dstIdx + 2] = data[srcIdx + 2];
          data[dstIdx + 3] = data[srcIdx + 3];
        }
      }
    }
  }

  /**
   * Shift rectangle pixels rightward
   * @param {ImageData} imageData - Target image data
   * @param {Object} rect - {x, y, w, h} rectangle bounds
   * @param {number} shift - Pixels to shift
   * @param {Uint8Array} mask - Optional selection mask
   */
  static shiftRectRight(imageData, {x, y, w, h}, shift, mask = null) {
    const { data, width } = imageData;
    
    for (let row = y; row < y + h; row++) {
      for (let col = x + w - 1; col >= x; col--) {
        const maskIdx = row * width + col;
        
        // Only shift if pixel is selected (or no mask)
        if (!mask || mask[maskIdx] === 255) {
          const destCol = col + shift;
          if (destCol >= width) continue;
          
          const srcIdx  = (row * width + col) * 4;
          const dstIdx  = (row * width + destCol) * 4;
          
          data[dstIdx]     = data[srcIdx];
          data[dstIdx + 1] = data[srcIdx + 1];
          data[dstIdx + 2] = data[srcIdx + 2];
          data[dstIdx + 3] = data[srcIdx + 3];
        }
      }
    }
  }
}
