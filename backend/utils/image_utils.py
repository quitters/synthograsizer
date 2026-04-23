import base64
import io
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

