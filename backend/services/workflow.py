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
from backend.helpers import SafetyBlockedError
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

    Image analysis (step 1) always uses Google's multimodal API; curation
    (step 2) is text-only and follows the active backend tier.
    """
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
5. If a GUIDANCE line is present, it expresses the user's intent and takes priority over pure visual matching — reconcile both where possible, but when they conflict, follow the guidance and note the trade-off in the rationale.
6. Keep rationale brief (1 sentence each)
7. The input workflow may use either old flat-array or new nested format — always OUTPUT nested format."""

    workflow_json = json.dumps(workflow, indent=2)

    user_content = f"""IMAGE: {analysis}

WORKFLOW:
{workflow_json}"""

    if guidance:
        user_content += f"\n\nGUIDANCE: {guidance}"

    try:
        response_text = self.llm_text(
            [system_prompt, user_content],
            model,
            json_mode=True,
        )

        # Parse response — parse_llm_json strips markdown fences (needed for
        # local models that ignore JSON mode)
        from backend.helpers import parse_llm_json
        result_json = parse_llm_json(response_text)

        # Ensure proper structure
        if "template" not in result_json:
            # Model might have returned just the template directly
            result_json = {"template": result_json, "rationale": []}

        # Optionally strip rationale if not requested
        if not include_rationale and "rationale" in result_json:
            del result_json["rationale"]

        return result_json

    except SafetyBlockedError:
        raise  # keep the type — routers emit a structured 422 for these
    except Exception as e:
        # parse_llm_json already handles markdown-fenced JSON, so any failure
        # reaching here is a genuine generation/parsing error.
        raise Exception(f"Workflow curation failed: {e}")

