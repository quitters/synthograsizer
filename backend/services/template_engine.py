import os
import json
import base64
import io
import logging
import time
import requests
import uuid
from datetime import datetime
import asyncio
from pathlib import Path

logger = logging.getLogger(__name__)
from typing import Optional, List, Dict, Any, Union
from backend import config
from backend.utils.retry import retry_on_transient
import google.generativeai as genai
from google import genai as genai_client
from google.genai import types
from PIL import Image
from PIL.PngImagePlugin import PngInfo

def normalize_template(template: dict) -> dict:
    """Normalize a template to the nested value-weight schema.

    Converts old parallel-array format:
      {"values": ["a", "b"], "weights": [3, 2]}
    To new nested object format:
      {"values": [{"text": "a", "weight": 3}, {"text": "b", "weight": 2}]}

    Also handles templates that are already in the new format (no-op).
    If no weights exist, values become simple {"text": "..."} objects (weight defaults to 1 at runtime).
    """
    if not template or "variables" not in template:
        return template

    # Start from a copy so we preserve extra keys (e.g., "story" block)
    normalized = dict(template)
    normalized["promptTemplate"] = template.get("promptTemplate", "")
    normalized["variables"] = []

    for var in template.get("variables", []):
        new_var = {
            "name": var.get("name", ""),
            "feature_name": var.get("feature_name", var.get("name", "")),
            "values": []
        }

        values = var.get("values", [])
        weights = var.get("weights", [])

        if not values:
            normalized["variables"].append(new_var)
            continue

        # Detect format: if first value is a dict with "text", it's already nested
        if isinstance(values[0], dict) and "text" in values[0]:
            new_var["values"] = values  # Already in new format
        elif isinstance(values[0], str):
            # Old flat-array format — convert each string to a {text, weight} object
            for i, val in enumerate(values):
                entry = {"text": val}
                if weights and i < len(weights):
                    entry["weight"] = weights[i]
                new_var["values"].append(entry)
        else:
            # Unknown format, pass through
            new_var["values"] = values

        normalized["variables"].append(new_var)

    return normalized

def generate_template(self, user_prompt: str, model_override: str = None) -> str:
    """
    Generates a Synthograsizer JSON template based on user prompt.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model = model_override or config.MODEL_TEMPLATE_GEN
    
    system_prompt = """
You are a template generator for PromptCraft Sequencer — a VST/synthesizer-inspired real-time prompt engineering tool. Templates are loaded into a 16-step sequencer where each variable can be programmed per-step, creating evolving AI image/video generation prompts. The output uses SD/Comfy-style (term:weight) syntax.

## OUTPUT FORMAT
You MUST respond with valid JSON only.

## TEMPLATE STRUCTURE
Generate a JSON object with this exact structure:
{
  "promptTemplate": "A sentence with {{variable_name}} and {{another_var}} placeholders.",
  "variables": [
{
  "name": "variable_name",
  "feature_name": "Variable Name",
  "values": [
    {"text": "option1", "weight": 3},
    {"text": "option2", "weight": 3},
    {"text": "option3", "weight": 2},
    {"text": "option4", "weight": 1}
  ]
}
  ]
}

## FIELD DEFINITIONS
- **name (Token ID)**: The exact string used inside {{...}} placeholders. Use snake_case (e.g., "cinematic_style"). MUST match the placeholder in promptTemplate exactly.
- **feature_name (Display Label)**: Human-readable Title Case label for the UI. Keep SHORT (1-3 words max) as these appear in a compact sidebar.
- **values**: Array of value objects. Each object MUST have a "text" key. The "weight" key is optional (defaults to 1).

## VALUE OBJECT FORMAT
Each entry in "values" is an object:  {"text": "the value string", "weight": 3}
- "text" (required): The substitution string. These will be wrapped in SD/Comfy weight syntax like (term:1.05) in the final output.
- "weight" (optional): Selection probability. 3-tier rarity system:
   - Common: weight 3 (default)
   - Rare: weight 2
   - Very Rare: weight 1

## SEQUENCER DESIGN PRINCIPLES
Templates are used in a 16-step sequencer. Design variables with this in mind:
1. **8-12 values per variable** — enough for interesting 16-step patterns with repetition and variation.
2. **Transition-friendly values** — adjacent values in the list should create visually smooth or dramatically interesting transitions when the sequencer steps through them.
3. **Complementary variables** — variables should interact well. E.g., a "lighting" variable that pairs naturally with a "time_of_day" variable.
4. **Lockable anchors** — include 1-2 "safe" values per variable that work well as locked constants (the user can lock any variable to keep it consistent while other variables sequence).
5. **Descriptive text values** — each value should be a clear, evocative phrase (2-6 words) that an AI image generator can interpret. Avoid single generic words.

## CRITICAL RULES
1. **Variable Count**: 4-7 variables is the sweet spot for the sequencer UI.
2. **Placeholder Matching**: {{art_style}} requires name: "art_style" (EXACT match!)
3. **Values Array**: 8-12 diverse value objects per variable. Each MUST be {"text": "...", "weight": N}.
4. **No parallel arrays**: Do NOT use separate "weights" array. Weight is nested inside each value object.
5. **Sentence Structure**: promptTemplate should be a complete, readable prompt sentence that produces good AI-generated imagery when variables are substituted.
6. **Avoid redundancy**: Each variable should control a distinct visual dimension (e.g., don't have both "style" and "aesthetic" variables with overlapping values).

## EXAMPLES
CORRECT:
  "values": [{"text": "volumetric god rays", "weight": 3}, {"text": "harsh chiaroscuro", "weight": 2}, {"text": "bioluminescent ambient glow", "weight": 1}]

WRONG (parallel arrays — NEVER use this):
  "values": ["cinematic", "noir"], "weights": [3, 2]
"""
    
    try:
         # Use json mode if available or just prompt engineering
         gen_config = types.GenerateContentConfig(
             response_mime_type="application/json"
         )
         
         response = self.genai_client.models.generate_content(
            model=model,
            contents=[system_prompt, f"User Request: {user_prompt}"],
            config=gen_config
         )
         return response.text
    except Exception as e:
        raise Exception(f"Template generation failed: {e}")

def generate_template_from_analysis(self, analysis_text: str, model_override: str = None) -> str:
    """
    Generates a Synthograsizer JSON template based on an image analysis description.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model = model_override or config.MODEL_TEMPLATE_GEN
    
    system_prompt = """
You are a template generator for PromptCraft Sequencer — a 16-step prompt sequencer for AI image/video generation. Your task is to convert image analysis into a sequencer-ready template.

## GOAL
Create a template that captures the analyzed image's aesthetic as a sequenceable prompt. The user will program 16-step patterns where variables change per step, creating evolving visual sequences.

## INSTRUCTIONS
1. **Analyze the Description**: Identify the core structure (Medium, Style, Composition) and the variable elements (Subject, Setting, Colors, Lighting).
2. **Create Variables**: Select 4-7 key elements to turn into variables. Each controls a distinct visual dimension.
3. **Preserve Originals**: Include the specific term found in the analysis as the FIRST value.
4. **Add Variations**: Add 7-11 creative alternatives (8-12 total values per variable) designed for smooth sequencer transitions.
5. **Assign Weights**: Nest the weight inside each value object using the 3-tier rarity system:
   - Common: weight 3 (default — original values and typical alternatives)
   - Rare: weight 2 (less common alternatives)
   - Very Rare: weight 1 (unusual or exotic alternatives)

## OUTPUT FORMAT
You MUST respond with valid JSON only:
{
  "promptTemplate": "A [medium] of {{subject}} in {{setting}}, {{lighting}} lighting...",
  "variables": [
{
  "name": "subject",
  "feature_name": "Subject",
  "values": [
    {"text": "original_subject", "weight": 3},
    {"text": "alt_1", "weight": 3},
    {"text": "alt_2", "weight": 2},
    {"text": "exotic_alt", "weight": 1}
  ]
}
  ]
}

## VALUE OBJECT FORMAT
Each entry in "values" is: {"text": "the value string", "weight": N}
- "text" (required): The substitution string. Should be a descriptive phrase (2-6 words) that AI generators can interpret. These get wrapped in SD/Comfy (term:weight) syntax.
- "weight" (optional, defaults to 1): Selection probability integer.
- Do NOT use separate parallel "weights" array — weight is always inside the value object.

## FIELD DEFINITIONS
- **name (Token ID)**: snake_case string inside {{...}} placeholders. MUST match placeholder exactly.
- **feature_name (Display Label)**: SHORT Title Case label (1-3 words) for the compact sidebar UI.

## SEQUENCER DESIGN
- Values are used in a 16-step sequencer — 8-12 values per variable allows interesting patterns
- Adjacent values should create smooth or dramatically interesting visual transitions
- Include 1-2 "neutral" values per variable that work well as locked constants
"""

    try:
         gen_config = types.GenerateContentConfig(
             response_mime_type="application/json"
         )

         response = self.genai_client.models.generate_content(
            model=model,
            contents=[system_prompt, f"Image Analysis: {analysis_text}"],
            config=gen_config
         )
         return response.text
    except Exception as e:
        raise Exception(f"Template generation failed: {e}")

def generate_template_hybrid(self, image_bytes: bytes, direction: str, model_override: str = None) -> str:
    """
    Generate a template from an image's aesthetic + user's structural direction.
    The image defines the style baseline; the text defines the variable structure.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    # Step 1: Analyze image for aesthetic/style
    analysis = self.analyze_image_to_prompt(image_bytes)

    # Step 2: Generate template using both analysis + direction
    model = model_override or config.MODEL_TEMPLATE_GEN

    system_prompt = """You are a template generator for PromptCraft Sequencer — a VST-inspired 16-step prompt sequencer for AI image/video generation.
You are working in HYBRID mode: you have been given an IMAGE ANALYSIS (describing an image's visual style and aesthetic) and a USER DIRECTION (describing what kind of template structure and variables the user wants).

## YOUR TASK
1. Use the IMAGE ANALYSIS to define the AESTHETIC BASELINE — bake the style, medium, color palette, mood into the promptTemplate as fixed text.
2. Use the USER DIRECTION to define the VARIABLE STRUCTURE — what elements to make customizable.
3. The template should feel like variations within the image's aesthetic world, designed for 16-step sequencer patterns.

## OUTPUT FORMAT
You MUST respond with valid JSON only.

## TEMPLATE STRUCTURE
{
  "promptTemplate": "A sentence incorporating the image's style with {{variable_name}} placeholders.",
  "variables": [
{
  "name": "variable_name",
  "feature_name": "Variable Name",
  "values": [
    {"text": "option1", "weight": 3},
    {"text": "option2", "weight": 2},
    {"text": "option3", "weight": 1}
  ]
}
  ]
}

## VALUE OBJECT FORMAT
Each entry in "values" is: {"text": "the value string", "weight": N}
- "text" (required): Descriptive phrase (2-6 words) for AI generation. Gets wrapped in SD/Comfy (term:weight) syntax.
- "weight" (optional, defaults to 1): 3-tier rarity — Common: 3, Rare: 2, Very Rare: 1.
- Do NOT use a separate parallel "weights" array.

## CRITICAL RULES
1. **Variable Count**: 4-7 variables is the sweet spot for the sequencer UI.
2. **Placeholder Matching**: {{art_style}} requires name: "art_style" (EXACT match, snake_case)
3. **Values Array**: 8-12 diverse value objects per variable. Each MUST be {"text": "...", "weight": N}.
4. **No parallel arrays**: Weight is always nested inside the value object.
5. **feature_name**: SHORT Title Case label (1-3 words) for the compact sidebar UI.
6. **Aesthetic Integration**: The promptTemplate MUST embed the image's core aesthetic as fixed text, NOT as a variable.
7. **Sequencer-friendly**: Values should create smooth transitions when stepped through. Include 1-2 neutral/lockable values per variable.
"""

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )

        response = self.genai_client.models.generate_content(
            model=model,
            contents=[system_prompt, f"IMAGE ANALYSIS:\n{analysis}\n\nUSER DIRECTION:\n{direction}"],
            config=gen_config
        )
        return response.text
    except Exception as e:
        raise Exception(f"Hybrid template generation failed: {e}")

def generate_template_from_images(self, images_list: list, direction: str = None, model_override: str = None) -> str:
    """
    Extract a common aesthetic pattern from multiple images and generate a template.
    Shared traits become fixed text; differences become variables.
    Optional direction text lets the user steer variable structure and template focus.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    # Step 1: Analyze each image
    analyses = []
    for i, img_bytes in enumerate(images_list):
        try:
            analysis = self.analyze_image_to_prompt(img_bytes)
            analyses.append(analysis)
        except Exception as e:
            analyses.append(f"(Analysis failed for image {i+1}: {str(e)})")

    # Step 2: Feed all analyses to template generator
    model = model_override or config.MODEL_TEMPLATE_GEN

    system_prompt = """You are a template generator for PromptCraft Sequencer — a VST-inspired 16-step prompt sequencer for AI image/video generation.
You are working in MULTI-IMAGE PATTERN EXTRACTION mode. You have been given analyses of MULTIPLE images. Your task is to identify what is COMMON across all images (the shared aesthetic) and what VARIES between them (the template variables).

## YOUR TASK
1. **Find the Common Thread**: Identify shared style, medium, mood, technique across ALL images. This becomes fixed text in promptTemplate.
2. **Identify Axes of Variation**: What DIFFERS between images becomes template variables. Each should control a distinct visual dimension.
3. **Build a Cohesive Template**: Shared aesthetic as fixed text, with {{variable}} placeholders for varying elements.
4. **Populate Values**: Observed values from images FIRST, then creative alternatives to fill 8-12 total values per variable. Design values for smooth 16-step sequencer transitions.

## OUTPUT FORMAT
You MUST respond with valid JSON only.

## TEMPLATE STRUCTURE
{
  "promptTemplate": "Shared aesthetic description with {{variable_name}} placeholders for varying elements.",
  "variables": [
{
  "name": "variable_name",
  "feature_name": "Variable Name",
  "values": [
    {"text": "observed_value_1", "weight": 3},
    {"text": "observed_value_2", "weight": 3},
    {"text": "creative_alt_1", "weight": 2},
    {"text": "exotic_alt", "weight": 1}
  ]
}
  ]
}

## VALUE OBJECT FORMAT
Each entry in "values" is: {"text": "the value string", "weight": N}
- "text" (required): Descriptive phrase (2-6 words) for AI generation. Gets wrapped in SD/Comfy (term:weight) syntax.
- "weight" (optional, defaults to 1): 3-tier rarity — Common: 3, Rare: 2, Very Rare: 1.
- Observed values from images should default to weight 3.
- Do NOT use a separate parallel "weights" array.

## CRITICAL RULES
1. **Variable Count**: 4-7 variables is the sweet spot for the sequencer UI.
2. **Placeholder Matching**: {{subject_type}} requires name: "subject_type" (EXACT match, snake_case)
3. **Values Array**: 8-12 diverse value objects per variable. Each MUST be {"text": "...", "weight": N}.
4. **No parallel arrays**: Weight is always nested inside the value object.
5. **feature_name**: SHORT Title Case label (1-3 words) for the compact sidebar UI.
6. **If images have NO clear commonality**: Focus on most frequently shared traits.
7. **Sequencer-friendly**: Include 1-2 neutral/lockable values per variable. Adjacent values should create interesting transitions.
"""

    combined = "\n\n".join([f"IMAGE {i+1} ANALYSIS:\n{a}" for i, a in enumerate(analyses)])

    # Append optional creative direction from the user
    if direction:
        combined += (
            "\n\n## CREATIVE DIRECTION\n"
            "The user has also provided this creative direction — use it to shape "
            "the variable structure and template focus:\n" + direction
        )

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )

        response = self.genai_client.models.generate_content(
            model=model,
            contents=[system_prompt, combined],
            config=gen_config
        )
        return response.text
    except Exception as e:
        raise Exception(f"Multi-image template generation failed: {e}")

def remix_template(self, current_template: dict, instruction: str, reference_images: list = None, model_override: str = None) -> str:
    """
    Evolve an existing template based on user instructions.
    Preserves elements the user doesn't explicitly ask to change.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model = model_override or config.MODEL_TEMPLATE_GEN

    system_prompt = """You are a template editor for PromptCraft Sequencer — a VST-inspired 16-step prompt sequencer for AI image/video generation.
You are working in REMIX mode. You have been given an EXISTING template (JSON) and USER INSTRUCTIONS for how to modify it.

## YOUR TASK
1. **Parse** the current template structure (promptTemplate + variables).
2. **Apply** the user's instructions precisely:
   - Add new variables if requested
   - Remove variables if requested
   - Modify variable values, names, or weights if requested
   - Update the promptTemplate text if needed
3. **Preserve** everything the user does NOT mention — do not remove or alter existing variables, values, or template text unless the instruction explicitly asks for it.
4. **Maintain Schema Compliance**: The output must use the nested value-weight object format.

## OUTPUT FORMAT
You MUST respond with valid JSON only.

## TEMPLATE STRUCTURE
{
  "promptTemplate": "Updated sentence with {{variable_name}} placeholders.",
  "variables": [
{
  "name": "variable_name",
  "feature_name": "Variable Name",
  "values": [
    {"text": "option1", "weight": 3},
    {"text": "option2", "weight": 2},
    {"text": "option3", "weight": 1}
  ]
}
  ]
}

## VALUE OBJECT FORMAT
Each entry in "values" is: {"text": "the value string", "weight": N}
- "text" (required): Descriptive phrase (2-6 words) for AI generation. Gets wrapped in SD/Comfy (term:weight) syntax.
- "weight" (optional, defaults to 1): 3-tier rarity — Common: 3, Rare: 2, Very Rare: 1.
- Do NOT use a separate parallel "weights" array.

## CRITICAL RULES
1. **Variable Count**: 4-7 variables is the sweet spot for the sequencer UI.
2. **Placeholder Matching**: Every {{name}} MUST have a matching variable (snake_case)
3. **Values Array**: 8-12 diverse value objects per variable. Each MUST be {"text": "...", "weight": N}.
4. **No parallel arrays**: Weight is always nested inside the value object.
5. **feature_name**: SHORT Title Case label (1-3 words) for the compact sidebar UI.
6. **PRESERVATION**: If the user says "add a time_of_day variable", keep ALL existing variables intact — only ADD the new variable.
7. **Incoming template format**: The input template may use either the old parallel-array format or the new nested format. Always OUTPUT the new nested format regardless of input format.
8. **Sequencer-friendly**: When adding new variables, include 8-12 values with smooth transitions. Include 1-2 neutral/lockable values.
9. **Reference Images**: If reference images are attached, the user's instructions will explain their purpose (e.g., character reference, aesthetic palette, current vs. desired output). Use the images as visual context for your modifications — extract colors, styles, compositions, or character traits as directed by the instruction text. Do not describe the images in the output unless the user asks for it.
"""

    template_json = json.dumps(current_template, indent=2)

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )

        contents = [system_prompt, f"CURRENT TEMPLATE:\n{template_json}\n\nINSTRUCTIONS:\n{instruction}"]

        if reference_images:
            image_notes = []
            for i, img_bytes in enumerate(reference_images):
                mime = "image/png" if img_bytes[:4] == b"\x89PNG" else "image/jpeg"
                contents.insert(-1, types.Part.from_bytes(data=img_bytes, mime_type=mime))
                image_notes.append(f"Image {i+1}")
            contents.append(
                f"REFERENCE IMAGES: {len(reference_images)} image(s) attached ({', '.join(image_notes)}). "
                "Use these as visual context when applying the user's remix instructions. "
                "The user's text explains how to interpret them."
            )

        response = self.genai_client.models.generate_content(
            model=model,
            contents=contents,
            config=gen_config
        )
        return response.text
    except Exception as e:
        raise Exception(f"Template remix failed: {e}")

def generate_story_template(self, user_prompt: str, model_override: str = None) -> str:
    """
    Story Template Generator — Bespoke-Beat Storyboard Mode.
    Generates a Synthograsizer template with N narratively distinct per-beat prompts
    sharing world/character/style anchors. Designed for storyboard-driven
    short film production (e.g. 12 beats × 8s = 96s).
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model = model_override or config.MODEL_TEMPLATE_GEN

    # ── Infer target_beats and beat_duration_s from user prompt ──
    import re as _re
    beats_match = _re.search(r'(\d+)\s*(?:beats?|clips?|shots?|scenes?|frames?)', user_prompt, _re.IGNORECASE)
    target_beats = int(beats_match.group(1)) if beats_match else 12

    dur_match = _re.search(r'(\d+)\s*(?:sec(?:ond)?s?|s)\s*(?:per\s*)?(?:beat|clip|each)', user_prompt, _re.IGNORECASE)
    beat_duration_s = int(dur_match.group(1)) if dur_match else 8

    total_duration = target_beats * beat_duration_s

    system_prompt = f"""You are a cinematic storyboard writer and art director for an AI short-film tool.

## YOUR TASK
The user gives you a story concept. You produce a JSON template that drives a visual storyboard:
- {target_beats} BESPOKE beat prompts (each a unique shot with its own framing, action, and prose)
- Shared ANCHORS (style, world, palette) substituted into every beat via {{{{anchor_key}}}} placeholders
- Character descriptions referenced via {{{{character_id}}}} placeholders
- A 3-act structure mapping beats to acts
- Optionally 0-3 knob-twist variables for cross-beat tuning

Target: {total_duration}s short film ({target_beats} clips × {beat_duration_s}s each).

## OUTPUT FORMAT
Respond with valid JSON only. The JSON has this structure:

{{
  "story": {{
    "title": "Story Title",
    "logline": "One-sentence summary of the narrative.",
    "duration_seconds": {total_duration},
    "beat_duration_seconds": {beat_duration_s},

    "anchors": {{
      "style": "painterly cinematic, oil-painting texture, warm desaturated palette, anamorphic widescreen",
      "world": "1880s frontier town at sunset, dust-blown empty streets, drifting embers",
      "palette": "burnt sienna, ochre, deep indigo shadows, gold-leaf highlights"
    }},

    "characters": [
      {{
        "id": "sheriff",
        "name": "Sheriff Reeves",
        "anchors": "weathered 50s man, gray-streaked beard, dark duster coat, tarnished tin star badge, leather gun belt, deep-set weary eyes, dust on boots"
      }}
    ],

    "acts": [
      {{"name": "Act 1 — The Wait", "beats": [1, 2, 3, 4]}},
      {{"name": "Act 2 — The Confrontation", "beats": [5, 6, 7, 8]}},
      {{"name": "Act 3 — The Reckoning", "beats": [9, 10, 11, 12]}}
    ],

    "beats": [
      {{
        "id": 1,
        "shot": "Wide establishing",
        "purpose": "Set the world. Empty street, sense of dread.",
        "prompt": "Wide establishing shot of {{{{world}}}}. Street is empty. Weather-vane creaking, tumbleweed drifts past a leaning saloon sign. {{{{style}}}}.",
        "characters": []
      }},
      {{
        "id": 2,
        "shot": "Medium tracking",
        "purpose": "Introduce the sheriff. Show his readiness.",
        "prompt": "Medium tracking shot of {{{{sheriff}}}} walking down the empty street, hand near holster, eyes fixed forward, dust kicking from boots. {{{{world}}}}. {{{{style}}}}.",
        "characters": ["sheriff"]
      }}
    ]
  }},

  "promptTemplate": "{{{{__beat__}}}} | tension: {{{{tension}}}}",
  "variables": [
    {{
      "name": "tension",
      "feature_name": "Tension",
      "values": [
        {{"text": "uneasy quiet", "weight": 3}},
        {{"text": "rising dread", "weight": 2}},
        {{"text": "razor-edge stillness", "weight": 1}}
      ]
    }}
  ]
}}

## ANCHOR RULES
- story.anchors MUST include "style" and "world". "palette" is optional.
- Each anchor is a dense, AI-image-generator-ready phrase (30-80 words).
- Anchors are substituted into every beat via {{{{style}}}}, {{{{world}}}}, {{{{palette}}}} placeholders.
- They ensure visual consistency across all beats without repeating the same sentence structure.

## CHARACTER RULES
- Each character has "id" (snake_case), "name", and "anchors" (50-100 word visual description).
- Characters are referenced in beat prompts via {{{{character_id}}}} (e.g. {{{{sheriff}}}}).
- The "characters" array in each beat lists which character IDs appear in that beat.

## BEAT RULES — CRITICAL
- Write EXACTLY {target_beats} beat objects in story.beats[].
- Each beat MUST have a UNIQUE, BESPOKE prompt — different shot type, different framing, different action.
- Each beat must advance the story. No two beats should describe the same moment.
- Each beat prompt should reference shared anchors via {{{{style}}}}, {{{{world}}}} etc.
- Each beat prompt should reference characters via {{{{character_id}}}}.
- Vary shot types across beats: wide, medium, close-up, POV, low-angle, overhead, tracking, etc.
- Each beat has a clear "purpose" — what narrative function it serves.

### POSITIVE EXAMPLE (GOOD — each beat is distinct):
Beat 1: "Wide establishing shot of {{{{world}}}}. Street is empty."
Beat 2: "Medium tracking shot of {{{{sheriff}}}} walking down the street."
Beat 3: "Close-up of {{{{sheriff}}}}'s hand hovering over holster."
Beat 4: "POV from a saloon window — dust swirls, a figure approaches."

### NEGATIVE EXAMPLE (BAD — do NOT do this):
Beat 1: "A shot of {{{{character}}}} in {{{{environment}}}}, {{{{mood}}}} atmosphere."
Beat 2: "A shot of {{{{character}}}} in {{{{environment}}}}, {{{{mood}}}} atmosphere."
Beat 3: "A shot of {{{{character}}}} in {{{{environment}}}}, {{{{mood}}}} atmosphere."
(Same structure repeated — this defeats the entire purpose of bespoke beats!)

## ACT RULES
- Divide {target_beats} beats into 3 acts (or 2-5 if the story warrants).
- Each act has "name" and "beats" (array of beat IDs belonging to that act).
- Acts provide narrative pacing: setup → confrontation → resolution.

## KNOB-TWIST VARIABLES (OPTIONAL)
- Include 0-3 variables in the "variables" array for cross-beat tuning.
- These are global knobs (tension, color shift, mood overlay) that re-substitute into prompts.
- The "promptTemplate" field is a synthetic template: "{{{{__beat__}}}} | varname: {{{{varname}}}}"
- {{{{__beat__}}}} is a special placeholder replaced by the beat's expanded prompt at runtime.
- Many stories need ZERO knob-twist variables — include them only when a global parameter genuinely makes narrative sense.
- Use nested object format: {{"text": "value", "weight": N}} — never parallel arrays.

## CRITICAL RULES
1. Output valid JSON only. No markdown, no comments, no explanation.
2. Every beat prompt must be narratively distinct — different shot, different action, different prose.
3. Anchors carry visual continuity. Beat prompts carry narrative progression.
4. Characters referenced by {{{{id}}}} in prompts — the system substitutes their anchor text.
5. Beat IDs are sequential integers starting from 1.
"""

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )

        response = self.genai_client.models.generate_content(
            model=model,
            contents=[system_prompt, f"Story Concept: {user_prompt}"],
            config=gen_config
        )
        return response.text
    except Exception as e:
        raise Exception(f"Story template generation failed: {e}")

def generate_story_beat(self, current_template: dict, target_beat_id: int, direction: str = None, model_override: str = None,
                        prev_image_b64: str = None, next_image_b64: str = None) -> str:
    """
    Regenerate a single beat within a bespoke-beat story template.
    Returns just the replacement beat object (JSON).

    If prev_image_b64 / next_image_b64 are supplied (base64-encoded images of
    the rendered adjacent beats), they're attached to the LLM call as
    multimodal context so the new beat can be visually continuous with the
    surrounding shots.  Text continuity (anchors, characters, ±1 beat
    descriptions) still drives the brief — images anchor consistency.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model = model_override or config.MODEL_TEMPLATE_GEN

    story = current_template.get("story", {})
    beats = story.get("beats", [])
    anchors = story.get("anchors", {})
    characters = story.get("characters", [])

    # Find the target beat
    target_beat = None
    for b in beats:
        if b.get("id") == target_beat_id:
            target_beat = b
            break

    # Build context: adjacent beats for narrative continuity
    prev_beat = next((b for b in beats if b.get("id") == target_beat_id - 1), None)
    next_beat = next((b for b in beats if b.get("id") == target_beat_id + 1), None)

    context_parts = []
    context_parts.append(f"Story title: {story.get('title', 'Untitled')}")
    context_parts.append(f"Logline: {story.get('logline', '')}")
    context_parts.append(f"Anchors: {json.dumps(anchors)}")
    context_parts.append(f"Characters: {json.dumps(characters)}")
    if prev_beat:
        context_parts.append(f"Previous beat (id {prev_beat['id']}): shot={prev_beat.get('shot','')}, purpose={prev_beat.get('purpose','')}, prompt={prev_beat.get('prompt','')}")
    if target_beat:
        context_parts.append(f"Current beat (id {target_beat_id}): shot={target_beat.get('shot','')}, purpose={target_beat.get('purpose','')}, prompt={target_beat.get('prompt','')}")
    if next_beat:
        context_parts.append(f"Next beat (id {next_beat['id']}): shot={next_beat.get('shot','')}, purpose={next_beat.get('purpose','')}, prompt={next_beat.get('prompt','')}")

    direction_text = f"\nUser direction: {direction}" if direction else ""

    system_prompt = f"""You are a cinematic storyboard writer. Regenerate a single beat in an existing storyboard.

## CONTEXT
{chr(10).join(context_parts)}
{direction_text}

## TASK
Write a NEW replacement beat object for beat ID {target_beat_id}. The beat must:
1. Be narratively distinct from adjacent beats (different shot type, different framing).
2. Reference shared anchors via {{{{anchor_key}}}} placeholders (e.g. {{{{style}}}}, {{{{world}}}}).
3. Reference characters via {{{{character_id}}}} placeholders.
4. Advance the story and serve a clear narrative purpose.
5. If user direction is provided, incorporate it.

## OUTPUT FORMAT
Respond with valid JSON only — a single beat object:
{{
  "id": {target_beat_id},
  "shot": "Shot type label",
  "purpose": "What this beat accomplishes narratively.",
  "prompt": "The bespoke image prompt for this beat with {{{{anchor}}}} and {{{{character}}}} placeholders.",
  "characters": ["character_id_1"]
}}
"""

    # Optional: multimodal continuity — attach rendered adjacent beat images
    # so the LLM can see what's actually on screen, not just our prompt text.
    contents = [system_prompt]
    image_notes = []
    for label, b64 in (("PREVIOUS BEAT", prev_image_b64), ("NEXT BEAT", next_image_b64)):
        if not b64:
            continue
        try:
            import base64 as _b64
            raw = _b64.b64decode(b64)
            mime = "image/png" if raw[:4] == b"\x89PNG" else "image/jpeg"
            contents.append(types.Part.from_bytes(data=raw, mime_type=mime))
            image_notes.append(f"{label} image attached above")
        except (ValueError, TypeError, base64.binascii.Error) as exc:
            # Bad payload — skip image, fall back to text-only.
            logger.warning("Skipping malformed %s image attachment: %s", label, exc)

    if image_notes:
        contents.append(
            "VISUAL CONTINUITY: " + "; ".join(image_notes)
            + ". Treat these images as references for character appearance, lighting, "
              "and world detail — the new beat should be consistent with them but distinct in framing/action."
        )

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )

        response = self.genai_client.models.generate_content(
            model=model,
            contents=contents,
            config=gen_config
        )
        return response.text
    except Exception as e:
        raise Exception(f"Story beat regeneration failed: {e}")

def generate_p5_template(self, user_prompt: str, image_bytes: bytes = None, model_override: str = None) -> str:
    """
    Generate a complete p5.js generative art template with Synthograsizer-controllable variables.
    The sketch code uses instance mode (p. prefix) and reads live variable values via p.getSynthVar().
    An optional reference image can be provided for color palette / aesthetic guidance.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model = model_override or config.MODEL_TEMPLATE_GEN

    system_prompt = """You are a creative coder generating p5.js generative art templates for the Synthograsizer system.

## RUNTIME CONTRACT
The sketch runs in a sandboxed iframe using p5.js 1.9.4 in INSTANCE MODE.
Your code is wrapped automatically: new p5(function(p) { YOUR_CODE });
- All p5 built-ins MUST be called via p: p.setup, p.draw, p.background(), p.fill(), p.frameCount, etc.
- p.getSynthVar('variable_name') returns the currently selected string value, or null.
- Variables are switched live by the user — p.draw() reads them every frame.
- p.drawingContext gives you the raw Canvas 2D API (createRadialGradient, clip, createLinearGradient, etc.)
- NO external assets — p.loadImage() from URLs fails in the sandbox. Do not use it.
- Canvas: call p.createCanvas(800, 800) in p.setup (or another square fixed size).
- Animation: use p.frameCount for time-based motion. p.draw() is called ~60fps.

## REQUIRED PATTERN: LOOKUP MAPS
Define all parameter mappings as const objects at the TOP of p5Code (before p.setup).
Resolve getSynthVar ONCE per frame at the top of p.draw, always with a fallback value:

  const PALETTE_MAP = {
    'warm embers':   [[220,80,40],  [255,160,60],[180,40,20]],
    'cool arctic':   [[40,120,200], [80,180,240],[20,60,120]],
    'acid neon':     [[0,255,100],  [200,255,0], [0,200,255]],
    // ... one entry per variable value, keys EXACTLY matching "text" in variables array
  };

  p.draw = function() {
    var palKey = p.getSynthVar('color_palette') || 'warm embers';
    var pal    = PALETTE_MAP[palKey] || PALETTE_MAP['warm embers'];
    // use pal[0], pal[1], pal[2] as RGB arrays
    p.background(pal[0][0], pal[0][1], pal[0][2]);
  };

## OUTPUT FORMAT — respond with valid JSON only:
{
  "name": "Descriptive Sketch Name",
  "promptTemplate": "A {{style_type}} generative animation with {{color_palette}} and {{motion_style}} movement",
  "p5Code": "const PALETTE_MAP = {...};\n\np.setup = function() {\n  p.createCanvas(800, 800);\n};\n\np.draw = function() {\n  ...\n};",
  "variables": [
    {
      "name": "color_palette",
      "feature_name": "Palette",
      "values": [
        {"text": "warm embers",    "weight": 3},
        {"text": "cool arctic",    "weight": 3},
        {"text": "acid neon",      "weight": 2},
        {"text": "monochrome ink", "weight": 2},
        {"text": "deep ocean",     "weight": 2},
        {"text": "golden hour",    "weight": 1},
        {"text": "toxic bloom",    "weight": 1},
        {"text": "midnight rose",  "weight": 1}
      ]
    }
  ]
}

## VARIABLE DESIGN RULES
- 4-7 variables, each controlling a distinct visual dimension (color, form, motion, density, atmosphere, pattern, symmetry...)
- 8-12 values per variable — descriptive string LABELS, NOT raw numbers
- Every lookup map key MUST exactly match a "text" entry in the corresponding variable's values array
- Adjacent values in the array should produce coherent visual transitions (good for sequencer stepping)
- Weights: Common=3, Rare=2, Very Rare=1. Include 1-2 stable/neutral values per variable as lockable anchors.

## CODE QUALITY RULES
- p5Code must be COMPLETE and SELF-CONTAINED — no TODOs, no placeholder comments like "// add more"
- Every getSynthVar call must have a fallback: p.getSynthVar('x') || 'default_value'
- Every lookup map access must have a fallback: MAP[key] || MAP['first_key']
- Smooth animation — use p.lerp(), Math.sin(p.frameCount * speed), or easing; avoid hard jumps
- Clear the background each frame unless intentional trails (comment if so)
- Use p.push() / p.pop() for state isolation; p.translate() / p.rotate() for transforms
- No console.log, no alert, no document.write, no external dependencies"""

    # Build content list — image first if provided (for palette/style reference)
    contents = []

    if image_bytes:
        import base64 as _b64
        img_b64 = _b64.b64encode(image_bytes).decode("utf-8")
        # Detect mime type (default jpeg)
        mime = "image/jpeg"
        if image_bytes[:4] == b'\x89PNG':
            mime = "image/png"
        elif image_bytes[:4] in (b'GIF8', b'GIF9'):
            mime = "image/gif"
        elif image_bytes[:2] == b'BM':
            mime = "image/bmp"

        from google.genai import types as _types
        contents.append(_types.Part.from_bytes(data=image_bytes, mime_type=mime))
        contents.append(
            "Use the image above as a color palette and aesthetic reference for this generative sketch. "
            "Extract the dominant colors and mood, then embed them as one of the variable options (e.g., the first or default value in a palette variable).\n\n"
            f"Sketch Description: {user_prompt}"
        )
    else:
        contents = [system_prompt, f"Sketch Description: {user_prompt}"]

    if image_bytes:
        # Prepend system prompt as first content element when using multimodal
        contents.insert(0, system_prompt)

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )
        response = self.genai_client.models.generate_content(
            model=model,
            contents=contents,
            config=gen_config
        )
        return response.text
    except Exception as e:
        raise Exception(f"p5.js template generation failed: {e}")

def generate_taste_vector(self, artifacts: list, model_override: str = None) -> str:
    """
    Mines a sample of the user's creative artifacts (saved templates, agent bios,
    image prompts, chat fragments, presets) and extracts a portable "taste vector"
    JSON profile capturing voice, aesthetic, and creative tendencies.

    artifacts: list of dicts. Each dict must include:
      - kind:  'template' | 'agent_bio' | 'image_prompt' | 'chat_message' | 'preset' | 'other'
      - text:  the artifact's textual content
      - meta:  (optional) dict with extra context — name, variables, weights, source path
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    if not artifacts:
        raise ValueError("artifacts list is empty — nothing to mine")

    model = model_override or config.MODEL_TEMPLATE_GEN

    system_prompt = """You are an aesthetic anthropologist analyzing a creator's body of work. Your task is to extract a concise but vivid "taste vector" — a portable JSON profile capturing their voice, sensibility, and creative tendencies. This vector will be used downstream to bias the generation of new outputs (agent personas, prompts, recipes) so they feel personal rather than generic.

You will be given a sample of artifacts: prompts they've written, agents they've designed, templates they've saved. Read across the whole set, not item by item. You are looking for patterns, not summaries.

Output STRICTLY valid JSON in this shape:

{
  "voice": {
    "register": "single sentence describing their tone (e.g. 'wry, literate, slightly bruised — favors specificity over abstraction')",
    "diction": ["3–6 distinctive words or phrases that recur or feel signature"],
    "sentence_shape": "single sentence on rhythm and structure (e.g. 'short fragments stacked into rhythm; resists run-ons')"
  },
  "aesthetic": {
    "themes": ["3–6 recurring subjects or emotional territories"],
    "palette": "concrete colour/light tendency (e.g. 'high-contrast, desaturated greens and bruised purples; rare red')",
    "texture": "material/surface tendency (e.g. 'analog noise over clean geometry')",
    "scale": "how big or intimate things tend to feel (e.g. 'domestic objects rendered with cosmic gravity')"
  },
  "tendencies": {
    "favors": ["3–6 things they reach for: techniques, archetypes, framings, devices"],
    "avoids": ["2–4 things conspicuously absent or actively resisted"],
    "tensions": "single sentence naming a productive contradiction (e.g. 'wants the sacred and the ridiculous in the same frame')"
  },
  "voice_signature": "1–2 sentences written IN their own register. The litmus test: a stranger reading this should be able to recognise their next piece."
}

Hard rules:
- Be specific. "Atmospheric" is useless; "fluorescent-lit interiors at 3am" is signal.
- Quote distinctive phrasing only as fragments; never copy more than a few words.
- `tendencies.avoids` is the most diagnostic field — what they DON'T do separates them from neighbours. Work to fill it honestly.
- If the sample is thin or contradictory, say so plainly inside `voice_signature` rather than inventing.
- Do not flatter. Do not generalise. Do not pad. The vector should feel uncomfortably accurate."""

    bundle_lines = [f"# Sample of {len(artifacts)} artifact(s)"]
    for i, art in enumerate(artifacts, start=1):
        if not isinstance(art, dict):
            continue
        kind = art.get("kind", "other")
        text = (art.get("text") or "").strip()
        if not text:
            continue
        meta = art.get("meta")
        bundle_lines.append(f"\n## Artifact {i} — kind: {kind}")
        if meta:
            try:
                bundle_lines.append(f"_meta: {json.dumps(meta, ensure_ascii=False)[:400]}_")
            except Exception:
                pass
        bundle_lines.append(text[:1500])

    bundle = "\n".join(bundle_lines)
    contents = [system_prompt, bundle]

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )
        response = self.genai_client.models.generate_content(
            model=model,
            contents=contents,
            config=gen_config
        )
        return response.text
    except Exception as e:
        raise Exception(f"Taste vector extraction failed: {e}")


_AGENT_PROFILE_STRUCTURAL_PREAMBLE = """You are an expert agent persona designer for Agent Studio, a collaborative multi-agent simulation framework. Your task is to generate or refine an "Agent Profile" — a dynamic, variable-driven character biography template.

The output MUST be valid JSON containing exactly this structure:
{
  "name": "A catchy, thematic name for the agent",
  "category": "One of: imagegen, creative, writing, business, tech, gaming, education, science, philosophy, social, utility",
  "description": "One-sentence summary shown on library cards.",
  "bioTemplate": "A multi-sentence biography containing {{variable_name}} placeholders where dynamic traits, tones, or approaches go. Always include {{agent_name}} as an anchor.",
  "variables": [
    {
      "name": "variable_name",
      "feature_name": "Human Readable Feature Name (e.g. Tone, Logic Style, Approach)",
      "values": [
        {"text": "Option 1 description", "weight": 3},
        {"text": "Option 2 description", "weight": 1}
      ]
    }
  ],
  "anchors": {
    "agent_name": "The agent's name"
  }
}

Structural rules (always enforced — never violate these):
1. bioTemplate MUST contain at least 3 distinct {{variable_name}} placeholders. Each placeholder must match a variable entry by name.
2. Every variable must have 3 to 6 values. Distribute weights so 1-2 options have weight 3+ and others weight 1.
3. anchors.agent_name must match the top-level name field.
4. If an EXISTING PROFILE is provided, edit it to match the request rather than generating from scratch — preserve variables and anchors that still apply.
5. The bioTemplate must faithfully reflect the user's described concept, domain, and character."""

_AGENT_PROFILE_DEFAULT_STYLE = """Style guidelines:
- Match the tone and energy of the user's description precisely. If they describe a cheerful character, write upbeat text; if they describe a gruff expert, be terse and technical.
- Lean positive and collaborative by default. Avoid gratuitous darkness, cynicism, or menace unless the description explicitly calls for it.
- Write the bioTemplate in first person ("I am {{agent_name}}...") or third person as fits the character — be consistent within a profile.
- Variable values should be concrete, vivid phrases (3–12 words each) that slot naturally into the bioTemplate sentence."""

def generate_agent_profile(self, user_prompt: str, model_override: str = None, style_instruction: str = None) -> str:
    """
    Generates or refines a bespoke Agent Profile template with placeholders and variables.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model = model_override or config.MODEL_TEMPLATE_GEN

    style_block = style_instruction.strip() if style_instruction and style_instruction.strip() else _AGENT_PROFILE_DEFAULT_STYLE
    system_prompt = _AGENT_PROFILE_STRUCTURAL_PREAMBLE + "\n\n" + style_block

    contents = [system_prompt, user_prompt]

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )
        response = self.genai_client.models.generate_content(
            model=model,
            contents=contents,
            config=gen_config
        )
        return response.text
    except Exception as e:
        raise Exception(f"Agent Profile generation failed: {e}")


