// SYNTHOGRASIZER P5.JS EXAMPLE: Basic Shapes
// 
// This example shows how to control basic properties of shapes
// using Synthograsizer variables. It demonstrates:
// - Reading both discrete (Mode A) and continuous (Mode B) values
// - Using type checking to handle different modes
// - Animating based on variable values
//
// REQUIRED VARIABLES:
// - "shape" with values like "circle", "square", "triangle"
// - "size" for controlling shape size
// - "color" with color name values
// - "rotation" for controlling rotation speed

let angle = 0;

p.setup = function() {
  p.createCanvas(400, 300).parent(p5Output);
  p.angleMode(p.DEGREES);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(16);
  p.strokeWeight(2);
};

p.draw = function() {
  p.background(20);
  
  // Get variables from Synthograsizer (use exact template names as defined in Mode C)
  const shapeType = p.getSynthVar('shape') || 'circle';  // Default if undefined
  let shapeSize = p.getSynthVar('size');
  let rotSpeed = p.getSynthVar('rotation');
  let colorValue = p.getSynthVar('color') || 'white';
  
  // Display current mode in corner
  p.textSize(12);
  p.fill(200);
  p.noStroke();
  p.text(`Current Mode: ${p.getSynthMode()}`, 70, 20);
  
  // Handle size based on type (Mode A = string, Mode B = number)
  let size;
  if (typeof shapeSize === 'number') {
    // Mode B: Map the -1 to 2 range to a reasonable size
    size = p.map(shapeSize, -1, 2, 20, 150);
  } else if (typeof shapeSize === 'string') {
    // Mode A: Try to parse as a number or use a default
    size = parseInt(shapeSize) || 75;
  } else {
    // Default if not defined
    size = 75;
  }
  
  // Handle rotation based on type
  let rotationSpeed;
  if (typeof rotSpeed === 'number') {
    // Mode B: Map the -1 to 2 range to a rotation speed
    rotationSpeed = p.map(rotSpeed, -1, 2, -5, 5);
  } else if (typeof rotSpeed === 'string') {
    // Mode A: Try to parse or use a default
    rotationSpeed = parseFloat(rotSpeed) || 1;
  } else {
    // Default if not defined
    rotationSpeed = 1;
  }
  
  // Update rotation angle
  angle += rotationSpeed;
  
  // Draw shape at center of canvas
  p.push();
  p.translate(p.width/2, p.height/2);
  p.rotate(angle);
  
  // Apply color (works with standard web color names)
  p.fill(colorValue);
  p.stroke(255);
  
  // Draw the selected shape
  if (shapeType.toLowerCase().includes('circle')) {
    p.ellipse(0, 0, size, size);
  } else if (shapeType.toLowerCase().includes('square')) {
    p.rectMode(p.CENTER);
    p.rect(0, 0, size, size);
  } else if (shapeType.toLowerCase().includes('triangle')) {
    const halfSize = size / 2;
    p.triangle(0, -halfSize, -halfSize, halfSize, halfSize, halfSize);
  } else {
    // Default or unknown shape
    p.ellipse(0, 0, size, size);
  }
  
  p.pop();
  
  // Instructions
  p.textSize(14);
  p.fill(255);
  p.noStroke();
  p.text("Use knobs to control shape, size, color & rotation", p.width/2, p.height - 20);
};
