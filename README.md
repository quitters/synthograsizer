# Synthograsizer Suite

A collection of creative web tools for prompt engineering, generative art, glitch effects, and audio synthesis.

## Tools

| Tool | Description | Path |
|------|-------------|------|
| **Synthograsizer** | AI-powered prompt engineering with template variables, batch generation, image/video creation (Gemini, Imagen, Veo) | `/synthograsizer/` |
| **Synthograsizer (Legacy)** | Original version with 4 operating modes, MIDI support, p5.js sketch editor, ComfyUI integration | `/legacy/` |
| **Glitcher** | Professional glitch art studio with destructive/non-destructive effects, selection system, recording | `/glitcher/` |
| **DAW** | Web-based digital audio workstation with FM synthesis, sequencers, effects | `/daw/` |
| **Metadata Manager** | Extract prompts from PNG metadata, convert to reusable templates | `/metadata-manager/` |
| **Fun Stuff** | Generative art gallery with Li'l Dudes and other experiments | `/fun-stuff/` |

## Quick Start

### Local Development

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start the server
python -m backend.server
```

Or on Windows, just run:

```bash
start.bat
```

Then visit **http://127.0.0.1:8000** in your browser.

### AI Features (Optional)

The Synthograsizer (main) page supports AI image/video generation via Google AI Studio. To enable:

1. Visit the Synthograsizer page
2. Open the AI Studio settings
3. Enter your Google AI Studio API key

The key is stored locally in `ai_studio_config.json` (excluded from git).

## Project Structure

```
synthograsizer-suite/
├── backend/           # FastAPI server + AI integration
├── static/
│   ├── index.html     # Hub page
│   ├── shared/        # Shared navbar, styles, assets
│   ├── synthograsizer/  # Main Synthograsizer
│   ├── legacy/        # Legacy Synthograsizer
│   ├── glitcher/      # Glitch Art Studio
│   ├── daw/           # Digital Audio Workstation
│   ├── fun-stuff/     # Generative Art Gallery
│   ├── metadata-manager/  # PNG Metadata Tool
│   └── about/         # About/Contact
├── requirements.txt
├── vercel.json
└── start.bat
```

## License

Licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Attribution required. Commercial use prohibited.
