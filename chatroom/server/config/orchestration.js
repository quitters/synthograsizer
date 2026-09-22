/**
 * Smart-orchestration configuration.
 * ──────────────────────────────────
 * Phase 5 of MODERNIZATION_PLAN.md §4.4.
 *
 * Two of the orchestrator's own decisions are language-understanding problems
 * currently solved with substring matching:
 *
 *   - who should speak next, decided partly by scanning for "Name," / "Name?"
 *   - whether the room has reached consensus, decided by a hard-coded list of
 *     phrases like "that's a wrap" and "mission accomplished"
 *
 * A cheap structured-output call answers both better, and returns a reason
 * the UI can show. At flash-lite rates ($0.30/$2.50 per 1M) this is close to
 * free next to the agent turns themselves.
 *
 * NOTE — this AUGMENTS the heuristics, it does not replace them. The plan
 * said "replace", but the existing code encodes constraints learned from real
 * sessions: a fairness floor that stops one agent dominating, a cooldown that
 * stops a single agent closing the room right after the user typed, and a
 * quorum requirement. Those are policy, not judgement, and handing them to a
 * model would regress behaviour that was earned the hard way. What the model
 * replaces is only the part that is genuinely about reading language.
 *
 * Off by default: it adds a round trip per turn, and every failure mode falls
 * back to the heuristic path that ships today.
 */

export const SMART_ORCHESTRATION = process.env.SMART_ORCHESTRATION !== 'false';

export const isSmartOrchestrationEnabled = () => SMART_ORCHESTRATION;

/**
 * Give up on a judgement call rather than stalling the room. On timeout the
 * caller falls back to the heuristic, so a slow judge costs latency once, not
 * a broken turn.
 */
export const JUDGE_TIMEOUT_MS = 8_000;

/**
 * Below this, a judgement is treated as "no opinion" and the heuristic wins.
 * Consensus ends the session, so it is held to a higher bar than speaker
 * choice, which is merely a preference between valid options.
 */
export const SPEAKER_CONFIDENCE_FLOOR = 0.4;
export const CONSENSUS_CONFIDENCE_FLOOR = 0.75;
