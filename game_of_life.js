// SYNTHOGRASIZER P5.JS EXAMPLE: Conway's Game of Life
// 
// This example implements Conway's Game of Life cellular automaton
// with interactive controls for adjusting rules and visualization.
// It demonstrates:
// - Grid-based cellular automata
// - Dynamic rule adjustments through variables
// - Generative pattern creation
// - Color mapping strategies
//
// REQUIRED VARIABLES:
// - "cell_size" for grid resolution (5-20)
// - "birth_rule" for number of neighbors to create a cell (typically 3)
// - "survive_lower" for min neighbors to survive (typically 2)
// - "survive_upper" for max neighbors to survive (typically 3)
// - "color_scheme" for different visualization modes

// Grid parameters
let grid = [];
let nextGrid = [];
let cols, rows;
let paused = false;
let generation = 0;
let population = 0;

// Rules (classic Game of Life by default)
let birthRule = 3;
let surviveLowerBound = 2;
let surviveUpperBound = 3;

// Performance-related
let lastUpdateTime = 0;
let updateInterval = 100; // milliseconds between updates
let frameRateValue = 0;

// Visualization
let cellColorScheme = 'classic';
let showGrid = true;

p.setup = function() {
  p.createCanvas(500, 400).parent(p5Output);
  p.frameRate(30);
  
  // Initialize with a reasonable cell size
  initializeGrid(10);
  
  // Add some random cells to start with
  randomizeGrid(0.3); // 30% chance of alive cells
  
  p.print("Game of Life initialized!");
  p.print("Use the Synthograsizer variables to control the simulation.");
  p.print("- cell_size: Controls grid resolution");
  p.print("- birth_rule: Number of neighbors needed for birth");
  p.print("- survive_lower: Minimum neighbors for survival");
  p.print("- survive_upper: Maximum neighbors for survival");
  p.print("- color_scheme: Visualization style");
};

p.draw = function() {
  // Get variables from Synthograsizer
  const cellSizeVar = p.getSynthVar('cell_size') || 10;
  const birthRuleVar = p.getSynthVar('birth_rule') || 3;
  const surviveLowerVar = p.getSynthVar('survive_lower') || 2;
  const surviveUpperVar = p.getSynthVar('survive_upper') || 3;
  const colorSchemeVar = p.getSynthVar('color_scheme') || 'classic';
  
  // Process variables according to type
  let cellSize = 10;
  if (typeof cellSizeVar === 'number') {
    cellSize = p.constrain(Math.floor(p.map(cellSizeVar, -1, 2, 5, 20)), 5, 20);
  } else if (typeof cellSizeVar === 'string') {
    cellSize = p.constrain(parseInt(cellSizeVar) || 10, 5, 20);
  }
  
  // Parse other variables
  birthRule = parseRuleValue(birthRuleVar, 3);
  surviveLowerBound = parseRuleValue(surviveLowerVar, 2); 
  surviveUpperBound = parseRuleValue(surviveUpperVar, 3);
  
  // Validate rule bounds
  surviveLowerBound = p.constrain(surviveLowerBound, 0, 8);
  surviveUpperBound = p.constrain(surviveUpperBound, surviveLowerBound, 8);
  
  // Set color scheme
  if (typeof colorSchemeVar === 'string') {
    cellColorScheme = colorSchemeVar.toLowerCase();
  }
  
  // Clear background - use dark gray for better contrast
  p.background(32);
  
  // Check if we need to reinitialize the grid (cell size changed)
  if (cellSize !== p.width / cols) {
    initializeGrid(cellSize);
    // Re-randomize if the grid is mostly empty
    if (population / (cols * rows) < 0.1) {
      randomizeGrid(0.3);
    }
  }
  
  // Calculate current frame rate
  frameRateValue = p.frameRate();
  
  // Update simulation at specified interval
  const currentTime = p.millis();
  if (currentTime - lastUpdateTime > updateInterval && !paused) {
    updateGrid();
    lastUpdateTime = currentTime;
  }
  
  // Draw the grid and cells
  drawGrid();
  
  // Display info
  displayInfo();
};

// Parse and constrain a rule value
function parseRuleValue(value, defaultValue) {
  if (typeof value === 'number') {
    return p.constrain(Math.round(p.map(value, -1, 2, 0, 8)), 0, 8);
  } else if (typeof value === 'string') {
    return p.constrain(parseInt(value) || defaultValue, 0, 8);
  }
  return defaultValue;
}

// Initialize the grid with given cell size
function initializeGrid(cellSize) {
  cols = Math.floor(p.width / cellSize);
  rows = Math.floor(p.height / cellSize);
  
  // Create new grid arrays
  grid = Array(cols).fill().map(() => Array(rows).fill(0));
  nextGrid = Array(cols).fill().map(() => Array(rows).fill(0));
  
  p.print(`Grid initialized: ${cols}x${rows} cells (${cellSize}px each)`);
}

// Fill grid with random living cells
function randomizeGrid(density) {
  population = 0;
  
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      grid[i][j] = p.random() < density ? 1 : 0;
      if (grid[i][j] === 1) population++;
    }
  }
  
  generation = 0;
  p.print(`Grid randomized with ${population} living cells (${Math.round(density * 100)}% density)`);
}

// Update the grid according to the Game of Life rules
function updateGrid() {
  population = 0;
  
  // Compute next generation
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // Count living neighbors
      let neighbors = countNeighbors(i, j);
      let state = grid[i][j];
      
      // Apply rules (with variable rule settings)
      if (state === 0 && neighbors === birthRule) {
        // Birth rule
        nextGrid[i][j] = 1;
      } else if (state === 1 && (neighbors < surviveLowerBound || neighbors > surviveUpperBound)) {
        // Death rule - under/overpopulation
        nextGrid[i][j] = 0;
      } else {
        // Maintain current state
        nextGrid[i][j] = state;
      }
      
      // Count population
      if (nextGrid[i][j] === 1) population++;
    }
  }
  
  // Swap grids
  [grid, nextGrid] = [nextGrid, grid];
  generation++;
}

// Count living neighbors around a cell
function countNeighbors(x, y) {
  let count = 0;
  
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      // Skip the center cell
      if (i === 0 && j === 0) continue;
      
      // Handle wrapping around edges (toroidal grid)
      let col = (x + i + cols) % cols;
      let row = (y + j + rows) % rows;
      
      count += grid[col][row];
    }
  }
  
  return count;
}

// Draw the grid and cells
function drawGrid() {
  const cellWidth = p.width / cols;
  const cellHeight = p.height / rows;
  
  // Draw cells
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (grid[i][j] === 1) {
        // Set fill color based on chosen scheme
        const neighbors = countNeighbors(i, j);
        setColorByScheme(cellColorScheme, neighbors);
        
        p.noStroke();
        p.rect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
      }
    }
  }
  
  // Optionally draw grid lines
  if (showGrid && cellWidth >= 8) {
    p.stroke(60);
    p.strokeWeight(0.5);
    for (let i = 0; i <= cols; i++) {
      p.line(i * cellWidth, 0, i * cellWidth, p.height);
    }
    for (let j = 0; j <= rows; j++) {
      p.line(0, j * cellHeight, p.width, j * cellHeight);
    }
  }
}

// Set color based on chosen color scheme
function setColorByScheme(scheme, neighbors) {
  switch (scheme) {
    case 'classic':
      p.fill(255); // White cells
      break;
    case 'heat':
      // Color cells based on neighbor count (blue to red)
      const hue = p.map(neighbors, 0, 8, 240, 0);
      p.fill(hue, 80, 90);
      break;
    case 'rainbow':
      // Rainbow pattern based on neighbor count
      const hueValue = p.map(neighbors, 0, 8, 0, 300);
      p.colorMode(p.HSB, 360, 100, 100);
      p.fill(hueValue, 90, 95);
      p.colorMode(p.RGB, 255, 255, 255);
      break;
    case 'neon':
      // Bright neon colors
      p.colorMode(p.HSB, 360, 100, 100);
      p.fill(200 + p.sin(p.frameCount * 0.01) * 160, 90, 95);
      p.colorMode(p.RGB, 255, 255, 255);
      break;
    default:
      p.fill(255);
  }
}

// Display information overlay
function displayInfo() {
  p.fill(0, 0, 0, 180);
  p.noStroke();
  p.rect(5, 5, 200, 150);
  
  p.fill(255);
  p.textSize(12);
  p.textAlign(p.LEFT, p.TOP);
  
  p.text(`Mode: ${p.getSynthMode()}`, 15, 15);
  p.text(`Generation: ${generation}`, 15, 35);
  p.text(`Population: ${population}`, 15, 55);
  p.text(`Rules: B${birthRule}/S${surviveLowerBound}-${surviveUpperBound}`, 15, 75);
  p.text(`Grid: ${cols}x${rows}`, 15, 95);
  p.text(`Theme: ${cellColorScheme}`, 15, 115);
  p.text(`FPS: ${Math.round(frameRateValue)}`, 15, 135);

  // Instructions at bottom
  p.textAlign(p.CENTER, p.BOTTOM);
  p.text("Adjust knobs to change the simulation rules and appearance", p.width/2, p.height - 10);
}