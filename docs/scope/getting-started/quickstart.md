> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Quick Start

> Get Scope running and generate your first AI video

# Get Started with Scope

Daydream Scope is an open-source tool for running and customizing real-time interactive generative AI pipelines and models.

Watch this 10-minute walkthrough covering the main Scope features and how to get your first generation running:

<iframe className="w-full aspect-video rounded-xl" src="https://www.youtube.com/embed/Ls2OGg8soNU" title="Daydream Scope Tutorial" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />

Follow the steps below to install Scope and create your first generation.

***

## Prerequisites

**For Desktop App or Local Installation:**

* NVIDIA GPU with ≥24GB VRAM (RTX 4090/5090 or similar)
* CUDA 12.8+ drivers
* Windows or Linux

<Tip>
  **No powerful GPU?** Daydream Scope Cloud lets you run inference remotely - right from the app - without needing a local GPU. This means Mac users and anyone without a dedicated NVIDIA card can still use Scope. See the [Remote Inference guide](/scope/guides/remote-inference) to get started.
</Tip>

**For Cloud (RunPod):**

* RunPod account with credits
* Similar GPU requirements apply to your instance selection

<Card title="Full System Requirements" icon="server" href="/scope/reference/system-requirements">
  View detailed hardware specs, pipeline-specific VRAM needs, and software dependencies
</Card>

<Note>
  **Krea Realtime** requires ≥32GB VRAM and uses the **fp8 quantized model** at that tier (e.g. RTX 5090). For higher resolutions without quantization, ≥40GB VRAM is recommended (e.g. H100, RTX 6000 Pro). A 24GB GPU like the RTX 4090 cannot run Krea Realtime - use LongLive or StreamDiffusion V2 instead.
</Note>

***

## Step 1: Install Scope

Choose your installation method:

<Tabs>
  <Tab title="Desktop App" id="desktop-app" icon="download">
    <Tip>
      **Best for:** Windows users who want the easiest installation experience
    </Tip>

    The Daydream Scope desktop app is an Electron-based application that provides the simplest way to get Scope running on your Windows machine.

    <Card title="Download Daydream Scope for Windows" icon="download" href="https://github.com/daydreamlive/scope/releases/latest/download/DaydreamScope-Setup.exe">
      Download the latest Windows installer (.exe). This link always points to the most recent release.
    </Card>

    <Steps>
      <Step title="Install the application">
        Run the downloaded `.exe` file and follow the standard Windows installation prompts.
      </Step>

      <Step title="Launch Scope">
        Once installed, launch Daydream Scope from your Start menu or desktop shortcut.
      </Step>
    </Steps>

    <Accordion title="Looking for a specific version?">
      Visit the [Daydream Scope releases page](https://github.com/daydreamlive/scope/releases) on GitHub. Select the release you want, expand the **Assets** section at the bottom, and download the file ending in `.exe`.
    </Accordion>
  </Tab>

  <Tab title="Local Install" id="local-installation" icon="desktop">
    <Tip>
      **Best for:** Developers who want to build on top of Scope - custom nodes, API integration, or running bleeding-edge code from the `main` branch before it ships in a release. You get full access to the Python environment and source code, but you manage dependencies (UV, Node.js, CUDA drivers) yourself. There are no auto-updates.
    </Tip>

    <Steps>
      <Step title="Check your GPU drivers">
        Verify that your NVIDIA drivers support CUDA 12.8 or higher:

        ```bash  theme={null}
        nvidia-smi
        ```

        The output should show your GPU and a CUDA version of at least 12.8.
      </Step>

      <Step title="Install dependencies">
        You'll need:

        * **UV** (Python package manager)
        * **Node.js** and **npm**

        If you don't have these installed, visit their respective websites for installation instructions.
      </Step>

      <Step title="Clone the repository">
        ```bash  theme={null}
        git clone git@github.com:daydreamlive/scope.git
        cd scope
        ```
      </Step>

      <Step title="Build frontend and install dependencies">
        ```bash  theme={null}
        uv run build
        ```

        This installs all required Python packages including Torch and FlashAttention. First-time install may take a while.
      </Step>

      <Step title="Start the Scope server">
        ```bash  theme={null}
        uv run daydream-scope
        ```

        On the first run, model weights will download automatically to `~/.daydream-scope/models`.
      </Step>

      <Step title="Access the UI">
        Open your browser and navigate to **[http://localhost:8000](http://localhost:8000)**
      </Step>
    </Steps>

    <Card title="Building custom nodes?" icon="puzzle-piece" href="/scope/guides/node-development">
      Local install is the recommended path for node development. See the node development guide to get started.
    </Card>
  </Tab>

  <Tab title="Cloud (RunPod)" id="cloud-deployment-runpod" icon="cloud">
    <Tip>
      **Best for:** Researchers and developers without access to local high-end GPUs
    </Tip>

    RunPod is a third-party cloud GPU service. We've created a template to make deployment simple.

    You'll need a RunPod account with credits. Create an account at [runpod.io](https://runpod.io) and add funds to get started.

    **Prefer video?** Watch the RunPod tutorial:

    <iframe className="w-full aspect-video rounded-xl" src="https://www.youtube.com/embed/XBFtgSQg7X4?si=TP9U0XkCXnObArS0" title="RunPod Deployment Tutorial" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />

    <Steps>
      <Step title="Access the Daydream Scope template">
        Click to deploy: [**Deploy Daydream Scope on RunPod**](https://console.runpod.io/deploy?template=aca8mw9ivw\&ref=5k8hxjq3)
      </Step>

      <Step title="Create a HuggingFace token">
        Required for TURN server functionality (WebRTC in cloud environments):

        1. Create account at [huggingface.co](https://huggingface.co)
        2. Navigate to **Settings > Access Tokens**
        3. Create a token with **read** permissions
        4. Copy the token

        <Info>
          HuggingFace provides 10GB of free streaming per month via Cloudflare TURN servers. For more details on authentication methods and troubleshooting, see the [HuggingFace Auth](/scope/guides/huggingface) guide.
        </Info>
      </Step>

      <Step title="Select your GPU">
        Choose a GPU with:

        * **Minimum:** ≥24GB VRAM
        * **Recommended:** NVIDIA RTX 4090/5090 or similar
        * **CUDA:** 12.8+ support
      </Step>

      <Step title="Configure environment variables">
        1. Click **"Edit Template"**
        2. Add variable: `HF_TOKEN` = your HuggingFace token
        3. Click **"Save"**
      </Step>

      <Step title="Deploy your instance">
        Click **"Deploy On-Demand"** and wait for deployment to complete.
      </Step>

      <Step title="Access your Scope instance">
        Open the app at **port 8000**: `https://your-instance-id.runpod.io:8000`
      </Step>
    </Steps>
  </Tab>
</Tabs>

***

## Step 2: Your First Generation

Once Scope is running, open the interface at `localhost:8000` (or your RunPod URL).

### Text-to-Video

The LongLive pipeline is pre-selected with a prompt describing a 3D animated panda walking through a park. Just hit **play** - you'll see the generation running in real-time, frame by frame, with no render queue or progress bar.

Stop the generation, try changing the prompt to something completely different, and hit play again:

* "a dragon flying through clouds over a volcano"
* "a robot walking on mars"
* "an astronaut floating through a neon city"

The generation adapts in real-time - you're steering it live, not queueing up renders.

### Video-to-Video

Now try switching the input mode from **Text** to **Video**. A looping cat test video is loaded by default. Hit play and watch the model transform the video based on your prompt while preserving its structure and motion.

Experiment with different prompts to see how the same source video gets reinterpreted:

* "a cow sitting in the grass"
* "a fish sitting in the grass"
* "a dragon sitting in the grass"

<Note>
  You can also use your **webcam** as a live input, load your own **video file**, or receive video from other applications via **Spout** (Windows only).
</Note>

### Explore Community Projects

See what others are creating with Scope:

<CardGroup cols={2}>
  <Card title="Realtime Camera Restyle" icon="camera" href="https://app.daydream.live/creators/ericxtang/realtime-camera-restyle-on-ipad?utm_source=docs&utm_medium=web&utm_campaign=docs2com">
    Live camera feed restyled in real-time using VACE on an iPad
  </Card>

  <Card title="Flower Transformation" icon="seedling" href="https://app.daydream.live/creators/as.ws__/streamdiffusiontd-to-scope-seeded-case-study?utm_source=docs&utm_medium=web&utm_campaign=docs2com">
    A seeded case study exploring StreamDiffusion to Scope transition
  </Card>
</CardGroup>

<Card title="Browse all community projects" icon="globe" href="https://app.daydream.live/discover?utm_source=docs&utm_medium=web&utm_campaign=docs2com">
  Explore more creations, download timelines, and share your own work on the Daydream Community Hub
</Card>

***

## Step 3: Next Steps

Now that you're generating, here are some things to try:

<CardGroup cols={3}>
  <Card title="Using LoRAs" icon="wand-magic-sparkles" href="/scope/guides/loras">
    Add style adapters to transform your generations - from photorealistic to Pixar with a single file
  </Card>

  <Card title="Using VACE" icon="image" href="/scope/guides/vace">
    Guide generation with reference images and control videos for character consistency
  </Card>

  <Card title="Using Spout" icon="share-nodes" href="/scope/guides/spout">
    Share real-time video with TouchDesigner, Unity, and other Windows applications
  </Card>
</CardGroup>

### Go Deeper

Ready to build programmatically? Scope exposes a powerful API for integration into your own applications.

<CardGroup cols={2}>
  <Card title="API Reference" icon="brackets-curly" href="/scope/reference/api/index">
    Set up the server, connect via WebRTC, and control generation in real-time
  </Card>

  <Card title="Pipelines" icon="layer-group" href="/scope/reference/pipelines">
    Explore each pipeline's capabilities, parameters, and hardware requirements
  </Card>
</CardGroup>

### Supported Pipelines

Scope currently ships with five autoregressive video diffusion pipelines: [StreamDiffusion V2](/scope/reference/pipelines/streamdiffusion-v2), [LongLive](/scope/reference/pipelines/longlive), [Krea Realtime](/scope/reference/pipelines/krea-realtime), [RewardForcing](/scope/reference/pipelines/reward-forcing), and [MemFlow](/scope/reference/pipelines/memflow). Four run on 24GB GPUs, while Krea Realtime needs 32GB+ for its larger 14B model.

<Card title="Pipelines Overview" icon="layer-group" href="/scope/reference/pipelines">
  Compare all pipelines - features, VRAM requirements, and use cases at a glance
</Card>

***

## Step 4: Connect, Share & Contribute

<CardGroup cols={3}>
  <Card title="Community Hub" icon="users" href="https://app.daydream.live/discover?utm_source=docs&utm_medium=web&utm_campaign=docs2com">
    Browse creations, download timelines, and share your work
  </Card>

  <Card title="Ask on Discord" icon="discord" href="https://discord.com/invite/5sZu8xmn6U">
    Have questions or want to connect with others? Join our friendly community
  </Card>

  <Card title="Contribute on GitHub" icon="github" href="https://github.com/daydreamlive/scope">
    Report issues, suggest features, or contribute code
  </Card>
</CardGroup>

***

## Troubleshooting

<AccordionGroup>
  <Accordion title="CUDA version mismatch">
    Run `nvidia-smi` and verify CUDA version is ≥ 12.8. Update your NVIDIA drivers if needed.
  </Accordion>

  <Accordion title="Build fails or dependencies won't install">
    * Ensure UV, Node.js, and npm are properly installed
    * Try clearing the cache: `uv cache clean && uv run build`
  </Accordion>

  <Accordion title="Python.h: No such file or directory">
    Install the Python development package:

    ```bash  theme={null}
    # Debian/Ubuntu
    sudo apt-get install python3-dev
    ```
  </Accordion>

  <Accordion title="Models won't download">
    * Check your internet connection
    * Verify disk space in `~/.daydream-scope/models`
    * Model downloads can be large - be patient on first run
  </Accordion>

  <Accordion title="Can't connect to RunPod UI">
    * Verify the instance is fully deployed in RunPod dashboard
    * Ensure you're accessing port 8000
    * Check that `HF_TOKEN` is correctly set
  </Accordion>

  <Accordion title="WebRTC connection fails">
    * Verify your `HF_TOKEN` is valid with read permissions
    * Try redeploying the instance with the correct token
  </Accordion>
</AccordionGroup>
