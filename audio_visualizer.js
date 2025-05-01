// SYNTHOGRASIZER P5.JS EXAMPLE: Audio Visualizer
// 
// This example simulates an audio visualizer controlled by Synthograsizer variables.
// It demonstrates:
// - Creating a more complex visual effect
// - Using multiple interacting variables
// - Simulating an audio responsive visualization
//
// REQUIRED VARIABLES:
// - "bass" for controlling low frequency response
// - "mid" for controlling mid frequency response
// - "treble" for controlling high frequency response
// - "tempo" for controlling animation speed
// - "style" with values like "bars", "circles", "lines"

// Animation variables
let time = 0;
let bars = [];
const NUM_BARS = 64;

p.setup = function() {
  p.createCanvas(400, 300).parent(p5Output);
  p.colorMode(p.HSB, 360, 100, 100, 1);
  
  // Initialize bars
  for (let i = 0; i < NUM_BARS; i++) {
    bars[i] = 0;
  }
};

p.draw = function() {
  p.background(0);
  
  // Get Synthograsizer variables
  const bassVar = p.getSynthVar('bass') || 0.5;
  const midVar = p.getSynthVar('mid') || 0.5;
  const trebleVar = p.getSynthVar('treble') || 0.5;
  const tempoVar = p.getSynthVar('tempo') || 1;
  const styleVar = p.getSynthVar('style') || 'bars';
  
  // Normalize values based on mode
  const bass = typeof bassVar === 'number' ? p.map(bassVar, -1, 2, 0, 1) : parseFloat(bassVar) || 0.5;
  const mid = typeof midVar === 'number' ? p.map(midVar, -1, 2, 0, 1) : parseFloat(midVar) || 0.5;
  const treble = typeof trebleVar === 'number' ? p.map(trebleVar, -1, 2, 0, 1) : parseFloat(trebleVar) || 0.5;
  const tempo = typeof tempoVar === 'number' ? p.map(tempoVar, -1, 2, 0.25, 4) : parseFloat(tempoVar) || 1;
  
  // Update time
  time += 0.02 * tempo;
  
  // Update bar heights using bass/mid/treble values
  for (let i = 0; i < NUM_BARS; i++) {
    // Create the illusion of frequency bands
    const freq = i / NUM_BARS;
    let freqMult;
    
    // Apply frequency band multipliers (bass/mid/treble)
    if (freq < 0.33) {
      // Low frequencies (bass)
      freqMult = bass * 2.5;
    } else if (freq < 0.66) {
      // Mid frequencies
      freqMult = mid * 2.0;
    } else {
      // High frequencies (treble)
      freqMult = treble * 1.5;
    }
    
    // Generate a value using noise for a natural look
    const noiseVal = p.noise(i * 0.05, time * 0.2) * freqMult;
    
    // Add a beat emphasis based on time
    const beat = Math.pow(Math.sin(time * 0.8) * 0.5 + 0.5, 3) * bass;
    
    // Smooth transitions with easing
    bars[i] = p.lerp(bars[i], noiseVal + beat, 0.2);
  }
  
  // Render based on selected style
  if (styleVar.toLowerCase().includes('circle')) {
    drawCircleVisualizer();
  } else if (styleVar.toLowerCase().includes('line')) {
    drawLineVisualizer();
  } else {
    // Default to bars
    drawBarVisualizer();
  }
  
  // Display info
  p.colorMode(p.RGB);
  p.fill(255);
  p.noStroke();
  p.textSize(12);
  p.textAlign(p.LEFT, p.TOP);
  p.text(`Mode: ${p.getSynthMode()}`, 10, 10);
  p.text(`Style: ${styleVar}`, 10, 30);
  p.text(`Bass: ${bass.toFixed(2)}`, 10, 50);
  p.text(`Mid: ${mid.toFixed(2)}`, 10, 70);
  p.text(`Treble: ${treble.toFixed(2)}`, 10, 90);
  p.text(`Tempo: ${tempo.toFixed(2)}x`, 10, 110);
  
  // Function to draw bar visualizer
  function drawBarVisualizer() {
    const barWidth = p.width / NUM_BARS;
    
    for (let i = 0; i < NUM_BARS; i++) {
      const barHeight = bars[i] * p.height * 0.8;
      const hue = (i / NUM_BARS * 360) % 360;
      p.noStroke();
      p.fill(hue, 80, 100, 0.7);
      p.rect(i * barWidth, p.height - barHeight, barWidth - 1, barHeight);
    }
  }
  
  // Function to draw circle visualizer
  function drawCircleVisualizer() {
    p.translate(p.width/2, p.height/2);
    
    // Inner circle pulse with bass
    p.fill(240, 80, 100, 0.4);
    p.ellipse(0, 0, 100 * bass);
    
    // Outer frequency circles
    for (let i = 0; i < NUM_BARS; i += 2) {
      const angle = (i / NUM_BARS) * p.TWO_PI;
      const radius = 50 + bars[i] * 100;
      const hue = (i / NUM_BARS * 360) % 360;
      
      p.noFill();
      p.stroke(hue, 80, 100, 0.7);
      p.strokeWeight(3);
      const x = p.cos(angle) * radius;
      const y = p.sin(angle) * radius;
      p.ellipse(x * 0.2, y * 0.2, radius * 0.4);
    }
  }
  
  // Function to draw line visualizer
  function drawLineVisualizer() {
    p.noFill();
    p.strokeWeight(2);
    
    // Draw 3 frequency lines (bass, mid, treble)
    const centerY = p.height / 2;
    
    // Bass wave (red)
    p.stroke(0, 80, 100, 0.7);
    p.beginShape();
    for (let i = 0; i < p.width; i++) {
      const index = Math.floor((i / p.width) * (NUM_BARS / 3));
      const y = centerY - (bars[index] * 100) - 50;
      p.vertex(i, y);
    }
    p.endShape();
    
    // Mid wave (green)
    p.stroke(120, 80, 100, 0.7);
    p.beginShape();
    for (let i = 0; i < p.width; i++) {
      const index = Math.floor((i / p.width) * (NUM_BARS / 3)) + Math.floor(NUM_BARS / 3);
      const y = centerY - (bars[index] * 100);
      p.vertex(i, y);
    }
    p.endShape();
    
    // Treble wave (blue)
    p.stroke(240, 80, 100, 0.7);
    p.beginShape();
    for (let i = 0; i < p.width; i++) {
      const index = Math.floor((i / p.width) * (NUM_BARS / 3)) + Math.floor(2 * NUM_BARS / 3);
      const y = centerY - (bars[index] * 100) + 50;
      p.vertex(i, y);
    }
    p.endShape();
  }
};
