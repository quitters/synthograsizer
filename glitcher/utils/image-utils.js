/**
 * Image Processing Utilities for Glitcher App
 * Helper functions for image manipulation and canvas operations
 */

/**
 * Calculate optimal canvas dimensions for performance
 * @param {number} originalWidth - Original image width
 * @param {number} originalHeight - Original image height
 * @returns {Object} {width, height} optimized dimensions
 */
export function calculateOptimalDimensions(originalWidth, originalHeight) {
  const TARGET_PIXELS = 1048576; // 1MP
  const MAX_PIXELS = 2097152;    // 2MP
  const BASE_UNIT = 64;

  const MAX_WH_BLOCK_PRODUCT = MAX_PIXELS / (BASE_UNIT * BASE_UNIT);

  let safeOriginalWidth = originalWidth;
  let safeOriginalHeight = originalHeight;

  if (safeOriginalWidth <= 0 || safeOriginalHeight <= 0) {
    safeOriginalWidth = BASE_UNIT; 
    safeOriginalHeight = BASE_UNIT;
  }
  
  const originalAspectRatio = safeOriginalWidth / safeOriginalHeight;

  let bestSolution = {
    W_block: -1, H_block: -1, pixel_score: Infinity, aspect_error: Infinity, meets_aspect_criteria: false
  };
  const MAX_ACCEPTABLE_ASPECT_ERROR = 0.20;

  if (MAX_WH_BLOCK_PRODUCT >= 1) {
    const initialWBlock = 1, initialHBlock = 1;
    const initialPixels = (initialWBlock * initialHBlock) * BASE_UNIT * BASE_UNIT;
    const initialAspectError = calculateAspectError(initialWBlock * BASE_UNIT, initialHBlock * BASE_UNIT, originalAspectRatio);
    bestSolution = {
        W_block: initialWBlock,
        H_block: initialHBlock,
        pixel_score: Math.abs(initialPixels - TARGET_PIXELS),
        aspect_error: initialAspectError,
        meets_aspect_criteria: initialAspectError <= MAX_ACCEPTABLE_ASPECT_ERROR
    };
  } else {
    return { width: BASE_UNIT, height: BASE_UNIT };
  }

  for (let currentWBlock = 1; currentWBlock <= MAX_WH_BLOCK_PRODUCT; currentWBlock++) {
    for (let currentHBlock = 1; (currentWBlock * currentHBlock) <= MAX_WH_BLOCK_PRODUCT; currentHBlock++) {
      const currentPixels = (currentWBlock * currentHBlock) * BASE_UNIT * BASE_UNIT;
      const currentPixelScore = Math.abs(currentPixels - TARGET_PIXELS);
      const candidateAspectError = calculateAspectError(currentWBlock * BASE_UNIT, currentHBlock * BASE_UNIT, originalAspectRatio);

      const candidateMeetsAspectCriteria = candidateAspectError <= MAX_ACCEPTABLE_ASPECT_ERROR;
      let updateSolution = false;

      if (bestSolution.W_block === -1) {
          updateSolution = true;
      } else if (candidateMeetsAspectCriteria && bestSolution.meets_aspect_criteria) {
          if (candidateAspectError < bestSolution.aspect_error) {
              updateSolution = true;
          } else if (candidateAspectError === bestSolution.aspect_error && currentPixelScore < bestSolution.pixel_score) {
              updateSolution = true;
          }
      } else if (candidateMeetsAspectCriteria && !bestSolution.meets_aspect_criteria) {
          updateSolution = true;
      } else if (!candidateMeetsAspectCriteria && !bestSolution.meets_aspect_criteria) {
          if (currentPixelScore < bestSolution.pixel_score) {
              updateSolution = true;
          } else if (currentPixelScore === bestSolution.pixel_score && candidateAspectError < bestSolution.aspect_error) {
              updateSolution = true;
          }
      }
      
      if (updateSolution) {
        bestSolution.W_block = currentWBlock;
        bestSolution.H_block = currentHBlock;
        bestSolution.pixel_score = currentPixelScore;
        bestSolution.aspect_error = candidateAspectError;
        bestSolution.meets_aspect_criteria = candidateMeetsAspectCriteria;
      }
    }
  }
  
  if (bestSolution.W_block === -1) { 
      return { width: BASE_UNIT, height: BASE_UNIT }; 
  }

  return {
    width: bestSolution.W_block * BASE_UNIT,
    height: bestSolution.H_block * BASE_UNIT,
  };
}

/**
 * Calculate aspect ratio error
 * @param {number} newWidth - New width
 * @param {number} newHeight - New height
 * @param {number} originalAspectRatio - Original aspect ratio
 * @returns {number} Aspect ratio error
 */
function calculateAspectError(newWidth, newHeight, originalAspectRatio) {
  if (originalAspectRatio === Infinity) {
    return newHeight === 0 && newWidth > 0 ? 0 : Infinity;
  }

  if (originalAspectRatio === 0) {
    return newWidth === 0 && newHeight > 0 ? 0 : Infinity;
  }

  if (newHeight === 0) {
    return Infinity;
  }
  
  const newAspectRatio = newWidth / newHeight;
  if (newWidth === 0) {
    return Infinity;
  }

  return Math.abs(newAspectRatio - originalAspectRatio) / originalAspectRatio;
}

/**
 * Copy ImageData object
 * @param {ImageData} imageData - Source ImageData
 * @returns {ImageData} Copy of the ImageData
 */
export function copyImageData(imageData) {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

/**
 * Create blank ImageData
 * @param {number} width - Width of the ImageData
 * @param {number} height - Height of the ImageData
 * @returns {ImageData} Blank ImageData filled with transparent pixels
 */
export function createBlankImageData(width, height) {
  return new ImageData(width, height);
}

/**
 * Get pixel value from ImageData
 * @param {ImageData} imageData - Source ImageData
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Array} [r, g, b, a] pixel values
 */
export function getPixel(imageData, x, y) {
  const index = (y * imageData.width + x) * 4;
  return [
    imageData.data[index],
    imageData.data[index + 1],
    imageData.data[index + 2],
    imageData.data[index + 3]
  ];
}

/**
 * Set pixel value in ImageData
 * @param {ImageData} imageData - Target ImageData
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Array} color - [r, g, b, a] pixel values
 */
export function setPixel(imageData, x, y, color) {
  const index = (y * imageData.width + x) * 4;
  imageData.data[index] = color[0];
  imageData.data[index + 1] = color[1];
  imageData.data[index + 2] = color[2];
  imageData.data[index + 3] = color[3];
}

/**
 * Check if coordinates are within image bounds
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {boolean} True if coordinates are within bounds
 */
export function isInBounds(x, y, width, height) {
  return x >= 0 && x < width && y >= 0 && y < height;
}
