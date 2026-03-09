> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Using NDI

> Send and receive real-time video over the network with NDI

# Using NDI

Scope supports real-time, low-latency video over IP via [NDI (Network Device Interface)](https://ndi.video/). Unlike [Spout](/scope/guides/spout) which is limited to sharing between applications on the same machine, NDI works across the local network — you can send and receive video between different computers.

<Warning>
  The [NDI SDK / NDI Tools](https://ndi.video/tools/) must be installed on the machine running Scope. NDI works on Windows, macOS, and Linux.
</Warning>

***

## NDI Receiver

Scope can receive video from any NDI source on the network.

<Steps>
  <Step title="Set input mode to Video">
    Under **Input & Controls**, set **Input Mode** to **Video**.
  </Step>

  <Step title="Select NDI as source">
    Set **Video Source** to **NDI**.
  </Step>

  <Step title="Choose an NDI source">
    Available NDI sources on the network will appear in the dropdown. Select the one you want to receive from. A small preview thumbnail will show the current frame from the selected source.
  </Step>
</Steps>

<Note>
  When selecting an NDI source, Scope automatically probes the source's native resolution and adjusts the pipeline dimensions to match. This avoids stretching or compression artifacts.
</Note>

***

## NDI Sender

<Note>
  NDI output (sender) support is coming soon. Once available, you will be able to send Scope's processed output over NDI to any receiver on the network.
</Note>

***

## Installing NDI Tools

<Steps>
  <Step title="Download the installer">
    Go to [ndi.video/tools](https://ndi.video/tools/) and download the installer for your platform:

    | Platform    | What to install                                     |
    | ----------- | --------------------------------------------------- |
    | **Windows** | NDI Tools (includes the runtime DLL)                |
    | **macOS**   | NDI SDK for Apple (provides `libndi.dylib`)         |
    | **Linux**   | NDI SDK — ensure `libndi.so` is on the library path |
  </Step>

  <Step title="Restart Scope">
    Restart Scope after installation. The NDI option will appear automatically once the SDK is detected.

    <Tip>
      If NDI doesn't appear after restarting Scope, try restarting again. On Windows, if environment variables aren't being picked up, you may need to restart your machine.
    </Tip>
  </Step>
</Steps>

***

## Compatible Applications

Scope should be able to share real-time video with any application that supports NDI. The following applications have been tested:

<CardGroup cols={3}>
  <Card title="Resolume Arena / Avenue" icon="display" href="https://resolume.com/">
    Built-in NDI input/output
  </Card>

  <Card title="OBS Studio" icon="video" href="https://obsproject.com/">
    With the [DistroAV plugin](https://github.com/DistroAV/DistroAV)
  </Card>

  <Card title="TouchDesigner" icon="bezier-curve" href="https://derivative.ca/">
    With [NDI In](https://docs.derivative.ca/NDI_In_TOP) and [NDI Out](https://docs.derivative.ca/NDI_Out_TOP) TOPs
  </Card>

  <Card title="vMix" icon="tv" href="https://www.vmix.com/">
    Built-in NDI support
  </Card>

  <Card title="VirtualDJ" icon="music" href="https://ndi.video/tools/">
    With Send-NDI plugin
  </Card>
</CardGroup>

<Tip>
  Any application that supports NDI should work with Scope. Check your application's documentation for NDI integration instructions.
</Tip>

***

## See Also

<CardGroup cols={2}>
  <Card title="Using Spout" icon="share-nodes" href="/scope/guides/spout">
    Share real-time video between applications on the same Windows machine
  </Card>

  <Card title="Quick Start" icon="rocket" href="/scope/getting-started/quickstart">
    Get Scope running if you haven't already
  </Card>
</CardGroup>
