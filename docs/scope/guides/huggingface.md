> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# HuggingFace Authentication

> Configure HuggingFace tokens for model access and WebRTC

## Overview

Scope uses HuggingFace tokens for two purposes:
1. Downloading gated models that require authentication
2. Obtaining Cloudflare TURN credentials for WebRTC NAT traversal

## Two Configuration Methods

**Settings UI approach:** Navigate to Settings > API Keys tab, locate the HuggingFace entry, paste your token, and save. Note that if `HF_TOKEN` is already set as an environment variable, the input field becomes disabled.

**Environment variable approach:** Set `HF_TOKEN=hf_your_token_here` (Linux/macOS) or `$env:HF_TOKEN = "hf_your_token_here"` (Windows PowerShell). This method is preferred for cloud deployments and takes precedence over UI-stored tokens.

## Key Use Cases

Tokens enable two critical functions: downloading gated HuggingFace models that require authentication, and obtaining Cloudflare TURN credentials for WebRTC NAT traversal. Without a token, Scope reverts to public STUN servers, which may fail behind restrictive firewalls.

## Common Issues

If downloads fail despite having a token set, verify you've accepted the model's license agreement on its HuggingFace page. WebRTC connection problems behind firewalls typically indicate missing TURN credentials, which requires a valid token and Scope restart.

Tokens can be generated at huggingface.co/settings/tokens.
