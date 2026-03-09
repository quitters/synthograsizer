> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Receive Video (T2V)

> Set up WebRTC to receive generated video from text prompts

# Receive Video

This guide shows how to set up a WebRTC connection to receive video from the Scope API in **text-to-video mode** (no input video, just prompts).

## Overview

In receive-only mode:

* You send text prompts to control generation
* The server generates video and streams it back
* No input video required

## Prerequisites

1. Server is running: `uv run daydream-scope`
2. Models are downloaded for your pipeline
3. Pipeline is loaded (see [Load Pipeline](/scope/reference/api/load-pipeline))

***

## Complete Example

```javascript  theme={null}
async function startReceiveStream(initialPrompt = "A beautiful landscape") {
  const API_BASE = "http://localhost:8000";

  // 1. Get ICE servers from backend
  const iceResponse = await fetch(`${API_BASE}/api/v1/webrtc/ice-servers`);
  const { iceServers } = await iceResponse.json();

  // 2. Create peer connection
  const pc = new RTCPeerConnection({ iceServers });

  // State management
  let sessionId = null;
  const queuedCandidates = [];

  // 3. Create data channel for parameters
  const dataChannel = pc.createDataChannel("parameters", { ordered: true });

  dataChannel.onopen = () => {
    console.log("Data channel opened - ready for parameter updates");
  };

  dataChannel.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "stream_stopped") {
      console.log("Stream stopped:", data.error_message);
      pc.close();
    }
  };

  // 4. Add video transceiver (receive-only, no input)
  pc.addTransceiver("video");

  // 5. Handle incoming video track
  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      const videoElement = document.getElementById("video");
      videoElement.srcObject = event.streams[0];
    }
  };

  // 6. Connection state monitoring
  pc.onconnectionstatechange = () => {
    console.log("Connection state:", pc.connectionState);
  };

  pc.oniceconnectionstatechange = () => {
    console.log("ICE state:", pc.iceConnectionState);
  };

  // 7. Handle ICE candidates (Trickle ICE)
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      if (sessionId) {
        await sendIceCandidate(sessionId, event.candidate);
      } else {
        queuedCandidates.push(event.candidate);
      }
    }
  };

  // 8. Create and send offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const response = await fetch(`${API_BASE}/api/v1/webrtc/offer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sdp: pc.localDescription.sdp,
      type: pc.localDescription.type,
      initialParameters: {
        prompts: [{ text: initialPrompt, weight: 1.0 }],
        denoising_step_list: [1000, 750, 500, 250],
        manage_cache: true
      }
    })
  });

  const answer = await response.json();
  sessionId = answer.sessionId;

  // 9. Set remote description
  await pc.setRemoteDescription({
    type: answer.type,
    sdp: answer.sdp
  });

  // 10. Send queued ICE candidates
  for (const candidate of queuedCandidates) {
    await sendIceCandidate(sessionId, candidate);
  }
  queuedCandidates.length = 0;

  return { pc, dataChannel, sessionId };
}

async function sendIceCandidate(sessionId, candidate) {
  await fetch(`http://localhost:8000/api/v1/webrtc/offer/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidates: [{
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex
      }]
    })
  });
}
```

***

## Step-by-Step Breakdown

<Steps>
  <Step title="Get ICE Servers">
    ```javascript  theme={null}
    const iceResponse = await fetch("http://localhost:8000/api/v1/webrtc/ice-servers");
    const { iceServers } = await iceResponse.json();
    ```

    The server returns STUN/TURN server configuration. If TURN credentials are configured (via [`HF_TOKEN`](/scope/guides/huggingface) or Twilio), this enables connections through firewalls.
  </Step>

  <Step title="Create Peer Connection">
    ```javascript  theme={null}
    const pc = new RTCPeerConnection({ iceServers });
    ```
  </Step>

  <Step title="Create Data Channel">
    ```javascript  theme={null}
    const dataChannel = pc.createDataChannel("parameters", { ordered: true });
    ```

    The data channel allows bidirectional communication:

    * **Client to Server**: Send parameter updates (prompts, settings)
    * **Server to Client**: Receive notifications (stream stopped, errors)
  </Step>

  <Step title="Add Video Transceiver">
    ```javascript  theme={null}
    pc.addTransceiver("video");
    ```

    For receive-only mode (no input video), we add a video transceiver instead of a track. This tells WebRTC we want to receive video.
  </Step>

  <Step title="Handle Incoming Track">
    ```javascript  theme={null}
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        document.getElementById("video").srcObject = event.streams[0];
      }
    };
    ```
  </Step>

  <Step title="Send Offer with Initial Parameters">
    ```javascript  theme={null}
    const response = await fetch("http://localhost:8000/api/v1/webrtc/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: offer.sdp,
        type: offer.type,
        initialParameters: {
          prompts: [{ text: "Your prompt here", weight: 1.0 }],
          denoising_step_list: [1000, 750, 500, 250],
          manage_cache: true
        }
      })
    });
    ```
  </Step>

  <Step title="Complete Signaling">
    ```javascript  theme={null}
    const answer = await response.json();
    await pc.setRemoteDescription({ type: answer.type, sdp: answer.sdp });
    ```
  </Step>
</Steps>

***

## Update Parameters During Streaming

After connection is established:

```javascript  theme={null}
function updatePrompt(newPrompt) {
  if (dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify({
      prompts: [{ text: newPrompt, weight: 1.0 }]
    }));
  }
}

// Smooth transition to new prompt
function transitionToPrompt(newPrompt, steps = 8) {
  dataChannel.send(JSON.stringify({
    transition: {
      target_prompts: [{ text: newPrompt, weight: 1.0 }],
      num_steps: steps
    }
  }));
}
```

***

## Stopping the Stream

```javascript  theme={null}
function stopStream(pc, dataChannel) {
  if (dataChannel) {
    dataChannel.close();
  }
  if (pc) {
    pc.close();
  }
}
```

***

## Error Handling

```javascript  theme={null}
dataChannel.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "stream_stopped") {
    if (data.error_message) {
      showError(data.error_message);
    }
    // Optionally attempt reconnection
    setTimeout(() => {
      startReceiveStream(lastPrompt);
    }, 2000);
  }
};

pc.onconnectionstatechange = () => {
  if (pc.connectionState === "failed") {
    console.error("WebRTC connection failed");
    // Handle reconnection
  }
};
```

***

## See Also

<CardGroup cols={2}>
  <Card title="Send & Receive Video" href="/scope/reference/api/send-receive">
    Bidirectional video streaming (V2V)
  </Card>

  <Card title="Send Parameters" href="/scope/reference/api/parameters">
    All available parameters
  </Card>

  <Card title="Load Pipeline" href="/scope/reference/api/load-pipeline">
    Configure pipeline before streaming
  </Card>

  <Card title="VACE" href="/scope/reference/api/vace">
    Reference image conditioning
  </Card>
</CardGroup>
