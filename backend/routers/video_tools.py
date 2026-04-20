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

@router.post("/api/video/combine")
async def combine_videos(request: CombineVideosRequest):
    """Concatenate multiple MP4 videos into one using FFmpeg concat demuxer."""
    import tempfile
    import subprocess
    import shutil

    if not request.videos or len(request.videos) < 2:
        raise HTTPException(status_code=400, detail="At least 2 videos required")

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise HTTPException(status_code=500, detail="FFmpeg not found on system")

    tmp_dir = tempfile.mkdtemp(prefix="svo_combine_")
    try:
        # Write each video to a temp file
        input_files = []
        for i, b64 in enumerate(request.videos):
            vid_bytes = base64.b64decode(b64)
            path = os.path.join(tmp_dir, f"part_{i}.mp4")
            with open(path, "wb") as f:
                f.write(vid_bytes)
            input_files.append(path)

        # Write concat list file
        list_path = os.path.join(tmp_dir, "concat.txt")
        with open(list_path, "w") as f:
            for p in input_files:
                # FFmpeg requires forward slashes or escaped backslashes
                f.write(f"file '{p.replace(os.sep, '/')}'\n")

        output_path = os.path.join(tmp_dir, "combined.mp4")

        # Run FFmpeg concat
        result = subprocess.run(
            [ffmpeg_path, "-y", "-f", "concat", "-safe", "0",
             "-i", list_path, "-c", "copy", output_path],
            capture_output=True, text=True, timeout=120
        )

        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr}")
            raise Exception(f"FFmpeg failed: {result.stderr[:200]}")

        # Read combined video and return as base64
        with open(output_path, "rb") as f:
            combined_b64 = base64.b64encode(f.read()).decode("utf-8")

        return {"status": "success", "video": combined_b64}

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Video combining timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video combine failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temp files
        shutil.rmtree(tmp_dir, ignore_errors=True)



