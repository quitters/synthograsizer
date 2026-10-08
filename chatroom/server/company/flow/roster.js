/**
 * The roster: the library of invented people, the seats they hold in companies, and what they remember there.
 * ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * One SQLite database (see migrations.js for the tables and the one rule that matters: no memory crosses a company). Every method takes the
 * owner first and every statement filters by it, so one visitor's roster, employees and memories cannot be reached from another's.
 *
 * The roster stores and finds; it decides nothing about what is allowed. Admission to a room goes through RoomPolicy.checkNewAgent as it
 * always did (the cap, the clean name and sheet, the tool tier the company was granted), so a row here cannot get a person past a ceiling.
 */
import { newId, isId } from '../util.js';
import { PolicyError } from '../errors.js';
import { assertNoSecrets } from '../secrets.js';
import { openDatabase, plain, transaction } from './sqlite.js';
import { MIGRATIONS } from './migrations.js';

export const MAX_CANDIDATES = 200;                 // the plan's default roster size
export const MAX_MEMORY_PER_EMPLOYEE = 100;
export const MEMORY_TEXT_MAX_CHARS = 1200;
export const MEMORY_KINDS = Object.freeze(['summary', 'lesson', 'relationship', 'note']);
export const MEMORY_VERIFIED = Object.freeze(['unchecked', 'confirmed', 'contradicted']);
export const CANDIDATE_STATUSES = Object.freeze(['draft', 'ready', 'retired']);
const PROFILE_MAX_CHARS = 60_000;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’-]{0,59}$/u;

const rid = () => newId().slice(0, 16);
const parse = (text, fallback) => { try { return text == null ? fallback : JSON.parse(text); } catch { return fallback; } };
const json = (value) => JSON.stringify(value ?? null);
const bad = (message, extra = {}) => new PolicyError(message, { status: 400, code: 'bad_request', ...extra });
const missing = (what) => new PolicyError(`No such ${what}.`, { status: 404, code: `no_${what}` });

function needOwner(ownerId) {
  if (!isId(ownerId)) throw new PolicyError('No visitor.', { status: 400, code: 'no_owner' });
}

export class RosterStore {
  /** @param {{ db: object, now?: () => Date, maxCandidates?: number }} options */
  constructor({ db, now = () => new Date(), maxCandidates = MAX_CANDIDATES }) {
    this.db = db;
    this.now = now;
    this.maxCandidates = maxCandidates;
  }

  /** Open a roster database (creating or migrating the file). */
  static open({ file, now, maxCandidates } = {}) {
    return new RosterStore({ db: openDatabase(file, MIGRATIONS), now, maxCandidates });
  }

  close() { this.db.close(); }

  _stamp() { return this.now().toISOString(); }

  // ── candidates ─────────────────────────────────────────────────────────────

  /**
   * Add a person to the library.
   * @param {string} ownerId
   * @param {{ profile: object, casting?: object, archetype: string, role: string, status?: string, checks?: object, quiz?: object, writtenBy?: string }} input
   *   the profile is the Agent Profile (v5); name, tier and the like are read from it and from `casting`
   */
  addCandidate(ownerId, input) {
    needOwner(ownerId);
    const { profile, casting = {}, archetype, role } = input || {};
    this._checkProfile(profile);
    if (typeof archetype !== 'string' || !archetype) throw bad('A candidate needs an archetype.', { field: 'archetype' });
    if (typeof role !== 'string' || !role.trim()) throw bad('A candidate needs a role.', { field: 'role' });
    const status = input.status ?? 'draft';
    if (!CANDIDATE_STATUSES.includes(status)) throw bad(`status must be one of ${CANDIDATE_STATUSES.join(', ')}.`, { field: 'status' });
    if (this.countCandidates(ownerId) >= this.maxCandidates) {
      throw new PolicyError(`The roster holds at most ${this.maxCandidates} candidates; retire or delete some first.`, { status: 403, code: 'roster_cap' });
    }
    const name = profile.name.trim();
    if (this._byName(ownerId, name)) throw new PolicyError(`There is already someone called "${name}" in the roster.`, { status: 409, code: 'name_taken', field: 'name' });

    const c = casting;
    const run = profile.x_run || input.run || {};
    const row = {
      id: rid(), owner_id: ownerId, name, archetype, role: role.trim().slice(0, 80),
      intended_type: c.intendedType || null, measured_type: input.quiz?.type || null,
      born_year: Number.isInteger(c.bornYear) ? c.bornYear : null,
      birth_city: c.birthplace?.city || null, birth_country: c.birthplace?.country || null, region: c.birthplace?.region || c.region || null,
      culture: c.culture || null, pronoun: c.pronoun || null,
      tier: input.tier || c.tier || run.tier || 'none', model: input.model || c.model || run.model || null, thinking: input.thinking || c.thinking || run.thinkingLevel || null,
      dissent: c.dissent || 'low', temperament: c.temperament || null, working_style: c.workingStyle || null,
      skills: json([...(input.skills || c.skills || [])].slice(0, 12).map(s => String(s).slice(0, 60))),
      status, profile: json(profile), casting: json(c), checks: input.checks ? json(input.checks) : null, quiz: input.quiz ? json(input.quiz) : null,
      written_by: input.writtenBy || null, created_at: this._stamp(), updated_at: this._stamp(),
    };
    this.db.prepare(`INSERT INTO candidates (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row));
    return this.getCandidate(ownerId, row.id);
  }

  _checkProfile(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw bad('A candidate needs a profile (an Agent Profile object).', { field: 'profile' });
    if (typeof profile.name !== 'string' || !NAME_RE.test(profile.name.trim())) {
      throw bad('A name must be 1 to 60 letters, digits, spaces or . , \' - (no brackets, colons or line breaks).', { field: 'name' });
    }
    if (typeof profile.bioTemplate !== 'string' || !profile.bioTemplate.trim()) throw bad('The profile needs a bioTemplate.', { field: 'profile' });
    const text = JSON.stringify(profile);
    if (text.length > PROFILE_MAX_CHARS) throw bad(`The profile is ${text.length} characters; the limit is ${PROFILE_MAX_CHARS}.`, { field: 'profile' });
    assertNoSecrets(text, 'The profile', 'profile');
  }

  _byName(ownerId, name) {
    return plain(this.db.prepare('SELECT id FROM candidates WHERE owner_id = ? AND name = ? COLLATE NOCASE').get(ownerId, name));
  }

  _row(ownerId, id) {
    needOwner(ownerId);
    const row = this.db.prepare('SELECT * FROM candidates WHERE id = ? AND owner_id = ?').get(String(id), ownerId);
    if (!row) throw missing('candidate');
    return plain(row);
  }

  _shape(row, { full = true } = {}) {
    const out = {
      id: row.id, name: row.name, role: row.role, archetype: row.archetype, status: row.status,
      intendedType: row.intended_type, measuredType: row.measured_type, bornYear: row.born_year,
      birth: { city: row.birth_city, country: row.birth_country }, region: row.region, culture: row.culture, pronoun: row.pronoun,
      tier: row.tier, model: row.model, thinking: row.thinking, dissent: row.dissent, temperament: row.temperament, workingStyle: row.working_style,
      skills: parse(row.skills, []), writtenBy: row.written_by, createdAt: row.created_at, updatedAt: row.updated_at,
      employed: row.employed ?? undefined,
    };
    if (full) Object.assign(out, { profile: parse(row.profile, null), casting: parse(row.casting, {}), checks: parse(row.checks, null), quiz: parse(row.quiz, null) });
    return out;
  }

  getCandidate(ownerId, id, { full = true } = {}) {
    const row = this._row(ownerId, id);
    row.employed = this.db.prepare('SELECT COUNT(*) AS n FROM employees WHERE candidate_id = ? AND left_at IS NULL').get(row.id).n;
    return this._shape(row, { full });
  }

  countCandidates(ownerId) {
    needOwner(ownerId);
    return this.db.prepare("SELECT COUNT(*) AS n FROM candidates WHERE owner_id = ? AND status != 'retired'").get(ownerId).n;
  }

  /**
   * The candidates, newest first (by when they were added). `q` matches name, role, culture, skills, birthplace or archetype. `employed` is how many companies the person works in now.
   * @param {string} ownerId
   * @param {{ status?: string, archetype?: string, region?: string, tier?: string, q?: string, limit?: number, offset?: number, full?: boolean }} [filter]
   */
  listCandidates(ownerId, { status, archetype, region, tier, q, limit = 50, offset = 0, full = false } = {}) {
    needOwner(ownerId);
    const where = ['c.owner_id = ?'];
    const args = [ownerId];
    if (status) { where.push('c.status = ?'); args.push(status); }
    if (archetype) { where.push('c.archetype = ?'); args.push(archetype); }
    if (region) { where.push('c.region = ?'); args.push(region); }
    if (tier) { where.push('c.tier = ?'); args.push(tier); }
    if (q) {
      const like = `%${String(q).replace(/[%_\\]/g, m => `\\${m}`)}%`;
      const fields = ['c.name', 'c.role', 'c.culture', 'c.skills', 'c.birth_city', 'c.birth_country', 'c.archetype'];
      where.push(`(${fields.map(f => `${f} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      args.push(...fields.map(() => like));
    }
    const rows = this.db.prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM employees e WHERE e.candidate_id = c.id AND e.left_at IS NULL) AS employed
       FROM candidates c WHERE ${where.join(' AND ')} ORDER BY c.rowid DESC LIMIT ? OFFSET ?`,
    ).all(...args, Math.max(1, Math.min(Number(limit) || 50, 500)), Math.max(0, Number(offset) || 0));
    return rows.map(r => this._shape(plain(r), { full }));
  }

  /**
   * Change a candidate. A new profile replaces the old (it is checked again); the other fields are set as given.
   * @param {{ profile?: object, status?: string, quiz?: object, checks?: object, tier?: string, model?: string, thinking?: string, role?: string, skills?: string[], measuredType?: string }} patch
   */
  updateCandidate(ownerId, id, patch = {}) {
    const row = this._row(ownerId, id);
    const set = {};
    if (patch.profile !== undefined) {
      this._checkProfile(patch.profile);
      const name = patch.profile.name.trim();
      const clash = this._byName(ownerId, name);
      if (clash && clash.id !== row.id) throw new PolicyError(`There is already someone called "${name}" in the roster.`, { status: 409, code: 'name_taken', field: 'name' });
      set.profile = json(patch.profile);
      set.name = name;
    }
    if (patch.status !== undefined) {
      if (!CANDIDATE_STATUSES.includes(patch.status)) throw bad(`status must be one of ${CANDIDATE_STATUSES.join(', ')}.`, { field: 'status' });
      set.status = patch.status;
    }
    if (patch.quiz !== undefined) { set.quiz = patch.quiz ? json(patch.quiz) : null; set.measured_type = patch.quiz?.type || null; }
    if (patch.checks !== undefined) set.checks = patch.checks ? json(patch.checks) : null;
    for (const [key, col] of [['tier', 'tier'], ['model', 'model'], ['thinking', 'thinking'], ['role', 'role']]) if (typeof patch[key] === 'string') set[col] = patch[key].slice(0, 80);
    if (Array.isArray(patch.skills)) set.skills = json(patch.skills.slice(0, 12).map(s => String(s).slice(0, 60)));
    if (!Object.keys(set).length) return this.getCandidate(ownerId, id);
    set.updated_at = this._stamp();
    this.db.prepare(`UPDATE candidates SET ${Object.keys(set).map(k => `${k} = ?`).join(', ')} WHERE id = ? AND owner_id = ?`).run(...Object.values(set), row.id, ownerId);
    return this.getCandidate(ownerId, id);
  }

  retireCandidate(ownerId, id) { return this.updateCandidate(ownerId, id, { status: 'retired' }); }

  /** Delete a person from the library. Someone who works in a company must leave it first. */
  deleteCandidate(ownerId, id) {
    const row = this._row(ownerId, id);
    const employed = this.db.prepare('SELECT COUNT(*) AS n FROM employees WHERE candidate_id = ?').get(row.id).n;
    if (employed) throw new PolicyError('That person has a seat in a company (or left one with memories kept). Remove them from the company first.', { status: 409, code: 'candidate_employed' });
    this.db.prepare('DELETE FROM candidates WHERE id = ? AND owner_id = ?').run(row.id, ownerId);
    return { deleted: true };
  }

  /**
   * The best-fit candidates for a position, by querying the table: ready people only, ranked by how well they match what the seat needs.
   * @param {{ archetype?: string, tier?: string, dissent?: string, region?: string, types?: string[], skills?: string[] }} need
   * @returns {{ candidate: object, score: number, why: string[] }[]} best first (ties broken by who has worked least)
   */
  findFit(ownerId, need = {}, { excludeIds = [], limit = 10, includeEmployed = true } = {}) {
    needOwner(ownerId);
    const rows = this.db.prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM employees e WHERE e.candidate_id = c.id AND e.left_at IS NULL) AS employed,
              (SELECT COALESCE(SUM(sessions), 0) FROM employees e WHERE e.candidate_id = c.id) AS worked
       FROM candidates c WHERE c.owner_id = ? AND c.status = 'ready'`,
    ).all(ownerId).map(plain);
    const skip = new Set(excludeIds);
    const wantedSkills = (need.skills || []).map(s => s.toLowerCase());
    const scored = [];
    for (const r of rows) {
      if (skip.has(r.id) || (!includeEmployed && r.employed)) continue;
      const why = [];
      let score = 0;
      if (need.archetype && r.archetype === need.archetype) { score += 10; why.push('archetype'); }
      if (need.dissent && r.dissent === need.dissent) { score += 3; why.push('dissent'); }
      if (need.tier && r.tier === need.tier) { score += 2; why.push('tier'); }
      if (need.region && r.region === need.region) { score += 1; why.push('region'); }
      if (need.types?.length && (need.types.includes(r.measured_type) || need.types.includes(r.intended_type))) { score += 1; why.push('type'); }
      const have = parse(r.skills, []).map(s => String(s).toLowerCase());
      const overlap = wantedSkills.filter(s => have.some(h => h.includes(s) || s.includes(h))).length;
      if (overlap) { score += overlap; why.push(`${overlap} skill${overlap === 1 ? '' : 's'}`); }
      if (!r.employed) { score += 1; why.push('free'); }
      scored.push({ candidate: this._shape(r, { full: true }), score, why, worked: r.worked });
    }
    scored.sort((a, b) => b.score - a.score || a.worked - b.worked || a.candidate.name.localeCompare(b.candidate.name));
    return scored.slice(0, limit).map(({ candidate, score, why }) => ({ candidate, score, why }));
  }

  /** How a set of people (default: every ready candidate) spreads over each attribute: the diversity report's raw counts. */
  spread(ownerId, ids = null) {
    needOwner(ownerId);
    const all = this.listCandidates(ownerId, { status: 'ready', limit: 500, full: false });
    const people = ids ? all.filter(p => ids.includes(p.id)) : all;
    const tally = (f) => { const t = {}; for (const p of people) { const k = f(p) || 'unknown'; t[k] = (t[k] || 0) + 1; } return t; };
    const year = this.now().getFullYear();
    return {
      people: people.length,
      regions: tally(p => p.region), countries: tally(p => p.birth.country), cultures: tally(p => p.culture),
      pronouns: tally(p => p.pronoun), archetypes: tally(p => p.archetype), tiers: tally(p => p.tier), dissent: tally(p => p.dissent),
      intendedTypes: tally(p => p.intendedType), measuredTypes: tally(p => p.measuredType),
      ageBands: tally(p => (p.bornYear ? `${Math.floor((year - p.bornYear) / 10) * 10}s` : null)),
      ages: people.filter(p => p.bornYear).map(p => year - p.bornYear),
    };
  }

  // ── employees and their seats ─────────────────────────────────────────────

  /**
   * Hire a candidate into a company. That makes an EMPLOYEE (the person at work there: one mailbox, one memory, a standing title) and a first
   * SEAT (an assignment: the person's place in one department's room). A person can take more seats later (assign), for a task team.
   * @param {string} ownerId
   * @param {{ companyId: string, departmentId: string, candidateId: string, position: string, reportsTo?: string|null, isLead?: boolean, reviewerOf?: string|null, tier?: string, model?: string, thinking?: string, knobs?: object }} input
   * @returns {object} the seat (see _seatShape): employeeId and assignmentId both
   */
  hire(ownerId, input) {
    needOwner(ownerId);
    const { companyId, departmentId, candidateId, position } = input || {};
    if (!isId(companyId)) throw bad('A hire needs the company id.', { field: 'companyId' });
    if (typeof departmentId !== 'string' || !/^[a-f0-9]{8}$/.test(departmentId)) throw bad('A hire needs the department id.', { field: 'departmentId' });
    if (typeof position !== 'string' || !position.trim()) throw bad('A hire needs a position.', { field: 'position' });
    const cand = this._row(ownerId, candidateId);
    if (cand.status !== 'ready') throw new PolicyError(`${cand.name} is ${cand.status}, not ready to hire. Approve the sheet first.`, { status: 409, code: 'candidate_not_ready' });
    const emp = {
      id: rid(), owner_id: ownerId, company_id: companyId, candidate_id: cand.id, title: position.trim().slice(0, 80),
      knobs: json(input.knobs || {}), sessions: 0, hired_at: this._stamp(), left_at: null,
    };
    let seatId;
    transaction(this.db, () => {
      try {
        this.db.prepare(`INSERT INTO employees (${Object.keys(emp).join(', ')}) VALUES (${Object.keys(emp).map(() => '?').join(', ')})`).run(...Object.values(emp));
      } catch (err) {
        if (/UNIQUE/.test(String(err.message))) throw new PolicyError(`${cand.name} already works at this company.`, { status: 409, code: 'already_hired' });
        throw err;
      }
      seatId = this._insertSeat(ownerId, emp.id, companyId, { ...input, tier: input.tier || cand.tier, model: input.model ?? cand.model, thinking: input.thinking ?? cand.thinking });
    });
    return this.getSeat(ownerId, seatId);
  }

  _insertSeat(ownerId, employeeId, companyId, input) {
    const row = {
      id: rid(), owner_id: ownerId, company_id: companyId, employee_id: employeeId, department_id: input.departmentId, position: String(input.position).trim().slice(0, 80),
      reports_to: input.reportsTo || null, is_lead: input.isLead ? 1 : 0, reviewer_of: input.reviewerOf || null,
      tier: input.tier || 'none', model: input.model ?? null, thinking: input.thinking ?? null, task_id: input.taskId || null, created_at: this._stamp(), ended_at: null,
    };
    try {
      this.db.prepare(`INSERT INTO assignments (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row));
    } catch (err) {
      if (/UNIQUE/.test(String(err.message))) throw new PolicyError('That person already has a seat in that department.', { status: 409, code: 'already_seated' });
      throw err;
    }
    return row.id;
  }

  /** Give an employee another seat (a task team's room, or a second department). */
  assign(ownerId, employeeId, input) {
    const e = this._employeeRow(ownerId, employeeId);
    if (e.left_at) throw new PolicyError(`${e.name} has left this company.`, { status: 409, code: 'employee_left' });
    if (typeof input?.departmentId !== 'string' || !/^[a-f0-9]{8}$/.test(input.departmentId)) throw bad('A seat needs the department id.', { field: 'departmentId' });
    if (typeof input?.position !== 'string' || !input.position.trim()) throw bad('A seat needs a position.', { field: 'position' });
    // A second seat runs the way the first does (tier, model, thinking) unless it says otherwise
    const home = this._seats(ownerId, { employeeId: e.id })[0];
    const seat = this._insertSeat(ownerId, e.id, e.company_id, { tier: home?.tier ?? e.tier, model: home?.model ?? null, thinking: home?.thinking ?? null, ...input });
    return this.getSeat(ownerId, seat);
  }

  /** End a seat. The person stays an employee, with their mailbox and memory, and any other seat they hold. */
  unassign(ownerId, assignmentId) {
    needOwner(ownerId);
    const row = this.db.prepare('SELECT id, ended_at FROM assignments WHERE id = ? AND owner_id = ?').get(String(assignmentId), ownerId);
    if (!row) throw missing('seat');
    if (!row.ended_at) this.db.prepare('UPDATE assignments SET ended_at = ? WHERE id = ?').run(this._stamp(), row.id);
    return this.getSeat(ownerId, row.id);
  }

  _employeeRow(ownerId, id) {
    needOwner(ownerId);
    const row = this.db.prepare(
      `SELECT e.*, c.name AS name, c.role AS role, c.archetype AS archetype, c.tier AS tier, c.profile AS profile
       FROM employees e JOIN candidates c ON c.id = e.candidate_id WHERE e.id = ? AND e.owner_id = ?`,
    ).get(String(id), ownerId);
    if (!row) throw missing('employee');
    return plain(row);
  }

  _employeeShape(row, { profile = false } = {}) {
    return {
      id: row.id, companyId: row.company_id, candidateId: row.candidate_id, name: row.name, role: row.role, archetype: row.archetype, title: row.title,
      knobs: parse(row.knobs, {}), sessions: row.sessions, hiredAt: row.hired_at, leftAt: row.left_at,
      ...(profile ? { profile: parse(row.profile, null) } : {}),
    };
  }

  /** One person at a company, with the seats they hold now. */
  getEmployee(ownerId, id, opts = {}) {
    const e = this._employeeShape(this._employeeRow(ownerId, id), opts);
    return { ...e, seats: this._seats(ownerId, { employeeId: e.id, includeEnded: Boolean(e.leftAt) }) };
  }

  /** The people who work at a company, one row each, in the order they were hired. */
  employeesOf(ownerId, companyId, { includeLeft = false, profile = false } = {}) {
    needOwner(ownerId);
    return this.db.prepare(
      `SELECT e.*, c.name AS name, c.role AS role, c.archetype AS archetype, c.tier AS tier, c.profile AS profile
       FROM employees e JOIN candidates c ON c.id = e.candidate_id
       WHERE e.owner_id = ? AND e.company_id = ? ${includeLeft ? '' : 'AND e.left_at IS NULL'} ORDER BY e.rowid`,
    ).all(ownerId, companyId).map(r => this._employeeShape(plain(r), { profile }));
  }

  _seats(ownerId, { companyId, departmentId, employeeId, assignmentId, includeEnded = false, profile = false } = {}) {
    const where = ['a.owner_id = ?'];
    const args = [ownerId];
    if (companyId) { where.push('a.company_id = ?'); args.push(companyId); }
    if (departmentId) { where.push('a.department_id = ?'); args.push(departmentId); }
    if (employeeId) { where.push('a.employee_id = ?'); args.push(employeeId); }
    if (assignmentId) { where.push('a.id = ?'); args.push(assignmentId); }
    if (!includeEnded) where.push('a.ended_at IS NULL AND e.left_at IS NULL');
    return this.db.prepare(
      `SELECT a.id AS assignment_id, a.employee_id, a.company_id, a.department_id, a.position, a.reports_to, a.is_lead, a.reviewer_of,
              a.tier, a.model, a.thinking, a.task_id, a.created_at AS seated_at, a.ended_at,
              e.candidate_id, e.title, e.knobs, e.sessions, e.hired_at, e.left_at,
              c.name, c.role, c.archetype, c.profile
       FROM assignments a JOIN employees e ON e.id = a.employee_id JOIN candidates c ON c.id = e.candidate_id
       WHERE ${where.join(' AND ')} ORDER BY a.rowid`,
    ).all(...args).map(r => this._seatShape(plain(r), { profile }));
  }

  _seatShape(r, { profile = false } = {}) {
    return {
      assignmentId: r.assignment_id, employeeId: r.employee_id, companyId: r.company_id, departmentId: r.department_id, candidateId: r.candidate_id,
      name: r.name, role: r.role, archetype: r.archetype, title: r.title, position: r.position, reportsTo: r.reports_to, isLead: Boolean(r.is_lead), reviewerOf: r.reviewer_of,
      tier: r.tier, model: r.model, thinking: r.thinking, taskId: r.task_id, knobs: parse(r.knobs, {}), sessions: r.sessions,
      hiredAt: r.hired_at, leftAt: r.left_at, seatedAt: r.seated_at, endedAt: r.ended_at,
      ...(profile ? { profile: parse(r.profile, null) } : {}),
    };
  }

  getSeat(ownerId, assignmentId, opts = {}) {
    needOwner(ownerId);
    const seat = this._seats(ownerId, { assignmentId: String(assignmentId), includeEnded: true, ...opts })[0];
    if (!seat) throw missing('seat');
    return seat;
  }

  /** The seats in a department's room (or all of a company's), in the order they were taken. This is who the room is made of. */
  seatsOf(ownerId, companyId, { departmentId = null, includeEnded = false, profile = false } = {}) {
    needOwner(ownerId);
    return this._seats(ownerId, { companyId, departmentId, includeEnded, profile });
  }

  /** The person leaves the company: every seat ends. Their memory of it is kept until the owner deletes it (forgetEmployee) or the company is deleted. */
  leave(ownerId, employeeId) {
    const e = this._employeeRow(ownerId, employeeId);
    if (!e.left_at) {
      transaction(this.db, () => {
        const now = this._stamp();
        this.db.prepare('UPDATE employees SET left_at = ? WHERE id = ? AND owner_id = ?').run(now, e.id, ownerId);
        this.db.prepare('UPDATE assignments SET ended_at = ? WHERE employee_id = ? AND ended_at IS NULL').run(now, e.id);
      });
    }
    return this.getEmployee(ownerId, employeeId);
  }

  /** Delete a leaver's record and everything they remembered there (and, with the hall, their mailbox). */
  forgetEmployee(ownerId, employeeId) {
    const e = this._employeeRow(ownerId, employeeId);
    if (!e.left_at) throw new PolicyError('Take the person out of the company before deleting what they remember there.', { status: 409, code: 'still_employed' });
    this.db.prepare('DELETE FROM employees WHERE id = ? AND owner_id = ?').run(e.id, ownerId);
    return { deleted: true };
  }

  setKnobs(ownerId, employeeId, knobs) {
    const e = this._employeeRow(ownerId, employeeId);
    this.db.prepare('UPDATE employees SET knobs = ? WHERE id = ? AND owner_id = ?').run(json(knobs || {}), e.id, ownerId);
  }

  bumpSessions(ownerId, employeeId) {
    const e = this._employeeRow(ownerId, employeeId);
    this.db.prepare('UPDATE employees SET sessions = sessions + 1 WHERE id = ? AND owner_id = ?').run(e.id, ownerId);
  }

  /** A company was deleted: its people go, and with them every seat and every memory anyone kept there. */
  removeCompany(ownerId, companyId) {
    needOwner(ownerId);
    const n = this.db.prepare('DELETE FROM employees WHERE owner_id = ? AND company_id = ?').run(ownerId, companyId).changes;
    return { removed: Number(n) };
  }

  /** Everything this owner has in the roster, gone (an account deletion). */
  purgeOwner(ownerId) {
    needOwner(ownerId);
    return transaction(this.db, () => {
      this.db.prepare('DELETE FROM employees WHERE owner_id = ?').run(ownerId);
      this.db.prepare('DELETE FROM archetype_lessons WHERE owner_id = ?').run(ownerId);
      const n = this.db.prepare('DELETE FROM candidates WHERE owner_id = ?').run(ownerId).changes;
      return { candidates: Number(n) };
    });
  }

  // ── memory ─────────────────────────────────────────────────────────────────

  addMemory(ownerId, employeeId, entry) {
    const e = this._employeeRow(ownerId, employeeId);
    const text = this._memoryText(entry?.text);
    const kind = entry?.kind ?? 'summary';
    if (!MEMORY_KINDS.includes(kind)) throw bad(`kind must be one of ${MEMORY_KINDS.join(', ')}.`, { field: 'kind' });
    const source = entry?.source === 'owner' ? 'owner' : 'agent';
    const verified = entry?.verified ?? 'unchecked';
    if (!MEMORY_VERIFIED.includes(verified)) throw bad(`verified must be one of ${MEMORY_VERIFIED.join(', ')}.`, { field: 'verified' });
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM memory_entries WHERE employee_id = ?').get(e.id).n;
    if (count >= MAX_MEMORY_PER_EMPLOYEE) throw new PolicyError(`${e.name} already has ${MAX_MEMORY_PER_EMPLOYEE} memories here; delete some first.`, { status: 403, code: 'memory_cap' });
    const row = {
      id: rid(), employee_id: e.id, company_id: e.company_id, session: entry?.session ? String(entry.session).slice(0, 80) : null, kind, text, source, verified,
      note: entry?.note ? String(entry.note).slice(0, 300) : null, created_at: this._stamp(), updated_at: this._stamp(),
    };
    this.db.prepare(`INSERT INTO memory_entries (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row));
    return this._memoryShape(row);
  }

  _memoryText(value) {
    if (typeof value !== 'string' || !value.trim()) throw bad('A memory needs text.', { field: 'text' });
    const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (text.length > MEMORY_TEXT_MAX_CHARS) throw bad(`A memory can be at most ${MEMORY_TEXT_MAX_CHARS} characters (this one is ${text.length}).`, { field: 'text' });
    assertNoSecrets(text, 'The memory', 'text');
    return text;
  }

  _memoryShape(r) {
    return { id: r.id, employeeId: r.employee_id, companyId: r.company_id, session: r.session, kind: r.kind, text: r.text, source: r.source, verified: r.verified, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  /** What an employee remembers, oldest first (for the owner to read, edit and delete). */
  listMemory(ownerId, employeeId) {
    const e = this._employeeRow(ownerId, employeeId);
    return this.db.prepare('SELECT * FROM memory_entries WHERE employee_id = ? ORDER BY rowid').all(e.id).map(r => this._memoryShape(plain(r)));
  }

  _memoryRow(ownerId, entryId) {
    needOwner(ownerId);
    const row = this.db.prepare(
      'SELECT m.* FROM memory_entries m JOIN employees e ON e.id = m.employee_id WHERE m.id = ? AND e.owner_id = ?',
    ).get(String(entryId), ownerId);
    if (!row) throw missing('memory');
    return plain(row);
  }

  /** The owner edits a memory. An edit makes it the owner's word: its source becomes "owner" and it counts as confirmed. */
  updateMemory(ownerId, entryId, patch = {}) {
    const r = this._memoryRow(ownerId, entryId);
    const set = {};
    if (patch.text !== undefined) { set.text = this._memoryText(patch.text); set.source = 'owner'; set.verified = 'confirmed'; set.note = null; }
    if (patch.kind !== undefined) {
      if (!MEMORY_KINDS.includes(patch.kind)) throw bad(`kind must be one of ${MEMORY_KINDS.join(', ')}.`, { field: 'kind' });
      set.kind = patch.kind;
    }
    if (patch.verified !== undefined) {
      if (!MEMORY_VERIFIED.includes(patch.verified)) throw bad(`verified must be one of ${MEMORY_VERIFIED.join(', ')}.`, { field: 'verified' });
      set.verified = patch.verified;
    }
    if (patch.note !== undefined) set.note = patch.note ? String(patch.note).slice(0, 300) : null;
    if (!Object.keys(set).length) return this._memoryShape(r);
    set.updated_at = this._stamp();
    this.db.prepare(`UPDATE memory_entries SET ${Object.keys(set).map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(set), r.id);
    return this._memoryShape(plain(this.db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(r.id)));
  }

  /** Delete a memory. It is deleted: nothing keeps a copy. */
  deleteMemory(ownerId, entryId) {
    const r = this._memoryRow(ownerId, entryId);
    this.db.prepare('DELETE FROM memory_entries WHERE id = ?').run(r.id);
    return { deleted: true };
  }

  /** The memories that go into a person's sheet: the newest few, never one that was found to contradict the record. */
  memoryForBio(ownerId, employeeId, { limit = 8 } = {}) {
    const e = this._employeeRow(ownerId, employeeId);
    const rows = this.db.prepare(
      "SELECT * FROM memory_entries WHERE employee_id = ? AND verified != 'contradicted' ORDER BY rowid DESC LIMIT ?",
    ).all(e.id, Math.max(1, Math.min(Number(limit) || 8, 30)));
    return rows.map(r => this._memoryShape(plain(r))).reverse();
  }

  // ── what has been learned about casting an archetype ───────────────────────

  addLesson(ownerId, archetype, text, source = 'check') {
    needOwner(ownerId);
    if (typeof archetype !== 'string' || !archetype) throw bad('A lesson needs an archetype.', { field: 'archetype' });
    const clean = this._memoryText(text);
    const dup = this.db.prepare('SELECT id FROM archetype_lessons WHERE owner_id = ? AND archetype = ? AND text = ?').get(ownerId, archetype, clean);
    if (dup) return { id: dup.id, archetype, text: clean, source, duplicate: true };
    const row = { id: rid(), owner_id: ownerId, archetype, text: clean, source: String(source).slice(0, 40), created_at: this._stamp() };
    this.db.prepare(`INSERT INTO archetype_lessons (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row));
    return { id: row.id, archetype, text: clean, source: row.source, createdAt: row.created_at };
  }

  lessonsFor(ownerId, archetype, { limit = 6 } = {}) {
    needOwner(ownerId);
    return this.db.prepare('SELECT * FROM archetype_lessons WHERE owner_id = ? AND archetype = ? ORDER BY rowid DESC LIMIT ?')
      .all(ownerId, archetype, Math.max(1, Math.min(Number(limit) || 6, 30)))
      .map(r => ({ id: r.id, archetype: r.archetype, text: r.text, source: r.source, createdAt: r.created_at })).reverse();
  }

  deleteLesson(ownerId, id) {
    needOwner(ownerId);
    const n = this.db.prepare('DELETE FROM archetype_lessons WHERE id = ? AND owner_id = ?').run(String(id), ownerId).changes;
    if (!Number(n)) throw missing('lesson');
    return { deleted: true };
  }
}
