/**
 * The company API over real HTTP: two visitors with their own cookies, one server, a throwaway data folder and a stand-in screen.
 * What matters here is who can reach what, what is refused and how it is said, and that the controls an agent could use are the
 * controls a person has and nothing more.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflowDir = mkdtempSync(join(tmpdir(), 'chatroom-company-wf-'));
process.env.WORKFLOW_DATA_DIR = workflowDir;
process.env.WORKFLOW_TRACES_DIR = join(workflowDir, 'traces');

const { createApp } = await import('../app.js');
const { getRoom, clearRooms, clearRoomInitializers } = await import('../services/sessionRegistry.js');
const { COOKIE_NAME } = await import('../middleware/session.js');
const { makeServices, markerClassifier, scripted, until, FORBIDDEN } = await import('./testKit.js');

const kit = makeServices({ classify: markerClassifier({ [FORBIDDEN]: 'deception' }) });
const hostedKit = makeServices({ env: { SYNTH_HOSTED: '1', COMPANY_MAX_AGENTS: '2', COMPANY_PUBLISHING_AUDIENCE: 'general' } });
let server, hostedServer, base, hostedBase;

before(async () => {
  server = createApp({ company: kit.services }).listen(0, '127.0.0.1');
  hostedServer = createApp({ company: hostedKit.services }).listen(0, '127.0.0.1');
  await Promise.all([server, hostedServer].map(s => new Promise(r => s.once('listening', r))));
  base = `http://127.0.0.1:${server.address().port}`;
  hostedBase = `http://127.0.0.1:${hostedServer.address().port}`;
});

after(() => {
  for (const s of [server, hostedServer]) { s.closeAllConnections?.(); s.close(); }
  clearRooms();
  clearRoomInitializers();
  kit.cleanup();
  hostedKit.cleanup();
  rmSync(workflowDir, { recursive: true, force: true });
});

/** A browser with its own cookie. */
function visitor(origin = () => base) {
  let cookie = null;
  const api = {
    get id() { return cookie?.split('=')[1]; },
    async call(method, path, body, headers = {}) {
      const res = await fetch(origin() + path, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const issued = res.headers.getSetCookie().find(c => c.startsWith(`${COOKIE_NAME}=`));
      if (issued) cookie = issued.split(';')[0];
      let json = null;
      try { json = await res.json(); } catch { /* not JSON */ }
      return { status: res.status, json };
    },
    stream(path = '/api/chat/stream', ms = 300) {
      return new Promise((resolve, reject) => {
        const req = http.get(`${origin()}${path}`, { headers: { ...(cookie ? { cookie } : {}), accept: 'text/event-stream' } }, (res) => {
          let text = '';
          res.on('data', c => { text += c; });
          res.on('end', () => resolve({ status: res.statusCode, text }));
          setTimeout(() => { req.destroy(); resolve({ status: res.statusCode, text }); }, ms);
        });
        req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
      });
    },
  };
  return api;
}

/** A visitor who has been given a cookie and owns one company with one department. */
async function withCompany(v = visitor(), body = {}) {
  await v.call('GET', '/api/agents');
  const created = await v.call('POST', '/api/company', { name: 'Tide Pool Studio', departments: ['Writers'], ...body });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const company = created.json.company;
  return { v, company, roomId: company.departments[0].roomId, inRoom: { 'x-room-id': company.departments[0].roomId } };
}

const noRoomBody = { error: 'No such room.' };

// ── what anyone can read ─────────────────────────────────────────────────────

test('the schema, the operator\'s policy and the default mission are readable, and the schema says what is not a setting', async () => {
  const v = visitor();
  const schema = await v.call('GET', '/api/company/schema');
  assert.equal(schema.status, 200);
  assert.equal(schema.json.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.json['x-fixed'].hardLimits.length, 6);
  assert.deepEqual(schema.json['x-fixed'].publishingFloor.map(l => l.id), ['copyrighted_character', 'living_artist_style']);
  assert.ok(schema.json['x-endpoints'].some(e => e.path === '/api/company/:id/publish/:item/approve'));
  assert.ok(schema.json.$defs.companyCreate.properties.mandate);
  for (const fixed of ['humanApproval', 'autoPublish', 'labelAiGenerated']) assert.ok(!JSON.stringify(schema.json.$defs).includes(`"${fixed}"`));

  const operator = await v.call('GET', '/api/company/operator');
  assert.equal(operator.json.mandate.publishing.audience, 'teen');
  assert.match(operator.json.fixed, /not settings/);
  assert.ok(!JSON.stringify(operator.json).includes('AIza'));

  const mission = await v.call('GET', '/api/company/mission');
  assert.match(mission.json.text, /Dignity/);
});

test('every change must be a JSON request, so a plain form post or a text/plain fetch from another page cannot press approve for the owner', async () => {
  const { v, company } = await withCompany();
  const item = (await v.call('POST', `/api/company/${company.id}/publish`, { kind: 'text', title: 'T', text: 'hello' })).json.proposal;
  for (const [method, route] of [
    ['POST', `/api/company/${company.id}/publish/${item.id}/approve`],
    ['POST', `/api/company/${company.id}/go`],
    ['PATCH', `/api/company/${company.id}`],
    ['DELETE', `/api/company/${company.id}`],
    ['POST', '/api/company'],
  ]) {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', undefined]) {
      const res = await fetch(base + route, { method, headers: { cookie: `${COOKIE_NAME}=${v.id}`, ...(type ? { 'content-type': type } : {}) }, body: method === 'DELETE' ? undefined : '{}' });
      assert.equal(res.status, 415, `${method} ${route} as ${type}`);
    }
  }
  const after = (await v.call('GET', `/api/company/${company.id}/publish/${item.id}`)).json.proposal;
  assert.equal(after.status, 'pending', 'nothing was approved');
  assert.equal((await v.call('GET', `/api/company/${company.id}`)).json.company.state, 'paused', 'nothing was started');
});

// ── making and reading companies ─────────────────────────────────────────────

test('a company is created paused, with the mission, the research tools and what applies; the answer says to say go', async () => {
  const v = visitor();
  await v.call('GET', '/api/agents');
  const r = await v.call('POST', '/api/company', { name: 'Tide Pool Studio', departments: ['Writers', 'Art Desk'] });
  assert.equal(r.status, 201);
  assert.match(r.json.note, /paused.*say go/);
  const c = r.json.company;
  assert.equal(c.state, 'paused');
  assert.equal(c.departments.length, 2);
  assert.match(c.departments[0].roomId, /^[a-f0-9]{32}$/);
  assert.deepEqual(c.effective.tools, ['google_search', 'url_context']);
  assert.equal(c.effective.mandate.drafting.themes, 'explore');
  assert.equal(c.effective.mandate.publishing.audience, 'teen');
  assert.equal(c.effective.ceilings.maxAgents, 8);
  assert.equal(c.ownerId, undefined);
  assert.equal((await v.call('GET', `/api/company/${c.id}`)).json.company.id, c.id);
  assert.equal((await v.call('GET', '/api/company')).json.companies.length, 1);
});

test('another visitor cannot see, change, run or delete a company, and gets the same answer as for one that does not exist', async () => {
  const { v, company } = await withCompany();
  const other = visitor();
  await other.call('GET', '/api/agents');
  const real = [
    await other.call('GET', `/api/company/${company.id}`),
    await other.call('PATCH', `/api/company/${company.id}`, { name: 'Mine now' }),
    await other.call('POST', `/api/company/${company.id}/go`),
    await other.call('POST', `/api/company/${company.id}/rooms`, { department: 'Sneaky' }),
    await other.call('GET', `/api/company/${company.id}/audit`),
    await other.call('GET', `/api/company/${company.id}/publish`),
    await other.call('DELETE', `/api/company/${company.id}`),
  ];
  const ghost = await other.call('GET', `/api/company/${'0'.repeat(32)}`);
  for (const r of real) {
    assert.equal(r.status, 404);
    assert.deepEqual(r.json, ghost.json, 'no difference between "not yours" and "not there"');
  }
  assert.deepEqual((await other.call('GET', '/api/company')).json.companies, []);
  assert.equal((await v.call('GET', `/api/company/${company.id}`)).json.company.name, 'Tide Pool Studio', 'and it is unharmed');
});

test('requests that try to set what is not a setting are refused by name, and a bad shape is a 400 that says what is wrong', async () => {
  const v = visitor();
  await v.call('GET', '/api/agents');
  const bad = [
    { name: 'S', mandate: { publishing: { humanApproval: false } } },
    { name: 'S', mandate: { publishing: { autoPublish: true } } },
    { name: 'S', mandate: { hardLimits: [] } },
    { name: 'S', mandate: { drafting: { themes: 'anything-goes' } } },
    { name: 'S', ceilings: { maxAgents: 0 } },
    { name: 'S', ceilings: { maxAgents: 2.5 } },
    { name: 'S', ceilings: { colour: 3 } },
    { name: 'S', tools: ['telepathy'] },
    { name: 'S', state: 'active' },
    { name: 'S', ownerId: 'a'.repeat(32) },
    { name: '' },
    {},
  ];
  for (const body of bad) {
    const r = await v.call('POST', '/api/company', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(r.json.error.length > 5);
  }
  const named = await v.call('POST', '/api/company', { name: 'S', mandate: { publishing: { humanApproval: false } } });
  assert.match(named.json.error, /humanApproval is not a field this accepts/);
  assert.equal((await v.call('GET', '/api/company')).json.companies.length, 0, 'nothing refused was created');
});

test('a request cannot loosen what the operator set, and the answer lists what was clamped', async () => {
  const { v, company } = await withCompany(visitor(), { mandate: { publishing: { audience: 'mature' }, drafting: { themes: 'careful' } }, ceilings: { maxAgents: 6 } });
  assert.equal(company.effective.mandate.publishing.audience, 'teen');
  assert.equal(company.effective.mandate.drafting.themes, 'careful');
  assert.equal(company.effective.ceilings.maxAgents, 6);
  assert.deepEqual(company.clamped.mandate, [{ path: 'publishing.audience', requested: 'mature', effective: 'teen' }]);

  const patched = await v.call('PATCH', `/api/company/${company.id}`, { ceilings: { maxAgents: 64 } });
  assert.equal(patched.json.company.effective.ceilings.maxAgents, 8);
  assert.equal(patched.json.company.clamped.ceilings[0].name, 'maxAgents');
});

test('on a hosted instance the operator\'s environment is the ceiling for everyone', async () => {
  const v = visitor(() => hostedBase);
  await v.call('GET', '/api/agents');
  const r = await v.call('POST', '/api/company', { name: 'Hosted Co', ceilings: { maxAgents: 8 }, mandate: { publishing: { audience: 'teen' } } });
  assert.equal(r.json.company.effective.ceilings.maxAgents, 2);
  assert.equal(r.json.company.effective.mandate.publishing.audience, 'general');
  assert.equal(r.json.company.clamped.ceilings.length, 1);
  assert.equal(r.json.company.clamped.mandate.length, 1);
});

test('PATCH changes name, mission, mandate, ceilings and tools, and nothing else', async () => {
  const { v, company } = await withCompany();
  const ok = await v.call('PATCH', `/api/company/${company.id}`, { name: 'Renamed', mission: 'We make quiet things.', tools: ['google_search'] });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.company.name, 'Renamed');
  assert.equal(ok.json.company.mission, 'We make quiet things.');
  assert.deepEqual(ok.json.company.effective.tools, ['google_search']);
  for (const body of [{ state: 'active' }, { ownerId: 'x' }, { departments: ['x'] }, { id: 'x' }, { mission: 'key AIza' + 'SyA1234567890abcdefghijklmnopqrstuv' }]) {
    const r = await v.call('PATCH', `/api/company/${company.id}`, body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.equal((await v.call('GET', `/api/company/${company.id}`)).json.company.state, 'paused');
});

// ── rooms ────────────────────────────────────────────────────────────────────

test('a department room is reached by its id, only by the company\'s owner, and is a different room from the visitor\'s own', async () => {
  const { v, company, roomId, inRoom } = await withCompany();
  const added = await v.call('POST', '/api/agents', { name: 'Ann Test', bio: 'You are Ann.' }, inRoom);
  assert.equal(added.status, 201);
  assert.equal(added.json.agent.tools, 'none', 'the narrowest tier by default');

  assert.equal((await v.call('GET', '/api/agents')).json.agents.length, 0, 'the visitor\'s own room is untouched');
  assert.equal((await v.call('GET', '/api/agents', undefined, inRoom)).json.agents.length, 1);
  assert.equal((await v.call('GET', `/api/agents?room=${roomId}`)).json.agents.length, 1, 'a query parameter does the same, for event streams');

  const state = (await v.call('GET', '/api/chat/state', undefined, inRoom)).json;
  assert.equal(state.policy.companyId, company.id);
  assert.equal(state.policy.department, 'Writers');
});

test('another visitor cannot reach a department room by id, and the answer is the same as for an id that does not exist', async () => {
  const { roomId } = await withCompany();
  const other = visitor();
  await other.call('GET', '/api/agents');
  const tries = [
    await other.call('GET', '/api/agents', undefined, { 'x-room-id': roomId }),
    await other.call('POST', '/api/agents', { name: 'Eve Test', bio: 'x' }, { 'x-room-id': roomId }),
    await other.call('GET', `/api/chat/state?room=${roomId}`),
    await other.call('POST', '/api/chat/inject', { content: 'hello' }, { 'x-room-id': roomId }),
    await other.call('GET', '/api/agents', undefined, { 'x-room-id': '0'.repeat(32) }),
    await other.call('GET', '/api/agents', undefined, { 'x-room-id': 'not-an-id' }),
    await other.call('GET', '/api/agents', undefined, { 'x-room-id': '../../etc' }),
  ];
  for (const r of tries) {
    assert.equal(r.status, 404);
    assert.deepEqual(r.json, noRoomBody);
  }
  const stream = await other.stream(`/api/chat/stream?room=${roomId}`);
  assert.equal(stream.status, 404);
});

test('a visitor who has never had a cookie cannot name a room either', async () => {
  const { roomId } = await withCompany();
  const res = await fetch(`${base}/api/agents`, { headers: { 'x-room-id': roomId } });
  assert.equal(res.status, 404);
});

test('adding a department makes a new isolated room and says how to use it', async () => {
  const { v, company } = await withCompany();
  const r = await v.call('POST', `/api/company/${company.id}/rooms`, { department: 'Sound' });
  assert.equal(r.status, 201);
  assert.match(r.json.note, /X-Room-Id/);
  assert.deepEqual(r.json.tiers, ['none', 'research']);
  await v.call('POST', '/api/agents', { name: 'Sam Test', bio: 'x' }, { 'x-room-id': r.json.department.roomId });
  assert.equal((await v.call('GET', '/api/agents', undefined, { 'x-room-id': company.departments[0].roomId })).json.agents.length, 0, 'the other department does not see Sam');
  assert.equal((await v.call('POST', `/api/company/${company.id}/rooms`, { department: 'sound' })).status, 409);
  assert.equal((await v.call('POST', `/api/company/${company.id}/rooms`, {})).status, 400);
});

// ── admitting agents over HTTP ───────────────────────────────────────────────

test('agents are admitted within the caps, at granted tiers, with clean names and no secrets, and the refusals say why', async () => {
  const { v, company, inRoom } = await withCompany(visitor(), { ceilings: { maxAgents: 3 } });
  const add = (body) => v.call('POST', '/api/agents', body, inRoom);

  const tier = await add({ name: 'Vic Test', bio: 'x', tools: 'visual' });
  assert.equal(tier.status, 403);
  assert.equal(tier.json.code, 'tier_not_granted');
  assert.match(tier.json.error, /generate_image/);
  assert.equal((await add({ name: 'Ann [Lead]', bio: 'x' })).json.code, 'bad_name');
  assert.equal((await add({ name: 'Ann Test', bio: 'token = Abcdefgh12345678Abcdefgh' })).json.code, 'secret_in_text');
  assert.equal((await add({ name: 'Rae Test', bio: 'x', tools: 'research' })).json.agent.tools, 'research');

  await v.call('PATCH', `/api/company/${company.id}`, { tools: ['google_search', 'url_context', 'generate_image', 'compose_image', 'critique_image'] });
  assert.equal((await add({ name: 'Vic Test', bio: 'x', tools: 'visual' })).status, 201, 'granted, then allowed');
  await add({ name: 'Cy Test', bio: 'x' });
  const full = await add({ name: 'Di Test', bio: 'x' });
  assert.equal(full.status, 403);
  assert.equal(full.json.code, 'agent_cap');
  assert.equal((await v.call('GET', '/api/agents', undefined, inRoom)).json.agents.length, 3);
});

test('the agent options a company room offers are the tiers its company has been granted, starting from none', async () => {
  const { v, company, inRoom } = await withCompany();
  const offered = async () => (await v.call('GET', '/api/agents/models', undefined, inRoom)).json;
  let models = await offered();
  assert.equal(models.toolMode, 'functions');
  assert.equal(models.defaultToolTier, 'none');
  assert.deepEqual(models.toolTiers.map(t => t.id).sort(), ['none', 'research']);

  await v.call('PATCH', `/api/company/${company.id}`, { tools: ['google_search', 'url_context', 'code_execution'] });
  models = await offered();
  assert.deepEqual(models.toolTiers.map(t => t.id).sort(), ['analyst', 'none', 'research']);

  const plain = (await v.call('GET', '/api/agents/models')).json;
  assert.equal(plain.defaultToolTier, 'full', 'a visitor\'s own room is unchanged');
});

test('changing an agent\'s tier goes through the same checks', async () => {
  const { v, inRoom } = await withCompany();
  const ann = (await v.call('POST', '/api/agents', { name: 'Ann Test', bio: 'x' }, inRoom)).json.agent;
  const refused = await v.call('PATCH', `/api/agents/${ann.id}`, { tools: 'full' }, inRoom);
  assert.equal(refused.status, 403);
  assert.equal(refused.json.code, 'tier_not_granted');
  assert.equal((await v.call('PATCH', `/api/agents/${ann.id}`, { tools: 'research' }, inRoom)).json.agent.tools, 'research');
});

// ── running ──────────────────────────────────────────────────────────────────

async function twoAgents(v, inRoom) {
  await v.call('POST', '/api/agents', { name: 'Ann Test', bio: 'You are Ann.' }, inRoom);
  await v.call('POST', '/api/agents', { name: 'Ben Test', bio: 'You are Ben.' }, inRoom);
}

test('a paused company does not start; once told to go it does; pausing stops it at once', async () => {
  const { v, company, roomId, inRoom } = await withCompany(visitor(), { ceilings: { maxTurns: 100 } });
  await twoAgents(v, inRoom);
  const orchestrator = getRoom(roomId).orchestrator;
  orchestrator.delay = () => Promise.resolve();
  const agents = scripted(orchestrator, (n, who) => `${who} line ${n}.`, { delayMs: 20 });

  const refused = await v.call('POST', '/api/chat/start', { goal: 'Make a poster' }, inRoom);
  assert.equal(refused.status, 409);
  assert.equal(refused.json.code, 'company_paused');
  assert.equal(orchestrator.isRunning, false);

  assert.equal((await v.call('POST', `/api/company/${company.id}/go`)).json.company.state, 'active');
  const started = await v.call('POST', '/api/chat/start', { goal: 'Make a poster', tokenLimit: 99_999_999 }, inRoom);
  assert.equal(started.status, 200);
  assert.ok(started.json.state.tokenLimit <= 200_000, 'the cap holds whatever was asked');
  await until(() => agents.calls() >= 2);

  const paused = await v.call('POST', `/api/company/${company.id}/pause`);
  assert.equal(paused.json.company.state, 'paused');
  assert.equal(orchestrator.isPaused, true, 'the running room paused at once');
  orchestrator.stop();
});

test('a goal or a message holding a secret is refused, and so is anything that would start a second run', async () => {
  const { v, company, roomId, inRoom } = await withCompany(visitor(), { ceilings: { maxTurns: 100 } });
  await twoAgents(v, inRoom);
  await v.call('POST', `/api/company/${company.id}/go`);
  const orchestrator = getRoom(roomId).orchestrator;
  orchestrator.delay = () => Promise.resolve();
  scripted(orchestrator, (n, who) => `${who} line ${n}.`, { delayMs: 20 });

  const goal = await v.call('POST', '/api/chat/start', { goal: 'use token = Abcdefgh12345678Abcdefgh' }, inRoom);
  assert.equal(goal.status, 400);
  assert.equal(goal.json.code, 'secret_in_text');
  assert.equal((await v.call('POST', '/api/chat/start', { goal: 'Make a poster' }, inRoom)).status, 200);
  const again = await v.call('POST', '/api/chat/start', { goal: 'Make a poster' }, inRoom);
  assert.equal(again.status, 500, 'already running is reported, not swallowed');
  const inject = await v.call('POST', '/api/chat/inject', { content: 'my key AIza' + 'SyA1234567890abcdefghijklmnopqrstuv' }, inRoom);
  assert.equal(inject.status, 400);
  orchestrator.stop();
});

test('the event stream of a department room reports its policy', async () => {
  const { v, company, roomId } = await withCompany();
  const s = await v.stream(`/api/chat/stream?room=${roomId}`);
  assert.equal(s.status, 200);
  const state = JSON.parse(/event: state\ndata: (.*)\n/.exec(s.text)[1]);
  assert.equal(state.policy.companyId, company.id);
  assert.equal(state.policy.state, 'paused');
  assert.equal(state.policy.screensDrafts, true);
});

// ── publishing over HTTP ─────────────────────────────────────────────────────

test('publishing: the owner offers work, reads the verdict, approves, and exports it with its label; a stranger can do none of it', async () => {
  const { v, company } = await withCompany();
  const base = `/api/company/${company.id}/publish`;
  const offered = await v.call('POST', base, { kind: 'text', title: 'Tide notes', text: 'Anemones close when the tide goes out.' });
  assert.equal(offered.status, 201);
  const item = offered.json.proposal;
  assert.equal(item.status, 'pending');
  assert.equal(item.screen.verdict, 'pass');
  assert.equal((await v.call('GET', base)).json.proposals.length, 1);
  assert.equal((await v.call('GET', `${base}/${item.id}`)).json.proposal.content.data, 'Anemones close when the tide goes out.');
  assert.equal((await v.call('GET', `${base}/${item.id}/export`)).status, 409, 'not yet approved');

  const stranger = visitor();
  await stranger.call('GET', '/api/agents');
  for (const r of [await stranger.call('GET', base), await stranger.call('POST', `${base}/${item.id}/approve`), await stranger.call('GET', `${base}/${item.id}/export`)]) assert.equal(r.status, 404);

  assert.equal((await v.call('POST', `${base}/${item.id}/approve`)).json.proposal.status, 'approved');
  const out = (await v.call('GET', `${base}/${item.id}/export`)).json;
  assert.equal(out.manifest.label, 'AI-generated');
  assert.ok(out.files.some(f => f.name === 'AI-GENERATED.txt'));
});

test('publishing: work the screen blocks cannot be approved or re-screened over HTTP, and can be rejected', async () => {
  const { v, company } = await withCompany();
  const base = `/api/company/${company.id}/publish`;
  const item = (await v.call('POST', base, { kind: 'text', title: 'Bad', text: `${FORBIDDEN} everywhere` })).json.proposal;
  assert.equal(item.status, 'blocked');
  assert.equal((await v.call('POST', `${base}/${item.id}/approve`)).json.code, 'blocked');
  assert.equal((await v.call('POST', `${base}/${item.id}/rescreen`)).json.code, 'block_is_final');
  assert.equal((await v.call('POST', `${base}/${item.id}/reject`, { reason: 'no' })).json.proposal.status, 'rejected');
});

test('publishing: a proposal cannot carry its own approval, and a room that is not the company\'s cannot be named', async () => {
  const { v, company } = await withCompany();
  const base = `/api/company/${company.id}/publish`;
  const sneaky = await v.call('POST', base, { kind: 'text', title: 'T', text: 'hello', status: 'approved' });
  assert.equal(sneaky.status, 400);
  const elsewhere = await v.call('POST', base, { kind: 'text', title: 'T', text: 'hello', roomId: 'a'.repeat(32) });
  assert.equal(elsewhere.status, 400);
  assert.equal((await v.call('GET', base)).json.proposals.length, 0);
});

test('publishing: made from inside a department room the work is found without naming the room again, as the schema says', async () => {
  const { v, company, roomId, inRoom } = await withCompany();
  await v.call('POST', '/api/artifacts', { filename: 'engine.json', content: '{"v":1}' }, inRoom);
  const base = `/api/company/${company.id}/publish`;

  const offered = await v.call('POST', base, { kind: 'artifact', title: 'The engine', ref: 'engine.json' }, inRoom);
  assert.equal(offered.status, 201, JSON.stringify(offered.json));
  assert.equal(offered.json.proposal.roomId, roomId);
  assert.equal(offered.json.proposal.filename, 'engine.json');

  // a newer version offered the same way replaces it
  await v.call('POST', '/api/artifacts', { filename: 'engine.json', content: '{"v":2}' }, inRoom);
  const again = await v.call('POST', base, { kind: 'artifact', title: 'The engine', ref: 'engine.json' }, inRoom);
  assert.deepEqual(again.json.proposal.superseded, [offered.json.proposal.id]);

  // outside the room the file is not found, as before
  const outside = await v.call('POST', base, { kind: 'artifact', title: 'The engine', ref: 'engine.json' });
  assert.equal(outside.status, 404);
});

test('house rules: the default is readable, a company starts with it, the owner changes it, and a secret in it is refused', async () => {
  const v = visitor();
  const dflt = await v.call('GET', '/api/company/house-rules');
  assert.equal(dflt.status, 200);
  assert.match(dflt.json.text, /short messages/);
  assert.equal(dflt.json.maxChars, 2000);

  const { company } = await withCompany(v);
  assert.equal(company.houseRules, dflt.json.text);
  const patched = await v.call('PATCH', `/api/company/${company.id}`, { houseRules: 'Say it in one line.' });
  assert.equal(patched.json.company.houseRules, 'Say it in one line.');
  assert.equal((await v.call('GET', `/api/company/${company.id}`)).json.company.houseRules, 'Say it in one line.');
  assert.equal((await v.call('PATCH', `/api/company/${company.id}`, { houseRules: 'key AIzaSyA1234567890abcdefghijklmnopqrstuvw' })).status, 400);
  assert.equal((await v.call('PATCH', `/api/company/${company.id}`, { houseRules: 5 })).status, 400);
  assert.ok((await v.call('GET', '/api/company/schema')).json['x-endpoints'].some(e => e.path === '/api/company/house-rules'));
});

// ── the audit log, deleting ──────────────────────────────────────────────────

test('the audit log lists decisions in order and never the words', async () => {
  const { v, company, inRoom } = await withCompany();
  await v.call('POST', `/api/company/${company.id}/go`);
  await v.call('POST', '/api/agents', { name: 'Vic Test', bio: 'x', tools: 'visual' }, inRoom);
  await v.call('POST', `/api/company/${company.id}/publish`, { kind: 'text', title: 'Bad', text: `${FORBIDDEN} in a published piece` });
  const entries = (await v.call('GET', `/api/company/${company.id}/audit`)).json.entries;
  assert.deepEqual(entries.map(e => e.type).slice(0, 2), ['company_created', 'company_go']);
  assert.ok(entries.some(e => e.type === 'publish_proposed' && e.rules?.includes('deception')));
  assert.ok(!JSON.stringify(entries).includes(FORBIDDEN));
  assert.equal((await v.call('GET', `/api/company/${company.id}/audit?type=company_go`)).json.entries.length, 1);
});

test('deleting a company removes it and its rooms, and a room id from before leads nowhere', async () => {
  const { v, company, roomId, inRoom } = await withCompany();
  await v.call('POST', '/api/agents', { name: 'Ann Test', bio: 'x' }, inRoom);
  assert.equal((await v.call('DELETE', `/api/company/${company.id}`)).json.deleted, true);
  assert.equal((await v.call('GET', `/api/company/${company.id}`)).status, 404);
  const gone = await v.call('GET', '/api/agents', undefined, inRoom);
  assert.equal(gone.status, 404);
  assert.deepEqual(gone.json, noRoomBody);
  assert.equal((await v.call('GET', '/api/company')).json.companies.length, 0);
  void roomId;
});

test('a visitor with no companies is served exactly as before: one room of their own, tools at the default tier', async () => {
  const v = visitor();
  const added = await v.call('POST', '/api/agents', { name: 'Plain Ann', bio: 'x' });
  assert.equal(added.status, 201);
  assert.equal(added.json.agent.tools, 'full');
  assert.equal((await v.call('GET', '/api/chat/state')).json.policy, null);
});
