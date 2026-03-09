import os

# ── Google GenAI Model Names ──
# Single source of truth — change model versions here, not in ai_manager.py.
MODEL_TEXT_CHAT = "gemini-3-flash-preview"
MODEL_IMAGE_GEN_FAST = "gemini-2.5-flash-image"
MODEL_IMAGE_GEN_NB2 = "gemini-3.1-flash-image-preview"
MODEL_IMAGE_GEN_HQ = "gemini-3-pro-image-preview"
MODEL_VIDEO_GEN = "veo-3.1-generate-preview"
MODEL_ANALYSIS = "gemini-3-flash-preview"

# Template generation (Pro for creative quality)
MODEL_TEMPLATE_GEN = "gemini-3.1-pro-preview"
# Lighter tasks: narrative, video variations, chat inside ai_manager
MODEL_FAST = "gemini-3-flash-preview"

# ── App Settings ──
APP_TITLE = "Synthograsizer AI Suite"
HOST = "127.0.0.1"
PORT = 8000

# ── Operational Limits ──
VIDEO_POLL_TIMEOUT_SECONDS = 300  # Max wait for video generation
MAX_BATCH_IMAGES = 200           # Safety cap for batch analysis
