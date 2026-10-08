/**
 * Estimated spend, for the spend ceiling.
 * ───────────────────────────────────────
 * List prices, not billing, and rounded UP: a ceiling that undercounts is no ceiling. Thinking tokens bill as output;
 * cached input is billed at a lower rate that this ignores on purpose.
 */
import { MODEL_PRICING_USD_PER_M } from '../config/models.js';

// Known unit costs of the things an agent can ask for that are not text. Estimates from Teamcrafter's ledger
// (an image is about $0.07 on the fast image model), rounded up.
export const TOOL_COST_USD = Object.freeze({
  generate_image: 0.08,
  compose_image: 0.08,
  critique_image: 0.01,
  render_artifact: 0.08,
  deep_research: 3.0,
});

/** The dearest known model, used when a model id is not in the table. */
const FALLBACK = Object.values(MODEL_PRICING_USD_PER_M).reduce((a, b) => (b.out > a.out ? b : a));

export function pricingFor(model) {
  return MODEL_PRICING_USD_PER_M[model] || FALLBACK;
}

/**
 * @param {{ inputTokens?: number, outputTokens?: number, thoughtTokens?: number }|null|undefined} usage
 * @param {string} [model]
 * @returns {number} US dollars
 */
export function textCostUsd(usage, model) {
  if (!usage) return 0;
  const p = pricingFor(model);
  const input = Number(usage.inputTokens ?? usage.total_input_tokens) || 0;
  const output = (Number(usage.outputTokens ?? usage.total_output_tokens) || 0) + (Number(usage.thoughtTokens ?? usage.total_thought_tokens) || 0);
  return (input * p.in + output * p.out) / 1_000_000;
}

export const toolCostUsd = (name) => TOOL_COST_USD[name] || 0;
