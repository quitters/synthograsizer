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
import { SCHEMAS, schemaDocument } from '../company/schema.js';
import { DEFAULT_MISSION } from '../company/mission.js';
import { DEFAULT_HOUSE_RULES, HOUSE_RULES_MAX_CHARS } from '../company/houseRules.js';
import { HARD_LIMITS, PUBLISHING_FLOOR, PUBLISHING_REQUIREMENTS } from '../company/hardLimits.js';
import { MANDATE_DIALS } from '../company/mandate.js';
import { PolicyError } from '../company/errors.js';
import { tiersThatFit, KNOWN_TOOLS } from '../company/toolGrants.js';
import { peekRoom, dropRoom } from '../services/sessionRegistry.js';
import { handle, checkBody, jsonOnlyChanges } from './httpUtil.js';
import { createHallRouter } from './hall.js';
import { createRosterRouter, createPeopleRouter } from './roster.js';

const ENDPOINTS = [
  ['GET', '/api/company/schema', 'This document.'],
  ['GET', '/api/company/operator', 'What this server\'s operator allows: the defaults no request can loosen.'],
  ['GET', '/api/company/mission', 'The default mission statement.'],
  ['GET', '/api/company/house-rules', 'The default house rules: how the people in a company carry themselves at work.'],
  ['POST', '/api/company', 'Create a company (paused). Body: companyCreate.'],
  ['GET', '/api/company', 'Your companies.'],
  ['GET', '/api/company/:id', 'One company: what you asked for, what applies, what was clamped.'],
  ['PATCH', '/api/company/:id', 'Change name, mission, house rules, mandate, ceilings or tools. Body: companyPatch.'],
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
  // the roster: the library of invented people
  ['GET', '/api/company/roster', 'The roster: your library of invented people. ?status= &archetype= &region= &tier= &q= &limit= &offset='],
  ['GET', '/api/company/roster/spread', 'How the ready people spread over region, age, pronoun, archetype, tier, dissent and type.'],
  ['POST', '/api/company/roster', 'Import one person as an Agent Profile (a draft until you mark it ready). Body: candidateImport.'],
  ['GET', '/api/company/roster/:candidate', 'One person: the sheet, the facts, the checks, the quiz.'],
  ['GET', '/api/company/roster/:candidate/export', 'The person as an Agent Profile JSON file.'],
  ['PATCH', '/api/company/roster/:candidate', 'Edit a person, or retire them. Body: candidatePatch.'],
  ['DELETE', '/api/company/roster/:candidate', 'Delete a person from the roster (not while they work at a company).'],
  // the people of a company
  ['GET', '/api/company/:id/people', 'Who works at this company, and the seats they hold. ?left=1 includes people who left.'],
  ['POST', '/api/company/:id/people', 'Hire a person from the roster into a department. Body: hire.'],
  ['GET', '/api/company/:id/people/:employee', 'One person at this company, with their seats.'],
  ['DELETE', '/api/company/:id/people/:employee', 'Let a person go (their memory of this company is kept until you delete it).'],
  ['POST', '/api/company/:id/people/:employee/seats', 'Give a person another seat (a second department, or a task team). Body: seat.'],
  ['DELETE', '/api/company/:id/people/seats/:assignment', 'End one seat; the person stays.'],
  ['GET', '/api/company/:id/people/:employee/memory', 'What a person remembers at this company, to read.'],
  ['POST', '/api/company/:id/people/:employee/memory', 'Add a note to what a person remembers. Body: memoryEntry.'],
  ['PATCH', '/api/company/:id/people/:employee/memory/:entry', 'Correct a memory, or mark it contradicted. Body: memoryPatch.'],
  ['DELETE', '/api/company/:id/people/:employee/memory/:entry', 'Delete a memory. It is deleted.'],
  // the Hall: how the people reach each other between rooms
  ['GET', '/api/company/:id/hall', 'The Hall at a glance: people with their mail counts, channels, files, tasks, working agreements.'],
  ['GET', '/api/company/:id/hall/directory', 'Who works here, in which rooms, reporting to whom.'],
  ['GET', '/api/company/:id/hall/mail', 'Every mailbox, or one person\'s. ?employee= &state= &thread= &limit='],
  ['POST', '/api/company/:id/hall/mail', 'Send a notice to some of the people. Body: ownerMail.'],
  ['GET', '/api/company/:id/hall/forums', 'The forum channels.'],
  ['POST', '/api/company/:id/hall/forums', 'Add a channel. Body: forumChannel.'],
  ['GET', '/api/company/:id/hall/forums/:channel', 'A channel\'s threads.'],
  ['GET', '/api/company/:id/hall/forums/:channel/threads/:thread', 'One thread.'],
  ['POST', '/api/company/:id/hall/forums/:channel/threads', 'Start a thread as the owner. Body: forumThread.'],
  ['POST', '/api/company/:id/hall/forums/:channel/threads/:thread/replies', 'Reply as the owner. Body: forumReply.'],
  ['POST', '/api/company/:id/hall/forums/posts/:post/pin', 'Pin or unpin a thread. Body: { pinned? }.'],
  ['DELETE', '/api/company/:id/hall/forums/posts/:post', 'Remove a post (a thread\'s first post removes the thread).'],
  ['GET', '/api/company/:id/hall/workspace', 'The shared files.'],
  ['GET', '/api/company/:id/hall/workspace/file', 'One file and its versions. ?path= &version='],
  ['PUT', '/api/company/:id/hall/workspace/file', 'Write a file as the owner (locked ones too). Body: workspaceWrite.'],
  ['POST', '/api/company/:id/hall/workspace/lock', 'Lock or unlock a file. Body: workspaceLock.'],
  ['DELETE', '/api/company/:id/hall/workspace/file', 'Remove a file. ?path='],
  ['GET', '/api/company/:id/hall/board', 'The tasks. ?status= &closed=1'],
  ['POST', '/api/company/:id/hall/board', 'Add a task as the owner. Body: boardCreate.'],
  ['PATCH', '/api/company/:id/hall/board/:task', 'Change a task. Body: boardPatch.'],
  ['DELETE', '/api/company/:id/hall/board/:task', 'Remove a task.'],
  ['POST', '/api/company/:id/hall/board/:task/team', 'Make a room (a task team) for a task: its lead and members are seated in it. Only you can.'],
  ['GET', '/api/company/:id/hall/norms', 'The working agreements people proposed. ?status='],
  ['POST', '/api/company/:id/hall/norms/:norm/approve', 'Approve one: it joins everyone\'s fixed layer under the house rules.'],
  ['POST', '/api/company/:id/hall/norms/:norm/reject', 'Reject one.'],
  ['POST', '/api/company/:id/hall/norms/:norm/withdraw', 'End an approved one.'],
].map(([method, path, description]) => ({ method, path, description }));

/** @param {ReturnType<import('../company/index.js').createCompanyServices>} services */
export function createCompanyRouter(services) {
  const { store, audit, publish, operator } = services;
  const router = Router();

  // Every change is a JSON request. A page on another origin cannot send one without a preflight (which the CORS list refuses), so a
  // hostile page cannot press "approve" for the owner with a plain form post or a text/plain fetch.
  router.use(jsonOnlyChanges);

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
  router.get('/house-rules', (req, res) => res.json({ ...DEFAULT_HOUSE_RULES, maxChars: HOUSE_RULES_MAX_CHARS }));

  // ── the roster, the people, the Hall ───────────────────────────────────────
  // (mounted before the routes of a single company, so that "roster" is never read as a company id)

  router.use('/roster', createRosterRouter(services));
  router.use('/:id/people', createPeopleRouter(services));
  router.use('/:id/hall', createHallRouter(services));

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
    // the people who worked there, what they remembered there, and everything the Hall kept for it (nothing is created by asking)
    const hall = services.tryHall();
    if (hall) { hall.removeCompany(req.visitorId, req.params.id); hall.roster.removeCompany(req.visitorId, req.params.id); }
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
    // Made from inside a department's room (an X-Room-Id header, which the room middleware has already checked belongs to this visitor),
    // the room is known without being named again, as the schema says. A roomId in the body still wins.
    const roomId = req.body.roomId || (req.company?.id === company.id ? req.room?.id : null) || null;
    if (roomId && store.roomOwner(roomId)?.company.id !== company.id) {
      throw new PolicyError('That room does not belong to this company.', { status: 400, code: 'bad_proposal', field: 'roomId' });
    }
    // The work comes from the room it is in; a room that is not loaded has nothing to offer but text
    const room = roomId ? peekRoom(roomId) : null;
    const sources = room ? { artifact: (n) => room.artifactStore.get(n) || null, media: (id) => room.mediaStore.get(id) || null } : {};
    const item = await publish.propose(company.id, { ...req.body, ...(roomId ? { roomId } : {}), by: 'owner' }, sources);
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
