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

def generate_template_from_images(self, images_list: list, model_override: str = None) -> str:
    """
    Extract a common aesthetic pattern from multiple images and generate a template.
    Shared traits become fixed text; differences become variables.
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

def remix_template(self, current_template: dict, instruction: str, model_override: str = None) -> str:
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
"""

    template_json = json.dumps(current_template, indent=2)

    try:
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )

        response = self.genai_client.models.generate_content(
            model=model,
            contents=[system_prompt, f"CURRENT TEMPLATE:\n{template_json}\n\nINSTRUCTIONS:\n{instruction}"],
            config=gen_config
        )
        return response.text
    except Exception as e:
        raise Exception(f"Template remix failed: {e}")

def generate_story_template(self, user_prompt: str, model_override: str = None) -> str:
    """
    W16 — Story Template Generator.
    Generates a Synthograsizer template with a 'story' block that defines
    characters, acts with beat counts, locks/biases, and progression arcs.
    Designed for sequential prompt generation with narrative continuity.
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    model = model_override or config.MODEL_TEMPLATE_GEN

    system_prompt = """You are a Story Template Generator for a creative prompt manipulation tool that produces sequential image/video prompts with narrative continuity.

## YOUR ROLE
You are a screenwriter and art director. The user gives you a story concept. You produce a JSON template that a "story engine" will walk through beat-by-beat to generate a sequence of AI image/video prompts with consistent characters, evolving mood, and structured pacing.

## OUTPUT FORMAT
You MUST respond with valid JSON only. The JSON has THREE top-level keys:

{
  "promptTemplate": "A {{shot_type}} of {{character}} in {{environment}}, {{mood}} atmosphere, {{lighting}}",
  "variables": [ ...standard variables with values and weights... ],
  "story": {
"title": "Story Title",
"acts": [ ...act definitions... ],
"characters": [ ...character anchors... ],
"progressions": [ ...variable arc definitions... ]
  }
}

## TEMPLATE STRUCTURE (promptTemplate + variables)
Same rules as standard Synthograsizer templates:
- promptTemplate: Natural language with {{variable_name}} placeholders
- variables: Array of variable objects, each with name (snake_case), feature_name (Title Case), and values array
- Values use nested object format: {"text": "option", "weight": 3}
- Weight tiers: Common=3, Rare=2, Very Rare=1

## STORY BLOCK STRUCTURE

### story.title (string)
A descriptive title for the narrative.

### story.characters (array)
Named entities with fixed visual descriptions for continuity across all beats.
Each character has:
- "id": snake_case identifier (e.g., "protagonist", "mentor", "rival")
- "name": Human-readable name (e.g., "The Green Knight")
- "anchors": Detailed visual description that stays CONSTANT across all frames.
  This is the continuity anchor — it should include: physical appearance, clothing/armor,
  distinctive features, color palette. Be specific enough for AI image generation to
  maintain visual consistency. (50-100 words)

If the template has a {{character}} variable, the engine will substitute the character's
anchor text. Characters can also be locked per-act via the locks system.

### story.acts (array)
The narrative structure. Each act defines a segment of the story with its own constraints.
Each act has:
- "name": Display name (e.g., "Act 1 - The Arrival")
- "beats": Integer count of how many prompts this act produces (typically 2-8)
- "locks": Object mapping variable_name → forced_value for this act.
  Locks override all other selection logic. Use for atmospheric anchoring.
  Example: {"lighting": "golden hour dawn", "mood": "anticipation"}
  For characters: {"character": "protagonist"} (uses character ID)
- "biases": Object mapping variable_name → array of preferred values.
  The engine picks randomly from this subset instead of the full variable values.
  Example: {"environment": ["castle gates", "tournament grounds"]}

### story.progressions (array)
Variables that evolve across the ENTIRE story (not per-act).
Each progression has:
- "variable": The variable name this progression controls
- "arc": Array of string values representing the evolution from start to end.
  The engine maps global progress (0.0 → 1.0) to the closest arc step.
  Example: {"variable": "lighting", "arc": ["golden dawn", "harsh midday", "dramatic clouds", "golden sunset"]}

Progressions OVERRIDE act locks and biases for that variable. Use them for
story-wide arcs like time-of-day, emotional escalation, or visual transformation.

## DESIGN PRINCIPLES

1. **Limitation Breeds Creativity**: The story structure constrains the generative space
   just enough to maintain continuity while leaving room for surprise. Don't over-specify —
   lock only what MUST stay consistent, bias what SHOULD lean a certain way, and let
   everything else be free.

2. **Character Anchors = Continuity**: The anchor text is the single most important element
   for visual consistency across frames. Be detailed and specific about appearance.

3. **Acts = Pacing**: Use beat counts to control pacing. Short acts (2-3 beats) for
   intensity or transitions. Longer acts (5-8 beats) for development and exploration.

4. **Progressions = Story Arcs**: Use progressions for elements that should feel like they
   evolve over the whole story — lighting (time of day), mood (emotional arc),
   environment (journey), camera work (escalating intensity).
   **Style/visual treatment progressions**: When the story involves a genre shift, tonal
   transformation, or reveal (e.g., epic fantasy → toy photography), express this as a
   progression on the style variable rather than per-act locks. This creates smoother
   visual transitions and ensures the shift happens at exactly the right narrative moment.

5. **Total Beats**: Aim for 12-24 total beats. This produces a coherent sequence that
   works as a slideshow, storyboard, or video sequence. Adjust based on user request.

6. **Climax/Punchline Acts — Lock, Don't Bias**: When a variable's value is essential to the
   story's climax, punchline, or emotional payoff, use a LOCK — not a bias. Biases are
   suggestions; locks are guarantees. If the joke depends on "standing frozen in confusion,"
   that must be a lock. If the drama requires "triumphant," lock it. Reserve biases for
   variables where variety within a subset is acceptable.

7. **Bias Pool Diversity**: When biasing a variable within an act, include at least 2-3
   options so the engine has room to avoid repetition between consecutive beats. The engine
   has a no-repeat heuristic that re-rolls when it picks the same value as the previous beat,
   but this only works if the pool has more than one option.

## CRITICAL RULES
1. Every {{placeholder}} in promptTemplate MUST have a matching variable in the variables array.
2. Lock and bias values should reference actual values from the variable's values array
   (or be valid alternatives that fit the variable's domain).
3. Progression arc values do NOT need to exist in the variable's values array — they are
   injected directly as overrides.
4. Character IDs used in locks (e.g., "character": "protagonist") must match a character's "id" field.
5. The promptTemplate SHOULD include {{character}} if characters are defined.
6. Variables controlled by progressions should still have a full values array (used when
   the story engine runs in non-story mode or for preview).
7. Include a {{shot_type}} or {{camera}} variable for cinematic variety.

## EXAMPLE (abbreviated)
{
  "promptTemplate": "A {{shot_type}} of {{character}} in {{environment}}, {{mood}} atmosphere with {{lighting}} lighting, {{detail}}",
  "variables": [
{
  "name": "shot_type",
  "feature_name": "Shot Type",
  "values": [
    {"text": "wide establishing shot", "weight": 3},
    {"text": "medium shot", "weight": 3},
    {"text": "close-up", "weight": 2},
    {"text": "over-the-shoulder shot", "weight": 2},
    {"text": "low-angle hero shot", "weight": 1},
    {"text": "bird's eye view", "weight": 1}
  ]
},
{
  "name": "character",
  "feature_name": "Character",
  "values": [
    {"text": "a lone wanderer", "weight": 3},
    {"text": "a mysterious figure", "weight": 2}
  ]
},
{
  "name": "environment",
  "feature_name": "Environment",
  "values": [
    {"text": "ancient stone ruins", "weight": 3},
    {"text": "misty forest path", "weight": 3},
    {"text": "mountain summit", "weight": 2},
    {"text": "underground cavern", "weight": 2},
    {"text": "crumbling bridge over a chasm", "weight": 1}
  ]
},
{
  "name": "mood",
  "feature_name": "Mood",
  "values": [
    {"text": "mysterious", "weight": 3},
    {"text": "tense", "weight": 3},
    {"text": "awe-inspiring", "weight": 2},
    {"text": "melancholic", "weight": 2},
    {"text": "triumphant", "weight": 1}
  ]
},
{
  "name": "lighting",
  "feature_name": "Lighting",
  "values": [
    {"text": "soft dawn glow", "weight": 3},
    {"text": "harsh midday sun", "weight": 3},
    {"text": "dramatic storm light", "weight": 2},
    {"text": "warm golden sunset", "weight": 2},
    {"text": "moonlit silver", "weight": 1}
  ]
},
{
  "name": "detail",
  "feature_name": "Detail",
  "values": [
    {"text": "dust motes floating in light beams", "weight": 3},
    {"text": "wind-swept cloak and hair", "weight": 3},
    {"text": "glowing runes on ancient stones", "weight": 2},
    {"text": "scattered autumn leaves", "weight": 1}
  ]
}
  ],
  "story": {
"title": "The Wanderer's Journey",
"characters": [
  {
    "id": "wanderer",
    "name": "The Wanderer",
    "anchors": "a solitary traveler in a weathered dark green hooded cloak, leather armor underneath, carrying a carved wooden staff, angular face with deep-set hazel eyes, short gray-streaked brown hair, a faded scar across the left cheek, worn leather boots and a brass compass hanging from the belt"
  }
],
"acts": [
  {
    "name": "Act 1 - The Threshold",
    "beats": 4,
    "locks": {"character": "wanderer", "mood": "mysterious"},
    "biases": {"environment": ["ancient stone ruins", "misty forest path"], "shot_type": ["wide establishing shot", "medium shot"]}
  },
  {
    "name": "Act 2 - The Descent",
    "beats": 6,
    "locks": {"character": "wanderer"},
    "biases": {"mood": ["tense", "awe-inspiring"], "environment": ["underground cavern", "crumbling bridge over a chasm"], "shot_type": ["close-up", "low-angle hero shot"]}
  },
  {
    "name": "Act 3 - The Summit",
    "beats": 4,
    "locks": {"character": "wanderer", "mood": "triumphant"},
    "biases": {"environment": ["mountain summit"], "shot_type": ["wide establishing shot", "low-angle hero shot"]}
  }
],
"progressions": [
  {"variable": "lighting", "arc": ["soft dawn glow", "harsh midday sun", "dramatic storm light", "warm golden sunset"]}
]
  }
}
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

