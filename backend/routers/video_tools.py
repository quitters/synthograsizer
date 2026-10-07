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

def _has_audio_stream(ffmpeg_path: str, path: str) -> bool:
    """True when the file has an audio stream (ffmpeg -i lists streams on stderr and exits non-zero without an output)."""
    import subprocess
    probe = subprocess.run([ffmpeg_path, "-hide_banner", "-i", path], capture_output=True, text=True, timeout=30)
    return " Audio:" in (probe.stderr or "")


def _mix_score(ffmpeg_path: str, film_path: str, score_path: str, volume: float, output_path: str) -> None:
    """Mix a score under a film: the film's picture is copied untouched, its sound (if it has any) stays at full level and the
    score sits under it at `volume`. The result ends when the film ends; a shorter score is followed by silence."""
    import subprocess
    if _has_audio_stream(ffmpeg_path, film_path):
        # normalize=0 keeps each input at its own level (amix halves them by default); older ffmpegs lack the option
        for mix in ("amix=inputs=2:duration=first:dropout_transition=0:normalize=0", "amix=inputs=2:duration=first:dropout_transition=0"):
            graph = f"[1:a]volume={volume}[score];[0:a][score]{mix}[a]"
            result = subprocess.run(
                [ffmpeg_path, "-y", "-i", film_path, "-i", score_path, "-filter_complex", graph,
                 "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", output_path],
                capture_output=True, text=True, timeout=300)
            if result.returncode == 0:
                return
            if "normalize" not in (result.stderr or ""):
                break
        raise Exception(f"FFmpeg failed: {result.stderr[-300:]}")
    result = subprocess.run(
        [ffmpeg_path, "-y", "-i", film_path, "-i", score_path, "-filter_complex", f"[1:a]volume={volume}[a]",
         "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", output_path],
        capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise Exception(f"FFmpeg failed: {result.stderr[-300:]}")


@router.post("/api/video/combine")
async def combine_videos(request: CombineVideosRequest):
    """Concatenate MP4 videos into one with FFmpeg, optionally mixing a score under the sound.

    Two or more clips are joined with the concat demuxer (stream copy: clips from one generator share codecs). With
    `audio` a single clip is enough: the score is mixed under the clip's own sound (see _mix_score).
    """
    import tempfile
    import subprocess
    import shutil

    if not request.videos or (len(request.videos) < 2 and not request.audio):
        raise HTTPException(status_code=400, detail="At least 2 videos required")

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise HTTPException(status_code=500, detail="FFmpeg not found on system")

    tmp_dir = tempfile.mkdtemp(prefix="svo_combine_")
    try:
        # Write each video to a temp file
        input_files = []
        for i, b64 in enumerate(request.videos):
            vid_bytes = base64.b64decode(b64.split(",", 1)[1] if b64.startswith("data:") else b64)
            path = os.path.join(tmp_dir, f"part_{i}.mp4")
            with open(path, "wb") as f:
                f.write(vid_bytes)
            input_files.append(path)

        if len(input_files) > 1:
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
        else:
            output_path = input_files[0]

        if request.audio:
            score_path = os.path.join(tmp_dir, "score.bin")
            audio_b64 = request.audio.split(",", 1)[1] if request.audio.startswith("data:") else request.audio
            with open(score_path, "wb") as f:
                f.write(base64.b64decode(audio_b64))
            scored_path = os.path.join(tmp_dir, "scored.mp4")
            _mix_score(ffmpeg_path, output_path, score_path, request.audio_volume, scored_path)
            output_path = scored_path

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



