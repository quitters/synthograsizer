/**
 * Companies on disk.
 * ──────────────────
 * One folder per company under <data>/companies/<id>/: company.json (what the owner asked for), audit.jsonl, and the publish
 * queue. What a company is ALLOWED is never stored: only what was REQUESTED is, and the effective mandate, ceilings and tools
 * are worked out against the operator's policy every time they are read, so when an operator tightens its policy every
 * company tightens with it, and no stored value can outlive the operator's say.
 *
 * Isolation: a company belongs to the visitor who made it (the same unguessable cookie id a room uses); that visitor can reach
 * its companies and their rooms and nobody else's. Each department has its own room, each room its own id. Memory is scoped to
 * the company, so two companies never share any.
 *
 * A new company is created PAUSED. Nothing runs, spends or publishes until its owner says go.
 */
import fs from 'node:fs';
import path from 'node:path';
import { newId, isId, clone } from './util.js';
import { PolicyError } from './errors.js';
import { validateMission, DEFAULT_MISSION } from './mission.js';
import { validateMandate, resolveMandate } from './mandate.js';
import { validateCeilings, resolveCeilings } from './ceilings.js';
import { validateToolList, resolveToolGrant, DEFAULT_COMPANY_GRANT } from './toolGrants.js';
import { assertNoSecrets } from './secrets.js';

export const MAX_COMPANIES_PER_OWNER = 25;
export const MAX_DEPARTMENTS = 40;

const STATES = ['paused', 'active'];

const cleanName = (value, label, field) => {
  if (typeof value !== 'string') throw new PolicyError(`${label} must be text.`, { status: 400, code: 'bad_name', field });
  const name = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 80) throw new PolicyError(`${label} must be 1 to 80 characters.`, { status: 400, code: 'bad_name', field });
  assertNoSecrets(name, label, field);
  return name;
};

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

/** What a company is allowed right now: its requests, held to the operator's policy. */
export function effectivePolicy(company, operator) {
  const m = resolveMandate(operator.mandate, company.mandate || {});
  const c = resolveCeilings(operator.ceilings, company.ceilings || {});
  const t = resolveToolGrant(operator.tools, company.tools || []);
  return {
    mission: company.mission,
    mandate: m.effective,
    ceilings: c.effective,
    tools: t.effective,
    clamped: { mandate: m.clamped, ceilings: c.clamped, tools: t.clamped },
  };
}

export class CompanyStore {
  /**
   * @param {{ rootDir: string, operator: object, now?: () => Date }} options
   */
  constructor({ rootDir, operator, now = () => new Date() }) {
    this.rootDir = rootDir;
    this.operator = operator;
    this.now = now;
    this.companies = new Map();
    this.rooms = new Map();
    this._load();
  }

  _dir(id) {
    if (!isId(id)) throw new PolicyError('No such company.', { status: 404, code: 'no_company' });
    return path.join(this.rootDir, 'companies', id);
  }

  _file(id) { return path.join(this._dir(id), 'company.json'); }

  _load() {
    const base = path.join(this.rootDir, 'companies');
    let names = [];
    try { names = fs.readdirSync(base); } catch { return; }
    for (const name of names) {
      if (!isId(name)) continue;
      try {
        const company = JSON.parse(fs.readFileSync(path.join(base, name, 'company.json'), 'utf8'));
        // Every id in the file is later used to build a path, so a file that holds anything but ids is skipped, not trusted
        const sound = company?.id === name && isId(company.ownerId) && Array.isArray(company.departments)
          && company.departments.every(d => d && /^[a-f0-9]{8}$/.test(d.id) && isId(d.roomId) && typeof d.name === 'string');
        if (sound) this._index(company);
        else console.warn(`[company] skipped ${name}: company.json is not in the expected shape`);
      } catch (err) {
        console.warn(`[company] skipped ${name}: ${err.message}`);
      }
    }
  }

  _index(company) {
    this.companies.set(company.id, company);
    for (const d of company.departments) this.rooms.set(d.roomId, { companyId: company.id, departmentId: d.id });
  }

  _save(company) {
    company.updatedAt = this.now().toISOString();
    writeJsonAtomic(this._file(company.id), company);
    this._index(company);
  }

  /** Check the parts of a create or update request. Returns what to store. Throws a 400 that names every problem. */
  _checked(body, { creating }) {
    const errors = [];
    const out = {};
    if (body.name !== undefined) out.name = cleanName(body.name, 'The company name', 'name');
    if (body.mission !== undefined) out.mission = validateMission(body.mission);
    if (body.mandate !== undefined) { const r = validateMandate(body.mandate); errors.push(...r.errors); out.mandate = r.value; }
    if (body.ceilings !== undefined) { const r = validateCeilings(body.ceilings); errors.push(...r.errors); out.ceilings = r.value; }
    if (body.tools !== undefined) { const r = validateToolList(body.tools); errors.push(...r.errors); out.tools = r.value; }
    // Departments are added at creation, or one at a time with addDepartment: an update never touches them
    if (creating && body.departments !== undefined) {
      if (!Array.isArray(body.departments) || body.departments.length > MAX_DEPARTMENTS) errors.push(`departments must be a list of at most ${MAX_DEPARTMENTS} names`);
      else out.departments = body.departments.map(n => cleanName(n, 'A department name', 'departments'));
    }
    if (errors.length) throw new PolicyError(errors.join('; '), { status: 400, code: 'bad_request' });
    if (creating && !out.name) throw new PolicyError('A company needs a name.', { status: 400, code: 'bad_request', field: 'name' });
    return out;
  }

  /** @returns {object} the stored company (what was requested) */
  create(ownerId, body) {
    if (!isId(ownerId)) throw new PolicyError('No visitor.', { status: 400, code: 'no_owner' });
    if (this.listFor(ownerId).length >= MAX_COMPANIES_PER_OWNER) {
      throw new PolicyError(`You already have ${MAX_COMPANIES_PER_OWNER} companies; delete one first.`, { status: 403, code: 'company_cap' });
    }
    const checked = this._checked(body, { creating: true });
    const now = this.now().toISOString();
    const company = {
      id: newId(),
      version: 1,
      ownerId,
      name: checked.name,
      createdAt: now,
      updatedAt: now,
      state: 'paused',
      mission: checked.mission ?? DEFAULT_MISSION.text,
      mandate: checked.mandate ?? {},
      ceilings: checked.ceilings ?? {},
      tools: checked.tools ?? [...DEFAULT_COMPANY_GRANT],
      departments: [],
    };
    for (const name of checked.departments || []) company.departments.push({ id: newId().slice(0, 8), name, roomId: newId(), createdAt: now });
    this._save(company);
    return company;
  }

  get(id) { return this.companies.get(id) || null; }

  /** The company if `ownerId` owns it, else a 404 (never a hint that it exists). */
  getOwned(id, ownerId) {
    const company = this.companies.get(id);
    if (!company || company.ownerId !== ownerId) throw new PolicyError('No such company.', { status: 404, code: 'no_company' });
    return company;
  }

  listFor(ownerId) {
    return [...this.companies.values()].filter(c => c.ownerId === ownerId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Apply a PATCH. Mandate, ceilings and tools REPLACE what the owner had requested; the operator's policy still holds the effective values. */
  update(id, ownerId, body) {
    const company = this.getOwned(id, ownerId);
    const checked = this._checked(body, { creating: false });
    const before = effectivePolicy(company, this.operator);
    for (const key of ['name', 'mission', 'mandate', 'ceilings', 'tools']) if (checked[key] !== undefined) company[key] = checked[key];
    this._save(company);
    const after = effectivePolicy(company, this.operator);
    return { company, before, after, changed: Object.keys(checked) };
  }

  setState(id, ownerId, state) {
    if (!STATES.includes(state)) throw new PolicyError('state must be "active" or "paused".', { status: 400, code: 'bad_request', field: 'state' });
    const company = this.getOwned(id, ownerId);
    if (company.state === state) return company;
    company.state = state;
    this._save(company);
    return company;
  }

  addDepartment(id, ownerId, name) {
    const company = this.getOwned(id, ownerId);
    if (company.departments.length >= MAX_DEPARTMENTS) throw new PolicyError(`A company has at most ${MAX_DEPARTMENTS} departments.`, { status: 403, code: 'department_cap' });
    const clean = cleanName(name, 'A department name', 'department');
    if (company.departments.some(d => d.name.toLowerCase() === clean.toLowerCase())) {
      throw new PolicyError(`There is already a department called "${clean}".`, { status: 409, code: 'department_exists', field: 'department' });
    }
    const department = { id: newId().slice(0, 8), name: clean, roomId: newId(), createdAt: this.now().toISOString() };
    company.departments.push(department);
    this._save(company);
    return department;
  }

  /** Which company and department own this room id, or null (an ordinary visitor room). */
  roomOwner(roomId) {
    const hit = this.rooms.get(roomId);
    if (!hit) return null;
    const company = this.companies.get(hit.companyId);
    const department = company?.departments.find(d => d.id === hit.departmentId);
    return company && department ? { company, department } : null;
  }

  /** Delete a company: its folder, and every department room's saved sessions. Returns the room ids so live rooms can be dropped. */
  remove(id, ownerId) {
    const company = this.getOwned(id, ownerId);
    const roomIds = company.departments.map(d => d.roomId);
    for (const roomId of roomIds) {
      this.rooms.delete(roomId);
      fs.rmSync(path.join(this.rootDir, 'rooms', roomId), { recursive: true, force: true });
    }
    fs.rmSync(this._dir(id), { recursive: true, force: true });
    this.companies.delete(id);
    return { roomIds };
  }

  /** A copy for an API answer: the request, what applies, and what was clamped. Never the owner's id. */
  describe(company) {
    const eff = effectivePolicy(company, this.operator);
    return {
      id: company.id,
      name: company.name,
      state: company.state,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      mission: company.mission,
      requested: clone({ mandate: company.mandate, ceilings: company.ceilings, tools: company.tools }),
      effective: { mandate: eff.mandate, ceilings: eff.ceilings, tools: eff.tools },
      clamped: eff.clamped,
      departments: company.departments.map(d => ({ id: d.id, name: d.name, roomId: d.roomId })),
    };
  }
}
