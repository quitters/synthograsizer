/**
 * Atmospheric Filter Effects for Glitcher App
 * Environmental and atmospheric visual effects
 */

export class AtmosphericFilter {
  /**
   * Apply atmospheric effect to image data
   * @param {ImageData} imageData - Source image data (not modified)
   * @param {string} style - 'fog', 'rain', 'snow', 'dust', 'heat_haze', 'underwater'
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Additional options
   * @returns {ImageData} New image data with effect applied
   */
  static apply(imageData, style = 'fog', intensity = 50, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    switch (style) {
      case 'fog':
        return this.applyFogEffect(outputData, width, height, normalizedIntensity, options);
      case 'rain':
        return this.applyRainEffect(outputData, width, height, normalizedIntensity, options);
      case 'snow':
        return this.applySnowEffect(outputData, width, height, normalizedIntensity, options);
      case 'dust':
        return this.applyDustEffect(outputData, width, height, normalizedIntensity, options);
      case 'heat_haze':
        return this.applyHeatHazeEffect(outputData, width, height, normalizedIntensity, options);
      case 'underwater':
        return this.applyUnderwaterEffect(outputData, width, height, normalizedIntensity, options);
      case 'aurora':
        return this.applyAuroraEffect(outputData, width, height, normalizedIntensity, options);
      case 'lightning':
        return this.applyLightningEffect(outputData, width, height, normalizedIntensity, options);
      default:
        return new ImageData(outputData, width, height);
    }
  }
  
  /**
   * Apply fog effect
   */
  static applyFogEffect(data, width, height, intensity, options = {}) {
    const fogDensity = options.fogDensity || 0.3;
    const fogColor = options.fogColor || [200, 200, 220];
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Create depth-based fog using noise
        const noise = Math.sin(x * 0.02) * Math.cos(y * 0.03) * 0.5 + 0.5;
        const fogAmount = (fogDensity + noise * 0.3) * intensity;
        
        // Distance-based fog (bottom more foggy)
        const distanceFog = (y / height) * 0.5 * intensity;
        const totalFog = Math.min(1, fogAmount + distanceFog);
        
        data[idx] = data[idx] * (1 - totalFog) + fogColor[0] * totalFog;
        data[idx + 1] = data[idx + 1] * (1 - totalFog) + fogColor[1] * totalFog;
        data[idx + 2] = data[idx + 2] * (1 - totalFog) + fogColor[2] * totalFog;
      }
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply rain effect
   */
  static applyRainEffect(data, width, height, intensity, options = {}) {
    const rainDensity = options.rainDensity || 0.1;
    const rainLength = options.rainLength || 20;
    const time = Date.now() * 0.01;
    
    // Rain streaks
    for (let i = 0; i < width * height * rainDensity * intensity; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor((Math.random() + time * 0.1) % 1 * height);
      
      // Draw rain streak
      for (let j = 0; j < rainLength; j++) {
        const rainY = (y + j) % height;
        const rainX = x + Math.floor(j * 0.3); // Slight diagonal
        
        if (rainX >= 0 && rainX < width && rainY >= 0 && rainY < height) {
          const idx = (rainY * width + rainX) * 4;
          const alpha = 1 - (j / rainLength);
          
          data[idx] = Math.min(255, data[idx] + 100 * alpha * intensity);
          data[idx + 1] = Math.min(255, data[idx + 1] + 120 * alpha * intensity);
          data[idx + 2] = Math.min(255, data[idx + 2] + 150 * alpha * intensity);
        }
      }
    }
    
    // Wet surface effect (increase contrast and saturation)
    for (let i = 0; i < data.length; i += 4) {
      const wetFactor = 1 + (intensity * 0.3);
      data[i] = Math.min(255, data[i] * wetFactor);
      data[i + 1] = Math.min(255, data[i + 1] * wetFactor);
      data[i + 2] = Math.min(255, data[i + 2] * wetFactor);
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply snow effect
   */
  static applySnowEffect(data, width, height, intensity, options = {}) {
    const snowDensity = options.snowDensity || 0.05;
    const snowSize = options.snowSize || 2;
    const time = Date.now() * 0.005;
    
    // Snowflakes
    for (let i = 0; i < width * height * snowDensity * intensity; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor((Math.random() + time * 0.05) % 1 * height);
      
      // Draw snowflake
      for (let dy = -snowSize; dy <= snowSize; dy++) {
        for (let dx = -snowSize; dx <= snowSize; dx++) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance <= snowSize) {
            const snowY = y + dy;
            const snowX = x + dx + Math.floor(Math.sin(y * 0.02) * 2); // Drift
            
            if (snowX >= 0 && snowX < width && snowY >= 0 && snowY < height) {
              const idx = (snowY * width + snowX) * 4;
              const alpha = 1 - (distance / snowSize);
              
              data[idx] = Math.min(255, data[idx] + 200 * alpha * intensity);
              data[idx + 1] = Math.min(255, data[idx + 1] + 200 * alpha * intensity);
              data[idx + 2] = Math.min(255, data[idx + 2] + 255 * alpha * intensity);
            }
          }
        }
      }
    }
    
    // Cold color cast
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i] * (1 - intensity * 0.1); // Reduce red
      data[i + 2] = Math.min(255, data[i + 2] * (1 + intensity * 0.2)); // Increase blue
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply dust effect
   */
  static applyDustEffect(data, width, height, intensity, options = {}) {
    const dustDensity = options.dustDensity || 0.02;
    const dustColor = options.dustColor || [180, 160, 120];
    
    // Dust particles
    for (let i = 0; i < width * height * dustDensity * intensity; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const size = Math.floor(Math.random() * 3) + 1;
      
      const idx = (y * width + x) * 4;
      const dustAlpha = Math.random() * intensity;
      
      data[idx] = data[idx] * (1 - dustAlpha) + dustColor[0] * dustAlpha;
      data[idx + 1] = data[idx + 1] * (1 - dustAlpha) + dustColor[1] * dustAlpha;
      data[idx + 2] = data[idx + 2] * (1 - dustAlpha) + dustColor[2] * dustAlpha;
    }
    
    // Overall dusty atmosphere
    for (let i = 0; i < data.length; i += 4) {
      const dustyFactor = 0.9 + (intensity * 0.1);
      data[i] = Math.min(255, data[i] * dustyFactor + 20 * intensity);
      data[i + 1] = Math.min(255, data[i + 1] * dustyFactor + 15 * intensity);
      data[i + 2] = Math.min(255, data[i + 2] * dustyFactor + 5 * intensity);
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply heat haze effect
   */
  static applyHeatHazeEffect(data, width, height, intensity, options = {}) {
    const resultData = new Uint8ClampedArray(data);
    const distortionStrength = options.distortionStrength || 2;
    const time = Date.now() * 0.01;
    
    // Create heat distortion
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Create wavy distortion
        const waveX = Math.sin(y * 0.05 + time) * distortionStrength * intensity;
        const waveY = Math.cos(x * 0.03 + time * 0.7) * distortionStrength * intensity * 0.5;
        
        const sourceX = Math.max(0, Math.min(width - 1, x + Math.floor(waveX)));
        const sourceY = Math.max(0, Math.min(height - 1, y + Math.floor(waveY)));
        const sourceIdx = (sourceY * width + sourceX) * 4;
        
        resultData[idx] = data[sourceIdx];
        resultData[idx + 1] = data[sourceIdx + 1];
        resultData[idx + 2] = data[sourceIdx + 2];
        resultData[idx + 3] = data[sourceIdx + 3];
        
        // Add heat color cast (warm tones)
        resultData[idx] = Math.min(255, resultData[idx] * (1 + intensity * 0.1));
        resultData[idx + 1] = Math.min(255, resultData[idx + 1] * (1 + intensity * 0.05));
        resultData[idx + 2] = Math.min(255, resultData[idx + 2] * (1 - intensity * 0.1));
      }
    }
    
    return new ImageData(resultData, width, height);
  }
  
  /**
   * Apply underwater effect
   */
  static applyUnderwaterEffect(data, width, height, intensity, options = {}) {
    const bubbleDensity = options.bubbleDensity || 0.01;
    const waveStrength = options.waveStrength || 3;
    const time = Date.now() * 0.005;
    
    // Create underwater distortion
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Blue-green tint
        const blueTint = 1 + (intensity * 0.5);
        const greenTint = 1 + (intensity * 0.2);
        const redReduction = 1 - (intensity * 0.3);
        
        data[idx] = data[idx] * redReduction;
        data[idx + 1] = Math.min(255, data[idx + 1] * greenTint);
        data[idx + 2] = Math.min(255, data[idx + 2] * blueTint);
        
        // Add depth darkening
        const depth = y / height;
        const depthFactor = 1 - (depth * intensity * 0.5);
        data[idx] *= depthFactor;
        data[idx + 1] *= depthFactor;
        data[idx + 2] *= depthFactor;
      }
    }
    
    // Add bubbles
    for (let i = 0; i < width * height * bubbleDensity * intensity; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor((Math.random() + time * 0.1) % 1 * height);
      const bubbleSize = Math.floor(Math.random() * 4) + 1;
      
      // Draw bubble
      for (let dy = -bubbleSize; dy <= bubbleSize; dy++) {
        for (let dx = -bubbleSize; dx <= bubbleSize; dx++) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance <= bubbleSize) {
            const bubbleY = y + dy;
            const bubbleX = x + dx;
            
            if (bubbleX >= 0 && bubbleX < width && bubbleY >= 0 && bubbleY < height) {
              const idx = (bubbleY * width + bubbleX) * 4;
              const alpha = 1 - (distance / bubbleSize);
              
              data[idx] = Math.min(255, data[idx] + 80 * alpha);
              data[idx + 1] = Math.min(255, data[idx + 1] + 120 * alpha);
              data[idx + 2] = Math.min(255, data[idx + 2] + 200 * alpha);
            }
          }
        }
      }
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply aurora effect
   */
  static applyAuroraEffect(data, width, height, intensity, options = {}) {
    const time = Date.now() * 0.002;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Create aurora waves
        const wave1 = Math.sin(x * 0.01 + time) * Math.cos(y * 0.005 + time * 0.5);
        const wave2 = Math.cos(x * 0.008 + time * 1.3) * Math.sin(y * 0.007 + time * 0.8);
        const auroraStrength = (wave1 + wave2) * 0.5 + 0.5;
        
        // Aurora appears mainly in upper portion
        const heightFactor = 1 - (y / height);
        const finalStrength = auroraStrength * heightFactor * intensity;
        
        if (finalStrength > 0.3) {
          // Aurora colors (green, blue, purple)
          const hue = (finalStrength * 360 + time * 50) % 360;
          let r, g, b;
          
          if (hue < 120) {
            // Green aurora
            r = 50 + finalStrength * 100;
            g = 150 + finalStrength * 105;
            b = 50 + finalStrength * 100;
          } else if (hue < 240) {
            // Blue aurora
            r = 100 + finalStrength * 50;
            g = 100 + finalStrength * 100;
            b = 150 + finalStrength * 105;
          } else {
            // Purple aurora
            r = 150 + finalStrength * 105;
            g = 50 + finalStrength * 100;
            b = 150 + finalStrength * 105;
          }
          
          data[idx] = Math.min(255, data[idx] + r * finalStrength);
          data[idx + 1] = Math.min(255, data[idx + 1] + g * finalStrength);
          data[idx + 2] = Math.min(255, data[idx + 2] + b * finalStrength);
        }
      }
    }
    
    return new ImageData(data, width, height);
  }
  
  /**
   * Apply lightning effect
   */
  static applyLightningEffect(data, width, height, intensity, options = {}) {
    const lightningChance = options.lightningChance || 0.1;
    
    // Random lightning flash
    if (Math.random() < lightningChance * intensity) {
      // Full screen flash
      const flashIntensity = 0.3 + Math.random() * 0.7;
      
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] + 200 * flashIntensity * intensity);
        data[i + 1] = Math.min(255, data[i + 1] + 220 * flashIntensity * intensity);
        data[i + 2] = Math.min(255, data[i + 2] + 255 * flashIntensity * intensity);
      }
    }
    
    // Lightning bolts
    if (Math.random() < 0.05 * intensity) {
      const startX = Math.floor(Math.random() * width);
      const startY = 0;
      let currentX = startX;
      let currentY = startY;
      
      // Draw jagged lightning bolt
      while (currentY < height) {
        const idx = (currentY * width + currentX) * 4;
        
        // Bright white lightning
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        
        // Add some branches
        for (let branch = 0; branch < 3; branch++) {
          const branchX = currentX + (Math.random() - 0.5) * 10;
          const branchY = currentY + branch;
          
          if (branchX >= 0 && branchX < width && branchY < height) {
            const branchIdx = (branchY * width + Math.floor(branchX)) * 4;
            data[branchIdx] = 200;
            data[branchIdx + 1] = 200;
            data[branchIdx + 2] = 255;
          }
        }
        
        // Move to next point
        currentX += (Math.random() - 0.5) * 4;
        currentY += 1 + Math.random() * 3;
        currentX = Math.max(0, Math.min(width - 1, currentX));
      }
    }
    
    // Storm atmosphere (darker, more contrast)
    for (let i = 0; i < data.length; i += 4) {
      const stormFactor = 1 - (intensity * 0.2);
      data[i] *= stormFactor;
      data[i + 1] *= stormFactor;
      data[i + 2] = Math.min(255, data[i + 2] * (1 + intensity * 0.1));
    }
    
    return new ImageData(data, width, height);
  }
}