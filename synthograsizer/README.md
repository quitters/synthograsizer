# Synthograsizer

The Synthograsizer is a versatile synthesizer and prompt template generator with multiple operational modes and a customizable interface.

## Directory Structure

```
synthograsizer/
├── assets/           # Synthograsizer-specific assets
├── css/              # Synthograsizer-specific CSS files
├── js/               # Synthograsizer-specific JavaScript files
│   └── app/          # Main application scripts
├── pages/            # HTML pages including sequencer demo
└── index.html        # Main Synthograsizer interface
```

## Key Features

- Multiple operational modes (A, B, C, D)
- Prompt template generation for AI image creation
- Interactive knob-based interface
- p5.js integration for visual feedback
- MIDI device support
- Template import/export functionality

## JavaScript Files

- `script.js` - Main Synthograsizer functionality

## Getting Started

1. Open `index.html` in your browser
2. Use the different modes to create and customize prompt templates
3. Export your templates as needed
4. Experiment with the p5.js integration for visual feedback

## Development Notes

This Synthograsizer implementation is separated from the DAW and Prompt Metadata Manager to allow independent development of each component.
