> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# VACE API

> Guide generation with reference images and control videos via the API

## Overview

VACE (Video All-In-One Creation and Editing) enables guided generation through reference images and control videos. It allows you to condition generation on reference images (style, character, scene) and use control videos to preserve structure and motion.

## Key Parameters

Two primary parameters control VACE behavior:

| Parameter           | Type   | Default | Range   | Description                             |
| :------------------ | :----- | :------ | :------ | :-------------------------------------- |
| `vace_ref_images`   | array  | `[]`    | -       | Array of reference image paths          |
| `vace_context_scale` | float | `1.0`   | 0.0-2.0 | Strength of visual conditioning         |

The context scale ranges from no influence (0.0) to maximum influence (2.0), with the default balanced setting at 1.0.

## Setting Reference Images via Initial Parameters

You can set reference images when establishing the WebRTC connection:

```javascript  theme={null}
const response = await fetch("http://localhost:8000/api/v1/webrtc/offer", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sdp: offer.sdp,
    type: offer.type,
    initialParameters: {
      prompts: [{ text: "Your prompt here", weight: 1.0 }],
      vace_ref_images: ["/api/v1/assets/my-reference.png"],
      vace_context_scale: 1.0
    }
  })
});
```

## Uploading Reference Images

Upload images via the assets API before using them:

```javascript  theme={null}
async function uploadReferenceImage(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("http://localhost:8000/api/v1/assets", {
    method: "POST",
    body: formData
  });

  const { path } = await response.json();
  return path;
}

// Upload and use as reference
const imagePath = await uploadReferenceImage(myImageFile);

// Then use in parameters
dataChannel.send(JSON.stringify({
  vace_ref_images: [imagePath],
  vace_context_scale: 1.0
}));
```

## Updating VACE Parameters During Streaming

You can update VACE parameters via the data channel during active streaming:

```javascript  theme={null}
// Update reference image
dataChannel.send(JSON.stringify({
  vace_ref_images: ["/api/v1/assets/new-reference.png"],
  vace_context_scale: 1.2
}));

// Remove reference image
dataChannel.send(JSON.stringify({
  vace_ref_images: []
}));

// Adjust context scale only
dataChannel.send(JSON.stringify({
  vace_context_scale: 0.8
}));
```

## Combining with Control Videos

VACE works alongside video-to-video mode, allowing simultaneous use of control video for motion guidance and reference images for stylistic direction:

```javascript  theme={null}
// Start V2V stream with reference image
const { pc, dataChannel } = await startBidirectionalStream(webcamStream, "A beautiful painting");

// Add reference image for style guidance
dataChannel.send(JSON.stringify({
  vace_ref_images: ["/api/v1/assets/style-reference.png"],
  vace_context_scale: 1.0
}));
```

## Prerequisites

VACE must be enabled when loading the pipeline:

```javascript  theme={null}
await loadPipeline({
  pipeline_ids: ["longlive"],
  load_params: {
    vace_enabled: true  // default is true
  }
});
```

## See Also

<CardGroup cols={2}>
  <Card title="VACE Guide" icon="image" href="/scope/guides/vace">
    Using VACE features in the Scope UI
  </Card>

  <Card title="Send Parameters" href="/scope/reference/api/parameters">
    All available runtime parameters
  </Card>

  <Card title="Send & Receive Video" href="/scope/reference/api/send-receive">
    Video-to-video streaming setup
  </Card>

  <Card title="Load Pipeline" href="/scope/reference/api/load-pipeline">
    Configure VACE at load time
  </Card>
</CardGroup>
