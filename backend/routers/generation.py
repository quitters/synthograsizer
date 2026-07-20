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
from backend.helpers import decode_base64_image, parse_llm_json, SafetyBlockedError, safety_block_detail
from backend.service import is_free_tier, service_mode
from backend.service.credits import Charge, charged

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/api/generate/narrative")
async def generate_narrative(request: NarrativeRequest, http_request: Request):
    try:
        async with charged(http_request, action="text", model=config.MODEL_FAST,
                           prompt_chars=len(request.user_prompt)) as ch:
            prompts = await asyncio.to_thread(ai_manager.generate_narrative, request.descriptions, request.user_prompt, request.mode)
            ch.commit()
        return {"status": "success", "prompts": prompts}
    except SafetyBlockedError as e:
        raise HTTPException(status_code=422, detail=safety_block_detail(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/video-variations")
async def generate_video_variations(request: VideoVariationsRequest, http_request: Request):
    try:
        async with charged(http_request, action="text", model=config.MODEL_FAST,
                           prompt_chars=len(request.description)) as ch:
            variations = await asyncio.to_thread(ai_manager.generate_video_variations, request.description, request.mode)
            ch.commit()
        return {"status": "success", "variations": variations}
    except SafetyBlockedError as e:
        raise HTTPException(status_code=422, detail=safety_block_detail(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/image-variation-prompts")
async def generate_image_variation_prompts(request: ImageVariationPromptsRequest, http_request: Request):
    try:
        async with charged(http_request, action="text", model=config.MODEL_FAST,
                           prompt_chars=len(request.user_direction)) as ch:
            prompts = await asyncio.to_thread(
                ai_manager.generate_image_variation_prompts,
                request.user_direction, request.image_analysis
            )
            ch.commit()
        return {"status": "success", "prompts": prompts}
    except SafetyBlockedError as e:
        raise HTTPException(status_code=422, detail=safety_block_detail(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/api/generate/smart-transform")
async def generate_smart_transform(request: SmartTransformRequest, http_request: Request):
    try:
        input_bytes = decode_base64_image(request.input_image)

        ref_bytes = None
        if request.reference_image:
            ref_bytes = decode_base64_image(request.reference_image)

        async with charged(http_request, action="smart_transform",
                           model=request.model or config.MODEL_IMAGE_GEN_NB2,
                           prompt_chars=len(request.user_intent)) as ch:
            transform_result = await asyncio.to_thread(
                ai_manager.smart_transform,
                input_image_bytes=input_bytes,
                user_intent=request.user_intent,
                ref_image_bytes=ref_bytes,
                model_name=request.model,
                aspect_ratio=request.aspect_ratio
            )
            ch.commit()
        if isinstance(transform_result, dict):
            image_b64 = transform_result.get("image")
            prompt = transform_result.get("prompt")
        else:
            image_b64 = transform_result
            prompt = None

        return {"status": "success", "image": image_b64, "prompt": prompt, "generation_id": ch.gen_id}
    except SafetyBlockedError as e:
        raise HTTPException(status_code=422, detail=safety_block_detail(e))
    except HTTPException:
        raise
    except Exception as e:
        print(f"[smart-transform] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/text")
async def generate_text(request: TextRequest, http_request: Request):
    try:
        async with charged(http_request, action="text", model=request.model,
                           prompt_chars=len(request.prompt)) as ch:
            text = await asyncio.to_thread(ai_manager.generate_text, request.prompt, request.model)
            ch.commit()
        return {"status": "success", "text": text}
    except SafetyBlockedError as e:
        raise HTTPException(status_code=422, detail=safety_block_detail(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/text/stream")
async def generate_text_stream(request: TextRequest, http_request: Request):
    """Stream text chunks as plain text. Client reads the response body incrementally.

    Metering: the reserve happens before the response starts (so 400/402
    surface as real statuses); the charge is kept once the first chunk is
    produced. A failure before any output refunds; a mid-stream failure keeps
    the charge (spend happened upstream) and is recorded on the generation row.
    """
    ch = Charge(http_request, action="text", model=request.model,
                prompt_chars=len(request.prompt))
    await ch.reserve()  # raises 400/402 before the stream opens

    _DONE = object()

    async def gen():
        produced = False
        try:
            it = ai_manager.generate_text_stream(request.prompt, request.model)
            while True:
                chunk = await asyncio.to_thread(next, it, _DONE)
                if chunk is _DONE:
                    break
                produced = True
                yield chunk
            await ch.settle_ok()
        except Exception as exc:
            logger.warning("text stream failed (produced=%s): %s", produced, exc)
            if produced:
                await ch.settle_ok(error="stream_interrupted")
            else:
                await ch.settle_refund(error=type(exc).__name__)
    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


@router.post("/api/generate/image")
async def generate_image(request: ImageRequest, http_request: Request):
    try:
        # Decode input images (supports both new multi-image and old single-image params)
        decoded_images = None
        if request.input_images:
            decoded_images = [decode_base64_image(img) for img in request.input_images]
        elif request.reference_image:
            decoded_images = [decode_base64_image(request.reference_image)]

        # Call generate_image with all parameters

        # Demo requests are capped at MODEL_DEMO regardless of what the client
        # sends — locally. In service mode the client-supplied flag means
        # nothing: tier comes from the session, models from the allowlist.
        if request.is_demo and not service_mode():
            model_name = config.MODEL_DEMO
        else:
            model_name = request.model
            # Override deprecated model if present
            if model_name == "gemini-2.0-flash-exp":
                model_name = "gemini-3-flash-preview"

        if is_free_tier(http_request):
            request.image_count = min(max(1, request.image_count or 1), 4)
            request.use_google_search = False       # grounded gen is operator-cost amplification
            request.add_watermark = True            # SynthID stays on for free-tier output
            if request.person_generation == "allow_all":
                request.person_generation = "allow_adult"

        async with charged(http_request, action="image", model=model_name,
                           units=max(1, request.image_count or 1),
                           prompt_chars=len(request.prompt)) as ch:
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
            ch.commit()


        # Service returns either a bare base64 string (single image, no text)
        # or a dict with some combination of {image, images, text}. Surface
        # all populated keys so multi-image (Imagen) and text+image (Gemini)
        # callers both get what they asked for. generation_id lets the client
        # bind a later "save to my creations" call to this call, whichever of
        # possibly several images it saves — see routers/artifacts.py.
        if isinstance(result, dict):
            payload = {"status": "success", "generation_id": ch.gen_id}
            for key in ("image", "images", "text"):
                value = result.get(key)
                if value is not None:
                    payload[key] = value
            return payload
        return {"status": "success", "image": result, "generation_id": ch.gen_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/video")
async def generate_video(request: VideoRequest, http_request: Request):
    # Veo is not part of the free tier: service mode admits admins only.
    # (Anonymous callers were already stopped by the enforcement middleware.)
    from backend.service import service_mode
    if service_mode() and getattr(http_request.state, "tier", None) != "admin":
        raise HTTPException(status_code=403, detail={
            "error": "tier_video",
            "message": "Video generation is not included in the free tier.",
        })
    try:
        async with charged(http_request, action="video", model=request.model,
                           units=request.duration or 8,
                           prompt_chars=len(request.prompt)) as ch:
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
            ch.commit()
        return {"status": "success", "video": result["video_b64"], "video_uri": result.get("video_uri"),
                "generation_id": ch.gen_id}
    except SafetyBlockedError as e:
        raise HTTPException(status_code=422, detail=safety_block_detail(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/batch/text")
async def batch_text(request: BatchTextRequest, http_request: Request):
    prompts = request.prompts[:20] if is_free_tier(http_request) else request.prompts
    results = []
    for prompt in prompts:
        try:
            async with charged(http_request, action="text", model=request.model,
                               prompt_chars=len(prompt)) as ch:
                text = await asyncio.to_thread(ai_manager.generate_text, prompt, request.model)
                ch.commit()
            results.append({"prompt": prompt, "result": text, "status": "success"})
        except HTTPException as e:
            detail = e.detail if isinstance(e.detail, dict) else {}
            if detail.get("error") == "out_of_credits":
                results.append({"prompt": prompt, "error": "out_of_credits", "status": "error"})
                break  # no point burning through the rest of the batch
            results.append({"prompt": prompt, "error": str(e.detail), "status": "error"})
        except Exception as e:
            results.append({"prompt": prompt, "error": str(e), "status": "error"})
    return {"status": "success", "results": results}


