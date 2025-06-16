/**
 * Experimental Filter Effects for Glitcher App
 * Wild, experimental, and psychedelic visual effects
 */

export class ExperimentalFilter {
  /**
   * Apply experimental effect to image data
   * @param {ImageData} imageData - Source image data (not modified)
   * @param {string} style - 'kaleidoscope', 'fractal', 'tunnel', 'warp', 'chromatic_shift', 'data_bend'
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Additional options
   * @returns {ImageData} New image data with effect applied
   */
  static apply(imageData, style = 'kaleidoscope', intensity = 50, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    switch (style) {
      case 'kaleidoscope':
        return this.applyKaleidoscopeEffect(outputData, width, height, normalizedIntensity, options);
      case 'fractal':
        return this.applyFractalEffect(outputData, width, height, normalizedIntensity, options);
      case 'tunnel':
        return this.applyTunnelEffect(outputData, width, height, normalizedIntensity, options);
      case 'warp':
        return this.applyWarpEffect(outputData, width, height, normalizedIntensity, options);
      case 'chromatic_shift':
        return this.applyChromaticShiftEffect(outputData, width, height, normalizedIntensity, options);
      case 'data_bend':
        return this.applyDataBendEffect(outputData, width, height, normalizedIntensity, options);
      case 'mirror_world':
        return this.applyMirrorWorldEffect(outputData, width, height, normalizedIntensity, options);
      case 'reality_glitch':
        return this.applyRealityGlitchEffect(outputData, width, height, normalizedIntensity, options);
      default:
        return new ImageData(outputData, width, height);
    }
  }
  
  /**
   * Apply kaleidoscope effect
   */
  static applyKaleidoscopeEffect(data, width, height, intensity, options = {}) {
    const resultData = new Uint8ClampedArray(data);
    const segments = options.segments || 6;
    const centerX = width / 2;
    const centerY = height / 2;
    const time = Date.now() * 0.001;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Convert to polar coordinates
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        let angle = Math.atan2(dy, dx) + time * intensity;
        
        // Create kaleidoscope segments
        angle = (angle % (2 * Math.PI / segments)) * segments;
        if ((Math.floor(angle / (Math.PI / segments)) % 2) === 1) {
          angle = Math.PI / segments - (angle % (Math.PI / segments));
        }
        
        // Convert back to cartesian
        const sourceX = centerX + Math.cos(angle) * distance;
        const sourceY = centerY + Math.sin(angle) * distance;
        
        if (sourceX >= 0 && sourceX < width && sourceY >= 0 && sourceY < height) {
          const sourceIdx = (Math.floor(sourceY) * width + Math.floor(sourceX)) * 4;
          
          const originalR = data[idx];
          const originalG = data[idx + 1];
          const originalB = data[idx + 2];
          
          resultData[idx] = originalR + (data[sourceIdx] - originalR) * intensity;
          resultData[idx + 1] = originalG + (data[sourceIdx + 1] - originalG) * intensity;
          resultData[idx + 2] = originalB + (data[sourceIdx + 2] - originalB) * intensity;
        }
      }
    }
    
    return new ImageData(resultData, width, height);
  }
  
  /**
   * Apply fractal effect
   */
  static applyFractalEffect(data, width, height, intensity, options = {}) {
    const resultData = new Uint8ClampedArray(data);
    const iterations = options.iterations || 5;
    const zoom = options.zoom || 1;
    const time = Date.now() * 0.0005;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Mandelbrot-like calculation
        let zx = (x - width / 2) / (width / 4) * zoom;
        let zy = (y - height / 2) / (height / 4) * zoom;
        let cx = zx + Math.cos(time) * 0.5;
        let cy = zy + Math.sin(time) * 0.5;
        
        let i = 0;
        while (i < iterations && (zx * zx + zy * zy) < 4) {
          const temp = zx * zx - zy * zy + cx;
          zy = 2 * zx * zy + cy;
          zx = temp;
          i++;
        }
        
        const fractalValue = i / iterations;
        const hue = (fractalValue * 360 + time * 100) % 360;
        
        // Convert HSV to RGB
        const c = fractalValue;
        const x1 = c * (1 - Math.abs((hue / 60) % 2 - 1));
        const m = fractalValue - c;
        
        let r, g, b;
        if (hue < 60) { r = c; g = x1; b = 0; }
        else if (hue < 120) { r = x1; g = c; b = 0; }
        else if (hue < 180) { r = 0; g = c; b = x1; }
        else if (hue < 240) { r = 0; g = x1; b = c; }
        else if (hue < 300) { r = x1; g = 0; b = c; }
        else { r = c; g = 0; b = x1; }
        
        r = (r + m) * 255;
        g = (g + m) * 255;
        b = (b + m) * 255;
        
        const originalR = data[idx];
        const originalG = data[idx + 1];
        const originalB = data[idx + 2];
        
        resultData[idx] = originalR + (r - originalR) * intensity;
        resultData[idx + 1] = originalG + (g - originalG) * intensity;
        resultData[idx + 2] = originalB + (b - originalB) * intensity;
      }
    }
    
    return new ImageData(resultData, width, height);
  }
  
  /**
   * Apply tunnel effect
   */
  static applyTunnelEffect(data, width, height, intensity, options = {}) {
    const resultData = new Uint8ClampedArray(data);
    const centerX = width / 2;
    const centerY = height / 2;
    const time = Date.now() * 0.001;
    const tunnelSpeed = options.tunnelSpeed || 1;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        // Create tunnel mapping
        const u = (angle / Math.PI + 1) * width / 4;
        const v = (100 / distance + time * tunnelSpeed) % height;
        
        const sourceX = Math.floor(u) % width;
        const sourceY = Math.floor(v) % height;
        
        if (sourceX >= 0 && sourceX < width && sourceY >= 0 && sourceY < height) {
          const sourceIdx = (sourceY * width + sourceX) * 4;
          
          const originalR = data[idx];
          const originalG = data[idx + 1];
          const originalB = data[idx + 2];
          
          resultData[idx] = originalR + (data[sourceIdx] - originalR) * intensity;
          resultData[idx + 1] = originalG + (data[sourceIdx + 1] - originalG) * intensity;
          resultData[idx + 2] = originalB + (data[sourceIdx + 2] - originalB) * intensity;
        }
      }
    }
    
    return new ImageData(resultData, width, height);
  }
  
  /**
   * Apply warp effect
   */
  static applyWarpEffect(data, width, height, intensity, options = {}) {
    const resultData = new Uint8ClampedArray(data);
    const warpStrength = options.warpStrength || 20;
    const time = Date.now() * 0.002;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Create complex warp field
        const warpX = Math.sin(x * 0.02 + time) * Math.cos(y * 0.03 + time * 0.7) * warpStrength * intensity;
        const warpY = Math.cos(x * 0.025 + time * 1.3) * Math.sin(y * 0.02 + time * 0.5) * warpStrength * intensity;
        
        const sourceX = Math.max(0, Math.min(width - 1, x + warpX));
        const sourceY = Math.max(0, Math.min(height - 1, y + warpY));
        const sourceIdx = (Math.floor(sourceY) * width + Math.floor(sourceX)) * 4;
        
        const originalR = data[idx];
        const originalG = data[idx + 1];
        const originalB = data[idx + 2];
        
        resultData[idx] = originalR + (data[sourceIdx] - originalR) * intensity;
        resultData[idx + 1] = originalG + (data[sourceIdx + 1] - originalG) * intensity;
        resultData[idx + 2] = originalB + (data[sourceIdx + 2] - originalB) * intensity;
      }
    }
    
    return new ImageData(resultData, width, height);
  }
  
  /**
   * Apply chromatic shift effect
   */
  static applyChromaticShiftEffect(data, width, height, intensity, options = {}) {
    const resultData = new Uint8ClampedArray(data);
    const shiftAmount = options.shiftAmount || 10;
    const time = Date.now() * 0.001;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Separate RGB channels with different shifts
        const redShiftX = Math.sin(time + y * 0.01) * shiftAmount * intensity;
        const greenShiftX = Math.cos(time * 1.2 + y * 0.01) * shiftAmount * intensity;
        const blueShiftX = Math.sin(time * 0.8 + y * 0.01) * shiftAmount * intensity;
        
        const redShiftY = Math.cos(time * 0.7 + x * 0.01) * shiftAmount * intensity * 0.5;
        const greenShiftY = Math.sin(time * 1.1 + x * 0.01) * shiftAmount * intensity * 0.5;
        const blueShiftY = Math.cos(time * 0.9 + x * 0.01) * shiftAmount * intensity * 0.5;
        
        // Sample each channel from shifted positions
        const redX = Math.max(0, Math.min(width - 1, x + redShiftX));
        const redY = Math.max(0, Math.min(height - 1, y + redShiftY));
        const redIdx = (Math.floor(redY) * width + Math.floor(redX)) * 4;
        
        const greenX = Math.max(0, Math.min(width - 1, x + greenShiftX));
        const greenY = Math.max(0, Math.min(height - 1, y + greenShiftY));
        const greenIdx = (Math.floor(greenY) * width + Math.floor(greenX)) * 4;
        
        const blueX = Math.max(0, Math.min(width - 1, x + blueShiftX));
        const blueY = Math.max(0, Math.min(height - 1, y + blueShiftY));
        const blueIdx = (Math.floor(blueY) * width + Math.floor(blueX)) * 4;
        
        const originalR = data[idx];
        const originalG = data[idx + 1];
        const originalB = data[idx + 2];
        
        resultData[idx] = originalR + (data[redIdx] - originalR) * intensity;
        resultData[idx + 1] = originalG + (data[greenIdx + 1] - originalG) * intensity;
        resultData[idx + 2] = originalB + (data[blueIdx + 2] - originalB) * intensity;
        resultData[idx + 3] = data[idx + 3];
      }
    }
    
    return new ImageData(resultData, width, height);
  }
  
  /**
   * Apply data bend effect
   */
  static applyDataBendEffect(data, width, height, intensity, options = {}) {
    const resultData = new Uint8ClampedArray(data);
    const bendStrength = options.bendStrength || 0.1;
    
    for (let i = 0; i < data.length; i += 4) {
      if (Math.random() < bendStrength * intensity) {
        // Data corruption simulation
        const corruptionType = Math.floor(Math.random() * 4);
        
        switch (corruptionType) {
          case 0: // Channel swap
            resultData[i] = data[i + 2];
            resultData[i + 1] = data[i];
            resultData[i + 2] = data[i + 1];
            break;
            
          case 1: // Bit shift
            resultData[i] = (data[i] << 1) & 0xFF;
            resultData[i + 1] = (data[i + 1] >> 1) & 0xFF;
            resultData[i + 2] = (data[i + 2] ^ 0x55) & 0xFF;
            break;
            
          case 2: // Random noise
            resultData[i] = Math.random() * 255;
            resultData[i + 1] = Math.random() * 255;
            resultData[i + 2] = Math.random() * 255;
            break;
            
          case 3: // Color inversion
            resultData[i] = 255 - data[i];
            resultData[i + 1] = 255 - data[i + 1];
            resultData[i + 2] = 255 - data[i + 2];
            break;
        }
      } else {
        resultData[i] = data[i];
        resultData[i + 1] = data[i + 1];
        resultData[i + 2] = data[i + 2];
      }
      resultData[i + 3] = data[i + 3];
    }
    
    return new ImageData(resultData, width, height);
  }
  
  /**
   * Apply mirror world effect
   */
  static applyMirrorWorldEffect(data, width, height, intensity, options = {}) {
    const resultData = new Uint8ClampedArray(data);
    const mirrorType = options.mirrorType || 'quad';
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        let sourceX = x;
        let sourceY = y;
        
        switch (mirrorType) {
          case 'horizontal':
            sourceX = x < width / 2 ? x : width - 1 - x;
            break;
            
          case 'vertical':
            sourceY = y < height / 2 ? y : height - 1 - y;
            break;
            
          case 'quad':
            sourceX = x < width / 2 ? x : width - 1 - x;
            sourceY = y < height / 2 ? y : height - 1 - y;
            break;
            
          case 'radial':
            const centerX = width / 2;
            const centerY = height / 2;
            const dx = x - centerX;
            const dy = y - centerY;
            const angle = Math.atan2(dy, dx);
            const distance = Math.sqrt(dx * dx + dy * dy);
            const mirroredAngle = -angle;
            sourceX = centerX + Math.cos(mirroredAngle) * distance;
            sourceY = centerY + Math.sin(mirroredAngle) * distance;
            break;
        }
        
        sourceX = Math.max(0, Math.min(width - 1, Math.floor(sourceX)));
        sourceY = Math.max(0, Math.min(height - 1, Math.floor(sourceY)));
        const sourceIdx = (sourceY * width + sourceX) * 4;
        
        const originalR = data[idx];
        const originalG = data[idx + 1];
        const originalB = data[idx + 2];
        
        resultData[idx] = originalR + (data[sourceIdx] - originalR) * intensity;
        resultData[idx + 1] = originalG + (data[sourceIdx + 1] - originalG) * intensity;
        resultData[idx + 2] = originalB + (data[sourceIdx + 2] - originalB) * intensity;
        resultData[idx + 3] = data[idx + 3];
      }
    }
    
    return new ImageData(resultData, width, height);
  }
  
  /**
   * Apply reality glitch effect
   */
  static applyRealityGlitchEffect(data, width, height, intensity, options = {}) {
    const resultData = new Uint8ClampedArray(data);
    const glitchDensity = options.glitchDensity || 0.05;
    const time = Date.now();
    
    // Create glitch blocks
    for (let i = 0; i < width * height * glitchDensity * intensity; i++) {
      const blockX = Math.floor(Math.random() * width);
      const blockY = Math.floor(Math.random() * height);
      const blockW = Math.floor(Math.random() * 50) + 10;
      const blockH = Math.floor(Math.random() * 20) + 5;
      
      const glitchType = Math.floor(Math.random() * 5);
      
      for (let y = blockY; y < Math.min(height, blockY + blockH); y++) {
        for (let x = blockX; x < Math.min(width, blockX + blockW); x++) {
          const idx = (y * width + x) * 4;
          
          switch (glitchType) {
            case 0: // Digital static
              resultData[idx] = Math.random() * 255;
              resultData[idx + 1] = Math.random() * 255;
              resultData[idx + 2] = Math.random() * 255;
              break;
              
            case 1: // RGB separation
              const offset = Math.floor(Math.random() * 10);
              const sourceIdx = (y * width + Math.max(0, Math.min(width - 1, x + offset))) * 4;
              resultData[idx] = data[sourceIdx];
              resultData[idx + 1] = data[idx + 1];
              resultData[idx + 2] = data[Math.max(0, (y * width + Math.max(0, Math.min(width - 1, x - offset))) * 4 + 2)];
              break;
              
            case 2: // Scanline corruption
              if (y % 3 === 0) {
                resultData[idx] = 0;
                resultData[idx + 1] = 0;
                resultData[idx + 2] = 0;
              }
              break;
              
            case 3: // Color channel corruption
              resultData[idx] = data[idx] ^ 0xFF;
              resultData[idx + 1] = data[idx + 1];
              resultData[idx + 2] = data[idx + 2] ^ 0xAA;
              break;
              
            case 4: // Pixel displacement
              const dispX = Math.floor((Math.random() - 0.5) * 20);
              const dispY = Math.floor((Math.random() - 0.5) * 10);
              const dispSourceX = Math.max(0, Math.min(width - 1, x + dispX));
              const dispSourceY = Math.max(0, Math.min(height - 1, y + dispY));
              const dispSourceIdx = (dispSourceY * width + dispSourceX) * 4;
              
              resultData[idx] = data[dispSourceIdx];
              resultData[idx + 1] = data[dispSourceIdx + 1];
              resultData[idx + 2] = data[dispSourceIdx + 2];
              break;
          }
        }
      }
    }
    
    // Add temporal flickering
    if ((time % 100) < 20) {
      for (let i = 0; i < resultData.length; i += 4) {
        if (Math.random() < 0.1 * intensity) {
          resultData[i] = Math.min(255, resultData[i] + 100);
          resultData[i + 1] = Math.min(255, resultData[i + 1] + 100);
          resultData[i + 2] = Math.min(255, resultData[i + 2] + 100);
        }
      }
    }
    
    return new ImageData(resultData, width, height);
  }
}