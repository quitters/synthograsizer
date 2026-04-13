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
            desktop = os.path.join(os.path.expanduser("~"), "Desktop")
            base_folder = os.path.join(desktop, "Synthograsizer_Output")
            
            subfolder = "Images" if "img" in type_prefix else "Videos"
            target_folder = os.path.join(base_folder, subfolder)
            
            os.makedirs(target_folder, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = str(uuid.uuid4())[:8]
            ext = "png" if "img" in type_prefix else "mp4"
            
            filename = f"{type_prefix}_{timestamp}_{unique_id}.{ext}"
            filepath = os.path.join(target_folder, filename)
            
            with open(filepath, "wb") as f:
                f.write(data_bytes)
            print(f"Saved output to: {filepath}")
            return filepath
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
            desktop = os.path.join(os.path.expanduser("~"), "Desktop")
            base_folder = os.path.join(desktop, "Synthograsizer_Output", "JSON")
            
            # Map json_type to subfolder
            subfolder_map = {
                "project_template": "Project Templates",
                "category_template": "Category Templates",
                "batch_list": "Batch List"
            }
            
            subfolder = subfolder_map.get(json_type, "Other")
            target_folder = os.path.join(base_folder, subfolder)
            
            os.makedirs(target_folder, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = str(uuid.uuid4())[:8]
            prefix = filename_prefix or json_type
            
            filename = f"{prefix}_{timestamp}_{unique_id}.json"
            filepath = os.path.join(target_folder, filename)
            
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(json_data)
            print(f"Saved JSON output to: {filepath}")
            return filepath
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
        """Load API key — checks env vars first, then local config file.

        Priority:
          1. GOOGLE_API_KEY env var  (Vercel / CI / production)
          2. GEMINI_API_KEY env var  (alternative name)
          3. ai_studio_config.json  (local development)
        """
        env_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
        if env_key:
            self.configure_api(env_key, save=False)
            return

        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    saved = json.load(f)
                    if "api_key" in saved:
                        self.configure_api(saved["api_key"], save=False)
            except Exception as e:
                print(f"Failed to load config: {e}")

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

    def chat(self, message: str, history: List[Dict[str, str]] = None, model_name: str = "gemini-3-flash-preview"):
        """Send a message to the chat model."""
        if not self.api_key:
            raise ValueError("API Key not configured")
        
        try:
            model = genai.GenerativeModel(model_name)
            
            # Convert simple history format to Gemini format
            chat_history = []
            if history:
                for msg in history:
                    role = "user" if msg["role"] == "user" else "model"
                    chat_history.append({"role": role, "parts": [msg["content"]]})
            
            chat = model.start_chat(history=chat_history)
            response = chat.send_message(message)
            return response.text
        except Exception as e:
            raise Exception(f"Chat failed: {str(e)}")

    def generate_text(self, prompt: str, model_name: str = "gemini-3-flash-preview"):
        """Generate text using Gemini model."""
        if not self.genai_client:
            raise ValueError("API Key not configured")

        try:
            response = self.genai_client.models.generate_content(
                model=model_name,
                contents=prompt
            )
            return response.text
        except Exception as e:
            raise Exception(f"Text generation failed: {str(e)}")

    def generate_text_stream(self, prompt: str, model_name: str = "gemini-3-flash-preview"):
        """Stream text chunks from Gemini. Yields string chunks."""
        if not self.genai_client:
            raise ValueError("API Key not configured")

        for chunk in self.genai_client.models.generate_content_stream(
            model=model_name,
            contents=prompt
        ):
            if chunk.text:
                yield chunk.text

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
                # Use Gemini for image generation — retry up to 3× on transient 500s
                last_err = None
                for attempt in range(3):
                    try:
                        return self._generate_image_gemini(
                            prompt, model_name, aspect_ratio, reference_images,
                            response_modalities, thinking_level, include_thoughts,
                            media_resolution, person_generation, safety_settings,
                            image_count, add_watermark, use_google_search,
                            temperature, top_k, top_p, tags=tags
                        )
                    except Exception as e:
                        last_err = e
                        err_str = str(e)
                        # Only retry on transient server errors
                        if "500" in err_str or "503" in err_str or "INTERNAL" in err_str or "UNAVAILABLE" in err_str:
                            wait = 5 * (attempt + 1)  # 5s, 10s, 15s
                            print(f"Image generation transient error (attempt {attempt+1}/3), retrying in {wait}s: {err_str[:120]}")
                            time.sleep(wait)
                            continue
                        raise  # Non-transient — don't retry
                # All retries exhausted — return placeholder so workflow can continue
                print(f"Image generation failed after 3 attempts, using placeholder: {str(last_err)[:120]}")
                return self._placeholder_image(aspect_ratio)
            else:
                # Use Imagen 3
                return self._generate_image_imagen(prompt, model_name, aspect_ratio, negative_prompt, tags=tags)
        except Exception as e:
            raise Exception(f"Image generation failed: {str(e)}")

    def _placeholder_image(self, aspect_ratio: str = '16:9') -> str:
        """Return a base64-encoded dark grey placeholder PNG with an error label.
        Sized to match the requested aspect ratio so downstream steps (e.g. img→video)
        receive a valid image rather than crashing."""
        ratio_map = {
            '1:1': (512, 512), '16:9': (896, 504), '9:16': (504, 896),
            '4:3': (640, 480), '3:4': (480, 640), '21:9': (1008, 432),
        }
        w, h = ratio_map.get(aspect_ratio, (896, 504))
        img = Image.new('RGB', (w, h), color=(30, 30, 30))
        try:
            from PIL import ImageDraw
            draw = ImageDraw.Draw(img)
            msg = '⚠ Image unavailable'
            draw.text((w // 2 - 80, h // 2 - 8), msg, fill=(140, 140, 140))
        except Exception:
            pass  # Text drawing is best-effort
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('utf-8')

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

    def ensure_aspect_ratio(self, image_bytes: bytes, target_ratio: str) -> bytes:
        """Resize/Crop image to match target aspect ratio (16:9 or 9:16)."""
        if not target_ratio:
            return image_bytes
            
        try:
            img = Image.open(io.BytesIO(image_bytes))
            
            target_w, target_h = 0, 0
            if target_ratio == "16:9":
                target_w, target_h = 1280, 720 # Standard HD 16:9
            elif target_ratio == "9:16":
                target_w, target_h = 720, 1280 # Standard HD 9:16
            else:
                return image_bytes

            current_w, current_h = img.size
            if current_h == 0:
                return image_bytes
            current_ratio = current_w / current_h
            target_ratio_val = target_w / target_h

            # If ratios are close enough, just resize
            if abs(current_ratio - target_ratio_val) < 0.01:
                img = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
            else:
                # Crop to aspect ratio then resize
                if current_ratio > target_ratio_val:
                    # Too wide, crop width
                    new_w = int(current_h * target_ratio_val)
                    offset = (current_w - new_w) // 2
                    img = img.crop((offset, 0, offset + new_w, current_h))
                else:
                    # Too tall, crop height
                    new_h = int(current_w / target_ratio_val)
                    offset = (current_h - new_h) // 2
                    img = img.crop((0, offset, current_w, offset + new_h))
                
                # Resize to target dimensions
                img = img.resize((target_w, target_h), Image.Resampling.LANCZOS)

            out_io = io.BytesIO()
            # Save as JPEG for consistency with API
            img.convert('RGB').save(out_io, format='JPEG', quality=95)
            return out_io.getvalue()
        except Exception as e:
            print(f"Failed to resize image: {e}")
            return image_bytes

    async def generate_video(self, prompt: str, model_name: str = config.MODEL_VIDEO_GEN,
                      duration_seconds: int = None, aspect_ratio: str = None,
                      end_frame_image: str = None, start_frame_image: str = None,
                      reference_images: list = None, extension_video_uri: str = None,
                      resolution: str = None):
        """Generate video using Veo (Async).

        Supports text-to-video, image-to-video (first frame), interpolation
        (first + last frame), reference image direction (Veo 3.1 only), and
        video extension (Veo 3.1 only — requires a URI from a prior Veo generation).
        Polls the long-running operation with a configurable timeout
        (see config.VIDEO_POLL_TIMEOUT_SECONDS).
        Returns dict {"video_b64": str, "video_uri": str|None}.
        """
        if not self.genai_client:
            raise ValueError("API Key not configured")

        # Validation
        if aspect_ratio and aspect_ratio not in ["16:9", "9:16"]:
            raise ValueError("Video aspect ratio must be '16:9' or '9:16'")

        # end_frame_image always uses 8s duration (enforced below)

        try:
            config_opts = types.GenerateVideosConfig()

            # Use requested duration; fall back to 5s if not provided
            config_opts.duration_seconds = int(duration_seconds) if duration_seconds else 5

            if aspect_ratio:
                config_opts.aspect_ratio = aspect_ratio

            if resolution and resolution in ("720p", "1080p", "4k"):
                config_opts.resolution = resolution
                # 1080p and 4k require 8s; enforce it here as a safety net
                if resolution in ("1080p", "4k"):
                    config_opts.duration_seconds = 8

            # Prepare prompt/contents
            # prompt must be a string for generate_videos
            
            # Handle First Frame (image parameter) and Last Frame (last_frame in config)
            # Veo 3.1 supports first/last frame via image-to-video and interpolation
            first_frame_obj = None
            if start_frame_image:
                # Decode start image
                start_bytes = base64.b64decode(start_frame_image.split(",")[1] if "," in start_frame_image else start_frame_image)
                # Ensure aspect ratio
                if aspect_ratio:
                    start_bytes = self.ensure_aspect_ratio(start_bytes, aspect_ratio)
                
                # Create image object for first frame
                first_frame_obj = types.Image(image_bytes=start_bytes, mime_type="image/jpeg")
                print(f"Using first frame for video generation (image parameter)")

            if end_frame_image:
                # Decode end image
                end_bytes = base64.b64decode(end_frame_image.split(",")[1] if "," in end_frame_image else end_frame_image)
                # Ensure aspect ratio
                if aspect_ratio:
                    end_bytes = self.ensure_aspect_ratio(end_bytes, aspect_ratio)

                # Set last_frame in config for interpolation
                config_opts.last_frame = types.Image(image_bytes=end_bytes, mime_type="image/jpeg")
                print(f"Using last frame for video interpolation (last_frame parameter)")

            # Handle Reference Images (Veo 3.1 full/fast only — up to 3 asset images)
            extension_video_obj = None
            if reference_images:
                ref_objs = []
                for i, ref_b64 in enumerate(reference_images[:3]):
                    ref_bytes = base64.b64decode(ref_b64.split(",")[1] if "," in ref_b64 else ref_b64)
                    if aspect_ratio:
                        ref_bytes = self.ensure_aspect_ratio(ref_bytes, aspect_ratio)
                    ref_img = types.Image(image_bytes=ref_bytes, mime_type="image/jpeg")
                    ref_objs.append(types.VideoGenerationReferenceImage(image=ref_img, reference_type="asset"))
                config_opts.reference_images = ref_objs
                # Reference images require 8s duration per API spec
                config_opts.duration_seconds = 8
                print(f"Using {len(ref_objs)} reference image(s) for Veo 3.1 direction (duration forced to 8s)")

            # Handle Video Extension (Veo 3.1 full/fast only)
            # Must reference a stored URI from a prior Veo generation — inline bytes are rejected by the API.
            if extension_video_uri:
                extension_video_obj = types.Video(uri=extension_video_uri, mime_type="video/mp4")
                # Extension requires 720p and 8s duration per API spec;
                # aspect ratio is inherited from the source video, so we don't set it.
                config_opts.duration_seconds = 8
                config_opts.resolution = "720p"
                config_opts.aspect_ratio = None
                print(f"Using video extension mode — URI={extension_video_uri} (duration=8s, resolution=720p)")

            print(f"Starting video generation with model {model_name}...")
            print(f"  duration_seconds={config_opts.duration_seconds}, aspect_ratio={config_opts.aspect_ratio}")
            # Only pass image/video kwargs when we actually have them — passing None
            # causes Veo 3.1 to reject valid durationSeconds values.
            video_kwargs = dict(model=model_name, prompt=prompt, config=config_opts)
            if extension_video_obj is not None:
                # Extension mode: pass video, skip first frame
                video_kwargs['video'] = extension_video_obj
            elif first_frame_obj is not None:
                video_kwargs['image'] = first_frame_obj
            operation = self.genai_client.models.generate_videos(**video_kwargs)
            
            print(f"Operation started: {operation.name}. Polling for completion...")
            
            # Poll until complete with timeout
            MAX_POLL_SECONDS = config.VIDEO_POLL_TIMEOUT_SECONDS
            poll_start = time.time()
            while not operation.done:
                elapsed = time.time() - poll_start
                if elapsed > MAX_POLL_SECONDS:
                    raise Exception(f"Video generation timed out after {MAX_POLL_SECONDS}s")
                await asyncio.sleep(5)
                print(f"Still generating... ({int(elapsed)}s elapsed)")
                operation = self.genai_client.operations.get(operation)

            print("Generation complete.")
            
            # Get the result from the operation
            response = None
            if hasattr(operation, 'result') and operation.result:
                response = operation.result
            elif hasattr(operation, 'response'):
                response = operation.response
            
            if not response:
                 if hasattr(operation, 'error') and operation.error:
                      raise Exception(f"Operation failed: {operation.error}")
                 raise Exception("Operation completed but no result found")

            if hasattr(response, 'generated_videos') and response.generated_videos:
                video_wrapper = response.generated_videos[0]
                
                if hasattr(video_wrapper, 'video') and video_wrapper.video:
                    inner_video = video_wrapper.video
                    if hasattr(inner_video, 'uri') and inner_video.uri:
                        video_uri = inner_video.uri
                        print(f"Video URI found: {video_uri}. Downloading...")
                        download_url = f"{video_uri}&key={self.api_key}"
                        # Use run_in_executor for blocking request
                        loop = asyncio.get_event_loop()
                        vid_response = await loop.run_in_executor(None, requests.get, download_url)

                        if vid_response.status_code == 200:
                            print(f"Video downloaded! Size: {len(vid_response.content)} bytes")
                            self.save_output(vid_response.content, f"vid_{model_name}")
                            return {
                                "video_b64": base64.b64encode(vid_response.content).decode('utf-8'),
                                "video_uri": video_uri,
                            }
                        else:
                            print(f"Failed to download video. Status: {vid_response.status_code}")
                            raise Exception(f"Failed to download video from URI: {vid_response.text}")

                if hasattr(video_wrapper, 'video_bytes') and video_wrapper.video_bytes:
                    print(f"Video bytes found directly. Size: {len(video_wrapper.video_bytes)} bytes")
                    self.save_output(video_wrapper.video_bytes, f"vid_{model_name}")
                    return {
                        "video_b64": base64.b64encode(video_wrapper.video_bytes).decode('utf-8'),
                        "video_uri": None,
                    }
            
            raise Exception("No video found in response")

        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"Video generation error: {str(e)}")
            raise e

    def analyze_image(self, image_bytes: bytes, prompt: str):
        """Analyze an image using Gemini."""
        if not self.genai_client:
            raise ValueError("API Key not configured")
            
        try:
            model_name = "gemini-3-flash-preview" # Use a fast multimodal model
            
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

            prompt_model = "gemini-3-flash-preview"
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

    def generate_narrative(self, descriptions: List[str], user_prompt: str, mode: str = "story") -> List[str]:
        """
        Synthesize a cohesive narrative or thematic set of prompts from multiple image descriptions.
        """
        if not self.genai_client:
            raise ValueError("API Key not configured")

        model_name = "gemini-2.0-flash"
        
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

        model_name = "gemini-3-flash-preview"

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

    def analyze_image_to_prompt(self, image_bytes: bytes, mime_type: str = "image/png") -> str:
        """
        Reverse-engineer an image into a detailed text prompt using a specific system prompt.
        """
        if not self.genai_client:
            raise ValueError("API Key not configured")

        model_name = "gemini-3-flash-preview"
        
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

    def analyze_image_quick(self, image_bytes: bytes) -> str:
        """
        Lightweight image analysis optimized for workflow curation.
        Uses flash model and a shorter prompt for faster response.
        """
        if not self.genai_client:
            raise ValueError("API Key not configured")

        model = "gemini-3-flash-preview"

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

    def curate_workflow(self, workflow: dict, image_bytes: bytes, guidance: str = None, include_rationale: bool = True) -> dict:
        """
        Curate a workflow to match a reference image.
        Each variable is distilled to a single value that best aligns with the image.

        Returns dict with 'template' (curated JSON) and optionally 'rationale' (list of selection reasons).
        """
        if not self.genai_client:
            raise ValueError("API Key not configured")

        # Step 1: Quick image analysis (faster than full analyze_image_to_prompt)
        analysis = self.analyze_image_quick(image_bytes)

        # Step 2: Curate the workflow using flash model for speed
        model = "gemini-3-flash-preview"

        system_prompt = """You are a workflow curator. Curate the workflow JSON so each variable has exactly ONE value that best matches the image.

## OUTPUT FORMAT (valid JSON only):
{
  "template": {
    "promptTemplate": "[unchanged from input]",
    "variables": [
      {"name": "var_name", "feature_name": "Var Name", "values": [{"text": "selected_value"}]}
    ]
  },
  "rationale": [
    {"variable": "Var Name", "selected": "selected_value", "reason": "Brief reason"}
  ]
}

## VALUE FORMAT:
Each entry in "values" is an object: {"text": "the selected value"}
No weight needed for curated single-value output.

## RULES:
1. One value object per variable (values array has exactly 1 item)
2. Match selections to image aesthetics
3. Preserve promptTemplate and variable names exactly
4. Prefer existing values; only infer if nothing fits
5. Keep rationale brief (1 sentence each)
6. The input workflow may use either old flat-array or new nested format — always OUTPUT nested format."""

        workflow_json = json.dumps(workflow, indent=2)

        user_content = f"""IMAGE: {analysis}

WORKFLOW:
{workflow_json}"""

        if guidance:
            user_content += f"\n\nGUIDANCE: {guidance}"

        try:
            gen_config = types.GenerateContentConfig(
                response_mime_type="application/json"
            )

            response = self.genai_client.models.generate_content(
                model=model,
                contents=[system_prompt, user_content],
                config=gen_config
            )

            # Safely extract text to avoid hanging on thought_signature
            response_text = self._extract_text_from_response(response)

            # Parse response
            result_json = json.loads(response_text)

            # Ensure proper structure
            if "template" not in result_json:
                # Model might have returned just the template directly
                result_json = {"template": result_json, "rationale": []}

            # Optionally strip rationale if not requested
            if not include_rationale and "rationale" in result_json:
                del result_json["rationale"]

            return result_json

        except json.JSONDecodeError as e:
            # Try to extract JSON from markdown if present
            response_text = self._extract_text_from_response(response)
            if "```json" in response_text:
                clean_str = response_text.split("```json")[1].split("```")[0]
                result_json = json.loads(clean_str)
                if "template" not in result_json:
                    result_json = {"template": result_json, "rationale": []}
                if not include_rationale and "rationale" in result_json:
                    del result_json["rationale"]
                return result_json
            raise Exception(f"Workflow curation failed - invalid JSON: {e}")
        except Exception as e:
            raise Exception(f"Workflow curation failed: {e}")

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

ai_manager = AIManager()
