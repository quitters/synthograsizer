/**
 * What one company room holds: its policy, as the orchestrator uses it.
 * ──────────────────────────────────────────────────────────────────────
 * A RoomPolicy is not a copy of settings. It looks the company up again each time it is asked, so the owner pausing the
 * company, editing the mission or lowering a ceiling takes effect in a room that is already running, and an operator that
 * tightens its policy tightens every company with it (store.js, effectivePolicy).
 *
 * The orchestrator calls it at the places where something is admitted, started, said or done:
 *   addAgent / updateAgent / restore   checkNewAgent, checkAgentFields, checkRestore   (caps, names, secrets, tool tiers)
 *   start / resume                     canRun, startLimits                              (paused companies do not run)
 *   a turn                             screenTurn                                       (the independent screen, drafting stage)
 *   a tool call                        toolNamesFor, screenToolCall                     (least privilege, then the screen)
 *   a prompt                           layerFor                                         (the fixed layer, fenced sheets)
 */
import crypto from 'node:crypto';
import { buildLayer, fenceNonce } from './layer.js';
import { effectivePolicy } from './store.js';
import { checkAgentTier, toolsOfTier } from './toolGrants.js';
import { PolicyError } from './errors.js';
import { assertNoSecrets } from './secrets.js';

export const BIO_MAX_CHARS = 12_000;
export const GOAL_MAX_CHARS = 4_000;
export const MESSAGE_MAX_CHARS = 20_000;

// Letters (any script), digits, space and a few marks real names use. No brackets, colons, quotes that open lines, or newlines:
// a name is printed into `[Name]: ...` lines and prompt headings, so it must not be able to look like structure.
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’-]{0,59}$/u;
const stripControls = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

export class RoomPolicy {
  /**
   * @param {{
   *   store: import('./store.js').CompanyStore, companyId: string, departmentId: string, roomId: string, operator: object,
   *   screen: import('./screen.js').Screen|null, audit: import('./audit.js').AuditLog|null, publish?: object|null,
   *   extraHardLimits?: object[], extraScreenRules?: object[],
   * }} options  extraHardLimits and extraScreenRules exist for the red-team harness only; nothing reachable from a request sets them
   */
  constructor({ store, companyId, departmentId, roomId, operator, screen, audit, publish = null, extraHardLimits = [], extraScreenRules = [], extraPreamble = '' }) {
    this.extraPreamble = extraPreamble;
    this.store = store;
    this.companyId = companyId;
    this.departmentId = departmentId;
    this.roomId = roomId;
    this.operator = operator;
    this.screen = screen;
    this.audit = audit;
    this.publish = publish;
    this.extraHardLimits = extraHardLimits;
    this.extraScreenRules = extraScreenRules;
    this.secret = crypto.randomBytes(16).toString('hex');
    this._eff = null;
    this._effStamp = null;
    this._layer = null;
    this._layerKey = null;
  }

  // ── what applies right now ─────────────────────────────────────────────────

  get company() { return this.store.get(this.companyId); }

  get effective() {
    const company = this.company;
    if (!company) throw new PolicyError('This company no longer exists.', { status: 404, code: 'company_gone' });
    if (this._effStamp !== company.updatedAt || !this._eff) {
      this._eff = effectivePolicy(company, this.operator);
      this._effStamp = company.updatedAt;
    }
    return this._eff;
  }

  get ceilings() { return this.effective.ceilings; }
  get mandate() { return this.effective.mandate; }
  get toolGrant() { return this.effective.tools; }
  get screensDrafts() { return Boolean(this.screen) && this.operator.screen.drafts !== false; }

  get departmentName() { return this.company?.departments.find(d => d.id === this.departmentId)?.name || ''; }

  /** Nothing runs, spends or publishes until the owner says go. */
  canRun() {
    const company = this.company;
    if (!company) return { ok: false, code: 'company_gone', message: 'This company no longer exists.' };
    if (company.state !== 'active') return { ok: false, code: 'company_paused', message: 'This company is paused. Nothing runs, spends or publishes until its owner says go.' };
    return { ok: true };
  }

  // ── the prompt ─────────────────────────────────────────────────────────────

  /** The fixed layer for an agent's system prompt (head and tail are identical for every agent in the room; the nonce is the agent's). */
  layerFor(agent) {
    const { mission, mandate, houseRules } = this.effective;
    const key = JSON.stringify([mission, mandate, houseRules]);
    if (key !== this._layerKey) {
      this._layer = buildLayer({ mission, mandate, houseRules, canPropose: true, extraHardLimits: this.extraHardLimits, extraPreamble: this.extraPreamble });
      this._layerKey = key;
    }
    return { head: this._layer.head, tail: this._layer.tail, nonce: fenceNonce(this.secret, agent.id) };
  }

  // ── admission ──────────────────────────────────────────────────────────────

  cleanName(name, field = 'name') {
    const clean = stripControls(name ?? '').replace(/\s+/g, ' ').trim();
    if (!NAME_RE.test(clean)) {
      throw new PolicyError('An agent\'s name must be 1 to 60 letters, digits, spaces or . , \' - (no brackets, colons or line breaks).', { status: 400, code: 'bad_name', field });
    }
    return clean;
  }

  cleanBio(bio) {
    if (typeof bio !== 'string' || !bio.trim()) throw new PolicyError('An agent needs a character sheet (bio).', { status: 400, code: 'bad_bio', field: 'bio' });
    const clean = stripControls(bio);
    if (clean.length > BIO_MAX_CHARS) throw new PolicyError(`A character sheet can be at most ${BIO_MAX_CHARS} characters (this one is ${clean.length}).`, { status: 400, code: 'bad_bio', field: 'bio' });
    assertNoSecrets(clean, 'The character sheet', 'bio');
    return clean;
  }

  /** Validate a new agent for this room. Returns the cleaned fields (tier defaults to the narrowest). */
  checkNewAgent({ name, bio, tools }, currentCount) {
    const { ceilings, tools: grant } = this.effective;
    if (currentCount >= ceilings.maxAgents) {
      throw new PolicyError(`This room is full: a company room holds at most ${ceilings.maxAgents} agents.`, { status: 403, code: 'agent_cap', field: 'agents' });
    }
    const spec = { name: this.cleanName(name), bio: this.cleanBio(bio), tools: checkAgentTier(tools, grant) };
    this.record('agent_added', { agent: spec.name, tier: spec.tools });
    return spec;
  }

  /** Validate changes to an existing agent. Returns only the fields that were given, cleaned. */
  checkAgentFields(fields, agent) {
    const out = {};
    if (typeof fields.name === 'string') out.name = this.cleanName(fields.name);
    if (typeof fields.bio === 'string') out.bio = this.cleanBio(fields.bio);
    if (fields.tools !== undefined && fields.tools !== null) {
      out.tools = checkAgentTier(fields.tools, this.effective.tools);
      if (out.tools !== agent.tools) this.record('agent_tier_changed', { agent: agent.name, from: agent.tools, to: out.tools });
    }
    return out;
  }

  /** A saved or imported session's agents must meet the same rules as agents added by hand. */
  checkRestore(agents) {
    const list = Array.isArray(agents) ? agents : [];
    const { ceilings, tools: grant } = this.effective;
    if (list.length > ceilings.maxAgents) {
      throw new PolicyError(`That session has ${list.length} agents; a company room holds at most ${ceilings.maxAgents}.`, { status: 403, code: 'agent_cap', field: 'agents' });
    }
    for (const a of list) {
      this.cleanName(a?.name);
      this.cleanBio(a?.bio);
      checkAgentTier(a?.tools, grant);
    }
  }

  /** A message from the host or the owner (the human): no secrets, a sane length. */
  checkHostText(text, label = 'The message') {
    if (typeof text !== 'string' || !text.trim()) throw new PolicyError(`${label} cannot be empty.`, { status: 400, code: 'bad_text' });
    if (text.length > MESSAGE_MAX_CHARS) throw new PolicyError(`${label} is too long (${text.length} characters; the limit is ${MESSAGE_MAX_CHARS}).`, { status: 400, code: 'bad_text' });
    assertNoSecrets(text, label, 'content');
    return text;
  }

  checkGoal(goal) {
    if (typeof goal !== 'string' || !goal.trim()) throw new PolicyError('A goal is required.', { status: 400, code: 'bad_text', field: 'goal' });
    if (goal.length > GOAL_MAX_CHARS) throw new PolicyError(`The goal is too long (${goal.length} characters; the limit is ${GOAL_MAX_CHARS}).`, { status: 400, code: 'bad_text', field: 'goal' });
    assertNoSecrets(goal, 'The goal', 'goal');
    return goal;
  }

  // ── limits ─────────────────────────────────────────────────────────────────

  startLimits({ tokenLimit }) {
    const cap = this.ceilings.tokenLimit;
    const asked = Number(tokenLimit);
    return { tokenLimit: Number.isFinite(asked) && asked > 0 ? Math.min(asked, cap) : cap };
  }

  /** A turn limit is always in force in a company room: no limit means the ceiling. */
  clampMaxTurns(n) {
    const cap = this.ceilings.maxTurns;
    const asked = Number(n);
    return Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), cap) : cap;
  }

  get spendLimitUsd() { return this.ceilings.spendLimitUsd; }
  get strikeLimit() { return this.ceilings.maxScreenStrikes; }

  // ── tools ──────────────────────────────────────────────────────────────────

  /** The tools an agent may actually have: its tier, narrowed to what the company has been granted. */
  toolNamesFor(agent) {
    const grant = this.effective.tools;
    return (toolsOfTier(agent?.tools) || []).filter(t => grant.includes(t));
  }

  // ── the screen ─────────────────────────────────────────────────────────────

  /** Review a turn before it is shown, saved or acted on. Resolves to a screen result ({ verdict, findings, ... }). */
  async screenTurn({ text, agentName }) {
    if (!this.screensDrafts) return { verdict: 'pass', stage: 'drafting', findings: [], skipped: true, ms: 0 };
    return this.screen.check({
      stage: 'drafting',
      mandate: this.mandate,
      parts: [{ type: 'text', text: String(text ?? ''), label: `a turn by ${agentName}` }],
      extraRules: this.extraScreenRules,
    });
  }

  /** Review the free text a tool is about to act on. Null when the tool carries none (or drafts are not screened). */
  async screenToolCall(name, args = {}) {
    if (!this.screensDrafts) return null;
    const a = args && typeof args === 'object' ? args : {};
    const text = {
      generate_image: a.prompt,
      compose_image: a.prompt,
      critique_image: a.criteria,
      deep_research: a.topic,
      write_artifact: a.content,
    }[name];
    if (typeof text !== 'string' || !text.trim()) return null;
    return this.screen.check({
      stage: 'drafting',
      mandate: this.mandate,
      parts: [{ type: 'text', text, label: `the ${name} request` }],
      extraRules: this.extraScreenRules,
    });
  }

  // ── publishing ─────────────────────────────────────────────────────────────

  /** An agent offers work for publication. Never publishes: a person decides. */
  async propose(args, sources, by) {
    if (!this.publish) throw new PolicyError('Publishing is not set up on this server.', { status: 501, code: 'no_publish' });
    return this.publish.propose(this.companyId, { ...args, roomId: this.roomId, by }, sources);
  }

  // ── records ────────────────────────────────────────────────────────────────

  record(type, data = {}) {
    try {
      this.audit?.append(this.companyId, { type, room: this.roomId, department: this.departmentName, ...data });
    } catch (err) {
      console.warn(`[company] could not write the audit log: ${err.message}`);
    }
  }

  summary() {
    const company = this.company;
    return {
      companyId: this.companyId,
      company: company?.name || null,
      department: this.departmentName,
      state: company?.state || 'gone',
      ceilings: this.ceilings,
      mandate: this.mandate,
      tools: this.toolGrant,
      screensDrafts: this.screensDrafts,
    };
  }
}
