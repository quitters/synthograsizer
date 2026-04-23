import base64
import json

# Hard cap on the decoded size of any base64 payload accepted from clients.
# The Gemini APIs reject images much larger than this anyway, so the limit is
# generous but bounded — preventing a single oversized request from pinning
# tens of GB of resident memory before the upstream call fails.
MAX_DECODED_IMAGE_BYTES = 32 * 1024 * 1024  # 32 MB


def decode_base64_image(b64_string: str, max_bytes: int = MAX_DECODED_IMAGE_BYTES) -> bytes:
    """Decode a base64 image string, stripping the data URI prefix if present.

    Handles both raw base64 ("iVBOR...") and data URIs ("data:image/png;base64,iVBOR...").

    Raises ValueError when the decoded payload would exceed `max_bytes`. We
    estimate the decoded size from the encoded length (base64 expands ~4/3)
    and reject before calling b64decode, so an attacker cannot force a huge
    allocation just by sending a large string.
    """
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]

    # Conservative pre-check: every 4 base64 chars decode to at most 3 bytes.
    # Add a small slack for padding edge cases.
    estimated_decoded = (len(b64_string) * 3) // 4
    if estimated_decoded > max_bytes:
        raise ValueError(
            f"Image payload too large: ~{estimated_decoded // (1024 * 1024)} MB "
            f"exceeds the {max_bytes // (1024 * 1024)} MB cap"
        )
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

