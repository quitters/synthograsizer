> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Using OSC

> Control Scope and other visual software over OSC

# Using OSC

You want to control Daydream Scope and a second application (Resolume, TouchDesigner, or something else) from the same OSC source. Or maybe you want one app to control the other over OSC. Unlike MIDI, OSC is network-based and doesn't have the exclusive-device problem. But it has its own routing considerations, and the setup is different enough to warrant its own guide.

<Tip>
  If you're looking for MIDI-specific setup with physical controllers, see the companion guide: [Using MIDI](/scope/guides/midi).
</Tip>

***

## Why OSC Instead of MIDI?

Both protocols map physical controls to software parameters, but they work differently under the hood.

|                | MIDI                                       | OSC                                                |
| -------------- | ------------------------------------------ | -------------------------------------------------- |
| **Values**     | Integers 0–127                             | Floats, strings, ints, blobs                       |
| **Transport**  | Device connection (USB)                    | UDP over network                                   |
| **Multi-app**  | Requires virtual routing                   | Send to multiple IP:port targets natively          |
| **Mapping**    | Learn-based (move a knob, app picks it up) | Explicit address paths (more setup, more flexible) |
| **Resolution** | 128 steps                                  | Full float precision (0.0–1.0+)                    |

OSC gives you smoother fades, more granular control, and no device-exclusivity problems. The tradeoff is more explicit configuration.

***

## What You'll Need

* Daydream Scope installed and running (with OSC enabled)
* A second application: Resolume Arena/Avenue, TouchDesigner, or similar
* An OSC source: a tablet/phone app (TouchOSC, OSC/PILOT, Lemur), another piece of software, or a MIDI controller with an OSC bridge
* All devices on the same local network (or running on the same machine using `localhost`)

***

## How OSC Routing Works

Each application listens for OSC messages on a specific **UDP port** on a specific **network address** (`localhost` / `127.0.0.1` if everything is on the same machine, or a LAN IP if across machines). No two applications can listen on the same port on the same machine; they each need their own.

```text  theme={null}
OSC Source (TouchOSC, OSC/PILOT, custom app, etc.)
        │
   Sends to two targets:
   ┌─────────────────┬─────────────────┐
   ▼                                   ▼
 Scope                          Resolume / TouchDesigner
 (localhost:9000)               (localhost:8000)
```

Most OSC controller apps (TouchOSC, OSC/PILOT, Lemur) support multiple output targets natively. You configure each target as an IP address and port pair.

***

## Step 1: Enable OSC in Scope

Scope runs an OSC server as a background service that listens on UDP.

<Steps>
  <Step title="Open OSC settings">
    Open Scope and navigate to the OSC settings. The OSC server should automatically be running and ready to receive requests whenever Scope is open.
  </Step>

  <Step title="Note the port number">
    Note the **port number** Scope is listening on. You'll need this when configuring your OSC source.
  </Step>

  <Step title="Load the documentation">
    Scope maps incoming OSC addresses to its internal parameters dynamically. Click on "Open OSC Docs" to see a full set of addresses and sample code for any pipelines that you have installed.
  </Step>
</Steps>

***

## Step 2: Configure OSC in Your Second Application

### Resolume Arena/Avenue

<Steps>
  <Step title="Open OSC preferences">
    Open **Preferences → OSC**. Note the **Input Port** (default is usually 7000).
  </Step>

  <Step title="Enable OSC input">
    Enable OSC input. This is the port your OSC source needs to target for Resolume.
  </Step>

  <Step title="Map parameters">
    To map a custom parameter: open the **Shortcuts** panel, select **OSC** as the protocol, click the parameter you want to map, then send an OSC message from your source. Resolume learns the address and binds it.
  </Step>
</Steps>

Resolume's OSC address structure follows a pattern: `/composition/layers/{layer}/clips/{clip}/connect` for triggering clips, `/composition/layers/{layer}/video/opacity` for layer opacity, and so on. Resolume can also **send** OSC for feedback to your controller or to drive another app.

### TouchDesigner

<Steps>
  <Step title="Create an OSC In CHOP">
    Create an **OSC In CHOP** in your network.
  </Step>

  <Step title="Set the network port">
    Set the **Network Port** to your desired listening port (e.g., 8000). Make sure nothing else is already using this port.
  </Step>

  <Step title="Use the data">
    Incoming OSC messages appear as CHOP channels. Each unique address path becomes its own channel. Export channels to operator parameters (right-click → Export), or reference them with expressions like `op('oscinchop1')['address/path']`.
  </Step>
</Steps>

For sending OSC from TouchDesigner to Scope:

1. Create an **OSC Out CHOP** or **OSC Out DAT**
2. Set the **Network Address** to the target IP (`localhost` for same machine, or the LAN IP for another machine)
3. Set the **Network Port** to Scope's OSC port
4. With the CHOP, channel names become OSC address paths. With the DAT, you have full control over message formatting

<Tip>
  **TouchDesigner as a control router** is a particularly useful pattern. Receive MIDI from a physical controller in TouchDesigner, process or remap the values, and forward them to Scope as OSC messages. This lets you use TouchDesigner as a flexible control routing layer with processing in between.
</Tip>

***

## Step 3: Configure Your OSC Source

### Tablet/Phone Apps (TouchOSC, OSC/PILOT, Lemur)

These apps let you define multiple output targets. Add one target per application:

* **Target 1:** Scope's IP and port (e.g., `192.168.1.100:9000` or `localhost:9000`)
* **Target 2:** Resolume's IP and port (e.g., `192.168.1.100:7000`)

Each control on your layout can send to a specific target, or you can have a single fader send to both.

### Another Application (e.g., TouchDesigner → Scope)

1. Create an **OSC Out CHOP** for each destination (or use a single OSC Out DAT with scripted message sending)
2. Set each one's network address and port to the corresponding target app
3. Wire your MIDI In CHOP (or any other data source) through any processing you need, then into the OSC Out

### MIDI Controller via Bridge

If you have a physical MIDI controller and want to convert its output to OSC:

* **OSC/PILOT** can receive MIDI and send OSC simultaneously
* **Open Stage Control** is a free, open-source option with MIDI-to-OSC bridging
* **TouchDesigner** itself is an excellent bridge: MIDI In CHOP → any processing → OSC Out CHOP
* A lightweight Python script using `mido` (MIDI) and `python-osc` (OSC) can do this in about 20 lines

***

## Step 4: Plan Your Address Space

Unlike MIDI (where you're mostly dealing with CC numbers 0–127 on channels 1–16), OSC gives you arbitrary string-based addressing. This is more powerful but requires some coordination.

<Note>
  OSC addresses are case-sensitive and must match exactly. A typo in an address path is the most common reason messages arrive but don't affect parameters.
</Note>

A practical approach:

* Use each app's native OSC addresses where possible (Resolume and TouchDesigner both document theirs)
* For Scope, use the addresses documented in the Scope OSC reference
* If you're building custom controls, namespace them: `/scope/prompt_strength`, `/resolume/layer1/opacity`, etc.
* If the same control should affect both apps, send the same message to both ports (your OSC source handles the fan-out)

For situations where you want a single fader to control different parameters in each app at different scales, put TouchDesigner or a similar tool in the middle. It receives one OSC message and outputs two different ones, each remapped for the target app's expected range and address.

***

## Step 5: Connect the Video Pipeline

Same as the MIDI guide: Scope outputs video via Spout (Windows), Syphon (macOS), or NDI (network). This is independent of your control protocol.

* **Same machine:** [Spout](/scope/guides/spout) or Syphon. Sources appear automatically in Resolume and TouchDesigner
* **Across machines:** NDI. Sources appear automatically on the same network

***

## Routing OSC to Multiple Apps from a Single-Target Source

If your OSC source only supports one output target, you need a relay to fan out the messages:

* **TouchDesigner:** Set it as the sole OSC target, then use multiple OSC Out CHOPs to forward messages to each destination app. This also lets you filter or transform messages per-destination
* **Open Stage Control:** Acts as a relay with customizable routing rules
* **oscrouter / osc-splitter utilities:** Small standalone tools that listen on one port and forward to multiple destinations
* **Custom script:** A Python script with `python-osc` can listen on one port and forward every message to N destinations in about 15 lines

***

## Troubleshooting

<AccordionGroup>
  <Accordion title="No OSC arriving in an app">
    Check that the target port matches the app's listening port. Verify the app is actually listening (Scope: check `/api/v1/osc/status`; TouchDesigner: check the OSC In CHOP's node viewer; Resolume: check the MIDI/OSC monitor in preferences). Make sure your firewall isn't blocking UDP on that port.
  </Accordion>

  <Accordion title="Port conflict (app won't start OSC)">
    Two apps can't listen on the same port. Give each app its own port and configure your source accordingly.
  </Accordion>

  <Accordion title="Messages arriving but not affecting parameters">
    The address path probably doesn't match what the app expects. OSC addresses are case-sensitive and must match exactly. Check the app's documentation for the correct paths.
  </Accordion>

  <Accordion title="Works on same machine, fails across network">
    Verify both machines are on the same subnet. Replace `localhost` / `127.0.0.1` with the target machine's actual LAN IP. Check firewalls on both ends.
  </Accordion>

  <Accordion title="Jitter or dropped messages">
    OSC over UDP doesn't guarantee delivery. On a clean local network this is rarely an issue, but WiFi can introduce drops. If you're controlling from a tablet over WiFi and seeing inconsistency, try a wired connection or reduce your message rate.
  </Accordion>
</AccordionGroup>

***

## The General Pattern

The architecture for multi-app OSC control:

1. **Each app gets its own UDP port** on the network. No sharing, no conflicts
2. **Your OSC source sends to multiple targets** (most controller apps support this natively)
3. **Address paths are per-app** — coordinate your namespace so messages go where you intend
4. **Use a relay** (TouchDesigner, Open Stage Control, or a script) when your source only supports one target, or when you need to transform messages per-destination
5. **Video pipeline** (Spout/Syphon/NDI) is separate from the control protocol and works the same regardless of whether you're using MIDI, OSC, or both

***

## See Also

<CardGroup cols={2}>
  <Card icon="sliders" href="/scope/guides/midi" title="Using MIDI">
    Control Scope and other visual software from a single MIDI controller
  </Card>

  <Card icon="share-nodes" href="/scope/guides/spout" title="Using Spout">
    Share real-time video between Scope and other applications on Windows
  </Card>
</CardGroup>
