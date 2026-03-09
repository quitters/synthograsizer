> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Using Spout

> Share real-time video with other applications on Windows

# Using Spout

Scope supports near-zero latency video sharing with other local applications on Windows via [Spout](https://spout.zeal.co/). This enables powerful workflows like sending Scope's output to TouchDesigner, Unity, or Blender in real-time.

<Warning>
  **Windows only.** The Scope server must be running on a Windows machine to use Spout. Spout is not available on Linux (including RunPod).
</Warning>

***

## What is Spout?

Spout is a real-time video sharing framework for Windows that allows applications to share GPU textures with minimal overhead. Unlike screen capture or video streaming, Spout shares frames directly through GPU memory, resulting in:

* **Near-zero latency** - Frames are available instantly
* **Full quality** - No compression artifacts
* **Minimal CPU overhead** - All processing stays on the GPU

***

## Spout Receiver

Configure Scope to receive video from other applications via Spout. This is useful for using external video sources (like TouchDesigner or OBS) as input for your generations.

<Steps>
  <Step title="Set input mode to Video">
    Under **Input & Controls**, set **Input Mode** to **Video**.
  </Step>

  <Step title="Select Spout as source">
    Set **Video Source** to **Spout Receiver**.
  </Step>

  <Step title="Configure sender name (optional)">
    The **Sender Name** field can be:

    * **Empty** - Receive from any available Spout sender
    * **Specific name** - Receive only from a sender with that exact name
  </Step>
</Steps>

***

## Spout Sender

Configure Scope to send its output to other applications via Spout. This is useful for post-processing in TouchDesigner, recording in OBS, or using Scope's output in Unity/Unreal projects.

<Steps>
  <Step title="Open Settings">
    Click the **Settings** panel in the Scope interface.
  </Step>

  <Step title="Enable Spout Sender">
    Toggle **Spout Sender** to **On**.
  </Step>

  <Step title="Configure sender name (optional)">
    The default sender name is `ScopeOut`. You can change this if you need to identify multiple Scope instances.
  </Step>
</Steps>

***

## Compatible Applications

Scope can share real-time video with any application that supports Spout. The following applications have been tested:

<CardGroup cols={3}>
  <Card title="TouchDesigner" icon="bezier-curve" href="https://derivative.ca/">
    Use [Syphon Spout In](https://derivative.ca/UserGuide/Syphon_Spout_In_TOP) and [Syphon Spout Out](https://docs.derivative.ca/Syphon_Spout_Out_TOP) TOPs
  </Card>

  <Card title="Unity" icon="cube" href="https://unity.com/">
    Use the [KlakSpout plugin](https://github.com/keijiro/KlakSpout)
  </Card>

  <Card title="Blender" icon="cube" href="https://www.blender.org/">
    Use the [TextureSharing add-on](https://github.com/maybites/TextureSharing)
  </Card>
</CardGroup>

<Tip>
  Any application that supports Spout should work with Scope. Check your application's documentation for Spout integration instructions.
</Tip>

***

## Example: TouchDesigner Integration

This example shows Scope sending real-time AI video to TouchDesigner for further processing and output.

### Basic Setup

1. In Scope, enable **Spout Sender** with name `ScopeOut`
2. In TouchDesigner, add a **Syphon Spout In** TOP
3. Set the source to `ScopeOut`
4. The AI-generated video now flows into your TouchDesigner network

### Use Cases

<CardGroup cols={2}>
  <Card title="Live VJ Performance" icon="music">
    Use TouchDesigner to mix Scope's output with other visuals, apply effects, and output to projectors or LED walls
  </Card>

  <Card title="Interactive Installations" icon="hand-pointer">
    Combine Scope with TouchDesigner's sensor inputs for reactive AI art
  </Card>

  <Card title="Broadcast Graphics" icon="tv">
    Route Scope through TouchDesigner to NDI or SDI for live broadcast
  </Card>

  <Card title="Game Development" icon="gamepad">
    Use Unity or Unreal to incorporate real-time AI video into game environments
  </Card>
</CardGroup>

***

## Troubleshooting

<AccordionGroup>
  <Accordion title="Spout sender not appearing in other apps">
    * Verify Spout Sender is enabled in Scope settings
    * Make sure both applications are running on the same Windows machine
    * Try restarting the receiving application after enabling Spout in Scope
  </Accordion>

  <Accordion title="Spout receiver not getting video">
    * Verify the sending application has Spout output enabled
    * Check that the sender name matches (or leave empty to receive from any sender)
    * Ensure both applications are using the same Spout version
  </Accordion>

  <Accordion title="Performance issues">
    * Spout sharing is GPU-memory based and should have minimal overhead
    * If you see frame drops, check GPU memory usage - you may need to reduce resolution
    * Close other GPU-intensive applications if VRAM is limited
  </Accordion>
</AccordionGroup>

***

## See Also

<CardGroup cols={2}>
  <Card title="Using NDI" icon="network-wired" href="/scope/guides/ndi">
    Send and receive real-time video over the network across machines
  </Card>

  <Card title="Quick Start" icon="rocket" href="/scope/getting-started/quickstart">
    Get Scope running if you haven't already
  </Card>

  <Card title="VACE Guide" icon="image" href="/scope/guides/vace">
    Use reference images and control videos with Spout input
  </Card>
</CardGroup>
