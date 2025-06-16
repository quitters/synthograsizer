/**
 * Color Utilities for Glitcher App
 * Color space conversions and color manipulation functions
 */

/**
 * Convert RGB values to HSL color space
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {Array} [h, s, l] where h is 0-360, s and l are 0-1
 */
export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  return [h * 360, s, l];
}

/**
 * Convert HSL values to RGB color space
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-1)
 * @param {number} l - Lightness (0-1)
 * @returns {Array} [r, g, b] where values are 0-255
 */
export function hslToRgb(h, s, l) {
  h /= 360;
  
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }

  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Extract hue from RGB values
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {number} Hue value (0-360)
 */
export function rgbToHue(r, g, b) {
  const [h] = rgbToHsl(r, g, b);
  return h;
}

/**
 * Calculate brightness from RGB values
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {number} Brightness value (0-255)
 */
export function rgbToBrightness(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate color difference between two RGB colors
 * @param {Array} color1 - [r, g, b] values
 * @param {Array} color2 - [r, g, b] values
 * @returns {number} Euclidean distance between colors
 */
export function colorDistance(color1, color2) {
  const [r1, g1, b1] = color1;
  const [r2, g2, b2] = color2;
  
  return Math.sqrt(
    Math.pow(r2 - r1, 2) +
    Math.pow(g2 - g1, 2) +
    Math.pow(b2 - b1, 2)
  );
}

/**
 * Blend two colors with a given factor
 * @param {Array} color1 - [r, g, b] values
 * @param {Array} color2 - [r, g, b] values
 * @param {number} factor - Blend factor (0-1)
 * @returns {Array} Blended [r, g, b] values
 */
export function blendColors(color1, color2, factor) {
  const [r1, g1, b1] = color1;
  const [r2, g2, b2] = color2;
  
  return [
    Math.round(r1 + (r2 - r1) * factor),
    Math.round(g1 + (g2 - g1) * factor),
    Math.round(b1 + (b2 - b1) * factor)
  ];
}
