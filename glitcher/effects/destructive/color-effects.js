/**
 * Color Effects for Glitcher App
 * Handles color manipulation effects including hue shifts, saturation, and chromatic aberration
 */

import { rgbToHsl, hslToRgb } from '../../utils/color-utils.js';
import { clampColor } from '../../utils/math-utils.js';

export class ColorEffects {
  /**
   * Apply color effect
   * @param {ImageData} imageData - Target image data
   * @param {string} effectType - Type of color effect
   * @param {number} intensity - Effect intensity (0-100)
   * @param {Object} options - Additional effect options
   * @param {Uint8Array} selectionMask - Optional selection mask
   * @returns {Uint8ClampedArray|null} New pixel data if non-destructive, null if destructive
   */
  static applyColorEffect(imageData, effectType, intensity, options = {}, selectionMask = null) {
    const { data: srcPixelData, width, height } = imageData;
    const strengthFactor = intensity / 100; // Strength for effects (0-1)

    let outputPixelData = null; // Will be assigned based on effect type

    switch (effectType) {
      case 'chromaticAberration':
        const mode = options.mode || 'horizontal';
        const angle = options.angle || 0;
        // Chromatic Aberration is non-destructive
        outputPixelData = this.chromaticAberration(srcPixelData, width, height, mode, strengthFactor, angle);
        break;
        
      case 'hueShift':
        this.hueShift(srcPixelData, width, height, strengthFactor, selectionMask);
        outputPixelData = srcPixelData;
        break;
        
      case 'saturation':
        this.saturationBoost(srcPixelData, width, height, strengthFactor, selectionMask);
        outputPixelData = srcPixelData;
        break;
        
      case 'vintage':
        this.vintageEffect(srcPixelData, width, height, strengthFactor, selectionMask);
        outputPixelData = srcPixelData;
        break;
        
      case 'invert':
        const invertType = options.type || 'full_rgb';
        this.invertColors(srcPixelData, width, height, invertType, selectionMask);
        outputPixelData = srcPixelData;
        break;
        
      case 'channelShift':
        this.channelShift(srcPixelData, width, height, options, selectionMask);
        outputPixelData = srcPixelData;
        break;
        
      case 'colorNoise':
        this.colorNoise(srcPixelData, width, height, strengthFactor, selectionMask);
        outputPixelData = srcPixelData;
        break;
        
      default:
        return srcPixelData;
    }
    
    return outputPixelData;
  }

  /**
   * Chromatic Aberration effect (non-destructive)
   * @param {Uint8ClampedArray} srcData - Source pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {string} mode - 'horizontal', 'vertical', 'radial', 'custom'
   * @param {number} strength - Effect strength
   * @param {number} angleDegrees - Custom angle in degrees
   * @returns {Uint8ClampedArray} New pixel data
   */
  static chromaticAberration(srcData, width, height, mode, strength, angleDegrees = 0) {
    const outputData = new Uint8ClampedArray(srcData.length);
    
    // Initialize outputData by copying all of srcData
    for (let i = 0; i < srcData.length; i++) {
      outputData[i] = srcData[i];
    }

    const baseOffset = Math.floor(strength * 10);
    const customDistance = Math.floor(strength * 15);

    if (mode === 'horizontal') {
      if (baseOffset === 0) return srcData;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          
          const redX = Math.min(x + baseOffset, width - 1);
          const redSrcIdx = (y * width + redX) * 4;
          outputData[idx] = srcData[redSrcIdx]; // Red
          
          const blueX = Math.max(x - baseOffset, 0);
          const blueSrcIdx = (y * width + blueX) * 4;
          outputData[idx + 2] = srcData[blueSrcIdx + 2]; // Blue
        }
      }
    } else if (mode === 'vertical') {
      if (baseOffset === 0) return srcData;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;

          const redY = Math.min(y + baseOffset, height - 1);
          const redSrcIdx = (redY * width + x) * 4;
          outputData[idx] = srcData[redSrcIdx]; // Red

          const blueY = Math.max(y - baseOffset, 0);
          const blueSrcIdx = (blueY * width + x) * 4;
          outputData[idx + 2] = srcData[blueSrcIdx + 2]; // Blue
        }
      }
    } else if (mode === 'radial') {
      if (baseOffset === 0) return srcData;
      
      const centerX = width / 2;
      const centerY = height / 2;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const dx = x - centerX;
          const dy = y - centerY;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);

          if (distFromCenter === 0) continue;

          const normalizedDx = dx / distFromCenter;
          const normalizedDy = dy / distFromCenter;

          const rSrcX = Math.round(x + normalizedDx * baseOffset);
          const rSrcY = Math.round(y + normalizedDy * baseOffset);
          if (rSrcX >= 0 && rSrcX < width && rSrcY >= 0 && rSrcY < height) {
            outputData[idx] = srcData[(rSrcY * width + rSrcX) * 4];
          } else { 
            outputData[idx] = 0;
          }

          const bSrcX = Math.round(x - normalizedDx * baseOffset);
          const bSrcY = Math.round(y - normalizedDy * baseOffset);
          if (bSrcX >= 0 && bSrcX < width && bSrcY >= 0 && bSrcY < height) {
            outputData[idx + 2] = srcData[(bSrcY * width + bSrcX) * 4 + 2];
          } else { 
            outputData[idx + 2] = 0;
          }
        }
      }
    } else if (mode === 'custom') {
      if (customDistance === 0) return srcData;

      const angleRad = angleDegrees * Math.PI / 180;
      const rOffX = Math.cos(angleRad) * customDistance;
      const rOffY = Math.sin(angleRad) * customDistance;
      const gOffX = Math.cos(angleRad + (2 * Math.PI / 3)) * customDistance;
      const gOffY = Math.sin(angleRad + (2 * Math.PI / 3)) * customDistance;
      const bOffX = Math.cos(angleRad + (4 * Math.PI / 3)) * customDistance;
      const bOffY = Math.sin(angleRad + (4 * Math.PI / 3)) * customDistance;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const baseIdx = (y * width + x) * 4;

          // Sample Red channel
          const rSrcX = Math.round(x + rOffX);
          const rSrcY = Math.round(y + rOffY);
          if (rSrcX >= 0 && rSrcX < width && rSrcY >= 0 && rSrcY < height) {
            outputData[baseIdx] = srcData[(rSrcY * width + rSrcX) * 4];
          } else { 
            outputData[baseIdx] = 0;
          }

          // Sample Green channel
          const gSrcX = Math.round(x + gOffX);
          const gSrcY = Math.round(y + gOffY);
          if (gSrcX >= 0 && gSrcX < width && gSrcY >= 0 && gSrcY < height) {
            outputData[baseIdx + 1] = srcData[(gSrcY * width + gSrcX) * 4 + 1];
          } else { 
            outputData[baseIdx + 1] = 0;
          }

          // Sample Blue channel
          const bSrcX = Math.round(x + bOffX);
          const bSrcY = Math.round(y + bOffY);
          if (bSrcX >= 0 && bSrcX < width && bSrcY >= 0 && bSrcY < height) {
            outputData[baseIdx + 2] = srcData[(bSrcY * width + bSrcX) * 4 + 2];
          } else { 
            outputData[baseIdx + 2] = 0;
          }
        }
      }
    }
    
    return outputData;
  }

  /**
   * Hue shift effect (destructive)
   * @param {Uint8ClampedArray} data - Pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} strength - Effect strength (0-1)
   * @param {Uint8Array} mask - Optional selection mask
   */
  static hueShift(data, width, height, strength, mask = null) {
    const scaledStrength = strength * 0.08;
    const shift = scaledStrength * 360;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const maskIdx = y * width + x;
        
        if (!mask || mask[maskIdx] === 255) {
          const i = (y * width + x) * 4;
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
          const newH = (h + shift) % 360;
          const [r, g, b] = hslToRgb(newH, s, l);
          
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
      }
    }
  }

  /**
   * Saturation boost effect (destructive)
   * @param {Uint8ClampedArray} data - Pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} strength - Effect strength (0-1)
   * @param {Uint8Array} mask - Optional selection mask
   */
  static saturationBoost(data, width, height, strength, mask = null) {
    const boost = 1 + strength * 2;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const maskIdx = y * width + x;
        
        if (!mask || mask[maskIdx] === 255) {
          const i = (y * width + x) * 4;
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
          const newS = Math.min(s * boost, 1);
          const [r, g, b] = hslToRgb(h, newS, l);
          
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
      }
    }
  }

  /**
   * Vintage effect (destructive)
   * @param {Uint8ClampedArray} data - Pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} strength - Effect strength (0-1)
   * @param {Uint8Array} mask - Optional selection mask
   */
  static vintageEffect(data, width, height, strength, mask = null) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const maskIdx = y * width + x;
        
        if (!mask || mask[maskIdx] === 255) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          const newR = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
          const newG = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
          const newB = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
          
          data[i] = r * (1 - strength) + newR * strength;
          data[i + 1] = g * (1 - strength) + newG * strength;
          data[i + 2] = b * (1 - strength) + newB * strength;
        }
      }
    }
  }

  /**
   * Color inversion effect (destructive)
   * @param {Uint8ClampedArray} data - Pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {string} inversionType - 'full_rgb', 'red_only', 'green_only', 'blue_only'
   * @param {Uint8Array} mask - Optional selection mask
   */
  static invertColors(data, width, height, inversionType, mask = null) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const maskIdx = y * width + x;
        
        if (!mask || mask[maskIdx] === 255) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          switch (inversionType) {
            case 'full_rgb':
              data[i] = 255 - r;
              data[i + 1] = 255 - g;
              data[i + 2] = 255 - b;
              break;
            case 'red_only':
              data[i] = 255 - r;
              break;
            case 'green_only':
              data[i + 1] = 255 - g;
              break;
            case 'blue_only':
              data[i + 2] = 255 - b;
              break;
            default:
              data[i] = 255 - r;
              data[i + 1] = 255 - g;
              data[i + 2] = 255 - b;
              break;
          }
        }
      }
    }
  }

  /**
   * Color noise effect (destructive)
   * @param {Uint8ClampedArray} data - Pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} strength - Effect strength (0-1)
   * @param {Uint8Array} mask - Optional selection mask
   */
  static colorNoise(data, width, height, strength, mask = null) {
    const noiseAmount = strength * 50;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const maskIdx = y * width + x;
        
        if (!mask || mask[maskIdx] === 255) {
          const i = (y * width + x) * 4;
          
          const rNoise = (Math.random() - 0.5) * noiseAmount;
          const gNoise = (Math.random() - 0.5) * noiseAmount;
          const bNoise = (Math.random() - 0.5) * noiseAmount;
          
          data[i] = clampColor(data[i] + rNoise);
          data[i + 1] = clampColor(data[i + 1] + gNoise);
          data[i + 2] = clampColor(data[i + 2] + bNoise);
        }
      }
    }
  }
}
