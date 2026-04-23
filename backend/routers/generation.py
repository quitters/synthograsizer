import asyncio
import logging
import base64
import re
import time
import os
import io
import tempfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse, Response
import httpx
from typing import Optional, List, Dict

from backend.ai_manager import ai_manager, normalize_template
from backend.osc_bridge import osc_bridge
from backend.music_manager import get_music_manager
from backend import config
from backend.models.requests import *
from backend.helpers import decode_base64_image, parse_llm_json

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/api/generate/narrative")
async def generate_narrative(request: NarrativeRequest):
    try:
        prompts = await asyncio.to_thread(ai_manager.generate_narrative, request.descriptions, request.user_prompt, request.mode)
        return {"status": "success", "prompts": prompts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/video-variations")
async def generate_video_variations(request: VideoVariationsRequest):
    try:
        variations = await asyncio.to_thread(ai_manager.generate_video_variations, request.description, request.mode)
        return {"status": "success", "variations": variations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/image-variation-prompts")
async def generate_image_variation_prompts(request: ImageVariationPromptsRequest):
    try:
        prompts = await asyncio.to_thread(
            ai_manager.generate_image_variation_prompts,
            request.user_direction, request.image_analysis
        )
        return {"status": "success", "prompts": prompts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/api/generate/smart-transform")
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
        print(f"[smart-transform] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/text")
async def generate_text(request: TextRequest):
    try:
        text = await asyncio.to_thread(ai_manager.generate_text, request.prompt, request.model)
        return {"status": "success", "text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/text/stream")
async def generate_text_stream(request: TextRequest):
    """Stream text chunks as plain text. Client reads the response body incrementally."""
    def gen():
        for chunk in ai_manager.generate_text_stream(request.prompt, request.model):
            yield chunk
    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


@router.post("/api/generate/image")
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
        
        # Service returns either a bare base64 string (single image, no text)
        # or a dict with some combination of {image, images, text}. Surface
        # all populated keys so multi-image (Imagen) and text+image (Gemini)
        # callers both get what they asked for.
        if isinstance(result, dict):
            payload = {"status": "success"}
            for key in ("image", "images", "text"):
                value = result.get(key)
                if value is not None:
                    payload[key] = value
            return payload
        return {"status": "success", "image": result}
            
    except Exception as e:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/video")
async def generate_video(request: VideoRequest):
    try:
        result = await ai_manager.generate_video(
            request.prompt,
            request.model,
            request.duration,
            request.aspect_ratio,
            request.end_frame_image,
            request.start_frame_image,
            request.reference_images,
            request.extension_video_uri,
            request.resolution
        )
        return {"status": "success", "video": result["video_b64"], "video_uri": result.get("video_uri")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/batch/text")
async def batch_text(request: BatchTextRequest):
    results = []
    for prompt in request.prompts:
        try:
            text = await asyncio.to_thread(ai_manager.generate_text, prompt, request.model)
            results.append({"prompt": prompt, "result": text, "status": "success"})
        except Exception as e:
            results.append({"prompt": prompt, "error": str(e), "status": "error"})
    return {"status": "success", "results": results}


