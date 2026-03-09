/**
 * Advanced Selection Engine for Glitcher App
 * Handles intelligent region detection and selection algorithms
 * Ported from original implementation with enhanced modularity
 */

import { rgbToHsl, hslToRgb } from '../utils/color-utils.js';
import { randomInt } from '../utils/math-utils.js';

export class SelectionEngine {
  constructor(imageData, width, height) {
    this.imageData = imageData;
    this.width = width;
    this.height = height;
    this.regions = [];
    this.cache = {
      colorAnalysis: null,
      brightnessMap: null,
      edgeMap: null
    };
  }

  /**
   * Update image data for the selection engine
   * @param {ImageData} imageData - New image data
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  updateImageData(imageData, width, height) {
    this.imageData = imageData;
    this.width = width;
    this.height = height;
    this.clearCache();
  }

  /**
   * Generate selections based on method and configuration
   * @param {string} method - Selection method ('random', 'colorRange', etc.)
   * @param {Object} config - Configuration parameters
   * @returns {Array} Array of selection regions
   */
  generateSelections(method, config) {
    const selections = [];
    
    // Check cache if applicable
    const cacheKey = this.getCacheKey(method, config);
    if (this.cache[cacheKey] && this.isCacheValid(method)) {
      return this.cache[cacheKey];
    }
    
    switch(method) {
      case 'random':
        const numSelections = config.maxRegions || 1;
        for (let i = 0; i < numSelections; i++) {
          selections.push(this.pickRandomClump(config.intensity, this.width, this.height));
        }
        break;
        
      case 'colorRange':
        selections.push(...this.selectByColorRange(config));
        break;
        
      case 'brightness':
        selections.push(...this.selectByBrightness(config));
        break;
        
      case 'edgeDetection':
        selections.push(...this.selectByEdges(config));
        break;
        
      case 'organicShapes':
        selections.push(...this.generateOrganicShapes(config));
        break;
        
      case 'contentAware':
        selections.push(...this.selectContentAware(config));
        break;
        
      case 'combined':
        selections.push(...this.selectCombined(config));
        break;
        
      default:
        console.warn(`Unknown selection method: ${method}`);
        return [this.pickRandomClump(config.intensity, this.width, this.height)];
    }
    
    // Cache results for static methods
    if (this.shouldCache(method)) {
      this.cache[cacheKey] = selections;
    }
    
    return selections;
  }

  /**
   * Select regions by color range using flood fill algorithm
   * @param {Object} config - Configuration parameters
   * @returns {Array} Array of color-based selections
   */
  selectByColorRange(config) {
    const {
      targetHue = 180,
      hueTolerance = 30,
      saturationMin = 0.2,
      lightnessMin = 0.2,
      lightnessMax = 0.8,
      minRegionSize = 100,
      maxRegions = 5
    } = config;

    const regions = [];
    const visited = new Uint8Array(this.width * this.height);
    
    // Scan for matching pixels with sampling for performance
    for (let y = 0; y < this.height; y += 4) {
      for (let x = 0; x < this.width; x += 4) {
        const idx = y * this.width + x;
        if (visited[idx]) continue;
        
        const pixelIdx = idx * 4;
        const r = this.imageData.data[pixelIdx];
        const g = this.imageData.data[pixelIdx + 1];
        const b = this.imageData.data[pixelIdx + 2];
        
        const [h, s, l] = rgbToHsl(r, g, b);
        
        // Check if pixel matches criteria
        const hueDiff = Math.abs(h - targetHue);
        const hueMatch = hueDiff < hueTolerance || hueDiff > (360 - hueTolerance);
        
        if (hueMatch && s >= saturationMin && l >= lightnessMin && l <= lightnessMax) {
          // Flood fill to find connected region
          const region = this.floodFill(x, y, visited, {
            targetHue,
            hueTolerance,
            saturationMin,
            lightnessMin,
            lightnessMax
          });
          
          if (region.pixels >= minRegionSize) {
            regions.push({
              x: region.minX,
              y: region.minY,
              w: region.maxX - region.minX,
              h: region.maxY - region.minY
            });
            
            if (regions.length >= maxRegions) break;
          }
        }
      }
      if (regions.length >= maxRegions) break;
    }
    
    return regions;
  }

  /**
   * Flood fill algorithm for connected region detection
   * @param {number} startX - Starting X coordinate
   * @param {number} startY - Starting Y coordinate
   * @param {Uint8Array} visited - Visited pixels array
   * @param {Object} config - Color matching configuration
   * @returns {Object} Region information
   */
  floodFill(startX, startY, visited, config) {
    const stack = [[startX, startY]];
    const region = {
      pixels: 0,
      minX: startX,
      maxX: startX,
      minY: startY,
      maxY: startY
    };
    
    const targetIdx = (startY * this.width + startX) * 4;
    const targetR = this.imageData.data[targetIdx];
    const targetG = this.imageData.data[targetIdx + 1];
    const targetB = this.imageData.data[targetIdx + 2];
    const [targetH, targetS, targetL] = rgbToHsl(targetR, targetG, targetB);
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = y * this.width + x;
      
      if (x < 0 || x >= this.width || y < 0 || y >= this.height || visited[idx]) {
        continue;
      }
      
      const pixelIdx = idx * 4;
      const r = this.imageData.data[pixelIdx];
      const g = this.imageData.data[pixelIdx + 1];
      const b = this.imageData.data[pixelIdx + 2];
      const [h, s, l] = rgbToHsl(r, g, b);
      
      // Check color similarity
      const hueDiff = Math.abs(h - targetH);
      const hueMatch = hueDiff < config.hueTolerance || hueDiff > (360 - config.hueTolerance);
      const satMatch = Math.abs(s - targetS) < 0.3;
      const lightMatch = Math.abs(l - targetL) < 0.3;
      
      if (hueMatch && satMatch && lightMatch) {
        visited[idx] = 1;
        region.pixels++;
        region.minX = Math.min(region.minX, x);
        region.maxX = Math.max(region.maxX, x);
        region.minY = Math.min(region.minY, y);
        region.maxY = Math.max(region.maxY, y);
        
        // Add neighbors
        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
      }
    }
    
    return region;
  }

  /**
   * Select by brightness zones (shadows, midtones, highlights)
   * @param {Object} config - Configuration parameters
   * @returns {Array} Array of brightness-based selections
   */
  selectByBrightness(config) {
    const {
      zone = 'shadows', // 'shadows', 'midtones', 'highlights'
      threshold = 0.5,
      minRegionSize = 100,
      maxRegions = 5
    } = config;

    const regions = [];
    const blockSize = 16;
    
    for (let y = 0; y < this.height; y += blockSize) {
      for (let x = 0; x < this.width; x += blockSize) {
        const brightness = this.getBlockBrightness(x, y, blockSize);
        
        let inZone = false;
        if (zone === 'shadows' && brightness < 0.3) inZone = true;
        else if (zone === 'midtones' && brightness >= 0.3 && brightness <= 0.7) inZone = true;
        else if (zone === 'highlights' && brightness > 0.7) inZone = true;
        
        if (inZone) {
          regions.push({
            x: x,
            y: y,
            w: Math.min(blockSize * 2, this.width - x),
            h: Math.min(blockSize * 2, this.height - y)
          });
          
          if (regions.length >= maxRegions) return regions;
        }
      }
    }
    
    return regions;
  }

  /**
   * Get average brightness of a block
   * @param {number} x - Block X coordinate
   * @param {number} y - Block Y coordinate
   * @param {number} size - Block size
   * @returns {number} Average brightness (0-1)
   */
  getBlockBrightness(x, y, size) {
    let totalBrightness = 0;
    let pixelCount = 0;
    
    for (let dy = 0; dy < size && (y + dy) < this.height; dy++) {
      for (let dx = 0; dx < size && (x + dx) < this.width; dx++) {
        const idx = ((y + dy) * this.width + (x + dx)) * 4;
        const r = this.imageData.data[idx];
        const g = this.imageData.data[idx + 1];
        const b = this.imageData.data[idx + 2];
        totalBrightness += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        pixelCount++;
      }
    }
    
    return pixelCount > 0 ? totalBrightness / pixelCount : 0;
  }

  /**
   * Select by edge detection using Sobel operator
   * @param {Object} config - Configuration parameters
   * @returns {Array} Array of edge-based selections
   */
  selectByEdges(config) {
    const {
      threshold = 30,
      minRegionSize = 50,
      maxRegions = 8
    } = config;

    const regions = [];
    const edgeStrength = this.detectEdges(threshold);
    
    // Find high edge areas
    const blockSize = 32;
    for (let y = 0; y < this.height; y += blockSize) {
      for (let x = 0; x < this.width; x += blockSize) {
        let edgeCount = 0;
        
        for (let dy = 0; dy < blockSize && (y + dy) < this.height; dy++) {
          for (let dx = 0; dx < blockSize && (x + dx) < this.width; dx++) {
            if (edgeStrength[(y + dy) * this.width + (x + dx)] > 0) {
              edgeCount++;
            }
          }
        }
        
        if (edgeCount > minRegionSize) {
          regions.push({
            x: x,
            y: y,
            w: Math.min(blockSize, this.width - x),
            h: Math.min(blockSize, this.height - y)
          });
          
          if (regions.length >= maxRegions) return regions;
        }
      }
    }
    
    return regions;
  }

  /**
   * Simple Sobel edge detection
   * @param {number} threshold - Edge detection threshold
   * @returns {Uint8Array} Edge strength map
   */
  detectEdges(threshold) {
    const edges = new Uint8Array(this.width * this.height);
    
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        // Get surrounding pixels
        const tl = this.getPixelBrightness(x-1, y-1);
        const tm = this.getPixelBrightness(x, y-1);
        const tr = this.getPixelBrightness(x+1, y-1);
        const ml = this.getPixelBrightness(x-1, y);
        const mr = this.getPixelBrightness(x+1, y);
        const bl = this.getPixelBrightness(x-1, y+1);
        const bm = this.getPixelBrightness(x, y+1);
        const br = this.getPixelBrightness(x+1, y+1);
        
        // Sobel operators
        const gx = -tl - 2*ml - bl + tr + 2*mr + br;
        const gy = -tl - 2*tm - tr + bl + 2*bm + br;
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[y * this.width + x] = magnitude > threshold ? 1 : 0;
      }
    }
    
    return edges;
  }

  /**
   * Get pixel brightness using luminance formula
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {number} Brightness value
   */
  getPixelBrightness(x, y) {
    const idx = (y * this.width + x) * 4;
    const r = this.imageData.data[idx];
    const g = this.imageData.data[idx + 1];
    const b = this.imageData.data[idx + 2];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Generate organic blob-like shapes
   * @param {Object} config - Configuration parameters
   * @returns {Array} Array of organic shape selections
   */
  generateOrganicShapes(config) {
    const {
      count = 3,
      baseSize = 50,
      randomness = 0.3,
      smoothness = 0.7,
      intensity = 'medium'
    } = config;

    // Adjust base size based on intensity
    let adjustedBaseSize = baseSize;
    switch(intensity) {
      case 'medium':
        adjustedBaseSize = Math.floor(this.width / 8);
        break;
      case 'large':
        adjustedBaseSize = Math.floor(this.width / 5);
        break;
      case 'extraLarge':
        adjustedBaseSize = Math.floor(this.width / 3);
        break;
    }

    const shapes = [];
    
    for (let i = 0; i < count; i++) {
      const centerX = randomInt(adjustedBaseSize, this.width - adjustedBaseSize);
      const centerY = randomInt(adjustedBaseSize, this.height - adjustedBaseSize);
      
      // Generate blob shape (for now, convert to bounding box)
      const shape = this.generateBlob(centerX, centerY, adjustedBaseSize, randomness);
      
      // Convert to bounding box
      shapes.push({
        x: Math.max(0, centerX - adjustedBaseSize),
        y: Math.max(0, centerY - adjustedBaseSize),
        w: Math.min(adjustedBaseSize * 2, this.width - centerX + adjustedBaseSize),
        h: Math.min(adjustedBaseSize * 2, this.height - centerY + adjustedBaseSize)
      });
    }
    
    return shapes;
  }

  /**
   * Generate a blob shape (placeholder for more complex implementation)
   * @param {number} centerX - Center X coordinate
   * @param {number} centerY - Center Y coordinate
   * @param {number} radius - Base radius
   * @param {number} randomness - Randomness factor
   * @returns {Array} Array of points defining the blob
   */
  generateBlob(centerX, centerY, radius, randomness) {
    const points = [];
    const numPoints = 16;
    
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const r = radius * (1 + (Math.random() - 0.5) * randomness);
      
      points.push({
        x: centerX + Math.cos(angle) * r,
        y: centerY + Math.sin(angle) * r
      });
    }
    
    return points;
  }

  /**
   * Content-aware selection combining multiple methods
   * @param {Object} config - Configuration parameters
   * @returns {Array} Array of content-aware selections
   */
  selectContentAware(config) {
    // For now, combine edge detection and color variance
    const edges = this.selectByEdges({ ...config, maxRegions: 3 });
    const colors = this.selectByColorRange({ ...config, maxRegions: 2 });
    
    return [...edges, ...colors];
  }

  /**
   * Combined selection method using multiple algorithms
   * @param {Object} config - Configuration parameters
   * @returns {Array} Array of combined selections
   */
  selectCombined(config) {
    const selections = [];
    const maxPerMethod = Math.ceil(config.maxRegions / 3);
    
    // Apply different methods based on configuration
    if (config.useColor) {
      selections.push(...this.selectByColorRange({ ...config, maxRegions: maxPerMethod }));
    }
    
    if (config.useBrightness) {
      selections.push(...this.selectByBrightness({ ...config, maxRegions: maxPerMethod }));
    }
    
    if (config.useEdges) {
      selections.push(...this.selectByEdges({ ...config, maxRegions: maxPerMethod }));
    }
    
    // Remove overlapping selections
    return this.mergeOverlappingSelections(selections).slice(0, config.maxRegions);
  }

  /**
   * Merge overlapping selections to reduce redundancy
   * @param {Array} selections - Array of selection rectangles
   * @returns {Array} Array of merged selections
   */
  mergeOverlappingSelections(selections) {
    const merged = [];
    
    selections.forEach(sel => {
      let overlap = false;
      
      for (let i = 0; i < merged.length; i++) {
        const existing = merged[i];
        
        // Check for overlap
        if (sel.x < existing.x + existing.w &&
            sel.x + sel.w > existing.x &&
            sel.y < existing.y + existing.h &&
            sel.y + sel.h > existing.y) {
          
          // Merge by expanding the existing selection
          existing.x = Math.min(existing.x, sel.x);
          existing.y = Math.min(existing.y, sel.y);
          existing.w = Math.max(existing.x + existing.w, sel.x + sel.w) - existing.x;
          existing.h = Math.max(existing.y + existing.h, sel.y + sel.h) - existing.y;
          overlap = true;
          break;
        }
      }
      
      if (!overlap) {
        merged.push({ ...sel });
      }
    });
    
    return merged;
  }

  /**
   * Pick a random selection clump (fallback method)
   * @param {string} intensity - Selection intensity
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Object} Random selection rectangle
   */
  pickRandomClump(intensity, width, height) {
    let maxW, maxH;
    switch (intensity) {
      case 'medium':
        maxW = Math.floor(width / 6);
        maxH = Math.floor(height / 6);
        break;
      case 'large':
        maxW = Math.floor(width / 3);
        maxH = Math.floor(height / 3);
        break;
      case 'extraLarge':
        maxW = Math.floor(width / 2);
        maxH = Math.floor(height / 2);
        break;
      default:
        maxW = Math.floor(width / 6);
        maxH = Math.floor(height / 6);
    }
    
    const w = randomInt(10, maxW);
    const h = randomInt(10, maxH);
    const x = randomInt(0, width - w);
    const y = randomInt(0, height - h);

    return { x, y, w, h };
  }

  /**
   * Generate cache key for selection results
   * @param {string} method - Selection method
   * @param {Object} config - Configuration parameters
   * @returns {string} Cache key
   */
  getCacheKey(method, config) {
    return `${method}_${JSON.stringify(config)}`;
  }

  /**
   * Check if cache should be used for this method
   * @param {string} method - Selection method
   * @returns {boolean} True if method should be cached
   */
  shouldCache(method) {
    // Don't cache random or organic shapes as they should vary
    return method !== 'random' && method !== 'organicShapes';
  }

  /**
   * Check if cache is still valid
   * @param {string} method - Selection method
   * @returns {boolean} True if cache is valid
   */
  isCacheValid(method) {
    // For now, cache is always valid unless cleared
    return true;
  }

  /**
   * Clear all cached results
   */
  clearCache() {
    this.cache = {
      colorAnalysis: null,
      brightnessMap: null,
      edgeMap: null
    };
  }
}
