import base64
import time
import requests
import asyncio
from typing import Optional
from backend import config
from backend.helpers import decode_base64_image
from google.genai import types

async def generate_video(self, prompt: str, model_name: str = config.MODEL_VIDEO_GEN,
                  duration_seconds: int = None, aspect_ratio: str = None,
                  end_frame_image: str = None, start_frame_image: str = None,
                  reference_images: list = None, extension_video_uri: str = None,
                  resolution: str = None):
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

        # Use requested duration; fall back to 5s if not provided
        config_opts.duration_seconds = int(duration_seconds) if duration_seconds else 5

        if aspect_ratio:
            config_opts.aspect_ratio = aspect_ratio

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
            print(f"Using first frame for video generation (image parameter)")

        if end_frame_image:
            end_bytes = decode_base64_image(end_frame_image)
            if aspect_ratio:
                end_bytes = self.ensure_aspect_ratio(end_bytes, aspect_ratio)
            config_opts.last_frame = types.Image(image_bytes=end_bytes, mime_type="image/jpeg")
            print(f"Using last frame for video interpolation (last_frame parameter)")

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
            print(f"Using {len(ref_objs)} reference image(s) for Veo 3.1 direction (duration forced to 8s)")

        # Handle Video Extension (Veo 3.1 full/fast only)
        # Must reference a stored URI from a prior Veo generation — inline bytes are rejected by the API.
        if extension_video_uri:
            extension_video_obj = types.Video(uri=extension_video_uri, mime_type="video/mp4")
            # Extension requires 720p and 8s duration per API spec;
            # aspect ratio is inherited from the source video, so we don't set it.
            config_opts.duration_seconds = 8
            config_opts.resolution = "720p"
            config_opts.aspect_ratio = None
            print(f"Using video extension mode — URI={extension_video_uri} (duration=8s, resolution=720p)")

        print(f"Starting video generation with model {model_name}...")
        print(f"  duration_seconds={config_opts.duration_seconds}, aspect_ratio={config_opts.aspect_ratio}")
        # Only pass image/video kwargs when we actually have them — passing None
        # causes Veo 3.1 to reject valid durationSeconds values.
        video_kwargs = dict(model=model_name, prompt=prompt, config=config_opts)
        if extension_video_obj is not None:
            # Extension mode: pass video, skip first frame
            video_kwargs['video'] = extension_video_obj
        elif first_frame_obj is not None:
            video_kwargs['image'] = first_frame_obj
        operation = self.genai_client.models.generate_videos(**video_kwargs)
        
        print(f"Operation started: {operation.name}. Polling for completion...")
        
        # Poll until complete with timeout
        MAX_POLL_SECONDS = config.VIDEO_POLL_TIMEOUT_SECONDS
        poll_start = time.time()
        while not operation.done:
            elapsed = time.time() - poll_start
            if elapsed > MAX_POLL_SECONDS:
                raise Exception(f"Video generation timed out after {MAX_POLL_SECONDS}s")
            await asyncio.sleep(5)
            print(f"Still generating... ({int(elapsed)}s elapsed)")
            operation = self.genai_client.operations.get(operation)

        print("Generation complete.")
        
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
                    print(f"Video URI found: {video_uri}. Downloading...")
                    download_url = f"{video_uri}&key={self.api_key}"
                    # Use run_in_executor for blocking request
                    loop = asyncio.get_event_loop()
                    vid_response = await loop.run_in_executor(None, requests.get, download_url)

                    if vid_response.status_code == 200:
                        print(f"Video downloaded! Size: {len(vid_response.content)} bytes")
                        self.save_output(vid_response.content, f"vid_{model_name}")
                        return {
                            "video_b64": base64.b64encode(vid_response.content).decode('utf-8'),
                            "video_uri": video_uri,
                        }
                    else:
                        print(f"Failed to download video. Status: {vid_response.status_code}")
                        raise Exception(f"Failed to download video from URI: {vid_response.text}")

            if hasattr(video_wrapper, 'video_bytes') and video_wrapper.video_bytes:
                print(f"Video bytes found directly. Size: {len(video_wrapper.video_bytes)} bytes")
                self.save_output(video_wrapper.video_bytes, f"vid_{model_name}")
                return {
                    "video_b64": base64.b64encode(video_wrapper.video_bytes).decode('utf-8'),
                    "video_uri": None,
                }
        
        raise Exception("No video found in response")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Video generation error: {str(e)}")
        raise e

