// SYNTHOGRASIZER P5.JS EXAMPLE: Particle System
// 
// This example shows how to create a dynamic particle system
// controlled by Synthograsizer variables. It demonstrates:
// - Maintaining and updating a collection of objects
// - Mapping variable values to multiple parameters
// - Responding to both Mode A and Mode B values
//
// REQUIRED VARIABLES:
// - "count" for controlling number of particles
// - "speed" for controlling particle movement speed
// - "size" for controlling particle size
// - "color" for particle color theme (e.g., "fire", "ocean", "rainbow")

// Particle class
class Particle {
  constructor(x, y, size, speed, colorScheme) {
    this.pos = p.createVector(x, y);
    this.vel = p.createVector(p.random(-1, 1), p.random(-1, 1));
    this.vel.normalize().mult(speed);
    this.size = size;
    this.colorScheme = colorScheme;
    this.lifespan = 255;
    this.decay = p.random(1, 3);
  }
  
  update() {
    this.pos.add(this.vel);
    this.lifespan -= this.decay;
    
    // Bounce off edges
    if (this.pos.x < 0 || this.pos.x > p.width) {
      this.vel.x *= -1;
    }
    if (this.pos.y < 0 || this.pos.y > p.height) {
      this.vel.y *= -1;
    }
  }
  
  display() {
    p.noStroke();
    
    // Choose color based on scheme
    let particleColor;
    
    switch(this.colorScheme.toLowerCase()) {
      case 'fire':
        particleColor = p.color(
          p.random(200, 255),
          p.random(50, 150),
          p.random(0, 50),
          this.lifespan
        );
        break;
      case 'ocean':
        particleColor = p.color(
          p.random(0, 50),
          p.random(100, 150),
          p.random(200, 255),
          this.lifespan
        );
        break;
      case 'rainbow':
        const hue = (p.frameCount + this.pos.x) % 360;
        p.colorMode(p.HSB, 360, 100, 100, 255); // Set HSB mode first
        particleColor = p.color(
          hue,
          80,
          90,
          this.lifespan
        );
        p.colorMode(p.RGB, 255, 255, 255, 255); // Reset color mode
        break;
      default:
        particleColor = p.color(200, 200, 200, this.lifespan);
    }
    
    p.fill(particleColor);
    p.ellipse(this.pos.x, this.pos.y, this.size);
  }
  
  isDead() {
    return this.lifespan <= 0;
  }
}

// Main sketch variables
let particles = [];

p.setup = function() {
  p.createCanvas(400, 300).parent(p5Output);
};

p.draw = function() {
  p.background(10, 20, 30, 40); // Semi-transparent background for trails
  
  // Get Synthograsizer variables
  const colorTheme = p.getSynthVar('color') || 'rainbow';
  
  // Handle count based on type (Mode A or B)
  let count;
  const countVar = p.getSynthVar('count');
  if (typeof countVar === 'number') {
    // Mode B: Map from -1..2 range to realistic particle count
    count = p.map(countVar, -1, 2, 1, 200);
  } else if (typeof countVar === 'string') {
    // Mode A: Parse value or use default
    count = parseInt(countVar) || 50;
  } else {
    count = 50; // Default
  }
  count = p.constrain(Math.floor(count), 1, 200);
  
  // Handle particle size
  let size;
  const sizeVar = p.getSynthVar('size');
  if (typeof sizeVar === 'number') {
    size = p.map(sizeVar, -1, 2, 1, 15);
  } else if (typeof sizeVar === 'string') {
    size = parseFloat(sizeVar) || 5;
  } else {
    size = 5;
  }
  
  // Handle speed
  let speed;
  const speedVar = p.getSynthVar('speed');
  if (typeof speedVar === 'number') {
    speed = p.map(speedVar, -1, 2, 0.5, 5);
  } else if (typeof speedVar === 'string') {
    speed = parseFloat(speedVar) || 2;
  } else {
    speed = 2;
  }
  
  // Create new particles to maintain the count
  while (particles.length < count) {
    particles.push(new Particle(
      p.random(p.width),
      p.random(p.height),
      size,
      speed,
      colorTheme
    ));
  }
  
  // If we have too many particles, remove some
  if (particles.length > count) {
    particles.splice(count);
  }
  
  // Update and display particles
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].display();
    
    // Remove dead particles
    if (particles[i].isDead()) {
      particles.splice(i, 1);
    }
  }
  
  // Show info
  p.fill(255);
  p.noStroke();
  p.textSize(12);
  p.textAlign(p.LEFT, p.TOP);
  p.text(`Mode: ${p.getSynthMode()}`, 10, 10);
  p.text(`Particles: ${particles.length}`, 10, 30);
  p.text(`Theme: ${colorTheme}`, 10, 50);
  p.text(`Size: ${size.toFixed(1)}`, 10, 70);
  p.text(`Speed: ${speed.toFixed(1)}`, 10, 90);
};
