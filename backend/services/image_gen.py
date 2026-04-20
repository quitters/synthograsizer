import os
import json
import base64
import io
import time
import requests
import uuid
from datetime import datetime
import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any, Union
from backend import config
from backend.utils.retry import retry_on_transient
import google.generativeai as genai
from google import genai as genai_client
from google.genai import types
from PIL import Image
from PIL.PngImagePlugin import PngInfo

def generate_image(self, prompt: str, model_name: str = None, aspect_ratio: str = "1:1",
                   negative_prompt: str = None, input_images: Optional[List[bytes]] = None,
                   response_modalities: Optional[List[str]] = None,
                   thinking_level: Optional[str] = None,
                   include_thoughts: bool = False,
                   media_resolution: Optional[str] = None,
                   person_generation: Optional[str] = None,
                   safety_settings: Optional[List[Dict[str, str]]] = None,
                   image_count: int = 1,
                   add_watermark: bool = True,
                   use_google_search: bool = False,
                   temperature: Optional[float] = None,
                   top_k: Optional[int] = None,
                   top_p: Optional[float] = None,
                   tags: list = None):
    """Generate image using Imagen 3 or Gemini."""
    if not self.genai_client:
        raise ValueError("API Key not configured")

    try:
        # Consolidate reference images so Gemini paths can consume multiple inputs
        reference_images: List[bytes] = []
        if input_images:
            reference_images.extend(input_images)

        if "gemini" in model_name.lower():
            try:
                return self._generate_image_gemini(
                    prompt, model_name, aspect_ratio, reference_images,
                    response_modalities, thinking_level, include_thoughts,
                    media_resolution, person_generation, safety_settings,
                    image_count, add_watermark, use_google_search,
                    temperature, top_k, top_p, tags=tags
                )
            except Exception as e:
                print(f"Image generation failed across all retries, using placeholder: {str(e)[:120]}")
                return self._placeholder_image(aspect_ratio)
        else:
            # Use Imagen 3
            return self._generate_image_imagen(prompt, model_name, aspect_ratio, negative_prompt, tags=tags)
    except Exception as e:
        raise Exception(f"Image generation failed: {str(e)}")

@retry_on_transient(max_attempts=3, backoff_base=5.0)
def _generate_image_gemini(self, prompt: str, model_name: str, aspect_ratio: str,
                           reference_images: Optional[List[bytes]] = None,
                           response_modalities: Optional[List[str]] = None,
                           thinking_level: Optional[str] = None,
                           include_thoughts: bool = False,
                           media_resolution: Optional[str] = None,
                           person_generation: Optional[str] = None,
                           safety_settings: Optional[List[Dict[str, str]]] = None,
                           image_count: int = 1,
                           add_watermark: bool = True,
                           use_google_search: bool = False,
                           temperature: Optional[float] = None,
                           top_k: Optional[int] = None,
                           top_p: Optional[float] = None,
                           tags: list = None):
    """Generate an image via Gemini's generate_content API.

    Builds a GenerateContentConfig with image modality, optional thinking,
    safety settings, sampling controls, and reference images.  Returns
    either a base64 string or a dict with 'image' and 'text' keys
    (when the model returns both modalities).
    """
    # Build config kwargs — start with image modality
    config_kwargs: Dict[str, Any] = {
        "response_modalities": response_modalities or ['Image']
    }

    # Thinking Config
    # NB2 (gemini-3.1-flash-image) supports configurable thinking_level (minimal/high).
    # NB Pro (gemini-3-pro-image) has thinking always-on; does NOT accept thinking_level.
    if "gemini-3" in model_name and "pro-image" not in model_name:
        if thinking_level or include_thoughts:
            thinking_cfg = {"include_thoughts": include_thoughts}
            if thinking_level:
                thinking_cfg["thinking_level"] = thinking_level.lower()
            config_kwargs["thinking_config"] = thinking_cfg

    # Safety Settings
    if safety_settings:
        # Map list of dicts to types.SafetySetting
        mapped_safety = []
        for s in safety_settings:
            mapped_safety.append(types.SafetySetting(
                category=s["category"],
                threshold=s["threshold"]
            ))
        config_kwargs["safety_settings"] = mapped_safety

    # Image Config
    # Note: image_count and add_watermark are currently causing Pydantic validation errors 
    # with the installed SDK version. Removing them for now.
    image_config_args = {
        "aspect_ratio": aspect_ratio if aspect_ratio != "auto" else None,
        # "image_count": image_count, 
        # "add_watermark": add_watermark 
    }

    # Resolution Handling (Gemini 3.x models support image_size)
    if media_resolution and "gemini-3" in model_name:
        res_map = {
            "media_resolution_512": "512px",  # 3.1 Flash only
            "media_resolution_low": "1K",
            "media_resolution_medium": "2K",
            "media_resolution_high": "4K"
        }
        if media_resolution in res_map:
            image_config_args["image_size"] = res_map[media_resolution]

    # if person_generation:
    #     image_config_args["person_generation"] = person_generation
    
    # NOTE: person_generation also causing Pydantic errors. Removing for now.

    config_kwargs["image_config"] = types.ImageConfig(**image_config_args)

    # Sampling Controls
    if temperature is not None:
        config_kwargs["temperature"] = max(0.0, min(2.0, temperature))
    if top_k is not None:
        config_kwargs["top_k"] = max(1, min(100, top_k))
    if top_p is not None:
        config_kwargs["top_p"] = max(0.0, min(1.0, top_p))

    # Google Search Tool
    if use_google_search:
        tool = types.Tool(google_search=types.GoogleSearch())
        config_kwargs["tools"] = [tool]

    gen_config = types.GenerateContentConfig(**config_kwargs)

    contents = [prompt]
    if reference_images:
        # Add each reference image as a Part (sniff actual mime type — never assume JPEG)
        for image_bytes in reference_images:
            image_part = types.Part.from_bytes(data=image_bytes, mime_type=sniff_mime_type(image_bytes))
            contents.append(image_part)

    response = self.genai_client.models.generate_content(
        model=model_name,
        contents=contents,
        config=gen_config
    )

    # Parse response for inline image data
    if not response:
        raise Exception("API returned empty response")

    # Check for prompt feedback blocks (common in some API versions)
    if hasattr(response, 'prompt_feedback') and response.prompt_feedback:
        if response.prompt_feedback.block_reason:
            raise Exception(f"Prompt blocked: {response.prompt_feedback.block_reason}")

    if not hasattr(response, 'candidates') or not response.candidates:
         # This is likely where the "NoneType is not iterable" came from if candidates was None
         raise Exception("No candidates returned. The prompt may have been blocked for safety.")

    for candidate in response.candidates:
        # Check finish reason
        if hasattr(candidate, 'finish_reason'):
            # 3 is SAFETY, but using the enum string or value is safer if available. 
            # In the new SDK, it might be an enum. converting to str usually works.
            finish_reason = str(candidate.finish_reason)
            if "SAFETY" in finish_reason or finish_reason == "3":
                safety_msg = "Content blocked for SAFETY."
                if hasattr(candidate, 'safety_ratings') and candidate.safety_ratings:
                    for rating in candidate.safety_ratings:
                        # Check if probability is high/medium which usually triggers block
                        # probability might be an enum or string
                        prob = str(rating.probability)
                        if "HIGH" in prob or "MEDIUM" in prob:
                            category = str(rating.category).replace("HARM_CATEGORY_", "")
                            safety_msg += f" ({category}: {prob})"
                raise Exception(safety_msg)
            
            if "RECITATION" in finish_reason:
                 raise Exception("Content blocked: Recitation of copyrighted material.")

        if hasattr(candidate, 'content') and candidate.content is not None and hasattr(candidate.content, 'parts') and candidate.content.parts is not None:
            for part in candidate.content.parts:
                if hasattr(part, 'inline_data') and part.inline_data:
                    # Embed Metadata (with optional provenance tags)
                    final_bytes = self.embed_metadata(part.inline_data.data, prompt, tags=tags)

                    self.save_output(final_bytes, f"img_{model_name}")
                    return base64.b64encode(final_bytes).decode('utf-8')

    raise Exception("No image found in Gemini response (Candidates examined but no image part found)")

def _generate_image_imagen(self, prompt: str, model_name: str, aspect_ratio: str, negative_prompt: str = None, tags: list = None):
    """Helper for Imagen 3 generation."""
    gen_config = types.GenerateImagesConfig(
        aspect_ratio=aspect_ratio,
        number_of_images=1
    )

    response = self.genai_client.models.generate_images(
        model=model_name,
        prompt=prompt,
        config=gen_config
    )

    if response.generated_images:
        image = response.generated_images[0]

        # Embed Metadata (with optional provenance tags)
        final_bytes = self.embed_metadata(image.image_bytes, prompt, tags=tags)

        # Save to disk
        self.save_output(final_bytes, f"img_{model_name}")
        # Return base64 string
        return base64.b64encode(final_bytes).decode('utf-8')
    else:
        raise Exception("No images returned")

def smart_transform(self, input_image_bytes: bytes, user_intent: str, ref_image_bytes: bytes = None, model_name: str = "gemini-3-pro-image-preview", aspect_ratio: str = "1:1"):
    """Execute the ComfyUI-style Smart Transform workflow.

    Pipeline: Analyze Input → Analyze Reference → Generate Prompt → Generate Image
    Returns dict with 'image' (base64) and 'prompt' (generated text).
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    # 1. Define System Prompts
    INPUT_ANALYSIS_PROMPT = """Analyze this input image for transformation purposes.
If blank/empty → respond: "EMPTY"
Otherwise, provide:
1. Subject Type & Form: [what is it? person/object/abstract/scene]
2. Key Visual Features: [most distinctive characteristics]
3. Critical Identity Markers: [what MUST be preserved for recognition]
4. Current Style/Aesthetic: [current artistic treatment, if any]
5. Structural Elements: [shapes, composition, spatial arrangement]
Be detailed but concise. This analysis will guide AI transformations.
Format: TYPE | FEATURES | IDENTITY | STYLE | STRUCTURE"""

    REF_ANALYSIS_PROMPT = """Analyze this reference image concisely. This image is an **OPTIONAL SOURCE OF VISUAL GUIDANCE**.
**IMPORTANT**: If this image is blank, respond with exactly: "NO REFERENCE IMAGE"
Otherwise, extract comprehensive VISUAL CHARACTERISTICS:
1. **Overall Impression & Type**
2. **Artistic Style/Aesthetics**
3. **Composition & Layout**
4. **Key Objects/Elements**
5. **Color & Lighting**
6. **Mood & Atmosphere**
Format as: TYPE | STYLE | COMPOSITION | ELEMENTS | COLOR_LIGHTING | MOOD"""

    PROMPT_GEN_SYSTEM_PROMPT = """You are an expert at creating highly specific and flexible image generation prompts for Gemini's image generation API. Your core task is to transform or generate an image **inspired by the Input Image Analysis, strictly adhering to the User Intent.**

**YOUR ROLE**: Generate a single, directive image generation prompt. The prompt must:
1. **Always center on the Input Image Subject**: Start by transforming, modifying, or drawing inspiration from the `Input Image Analysis` based on the `User Intent`.
2. **Strictly interpret User Intent**:
* If `User Intent` asks for a transformation *without mentioning the reference image*, ignore `Reference Image Analysis`.
* If `User Intent` **explicitly requests using the reference image**, then selectively integrate *only the specified aspects* from `Reference Image Analysis`.

**OUTPUT FORMAT**:
* A single, concise paragraph.
* Start with: "Transform/Create an image inspired by [INPUT_SUBJECT DESCRIPTION]..."
* Limit your response to 1024 characters max.
"""

    try:
        # 2. Run Analysis
        input_analysis = self.analyze_image(input_image_bytes, INPUT_ANALYSIS_PROMPT)

        ref_analysis = "NO REFERENCE IMAGE"
        if ref_image_bytes:
            ref_analysis = self.analyze_image(ref_image_bytes, REF_ANALYSIS_PROMPT)

        # 3. Generate Prompt
        context = f"""[USER INTENT: {user_intent} ]
[INPUT IMAGE ANALYSIS: {input_analysis} ]
[REFERENCE STYLE ANALYSIS: {ref_analysis} ]"""

        prompt_model = config.MODEL_SMART_TRANSFORM_PROMPT
        prompt_response = self.genai_client.models.generate_content(
            model=prompt_model,
            contents=[PROMPT_GEN_SYSTEM_PROMPT, context]
        )
        final_prompt = prompt_response.text

        # 4. Generate Image — pass input image as reference for transformation
        reference_images = [input_image_bytes]
        if ref_image_bytes:
            reference_images.append(ref_image_bytes)

        image_b64 = self.generate_image(
            prompt=final_prompt,
            model_name=model_name,
            aspect_ratio=aspect_ratio,
            input_images=reference_images
        )

        # generate_image may return a string or dict
        if isinstance(image_b64, dict):
            image_b64 = image_b64.get('image', image_b64)

        return {
            "image": image_b64,
            "prompt": final_prompt
        }

    except Exception as e:
        raise Exception(f"Smart Transform failed: {str(e)}")

