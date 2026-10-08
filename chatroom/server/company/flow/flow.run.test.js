import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeServices, markerClassifier, scripted, until } from '../testKit.js';
import { sqliteAvailable } from './sqlite.js';
import { fakeAsk } from './flowKit.js';
import { PolicyError } from '../errors.js';
import { MODELS } from '../../config/models.js';
import { newId } from '../util.js';
import { getRoom, peekRoom, clearRooms, registerRoomInitializer, clearRoomInitializers } from '../../services/sessionRegistry.js';

/**
 * Running what the flow made: a room is started with the brief, the checks, the review hand-offs and the way of closing that were written for it, only
 * when the company is running; and after a session each person who spoke writes down what they remember, checked against the record.
 */

const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';
const cleanups = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); clearRooms(); clearRoomInitializers(); });

const PROMPT = 'A studio that makes alpine snow-safety posters and the image templates to draw them.';

function setup({ handlers = {}, script = () => 'The file looks right to me, and I checked the first draw.' } = {}) {
  let kit;
  const ask = fakeAsk(handlers, { castings: () => [...kit.services.flow.store.flows.values()].flatMap(f => Object.values(f.cast.castings)) });
  const makeAsk = ({ spend, limitUsd }) => async (call) => {
    if (spend.usd >= limitUsd) throw new PolicyError('allowance', { status: 402, code: 'flow_spend_limit' });
    const out = await ask(call);
    spend.record(call.step, call.model || MODELS.FAST, { total_input_tokens: 1000, total_output_tokens: 500 });
    return out;
  };
  const roomsMade = [];
  const roomFor = (roomId) => {
    const room = getRoom(roomId);
    if (!room.orchestrator._scriptedByTest) {                             // the room's agents are scripted: no model is called
      room.orchestrator.delay = () => Promise.resolve();
      scripted(room.orchestrator, script, { delayMs: 4 });                 // (a model takes a moment: the room is still running when a test looks)
      room.orchestrator._scriptedByTest = true;
      roomsMade.push(roomId);
    }
    return room;
  };
  kit = makeServices({ classify: markerClassifier(), makeAsk, getRoom: roomFor });
  registerRoomInitializer(kit.services.attach);
  cleanups.push(kit.cleanup);
  return { ...kit, ask, flow: kit.services.flow, owner: newId(), roomsMade };
}

async function created(s) {
  const f = await s.flow.propose(s.owner, { prompt: PROMPT });
  s.flow.cast(s.owner, f.id);
  await s.flow.settled(f.id);
  const made = s.flow.create(s.owner, f.id);
  return { flowId: f.id, company: s.services.store.getOwned(made.company.id, s.owner) };
}

test('a paused company does not start a room; the room is not even made', { skip }, async () => {
  const s = setup();
  const { company } = await created(s);
  const dept = company.departments[0];
  await assert.rejects(() => s.flow.startDepartment(s.owner, company.id, dept.id), (e) => e.status === 409 && e.code === 'company_paused');
  assert.equal(peekRoom(dept.roomId), undefined, 'no room was made for it');
});

test('starting a room gives it the brief, the checks, the hand-offs and the way of closing that were written for it', { skip }, async () => {
  const s = setup();
  const { company } = await created(s);
  s.services.store.setState(company.id, s.owner, 'active');
  const dept = company.departments[0];
  const plan = company.plan.departments[0];
  const r = await s.flow.startDepartment(s.owner, company.id, dept.name);
  assert.equal(r.started, true);
  assert.equal(r.people.length, 6);
  assert.equal(r.lead, plan.lead);
  assert.equal(r.checks, 4);
  const o = peekRoom(dept.roomId).orchestrator;
  assert.ok(o.isRunning);
  assert.equal(o.goal, plan.goal);
  assert.ok(o.policy, 'the room is under its company\'s policy: the flow adds no power');
  const consensus = o.getConsensusSettings();
  assert.equal(consensus.closeBy, 'lead');
  assert.equal(consensus.leadAgent, plan.lead);
  assert.equal(consensus.minTurns, plan.minTurns);
  assert.ok(consensus.maxTurns <= plan.maxTurns);
  assert.deepEqual(o.getHandoffs().map(h => ({ next: h.next, artifact: h.artifact })), plan.handoffs);
  assert.deepEqual(o.getDoneWhen().criteria.map(c => c.type), ['json', 'tool_used', 'said_after', 'proposal']);
  assert.ok(o.agents.every(a => a.employeeId), 'every agent is a person from the roster');
  assert.equal(s.services.audit.read(company.id, { limit: 50 }).filter(e => e.type === 'flow_room_started').length, 1);
  await assert.rejects(() => s.flow.startDepartment(s.owner, company.id, dept.id), (e) => e.code === 'already_running');
  o.stop('user_stopped');
});

test('only the owner can start a room, and only a room the flow set up has a brief', { skip }, async () => {
  const s = setup();
  const { company } = await created(s);
  s.services.store.setState(company.id, s.owner, 'active');
  const dept = company.departments[0];
  await assert.rejects(() => s.flow.startDepartment(newId(), company.id, dept.id), (e) => e.status === 404);
  await assert.rejects(() => s.flow.closeOutDepartment(newId(), company.id, dept.id), (e) => e.status === 404);
  await assert.rejects(() => s.flow.startDepartment(s.owner, company.id, 'nonexistent'), (e) => e.code === 'no_department');
  const added = s.services.store.addDepartment(company.id, s.owner, 'Added By Hand');
  await assert.rejects(() => s.flow.startDepartment(s.owner, company.id, added.id), (e) => e.code === 'no_plan' && /start it by hand/.test(e.message));
  const handmade = s.services.store.create(s.owner, { name: 'By Hand', departments: ['Room'] });
  s.services.store.setState(handmade.id, s.owner, 'active');
  await assert.rejects(() => s.flow.startDepartment(s.owner, handmade.id, handmade.departments[0].id), (e) => e.code === 'no_plan');
});

test('a room that is not under its company\'s policy is not started', { skip }, async () => {
  const s = setup();
  const { company } = await created(s);
  s.services.store.setState(company.id, s.owner, 'active');
  clearRoomInitializers();                                               // (the app registers the initializer; here it is taken away)
  await assert.rejects(() => s.flow.startDepartment(s.owner, company.id, company.departments[0].id), (e) => e.code === 'no_policy');
});

test('a room whose people could not be seated is not started', { skip }, async () => {
  const s = setup();
  const { company } = await created(s);
  s.services.store.setState(company.id, s.owner, 'active');
  const roster = s.services.roster;
  for (const e of roster.employeesOf(s.owner, company.id).slice(1)) roster.leave(s.owner, e.id);
  await assert.rejects(() => s.flow.startDepartment(s.owner, company.id, company.departments[0].id), (e) => e.code === 'room_short' && /Only 1 of this room's people/.test(e.message));
});

test('closing out: each person who spoke writes down what they remember, kept for the next session and checked against the record', { skip }, async () => {
  const s = setup();
  const { company } = await created(s);
  s.services.store.setState(company.id, s.owner, 'active');
  const dept = company.departments[0];
  await s.flow.startDepartment(s.owner, company.id, dept.id);
  const o = peekRoom(dept.roomId).orchestrator;
  await until(() => o.messages.filter(m => !m.isNote).length >= 8);
  await assert.rejects(() => s.flow.closeOutDepartment(s.owner, company.id, dept.id), (e) => e.code === 'still_running');
  o.stop('user_stopped');
  const r = await s.flow.closeOutDepartment(s.owner, company.id, dept.id, { session: 'day 1' });
  assert.equal(r.session, 'day 1');
  assert.ok(r.people.some(p => p.entries.length >= 2), 'those who spoke have a summary and a lesson');
  assert.ok(r.people.every(p => p.entries.length === 0 || p.entries.every(e => e.verified === 'unchecked')), 'nothing the record could answer was claimed');
  assert.equal(r.flagged.length, 0);
  const roster = s.services.roster;
  const speaker = r.people.find(p => p.entries.length);
  assert.equal(roster.listMemory(s.owner, speaker.employeeId).length, speaker.entries.length);
  assert.equal(roster.getEmployee(s.owner, speaker.employeeId).sessions, 1);
  assert.equal(r.record.offered, 0);
  assert.ok(r.spend.usd > 0);
  assert.ok(s.services.audit.read(company.id, { limit: 50 }).some(e => e.type === 'memory_closed_out'));
  // what they wrote is in their bio in the room for the next session
  const agent = o.agents.find(a => a.employeeId === speaker.employeeId);
  assert.match(agent.bio, /WHAT YOU REMEMBER FROM EARLIER SESSIONS AT THIS COMPANY/);
});

test('a memory that claims what the record denies is kept, flagged, and not handed back', { skip }, async () => {
  const s = setup({ handlers: { memory: () => ({ summary: 'The team approved publishing, and I was proud of the poster we released.', lesson: 'Keep going.', relationships: [] }) } });
  const { company } = await created(s);
  s.services.store.setState(company.id, s.owner, 'active');
  const dept = company.departments[0];
  await s.flow.startDepartment(s.owner, company.id, dept.id);
  const o = peekRoom(dept.roomId).orchestrator;
  await until(() => o.messages.filter(m => !m.isNote).length >= 6);
  o.stop('user_stopped');
  const r = await s.flow.closeOutDepartment(s.owner, company.id, dept.id);
  assert.ok(r.flagged.length >= 1);
  assert.match(r.flagged[0].note, /Contradicted by the record/);
  const flaggedPerson = r.people.find(p => p.entries.some(e => e.verified === 'contradicted'));
  const handedBack = s.services.roster.memoryForBio(s.owner, flaggedPerson.employeeId);
  assert.ok(!handedBack.some(m => /approved publishing/.test(m.text)), 'the person is not told what is not so');
  assert.ok(s.services.roster.listMemory(s.owner, flaggedPerson.employeeId).some(m => /approved publishing/.test(m.text)), 'but the owner can read it, with the reason');
});

test('closing out a room that never spoke is refused', { skip }, async () => {
  const s = setup();
  const { company } = await created(s);
  await assert.rejects(() => s.flow.closeOutDepartment(s.owner, company.id, company.departments[0].id), (e) => e.code === 'nothing_said');
});
