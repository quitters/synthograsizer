/**
 * Telling a refusal from a failure.
 * ─────────────────────────────────
 * "Provider safety filters apply in both stages; never route around a refusal." When the model service declines a request,
 * that answer is final: no second attempt with the same words (the filters are not a coin to toss until it lands), no
 * reworded attempt, no other model. A network error or a busy server is different, and is still retried.
 *
 * The Interactions API documents no explicit safety-block field, so a refusal is recognised by the words in the error, exactly as
 * backend/google_api.py does for the rest of the suite (the markers below are the same ones). Deliberately narrow: "harm" alone
 * would match "harmless".
 */
export const SAFETY_MARKERS = Object.freeze(['safety', 'prohibited', 'blocked', 'harm_category', 'harmful']);

/** Interaction states that mean the turn did not produce an answer. */
export const FAILED_STATUSES = Object.freeze(['failed', 'cancelled', 'budget_exceeded']);

export function looksLikeSafetyBlock(message) {
  const lowered = String(message || '').toLowerCase();
  return SAFETY_MARKERS.some(marker => lowered.includes(marker));
}

/**
 * Did a finished interaction end in a refusal rather than an answer?
 * @param {{ status?: string, stepErrors?: string[] }} outcome
 * @returns {string|null} what the service said, or null when this was not a refusal
 */
export function refusalFromOutcome({ status, stepErrors = [] } = {}) {
  if (!FAILED_STATUSES.includes(String(status))) return null;
  const detail = stepErrors.filter(Boolean).join('; ') || `Interaction ${status}`;
  return looksLikeSafetyBlock(detail) ? detail : null;
}

/** The error messages carried by an interaction's steps. */
export function stepErrorMessages(steps) {
  return (steps || []).map(s => s?.error?.message).filter(Boolean);
}
