import base64
import logging
import time
import requests
import asyncio
from functools import partial
from typing import Optional
from backend import config
from backend.helpers import decode_base64_image
from google.genai import types

logger = logging.getLogger(__name__)

async def generate_video(self, prompt: str, model_name: str = config.MODEL_VIDEO_GEN,
                  duration_seconds: int = None, aspect_ratio: str = None,
                  end_frame_image: str = None, start_frame_image: str = None,
                  reference_images: list = None, extension_video_uri: str = None,
                  resolution: str = None, person_generation: str = None):
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

        # Use requested duration; fall back to a model-appropriate default.
        # Veo 3.1 rejects sub-8s durations across all modes (t2v, i2v, last_frame,
        # reference, extension) with a misleading "between 4 and 8 inclusive"
        # error — so when the client doesn't specify, default 3.1 to 8s.
        if duration_seconds:
            config_opts.duration_seconds = int(duration_seconds)
        elif "veo-3.1" in str(model_name):
            config_opts.duration_seconds = 8
        else:
            config_opts.duration_seconds = 5

        if aspect_ratio:
            config_opts.aspect_ratio = aspect_ratio

        if person_generation:
            # e.g. "allow_adult" — the implicit default is stricter for
            # image-to-video inputs that contain people, which surfaces as an
            # empty (RAI-filtered) response rather than an explicit error.
            config_opts.person_generation = person_generation

        if resolution and resolution in ("720p", "1080p", "4k"):
            config_opts.resolution = resolution
            # 1080p and 4k require 8s; enforce it here as a safety net
            if resolution in ("1080p", "4k"):
                config_opts.duration_seconds = 8

        # Prepare prompt/contents
        # prompt must be a string for generate_videos
        
        # Handle First Frame (image parameter) and Last Frame (last_frame in config)
        # Veo 3.1 supports first/last frame via image-to-video and interpolation
        # Decoding goes through `decode_base64_image`, which enforces a hard
        # size cap. Videos can have several large reference frames per call,
        # so we want to bounce oversized payloads early rather than spending
        # quota and memory on a doomed request.
        first_frame_obj = None
        if start_frame_image:
            start_bytes = decode_base64_image(start_frame_image)
            if aspect_ratio:
                start_bytes = self.ensure_aspect_ratio(start_bytes, aspect_ratio)
            first_frame_obj = types.Image(image_bytes=start_bytes, mime_type="image/jpeg")
            # Veo 3.1 image-to-video rejects shorter durations with a misleading
            # "out of bound" error — pin to 8s, same as last_frame / reference / extension paths.
            if "veo-3.1" in str(model_name):
                config_opts.duration_seconds = 8
            logger.info("Using first frame for video generation (image parameter, duration=%ss)", config_opts.duration_seconds)

        if end_frame_image:
            end_bytes = decode_base64_image(end_frame_image)
            if aspect_ratio:
                end_bytes = self.ensure_aspect_ratio(end_bytes, aspect_ratio)
            config_opts.last_frame = types.Image(image_bytes=end_bytes, mime_type="image/jpeg")
            logger.info("Using last frame for video interpolation (last_frame parameter)")

        # Handle Reference Images (Veo 3.1 full/fast only — up to 3 asset images)
        extension_video_obj = None
        if reference_images:
            ref_objs = []
            for i, ref_b64 in enumerate(reference_images[:3]):
                ref_bytes = decode_base64_image(ref_b64)
                if aspect_ratio:
                    ref_bytes = self.ensure_aspect_ratio(ref_bytes, aspect_ratio)
                ref_img = types.Image(image_bytes=ref_bytes, mime_type="image/jpeg")
                ref_objs.append(types.VideoGenerationReferenceImage(image=ref_img, reference_type="asset"))
            config_opts.reference_images = ref_objs
            # Reference images require 8s duration per API spec
            config_opts.duration_seconds = 8
            logger.info("Using %d reference image(s) for Veo 3.1 direction (duration forced to 8s)", len(ref_objs))

        # Handle Video Extension (Veo 3.1 full/fast only)
        # Must reference a stored URI from a prior Veo generation — inline bytes are rejected by the API.
        if extension_video_uri:
            # NOTE: no mime_type — the SDK serializes it as `encoding`, which
            # the current Veo API rejects with 400 INVALID_ARGUMENT.
            extension_video_obj = types.Video(uri=extension_video_uri)
            # Extension requires 720p and 8s duration per API spec;
            # aspect ratio is inherited from the source video, so we don't set it.
            config_opts.duration_seconds = 8
            config_opts.resolution = "720p"
            config_opts.aspect_ratio = None
            logger.info("Using video extension mode — URI=%s (duration=8s, resolution=720p)", extension_video_uri)

        logger.info("Starting video generation with model %s (duration_seconds=%s, aspect_ratio=%s)",
                    model_name, config_opts.duration_seconds, config_opts.aspect_ratio)
        # Only pass image/video kwargs when we actually have them — passing None
        # causes Veo 3.1 to reject valid durationSeconds values.
        video_kwargs = dict(model=model_name, prompt=prompt, config=config_opts)
        if extension_video_obj is not None:
            # Extension mode: pass video, skip first frame
            video_kwargs['video'] = extension_video_obj
        elif first_frame_obj is not None:
            video_kwargs['image'] = first_frame_obj
        operation = self.genai_client.models.generate_videos(**video_kwargs)

        logger.info("Operation started: %s. Polling for completion...", operation.name)

        # Poll until complete with timeout
        MAX_POLL_SECONDS = config.VIDEO_POLL_TIMEOUT_SECONDS
        poll_start = time.time()
        while not operation.done:
            elapsed = time.time() - poll_start
            if elapsed > MAX_POLL_SECONDS:
                raise Exception(f"Video generation timed out after {MAX_POLL_SECONDS}s")
            await asyncio.sleep(5)
            logger.debug("Still generating... (%ds elapsed)", int(elapsed))
            operation = self.genai_client.operations.get(operation)

        logger.info("Generation complete.")
        
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
                    logger.info("Video URI found. Downloading...")
                    # Pass the API key via header instead of embedding in URL —
                    # URL params leak into proxies, browser history, and error reporters.
                    headers = {"x-goog-api-key": self.api_key} if self.api_key else {}
                    loop = asyncio.get_event_loop()
                    vid_response = await loop.run_in_executor(
                        None,
                        partial(
                            requests.get,
                            video_uri,
                            headers=headers,
                            timeout=config.VIDEO_DOWNLOAD_TIMEOUT_SECONDS,
                        ),
                    )

                    if vid_response.status_code == 200:
                        logger.info("Video downloaded (%d bytes)", len(vid_response.content))
                        self.save_output(vid_response.content, f"vid_{model_name}")
                        return {
                            "video_b64": base64.b64encode(vid_response.content).decode('utf-8'),
                            "video_uri": video_uri,
                        }
                    else:
                        logger.error("Failed to download video. Status: %s", vid_response.status_code)
                        raise Exception(f"Failed to download video from URI: {vid_response.text}")

            if hasattr(video_wrapper, 'video_bytes') and video_wrapper.video_bytes:
                logger.info("Video bytes found directly (%d bytes)", len(video_wrapper.video_bytes))
                self.save_output(video_wrapper.video_bytes, f"vid_{model_name}")
                return {
                    "video_b64": base64.b64encode(video_wrapper.video_bytes).decode('utf-8'),
                    "video_uri": None,
                }
        
        # Surface RAI filtering explicitly — an empty result with a filtered
        # count is a content-policy rejection, not a malformed response.
        filtered_count = getattr(response, "rai_media_filtered_count", None)
        filtered_reasons = getattr(response, "rai_media_filtered_reasons", None)
        if filtered_count:
            reasons = "; ".join(str(r) for r in (filtered_reasons or []))[:400]
            raise Exception(f"RAI filtered ({filtered_count}): {reasons or 'no reason given'}")
        raise Exception("No video found in response")

    except Exception as e:
        logger.exception("Video generation error: %s", e)
        raise

