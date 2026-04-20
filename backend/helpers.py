import base64
import json

def decode_base64_image(b64_string: str) -> bytes:
    """Decode a base64 image string, stripping the data URI prefix if present.

    Handles both raw base64 ("iVBOR...") and data URIs ("data:image/png;base64,iVBOR...").
    """
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    return base64.b64decode(b64_string)


def parse_llm_json(json_str: str) -> dict:
    """Parse JSON from an LLM response, handling markdown fences.

    LLMs sometimes wrap JSON in ```json ... ``` blocks — this strips those
    before parsing. Raises Exception with a clear message on failure.
    """
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        if "```json" in json_str:
            clean = json_str.split("```json", 1)[1].split("```", 1)[0].strip()
            return json.loads(clean)
        raise Exception("Model did not return valid JSON")

