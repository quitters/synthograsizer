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

@router.post("/api/analyze/image-to-prompt")
async def analyze_image_to_prompt(request: AnalyzeRequest):
    try:
        image_bytes = decode_base64_image(request.image)
        analysis_text = await asyncio.to_thread(ai_manager.analyze_image_to_prompt, image_bytes, model_name=request.model)

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


@router.post("/api/analyze/batch")
async def batch_analyze(request: BatchAnalyzeRequest):
    """Process multiple images sequentially with optional auto-generation.
    
    No limit on batch size - can handle 100+ images.
    """
    async def generate_batch_stream():
        for idx, img_b64 in enumerate(request.images):
            try:
                image_bytes = decode_base64_image(img_b64)
                analysis = await asyncio.to_thread(ai_manager.analyze_image_to_prompt, image_bytes, model_name=request.model)

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


