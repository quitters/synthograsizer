import base64
import logging
from typing import Optional, List, Dict, Any
from backend import config
from backend.utils.retry import retry_on_transient
from backend.utils.image_utils import sniff_mime_type
from google.genai import types

logger = logging.getLogger(__name__)

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
            return self._generate_image_gemini(
                prompt, model_name, aspect_ratio, reference_images,
                response_modalities, thinking_level, include_thoughts,
                media_resolution, person_generation, safety_settings,
                image_count, add_watermark, use_google_search,
                temperature, top_k, top_p, tags=tags
            )
        else:
            # Use Imagen 3 — natively supports number_of_images, add_watermark,
            # person_generation. Forward them through.
            return self._generate_image_imagen(
                prompt, model_name, aspect_ratio, negative_prompt,
                image_count=image_count,
                add_watermark=add_watermark,
                person_generation=person_generation,
                tags=tags,
            )
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

    # Safety Settings (Default to permissive if not provided)
    if not safety_settings:
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "BLOCK_ONLY_HIGH"}
        ]

    mapped_safety = []
    for s in safety_settings:
        mapped_safety.append(types.SafetySetting(
            category=s["category"],
            threshold=s["threshold"]
        ))
    config_kwargs["safety_settings"] = mapped_safety

    # Image Config
    #
    # The set of fields supported by `types.ImageConfig` varies across
    # google-genai SDK versions. We always pass `aspect_ratio` (universally
    # supported), then attempt to layer on optional fields and gracefully
    # fall back if the installed SDK rejects them.
    #
    # Notes on Gemini-side limitations vs. Imagen:
    #   - `image_count`        : Gemini may not honor multi-image; Imagen does.
    #     We map it onto ImageConfig if available; callers wanting reliable
    #     multi-image generation should use the Imagen path.
    #   - `add_watermark`      : Imagen-only; SynthID is automatic on Gemini.
    #   - `person_generation`  : Imagen-only on most SDK builds.
    image_config_base = {
        "aspect_ratio": aspect_ratio if aspect_ratio != "auto" else None,
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
            image_config_base["image_size"] = res_map[media_resolution]

    # Layer on optional Gemini-supported fields only.
    # add_watermark and person_generation are Imagen-only — omit them here.
    image_config_extended = dict(image_config_base)
    if image_count and image_count > 1:
        image_config_extended["image_count"] = image_count

    try:
        image_cfg = types.ImageConfig(**image_config_extended)
    except Exception as e:
        # SDK version doesn't support image_count — fall back to base config.
        dropped = set(image_config_extended) - set(image_config_base)
        if dropped:
            logger.warning(
                "ImageConfig rejected fields %s on Gemini path (%s); "
                "falling back to base config.",
                sorted(dropped), e,
            )
        image_cfg = types.ImageConfig(**image_config_base)
    config_kwargs["image_config"] = image_cfg

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

    contents = []
    if reference_images:
        # Add each reference image as a Part first
        for image_bytes in reference_images:
            image_part = types.Part.from_bytes(data=image_bytes, mime_type=sniff_mime_type(image_bytes))
            contents.append(image_part)
    
    # Add prompt at the end
    contents.append(prompt)

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
        # `candidates` is None when the prompt itself was rejected upstream.
        raise Exception("No candidates returned. The prompt may have been blocked for safety.")

    # Walk candidates and collect the first image part we find. We also
    # capture any text part (Gemini sometimes returns commentary alongside
    # the image when response_modalities includes "Text"). Safety blocks
    # raised here are terminal — we don't try other candidates because the
    # block applies to the prompt, not the candidate ranking.
    image_b64: Optional[str] = None
    text_out: Optional[str] = None

    for candidate in response.candidates:
        finish_reason = str(getattr(candidate, "finish_reason", "") or "")
        if "SAFETY" in finish_reason or finish_reason == "3":
            safety_msg = "Content blocked for SAFETY."
            for rating in getattr(candidate, "safety_ratings", None) or []:
                prob = str(getattr(rating, "probability", ""))
                if "HIGH" in prob or "MEDIUM" in prob:
                    category = str(getattr(rating, "category", "")).replace("HARM_CATEGORY_", "")
                    safety_msg += f" ({category}: {prob})"
            raise Exception(safety_msg)

        if "RECITATION" in finish_reason:
            raise Exception("Content blocked: Recitation of copyrighted material.")

        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) if content is not None else None
        if not parts:
            continue

        for part in parts:
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None) and image_b64 is None:
                final_bytes = self.embed_metadata(inline.data, prompt, tags=tags)
                self.save_output(final_bytes, f"img_{model_name}")
                image_b64 = base64.b64encode(final_bytes).decode("utf-8")
            elif getattr(part, "text", None):
                text_out = (text_out or "") + part.text

        if image_b64 is not None:
            break

    if image_b64 is None:
        raise Exception("No image found in Gemini response (Candidates examined but no image part found)")

    # Preserve historical contract: bare base64 string when there's no text,
    # dict when the model returned both modalities.
    if text_out:
        return {"image": image_b64, "text": text_out}
    return image_b64

def _generate_image_imagen(
    self,
    prompt: str,
    model_name: str,
    aspect_ratio: str,
    negative_prompt: str = None,
    image_count: int = 1,
    add_watermark: bool = True,
    person_generation: Optional[str] = None,
    tags: list = None,
):
    """Helper for Imagen 3 generation.

    Imagen natively supports `number_of_images`, `add_watermark`, and
    `person_generation`. We layer them onto the config defensively so the
    call still succeeds against older SDK builds that lack one of them.
    """
    config_args: Dict[str, Any] = {
        "aspect_ratio": aspect_ratio,
        "number_of_images": max(1, int(image_count or 1)),
    }
    if add_watermark is False:
        config_args["add_watermark"] = False
    if person_generation:
        config_args["person_generation"] = person_generation
    if negative_prompt:
        config_args["negative_prompt"] = negative_prompt

    try:
        gen_config = types.GenerateImagesConfig(**config_args)
    except Exception as e:
        # Fall back to the minimum-viable config rather than failing the call.
        dropped = set(config_args) - {"aspect_ratio", "number_of_images"}
        if dropped:
            logger.warning(
                "GenerateImagesConfig rejected fields %s on Imagen path (%s); "
                "falling back to minimal config.",
                sorted(dropped), e,
            )
        gen_config = types.GenerateImagesConfig(
            aspect_ratio=aspect_ratio,
            number_of_images=config_args["number_of_images"],
        )

    response = self.genai_client.models.generate_images(
        model=model_name,
        prompt=prompt,
        config=gen_config,
    )

    if not response.generated_images:
        raise Exception("No images returned")

    # When the caller asked for one image, preserve the original string
    # return contract. For multi-image requests, return a list so callers
    # can opt into the new shape without breaking existing single-image flows.
    encoded: List[str] = []
    for image in response.generated_images:
        final_bytes = self.embed_metadata(image.image_bytes, prompt, tags=tags)
        self.save_output(final_bytes, f"img_{model_name}")
        encoded.append(base64.b64encode(final_bytes).decode("utf-8"))

    if len(encoded) == 1:
        return encoded[0]
    # `image` keeps the existing single-image contract working (router code
    # reads result.get('image')); `images` carries the full list for callers
    # that opt into multi-image mode.
    return {"image": encoded[0], "images": encoded}

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

