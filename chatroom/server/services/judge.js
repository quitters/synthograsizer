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

let genAI = null;

/** Usage accumulated by judgement calls, so the meter stays honest. */
let judgeUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 };

export function initializeJudge(apiKey, client = null) {
  genAI = client || new GoogleGenAI({ apiKey });
}

export function getJudgeUsage() {
  return { ...judgeUsage };
}

export function resetJudgeUsage() {
  judgeUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 };
}

function recordUsage(usage) {
  judgeUsage.calls += 1;
  if (!usage) return;
  judgeUsage.inputTokens += usage.total_input_tokens || 0;
  judgeUsage.outputTokens += usage.total_output_tokens || 0;
  judgeUsage.totalTokens += usage.total_tokens || 0;
}

/**
 * One schema-constrained call, with a hard timeout.
 * @returns {Promise<object|null>} parsed JSON, or null on any failure
 */
async function ask(prompt, schema, label) {
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
    recordUsage(result.usage);
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
export async function selectSpeaker({ candidates, recentMessages, goal }) {
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

  const result = await ask(prompt, schema, 'selectSpeaker');
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
export async function assessCompletion({ content, goal, agentName }) {
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

  return ask(prompt, schema, 'assessCompletion');
}
