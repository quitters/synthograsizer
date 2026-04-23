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

import backend.config as config
import backend.services.text_gen
import backend.services.image_gen
import backend.services.video_gen
import backend.services.analysis
import backend.services.template_engine
import backend.services.narrative
import backend.services.workflow
import backend.utils.image_utils
from backend.utils.image_utils import sniff_mime_type

import google.generativeai as genai
from google import genai as genai_client
from google.genai import types
from PIL import Image
from PIL.PngImagePlugin import PngInfo

def normalize_template(template: dict) -> dict:
    """Normalize a template to the nested value-weight schema."""
    if not template or "variables" not in template:
        return template

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
        if isinstance(values[0], dict) and "text" in values[0]:
            new_var["values"] = values
        elif isinstance(values[0], str):
            for i, val in enumerate(values):
                entry = {"text": val}
                if weights and i < len(weights):
                    entry["weight"] = weights[i]
                new_var["values"].append(entry)
        else:
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
