/**
 * Enhanced Filter Effects Implementation
 * Complete implementations for Emboss, Edge Detection, and Vignette filters
 */

// Enhanced Vignette Implementation (continued)
  static applyVignetteFilter(imageData, intensity, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    // Enhanced options
    const shape = options.shape || options.vignetteShape || 'circular';
    const size = (options.size || options.vignetteSize || 50) / 100;
    const softness = (options.softness || options.vignetteSoftness || 50) / 100;
    const centerX = ((options.centerX || options.vignetteX || 50) / 100) * width;
    const centerY = ((options.centerY || options.vignetteY || 50) / 100) * height;
    const vignetteColor = options.color || options.vignetteColor || [0, 0, 0];
    
    // Calculate max distance based on shape
    let maxDistance;
    if (shape === 'circular') {
      maxDistance = Math.sqrt(Math.pow(Math.max(centerX, width - centerX), 2) + 
                              Math.pow(Math.max(centerY, height - centerY), 2));
    } else if (shape === 'elliptical') {
      maxDistance = Math.max(width, height);
    } else { // square
      maxDistance = Math.max(width, height);
    }
    
    const innerRadius = maxDistance * size;
    const outerRadius = innerRadius + (maxDistance - innerRadius) * softness;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        
        let distance;
        if (shape === 'circular') {
          distance = Math.sqrt(dx * dx + dy * dy);
        } else if (shape === 'elliptical') {
          // Elliptical distance calculation
          const aspectRatio = width / height;
          distance = Math.sqrt(Math.pow(dx / aspectRatio, 2) + dy * dy);
        } else { // square
          // Manhattan distance for square shape
          distance = Math.max(Math.abs(dx), Math.abs(dy));
        }
        
        // Calculate vignette factor
        let vignetteFactor;
        if (distance <= innerRadius) {
          vignetteFactor = 0; // No vignette
        } else if (distance >= outerRadius) {
          vignetteFactor = 1; // Full vignette
        } else {
          // Smooth transition
          const t = (distance - innerRadius) / (outerRadius - innerRadius);
          vignetteFactor = t * t * (3 - 2 * t); // Smooth step function
        }
        
        const idx = (y * width + x) * 4;
        
        // Apply vignette color
        const finalR = data[idx] * (1 - vignetteFactor) + vignetteColor[0] * vignetteFactor;
        const finalG = data[idx + 1] * (1 - vignetteFactor) + vignetteColor[1] * vignetteFactor;
        const finalB = data[idx + 2] * (1 - vignetteFactor) + vignetteColor[2] * vignetteFactor;
        
        // Blend with original based on intensity
        outputData[idx]     = data[idx] + (finalR - data[idx]) * normalizedIntensity;
        outputData[idx + 1] = data[idx + 1] + (finalG - data[idx + 1]) * normalizedIntensity;
        outputData[idx + 2] = data[idx + 2] + (finalB - data[idx + 2]) * normalizedIntensity;
        outputData[idx + 3] = data[idx + 3]; // Alpha unchanged
      }
    }
    
    return new ImageData(outputData, width, height);
  }
