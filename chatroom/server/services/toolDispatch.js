/**
 * Function-call dispatcher.
 * ─────────────────────────
 * Turns a `function_call` step into a `function_result` the model can read,
 * and handles the app-side consequences (store the media, broadcast to the
 * UI, feed the vision window) on the way past.
 *
 * The dispatcher is built per turn by the orchestrator, which owns the stores
 * and the SSE channel; gemini.js only ever sees the injected `dispatch`
 * function. That keeps the stream parser free of application concerns.
 */
import { v4 as uuidv4 } from 'uuid';
import { generateImage, generateImageWithReferences } from './imageGen.js';
import { isDispatchableTool } from './toolDefinitions.js';
import { MAX_INLINE_RESULT_IMAGES } from '../config/tools.js';

/**
 * Shape returned to gemini.js for every call.
 * @typedef {object} ToolOutcome
 * @property {boolean} ok
 * @property {Array<object>} result  function_result content blocks (text/image)
 * @property {string} summary        one-line human-readable outcome, for the UI
 * @property {object} [media]        { id, type, mimeType, prompt } when media was made
 */

/** Text-only outcome helper. */
function textOutcome(ok, text) {
  return { ok, result: [{ type: 'text', text }], summary: text };
}

/**
 * @param {object} deps
 * @param {object} deps.agent        the speaking agent
 * @param {object} deps.mediaStore
 * @param {object} deps.artifactStore
 * @param {(media: object) => void} [deps.onMedia]     new media was stored
 * @param {(event: string, data: object) => void} [deps.onEvent]  broadcast hook
 * @param {(topic: string, opts: object) => Promise<{ok: boolean, error?: string}>} [deps.startResearch]
 *   Submits a Deep Research task and enforces the per-session budget. Absent
 *   when deep research is disabled, which makes the tool refuse cleanly.
 * @returns {(call: {id: string, name: string, arguments: object}) => Promise<ToolOutcome>}
 */
export function createToolDispatcher({
  agent, mediaStore, artifactStore, onMedia, onEvent, startResearch,
}) {
  // Budget for images handed back to the model inline this turn — see
  // MAX_INLINE_RESULT_IMAGES for why this is capped.
  let inlineImagesRemaining = MAX_INLINE_RESULT_IMAGES;

  const emit = (event, data) => {
    try {
      onEvent?.(event, data);
    } catch {
      // A broadcast failure must never fail the tool call.
    }
  };

  /** Store generated media, notify the app, and build the model-facing result. */
  function registerImage({ imageData, mimeType, prompt, referenceIds }) {
    const id = uuidv4();
    mediaStore.add({
      id,
      type: 'image',
      data: imageData,
      mimeType: mimeType || 'image/png',
      prompt,
      agentId: agent.id,
      agentName: agent.name,
      ...(referenceIds ? { referenceIds } : {}),
    });

    const media = { id, type: 'image', mimeType: mimeType || 'image/png', prompt, referenceIds };
    onMedia?.({ ...media, data: imageData });
    emit('image_generated', {
      agentId: agent.id,
      imageId: id,
      prompt,
      ...(referenceIds ? { isRemix: true, referenceId: referenceIds[0] } : {}),
    });

    // Hand the image itself back when there's budget, so the agent can judge
    // the result rather than its own prompt. Otherwise describe it.
    const blocks = [{
      type: 'text',
      text:
        `Image generated. id=${id}. ` +
        `Embed it in an artifact with <img src="/chatroom/api/chat/media/${id}" />. ` +
        `To build a new image that contains this one, call compose_image with reference_ids=["${id}"].`,
    }];
    if (inlineImagesRemaining > 0) {
      inlineImagesRemaining -= 1;
      blocks.push({ type: 'image', data: imageData, mime_type: mimeType || 'image/png' });
    } else {
      blocks[0].text += ' (Not shown inline — the per-turn image budget for this turn is used up.)';
    }

    return { ok: true, result: blocks, summary: `Generated image ${id}`, media };
  }

  const handlers = {
    async generate_image(args) {
      const prompt = String(args?.prompt || '').trim();
      if (!prompt) return textOutcome(false, 'generate_image failed: prompt was empty.');

      emit('image_generating', { agentId: agent.id, prompt });
      const result = await generateImage(prompt, {
        ...(args.aspect_ratio ? { aspect_ratio: args.aspect_ratio } : {}),
      });
      if (!result?.imageData) {
        return textOutcome(false, 'generate_image failed: the backend returned no image.');
      }
      return registerImage({
        imageData: result.imageData,
        mimeType: result.mimeType,
        prompt,
      });
    },

    async compose_image(args) {
      const prompt = String(args?.prompt || '').trim();
      const ids = Array.isArray(args?.reference_ids) ? args.reference_ids.map(String) : [];
      if (!prompt) return textOutcome(false, 'compose_image failed: prompt was empty.');
      if (ids.length === 0) {
        return textOutcome(false, 'compose_image failed: reference_ids was empty. Pass at least one image ID from the transcript.');
      }

      const references = [];
      const missing = [];
      for (const id of ids) {
        const media = mediaStore.get(id);
        if (media?.data) {
          references.push({ imageData: media.data, mimeType: media.mimeType });
        } else {
          missing.push(id);
        }
      }
      if (references.length === 0) {
        // Naming the real IDs beats "not found" — the model can retry correctly.
        const known = mediaStore.getAll().slice(-5).map(m => m.id);
        return textOutcome(
          false,
          `compose_image failed: none of these IDs exist: ${missing.join(', ')}. ` +
          (known.length
            ? `Recent valid image IDs are: ${known.join(', ')}.`
            : 'No images have been generated in this session yet — use generate_image first.')
        );
      }

      emit('image_generating', {
        agentId: agent.id, prompt, isRemix: true, referenceId: ids[0],
      });
      const result = await generateImageWithReferences(prompt, references);
      if (!result?.imageData) {
        return textOutcome(false, 'compose_image failed: the backend returned no image.');
      }

      const outcome = registerImage({
        imageData: result.imageData,
        mimeType: result.mimeType,
        prompt,
        referenceIds: ids.filter(id => !missing.includes(id)),
      });
      if (missing.length) {
        outcome.result[0].text += ` (Ignored unknown reference IDs: ${missing.join(', ')}.)`;
      }
      return outcome;
    },

    async write_artifact(args) {
      const filename = String(args?.filename || '').trim();
      const content = typeof args?.content === 'string' ? args.content : '';
      if (!filename) return textOutcome(false, 'write_artifact failed: filename was empty.');
      if (!content.trim()) {
        return textOutcome(false, 'write_artifact failed: content was empty. Send the complete file.');
      }

      const artifact = artifactStore.save(filename, content, agent.id, agent.name);
      emit('artifact_update', {
        filename: artifact.filename,
        language: artifact.language,
        content: artifact.content,
        version: artifact.versions.length,
        lastEditBy: artifact.lastEditBy,
        agentId: agent.id,
        summary: args?.summary || undefined,
      });

      return textOutcome(
        true,
        `Saved ${artifact.filename} as version ${artifact.versions.length}. ` +
        'It is now live in the preview panel for everyone.'
      );
    },

    async deep_research(args) {
      const topic = String(args?.topic || '').trim();
      if (!topic) return textOutcome(false, 'deep_research failed: topic was empty.');
      if (!startResearch) {
        return textOutcome(false, 'deep_research is not available in this session.');
      }

      // The budget is enforced here, server-side. The tool description asks
      // the model to be sparing; that is a request, and this is the rule.
      const submitted = await startResearch(topic, { max: Boolean(args?.thorough) });
      if (!submitted.ok) return textOutcome(false, `deep_research declined: ${submitted.error}`);

      // Returns immediately: the task runs for minutes and the report reaches
      // whoever is speaking when it lands.
      return textOutcome(
        true,
        `Research task submitted on "${topic.slice(0, 100)}". It runs in the background ` +
        `for several minutes; the findings will be delivered to whoever is speaking when ` +
        `it completes. Carry on with the discussion — do not wait, and do not invent ` +
        `findings in the meantime.`
      );
    },
  };

  return async function dispatch(call) {
    const name = call?.name;
    if (!isDispatchableTool(name) || !handlers[name]) {
      return textOutcome(false, `Unknown tool "${name}". It is not available to you.`);
    }
    try {
      return await handlers[name](call.arguments || {});
    } catch (err) {
      // Tool failures are reported TO the model, not thrown past it — an agent
      // that knows generation failed can say so instead of inventing success.
      console.error(`[tool:${name}] ${err.message}`);
      emit('tool_error', { agentId: agent.id, tool: name, error: err.message });
      return textOutcome(false, `${name} failed: ${err.message}`);
    }
  };
}
