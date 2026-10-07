/**
 * Structured-output judgements for orchestrator decisions.
 * ────────────────────────────────────────────────────────
 * Small, cheap, schema-constrained calls that answer questions the
 * orchestrator currently answers with substring matching. Every function here
 * returns null rather than throwing: the caller always has a working
 * heuristic to fall back to, and a judgement failure must never cost a turn.
 */
import { GoogleGenAI } from '@google/genai';
import { MODELS } from '../config/models.js';
import { JUDGE_TIMEOUT_MS } from '../config/orchestration.js';
import { CRITIC_SCHEMA, buildCriticPrompt } from './roomTools.js';

let genAI = null;

/** A fresh usage counter. Each chat room keeps its own, so one room's judgement calls
 *  never show up in (or get reset by) another's. */
export function createJudgeUsage() {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 };
}

/** Usage for callers that pass no counter (scripts, older tests). */
let judgeUsage = createJudgeUsage();

export function initializeJudge(apiKey, client = null) {
  genAI = client || new GoogleGenAI({ apiKey });
}

export function getJudgeUsage() {
  return { ...judgeUsage };
}

export function resetJudgeUsage() {
  judgeUsage = createJudgeUsage();
}

function recordUsage(usage, counter = judgeUsage) {
  counter.calls += 1;
  if (!usage) return;
  counter.inputTokens += usage.total_input_tokens || 0;
  counter.outputTokens += usage.total_output_tokens || 0;
  counter.totalTokens += usage.total_tokens || 0;
}

/**
 * One schema-constrained call, with a hard timeout.
 * @returns {Promise<object|null>} parsed JSON, or null on any failure
 */
async function ask(prompt, schema, label, counter) {
  if (!genAI) return null;

  const call = genAI.interactions.create({
    model: MODELS.LITE,
    input: prompt,
    store: false,
    generation_config: {
      // A classification, not an essay — no deliberation budget needed.
      thinking_level: 'minimal',
      max_output_tokens: 512,
    },
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema,
    },
  });

  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(Symbol.for('timeout')), JUDGE_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([call, timeout]);
    if (result === Symbol.for('timeout')) {
      console.warn(`[judge] ${label} timed out after ${JUDGE_TIMEOUT_MS}ms; using heuristic`);
      return null;
    }
    recordUsage(result.usage, counter);
    const text = result.output_text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    // Includes malformed JSON: the schema makes that unlikely, not impossible.
    console.warn(`[judge] ${label} failed (${err.message}); using heuristic`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Choose who speaks next from a pre-filtered set of candidates.
 *
 * The caller has already applied the hard rules — never the last speaker,
 * fairness floor, muting — so this is a preference between genuinely valid
 * options, never a veto over policy.
 *
 * @returns {Promise<{agentId: string, reason: string, confidence: number}|null>}
 */
export async function selectSpeaker({ candidates, recentMessages, goal, usage }) {
  if (!candidates?.length) return null;
  if (candidates.length === 1) {
    return { agentId: candidates[0].id, reason: 'only eligible speaker', confidence: 1 };
  }

  const roster = candidates
    .map(a => `- id=${a.id} | ${a.name}: ${(a.bio || '').slice(0, 200).replace(/\s+/g, ' ')}`)
    .join('\n');
  const transcript = recentMessages
    .slice(-6)
    .map(m => `[${m.agentName}]: ${(m.content || '').slice(0, 400)}`)
    .join('\n');

  const prompt =
`Pick who should speak next in this discussion.

GOAL: ${goal}

ELIGIBLE SPEAKERS:
${roster}

RECENT MESSAGES:
${transcript}

Choose the participant whose expertise or whose being directly addressed makes
them the most natural next voice. Prefer someone who was asked a question by
name. Do not pick someone merely because they have been quiet — fairness is
handled elsewhere.`;

  const schema = {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        // An enum makes an invalid speaker structurally impossible, which the
        // substring heuristic could not guarantee.
        enum: candidates.map(a => a.id),
        description: 'id of the participant who should speak next',
      },
      reason: {
        type: 'string',
        description: 'One short clause, e.g. "addressed by name" or "owns the data question".',
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['agentId', 'reason', 'confidence'],
  };

  const result = await ask(prompt, schema, 'selectSpeaker', usage);
  if (!result) return null;
  // Defence in depth: trust the enum, verify anyway.
  if (!candidates.some(a => a.id === result.agentId)) return null;
  return result;
}

/**
 * Judge whether a message actually declares the shared goal complete.
 *
 * Replaces a hard-coded phrase list ("that's a wrap", "mission accomplished").
 * The caller still applies the cooldown and quorum rules around this answer.
 *
 * @returns {Promise<{complete: boolean, confidence: number, rationale: string}|null>}
 */
export async function assessCompletion({ content, goal, agentName, usage }) {
  if (!content?.trim()) return null;

  const prompt =
`Decide whether this message is declaring the shared goal FINISHED.

GOAL: ${goal}

MESSAGE from ${agentName}:
${content.slice(0, 2000)}

"Complete" means the speaker believes the work is done and the discussion can
end. Enthusiasm, agreement with one point, or wrapping up a single sub-topic
is NOT completion. Saying goodbye is not completion unless the goal is met.`;

  const schema = {
    type: 'object',
    properties: {
      complete: {
        type: 'boolean',
        description: 'true only if the speaker is declaring the whole goal finished',
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      rationale: { type: 'string', description: 'One short clause.' },
    },
    required: ['complete', 'confidence', 'rationale'],
  };

  return ask(prompt, schema, 'assessCompletion', usage);
}

/** A vision judgement takes longer than the text ones above; still bounded, never stalling a room. */
export const CRITIC_TIMEOUT_MS = 60_000;

/**
 * An independent critic: scores a candidate picture 1 to 10 against a reference picture (sameness) or a description, seeing ONLY the
 * pictures and the question, never the conversation, so it cannot be talked into agreeing. In the experiments that motivated it (the
 * atelier's notes/wave2.md, X6) every model alone scored a photograph that had drifted into a painting 2 to 3 out of 10 against 9 or 10
 * for good frames, while a supervisor inside the room said MATCH to it; and a checklist prompt (MATCH or RETAKE) made every model
 * reject nearly everything, where the 1 to 10 form discriminates.
 *
 * @param {{ candidate: {data: string, mimeType: string}, reference?: {data: string, mimeType: string}|null, criteria?: string, model?: string, usage?: object }} args
 * @returns {Promise<{ score: number, differs: string, model: string }|null>} null on any failure (the caller says the critic could not be reached)
 */
export async function critiqueImage({ candidate, reference = null, criteria = '', model = null, usage }) {
  if (!genAI || !candidate?.data) return null;
  const useModel = model || MODELS.FAST;
  const input = [{ type: 'text', text: buildCriticPrompt({ hasReference: !!reference, criteria }) }];
  if (reference?.data) input.push({ type: 'image', data: reference.data, mime_type: reference.mimeType || 'image/png' });
  input.push({ type: 'image', data: candidate.data, mime_type: candidate.mimeType || 'image/png' });

  let timer;
  try {
    const call = genAI.interactions.create({
      model: useModel,
      input,
      store: false,
      generation_config: { thinking_level: 'medium', max_output_tokens: 1024 },
      response_format: { type: 'text', mime_type: 'application/json', schema: CRITIC_SCHEMA },
    });
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(Symbol.for('timeout')), CRITIC_TIMEOUT_MS); });
    const result = await Promise.race([call, timeout]);
    if (result === Symbol.for('timeout')) { console.warn(`[judge] critic timed out after ${CRITIC_TIMEOUT_MS}ms`); return null; }
    recordUsage(result.usage, usage);
    const parsed = JSON.parse(result.output_text || 'null');
    const score = Number(parsed?.score);
    if (!Number.isFinite(score)) return null;
    return { score: Math.max(1, Math.min(10, Math.round(score))), differs: String(parsed.differs || '').slice(0, 300), model: useModel };
  } catch (err) {
    console.warn(`[judge] critic failed (${err.message})`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
