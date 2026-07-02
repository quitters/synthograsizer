import base64
import logging
from typing import Optional, List, Dict, Any
from backend import config
from backend import google_api
from backend.helpers import SafetyBlockedError
from backend.utils.retry import retry_on_transient
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
    except SafetyBlockedError:
        raise  # keep the type — routers emit a structured 422 for these
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
    """Generate an image via Gemini (google_api dispatch: Interactions or legacy).

    Returns either a base64 string or a dict with 'image' and 'text' keys
    (when the model returns both modalities). Signature keeps the full set of
    public API parameters; ones without an Interactions equivalent
    (top_k, image_count>1) are dropped there with a warning, and
    `person_generation` / `add_watermark` remain Imagen-only as before.
    """
    # Thinking gate:
    # NB2 (gemini-3.1-flash-image) supports configurable thinking_level (minimal/high).
    # NB Pro (gemini-3-pro-image) has thinking always-on; does NOT accept thinking_level.
    if not ("gemini-3" in model_name and "pro-image" not in model_name):
        thinking_level = None
        include_thoughts = False

    # Safety Settings — resolved by policy: per-request > saved operator
    # defaults > permissive baseline. Hosted instances ignore per-request
    # settings so anonymous visitors can't lower thresholds. They only reach
    # Google on the legacy generateContent mode (Interactions has no such knob).
    from backend.policy import policy
    safety_settings = policy.effective_safety(safety_settings)

    # Resolution Handling (Gemini 3.x models support image_size)
    image_size = None
    if media_resolution and "gemini-3" in model_name:
        res_map = {
            "media_resolution_512": "512px",  # 3.1 Flash only
            "media_resolution_low": "1K",
            "media_resolution_medium": "2K",
            "media_resolution_high": "4K"
        }
        image_size = res_map.get(media_resolution)

    blocks = []
    if reference_images:
        for image_bytes in reference_images:
            blocks.append(google_api.image_block(image_bytes))
    blocks.append(google_api.text_block(prompt))

    image_bytes, _mime, text_out = google_api.gen_image(
        self.genai_client,
        model_name,
        blocks,
        aspect_ratio=aspect_ratio if aspect_ratio != "auto" else None,
        image_size=image_size,
        response_modalities=response_modalities,
        thinking_level=thinking_level,
        include_thoughts=include_thoughts,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        safety_settings=safety_settings,
        use_google_search=use_google_search,
        image_count=image_count,
    )

    if image_bytes is None:
        if text_out:
            raise Exception(f"Model returned text instead of an image: {text_out.strip()[:300]}")
        raise Exception("No image found in Gemini response")

    final_bytes = self.embed_metadata(image_bytes, prompt, tags=tags)
    self.save_output(final_bytes, f"img_{model_name}")
    image_b64 = base64.b64encode(final_bytes).decode("utf-8")

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
3. **Expand terse intents into concrete visual direction**: A short intent like "make it cooler" or "more dramatic" is a creative brief, not a literal string — translate it into specific changes to palette, lighting, composition, or styling that suit THIS subject. Never just echo the user's words back.
4. **Preserve identity**: Keep the Critical Identity Markers from the Input Image Analysis intact unless the User Intent explicitly asks to change them.

**EDGE CASES**:
* If `Input Image Analysis` is "EMPTY" (blank input), build the prompt purely from the `User Intent` (plus reference aspects if requested) — write a "Create" prompt, not a "Transform" prompt.
* If `Reference Image Analysis` is "NO REFERENCE IMAGE", never invent reference traits.

**OUTPUT FORMAT**:
* A single, concise paragraph.
* Start with: "Transform/Create an image inspired by [INPUT_SUBJECT DESCRIPTION]..."
* Limit your response to 1024 characters max.
* Output ONLY the prompt — no preamble, no explanations, no quotation marks around it.
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
        final_prompt = google_api.gen_text(
            self.genai_client,
            prompt_model,
            [google_api.text_block(PROMPT_GEN_SYSTEM_PROMPT), google_api.text_block(context)],
        )

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

