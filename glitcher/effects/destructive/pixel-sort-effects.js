/**
 * Pixel Sort Effects for Glitcher App
 * Handles various pixel sorting algorithms for glitch art
 * FIXED: Based on working Beta implementation
 */

import { rgbToHue, rgbToBrightness } from '../../utils/color-utils.js';
import { randomInt } from '../../utils/math-utils.js';

export class PixelSortEffects {
  /**
   * Apply pixel sort effect
   * @param {ImageData} imageData - Target image data
   * @param {string} sortType - Type of sorting algorithm
   * @param {Uint8Array} selectionMask - Optional selection mask (not used for now)
   */
  static applyPixelSort(imageData, sortType, selectionMask = null) {
    switch (sortType) {
      case 'columnBrightness':
        this.sortColumnsByBrightness(imageData);
        break;
      case 'rowBrightness':
        this.sortRowsByBrightness(imageData);
        break;
      case 'columnHue':
        this.sortColumnsByHue(imageData);
        break;
      case 'rowHue':
        this.sortRowsByHue(imageData);
        break;
      case 'randomLines':
        this.randomLineSort(imageData);
        break;
      case 'diagonal':
        this.diagonalSort(imageData);
        break;
      case 'circular':
        this.circularSort(imageData);
        break;
      case 'wave':
        this.waveSort(imageData);
        break;
      default:
        break;
    }
  }

  /**
   * Sort all columns by brightness (FIXED)
   * @param {ImageData} imageData - Target image data
   */
  static sortColumnsByBrightness(imageData) {
    const { data, width, height } = imageData;
    
    for (let x = 0; x < width; x++) {
      const column = [];
      
      // Collect all pixels in this column
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const bright = rgbToBrightness(r, g, b);
        column.push({ r, g, b, a, value: bright });
      }
      
      // Sort by brightness
      column.sort((p, q) => p.value - q.value);
      
      // Put sorted pixels back
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        data[idx]     = column[y].r;
        data[idx + 1] = column[y].g;
        data[idx + 2] = column[y].b;
        data[idx + 3] = column[y].a;
      }
    }
  }

  /**
   * Sort all rows by brightness (FIXED)
   * @param {ImageData} imageData - Target image data
   */
  static sortRowsByBrightness(imageData) {
    const { data, width, height } = imageData;
    
    for (let y = 0; y < height; y++) {
      const rowPixels = [];
      const rowStart = y * width * 4;
      
      // Collect all pixels in this row
      for (let x = 0; x < width; x++) {
        const idx = rowStart + x * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const bright = rgbToBrightness(r, g, b);
        rowPixels.push({ r, g, b, a, value: bright });
      }
      
      // Sort by brightness
      rowPixels.sort((p, q) => p.value - q.value);
      
      // Put sorted pixels back
      for (let x = 0; x < width; x++) {
        const idx = rowStart + x * 4;
        data[idx]     = rowPixels[x].r;
        data[idx + 1] = rowPixels[x].g;
        data[idx + 2] = rowPixels[x].b;
        data[idx + 3] = rowPixels[x].a;
      }
    }
  }

  /**
   * Sort all columns by hue (FIXED)
   * @param {ImageData} imageData - Target image data
   */
  static sortColumnsByHue(imageData) {
    const { data, width, height } = imageData;
    
    for (let x = 0; x < width; x++) {
      const column = [];
      
      // Collect all pixels in this column
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const hue = rgbToHue(r, g, b);
        column.push({ r, g, b, a, value: hue });
      }
      
      // Sort by hue
      column.sort((p, q) => p.value - q.value);
      
      // Put sorted pixels back
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        data[idx]     = column[y].r;
        data[idx + 1] = column[y].g;
        data[idx + 2] = column[y].b;
        data[idx + 3] = column[y].a;
      }
    }
  }

  /**
   * Sort all rows by hue (FIXED)
   * @param {ImageData} imageData - Target image data
   */
  static sortRowsByHue(imageData) {
    const { data, width, height } = imageData;
    
    for (let y = 0; y < height; y++) {
      const rowPixels = [];
      const rowStart = y * width * 4;
      
      // Collect all pixels in this row
      for (let x = 0; x < width; x++) {
        const idx = rowStart + x * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const hue = rgbToHue(r, g, b);
        rowPixels.push({ r, g, b, a, value: hue });
      }
      
      // Sort by hue
      rowPixels.sort((p, q) => p.value - q.value);
      
      // Put sorted pixels back
      for (let x = 0; x < width; x++) {
        const idx = rowStart + x * 4;
        data[idx]     = rowPixels[x].r;
        data[idx + 1] = rowPixels[x].g;
        data[idx + 2] = rowPixels[x].b;
        data[idx + 3] = rowPixels[x].a;
      }
    }
  }

  /**
   * Random line sorting (FIXED)
   * @param {ImageData} imageData - Target image data
   */
  static randomLineSort(imageData) {
    const { width, height } = imageData;
    const linesToSort = 3; // Sort 3 random lines each frame
    
    for (let i = 0; i < linesToSort; i++) {
      const horizontal = Math.random() < 0.5;
      if (horizontal) {
        // Sort a random row
        const row = randomInt(0, height - 1);
        this.sortOneRowByBrightness(imageData, row);
      } else {
        // Sort a random column
        const col = randomInt(0, width - 1);
        this.sortOneColumnByBrightness(imageData, col);
      }
    }
  }

  /**
   * Sort one row by brightness
   * @param {ImageData} imageData - Target image data
   * @param {number} y - Row index to sort
   */
  static sortOneRowByBrightness(imageData, y) {
    const { data, width } = imageData;
    const rowStart = y * width * 4;
    const rowPixels = [];
    
    // Collect all pixels in this row
    for (let x = 0; x < width; x++) {
      const idx = rowStart + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      const bright = rgbToBrightness(r, g, b);
      rowPixels.push({ r, g, b, a, bright });
    }
    
    // Sort by brightness
    rowPixels.sort((p, q) => p.bright - q.bright);
    
    // Put sorted pixels back
    for (let x = 0; x < width; x++) {
      const idx = rowStart + x * 4;
      data[idx]     = rowPixels[x].r;
      data[idx + 1] = rowPixels[x].g;
      data[idx + 2] = rowPixels[x].b;
      data[idx + 3] = rowPixels[x].a;
    }
  }

  /**
   * Sort one column by brightness
   * @param {ImageData} imageData - Target image data
   * @param {number} col - Column index to sort
   */
  static sortOneColumnByBrightness(imageData, col) {
    const { data, width, height } = imageData;
    const column = [];
    
    // Collect all pixels in this column
    for (let y = 0; y < height; y++) {
      const idx = (y * width + col) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      const bright = rgbToBrightness(r, g, b);
      column.push({ r, g, b, a, bright });
    }
    
    // Sort by brightness
    column.sort((p, q) => p.bright - q.bright);
    
    // Put sorted pixels back
    for (let y = 0; y < height; y++) {
      const idx = (y * width + col) * 4;
      data[idx]     = column[y].r;
      data[idx + 1] = column[y].g;
      data[idx + 2] = column[y].b;
      data[idx + 3] = column[y].a;
    }
  }

  /**
   * Diagonal sort effect - simplified version
   * @param {ImageData} imageData - Target image data
   */
  static diagonalSort(imageData) {
    const { data, width, height } = imageData;
    
    // Sort main diagonals for a strong visual effect
    for (let k = 0; k < width + height - 1; k++) {
      const diagonal = [];
      let startX = k < height ? 0 : k - height + 1;
      let startY = k < height ? k : height - 1;
      let x = startX, y = startY;
      
      // Collect diagonal pixels
      while (x < width && y >= 0) {
        const idx = (y * width + x) * 4;
        diagonal.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2],
          a: data[idx + 3],
          bright: rgbToBrightness(data[idx], data[idx + 1], data[idx + 2]),
          x, y
        });
        x++;
        y--;
      }
      
      // Sort by brightness
      diagonal.sort((a, b) => a.bright - b.bright);
      
      // Put sorted pixels back
      x = startX;
      y = startY;
      let i = 0;
      while (x < width && y >= 0 && i < diagonal.length) {
        const idx = (y * width + x) * 4;
        data[idx]     = diagonal[i].r;
        data[idx + 1] = diagonal[i].g;
        data[idx + 2] = diagonal[i].b;
        data[idx + 3] = diagonal[i].a;
        x++;
        y--;
        i++;
      }
    }
  }

  /**
   * Circular sort effect - simplified version
   * @param {ImageData} imageData - Target image data
   */
  static circularSort(imageData) {
    const { data, width, height } = imageData;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(centerX, centerY) * 0.8;
    const radiusStep = 5;
    
    for (let r = 0; r < maxRadius; r += radiusStep) {
      const circle = [];
      const circumference = 2 * Math.PI * r;
      const steps = Math.max(8, Math.floor(circumference / 2));
      
      // Collect pixels in this circle
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const x = Math.round(centerX + r * Math.cos(angle));
        const y = Math.round(centerY + r * Math.sin(angle));
        
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          const rVal = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          const bright = rgbToBrightness(rVal, g, b);
          circle.push({ r: rVal, g, b, a, bright, x, y });
        }
      }
      
      // Sort by brightness
      circle.sort((a, b) => a.bright - b.bright);
      
      // Put sorted pixels back
      for (let i = 0; i < circle.length; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const x = Math.round(centerX + r * Math.cos(angle));
        const y = Math.round(centerY + r * Math.sin(angle));
        
        if (x >= 0 && x < width && y >= 0 && y < height && i < circle.length) {
          const idx = (y * width + x) * 4;
          data[idx]     = circle[i].r;
          data[idx + 1] = circle[i].g;
          data[idx + 2] = circle[i].b;
          data[idx + 3] = circle[i].a;
        }
      }
    }
  }

  /**
   * Wave sort effect - sort along sinusoidal paths (IMPROVED)
   * Creates dramatic wave-like sorting patterns across the entire image
   * @param {ImageData} imageData - Target image data
   */
  static waveSort(imageData) {
    const { data, width, height } = imageData;
    
    // Create multiple wave patterns with different orientations
    const waveTypes = [
      { direction: 'horizontal', amplitude: height * 0.3, frequency: 0.02, waves: 3 },
      { direction: 'vertical', amplitude: width * 0.3, frequency: 0.02, waves: 2 },
      { direction: 'diagonal', amplitude: Math.min(width, height) * 0.2, frequency: 0.015, waves: 2 }
    ];
    
    waveTypes.forEach((waveType, typeIndex) => {
      for (let w = 0; w < waveType.waves; w++) {
        const phase = (w + typeIndex) * Math.PI * 0.4;
        
        if (waveType.direction === 'horizontal') {
          this.sortHorizontalWave(imageData, waveType.amplitude, waveType.frequency, phase);
        } else if (waveType.direction === 'vertical') {
          this.sortVerticalWave(imageData, waveType.amplitude, waveType.frequency, phase);
        } else if (waveType.direction === 'diagonal') {
          this.sortDiagonalWave(imageData, waveType.amplitude, waveType.frequency, phase);
        }
      }
    });
  }
  
  /**
   * Sort pixels along horizontal sine waves
   */
  static sortHorizontalWave(imageData, amplitude, frequency, phase) {
    const { data, width, height } = imageData;
    
    // For each row, create a sine wave displacement and sort accordingly
    for (let baseY = 0; baseY < height; baseY += Math.max(1, Math.floor(amplitude / 8))) {
      const wavePath = [];
      const positions = [];
      
      // Collect pixels along the sine wave
      for (let x = 0; x < width; x++) {
        const waveOffset = Math.round(amplitude * Math.sin(x * frequency + phase));
        const y = Math.max(0, Math.min(height - 1, baseY + waveOffset));
        
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const bright = rgbToBrightness(r, g, b);
        
        wavePath.push({ r, g, b, a, bright });
        positions.push({ x, y });
      }
      
      // Sort by brightness
      wavePath.sort((a, b) => a.bright - b.bright);
      
      // Write back sorted pixels
      for (let i = 0; i < wavePath.length && i < positions.length; i++) {
        const pixel = wavePath[i];
        const pos = positions[i];
        const idx = (pos.y * width + pos.x) * 4;
        
        data[idx]     = pixel.r;
        data[idx + 1] = pixel.g;
        data[idx + 2] = pixel.b;
        data[idx + 3] = pixel.a;
      }
    }
  }
  
  /**
   * Sort pixels along vertical sine waves
   */
  static sortVerticalWave(imageData, amplitude, frequency, phase) {
    const { data, width, height } = imageData;
    
    // For each column, create a sine wave displacement and sort accordingly
    for (let baseX = 0; baseX < width; baseX += Math.max(1, Math.floor(amplitude / 8))) {
      const wavePath = [];
      const positions = [];
      
      // Collect pixels along the sine wave
      for (let y = 0; y < height; y++) {
        const waveOffset = Math.round(amplitude * Math.sin(y * frequency + phase));
        const x = Math.max(0, Math.min(width - 1, baseX + waveOffset));
        
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const bright = rgbToBrightness(r, g, b);
        
        wavePath.push({ r, g, b, a, bright });
        positions.push({ x, y });
      }
      
      // Sort by brightness
      wavePath.sort((a, b) => a.bright - b.bright);
      
      // Write back sorted pixels
      for (let i = 0; i < wavePath.length && i < positions.length; i++) {
        const pixel = wavePath[i];
        const pos = positions[i];
        const idx = (pos.y * width + pos.x) * 4;
        
        data[idx]     = pixel.r;
        data[idx + 1] = pixel.g;
        data[idx + 2] = pixel.b;
        data[idx + 3] = pixel.a;
      }
    }
  }
  
  /**
   * Sort pixels along diagonal sine waves
   */
  static sortDiagonalWave(imageData, amplitude, frequency, phase) {
    const { data, width, height } = imageData;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Create diagonal waves from multiple angles
    for (let angle = 0; angle < Math.PI; angle += Math.PI / 4) {
      const wavePath = [];
      const positions = [];
      
      // Sample along the diagonal with wave displacement
      const maxDist = Math.sqrt(width * width + height * height);
      for (let dist = 0; dist < maxDist; dist += 2) {
        const baseX = centerX + dist * Math.cos(angle);
        const baseY = centerY + dist * Math.sin(angle);
        
        if (baseX < 0 || baseX >= width || baseY < 0 || baseY >= height) continue;
        
        // Add wave displacement perpendicular to the line
        const perpAngle = angle + Math.PI / 2;
        const waveOffset = amplitude * Math.sin(dist * frequency + phase);
        const x = Math.round(baseX + waveOffset * Math.cos(perpAngle));
        const y = Math.round(baseY + waveOffset * Math.sin(perpAngle));
        
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          const bright = rgbToBrightness(r, g, b);
          
          wavePath.push({ r, g, b, a, bright });
          positions.push({ x, y });
        }
      }
      
      // Sort by brightness
      wavePath.sort((a, b) => a.bright - b.bright);
      
      // Write back sorted pixels
      for (let i = 0; i < wavePath.length && i < positions.length; i++) {
        const pixel = wavePath[i];
        const pos = positions[i];
        const idx = (pos.y * width + pos.x) * 4;
        
        data[idx]     = pixel.r;
        data[idx + 1] = pixel.g;
        data[idx + 2] = pixel.b;
        data[idx + 3] = pixel.a;
      }
    }
  }
}