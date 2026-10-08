/**
 * /api/company: build and control an agent company.
 *
 * Every control a person has is here as an API call too, with a machine-readable schema (GET /schema), so an agent can build or
 * change a company with the same actions. What is NOT here, on purpose: any way to change the hard limits, the publishing floor,
 * human approval or the AI-generated label, and any way for an agent (as opposed to the company's owner) to approve a publication.
 *
 * A company belongs to the visitor who made it. Another visitor's company is "no such company", never "not yours".
 */
import { Router } from 'express';
import { SCHEMAS, schemaDocument, validate } from '../company/schema.js';
import { DEFAULT_MISSION } from '../company/mission.js';
import { HARD_LIMITS, PUBLISHING_FLOOR, PUBLISHING_REQUIREMENTS } from '../company/hardLimits.js';
import { MANDATE_DIALS } from '../company/mandate.js';
import { PolicyError, isPolicyError } from '../company/errors.js';
import { tiersThatFit, KNOWN_TOOLS } from '../company/toolGrants.js';
import { peekRoom, dropRoom } from '../services/sessionRegistry.js';

const ENDPOINTS = [
  ['GET', '/api/company/schema', 'This document.'],
  ['GET', '/api/company/operator', 'What this server\'s operator allows: the defaults no request can loosen.'],
  ['GET', '/api/company/mission', 'The default mission statement.'],
  ['POST', '/api/company', 'Create a company (paused). Body: companyCreate.'],
  ['GET', '/api/company', 'Your companies.'],
  ['GET', '/api/company/:id', 'One company: what you asked for, what applies, what was clamped.'],
  ['PATCH', '/api/company/:id', 'Change name, mission, mandate, ceilings or tools. Body: companyPatch.'],
  ['DELETE', '/api/company/:id', 'Delete the company, its audit log, its publish queue and its rooms\' saved sessions.'],
  ['POST', '/api/company/:id/go', 'Let the company run. Nothing runs, spends or publishes until you do.'],
  ['POST', '/api/company/:id/pause', 'Stop it. Running rooms pause.'],
  ['POST', '/api/company/:id/rooms', 'Add a department with its own isolated room. Body: roomCreate. Use the roomId as X-Room-Id (or ?room=) on /api/agents, /api/chat and the rest.'],
  ['GET', '/api/company/:id/audit', 'What the safety layer did (decisions, never content). ?limit= &type='],
  ['POST', '/api/company/:id/publish', 'Offer work for publication. Body: proposal. A person must approve it.'],
  ['GET', '/api/company/:id/publish', 'The queue. ?status='],
  ['GET', '/api/company/:id/publish/:item', 'One proposal with the work itself.'],
  ['POST', '/api/company/:id/publish/:item/approve', 'Approve it (owner only; the screen must have passed it).'],
  ['POST', '/api/company/:id/publish/:item/reject', 'Reject it. Body: { reason? }.'],
  ['POST', '/api/company/:id/publish/:item/rescreen', 'Review it again (only if it is waiting for a person or the screen could not run; a block is final).'],
  ['GET', '/api/company/:id/publish/:item/export', 'The approved work, labelled AI-generated.'],
].map(([method, path, description]) => ({ method, path, description }));

function checkBody(schema, body) {
  const errors = validate(schema, body ?? {});
  if (errors.length) throw new PolicyError(errors.join('; '), { status: 400, code: 'bad_request' });
  return body ?? {};
}

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (isPolicyError(err)) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...(err.field ? { field: err.field } : {}) });
    }
    console.error('[company]', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

/** @param {ReturnType<import('../company/index.js').createCompanyServices>} services */
export function createCompanyRouter(services) {
  const { store, audit, publish, operator } = services;
  const router = Router();

  // ── things anyone may read ──────────────────────────────────────────────────

  router.get('/schema', (req, res) => {
    res.json({
      ...schemaDocument(),
      'x-fixed': {
        note: 'These are not settings. No request, profile, role-play or persona can change them, and no field here sets them.',
        hardLimits: HARD_LIMITS.map(({ id, title, rule }) => ({ id, title, rule })),
        publishingFloor: PUBLISHING_FLOOR.map(({ id, title, rule }) => ({ id, title, rule })),
        publishingRequirements: PUBLISHING_REQUIREMENTS,
      },
      'x-dials': MANDATE_DIALS,
      'x-tools': { known: KNOWN_TOOLS, startsAt: 'research tools (google_search, url_context); every agent starts with tier "none"' },
      'x-endpoints': ENDPOINTS,
    });
  });

  router.get('/operator', (req, res) => res.json(operator.snapshot()));
  router.get('/mission', (req, res) => res.json(DEFAULT_MISSION));

  // ── companies ───────────────────────────────────────────────────────────────

  router.get('/', (req, res) => res.json({ companies: store.listFor(req.visitorId).map(c => store.describe(c)) }));

  router.post('/', handle((req, res) => {
    checkBody(SCHEMAS.companyCreate, req.body);
    const company = store.create(req.visitorId, req.body);
    const described = store.describe(company);
    audit.append(company.id, { type: 'company_created', name: company.name, departments: company.departments.length, clamped: described.clamped });
    res.status(201).json({
      company: described,
      note: 'The company is paused. Nothing runs, spends or publishes until you say go (POST /api/company/:id/go).',
    });
  }));

  router.get('/:id', handle((req, res) => {
    res.json({ company: store.describe(store.getOwned(req.params.id, req.visitorId)) });
  }));

  router.patch('/:id', handle((req, res) => {
    checkBody(SCHEMAS.companyPatch, req.body);
    const { company, changed, after } = store.update(req.params.id, req.visitorId, req.body);
    if (changed.length) audit.append(company.id, { type: 'company_updated', changed, clamped: after.clamped });
    res.json({ company: store.describe(company) });
  }));

  router.delete('/:id', handle((req, res) => {
    const { roomIds } = store.remove(req.params.id, req.visitorId);
    for (const roomId of roomIds) dropRoom(roomId);
    res.json({ deleted: true });
  }));

  router.post('/:id/go', handle((req, res) => {
    const company = store.setState(req.params.id, req.visitorId, 'active');
    audit.append(company.id, { type: 'company_go' });
    res.json({ company: store.describe(company) });
  }));

  router.post('/:id/pause', handle((req, res) => {
    const company = store.setState(req.params.id, req.visitorId, 'paused');
    // Rooms that are running stop at once, not at their next turn
    for (const d of company.departments) {
      const room = peekRoom(d.roomId);
      if (room?.orchestrator.isRunning && !room.orchestrator.isPaused) room.orchestrator.pause();
    }
    audit.append(company.id, { type: 'company_pause' });
    res.json({ company: store.describe(company) });
  }));

  router.post('/:id/rooms', handle((req, res) => {
    checkBody(SCHEMAS.roomCreate, req.body);
    const department = store.addDepartment(req.params.id, req.visitorId, req.body.department);
    audit.append(req.params.id, { type: 'room_created', department: department.name });
    res.status(201).json({
      department: { id: department.id, name: department.name, roomId: department.roomId },
      note: 'Send the roomId as an X-Room-Id header (or ?room=) on /api/agents, /api/chat and the other room endpoints.',
      tiers: tiersThatFit(store.describe(store.get(req.params.id)).effective.tools),
    });
  }));

  router.get('/:id/audit', handle((req, res) => {
    store.getOwned(req.params.id, req.visitorId);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 200, 1000));
    res.json({ entries: audit.read(req.params.id, { limit, type: typeof req.query.type === 'string' ? req.query.type : null }) });
  }));

  // ── publishing ──────────────────────────────────────────────────────────────

  router.get('/:id/publish', handle((req, res) => {
    store.getOwned(req.params.id, req.visitorId);
    res.json({ proposals: publish.list(req.params.id, { status: typeof req.query.status === 'string' ? req.query.status : null }) });
  }));

  router.post('/:id/publish', handle(async (req, res) => {
    const company = store.getOwned(req.params.id, req.visitorId);
    checkBody(SCHEMAS.proposal, req.body);
    const roomId = req.body.roomId || null;
    if (roomId && store.roomOwner(roomId)?.company.id !== company.id) {
      throw new PolicyError('That room does not belong to this company.', { status: 400, code: 'bad_proposal', field: 'roomId' });
    }
    // The work comes from the room it is in; a room that is not loaded has nothing to offer but text
    const room = roomId ? peekRoom(roomId) : null;
    const sources = room ? { artifact: (n) => room.artifactStore.get(n) || null, media: (id) => room.mediaStore.get(id) || null } : {};
    const item = await publish.propose(company.id, { ...req.body, by: 'owner' }, sources);
    res.status(201).json({ proposal: item });
  }));

  router.get('/:id/publish/:item', handle((req, res) => {
    store.getOwned(req.params.id, req.visitorId);
    res.json({ proposal: publish.get(req.params.id, req.params.item) });
  }));

  router.post('/:id/publish/:item/approve', handle((req, res) => {
    store.getOwned(req.params.id, req.visitorId);
    res.json({ proposal: publish.approve(req.params.id, req.params.item) });
  }));

  router.post('/:id/publish/:item/reject', handle((req, res) => {
    store.getOwned(req.params.id, req.visitorId);
    res.json({ proposal: publish.reject(req.params.id, req.params.item, req.body?.reason) });
  }));

  router.post('/:id/publish/:item/rescreen', handle(async (req, res) => {
    store.getOwned(req.params.id, req.visitorId);
    res.json({ proposal: await publish.rescreen(req.params.id, req.params.item) });
  }));

  router.get('/:id/publish/:item/export', handle((req, res) => {
    store.getOwned(req.params.id, req.visitorId);
    res.json(publish.exportBundle(req.params.id, req.params.item));
  }));

  return router;
}
