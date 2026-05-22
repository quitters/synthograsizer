import asyncio
import logging
import base64
import re
import time
import os
import io
import tempfile
import subprocess
import hashlib
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
    # p5.js sketch generation uses a longer timeout — the Pro model writes a complete,
    # self-contained sketch with lookup maps, variables, and animation logic.
    if request.mode == "p5":
        timeout = config.TEMPLATE_GEN_P5_TIMEOUT_SECONDS
    else:
        timeout = config.TEMPLATE_GEN_TIMEOUT_SECONDS

    # Demo requests are capped at MODEL_DEMO regardless of what the client sends.
    if request.is_demo:
        model_override = config.MODEL_DEMO
    else:
        # Resolve model override: Flash for speed, Pro for quality, or explicit model
        model_override = request.model
        if not model_override and request.use_flash:
            model_override = config.MODEL_TEMPLATE_GEN_FAST
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
                asyncio.to_thread(ai_manager.analyze_image_to_prompt, image_bytes, model_name=model_override),
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
            direction = request.prompt.strip() if request.prompt else None
            json_str = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.generate_template_from_images, decoded,
                                  direction=direction, model_override=model_override),
                timeout=timeout
            )

        elif mode == "remix":
            # Current template + instructions → evolved template
            if not request.current_template:
                raise ValueError("Remix mode requires a current template.")
            if not request.prompt.strip():
                raise ValueError("Remix mode requires instructions.")
            
            # Decode optional reference images for multimodal context
            ref_images = None
            if request.images:
                ref_images = [decode_base64_image(img) for img in request.images[:8]]
                
            json_str = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.remix_template, request.current_template, request.prompt, reference_images=ref_images, model_override=model_override),
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

        elif mode == "story-beat":
            # Regenerate a single beat within a bespoke-beat story template
            if not request.current_template:
                raise ValueError("story-beat mode requires a current_template (the full story template).")
            if request.target_beat_id is None:
                raise ValueError("story-beat mode requires a target_beat_id.")
            direction = request.prompt.strip() if request.prompt else None
            json_str = await asyncio.wait_for(
                asyncio.to_thread(
                    ai_manager.generate_story_beat,
                    request.current_template,
                    request.target_beat_id,
                    direction=direction,
                    model_override=model_override,
                    prev_image_b64=request.prev_image_b64,
                    next_image_b64=request.next_image_b64,
                ),
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
                        include_rationale=include_rationale,
                        model_override=model_override
                    ),
                    timeout=timeout
                )
                results.append(result)

            return {"status": "success", "results": results}

        elif mode == "p5":
            if not request.prompt.strip():
                raise ValueError("p5 mode requires a sketch description.")
            image_bytes = decode_base64_image(request.images[0]) if request.images else None
            json_str = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.generate_p5_template, request.prompt,
                                  image_bytes=image_bytes, model_override=model_override),
                timeout=timeout
            )

        elif mode == "agent_profile":
            if not request.prompt.strip():
                raise ValueError("agent_profile mode requires a description.")
            json_str = await asyncio.wait_for(
                asyncio.to_thread(
                    ai_manager.generate_agent_profile,
                    request.prompt,
                    model_override=model_override,
                    style_instruction=request.style_instruction,
                ),
                timeout=timeout
            )

        elif mode == "taste_vector":
            if not request.artifacts:
                raise ValueError("taste_vector mode requires a non-empty `artifacts` list.")
            json_str = await asyncio.wait_for(
                asyncio.to_thread(ai_manager.generate_taste_vector, request.artifacts, model_override=model_override),
                timeout=timeout
            )
            # Taste vector is not a Synthograsizer template — skip normalize_template,
            # which is shaped for {promptTemplate, variables[]}.
            return {"status": "success", "taste_vector": parse_llm_json(json_str)}

        elif mode == "taste_profile":
            if not request.images or len(request.images) < 3:
                raise ValueError("taste_profile mode requires at least 3 images.")
            if not request.quiz_answers:
                raise ValueError("taste_profile mode requires quiz_answers.")
            decoded = [decode_base64_image(img) for img in request.images]
            json_str = await asyncio.wait_for(
                asyncio.to_thread(
                    ai_manager.generate_taste_profile,
                    decoded,
                    request.quiz_answers,
                    request.corpus_text or "",
                    model_override=model_override,
                ),
                timeout=timeout
            )
            # Taste profile output is {profile, agents} — not a Synthograsizer template,
            # so skip normalize_template and return parsed JSON directly.
            return {"status": "success", "taste_profile": parse_llm_json(json_str)}

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


def _val_text(val) -> str:
    if isinstance(val, str):
        return val
    if isinstance(val, dict) and "text" in val:
        return val["text"]
    return str(val)


def _template_fingerprint(t: dict) -> str:
    payload = {
        "promptTemplate": t.get("promptTemplate", ""),
        "variables": [
            {"name": v.get("name", ""), "values": [_val_text(x) for x in v.get("values", [])]}
            for v in t.get("variables", [])
        ],
        "p5Code": bool(t.get("p5Code")),
        "steps": len(t.get("steps") or []),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:8]


def _derive_filename(template: dict, fingerprint: str) -> str:
    # Determine 1-3 word slug
    slug_source = ""
    if template.get("name"):
        slug_source = template["name"]
    else:
        for tag in template.get("tags", []):
            if isinstance(tag, dict) and tag.get("type") == "source" and tag.get("label"):
                slug_source = tag["label"]
                break
        if not slug_source:
            slug_source = template.get("promptTemplate", "template")

    # Strip template variables {{...}} before slugifying
    slug_source = re.sub(r"\{\{[^}]*\}\}", "", slug_source)
    words = re.sub(r"[^a-z0-9 ]+", " ", slug_source.lower()).split()
    # Drop leading stop words when using the promptTemplate fallback
    stop = {"a", "an", "the", "this", "is", "in", "of", "with", "for"}
    while words and words[0] in stop:
        words = words[1:]
    slug = "-".join(words[:3]).strip("-") or "template"

    # Type suffixes
    suffixes = ""
    if template.get("p5Code"):
        suffixes += "-p5"
    steps = template.get("steps") or []
    tags = template.get("tags") or []
    is_story = bool(steps) or any(
        isinstance(t, dict) and "story" in t.get("label", "").lower()
        for t in tags
    )
    if is_story:
        suffixes += "-story"

    return f"{slug}{suffixes}-{fingerprint[:6]}.json"


@router.post("/api/save-template")
async def save_template(request: SaveTemplateRequest):
    """Save a JSON template to the Synthograsizer_Output/JSON/Project Templates directory."""
    try:
        from backend import config
        # Define the target directory
        output_dir = config.OUTPUT_JSON_DIR / "Project Templates"
        
        # Create directory if it doesn't exist
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Explicit filename override (user-triggered saves)
        if request.filename:
            safe_filename = request.filename
            if not safe_filename.endswith('.json'):
                safe_filename += '.json'
            safe_filename = "".join(c for c in safe_filename if c.isalnum() or c in ".-_")
            file_path = output_dir / safe_filename
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(request.template, f, indent=2, ensure_ascii=False)
            return {"status": "success", "message": "Template saved successfully",
                    "filepath": str(file_path), "filename": safe_filename}

        # Auto-save path: derive deterministic name + deduplicate
        fingerprint = _template_fingerprint(request.template)
        safe_filename = _derive_filename(request.template, fingerprint)
        file_path = output_dir / safe_filename

        # Fast path: already saved under the derived name
        if file_path.exists():
            return {"status": "exists", "message": "Template already saved",
                    "filepath": str(file_path), "filename": safe_filename}

        # Slow path: scan for any file whose content matches (catches old timestamp-named files)
        for existing in output_dir.glob("*.json"):
            try:
                existing_data = json.loads(existing.read_text(encoding="utf-8"))
                if _template_fingerprint(existing_data) == fingerprint:
                    return {"status": "exists", "message": "Template already saved",
                            "filepath": str(existing), "filename": existing.name}
            except Exception:
                continue

        # Write new file
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(request.template, f, indent=2, ensure_ascii=False)

        return {"status": "success", "message": "Template saved successfully",
                "filepath": str(file_path), "filename": safe_filename}
        
    except Exception as e:
        logger.error(f"Failed to save template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save template: {str(e)}")


