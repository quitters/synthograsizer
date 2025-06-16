/**
 * Vintage Film Filter Effects for Glitcher App
 * Non-destructive vintage and film-style filters
 */

export class VintageFilmFilter {
  /**
   * Apply vintage film effect to image data
   * @param {ImageData} imageData - Source image data (not modified)
   * @param {string} filmType - 'polaroid', 'kodachrome', 'faded', 'sepia'
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Additional options {grainAmount: 0-100}
   * @returns {ImageData} New image data with effect applied
   */
  static apply(imageData, filmType = 'polaroid', intensity = 50, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const outputImageData = new ImageData(outputData, width, height);
    
    const normalizedIntensity = intensity / 100;
    const grainAmount = (options.grainAmount || 30) / 100;
    
    // Apply the specific film effect
    this.applyFilmEffect(outputData, filmType, normalizedIntensity);
    
    // Add film grain if specified
    if (grainAmount > 0) {
      this.addFilmGrain(outputData, grainAmount);
    }
    
    return outputImageData;
  }
  
  /**
   * Apply specific film effect
   * @param {Uint8ClampedArray} data - Image data to modify
   * @param {string} filmType - Type of film effect
   * @param {number} intensity - Normalized intensity (0-1)
   */
  static applyFilmEffect(data, filmType, intensity) {
    for (let i = 0; i < data.length; i += 4) {
      const originalR = data[i] / 255;
      const originalG = data[i + 1] / 255;
      const originalB = data[i + 2] / 255;
      
      let newR, newG, newB;
      
      switch (filmType) {
        case 'polaroid':
          [newR, newG, newB] = this.applyPolaroidEffect(originalR, originalG, originalB);
          break;
          
        case 'kodachrome':
          [newR, newG, newB] = this.applyKodachromeEffect(originalR, originalG, originalB);
          break;
          
        case 'faded':
          [newR, newG, newB] = this.applyFadedEffect(originalR, originalG, originalB);
          break;
          
        case 'sepia':
          [newR, newG, newB] = this.applySepiaEffect(originalR, originalG, originalB);
          break;
          
        default:
          [newR, newG, newB] = [originalR, originalG, originalB];
      }
      
      // Blend with original based on intensity
      data[i]     = (originalR + (newR - originalR) * intensity) * 255;
      data[i + 1] = (originalG + (newG - originalG) * intensity) * 255;
      data[i + 2] = (originalB + (newB - originalB) * intensity) * 255;
      // Alpha remains unchanged
    }
  }
  
  /**
   * Apply Polaroid-style effect
   * @param {number} r - Red component (0-1)
   * @param {number} g - Green component (0-1)
   * @param {number} b - Blue component (0-1)
   * @returns {Array} Modified RGB values
   */
  static applyPolaroidEffect(r, g, b) {
    // Warm color cast
    r = r * 1.1 + 0.05;
    g = g * 1.05 + 0.02;
    b = b * 0.95;
    
    // Soft contrast curve
    r = this.applySoftCurve(r);
    g = this.applySoftCurve(g);
    b = this.applySoftCurve(b);
    
    return [
      Math.max(0, Math.min(1, r)),
      Math.max(0, Math.min(1, g)),
      Math.max(0, Math.min(1, b))
    ];
  }
  
  /**
   * Apply Kodachrome-style effect
   * @param {number} r - Red component (0-1)
   * @param {number} g - Green component (0-1)
   * @param {number} b - Blue component (0-1)
   * @returns {Array} Modified RGB values
   */
  static applyKodachromeEffect(r, g, b) {
    // Kodachrome color characteristics
    r = r * 1.15 + 0.03; // Enhanced reds
    g = g * 0.98;        // Slightly reduced greens
    b = b * 1.08 + 0.02; // Enhanced blues
    
    // High contrast S-curve
    r = this.applyHighContrastCurve(r);
    g = this.applyHighContrastCurve(g);
    b = this.applyHighContrastCurve(b);
    
    return [
      Math.max(0, Math.min(1, r)),
      Math.max(0, Math.min(1, g)),
      Math.max(0, Math.min(1, b))
    ];
  }
  
  /**
   * Apply faded photo effect
   * @param {number} r - Red component (0-1)
   * @param {number} g - Green component (0-1)
   * @param {number} b - Blue component (0-1)
   * @returns {Array} Modified RGB values
   */
  static applyFadedEffect(r, g, b) {
    // Fade effect - lift shadows, reduce contrast
    r = r * 0.7 + 0.2;
    g = g * 0.7 + 0.15;
    b = b * 0.7 + 0.1;
    
    // Slight yellow cast
    r = r * 1.05;
    g = g * 1.02;
    b = b * 0.95;
    
    return [
      Math.max(0, Math.min(1, r)),
      Math.max(0, Math.min(1, g)),
      Math.max(0, Math.min(1, b))
    ];
  }
  
  /**
   * Apply sepia effect
   * @param {number} r - Red component (0-1)
   * @param {number} g - Green component (0-1)
   * @param {number} b - Blue component (0-1)
   * @returns {Array} Modified RGB values
   */
  static applySepiaEffect(r, g, b) {
    const newR = (r * 0.393) + (g * 0.769) + (b * 0.189);
    const newG = (r * 0.349) + (g * 0.686) + (b * 0.168);
    const newB = (r * 0.272) + (g * 0.534) + (b * 0.131);
    
    return [
      Math.max(0, Math.min(1, newR)),
      Math.max(0, Math.min(1, newG)),
      Math.max(0, Math.min(1, newB))
    ];
  }
  
  /**
   * Add film grain to image data
   * @param {Uint8ClampedArray} data - Image data to modify
   * @param {number} amount - Grain amount (0-1)
   */
  static addFilmGrain(data, amount) {
    const grainStrength = amount * 30; // Scale for visible effect
    
    for (let i = 0; i < data.length; i += 4) {
      const grain = (Math.random() - 0.5) * grainStrength;
      data[i]     = Math.max(0, Math.min(255, data[i] + grain));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain));
      // Alpha remains unchanged
    }
  }
  
  /**
   * Apply soft contrast curve
   * @param {number} x - Input value (0-1)
   * @returns {number} Curved value
   */
  static applySoftCurve(x) {
    return 0.5 + 0.4 * Math.sin((x - 0.5) * Math.PI);
  }
  
  /**
   * Apply high contrast curve
   * @param {number} x - Input value (0-1)
   * @returns {number} Curved value
   */
  static applyHighContrastCurve(x) {
    return Math.pow(x, 0.8) * (1.0 + 0.2 * Math.sin(x * Math.PI));
  }
}