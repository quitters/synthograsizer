/**
 * Filter Effects Coordinator
 * Manages all non-destructive filter effects
 */

import { PopArtFilter } from './pop-art-filter.js';
import { VintageFilmFilter } from './vintage-film-filter.js';
import { CyberpunkFilter } from './new-filters/cyberpunk-filter.js';
import { ArtisticFilter } from './new-filters/artistic-filter.js';
import { AtmosphericFilter } from './new-filters/atmospheric-filter.js';
import { ExperimentalFilter } from './new-filters/experimental-filter.js';

export class FilterEffects {
  /**
   * Apply filter effect to image data (non-destructive)
   * @param {ImageData} imageData - Source image data
   * @param {string} effectType - Type of filter effect (e.g., 'popArt-warhol', 'vintage-sepia')
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Additional effect options
   * @returns {ImageData} New image data with filter applied
   */
  static apply(imageData, effectType, intensity = 50, options = {}) {
    if (effectType === 'off' || !imageData) {
      return imageData;
    }
    
    // Parse filter type to get base filter and style
    const [baseFilter, style] = effectType.includes('-') ? 
      effectType.split('-', 2) : [effectType, null];
    
    // Update options with the parsed style (only for combined filters)
    const updatedOptions = { ...options };
    if (style) {
      switch (baseFilter) {
        case 'cyberpunk':
          updatedOptions.style = style;
          break;
        case 'artistic':
          updatedOptions.style = style;
          break;
        case 'atmospheric':
          updatedOptions.style = style;
          break;
        case 'experimental':
          updatedOptions.style = style;
          break;
      }
    }
    
    switch (baseFilter) {
      case 'popArt':
        return PopArtFilter.apply(imageData, updatedOptions.style || 'warhol', intensity, updatedOptions);
        
      case 'vintage':
        return VintageFilmFilter.apply(imageData, updatedOptions.filmType || 'polaroid', intensity, updatedOptions);
        
      case 'emboss':
        return this.applyEmbossFilter(imageData, intensity, updatedOptions);
        
      case 'edgeDetect':
        // Extract edge detection parameters - they're stored directly in filterOptions
        return this.applyEdgeDetectionFilter(imageData, intensity, updatedOptions);
        
      case 'motionBlur':
        // Extract motion blur-specific parameters
        const motionBlurParams = updatedOptions.motionBlur || {};
        const motionBlurOptions = { ...updatedOptions, ...motionBlurParams };
        return this.applyMotionBlurFilter(imageData, intensity, motionBlurOptions);
        
      case 'vignette':
        return this.applyVignetteFilter(imageData, intensity, updatedOptions);
        
      case 'halftone':
        // Extract halftone-specific parameters
        const halftoneParams = updatedOptions.halftone || {};
        const halftoneOptions = { ...updatedOptions, ...halftoneParams };
        return this.applyHalftoneFilter(imageData, intensity, halftoneOptions);
        
      // NEW: Cyberpunk filters
      case 'cyberpunk':
        return CyberpunkFilter.apply(imageData, updatedOptions.style || 'neon', intensity, updatedOptions);
        
      // NEW: Artistic filters
      case 'artistic':
        // Extract artistic-specific parameters from nested structure
        const artisticStyle = updatedOptions.style || 'oil_painting';
        const artisticParams = updatedOptions.artisticParams?.[artisticStyle] || {};
        // Merge the specific parameters with the general options
        const mergedOptions = { ...updatedOptions, ...artisticParams };
        return ArtisticFilter.apply(imageData, artisticStyle, intensity, mergedOptions);
        
      // NEW: Atmospheric filters
      case 'atmospheric':
        return AtmosphericFilter.apply(imageData, updatedOptions.style || 'fog', intensity, updatedOptions);
        
      // NEW: Experimental filters
      case 'experimental':
        return ExperimentalFilter.apply(imageData, updatedOptions.style || 'kaleidoscope', intensity, updatedOptions);
        
      // NEW: Advanced Filters
      case 'liquify':
        // Extract liquify-specific parameters
        const liquifyParams = updatedOptions.liquify || {};
        const liquifyOptions = { ...updatedOptions, ...liquifyParams };
        return this.applyLiquifyFilter(imageData, intensity, liquifyOptions);
        
      case 'colorGrading':
        // Extract color grading-specific parameters
        const colorGradingParams = updatedOptions.colorGrading || {};
        const colorGradingOptions = { ...updatedOptions, ...colorGradingParams };
        return this.applyColorGradingFilter(imageData, intensity, colorGradingOptions);
        
      case 'noise':
        // Extract noise-specific parameters
        const noiseParams = updatedOptions.noise || {};
        const noiseOptions = { ...updatedOptions, ...noiseParams };
        return this.applyNoiseFilter(imageData, intensity, noiseOptions);
        
      default:
        console.warn(`Unknown filter effect: ${effectType}`);
        return imageData;
    }
  }
  
  /**
   * Apply emboss filter with enhanced parameters
   * @param {ImageData} imageData - Source image data
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Enhanced emboss options
   * @returns {ImageData} New image data with emboss effect
   */
  static applyEmbossFilter(imageData, intensity, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    // Enhanced options
    const angle = (options.angle || options.embossAngle || 45) * Math.PI / 180;
    const depth = options.depth || options.embossDepth || 1;
    const blendMode = options.blendMode || options.embossBlend || 'gray';
    
    // Generate directional kernel based on angle
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    // Emboss kernel with depth
    const kernel = [
      [-2 * depth, -1 * depth,  0],
      [-1 * depth,  1,  1 * depth],
      [ 0,  1 * depth,  2 * depth]
    ];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let r = 0, g = 0, b = 0;
        
        for (let ky = 0; ky < 3; ky++) {
          for (let kx = 0; kx < 3; kx++) {
            const px = x + kx - 1;
            const py = y + ky - 1;
            const idx = (py * width + px) * 4;
            const weight = kernel[ky][kx];
            
            r += data[idx] * weight;
            g += data[idx + 1] * weight;
            b += data[idx + 2] * weight;
          }
        }
        
        const centerIdx = (y * width + x) * 4;
        const originalR = data[centerIdx];
        const originalG = data[centerIdx + 1];
        const originalB = data[centerIdx + 2];
        
        // Apply blend mode
        let finalR, finalG, finalB;
        
        if (blendMode === 'gray' || blendMode === 'grayscale') {
          // Add offset to make emboss visible
          const embossValue = (r + g + b) / 3 + 128;
          finalR = finalG = finalB = embossValue;
        } else if (blendMode === 'color') {
          // Preserve original colors with emboss lighting
          const embossValue = (r + g + b) / 3;
          const factor = (embossValue + 128) / 128;
          finalR = originalR * factor;
          finalG = originalG * factor;
          finalB = originalB * factor;
        } else { // overlay
          // Mix emboss with original
          finalR = (r + 128 + originalR) / 2;
          finalG = (g + 128 + originalG) / 2;
          finalB = (b + 128 + originalB) / 2;
        }
        
        // Blend with original based on intensity
        outputData[centerIdx]     = originalR + (Math.max(0, Math.min(255, finalR)) - originalR) * normalizedIntensity;
        outputData[centerIdx + 1] = originalG + (Math.max(0, Math.min(255, finalG)) - originalG) * normalizedIntensity;
        outputData[centerIdx + 2] = originalB + (Math.max(0, Math.min(255, finalB)) - originalB) * normalizedIntensity;
      }
    }
    
    return new ImageData(outputData, width, height);
  }
  
  /**
   * Apply edge detection filter with enhanced parameters
   * @param {ImageData} imageData - Source image data
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Enhanced edge detection options
   * @returns {ImageData} New image data with edge detection
   */
  static applyEdgeDetectionFilter(imageData, intensity, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    // Enhanced options - support both nested and flat parameter names
    const method = options.method || options.edgeMethod || 'sobel';
    const threshold = options.threshold || options.edgeThreshold || 50;
    const edgeColor = options.edgeColor || [255, 255, 255];
    const background = options.background || options.edgeBackground || 'black';
    
    // Determine background color
    let bgR = 0, bgG = 0, bgB = 0;
    if (background === 'white') {
      bgR = bgG = bgB = 255;
    } else if (background === 'original') {
      // Will use original pixel colors
    } else {
      // Default to black
      bgR = bgG = bgB = 0;
    }
    
    // Different kernels for different methods
    let kernelX, kernelY;
    
    switch (method) {
      case 'prewitt':
        kernelX = [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]];
        kernelY = [[-1, -1, -1], [0, 0, 0], [1, 1, 1]];
        break;
      case 'roberts':
        kernelX = [[1, 0], [0, -1]];
        kernelY = [[0, 1], [-1, 0]];
        break;
      case 'laplacian':
        kernelX = [[0, -1, 0], [-1, 4, -1], [0, -1, 0]];
        kernelY = null; // Laplacian doesn't need Y kernel
        break;
      default: // sobel
        kernelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
        kernelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    }
    
    // Determine kernel size based on method
    const kernelSize = (method === 'roberts') ? 2 : 3;
    const offset = (method === 'roberts') ? 0 : 1;
    
    // First pass: detect edges
    const edgeData = new Uint8ClampedArray(width * height);
    
    for (let y = offset; y < height - offset; y++) {
      for (let x = offset; x < width - offset; x++) {
        let gx = 0, gy = 0;
        
        for (let ky = 0; ky < kernelSize; ky++) {
          for (let kx = 0; kx < kernelSize; kx++) {
            const px = x + kx - offset;
            const py = y + ky - offset;
            
            if (px >= 0 && px < width && py >= 0 && py < height) {
              const idx = (py * width + px) * 4;
              
              // Convert to grayscale for edge detection
              const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
              
              if (kernelX && kernelX[ky] && kernelX[ky][kx] !== undefined) {
                gx += gray * kernelX[ky][kx];
              }
              if (kernelY && kernelY[ky] && kernelY[ky][kx] !== undefined) {
                gy += gray * kernelY[ky][kx];
              }
            }
          }
        }
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edgeData[y * width + x] = Math.min(255, magnitude);
      }
    }
    
    // Second pass: apply threshold and colors
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const centerIdx = (y * width + x) * 4;
        const edgeStrength = edgeData[y * width + x];
        const originalR = data[centerIdx];
        const originalG = data[centerIdx + 1];
        const originalB = data[centerIdx + 2];
        
        // Check if edge passes threshold
        const isEdge = edgeStrength > threshold;
        
        let finalR, finalG, finalB;
        
        if (isEdge) {
          // Use edge color
          finalR = edgeColor[0];
          finalG = edgeColor[1];
          finalB = edgeColor[2];
        } else {
          // Use background
          if (background === 'original') {
            finalR = originalR;
            finalG = originalG;
            finalB = originalB;
          } else {
            finalR = bgR;
            finalG = bgG;
            finalB = bgB;
          }
        }
        
        // Blend with original based on intensity
        outputData[centerIdx]     = originalR + (finalR - originalR) * normalizedIntensity;
        outputData[centerIdx + 1] = originalG + (finalG - originalG) * normalizedIntensity;
        outputData[centerIdx + 2] = originalB + (finalB - originalB) * normalizedIntensity;
        outputData[centerIdx + 3] = data[centerIdx + 3];
      }
    }
    
    return new ImageData(outputData, width, height);
  }
  
  /**
   * Apply enhanced motion blur filter with advanced controls
   * @param {ImageData} imageData - Source image data
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Enhanced motion blur options
   * @returns {ImageData} New image data with motion blur
   */
  static applyMotionBlurFilter(imageData, intensity, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    // Enhanced options with defaults
    const direction = options.direction || 'horizontal';
    const distance = Math.floor((options.distance || 10) * normalizedIntensity);
    const angle = (options.angle || 0) * Math.PI / 180; // Custom angle in radians
    const fadeType = options.fadeType || 'linear'; // 'linear', 'exponential', 'sine'
    const quality = options.quality || 'normal'; // 'fast', 'normal', 'high'
    
    // Calculate direction vector
    let dx = 0, dy = 0;
    switch (direction) {
      case 'horizontal': dx = 1; dy = 0; break;
      case 'vertical': dx = 0; dy = 1; break;
      case 'diagonal': dx = 1; dy = 1; break;
      case 'diagonal-left': dx = -1; dy = 1; break;
      case 'diagonal-right': dx = 1; dy = 1; break;
      case 'radial':
        // Radial blur - handled separately
        return this.applyRadialMotionBlur(imageData, intensity, options);
      case 'custom':
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        break;
    }
    
    // Normalize diagonal vector
    if (direction === 'diagonal' || direction === 'diagonal-left' || direction === 'diagonal-right') {
      const length = Math.sqrt(dx * dx + dy * dy);
      dx /= length;
      dy /= length;
    }
    
    // Quality settings determine sampling
    const samples = quality === 'fast' ? Math.max(3, distance / 2) : 
                   quality === 'high' ? distance * 2 : distance;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, totalWeight = 0;
        
        // Sample along the motion vector
        for (let i = 0; i < samples; i++) {
          const t = (i / (samples - 1)) * 2 - 1; // -1 to 1
          const offset = t * distance;
          
          const nx = Math.round(x + offset * dx);
          const ny = Math.round(y + offset * dy);
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4;
            
            // Calculate weight based on fade type
            let weight = 1;
            const absT = Math.abs(t);
            switch (fadeType) {
              case 'linear':
                weight = 1 - absT;
                break;
              case 'exponential':
                weight = Math.exp(-absT * 2);
                break;
              case 'sine':
                weight = Math.cos(absT * Math.PI / 2);
                break;
            }
            
            r += data[idx] * weight;
            g += data[idx + 1] * weight;
            b += data[idx + 2] * weight;
            totalWeight += weight;
          }
        }
        
        if (totalWeight > 0) {
          const centerIdx = (y * width + x) * 4;
          const originalR = data[centerIdx];
          const originalG = data[centerIdx + 1];
          const originalB = data[centerIdx + 2];
          
          const blurredR = r / totalWeight;
          const blurredG = g / totalWeight;
          const blurredB = b / totalWeight;
          
          outputData[centerIdx]     = originalR + (blurredR - originalR) * normalizedIntensity;
          outputData[centerIdx + 1] = originalG + (blurredG - originalG) * normalizedIntensity;
          outputData[centerIdx + 2] = originalB + (blurredB - originalB) * normalizedIntensity;
          outputData[centerIdx + 3] = data[centerIdx + 3];
        }
      }
    }
    
    return new ImageData(outputData, width, height);
  }
  
  /**
   * Apply radial motion blur (zoom/spin effect)
   * @param {ImageData} imageData - Source image data
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Radial blur options
   * @returns {ImageData} New image data with radial motion blur
   */
  static applyRadialMotionBlur(imageData, intensity, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    // Radial blur options
    const centerX = options.centerX || width / 2;
    const centerY = options.centerY || height / 2;
    const blurType = options.radialType || 'zoom'; // 'zoom' or 'spin'
    const samples = 8;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        for (let i = 0; i < samples; i++) {
          let sampleX, sampleY;
          
          if (blurType === 'zoom') {
            // Zoom blur - sample along radius
            const t = (i / (samples - 1)) * 2 - 1; // -1 to 1
            const factor = 1 + t * normalizedIntensity * 0.1;
            sampleX = centerX + dx * factor;
            sampleY = centerY + dy * factor;
          } else {
            // Spin blur - sample around arc
            const angleOffset = (i / (samples - 1)) * 2 - 1; // -1 to 1
            const newAngle = angle + angleOffset * normalizedIntensity * 0.2;
            sampleX = centerX + distance * Math.cos(newAngle);
            sampleY = centerY + distance * Math.sin(newAngle);
          }
          
          const nx = Math.round(sampleX);
          const ny = Math.round(sampleY);
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
        
        if (count > 0) {
          const centerIdx = (y * width + x) * 4;
          const originalR = data[centerIdx];
          const originalG = data[centerIdx + 1];
          const originalB = data[centerIdx + 2];
          
          outputData[centerIdx]     = originalR + ((r / count) - originalR) * normalizedIntensity;
          outputData[centerIdx + 1] = originalG + ((g / count) - originalG) * normalizedIntensity;
          outputData[centerIdx + 2] = originalB + ((b / count) - originalB) * normalizedIntensity;
          outputData[centerIdx + 3] = data[centerIdx + 3];
        }
      }
    }
    
    return new ImageData(outputData, width, height);
  }
  
  /**
   * Apply vignette filter
   * @param {ImageData} imageData - Source image data
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Vignette options
   * @returns {ImageData} New image data with vignette
   */
  static applyVignetteFilter(imageData, intensity, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    // Extract vignette options
    const shape = options.vignetteShape || 'circular';
    const size = (options.vignetteSize || 50) / 100; // Convert percentage to 0-1
    const softness = (options.vignetteSoftness || 50) / 100;
    const vignetteX = (options.vignetteX || 50) / 100; // Convert percentage to 0-1
    const vignetteY = (options.vignetteY || 50) / 100;
    const vignetteColor = options.vignetteColor || [0, 0, 0];
    
    const centerX = width * vignetteX;
    const centerY = height * vignetteY;
    const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY) * (2 - size);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        
        let distance;
        if (shape === 'square') {
          // Square vignette
          distance = Math.max(Math.abs(dx), Math.abs(dy));
        } else if (shape === 'elliptical') {
          // Elliptical vignette
          const aspectRatio = width / height;
          distance = Math.sqrt((dx * dx) + (dy * dy * aspectRatio * aspectRatio));
        } else {
          // Circular vignette (default)
          distance = Math.sqrt(dx * dx + dy * dy);
        }
        
        // Calculate vignette factor (0 at edges, 1 at center)
        let vignetteFactor = 1 - (distance / maxDistance);
        vignetteFactor = Math.max(0, Math.min(1, vignetteFactor));
        
        // Apply softness (higher softness = smoother falloff)
        const power = 1 + (1 - softness) * 3; // Power from 1 to 4
        vignetteFactor = Math.pow(vignetteFactor, power);
        
        const idx = (y * width + x) * 4;
        
        // Apply vignette with color
        const factor = 1 - (1 - vignetteFactor) * normalizedIntensity;
        
        if (vignetteColor[0] === 0 && vignetteColor[1] === 0 && vignetteColor[2] === 0) {
          // Black vignette (default) - darken
          outputData[idx]     = data[idx] * factor;
          outputData[idx + 1] = data[idx + 1] * factor;
          outputData[idx + 2] = data[idx + 2] * factor;
        } else {
          // Colored vignette - blend with vignette color
          const blendFactor = (1 - vignetteFactor) * normalizedIntensity;
          outputData[idx]     = data[idx] + (vignetteColor[0] - data[idx]) * blendFactor;
          outputData[idx + 1] = data[idx + 1] + (vignetteColor[1] - data[idx + 1]) * blendFactor;
          outputData[idx + 2] = data[idx + 2] + (vignetteColor[2] - data[idx + 2]) * blendFactor;
        }
        outputData[idx + 3] = data[idx + 3]; // Alpha unchanged
      }
    }
    
    return new ImageData(outputData, width, height);
  }
  
  /**
   * Apply enhanced halftone filter with advanced controls
   * @param {ImageData} imageData - Source image data
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Enhanced halftone options
   * @returns {ImageData} New image data with halftone effect
   */
  static applyHalftoneFilter(imageData, intensity, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    // Enhanced options with defaults
    const dotSize = options.dotSize || 4;
    const pattern = options.pattern || 'circle';
    const angle = (options.angle || 0) * Math.PI / 180; // Convert to radians
    const threshold = options.threshold || 128;
    const colorMode = options.colorMode || 'bw'; // 'bw', 'duotone', 'color'
    const duotoneColors = options.duotoneColors || [[0, 0, 0], [255, 255, 255]];
    
    // Pre-calculate rotation matrix for angled patterns
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    
    for (let y = 0; y < height; y += dotSize) {
      for (let x = 0; x < width; x += dotSize) {
        // Calculate average brightness and color in this region
        let totalBrightness = 0;
        let avgR = 0, avgG = 0, avgB = 0;
        let pixelCount = 0;
        
        for (let dy = 0; dy < dotSize && y + dy < height; dy++) {
          for (let dx = 0; dx < dotSize && x + dx < width; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const brightness = (r + g + b) / 3;
            
            totalBrightness += brightness;
            avgR += r;
            avgG += g;
            avgB += b;
            pixelCount++;
          }
        }
        
        const avgBrightness = totalBrightness / pixelCount;
        avgR /= pixelCount;
        avgG /= pixelCount;
        avgB /= pixelCount;
        
        // Apply threshold
        const adjustedBrightness = Math.max(0, (avgBrightness - threshold) / (255 - threshold) * 255);
        const dotRadius = (dotSize / 2) * (1 - adjustedBrightness / 255);
        
        // Draw halftone dot with rotation
        for (let dy = 0; dy < dotSize && y + dy < height; dy++) {
          for (let dx = 0; dx < dotSize && x + dx < width; dx++) {
            const centerX = dotSize / 2;
            const centerY = dotSize / 2;
            
            // Apply rotation
            const relX = dx - centerX;
            const relY = dy - centerY;
            const rotX = relX * cos - relY * sin;
            const rotY = relX * sin + relY * cos;
            
            let inDot = false;
            switch (pattern) {
              case 'circle':
                inDot = Math.sqrt(rotX * rotX + rotY * rotY) <= dotRadius;
                break;
              case 'square':
                inDot = Math.abs(rotX) <= dotRadius && Math.abs(rotY) <= dotRadius;
                break;
              case 'diamond':
                inDot = Math.abs(rotX) + Math.abs(rotY) <= dotRadius;
                break;
              case 'line':
              case 'lines':
                inDot = Math.abs(rotY) <= dotRadius / 4;
                break;
              case 'crosshatch':
                inDot = Math.abs(rotY) <= dotRadius / 4 || Math.abs(rotX) <= dotRadius / 4;
                break;
            }
            
            const idx = ((y + dy) * width + (x + dx)) * 4;
            const originalR = data[idx];
            const originalG = data[idx + 1];
            const originalB = data[idx + 2];
            
            let newR, newG, newB;
            
            if (colorMode === 'bw') {
              // Black and white halftone
              const value = inDot ? 0 : 255;
              newR = originalR + (value - originalR) * normalizedIntensity;
              newG = originalG + (value - originalG) * normalizedIntensity;
              newB = originalB + (value - originalB) * normalizedIntensity;
            } else if (colorMode === 'duotone') {
              // Duotone halftone
              const darkColor = duotoneColors[0];
              const lightColor = duotoneColors[1];
              const color = inDot ? darkColor : lightColor;
              newR = originalR + (color[0] - originalR) * normalizedIntensity;
              newG = originalG + (color[1] - originalG) * normalizedIntensity;
              newB = originalB + (color[2] - originalB) * normalizedIntensity;
            } else {
              // Color halftone - preserve original colors with halftone pattern
              const factor = inDot ? 0.3 : 1.0;
              newR = originalR + (avgR * factor - originalR) * normalizedIntensity;
              newG = originalG + (avgG * factor - originalG) * normalizedIntensity;
              newB = originalB + (avgB * factor - originalB) * normalizedIntensity;
            }
            
            outputData[idx]     = Math.max(0, Math.min(255, newR));
            outputData[idx + 1] = Math.max(0, Math.min(255, newG));
            outputData[idx + 2] = Math.max(0, Math.min(255, newB));
            outputData[idx + 3] = data[idx + 3];
          }
        }
      }
    }
    
    return new ImageData(outputData, width, height);
  }
  
  /**
   * Apply liquify/warp filter for distortion effects
   * @param {ImageData} imageData - Source image data
   * @param {number} intensity - Effect intensity 0-100 (NOT opacity - affects strength)
   * @param {Object} options - Liquify options
   * @returns {ImageData} New image data with liquify effect
   */
  static applyLiquifyFilter(imageData, intensity, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data.length);
    // Initialize with original data
    outputData.set(data);
    
    const normalizedIntensity = intensity / 100;
    
    // Liquify options
    const warpType = options.warpType || 'push';
    const centerX = options.centerX || width / 2;
    const centerY = options.centerY || height / 2;
    
    // Calculate radius based on coverage percentage (25% to 150%)
    const coveragePercent = options.coveragePercent || 100;
    const maxDimension = Math.max(width, height);
    const radius = (maxDimension / 2) * (coveragePercent / 100);
    
    const strength = options.strength || 50;
    
    console.log(`🌊 Liquify: ${warpType}, coverage: ${coveragePercent}%, radius: ${radius.toFixed(1)}px, strength: ${strength}%, intensity: ${intensity}%`);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < radius) {
          // Smooth falloff using cosine function
          const normalizedDistance = distance / radius;
          const falloffFactor = 0.5 * (1 + Math.cos(Math.PI * normalizedDistance));
          
          let sourceX = x;
          let sourceY = y;
          
          // Effect strength combines: falloff + user strength + filter intensity
          const effectStrength = falloffFactor * (strength / 100) * normalizedIntensity;
          
          switch (warpType) {
            case 'push':
              if (distance > 0) {
                const pushAmount = effectStrength * 40;
                sourceX = x - (dx / distance) * pushAmount;
                sourceY = y - (dy / distance) * pushAmount;
              }
              break;
              
            case 'pull':
              if (distance > 0) {
                const pullAmount = effectStrength * 40;
                sourceX = x + (dx / distance) * pullAmount;
                sourceY = y + (dy / distance) * pullAmount;
              }
              break;
              
            case 'twirl':
              if (distance > 0) {
                const angle = Math.atan2(dy, dx) + effectStrength * 1.5;
                sourceX = centerX + distance * Math.cos(angle);
                sourceY = centerY + distance * Math.sin(angle);
              }
              break;
              
            case 'bloat':
              const bloatScale = 1 + effectStrength * 1.0;
              sourceX = centerX + dx / bloatScale;
              sourceY = centerY + dy / bloatScale;
              break;
              
            case 'pinch':
              const pinchScale = Math.max(0.1, 1 - effectStrength * 1.0);
              sourceX = centerX + dx / pinchScale;
              sourceY = centerY + dy / pinchScale;
              break;
          }
          
          // Sample from source position with bilinear interpolation
          const srcX = Math.max(0, Math.min(width - 1, sourceX));
          const srcY = Math.max(0, Math.min(height - 1, sourceY));
          
          const x1 = Math.floor(srcX);
          const y1 = Math.floor(srcY);
          const x2 = Math.min(width - 1, x1 + 1);
          const y2 = Math.min(height - 1, y1 + 1);
          
          const fx = srcX - x1;
          const fy = srcY - y1;
          
          // Bilinear interpolation
          const idx1 = (y1 * width + x1) * 4;
          const idx2 = (y1 * width + x2) * 4;
          const idx3 = (y2 * width + x1) * 4;
          const idx4 = (y2 * width + x2) * 4;
          
          const r = (1 - fx) * (1 - fy) * data[idx1] +
                   fx * (1 - fy) * data[idx2] +
                   (1 - fx) * fy * data[idx3] +
                   fx * fy * data[idx4];
                   
          const g = (1 - fx) * (1 - fy) * data[idx1 + 1] +
                   fx * (1 - fy) * data[idx2 + 1] +
                   (1 - fx) * fy * data[idx3 + 1] +
                   fx * fy * data[idx4 + 1];
                   
          const b = (1 - fx) * (1 - fy) * data[idx1 + 2] +
                   fx * (1 - fy) * data[idx2 + 2] +
                   (1 - fx) * fy * data[idx3 + 2] +
                   fx * fy * data[idx4 + 2];
          
          const outputIdx = (y * width + x) * 4;
          
          // FIXED: Apply effect directly instead of blending with original
          // The filter intensity is now built into effectStrength calculation
          outputData[outputIdx] = r;
          outputData[outputIdx + 1] = g;
          outputData[outputIdx + 2] = b;
          outputData[outputIdx + 3] = data[outputIdx + 3];
        }
      }
    }
    
    return new ImageData(outputData, width, height);
  }
  
  /**
   * Apply advanced color grading filter
   * @param {ImageData} imageData - Source image data
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Color grading options
   * @returns {ImageData} New image data with color grading
   */
  static applyColorGradingFilter(imageData, intensity, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    // Color grading options - support both nested and flat structure
    const shadows = options.shadows || options.colorGrading?.shadows || { r: 0, g: 0, b: 0 };
    const midtones = options.midtones || options.colorGrading?.midtones || { r: 0, g: 0, b: 0 };
    const highlights = options.highlights || options.colorGrading?.highlights || { r: 0, g: 0, b: 0 };
    const temperature = (options.temperature !== undefined ? options.temperature : 
                        options.colorGrading?.temperature !== undefined ? options.colorGrading.temperature : 0) / 100;
    const tint = (options.tint !== undefined ? options.tint : 
                  options.colorGrading?.tint !== undefined ? options.colorGrading.tint : 0) / 100;
    const vibrance = (options.vibrance !== undefined ? options.vibrance : 
                      options.colorGrading?.vibrance !== undefined ? options.colorGrading.vibrance : 0) / 100;
    const saturation = 1 + (options.saturation !== undefined ? options.saturation : 
                            options.colorGrading?.saturation !== undefined ? options.colorGrading.saturation : 0) / 100;
    
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      
      // Calculate luminance
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      
      // Determine shadow/midtone/highlight weights
      const shadowWeight = Math.max(0, 1 - luminance * 2); // Strong in shadows
      const highlightWeight = Math.max(0, (luminance - 0.5) * 2); // Strong in highlights
      const midtoneWeight = 1 - shadowWeight - highlightWeight;
      
      // Apply color adjustments
      r += (shadows.r / 100) * shadowWeight * normalizedIntensity;
      g += (shadows.g / 100) * shadowWeight * normalizedIntensity;
      b += (shadows.b / 100) * shadowWeight * normalizedIntensity;
      
      r += (midtones.r / 100) * midtoneWeight * normalizedIntensity;
      g += (midtones.g / 100) * midtoneWeight * normalizedIntensity;
      b += (midtones.b / 100) * midtoneWeight * normalizedIntensity;
      
      r += (highlights.r / 100) * highlightWeight * normalizedIntensity;
      g += (highlights.g / 100) * highlightWeight * normalizedIntensity;
      b += (highlights.b / 100) * highlightWeight * normalizedIntensity;
      
      // Apply temperature and tint
      if (temperature !== 0) {
        r += temperature * 0.2 * normalizedIntensity;
        b -= temperature * 0.2 * normalizedIntensity;
      }
      
      if (tint !== 0) {
        g += tint * 0.2 * normalizedIntensity;
      }
      
      // Apply saturation and vibrance
      if (saturation !== 1 || vibrance !== 0) {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        
        // Regular saturation
        r = gray + (r - gray) * saturation;
        g = gray + (g - gray) * saturation;
        b = gray + (b - gray) * saturation;
        
        // Vibrance (protects skin tones and already saturated colors)
        if (vibrance !== 0) {
          const maxColor = Math.max(r, g, b);
          const minColor = Math.min(r, g, b);
          const currentSat = maxColor - minColor;
          const vibranceAmount = vibrance * (1 - currentSat) * normalizedIntensity;
          
          r = gray + (r - gray) * (1 + vibranceAmount);
          g = gray + (g - gray) * (1 + vibranceAmount);
          b = gray + (b - gray) * (1 + vibranceAmount);
        }
      }
      
      // Clamp values
      outputData[i] = Math.max(0, Math.min(255, r * 255));
      outputData[i + 1] = Math.max(0, Math.min(255, g * 255));
      outputData[i + 2] = Math.max(0, Math.min(255, b * 255));
      outputData[i + 3] = data[i + 3];
    }
    
    return new ImageData(outputData, width, height);
  }
  
  /**
   * Apply noise filter with various noise types
   * @param {ImageData} imageData - Source image data
   * @param {number} intensity - Effect intensity 0-100
   * @param {Object} options - Noise options
   * @returns {ImageData} New image data with noise
   */
  static applyNoiseFilter(imageData, intensity, options = {}) {
    const { data, width, height } = imageData;
    const outputData = new Uint8ClampedArray(data);
    const normalizedIntensity = intensity / 100;
    
    // Noise options
    const noiseType = options.noiseType || 'film'; // 'film', 'digital', 'perlin', 'cellular'
    const noiseAmount = (options.noiseAmount || 50) / 100;
    const noiseSize = options.noiseSize || 1;
    const colorNoise = options.colorNoise !== false; // true by default
    
    // Generate noise based on type
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % width;
      const y = Math.floor((i / 4) / width);
      
      let noiseValue = 0;
      
      switch (noiseType) {
        case 'film':
          // Classic film grain - random with slight clustering
          noiseValue = (Math.random() - 0.5) * 2;
          if (Math.random() < 0.1) {
            noiseValue *= 2; // Occasional stronger grain
          }
          break;
          
        case 'digital':
          // Digital noise - more uniform
          noiseValue = (Math.random() - 0.5) * 2;
          break;
          
        case 'perlin':
          // Simplified Perlin-like noise
          const frequency = 0.1 / noiseSize;
          noiseValue = Math.sin(x * frequency) * Math.cos(y * frequency) + 
                      Math.sin(x * frequency * 2) * Math.cos(y * frequency * 2) * 0.5;
          noiseValue = (noiseValue + 1.5) / 3 - 0.5; // Normalize to -0.5 to 0.5
          break;
          
        case 'cellular':
          // Cellular automata-like pattern
          const cellSize = Math.max(1, noiseSize * 2);
          const cellX = Math.floor(x / cellSize);
          const cellY = Math.floor(y / cellSize);
          const hash = ((cellX * 73856093) ^ (cellY * 19349663)) % 1000000;
          noiseValue = (hash / 1000000 - 0.5) * 2;
          break;
      }
      
      // Scale noise by amount and intensity
      const finalNoise = noiseValue * noiseAmount * normalizedIntensity * 255;
      
      if (colorNoise) {
        // Apply different noise to each channel
        const rNoise = finalNoise * (0.8 + Math.random() * 0.4);
        const gNoise = finalNoise * (0.8 + Math.random() * 0.4);
        const bNoise = finalNoise * (0.8 + Math.random() * 0.4);
        
        outputData[i] = Math.max(0, Math.min(255, data[i] + rNoise));
        outputData[i + 1] = Math.max(0, Math.min(255, data[i + 1] + gNoise));
        outputData[i + 2] = Math.max(0, Math.min(255, data[i + 2] + bNoise));
      } else {
        // Luminance noise only
        outputData[i] = Math.max(0, Math.min(255, data[i] + finalNoise));
        outputData[i + 1] = Math.max(0, Math.min(255, data[i + 1] + finalNoise));
        outputData[i + 2] = Math.max(0, Math.min(255, data[i + 2] + finalNoise));
      }
      
      outputData[i + 3] = data[i + 3]; // Alpha unchanged
    }
    
    return new ImageData(outputData, width, height);
  }
}