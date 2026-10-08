/**
 * A request the safety layer refuses. Routes turn it into an HTTP answer (`status`, `code`, `field`);
 * the orchestrator lets it propagate to whoever called.
 */
export class PolicyError extends Error {
  /**
   * @param {string} message  plain words, safe to show a person (never echoes a secret or the offending text)
   * @param {{ code?: string, status?: number, field?: string }} [info]
   */
  constructor(message, { code = 'policy', status = 403, field } = {}) {
    super(message);
    this.name = 'PolicyError';
    this.code = code;
    this.status = status;
    if (field) this.field = field;
  }
}

export const isPolicyError = (err) => err instanceof PolicyError;
