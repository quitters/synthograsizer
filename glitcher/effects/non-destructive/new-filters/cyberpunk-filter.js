/**
 * Cyberpunk Filter Effects for Glitcher App
 * Futuristic and cyberpunk-style visual filters
 */

export class CyberpunkFilter {
  /**
   * Apply cyberpunk effect to image data
   * @param {ImageData} imageData - Source image data (not modified)
   * @param {string} style - 'neon', 'matrix', 'synthwave', 'digital_rain'
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Additional options
   * @returns {ImageData} New image data with effect applied
   */
  static apply(imageData, style = 'neon', intensity = 50, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    switch (style) {
      case 'neon':
        return this.applyNeonEffect(outputData, width, height, normalizedIntensity, options);
      case 'matrix':
        return this.applyMatrixEffect(outputData, width, height, normalizedIntensity, options);
      case 'synthwave':
        return this.applySynthwaveEffect(outputData, width, height, normalizedIntensity, options);
      case 'digital_rain':
        return this.applyDigitalRainEffect(outputData, width, height, normalizedIntensity, options);
      case 'hologram':
        return this.applyHologramEffect(outputData, width, height, normalizedIntensity, options);
      case 'glitch_scan':
        return this.applyGlitchScanEffect(outputData, width, height, normalizedIntensity, options);
      default:
        return new ImageData(outputData, width, height);
    }
  }
  
  /**
   * Apply neon glow effect with proper glow implementation
   */
  static applyNeonEffect(data, width, height, intensity, options = {}) {
    const glowRadius = Math.max(1, Math.floor((options.glowRadius || 3) * intensity));
    const colorBoost = 1 + (intensity * 0.8);
    
    // Create a copy for the original image
    const originalData = new Uint8ClampedArray(data);
    
    // First pass: detect bright areas and edges
    const glowMap = new Float32Array(width * height);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // Edge detection using simple gradient
        let edgeStrength = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            const nBrightness = (data[nIdx] + data[nIdx + 1] + data[nIdx + 2]) / 3;
            edgeStrength += Math.abs(brightness - nBrightness);
          }
        }
        
        // Combine brightness and edge detection for glow sources
        const glowIntensity = (brightness / 255) * (edgeStrength / 255) * intensity;
        glowMap[y * width + x] = glowIntensity;
      }
    }
    
    // Second pass: apply blur to create glow
    const tempGlow = new Float32Array(width * height);
    
    // Horizontal blur pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weight = 0;
        
        for (let dx = -glowRadius; dx <= glowRadius; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < width) {
            const w = Math.exp(-(dx * dx) / (2 * glowRadius * glowRadius));
            sum += glowMap[y * width + nx] * w;
            weight += w;
          }
        }
        
        tempGlow[y * width + x] = weight > 0 ? sum / weight : 0;
      }
    }
    
    // Vertical blur pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weight = 0;
        
        for (let dy = -glowRadius; dy <= glowRadius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < height) {
            const w = Math.exp(-(dy * dy) / (2 * glowRadius * glowRadius));
            sum += tempGlow[ny * width + x] * w;
            weight += w;
          }
        }
        
        glowMap[y * width + x] = weight > 0 ? sum / weight : 0;
      }
    }
    
    // Third pass: combine glow with original image
    for (let i = 0; i < data.length; i += 4) {
      const pixelIndex = i / 4;
      const glowStrength = glowMap[pixelIndex];
      
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Enhance bright colors
      const brightness = (r + g + b) / 3;
      const boostFactor = brightness > 128 ? colorBoost : 1;
      
      // Apply neon color enhancement
      let newR = Math.min(255, r * boostFactor);
      let newG = Math.min(255, g * boostFactor);
      let newB = Math.min(255, b * boostFactor);
      
      // Add cyan/magenta color cast for neon look
      if (brightness > 100) {
        newR = Math.min(255, newR + (20 * intensity));
        newB = Math.min(255, newB + (30 * intensity));
      }
      
      // Add glow
      const glowColor = {
        r: 255 * glowStrength,
        g: 255 * glowStrength * 0.8,
        b: 255 * glowStrength
      };
      
      // Additive blending for glow
      newR = Math.min(255, newR + glowColor.r);
      newG = Math.min(255, newG + glowColor.g);
      newB = Math.min(255, newB + glowColor.b);
      
      data[i] = newR;
      data[i + 1] = newG;
      data[i + 2] = newB;
    }
    
    // Add scanlines for cyberpunk effect
    for (let y = 0; y < height; y += 3) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const scanlineIntensity = 0.8 + (0.2 * Math.sin(y * 0.1));
        data[idx] *= scanlineIntensity;
        data[idx + 1] *= scanlineIntensity;
        data[idx + 2] *= scanlineIntensity;
      }
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply Matrix-style green digital effect
   */
  static applyMatrixEffect(data, width, height, intensity, options = {}) {
    const digitalNoise = options.digitalNoise || 0.1;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Convert to green-dominant matrix style
      const brightness = (r + g + b) / 3;
      const greenBoost = brightness * (1 + intensity);
      
      // Apply matrix color transformation
      const newR = brightness * 0.1 * intensity;
      const newG = Math.min(255, greenBoost);
      const newB = brightness * 0.2 * intensity;
      
      // Add digital noise
      const noise = (Math.random() - 0.5) * digitalNoise * 255 * intensity;
      
      data[i] = r + (newR - r) * intensity + noise;
      data[i + 1] = g + (newG - g) * intensity + noise;
      data[i + 2] = b + (newB - b) * intensity + noise;
      
      // Add random digital artifacts
      if (Math.random() < 0.001 * intensity) {
        data[i] = 0;
        data[i + 1] = 255;
        data[i + 2] = 0;
      }
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply synthwave aesthetic
   */
  static applySynthwaveEffect(data, width, height, intensity, options = {}) {
    const gradientStrength = options.gradientStrength || 0.5;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Create gradient from top (purple/pink) to bottom (cyan/blue)
        const gradientFactor = y / height;
        
        // Synthwave color palette
        const synthR = r * (1 + gradientFactor * 0.5) + (255 - gradientFactor * 100) * intensity * gradientStrength;
        const synthG = g * (1 - gradientFactor * 0.3) + (gradientFactor * 50) * intensity * gradientStrength;
        const synthB = b * (1 + gradientFactor * 0.8) + (255 - gradientFactor * 50) * intensity * gradientStrength;
        
        // Apply retro color enhancement
        data[idx] = r + (Math.min(255, synthR) - r) * intensity;
        data[idx + 1] = g + (Math.min(255, synthG) - g) * intensity;
        data[idx + 2] = b + (Math.min(255, synthB) - b) * intensity;
        
        // Add horizontal scan lines
        if (y % 4 === 0) {
          data[idx] *= 0.8;
          data[idx + 1] *= 0.8;
          data[idx + 2] *= 0.8;
        }
      }
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply digital rain effect
   */
  static applyDigitalRainEffect(data, width, height, intensity, options = {}) {
    const rainDensity = options.rainDensity || 0.05;
    
    // Create digital rain pattern
    for (let x = 0; x < width; x += 8) {
      if (Math.random() < rainDensity * intensity) {
        const rainHeight = Math.floor(Math.random() * height * 0.3);
        const startY = Math.floor(Math.random() * height);
        
        for (let y = startY; y < Math.min(height, startY + rainHeight); y++) {
          const idx = (y * width + x) * 4;
          
          // Digital rain characters (green)
          const charIntensity = Math.random() * intensity;
          data[idx] = Math.min(255, data[idx] * 0.3 + 20 * charIntensity);
          data[idx + 1] = Math.min(255, data[idx + 1] * 0.5 + 255 * charIntensity);
          data[idx + 2] = Math.min(255, data[idx + 2] * 0.3 + 50 * charIntensity);
        }
      }
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply hologram effect
   */
  static applyHologramEffect(data, width, height, intensity, options = {}) {
    const flickerRate = options.flickerRate || 0.1;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Create holographic blue tint
      const holoR = r * 0.8;
      const holoG = g * 0.9 + 30 * intensity;
      const holoB = b * 1.2 + 50 * intensity;
      
      data[i] = r + (holoR - r) * intensity;
      data[i + 1] = g + (holoG - g) * intensity;
      data[i + 2] = b + (holoB - b) * intensity;
      
      // Add hologram flicker
      if (Math.random() < flickerRate * intensity) {
        data[i] *= 0.5;
        data[i + 1] *= 0.5;
        data[i + 2] *= 0.5;
      }
      
      // Add transparency effect
      data[i + 3] = Math.min(255, data[i + 3] * (0.7 + 0.3 * (1 - intensity)));
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply glitch scan effect
   */
  static applyGlitchScanEffect(data, width, height, intensity, options = {}) {
    const scanSpeed = options.scanSpeed || 1;
    const frame = (Date.now() * scanSpeed) % 1000;
    
    // Moving scan line
    const scanY = Math.floor((frame / 1000) * height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Distance from scan line
        const distanceFromScan = Math.abs(y - scanY);
        
        if (distanceFromScan < 5) {
          // Intense scan line effect
          const scanIntensity = (5 - distanceFromScan) / 5 * intensity;
          data[idx] = Math.min(255, data[idx] + 100 * scanIntensity);
          data[idx + 1] = Math.min(255, data[idx + 1] + 100 * scanIntensity);
          data[idx + 2] = Math.min(255, data[idx + 2] + 255 * scanIntensity);
        }
        
        // Random digital artifacts
        if (Math.random() < 0.001 * intensity) {
          data[idx] = Math.random() * 255;
          data[idx + 1] = Math.random() * 255;
          data[idx + 2] = Math.random() * 255;
        }
      }
    }
    
    return new ImageData(data, width, height);
  }
}