import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import nodePath from 'node:path';
import { loadOperator, validateModelList, DEFAULT_LOCAL_MODELS, DEFAULT_HOSTED_MODELS } from './operator.js';
import { MODELS } from '../config/models.js';
import { ChatOrchestrator } from '../services/orchestrator.js';
import { MediaStore } from '../services/mediaStore.js';
import { ArtifactStore } from '../services/artifactStore.js';
import { admitSeat } from './flow/admit.js';
import { makeServices, makeRoom, scripted, until } from './testKit.js';

/**
 * Which models a company's agents may run on: the operator's list. Local installs allow all three the registry offers, hosted ones the
 * deliberate and the default; a request, a company or a saved session cannot widen it, and a person on a model that is no longer allowed
 * is moved to the nearest one that is.
 */

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

const ALL = [MODELS.FAST, MODELS.SMART, MODELS.LITE];
const operatorWith = (env, files = {}) => loadOperator({ env, dataDir: '/nowhere', exists: (p) => p in files, readFile: (p) => files[p] });

function setup(env = {}, roomOpts = {}) {
  const { services, cleanup } = makeServices({ env });
  cleanups.push(cleanup);
  const room = makeRoom({ services, ...roomOpts });
  cleanups.push(() => { if (room.orchestrator.isRunning) room.orchestrator.stop('test_over'); });
  return { services, ...room };
}
const auditTypes = (services, company) => services.audit.read(company.id).map(e => e.type);

// ── the operator's list ──────────────────────────────────────────────────────

test('the defaults: a local install allows all three models, a hosted one the default and the deliberate', () => {
  assert.deepEqual([...operatorWith({}).models], ALL);
  assert.deepEqual([...operatorWith({ SYNTH_HOSTED: '1' }).models], [MODELS.FAST, MODELS.SMART]);
  assert.deepEqual([...DEFAULT_LOCAL_MODELS], ALL);
  assert.deepEqual([...DEFAULT_HOSTED_MODELS], [MODELS.FAST, MODELS.SMART]);
  assert.deepEqual(operatorWith({}).snapshot().models, ALL);
});

test('COMPANY_MODELS sets the list, in either mode; a bad list is ignored with a warning and the default stays', () => {
  const op = operatorWith({ COMPANY_MODELS: ` ${MODELS.SMART} , ${MODELS.FAST},${MODELS.SMART}` });
  assert.deepEqual([...op.models], [MODELS.SMART, MODELS.FAST]);
  assert.ok(op.sources.includes('env COMPANY_MODELS'));
  assert.deepEqual([...operatorWith({ SYNTH_HOSTED: '1', COMPANY_MODELS: MODELS.LITE }).models], [MODELS.LITE], 'a hosted operator can choose the cheap one on purpose');

  const bad = operatorWith({ COMPANY_MODELS: 'gemini-9-ultra' });
  assert.deepEqual([...bad.models], ALL);
  assert.match(bad.warnings.join(' '), /COMPANY_MODELS was ignored \(unknown model/);
});

test('the policy file can carry the list (local only); an invalid one is ignored whole', () => {
  const file = nodePath.resolve('operator-policy.json');
  const good = operatorWith({ COMPANY_OPERATOR_POLICY: file }, { [file]: JSON.stringify({ models: [MODELS.FAST] }) });
  assert.deepEqual([...good.models], [MODELS.FAST]);

  const bad = operatorWith({ COMPANY_OPERATOR_POLICY: file }, { [file]: JSON.stringify({ models: [] }) });
  assert.deepEqual([...bad.models], ALL, 'an empty list would leave nobody able to run');
  assert.match(bad.warnings.join(' '), /was ignored.*non-empty list/);

  const hosted = operatorWith({ SYNTH_HOSTED: '1', COMPANY_OPERATOR_POLICY: file }, { [file]: JSON.stringify({ models: ALL }) });
  assert.deepEqual([...hosted.models], [MODELS.FAST, MODELS.SMART], 'a hosted instance reads nothing from disk');
});

test('validateModelList: a list of known ids, each once, never empty', () => {
  assert.equal(validateModelList(undefined).ok, true);
  assert.equal(validateModelList([]).ok, false);
  assert.equal(validateModelList('gemini-3.8-flash').ok, false);
  assert.equal(validateModelList([MODELS.FAST, 'nope']).ok, false);
  assert.deepEqual(validateModelList([MODELS.FAST, MODELS.FAST]).value, [MODELS.FAST]);
});

// ── a company's room ─────────────────────────────────────────────────────────

test('admission: a model the operator does not allow is refused and nothing is added; an allowed one, or none, is fine', () => {
  const { orchestrator } = setup({ COMPANY_MODELS: `${MODELS.FAST},${MODELS.SMART}` });
  assert.throws(() => orchestrator.addAgent('Ann Test', 'x', { model: MODELS.LITE }), (e) => e.code === 'model_not_allowed' && e.status === 403 && /gemini-3\.8-flash/.test(e.message));
  assert.equal(orchestrator.agents.length, 0);
  assert.equal(orchestrator.addAgent('Ann Test', 'x', { model: MODELS.SMART }).model, MODELS.SMART);
  assert.equal(orchestrator.addAgent('Ben Test', 'x').model, null, 'no model asked: none pinned');
  const ben = orchestrator.agents[1];
  assert.throws(() => orchestrator.updateAgent(ben.id, { model: MODELS.LITE }), (e) => e.code === 'model_not_allowed');
  assert.equal(ben.model, null, 'a refused change changed nothing');
  assert.equal(orchestrator.updateAgent(ben.id, { model: MODELS.FAST }).model, MODELS.FAST);
});

test('a model the registry has never heard of is not pinned to an agent, as before; a session preference for one is refused', async () => {
  const { orchestrator } = setup({ COMPANY_MODELS: MODELS.FAST });
  assert.equal(orchestrator.addAgent('Ann Test', 'x', { model: 'gemini-9-ultra' }).model, null);
  orchestrator.addAgent('Ben Test', 'x');
  await assert.rejects(() => orchestrator.start('Make a poster', 100000, { model: 'gemini-9-ultra' }), (e) => e.code === 'model_not_allowed');
  assert.equal(orchestrator.isRunning, false, 'nothing started');
  await assert.rejects(() => orchestrator.start('Make a poster', 100000, { model: MODELS.SMART }), (e) => e.code === 'model_not_allowed');
});

test('a saved or imported session with a model that is not allowed is refused whole', () => {
  const { orchestrator } = setup({ COMPANY_MODELS: MODELS.FAST });
  const meta = (agents) => ({ goal: 'g', mode: 'group', agents });
  assert.throws(() => orchestrator.restoreSession({ meta: meta([{ name: 'Ann Test', bio: 'x', model: MODELS.SMART }]), messages: [] }), (e) => e.code === 'model_not_allowed');
  assert.equal(orchestrator.agents.length, 0);
  orchestrator.restoreSession({ meta: meta([{ name: 'Ann Test', bio: 'x', model: MODELS.FAST }, { name: 'Ben Test', bio: 'y' }]), messages: [] });
  assert.equal(orchestrator.agents.length, 2);
});

test('a turn runs on the nearest allowed model when the default is not allowed (said once for each person in the audit log)', async () => {
  const { orchestrator, services, company } = setup({ COMPANY_MODELS: MODELS.SMART }, {});
  orchestrator.addAgent('Ann Test', 'x');
  orchestrator.addAgent('Ben Test', 'y');
  const agents = scripted(orchestrator, () => 'A line from someone who is thinking about the poster and its colours today.');
  await orchestrator.start('Make a poster', 100000);
  await until(() => agents.calls() >= 4);
  orchestrator.stop();
  assert.ok(agents.seen.every(s => s.options.model === MODELS.SMART), 'the registry default is not allowed here, so every turn ran on the deliberate model');
  assert.ok(orchestrator.messages.filter(m => !m.isUser).every(m => m.model === MODELS.SMART), 'and the message says so');
  assert.equal(auditTypes(services, company).filter(t => t === 'model_replaced').length, 2, 'once for each of the two people, not at every turn');
});

test('a person whose model was taken out of the list moves to an allowed one, and keeps it', async () => {
  const { orchestrator, services, company } = setup({ COMPANY_MODELS: `${MODELS.FAST},${MODELS.SMART}` });
  const ann = orchestrator.addAgent('Ann Test', 'x');
  orchestrator.addAgent('Ben Test', 'y');
  ann.model = MODELS.LITE;                                   // admitted when the list was wider
  const agents = scripted(orchestrator, () => 'A line from someone who is thinking about the poster and its colours today.');
  await orchestrator.start('Make a poster', 100000);
  await until(() => agents.calls() >= 4);
  orchestrator.stop();
  assert.equal(ann.model, MODELS.FAST);
  assert.ok(agents.seen.every(s => s.options.model !== MODELS.LITE));
  const entry = services.audit.read(company.id).find(e => e.type === 'model_replaced');
  assert.deepEqual([entry.agent, entry.from, entry.to], ['Ann Test', MODELS.LITE, MODELS.FAST]);
});

test('the critic cannot be pointed at a model that is not allowed', () => {
  const { orchestrator } = setup({ COMPANY_MODELS: MODELS.FAST });
  assert.throws(() => orchestrator.setCritic({ model: MODELS.SMART }), (e) => e.code === 'model_not_allowed');
  assert.equal(orchestrator.critic.model, null);
  orchestrator.setCritic({ model: MODELS.FAST });
  assert.equal(orchestrator.critic.model, MODELS.FAST);
});

test('seating a person from the roster moves a disallowed model to an allowed one instead of failing the seat', () => {
  const { orchestrator } = setup({ COMPANY_MODELS: MODELS.FAST });
  const agent = admitSeat(orchestrator, { name: 'Cy Test', bio: 'x', model: MODELS.SMART, thinkingLevel: null, tools: 'none', employeeId: 'e1' });
  assert.equal(agent.model, MODELS.FAST);
});

test('a plain room is unchanged: any model, the session preference as it was', async () => {
  const room = new ChatOrchestrator({ mediaStore: new MediaStore(), artifactStore: new ArtifactStore() });
  room.broadcast = () => {};
  room.delay = () => Promise.resolve();
  const ann = room.addAgent('Ann Test', 'x', { model: MODELS.LITE });
  room.addAgent('Ben Test', 'y');
  assert.equal(ann.model, MODELS.LITE);
  const agents = scripted(room, () => 'A line from someone who is thinking about the poster and its colours today.');
  await room.start('Make a poster', 100000, { model: MODELS.SMART });
  await until(() => agents.calls() >= 2);
  room.stop();
  const byName = Object.fromEntries(agents.seen.map(s => [s.agent, s.options.model]));
  assert.equal(byName['Ben Test'], MODELS.SMART, 'the session preference reaches an agent with no model of its own');
  assert.equal(room._turnModel(ann), MODELS.LITE, 'an agent keeps its own');
});
