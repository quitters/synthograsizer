/**
 * The creation flow: propose, cast, create.
 * ─────────────────────────────────────────
 * One prompt becomes a company, in three steps the owner can stop between, edit between, and take over at any point:
 *
 *   PROPOSE   a plan: the company, its rooms, its positions (planner.js). Costs a cent or two. Nothing exists yet but the proposal.
 *   CAST      a person for every position (casting.js, writer.js, quiz.js): from the roster when someone fits, written new when no one does. Runs in the
 *             background and can be cancelled; a restart loses nothing that was finished. This is where the money goes, so it has a ceiling the owner and
 *             the operator can lower, and an estimate before it starts.
 *   CREATE    the company, its rooms, its people hired into them, the Hall set up, a brief and its checks for every room. All or nothing. The company is
 *             PAUSED: nothing runs, spends or publishes until the owner says go.
 *
 * Whoever the owner names is theirs: a person chosen from the roster is pinned, a fact fixed on a position is laid over the draw, a field edited is never
 * written again by the model. If the owner stops after the first prompt, the company is still completed with sensible defaults, and left paused.
 *
 * Every step here is also an API call (routes/flow.js), so an agent can do what a person can with the same schemas.
 */
import { newId } from '../util.js';
import { PolicyError, isPolicyError } from '../errors.js';
import { resolveMandate } from '../mandate.js';
import { resolveCeilings } from '../ceilings.js';
import { resolveCollaboration, DEFAULT_COLLABORATION } from '../collaboration.js';
import { resolveToolGrant, tierFitsGrant, toolsOfTier, DEFAULT_COMPANY_GRANT } from '../toolGrants.js';
import { DEFAULT_README } from '../hall/hall.js';
import { Spend } from './model.js';
import { SIZES, SIZE_IDS, ORG_STYLES } from './orgs.js';
import { ARCHETYPES } from './archetypes.js';
import { LOCKABLE, castPositions } from './casting.js';
import { DELIVERABLES, doneWhenFor, handoffsFor } from './deliverables.js';
import { buildBrief } from './brief.js';
import { diversityReport, describeReport } from './diversity.js';
import { writePerson, BEHAVES } from './writer.js';
import { takeQuiz } from './quiz.js';
import { closeOutRoom } from './memory.js';
import { describeCriterion } from '../../services/doneWhen.js';
import { admitDepartment } from './admit.js';
import { admissionScreen } from './review.js';
import { renderBio } from '../profileBio.js';
import { checkLocks, proposeCompany, fillPlan, applyEdits, planProblems, positionsOf, effectiveTier, planText, screenWords, upstreamOf, downstreamOf, PROMPT_MAX_CHARS } from './planner.js';

/** What writing one person costs, in round numbers: the pilot's six people (sheet, review, screen, quiz, memory) came to $1.13. */
export const ESTIMATE_PER_PERSON_USD = 0.25;
export const MAX_PERSON_TRIES = 2;
export const CAST_CONCURRENCY = 3;
export const MAX_CONSECUTIVE_MODEL_FAILURES = 3;
export const DEFAULT_TOKEN_LIMIT = 150_000;

const OWNER = Object.freeze({ id: null, name: 'Owner', system: true });
const fail = (message, status, code, field) => new PolicyError(message, { status, code, ...(field ? { field } : {}) });
const round3 = (x) => Math.round(x * 1000) / 1000;
const LOOSE_LOCKS = new Set(['tier', 'model', 'thinking', 'skills']);       // facts a roster person can satisfy; any other fixed fact needs a person written to it

/** Run `fn` over `items`, at most `limit` at a time. */
async function pool(items, limit, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => { while (queue.length) await fn(queue.shift()); }));
}

/** Which setting of each knob a person has, as the roster keeps them: { tempo: 1 }. */
const knobsOf = (profile) => Object.fromEntries((profile?.variables || []).filter(v => Number.isInteger(v.valueIdx)).map(v => [v.name, v.valueIdx]));

export class FlowService {
  /**
   * @param {object} deps
   * @param {import('./flowStore.js').FlowStore} deps.store
   * @param {import('../store.js').CompanyStore} deps.companies
   * @param {object} deps.operator
   * @param {import('../audit.js').AuditLog} deps.audit
   * @param {import('../screen.js').Screen} deps.screen
   * @param {() => import('./roster.js').RosterStore} deps.getRoster  throws a 503 where there is no SQLite
   * @param {() => (import('../hall/hall.js').Hall|null)} deps.getHall
   * @param {(args: { spend: Spend, limitUsd: number }) => Function} deps.makeAsk  the model, with its cost counted and capped
   * @param {(roomId: string) => object} deps.getRoom  the live room for a department (sessionRegistry.getRoom)
   * @param {(companyId: string) => object[]} [deps.listProposals]
   * @param {() => Date} [deps.now]
   */
  constructor({ store, companies, operator, audit, screen, getRoster, getHall, makeAsk, getRoom, listProposals = () => [], now = () => new Date() }) {
    Object.assign(this, { store, companies, operator, audit, screen, getRoster, getHall, makeAsk, getRoom, listProposals, now });
    this.jobs = new Map();
    this._recover();
  }

  // ── small things ───────────────────────────────────────────────────────────

  _enabled() {
    if (!this.operator.flow.enabled) throw fail('The creation flow is switched off on this server.', 503, 'flow_disabled');
  }

  _limitUsd(flow) {
    const own = flow.settings?.budgetUsd;
    const cap = this.operator.flow.maxSpendUsd;
    return Number.isFinite(own) ? Math.min(own, cap) : cap;
  }

  _model(flow) {
    const spend = Spend.restore(flow.spend);
    return { spend, ask: this.makeAsk({ spend, limitUsd: this._limitUsd(flow) }) };
  }

  _mandate(plan) { return resolveMandate(this.operator.mandate, plan.company?.mandate || {}).effective; }

  _say(flow, text) { this.store.note(flow, text); this.store.save(flow); }

  /** A company half-built when the server stopped is taken apart: the flow says it failed, and nothing is left that the owner did not ask for. */
  _recover() {
    for (const flow of this.store.flows.values()) {
      if (flow.state !== 'failed' || !flow.created?.partial) continue;
      this._rollback(flow.ownerId, flow.created.companyId);
      flow.created = null;
      this.store.note(flow, 'A company that was half built when the server stopped was taken apart. Run create again.');
      this.store.save(flow);
    }
  }

  _rollback(ownerId, companyId) {
    if (!companyId) return;
    try { this.companies.remove(companyId, ownerId); } catch { /* it was never made, or is already gone */ }
    try { const hall = this.getHall(); hall?.removeCompany(ownerId, companyId); hall?.roster.removeCompany(ownerId, companyId); } catch { /* nothing to remove */ }
  }

  // ── what the flow offers ───────────────────────────────────────────────────

  options() {
    const f = this.operator.flow;
    return {
      enabled: f.enabled,
      limits: { maxPeople: f.maxPeople, maxSpendUsd: f.maxSpendUsd, maxPromptChars: PROMPT_MAX_CHARS },
      estimate: { perPersonUsd: ESTIMATE_PER_PERSON_USD, note: 'A rough price for writing one new person (the sheet, a review, the screen, the quiz). People already in the roster cost nothing.' },
      sizes: SIZE_IDS.map(id => ({ id, label: SIZES[id].label, people: SIZES[id].people, rooms: SIZES[id].departments.length, allowed: SIZES[id].people <= f.maxPeople })),
      styles: Object.entries(ORG_STYLES).map(([id, text]) => ({ id, text })),
      archetypes: ARCHETYPES.map(a => ({ id: a.id, name: a.name, roles: a.roles, tier: a.tier, dissent: a.dissent, lead: a.lead, reviewer: a.reviewer })),
      deliverables: Object.values(DELIVERABLES).map(d => ({ id: d.id, label: d.label, defaultFile: d.defaultFile })),
      lockablePersonFacts: [...LOCKABLE],
      levels: [
        'Level 0: send a prompt; the plan is proposed; cast it; create it. Everything you did not specify is filled in.',
        'Level 1: edit the proposal (PATCH /api/company/flow/:id); what you change is yours, and a re-fill never overwrites it.',
        'Level 2: fix every room and position in "locks" when you propose, and choose people from the roster with candidateId.',
      ],
      stopsAt: 'The company is created paused. Nothing runs, spends or publishes until you say go.',
    };
  }

  // ── reading ────────────────────────────────────────────────────────────────

  _filled(flow) {
    return positionsOf(flow.plan).filter(p => flow.cast.people[p.key]?.status === 'ready' && flow.cast.people[p.key].screened === true).length;
  }

  _next(flow) {
    switch (flow.state) {
      case 'proposed': return positionsOf(flow.plan).length === this._filled(flow) ? 'create' : 'cast';
      case 'cast': return 'create';
      case 'failed': return flow.failedAt === 'create' ? 'create' : 'cast';
      case 'created': return 'go';
      default: return flow.state === 'cancelled' ? null : 'wait';
    }
  }

  /** The flow as an API answer: never the owner's id. */
  describe(flow) {
    const total = positionsOf(flow.plan).length;
    const filled = this._filled(flow);
    const open = total - filled;
    const { retired, ...plan } = flow.plan;
    return {
      id: flow.id, state: flow.state, next: this._next(flow), createdAt: flow.createdAt, updatedAt: flow.updatedAt,
      prompt: flow.prompt, locks: flow.locks, plan,
      settings: { budgetUsd: flow.settings.budgetUsd, reuse: flow.settings.reuse, limitUsd: this._limitUsd(flow) },
      cast: { people: flow.cast.people, report: flow.cast.report, startedAt: flow.cast.startedAt, finishedAt: flow.cast.finishedAt },
      estimate: { people: total, ready: filled, open, upToUsd: round3(open * ESTIMATE_PER_PERSON_USD), note: 'Up to this much: people who fit are taken from the roster at no cost.' },
      spend: { ...flow.spend, limitUsd: this._limitUsd(flow) },
      problems: planProblems(flow.plan, { maxPeople: this.operator.flow.maxPeople, complete: true }),
      created: flow.created, error: flow.error || null, failedAt: flow.failedAt || null,
      progress: flow.progress.slice(-40),
    };
  }

  list(ownerId) {
    return this.store.list(ownerId).map(f => ({
      id: f.id, state: f.state, createdAt: f.createdAt, name: f.plan.company.name, prompt: f.prompt.slice(0, 140), people: positionsOf(f.plan).length,
      ready: this._filled(f), spentUsd: f.spend?.usd ?? 0, companyId: f.created?.companyId || null,
    }));
  }

  get(ownerId, id) { return this.describe(this.store.get(ownerId, id)); }

  // ── propose ────────────────────────────────────────────────────────────────

  /**
   * @param {string} ownerId
   * @param {{ prompt: string, locks?: object, size?: string, style?: string, budgetUsd?: number, reuse?: boolean }} body
   */
  async propose(ownerId, body = {}) {
    this._enabled();
    const { prompt, locks, size, style, budgetUsd, reuse } = body;
    if (budgetUsd !== undefined && (!Number.isFinite(budgetUsd) || budgetUsd < 0)) throw fail('budgetUsd must be a number of dollars, 0 or more.', 400, 'bad_request', 'budgetUsd');
    if (reuse !== undefined && typeof reuse !== 'boolean') throw fail('reuse is true or false.', 400, 'bad_request', 'reuse');
    const spend = new Spend();
    const limitUsd = Number.isFinite(budgetUsd) ? Math.min(budgetUsd, this.operator.flow.maxSpendUsd) : this.operator.flow.maxSpendUsd;
    const ask = this.makeAsk({ spend, limitUsd });
    const checked = checkLocks(locks);
    const plan = await proposeCompany({
      ask, prompt, locks: checked, size, style, screen: this.screen,
      mandate: resolveMandate(this.operator.mandate, checked.mandate || {}).effective, limits: { maxPeople: this.operator.flow.maxPeople },
    });
    const flow = this.store.create(ownerId, {
      prompt: prompt.trim(), locks: checked, plan,
      settings: { budgetUsd: Number.isFinite(budgetUsd) ? budgetUsd : null, reuse: reuse !== false },
      spend: spend.snapshot(), cast: { seed: newId().slice(0, 12), people: {}, castings: {}, report: null, startedAt: null, finishedAt: null },
      created: null, error: null, failedAt: null,
    });
    const people = positionsOf(plan).length;
    this._say(flow, `Proposed ${people} ${people === 1 ? 'person' : 'people'} in ${plan.departments.length} ${plan.departments.length === 1 ? 'room' : 'rooms'}.`);
    return this.describe(flow);
  }

  // ── Level 1: editing ───────────────────────────────────────────────────────

  _editable(flow) {
    if (!['proposed', 'cast', 'failed'].includes(flow.state)) {
      throw fail(flow.state === 'created' ? 'That company has been created; change it through the company itself.' : `This flow is ${flow.state}; it can be edited only while nothing is running and before the company is created.`, 409, 'flow_state');
    }
  }

  /** Apply an owner's edits to the proposal. The words are screened again, because they are now the owner's. */
  async edit(ownerId, id, patch) {
    const flow = this.store.get(ownerId, id);
    this._editable(flow);
    const { plan, changed, invalidated } = applyEdits(flow.plan, patch, { maxPeople: this.operator.flow.maxPeople });
    if (changed.length) await screenWords({ screen: this.screen, mandate: this._mandate(plan), text: planText(plan), what: 'the edited proposal' });
    // Wherever a position was changed, the person written for it is no longer for it. They stay in the roster, available for another seat.
    for (const key of invalidated) { delete flow.cast.people[key]; delete flow.cast.castings[key]; }
    flow.plan = plan;
    // the screen judges by the company's mandate: if the owner changed it, the people placed have to be read again under the new one
    if (changed.includes('company.mandate')) for (const e of Object.values(flow.cast.people)) if (e.status === 'ready') e.screened = false;
    if (flow.state === 'cast' && positionsOf(plan).length !== this._filled(flow)) flow.state = 'proposed';
    if (flow.state === 'failed' && flow.failedAt === 'create') flow.error = null;
    this._say(flow, `Edited: ${changed.length ? changed.slice(0, 6).join(', ') + (changed.length > 6 ? ` and ${changed.length - 6} more` : '') : 'nothing changed'}${invalidated.length ? `. ${invalidated.length} ${invalidated.length === 1 ? 'person needs' : 'people need'} to be cast again` : ''}.`);
    return this.describe(flow);
  }

  /** Ask the model to fill the blanks again. Only fields that are not the owner's change, and no position that already has a person has its title changed. */
  async replan(ownerId, id) {
    this._enabled();
    const flow = this.store.get(ownerId, id);
    this._editable(flow);
    const { ask, spend } = this._model(flow);
    const hold = positionsOf(flow.plan).filter(p => flow.cast.people[p.key]).map(p => `departments.${p.deptKey}.positions.${p.key}.title`);
    const before = Object.fromEntries(hold.map(path => [path, flow.plan.provenance[path]]));
    const guarded = structuredClone(flow.plan);
    for (const path of hold) guarded.provenance[path] = 'user';
    let filled;
    try {
      filled = await fillPlan({ ask, prompt: flow.prompt, plan: guarded });
    } finally {
      flow.spend = spend.snapshot();
    }
    for (const [path, was] of Object.entries(before)) { if (was === undefined) delete filled.provenance[path]; else filled.provenance[path] = was; }
    await screenWords({ screen: this.screen, mandate: this._mandate(filled), text: planText(filled), what: 'the proposal the model wrote' });
    flow.plan = filled;
    this._say(flow, 'The blanks were filled in again. What you fixed was left alone.');
    return this.describe(flow);
  }

  cancel(ownerId, id) {
    const flow = this.store.get(ownerId, id);
    if (flow.state === 'created') throw fail('That company has been created; delete the company if you want it gone.', 409, 'flow_state');
    if (flow.state === 'cancelled') return this.describe(flow);
    const job = this.jobs.get(flow.id);
    if (job) {
      job.cancel = true;
      this._say(flow, 'Cancel requested: it stops when the person being written is finished.');
      return this.describe(flow);
    }
    flow.state = 'cancelled';
    this._say(flow, 'Cancelled.');
    return this.describe(flow);
  }

  remove(ownerId, id) { return this.store.remove(ownerId, id); }

  // ── cast ───────────────────────────────────────────────────────────────────

  /** Start casting. Answers at once; the work goes on in the background (poll the flow). */
  cast(ownerId, id, options = {}) {
    this._enabled();
    const flow = this.store.get(ownerId, id);
    if (!['proposed', 'failed'].includes(flow.state)) {
      const why = { casting: 'is being cast now', cast: 'has been cast: create the company, or edit the proposal to change who is needed', creating: 'is being created', created: 'has already made its company', cancelled: 'was cancelled' }[flow.state];
      throw fail(`This flow ${why}.`, 409, 'flow_state');
    }
    for (const job of this.jobs.values()) if (job.ownerId === ownerId) throw fail('One of your flows is being cast already. Wait for it to finish, or cancel it.', 409, 'flow_busy');
    const problems = planProblems(flow.plan, { maxPeople: this.operator.flow.maxPeople });
    if (problems.length) throw fail(problems.join(' '), 400, 'bad_plan');
    this.getRoster();                                                    // a 503 now, not halfway through
    if (options.budgetUsd !== undefined && (!Number.isFinite(options.budgetUsd) || options.budgetUsd < 0)) throw fail('budgetUsd must be a number of dollars, 0 or more.', 400, 'bad_request', 'budgetUsd');
    if (options.reuse !== undefined) flow.settings.reuse = options.reuse !== false;
    if (options.budgetUsd !== undefined) flow.settings.budgetUsd = options.budgetUsd;       // the way on after a flow stopped at its allowance (never past the operator's)
    Object.assign(flow, { state: 'casting', error: null, failedAt: null });
    flow.cast.startedAt = this.now().toISOString();
    flow.cast.finishedAt = null;
    this._say(flow, 'Casting begins.');
    const job = { ownerId, cancel: false, promise: null };
    job.promise = this._runCast(ownerId, flow, job).finally(() => this.jobs.delete(flow.id));
    this.jobs.set(flow.id, job);
    return this.describe(flow);
  }

  /** Wait for a flow's background work to finish (tests, and a server shutting down). */
  async settled(id) { await this.jobs.get(id)?.promise; }

  async _runCast(ownerId, flow, job) {
    const { ask, spend } = this._model(flow);
    try {
      await this._castAll({ ownerId, flow, job, ask, spend });
    } catch (err) {
      flow.state = 'failed';
      flow.failedAt = 'cast';
      flow.error = isPolicyError(err) ? err.message : 'Casting stopped on an unexpected error. People already written are kept.';
      if (!isPolicyError(err)) console.error('[flow]', err);
      this.store.note(flow, `Stopped: ${flow.error}`);
    } finally {
      flow.spend = spend.snapshot();
      flow.cast.finishedAt = this.now().toISOString();
      this.store.save(flow);
    }
  }

  async _castAll(ctx) {
    const { ownerId, flow, job } = ctx;
    const roster = this.getRoster();
    const plan = flow.plan;
    const people = flow.cast.people;
    const positions = positionsOf(plan);
    const roomOf = (key) => plan.departments.find(d => d.key === positions.find(p => p.key === key).deptKey);
    Object.assign(ctx, {
      roster, year: this.now().getFullYear(), mandate: this._mandate(plan), company: { name: plan.company.name, purpose: plan.company.purpose },
      stop: () => job.cancel, consecutive: 0, rows: {}, profiles: [], byRoom: new Map(),
    });

    // 1. Who is in place already (an earlier run, or an earlier edit): still in the roster, still ready, and read by the screen under the mandate as it is now
    const inPlace = new Map();
    for (const p of positions) {
      const e = people[p.key];
      if (e?.status !== 'ready' || !e.candidateId) continue;
      let c = null;
      try { c = roster.getCandidate(ownerId, e.candidateId); } catch { /* the person has been deleted from the roster */ }
      if (c && c.status === 'ready') {
        const seen = e.screened === true ? { ok: true } : await this._screenSeat(ctx, c);
        if (seen.ok) { e.screened = true; inPlace.set(p.key, c); } else people[p.key] = { status: 'failed', source: e.source, title: p.title, name: c.name, candidateId: c.id, error: seen.why };
        continue;
      }
      delete people[p.key];
      delete flow.cast.castings[p.key];
    }
    const used = new Set([...inPlace.values()].map(c => c.id));

    // 2. People the owner chose from the roster
    for (const p of positions) {
      if (inPlace.has(p.key) || !p.candidateId) continue;
      let c = null;
      try { c = roster.getCandidate(ownerId, p.candidateId); } catch { /* not there */ }
      const problem = !c ? `The person chosen for ${p.title} is not in the roster (any more).` : c.status !== 'ready' ? `${c.name} is ${c.status}, not ready: read the sheet and mark them ready first.` : used.has(c.id) ? `${c.name} already fills another position.` : null;
      if (problem) { people[p.key] = { status: 'failed', source: 'pinned', title: p.title, error: problem }; continue; }
      const seen = await this._screenSeat(ctx, c);
      if (!seen.ok) { people[p.key] = { status: 'failed', source: 'pinned', title: p.title, name: c.name, candidateId: c.id, error: seen.why }; continue; }
      inPlace.set(p.key, c); used.add(c.id);
      people[p.key] = this._entry(c, p, 'pinned');
    }

    // 3. People the roster already has who fit (the plan: "fill each position with the best-fit candidate by querying the table")
    if (flow.settings.reuse) {
      for (const p of positions) {
        if (inPlace.has(p.key) || people[p.key]?.status === 'failed') continue;
        const fixed = Object.keys(p.locked || {});
        let hit = null;
        if (p.locked?.name) {
          const named = roster.listCandidates(ownerId, { status: 'ready', q: p.locked.name, limit: 20, full: true }).find(c => c.name.toLowerCase() === p.locked.name.toLowerCase());
          if (named && !used.has(named.id) && fixed.every(k => k === 'name' || LOOSE_LOCKS.has(k))) hit = named;
        } else if (fixed.every(k => LOOSE_LOCKS.has(k))) {
          const fits = roster.findFit(ownerId, { archetype: p.archetype, tier: effectiveTier(p), dissent: p.reviewer ? 'high' : undefined }, { excludeIds: [...used], limit: 5 });
          hit = fits.find(f => f.why.includes('archetype') && (!p.reviewer || f.candidate.dissent !== 'low'))?.candidate || null;
        }
        if (!hit) continue;
        const seen = await this._screenSeat(ctx, hit);
        if (!seen.ok) { used.add(hit.id); this._say(flow, `${hit.name} fits ${p.title}, but the company's screen would not admit them: someone new will be written.`); continue; }
        inPlace.set(p.key, hit); used.add(hit.id);
        people[p.key] = this._entry(hit, p, 'roster');
        this._say(flow, `${hit.name} was already in the roster and fits ${p.title}: taken from there.`);
      }
    }

    // What is placed counts toward the diversity of the whole, and the new people are told about them so they come out different
    for (const [key, c] of inPlace) {
      ctx.rows[key] = { ...c.casting, department: roomOf(key).name, measuredType: c.measuredType, intendedType: c.intendedType || c.casting?.intendedType };
      if (c.profile) { ctx.profiles.push(c.profile); (ctx.byRoom.get(roomOf(key).key) || ctx.byRoom.set(roomOf(key).key, []).get(roomOf(key).key)).push(c.profile); }
    }

    // 4. The rest are drawn and written
    const toWrite = positions.filter(p => !inPlace.has(p.key) && people[p.key]?.status !== 'failed');
    const needDraw = toWrite.filter(p => !flow.cast.castings[p.key]);
    if (needDraw.length) {
      const drawn = castPositions({ positions: needDraw, seed: flow.cast.seed, year: ctx.year, existing: Object.values(ctx.rows) });
      needDraw.forEach((p, i) => { flow.cast.castings[p.key] = drawn.rows[i]; });
      this._say(flow, `Drew ${needDraw.length} ${needDraw.length === 1 ? 'person' : 'people'} to be written: ${drawn.report.met} of ${drawn.report.total} diversity targets met (best of ${drawn.attempts} ${drawn.attempts === 1 ? 'draw' : 'draws'}).`);
    }
    ctx.avoid = roster.listCandidates(ownerId, { limit: 500, full: false }).map(c => c.name);
    const rooms = new Map();
    for (const p of toWrite) { if (!rooms.has(p.deptKey)) rooms.set(p.deptKey, []); rooms.get(p.deptKey).push(p); }
    let fatal = null;
    await pool([...rooms.values()], CAST_CONCURRENCY, async (room) => {
      for (const p of room) {
        if (ctx.stop() || fatal) return;
        try { await this._castPerson(ctx, p); } catch (err) { fatal ||= err; return; }
      }
    });
    flow.spend = ctx.spend.snapshot();
    if (fatal) throw fatal;

    // 5. How it came out
    const rows = positions.map(p => ctx.rows[p.key]).filter(Boolean);
    if (rows.length) {
      const report = diversityReport(rows, { year: ctx.year });
      flow.cast.report = { met: report.met, total: report.total, ok: report.ok, targets: report.targets, text: describeReport(report), spread: report.spread };
    }
    const unfilled = positions.filter(p => people[p.key]?.status !== 'ready');
    if (ctx.stop()) {
      flow.state = 'cancelled';
      this._say(flow, 'Cancelled. The people already written are in the roster.');
    } else if (!unfilled.length) {
      flow.state = 'cast';
      this._say(flow, `Everyone is in place (${positions.length} ${positions.length === 1 ? 'person' : 'people'}). Read the sheets, then create the company.`);
    } else {
      flow.state = 'proposed';
      this._say(flow, `${unfilled.length} of ${positions.length} positions still need a person: ${unfilled.map(p => `${p.title} (${people[p.key]?.error ? people[p.key].error.slice(0, 90) : 'not cast'})`).join('; ')}.`);
    }
  }

  _entry(candidate, position, source) {
    return {
      status: 'ready', source, candidateId: candidate.id, name: candidate.name, title: position.title, role: candidate.role, archetype: candidate.archetype,
      intendedType: candidate.intendedType, measuredType: candidate.measuredType, tier: candidate.tier,
      advice: candidate.checks?.review?.advice?.length ?? 0, drifted: Boolean(candidate.quiz?.drifted), screened: true,
    };
  }

  /** The company's own screen reads a person's sheet under THIS company's mandate before they take a seat in it, whoever wrote the sheet and whenever. */
  async _screenSeat(ctx, candidate) {
    const r = await admissionScreen({ screen: this.screen, mandate: ctx.mandate, bio: renderBio(candidate.profile) });
    if (r.ok) return { ok: true };
    const why = r.verdict === 'block' ? (r.findings.map(f => f.why).filter(Boolean).join('; ') || 'it crosses a rule this company works under') : 'the screen could not be reached just now';
    return { ok: false, why: `The company's safety screen would not admit ${candidate.name} (${why.slice(0, 200)}). Edit the sheet in the roster, or choose someone else.` };
  }

  /** Write one person: the draw, the sheet, the checks, the quiz, and into the roster. A sheet that does not pass is tried once more with a different draw. */
  async _castPerson(ctx, position) {
    const { ownerId, flow, ask, roster } = ctx;
    const say = (text) => { flow.spend = ctx.spend.snapshot(); this._say(flow, text); };         // (what has been spent shows as the job goes, not only when it ends)
    const people = flow.cast.people;
    const room = flow.plan.departments.find(d => d.key === position.deptKey);
    const entry = people[position.key] = { status: 'writing', source: 'new', title: position.title, archetype: position.archetype, tries: people[position.key]?.tries || 0 };
    let tries = 0;
    for (let attempt = 1; attempt <= MAX_PERSON_TRIES; attempt++) {
      if (ctx.stop()) { entry.status = 'pending'; return; }
      tries += 1;
      entry.tries += 1;
      let casting = flow.cast.castings[position.key];
      if (attempt > 1) {                                                // a different person, not the same facts again
        casting = castPositions({ positions: [position], seed: `${flow.cast.seed}:${position.key}:t${entry.tries}`, year: ctx.year, existing: Object.values(ctx.rows) }).rows[0];
        flow.cast.castings[position.key] = casting;
      }
      say(`Writing ${position.title} for ${room.name}${attempt > 1 ? ' (a second try, with a different draw)' : ''}.`);
      let out;
      try {
        out = await writePerson({
          ask, casting, id: `${position.key}-${flow.id.slice(0, 6)}-${entry.tries}`, company: ctx.company, department: { name: room.name, purpose: room.purpose },
          others: [...ctx.profiles], roomMates: [...(ctx.byRoom.get(position.deptKey) || [])], lessons: roster.lessonsFor(ownerId, casting.archetype), screen: this.screen, mandate: ctx.mandate, year: ctx.year, avoidNames: ctx.avoid,
        });
      } catch (err) {
        if (err.code === 'model_refused') {
          Object.assign(entry, { status: 'failed', error: 'The model service declined to write this person. That answer is final: change the position and cast again.' });
          ctx.consecutive = 0;
          say(`${position.title}: the model service declined. Not tried again.`);
          return;
        }
        if (err.code === 'model_failed') {
          Object.assign(entry, { status: 'failed', error: err.message });
          ctx.consecutive += 1;
          say(`${position.title}: ${err.message}`);
          if (ctx.consecutive >= MAX_CONSECUTIVE_MODEL_FAILURES) throw err;
          return;
        }
        throw err;                                                       // the spend limit, no model, a bug: everything stops
      }
      ctx.consecutive = 0;
      const quiz = out.status === 'ready' ? await this._quiz(ctx, out, casting) : null;
      const checks = { ...out.checks, ...(quiz ? { quizDrift: { intended: quiz.intended, measured: quiz.type, drift: quiz.drift, drifted: quiz.drifted } } : {}) };
      let candidate;
      try {
        candidate = roster.addCandidate(ownerId, {
          profile: out.profile, casting, archetype: casting.archetype, role: position.title, status: out.status, checks, quiz,
          skills: out.seed.skills, writtenBy: out.profile.x_flow?.writtenBy,
        });
      } catch (err) {
        if (err.code === 'name_taken') {                                 // somebody else wrote the same name a moment ago: choose again
          ctx.avoid.push(out.profile.name);
          entry.error = `The name "${out.profile.name}" was taken in the meantime.`;
          continue;
        }
        throw err;                                                       // the roster is full, or something is wrong: stop
      }
      this._learn(ctx, casting, out, quiz);
      ctx.avoid.push(out.profile.name);                                  // (a draft keeps its name in the roster too)
      if (out.status === 'ready') {                                      // only people who will be hired are teammates, counted and compared against
        ctx.profiles.push(out.profile);
        if (!ctx.byRoom.has(position.deptKey)) ctx.byRoom.set(position.deptKey, []);
        ctx.byRoom.get(position.deptKey).push(out.profile);
        ctx.rows[position.key] = { ...casting, department: room.name, measuredType: quiz?.type || null };
        Object.assign(entry, this._entry(candidate, position, 'new'), { tries: entry.tries, error: undefined });
        delete entry.error;
        say(`${candidate.name} is ready${entry.advice ? ` (${entry.advice} ${entry.advice === 1 ? 'note' : 'notes'} from the reviewer)` : ''}${entry.drifted ? ' (answered the quiz unlike the cast)' : ''}.`);
        return;
      }
      const why = [...(out.checks.problems || []), ...(out.checks.review?.hard || []), ...(out.checks.screen && !out.checks.screen.ok ? [`the safety screen: ${out.checks.screen.verdict}`] : [])].join('; ');
      Object.assign(entry, { status: 'draft', candidateId: candidate.id, name: candidate.name, error: why || 'the sheet did not pass its checks' });
      say(`${candidate.name} (${position.title}) did not pass: ${why.slice(0, 160)}.`);
      if (attempt < MAX_PERSON_TRIES) {                                  // the failed draft is not kept when another try follows
        try { roster.deleteCandidate(ownerId, candidate.id); entry.candidateId = null; } catch { /* kept as a draft */ }
      }
    }
    if (entry.status === 'writing') entry.status = 'failed';
  }

  async _quiz(ctx, out, casting) {
    try {
      return await takeQuiz({ ask: ctx.ask, bio: out.bio, personId: out.profile.id, model: casting.model, thinking: casting.thinking || 'low', intended: casting.intendedType });
    } catch {
      this._say(ctx.flow, `${out.profile.name}: the quiz could not be taken; it is left out.`);
      return null;                                                       // a quiz that fails is a gap in the record, not a reason to lose the person
    }
  }

  /** What a check found out about someone cast from this archetype is kept for the next time one is. */
  _learn(ctx, casting, out, quiz) {
    const add = (text, source) => { try { ctx.roster.addLesson(ctx.ownerId, casting.archetype, text, source); } catch { /* a lesson that does not fit is not worth a failure */ } };
    for (const a of (out.checks.review?.advice || []).filter(x => x.kind === 'stereotype').slice(0, 2)) add(`A reviewer found this in a sheet like yours: ${a.text}`, 'review');
    if (quiz?.drifted) {
      const missing = [...String(casting.intendedType)].map((l, i) => (l !== quiz.type[i] ? BEHAVES[l] : null)).filter(Boolean);
      add(`Written to answer as ${quiz.type} instead of the cast ${casting.intendedType}: show plainly, in what they do off the clock, that they ${missing.join('; and that they ')}.`, 'quiz');
    }
  }

  // ── create ─────────────────────────────────────────────────────────────────

  /**
   * Make the company from the plan and the people. All or nothing; the company is paused.
   * @returns {{ flow: object, company: object }}
   */
  create(ownerId, id) {
    this._enabled();
    const flow = this.store.get(ownerId, id);
    if (flow.state === 'created') throw fail('This flow has already made its company.', 409, 'already_created');
    if (!['proposed', 'cast', 'failed'].includes(flow.state)) throw fail(`This flow is ${flow.state}; wait for it to finish.`, 409, 'flow_state');
    const roster = this.getRoster();
    const plan = flow.plan;
    const problems = planProblems(plan, { maxPeople: this.operator.flow.maxPeople, complete: true });
    if (problems.length) throw fail(problems.join(' '), 400, 'bad_plan');

    // Every position has a person who is ready (now, not when they were cast)
    const positions = positionsOf(plan);
    const person = {};
    const missing = [];
    const unseen = [];
    for (const p of positions) {
      const e = flow.cast.people[p.key];
      let c = null;
      if (e?.status === 'ready' && e.candidateId) { try { c = roster.getCandidate(ownerId, e.candidateId); } catch { c = null; } }
      if (c && c.status === 'ready' && e.screened === true) person[p.key] = c;
      else if (c && c.status === 'ready') unseen.push(`${c.name} (${p.title})`);
      else missing.push(`${p.title} in ${p.department}`);
    }
    if (missing.length || unseen.length) {
      throw fail(`${missing.length ? `These positions have no person who is ready yet: ${missing.join('; ')}. ` : ''}${unseen.length ? `The company's screen has not read these people under its present mandate: ${unseen.join('; ')}. ` : ''}Cast the flow again (nobody already written is written twice), or choose someone for them.`, 409, 'flow_not_cast');
    }

    // What the company must be allowed, checked before anything is made
    const seatTier = (p) => p.locked?.tier ?? p.tier ?? person[p.key].tier ?? 'none';
    const owned = plan.provenance['company.tools'] === 'user';
    const requested = owned ? [...plan.company.tools] : [...new Set([...DEFAULT_COMPANY_GRANT, ...positions.flatMap(p => toolsOfTier(seatTier(p)) || [])])];
    const grant = resolveToolGrant(this.operator.tools, requested).effective;
    const unfit = positions.filter(p => !tierFitsGrant(seatTier(p), grant).ok);
    if (unfit.length) {
      throw fail(`${unfit.slice(0, 4).map(p => `${person[p.key].name} (${seatTier(p)})`).join(', ')}${unfit.length > 4 ? ` and ${unfit.length - 4} more` : ''} would hold tools that ${owned ? 'the tools you chose do not include' : 'this server does not allow'}. ${owned ? 'Add those tools, or give them a narrower tier.' : 'Give them a narrower tier.'}`, 409, 'tier_not_granted');
    }
    const ceilings = resolveCeilings(this.operator.ceilings, plan.company.ceilings || {}).effective;
    const biggest = Math.max(...plan.departments.map(d => d.positions.length));
    if (biggest > ceilings.maxAgents) throw fail(`A room here holds at most ${ceilings.maxAgents} agents and this plan has a room of ${biggest}. Make the room smaller${plan.provenance['company.ceilings'] === 'user' ? ', or raise the ceiling you set' : ''}.`, 409, 'agent_cap');
    // Rooms meet in the company's shared workspace: a room that starts from another's file cannot, where the workspace is closed
    const starters = plan.departments.filter(d => d.needs);
    if (starters.length && !(this.getHall() && this.operator.hall.enabled && resolveCollaboration(this.operator.hall, { ...DEFAULT_COLLABORATION, ...(plan.company.collaboration || {}) }).effective.workspace)) {
      throw fail(`${starters.map(d => d.name).join(' and ')} ${starters.length === 1 ? 'starts' : 'start'} from another room's file, and rooms meet in the company's shared workspace, which is closed here (the operator or the company has turned it off). Open the workspace, or have ${starters.length === 1 ? 'that room' : 'those rooms'} start alone.`, 409, 'needs_workspace');
    }

    flow.state = 'creating';
    flow.error = null;
    this._say(flow, 'Creating the company.');
    let company = null;
    try {
      company = this.companies.create(ownerId, {
        name: plan.company.name, mission: plan.company.mission, houseRules: plan.company.houseRules, collaboration: plan.company.collaboration,
        mandate: plan.company.mandate, ceilings: plan.company.ceilings, tools: requested, departments: plan.departments.map(d => d.name),
      });
      flow.created = { companyId: company.id, partial: true };
      this.store.save(flow);

      // The people, a room at a time: the lead first, so that everyone else can report to them
      const seat = {};
      plan.departments.forEach((d, i) => {
        const dept = company.departments[i];
        const lead = d.positions.find(p => p.lead);
        let leadEmployee = null;
        for (const p of [lead, ...d.positions.filter(x => x !== lead)]) {
          const c = person[p.key];
          const s = roster.hire(ownerId, {
            companyId: company.id, departmentId: dept.id, candidateId: c.id, position: p.title, reportsTo: p.lead ? null : leadEmployee, isLead: p.lead,
            reviewerOf: p.reviewer && !p.lead ? d.deliverable.file : null, tier: seatTier(p), model: c.model, thinking: c.thinking, knobs: knobsOf(c.profile),
          });
          if (p.lead) leadEmployee = s.employeeId;
          seat[p.key] = s;
          this.audit.append(company.id, { type: 'person_hired', agent: s.name, department: dept.name, position: s.position, via: 'flow' });
        }
      });

      // The briefs and the checks, written now that the names are known
      const stored = { flowId: flow.id, createdAt: this.now().toISOString(), departments: [] };
      plan.departments.forEach((d, i) => {
        const dept = company.departments[i];
        const team = d.positions.map(p => {
          const tools = toolsOfTier(seat[p.key].tier) || [];
          return { name: seat[p.key].name, title: seat[p.key].position, isLead: p.lead, isReviewer: Boolean(p.reviewer && !p.lead), canSave: tools.includes('write_artifact'), canSearch: tools.includes('google_search'), unique: person[p.key].profile?.x_flow?.unique || '' };
        });
        const reviewers = team.filter(t => t.isReviewer).map(t => t.name);
        // how this room meets the others: the file it starts from, and who starts from its own
        const up = upstreamOf(plan, d);
        const downs = downstreamOf(plan, d.key);
        const leadOf = (room) => seat[room.positions.find(p => p.lead).key].name;
        const link = up || downs.length ? { ...(up ? { needs: { room: up.name, file: up.deliverable.file, lead: leadOf(up) } } : {}), ...(downs.length ? { shares: downs.map(x => ({ room: x.name, lead: leadOf(x) })) } : {}) } : null;
        const criteria = doneWhenFor(d.deliverable, { reviewers, shares: downs.length > 0, needs: up ? { room: up.name, file: up.deliverable.file } : null });
        const brief = buildBrief({ company: { name: plan.company.name }, department: { name: d.name }, assignment: d.assignment, deliverable: d.deliverable, team, criteria, link });
        stored.departments.push({
          id: dept.id, key: d.key, name: d.name, deliverable: d.deliverable, goal: brief.goal, trimmed: brief.trimmed, lead: team.find(t => t.isLead).name, reviewers,
          needs: up ? { id: company.departments[plan.departments.indexOf(up)].id, name: up.name, file: up.deliverable.file } : null, sharesWith: downs.map(x => x.name),
          doneWhen: criteria, handoffs: handoffsFor(d.deliverable, { reviewers }), minTurns: Math.max(8, 2 * team.length), maxTurns: Math.min(60, 8 * team.length), tokenLimit: DEFAULT_TOKEN_LIMIT,
        });
      });
      this.companies.setPlan(company.id, ownerId, stored);

      // The Hall: its channels, a handbook, a welcome for each person, a task for each room (only where the company and the operator have it open)
      const hall = this.getHall();
      const effective = this.companies.describe(company).effective;
      if (hall && this.operator.hall.enabled && Object.values(effective.collaboration).some(Boolean)) {
        hall.seedCompany(ownerId, { id: company.id, name: company.name, departments: company.departments.map(d => ({ id: d.id, name: d.name })) }, { readme: readmeFor(company, plan, stored) });
        if (effective.collaboration.board) {
          plan.departments.forEach((d, i) => {
            const mine = d.positions.map(p => seat[p.key]);
            const lead = seat[d.positions.find(p => p.lead).key];
            const up = upstreamOf(plan, d);
            hall.board.create(ownerId, company.id, OWNER, {
              title: `${d.name}: make ${d.deliverable.file}`, description: `${d.assignment}${up ? `\n\nStarts from ${up.name}'s ${up.deliverable.file}, which that room shares in the workspace.` : ''}`.slice(0, 2000), lead: lead.employeeId, members: mine.filter(s => s !== lead).map(s => s.employeeId),
              departmentId: company.departments[i].id, deliverable: d.deliverable.file,
            });
          });
        }
      }

      this.audit.append(company.id, { type: 'company_created', name: company.name, departments: company.departments.length, via: 'flow', flow: flow.id });
      flow.state = 'created';
      flow.created = { companyId: company.id, at: this.now().toISOString(), departments: plan.departments.map((d, i) => ({ key: d.key, id: company.departments[i].id, roomId: company.departments[i].roomId, name: d.name })) };
      this._say(flow, `The company "${company.name}" was created, paused. Nothing runs until you say go.`);
      return { flow: this.describe(flow), company: this.companies.describe(this.companies.get(company.id)) };
    } catch (err) {
      this._rollback(ownerId, company?.id);
      flow.state = 'failed';
      flow.failedAt = 'create';
      flow.created = null;
      flow.error = isPolicyError(err) ? err.message : 'Creating the company failed on an unexpected error; nothing was kept.';
      if (!isPolicyError(err)) console.error('[flow]', err);
      this._say(flow, `Creating failed and was taken back: ${flow.error}`);
      throw err;
    }
  }

  // ── running a room of a created company ────────────────────────────────────

  _department(company, ref) {
    const key = String(ref ?? '').trim().toLowerCase();
    const hit = company.departments.find(d => d.id === key || d.roomId === ref || d.name.toLowerCase() === key);
    if (!hit) throw fail(`This company has no department "${String(ref).slice(0, 60)}". Departments: ${company.departments.map(d => d.name).join(', ') || 'none'}.`, 404, 'no_department', 'department');
    return hit;
  }

  /**
   * Give a room the brief, the checks and the way of closing that the flow wrote for it, and start it. The company must be running (go) and the room
   * is held to the company's policy exactly as a room started by hand is: the flow adds no power.
   */
  async startDepartment(ownerId, companyId, ref) {
    const company = this.companies.getOwned(companyId, ownerId);
    const dept = this._department(company, ref);
    const plan = company.plan?.departments.find(d => d.id === dept.id);
    if (!plan) throw fail('This room was not set up by the creation flow, so it has no brief; start it by hand (POST /api/chat/start with its X-Room-Id).', 409, 'no_plan');
    if (company.state !== 'active') throw fail('This company is paused. Nothing runs, spends or publishes until its owner says go (POST /api/company/:id/go).', 409, 'company_paused');
    const link = this._linkStatus(ownerId, company, plan);
    if (link && !link.ready) throw fail(`${link.name} has to finish first: its ${link.file} is not in the company's shared workspace yet, and this room starts from it. Start ${link.name}, or put the file in the workspace yourself (PUT /api/company/:id/hall/workspace/file).`, 409, 'needs_upstream');
    const room = this.getRoom(dept.roomId);
    const o = room.orchestrator;
    if (!o.policy) throw fail('This room is not under its company\'s policy, so it will not be started.', 500, 'no_policy');
    if (o.isRunning) throw fail('This room is running already.', 409, 'already_running');
    const roster = this.getRoster();
    admitDepartment({ roster, ownerId, companyId: company.id, departmentId: dept.id, orchestrator: o });
    if (o.agents.length < 2) throw fail(`Only ${o.agents.length} of this room's people could be seated (see the audit log for why). A conversation needs at least two.`, 409, 'room_short');
    o.updateConsensusSettings({ enabled: true, closeBy: 'lead', leadAgent: plan.lead, minTurns: plan.minTurns, maxTurns: plan.maxTurns });
    o.setHandoffs(plan.handoffs);
    o.setDoneWhen(plan.doneWhen);
    await o.start(plan.goal, plan.tokenLimit, { mode: 'group' });
    this.audit.append(company.id, { type: 'flow_room_started', department: dept.name, people: o.agents.length, checks: plan.doneWhen.length });
    return { started: true, department: { id: dept.id, name: dept.name, roomId: dept.roomId }, people: o.agents.map(a => a.name), lead: plan.lead, checks: plan.doneWhen.length, goalChars: plan.goal.length, state: o.getState() };
  }

  /** What a room will be told when it starts: the brief, the checks in words, who reviews, how it closes. For the owner to read before saying go. */
  briefFor(ownerId, companyId, ref) {
    const company = this.companies.getOwned(companyId, ownerId);
    const dept = this._department(company, ref);
    const plan = company.plan?.departments.find(d => d.id === dept.id);
    if (!plan) throw fail('This room was not set up by the creation flow, so it has no brief.', 404, 'no_plan');
    return {
      department: { id: dept.id, name: dept.name, roomId: dept.roomId }, makes: plan.deliverable, goal: plan.goal, goalChars: plan.goal.length, trimmed: plan.trimmed,
      lead: plan.lead, reviewers: plan.reviewers, minTurns: plan.minTurns, maxTurns: plan.maxTurns, tokenLimit: plan.tokenLimit,
      checks: plan.doneWhen.map(c => ({ ...c, label: describeCriterion(c) })), handoffs: plan.handoffs,
      needs: this._linkStatus(ownerId, company, plan), sharesWith: plan.sharesWith || [],
    };
  }

  /** Whether the file a room starts from is in the company's workspace yet (null for a room that starts alone). */
  _linkStatus(ownerId, company, plan) {
    if (!plan.needs) return null;
    let ready = false;
    try { ready = Boolean(this.getHall()?.workspace.list(ownerId, company.id).some(f => f.path === plan.needs.file)); } catch { ready = false; }
    return { name: plan.needs.name, file: plan.needs.file, ready };
  }

  /** After a session: each person who spoke writes down what they remember, checked against the record. Costs a few cents; never runs by itself. */
  async closeOutDepartment(ownerId, companyId, ref, { session = null } = {}) {
    this._enabled();
    const company = this.companies.getOwned(companyId, ownerId);
    const dept = this._department(company, ref);
    const room = this.getRoom(dept.roomId);
    if (room.orchestrator.isRunning) throw fail('This room is still running. Stop it, or wait for it to finish, and then close it out.', 409, 'still_running');
    if (!room.orchestrator.messages.length) throw fail('There is nothing to remember: this room has not spoken.', 409, 'nothing_said');
    const spend = new Spend();
    const ask = this.makeAsk({ spend, limitUsd: this.operator.flow.maxSpendUsd });
    const result = await closeOutRoom({ ask, roster: this.getRoster(), ownerId, company, department: dept, orchestrator: room.orchestrator, proposals: this.listProposals(company.id), session });
    this.audit.append(company.id, { type: 'memory_closed_out', department: dept.name, people: result.people.filter(p => p.entries.length).length, flagged: result.flagged.length, usd: round3(spend.usd) });
    return { ...result, spend: spend.snapshot() };
  }
}

/** The handbook: the Hall's default, then a page about this company's rooms. */
function readmeFor(company, plan, stored) {
  const rooms = plan.departments.map((d) => {
    const s = stored.departments.find(x => x.key === d.key);
    return `- **${d.name}**: ${d.purpose || 'a room'}. Makes ${d.deliverable.file}${s.needs ? `, starting from ${s.needs.name}'s ${s.needs.file} (shared in the workspace)` : ''}. ${s.lead} leads${s.reviewers.length ? `; ${s.reviewers.join(' and ')} review${s.reviewers.length === 1 ? 's' : ''} every saved version` : ''}.`;
  });
  return `${DEFAULT_README(company)}
## What we are for
${plan.company.purpose}

## The rooms
${rooms.join('\n')}
`;
}
