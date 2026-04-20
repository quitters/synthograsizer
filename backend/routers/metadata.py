import asyncio
import logging
import base64
import re
import time
import os
import io
import tempfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse, Response
import httpx
from typing import Optional, List, Dict

from backend.ai_manager import ai_manager, normalize_template
from backend.osc_bridge import osc_bridge
from backend.music_manager import get_music_manager
from backend import config
from backend.models.requests import *
from backend.helpers import decode_base64_image, parse_llm_json

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/api/extract-metadata")
async def extract_metadata(request: MetadataRequest):
    try:
        image_bytes = decode_base64_image(request.image)
        metadata = ai_manager.extract_metadata(image_bytes)
        return {"status": "success", "metadata": metadata}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/extract-metadata/bulk")
async def extract_metadata_bulk(request: BulkMetadataRequest):
    """Extract metadata from multiple PNG images in bulk.
    
    Returns a list of results with prompts extracted from each image.
    """
    results = []
    for idx, img_b64 in enumerate(request.images):
        try:
            image_bytes = decode_base64_image(img_b64)
            metadata = ai_manager.extract_metadata(image_bytes)
            
            results.append({
                "index": idx,
                "status": "success",
                "metadata": metadata,
                "prompt": metadata.get("prompt", "")
            })
            
        except Exception as e:
            results.append({
                "index": idx,
                "status": "error",
                "error": str(e),
                "prompt": ""
            })
    
    return {"status": "success", "results": results}

# Serve Static Files
# Serves the entire Synthograsizer Suite from the static/ directory
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"


