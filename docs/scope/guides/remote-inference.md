> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Remote Inference

> Run Scope pipelines on cloud-hosted GPUs without local hardware

## Overview

The Remote Inference feature allows users to execute Scope pipelines on cloud-hosted H100 GPUs provided by Daydream, eliminating the requirement for local GPU hardware. This capability particularly benefits Mac users and individuals without dedicated NVIDIA graphics cards.

## Setup Process

Users must authenticate directly within the Scope desktop application by navigating to Settings > Account and selecting "Sign in with Daydream." Following successful authentication, the Remote Inference toggle becomes available to activate.

## Key Specifications

- **Session length:** Up to 1 hour of GPU access per session with immediate reconnection capability
- **Initialization window:** Approximately 2-3 minutes for GPU provisioning, then 1-2 additional minutes for pipeline startup
- **Cost during beta:** No charges or session limits currently apply

## Current Constraints

The beta version does not yet support LoRAs or custom nodes. The Krea Realtime pipeline requires application restart to access from other pipelines. Windows support is limited to x64 architecture only.

## Status

Remote Inference remains in beta, with functionality and pricing subject to future modifications.

## See Also

<CardGroup cols={2}>
  <Card title="Quick Start" icon="rocket" href="/scope/getting-started/quickstart">
    Get started with Scope
  </Card>

  <Card title="HuggingFace Auth" icon="key" href="/scope/guides/huggingface">
    Configure HuggingFace tokens for model access
  </Card>
</CardGroup>
