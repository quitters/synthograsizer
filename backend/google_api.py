"""Google GenAI call layer — Interactions API with a legacy generateContent escape hatch.

Every Gemini-model call in the backend (text, chat, vision, multimodal
template ops, Gemini image generation) goes through the ``gen_*`` functions
here instead of touching ``genai_client`` directly. Each call dispatches on
``policy.effective_google_api()``:

- ``interactions`` (default): the Interactions API (``interactions.create``).
  Every request is sent with ``store=False`` — no server-side retention at
  Google. The API has **no per-category safety thresholds**; Google-managed
  filtering applies, and ``safety_settings`` arguments are accepted but not
  forwarded (warned once).
- ``legacy``: generateContent — still fully supported by Google. Honors the
  operator's ``safety_settings`` thresholds and doubles as a wholesale
  behavioral rollback switch for the Interactions migration.

Veo / Imagen / Lyria are not covered by the Interactions API and keep their
dedicated endpoints regardless of mode (see video_gen / image_gen Imagen path /
music_manager).

Content is expressed as neutral block dicts (``text_block`` / ``image_block``,
image data kept as raw bytes) and converted per mode at dispatch time:
Interactions wants ``{"type": "image", "data": <base64 str>, ...}``; legacy
wants ``types.Part``. Safety blocks surface as ``SafetyBlockedError`` in both
modes so routers keep emitting the structured 422 the front-end's
"Report wrongly blocked" affordance recognizes. Under Interactions there is no
documented block signal, so detection is best-effort: ``status == "failed"``
step errors and safety-flavored API error messages.
"""

import base64
import logging
from typing import Any, Dict, Iterator, List, Optional, Tuple

from google.genai import types

from backend.helpers import SafetyBlockedError
from backend.policy import policy, GOOGLE_API_LEGACY
from backend.utils.image_utils import sniff_mime_type

logger = logging.getLogger(__name__)

# Substrings that mark an error/status message as a content-safety block
# rather than a plain API failure. Deliberately narrow — "harm" alone would
# match "harmless" etc.
_SAFETY_MARKERS = ("safety", "prohibited", "blocked", "harm_category", "harmful")

_warned: set = set()


def _warn_once(key: str, msg: str) -> None:
    if key not in _warned:
        _warned.add(key)
        logger.warning(msg)


def _is_legacy() -> bool:
    return policy.effective_google_api() == GOOGLE_API_LEGACY


def _looks_like_safety(message: str) -> bool:
    lowered = (message or "").lower()
    return any(marker in lowered for marker in _SAFETY_MARKERS)


# ── content blocks (mode-neutral) ────────────────────────────────────────────

def text_block(text: str) -> Dict[str, Any]:
    return {"type": "text", "text": text}


def image_block(data: bytes, mime_type: Optional[str] = None) -> Dict[str, Any]:
    """Image input block. ``data`` is raw bytes; encoding happens at dispatch."""
    return {
        "type": "image",
        "data": data,
        "mime_type": mime_type or sniff_mime_type(data),
    }


def user_step(content: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"type": "user_input", "content": content}


def model_step(content: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"type": "model_output", "content": content}


def _to_interactions_input(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Blocks → Interactions content dicts (image bytes → base64 str)."""
    out = []
    for b in blocks:
        if b.get("type") == "image" and isinstance(b.get("data"), (bytes, bytearray)):
            out.append({
                "type": "image",
                "data": base64.b64encode(b["data"]).decode("ascii"),
                "mime_type": b["mime_type"],
            })
        else:
            out.append(b)
    return out


def _to_legacy_contents(blocks: List[Dict[str, Any]]) -> List[Any]:
    """Blocks → generateContent contents (text str / types.Part)."""
    out: List[Any] = []
    for b in blocks:
        if b.get("type") == "text":
            out.append(b["text"])
        elif b.get("type") == "image":
            data = b["data"]
            if isinstance(data, str):
                data = base64.b64decode(data)
            out.append(types.Part.from_bytes(data=data, mime_type=b["mime_type"]))
        else:
            raise TypeError(f"Unsupported block type for legacy contents: {b.get('type')!r}")
    return out


def _legacy_safety(safety_settings: Optional[List[Dict[str, str]]]):
    if not safety_settings:
        return None
    return [
        types.SafetySetting(category=s["category"], threshold=s["threshold"])
        for s in safety_settings
    ]


# ── Interactions plumbing ────────────────────────────────────────────────────

def create_interaction(client, *, model: str, input: Any,
                       system_instruction: Optional[str] = None,
                       generation_config: Optional[Dict[str, Any]] = None,
                       response_modalities: Optional[List[str]] = None,
                       response_mime_type: Optional[str] = None,
                       tools: Optional[List[Dict[str, Any]]] = None,
                       stream: bool = False,
                       store: bool = False):
    """The single place ``interactions.create`` is called in the backend.

    Always sends ``store`` explicitly (default False — stateless, no Google-side
    retention). Safety-flavored API rejections are translated to
    ``SafetyBlockedError`` so the 422 contract holds even when the API refuses
    the prompt outright instead of returning a failed interaction.
    """
    kwargs: Dict[str, Any] = {
        "model": model,
        "input": input,
        "store": store,
    }
    if stream:
        kwargs["stream"] = True
    if system_instruction is not None:
        kwargs["system_instruction"] = system_instruction
    if generation_config:
        kwargs["generation_config"] = generation_config
    if response_modalities:
        kwargs["response_modalities"] = response_modalities
    if response_mime_type:
        kwargs["response_mime_type"] = response_mime_type
    if tools:
        kwargs["tools"] = tools
    try:
        return client.interactions.create(**kwargs)
    except SafetyBlockedError:
        raise
    except Exception as exc:  # noqa: BLE001 — translate, then re-raise
        if _looks_like_safety(str(exc)):
            raise SafetyBlockedError(
                f"Request rejected by Google safety filters: {exc}"
            ) from exc
        raise


def extract_text(interaction) -> str:
    """Best-effort text extraction (mirrors the old candidates-walk tolerance)."""
    text = getattr(interaction, "output_text", None)
    if text:
        return text
    parts: List[str] = []
    for step in getattr(interaction, "steps", None) or []:
        if getattr(step, "type", "") != "model_output":
            continue
        for block in getattr(step, "content", None) or []:
            if getattr(block, "type", "") == "text" and getattr(block, "text", None):
                parts.append(block.text)
    return "".join(parts)


def extract_image(interaction) -> Tuple[Optional[bytes], Optional[str]]:
    """First generated image as (raw bytes, mime_type); (None, None) if absent."""
    candidates = []
    output_image = getattr(interaction, "output_image", None)
    if output_image is not None:
        candidates.append(output_image)
    for step in getattr(interaction, "steps", None) or []:
        if getattr(step, "type", "") == "model_output":
            candidates.extend(
                b for b in (getattr(step, "content", None) or [])
                if getattr(b, "type", "") == "image"
            )
    for block in candidates:
        data = getattr(block, "data", None)
        if not data:
            continue
        if isinstance(data, str):
            data = base64.b64decode(data)
        return data, getattr(block, "mime_type", None) or "image/png"
    return None, None


def _step_error_messages(interaction) -> List[str]:
    msgs = []
    for step in getattr(interaction, "steps", None) or []:
        err = getattr(step, "error", None)
        if err is not None and getattr(err, "message", None):
            msgs.append(err.message)
    return msgs


def raise_if_blocked(interaction) -> None:
    """Map terminal Interaction failures onto the existing error contract.

    ``incomplete`` (≈ the old MAX_TOKENS) is NOT an error — callers keep the
    partial output. The Interactions API documents no explicit safety-block
    field, so classification of ``failed`` is by message content.
    """
    status = str(getattr(interaction, "status", "") or "")
    if status in ("failed", "cancelled", "budget_exceeded"):
        detail = "; ".join(_step_error_messages(interaction)) or f"Interaction {status}"
        if _looks_like_safety(detail):
            raise SafetyBlockedError(
                f"Response blocked by Google safety filters: {detail}", categories=[]
            )
        raise Exception(f"Interaction {status}: {detail}")


def iter_stream_text(stream) -> Iterator[str]:
    """Yield text deltas from an Interactions event stream.

    Thought-leak guard: thinking summaries stream as ``thought_summary``
    deltas and thought steps — both are excluded; only ``text`` deltas inside
    ``model_output`` steps are yielded.
    """
    current_step_type: Optional[str] = None
    for event in stream:
        event_type = getattr(event, "event_type", "")
        if event_type == "step.start":
            current_step_type = getattr(getattr(event, "step", None), "type", None)
        elif event_type == "step.delta":
            if current_step_type == "thought":
                continue
            delta = getattr(event, "delta", None)
            if getattr(delta, "type", "") == "text" and getattr(delta, "text", None):
                yield delta.text
        elif event_type == "error":
            err = getattr(event, "error", None)
            message = getattr(err, "message", None) or "Interactions stream error"
            if _looks_like_safety(message):
                raise SafetyBlockedError(
                    f"Response blocked by Google safety filters: {message}"
                )
            raise Exception(message)


# ── legacy (generateContent) plumbing — moved from providers/google_text.py ──

def _legacy_extract_text(response) -> str:
    """Safely extract text parts (skips thought_signature parts)."""
    try:
        if hasattr(response, "candidates") and response.candidates:
            parts = response.candidates[0].content.parts
            text_parts = [p.text for p in parts if getattr(p, "text", None)]
            if text_parts:
                return "".join(text_parts)
        return response.text
    except Exception:
        return str(response.text) if hasattr(response, "text") else ""


def _legacy_raise_if_blocked(response) -> None:
    """Translate generateContent block signals into SafetyBlockedError."""
    feedback = getattr(response, "prompt_feedback", None)
    if feedback is not None and getattr(feedback, "block_reason", None):
        raise SafetyBlockedError(
            f"Prompt blocked by Google safety filters: {feedback.block_reason}"
        )
    candidates = getattr(response, "candidates", None)
    if not candidates:
        return
    for candidate in candidates:
        finish_reason = str(getattr(candidate, "finish_reason", "") or "")
        if "SAFETY" in finish_reason:
            categories = []
            for rating in getattr(candidate, "safety_ratings", None) or []:
                prob = str(getattr(rating, "probability", ""))
                if "HIGH" in prob or "MEDIUM" in prob:
                    categories.append(
                        str(getattr(rating, "category", "")).replace("HARM_CATEGORY_", "")
                    )
            raise SafetyBlockedError(
                "Response blocked by Google safety filters.", categories=categories
            )


# ── public dispatchers ───────────────────────────────────────────────────────

def gen_text(client, model: str, blocks: List[Dict[str, Any]], *,
             system_instruction: Optional[str] = None,
             json_mode: bool = False,
             safety_settings: Optional[List[Dict[str, str]]] = None,
             generation_config: Optional[Dict[str, Any]] = None) -> str:
    """Text-out generation (text or multimodal input) via the active API mode."""
    if _is_legacy():
        config_kwargs: Dict[str, Any] = {}
        if json_mode:
            config_kwargs["response_mime_type"] = "application/json"
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction
        safety = _legacy_safety(safety_settings)
        if safety:
            config_kwargs["safety_settings"] = safety
        if generation_config:
            config_kwargs.update(generation_config)
        response = client.models.generate_content(
            model=model,
            contents=_to_legacy_contents(blocks),
            **({"config": types.GenerateContentConfig(**config_kwargs)} if config_kwargs else {}),
        )
        _legacy_raise_if_blocked(response)
        return _legacy_extract_text(response)

    if safety_settings:
        _warn_once(
            "safety-interactions",
            "safety_settings are not supported by the Interactions API and were "
            "not sent; switch google_api_mode to 'legacy' to enforce thresholds.",
        )
    request = dict(
        model=model,
        input=_to_interactions_input(blocks),
        system_instruction=system_instruction,
        generation_config=generation_config,
        store=False,
    )
    try:
        interaction = create_interaction(
            client,
            response_mime_type="application/json" if json_mode else None,
            **request,
        )
    except SafetyBlockedError:
        raise
    except Exception as exc:
        # JSON-mode degrade: some models/API revisions may reject the
        # response_mime_type constraint — retry unconstrained; downstream
        # callers already run parse_llm_json which tolerates fenced JSON.
        message = str(exc).lower()
        if json_mode and ("mime" in message or "response_format" in message):
            logger.warning(
                "Interactions rejected JSON response_mime_type (%s); retrying "
                "without the constraint.", exc,
            )
            interaction = create_interaction(client, **request)
        else:
            raise
    raise_if_blocked(interaction)
    return extract_text(interaction)


def gen_text_stream(client, model: str, blocks: List[Dict[str, Any]], *,
                    system_instruction: Optional[str] = None,
                    safety_settings: Optional[List[Dict[str, str]]] = None
                    ) -> Iterator[str]:
    """Streaming text generation via the active API mode. Yields str chunks."""
    if _is_legacy():
        config_kwargs: Dict[str, Any] = {}
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction
        safety = _legacy_safety(safety_settings)
        if safety:
            config_kwargs["safety_settings"] = safety
        stream = client.models.generate_content_stream(
            model=model,
            contents=_to_legacy_contents(blocks),
            **({"config": types.GenerateContentConfig(**config_kwargs)} if config_kwargs else {}),
        )
        for chunk in stream:
            if chunk.text:
                yield chunk.text
        return

    if safety_settings:
        _warn_once(
            "safety-interactions",
            "safety_settings are not supported by the Interactions API and were "
            "not sent; switch google_api_mode to 'legacy' to enforce thresholds.",
        )
    stream = create_interaction(
        client,
        model=model,
        input=_to_interactions_input(blocks),
        system_instruction=system_instruction,
        stream=True,
        store=False,
    )
    yield from iter_stream_text(stream)


def gen_chat(client, model: str, message: str,
             history: Optional[List[Dict[str, str]]]) -> str:
    """Stateless multi-turn chat via the active API mode.

    ``history`` is the caller-supplied ``[{"role", "content"}]`` list; the
    full transcript is resent each turn (same architecture as before — no
    ``previous_interaction_id`` chaining, nothing retained server-side).
    """
    if _is_legacy():
        contents = []
        for msg in history or []:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        contents.append({"role": "user", "parts": [{"text": message}]})
        response = client.models.generate_content(model=model, contents=contents)
        _legacy_raise_if_blocked(response)
        return _legacy_extract_text(response)

    steps: List[Dict[str, Any]] = []
    for msg in history or []:
        content = [text_block(msg["content"])]
        steps.append(user_step(content) if msg["role"] == "user" else model_step(content))
    steps.append(user_step([text_block(message)]))
    interaction = create_interaction(client, model=model, input=steps, store=False)
    raise_if_blocked(interaction)
    return extract_text(interaction)


# generateContent ImageConfig takes "512px"; Interactions ImageConfig takes "512".
_INTERACTIONS_IMAGE_SIZE = {"512px": "512", "1K": "1K", "2K": "2K", "4K": "4K"}


def gen_image(client, model: str, blocks: List[Dict[str, Any]], *,
              aspect_ratio: Optional[str] = None,
              image_size: Optional[str] = None,
              response_modalities: Optional[List[str]] = None,
              thinking_level: Optional[str] = None,
              include_thoughts: bool = False,
              temperature: Optional[float] = None,
              top_k: Optional[int] = None,
              top_p: Optional[float] = None,
              safety_settings: Optional[List[Dict[str, str]]] = None,
              use_google_search: bool = False,
              image_count: int = 1,
              ) -> Tuple[Optional[bytes], Optional[str], Optional[str]]:
    """Gemini image generation via the active API mode.

    Returns (image_bytes, mime_type, text). Raises SafetyBlockedError on
    blocks; returns (None, None, text) when the model answered with text only
    (the caller owns that error contract).
    """
    if _is_legacy():
        return _legacy_gen_image(
            client, model, blocks,
            aspect_ratio=aspect_ratio, image_size=image_size,
            response_modalities=response_modalities,
            thinking_level=thinking_level, include_thoughts=include_thoughts,
            temperature=temperature, top_k=top_k, top_p=top_p,
            safety_settings=safety_settings, use_google_search=use_google_search,
            image_count=image_count,
        )

    if safety_settings:
        _warn_once(
            "safety-interactions",
            "safety_settings are not supported by the Interactions API and were "
            "not sent; switch google_api_mode to 'legacy' to enforce thresholds.",
        )
    if top_k is not None:
        _warn_once("top_k-interactions",
                   "top_k is not supported by the Interactions API; ignored.")
    if image_count and image_count > 1:
        _warn_once(
            "image_count-interactions",
            "Multi-image generation is not supported on the Interactions API "
            "Gemini path; generating a single image (use an Imagen model for "
            "multi-image).",
        )

    generation_config: Dict[str, Any] = {}
    image_config: Dict[str, Any] = {}
    if aspect_ratio:
        image_config["aspect_ratio"] = aspect_ratio
    if image_size:
        image_config["image_size"] = _INTERACTIONS_IMAGE_SIZE.get(image_size, image_size)
    if image_config:
        generation_config["image_config"] = image_config
    if thinking_level:
        generation_config["thinking_level"] = thinking_level.lower()
    if include_thoughts:
        generation_config["thinking_summaries"] = "auto"
    if temperature is not None:
        generation_config["temperature"] = max(0.0, min(2.0, temperature))
    if top_p is not None:
        generation_config["top_p"] = max(0.0, min(1.0, top_p))

    modalities = [m.lower() for m in (response_modalities or ["image"])]
    tools = [{"type": "google_search"}] if use_google_search else None

    request = dict(
        model=model,
        input=_to_interactions_input(blocks),
        generation_config=generation_config or None,
        response_modalities=modalities,
        store=False,
    )
    try:
        interaction = create_interaction(client, tools=tools, **request)
    except SafetyBlockedError:
        raise
    except Exception as exc:
        if tools and "tool" in str(exc).lower():
            logger.warning(
                "Interactions rejected google_search with image output (%s); "
                "retrying without tools.", exc,
            )
            interaction = create_interaction(client, **request)
        else:
            raise
    raise_if_blocked(interaction)
    image_bytes, mime = extract_image(interaction)
    text_out = extract_text(interaction) or None
    if image_bytes is None and not text_out:
        # Old behavior for candidate-less responses: treat as a probable block.
        raise SafetyBlockedError(
            f"No output returned (status={getattr(interaction, 'status', 'unknown')}). "
            "The prompt may have been blocked for safety."
        )
    return image_bytes, mime, text_out


def _legacy_gen_image(client, model: str, blocks: List[Dict[str, Any]], *,
                      aspect_ratio, image_size, response_modalities,
                      thinking_level, include_thoughts, temperature, top_k,
                      top_p, safety_settings, use_google_search, image_count,
                      ) -> Tuple[Optional[bytes], Optional[str], Optional[str]]:
    """generateContent image path — semantics preserved from the pre-migration
    services/image_gen implementation."""
    config_kwargs: Dict[str, Any] = {
        "response_modalities": response_modalities or ["Image"],
    }
    if thinking_level or include_thoughts:
        thinking_cfg: Dict[str, Any] = {"include_thoughts": include_thoughts}
        if thinking_level:
            thinking_cfg["thinking_level"] = thinking_level.lower()
        config_kwargs["thinking_config"] = thinking_cfg

    safety = _legacy_safety(safety_settings)
    if safety:
        config_kwargs["safety_settings"] = safety

    image_config_base = {
        "aspect_ratio": aspect_ratio if aspect_ratio != "auto" else None,
    }
    if image_size:
        image_config_base["image_size"] = image_size
    image_config_extended = dict(image_config_base)
    if image_count and image_count > 1:
        image_config_extended["image_count"] = image_count
    try:
        image_cfg = types.ImageConfig(**image_config_extended)
    except Exception as exc:
        dropped = set(image_config_extended) - set(image_config_base)
        if dropped:
            logger.warning(
                "ImageConfig rejected fields %s on Gemini path (%s); "
                "falling back to base config.", sorted(dropped), exc,
            )
        image_cfg = types.ImageConfig(**image_config_base)
    config_kwargs["image_config"] = image_cfg

    if temperature is not None:
        config_kwargs["temperature"] = max(0.0, min(2.0, temperature))
    if top_k is not None:
        config_kwargs["top_k"] = max(1, min(100, top_k))
    if top_p is not None:
        config_kwargs["top_p"] = max(0.0, min(1.0, top_p))
    if use_google_search:
        config_kwargs["tools"] = [types.Tool(google_search=types.GoogleSearch())]

    response = client.models.generate_content(
        model=model,
        contents=_to_legacy_contents(blocks),
        config=types.GenerateContentConfig(**config_kwargs),
    )

    if not response:
        raise Exception("API returned empty response")
    if hasattr(response, "prompt_feedback") and response.prompt_feedback:
        if response.prompt_feedback.block_reason:
            raise SafetyBlockedError(
                f"Prompt blocked: {response.prompt_feedback.block_reason}"
            )
    if not hasattr(response, "candidates") or not response.candidates:
        raise SafetyBlockedError(
            "No candidates returned. The prompt may have been blocked for safety."
        )

    image_bytes: Optional[bytes] = None
    mime: Optional[str] = None
    text_out: Optional[str] = None
    for candidate in response.candidates:
        finish_reason = str(getattr(candidate, "finish_reason", "") or "")
        if "SAFETY" in finish_reason or finish_reason == "3":
            safety_msg = "Content blocked for SAFETY."
            categories = []
            for rating in getattr(candidate, "safety_ratings", None) or []:
                prob = str(getattr(rating, "probability", ""))
                if "HIGH" in prob or "MEDIUM" in prob:
                    category = str(getattr(rating, "category", "")).replace("HARM_CATEGORY_", "")
                    categories.append(category)
                    safety_msg += f" ({category}: {prob})"
            raise SafetyBlockedError(safety_msg, categories=categories)
        if "RECITATION" in finish_reason:
            raise Exception("Content blocked: Recitation of copyrighted material.")

        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) if content is not None else None
        if not parts:
            continue
        for part in parts:
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None) and image_bytes is None:
                image_bytes = inline.data
                mime = getattr(inline, "mime_type", None) or "image/png"
            elif getattr(part, "text", None):
                text_out = (text_out or "") + part.text
        if image_bytes is not None:
            break

    if image_bytes is None:
        finish_reasons = [
            str(getattr(c, "finish_reason", "unknown")) for c in response.candidates
        ]
        logger.warning(
            "No image part found in Gemini response. finish_reasons=%s model=%s text_content=%r",
            finish_reasons, model, text_out,
        )
        if not text_out:
            raise Exception(
                f"No image found in Gemini response (finish_reasons={finish_reasons})"
            )
    return image_bytes, mime, text_out
