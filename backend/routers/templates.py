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
import json
from typing import Optional, List, Dict

from backend.ai_manager import ai_manager, normalize_template
from backend.osc_bridge import osc_bridge
from backend.music_manager import get_music_manager
from backend import config
from backend.models.requests import *
from backend.helpers import decode_base64_image, parse_llm_json

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/api/generate/template")
async def generate_template(request: TemplateRequest):
    timeout = config.TEMPLATE_GEN_TIMEOUT_SECONDS
    # Resolve model override: Flash for speed, Pro for quality
    model_override = config.MODEL_TEMPLATE_GEN_FAST if request.use_flash else None
    try:
        mode = request.mode

        if mode == "text":
            json_str = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.generate_template, request.prompt, model_override=model_override),
                timeout=timeout
            )

        elif mode == "image":
            if not request.images or len(request.images) < 1:
                raise ValueError("Image mode requires at least one image.")
            image_bytes = decode_base64_image(request.images[0])
            analysis = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.analyze_image_to_prompt, image_bytes),
                timeout=timeout
            )
            json_str = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.generate_template_from_analysis, analysis, model_override=model_override),
                timeout=timeout
            )

        elif mode == "hybrid":
            if not request.images or len(request.images) < 1:
                raise ValueError("Hybrid mode requires at least one image.")
            if not request.prompt.strip():
                raise ValueError("Hybrid mode requires a text direction.")
            image_bytes = decode_base64_image(request.images[0])
            json_str = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.generate_template_hybrid, image_bytes, request.prompt, model_override=model_override),
                timeout=timeout
            )

        elif mode == "multi-image":
            if not request.images or len(request.images) < 2:
                raise ValueError("Multi-Image mode requires at least 2 images.")
            decoded = [decode_base64_image(img) for img in request.images]
            json_str = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.generate_template_from_images, decoded, model_override=model_override),
                timeout=timeout
            )

        elif mode == "remix":
            # Current template + instructions → evolved template
            if not request.current_template:
                raise ValueError("Remix mode requires a current template.")
            if not request.prompt.strip():
                raise ValueError("Remix mode requires instructions.")
            json_str = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.remix_template, request.current_template, request.prompt, model_override=model_override),
                timeout=timeout
            )

        elif mode == "story":
            # Text prompt → Story template with acts, characters, progressions
            if not request.prompt.strip():
                raise ValueError("Story mode requires a text description of the story concept.")
            json_str = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.generate_story_template, request.prompt, model_override=model_override),
                timeout=timeout
            )

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
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        ai_manager.curate_workflow,
                        request.workflow,
                        image_bytes,
                        guidance=guidance,
                        include_rationale=include_rationale
                    ),
                    timeout=timeout
                )
                results.append(result)

            return {"status": "success", "results": results}

        else:
            raise HTTPException(status_code=400, detail=f"Unknown template generation mode: {mode}")

        # Parse LLM output (handles markdown fences) and normalize schema
        json_obj = normalize_template(parse_llm_json(json_str))
        return {"status": "success", "template": json_obj}

    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=f"Template generation timed out after {timeout}s. Try using Flash mode for faster results, or simplify your request."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/template-from-analysis")
async def generate_template_from_analysis(request: TemplateFromAnalysisRequest):
    try:
        json_str = await asyncio.to_thread(ai_manager.generate_template_from_analysis, request.analysis)
        json_obj = normalize_template(parse_llm_json(json_str))
        return {"status": "success", "template": json_obj}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/save-template")
async def save_template(request: SaveTemplateRequest):
    """Save a JSON template to the Synthograsizer_Output/JSON/Project Templates directory."""
    try:
        from backend import config
        # Define the target directory
        output_dir = config.OUTPUT_JSON_DIR / "Project Templates"
        
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


