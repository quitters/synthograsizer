# Demo tour

A narrated, captioned walkthrough of the suite, recorded from the running app. It is a **dated snapshot**: where the app and the tour disagree, the app is right.

- **Length:** 9:04 in 17 chapters, 1920×1080.
- **Narration:** Gemini text-to-speech (voice *Kore*). English captions throughout, and a full transcript at the end of this page.
- **Recorded:** 2026-09-29 against `8e7204a`. The chat room, Glitcher and Commons chapters were re-recorded on 2026-10-05 against `3bb2e34`.
- **What it shows:** a local install, where everything is unlocked and nothing needs a sign-in. The hosted service at synthograsizer.com spends credits on AI calls and keeps Video and Music for the operator; see the [README](../README.md).
- **Not shown:** the Commons archive library (its licence decisions are still open, see [COMPLIANCE_ROADMAP.md](COMPLIANCE_ROADMAP.md)) and anything that needs the hosted service's account screens.

## Download

GitHub serves these files as downloads rather than streams, so save one and open it in a video player. Two versions of the same tour:

| File | Size | What it is |
|---|---|---|
| [Synthograsizer_Demo_Full.captioned.mp4](https://raw.githubusercontent.com/wiki/quitters/synthograsizer/tour/Synthograsizer_Demo_Full.captioned.mp4) | 63 MB | Captions burned into the picture. Plays anywhere. |
| [Synthograsizer_Demo_Full.mp4](https://raw.githubusercontent.com/wiki/quitters/synthograsizer/tour/Synthograsizer_Demo_Full.mp4) | 69 MB | No burned-in text. Carries an English caption track and 17 chapter markers, which VLC, QuickTime and Windows players show in their chapter and subtitle menus. |

## Chapters

Times are measured from the start of the full tour. Seek to them in the player, or use the chapter menu of the second file.

| Time | Chapter | What it shows | Length | Recorded |
|---|---|---|---|---|
| 0:00 | Introduction | Title card | 0:16 | 2026-09-29, `8e7204a` |
| 0:16 | The prompt playground | Knobs, the D-pad and the template library | 0:28 | 2026-09-29, `8e7204a` |
| 0:44 | Export prompt variations | Batch prompt generation: lock, random, sequential or repeat each variable, then export | 0:24 | 2026-09-29, `8e7204a` |
| 1:08 | Create a template with AI | Template Gen, Create: a plain-language idea becomes a template | 0:35 | 2026-09-29, `8e7204a` |
| 1:43 | Remix without starting over | Template Gen, Remix: add a camera_view variable to Fantasy Scene | 0:33 | 2026-09-29, `8e7204a` |
| 2:16 | Turn a story into shots | Template Gen, Story: a narrative becomes four shots | 0:31 | 2026-09-29, `8e7204a` |
| 2:47 | Generative art, live | Template Gen, p5.js: a generated sketch running live | 0:42 | 2026-09-29, `8e7204a` |
| 3:29 | Curate a template from an image | Template Gen, Workflow: pick values from a reference image | 0:31 | 2026-09-29, `8e7204a` |
| 4:00 | Give your work a signature style | Workflows: Style Transfer with its 53 style presets | 0:33 | 2026-09-29, `8e7204a` |
| 4:33 | Generate a series of images | Image Studio batch: three images from three prompts | 0:31 | 2026-09-29, `8e7204a` |
| 5:04 | From prompts to moving images | Video Studio batch: two Veo 3.1 Fast clips | 0:34 | 2026-09-29, `8e7204a` |
| 5:39 | Chain creative steps together | Workflows: Generate, Analyze, Regenerate | 0:41 | 2026-09-29, `8e7204a` |
| 6:20 | Build a creative agent | Agent Studio: create an agent from a description, tune its knobs, test it | 0:33 | 2026-09-29, `8e7204a` |
| 6:52 | Let the team discuss the idea | The chat room: a private room per visitor, four agents, a reference image sent mid-chat | 0:45 | 2026-10-05, `3bb2e34` |
| 7:37 | Push the image into glitch art | Glitcher: the redesigned studio, an effect confined to a drawn selection, before and after, focus mode | 0:39 | 2026-10-05, `3bb2e34` |
| 8:16 | The Commons — shared visual play | The Commons: desk, wall and a guest's phone live together, then a generated piece | 0:33 | 2026-10-05, `3bb2e34` |
| 8:49 | Closing | Closing card | 0:15 | 2026-09-29, `8e7204a` |

## Captions

WebVTT and SRT files for every chapter and for the whole tour are in [`demo-tour/captions/`](demo-tour/captions/). Each cue is a single line of at most 70 characters, timed from the pauses in the narration audio. Times in `Synthograsizer_Demo_Full.vtt` and `.srt` are measured from the start of the full tour.

## Notes on the footage

- "Turn a story into shots": the app shows a "Placeholder … has no matching variable" warning on import, and the new template is named UNTITLED. Both are known and harmless.
- "Let the team discuss the idea" (the chat room): each agent message appears twice. That is a known display bug in the chat room client, not intended behaviour.
- Generated results (images, templates, sketches, the Commons piece) differ every time.

## Transcript

### 0:00 · Introduction

Welcome to the Synthograsizer, a suite of creative tools for turning ideas into prompts, images, video, agents, and shared live visuals. Here is a quick tour of what it can do.

### 0:16 · The prompt playground

The Synthograsizer turns a prompt into an instrument. Each knob controls a variable, so you can explore new combinations without rewriting your idea. Switch to the D-pad for focused navigation, or browse the built-in library for generative art, characters, stories, and music. Start with a template, then make it your own.

### 0:44 · Export prompt variations

Prompt Batch turns one template into a whole collection of prompts. For each variable, choose whether to lock it, randomise it, step through its values in order, or repeat them. Set the batch size and an output format, then generate. Review the list, copy it all, or download it for another tool.

### 1:08 · Create a template with AI

Start with an idea in plain language. Here, a retro-futurist greenhouse becomes a reusable template, with separate controls for architecture, plants, lighting, and colour. Choose a model, generate the template, and explore its variables. Text, reference images, or a combination of both can guide the creation process.

### 1:43 · Remix without starting over

Remix lets you reshape a template with a simple instruction. Here, a fantasy scene gains a camera view, with a wide shot, a close-up, and a symmetrical corridor. The existing structure stays intact and becomes the starting point for a new variation. Reference images can guide the change too.

### 2:16 · Turn a story into shots

Story mode expands a narrative concept into a sequence of distinct shots. Set the number of beats and their duration, then suggest the framing you want to include. Shared character and world details help the sequence stay connected, while each beat has its own action and composition.

### 2:47 · Generative art, live

The p5.js generator turns a visual idea into an animated sketch with adjustable variables. Describe the movement, palette, and structure you want, then run the result in the live viewer. The built-in library also offers ready-made systems to explore. Change the controls and watch the artwork respond.

### 3:29 · Curate a template from an image

Workflow mode uses a reference image to choose values from an existing template. Load the template, add the image, and describe what matters most, such as palette or mood. The preview explains the suggested selections before you import them. It is a way to connect visual inspiration with structured prompt controls.

### 4:00 · Give your work a signature style

Style Transfer is a workflow with fifty-three built-in artistic presets. Describe a subject, then choose a look from the menu, from oil painting to art nouveau. The workflow generates the image, analyses it, and can refine the result for quality. Change the preset, and the same subject takes on an entirely new style.

### 4:33 · Generate a series of images

Image Studio can work on one prompt or a whole batch. Enter one prompt per line, choose the image model and aspect ratio, and start the run. Results collect in a gallery as they arrive. Reference images and optional prompt enhancement offer additional ways to guide the series.

### 5:04 · From prompts to moving images

Video Studio brings motion into the same creative process. Standard mode supports individual shots, while Batch mode accepts a list of prompts or a folder of images. Choose the model, duration, and aspect ratio, then follow the generation progress. Story and thematic tools provide another route for connected sequences.

### 5:39 · Chain creative steps together

Workflows chain several creative steps into one recipe. This one generates a draft image, analyses it to extract a rich description, then regenerates from that enriched prompt for higher quality. Fill in a prompt, an aspect ratio, and what to avoid, then run it. When it finishes, both the draft and the final image are ready to compare.

### 6:20 · Build a creative agent

Agents begin with a description. Type a sentence about the character you want, and the Agent Studio drafts a name, a bio template, and variables that become knobs. Tune the personality live, try a test message, then save the profile to your library or add it straight to a session.

### 6:52 · Let the team discuss the idea

The chat room puts several agents into one conversation, and every visitor gets a private room of their own. Load a panel, set a shared goal, and start the discussion. Drop in a reference image part way through and the agents keep it in view, while older messages fold into running notes so long sessions stay coherent. Step in whenever you like, or stop the exchange when you have what you need.

### 7:37 · Push the image into glitch art

Glitcher turns a source image into material for experimentation. Adjust colour and filter controls, then explore pixel effects that shift, slice, or distort the image. Draw a selection and the effect applies only inside it, so small changes add texture while stronger settings transform the composition. Compare against the original at any moment. Press F for focus mode, which hides every panel so only your image remains.

### 8:16 · The Commons — shared visual play

The Commons turns any screen into a shared canvas. The host makes a room, picks a piece from the library, and puts it on the wall. Everyone who scans the code gets a phone control, and their choices reshape the wall live. Ready-made pieces are free, and the host can also generate a brand new piece from a single prompt.

### 8:49 · Closing

That is the Synthograsizer: templates, studios, workflows, agents, glitch art, and a shared canvas, working together in one place. Open it up and start playing.
