"""Synthograsizer API Server — FastAPI endpoints for AI generation.

Routes delegate to AIManager (ai_manager.py) for Gemini/Imagen/Veo calls.
All base64 image inputs are decoded via `decode_base64_image()` and all
LLM JSON responses are parsed via `parse_llm_json()` to keep endpoint
handlers concise and consistent.
"""

import asyncio
import logging
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, Response
import httpx
from backend import config
from pydantic import BaseModel
from typing import Optional, List, Dict
import uvicorn
import os
import sys
import json
import base64
import re
import time
from pathlib import Path

# Add backend directory to path for imports
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from ai_manager import ai_manager, normalize_template
from osc_bridge import osc_bridge
from music_manager import get_music_manager

logger = logging.getLogger(__name__)

app = FastAPI(title="Synthograsizer AI Suite")


def decode_base64_image(b64_string: str) -> bytes:
    """Decode a base64 image string, stripping the data URI prefix if present.

    Handles both raw base64 ("iVBOR...") and data URIs ("data:image/png;base64,iVBOR...").
    """
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    return base64.b64decode(b64_string)


def parse_llm_json(json_str: str) -> dict:
    """Parse JSON from an LLM response, handling markdown fences.

    LLMs sometimes wrap JSON in ```json ... ``` blocks — this strips those
    before parsing. Raises Exception with a clear message on failure.
    """
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        if "```json" in json_str:
            clean = json_str.split("```json", 1)[1].split("```", 1)[0].strip()
            return json.loads(clean)
        raise Exception("Model did not return valid JSON")

# Models
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
    model: Optional[str] = "gemini-3-flash-preview"
    aspect_ratio: Optional[str] = "1:1"

class TemplateRequest(BaseModel):
    prompt: str = ""                          # Text description (Text, Hybrid, Remix, Workflow guidance)
    mode: str = "text"                        # "text" | "image" | "hybrid" | "multi-image" | "remix" | "workflow"
    images: Optional[List[str]] = None        # Base64 images (Image, Hybrid, Multi-Image, Workflow modes)
    current_template: Optional[dict] = None   # Current template JSON (Remix mode)
    workflow: Optional[dict] = None           # Workflow JSON to curate (Workflow mode)
    preview: Optional[bool] = True            # Return rationale with selections (Workflow mode)
    batch: Optional[bool] = False             # Multiple images = batch curation (Workflow mode)

class AnalyzeRequest(BaseModel):
    image: str  # Base64 encoded image
    auto_generate: Optional[bool] = False  # Auto-generate image from analysis

class BatchAnalyzeRequest(BaseModel):
    images: List[str]  # List of base64 images (no size limit)
    auto_generate: Optional[bool] = False

class TemplateFromAnalysisRequest(BaseModel):
    analysis: str

class SaveTemplateRequest(BaseModel):
    template: dict
    filename: Optional[str] = None

class MetadataRequest(BaseModel):
    image: str # Base64 encoded image

class BulkMetadataRequest(BaseModel):
    images: List[str]  # List of base64 encoded PNG images

@app.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        response = await asyncio.to_thread(ai_manager.chat, request.message, request.history, request.model)
        return {"status": "success", "response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class NarrativeRequest(BaseModel):
    descriptions: List[str]
    user_prompt: str
    mode: str = "story" # "story" or "artwork"

@app.post("/api/generate/narrative")
async def generate_narrative(request: NarrativeRequest):
    try:
        prompts = await asyncio.to_thread(ai_manager.generate_narrative, request.descriptions, request.user_prompt, request.mode)
        return {"status": "success", "prompts": prompts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class VideoVariationsRequest(BaseModel):
    description: str
    mode: str = "story"

@app.post("/api/generate/video-variations")
async def generate_video_variations(request: VideoVariationsRequest):
    try:
        variations = await asyncio.to_thread(ai_manager.generate_video_variations, request.description, request.mode)
        return {"status": "success", "variations": variations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ImageVariationPromptsRequest(BaseModel):
    user_direction: str     # User's creative direction prompt
    image_analysis: str     # Analysis text from /api/analyze/image-to-prompt

@app.post("/api/generate/image-variation-prompts")
async def generate_image_variation_prompts(request: ImageVariationPromptsRequest):
    try:
        prompts = await asyncio.to_thread(
            ai_manager.generate_image_variation_prompts,
            request.user_direction, request.image_analysis
        )
        return {"status": "success", "prompts": prompts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class CombineVideosRequest(BaseModel):
    videos: List[str]  # List of base64-encoded MP4 videos

@app.post("/api/video/combine")
async def combine_videos(request: CombineVideosRequest):
    """Concatenate multiple MP4 videos into one using FFmpeg concat demuxer."""
    import tempfile
    import subprocess
    import shutil

    if not request.videos or len(request.videos) < 2:
        raise HTTPException(status_code=400, detail="At least 2 videos required")

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise HTTPException(status_code=500, detail="FFmpeg not found on system")

    tmp_dir = tempfile.mkdtemp(prefix="svo_combine_")
    try:
        # Write each video to a temp file
        input_files = []
        for i, b64 in enumerate(request.videos):
            vid_bytes = base64.b64decode(b64)
            path = os.path.join(tmp_dir, f"part_{i}.mp4")
            with open(path, "wb") as f:
                f.write(vid_bytes)
            input_files.append(path)

        # Write concat list file
        list_path = os.path.join(tmp_dir, "concat.txt")
        with open(list_path, "w") as f:
            for p in input_files:
                # FFmpeg requires forward slashes or escaped backslashes
                f.write(f"file '{p.replace(os.sep, '/')}'\n")

        output_path = os.path.join(tmp_dir, "combined.mp4")

        # Run FFmpeg concat
        result = subprocess.run(
            [ffmpeg_path, "-y", "-f", "concat", "-safe", "0",
             "-i", list_path, "-c", "copy", output_path],
            capture_output=True, text=True, timeout=120
        )

        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr}")
            raise Exception(f"FFmpeg failed: {result.stderr[:200]}")

        # Read combined video and return as base64
        with open(output_path, "rb") as f:
            combined_b64 = base64.b64encode(f.read()).decode("utf-8")

        return {"status": "success", "video": combined_b64}

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Video combining timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video combine failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temp files
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.post("/api/config")
async def configure_api(request: ConfigRequest):
    try:
        ai_manager.configure_api(request.api_key)
        return {"status": "success", "message": "API key configured"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate/smart-transform")
async def generate_smart_transform(request: SmartTransformRequest):
    try:
        input_bytes = decode_base64_image(request.input_image)

        ref_bytes = None
        if request.reference_image:
            ref_bytes = decode_base64_image(request.reference_image)
        
        transform_result = await asyncio.to_thread(
            ai_manager.smart_transform,
            input_image_bytes=input_bytes,
            user_intent=request.user_intent,
            ref_image_bytes=ref_bytes,
            model_name=request.model,
            aspect_ratio=request.aspect_ratio
        )
        if isinstance(transform_result, dict):
            image_b64 = transform_result.get("image")
            prompt = transform_result.get("prompt")
        else:
            image_b64 = transform_result
            prompt = None

        return {"status": "success", "image": image_b64, "prompt": prompt}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate/text")
async def generate_text(request: TextRequest):
    try:
        text = await asyncio.to_thread(ai_manager.generate_text, request.prompt, request.model)
        return {"status": "success", "text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate/image")
async def generate_image(request: ImageRequest):
    try:
        # Decode input images (supports both new multi-image and old single-image params)
        decoded_images = None
        if request.input_images:
            decoded_images = [decode_base64_image(img) for img in request.input_images]
        elif request.reference_image:
            decoded_images = [decode_base64_image(request.reference_image)]

        # Call generate_image with all parameters
        
        # Override deprecated model if present
        model_name = request.model
        if model_name == "gemini-2.0-flash-exp":
            model_name = "gemini-3-flash-preview"

        result = await asyncio.to_thread(
            ai_manager.generate_image,
            prompt=request.prompt,
            model_name=model_name,
            aspect_ratio=request.aspect_ratio,
            negative_prompt=request.negative_prompt,
            input_images=decoded_images,
            response_modalities=request.response_modalities,
            thinking_level=request.thinking_level,
            include_thoughts=request.include_thoughts,
            media_resolution=request.media_resolution,
            person_generation=request.person_generation,
            safety_settings=request.safety_settings,
            image_count=request.image_count,
            add_watermark=request.add_watermark,
            use_google_search=request.use_google_search,
            temperature=request.temperature,
            top_k=request.top_k,
            top_p=request.top_p,
            tags=request.tags
        )
        
        # Handle both dict and string returns
        if isinstance(result, dict):
            return {
                "status": "success", 
                "image": result.get('image'),
                "text": result.get('text')
            }
        else:
            # Backwards compatibility: string return
            return {"status": "success", "image": result}
            
    except Exception as e:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate/video")
async def generate_video(request: VideoRequest):
    try:
        video_b64 = await ai_manager.generate_video(
            request.prompt,
            request.model,
            request.duration,
            request.aspect_ratio,
            request.end_frame_image,
            request.start_frame_image
        )
        return {"status": "success", "video": video_b64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/batch/text")
async def batch_text(request: BatchTextRequest):
    results = []
    for prompt in request.prompts:
        try:
            text = await asyncio.to_thread(ai_manager.generate_text, prompt, request.model)
            results.append({"prompt": prompt, "result": text, "status": "success"})
        except Exception as e:
            results.append({"prompt": prompt, "error": str(e), "status": "error"})
    return {"status": "success", "results": results}

@app.post("/api/generate/template")
async def generate_template(request: TemplateRequest):
    try:
        mode = request.mode

        if mode == "text":
            json_str = await asyncio.to_thread(ai_manager.generate_template, request.prompt)

        elif mode == "image":
            if not request.images or len(request.images) < 1:
                raise ValueError("Image mode requires at least one image.")
            image_bytes = decode_base64_image(request.images[0])
            analysis = await asyncio.to_thread(ai_manager.analyze_image_to_prompt, image_bytes)
            json_str = await asyncio.to_thread(ai_manager.generate_template_from_analysis, analysis)

        elif mode == "hybrid":
            if not request.images or len(request.images) < 1:
                raise ValueError("Hybrid mode requires at least one image.")
            if not request.prompt.strip():
                raise ValueError("Hybrid mode requires a text direction.")
            image_bytes = decode_base64_image(request.images[0])
            json_str = await asyncio.to_thread(ai_manager.generate_template_hybrid, image_bytes, request.prompt)

        elif mode == "multi-image":
            if not request.images or len(request.images) < 2:
                raise ValueError("Multi-Image mode requires at least 2 images.")
            decoded = [decode_base64_image(img) for img in request.images]
            json_str = await asyncio.to_thread(ai_manager.generate_template_from_images, decoded)

        elif mode == "remix":
            # Current template + instructions → evolved template
            if not request.current_template:
                raise ValueError("Remix mode requires a current template.")
            if not request.prompt.strip():
                raise ValueError("Remix mode requires instructions.")
            json_str = await asyncio.to_thread(ai_manager.remix_template, request.current_template, request.prompt)

        elif mode == "story":
            # Text prompt → Story template with acts, characters, progressions
            if not request.prompt.strip():
                raise ValueError("Story mode requires a text description of the story concept.")
            json_str = await asyncio.to_thread(ai_manager.generate_story_template, request.prompt)

        elif mode == "workflow":
            # Workflow JSON + Image(s) → Curated workflow(s) with one value per variable
            if not request.workflow:
                raise ValueError("Workflow mode requires a workflow JSON.")
            if not request.images or len(request.images) < 1:
                raise ValueError("Workflow mode requires at least one reference image.")

            guidance = request.prompt if request.prompt.strip() else None
            include_rationale = request.preview if request.preview is not None else True

            # Process each image (batch support)
            results = []
            for img_b64 in request.images:
                image_bytes = decode_base64_image(img_b64)
                result = await asyncio.to_thread(
                    ai_manager.curate_workflow,
                    request.workflow,
                    image_bytes,
                    guidance=guidance,
                    include_rationale=include_rationale
                )
                results.append(result)

            return {"status": "success", "results": results}

        else:
            raise HTTPException(status_code=400, detail=f"Unknown template generation mode: {mode}")

        # Parse LLM output (handles markdown fences) and normalize schema
        json_obj = normalize_template(parse_llm_json(json_str))
        return {"status": "success", "template": json_obj}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze/image-to-prompt")
async def analyze_image_to_prompt(request: AnalyzeRequest):
    try:
        image_bytes = decode_base64_image(request.image)
        analysis_text = await asyncio.to_thread(ai_manager.analyze_image_to_prompt, image_bytes)

        result = {
            "status": "success",
            "analysis": analysis_text
        }

        # Auto-generate if requested
        if request.auto_generate:
            # Detect aspect ratio
            width, height = ai_manager.get_image_dimensions(image_bytes)
            aspect_ratio = ai_manager.map_to_closest_aspect_ratio(width, height)

            # Generate image using analysis as prompt
            generated = await asyncio.to_thread(
                ai_manager.generate_image,
                prompt=analysis_text,
                model_name=config.MODEL_IMAGE_GEN_HQ,
                aspect_ratio=aspect_ratio
            )
            
            result["generated_image"] = generated if isinstance(generated, str) else generated.get('image')
            result["detected_aspect_ratio"] = aspect_ratio
            result["original_dimensions"] = f"{width}x{height}"
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate/template-from-analysis")
async def generate_template_from_analysis(request: TemplateFromAnalysisRequest):
    try:
        json_str = await asyncio.to_thread(ai_manager.generate_template_from_analysis, request.analysis)
        json_obj = normalize_template(parse_llm_json(json_str))
        return {"status": "success", "template": json_obj}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-template")
async def save_template(request: SaveTemplateRequest):
    """Save a JSON template to the Synthograsizer_Output/JSON/Project Templates directory."""
    try:
        # Define the target directory
        output_dir = Path(r"C:\Users\Alexander\Desktop\Synthograsizer_Output\JSON\Project Templates")
        
        # Create directory if it doesn't exist
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename if not provided
        if request.filename:
            # Clean the provided filename
            safe_filename = request.filename
            if not safe_filename.endswith('.json'):
                safe_filename += '.json'
        else:
            # Generate filename from template name or use timestamp
            template_name = request.template.get('name', 'template')
            safe_name = re.sub(r'[^a-z0-9]+', '-', template_name.lower())
            safe_name = re.sub(r'^-+|-+$', '', safe_name)
            timestamp = int(time.time() * 1000)  # milliseconds like frontend
            safe_filename = f"synthograsizer-{safe_name}-{timestamp}.json"
        
        # Ensure filename is safe for filesystem
        safe_filename = "".join(c for c in safe_filename if c.isalnum() or c in ".-_")
        
        # Full file path
        file_path = output_dir / safe_filename
        
        # Write JSON file
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(request.template, f, indent=2, ensure_ascii=False)
        
        return {
            "status": "success", 
            "message": "Template saved successfully",
            "filepath": str(file_path),
            "filename": safe_filename
        }
        
    except Exception as e:
        logger.error(f"Failed to save template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save template: {str(e)}")

@app.post("/api/analyze/batch")
async def batch_analyze(request: BatchAnalyzeRequest):
    """Process multiple images sequentially with optional auto-generation.
    
    No limit on batch size - can handle 100+ images.
    """
    async def generate_batch_stream():
        for idx, img_b64 in enumerate(request.images):
            try:
                image_bytes = decode_base64_image(img_b64)
                analysis = await asyncio.to_thread(ai_manager.analyze_image_to_prompt, image_bytes)

                result = {
                    "index": idx,
                    "status": "success",
                    "analysis": analysis
                }

                # Auto-generate if requested
                if request.auto_generate:
                    width, height = ai_manager.get_image_dimensions(image_bytes)
                    aspect_ratio = ai_manager.map_to_closest_aspect_ratio(width, height)

                    generated = await asyncio.to_thread(
                        ai_manager.generate_image,
                        prompt=analysis,
                        model_name=config.MODEL_IMAGE_GEN_HQ,
                        aspect_ratio=aspect_ratio
                    )
                    
                    result["generated_image"] = generated if isinstance(generated, str) else generated.get('image')
                    result["aspect_ratio"] = aspect_ratio
                    result["dimensions"] = f"{width}x{height}"
                
                yield json.dumps(result) + "\n"
                
            except Exception as e:
                yield json.dumps({
                    "index": idx,
                    "status": "error",
                    "error": str(e)
                }) + "\n"

    return StreamingResponse(generate_batch_stream(), media_type="application/x-ndjson")

@app.post("/api/scope/save-asset")
async def scope_save_asset(request: Request):
    """Write an image directly to Scope's local assets directory.

    Bypasses Scope's cloud-mode CDN token requirement by writing the file
    locally rather than calling Scope's /api/v1/assets endpoint.
    Returns the filename (relative to the assets dir) for use in vace_ref_images.
    """
    try:
        body = await request.json()
        image_b64 = body.get("image", "")
        filename = body.get("filename", "synth-ref.png")

        # Strip data-URL prefix
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_b64)

        scope_assets = Path.home() / ".daydream-scope" / "assets"
        scope_assets.mkdir(parents=True, exist_ok=True)

        file_path = scope_assets / filename
        file_path.write_bytes(image_bytes)
        logger.info("Saved Scope reference asset: %s (%d bytes)", file_path, len(image_bytes))

        return {"path": filename, "full_path": str(file_path)}
    except Exception as e:
        logger.error("scope_save_asset failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/extract-metadata")
async def extract_metadata(request: MetadataRequest):
    try:
        image_bytes = decode_base64_image(request.image)
        metadata = ai_manager.extract_metadata(image_bytes)
        return {"status": "success", "metadata": metadata}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/extract-metadata/bulk")
async def extract_metadata_bulk(request: BulkMetadataRequest):
    """Extract metadata from multiple PNG images in bulk.
    
    Returns a list of results with prompts extracted from each image.
    """
    results = []
    for idx, img_b64 in enumerate(request.images):
        try:
            image_bytes = decode_base64_image(img_b64)
            metadata = ai_manager.extract_metadata(image_bytes)
            
            results.append({
                "index": idx,
                "status": "success",
                "metadata": metadata,
                "prompt": metadata.get("prompt", "")
            })
            
        except Exception as e:
            results.append({
                "index": idx,
                "status": "error",
                "error": str(e),
                "prompt": ""
            })
    
    return {"status": "success", "results": results}

# Serve Static Files
# Serves the entire Synthograsizer Suite from the static/ directory
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

@app.get("/api/health")
async def health_check():
    """Test API connectivity and return diagnostic info."""
    return {
        "status": "ok",
        "api_key_configured": bool(ai_manager.api_key),
        "genai_client_available": ai_manager.genai_client is not None,
        "message": "Synthograsizer Suite API is running"
    }

# ---------- ChatRoom Reverse Proxy ----------
# Forwards /chatroom/api/* requests to the Node.js ChatRoom backend on port 3001.
# Supports both standard HTTP requests and SSE streaming for real-time chat.
CHATROOM_BACKEND = "http://localhost:3001"

@app.api_route("/chatroom/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_chatroom(request: Request, path: str):
    """Reverse proxy for ChatRoom Node.js backend."""
    url = f"{CHATROOM_BACKEND}/api/{path}"
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}

    # Handle SSE streaming (GET /chatroom/api/chat/stream)
    if request.method == "GET" and "text/event-stream" in request.headers.get("accept", ""):
        async def stream_sse():
            async with httpx.AsyncClient() as client:
                async with client.stream("GET", url, headers=headers, timeout=None) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk
        return StreamingResponse(stream_sse(), media_type="text/event-stream",
                                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    # Standard request proxy
    async with httpx.AsyncClient() as client:
        body = await request.body()
        resp = await client.request(
            method=request.method,
            url=url,
            headers=headers,
            content=body,
            params=dict(request.query_params),
            timeout=60.0,
        )
        # Filter out hop-by-hop headers
        excluded = {"transfer-encoding", "content-encoding", "content-length", "connection"}
        resp_headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
        return Response(content=resp.content, status_code=resp.status_code, headers=resp_headers)

# ── OSC Bridge Endpoints ─────────────────────────────────────────────

class OSCSendPromptRequest(BaseModel):
    prompt: str
    address: str = "/prompt"

class OSCSendParamRequest(BaseModel):
    address: str
    value: float

class OSCConfigRequest(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None

@app.post("/api/osc/send-prompt")
async def osc_send_prompt(req: OSCSendPromptRequest):
    """Forward a prompt string to Scope via OSC."""
    try:
        osc_bridge.send_prompt(req.prompt, req.address)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/osc/send-param")
async def osc_send_param(req: OSCSendParamRequest):
    """Forward a numeric parameter to Scope via OSC."""
    try:
        osc_bridge.send_float(req.address, req.value)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/osc/config")
async def osc_config(req: OSCConfigRequest):
    """Update the OSC target host/port."""
    osc_bridge.update_config(host=req.host, port=req.port)
    return osc_bridge.status()

@app.get("/api/osc/status")
async def osc_status():
    """Return current OSC target configuration."""
    return osc_bridge.status()


# ── Scope Discovery Endpoints ────────────────────────────────────────

class ScopeDiscoverRequest(BaseModel):
    scopeUrl: Optional[str] = None

@app.post("/api/scope/discover")
async def scope_discover(req: ScopeDiscoverRequest):
    """Probe Scope's health endpoint and return connection info."""
    return osc_bridge.discover_scope(req.scopeUrl)

@app.get("/api/scope/discover")
async def scope_discover_get():
    """Quick health check of Scope at the current configured URL."""
    return osc_bridge.discover_scope()


# ── Music Studio (Lyria RealTime) ───────────────────────────────────

@app.get("/api/music/status")
async def music_status():
    """Return current Lyria session status."""
    from music_manager import music_manager
    if music_manager is None:
        return {"connected": False, "playing": False, "prompts": [], "config": {}}
    return music_manager.get_status()


@app.websocket("/ws/music")
async def ws_music(websocket: WebSocket):
    """WebSocket endpoint for Lyria RealTime music streaming.

    Protocol:
      Client → Server (JSON text): control messages (play, pause, stop, set_prompts, set_config, reset_context)
      Server → Client (binary): raw 16-bit PCM audio chunks (48kHz stereo)
      Server → Client (JSON text): status updates and errors
    """
    await websocket.accept()

    if not ai_manager.genai_client:
        await websocket.send_json({"error": "API key not configured"})
        await websocket.close()
        return

    mm = get_music_manager(ai_manager.genai_client)

    try:
        # Callback that forwards data to the browser WebSocket
        async def send_to_browser(data):
            if isinstance(data, bytes):
                await websocket.send_bytes(data)
            elif isinstance(data, str):
                await websocket.send_text(data)
            else:
                await websocket.send_text(data.decode())

        # Start the Lyria session (runs in background task with async context manager)
        await mm.start(send_to_browser)

        # Listen for control messages from the browser and queue them
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await websocket.send_json({"error": "Invalid JSON"})
                    continue

                await mm.send_command(msg)

        except WebSocketDisconnect:
            logger.info("Music WebSocket client disconnected")

    except Exception as e:
        logger.error("Music WebSocket error: %s", e)
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass

    finally:
        await mm.shutdown()


if not STATIC_DIR.exists():
    print(f"WARNING: Static directory not found at {STATIC_DIR}")

# On Vercel, static files are served by the CDN via vercel.json rewrites —
# mounting them through FastAPI would conflict and is unnecessary.
if not os.environ.get("VERCEL") and STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

class _SuppressNoiseFilter(logging.Filter):
    """Drop repetitive polling endpoints from uvicorn's access log."""
    _MUTED = ("/api/scope/discover",)

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(path in msg for path in self._MUTED)

_noise_filter = _SuppressNoiseFilter()

@app.on_event("startup")
async def _install_log_filter():
    """Install after uvicorn has configured its loggers."""
    logging.getLogger("uvicorn.access").addFilter(_noise_filter)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)
