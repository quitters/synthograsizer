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
import backend.services.text_gen
import backend.services.image_gen
import backend.services.video_gen
import backend.services.analysis
import backend.services.template_engine
import backend.services.narrative
import backend.services.workflow
import backend.utils.image_utils
from backend.services.template_engine import normalize_template
from backend.utils.image_utils import sniff_mime_type

from backend.utils.retry import retry_on_transient

import google.generativeai as genai
from google import genai as genai_client
from google.genai import types
from PIL import Image
from PIL.PngImagePlugin import PngInfo

def sniff_mime_type(image_bytes: bytes) -> str:
    """Detect image MIME type from magic bytes. Falls back to image/png."""
    if image_bytes[:2] == b'\xff\xd8':
        return 'image/jpeg'
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if image_bytes[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    if image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
        return 'image/webp'
    return 'image/png'  # safe default


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


class AIManager:
    def __init__(self):
        self.api_key = None
        self.genai_client = None
        self.config_path = Path("ai_studio_config.json")
        self.load_config()

    def save_output(self, data_bytes: bytes, type_prefix: str) -> str:
        """Save data to Desktop/Synthograsizer_Output folder."""
        try:
            from backend import config
            target_folder = config.OUTPUT_IMAGES_DIR if "img" in type_prefix else config.OUTPUT_VIDEOS_DIR
            target_folder.mkdir(parents=True, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = str(uuid.uuid4())[:8]
            ext = "png" if "img" in type_prefix else "mp4"
            
            filename = f"{type_prefix}_{timestamp}_{unique_id}.{ext}"
            filepath = target_folder / filename
            
            with open(filepath, "wb") as f:
                f.write(data_bytes)
            print(f"Saved output to: {filepath}")
            return str(filepath)
        except Exception as e:
            print(f"Failed to save output: {e}")
            return None

    def save_json_output(self, json_data: str, json_type: str, filename_prefix: str = None) -> str:
        """Save JSON data to Desktop/Synthograsizer_Output/JSON folder with subfolders.
        
        Args:
            json_data: JSON string to save
            json_type: One of 'project_template', 'category_template', or 'batch_list'
            filename_prefix: Optional prefix for filename (default uses json_type)
        
        Returns:
            str: Path to saved file, or None if failed
        """
        try:
            from backend import config
            
            # Map json_type to subfolder
            subfolder_map = {
                "project_template": "Project Templates",
                "category_template": "Category Templates",
                "batch_list": "Batch List"
            }
            
            subfolder = subfolder_map.get(json_type, "Other")
            target_folder = config.OUTPUT_JSON_DIR / subfolder
            
            target_folder.mkdir(parents=True, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = str(uuid.uuid4())[:8]
            prefix = filename_prefix or json_type
            
            filename = f"{prefix}_{timestamp}_{unique_id}.json"
            filepath = os.path.join(target_folder, filename)
            
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(json_data)
            print(f"Saved JSON output to: {filepath}")
            return str(filepath)
        except Exception as e:
            print(f"Failed to save JSON output: {e}")
            return None

    def embed_metadata(self, image_bytes: bytes, prompt: str, tags: list = None) -> bytes:
        """Embeds the prompt (and optional provenance tags) into the PNG metadata."""
        try:
            image = Image.open(io.BytesIO(image_bytes))
            metadata = PngInfo()
            metadata.add_text("prompt", prompt)
            metadata.add_text("Description", prompt) # Common key
            metadata.add_text("Software", "Synthograsizer")

            # Embed provenance tags if provided
            if tags and isinstance(tags, list) and len(tags) > 0:
                import json as _json
                from datetime import datetime, timezone
                provenance = {
                    "tags": tags,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "tool": "Synthograsizer"
                }
                metadata.add_text("provenance", _json.dumps(provenance))

            output_buffer = io.BytesIO()
            image.save(output_buffer, format="PNG", pnginfo=metadata)
            return output_buffer.getvalue()
        except Exception as e:
            print(f"Failed to embed metadata: {e}")
            return image_bytes # Return original if failure

    def clean_midjourney_prompt(self, prompt: str) -> str:
        """Removes Midjourney parameters, Job IDs, and image URLs from the prompt."""
        import re
        if not prompt:
            return ""
            
        # 1. Remove Image URLs (typically at the start)
        # Pattern matches http/https URLs followed by space or end of string
        url_pattern = r"https?://\S+\s*"
        prompt = re.sub(url_pattern, "", prompt)
            
        # 2. Remove Parameters and Job IDs
        # Regex to find the start of MJ parameters
        # Looks for --parameter or Job ID:
        # Examples: --ar 16:9, --v 6.0, Job ID: ...
        # We want to cut everything off starting from the first occurrence of these.
        
        # Pattern matches:
        # 1. " --" followed by letters (start of a parameter like --ar)
        # 2. " Job ID:" (start of job id)
        # We use a non-greedy match to find the *first* occurrence.
        
        param_pattern = r"(\s--[a-zA-Z]+|\sJob ID:)"
        
        match = re.search(param_pattern, prompt)
        if match:
            # Return everything up to the start of the match
            return prompt[:match.start()].strip()
            
        return prompt.strip()

    def extract_metadata(self, image_bytes: bytes) -> dict:
        """Extracts metadata from a PNG image, including provenance tags."""
        try:
            image = Image.open(io.BytesIO(image_bytes))
            info = image.info

            extracted = {}
            raw_prompt = ""

            if "prompt" in info:
                raw_prompt = info["prompt"]
            elif "Description" in info:
                raw_prompt = info["Description"]
            elif "parameters" in info: # Automatic1111 style
                raw_prompt = info["parameters"]
            else:
                raw_prompt = "No prompt found in metadata."

            # Clean the prompt if it's not the "No prompt found" message
            if raw_prompt != "No prompt found in metadata.":
                extracted["prompt"] = self.clean_midjourney_prompt(raw_prompt)
                extracted["raw_prompt"] = raw_prompt # Keep original just in case
            else:
                extracted["prompt"] = raw_prompt

            # Extract provenance tags if present
            if "provenance" in info:
                import json as _json
                try:
                    extracted["provenance"] = _json.loads(info["provenance"])
                except Exception:
                    extracted["provenance_raw"] = info["provenance"]

            return extracted
        except Exception as e:
            return {"error": str(e)}

    def get_image_dimensions(self, image_bytes: bytes) -> tuple:
        """Get width and height from image bytes.
        
        Returns:
            tuple: (width, height) in pixels
        """
        try:
            img = Image.open(io.BytesIO(image_bytes))
            return img.width, img.height
        except Exception as e:
            raise Exception(f"Failed to read image dimensions: {str(e)}")
    
    def map_to_closest_aspect_ratio(self, width: int, height: int) -> str:
        """Map image dimensions to closest supported Gemini aspect ratio.
        
        Supported ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
        
        Args:
            width: Image width in pixels
            height: Image height in pixels
            
        Returns:
            str: Closest aspect ratio string (e.g., "16:9")
        """
        actual_ratio = width / height
        
        # Map of ratio strings to numerical values
        ratios = {
            '1:1': 1.0,
            '4:5': 0.8,
            '2:3': 0.667,
            '9:16': 0.5625,
            '3:4': 0.75,
            '5:4': 1.25,
            '4:3': 1.333,
            '3:2': 1.5,
            '16:9': 1.778,
            '21:9': 2.333
        }
        
        # Find closest match by minimum absolute difference
        closest = min(ratios.items(), key=lambda x: abs(x[1] - actual_ratio))
        return closest[0]

    def load_config(self):
        """Load API key using the centralized config loader."""
        from backend.config import get_api_key
        key = get_api_key()
        if key:
            self.configure_api(key, save=False)

    def save_config(self, api_key: str):
        """Save API key to local config file (skipped on Vercel — read-only filesystem)."""
        if os.environ.get("VERCEL"):
            return
        try:
            with open(self.config_path, 'w') as f:
                json.dump({"api_key": api_key}, f)
        except Exception as e:
            print(f"Failed to save config: {e}")

    def configure_api(self, api_key: str, save: bool = True):
        """Configure both GenAI clients."""
        self.api_key = api_key

        # Configure legacy client (for Text/Gemini)
        genai.configure(api_key=api_key)

        # Configure new client (for Video/Veo and Imagen 3)
        self.genai_client = genai_client.Client(api_key=api_key)

        if save:
            self.save_config(api_key)

    # ── Delegated Service Methods ──
    chat = backend.services.text_gen.chat
    generate_text = backend.services.text_gen.generate_text
    generate_text_stream = backend.services.text_gen.generate_text_stream
    generate_image = backend.services.image_gen.generate_image
    _generate_image_gemini = backend.services.image_gen._generate_image_gemini
    _generate_image_imagen = backend.services.image_gen._generate_image_imagen
    smart_transform = backend.services.image_gen.smart_transform
    generate_video = backend.services.video_gen.generate_video
    analyze_image = backend.services.analysis.analyze_image
    analyze_image_to_prompt = backend.services.analysis.analyze_image_to_prompt
    analyze_image_quick = backend.services.analysis.analyze_image_quick
    _extract_text_from_response = backend.services.analysis._extract_text_from_response
    generate_template = backend.services.template_engine.generate_template
    generate_template_from_analysis = backend.services.template_engine.generate_template_from_analysis
    generate_template_hybrid = backend.services.template_engine.generate_template_hybrid
    generate_template_from_images = backend.services.template_engine.generate_template_from_images
    remix_template = backend.services.template_engine.remix_template
    generate_story_template = backend.services.template_engine.generate_story_template
    generate_narrative = backend.services.narrative.generate_narrative
    generate_video_variations = backend.services.narrative.generate_video_variations
    generate_image_variation_prompts = backend.services.narrative.generate_image_variation_prompts
    curate_workflow = backend.services.workflow.curate_workflow
    embed_metadata = backend.utils.image_utils.embed_metadata
    extract_metadata = backend.utils.image_utils.extract_metadata
    get_image_dimensions = backend.utils.image_utils.get_image_dimensions
    map_to_closest_aspect_ratio = backend.utils.image_utils.map_to_closest_aspect_ratio
    ensure_aspect_ratio = backend.utils.image_utils.ensure_aspect_ratio
    clean_midjourney_prompt = backend.utils.image_utils.clean_midjourney_prompt
    _placeholder_image = backend.utils.image_utils._placeholder_image

ai_manager = AIManager()
