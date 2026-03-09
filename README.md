# Synthograsizer Suite

A collection of creative browser-based tools for prompt engineering, generative art, glitch effects, and AI-assisted image/video generation.

---

## Tools

| Tool | Description | Path |
|------|-------------|------|
| **Synthograsizer** | Knob-based prompt template engine with batch generation, AI image/video (Gemini, Imagen, Veo) | `/synthograsizer/` |
| **PromptCraft Sequencer** | VST-inspired step sequencer for prompts — sequence variables across 16 steps, glitch engine, lock/unlock variables | `/promptcraft/` |
| **Glitcher** | Professional glitch art studio — destructive & non-destructive effects, selection system, recording | `/glitcher/` |
| **ChatRoom** | Multi-agent AI chat with customizable agent personas, memory, image generation (requires local server) | `/chatroom/` |
| **DAW** | Web-based digital audio workstation — FM synthesis, step sequencers, effects | `/daw/` |
| **Metadata Manager** | Extract prompts from PNG metadata, convert to reusable Synthograsizer templates | `/metadata-manager/` |
| **Legacy Synthograsizer** | Original version — 4 operating modes, MIDI support, p5.js sketch editor, ComfyUI bridge | `/legacy/` |
| **Fun Stuff** | Generative art gallery and character creator experiments | `/fun-stuff/` |

---

## Deployment

### Option A — Vercel (recommended for static tools)

The static tools (Synthograsizer, PromptCraft, Glitcher, DAW, etc.) deploy instantly to Vercel. The AI generation API also works via Vercel serverless functions.

**What works on Vercel:**
- ✅ All static tools (Synthograsizer, PromptCraft, Glitcher, DAW, Metadata Manager, Legacy, Fun Stuff)
- ✅ Template generation (`TEMPLATE GEN` button)
- ✅ AI text generation
- ✅ Image generation (Gemini / Imagen)
- ⚠️ Batch operations (may hit 60s serverless timeout on large batches)

**What requires the local server:**
- ❌ Video generation (FFmpeg + long execution time)
- ❌ ChatRoom (needs the Node.js backend on port 3001)
- ❌ Real-time batch streaming

**Deploy to Vercel:**

1. Fork or connect this repo in your [Vercel dashboard](https://vercel.com)
2. Add your Google AI Studio API key as an environment variable:
   - Name: `GOOGLE_API_KEY`
   - Value: your key from [aistudio.google.com](https://aistudio.google.com)
3. Deploy — no build step needed

---

### Option B — Local Server (full features)

Runs the full FastAPI backend with all features including video generation and ChatRoom.

**Requirements:** Python 3.10+, pip

```bash
# Clone the repo
git clone https://github.com/quitters/synthograsizer.git
cd synthograsizer

# Install Python dependencies
pip install -r requirements.txt

# Start the server
python -m backend.server
```

Or on Windows, double-click / run:
```
start.bat
```

Then open **http://127.0.0.1:8000** in your browser.

**Configure your API key (local):**

Option 1 — via environment variable:
```bash
set GOOGLE_API_KEY=your_key_here   # Windows
export GOOGLE_API_KEY=your_key_here  # macOS/Linux
python -m backend.server
```

Option 2 — via the UI:
Open the Synthograsizer page → AI Studio settings → enter your key. It saves to `ai_studio_config.json` (gitignored).

---

### ChatRoom (local only)

ChatRoom requires its own Node.js backend in addition to the Python server:

```bash
# Terminal 1 — Python API server
python -m backend.server

# Terminal 2 — ChatRoom Node.js server
cd chatroom
npm install
npm start
```

Or use the provided batch scripts:
```
chatroom/start.bat           # starts both servers
chatroom/start-server-only.bat
chatroom/start-client-only.bat
```

---

## Project Structure

```
synthograsizer-suite/
│
├── backend/                    # Python FastAPI server + AI integration
│   ├── server.py               #   API endpoints (image, video, template gen, chat)
│   ├── ai_manager.py           #   Google GenAI client (Gemini, Imagen, Veo)
│   └── config.py               #   Model names and app settings
│
├── static/                     # All browser-based tools (served as web root)
│   ├── index.html              #   Hub / navigation page
│   ├── shared/                 #   Shared navbar, base CSS, favicon
│   ├── synthograsizer/         #   Main Synthograsizer app
│   ├── promptcraft/            #   PromptCraft Sequencer
│   ├── glitcher/               #   Glitch Art Studio
│   ├── daw/                    #   Digital Audio Workstation
│   ├── metadata-manager/       #   PNG Metadata extractor
│   ├── legacy/                 #   Original Synthograsizer + ComfyUI bridge
│   ├── chatroom/               #   ChatRoom frontend (built)
│   ├── fun-stuff/              #   Character creator, generative art
│   └── about/                  #   About page
│
├── chatroom/                   # ChatRoom Node.js backend + React frontend source
│   ├── server/                 #   Express + SSE + Gemini orchestration
│   └── client/                 #   React frontend (Vite)
│
├── docs/                       # Reference documentation
│   └── scope/                  #   Daydream Scope API reference mirror
│
├── requirements.txt            # Python dependencies
├── vercel.json                 # Vercel deployment config
└── start.bat                   # Windows quick-start (local server)
```

---

## Template Format

Synthograsizer and PromptCraft share a common JSON template format, making templates portable between tools:

```json
{
  "promptTemplate": "A {{style}} {{subject}} with {{lighting}} lighting",
  "variables": [
    {
      "name": "style",
      "feature_name": "Art Style",
      "values": [
        { "text": "cyberpunk", "weight": 1 },
        { "text": "art nouveau", "weight": 1 }
      ]
    }
  ]
}
```

PromptCraft extends this with an optional `_promptcraft` block for sequencer state (BPM, step pattern, weights).

Exports from **Synthograsizer Mini** are also supported — PromptCraft automatically converts the mini export format on import.

---

## License

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — Attribution required. Non-commercial use only.
