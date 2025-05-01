// SYNTHOGRASIZER P5.JS EXAMPLE: Recursive Fractal Tree
// 
// This example demonstrates recursion to create a fractal tree
// where the branches split and become smaller with depth.
// It showcases:
// - Recursive drawing techniques
// - Using the p5.js console for debugging
// - Advanced color transitions with HSB color mode
// - Dynamic parameter adjustment using knob values
//
// REQUIRED VARIABLES:
// - "branches" for controlling the number of branches per split (2-5)
// - "angle" for controlling the angle between branches
// - "length_reduction" for controlling how much each branch shrinks
// - "min_size" for setting the minimum size of branches before stopping
// - "color_mode" for switching between color styles

// Keep track of animation/generation parameters
let startLength = 120;
let startThickness = 10;
let maxDepth = 0;
let startColor, endColor;
let drawMode = 'static'; // 'static', 'animated', 'wind'
let windAngle = 0;
let windSpeed = 0.02;
let windStrength = 0.2;

p.setup = function() {
  p.createCanvas(500, 500).parent(p5Output);
  p.angleMode(p.DEGREES);
  p.noLoop(); // Static drawing by default
  p.colorMode(p.HSB, 360, 100, 100, 1);
  p.strokeCap(p.ROUND);
  
  // Set default colors
  startColor = p.color(30, 80, 40);
  endColor = p.color(120, 90, 70);
  
  p.print("Fractal Tree initialized! Use the console to see debug info.");
  p.print("Check out the different branches, angles, and colors!");
};

p.draw = function() {
  p.background(220);
  
  // Get variables from Synthograsizer
  const branchesVar = p.getSynthVar('branches') || 2;
  const angleVar = p.getSynthVar('angle') || 30;
  const lengthReductionVar = p.getSynthVar('length_reduction') || 0.7;
  const minSizeVar = p.getSynthVar('min_size') || 10;
  const colorModeVar = p.getSynthVar('color_mode') || 'autumn';
  
  // Process variables according to type (Mode A = string, Mode B = number)
  let branches = 2;
  if (typeof branchesVar === 'number') {
    branches = p.constrain(Math.floor(p.map(branchesVar, -1, 2, 2, 5)), 2, 5);
  } else if (typeof branchesVar === 'string') {
    branches = p.constrain(parseInt(branchesVar) || 2, 2, 5);
  }
  
  let angle = 30;
  if (typeof angleVar === 'number') {
    angle = p.map(angleVar, -1, 2, 10, 50);
  } else if (typeof angleVar === 'string') {
    angle = parseFloat(angleVar) || 30;
  }
  
  let lengthReduction = 0.7;
  if (typeof lengthReductionVar === 'number') {
    lengthReduction = p.map(lengthReductionVar, -1, 2, 0.5, 0.85);
  } else if (typeof lengthReductionVar === 'string') {
    lengthReduction = parseFloat(lengthReductionVar) || 0.7;
  }
  
  let minSize = 10;
  if (typeof minSizeVar === 'number') {
    minSize = p.map(minSizeVar, -1, 2, 2, 20);
  } else if (typeof minSizeVar === 'string') {
    minSize = parseFloat(minSizeVar) || 10;
  }
  
  // Set color scheme based on selection
  if (typeof colorModeVar === 'string') {
    switch(colorModeVar.toLowerCase()) {
      case 'autumn':
        startColor = p.color(30, 80, 40);  // Brown
        endColor = p.color(50, 90, 70);    // Orange/Yellow
        break;
      case 'spring':
        startColor = p.color(30, 60, 40);  // Brown
        endColor = p.color(120, 90, 70);   // Green
        break;
      case 'winter':
        startColor = p.color(200, 10, 30); // Dark Blue
        endColor = p.color(200, 80, 90);   // Light Blue/White
        break;
      case 'rainbow':
        startColor = p.color(270, 90, 50); // Violet
        endColor = p.color(0, 90, 90);     // Red
        break;
      default:
        startColor = p.color(30, 80, 40);  // Default Brown
        endColor = p.color(120, 90, 70);   // Default Green
    }
  }
  
  // Determine if we need to animate based on variables
  if (p.getSynthMode() === 'B' && typeof angleVar === 'number') {
    // Only animate in Mode B when the angle is being controlled
    if (drawMode !== 'animated' && Math.abs(angleVar) > 0.5) {
      drawMode = 'animated';
      p.loop();
      p.print("Animation mode enabled! Tree will respond to angle changes.");
    } else if (drawMode === 'animated' && Math.abs(angleVar) <= 0.5) {
      drawMode = 'static';
      p.noLoop();
      p.print("Animation disabled - angle value returned to normal range.");
    }
  } else if (drawMode === 'animated') {
    drawMode = 'static';
    p.noLoop();
  }
  
  // For wind animation
  if (drawMode === 'animated') {
    windAngle = p.sin(p.frameCount * windSpeed) * windStrength;
  } else {
    windAngle = 0;
  }
  
  // Reset max depth counter
  maxDepth = 0;
  
  // Draw the tree
  p.push();
  p.translate(p.width/2, p.height);
  drawBranch(startLength, startThickness, branches, angle, lengthReduction, minSize, 0);
  p.pop();
  
  // Display information
  p.colorMode(p.RGB);
  p.fill(0);
  p.noStroke();
  p.textSize(14);
  p.textAlign(p.LEFT, p.TOP);
  p.text(`Mode: ${p.getSynthMode()}`, 10, 10);
  p.text(`Branches: ${branches}`, 10, 30);
  p.text(`Angle: ${angle.toFixed(1)}°`, 10, 50);
  p.text(`Length Reduction: ${lengthReduction.toFixed(2)}`, 10, 70);
  p.text(`Min Size: ${minSize.toFixed(1)}`, 10, 90);
  p.text(`Color: ${colorModeVar}`, 10, 110);
  p.text(`Max Depth: ${maxDepth}`, 10, 130);
  
  // Show help text at bottom
  p.textAlign(p.CENTER, p.BOTTOM);
  p.text("Adjust knobs to control the fractal pattern", p.width/2, p.height - 10);
};

// Recursive function to draw branches
function drawBranch(len, thickness, branches, angle, reduction, minSize, depth) {
  // Track the maximum depth we've reached
  maxDepth = Math.max(maxDepth, depth);
  
  // Calculate color for this branch
  const progress = p.constrain(depth / 7, 0, 1); // Normalize depth for color calculation
  const branchColor = lerpColor(startColor, endColor, progress);
  
  // Set drawing styles
  p.stroke(branchColor);
  p.strokeWeight(thickness);
  
  // Draw the branch
  p.line(0, 0, 0, -len);
  
  // Stop recursion if branch is too small
  if (len <= minSize) {
    return;
  }
  
  // Move to the end of this branch
  p.translate(0, -len);
  
  // Calculate new length for child branches
  const newLength = len * reduction;
  const newThickness = thickness * 0.7;
  
  // For even branches, calculate angle spacing
  const totalAngle = (branches - 1) * angle;
  const startAngle = -totalAngle / 2;
  
  // Create child branches
  for (let i = 0; i < branches; i++) {
    p.push();
    // Calculate this branch's angle
    const branchAngle = startAngle + (i * angle) + windAngle;
    p.rotate(branchAngle);
    
    // Recursive call for this branch
    drawBranch(newLength, newThickness, branches, angle, reduction, minSize, depth + 1);
    p.pop();
  }
}

// Helper function to interpolate between HSB colors
function lerpColor(c1, c2, amt) {
  const h1 = p.hue(c1);
  const s1 = p.saturation(c1);
  const b1 = p.brightness(c1);
  
  const h2 = p.hue(c2);
  const s2 = p.saturation(c2);
  const b2 = p.brightness(c2);
  
  // Special handling for hue to find shortest path around the color wheel
  let hueDiff = h2 - h1;
  if (Math.abs(hueDiff) > 180) {
    hueDiff = hueDiff - Math.sign(hueDiff) * 360;
  }
  
  const h = h1 + hueDiff * amt;
  const s = p.lerp(s1, s2, amt);
  const b = p.lerp(b1, b2, amt);
  
  return p.color(h, s, b);
}