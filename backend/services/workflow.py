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

def curate_workflow(self, workflow: dict, image_bytes: bytes, guidance: str = None, include_rationale: bool = True, model_override: str = None) -> dict:
    """
    Curate a workflow to match a reference image.
    Each variable is distilled to a single value that best aligns with the image.

    Returns dict with 'template' (curated JSON) and optionally 'rationale' (list of selection reasons).
    """
    if not self.genai_client:
        raise ValueError("API Key not configured")

    # Step 1: Quick image analysis (faster than full analyze_image_to_prompt)
    analysis = self.analyze_image_quick(image_bytes)

    # Step 2: Curate the workflow
    model = model_override or config.MODEL_CURATION

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

