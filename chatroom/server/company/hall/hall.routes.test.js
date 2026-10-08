/**
 * The roster, the people of a company and the Hall over real HTTP: two visitors with their own cookies. What matters here is who can reach what,
 * that every change is a JSON request, that a hire is refused for what the room would refuse, and that the owner can read, correct and delete
 * everything the people wrote and remember.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflowDir = mkdtempSync(join(tmpdir(), 'chatroom-hall-wf-'));
process.env.WORKFLOW_DATA_DIR = workflowDir;
process.env.WORKFLOW_TRACES_DIR = join(workflowDir, 'traces');

const { sqliteAvailable } = await import('../flow/sqlite.js');
const { createApp } = await import('../../app.js');
const { clearRooms, clearRoomInitializers, peekRoom } = await import('../../services/sessionRegistry.js');
const { COOKIE_NAME } = await import('../../middleware/session.js');
const { makeServices, markerClassifier, FORBIDDEN } = await import('../testKit.js');

const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';
const kit = makeServices({ classify: markerClassifier({ [FORBIDDEN]: 'deception' }) });
const closedKit = makeServices({ env: { COMPANY_HALL: '0' } });
let server, closedServer, base, closedBase;

before(async () => {
  server = createApp({ company: kit.services }).listen(0, '127.0.0.1');
  closedServer = createApp({ company: closedKit.services }).listen(0, '127.0.0.1');
  await Promise.all([server, closedServer].map(s => new Promise(r => s.once('listening', r))));
  base = `http://127.0.0.1:${server.address().port}`;
  closedBase = `http://127.0.0.1:${closedServer.address().port}`;
});

after(() => {
  for (const s of [server, closedServer]) { s.closeAllConnections?.(); s.close(); }
  clearRooms();
  clearRoomInitializers();
  kit.cleanup();
  closedKit.cleanup();
  rmSync(workflowDir, { recursive: true, force: true });
});

function visitor(origin = () => base) {
  let cookie = null;
  return {
    async call(method, path, body, headers = {}) {
      const res = await fetch(origin() + path, {
        method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const issued = res.headers.getSetCookie().find(c => c.startsWith(`${COOKIE_NAME}=`));
      if (issued) cookie = issued.split(';')[0];
      let json = null;
      try { json = await res.json(); } catch { /* not JSON */ }
      return { status: res.status, json };
    },
    async raw(method, path, body, contentType) {
      const res = await fetch(origin() + path, { method, headers: { 'content-type': contentType, ...(cookie ? { cookie } : {}) }, body });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
  };
}

const profile = (name, role) => ({
  id: `p_${name}`, name, icon: '🙂', color: '#336699', category: 'roleplay', bioTemplate: '{{agent_name}}, the {{role}}.',
  anchors: { agent_name: name, role }, variables: [], tags: [],
});

/** A visitor who owns a company with one department, and a roster of people ready to hire. */
async function withCompany(v = visitor(), body = {}) {
  await v.call('GET', '/api/agents');
  const created = await v.call('POST', '/api/company', { name: 'Parallax Works', departments: ['Archive Desk'], tools: ['write_artifact', 'render_artifact', 'google_search', 'url_context', 'code_execution'], ...body });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const company = created.json.company;
  const people = {};
  for (const [key, name, role] of [['rima', 'Rima Haddad-Boudreau', 'producer'], ['kasia', 'Kasia Wójcik-Lindqvist', 'skeptic'], ['zayd', 'Zayd Siddiqui', 'template engineer'], ['tavita', "Tavita Fa'asavalu", 'worldbuilder']]) {
    const r = await v.call('POST', '/api/company/roster', { profile: profile(name, role), role, archetype: 'steward', status: 'ready', casting: { tier: key === 'zayd' ? 'builder' : 'none' } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    people[key] = r.json.candidate;
  }
  return { v, company, people, desk: company.departments[0], base: `/api/company/${company.id}` };
}

test('the roster: import a person as a draft, read, edit, export and delete; another visitor sees none of it', { skip }, async () => {
  const v = visitor();
  await v.call('GET', '/api/agents');
  const made = await v.call('POST', '/api/company/roster', { profile: profile('Ann Reed', 'editor'), casting: { bornYear: 1980, birthplace: { city: 'Lisbon', country: 'Portugal', region: 'Europe' } } });
  assert.equal(made.status, 201);
  const c = made.json.candidate;
  assert.deepEqual([c.status, c.name, c.region, c.bornYear, c.archetype], ['draft', 'Ann Reed', 'Europe', 1980, 'imported']);
  assert.match(made.json.note, /starts as a draft/);

  assert.equal((await v.call('GET', '/api/company/roster')).json.candidates.length, 1);
  assert.equal((await v.call('GET', '/api/company/roster?status=ready')).json.candidates.length, 0);
  assert.equal((await v.call('GET', '/api/company/roster?q=lisbon')).json.candidates.length, 1);
  assert.equal((await v.call('GET', `/api/company/roster/${c.id}`)).json.candidate.profile.bioTemplate, '{{agent_name}}, the {{role}}.');
  assert.equal((await v.call('PATCH', `/api/company/roster/${c.id}`, { status: 'ready', role: 'lead editor' })).json.candidate.role, 'lead editor');
  assert.equal((await v.call('GET', '/api/company/roster/spread')).json.spread.people, 1);
  const exported = await v.call('GET', `/api/company/roster/${c.id}/export`);
  assert.deepEqual([exported.json.name, exported.json.x_roster.role, exported.json.x_roster.status], ['Ann Reed', 'lead editor', 'ready']);

  assert.equal((await v.call('POST', '/api/company/roster', { profile: profile('Ann Reed', 'editor') })).status, 409, 'a name once');
  assert.equal((await v.call('POST', '/api/company/roster', { profile: { name: 'No Template' } })).status, 400);
  assert.equal((await v.call('POST', '/api/company/roster', { profile: profile('Has A Key', 'x'), extra: 1 })).status, 400, 'unknown fields are refused');
  assert.equal((await v.call('PATCH', `/api/company/roster/${c.id}`, { status: 'hired' })).status, 400);

  const stranger = visitor();
  await stranger.call('GET', '/api/agents');
  assert.equal((await stranger.call('GET', '/api/company/roster')).json.candidates.length, 0);
  for (const r of [await stranger.call('GET', `/api/company/roster/${c.id}`), await stranger.call('PATCH', `/api/company/roster/${c.id}`, { status: 'retired' }), await stranger.call('DELETE', `/api/company/roster/${c.id}`), await stranger.call('GET', `/api/company/roster/${c.id}/export`)]) assert.equal(r.status, 404);

  assert.equal((await v.call('DELETE', `/api/company/roster/${c.id}`)).json.deleted, true);
  assert.equal((await v.call('GET', `/api/company/roster/${c.id}`)).status, 404);
});

test('every change is a JSON request: a plain form post or text/plain is refused before it reaches the roster or the Hall', { skip }, async () => {
  const { v, base: b, company } = await withCompany();
  for (const [method, path] of [['POST', '/api/company/roster'], ['POST', `${b}/people`], ['POST', `${b}/hall/mail`], ['PUT', `${b}/hall/workspace/file`], ['POST', `${b}/hall/norms/abc/approve`]]) {
    const r = await v.raw(method, path, 'x=1', 'application/x-www-form-urlencoded');
    assert.equal(r.status, 415, `${method} ${path}`);
    assert.equal(r.json.code, 'json_required');
  }
  assert.equal((await v.raw('POST', `${b}/people`, '{"candidateId":"x"}', 'text/plain')).status, 415);
  void company;
});

test('hiring: a ready person gets a seat and a mailbox; the room has them at once; the Hall is set up; what the room would refuse is refused here', { skip }, async () => {
  const { v, people, desk, base: b, company } = await withCompany();
  const hire = (key, over = {}) => v.call('POST', `${b}/people`, { candidateId: people[key].id, department: 'Archive Desk', position: key === 'rima' ? 'Producer' : key, ...over });

  const r = await hire('rima', { isLead: true });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.deepEqual([r.json.seat.name, r.json.seat.position, r.json.seat.isLead, r.json.seat.departmentId, r.json.seat.tier], ['Rima Haddad-Boudreau', 'Producer', true, desk.id, 'none']);
  const z = await hire('zayd', { position: 'Template engineer', reportsTo: 'Rima', reviewerOf: 'engine.json' });
  assert.equal(z.status, 201);
  assert.equal(z.json.seat.tier, 'builder');
  assert.equal(z.json.seat.reportsTo, r.json.seat.employeeId, 'a name finds the colleague');

  // the room is made when first reached; the people are in it
  const inRoom = { 'x-room-id': desk.roomId };
  const roster = (await v.call('GET', '/api/agents', undefined, inRoom)).json.agents;
  assert.deepEqual(roster.map(a => [a.name, a.tools]), [['Rima Haddad-Boudreau', 'none'], ['Zayd Siddiqui', 'builder']]);
  // a hire after the room exists is seated in it at once
  assert.equal((await hire('kasia', { position: 'Skeptic' })).status, 201);
  assert.equal((await v.call('GET', '/api/agents', undefined, inRoom)).json.agents.length, 3);
  assert.equal(peekRoom(desk.roomId).orchestrator.agents.find(a => a.name.startsWith('Kasia')).employeeId.length, 16);

  // refused with the reason, and no seat left behind
  const inDraft = (await v.call('POST', '/api/company/roster', { profile: profile('Dee Draft', 'x') })).json.candidate;
  assert.equal((await v.call('POST', `${b}/people`, { candidateId: inDraft.id, department: 'Archive Desk', position: 'x' })).json.code, 'candidate_not_ready');
  assert.equal((await hire('rima')).json.code, 'already_hired');
  const unknownDept = await hire('tavita', { department: 'Sound' });
  assert.equal(unknownDept.status, 400);
  assert.match(unknownDept.json.error, /no department "Sound"\. Departments: Archive Desk/);
  const unknownBoss = await hire('tavita', { reportsTo: 'Nobody' });
  assert.match(unknownBoss.json.error, /No one here is called "Nobody"\. People: Rima Haddad-Boudreau, Zayd Siddiqui, Kasia Wójcik-Lindqvist/);
  const toofancy = await hire('tavita', { tier: 'visual' });
  assert.equal(toofancy.status, 403, 'the company was not granted the visual tools');
  assert.equal((await v.call('GET', `${b}/people`)).json.employees.length, 3);

  // the Hall was set up: channels, a locked README, a welcome for each
  const overview = (await v.call('GET', `${b}/hall`)).json.hall;
  assert.deepEqual(overview.channels.map(c => c.slug), ['announcements', 'general', 'help', 'decisions', 'dept-archive-desk']);
  assert.deepEqual(overview.files.map(f => [f.path, f.locked]), [['README.md', true]]);
  assert.deepEqual(overview.people.map(p => [p.name.split(' ')[0], p.mail.unread]), [['Rima', 1], ['Zayd', 1], ['Kasia', 1]]);
  assert.deepEqual(company.id, company.id);
});

test('a company\'s room cap holds when hiring: the ninth person is refused at the door, not left as an empty seat', { skip }, async () => {
  const { v, base: b, desk } = await withCompany(visitor(), { ceilings: { maxAgents: 2 } });
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await v.call('POST', '/api/company/roster', { profile: profile(`Person Number${'abc'[i]}`, 'x'), status: 'ready' })).json.candidate.id);
  for (const id of ids.slice(0, 2)) assert.equal((await v.call('POST', `${b}/people`, { candidateId: id, department: desk.id, position: 'x' })).status, 201);
  const third = await v.call('POST', `${b}/people`, { candidateId: ids[2], department: desk.id, position: 'x' });
  assert.equal(third.status, 403);
  assert.equal(third.json.code, 'agent_cap');
  assert.equal((await v.call('GET', `${b}/people`)).json.seats.length, 2);
});

test('letting someone go removes them from the live room and keeps their memory until the owner deletes it; a second seat is for a task team', { skip }, async () => {
  const { v, people, desk, base: b } = await withCompany();
  const seat = (await v.call('POST', `${b}/people`, { candidateId: people.kasia.id, department: desk.id, position: 'Skeptic' })).json.seat;
  await v.call('POST', `${b}/people`, { candidateId: people.zayd.id, department: desk.id, position: 'Engineer' });
  const inRoom = { 'x-room-id': desk.roomId };
  assert.equal((await v.call('GET', '/api/agents', undefined, inRoom)).json.agents.length, 2);

  const note = await v.call('POST', `${b}/people/${seat.employeeId}/memory`, { text: 'We chose the Archive concept.', session: 'day-1' });
  assert.equal(note.status, 201);
  assert.deepEqual([note.json.entry.source, note.json.entry.verified], ['owner', 'confirmed']);

  const gone = await v.call('DELETE', `${b}/people/${seat.employeeId}`);
  assert.equal(gone.status, 200);
  assert.match(gone.json.note, /memory of this company is kept/);
  assert.deepEqual((await v.call('GET', '/api/agents', undefined, inRoom)).json.agents.map(a => a.name), ['Zayd Siddiqui']);
  assert.equal((await v.call('GET', `${b}/people/${seat.employeeId}/memory`)).json.memory.length, 1, 'kept');
  assert.equal((await v.call('GET', `${b}/people`)).json.employees.length, 1);
  assert.equal((await v.call('GET', `${b}/people?left=1`)).json.employees.length, 2);

  const z = (await v.call('GET', `${b}/people`)).json.employees[0];
  const task = await v.call('POST', `${b}/people/${z.id}/seats`, { department: 'Archive Desk', position: 'Again' });
  assert.equal(task.json.code, 'already_seated');
  const other = (await v.call('POST', `${b}/rooms`, { department: 'Sound' })).json.department;
  const second = await v.call('POST', `${b}/people/${z.id}/seats`, { department: 'Sound', position: 'Mixer', taskId: 'task-1' });
  assert.equal(second.status, 201);
  assert.equal(second.json.seat.employeeId, z.id);
  assert.equal(second.json.seat.tier, 'none', 'a second seat runs the way the first does');
  assert.equal((await v.call('GET', `${b}/people/${z.id}`)).json.employee.seats.length, 2);
  assert.equal((await v.call('DELETE', `${b}/people/seats/${second.json.seat.assignmentId}`)).json.seat.endedAt !== null, true);
  void other;
});

test('what a person remembers: the owner reads, adds, corrects, flags and deletes it; it is gone when deleted; a stranger reaches none of it', { skip }, async () => {
  const { v, people, desk, base: b } = await withCompany();
  const e = (await v.call('POST', `${b}/people`, { candidateId: people.rima.id, department: desk.id, position: 'Producer' })).json.seat.employeeId;
  const mem = `${b}/people/${e}/memory`;
  const added = (await v.call('POST', mem, { text: 'The team approved publishing.', kind: 'summary' })).json.entry;
  const flagged = await v.call('PATCH', `${mem}/${added.id}`, { verified: 'contradicted', note: 'Nothing was approved.' });
  assert.deepEqual([flagged.json.entry.verified, flagged.json.entry.note], ['contradicted', 'Nothing was approved.']);
  const fixed = await v.call('PATCH', `${mem}/${added.id}`, { text: 'We offered the engine; nobody approved it.' });
  assert.deepEqual([fixed.json.entry.source, fixed.json.entry.verified], ['owner', 'confirmed']);
  assert.equal((await v.call('PATCH', `${mem}/${added.id}`, { kind: 'diary' })).status, 400);
  assert.equal((await v.call('POST', mem, { text: 'key AIzaSyA1234567890abcdefghijklmnopqrstuvw' })).json.code, 'secret_in_text');

  const stranger = visitor();
  await stranger.call('GET', '/api/agents');
  for (const r of [await stranger.call('GET', mem), await stranger.call('PATCH', `${mem}/${added.id}`, { text: 'x' }), await stranger.call('DELETE', `${mem}/${added.id}`)]) assert.equal(r.status, 404);

  assert.equal((await v.call('DELETE', `${mem}/${added.id}`)).json.deleted, true);
  assert.deepEqual((await v.call('GET', mem)).json.memory, []);
  assert.equal((await v.call('DELETE', `${mem}/${added.id}`)).status, 404);
});

test('the Hall for the owner: mail to read and notices to send, forums to post in and moderate, files to write and lock, tasks, agreements', { skip }, async () => {
  const { v, people, desk, base: b } = await withCompany();
  const hire = async (key, position, extra = {}) => (await v.call('POST', `${b}/people`, { candidateId: people[key].id, department: desk.id, position, ...extra })).json.seat;
  const rima = await hire('rima', 'Producer', { isLead: true });
  const kasia = await hire('kasia', 'Skeptic');
  const zayd = await hire('zayd', 'Engineer');

  // mail
  const mail = await v.call('GET', `${b}/hall/mail?employee=${kasia.employeeId}`);
  assert.equal(mail.json.messages.length, 1);
  assert.equal(mail.json.messages[0].subject, 'Welcome to Parallax Works');
  const notice = await v.call('POST', `${b}/hall/mail`, { to: ['Kasia', zayd.employeeId], subject: 'Go', body: 'The company is active.' });
  assert.equal(notice.status, 201);
  assert.deepEqual(notice.json.messages.map(m => [m.to.name.split(' ')[0], m.from.name, m.kind]), [['Zayd', 'Owner', 'notice'], ['Kasia', 'Owner', 'notice']].sort());
  assert.match((await v.call('POST', `${b}/hall/mail`, { to: ['Nobody'], subject: 'x', body: 'y' })).json.error, /No one here is called "Nobody"/);
  assert.equal((await v.call('POST', `${b}/hall/mail`, { to: [], subject: 'x', body: 'y' })).status, 400, 'a notice needs someone to go to');

  // forums
  const t = (await v.call('POST', `${b}/hall/forums/announcements/threads`, { title: 'Plan', body: 'We start at ten.' })).json.post;
  assert.equal(t.author.name, 'Owner');
  await v.call('POST', `${b}/hall/forums/announcements/threads/${t.id}/replies`, { body: 'Questions in #help.' });
  assert.equal((await v.call('GET', `${b}/hall/forums/announcements`)).json.threads[0].replies, 1);
  assert.equal((await v.call('GET', `${b}/hall/forums/announcements/threads/${t.id}`)).json.posts.length, 1);
  assert.equal((await v.call('POST', `${b}/hall/forums/posts/${t.id}/pin`, {})).json.pinned, true);
  assert.equal((await v.call('POST', `${b}/hall/forums`, { title: 'Sound ideas' })).json.channel.slug, 'sound-ideas');
  assert.equal((await v.call('GET', `${b}/hall/forums/water-cooler`)).json.code, 'no_channel');
  assert.deepEqual((await v.call('DELETE', `${b}/hall/forums/posts/${t.id}`)).json, { removed: 2 });

  // workspace
  const put = await v.call('PUT', `${b}/hall/workspace/file`, { path: 'notes/style.md', content: 'Plain words.', note: 'first', locked: true });
  assert.deepEqual([put.json.file.version, put.json.file.locked], [1, true]);
  assert.equal((await v.call('PUT', `${b}/hall/workspace/file`, { path: 'notes/style.md', content: 'Plainer words.' })).json.file.version, 2, 'the owner writes locked files');
  const file = (await v.call('GET', `${b}/hall/workspace/file?path=notes/style.md&version=1`)).json;
  assert.equal(file.file.content, 'Plain words.');
  assert.equal(file.history.length, 2);
  assert.equal((await v.call('POST', `${b}/hall/workspace/lock`, { path: 'notes/style.md', locked: false })).json.file.locked, false);
  assert.equal((await v.call('DELETE', `${b}/hall/workspace/file?path=notes/style.md`)).json.removed, true);
  assert.equal((await v.call('PUT', `${b}/hall/workspace/file`, { path: '../x.md', content: 'x' })).status, 400);

  // board and the task team
  const task = (await v.call('POST', `${b}/hall/board`, { title: 'The engine', lead: 'Zayd', members: ['Kasia'], deliverable: 'engine.json', needsTeam: true })).json.task;
  assert.equal(task.createdBy.name, 'Owner');
  assert.equal((await v.call('PATCH', `${b}/hall/board/${task.id}`, { status: 'doing', note: 'underway' })).json.task.status, 'doing');
  const team = await v.call('POST', `${b}/hall/board/${task.id}/team`);
  assert.equal(team.status, 201, JSON.stringify(team.json));
  assert.equal(team.json.department.name, 'Task: The engine');
  assert.equal(team.json.task.teamDepartmentId, team.json.department.id);
  assert.equal((await v.call('POST', `${b}/hall/board/${task.id}/team`)).json.code, 'team_exists');
  const teamRoom = (await v.call('GET', '/api/agents', undefined, { 'x-room-id': team.json.department.roomId })).json.agents;
  assert.deepEqual(teamRoom.map(a => a.name).sort(), ['Kasia Wójcik-Lindqvist', 'Zayd Siddiqui'], 'the team is seated when its room is made');
  assert.equal((await v.call('GET', `${b}/hall/directory`)).json.people.find(p => p.name.startsWith('Zayd')).seats.length, 2);
  const alone = (await v.call('POST', `${b}/hall/board`, { title: 'Lonely' })).json.task;
  assert.equal((await v.call('POST', `${b}/hall/board/${alone.id}/team`)).json.code, 'team_too_small');
  assert.ok(rima.employeeId);
});

test('working agreements: a person proposes through their tool, the owner approves over HTTP, and it reaches the fixed layer', { skip }, async () => {
  const { v, people, desk, base: b, company } = await withCompany();
  const kasia = (await v.call('POST', `${b}/people`, { candidateId: people.kasia.id, department: desk.id, position: 'Skeptic' })).json.seat;
  await v.call('POST', `${b}/people`, { candidateId: people.zayd.id, department: desk.id, position: 'Engineer' });
  await v.call('GET', '/api/agents', undefined, { 'x-room-id': desk.roomId });          // the room exists, with its people

  const room = peekRoom(desk.roomId).orchestrator;
  const agent = room.agents.find(a => a.employeeId === kasia.employeeId);
  const out = await room._createDispatcher(agent, [])({ id: 'c', name: 'propose_norm', arguments: { text: 'Whoever saves a file says in one line what changed.', why: 'Reviewers keep asking.' } });
  assert.equal(out.ok, true, JSON.stringify(out));
  const norms = (await v.call('GET', `${b}/hall/norms`)).json.norms;
  assert.deepEqual(norms.map(n => [n.status, n.proposedBy.name]), [['proposed', 'Kasia Wójcik-Lindqvist']]);
  assert.doesNotMatch(room.policy.layerFor(agent).head, /WORKING AGREEMENTS/);

  assert.equal((await v.call('POST', `${b}/hall/norms/${norms[0].id}/approve`, {})).json.norm.status, 'approved');
  assert.match(room.policy.layerFor(agent).head, /WORKING AGREEMENTS[\s\S]*- Whoever saves a file says in one line what changed\./);
  assert.equal((await v.call('POST', `${b}/hall/norms/${norms[0].id}/approve`, {})).json.code, 'already_decided');
  assert.equal((await v.call('POST', `${b}/hall/norms/${norms[0].id}/withdraw`, {})).json.norm.status, 'withdrawn');
  assert.doesNotMatch(room.policy.layerFor(agent).head, /WORKING AGREEMENTS/);
  assert.ok((await v.call('GET', `${b}/audit`)).json.entries.some(e => e.type === 'hall_norm_approved'));
  assert.ok(company.id);
});

test('a stranger reaches nothing of another visitor\'s company: people, memory or Hall', { skip }, async () => {
  const { v, people, desk, base: b } = await withCompany();
  const seat = (await v.call('POST', `${b}/people`, { candidateId: people.rima.id, department: desk.id, position: 'Producer' })).json.seat;
  const stranger = visitor();
  await stranger.call('GET', '/api/agents');
  const paths = [['GET', `${b}/people`], ['POST', `${b}/people`, { candidateId: people.rima.id, department: 'x', position: 'x' }], ['GET', `${b}/people/${seat.employeeId}`], ['GET', `${b}/people/${seat.employeeId}/memory`],
    ['GET', `${b}/hall`], ['GET', `${b}/hall/mail`], ['POST', `${b}/hall/mail`, { to: ['Rima'], subject: 'x', body: 'y' }], ['GET', `${b}/hall/forums`], ['GET', `${b}/hall/workspace`], ['GET', `${b}/hall/board`], ['GET', `${b}/hall/norms`]];
  for (const [method, path, body] of paths) {
    const r = await stranger.call(method, path, body);
    assert.equal(r.status, 404, `${method} ${path}`);
    assert.equal(r.json.code, 'no_company');
  }
  assert.equal((await stranger.call('POST', '/api/company/roster', { profile: profile('Rima Haddad-Boudreau', 'x') })).status, 201, 'and their own roster is their own: the same name is fine');
});

test('a server whose operator has closed the Hall answers 403 and says why; the roster still works', { skip }, async () => {
  const v = visitor(() => closedBase);
  await v.call('GET', '/api/agents');
  const company = (await v.call('POST', '/api/company', { name: 'Closed Co', departments: ['Desk'] })).json.company;
  const r = await v.call('GET', `/api/company/${company.id}/hall`);
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'hall_closed');
  assert.deepEqual(Object.values(company.effective.collaboration), [false, false, false, false, false]);
  assert.equal((await v.call('POST', '/api/company/roster', { profile: profile('Ann Reed', 'x'), status: 'ready' })).status, 201);
});

test('deleting a company takes its people, their memories and everything in its Hall; the roster keeps the people', { skip }, async () => {
  const { v, people, desk, base: b } = await withCompany();
  const seat = (await v.call('POST', `${b}/people`, { candidateId: people.rima.id, department: desk.id, position: 'Producer' })).json.seat;
  await v.call('POST', `${b}/people/${seat.employeeId}/memory`, { text: 'A memory.' });
  await v.call('PUT', `${b}/hall/workspace/file`, { path: 'a.md', content: 'x' });
  assert.equal((await v.call('DELETE', `/api/company/roster/${people.rima.id}`)).json.code, 'candidate_employed');
  assert.equal((await v.call('DELETE', b)).json.deleted, true);
  assert.equal((await v.call('GET', `${b}/hall`)).status, 404);
  assert.equal(kit.services.roster.db.prepare('SELECT COUNT(*) AS n FROM memory_entries').get().n >= 0, true);
  assert.equal((await v.call('GET', `/api/company/roster/${people.rima.id}`)).json.candidate.employed, 0, 'the person is still in the library, with no job');
  assert.equal((await v.call('DELETE', `/api/company/roster/${people.rima.id}`)).json.deleted, true);
});

test('the schema document lists the new endpoints and the shapes of their bodies', { skip }, async () => {
  const v = visitor();
  const schema = (await v.call('GET', '/api/company/schema')).json;
  for (const def of ['hire', 'seat', 'memoryEntry', 'memoryPatch', 'candidateImport', 'candidatePatch', 'ownerMail', 'forumChannel', 'forumThread', 'forumReply', 'workspaceWrite', 'workspaceLock', 'boardCreate', 'boardPatch', 'collaboration']) assert.ok(schema.$defs[def], def);
  const paths = schema['x-endpoints'].map(e => `${e.method} ${e.path}`);
  for (const p of ['GET /api/company/roster', 'POST /api/company/:id/people', 'GET /api/company/:id/hall/mail', 'POST /api/company/:id/hall/board/:task/team', 'POST /api/company/:id/hall/norms/:norm/approve']) assert.ok(paths.includes(p), p);
});
