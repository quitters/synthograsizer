/**
 * The model calls the creation flow makes, with their cost counted.
 * ──────────────────────────────────────────────────────────────────
 * Writing a company is model work before there is a company: a plan, a seed and a sheet for each person, a blind review, a screen, a quiz, memory
 * summaries. None of it happens inside a room, so none of it is under a room's spend ceiling. This is the flow's own: every call goes through
 * askJson, is priced by the same list prices the rooms use (spend.js, rounded up), and is refused once the flow has spent its allowance. The allowance
 * is the operator's to set (operator.flow.maxSpendUsd) and a proposal can only lower it.
 *
 * A call that fails is tried again with a growing pause, except when the model service declined it: that answer is final (refusal.js) and is neither
 * retried nor reworded, here or anywhere.
 */
import { getGeminiClient } from '../../services/gemini.js';
import { MODELS } from '../../config/models.js';
import { textCostUsd } from '../spend.js';
import { looksLikeSafetyBlock, describeApiError } from '../refusal.js';
import { PolicyError } from '../errors.js';

/** What a flow has spent so far, by step. */
export class Spend {
  constructor() { this.usd = 0; this.calls = 0; this.byStep = {}; }

  record(step, model, usage) {
    const usd = textCostUsd(usage, model);
    this.usd += usd;
    this.calls += 1;
    const s = (this.byStep[step] ||= { calls: 0, usd: 0 });
    s.calls += 1;
    s.usd += usd;
    return usd;
  }

  /** A copy for an API answer: dollars to a tenth of a cent. */
  snapshot() {
    const round = (x) => Math.round(x * 1000) / 1000;
    return { usd: round(this.usd), calls: this.calls, byStep: Object.fromEntries(Object.entries(this.byStep).map(([k, v]) => [k, { calls: v.calls, usd: round(v.usd) }])) };
  }
}

/**
 * @param {{ getClient?: Function, spend?: Spend, limitUsd?: number, sleep?: (ms: number) => Promise<void> }} [options]
 */
export function createModel({ getClient = getGeminiClient, spend = new Spend(), limitUsd = Infinity, sleep = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
  /**
   * One call that must answer in JSON that fits `schema`.
   * @param {{ step: string, model?: string, system?: string, prompt: string, schema: object, thinking?: string, maxOutput?: number, attempts?: number }} call
   */
  async function askJson({ step, model = MODELS.FAST, system = null, prompt, schema, thinking = 'low', maxOutput = 4000, attempts = 3 }) {
    if (spend.usd >= limitUsd) {
      throw new PolicyError(`This flow has spent its allowance ($${limitUsd.toFixed(2)}), so it will not make another model call. Raise the allowance if you want it to go on.`, { status: 402, code: 'flow_spend_limit' });
    }
    const client = getClient();
    if (!client?.interactions?.create) throw new PolicyError('The model is not set up on this server (is GEMINI_API_KEY set?).', { status: 503, code: 'no_model' });
    let last;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const r = await client.interactions.create({
          model, input: prompt, store: false, ...(system ? { system_instruction: system } : {}),
          generation_config: { thinking_level: thinking, max_output_tokens: maxOutput },
          response_format: { type: 'text', mime_type: 'application/json', schema },
        });
        spend.record(step, model, r.usage);
        return JSON.parse(r.output_text);
      } catch (err) {
        const said = describeApiError(err);
        if (looksLikeSafetyBlock(said)) throw new PolicyError('The model service declined this request. That answer is final: it will not be tried again or reworded.', { status: 422, code: 'model_refused' });
        last = said;
        if (attempt < attempts) await sleep(1500 * attempt);
      }
    }
    throw new PolicyError(`The model could not answer the "${step}" step (${String(last).slice(0, 200)}).`, { status: 502, code: 'model_failed' });
  }

  return { askJson, spend, limitUsd };
}
