from pydantic import BaseModel
from typing import Optional, List, Dict
from backend import config

class ConfigRequest(BaseModel):
    api_key: str

class TextRequest(BaseModel):
    prompt: str
    model: str = config.MODEL_TEXT_CHAT

class ImageRequest(BaseModel):
    prompt: str
    model: str = config.MODEL_IMAGE_GEN_FAST
    aspect_ratio: str = "1:1"
    negative_prompt: Optional[str] = None
    reference_image: Optional[str] = None  # Kept for backwards compatibility
    input_images: Optional[List[str]] = None  # List of base64 images (new)
    response_modalities: Optional[List[str]] = None  # e.g., ["Image"], ["Text", "Image"]
    thinking_level: Optional[str] = None  # "low", "high" for Gemini 3 models
    include_thoughts: Optional[bool] = False # Return internal monologue
    media_resolution: Optional[str] = None  # "media_resolution_low/medium/high"
    person_generation: Optional[str] = None # "allow_adult", "allow_all", "dont_allow"
    safety_settings: Optional[List[Dict[str, str]]] = None # List of {category, threshold}
    image_count: Optional[int] = 1
    add_watermark: Optional[bool] = True
    use_google_search: Optional[bool] = False
    # Sampling controls
    temperature: Optional[float] = None      # 0.0-2.0, higher = more creative
    top_k: Optional[int] = None              # 1-100, limits token selection pool
    top_p: Optional[float] = None            # 0.0-1.0, nucleus sampling
    # Provenance tags to embed in PNG metadata
    tags: Optional[List[Dict]] = None

class VideoRequest(BaseModel):
    prompt: str
    model: str = config.MODEL_VIDEO_GEN
    duration: Optional[int] = None
    aspect_ratio: Optional[str] = None
    end_frame_image: Optional[str] = None
    start_frame_image: Optional[str] = None
    resolution: Optional[str] = None               # "720p" | "1080p" | "4k" (4k: Veo 3.1 only; 1080p/4k require 8s)
    reference_images: Optional[List[str]] = None   # Up to 3 base64 images (Veo 3.1 full/fast only)
    extension_video_uri: Optional[str] = None      # URI of a prior Veo generation to extend (Veo 3.1 full/fast only)

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = None
    model: str = config.MODEL_TEXT_CHAT

class BatchTextRequest(BaseModel):
    prompts: List[str]
    model: str = config.MODEL_TEXT_CHAT

class SmartTransformRequest(BaseModel):
    user_intent: str
    input_image: str
    reference_image: Optional[str] = None
    model: Optional[str] = config.MODEL_IMAGE_GEN_NB2  # must be an image-capable model
    aspect_ratio: Optional[str] = "1:1"

class TemplateRequest(BaseModel):
    prompt: str = ""                          # Text description (Text, Hybrid, Remix, Workflow guidance)
    mode: str = "text"                        # "text" | "image" | "hybrid" | "multi-image" | "remix" | "workflow" | "story-beat"
    images: Optional[List[str]] = None        # Base64 images (Image, Hybrid, Multi-Image, Workflow modes)
    current_template: Optional[dict] = None   # Current template JSON (Remix / story-beat mode)
    workflow: Optional[dict] = None           # Workflow JSON to curate (Workflow mode)
    preview: Optional[bool] = True            # Return rationale with selections (Workflow mode)
    batch: Optional[bool] = False             # Multiple images = batch curation (Workflow mode)
    use_flash: Optional[bool] = False         # Use Flash model for faster (lower quality) generation
    model: Optional[str] = None               # Override model selection
    target_beat_id: Optional[int] = None      # Beat ID for story-beat mode (per-beat regeneration)

class AnalyzeRequest(BaseModel):
    image: str  # Base64 encoded image
    auto_generate: Optional[bool] = False  # Auto-generate image from analysis
    model: Optional[str] = config.MODEL_ANALYSIS_QUICK

class BatchAnalyzeRequest(BaseModel):
    images: List[str]  # List of base64 images (no size limit)
    auto_generate: Optional[bool] = False
    model: Optional[str] = config.MODEL_ANALYSIS_QUICK

class TemplateFromAnalysisRequest(BaseModel):
    analysis: str

class SaveTemplateRequest(BaseModel):
    template: dict
    filename: Optional[str] = None

class MetadataRequest(BaseModel):
    image: str # Base64 encoded image

class BulkMetadataRequest(BaseModel):
    images: List[str]  # List of base64 encoded PNG images

class NarrativeRequest(BaseModel):
    descriptions: List[str]
    user_prompt: str
    mode: str = "story" # "story" or "artwork"

class VideoVariationsRequest(BaseModel):
    description: str
    mode: str = "story"

class ImageVariationPromptsRequest(BaseModel):
    user_direction: str     # User's creative direction prompt
    image_analysis: str     # Analysis text from /api/analyze/image-to-prompt

class CombineVideosRequest(BaseModel):
    videos: List[str]  # List of base64-encoded MP4 videos

class OSCSendPromptRequest(BaseModel):
    prompt: str
    address: str = "/prompt"

class OSCSendParamRequest(BaseModel):
    address: str
    value: float

class OSCConfigRequest(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None

class ScopeDiscoverRequest(BaseModel):
    scopeUrl: Optional[str] = None
