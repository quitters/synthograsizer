# Synthograsizer-ComfyUI Integration

This integration enables real-time prompt updates from Synthograsizer to ComfyUI text nodes without triggering image generation.

## Features

- **Real-time Updates**: Prompts update in ComfyUI as you adjust variables in Synthograsizer
- **No Generation Trigger**: Text updates don't trigger workflow execution
- **WebSocket Communication**: Fast, efficient updates using ComfyUI's WebSocket API
- **Multiple Text Nodes**: Support for both positive and negative prompt updates
- **Mode D Integration**: Seamlessly works with p5.js sketches and MIDI controllers

## Installation

### 1. Install ComfyUI Custom Nodes

1. Copy the `synthograsizer-bridge` folder to your ComfyUI `custom_nodes` directory:
   ```
   ComfyUI/custom_nodes/synthograsizer-bridge/
   ```

2. Restart ComfyUI to load the new nodes

### 2. Enable ComfyUI CORS (if needed)

If accessing ComfyUI from a different origin, start ComfyUI with:
```bash
python main.py --listen 0.0.0.0 --enable-cors-header
```

## Usage

### In ComfyUI

1. Add a **"Synthograsizer Text Receiver"** node to your workflow
2. Connect it to your prompt input (e.g., CLIP Text Encode)
3. Note the node ID (shown in the node's title bar, e.g., "6")
4. Save your workflow

### In Synthograsizer

1. Switch to **Mode D** (P5.js Mode)
2. The ComfyUI Integration panel will appear automatically
3. Enter your ComfyUI URL (default: `http://localhost:8188`)
4. Enter the node ID from your ComfyUI workflow
5. Click "Connect"

## Workflow Example

```
[Synthograsizer Text Receiver] --> [CLIP Text Encode] --> [KSampler] --> etc.
```

The text receiver node will update in real-time as you:
- Adjust knobs in Synthograsizer
- Use MIDI controllers
- Edit the prompt template
- Run p5.js sketches that modify variables

## Advanced Features

### Multiple Text Nodes

You can update multiple text nodes simultaneously:
- Positive prompt node
- Negative prompt node
- Style prompt node
- etc.

### Update Modes

- **Real-time**: Updates as you change variables
- **Manual**: Updates only when you click "Send Current Prompt"

### API Endpoints

The integration creates these endpoints in ComfyUI:

- `POST /synthograsizer/update_text` - Update text in a node
- `GET /synthograsizer/nodes` - List active text receiver nodes

## Troubleshooting

### Connection Issues

1. Ensure ComfyUI is running
2. Check the URL is correct (include http://)
3. Verify CORS is enabled if needed
4. Check browser console for errors

### Text Not Updating

1. Verify the node ID is correct
2. Ensure the node is a "Synthograsizer Text Receiver"
3. Check the connection status indicator
4. Try manual update mode first

### Performance

- Adjust throttle time in the integration settings
- Use manual mode for complex workflows
- Consider network latency if ComfyUI is remote

## Technical Details

The integration uses:
- WebSocket for real-time communication
- REST API for fallback updates
- Custom ComfyUI nodes that don't trigger execution
- Event listeners for Synthograsizer variable changes

## Examples

### Basic Setup

```javascript
// In Synthograsizer Mode D
const comfyIntegration = new SynthograsizerComfyUIIntegration({
    comfyUrl: 'http://localhost:8188',
    textNodeId: '6',
    updateMode: 'realtime',
    throttleMs: 100
});
```

### With Negative Prompt

```javascript
const comfyIntegration = new SynthograsizerComfyUIIntegration({
    comfyUrl: 'http://localhost:8188',
    textNodeId: '6',
    negativeTextNodeId: '7',
    includeNegativePrompt: true
});
```

## License

This integration is part of the Synthograsizer project and follows the same license terms.
