import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeServices, markerClassifier, tempDir, FORBIDDEN } from '../testKit.js';
import { createCompanyServices } from '../index.js';
import { FlowStore } from './flowStore.js';
import { FlowService, ESTIMATE_PER_PERSON_USD } from './flow.js';
import { sqliteAvailable } from './sqlite.js';
import { fakeAsk, fakePlanAnswer, fakeSheet, uniqueSheet, castingFrom, castFor } from './flowKit.js';
import { PolicyError } from '../errors.js';
import { MODELS } from '../../config/models.js';
import { newId } from '../util.js';
import { Spend } from './model.js';

/**
 * The creation flow, end to end, with a stand-in for the model: one prompt becomes a proposal; casting writes (or finds) a person for every position;
 * creating makes the company, paused, with its people hired, its Hall set up and its rooms briefed. What is held to account is the machinery around the
 * model: what is kept when something stops, what is refused, what cannot be reached from another visitor, and that nothing is half made.
 */

const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';
const cleanups = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); });

const PROMPT = 'A studio that makes alpine snow-safety posters and the image templates to draw them.';

/** Services with a stand-in model that is priced like a real one (so allowances can be tested), and every model call recorded. */
function setup({ handlers = {}, env = {}, classify, tokens = { in: 20_000, out: 3_000 }, dataDir } = {}) {
  const log = [];
  let kit;
  const ask = fakeAsk(handlers, { castings: () => [...kit.services.flow.store.flows.values()].flatMap(f => Object.values(f.cast.castings)) });
  const makeAsk = ({ spend, limitUsd }) => async (call) => {
    if (spend.usd >= limitUsd) throw new PolicyError(`This flow has spent its allowance ($${limitUsd.toFixed(2)}), so it will not make another model call.`, { status: 402, code: 'flow_spend_limit' });
    log.push(call);
    const out = await ask(call);
    spend.record(call.step, call.model || MODELS.FAST, { total_input_tokens: tokens.in, total_output_tokens: tokens.out });
    return out;
  };
  if (dataDir) {
    const services = createCompanyServices({ dataDir, env, classify: classify || markerClassifier(), makeAsk });
    kit = { services, dir: dataDir, cleanup: () => { services.close?.(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
  } else {
    kit = makeServices({ env, classify, makeAsk });
  }
  cleanups.push(kit.cleanup);
  return { ...kit, log, ask, flow: kit.services.flow, owner: newId() };
}

const castAndWait = async (s, owner, id, options) => {
  s.flow.cast(owner, id, options);
  await s.flow.settled(id);
  return s.flow.get(owner, id);
};

const steps = (log, step) => log.filter(c => c.step === step).length;

test('one prompt becomes a proposal: nothing exists but the proposal, and almost nothing is spent', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  assert.equal(f.state, 'proposed');
  assert.equal(f.next, 'cast');
  assert.equal(f.plan.company.name, 'Parallax Works');
  assert.equal(f.estimate.people, 6);
  assert.equal(f.estimate.open, 6);
  assert.equal(f.estimate.upToUsd, Math.round(6 * ESTIMATE_PER_PERSON_USD * 1000) / 1000);
  assert.deepEqual(s.log.map(c => c.step), ['shape', 'plan']);
  assert.equal(s.services.store.listFor(s.owner).length, 0, 'no company');
  assert.equal(s.services.tryRoster(), null, 'no database was even created');
  assert.ok(!JSON.stringify(f).includes(s.owner), 'the owner\'s id is never in an answer');
  assert.equal(f.spend.calls, 2);
  assert.ok(f.spend.usd > 0 && f.spend.usd < 0.1);
  assert.match(f.problems.join(' '), /^$/, 'a proposal from the model is complete enough to create');
});

test('the flow is the visitor\'s own: another visitor can neither see nor change it', { skip }, async () => {
  const s = setup();
  const other = newId();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  assert.equal(s.flow.list(other).length, 0);
  assert.equal(s.flow.list(s.owner).length, 1);
  for (const act of [() => s.flow.get(other, f.id), () => s.flow.cast(other, f.id), () => s.flow.create(other, f.id), () => s.flow.cancel(other, f.id), () => s.flow.remove(other, f.id)]) {
    assert.throws(act, (e) => e.status === 404 && e.code === 'no_flow');
  }
  await assert.rejects(() => s.flow.edit(other, f.id, { company: { name: 'Mine Now' } }), (e) => e.status === 404);
  await assert.rejects(() => s.flow.replan(other, f.id), (e) => e.status === 404);
  assert.equal(s.flow.get(s.owner, f.id).plan.company.name, 'Parallax Works');
});

test('the operator can switch the whole flow off', { skip }, async () => {
  const s = setup({ env: { COMPANY_FLOW: '0' } });
  assert.equal(s.flow.options().enabled, false);
  await assert.rejects(() => s.flow.propose(s.owner, { prompt: PROMPT }), (e) => e.status === 503 && e.code === 'flow_disabled');
  assert.equal(s.log.length, 0);
});

test('casting writes a person for every position, in the background, and keeps the record', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  const started = s.flow.cast(s.owner, f.id);
  assert.equal(started.state, 'casting', 'it answers at once, with the work still going');
  await s.flow.settled(f.id);
  const done = s.flow.get(s.owner, f.id);
  assert.equal(done.state, 'cast');
  assert.equal(done.next, 'create');
  const people = Object.values(done.cast.people);
  assert.equal(people.length, 6);
  assert.ok(people.every(p => p.status === 'ready' && p.source === 'new' && p.candidateId && p.name), JSON.stringify(people[0]));
  assert.equal(new Set(people.map(p => p.name)).size, 6, 'six different names');
  assert.equal(steps(s.log, 'seed'), 6);
  assert.equal(steps(s.log, 'sheet'), 6);
  assert.equal(steps(s.log, 'blind_review'), 6);
  assert.equal(steps(s.log, 'quiz'), 6);
  const roster = s.services.roster;
  const ready = roster.listCandidates(s.owner, { status: 'ready' });
  assert.equal(ready.length, 6);
  assert.ok(ready.every(c => c.measuredType && /^[EI][SN][TF][JP]$|X/.test(c.measuredType)), 'the quiz was taken');
  const sample = roster.getCandidate(s.owner, people[0].candidateId);
  assert.ok(sample.checks.review && sample.checks.screen.ok, 'the checks are kept with the person');
  assert.ok(sample.profile.anchors.off_clock, 'the sheet has its off-the-clock section');
  assert.ok(done.cast.report.total >= 5 && Array.isArray(done.cast.report.targets), 'a diversity report');
  assert.match(done.cast.report.text, /targets met/);
  assert.ok(done.spend.usd > f.spend.usd);
  assert.ok(done.progress.some(p => /Everyone is in place/.test(p.text)));
  assert.equal(s.services.store.listFor(s.owner).length, 0, 'casting makes no company');
  assert.equal(done.estimate.open, 0);
});

test('creating makes the company, paused, with the people hired, the Hall set up and every room briefed', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  await castAndWait(s, s.owner, f.id);
  const made = s.flow.create(s.owner, f.id);
  assert.equal(made.flow.state, 'created');
  const company = s.services.store.getOwned(made.company.id, s.owner);
  assert.equal(company.state, 'paused', 'nothing runs until the owner says go');
  assert.equal(company.name, 'Parallax Works');
  assert.match(company.mission, /^Parallax Works: Makes small invented worlds/);
  assert.equal(company.departments.length, 1);
  assert.equal(company.departments[0].name, 'Room 1 Works');

  const roster = s.services.roster;
  const seats = roster.seatsOf(s.owner, company.id);
  assert.equal(seats.length, 6);
  const lead = seats.filter(x => x.isLead);
  assert.equal(lead.length, 1);
  assert.ok(seats.filter(x => !x.isLead).every(x => x.reportsTo === lead[0].employeeId), 'everyone reports to the lead');
  const reviewer = seats.find(x => x.reviewerOf);
  assert.equal(reviewer.reviewerOf, 'engine.json');
  assert.equal(seats.filter(x => x.tier === 'builder').length, 1, 'exactly one person can save files');
  assert.deepEqual(Object.keys(seats[0].knobs).sort(), ['candor', 'push', 'tempo']);

  // the tools the company is granted are exactly those its people's tiers need, on top of the research default
  const effective = s.services.store.describe(company).effective;
  assert.ok(effective.tools.includes('write_artifact') && effective.tools.includes('render_artifact'));

  // the Hall
  const hall = s.services.hall;
  assert.equal(hall.forum.channels(s.owner, company.id).length, 5, 'the four defaults and one for the department');
  const readme = hall.workspace.list(s.owner, company.id).find(x => x.path === 'README.md');
  assert.ok(readme && readme.locked);
  assert.match(hall.workspace.read(s.owner, company.id, 'README.md').content, /## The rooms\n- \*\*Room 1 Works\*\*/);
  assert.ok(hall.mail.counts(s.owner, company.id).every(c => c.unread === 1), 'a welcome for each person');
  const tasks = hall.board.list(s.owner, company.id);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Room 1 Works: make engine.json');
  assert.equal(tasks[0].lead.name, lead[0].name);
  assert.equal(tasks[0].members.length, 5);

  // the brief, and the checks that make "done" mean something
  const plan = company.plan.departments[0];
  assert.ok(plan.goal.length <= 4000, `${plan.goal.length}`);
  assert.match(plan.goal, /one JSON object/, 'the line that says what shape the file must have is in the brief');
  assert.deepEqual(plan.doneWhen.map(c => c.type), ['json', 'tool_used', 'said_after', 'proposal']);
  assert.deepEqual(plan.handoffs, [{ next: reviewer.name, artifact: 'engine.json' }]);
  assert.equal(plan.lead, lead[0].name);
  assert.equal(plan.reviewers.length, 1);
  assert.equal(s.services.store.describe(company).plan.departments[0].makes, 'engine.json');

  // the record
  const kinds = s.services.audit.read(company.id, { limit: 100 }).map(e => e.type);
  assert.equal(kinds.filter(k => k === 'person_hired').length, 6);
  assert.ok(kinds.includes('company_created'));
  assert.equal(s.flow.get(s.owner, f.id).created.companyId, company.id);
  assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.status === 409 && e.code === 'already_created');
  assert.throws(() => s.flow.cast(s.owner, f.id), (e) => e.status === 409);
});

test('a flow can be cast and created in sequence for a bigger company: rooms side by side, people one after another, the whole thing consistent', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, size: 'small' });
  assert.equal(f.plan.departments.length, 2);
  const done = await castAndWait(s, s.owner, f.id);
  assert.equal(done.state, 'cast', done.error || JSON.stringify(done.progress.slice(-3)));
  assert.equal(Object.keys(done.cast.people).length, 12);
  const made = s.flow.create(s.owner, f.id);
  const company = s.services.store.getOwned(made.company.id, s.owner);
  assert.equal(company.departments.length, 2);
  for (const d of company.departments) assert.equal(s.services.roster.seatsOf(s.owner, company.id, { departmentId: d.id }).length, 6);
  assert.equal(company.plan.departments.length, 2);
  assert.equal(s.services.hall.board.list(s.owner, company.id).length, 2);
  const names = s.services.roster.employeesOf(s.owner, company.id).map(e => e.name);
  assert.equal(new Set(names).size, 12);
});

test('the roster is used first: a second company takes the people who fit, and writes nobody it does not need', { skip }, async () => {
  const s = setup();
  const first = await s.flow.propose(s.owner, { prompt: PROMPT });
  await castAndWait(s, s.owner, first.id);
  s.flow.create(s.owner, first.id);
  const before = s.log.length;
  const second = await s.flow.propose(s.owner, { prompt: 'A studio that makes board-game cards.' });
  const done = await castAndWait(s, s.owner, second.id);
  assert.equal(done.state, 'cast');
  assert.ok(Object.values(done.cast.people).every(p => p.source === 'roster'), 'all six were already in the roster');
  assert.equal(s.log.slice(before).filter(c => ['seed', 'sheet', 'quiz', 'blind_review'].includes(c.step)).length, 0, 'nobody was written');
  assert.equal(s.services.roster.countCandidates(s.owner), 6);
  assert.equal(done.estimate.upToUsd, 0);
  const made = s.flow.create(s.owner, second.id);
  // the same person at two companies is two employees, each with their own memory
  const [a] = s.services.roster.employeesOf(s.owner, made.company.id);
  const firstCompany = s.flow.get(s.owner, first.id).created.companyId;
  const [b] = s.services.roster.employeesOf(s.owner, firstCompany);
  assert.equal(a.candidateId, b.candidateId);
  assert.notEqual(a.id, b.id);
  s.services.roster.addMemory(s.owner, a.id, { text: 'I remember the second company.' });
  assert.equal(s.services.roster.listMemory(s.owner, b.id).length, 0, 'no memory crosses a company');
});

test('reuse can be turned off: everyone is written new', { skip }, async () => {
  const s = setup();
  const first = await s.flow.propose(s.owner, { prompt: PROMPT });
  await castAndWait(s, s.owner, first.id);
  const second = await s.flow.propose(s.owner, { prompt: 'Another studio.', reuse: false });
  const done = await castAndWait(s, s.owner, second.id);
  assert.ok(Object.values(done.cast.people).every(p => p.source === 'new'));
  assert.equal(s.services.roster.countCandidates(s.owner), 12);
  assert.equal(new Set(s.services.roster.listCandidates(s.owner, { limit: 50 }).map(c => c.name)).size, 12, 'all different people');
});

test('a person the owner chose from the roster is used, and one who is not ready is refused with the reason', { skip }, async () => {
  const s = setup();
  const first = await s.flow.propose(s.owner, { prompt: PROMPT });
  await castAndWait(s, s.owner, first.id);
  const roster = s.services.roster;
  const [chosen, drafty] = roster.listCandidates(s.owner, { status: 'ready' });
  roster.updateCandidate(s.owner, drafty.id, { status: 'draft' });
  const second = await s.flow.propose(s.owner, {
    prompt: 'Two people.', reuse: false,
    locks: { departments: [{ name: 'Pair', positions: [{ title: 'Producer', lead: true, candidateId: chosen.id }, { title: 'Writer', candidateId: drafty.id }] }] },
  });
  const done = await castAndWait(s, s.owner, second.id);
  assert.equal(done.cast.people.d1p1.source, 'pinned');
  assert.equal(done.cast.people.d1p1.name, chosen.name);
  assert.equal(done.cast.people.d1p2.status, 'failed');
  assert.match(done.cast.people.d1p2.error, /is draft, not ready/);
  assert.equal(done.state, 'proposed', 'one position is still open');
  assert.match(done.progress.at(-1).text, /1 of 2 positions still need a person/);
  assert.throws(() => s.flow.create(s.owner, second.id), (e) => e.code === 'flow_not_cast' && /Writer in Pair/.test(e.message));
  // the owner reads the sheet, marks them ready, and casts again: nothing else is written
  roster.updateCandidate(s.owner, drafty.id, { status: 'ready' });
  const before = steps(s.log, 'sheet');
  const again = await castAndWait(s, s.owner, second.id);
  assert.equal(again.state, 'cast');
  assert.equal(steps(s.log, 'sheet'), before);
  assert.equal(s.flow.create(s.owner, second.id).flow.state, 'created');
});

test('a fact the owner fixed about a person is the person\'s: written to it, not found in the roster', { skip }, async () => {
  const s = setup();
  const first = await s.flow.propose(s.owner, { prompt: PROMPT });
  await castAndWait(s, s.owner, first.id);
  const second = await s.flow.propose(s.owner, {
    prompt: 'A pair.', locks: { departments: [{ name: 'Pair', positions: [{ title: 'Producer', lead: true, locked: { bornYear: 1962 } }, { title: 'Writer' }] }] },
  });
  const done = await castAndWait(s, s.owner, second.id);
  assert.equal(done.cast.people.d1p1.source, 'new', 'no one in the roster was cast to that fact');
  assert.equal(done.cast.people.d1p2.source, 'roster');
  const c = s.services.roster.getCandidate(s.owner, done.cast.people.d1p1.candidateId);
  assert.equal(c.bornYear, 1962);
});

test('the owner names a person who is in the roster, and that is who is hired', { skip }, async () => {
  const s = setup();
  const first = await s.flow.propose(s.owner, { prompt: PROMPT });
  const cast = await castAndWait(s, s.owner, first.id);
  const known = cast.cast.people.d1p3.name;
  const second = await s.flow.propose(s.owner, { prompt: 'A pair.', locks: { departments: [{ name: 'Pair', positions: [{ title: 'Producer', lead: true, locked: { name: known } }, { title: 'Writer' }] }] } });
  const done = await castAndWait(s, s.owner, second.id);
  assert.equal(done.cast.people.d1p1.name, known);
  assert.equal(done.cast.people.d1p1.source, 'roster');
});

test('a flow that reaches its allowance stops, keeps who it finished, and can go on with a larger one', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, budgetUsd: 0.5 });
  const stopped = await castAndWait(s, s.owner, f.id);
  assert.equal(stopped.state, 'failed');
  assert.equal(stopped.failedAt, 'cast');
  assert.match(stopped.error, /spent its allowance \(\$0\.50\)/);
  assert.ok(stopped.spend.usd >= 0.5);
  const kept = Object.values(stopped.cast.people).filter(p => p.status === 'ready').length;
  assert.ok(kept >= 1 && kept < 6, `kept ${kept}`);
  assert.equal(s.services.roster.countCandidates(s.owner), kept, 'everyone finished is in the roster');
  assert.equal(stopped.settings.limitUsd, 0.5);
  assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.code === 'flow_not_cast');
  const resumed = await castAndWait(s, s.owner, f.id, { budgetUsd: 8 });
  assert.equal(resumed.state, 'cast', resumed.error);
  assert.equal(s.services.roster.countCandidates(s.owner), 6, 'only the missing people were written');
  assert.equal(steps(s.log, 'sheet'), 6);
});

test('the operator\'s allowance is the most a flow can have, whatever it asks for', { skip }, async () => {
  const s = setup({ env: { COMPANY_FLOW_MAX_SPEND_USD: '1' } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, budgetUsd: 500 });
  assert.equal(f.settings.limitUsd, 1);
  assert.equal(s.flow.options().limits.maxSpendUsd, 1);
  await assert.rejects(() => s.flow.propose(s.owner, { prompt: PROMPT, budgetUsd: -1 }), (e) => e.status === 400);
  assert.throws(() => s.flow.cast(s.owner, f.id, { budgetUsd: 'lots' }), (e) => e.status === 400);
});

test('cancelling stops casting after the person in hand, and keeps them', { skip }, async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const s = setup({ handlers: { sheet: async (call, n) => { if (n === 2) await gate; } } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  s.flow.cast(s.owner, f.id);
  while (steps(s.log, 'sheet') < 1) await new Promise(r => setTimeout(r, 2));
  const asked = s.flow.cancel(s.owner, f.id);
  assert.equal(asked.state, 'casting', 'it is still finishing the person in hand');
  release();
  await s.flow.settled(f.id);
  const done = s.flow.get(s.owner, f.id);
  assert.equal(done.state, 'cancelled');
  const ready = Object.values(done.cast.people).filter(p => p.status === 'ready').length;
  assert.ok(ready >= 1 && ready < 6);
  assert.equal(s.services.roster.countCandidates(s.owner), ready);
  assert.throws(() => s.flow.cast(s.owner, f.id), (e) => e.status === 409);
  assert.equal(s.flow.cancel(s.owner, f.id).state, 'cancelled', 'cancelling twice is not an error');
});

test('only one flow of a visitor is cast at a time', { skip }, async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const s = setup({ handlers: { seed: async (call, n) => { if (n === 1) await gate; } } });
  const a = await s.flow.propose(s.owner, { prompt: PROMPT });
  const b = await s.flow.propose(s.owner, { prompt: 'Another.' });
  s.flow.cast(s.owner, a.id);
  assert.throws(() => s.flow.cast(s.owner, b.id), (e) => e.status === 409 && e.code === 'flow_busy');
  assert.throws(() => s.flow.cast(s.owner, a.id), (e) => e.status === 409);
  assert.throws(() => s.flow.remove(s.owner, a.id), (e) => e.status === 409 && e.code === 'flow_running');
  release();
  await s.flow.settled(a.id);
});

test('a model that declines one person is final for that person; the others are written, and the way on is to change the position', { skip }, async () => {
  const s = setup({ handlers: { sheet: (call, n) => { if (n === 3) { const e = new PolicyError('The model service declined this request. That answer is final: it will not be tried again or reworded.', { status: 422, code: 'model_refused' }); throw e; } } } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  const done = await castAndWait(s, s.owner, f.id);
  assert.equal(done.state, 'proposed');
  const failed = Object.entries(done.cast.people).filter(([, p]) => p.status === 'failed');
  assert.equal(failed.length, 1);
  assert.match(failed[0][1].error, /declined to write this person.*final/);
  assert.equal(Object.values(done.cast.people).filter(p => p.status === 'ready').length, 5);
  assert.equal(steps(s.log, 'sheet'), 6, 'the declined sheet was not asked again');
  // changing the position and casting again writes only that person
  const key = failed[0][0];
  const edited = await s.flow.edit(s.owner, f.id, { departments: [{ key: 'd1', positions: [{ key, title: 'Image editor', archetype: 'editor' }] }] });
  assert.equal(edited.cast.people[key], undefined);
  const again = await castAndWait(s, s.owner, f.id);
  assert.equal(again.state, 'cast');
  assert.equal(steps(s.log, 'sheet'), 7);
});

test('a sheet that fails its checks is tried once more with a different draw; one that passes then is hired', { skip }, async () => {
  const bad = () => fakeSheet(castFor(0), null, 0, { blind_spot: 'Trusts the language model over people.' });
  const s = setup({ handlers: { sheet: (call, n) => (n <= 3 ? bad(call) : undefined) } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, locks: { departments: [{ name: 'Solo', positions: [{ title: 'Producer', lead: true }] }] } });
  const done = await castAndWait(s, s.owner, f.id);
  assert.equal(done.state, 'cast', done.error || JSON.stringify(done.cast.people));
  assert.equal(done.cast.people.d1p1.tries, 2);
  assert.equal(s.services.roster.countCandidates(s.owner), 1, 'the first, failed draft was not kept');
  assert.equal(s.services.roster.listCandidates(s.owner, { status: 'draft' }).length, 0);
});

test('a sheet that fails both tries stays a draft for the owner to read, and is never hired', { skip }, async () => {
  const bad = () => fakeSheet(castFor(0), null, 0, { blind_spot: 'Trusts the language model over the people holding it.' });
  const s = setup({ handlers: { sheet: () => bad() } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, locks: { departments: [{ name: 'Solo', positions: [{ title: 'Producer', lead: true }] }] } });
  const done = await castAndWait(s, s.owner, f.id);
  assert.equal(done.state, 'proposed');
  const p = done.cast.people.d1p1;
  assert.equal(p.status, 'draft');
  assert.match(p.error, /mentions AI or a program/);
  assert.equal(s.services.roster.listCandidates(s.owner, { status: 'draft' }).length, 1, 'kept, with its reasons, as a draft');
  assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.code === 'flow_not_cast');
  assert.equal(s.services.roster.listCandidates(s.owner, { status: 'ready' }).length, 0);
});

test('the company\'s own screen has the last word on a sheet: one it blocks is a draft, however clean the checks', { skip }, async () => {
  let s;
  const allCastings = () => [...s.flow.store.flows.values()].flatMap(f => Object.values(f.cast.castings));
  s = setup({
    classify: markerClassifier({ 'MARKER-IN-SHEET': 'deception' }),
    // a valid sheet for the person drawn, with the marker in a field the screen reads
    handlers: { sheet: (call) => uniqueSheet(castingFrom(call.prompt, allCastings), null, 5, { working_style: 'Works from the MARKER-IN-SHEET outward, one small piece at a time.' }) },
  });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, locks: { departments: [{ name: 'Solo', positions: [{ title: 'Producer', lead: true }] }] } });
  const done = await castAndWait(s, s.owner, f.id);
  assert.equal(done.state, 'proposed');
  assert.equal(done.cast.people.d1p1.status, 'draft');
  assert.match(done.cast.people.d1p1.error, /safety screen: block/);
  assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.code === 'flow_not_cast');
});

test('stereotypes and drift the checks find are kept as lessons for the next person cast from the same archetype', { skip }, async () => {
  const s = setup({ handlers: { blind_review: () => ({ recognizable_real_person: false, real_people_named: [], name_is_famous_person: false, stereotypes: [{ detail: 'the family bakery', why: 'a stereotype of the origin' }], inconsistencies: [], particular_vs_type: 4, most_generic_detail: 'x', most_specific_detail: 'y', harmful_pushes: [] }) } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  const done = await castAndWait(s, s.owner, f.id);
  assert.equal(done.state, 'cast');
  const lessons = s.services.roster.lessonsFor(s.owner, 'steward');
  assert.ok(lessons.some(l => /the family bakery/.test(l.text) && l.source === 'review'), JSON.stringify(lessons));
  assert.ok(Object.values(done.cast.people).every(p => p.advice === 1), 'the owner sees the advice beside each person');
  // the next steward cast is told
  const second = await s.flow.propose(s.owner, { prompt: 'Another.', reuse: false, locks: { departments: [{ name: 'Solo', positions: [{ title: 'Producer', lead: true }] }] } });
  await castAndWait(s, s.owner, second.id);
  const lastSheetPrompt = s.log.filter(c => c.step === 'sheet').at(-1).prompt;
  assert.match(lastSheetPrompt, /WHAT HAS BEEN LEARNED ABOUT CASTING THIS KIND OF PERSON/);
  assert.match(lastSheetPrompt, /the family bakery/);
});

test('editing the proposal keeps the people it can: wording changes cost nothing, a changed position sends only that person back', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  await castAndWait(s, s.owner, f.id);
  const renamed = await s.flow.edit(s.owner, f.id, { company: { name: 'Snowline Studio' }, departments: [{ key: 'd1', name: 'The Print Room', assignment: 'Four posters, no more than four.' }] });
  assert.equal(renamed.state, 'cast', 'still cast: wording is not a person');
  assert.equal(renamed.plan.company.name, 'Snowline Studio');
  assert.equal(renamed.plan.provenance['company.name'], 'user');
  const changed = await s.flow.edit(s.owner, f.id, { departments: [{ key: 'd1', positions: [{ key: 'd1p2', title: 'Poster writer', archetype: 'storyteller' }] }] });
  assert.equal(changed.state, 'proposed', 'one person is now missing');
  assert.equal(changed.cast.people.d1p2, undefined);
  assert.equal(changed.estimate.open, 1);
  const sheets = steps(s.log, 'sheet');
  const again = await castAndWait(s, s.owner, f.id, { reuse: false });
  assert.equal(again.state, 'cast');
  assert.equal(steps(s.log, 'sheet'), sheets + 1, 'one person written');
  assert.equal(again.cast.people.d1p2.title, 'Poster writer');
  assert.equal(again.cast.people.d1p2.source, 'new');
  const made = s.flow.create(s.owner, f.id);
  assert.equal(made.company.name, 'Snowline Studio');
  assert.equal(s.services.store.getOwned(made.company.id, s.owner).departments[0].name, 'The Print Room');
});

test('edits are screened again, because they are the owner\'s words now', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  await assert.rejects(() => s.flow.edit(s.owner, f.id, { departments: [{ key: 'd1', assignment: `Make it. ${FORBIDDEN}` }] }), (e) => e.code === 'prompt_blocked');
  assert.doesNotMatch(s.flow.get(s.owner, f.id).plan.departments[0].assignment, new RegExp(FORBIDDEN));
  await assert.rejects(() => s.flow.edit(s.owner, f.id, { departments: [{ key: 'd1', positions: [{ key: 'd1p1', lead: false }] }] }), (e) => e.code === 'bad_plan');
});

test('a re-fill leaves what the owner fixed, and the titles of people already written', { skip }, async () => {
  const answer = (round) => (call) => {
    const keys = [...call.prompt.matchAll(/key "(d\d+)"/g)].map(m => m[1]);
    return { name: `Model Name ${round}`, purpose: `A purpose from look number ${round}.`, departments: keys.map(key => ({ key, name: `Model Room ${round}`, purpose: `Purpose ${round}.`, deliverable: 'document', file: `piece-${round}.md`, assignment: `Assignment number ${round} for the room, in three sentences. It is the one. And a third.`, titles: [1, 2, 3, 4, 5, 6].map(i => `R${round}-${i}`) })) };
  };
  let plans = 0;
  const s = setup({ handlers: { plan: (call) => answer(++plans)(call) } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, locks: { name: 'Snowline Studio' } });
  assert.equal(f.plan.company.name, 'Snowline Studio');
  assert.equal(f.plan.departments[0].positions[1].title, 'R1-2');
  const cast = await castAndWait(s, s.owner, f.id);
  assert.equal(cast.state, 'cast');
  await s.flow.edit(s.owner, f.id, { departments: [{ key: 'd1', name: 'The Print Room' }] });
  const again = await s.flow.replan(s.owner, f.id);
  assert.equal(again.plan.company.name, 'Snowline Studio', 'the owner\'s name');
  assert.equal(again.plan.departments[0].name, 'The Print Room', 'the owner\'s room name');
  assert.equal(again.plan.departments[0].positions[1].title, 'R1-2', 'a person already written keeps their title');
  assert.equal(again.state, 'cast', 'nothing was invalidated');
  assert.equal(again.plan.departments[0].purpose, 'Purpose 2.', 'what was open took the new answer');
  assert.equal(again.plan.departments[0].deliverable.file, 'piece-2.md');
  assert.equal(again.plan.provenance['departments.d1.positions.d1p2.title'], 'ai', 'and it is still marked as the model\'s');
  assert.equal(s.flow.create(s.owner, f.id).flow.state, 'created');
});

test('creating is all or nothing: a failure after the company exists takes it, its people and its Hall back, and the flow can be created again', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  await castAndWait(s, s.owner, f.id);
  const roster = s.services.roster;
  const hire = roster.hire.bind(roster);
  let n = 0;
  roster.hire = (...args) => { n += 1; if (n === 4) throw new PolicyError('Something went wrong with the fourth hire.', { status: 500, code: 'boom' }); return hire(...args); };
  assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.code === 'boom');
  assert.equal(s.services.store.listFor(s.owner).length, 0, 'no company is left');
  assert.equal(roster.db.prepare('SELECT COUNT(*) AS n FROM employees').get().n, 0, 'no employee is left');
  const after = s.flow.get(s.owner, f.id);
  assert.equal(after.state, 'failed');
  assert.equal(after.failedAt, 'create');
  assert.equal(after.created, null);
  assert.equal(after.next, 'create');
  assert.equal(roster.countCandidates(s.owner), 6, 'the people are still in the roster');
  roster.hire = hire;
  const made = s.flow.create(s.owner, f.id);
  assert.equal(made.flow.state, 'created');
  assert.equal(s.services.store.listFor(s.owner).length, 1);
});

test('a company is never made with a person who would hold tools the server does not allow', { skip }, async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'operator-policy.json'), JSON.stringify({ tools: ['google_search', 'url_context'] }));
  const s = setup({ dataDir: dir });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  await castAndWait(s, s.owner, f.id);
  assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.code === 'tier_not_granted' && /this server does not allow/.test(e.message));
  assert.equal(s.services.store.listFor(s.owner).length, 0);
  assert.equal(s.flow.get(s.owner, f.id).state, 'cast', 'nothing was started, so nothing failed: the flow stays as it was');
});

test('tools the owner chose are exactly the tools the company has; a person who needs more is named', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, locks: { tools: ['google_search', 'url_context'] } });
  await castAndWait(s, s.owner, f.id);
  assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.code === 'tier_not_granted' && /the tools you chose do not include/.test(e.message));
  const widened = await s.flow.edit(s.owner, f.id, { company: { tools: ['google_search', 'url_context', 'write_artifact', 'render_artifact', 'code_execution'] } });
  assert.equal(widened.plan.provenance['company.tools'], 'user');
  assert.equal(s.flow.create(s.owner, f.id).flow.state, 'created');
});

test('a room the ceiling does not allow is refused before anything is made', { skip }, async () => {
  const s = setup({ env: { COMPANY_MAX_AGENTS: '4' } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  await castAndWait(s, s.owner, f.id);
  assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.code === 'agent_cap' && /at most 4 agents.*room of 6/.test(e.message));
  assert.equal(s.services.store.listFor(s.owner).length, 0);
});

test('the operator\'s people cap holds for the whole flow', { skip }, async () => {
  const s = setup({ env: { COMPANY_FLOW_MAX_PEOPLE: '6' } });
  await assert.rejects(() => s.flow.propose(s.owner, { prompt: PROMPT, size: 'small' }), (e) => e.code === 'flow_people_cap');
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  assert.equal(f.estimate.people, 6);
  await assert.rejects(() => s.flow.edit(s.owner, f.id, { departments: [{ key: 'd1', positions: [{ title: 'Writer' }] }] }), (e) => /allows at most 6/.test(e.message));
});

test('a flow found casting or creating after a restart is marked failed, and keeps what it had', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  const rec = s.flow.store.get(s.owner, f.id);
  rec.state = 'casting';
  rec.cast.people.d1p1 = { status: 'ready', candidateId: 'a'.repeat(16), name: 'Kept Person' };
  s.flow.store.save(rec);
  const reloaded = new FlowStore({ rootDir: s.services.dataDir });
  const back = reloaded.get(s.owner, f.id);
  assert.equal(back.state, 'failed');
  assert.match(back.error, /server restarted/);
  assert.equal(back.cast.people.d1p1.name, 'Kept Person');
  assert.match(back.progress.at(-1).text, /server restarted while this was being cast/);
});

test('a company half built when the server stopped is taken apart on start', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  const half = s.services.store.create(s.owner, { name: 'Half Built', departments: ['Room'] });
  const rec = s.flow.store.get(s.owner, f.id);
  Object.assign(rec, { state: 'failed', failedAt: 'create', created: { companyId: half.id, partial: true } });
  s.flow.store.save(rec);
  s.flow._recover();
  assert.equal(s.services.store.listFor(s.owner).length, 0);
  assert.equal(s.flow.get(s.owner, f.id).created, null);
  assert.match(s.flow.get(s.owner, f.id).progress.at(-1).text, /half built/);
  assert.equal(s.flow.get(s.owner, f.id).next, 'create', 'the way on is to create it again');
});

test('a visitor keeps at most twenty flows: a new one retires the oldest finished, and none is made if all are busy', { skip }, async () => {
  const s = setup();
  const first = await s.flow.propose(s.owner, { prompt: PROMPT });
  s.flow.cancel(s.owner, first.id);
  for (let i = 1; i < 20; i++) await s.flow.propose(s.owner, { prompt: `Studio number ${i}.` });
  assert.equal(s.flow.list(s.owner).length, 20);
  await s.flow.propose(s.owner, { prompt: 'The twenty-first.' });
  const ids = s.flow.list(s.owner).map(x => x.id);
  assert.equal(ids.length, 20);
  assert.ok(!ids.includes(first.id), 'the cancelled one made room');
  await assert.rejects(() => s.flow.propose(s.owner, { prompt: 'The twenty-second.' }), (e) => e.code === 'flow_cap');
});

test('options tell a person or an agent what can be asked for, and what it costs', { skip }, async () => {
  const s = setup();
  const o = s.flow.options();
  assert.deepEqual(o.sizes.map(x => x.id), ['desk', 'small', 'medium', 'large']);
  assert.ok(o.sizes.every(x => x.allowed));
  assert.equal(o.estimate.perPersonUsd, ESTIMATE_PER_PERSON_USD);
  assert.ok(o.archetypes.length >= 11);
  assert.deepEqual(o.deliverables.map(d => d.id), ['engine', 'document']);
  assert.ok(o.lockablePersonFacts.includes('bornYear'));
  assert.match(o.stopsAt, /paused/);
  const capped = setup({ env: { COMPANY_FLOW_MAX_PEOPLE: '12' } }).flow.options();
  assert.deepEqual(capped.sizes.map(x => x.allowed), [true, true, false, false]);
  assert.ok(new Spend().snapshot().usd === 0);
});

// ── the screen at the door ───────────────────────────────────────────────────

const rosterProfile = (name, role, extra = '') => ({
  id: `p_${name}`, name, icon: '🙂', color: '#336699', category: 'roleplay', bioTemplate: `{{agent_name}}, the {{role}}. ${extra}`.trim(), variables: [],
  anchors: { agent_name: name, role }, tags: [],
});

test('a person in the roster whose sheet the screen would not admit is not taken from it: someone new is written instead', { skip }, async () => {
  const s = setup({ classify: markerClassifier({ 'MARKER-IN-SHEET': 'deception' }) });
  s.services.roster.addCandidate(s.owner, { profile: rosterProfile('Blocked Person', 'producer', 'MARKER-IN-SHEET'), casting: { dissent: 'low' }, archetype: 'steward', role: 'Producer', status: 'ready' });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, locks: { departments: [{ name: 'Solo', positions: [{ title: 'Producer', lead: true }] }] } });
  const done = await castAndWait(s, s.owner, f.id);
  assert.equal(done.state, 'cast');
  assert.equal(done.cast.people.d1p1.source, 'new');
  assert.notEqual(done.cast.people.d1p1.name, 'Blocked Person');
  assert.ok(done.progress.some(p => /Blocked Person fits Producer, but the company's screen would not admit them/.test(p.text)));
});

test('a person the owner chose, whose sheet the screen would not admit, is refused with the reason', { skip }, async () => {
  const s = setup({ classify: markerClassifier({ 'MARKER-IN-SHEET': 'deception' }) });
  const c = s.services.roster.addCandidate(s.owner, { profile: rosterProfile('Blocked Person', 'producer', 'MARKER-IN-SHEET'), casting: {}, archetype: 'steward', role: 'Producer', status: 'ready' });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, locks: { departments: [{ name: 'Solo', positions: [{ title: 'Producer', lead: true, candidateId: c.id }] }] } });
  const done = await castAndWait(s, s.owner, f.id);
  assert.equal(done.state, 'proposed');
  assert.equal(done.cast.people.d1p1.status, 'failed');
  assert.match(done.cast.people.d1p1.error, /safety screen would not admit Blocked Person/);
  assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.code === 'flow_not_cast');
});

test('the screen reads people under the company\'s mandate: change it and everyone is read again before the company can be created', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  const done = await castAndWait(s, s.owner, f.id);
  assert.ok(Object.values(done.cast.people).every(p => p.screened === true));
  const seen = s.ask.calls.length;
  const edited = await s.flow.edit(s.owner, f.id, { company: { mandate: { publishing: { audience: 'general' } } } });
  assert.equal(edited.state, 'proposed', 'nobody has been read under the new mandate');
  assert.ok(Object.values(edited.cast.people).every(p => p.screened === false));
  assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.code === 'flow_not_cast' && /has not read these people under its present mandate/.test(e.message));
  const sheets = steps(s.log, 'sheet');
  const again = await castAndWait(s, s.owner, f.id);
  assert.equal(again.state, 'cast');
  assert.ok(Object.values(again.cast.people).every(p => p.screened === true));
  assert.equal(steps(s.log, 'sheet'), sheets, 'nobody was written again, only read');
  assert.ok(s.ask.calls.length >= seen);
  assert.equal(s.flow.create(s.owner, f.id).flow.state, 'created');
});

// ── rooms that start from another room's file ────────────────────────────────

const needsPlan = (call) => { const a = fakePlanAnswer(call); a.departments[1].needs = 'd1'; return a; };

test('a company whose second room starts from the first: both briefs, the checks, the board and the handbook say so', { skip }, async () => {
  const s = setup({ handlers: { plan: needsPlan } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, size: 'small' });
  assert.equal(f.plan.departments[1].needs, 'd1');
  await castAndWait(s, s.owner, f.id);
  const made = s.flow.create(s.owner, f.id);
  const company = s.services.store.getOwned(made.company.id, s.owner);
  const [first, second] = company.plan.departments;
  assert.equal(first.needs, null);
  assert.deepEqual(first.sharesWith, ['Room 2 Works']);
  assert.deepEqual(second.needs, { id: company.departments[0].id, name: 'Room 1 Works', file: 'engine.json' });
  assert.match(second.goal, /START FROM ROOM 1 WORKS'S WORK\. Room 1 Works shares its finished engine\.json in the company workspace\./);
  assert.ok(second.goal.includes(`say so to ${first.lead} with the mailbox tool`), 'it names who to ask');
  assert.match(first.goal, /SHARE WHAT YOU MAKE\. Room 2 Works will start from your engine\.json\./);
  assert.ok(first.goal.includes(`sends ${second.lead} a handoff by mail`));
  assert.ok(first.doneWhen.some(c => c.tool === 'workspace' && c.after === 'artifact:engine.json'), 'the room that makes the file must share it after its last save');
  assert.ok(second.doneWhen.some(c => c.tool === 'workspace' && c.artifact === 'engine.json' && !c.after), 'the room that starts from it must have read it');
  assert.equal(s.services.store.describe(company).plan.departments[1].needs.name, 'Room 1 Works');
  const hall = s.services.hall;
  assert.match(hall.workspace.read(s.owner, company.id, 'README.md').content, /Room 2 Works\*\*: .* Makes notes\.md, starting from Room 1 Works's engine\.json \(shared in the workspace\)\./);
  const tasks = hall.board.list(s.owner, company.id);
  assert.match(tasks.find(t => t.title.startsWith('Room 2 Works')).description, /Starts from Room 1 Works's engine\.json, which that room shares in the workspace\./);
  const brief = s.flow.briefFor(s.owner, company.id, company.departments[1].id);
  assert.deepEqual(brief.needs, { name: 'Room 1 Works', file: 'engine.json', ready: false });
  assert.equal(s.flow.briefFor(s.owner, company.id, company.departments[0].id).needs, null);
  assert.deepEqual(s.flow.briefFor(s.owner, company.id, company.departments[0].id).sharesWith, ['Room 2 Works']);
  hall.workspace.write(s.owner, company.id, { id: null, name: 'Owner', system: true }, { path: 'engine.json', content: '{"name":"x"}', note: 'by hand' });
  assert.equal(s.flow.briefFor(s.owner, company.id, company.departments[1].id).needs.ready, true, 'it is ready the moment the file is in the workspace');
});

test('rooms that start from another room cannot be made where the shared workspace is closed', { skip }, async () => {
  for (const [label, env, locks] of [['the operator closed the Hall', { COMPANY_HALL: '0' }, {}], ['the owner closed the workspace', {}, { collaboration: { workspace: false } }]]) {
    const s = setup({ env, handlers: { plan: needsPlan } });
    const f = await s.flow.propose(s.owner, { prompt: PROMPT, size: 'small', locks });
    await castAndWait(s, s.owner, f.id);
    assert.throws(() => s.flow.create(s.owner, f.id), (e) => e.code === 'needs_workspace' && /Room 2 Works starts from another room's file.*shared workspace, which is closed/.test(e.message), label);
    assert.equal(s.services.store.listFor(s.owner).length, 0, label);
    // and the way out is to have that room start alone
    const alone = await s.flow.edit(s.owner, f.id, { departments: [{ key: 'd2', needs: null }] });
    assert.equal(alone.plan.departments[1].needs, undefined);
    assert.equal(s.flow.create(s.owner, f.id).flow.state, 'created', label);
  }
});

test('a room with nothing to start from has no hand-off in its brief', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, size: 'small' });
  await castAndWait(s, s.owner, f.id);
  const made = s.flow.create(s.owner, f.id);
  const company = s.services.store.getOwned(made.company.id, s.owner);
  for (const d of company.plan.departments) {
    assert.doesNotMatch(d.goal, /START FROM|SHARE WHAT YOU MAKE/);
    assert.equal(d.needs, null);
    assert.deepEqual(d.sharesWith, []);
    assert.ok(!d.doneWhen.some(c => c.tool === 'workspace'));
  }
});

test('what a flow has spent shows while it is casting, not only when it ends', { skip }, async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const s = setup({ handlers: { sheet: async (call, n) => { if (n === 2) await gate; } } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  s.flow.cast(s.owner, f.id);
  while (steps(s.log, 'sheet') < 2) await new Promise(r => setTimeout(r, 2));         // the first person is finished and the second is being written
  const mid = s.flow.get(s.owner, f.id);
  assert.equal(mid.state, 'casting');
  assert.ok(mid.spend.usd > f.spend.usd, `${mid.spend.usd} should be more than ${f.spend.usd}`);
  assert.ok(mid.spend.calls >= f.spend.calls + 4, 'the first person\'s seed, sheet, review and quiz are counted');
  assert.equal(mid.estimate.ready, 1);
  release();
  await s.flow.settled(f.id);
  assert.ok(s.flow.get(s.owner, f.id).spend.usd > mid.spend.usd);
});

// ── "if the user stops after the first prompt, the company is still completed" ───

test('auto: one prompt, and the company is made: the people are written and it is created, still paused', { skip }, async () => {
  const s = setup();
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, auto: true });
  assert.equal(f.state, 'casting', 'it answers at once, writing the people');
  assert.equal(f.settings.auto, undefined, 'the setting is the flow\'s own, not part of the answer');
  await s.flow.settled(f.id);
  const done = s.flow.get(s.owner, f.id);
  assert.equal(done.state, 'created');
  const company = s.services.store.getOwned(done.created.companyId, s.owner);
  assert.equal(company.state, 'paused', 'completed, and left paused: nothing runs until its owner says go');
  assert.equal(s.services.roster.seatsOf(s.owner, company.id).length, 6);
  assert.ok(done.progress.some(p => /was created, paused/.test(p.text)));
  assert.equal(s.services.store.listFor(s.owner).length, 1);
});

test('auto stops at the first thing a person has to decide: a position that could not be filled leaves the proposal, the people written and no company', { skip }, async () => {
  const s = setup({ handlers: { sheet: (call, n) => { if (n === 3) throw new PolicyError('The model service declined this request. That answer is final: it will not be tried again or reworded.', { status: 422, code: 'model_refused' }); } } });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, auto: true });
  await s.flow.settled(f.id);
  const done = s.flow.get(s.owner, f.id);
  assert.equal(done.state, 'proposed');
  assert.equal(s.services.store.listFor(s.owner).length, 0);
  assert.equal(Object.values(done.cast.people).filter(p => p.status === 'ready').length, 5);
  assert.equal(done.next, 'cast');
});

test('auto: a company that cannot be created (the people need tools the server does not allow) is left, with the reason in the log', { skip }, async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'operator-policy.json'), JSON.stringify({ tools: ['google_search', 'url_context'] }));
  const s = setup({ dataDir: dir });
  const f = await s.flow.propose(s.owner, { prompt: PROMPT, auto: true });
  await s.flow.settled(f.id);
  const done = s.flow.get(s.owner, f.id);
  assert.equal(done.state, 'cast', 'everyone is written; only the last step is refused');
  assert.match(done.progress.at(-1).text, /could not be created automatically: .*would hold tools that this server does not allow/);
  assert.equal(s.services.store.listFor(s.owner).length, 0);
});

test('auto needs a database to write people into, and says so before anything is spent', { skip }, async () => {
  const s = setup();
  const original = s.services.flow.getRoster;
  s.services.flow.getRoster = () => { throw new PolicyError('node:sqlite is not available', { status: 503, code: 'no_sqlite' }); };
  await assert.rejects(() => s.flow.propose(s.owner, { prompt: PROMPT, auto: true }), (e) => e.status === 503 && e.code === 'no_sqlite');
  assert.equal(s.log.length, 0, 'no model call was made');
  assert.equal(s.flow.list(s.owner).length, 0);
  s.services.flow.getRoster = original;
  await assert.rejects(() => s.flow.propose(s.owner, { prompt: PROMPT, auto: 'yes' }), (e) => e.status === 400 && e.field === 'auto');
});
