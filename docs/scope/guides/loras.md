> ## Documentation Index
> Fetch the complete documentation index at: https://docs.daydream.live/llms.txt
> Use this file to discover all available pages before exploring further.

# Using LoRAs

> Customize concepts and styles in your generations with LoRA adapters

# Using LoRAs in Scope

LoRA (Low-Rank Adaptation) adapters allow you to customize the concepts and styles used in your generations. Scope supports loading one or multiple LoRAs to fine-tune your output.

***

## Pipeline Compatibility

Different pipelines support different LoRA model types. Make sure you download LoRAs that match your pipeline:

| Pipeline           | Compatible LoRAs |
| ------------------ | ---------------- |
| StreamDiffusion V2 | Wan2.1-T2V-1.3B  |
| LongLive           | Wan2.1-T2V-1.3B  |
| RewardForcing      | Wan2.1-T2V-1.3B  |
| MemFlow            | Wan2.1-T2V-1.3B  |
| Krea Realtime      | Wan2.1-T2V-14B   |

<Note>
  Krea Realtime uses the larger 14B model, so it requires different LoRAs than the other pipelines.
</Note>

***

## Recommended LoRAs

Here are some LoRAs to get you started:

### For 1.3B Pipelines (StreamDiffusion V2, LongLive, RewardForcing, MemFlow)

<CardGroup cols={2}>
  <Card title="Arcane Jinx" icon="user" href="https://civitai.com/models/1332383/wan-lora-arcane-jinx-v1-wan-13b">
    Character LoRA for the Arcane art style
  </Card>

  <Card title="Genshin TCG" icon="cards" href="https://civitai.com/models/1728768/genshin-tcg-style-wan-13b">
    Stylized trading card game aesthetic
  </Card>
</CardGroup>

### For 14B Pipeline (Krea Realtime)

<CardGroup cols={3}>
  <Card title="Origami" icon="paper-plane" href="https://huggingface.co/shauray/Origami_WanLora/tree/main">
    Paper-craft folded aesthetic
  </Card>

  <Card title="Film Noir" icon="film" href="https://huggingface.co/Remade-AI/Film-Noir">
    Classic black-and-white cinema style
  </Card>

  <Card title="Pixar" icon="clapperboard" href="https://huggingface.co/Remade-AI/Pixar">
    3D animated movie aesthetic
  </Card>
</CardGroup>

***

## Downloading LoRAs

Scope supports LoRAs from popular hubs like [HuggingFace](https://huggingface.co/) and [CivitAI](https://civitai.com/). The download process differs depending on whether you're running Scope locally or in the cloud.

<Tabs>
  <Tab title="Local Installation" icon="desktop">
    When running Scope on your local machine, you can download LoRA files directly through your browser.

    ### From HuggingFace

    <Steps>
      <Step title="Find the LoRA page">
        Navigate to the LoRA model page on HuggingFace.
      </Step>

      <Step title="Download the file">
        Click the download button next to the `.safetensors` file.
      </Step>

      <Step title="Move to LoRA folder">
        Move the downloaded file to:

        ```text  theme={null}
        ~/.daydream-scope/models/lora
        ```
      </Step>
    </Steps>

    ### From CivitAI

    <Steps>
      <Step title="Find the LoRA page">
        Navigate to the LoRA model page on CivitAI.
      </Step>

      <Step title="Download the file">
        Click the download button.
      </Step>

      <Step title="Move to LoRA folder">
        Move the downloaded file to:

        ```text  theme={null}
        ~/.daydream-scope/models/lora
        ```
      </Step>
    </Steps>
  </Tab>

  <Tab title="Cloud (RunPod)" icon="cloud">
    When running Scope on a remote machine, you'll need to download LoRAs programmatically using `wget`.

    ### From HuggingFace

    <Steps>
      <Step title="Copy the download link">
        On the LoRA page, go to **Files and versions** and copy the link address for the `.safetensors` file.
      </Step>

      <Step title="Download via terminal">
        Navigate to the LoRA folder and download:

        ```bash  theme={null}
        cd /workspace/models/lora
        wget -O <filename>.safetensors "<link_address>"
        ```

        **Example:**

        ```bash  theme={null}
        wget -O pixar_10_epochs.safetensors "https://huggingface.co/Remade-AI/Pixar/resolve/main/pixar_10_epochs.safetensors?download=true"
        ```

        <Tip>
          On some RunPod templates, `wget` may not be pre-installed. If so, run `apt-get install wget` first.
        </Tip>
      </Step>
    </Steps>

    ### From CivitAI

    <Steps>
      <Step title="Get a CivitAI API key">
        CivitAI requires an API key for programmatic downloads.

        1. Create an account at [civitai.com](https://civitai.com)
        2. Go to [Developer Settings](https://developer.civitai.com/docs/getting-started/setup-profile)
        3. Generate an API key
      </Step>

      <Step title="Copy the download link">
        On the LoRA page, copy the download link address.
      </Step>

      <Step title="Download via terminal">
        Navigate to the LoRA folder and download with your API token:

        ```bash  theme={null}
        cd /workspace/models/lora
        wget -O <filename>.safetensors "<link_address>&token=<YOUR_API_KEY>"
        ```

        **Example:**

        ```bash  theme={null}
        wget -O arcane-jinx.safetensors "https://civitai.com/api/download/models/1679582?type=Model&format=SafeTensor&token=YOUR_API_KEY"
        ```

        <Warning>
          Make sure to wrap the URL in double quotes - the `&` character will cause issues otherwise.
        </Warning>
      </Step>
    </Steps>
  </Tab>
</Tabs>

***

## Loading LoRAs

Once downloaded, your LoRAs will appear in the Scope interface under the LoRA section. You can:

* **Load multiple LoRAs** simultaneously for combined effects
* **Adjust the scale** of each LoRA to control its influence
* **Hot-swap LoRAs** without restarting the pipeline (in runtime mode)

<Warning>
  Many LoRAs require a **trigger keyword** in your prompt to activate. Check the LoRA's model page (on HuggingFace or CivitAI) for the required trigger phrase and include it in your prompt. For example, the Pixar LoRA uses the trigger `p1x4r_5ty13 Pixar animation style`.
</Warning>

<Note>
  For runtime LoRA scale adjustments, load your pipeline with `lora_merge_mode: "runtime_peft"`. This enables dynamic scale updates but may slightly reduce FPS compared to permanent merge mode.
</Note>

***

## Try Community Examples

Want to see LoRAs in action? Check out this walkthrough from the Community Hub:

<Card title="From Photorealistic to Pixar in Real-Time" icon="wand-magic-sparkles" href="https://app.daydream.live/creators/viborc/lora-adapters-in-scope-from-photorealistic-to-pixar-in-real-time?utm_source=docs&utm_medium=web&utm_campaign=docs2com">
  Watch how a single LoRA transforms a puppy scene from photorealistic to Pixar animation style using the **Krea Realtime** pipeline — includes downloadable timeline files
</Card>

***

## See Also

<CardGroup cols={2}>
  <Card title="Quick Start" icon="rocket" href="/scope/getting-started/quickstart">
    Get Scope running if you haven't already
  </Card>

  <Card title="VACE Guide" icon="image" href="/scope/guides/vace">
    Use reference images to guide your generations
  </Card>
</CardGroup>
