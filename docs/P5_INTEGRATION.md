# P5.js Integration Guide

## Using MIDI Controllers with P5.js Sketches

Synthograsizer supports direct MIDI control of your p5.js sketches in Mode D, allowing for real-time interaction with generative art through physical controllers.

### Setup Instructions

1. **Setup Variables in Mode C**:
   - Create variables with appropriate template names (e.g., `color`, `size`, `speed`)
   - Add several values to each variable to allow for variation

2. **Map MIDI Controls in Mode A or B**:
   - Connect your MIDI controller to your computer
   - Switch to Mode A or B where knobs are visible
   - Move MIDI controls to automatically map them to knobs
   - Test different controls to see which ones work best with your variables

3. **Switch to Mode D**:
   - The MIDI mappings will persist when switching to Mode D
   - The MIDI Status Panel will display which MIDI controls are mapped to which variables

### Example Code

```javascript
let currentColor = 'white';  // Default value
let currentSize = 50;        // Default value

p.setup = function() {
  p.createCanvas(400, 200).parent(p5Output);
  
  // Register for MIDI variable changes
  p.onVariableChange((name, value) => {
    console.log(`MIDI update: ${name} = ${value}`);
    
    // Store the values in global variables
    if (name === 'color') currentColor = value;
    if (name === 'size') currentSize = parseFloat(value) || 50;
  });
};

p.draw = function() {
  // Use the MIDI-updated variables in your draw loop
  p.background(0);
  p.fill(currentColor);
  p.ellipse(p.width/2, p.height/2, currentSize, currentSize);
};
```

### Running Your Sketch

1. Click the "Run Code" button to start your sketch
2. Manipulate your MIDI controls to see real-time changes in your sketch
3. Check the p5.js console for debug information about MIDI events

## Advanced Features

### Accessing Synthograsizer Variables

In your p5.js sketch, you can access Synthograsizer variables using:

```javascript
// Get the current value of a variable
let myVar = p.getSynthVar('variable_name');

// Check the current mode (A, B, C, or D)
let currentMode = p.getSynthMode();
```

### Handling Variable Changes

To respond to variable changes in real-time:

```javascript
p.onVariableChange((name, value) => {
  console.log(`Variable ${name} changed to:`, value);
  // Update your sketch based on the new value
});
```

### Best Practices

1. **Error Handling**: Always check if variables exist before using them
2. **Performance**: Be mindful of performance when updating complex sketches
3. **Debugging**: Use the built-in console to log variable changes and debug your sketch
