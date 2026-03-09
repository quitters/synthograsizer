> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Using Nodes

> Install and manage third-party pipeline nodes to extend Scope

# Using nodes in Scope

The Scope node system enables third-party extensions to provide custom pipelines. Install nodes to access additional models, preprocessors, and capabilities beyond the built-in pipelines.

***

## Node Sources

Nodes can be installed from three sources:

| Source                | Format                         | Description                                  |
| :-------------------- | :----------------------------- | :------------------------------------------- |
| **Git** (Recommended) | `https://github.com/user/repo` | Install directly from a Git repository       |
| **PyPI**              | `my-scope-node`                | Install from the Python Package Index        |
| **Local**             | `/path/to/node`                | Install from a local directory (development) |

### Git Installation

You can paste the URL directly from your browser:

```
https://github.com/user/node-repo
```

Optionally specify a branch, tag, or commit:

```
https://github.com/user/node-repo@v1.0.0
https://github.com/user/node-repo@main
https://github.com/user/node-repo@abc1234
```

### PyPI Installation

```
my-scope-node
my-scope-node==1.0.0
```

### Local Installation

```
/path/to/my-node
C:\Users\username\projects\my-node
```

<Note>
  Local nodes are installed in editable mode, meaning code changes take effect after reloading the node.
</Note>

***

## Installing Nodes

<Tabs>
  <Tab title="Desktop App" icon="desktop">
    <Steps>
      <Step title="Open Node Settings">
        Click the **gear icon** in the app header to open the Settings dialog.
        Navigate to the **Nodes** tab.
      </Step>

      <Step title="Enter package spec">
        In the installation input field, enter the node source (Git URL, PyPI package name, or local path).
        You can also click **Browse** to select a local node directory.
      </Step>

      <Step title="Install">
        Click the **Install** button and wait for installation to complete.
        The server will restart automatically to load the new node.
      </Step>

      <Step title="Verify installation">
        The node should appear in the installed nodes list, and its pipelines will be available in the pipeline selector.
      </Step>
    </Steps>
  </Tab>

  <Tab title="Manual Installation" icon="terminal">
    When running Scope via manual installation (`uv run daydream-scope`), the node management experience is similar to the desktop app with these differences:

    * No deep link support (websites cannot auto-open the UI for node installation)
    * No **Browse** button for selecting local node directories (you can still type a local path manually into the install field)

    Use the Settings dialog to install nodes from Git, PyPI, or local sources.
  </Tab>
</Tabs>

***

## Managing Nodes

### Viewing Installed Nodes

The Nodes tab in Settings displays all installed nodes with their source information.

### Uninstalling a Node

<Steps>
  <Step title="Find the node">
    In the Nodes tab, locate the node you want to remove.
  </Step>

  <Step title="Uninstall">
    Click the **trash icon** next to the node.
  </Step>

  <Step title="Wait for restart">
    The server will restart to unload the node.
  </Step>
</Steps>

### Updating a Node

Scope automatically checks for updates when you open the Nodes tab.

<Steps>
  <Step title="Open the Nodes tab">
    Any node with a newer version available shows an **Update** button.
  </Step>

  <Step title="Update">
    Click the **Update** button next to the node.
  </Step>

  <Step title="Wait for restart">
    The server will restart to load the updated node.
  </Step>
</Steps>

<Note>
  Local nodes do not support update detection. To pick up code changes for a local node, use Reload instead.
</Note>

### Reloading a Node (Local Only)

When developing a local node, you can reload it after making code changes without reinstalling:

<Steps>
  <Step title="Make your code changes">
    Edit the node source files.
  </Step>

  <Step title="Reload">
    Click the **reload icon** next to your locally installed node.
  </Step>

  <Step title="Wait for restart">
    The server will restart to pick up the changes.
  </Step>
</Steps>

<Note>
  The reload button only appears for nodes installed from local paths.
</Note>

***

## Deep Link Installation

External sources can facilitate node installation via protocol URLs:

```
daydream-scope://install-node?package=<spec>
```

When you click a deep link:

1. The desktop app opens (or launches if not running)
2. The Settings dialog opens with the Nodes tab selected
3. The package spec is pre-filled in the input field
4. You confirm to begin installation

<Warning>
  Deep links are only supported in the Desktop App, not manual installations.
</Warning>

***

## CLI Commands

The `daydream-scope` CLI provides commands for managing nodes directly from the terminal.

### Listing Installed Nodes

```bash  theme={null}
uv run daydream-scope nodes
```

Shows all installed nodes with their name, version, source, and registered pipelines.

### Installing a Node

```bash  theme={null}
uv run daydream-scope install <package>
```

Examples for each source type:

```bash  theme={null}
# From a Git repository
uv run daydream-scope install https://github.com/user/node-repo

# From PyPI
uv run daydream-scope install my-scope-node

# From a local directory (editable mode)
uv run daydream-scope install -e /path/to/my-node
```

| Option             | Description                                          |
| :----------------- | :--------------------------------------------------- |
| `--upgrade`        | Upgrade the node to the latest version               |
| `-e`, `--editable` | Install a project in editable mode from a local path |

### Uninstalling a Node

```bash  theme={null}
uv run daydream-scope uninstall <name>
```

Removes the node and unloads any active pipelines it provided.

***

## Troubleshooting

<AccordionGroup>
  <Accordion title="Node installation fails">
    * Check that the package spec is correct (valid Git URL or PyPI package name)
    * Verify your internet connection
    * Check for dependency conflicts in the installation error message
  </Accordion>

  <Accordion title="Node pipelines don't appear">
    * Ensure the server restarted after installation
    * Check that the node implements the `register_pipelines` hook correctly
    * Verify the node's pipelines meet your GPU's VRAM requirements
  </Accordion>

  <Accordion title="Server won't start after node install">
    * The node may have introduced a dependency conflict
    * Try uninstalling the node via the Settings dialog
    * If that fails, manually remove the node from `~/.daydream-scope/nodes/nodes.txt`
  </Accordion>
</AccordionGroup>

***

## See Also

<CardGroup cols={3}>
  <Card title="Developing Nodes" icon="code" href="/scope/guides/plugin-development">
    Create your own custom pipelines
  </Card>

  <Card title="Node Architecture" icon="puzzle-piece" href="/scope/reference/architecture/plugins">
    Technical details of the node system
  </Card>

  <Card title="Tutorial: Build a VFX Node" icon="wand-magic-sparkles" href="/scope/tutorials/build-video-effects-plugin">
    Step-by-step tutorial building a complete node from scratch
  </Card>
</CardGroup>
