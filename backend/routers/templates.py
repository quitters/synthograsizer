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
from backend.helpers import decode_base64_image, parse_llm_json, SafetyBlockedError, safety_block_detail
from backend.service import is_free_tier, service_mode
from backend.service.credits import charged

router = APIRouter()
logger = logging.getLogger(__name__)

def _sanitize_name(raw: str) -> Optional[str]:
    """First line of the model's reply, stripped to a 1-2 word Title-Case label."""
    if not raw:
        return None
    line = raw.strip().splitlines()[0] if raw.strip() else ""
    line = re.sub(r'[`"*_#<>\[\]\(\)]', "", line).strip().strip(".").strip()
    name = " ".join(line.split()[:2])[:24].strip()
    return name or None


def _name_template(template: dict) -> Optional[str]:
    """One cheap Flash call → a snappy 1-2 word theme name for the saved-
    workflow gallery. Synchronous (runs in a thread); see _safe_name_template."""
    prompt_t = (template.get("promptTemplate") or "").strip()
    var_names = [v.get("name", "") for v in (template.get("variables") or [])
                 if isinstance(v, dict) and v.get("name")]
    if not prompt_t and not var_names:
        return None
    ask = (
        "Give a snappy 1-2 word name for the THEME of this generative-art prompt "
        "template, for a user's saved-workflow library. Reply with ONLY the name "
        "— no quotes, no punctuation, Title Case.\n\n"
        f"Prompt template: {prompt_t[:400]}\n"
        f"Variables: {', '.join(var_names[:12])}"
    )
    return _sanitize_name(ai_manager.generate_text(ask, model_name=config.MODEL_FAST))


async def _safe_name_template(template: dict) -> Optional[str]:
    """Best-effort wrapper: naming must never fail or noticeably slow a
    generation that already succeeded, so any error/timeout just yields None
    and the client falls back to letting the user name it."""
    try:
        return await asyncio.wait_for(asyncio.to_thread(_name_template, template), timeout=15)
    except Exception:
        logger.info("template auto-naming skipped (non-fatal)", exc_info=True)
        return None


@router.post("/api/generate/template")
async def generate_template(request: TemplateRequest, http_request: Request):
    """Charged wrapper around the mode dispatch below.

    Pricing mirrors the impl's model resolution (Pro unless demo/flash/explicit)
    plus one credit per analyzed input image; the impl itself is unchanged.

    Surfaces ``generation_id`` (the charged generations row) so the client can
    bind a later "save this template to My creations" call to it — the artifacts
    save endpoint requires an owned generation_id of a compatible action. Also
    attaches a ``template_name`` (service mode only, so a local install pays no
    extra call) for the gallery label.
    """
    if request.is_demo and not service_mode():
        priced_model = config.MODEL_DEMO
    else:
        priced_model = request.model or (
            config.MODEL_TEMPLATE_GEN_FAST if request.use_flash else config.MODEL_TEMPLATE_GEN
        )
    if is_free_tier(http_request) and request.images and len(request.images) > 8:
        request.images = request.images[:8]
    n_images = min(len(request.images or []), 8)
    async with charged(http_request, action="template", model=priced_model,
                       units=n_images, prompt_chars=len(request.prompt or "")) as ch:
        result = await _generate_template_impl(request)
        ch.commit()
        gen_id = ch.gen_id

    if isinstance(result, dict):
        if gen_id is not None:
            result.setdefault("generation_id", gen_id)
        tpl = result.get("template")
        # Name real Synthograsizer templates only (not p5_edit/workflow/taste
        # payloads), and only in service mode where the gallery uses the label.
        if service_mode() and isinstance(tpl, dict):
            name = await _safe_name_template(tpl)
            if name:
                result["template_name"] = name
    return result


async def _generate_template_impl(request: TemplateRequest):
    # p5.js sketch generation uses a longer timeout — the Pro model writes a complete,
    # self-contained sketch with lookup maps, variables, and animation logic.
    if request.mode == "p5":
        timeout = config.TEMPLATE_GEN_P5_TIMEOUT_SECONDS
    else:
        timeout = config.TEMPLATE_GEN_TIMEOUT_SECONDS

    # Demo requests are capped at MODEL_DEMO regardless of what the client
    # sends (local only — in service mode the flag is inert; tier and pricing
    # come from the session).
    if request.is_demo and not service_mode():
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

        elif mode == "p5_edit":
            # Sketch-only edit: returns raw JS, NOT a full template JSON. The
            # caller merges the result back into the loaded template, leaving
            # promptTemplate and variables untouched. Faster than full remix
            # because the model only emits the (typically much smaller) sketch
            # delta and no JSON envelope.
            tpl = request.current_template or {}
            existing_code = (tpl.get("p5Code") or "").strip()
            if not existing_code:
                raise ValueError("p5_edit mode requires a current_template with a non-empty p5Code.")
            if not request.prompt.strip():
                raise ValueError("p5_edit mode requires instructions.")
            ref_images = None
            if request.images:
                ref_images = [decode_base64_image(img) for img in request.images[:8]]
            variables = tpl.get("variables") if isinstance(tpl.get("variables"), list) else None
            new_code = await asyncio.wait_for(
                asyncio.to_thread(
                    ai_manager.edit_p5_sketch,
                    existing_code,
                    request.prompt,
                    variables=variables,
                    reference_images=ref_images,
                    model_override=model_override,
                ),
                timeout=timeout,
            )
            # Detect the scope-guard escape hatch
            requires_full_remix = new_code.lstrip().startswith("// REQUIRES_FULL_REMIX")
            return {
                "status": "success",
                "mode": "p5_edit",
                "p5_code": new_code,
                "requires_full_remix": requires_full_remix,
            }

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
    except SafetyBlockedError as e:
        raise HTTPException(status_code=422, detail=safety_block_detail(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/template-from-analysis")
async def generate_template_from_analysis(request: TemplateFromAnalysisRequest, http_request: Request):
    try:
        async with charged(http_request, action="template", model=config.MODEL_TEMPLATE_GEN,
                           prompt_chars=len(request.analysis)) as ch:
            json_str = await asyncio.to_thread(ai_manager.generate_template_from_analysis, request.analysis)
            ch.commit()
        json_obj = normalize_template(parse_llm_json(json_str))
        return {"status": "success", "template": json_obj}
    except SafetyBlockedError as e:
        raise HTTPException(status_code=422, detail=safety_block_detail(e))
    except HTTPException:
        raise
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


