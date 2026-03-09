> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Using VACE

> Guide generation with reference images and control videos

# Using VACE

VACE (Video All-in-One Creation and Editing) enables advanced video creation and editing tasks in Scope. Use reference images to define characters and styles, or control videos to guide the structure and motion of your generations.

<Warning>
  VACE support is still experimental and the implementation is incomplete. Some features may not work as expected.
</Warning>

***

## Pipeline Compatibility

VACE is supported on the following pipelines:

### Wan2.1 1.3B Pipelines

* LongLive
* RewardForcing
* MemFlow

### Wan2.1 14B Pipeline

* Krea Realtime

<Note>
  StreamDiffusion V2 also has VACE capabilities, but quality is currently limited.
</Note>

<Warning>
  **Krea Realtime + VACE** requires approximately **55GB of VRAM**.

  FP8 quantization is not currently supported with VACE. Continued prompting with Krea + VACE may require resetting the cache due to cache recomputation limitations.
</Warning>

***

## Supported Features

<CardGroup cols={2}>
  <Card title="Reference-to-Video (R2V)" icon="image">
    Use reference images to guide the character, style, and aesthetic of your generation
  </Card>

  <Card title="Video-to-Video (V2V)" icon="video">
    Use control videos (depth, pose, scribble, optical flow) to guide the structure and motion
  </Card>

  <Card title="Animate Anything" icon="wand-magic-sparkles">
    Combine R2V + V2V: reference image defines the look, control video provides the movement
  </Card>

  <Card title="Real-time Depth" icon="layer-group">
    Built-in `video-depth-anything` preprocessor generates depth maps from source videos automatically
  </Card>
</CardGroup>

### Built-in Preprocessors

For real-time V2V workflows, these preprocessors automatically generate control signals from your video input (webcam, screen capture, or uploaded video):

| Pipeline               | Description                                           | Model Required   |
| :--------------------- | :---------------------------------------------------- | :--------------- |
| `video-depth-anything` | Depth estimation for temporally consistent depth maps | Yes (~1GB VRAM) |
| `optical-flow`         | RAFT optical flow for motion visualization            | No (torchvision) |
| `scribble`             | Contour/line art extraction                           | Yes              |
| `gray`                 | Grayscale conversion                                  | No               |

Select a preprocessor from the **Preprocessor** dropdown in the UI when using Video input mode. The preprocessor output becomes the control signal for V2V generation.

<Note>
  Additional preprocessors will be available via nodes in the future.
</Note>

### Not Yet Supported

The following features are being investigated but not currently available:

* Multiple reference images for R2V
* Masked video-to-video (MV2V) for inpainting, outpainting, and video extension
* Complex tasks like Swap Anything, Reference Anything, Move Anything, Expand Anything

***

## Enabling VACE

Before using any VACE features, make sure VACE is enabled in your pipeline settings.

<Steps>
  <Step title="Open Settings">
    Click the **Settings** panel in the Scope interface.
  </Step>

  <Step title="Enable VACE">
    Toggle **VACE** to **On**.
  </Step>
</Steps>

***

## Reference-to-Video (R2V)

Use a reference image to guide the character, style, or aesthetic of your generation. The model will try to maintain consistency with the reference throughout the video.

<Steps>
  <Step title="Add a reference image">
    In the Settings panel, find **Reference Images** and click **Add Image**.
  </Step>

  <Step title="Select your image">
    Use the media picker to either:

    * Upload a new image
    * Select from your previously uploaded assets
  </Step>

  <Step title="Verify the reference">
    You should see a preview of your selected reference image in the panel.
  </Step>
</Steps>

<Note>
  Only a single reference image is supported at this time. Multi-reference support is planned for a future release.
</Note>

***

## Video-to-Video (V2V)

Use a control video to guide the structure and motion of your generation. Control videos can be depth maps, pose estimations, scribbles, or optical flow visualizations.

<Steps>
  <Step title="Set input mode to Video">
    Under **Input & Controls**, set **Input Mode** to **Video**.
  </Step>

  <Step title="Upload a control video">
    Upload your control video (e.g., a depth map or pose estimation video).
  </Step>

  <Step title="Generate">
    The output will follow the structure of your control video while applying the style from your prompt.
  </Step>
</Steps>

***

## Animate Anything

Combine Reference-to-Video and Video-to-Video for the best of both worlds:

* **Reference image** → Defines the character, style, and aesthetic
* **Control video** → Provides the structure and motion

This is powerful for animating still images or transferring motion to custom characters.

### Example Workflow

<Steps>
  <Step title="Add a reference image">
    Upload an image of your character or style reference.
  </Step>

  <Step title="Add a control video">
    Upload a pose or depth video that contains the motion you want.
  </Step>

  <Step title="Generate">
    The output combines the look from your reference with the motion from your control video.
  </Step>
</Steps>

### Tips for Best Results

<AccordionGroup>
  <Accordion title="Reference image quality">
    Use high-quality reference images with clear subjects. The model works best when the reference has good lighting and a clean background.
  </Accordion>

  <Accordion title="Control video resolution">
    Match your control video resolution to your pipeline's output resolution for best structural accuracy.
  </Accordion>

  <Accordion title="Combine with LoRAs">
    For character consistency, pair VACE with a relevant LoRA. This helps maintain style and identity across the generation.
  </Accordion>

  <Accordion title="Manage cache for long sessions">
    If quality degrades during long sessions with Krea + VACE, try resetting the cache to restore output quality.
  </Accordion>
</AccordionGroup>

***

## API Usage

For programmatic control of VACE features, see the API reference:

<Card title="VACE API Reference" icon="brackets-curly" href="/scope/reference/api/vace">
  Upload reference images, set context scale, and combine with control videos via WebRTC
</Card>

***

## See Also

<CardGroup cols={2}>
  <Card title="LoRAs Guide" icon="wand-magic-sparkles" href="/scope/guides/loras">
    Enhance VACE with style-consistent LoRAs
  </Card>

  <Card title="Quick Start" icon="rocket" href="/scope/getting-started/quickstart">
    Get Scope running if you haven't already
  </Card>
</CardGroup>
