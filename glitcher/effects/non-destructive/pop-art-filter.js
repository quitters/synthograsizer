/**
 * Pop Art Filter Effects for Glitcher App
 * Non-destructive pop art style filters
 */

export class PopArtFilter {
  /**
   * Apply pop art effect to image data
   * @param {ImageData} imageData - Source image data (not modified)
   * @param {string} style - 'warhol', 'lichtenstein', 'neon', 'psychedelic'
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Additional options
   * @returns {ImageData} New image data with effect applied
   */
  static apply(imageData, style = 'warhol', intensity = 50, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const outputImageData = new ImageData(outputData, width, height);
    
    const normalizedIntensity = intensity / 100;
    const colorLevels = options.colorLevels || 4;
    
    // Get color palette for the style
    const palette = this.getColorPalette(style);
    
    for (let i = 0; i < outputData.length; i += 4) {
      const r = outputData[i];
      const g = outputData[i + 1];
      const b = outputData[i + 2];
      
      // Convert to brightness for palette mapping
      const brightness = (r + g + b) / 3;
      
      // Map brightness to color palette
      const colorIndex = Math.floor(brightness / 255 * (palette.length - 1));
      const clampedIndex = Math.max(0, Math.min(palette.length - 1, colorIndex));
      const newColor = palette[clampedIndex];
      
      // Apply style-specific processing
      let finalColor = this.applyStyleProcessing(newColor, style, i, width, height);
      
      // Blend with original based on intensity
      outputData[i]     = r + (finalColor[0] - r) * normalizedIntensity;
      outputData[i + 1] = g + (finalColor[1] - g) * normalizedIntensity;
      outputData[i + 2] = b + (finalColor[2] - b) * normalizedIntensity;
      // Alpha remains unchanged
    }
    
    return outputImageData;
  }
  
  /**
   * Get color palette for style
   * @param {string} style - Pop art style
   * @returns {Array} Array of RGB color arrays
   */
  static getColorPalette(style) {
    const palettes = {
      warhol: [
        [255, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 0],
        [0, 255, 0], [255, 165, 0], [138, 43, 226], [255, 20, 147]
      ],
      lichtenstein: [
        [255, 0, 0], [255, 255, 0], [0, 0, 255], [0, 0, 0],
        [255, 192, 203], [173, 216, 230], [255, 255, 224], [128, 128, 128]
      ],
      neon: [
        [255, 0, 255], [0, 255, 255], [255, 255, 0], [255, 0, 0],
        [57, 255, 20], [255, 20, 147], [0, 191, 255], [255, 165, 0]
      ],
      psychedelic: [
        [255, 0, 255], [255, 255, 0], [0, 255, 0], [255, 0, 0],
        [138, 43, 226], [255, 20, 147], [50, 205, 50], [255, 140, 0]
      ]
    };
    
    return palettes[style] || palettes.warhol;
  }
  
  /**
   * Apply style-specific processing
   * @param {Array} color - RGB color array
   * @param {string} style - Pop art style
   * @param {number} pixelIndex - Current pixel index
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Array} Processed RGB color
   */
  static applyStyleProcessing(color, style, pixelIndex, width, height) {
    const [r, g, b] = color;
    
    switch (style) {
      case 'warhol':
        // High contrast, bold colors
        return [r, g, b];
        
      case 'lichtenstein':
        // Ben-day dots simulation
        const pixelPos = (pixelIndex / 4);
        const dotPattern = (pixelPos % 3 === 0) ? 1.0 : 0.8;
        return [r * dotPattern, g * dotPattern, b * dotPattern];
        
      case 'neon':
        // Glowing effect with oversaturation
        return [
          Math.min(255, r * 1.2),
          Math.min(255, g * 1.2),
          Math.min(255, b * 1.2)
        ];
        
      case 'psychedelic':
        // Color shifting based on position
        const x = (pixelIndex / 4) % width;
        const y = Math.floor((pixelIndex / 4) / width);
        const wave = Math.sin(x * 0.1) * Math.cos(y * 0.1);
        const shift = wave > 0 ? 1.3 : 0.7;
        return [
          Math.min(255, r * shift),
          Math.min(255, g * shift),
          Math.min(255, b * shift)
        ];
        
      default:
        return [r, g, b];
    }
  }
}