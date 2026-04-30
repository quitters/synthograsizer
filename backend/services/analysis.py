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

def analyze_image(self, image_bytes: bytes, prompt: str, model_name: Optional[str] = None):
    """Analyze an image using Gemini."""
    if not self.genai_client:
        raise ValueError("API Key not configured")
        
    try:
        model_name = model_name or config.MODEL_ANALYSIS_QUICK
        
        contents = [prompt]
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=sniff_mime_type(image_bytes))
        contents.append(image_part)
        
        response = self.genai_client.models.generate_content(
            model=model_name,
            contents=contents
        )
        return response.text
    except Exception as e:
        error_msg = str(e)
        print(f"Analysis failed: {error_msg}")
        
        # Check for Pydantic validation errors (often due to blocked content/NoneType)
        if "validation errors for _GenerateContentParameters" in error_msg:
            return "Analysis failed: Content blocked by safety filters."
            
        return f"Analysis failed: {error_msg}"

def analyze_image_to_prompt(self, image_bytes: bytes, mime_type: str = "image/png", model_name: Optional[str] = None) -> str:
    """
    Reverse-engineer an image into a detailed text prompt using a specific system prompt.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model_name = model_name or config.MODEL_FAST
    
    IMAGE_ANALYSIS_SYSTEM_PROMPT = """You are an expert at analyzing images and generating detailed text prompts suitable for text-to-image AI systems. Your goal is to reverse-engineer an image into a prompt that could recreate something similar.
Analyze the provided image and create a detailed descriptive prompt following this structure:
1. MEDIUM & STYLE (1-2 sentences)
Identify the core medium and primary artistic style or movement. Be specific about whether this is photography, digital art, traditional painting, 3D rendering, or another medium.
2. SUBJECT & COMPOSITION (2-3 sentences)
Describe the main subject in detail including pose, expression, and defining characteristics
Describe secondary elements and their spatial relationship to the main subject
Note the composition technique used in framing the scene
3. ENVIRONMENT & SETTING (1-2 sentences)
Describe the background, location, or environment. Include time of day if discernible.
4. LIGHTING & ATMOSPHERE (1-2 sentences)
Describe the lighting using appropriate technical terminology:
Characterize the type and source of lighting you observe
Describe the quality and mood created by the lighting
Note any atmospheric effects present in the scene
5. COLOR PALETTE (1 sentence)
Describe the dominant colors and their relationships within the composition.
6. TECHNICAL DETAILS (1 sentence)
Include relevant technical aspects appropriate to the medium:
For photography: camera perspective, lens characteristics, and focus properties
For digital art: rendering approach and level of detail
For traditional art: technique and material qualities
7. MOOD & AESTHETIC QUALITIES (1 sentence)
Capture the emotional tone and overall aesthetic using specific descriptors rather than generic terms like "beautiful" or "stunning."
OUTPUT FORMAT:
Combine all sections into a single flowing prompt of 50-150 words, written in a natural descriptive style (not bullet points). Use precise, evocative terminology that would help a text-to-image AI understand exactly what to generate. Avoid subjective judgments—focus on observable, reproducible qualities."""

    try:
        if not image_bytes:
            raise ValueError("No image bytes provided for analysis")

        # Validate that input is actually an image (not HTML or other data)
        is_valid_image = (
            image_bytes[:8] == b'\x89PNG\r\n\x1a\n' or  # PNG
            image_bytes[:2] == b'\xff\xd8' or            # JPEG
            image_bytes[:6] in (b'GIF87a', b'GIF89a') or # GIF
            image_bytes[:4] == b'RIFF'                   # WebP
        )
        if not is_valid_image:
            raise ValueError(f"Input is not a valid image (starts with: {image_bytes[:20]!r})")

        # Downsize large images to prevent Gemini INVALID_ARGUMENT errors.
        # Generated images (especially 2K/4K PNGs from Gemini Pro) can be too
        # large for the Flash model's input processing. Resize to max 2048px
        # and convert to JPEG for efficient transfer.
        MAX_ANALYSIS_DIM = 2048
        try:
            img = Image.open(io.BytesIO(image_bytes))
            w, h = img.size
            if w > MAX_ANALYSIS_DIM or h > MAX_ANALYSIS_DIM:
                scale = MAX_ANALYSIS_DIM / max(w, h)
                new_w, new_h = int(w * scale), int(h * scale)
                img = img.resize((new_w, new_h), Image.LANCZOS)
                print(f"[Analysis] Image resized: {w}x{h} -> {new_w}x{new_h}")
            # Convert ANY non-RGB mode to RGB for JPEG compatibility
            if img.mode != 'RGB':
                img = img.convert('RGB')
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=85)
            image_bytes = buf.getvalue()
            mime_type = "image/jpeg"
            print(f"[Analysis] Sending {len(image_bytes)} bytes as {mime_type}")
        except Exception as resize_err:
            print(f"[Analysis] Preprocessing failed: {resize_err}")
            # Fall back to original bytes with magic-byte detection
            if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
                mime_type = "image/png"
            elif image_bytes[:2] == b'\xff\xd8':
                mime_type = "image/jpeg"
            elif image_bytes[:6] in (b'GIF87a', b'GIF89a'):
                mime_type = "image/gif"
            elif image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
                mime_type = "image/webp"
            print(f"[Analysis] Fallback: {len(image_bytes)} bytes as {mime_type}")

        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

        response = self.genai_client.models.generate_content(
            model=model_name,
            contents=["Analyze this image:", image_part],
            config=types.GenerateContentConfig(
                system_instruction=IMAGE_ANALYSIS_SYSTEM_PROMPT
            )
        )
        return response.text
        
    except Exception as e:
        error_msg = str(e)
        print(f"Image analysis error: {error_msg}")
        
        # Catch the verbose Pydantic error
        if "validation errors for _GenerateContentParameters" in error_msg:
            raise Exception("Image analysis failed: Content blocked by safety filters (Input rejected).")
            
        raise Exception(f"Image analysis failed: {error_msg}")

def analyze_image_quick(self, image_bytes: bytes) -> str:
    """
    Lightweight image analysis optimized for workflow curation.
    Uses flash model and a shorter prompt for faster response.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model = config.MODEL_ANALYSIS_QUICK

    prompt = """Briefly describe this image's key visual attributes in 2-3 sentences:
- Subject/content
- Art style or medium
- Color palette
- Mood/atmosphere
- Lighting

Be concise and specific. Focus on attributes that would be relevant for selecting creative prompt variables."""

    try:
        image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/png")

        response = self.genai_client.models.generate_content(
            model=model,
            contents=[prompt, image_part]
        )

        return self._extract_text_from_response(response)
    except Exception as e:
        raise Exception(f"Quick image analysis failed: {e}")

def _extract_text_from_response(self, response) -> str:
    """
    Safely extract text from a Gemini response, handling thought_signature parts.
    This avoids the warning about non-text parts and potential hanging.
    """
    try:
        # Try to get text parts directly to avoid the warning
        if hasattr(response, 'candidates') and response.candidates:
            parts = response.candidates[0].content.parts
            text_parts = []
            for part in parts:
                if hasattr(part, 'text') and part.text:
                    text_parts.append(part.text)
            if text_parts:
                return ''.join(text_parts)
        # Fallback to .text if the above doesn't work
        return response.text
    except Exception:
        # Last resort fallback
        return str(response.text) if hasattr(response, 'text') else ""

