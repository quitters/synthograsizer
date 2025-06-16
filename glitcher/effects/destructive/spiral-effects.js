/**
 * Spiral Effects for Glitcher App
 * Handles all spiral, swirl, and rotational distortion effects
 */

export class SpiralEffects {
  /**
   * Apply spiral/swirl effect to a rectangular region
   * @param {ImageData} imageData - Target image data
   * @param {Object} rect - {x, y, w, h} rectangle bounds
   * @param {number} swirlStrength - Strength of the swirl effect
   * @param {string} swirlType - Type: 'spiral', 'insideOut', 'outsideIn', 'random', 'cw', 'ccw'
   * @param {string} globalDirection - Global spiral direction: 'cw' or 'ccw'
   * @param {Uint8Array} selectionMask - Optional selection mask for manual selection mode
   */
  static applySwirlEffect(imageData, rect, swirlStrength, swirlType, globalDirection = 'cw', selectionMask = null) {
    const { x, y, w, h } = rect;
    const { data, width, height } = imageData;
    
    // Boundary check
    if (x < 0 || y < 0 || x + w > width || y + h > height) return;

    const mask = selectionMask;
    const subregion = new Uint8ClampedArray(w * h * 4);
    
    // Copy only selected pixels to subregion
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const srcX = x + col;
        const srcY = y + row;
        const maskIdx = srcY * width + srcX;
        
        if (!mask || mask[maskIdx] === 255) {
          const srcIdx = (srcY * width + srcX) * 4;
          const dstIdx = (row * w + col) * 4;
          subregion[dstIdx]     = data[srcIdx];
          subregion[dstIdx + 1] = data[srcIdx + 1];
          subregion[dstIdx + 2] = data[srcIdx + 2];
          subregion[dstIdx + 3] = data[srcIdx + 3];
        }
      }
    }

    const centerX = w / 2;
    const centerY = h / 2;
    const maxR = Math.sqrt(centerX * centerX + centerY * centerY);
    const swirlBuffer = new Uint8ClampedArray(subregion);

    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const srcX = x + col;
        const srcY = y + row;
        const maskIdx = srcY * width + srcX;
        
        if (!mask || mask[maskIdx] === 255) {
          const dx = col - centerX;
          const dy = row - centerY;
          const r = Math.sqrt(dx * dx + dy * dy);
          const theta = Math.atan2(dy, dx);

          const swirlAngle = this.computeSwirlAngle(r, maxR, swirlStrength, swirlType, globalDirection);
          const newTheta = theta + swirlAngle;

          const nx = Math.round(centerX + r * Math.cos(newTheta));
          const ny = Math.round(centerY + r * Math.sin(newTheta));
          
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const srcIdx = (row * w + col) * 4;
            const dstIdx = (ny * w + nx) * 4;
            swirlBuffer[dstIdx]     = subregion[srcIdx];
            swirlBuffer[dstIdx + 1] = subregion[srcIdx + 1];
            swirlBuffer[dstIdx + 2] = subregion[srcIdx + 2];
            swirlBuffer[dstIdx + 3] = subregion[srcIdx + 3];
          }
        }
      }
    }

    // Write back only to selected pixels
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const dstX = x + col;
        const dstY = y + row;
        const maskIdx = dstY * width + dstX;
        
        if (!mask || mask[maskIdx] === 255) {
          const srcIdx = (row * w + col) * 4;
          const dstIdx = (dstY * width + dstX) * 4;
          data[dstIdx]     = swirlBuffer[srcIdx];
          data[dstIdx + 1] = swirlBuffer[srcIdx + 1];
          data[dstIdx + 2] = swirlBuffer[srcIdx + 2];
          data[dstIdx + 3] = swirlBuffer[srcIdx + 3];
        }
      }
    }
  }

  /**
   * Compute swirl angle based on distance and effect type
   * @param {number} r - Distance from center
   * @param {number} maxR - Maximum radius
   * @param {number} strength - Swirl strength
   * @param {string} type - Effect type
   * @param {string} globalDirection - Global direction 'cw' or 'ccw'
   * @returns {number} Swirl angle in radians
   */
  static computeSwirlAngle(r, maxR, strength, type, globalDirection) {
    let angle = 0;
    const directionMultiplier = (globalDirection === 'cw' ? 1 : -1);

    switch (type) {
      case 'cw': // Explicit clockwise
        angle = +strength * (r / maxR);
        break;
        
      case 'ccw': // Explicit counter-clockwise
        angle = -strength * (r / maxR);
        break;
        
      case 'spiral': // Use global direction
        angle = strength * (r / maxR) * directionMultiplier;
        break;
        
      case 'insideOut':
        // Apply global direction to the base 'insideOut' effect
        angle = strength * (1 - r / maxR) * directionMultiplier;
        break;
        
      case 'outsideIn':
        // Apply global direction to the base 'outsideIn' effect
        angle = strength * (r / maxR) * directionMultiplier;
        break;
        
      case 'random':
        // Random mode determines its own directionality
        angle = (Math.random() * 2 - 1) * strength * (r / maxR);
        break;
        
      default:
        angle = 0;
        break;
    }
    
    return angle;
  }

  /**
   * Create a vortex effect (concentrated spiral)
   * @param {ImageData} imageData - Target image data
   * @param {Object} rect - {x, y, w, h} rectangle bounds
   * @param {number} intensity - Vortex intensity
   * @param {string} direction - 'cw' or 'ccw'
   * @param {Uint8Array} selectionMask - Optional selection mask
   */
  static applyVortexEffect(imageData, rect, intensity, direction = 'cw', selectionMask = null) {
    // Vortex is just a very strong spiral with exponential falloff
    const vortexStrength = intensity * 0.5; // Scale down for more control
    this.applySwirlEffect(imageData, rect, vortexStrength, direction, direction, selectionMask);
  }

  /**
   * Create a ripple effect (multiple concentric spirals)
   * @param {ImageData} imageData - Target image data
   * @param {Object} rect - {x, y, w, h} rectangle bounds
   * @param {number} frequency - Ripple frequency
   * @param {number} amplitude - Ripple amplitude
   * @param {Uint8Array} selectionMask - Optional selection mask
   */
  static applyRippleEffect(imageData, rect, frequency, amplitude, selectionMask = null) {
    const { x, y, w, h } = rect;
    const { data, width, height } = imageData;
    
    if (x < 0 || y < 0 || x + w > width || y + h > height) return;

    const centerX = w / 2;
    const centerY = h / 2;
    const maxR = Math.sqrt(centerX * centerX + centerY * centerY);
    
    // Create temporary buffer
    const tempData = new Uint8ClampedArray(w * h * 4);
    
    // Copy original data
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const srcIdx = ((y + row) * width + (x + col)) * 4;
        const dstIdx = (row * w + col) * 4;
        tempData[dstIdx]     = data[srcIdx];
        tempData[dstIdx + 1] = data[srcIdx + 1];
        tempData[dstIdx + 2] = data[srcIdx + 2];
        tempData[dstIdx + 3] = data[srcIdx + 3];
      }
    }

    // Apply ripple distortion
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const maskIdx = (y + row) * width + (x + col);
        
        if (!selectionMask || selectionMask[maskIdx] === 255) {
          const dx = col - centerX;
          const dy = row - centerY;
          const r = Math.sqrt(dx * dx + dy * dy);
          
          if (r > 0) {
            const ripple = Math.sin(r * frequency / maxR * Math.PI * 4) * amplitude;
            const newR = r + ripple;
            const angle = Math.atan2(dy, dx);
            
            const newX = Math.round(centerX + newR * Math.cos(angle));
            const newY = Math.round(centerY + newR * Math.sin(angle));
            
            if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
              const srcIdx = (newY * w + newX) * 4;
              const dstIdx = (row * w + col) * 4;
              
              const finalIdx = ((y + row) * width + (x + col)) * 4;
              data[finalIdx]     = tempData[srcIdx];
              data[finalIdx + 1] = tempData[srcIdx + 1];
              data[finalIdx + 2] = tempData[srcIdx + 2];
              data[finalIdx + 3] = tempData[srcIdx + 3];
            }
          }
        }
      }
    }
  }
}
