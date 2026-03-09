> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Using MIDI

> Control Scope and other visual software from a single MIDI controller

# Using MIDI

You have a MIDI controller, Daydream Scope running AI-generated visuals, and a second piece of software (Resolume, TouchDesigner, or something else) that you want to control simultaneously. The problem: your OS typically lets only one application claim a physical MIDI device at a time. This guide walks through how to solve that with virtual MIDI routing, and covers the broader pattern of connecting Scope into a multi-app visual workflow.

<Tip>
  If you'd rather use network-based control with float precision instead of MIDI's 0–127 integers, see the companion guide: [Using OSC](/scope/guides/osc).
</Tip>

***

## What You'll Need

* A physical MIDI controller (any standard USB MIDI device works)
* Daydream Scope installed and running
* A second application: Resolume Arena/Avenue, TouchDesigner, or similar
* A virtual MIDI routing tool (details by OS below)
* Both apps running on the same machine, or networked via NDI

***

## The Core Problem

Operating systems enforce exclusive access to physical MIDI devices. If Resolume grabs your controller, TouchDesigner can't see it (and vice versa). The solution is a virtual MIDI routing layer that sits between your physical controller and your applications, duplicating the signal so multiple apps receive it simultaneously.

```
Physical MIDI Controller
        │
        ▼
  Virtual MIDI Router
        │
   ┌────┴────┐
   ▼         ▼
 App A     App B
(Scope)  (Resolume / TouchDesigner / etc.)
```

***

## Step 1: Set Up Virtual MIDI Routing

<Tabs>
  <Tab title="macOS">
    macOS ships with a virtual MIDI routing tool called the **IAC Driver**. No extra software needed.

    <Steps>
      <Step title="Open Audio MIDI Setup">
        Search for it in Spotlight, or find it in `/Applications/Utilities/`.
      </Step>

      <Step title="Show MIDI Studio">
        Choose **Window → Show MIDI Studio**.
      </Step>

      <Step title="Enable the IAC Driver">
        Double-click the **IAC Driver** icon, then check **Device is online**.
      </Step>

      <Step title="Add buses">
        Under Ports, click **+** to add buses. Create at least two: one for each app you want to receive MIDI (e.g., "Bus 1 - Scope" and "Bus 2 - Resolume").
      </Step>

      <Step title="Apply">
        Click **Apply**. You now have virtual MIDI buses that your applications can connect to.
      </Step>
    </Steps>

    To duplicate your physical controller's signal to both buses, you need a routing utility that copies the input to multiple outputs:

    * **MIDIFlow** (free/paid, Mac App Store) — simplest dedicated tool
    * **MIDI Patchbay** (free, from notahat on GitHub) — lightweight open-source option
    * **MIDI Monitor** (free, from Snoize) — useful for verifying signals, but doesn't do routing itself

    <Tip>
      Before installing anything, check whether your controller supports multi-client mode natively (some do), and whether your apps can share the physical device directly. TouchDesigner, for example, can sometimes access a MIDI device even when another app is using it.
    </Tip>
  </Tab>

  <Tab title="Windows">
    Windows doesn't include a virtual MIDI driver, so you'll need to install one.

    <Steps>
      <Step title="Install loopMIDI">
        Download and install **loopMIDI** from [Tobias Erichsen's site](https://www.tobias-erichsen.de/software/loopmidi.html) (free for personal/non-commercial use).
      </Step>

      <Step title="Create virtual ports">
        Open loopMIDI and create two virtual ports (e.g., "Scope MIDI" and "Resolume MIDI").
      </Step>

      <Step title="Install MIDI-OX">
        Install [MIDI-OX](http://www.midiox.com/) (free) for the routing layer.
      </Step>

      <Step title="Configure routing">
        In MIDI-OX, set your physical controller as the input, and both loopMIDI ports as outputs.
      </Step>

      <Step title="Connect apps">
        Each application then connects to its own virtual port.
      </Step>
    </Steps>

    <Note>
      LoopBe1 is another free option if you only need a single virtual port.
    </Note>
  </Tab>
</Tabs>

***

## Step 2: Connect Your Apps to Virtual MIDI Ports

Once virtual routing is running, configure each application to listen on its assigned virtual port instead of trying to claim the physical controller directly.

### Scope

Scope has built-in MIDI support with a mapping interface for connecting controller inputs to generation parameters.

<Steps>
  <Step title="Open MIDI settings">
    Open Scope's **MIDI settings** panel.
  </Step>

  <Step title="Select your device">
    Scope uses WebMIDI for device discovery, so your virtual MIDI port (or physical controller, if you're not sharing it) should appear in the device list automatically. Select your MIDI device.
  </Step>

  <Step title="Map controls">
    Use the **mapping interface** to assign controller inputs (faders, knobs, buttons) to Scope parameters like prompt strength, model settings, or pipeline controls. Scope supports **mapping profiles**, so you can save and switch between different controller configurations.
  </Step>
</Steps>

<Tip>
  Choosing between MIDI and OSC for Scope? MIDI is simpler for direct hardware control. OSC is better if you want to send from another application like TouchDesigner, or if you need higher-resolution values (floats vs. MIDI's 0–127 integers).
</Tip>

### Resolume Arena/Avenue

<Steps>
  <Step title="Enable MIDI input">
    Open **Preferences → MIDI** and enable your virtual MIDI port (the one you assigned to Resolume in Step 1) for both Input and Output.
  </Step>

  <Step title="Enter mapping mode">
    Open the **Shortcuts** panel (menu bar → Shortcuts, or the shortcut icon). Select **MIDI** as the protocol. The interface changes color to indicate mapping mode.
  </Step>

  <Step title="Map parameters">
    Click any parameter, clip, or button you want to map, then move the corresponding fader/knob on your physical controller. Press **Escape** to exit mapping mode.
  </Step>
</Steps>

You can verify MIDI is arriving by expanding the MIDI monitor in the MIDI Preferences panel. If messages show up there but shortcuts aren't triggering, check that the shortcut is assigned to the correct MIDI channel and CC number.

### TouchDesigner

<Steps>
  <Step title="Create a MIDI In CHOP">
    Create a **MIDI In CHOP** in your network.
  </Step>

  <Step title="Select your MIDI source">
    In the MIDI Source parameter, select your virtual MIDI port.
  </Step>

  <Step title="Configure channels">
    On the **Channel** page, set the MIDI Channel to match your routing strategy. If you're using channel separation (see Step 4), set this to only the channel(s) you want TouchDesigner to respond to. Leave it at "All" if you want TouchDesigner to hear everything.
  </Step>

  <Step title="Set controller range">
    Set the **Controller Index** range to match your hardware (e.g., `1-32` for the first 32 CCs). Turn on the node viewer to see incoming values in real time.
  </Step>
</Steps>

To map those values to parameters:

* **Direct export:** Right-click the MIDI In CHOP channel → Export → select the target parameter on any operator
* **MIDI Device Mapper:** Open Dialogs → MIDI Device Mapper for a more portable mapping setup that separates your mapping from your network layout

<Tip>
  For a simpler workflow, use a **MIDI In Map CHOP** instead of the raw MIDI In CHOP. The Map version works with the MIDI Device Mapper dialog and is easier to reconfigure.
</Tip>

***

## Step 3: Connect the Video Pipeline

With MIDI routing handled, you need to get video between your apps. This is where Spout, Syphon, and NDI come in.

### Same Machine

* **Windows:** Use [Spout](/scope/guides/spout) to share textures between applications. Scope can output via Spout, and Resolume/TouchDesigner can receive Spout textures as sources
* **macOS:** Use **Syphon** for the same purpose. Resolume shows Syphon sources under Sources; TouchDesigner uses a **Syphon Spout In TOP**

### Across Machines

* **NDI** works over your local network. Scope can output via NDI, and any NDI-compatible software on any machine on the same network can receive it without manual configuration

***

## Step 4: Decide on a Channel Strategy

If both apps are listening to the same MIDI CC numbers, they'll both respond to every knob twist and fader move. That might be what you want (synced control), or it might cause chaos.

<Note>
  Start with Option A. It's the simplest and works in most cases. Move to B or C only if you find yourself needing independent control per app.
</Note>

**Option A: Same CCs, different functions.** Both apps listen to the same MIDI data, but you've mapped different parameters in each app. Fader 1 controls Scope's prompt strength while simultaneously controlling Resolume's clip opacity. This is the simplest setup and works well when you want correlated changes.

**Option B: Channel separation.** Your MIDI controller sends on channel 1 by default, but many controllers can be configured to send on different channels per section. Send channels 1–8 to App A and channels 9–16 to App B. Configure your virtual router or each app to filter by channel.

**Option C: CC range splitting.** Similar idea, but split by CC number instead of channel. CCs 1–16 go to Scope, CCs 17–32 go to Resolume. Configure filtering in your virtual router (MIDI-OX supports this on Windows) or in each app's MIDI settings.

***

## Troubleshooting

<AccordionGroup>
  <Accordion title="No MIDI in one app">
    Confirm the virtual port is enabled in that app's MIDI preferences. Check that MIDI-OX (or your routing tool) is still running and routing to both virtual ports.
  </Accordion>

  <Accordion title="Both apps fighting over a parameter">
    You're probably sending the same CC to both without meaning to. Use channel separation or CC filtering (see Step 4).
  </Accordion>

  <Accordion title="Latency on MIDI response">
    Virtual MIDI routing adds negligible latency (sub-millisecond). If you're experiencing lag, the bottleneck is likely in the application itself — particularly if Scope is running a heavy model on the GPU while another app is also doing GPU-intensive rendering.
  </Accordion>

  <Accordion title="Spout/Syphon source not appearing">
    Make sure both applications are running and that the sending app has actually started output. In Scope, verify that Spout/Syphon output is enabled in the settings. Restart the receiving app if the source was started after it launched.
  </Accordion>

  <Accordion title="NDI sources not visible">
    Confirm both machines are on the same network and subnet. Firewalls can block NDI discovery. On Windows, allow NDI through Windows Firewall.
  </Accordion>
</AccordionGroup>

***

## The General Pattern

This guide uses Resolume and TouchDesigner as examples, but the pattern applies to any combination of visual software:

1. **Virtual MIDI routing** solves the one-device-one-app OS limitation
2. **Channel/CC separation** gives each app its own control lane when needed
3. **Spout/Syphon/NDI** handles the video pipeline between apps
4. **OSC** is an alternative to MIDI for network-based, higher-resolution control (floats instead of 0–127 integers), and most visual software supports it

The specific menus and settings differ by app, but the architecture is the same. If you're working with software not covered here, look for its MIDI input settings and point them at your virtual port.

***

## See Also

<CardGroup cols={2}>
  <Card title="Using OSC" icon="network-wired" href="/scope/guides/osc">
    Network-based control with float precision for Scope and other visual software
  </Card>

  <Card title="Using Spout" icon="share-nodes" href="/scope/guides/spout">
    Share real-time video between Scope and other applications on Windows
  </Card>
</CardGroup>
