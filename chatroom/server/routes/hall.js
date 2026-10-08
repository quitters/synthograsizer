/**
 * /api/company/:id/hall: the owner's view of, and hand in, the Hall.
 *
 * The people of a company reach each other through mailboxes, forums, the workspace and the board (company/hall/). The owner can read all of
 * it, always: there is no channel here that the owner cannot see. The owner can also write to it (a notice to some people, a post, a file, a task),
 * lock a file, pin or remove a post, decide the working agreements the people propose, and make a room for a task team.
 *
 * Nothing an agent holds reaches these routes: the owner is the visitor who made the company, and another visitor's company is "no such company".
 */
import { Router } from 'express';
import { SCHEMAS } from '../company/schema.js';
import { PolicyError } from '../company/errors.js';
import { handle, checkBody, OWNER_AUTHOR } from './httpUtil.js';

/** @param {ReturnType<import('../company/index.js').createCompanyServices>} services */
export function createHallRouter(services) {
  const router = Router({ mergeParams: true });
  const { store, audit } = services;

  /** The owner's company, the Hall, and the pieces every route wants. */
  const open = (req) => {
    const company = store.getOwned(req.params.id, req.visitorId);
    if (!services.operator.hall.enabled) throw new PolicyError('The Hall is closed on this server by its operator.', { status: 403, code: 'hall_closed' });
    const hall = services.hall;
    const shape = { id: company.id, name: company.name, departments: company.departments.map(d => ({ id: d.id, name: d.name })) };
    return { company, hall, shape, ownerId: req.visitorId, id: company.id };
  };
  const q = (req, name) => (typeof req.query[name] === 'string' ? req.query[name] : null);

  router.get('/', handle((req, res) => {
    const { hall, shape, ownerId } = open(req);
    res.json({ hall: hall.overview(ownerId, shape) });
  }));

  router.get('/directory', handle((req, res) => {
    const { hall, shape, ownerId } = open(req);
    res.json({ people: hall.directory(ownerId, shape) });
  }));

  // ── mailboxes ──────────────────────────────────────────────────────────────

  router.get('/mail', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    res.json({
      messages: hall.mail.forOwner(ownerId, id, { toId: q(req, 'employee'), state: q(req, 'state'), thread: q(req, 'thread'), limit: Number(req.query.limit) || 100 }),
      counts: hall.mail.counts(ownerId, id),
    });
  }));

  router.post('/mail', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const body = checkBody(SCHEMAS.ownerMail, req.body);
    const people = hall.mail.people(ownerId, id);
    const byId = people.filter(p => body.to.includes(p.id));
    const { found, unknown, ambiguous } = hall.mail.resolve(people, body.to.filter(t => !byId.some(p => p.id === t)));
    if (unknown.length || ambiguous.length) {
      throw new PolicyError(`${unknown.length ? `No one here is called ${unknown.map(n => `"${n}"`).join(', ')}. ` : ''}${ambiguous.length ? `${ambiguous.map(n => `"${n}"`).join(', ')} could be more than one person. ` : ''}People: ${people.map(p => p.name).join(', ')}.`, { status: 400, code: 'bad_request', field: 'to' });
    }
    const toIds = [...new Set([...byId, ...found].map(p => p.id))];
    const messages = hall.mail.notify(ownerId, id, { from: 'Owner', toIds, subject: body.subject, body: body.body });
    audit.append(id, { type: 'hall_owner_notice', to: messages.length });
    res.status(201).json({ messages });
  }));

  // ── forums ─────────────────────────────────────────────────────────────────

  router.get('/forums', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    res.json({ channels: hall.forum.channels(ownerId, id) });
  }));

  router.post('/forums', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const body = checkBody(SCHEMAS.forumChannel, req.body);
    const channel = hall.forum.addChannel(ownerId, id, body);
    audit.append(id, { type: 'hall_channel_added', channel: channel.slug });
    res.status(201).json({ channel });
  }));

  router.get('/forums/:slug', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    res.json(hall.forum.read(ownerId, id, { channel: req.params.slug, limit: Number(req.query.limit) || undefined }));
  }));

  router.get('/forums/:slug/threads/:thread', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    res.json(hall.forum.read(ownerId, id, { threadId: req.params.thread }));
  }));

  router.post('/forums/:slug/threads', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const body = checkBody(SCHEMAS.forumThread, req.body);
    res.status(201).json({ post: hall.forum.post(ownerId, id, OWNER_AUTHOR, { channel: req.params.slug, title: body.title, body: body.body }) });
  }));

  router.post('/forums/:slug/threads/:thread/replies', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const body = checkBody(SCHEMAS.forumReply, req.body);
    res.status(201).json({ post: hall.forum.reply(ownerId, id, OWNER_AUTHOR, { threadId: req.params.thread, body: body.body }) });
  }));

  router.post('/forums/posts/:post/pin', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    res.json(hall.forum.pin(ownerId, id, req.params.post, req.body?.pinned !== false));
  }));

  router.delete('/forums/posts/:post', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const out = hall.forum.removePost(ownerId, id, req.params.post);
    audit.append(id, { type: 'hall_post_removed' });
    res.json(out);
  }));

  // ── the workspace ──────────────────────────────────────────────────────────

  router.get('/workspace', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    res.json({ files: hall.workspace.list(ownerId, id) });
  }));

  router.get('/workspace/file', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    res.json({ file: hall.workspace.read(ownerId, id, q(req, 'path'), { version: req.query.version ? Number(req.query.version) : null }), history: hall.workspace.history(ownerId, id, q(req, 'path')) });
  }));

  router.put('/workspace/file', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const body = checkBody(SCHEMAS.workspaceWrite, req.body);
    let file = hall.workspace.write(ownerId, id, OWNER_AUTHOR, { path: body.path, content: body.content, note: body.note });
    if (typeof body.locked === 'boolean') file = hall.workspace.setLocked(ownerId, id, body.path, body.locked);
    audit.append(id, { type: 'hall_owner_write', path: file.path, version: file.version });
    res.json({ file });
  }));

  router.post('/workspace/lock', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const body = checkBody(SCHEMAS.workspaceLock, req.body);
    const file = hall.workspace.setLocked(ownerId, id, body.path, body.locked);
    audit.append(id, { type: body.locked ? 'hall_file_locked' : 'hall_file_unlocked', path: file.path });
    res.json({ file });
  }));

  router.delete('/workspace/file', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const out = hall.workspace.remove(ownerId, id, q(req, 'path'));
    audit.append(id, { type: 'hall_file_removed', path: q(req, 'path') });
    res.json(out);
  }));

  // ── the board ──────────────────────────────────────────────────────────────

  router.get('/board', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    res.json({ tasks: hall.board.list(ownerId, id, { status: q(req, 'status'), includeClosed: req.query.closed === '1', limit: Number(req.query.limit) || 100 }) });
  }));

  router.post('/board', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const body = checkBody(SCHEMAS.boardCreate, req.body);
    res.status(201).json({ task: hall.board.create(ownerId, id, OWNER_AUTHOR, body) });
  }));

  router.patch('/board/:task', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const body = checkBody(SCHEMAS.boardPatch, req.body);
    res.json({ task: hall.board.update(ownerId, id, OWNER_AUTHOR, req.params.task, body) });
  }));

  router.delete('/board/:task', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    res.json(hall.board.remove(ownerId, id, req.params.task));
  }));

  /**
   * Make a room for a task: a department named for it, with the task's lead and members seated in it as well as where they already sit. Only the
   * owner can: a room is where the company spends money, and this is the owner saying yes. The room is made paused like everything else.
   */
  router.post('/board/:task/team', handle((req, res) => {
    const { hall, ownerId, id, company } = open(req);
    const task = hall.board.get(ownerId, id, req.params.task);
    if (task.teamDepartmentId) throw new PolicyError('This task already has a task team.', { status: 409, code: 'team_exists' });
    const people = [task.lead, ...task.members].filter(Boolean);
    if (people.length < 2) throw new PolicyError('A task team needs a lead and at least one member.', { status: 409, code: 'team_too_small' });
    const cap = store.describe(company).effective.ceilings.maxAgents;
    if (people.length > cap) throw new PolicyError(`A room holds at most ${cap} people; this task has ${people.length}.`, { status: 403, code: 'agent_cap' });
    const department = store.addDepartment(company.id, ownerId, `Task: ${task.title}`.slice(0, 80));
    for (const [i, p] of people.entries()) {
      services.roster.assign(ownerId, p.id, { departmentId: department.id, position: i === 0 ? 'Task lead' : 'Task member', isLead: i === 0, taskId: task.id });
    }
    hall.forum.ensureDefaults(ownerId, id, [{ id: department.id, name: department.name }]);
    audit.append(id, { type: 'task_team_created', task: task.id, department: department.name, people: people.length });
    res.status(201).json({ task: hall.board.setTeam(ownerId, id, task.id, department.id), department: { id: department.id, name: department.name, roomId: department.roomId }, note: 'The room is made. Say go for the company, then start it.' });
  }));

  // ── working agreements ─────────────────────────────────────────────────────

  router.get('/norms', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    res.json({ norms: hall.norms.list(ownerId, id, { status: q(req, 'status') }) });
  }));

  for (const [verb, decision] of [['approve', 'approved'], ['reject', 'rejected']]) {
    router.post(`/norms/:norm/${verb}`, handle((req, res) => {
      const { hall, ownerId, id } = open(req);
      const norm = hall.norms.decide(ownerId, id, req.params.norm, decision);
      audit.append(id, { type: `hall_norm_${decision}`, norm: norm.id });
      res.json({ norm });
    }));
  }

  router.post('/norms/:norm/withdraw', handle((req, res) => {
    const { hall, ownerId, id } = open(req);
    const norm = hall.norms.withdraw(ownerId, id, OWNER_AUTHOR, req.params.norm);
    audit.append(id, { type: 'hall_norm_withdrawn', norm: norm.id });
    res.json({ norm });
  }));

  return router;
}
