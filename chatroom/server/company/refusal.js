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

/**
 * What the model service actually said, when the SDK's own message hides it. A rejected request comes back as
 * "400 API error occurred: {"httpMeta":...}" with the reason only in `error.error.message`; the first real mixed-tier company session
 * lost an hour to "'google_search' and 'file_search' cannot be combined" because the room's log held only the generic line.
 * Reading the reason also lets looksLikeSafetyBlock see a block the generic line concealed (a refusal is final; it must not be retried as a failure).
 */
export function describeApiError(error) {
  const message = String(error?.message ?? error ?? 'unknown error');
  const reason = error?.error?.message;
  if (typeof reason !== 'string' || !reason || message.includes(reason)) return message;
  return `${error.status ? `${error.status} ` : ''}${reason}`;
}

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
