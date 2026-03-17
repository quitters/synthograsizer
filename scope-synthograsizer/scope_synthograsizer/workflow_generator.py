"""Workflow generator — produces Scope pipeline load configurations from templates.

Generates the JSON payload for ``POST /api/v1/pipeline/load`` and the
initial WebRTC parameters so that a Synthograsizer template can be
one-click deployed into Scope.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .template_engine import resolve_prompt


def generate_workflow(
    template: dict,
    pipeline_id: str = "longlive",
    preprocessor_id: str | None = "synthograsizer-glitcher",
    resolution: tuple[int, int] = (576, 320),
    vace_enabled: bool = True,
    seed: int = 42,
    loras: list[dict[str, Any]] | None = None,
) -> dict:
    """Generate a Scope ``/api/v1/pipeline/load`` request body.

    Parameters
    ----------
    template : dict
        Loaded Synthograsizer JSON template.
    pipeline_id : str
        Main diffusion pipeline (e.g. "longlive", "stream-diffusion-v2").
    preprocessor_id : str | None
        Preprocessor pipeline to chain before the main pipeline.
        ``None`` disables preprocessing.
    resolution : (width, height)
        Output resolution.
    vace_enabled : bool
        Enable VACE reference conditioning.
    seed : int
        RNG seed for reproducibility.
    loras : list[dict] | None
        Optional LoRA configs ``[{"path": "...", "scale": 0.8}]``.

    Returns
    -------
    dict — JSON-serialisable payload for ``/api/v1/pipeline/load``.
    """
    pipeline_ids: list[str] = []
    if preprocessor_id:
        pipeline_ids.append(preprocessor_id)
    pipeline_ids.append(pipeline_id)

    width, height = resolution

    load_params: dict[str, Any] = {
        "height": height,
        "width": width,
        "seed": seed,
        "vace_enabled": vace_enabled,
    }

    if loras:
        load_params["lora_merge_mode"] = "runtime_peft"
        load_params["loras"] = [
            {"path": l["path"], "scale": l.get("scale", 1.0)} for l in loras
        ]

    return {
        "pipeline_ids": pipeline_ids,
        "load_params": load_params,
        "_synthograsizer_meta": {
            "template_name": template.get("promptTemplate", "")[:80],
            "variable_count": len(template.get("variables", [])),
        },
    }


def generate_initial_params(
    template: dict,
    values: dict[str, int] | None = None,
) -> dict:
    """Generate WebRTC ``initialParameters`` from a template.

    Returns the dict that goes into the ``initialParameters`` field of the
    ``POST /api/v1/webrtc/offer`` request.
    """
    prompt = resolve_prompt(template, values)
    return {
        "input_mode": "video",
        "prompts": [{"text": prompt, "weight": 1.0}],
        "denoising_step_list": [700, 500],
    }


def save_workflow(workflow: dict, path: str | Path) -> Path:
    """Write a workflow config to a JSON file."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(workflow, f, indent=2)
    return p
