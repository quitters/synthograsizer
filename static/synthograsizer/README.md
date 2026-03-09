# Synthograsizer Mini

A streamlined, single-variable-focus version of Synthograsizer with an intuitive D-pad interface.

## Overview

Synthograsizer Mini reimagines the Synthograsizer experience with a focus on simplicity and clarity:
- **Single-variable control** with D-pad navigation (↑↓ for variables, ←→ for values)
- **Unlimited variables** - supports templates with any number of variables
- **Real-time visual feedback** with color-coded output and highlighted current variable
- **P5.js sketch support** for generative art templates
- **Batch generation** for creating multiple prompt variations
- **Code mode** for advanced editing and debugging
- **Template system** with built-in templates and custom import/export

## Key Differences from Full Synthograsizer

| Feature | Full Synthograsizer | Synthograsizer Mini |
|---------|-------------------|-------------------|
| Control Method | All knobs visible | D-pad (one variable at a time) |
| Variables | 8+ simultaneous | Unlimited (sequential navigation) |
| Templates | All types | All types + P5.js sketches |
| UI Focus | Multi-variable control | Single-variable clarity |
| P5.js Support | Separate app | Integrated with code editor |
| Batch Generation | No | Yes (with variable modes) |
| Code Mode | No | Yes (template + JSON + P5 editor) |
| Size | Full page | Responsive (mobile-friendly) |
| Use Case | Complex multi-var control | Focused, intuitive editing |

## Ideal Use Cases

- **Embedded in creative tools** (Figma plugins, VSCode extensions, etc.)
- **Sidebar widgets** in content management systems
- **Popup prompts** in AI art tools
- **Discord/Slack bots** (render UI in web view)
- **Mobile apps** with webview components
- **Quick ideation tools** with minimal complexity

## Core Features

### 🎮 D-Pad Control Interface
- **↑/↓ arrows** - Navigate between variables
- **←/→ arrows** - Cycle through values for current variable
- **Large center display** - Shows current variable name and value with color coding
- **Visual indicators** - Dots show progress through variables
- **Keyboard support** - Full arrow key navigation

### 🎨 Output Display
- **Color-coded variables** - Each variable has a unique color
- **Highlighted current variable** - Sunken gray box shows which variable you're editing
- **Real-time updates** - Output regenerates as you change values
- **Copy to clipboard** - One-click copy of generated text

### 📋 Template System
- **Built-in templates** - 9 pre-loaded templates (art prompts, character design, scenes, etc.)
- **Custom import/export** - Load and save your own JSON templates
- **Unlimited variables** - No restriction on template complexity
- **P5.js support** - Face Generator template with live sketch rendering

### 🎯 Batch Generation
- **Multiple outputs** - Generate many variations at once
- **Variable modes** - Set each variable to cycle, randomize, or stay fixed
- **Tabbed interface** - Organized display of all generated prompts
- **Export options** - Save batch results as JSON or text

### 💻 Code Mode
- **Template editor** - Edit prompt template with live preview
- **Variables JSON** - View and modify variable definitions
- **P5.js code editor** - Write and run P5 sketches with variable integration
- **Current state** - Debug view of all variable values and combinations

## Project Status

✅ **Implemented and Ready** - Core functionality complete with JSON import/export for LLM integration.

## Quick Start

### Run Locally
```bash
# Serve from repository root
npx http-server -p 8000
# Navigate to http://localhost:8000/synthograsizer_mini/
```

### Basic Usage
1. **Select a template** from the Templates dropdown (or Import your own)
2. **Navigate variables** with ↑/↓ arrows or click the up/down buttons
3. **Change values** with ←/→ arrows or click the left/right buttons
4. **See real-time updates** in the Generated Output (current variable is highlighted)
5. **Copy output** with the Copy button
6. **Batch generate** multiple variations with the Prompt Batch button
7. **View/edit code** with the Code button (template, JSON, P5.js)

### Keyboard Shortcuts
- **↑/↓** - Navigate between variables
- **←/→** - Cycle values for current variable
- **R** - Randomize all variables
- **G** - Generate (refresh output)

## Architecture

```
┌─────────────────────────────────────────────────┐
│  GENERATED OUTPUT                    [Copy][Code]│
│  A detailed illustration of a winter scene      │
│  in warm golden hour lighting.                  │
│      ↑ colored    ↑ HIGHLIGHTED  ↑ colored      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                      ▲                          │
│                                                 │
│         ┌─────────────────────────┐             │
│    ◄    │   VARIABLE NAME         │    ►        │
│         │   current value         │             │
│         └─────────────────────────┘             │
│                      ▼                          │
└─────────────────────────────────────────────────┘
         ● ● ● ○ ○ (variable indicators)

[Randomize] [Generate] [Templates▼] [Batch] [Import] [Export]
```

## File Structure

```
synthograsizer_mini/
├── index.html              # Main application
├── css/
│   ├── style.css          # Main styles
│   └── code-overlay.css   # Code mode overlay styles
├── js/
│   ├── app.js             # Main application logic
│   ├── config.js          # Configuration constants
│   ├── text-renderer.js   # Output rendering
│   ├── template-loader.js # Template management
│   ├── batch-generator.js # Batch generation
│   ├── code-overlay-manager.js # Code mode
│   └── knob-controller.js # (Legacy, unused)
├── templates/             # Built-in JSON templates
│   ├── synthograsizer-prompt.json
│   ├── character-design.json
│   ├── fantasy-scene.json
│   ├── face-generator-full.json (with P5.js)
│   └── ...
└── README.md              # This file
```

## Development

### Key Modules
- **app.js** - Main `SynthograsizerSmall` class, handles all UI interactions
- **text-renderer.js** - Renders colored output with variable highlighting
- **template-loader.js** - Loads templates from files or user import
- **batch-generator.js** - Generates multiple prompt variations
- **code-overlay-manager.js** - Manages code editing overlay with P5.js support

## License

Same as main Synthograsizer project - CC BY-NC 4.0
