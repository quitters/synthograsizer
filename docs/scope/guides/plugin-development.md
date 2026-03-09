> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Developing Nodes for Scope

> Create custom pipelines, preprocessors, and postprocessors

## Overview

This guide teaches you how to create custom Scope nodes to extend functionality with personalized pipelines, preprocessors, or postprocessors.

## Key Requirements

- Python 3.12 or newer
- `uv` package manager
- Local Scope installation for testing

## Project Structure

Your node needs this organization:

```
my-scope-node/
├── pyproject.toml
└── my_scope_node/
    ├── __init__.py
    ├── node.py
    └── pipelines/
```

## Configuration File Setup

The `pyproject.toml` must include an entry point section that registers your node: `[project.entry-points."scope"]` with your node name as the key and module path as the value.

## Two Main Pipeline Types

**Text-Only Pipelines** generate video without requiring input frames. They don't implement a `prepare()` method and return tensors in THWC format with values normalized to [0, 1].

**Video Input Pipelines** process incoming frames. They implement `prepare()` to specify how many input frames are needed via `Requirements(input_size=N)`.

## Parameter Management

Two parameter categories exist:

- **Load-time parameters** (`is_load_param=True`): Set during initialization, read in `__init__()`, require restart to change
- **Runtime parameters** (`is_load_param=False`): Passed during execution, read from `__call__()` kwargs, editable during streaming

Critical distinction: "Runtime params must be read from kwargs in `__call__()`, not stored in `__init__()`"

## UI Integration

Expose controls using `ui_field_config()` with options like `order`, `label`, `modes`, and `category`. This makes parameters appear in the Settings or Input & Controls panels.

## Preprocessor Implementation

Preprocessors require setting `usage = [UsageType.PREPROCESSOR]` and video input mode. They generate control signals like depth maps for advanced workflows.

## Testing Workflow

Install locally through Scope's interface, make code edits, use the reload button in Settings to refresh, then verify functionality.

## See Also

<CardGroup cols={2}>
  <Card title="Using Nodes" icon="puzzle-piece" href="/scope/guides/plugins">
    Install and manage third-party nodes
  </Card>

  <Card title="Node Architecture" icon="gear" href="/scope/reference/architecture/plugins">
    Technical details of the node system
  </Card>
</CardGroup>
