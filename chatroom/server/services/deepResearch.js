/**
 * Deep Research agent.
 * ────────────────────
 * Submits a research task and polls it to completion in the background, so
 * the conversation keeps moving while it runs. The finished report is handed
 * back through the orchestrator's existing "surface this to whoever speaks
 * next" channel — the same one workflow outcomes already use.
 */
import { GoogleGenAI } from '@google/genai';
import {
  RESEARCH_AGENT, RESEARCH_AGENT_MAX, POLL_INTERVAL_MS, MAX_WAIT_MS,
} from '../config/research.js';

let genAI = null;

export function initializeDeepResearch(apiKey, client = null) {
  genAI = client || new GoogleGenAI({ apiKey });
}

/**
 * Kick off a research task. Returns as soon as the API accepts it — the
 * report arrives minutes later via pollToCompletion.
 *
 * @returns {Promise<{id: string}>}
 */
export async function submitResearch(topic, { max = false } = {}) {
  if (!genAI) throw new Error('Deep research not initialized');
  if (!topic?.trim()) throw new Error('research topic was empty');

  const interaction = await genAI.interactions.create({
    agent: max ? RESEARCH_AGENT_MAX : RESEARCH_AGENT,
    input: topic.trim(),
    // Mandatory: these run for minutes and a synchronous call would time out.
    background: true,
    agent_config: {
      thinking_summaries: 'auto',
      visualization: 'auto',
      // The room cannot answer a clarifying question mid-task, so the agent
      // must plan and proceed on its own.
      collaborative_planning: false,
    },
  });

  if (!interaction?.id) throw new Error('research task returned no id');
  console.log(`[research] submitted ${interaction.id}: "${topic.slice(0, 80)}"`);
  return { id: interaction.id };
}

/** Pull the report text and any generated charts out of a finished task. */
export function extractReport(interaction) {
  let text = interaction.output_text || '';
  const images = [];

  for (const step of interaction.steps || []) {
    if (step.type !== 'model_output') continue;
    for (const block of step.content || []) {
      if (block.type === 'image' && block.data) {
        images.push({ data: block.data, mimeType: block.mime_type || 'image/png' });
      } else if (!text && block.type === 'text' && block.text) {
        // Fall back to walking the steps when output_text is empty, which
        // happens when the report interleaves text and visualisations.
        text += block.text;
      }
    }
  }
  return { text, images };
}

/**
 * Poll a submitted task until it finishes.
 *
 * @param {string} id
 * @param {(status: string, elapsedMs: number) => void} [onProgress]
 * @returns {Promise<{ok: boolean, status: string, text?: string, images?: Array, error?: string}>}
 */
export async function pollToCompletion(id, onProgress) {
  if (!genAI) throw new Error('Deep research not initialized');
  const started = Date.now();

  while (true) {
    const elapsed = Date.now() - started;
    if (elapsed > MAX_WAIT_MS) {
      // Do not cancel: the task may still be worth collecting manually, and
      // cancelling does not refund what it has already spent.
      return { ok: false, status: 'timeout', error: `still running after ${Math.round(elapsed / 60000)} min` };
    }

    let interaction;
    try {
      interaction = await genAI.interactions.get(id);
    } catch (err) {
      return { ok: false, status: 'error', error: err.message };
    }

    const status = interaction.status;
    onProgress?.(status, elapsed);

    if (status === 'completed') {
      const { text, images } = extractReport(interaction);
      console.log(`[research] ${id} completed in ${Math.round(elapsed / 1000)}s, ${text.length} chars`);
      return { ok: true, status, text, images, elapsedMs: elapsed };
    }
    if (status === 'failed' || status === 'cancelled') {
      return { ok: false, status, error: `task ${status}` };
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/** Cancel a running task. Does not refund spend already incurred. */
export async function cancelResearch(id) {
  if (!genAI) return { ok: false };
  try {
    await genAI.interactions.cancel(id);
    return { ok: true };
  } catch (err) {
    console.warn(`[research] could not cancel ${id}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}
