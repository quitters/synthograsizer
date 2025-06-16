/**
 * Slice Effects for Glitcher App
 * Handles horizontal and vertical slice glitch effects with color shifting
 */

import { randomInt, clampColor } from '../../utils/math-utils.js';

export class SliceEffects {
  /**
   * Apply slice glitch effect
   * @param {ImageData} imageData - Target image data
   * @param {string} sliceType - 'horizontal', 'vertical', or 'both'
   * @param {number} colorMax - Maximum color offset
   * @param {Uint8Array} selectionMask - Optional selection mask
   */
  static applySliceGlitch(imageData, sliceType, colorMax, selectionMask = null) {
    if (sliceType === 'horizontal' || sliceType === 'both') {
      this.horizontalSliceGlitch(imageData, colorMax, selectionMask);
    }
    if (sliceType === 'vertical' || sliceType === 'both') {
      this.verticalSliceGlitch(imageData, colorMax, selectionMask);
    }
  }

  /**
   * Apply horizontal slice glitch
   * @param {ImageData} imageData - Target image data
   * @param {number} colorMax - Maximum color offset
   * @param {Uint8Array} mask - Optional selection mask
   */
  static horizontalSliceGlitch(imageData, colorMax, mask = null) {
    const { data, width, height } = imageData;
    const sliceHeight = randomInt(1, Math.floor(height / 6));
    const startY = randomInt(0, height - sliceHeight);
    const direction = Math.random() < 0.5 ? -1 : 1;
    const offset = randomInt(1, 5);
    const colorOffset = randomInt(-colorMax, colorMax);

    for (let row = startY; row < startY + sliceHeight; row++) {
      if (direction === 1) {
        // Shift right
        for (let col = width - 1; col >= 0; col--) {
          const maskIdx = row * width + col;
          
          if (!mask || mask[maskIdx] === 255) {
            const srcIdx = (row * width + col) * 4;
            const dstCol = col + offset;
            if (dstCol >= width) continue;
            const dstIdx = (row * width + dstCol) * 4;

            data[dstIdx]     = clampColor(data[srcIdx] + colorOffset);
            data[dstIdx + 1] = clampColor(data[srcIdx + 1] + colorOffset);
            data[dstIdx + 2] = clampColor(data[srcIdx + 2] + colorOffset);
            data[dstIdx + 3] = data[srcIdx + 3];
          }
        }
      } else {
        // Shift left
        for (let col = 0; col < width; col++) {
          const maskIdx = row * width + col;
          
          if (!mask || mask[maskIdx] === 255) {
            const srcIdx = (row * width + col) * 4;
            const dstCol = col - offset;
            if (dstCol < 0) continue;
            const dstIdx = (row * width + dstCol) * 4;

            data[dstIdx]     = clampColor(data[srcIdx] + colorOffset);
            data[dstIdx + 1] = clampColor(data[srcIdx + 1] + colorOffset);
            data[dstIdx + 2] = clampColor(data[srcIdx + 2] + colorOffset);
            data[dstIdx + 3] = data[srcIdx + 3];
          }
        }
      }
    }
  }

  /**
   * Apply vertical slice glitch
   * @param {ImageData} imageData - Target image data
   * @param {number} colorMax - Maximum color offset
   * @param {Uint8Array} mask - Optional selection mask
   */
  static verticalSliceGlitch(imageData, colorMax, mask = null) {
    const { data, width, height } = imageData;
    const sliceWidth = randomInt(1, Math.floor(width / 6));
    const startX = randomInt(0, width - sliceWidth);
    const direction = Math.random() < 0.5 ? -1 : 1;
    const offset = randomInt(1, 5);
    const colorOffset = randomInt(-colorMax, colorMax);

    for (let col = startX; col < startX + sliceWidth; col++) {
      if (direction === 1) {
        // Shift down
        for (let row = height - 1; row >= 0; row--) {
          const maskIdx = row * width + col;
          
          if (!mask || mask[maskIdx] === 255) {
            const srcIdx = (row * width + col) * 4;
            const dstRow = row + offset;
            if (dstRow >= height) continue;
            const dstIdx = (dstRow * width + col) * 4;

            data[dstIdx]     = clampColor(data[srcIdx] + colorOffset);
            data[dstIdx + 1] = clampColor(data[srcIdx + 1] + colorOffset);
            data[dstIdx + 2] = clampColor(data[srcIdx + 2] + colorOffset);
            data[dstIdx + 3] = data[srcIdx + 3];
          }
        }
      } else {
        // Shift up
        for (let row = 0; row < height; row++) {
          const maskIdx = row * width + col;
          
          if (!mask || mask[maskIdx] === 255) {
            const srcIdx = (row * width + col) * 4;
            const dstRow = row - offset;
            if (dstRow < 0) continue;
            const dstIdx = (dstRow * width + col) * 4;

            data[dstIdx]     = clampColor(data[srcIdx] + colorOffset);
            data[dstIdx + 1] = clampColor(data[srcIdx + 1] + colorOffset);
            data[dstIdx + 2] = clampColor(data[srcIdx + 2] + colorOffset);
            data[dstIdx + 3] = data[srcIdx + 3];
          }
        }
      }
    }
  }

  /**
   * Apply digital tear effect (enhanced slice with multiple tears)
   * @param {ImageData} imageData - Target image data
   * @param {number} tearCount - Number of tears to create
   * @param {number} colorVariation - Color variation intensity
   * @param {Uint8Array} selectionMask - Optional selection mask
   */
  static applyDigitalTear(imageData, tearCount = 3, colorVariation = 30, selectionMask = null) {
    for (let i = 0; i < tearCount; i++) {
      const isHorizontal = Math.random() < 0.6; // Favor horizontal tears
      
      if (isHorizontal) {
        this.horizontalSliceGlitch(imageData, colorVariation, selectionMask);
      } else {
        this.verticalSliceGlitch(imageData, colorVariation, selectionMask);
      }
    }
  }

  /**
   * Apply scanline effect (thin horizontal lines)
   * @param {ImageData} imageData - Target image data
   * @param {number} lineSpacing - Spacing between scanlines
   * @param {number} intensity - Scanline intensity (0-1)
   * @param {Uint8Array} selectionMask - Optional selection mask
   */
  static applyScanlines(imageData, lineSpacing = 4, intensity = 0.3, selectionMask = null) {
    const { data, width, height } = imageData;
    
    for (let row = 0; row < height; row += lineSpacing) {
      for (let col = 0; col < width; col++) {
        const maskIdx = row * width + col;
        
        if (!mask || mask[maskIdx] === 255) {
          const idx = (row * width + col) * 4;
          data[idx]     = Math.floor(data[idx] * (1 - intensity));
          data[idx + 1] = Math.floor(data[idx + 1] * (1 - intensity));
          data[idx + 2] = Math.floor(data[idx + 2] * (1 - intensity));
        }
      }
    }
  }

  /**
   * Apply RGB channel displacement (separate color channels)
   * @param {ImageData} imageData - Target image data
   * @param {number} displacement - Displacement amount
   * @param {string} direction - 'horizontal', 'vertical', or 'diagonal'
   * @param {Uint8Array} selectionMask - Optional selection mask
   */
  static applyChannelDisplacement(imageData, displacement = 3, direction = 'horizontal', selectionMask = null) {
    const { data, width, height } = imageData;
    const tempData = new Uint8ClampedArray(data);
    
    let offsetR = { x: 0, y: 0 };
    let offsetG = { x: 0, y: 0 };
    let offsetB = { x: 0, y: 0 };
    
    switch (direction) {
      case 'horizontal':
        offsetR.x = -displacement;
        offsetB.x = displacement;
        break;
      case 'vertical':
        offsetR.y = -displacement;
        offsetB.y = displacement;
        break;
      case 'diagonal':
        offsetR.x = -displacement;
        offsetR.y = -displacement;
        offsetB.x = displacement;
        offsetB.y = displacement;
        break;
    }
    
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const maskIdx = row * width + col;
        
        if (!selectionMask || selectionMask[maskIdx] === 255) {
          const idx = (row * width + col) * 4;
          
          // Red channel
          const rSrcCol = col + offsetR.x;
          const rSrcRow = row + offsetR.y;
          if (rSrcCol >= 0 && rSrcCol < width && rSrcRow >= 0 && rSrcRow < height) {
            const rSrcIdx = (rSrcRow * width + rSrcCol) * 4;
            data[idx] = tempData[rSrcIdx];
          }
          
          // Green channel (no offset)
          data[idx + 1] = tempData[idx + 1];
          
          // Blue channel
          const bSrcCol = col + offsetB.x;
          const bSrcRow = row + offsetB.y;
          if (bSrcCol >= 0 && bSrcCol < width && bSrcRow >= 0 && bSrcRow < height) {
            const bSrcIdx = (bSrcRow * width + bSrcCol) * 4;
            data[idx + 2] = tempData[bSrcIdx + 2];
          }
        }
      }
    }
  }

  /**
   * Apply block corruption effect
   * @param {ImageData} imageData - Target image data
   * @param {number} blockSize - Size of corruption blocks
   * @param {number} corruptionRate - Rate of corruption (0-1)
   * @param {Uint8Array} selectionMask - Optional selection mask
   */
  static applyBlockCorruption(imageData, blockSize = 8, corruptionRate = 0.1, selectionMask = null) {
    const { data, width, height } = imageData;
    
    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        if (Math.random() < corruptionRate) {
          // Corrupt this block
          const corruptionType = Math.floor(Math.random() * 3);
          
          for (let by = y; by < Math.min(y + blockSize, height); by++) {
            for (let bx = x; bx < Math.min(x + blockSize, width); bx++) {
              const maskIdx = by * width + bx;
              
              if (!selectionMask || selectionMask[maskIdx] === 255) {
                const idx = (by * width + bx) * 4;
                
                switch (corruptionType) {
                  case 0: // Color inversion
                    data[idx]     = 255 - data[idx];
                    data[idx + 1] = 255 - data[idx + 1];
                    data[idx + 2] = 255 - data[idx + 2];
                    break;
                  case 1: // Random noise
                    data[idx]     = Math.random() * 255;
                    data[idx + 1] = Math.random() * 255;
                    data[idx + 2] = Math.random() * 255;
                    break;
                  case 2: // Extreme brightness
                    const factor = Math.random() < 0.5 ? 0 : 2;
                    data[idx]     = clampColor(data[idx] * factor);
                    data[idx + 1] = clampColor(data[idx + 1] * factor);
                    data[idx + 2] = clampColor(data[idx + 2] * factor);
                    break;
                }
              }
            }
          }
        }
      }
    }
  }
}
