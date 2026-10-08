/**
 * Least privilege: which tools a company's agents may have at all.
 * ────────────────────────────────────────────────────────────────
 * Two sets. The OPERATOR's set is the most any company on this server can ever be given. A company's GRANT starts at the
 * research tools (search and reading a page; nothing is made, nothing is run) and its owner widens it, on purpose, up to the
 * operator's set. An agent's tier (config/tools.js) must then fit inside the company's grant: a tier whose tools are not all
 * granted is refused. Every agent starts at `none`.
 *
 * The check is on tool NAMES, so a new tier cannot slip past it: it works for whatever tools the tier lists.
 */
import { TOOL_TIERS } from '../config/tools.js';
import { PolicyError } from './errors.js';

/** Every tool any tier can hold. */
export const KNOWN_TOOLS = Object.freeze([...new Set(Object.values(TOOL_TIERS).flat())]);

/** The narrowest tier an agent starts at. */
export const DEFAULT_AGENT_TIER = 'none';

/** What a new company is granted: the research tier. */
export const DEFAULT_COMPANY_GRANT = Object.freeze([...TOOL_TIERS.research]);

/** The most an operator allows by default: everything the `full` tier holds. Deep research costs $1 to $3 a call and stays off unless the operator adds it. */
export const DEFAULT_OPERATOR_TOOLS = Object.freeze([...TOOL_TIERS.full]);

export function toolsOfTier(tier) {
  return Object.prototype.hasOwnProperty.call(TOOL_TIERS, tier) ? [...TOOL_TIERS[tier]] : null;
}

/**
 * @param {unknown} input  an array of tool names
 * @returns {{ ok: boolean, value: string[], errors: string[] }}
 */
export function validateToolList(input) {
  if (input === undefined || input === null) return { ok: true, value: [], errors: [] };
  if (!Array.isArray(input)) return { ok: false, value: [], errors: ['tools must be a list of tool names'] };
  const errors = [];
  const value = [];
  for (const name of input) {
    if (typeof name !== 'string' || !KNOWN_TOOLS.includes(name)) { errors.push(`"${String(name).slice(0, 40)}" is not a tool (tools: ${KNOWN_TOOLS.join(', ')})`); continue; }
    if (!value.includes(name)) value.push(name);
  }
  return { ok: errors.length === 0, value, errors };
}

/**
 * A company's grant can only be as wide as the operator's set.
 * @returns {{ effective: string[], clamped: string[] }}  clamped lists the tools that were asked for and are not allowed here
 */
export function resolveToolGrant(operatorTools, requested) {
  const effective = requested.filter(t => operatorTools.includes(t));
  const clamped = requested.filter(t => !operatorTools.includes(t));
  return { effective, clamped };
}

/**
 * Does `tier` fit inside `grant`?
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function tierFitsGrant(tier, grant) {
  const tools = toolsOfTier(tier);
  if (!tools) return { ok: false, missing: [] };
  const missing = tools.filter(t => !grant.includes(t));
  return { ok: missing.length === 0, missing };
}

/** The widest tier that fits a grant, so a UI can offer only what is allowed. */
export function tiersThatFit(grant) {
  return Object.keys(TOOL_TIERS).filter(tier => tierFitsGrant(tier, grant).ok);
}

/**
 * The tier an agent gets: the one asked for if it fits, else a refusal that says which tools to grant first.
 * @throws {PolicyError}
 */
export function checkAgentTier(requested, grant) {
  const tier = requested ?? DEFAULT_AGENT_TIER;
  if (!toolsOfTier(tier)) throw new PolicyError(`"${String(tier).slice(0, 40)}" is not a tool tier.`, { status: 400, code: 'bad_tier', field: 'tools' });
  const fit = tierFitsGrant(tier, grant);
  if (!fit.ok) {
    throw new PolicyError(
      `The tier "${tier}" needs ${fit.missing.join(', ')}, which this company has not been granted. Grant those tools to the company first, or use a narrower tier.`,
      { status: 403, code: 'tier_not_granted', field: 'tools' },
    );
  }
  return tier;
}
