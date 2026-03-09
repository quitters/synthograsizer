> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Server API

> REST and WebRTC API for real-time video generation

# Scope Server API

The Scope Server provides a REST API for pipeline management and a WebRTC API for real-time video streaming. Build custom applications that generate video in real-time using text prompts or input video.

## What You Can Build

* **Text-to-Video streaming** - Generate live video from text prompts
* **Video-to-Video transformation** - Transform input video in real-time
* **Custom creative tools** - Build VJ software, live performance tools, interactive installations
* **Integrations** - Connect Scope to your existing applications and workflows

<Tip>
  When the server is running locally, interactive API documentation (Swagger UI) is available at `http://localhost:8000/docs`. A full OpenAPI reference will be added to these docs soon.
</Tip>

***

## Quick Start

Get streaming video from the Scope API in under 5 minutes. You'll create an `index.html` file that streams real-time generated video using the `longlive` pipeline.

<Steps>
  <Step title="Start the server">
    ```bash  theme={null}
    uv run daydream-scope
    ```

    The server runs on `http://localhost:8000` by default.
  </Step>

  <Step title="Download models">
    If not already downloaded:

    ```bash  theme={null}
    uv run download_models --pipeline longlive
    ```
  </Step>

  <Step title="Create index.html">
    Create a file named `index.html` with the following content:

    ```html  theme={null}
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Scope API Quick Start</title>
      <style>
        body {
          margin: 0;
          background: #000;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        video {
          max-width: 100%;
          max-height: 100vh;
        }
        #status {
          position: fixed;
          top: 10px;
          left: 10px;
          color: #fff;
          font-family: monospace;
          background: rgba(0,0,0,0.7);
          padding: 10px;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div id="status">Connecting...</div>
      <video id="video" autoplay muted playsinline></video>

      <script>
        const API_BASE = "http://localhost:8000";
        const statusEl = document.getElementById("status");
        const videoEl = document.getElementById("video");

        async function loadPipeline() {
          statusEl.textContent = "Loading pipeline...";

          // Load the longlive pipeline
          await fetch(`${API_BASE}/api/v1/pipeline/load`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pipeline_ids: ["longlive"]
            })
          });

          // Wait for pipeline to finish loading
          while (true) {
            const response = await fetch(`${API_BASE}/api/v1/pipeline/status`);
            const { status } = await response.json();

            if (status === "loaded") break;
            if (status === "error") throw new Error("Pipeline failed to load");

            await new Promise(r => setTimeout(r, 1000));
          }

          statusEl.textContent = "Pipeline loaded";
        }

        async function startStream() {
          // Get ICE servers
          const iceResponse = await fetch(`${API_BASE}/api/v1/webrtc/ice-servers`);
          const { iceServers } = await iceResponse.json();

          // Create peer connection
          const pc = new RTCPeerConnection({ iceServers });

          // Store session ID for ICE candidates
          let sessionId = null;
          const queuedCandidates = [];

          // Create data channel for parameters
          const dataChannel = pc.createDataChannel("parameters", { ordered: true });

          dataChannel.onopen = () => {
            statusEl.textContent = "Connected - Streaming";
          };

          dataChannel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "stream_stopped") {
              statusEl.textContent = "Stream stopped: " + (data.error_message || "Unknown error");
              pc.close();
            }
          };

          // Add video transceiver (receive-only mode)
          pc.addTransceiver("video");

          // Handle incoming video track
          pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
              videoEl.srcObject = event.streams[0];
            }
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") {
              statusEl.textContent = "Connected - Streaming";
            } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
              statusEl.textContent = "Disconnected";
            }
          };

          // Send ICE candidates as they arrive (Trickle ICE)
          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              if (sessionId) {
                await fetch(`${API_BASE}/api/v1/webrtc/offer/${sessionId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    candidates: [{
                      candidate: event.candidate.candidate,
                      sdpMid: event.candidate.sdpMid,
                      sdpMLineIndex: event.candidate.sdpMLineIndex
                    }]
                  })
                });
              } else {
                queuedCandidates.push(event.candidate);
              }
            }
          };

          // Create and send offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          const sdpResponse = await fetch(`${API_BASE}/api/v1/webrtc/offer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sdp: pc.localDescription.sdp,
              type: pc.localDescription.type,
              initialParameters: {
                prompts: [{ text: "A 3D animated scene. A **panda** walks along a path towards the camera in a park on a spring day.", weight: 1.0 }],
                denoising_step_list: [1000, 750, 500, 250],
                manage_cache: true
              }
            })
          });

          const answer = await sdpResponse.json();
          sessionId = answer.sessionId;

          await pc.setRemoteDescription({
            type: answer.type,
            sdp: answer.sdp
          });

          // Send any queued ICE candidates
          if (queuedCandidates.length > 0) {
            await fetch(`${API_BASE}/api/v1/webrtc/offer/${sessionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                candidates: queuedCandidates.map(c => ({
                  candidate: c.candidate,
                  sdpMid: c.sdpMid,
                  sdpMLineIndex: c.sdpMLineIndex
                }))
              })
            });
          }
        }

        // Main
        (async () => {
          try {
            await loadPipeline();
            await startStream();
          } catch (error) {
            statusEl.textContent = "Error: " + error.message;
            console.error(error);
          }
        })();
      </script>
    </body>
    </html>
    ```
  </Step>

  <Step title="Open in browser">
    Open `index.html` in your browser. The page will:

    * Load the `longlive` pipeline
    * Establish a WebRTC connection
    * Display real-time generated video based on the prompt
  </Step>
</Steps>

***

## Configuration

### Server Options

```bash  theme={null}
uv run daydream-scope [OPTIONS]

Options:
  --host HOST       Host to bind to (default: 0.0.0.0)
  --port PORT       Port to bind to (default: 8000)
  --reload          Enable auto-reload for development
  -N, --no-browser  Don't open browser automatically
  --version         Show version and exit
```

### Environment Variables

| Variable          | Description                                                   |
| :---------------- | :------------------------------------------------------------ |
| `PIPELINE`        | Default pipeline to pre-warm on startup                       |
| `HF_TOKEN`        | Hugging Face token for downloading models and Cloudflare TURN |
| `VERBOSE_LOGGING` | Enable verbose logging for debugging                          |

### TURN Server Credentials

For WebRTC connections that need to traverse firewalls (NAT traversal), TURN servers are used. The server automatically configures TURN credentials when environment variables are set:

**Using Cloudflare (via Hugging Face)**:

```bash  theme={null}
export HF_TOKEN=your_huggingface_token
```

If no TURN credentials are configured, the server falls back to Google's public STUN server, which works for direct connections but may not work behind strict firewalls.

***

## API Endpoints

### Health & Info

| Endpoint                | Method | Description                                  |
| :---------------------- | :----- | :------------------------------------------- |
| `/health`               | GET    | Health check                                 |
| `/api/v1/hardware/info` | GET    | Get hardware info (VRAM, Spout availability) |
| `/docs`                 | GET    | Interactive API documentation (Swagger UI)   |

### Pipeline Management

| Endpoint                    | Method | Description                             |
| :-------------------------- | :----- | :-------------------------------------- |
| `/api/v1/pipeline/load`     | POST   | Load a pipeline                         |
| `/api/v1/pipeline/status`   | GET    | Get current pipeline status             |
| `/api/v1/pipelines/schemas` | GET    | Get schemas for all available pipelines |

### Model Management

| Endpoint                  | Method | Description                                   |
| :------------------------ | :----- | :-------------------------------------------- |
| `/api/v1/models/status`   | GET    | Check if models are downloaded for a pipeline |
| `/api/v1/models/download` | POST   | Start downloading models for a pipeline       |

### WebRTC

| Endpoint                            | Method | Description                       |
| :---------------------------------- | :----- | :-------------------------------- |
| `/api/v1/webrtc/ice-servers`        | GET    | Get ICE server configuration      |
| `/api/v1/webrtc/offer`              | POST   | Send WebRTC offer, receive answer |
| `/api/v1/webrtc/offer/{session_id}` | PATCH  | Add ICE candidates (Trickle ICE)  |

### Assets

| Endpoint                | Method | Description                           |
| :---------------------- | :----- | :------------------------------------ |
| `/api/v1/assets`        | GET    | List available assets (images/videos) |
| `/api/v1/assets`        | POST   | Upload an asset                       |
| `/api/v1/assets/{path}` | GET    | Serve an asset file                   |

### LoRA

| Endpoint            | Method | Description               |
| :------------------ | :----- | :------------------------ |
| `/api/v1/lora/list` | GET    | List available LoRA files |

***

## Next Steps

Learn how to use the API for specific workflows:

<CardGroup cols={2}>
  <Card title="Load Pipeline" href="/scope/reference/api/load-pipeline">
    Load and configure pipelines with custom parameters, LoRAs, and VAE types
  </Card>

  <Card title="Send Parameters" href="/scope/reference/api/parameters">
    Update prompts, transitions, and settings in real-time during streaming
  </Card>

  <Card title="Receive Video (T2V)" href="/scope/reference/api/receive-video">
    Set up WebRTC to receive generated video from text prompts
  </Card>

  <Card title="Send & Receive Video (V2V)" href="/scope/reference/api/send-receive">
    Transform input video in real-time with bidirectional WebRTC
  </Card>
</CardGroup>

<Card title="VACE" href="/scope/reference/api/vace">
  Guide generation with reference images and control videos
</Card>
