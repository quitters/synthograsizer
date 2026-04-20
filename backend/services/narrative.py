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

def generate_narrative(self, descriptions: List[str], user_prompt: str, mode: str = "story") -> List[str]:
    """
    Synthesize a cohesive narrative or thematic set of prompts from multiple image descriptions.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model_name = config.MODEL_NARRATIVE
    
    system_prompt = ""
    if mode.lower() == "story":
         system_prompt = """
You are a Master Storyteller and Video Director.
**TASK**: You will be given a list of image descriptions (representing scenes) and a User's "North Star" plot outline.
**OBJECTIVE**: Write a cohesive, linear story that moves through these images sequentially. The story must make sense as a video sequence.
**OUTPUT**: A JSON Object containing a single key "prompts" which is a list of strings. Each string is a VIDEO GENERATION PROMPT for that specific image index.
Example: {"prompts": ["Scene 1: Action A...", "Scene 2: Action B..."]}

**RULES**:
1. Respect the visual facts of each image description.
2. Infuse the User's Plot into the action/movement of the video prompt.
3. Ensure continuity of mood/lighting.
4. Output RAW JSON only. No markdown formatting.
"""
    else: # Artwork/Thematic
         system_prompt = """
You are an Art Director and Curator.
**TASK**: You will be given a list of image descriptions and a User's "North Star" Thematic Concept.
**OBJECTIVE**: Reimagine these images as a unified art exhibition or thematic collection.
**OUTPUT**: A JSON Object containing a single key "prompts" which is a list of strings.
Example: {"prompts": ["Style A applied to Subject 1...", "Style A applied to Subject 2..."]}

**RULES**:
1. The "North Star" Theme is supreme. Apply its aesthetic to every image.
2. Make the movement/animation style consistent across all images.
3. Output RAW JSON only. No markdown formatting.
"""

    # Format context
    context = f"USER NORTH STAR PROMPT: {user_prompt}\n\nIMAGE DESCRIPTIONS:\n"
    for i, desc in enumerate(descriptions):
        context += f"IMAGE {i+1}: {desc}\n"

    try:
         gen_config = types.GenerateContentConfig(
             response_mime_type="application/json"
         )
         
         response = self.genai_client.models.generate_content(
            model=model_name,
            contents=[system_prompt, context],
            config=gen_config
         )
         
         # Parse JSON
         try:
            import json
            cleaned_text = response.text.replace("```json", "").replace("```", "").strip()
            result = json.loads(cleaned_text)
            
            if "prompts" in result and isinstance(result["prompts"], list):
                prompts = result["prompts"]
            elif isinstance(result, list):
                prompts = result
            else:
                # Fallback if structure is unexpected
                prompts = [str(result)] * len(descriptions)
            
            # Ensure length matches input
            if len(prompts) < len(descriptions):
                # Pad
                prompts.extend([user_prompt] * (len(descriptions) - len(prompts)))
            return prompts

         except Exception as e:
             # Fallback to simple list if JSON parsing fails
             return [f"{user_prompt} - {desc[:50]}" for desc in descriptions]

    except Exception as e:
        raise Exception(f"Narrative generation failed: {e}")

def generate_video_variations(self, description: str, mode: str = "story") -> list:
    """
    Generate a set of labeled video variation prompts from an image description.
    Each variation is a different creative direction for animating/filming the scene.
    Returns a list of dicts: [{"label": "...", "prompt": "..."}, ...]
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model_name = config.MODEL_FAST

    if mode.lower() == "story":
        system_prompt = """You are a Video Director specializing in cinematic camera work and motion design.
**TASK**: Given an image description, generate 4-6 distinct VIDEO VARIATION concepts. Each variation represents a different way to bring this still image to life as a short video clip (4-8 seconds).

**VARIATION TYPES TO CONSIDER**:
- Camera movements: slow pan, dolly zoom, orbital shot, crane up/down, tracking shot
- Subject animation: character movement, expression changes, gesture, interaction
- Environmental motion: wind, water, particles, lighting shifts, weather changes
- Narrative moments: a beat before action, a reveal, an emotional shift
- Cinematic techniques: rack focus, time-lapse, slow motion, parallax

**OUTPUT**: A JSON object with a single key "variations" containing a list of objects.
Each object has:
- "label": Short name for the variation (2-4 words, Title Case)
- "prompt": A directive video generation prompt (1-3 sentences) describing exactly what motion/action occurs

Example:
{"variations": [
  {"label": "Slow Orbit", "prompt": "Slow orbital camera movement circling the subject, revealing depth and dimension as ambient light shifts subtly."},
  {"label": "Dramatic Zoom", "prompt": "Gradual dolly zoom into the subject's face, background compressing as tension builds."}
]}

**RULES**:
1. Each variation must be visually distinct from the others.
2. Prompts should be specific and directive — describe the MOTION, not just the scene.
3. Reference elements from the image description to ground the motion in the scene.
4. Keep prompts concise but evocative (50-100 words each).
5. Output RAW JSON only. No markdown formatting."""
    else:  # Artwork / Thematic
        system_prompt = """You are an Art Director and Motion Designer specializing in stylized animation.
**TASK**: Given an image description, generate 4-6 distinct THEMATIC VIDEO VARIATION concepts. Each variation reimagines how this image could be animated with a different artistic or thematic treatment.

**VARIATION TYPES TO CONSIDER**:
- Style transfers: anime-style motion, stop-motion feel, painterly brush strokes animating
- Mood shifts: transform the emotional register — serene to dramatic, warm to eerie
- Temporal shifts: sunrise to sunset, seasonal change, aging/growth
- Abstract motion: geometric decomposition, color field morphing, texture evolution
- Genre reinterpretation: noir, sci-fi, fantasy, documentary, music video aesthetic

**OUTPUT**: A JSON object with a single key "variations" containing a list of objects.
Each object has:
- "label": Short name for the variation (2-4 words, Title Case)
- "prompt": A directive video generation prompt (1-3 sentences) describing the artistic motion treatment

Example:
{"variations": [
  {"label": "Ink Wash Flow", "prompt": "Scene dissolves into flowing ink wash animation, subjects rendered as brushstroke silhouettes with ink bleeding across the frame."},
  {"label": "Neon Noir", "prompt": "Reimagined as a neon-drenched noir scene with rain, flickering signs, and dramatic shadows sweeping across the composition."}
]}

**RULES**:
1. Each variation must offer a distinctly different artistic vision.
2. Prompts should describe both the visual STYLE and the MOTION/TRANSFORMATION.
3. Reference elements from the image description but reimagine them creatively.
4. Keep prompts concise but evocative (50-100 words each).
5. Output RAW JSON only. No markdown formatting."""

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )

        response = self.genai_client.models.generate_content(
            model=model_name,
            contents=[system_prompt, f"IMAGE DESCRIPTION:\n{description}"],
            config=gen_config
        )

        # Parse JSON response
        response_text = self._extract_text_from_response(response)
        cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
        result = json.loads(cleaned_text)

        if "variations" in result and isinstance(result["variations"], list):
            return result["variations"]
        elif isinstance(result, list):
            return result
        else:
            # Fallback structure
            return [
                {"label": "Cinematic Pan", "prompt": f"Slow cinematic pan across the scene. {description[:100]}"},
                {"label": "Gentle Zoom", "prompt": f"Gradual zoom into the focal point of the scene. {description[:100]}"},
                {"label": "Atmospheric Shift", "prompt": f"Subtle atmospheric lighting change across the scene. {description[:100]}"},
                {"label": "Subject Motion", "prompt": f"Gentle motion of the main subject within the scene. {description[:100]}"}
            ]

    except json.JSONDecodeError:
        # Fallback if JSON parsing fails
        return [
            {"label": "Cinematic Pan", "prompt": f"Slow cinematic pan across the scene. {description[:100]}"},
            {"label": "Gentle Zoom", "prompt": f"Gradual zoom into the focal point of the scene. {description[:100]}"},
            {"label": "Atmospheric Shift", "prompt": f"Subtle atmospheric lighting change across the scene. {description[:100]}"},
            {"label": "Subject Motion", "prompt": f"Gentle motion of the main subject within the scene. {description[:100]}"}
        ]
    except Exception as e:
        raise Exception(f"Video variations generation failed: {e}")

def generate_image_variation_prompts(self, user_direction: str, image_analysis: str) -> list:
    """Generate 5 distinct image variation prompts from user direction + image analysis.

    Used by the Smart Video Options workflow: the user provides creative
    direction (e.g. "reimagine as different seasons") and the LLM produces
    5 complete image-generation prompts grounded in the original image's
    visual language.

    Returns a list of dicts: [{"label": "...", "prompt": "..."}, ...]
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model_name = config.MODEL_FAST

    system_prompt = """You are an expert Creative Director and Image Prompt Engineer.

**TASK**: Given an original image analysis and the user's creative direction, generate exactly 5 distinct image generation prompts. Each prompt should produce a visually unique variation that follows the user's direction while staying grounded in the original image's visual language, composition, and key elements.

**OUTPUT**: A JSON object with a single key "prompts" containing a list of exactly 5 objects.
Each object has:
- "label": A short, descriptive name for this variation (2-4 words, Title Case)
- "prompt": A complete, self-contained image generation prompt (2-4 sentences) that could be sent directly to an image generation model. Include style, composition, lighting, mood, and subject details.

Example:
{"prompts": [
  {"label": "Golden Hour", "prompt": "A serene mountain landscape bathed in warm golden hour light, with long shadows stretching across alpine meadows. Soft lens flare and atmospheric haze create depth. Photorealistic style with rich warm tones."},
  {"label": "Midnight Blue", "prompt": "The same mountain vista reimagined under a deep midnight blue sky filled with stars. Cool moonlight illuminates snow-capped peaks while bioluminescent wildflowers dot the foreground. Ethereal and dreamlike atmosphere."}
]}

**RULES**:
1. Each variation must be visually distinct from the others — different mood, palette, style, or interpretation.
2. Prompts must be complete and self-contained (don't reference other variations or the "original").
3. Ground each prompt in elements from the image analysis (subject matter, composition, setting).
4. Follow the user's creative direction as the primary guide for variation themes.
5. Each prompt should be 50-100 words, rich in visual detail.
6. Output RAW JSON only. No markdown formatting."""

    user_content = f"""USER CREATIVE DIRECTION: {user_direction}

ORIGINAL IMAGE ANALYSIS:
{image_analysis}"""

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )

        response = self.genai_client.models.generate_content(
            model=model_name,
            contents=[system_prompt, user_content],
            config=gen_config
        )

        # Parse JSON response
        response_text = self._extract_text_from_response(response)
        cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
        result = json.loads(cleaned_text)

        if "prompts" in result and isinstance(result["prompts"], list):
            prompts = result["prompts"]
        elif isinstance(result, list):
            prompts = result
        else:
            raise ValueError("Unexpected response structure")

        # Ensure exactly 5 prompts
        while len(prompts) < 5:
            prompts.append({
                "label": f"Variation {len(prompts) + 1}",
                "prompt": f"{user_direction}. {image_analysis[:150]}"
            })
        return prompts[:5]

    except json.JSONDecodeError:
        # Fallback: create 5 simple variations from user direction
        labels = ["Dramatic", "Ethereal", "Vibrant", "Minimalist", "Surreal"]
        return [
            {"label": labels[i], "prompt": f"{labels[i]} interpretation: {user_direction}. Based on: {image_analysis[:100]}"}
            for i in range(5)
        ]
    except Exception as e:
        raise Exception(f"Image variation prompt generation failed: {e}")

