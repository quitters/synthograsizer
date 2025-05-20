# How Synthograsizer JSON with p5.js Interactivity Works

## Structure of the Template

```json
{
  "promptTemplate": "A {{color}} {{shape}} with size {{size}} and rotation {{rotation}}",
  "variables": [
    // Variable definitions with display names, template names, and values
  ],
  "p5_input": {
    "code": "// p5.js sketch code..."
  }
}
```

## Variable Connection Flow

1. **Knobs in UI** → The `variables` array creates knobs in the interface
2. **Template Names** → The `feature_name` field connects knobs to p5.js variables
3. **p5.js Access** → Code uses `p.getSynthVar('feature_name')` to read current values
4. **Real-time Updates** → Values update immediately as knobs are adjusted

## Key Interaction Patterns

```javascript
// Reading a variable
const shapeType = p.getSynthVar('shape') || 'circle';

// Mode-aware value processing
let size;
if (typeof shapeSize === 'number') {
    // Mode B: Continuous value (-1 to 2)
    size = p.map(shapeSize, -1, 2, 20, 150);
} else if (typeof shapeSize === 'string') {
    // Mode A: Discrete value from list
    size = parseInt(shapeSize) || 75;
} else {
    // Default fallback
    size = 75;
}
```

## Creating Your Own Interactive Template

### 1. Define Your Variables

```json
"variables": [
    {
        "name": "Display Name",        // Shows under knob
        "feature_name": "template_var", // Used in {{}} and getSynthVar()
        "values": ["val1", "val2", "val3"] // Discrete options
    }
]
```

### 2. Write Mode-Aware p5.js Code

```javascript
p.setup = function() {
    p.createCanvas(400, 300).parent(p5Output);
    // Setup code
};

p.draw = function() {
    // Get variable value
    const myVar = p.getSynthVar('template_var');
    
    // Handle both modes
    if (typeof myVar === 'number') {
        // Mode B: Map continuous value
        mappedValue = p.map(myVar, -1, 2, minRange, maxRange);
    } else if (typeof myVar === 'string') {
        // Mode A: Use discrete value
        // Parse or map string to usable value
    }
    
    // Use value to affect visualization
};
```

### 3. MIDI Integration (if needed)

```javascript
p.setup = function() {
    // Register for MIDI updates
    p.onVariableChange((name, value) => {
        console.log(`Variable ${name} changed to ${value}`);
        // Update global variables for use in draw()
    });
};
```

## Best Practices

1. **Always provide defaults**: `const value = p.getSynthVar('name') || defaultValue;`
2. **Type check rigorously**: Different modes return different types
3. **Map ranges appropriately**: Mode B returns -1 to 2, map to useful ranges
4. **Display mode/values**: Help users understand what's happening
5. **Comment required variables**: Document what variables your sketch needs

## The Complete Workflow

1. User adjusts knobs in Synthograsizer UI
2. Values update in real-time
3. p5.js sketch reads values via `getSynthVar()`
4. Sketch adapts visualization based on values
5. Optional: MIDI controllers can adjust knobs
6. Text prompt updates simultaneously with visuals

This creates a unified creative environment where text generation and visual output are synchronized through the same interface controls. The `color_shapes.json` example perfectly demonstrates this with its shape morphing, color changing, and rotation control all driven by the knob interface.

## Example Template Structure

Here's a complete example showing all components:

```json
{
  "promptTemplate": "A {{style}} artwork with {{complexity}} details and {{mood}} atmosphere",
  "variables": [
    {
      "name": "Art Style",
      "feature_name": "style",
      "values": ["impressionist", "abstract", "realistic", "surreal"]
    },
    {
      "name": "Complexity",
      "feature_name": "complexity",
      "values": ["minimal", "moderate", "detailed", "intricate"]
    },
    {
      "name": "Mood",
      "feature_name": "mood",
      "values": ["calm", "energetic", "mysterious", "chaotic"]
    }
  ],
  "p5_input": {
    "code": "// Your p5.js code that reads these variables\n// and creates responsive visuals"
  }
}
```
