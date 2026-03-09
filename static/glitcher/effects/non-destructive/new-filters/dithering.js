/**
 * Dithering Filter for Glitcher App
 * Advanced dithering algorithms with comprehensive controls
 */

export class DitheringFilter {
    /**
     * Apply dithering effect to image data
     * @param {ImageData} imageData - Source image data (not modified)
     * @param {string} algorithm - Dithering algorithm name
     * @param {number} intensity - Effect intensity 0-100
     * @param {Object} options - Dithering options
     * @returns {ImageData} New image data with dithering applied
     */
    static apply(imageData, algorithm = 'floyd_steinberg', intensity = 50, options = {}) {
      const { data, width, height } = imageData;
      // Create working copy
      const outputData = new Uint8ClampedArray(data);
      const normalizedIntensity = intensity / 100;
      
      // Get color palette
      const palette = this.generatePalette(options);
      
      // Apply pre-processing if needed
      const processedData = this.preProcess(outputData, width, height, options);
      
      // Apply dithering algorithm
      let ditheredData;
      switch (algorithm) {
        case 'floyd_steinberg':
          ditheredData = this.floydSteinbergDither(processedData, width, height, palette, options);
          break;
        case 'atkinson':
          ditheredData = this.atkinsonDither(processedData, width, height, palette, options);
          break;
        case 'jarvis_judice_ninke':
          ditheredData = this.jarvisJudiceNinkeDither(processedData, width, height, palette, options);
          break;
        case 'stucki':
          ditheredData = this.stuckiDither(processedData, width, height, palette, options);
          break;
        case 'sierra':
          ditheredData = this.sierraDither(processedData, width, height, palette, options);
          break;
        case 'ordered':
          ditheredData = this.orderedDither(processedData, width, height, palette, options);
          break;
        case 'bayer':
          ditheredData = this.bayerDither(processedData, width, height, palette, options);
          break;
        case 'halftone':
          ditheredData = this.halftoneDither(processedData, width, height, palette, options);
          break;
        case 'random':
          ditheredData = this.randomDither(processedData, width, height, palette, options);
          break;
        case 'threshold':
          ditheredData = this.thresholdDither(processedData, width, height, palette, options);
          break;
        default:
          ditheredData = processedData;
      }
      
      // Blend with original based on intensity
      for (let i = 0; i < outputData.length; i += 4) {
        outputData[i]     = data[i] + (ditheredData[i] - data[i]) * normalizedIntensity;
        outputData[i + 1] = data[i + 1] + (ditheredData[i + 1] - data[i + 1]) * normalizedIntensity;
        outputData[i + 2] = data[i + 2] + (ditheredData[i + 2] - data[i + 2]) * normalizedIntensity;
        outputData[i + 3] = data[i + 3]; // Preserve alpha
      }
      
      return new ImageData(outputData, width, height);
    }
    
    /**
     * Pre-process image data based on options
     */
    static preProcess(data, width, height, options) {
      const output = new Uint8ClampedArray(data);
      
      // Apply brightness/contrast adjustments if specified
      if (options.brightness !== 0 || options.contrast !== 0) {
        const brightness = options.brightness || 0;
        const contrast = options.contrast || 0;
        
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        
        for (let i = 0; i < output.length; i += 4) {
          // Apply brightness and contrast
          output[i]     = Math.max(0, Math.min(255, factor * (output[i] - 128) + 128 + brightness));
          output[i + 1] = Math.max(0, Math.min(255, factor * (output[i + 1] - 128) + 128 + brightness));
          output[i + 2] = Math.max(0, Math.min(255, factor * (output[i + 2] - 128) + 128 + brightness));
        }
      }
      
      return output;
    }
    
    /**
     * Generate color palette based on options
     */
    static generatePalette(options) {
      const colorMode = options.colorMode || 'monochrome';
      const levels = options.colorLevels || 2;
      const customColors = options.customColors || [];
      
      let palette = [];
      
      switch (colorMode) {
        case 'monochrome':
          // Generate grayscale palette
          for (let i = 0; i < levels; i++) {
            const value = Math.round((i / (levels - 1)) * 255);
            palette.push([value, value, value]);
          }
          break;
          
        case 'gameboy':
          // Classic Game Boy green palette
          palette = [
            [15, 56, 15],
            [48, 98, 48],
            [139, 172, 15],
            [155, 188, 15]
          ];
          break;
          
        case 'cga':
          // CGA 4-color palettes
          const cgaPalettes = {
            0: [[0, 0, 0], [0, 170, 170], [170, 0, 170], [170, 170, 170]],
            1: [[0, 0, 0], [0, 170, 0], [170, 0, 0], [170, 85, 0]],
            2: [[0, 0, 0], [85, 255, 255], [255, 85, 255], [255, 255, 255]]
          };
          palette = cgaPalettes[options.cgaPalette || 0] || cgaPalettes[0];
          break;
          
        case 'zx_spectrum':
          // ZX Spectrum colors
          palette = [
            [0, 0, 0], [0, 0, 215], [215, 0, 0], [215, 0, 215],
            [0, 215, 0], [0, 215, 215], [215, 215, 0], [215, 215, 215]
          ];
          break;
          
        case 'commodore64':
          // C64 palette
          palette = [
            [0, 0, 0], [255, 255, 255], [136, 0, 0], [170, 255, 238],
            [204, 68, 204], [0, 204, 85], [0, 0, 170], [238, 238, 119],
            [221, 136, 85], [102, 68, 0], [255, 119, 119], [51, 51, 51],
            [119, 119, 119], [170, 255, 102], [0, 136, 255], [187, 187, 187]
          ];
          break;
          
        case 'custom':
          // Use custom colors if provided
          palette = customColors.length > 0 ? customColors : [[0, 0, 0], [255, 255, 255]];
          break;
          
        case 'web_safe':
          // Web-safe colors (216 colors)
          for (let r = 0; r <= 255; r += 51) {
            for (let g = 0; g <= 255; g += 51) {
              for (let b = 0; b <= 255; b += 51) {
                palette.push([r, g, b]);
              }
            }
          }
          break;
          
        case 'posterize':
          // Generate posterized palette with specified levels per channel
          const levelsPerChannel = options.levelsPerChannel || 4;
          for (let r = 0; r < levelsPerChannel; r++) {
            for (let g = 0; g < levelsPerChannel; g++) {
              for (let b = 0; b < levelsPerChannel; b++) {
                palette.push([
                  Math.round((r / (levelsPerChannel - 1)) * 255),
                  Math.round((g / (levelsPerChannel - 1)) * 255),
                  Math.round((b / (levelsPerChannel - 1)) * 255)
                ]);
              }
            }
          }
          break;
          
        default:
          // Default to black and white
          palette = [[0, 0, 0], [255, 255, 255]];
      }
      
      return palette;
    }
    
    /**
     * Find nearest color in palette
     */
    static findNearestColor(r, g, b, palette) {
      let minDistance = Infinity;
      let nearestColor = palette[0];
      
      for (const color of palette) {
        const distance = Math.sqrt(
          Math.pow(r - color[0], 2) +
          Math.pow(g - color[1], 2) +
          Math.pow(b - color[2], 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestColor = color;
        }
      }
      
      return nearestColor;
    }
    
    /**
     * Floyd-Steinberg dithering (most common error diffusion)
     */
    static floydSteinbergDither(data, width, height, palette, options) {
      const output = new Uint8ClampedArray(data);
      const serpentine = options.serpentine !== false; // Default to serpentine scanning
      
      for (let y = 0; y < height; y++) {
        const reverse = serpentine && (y % 2 === 1);
        const xStart = reverse ? width - 1 : 0;
        const xEnd = reverse ? -1 : width;
        const xStep = reverse ? -1 : 1;
        
        for (let x = xStart; x !== xEnd; x += xStep) {
          const idx = (y * width + x) * 4;
          
          const oldR = output[idx];
          const oldG = output[idx + 1];
          const oldB = output[idx + 2];
          
          const newColor = this.findNearestColor(oldR, oldG, oldB, palette);
          
          output[idx] = newColor[0];
          output[idx + 1] = newColor[1];
          output[idx + 2] = newColor[2];
          
          const errR = oldR - newColor[0];
          const errG = oldG - newColor[1];
          const errB = oldB - newColor[2];
          
          // Distribute error to neighboring pixels
          // Right: 7/16
          if (x + xStep >= 0 && x + xStep < width) {
            const rightIdx = (y * width + x + xStep) * 4;
            output[rightIdx] = Math.max(0, Math.min(255, output[rightIdx] + errR * 7 / 16));
            output[rightIdx + 1] = Math.max(0, Math.min(255, output[rightIdx + 1] + errG * 7 / 16));
            output[rightIdx + 2] = Math.max(0, Math.min(255, output[rightIdx + 2] + errB * 7 / 16));
          }
          
          // Bottom-left: 3/16
          if (y + 1 < height && x - xStep >= 0 && x - xStep < width) {
            const blIdx = ((y + 1) * width + x - xStep) * 4;
            output[blIdx] = Math.max(0, Math.min(255, output[blIdx] + errR * 3 / 16));
            output[blIdx + 1] = Math.max(0, Math.min(255, output[blIdx + 1] + errG * 3 / 16));
            output[blIdx + 2] = Math.max(0, Math.min(255, output[blIdx + 2] + errB * 3 / 16));
          }
          
          // Bottom: 5/16
          if (y + 1 < height) {
            const bIdx = ((y + 1) * width + x) * 4;
            output[bIdx] = Math.max(0, Math.min(255, output[bIdx] + errR * 5 / 16));
            output[bIdx + 1] = Math.max(0, Math.min(255, output[bIdx + 1] + errG * 5 / 16));
            output[bIdx + 2] = Math.max(0, Math.min(255, output[bIdx + 2] + errB * 5 / 16));
          }
          
          // Bottom-right: 1/16
          if (y + 1 < height && x + xStep >= 0 && x + xStep < width) {
            const brIdx = ((y + 1) * width + x + xStep) * 4;
            output[brIdx] = Math.max(0, Math.min(255, output[brIdx] + errR * 1 / 16));
            output[brIdx + 1] = Math.max(0, Math.min(255, output[brIdx + 1] + errG * 1 / 16));
            output[brIdx + 2] = Math.max(0, Math.min(255, output[brIdx + 2] + errB * 1 / 16));
          }
        }
      }
      
      return output;
    }
    
    /**
     * Atkinson dithering (created by Bill Atkinson, propagates less error)
     */
    static atkinsonDither(data, width, height, palette, options) {
      const output = new Uint8ClampedArray(data);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          
          const oldR = output[idx];
          const oldG = output[idx + 1];
          const oldB = output[idx + 2];
          
          const newColor = this.findNearestColor(oldR, oldG, oldB, palette);
          
          output[idx] = newColor[0];
          output[idx + 1] = newColor[1];
          output[idx + 2] = newColor[2];
          
          const errR = (oldR - newColor[0]) / 8; // Atkinson uses 1/8 for each neighbor
          const errG = (oldG - newColor[1]) / 8;
          const errB = (oldB - newColor[2]) / 8;
          
          // Distribute error to 6 neighbors
          const neighbors = [
            {dx: 1, dy: 0},   // Right
            {dx: 2, dy: 0},   // Right x2
            {dx: -1, dy: 1},  // Bottom-left
            {dx: 0, dy: 1},   // Bottom
            {dx: 1, dy: 1},   // Bottom-right
            {dx: 0, dy: 2}    // Bottom x2
          ];
          
          for (const {dx, dy} of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = (ny * width + nx) * 4;
              output[nIdx] = Math.max(0, Math.min(255, output[nIdx] + errR));
              output[nIdx + 1] = Math.max(0, Math.min(255, output[nIdx + 1] + errG));
              output[nIdx + 2] = Math.max(0, Math.min(255, output[nIdx + 2] + errB));
            }
          }
        }
      }
      
      return output;
    }
    
    /**
     * Jarvis-Judice-Ninke dithering (more complex error diffusion)
     */
    static jarvisJudiceNinkeDither(data, width, height, palette, options) {
      const output = new Uint8ClampedArray(data);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          
          const oldR = output[idx];
          const oldG = output[idx + 1];
          const oldB = output[idx + 2];
          
          const newColor = this.findNearestColor(oldR, oldG, oldB, palette);
          
          output[idx] = newColor[0];
          output[idx + 1] = newColor[1];
          output[idx + 2] = newColor[2];
          
          const errR = oldR - newColor[0];
          const errG = oldG - newColor[1];
          const errB = oldB - newColor[2];
          
          // Jarvis-Judice-Ninke error distribution matrix
          const matrix = [
            {dx: 1, dy: 0, weight: 7/48},
            {dx: 2, dy: 0, weight: 5/48},
            {dx: -2, dy: 1, weight: 3/48},
            {dx: -1, dy: 1, weight: 5/48},
            {dx: 0, dy: 1, weight: 7/48},
            {dx: 1, dy: 1, weight: 5/48},
            {dx: 2, dy: 1, weight: 3/48},
            {dx: -2, dy: 2, weight: 1/48},
            {dx: -1, dy: 2, weight: 3/48},
            {dx: 0, dy: 2, weight: 5/48},
            {dx: 1, dy: 2, weight: 3/48},
            {dx: 2, dy: 2, weight: 1/48}
          ];
          
          for (const {dx, dy, weight} of matrix) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = (ny * width + nx) * 4;
              output[nIdx] = Math.max(0, Math.min(255, output[nIdx] + errR * weight));
              output[nIdx + 1] = Math.max(0, Math.min(255, output[nIdx + 1] + errG * weight));
              output[nIdx + 2] = Math.max(0, Math.min(255, output[nIdx + 2] + errB * weight));
            }
          }
        }
      }
      
      return output;
    }
    
    /**
     * Stucki dithering
     */
    static stuckiDither(data, width, height, palette, options) {
      const output = new Uint8ClampedArray(data);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          
          const oldR = output[idx];
          const oldG = output[idx + 1];
          const oldB = output[idx + 2];
          
          const newColor = this.findNearestColor(oldR, oldG, oldB, palette);
          
          output[idx] = newColor[0];
          output[idx + 1] = newColor[1];
          output[idx + 2] = newColor[2];
          
          const errR = oldR - newColor[0];
          const errG = oldG - newColor[1];
          const errB = oldB - newColor[2];
          
          // Stucki error distribution matrix
          const matrix = [
            {dx: 1, dy: 0, weight: 8/42},
            {dx: 2, dy: 0, weight: 4/42},
            {dx: -2, dy: 1, weight: 2/42},
            {dx: -1, dy: 1, weight: 4/42},
            {dx: 0, dy: 1, weight: 8/42},
            {dx: 1, dy: 1, weight: 4/42},
            {dx: 2, dy: 1, weight: 2/42},
            {dx: -2, dy: 2, weight: 1/42},
            {dx: -1, dy: 2, weight: 2/42},
            {dx: 0, dy: 2, weight: 4/42},
            {dx: 1, dy: 2, weight: 2/42},
            {dx: 2, dy: 2, weight: 1/42}
          ];
          
          for (const {dx, dy, weight} of matrix) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = (ny * width + nx) * 4;
              output[nIdx] = Math.max(0, Math.min(255, output[nIdx] + errR * weight));
              output[nIdx + 1] = Math.max(0, Math.min(255, output[nIdx + 1] + errG * weight));
              output[nIdx + 2] = Math.max(0, Math.min(255, output[nIdx + 2] + errB * weight));
            }
          }
        }
      }
      
      return output;
    }
    
    /**
     * Sierra dithering (three variations)
     */
    static sierraDither(data, width, height, palette, options) {
      const output = new Uint8ClampedArray(data);
      const variant = options.sierraVariant || 'sierra3'; // sierra3, sierra2, sierra_lite
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          
          const oldR = output[idx];
          const oldG = output[idx + 1];
          const oldB = output[idx + 2];
          
          const newColor = this.findNearestColor(oldR, oldG, oldB, palette);
          
          output[idx] = newColor[0];
          output[idx + 1] = newColor[1];
          output[idx + 2] = newColor[2];
          
          const errR = oldR - newColor[0];
          const errG = oldG - newColor[1];
          const errB = oldB - newColor[2];
          
          let matrix;
          
          switch (variant) {
            case 'sierra2':
              matrix = [
                {dx: 1, dy: 0, weight: 4/16},
                {dx: 2, dy: 0, weight: 3/16},
                {dx: -2, dy: 1, weight: 1/16},
                {dx: -1, dy: 1, weight: 2/16},
                {dx: 0, dy: 1, weight: 3/16},
                {dx: 1, dy: 1, weight: 2/16},
                {dx: 2, dy: 1, weight: 1/16}
              ];
              break;
              
            case 'sierra_lite':
              matrix = [
                {dx: 1, dy: 0, weight: 2/4},
                {dx: -1, dy: 1, weight: 1/4},
                {dx: 0, dy: 1, weight: 1/4}
              ];
              break;
              
            default: // sierra3
              matrix = [
                {dx: 1, dy: 0, weight: 5/32},
                {dx: 2, dy: 0, weight: 3/32},
                {dx: -2, dy: 1, weight: 2/32},
                {dx: -1, dy: 1, weight: 4/32},
                {dx: 0, dy: 1, weight: 5/32},
                {dx: 1, dy: 1, weight: 4/32},
                {dx: 2, dy: 1, weight: 2/32},
                {dx: -1, dy: 2, weight: 2/32},
                {dx: 0, dy: 2, weight: 3/32},
                {dx: 1, dy: 2, weight: 2/32}
              ];
          }
          
          for (const {dx, dy, weight} of matrix) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = (ny * width + nx) * 4;
              output[nIdx] = Math.max(0, Math.min(255, output[nIdx] + errR * weight));
              output[nIdx + 1] = Math.max(0, Math.min(255, output[nIdx + 1] + errG * weight));
              output[nIdx + 2] = Math.max(0, Math.min(255, output[nIdx + 2] + errB * weight));
            }
          }
        }
      }
      
      return output;
    }
    
    /**
     * Ordered dithering (using threshold matrix)
     */
    static orderedDither(data, width, height, palette, options) {
      const output = new Uint8ClampedArray(data);
      const matrixSize = options.matrixSize || 4;
      
      // Generate threshold matrix
      const matrix = this.generateOrderedMatrix(matrixSize);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          
          const threshold = matrix[y % matrixSize][x % matrixSize] / (matrixSize * matrixSize);
          
          // Add threshold to color values
          const r = output[idx] / 255 + (threshold - 0.5) * (options.strength || 0.5);
          const g = output[idx + 1] / 255 + (threshold - 0.5) * (options.strength || 0.5);
          const b = output[idx + 2] / 255 + (threshold - 0.5) * (options.strength || 0.5);
          
          // Quantize to palette
          const newColor = this.findNearestColor(
            Math.max(0, Math.min(255, r * 255)),
            Math.max(0, Math.min(255, g * 255)),
            Math.max(0, Math.min(255, b * 255)),
            palette
          );
          
          output[idx] = newColor[0];
          output[idx + 1] = newColor[1];
          output[idx + 2] = newColor[2];
        }
      }
      
      return output;
    }
    
    /**
     * Generate ordered dithering matrix
     */
    static generateOrderedMatrix(size) {
      if (size === 2) {
        return [[0, 2], [3, 1]];
      } else if (size === 4) {
        return [
          [0, 8, 2, 10],
          [12, 4, 14, 6],
          [3, 11, 1, 9],
          [15, 7, 13, 5]
        ];
      } else if (size === 8) {
        // Bayer 8x8 matrix
        const matrix = [];
        for (let y = 0; y < 8; y++) {
          matrix[y] = [];
          for (let x = 0; x < 8; x++) {
            matrix[y][x] = ((x ^ y) * 8 + (x ^ y)) % 64;
          }
        }
        return matrix;
      }
      
      // Default to 4x4
      return this.generateOrderedMatrix(4);
    }
    
    /**
     * Bayer dithering (similar to ordered but with specific Bayer matrix)
     */
    static bayerDither(data, width, height, palette, options) {
      const output = new Uint8ClampedArray(data);
      const bayerLevel = options.bayerLevel || 4; // 2, 4, or 8
      
      // Bayer matrices
      const bayerMatrices = {
        2: [[0, 2], [3, 1]],
        4: [
          [0, 8, 2, 10],
          [12, 4, 14, 6],
          [3, 11, 1, 9],
          [15, 7, 13, 5]
        ],
        8: [] // Will be generated
      };
      
      // Generate 8x8 Bayer matrix if needed
      if (bayerLevel === 8 && bayerMatrices[8].length === 0) {
        for (let i = 0; i < 8; i++) {
          bayerMatrices[8][i] = [];
          for (let j = 0; j < 8; j++) {
            bayerMatrices[8][i][j] = 
              bayerMatrices[4][i % 4][j % 4] * 4 + 
              bayerMatrices[2][Math.floor(i / 4)][Math.floor(j / 4)];
          }
        }
      }
      
      const matrix = bayerMatrices[bayerLevel] || bayerMatrices[4];
      const matrixMax = bayerLevel * bayerLevel - 1;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          
          const threshold = matrix[y % bayerLevel][x % bayerLevel] / matrixMax;
          
          // Add threshold noise to colors
          const noiseStrength = options.strength || 0.5;
          const r = output[idx] / 255 + (threshold - 0.5) * noiseStrength;
          const g = output[idx + 1] / 255 + (threshold - 0.5) * noiseStrength;
          const b = output[idx + 2] / 255 + (threshold - 0.5) * noiseStrength;

          // Quantize to palette
        const newColor = this.findNearestColor(
            Math.max(0, Math.min(255, r * 255)),
            Math.max(0, Math.min(255, g * 255)),
            Math.max(0, Math.min(255, b * 255)),
            palette
          );
          
          output[idx] = newColor[0];
          output[idx + 1] = newColor[1];
          output[idx + 2] = newColor[2];
        }
      }
      
      return output;
    }
    
    /**
     * Halftone dithering
     */
    static halftoneDither(data, width, height, palette, options) {
      const output = new Uint8ClampedArray(data);
      const dotSize = options.dotSize || 4;
      const angle = (options.angle || 0) * Math.PI / 180;
      
      // Pre-calculate rotation matrix
      const cos = Math.cos(-angle);
      const sin = Math.sin(-angle);
      
      for (let y = 0; y < height; y += dotSize) {
        for (let x = 0; x < width; x += dotSize) {
          // Calculate average brightness in this cell
          let totalBrightness = 0;
          let count = 0;
          
          for (let dy = 0; dy < dotSize && y + dy < height; dy++) {
            for (let dx = 0; dx < dotSize && x + dx < width; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              const brightness = (output[idx] + output[idx + 1] + output[idx + 2]) / 3;
              totalBrightness += brightness;
              count++;
            }
          }
          
          const avgBrightness = totalBrightness / count;
          const dotRadius = (dotSize / 2) * (avgBrightness / 255);
          
          // Draw halftone dot
          for (let dy = 0; dy < dotSize && y + dy < height; dy++) {
            for (let dx = 0; dx < dotSize && x + dx < width; dx++) {
              const centerX = dotSize / 2;
              const centerY = dotSize / 2;
              
              // Apply rotation
              const relX = dx - centerX;
              const relY = dy - centerY;
              const rotX = relX * cos - relY * sin;
              const rotY = relX * sin + relY * cos;
              
              const distance = Math.sqrt(rotX * rotX + rotY * rotY);
              const inDot = distance <= dotRadius;
              
              const idx = ((y + dy) * width + (x + dx)) * 4;
              
              // Find appropriate color from palette
              const targetBrightness = inDot ? 0 : 255;
              const newColor = this.findNearestColor(targetBrightness, targetBrightness, targetBrightness, palette);
              
              output[idx] = newColor[0];
              output[idx + 1] = newColor[1];
              output[idx + 2] = newColor[2];
            }
          }
        }
      }
      
      return output;
    }
    
    /**
     * Random dithering (white noise)
     */
    static randomDither(data, width, height, palette, options) {
      const output = new Uint8ClampedArray(data);
      const threshold = options.threshold || 128;
      const noiseAmount = options.noiseAmount || 0.5;
      
      for (let i = 0; i < output.length; i += 4) {
        const r = output[i];
        const g = output[i + 1];
        const b = output[i + 2];
        
        // Add random noise
        const noise = (Math.random() - 0.5) * 255 * noiseAmount;
        
        const noisyR = Math.max(0, Math.min(255, r + noise));
        const noisyG = Math.max(0, Math.min(255, g + noise));
        const noisyB = Math.max(0, Math.min(255, b + noise));
        
        // Quantize to palette
        const newColor = this.findNearestColor(noisyR, noisyG, noisyB, palette);
        
        output[i] = newColor[0];
        output[i + 1] = newColor[1];
        output[i + 2] = newColor[2];
      }
      
      return output;
    }
    
    /**
     * Simple threshold dithering
     */
    static thresholdDither(data, width, height, palette, options) {
      const output = new Uint8ClampedArray(data);
      const threshold = options.threshold || 128;
      
      for (let i = 0; i < output.length; i += 4) {
        const r = output[i];
        const g = output[i + 1];
        const b = output[i + 2];
        
        // Simple threshold
        const brightness = (r + g + b) / 3;
        const thresholdedValue = brightness > threshold ? 255 : 0;
        
        // Find nearest color in palette
        const newColor = this.findNearestColor(thresholdedValue, thresholdedValue, thresholdedValue, palette);
        
        output[i] = newColor[0];
        output[i + 1] = newColor[1];
        output[i + 2] = newColor[2];
      }
      
      return output;
    }
  }