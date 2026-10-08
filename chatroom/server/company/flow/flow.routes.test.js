/**
 * The creation flow over real HTTP: two visitors with their own cookies. What matters here is who can reach what, that every change is a JSON request, that
 * a bad request is answered in words with the field named, that casting answers at once and finishes in the background, and that what comes out is a
 * company that is paused.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflowDir = mkdtempSync(join(tmpdir(), 'chatroom-flow-wf-'));
process.env.WORKFLOW_DATA_DIR = workflowDir;
process.env.WORKFLOW_TRACES_DIR = join(workflowDir, 'traces');

const { sqliteAvailable } = await import('./sqlite.js');
const { createApp } = await import('../../app.js');
const { clearRooms, clearRoomInitializers } = await import('../../services/sessionRegistry.js');
const { COOKIE_NAME } = await import('../../middleware/session.js');
const { makeServices, markerClassifier } = await import('../testKit.js');
const { fakeAsk } = await import('./flowKit.js');
const { PolicyError } = await import('../errors.js');
const { MODELS } = await import('../../config/models.js');

const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';

function stack(env = {}) {
  let kit;
  const ask = fakeAsk({}, { castings: () => [...kit.services.flow.store.flows.values()].flatMap(f => Object.values(f.cast.castings)) });
  const makeAsk = ({ spend, limitUsd }) => async (call) => {
    if (spend.usd >= limitUsd) throw new PolicyError(`This flow has spent its allowance ($${limitUsd.toFixed(2)}), so it will not make another model call.`, { status: 402, code: 'flow_spend_limit' });
    const out = await ask(call);
    spend.record(call.step, call.model || MODELS.FAST, { total_input_tokens: kit.tokens.in, total_output_tokens: kit.tokens.out });
    return out;
  };
  kit = makeServices({ env, classify: markerClassifier(), makeAsk });
  kit.tokens = { in: 1000, out: 500 };                                    // what each model call costs, so a test can make an allowance run out
  return kit;
}

const kit = stack();
const closed = stack({ COMPANY_FLOW: '0' });
let server, closedServer, base, closedBase;

before(async () => {
  server = createApp({ company: kit.services }).listen(0, '127.0.0.1');
  closedServer = createApp({ company: closed.services }).listen(0, '127.0.0.1');
  await Promise.all([server, closedServer].map(s => new Promise(r => s.once('listening', r))));
  base = `http://127.0.0.1:${server.address().port}`;
  closedBase = `http://127.0.0.1:${closedServer.address().port}`;
});

after(() => {
  for (const s of [server, closedServer]) { s.closeAllConnections?.(); s.close(); }
  clearRooms();
  clearRoomInitializers();
  kit.cleanup();
  closed.cleanup();
  rmSync(workflowDir, { recursive: true, force: true });
});

function visitor(origin = () => base) {
  let cookie = null;
  return {
    async call(method, path, body) {
      const res = await fetch(origin() + path, {
        method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
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

async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 15));
  }
}

const PROMPT = 'A studio that makes alpine snow-safety posters and the image templates to draw them.';

test('the options say what can be asked for', { skip }, async () => {
  const v = visitor();
  const r = await v.call('GET', '/api/company/flow/options');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.sizes.map(s => s.id), ['desk', 'small', 'medium', 'large']);
  assert.equal(r.json.enabled, true);
  assert.match(r.json.stopsAt, /paused/);
});

test('the schema document lists the flow\'s shapes and its endpoints', { skip }, async () => {
  const r = await visitor().call('GET', '/api/company/schema');
  assert.equal(r.status, 200);
  for (const name of ['flowPropose', 'flowEdit', 'flowCast', 'flowCloseOut']) assert.ok(r.json.$defs[name], name);
  assert.ok(r.json.$defs.flowPropose.required.includes('prompt'));
  const paths = r.json['x-endpoints'].map(e => `${e.method} ${e.path}`);
  for (const p of ['POST /api/company/flow', 'PATCH /api/company/flow/:flow', 'POST /api/company/flow/:flow/cast', 'POST /api/company/flow/:flow/create', 'POST /api/company/:id/run/:department/start']) assert.ok(paths.includes(p), p);
});

test('a request is held to its schema, in words, with the field named; changes must be JSON', { skip }, async () => {
  const v = visitor();
  let r = await v.call('POST', '/api/company/flow', {});
  assert.equal(r.status, 400);
  assert.match(r.json.error, /\$\.prompt is required/);
  r = await v.call('POST', '/api/company/flow', { prompt: PROMPT, locks: { safety: 'off' } });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /locks\.safety is not a field this accepts/);
  r = await v.call('POST', '/api/company/flow', { prompt: PROMPT, size: 'enormous' });
  assert.equal(r.status, 400);
  r = await v.raw('POST', '/api/company/flow', 'prompt=x', 'text/plain');
  assert.equal(r.status, 415);
  assert.equal(r.json.code, 'json_required');
  r = await v.call('POST', '/api/company/flow', { prompt: PROMPT, locks: { departments: [{ name: 'R', positions: [{ title: 'Quokka wrangler' }] }] } });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /do not know which archetype "Quokka wrangler" is/);
});

test('from one prompt to a paused company, over HTTP, and nobody else can reach any of it', { skip }, async () => {
  const v = visitor();
  const other = visitor();

  let r = await v.call('POST', '/api/company/flow', { prompt: PROMPT });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.flow.state, 'proposed');
  assert.match(r.json.note, /created paused/);
  const id = r.json.flow.id;
  assert.ok(!JSON.stringify(r.json).match(/ownerId/));

  r = await v.call('GET', '/api/company/flow');
  assert.equal(r.json.flows.length, 1);
  assert.equal(r.json.flows[0].name, 'Parallax Works');
  assert.equal((await other.call('GET', '/api/company/flow')).json.flows.length, 0);
  for (const [method, path, body] of [['GET', `/api/company/flow/${id}`], ['PATCH', `/api/company/flow/${id}`, { company: { name: 'Mine' } }], ['POST', `/api/company/flow/${id}/replan`, {}], ['POST', `/api/company/flow/${id}/cast`, {}], ['POST', `/api/company/flow/${id}/cancel`, {}], ['POST', `/api/company/flow/${id}/create`, {}], ['DELETE', `/api/company/flow/${id}`]]) {
    const x = await other.call(method, path, body);
    assert.equal(x.status, 404, `${method} ${path}`);
    assert.equal(x.json.code, 'no_flow');
  }

  r = await v.call('PATCH', `/api/company/flow/${id}`, { company: { name: 'Snowline Studio' }, departments: [{ key: 'd1', name: 'The Print Room' }] });
  assert.equal(r.status, 200);
  assert.equal(r.json.flow.plan.company.name, 'Snowline Studio');
  r = await v.call('PATCH', `/api/company/flow/${id}`, { departments: [{ key: 'd1', positions: [{ key: 'd1p1', lead: false }] }] });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'bad_plan');
  assert.match(r.json.error, /needs exactly one lead/);

  r = await v.call('POST', `/api/company/flow/${id}/create`, {});
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'flow_not_cast');

  r = await v.call('POST', `/api/company/flow/${id}/cast`, {});
  assert.equal(r.status, 202, 'it answers at once');
  assert.equal(r.json.flow.state, 'casting');
  assert.match(r.json.note, /Poll GET/);
  const done = await until(async () => { const x = await v.call('GET', `/api/company/flow/${id}`); return x.json.flow.state === 'cast' ? x.json.flow : null; });
  assert.equal(Object.values(done.cast.people).filter(p => p.status === 'ready').length, 6);
  assert.equal(done.next, 'create');

  assert.equal((await v.call('GET', '/api/company')).json.companies.length, 0, 'casting made no company');
  r = await v.call('POST', `/api/company/flow/${id}/create`, {});
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.company.state, 'paused');
  assert.equal(r.json.company.name, 'Snowline Studio');
  assert.equal(r.json.company.departments[0].name, 'The Print Room');
  assert.equal(r.json.company.plan.flowId, id);
  assert.match(r.json.note, /Nothing runs, spends or publishes until you say go/);
  const companyId = r.json.company.id;
  assert.equal((await v.call('POST', `/api/company/flow/${id}/create`, {})).status, 409);

  // the company is the visitor's own, paused, with its people
  assert.equal((await other.call('GET', `/api/company/${companyId}`)).status, 404);
  assert.equal((await v.call('GET', `/api/company/${companyId}/people`)).json.employees.length, 6);
  const hall = (await v.call('GET', `/api/company/${companyId}/hall`)).json.hall;
  assert.equal(hall.people.length, 6);
  assert.equal(hall.tasks.length, 1);

  // starting a room: not while paused, not for a visitor who does not own the company, not for a room that does not exist
  const dept = r.json.company.departments[0].id;
  r = await v.call('POST', `/api/company/${companyId}/run/${dept}/start`, {});
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'company_paused');
  assert.equal((await other.call('POST', `/api/company/${companyId}/run/${dept}/start`, {})).status, 404);
  assert.equal((await v.call('POST', `/api/company/${companyId}/run/nowhere/start`, {})).json.code, 'no_department');
  assert.equal((await v.call('POST', `/api/company/${companyId}/run/${dept}/close-out`, { surprise: 1 })).status, 400);

  // and the flow can go now, without touching the company
  assert.equal((await v.call('DELETE', `/api/company/flow/${id}`)).json.deleted, true);
  assert.equal((await v.call('GET', `/api/company/${companyId}`)).json.company.state, 'paused');
});

test('cancel and delete: a cancelled proposal can be removed, and a spent allowance is a clear answer', { skip }, async () => {
  const v = visitor();
  let r = await v.call('POST', '/api/company/flow', { prompt: PROMPT, budgetUsd: 0.5 });
  assert.equal(r.status, 201);
  const id = r.json.flow.id;
  kit.tokens = { in: 3_000_000, out: 100_000 };                          // the first model call of the cast costs more than the allowance
  r = await v.call('POST', `/api/company/flow/${id}/cast`, {});
  assert.equal(r.status, 202);
  const stopped = await until(async () => { const x = await v.call('GET', `/api/company/flow/${id}`); return x.json.flow.state === 'failed' ? x.json.flow : null; });
  assert.match(stopped.error, /spent its allowance/);
  kit.tokens = { in: 1000, out: 500 };
  r = await v.call('POST', `/api/company/flow/${id}/cast`, { budgetUsd: 'lots' });
  assert.equal(r.status, 400);
  r = await v.call('POST', `/api/company/flow/${id}/cancel`, {});
  assert.equal(r.json.flow.state, 'cancelled');
  assert.equal((await v.call('DELETE', `/api/company/flow/${id}`)).status, 200);
  assert.equal((await v.call('GET', `/api/company/flow/${id}`)).status, 404);
});

test('when the operator has switched the flow off, every step says so and the options still answer', { skip }, async () => {
  const v = visitor(() => closedBase);
  assert.equal((await v.call('GET', '/api/company/flow/options')).json.enabled, false);
  const r = await v.call('POST', '/api/company/flow', { prompt: PROMPT });
  assert.equal(r.status, 503);
  assert.equal(r.json.code, 'flow_disabled');
});
