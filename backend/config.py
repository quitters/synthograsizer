import os
import json
from pathlib import Path

def load_env_file(filepath: Path = Path(".env")):
    """Pure-stdlib .env file loader."""
    if not filepath.exists():
        return
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("\"'")
                if key not in os.environ:
                    os.environ[key] = val

# Load .env at startup
load_env_file()

def get_api_key() -> str | None:
    """Load API key from env var, or fallback to legacy ai_studio_config.json."""
    key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if key:
        return key
        
    legacy_config = Path("ai_studio_config.json")
    if legacy_config.exists():
        try:
            with open(legacy_config, "r") as f:
                saved = json.load(f)
                return saved.get("api_key")
        except Exception:
            pass
    return None

# ── Google GenAI Model Names ──
# Single source of truth — change model versions here, not in ai_manager.py.
MODEL_TEXT_CHAT = "gemini-3.1-pro-preview"
MODEL_IMAGE_GEN_FAST = "gemini-2.5-flash-image"
MODEL_IMAGE_GEN_NB2 = "gemini-3.1-flash-image-preview"
MODEL_IMAGE_GEN_HQ = "gemini-3-pro-image-preview"
MODEL_VIDEO_GEN = "veo-3.1-generate-preview"
MODEL_MUSIC_REALTIME = "models/lyria-realtime-exp"
MODEL_ANALYSIS = "gemini-3.1-pro-preview"

# Template generation (Pro for creative quality)
MODEL_TEMPLATE_GEN = "gemini-3.1-pro-preview"
# Fast alternative for template generation (lower quality, much faster)
MODEL_TEMPLATE_GEN_FAST = "gemini-3-flash-preview"
# Lighter tasks: narrative, video variations, chat inside ai_manager
MODEL_FAST = "gemini-3-flash-preview"

# Registry for UI consumption
GEMINI_MODELS = {
    "gemini-3-flash-preview": {
        "name": "Gemini 3 Flash",
        "description": "Fast and efficient for most tasks",
        "capability": "Vision, Audio, 1M Context"
    },
    "gemini-3.1-pro-preview": {
        "name": "Gemini 3.1 Pro",
        "description": "Best quality for reasoning and complex analysis",
        "capability": "Advanced Reasoning, 2M Context"
    },
    "gemini-3.1-flash-lite-preview": {
        "name": "Gemini 3.1 Flash Lite",
        "description": "Ultra-fast, optimized for simple tasks",
        "capability": "Efficiency"
    }
}

# Missing aliases
MODEL_ANALYSIS_QUICK = MODEL_FAST
MODEL_NARRATIVE = MODEL_FAST
MODEL_SMART_TRANSFORM_PROMPT = MODEL_FAST
MODEL_CURATION = MODEL_FAST

# ── App Settings ──
APP_TITLE = "Synthograsizer AI Suite"
HOST = "127.0.0.1"
PORT = 8000

# ── Output Paths ──
OUTPUT_BASE_DIR = Path(
    os.environ.get("SYNTHOGRASIZER_OUTPUT_DIR",
                   str(Path.home() / "Desktop" / "Synthograsizer_Output"))
)
OUTPUT_IMAGES_DIR = OUTPUT_BASE_DIR / "Images"
OUTPUT_VIDEOS_DIR = OUTPUT_BASE_DIR / "Videos"
OUTPUT_JSON_DIR = OUTPUT_BASE_DIR / "JSON"

# ── Operational Limits ──
VIDEO_POLL_TIMEOUT_SECONDS = 300  # Max wait for video generation
MAX_BATCH_IMAGES = 200           # Safety cap for batch analysis
TEMPLATE_GEN_TIMEOUT_SECONDS = 180  # Max wait for LLM template generation
