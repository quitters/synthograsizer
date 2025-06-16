/**
 * Math Utilities for Glitcher App
 * Common mathematical functions used throughout the application
 */

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function clampColor(value) {
  return Math.min(Math.max(Math.round(value), 0), 255);
}

export function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

export function map(value, inMin, inMax, outMin, outMax) {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

export function constrainToCanvas(x, y, width, height, canvasWidth, canvasHeight) {
  return {
    x: clamp(x, 0, canvasWidth - width),
    y: clamp(y, 0, canvasHeight - height),
    w: Math.min(width, canvasWidth - x),
    h: Math.min(height, canvasHeight - y)
  };
}
