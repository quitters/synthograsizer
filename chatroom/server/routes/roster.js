/**
 * The roster, the people of a company and what they remember.
 *
 *   /api/company/roster            the library of invented people: list, import one, read, edit, export, retire, delete
 *   /api/company/:id/people        who works at a company: hire from the roster, give another seat, let go, and read, correct or delete memory
 *
 * A person is hired through the same rules that admit any agent to a room (the cap, a clean name and sheet, a tool tier inside the company's
 * grant): a hire that could not be seated is refused here, with the reason, and leaves no empty seat behind. What a person remembers belongs to
 * them at THIS company; the owner can read it, correct it and delete it.
 */
import { Router } from 'express';
import { SCHEMAS } from '../company/schema.js';
import { PolicyError } from '../company/errors.js';
import { checkAgentTier } from '../company/toolGrants.js';
import { admitDepartment } from '../company/flow/admit.js';
import { peekRoom } from '../services/sessionRegistry.js';
import { handle, checkBody } from './httpUtil.js';

const asBool = (v) => v === '1' || v === 'true';

/** @param {ReturnType<import('../company/index.js').createCompanyServices>} services */
export function createRosterRouter(services) {
  const router = Router();
  const q = (req, name) => (typeof req.query[name] === 'string' && req.query[name] ? req.query[name] : undefined);

  router.get('/', handle((req, res) => {
    const roster = services.roster;
    const filter = { status: q(req, 'status'), archetype: q(req, 'archetype'), region: q(req, 'region'), tier: q(req, 'tier'), q: q(req, 'q'), limit: Number(req.query.limit) || 50, offset: Number(req.query.offset) || 0 };
    res.json({ candidates: roster.listCandidates(req.visitorId, filter), total: roster.countCandidates(req.visitorId), max: roster.maxCandidates });
  }));

  router.get('/spread', handle((req, res) => {
    res.json({ spread: services.roster.spread(req.visitorId) });
  }));

  router.post('/', handle((req, res) => {
    const body = checkBody(SCHEMAS.candidateImport, req.body);
    const profile = body.profile;
    const candidate = services.roster.addCandidate(req.visitorId, {
      profile, casting: body.casting || profile.x_pilot?.casting || {}, archetype: body.archetype || profile.x_pilot?.archetype || 'imported',
      role: body.role || profile.anchors?.role || profile.description || 'colleague', status: body.status || 'draft', skills: body.skills,
      run: profile.x_pilot?.run, writtenBy: 'import',
    });
    res.status(201).json({ candidate, note: 'A person you import starts as a draft. Set status "ready" when you have read the sheet; only ready people can be hired.' });
  }));

  router.get('/:cid', handle((req, res) => {
    res.json({ candidate: services.roster.getCandidate(req.visitorId, req.params.cid) });
  }));

  router.get('/:cid/export', handle((req, res) => {
    const c = services.roster.getCandidate(req.visitorId, req.params.cid);
    res.setHeader('Content-Disposition', `attachment; filename="${c.name.replace(/[^A-Za-z0-9._-]+/g, '_')}.profile.json"`);
    res.json({ ...c.profile, x_roster: { archetype: c.archetype, role: c.role, casting: c.casting, quiz: c.quiz, checks: c.checks, status: c.status } });
  }));

  router.patch('/:cid', handle((req, res) => {
    const body = checkBody(SCHEMAS.candidatePatch, req.body);
    res.json({ candidate: services.roster.updateCandidate(req.visitorId, req.params.cid, body) });
  }));

  router.delete('/:cid', handle((req, res) => {
    res.json(services.roster.deleteCandidate(req.visitorId, req.params.cid));
  }));

  return router;
}

/** @param {ReturnType<import('../company/index.js').createCompanyServices>} services */
export function createPeopleRouter(services) {
  const router = Router({ mergeParams: true });
  const { store, audit } = services;

  const open = (req) => {
    const company = store.getOwned(req.params.id, req.visitorId);
    return { company, roster: services.roster, ownerId: req.visitorId, id: company.id };
  };

  /** A department of this company, by id or name. */
  const departmentOf = (company, ref) => {
    const key = String(ref ?? '').trim().toLowerCase();
    const hit = company.departments.find(d => d.id === key || d.name.toLowerCase() === key);
    if (!hit) throw new PolicyError(`This company has no department "${String(ref).slice(0, 60)}". Departments: ${company.departments.map(d => d.name).join(', ') || 'none yet'}.`, { status: 400, code: 'bad_request', field: 'department' });
    return hit;
  };

  /** A colleague by name or id, as an employee id. */
  const colleague = (roster, ownerId, companyId, ref, field) => {
    if (ref === undefined || ref === null || ref === '') return null;
    const key = String(ref).trim().toLowerCase();
    const people = roster.employeesOf(ownerId, companyId);
    const hits = people.filter(p => p.id === ref || p.name.toLowerCase() === key);
    const found = hits.length ? hits : people.filter(p => p.name.toLowerCase().split(' ')[0] === key);
    if (found.length !== 1) throw new PolicyError(`${found.length ? `"${ref}" could be more than one person; use the full name` : `No one here is called "${ref}"`}. People: ${people.map(p => p.name).join(', ') || 'no one yet'}.`, { status: 400, code: 'bad_request', field });
    return found[0].id;
  };

  /** Refuse now what the room would refuse at the door, so a hire never leaves an empty seat. */
  const checkSeat = (company, department, tier, roster, ownerId) => {
    const eff = store.describe(company).effective;
    checkAgentTier(tier, eff.tools);
    const seated = roster.seatsOf(ownerId, company.id, { departmentId: department.id }).length;
    if (seated >= eff.ceilings.maxAgents) throw new PolicyError(`${department.name} is full: a company room holds at most ${eff.ceilings.maxAgents} agents.`, { status: 403, code: 'agent_cap', field: 'department' });
  };

  /**
   * The Hall is set up for a company when its first person is hired (its channels, a locked README, a welcome to each person), and kept up to date as
   * people and departments are added. Safe to repeat. Not done where the operator has closed the Hall or the company has opened none of it.
   */
  const seedHall = (company) => {
    const eff = store.describe(company).effective.collaboration;
    if (!services.operator.hall.enabled || !Object.values(eff).some(Boolean)) return;
    services.hall.seedCompany(company.ownerId, { id: company.id, name: company.name, departments: company.departments.map(d => ({ id: d.id, name: d.name })) });
  };

  /** If the room is running in memory, seat the person in it now (a room made later seats them when it is made). */
  const seatInLiveRoom = (company, department, ownerId) => {
    const room = peekRoom(department.roomId);
    if (room) admitDepartment({ roster: services.roster, ownerId, companyId: company.id, departmentId: department.id, orchestrator: room.orchestrator });
  };

  const removeFromLiveRooms = (company, employeeId) => {
    for (const d of company.departments) {
      const room = peekRoom(d.roomId);
      const agent = room?.orchestrator.agents.find(a => a.employeeId === employeeId);
      if (agent) room.orchestrator.removeAgent(agent.id);
    }
  };

  router.get('/', handle((req, res) => {
    const { roster, ownerId, id } = open(req);
    const includeLeft = asBool(req.query.left);
    res.json({ employees: roster.employeesOf(ownerId, id, { includeLeft }), seats: roster.seatsOf(ownerId, id, { includeEnded: includeLeft }) });
  }));

  router.post('/', handle((req, res) => {
    const { company, roster, ownerId, id } = open(req);
    const body = checkBody(SCHEMAS.hire, req.body);
    const department = departmentOf(company, body.department);
    const candidate = roster.getCandidate(ownerId, body.candidateId, { full: false });
    checkSeat(company, department, body.tier || candidate.tier, roster, ownerId);
    const seat = roster.hire(ownerId, {
      companyId: id, departmentId: department.id, candidateId: body.candidateId, position: body.position,
      reportsTo: colleague(roster, ownerId, id, body.reportsTo, 'reportsTo'), isLead: body.isLead, reviewerOf: body.reviewerOf,
      tier: body.tier, model: body.model, thinking: body.thinking, knobs: body.knobs,
    });
    audit.append(id, { type: 'person_hired', agent: seat.name, department: department.name, position: seat.position });
    seatInLiveRoom(company, department, ownerId);
    seedHall(company);
    res.status(201).json({ seat });
  }));

  router.get('/:employee', handle((req, res) => {
    const { roster, ownerId } = open(req);
    res.json({ employee: roster.getEmployee(ownerId, req.params.employee) });
  }));

  router.delete('/:employee', handle((req, res) => {
    const { company, roster, ownerId, id } = open(req);
    const e = roster.getEmployee(ownerId, req.params.employee);
    if (e.companyId !== id) throw new PolicyError('No such employee.', { status: 404, code: 'no_employee' });
    const out = roster.leave(ownerId, e.id);
    removeFromLiveRooms(company, e.id);
    audit.append(id, { type: 'person_left', agent: e.name });
    res.json({ employee: out, note: 'Their memory of this company is kept until you delete it (DELETE /people/:employee/memory) or delete the company.' });
  }));

  router.post('/:employee/seats', handle((req, res) => {
    const { company, roster, ownerId, id } = open(req);
    const body = checkBody(SCHEMAS.seat, req.body);
    const e = roster.getEmployee(ownerId, req.params.employee);
    if (e.companyId !== id) throw new PolicyError('No such employee.', { status: 404, code: 'no_employee' });
    const department = departmentOf(company, body.department);
    checkSeat(company, department, body.tier || e.seats[0]?.tier || 'none', roster, ownerId);
    const seat = roster.assign(ownerId, e.id, {
      departmentId: department.id, position: body.position, reportsTo: colleague(roster, ownerId, id, body.reportsTo, 'reportsTo'),
      isLead: body.isLead, reviewerOf: body.reviewerOf, tier: body.tier, model: body.model, thinking: body.thinking, taskId: body.taskId,
    });
    audit.append(id, { type: 'person_seated', agent: e.name, department: department.name, position: seat.position });
    seatInLiveRoom(company, department, ownerId);
    seedHall(company);
    res.status(201).json({ seat });
  }));

  router.delete('/seats/:assignment', handle((req, res) => {
    const { company, roster, ownerId, id } = open(req);
    const seat = roster.getSeat(ownerId, req.params.assignment);
    if (seat.companyId !== id) throw new PolicyError('No such seat.', { status: 404, code: 'no_seat' });
    const out = roster.unassign(ownerId, seat.assignmentId);
    const department = company.departments.find(d => d.id === seat.departmentId);
    const agent = department ? peekRoom(department.roomId)?.orchestrator.agents.find(a => a.employeeId === seat.employeeId) : null;
    if (agent) peekRoom(department.roomId).orchestrator.removeAgent(agent.id);
    audit.append(id, { type: 'person_unseated', agent: seat.name, department: department?.name || null });
    res.json({ seat: out });
  }));

  // ── what a person remembers at this company ────────────────────────────────

  const employeeOf = (req) => {
    const { roster, ownerId, id, company } = open(req);
    const e = roster.getEmployee(ownerId, req.params.employee);
    if (e.companyId !== id) throw new PolicyError('No such employee.', { status: 404, code: 'no_employee' });
    return { roster, ownerId, id, company, employee: e };
  };

  router.get('/:employee/memory', handle((req, res) => {
    const { roster, ownerId, employee } = employeeOf(req);
    res.json({ employee: { id: employee.id, name: employee.name }, memory: roster.listMemory(ownerId, employee.id) });
  }));

  router.post('/:employee/memory', handle((req, res) => {
    const { roster, ownerId, employee } = employeeOf(req);
    const body = checkBody(SCHEMAS.memoryEntry, req.body);
    res.status(201).json({ entry: roster.addMemory(ownerId, employee.id, { ...body, source: 'owner', verified: 'confirmed' }) });
  }));

  router.patch('/:employee/memory/:entry', handle((req, res) => {
    const { roster, ownerId, employee } = employeeOf(req);
    const body = checkBody(SCHEMAS.memoryPatch, req.body);
    const entry = roster.listMemory(ownerId, employee.id).find(m => m.id === req.params.entry);
    if (!entry) throw new PolicyError('No such memory.', { status: 404, code: 'no_memory' });
    res.json({ entry: roster.updateMemory(ownerId, entry.id, body) });
  }));

  router.delete('/:employee/memory/:entry', handle((req, res) => {
    const { roster, ownerId, employee } = employeeOf(req);
    const entry = roster.listMemory(ownerId, employee.id).find(m => m.id === req.params.entry);
    if (!entry) throw new PolicyError('No such memory.', { status: 404, code: 'no_memory' });
    res.json(roster.deleteMemory(ownerId, entry.id));
  }));

  return router;
}
