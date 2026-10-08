import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrator } from './orchestrator.js';
import { endingInstructions } from './gemini.js';

/**
 * Ways a session can end besides the consensus vote: a lead agent who alone closes it, a
 * minimum number of turns before any close, and a turn limit. Nothing here touches the network.
 */

let events;

beforeEach(() => {
  orchestrator.reset();
  events = [];
  orchestrator.broadcast = (event, data) => { events.push([event, data]); };
  orchestrator.delay = () => Promise.resolve();
  orchestrator.addAgent('Ann Test', 'You are Ann.');
  orchestrator.addAgent('Ben Test', 'You are Ben.');
  orchestrator.addAgent('Cy Test', 'You are Cy.');
});

const named = (name) => events.filter(([e]) => e === name).map(([, d]) => d);
const id = (name) => orchestrator.agents.find(a => a.name === name).id;
const ann = () => id('Ann Test');
const ben = () => id('Ben Test');
const cy = () => id('Cy Test');

async function until(cond, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting for the conversation loop');
    await new Promise(r => setTimeout(r, 5));
  }
}

/** A generator that replies with `reply(callNumber)` and records the options of every call. */
function replying(reply) {
  const gen = async function* (agent, _all, _messages, _goal, _media, options) {
    gen.calls.push({ agent: agent.name, options });
    const text = reply(gen.calls.length, agent);
    yield { type: 'chunk', text };
    yield { type: 'complete', fullResponse: text, tokenCount: 10 };
  };
  gen.calls = [];
  return gen;
}

// ── settings ─────────────────────────────────────────────────────────────────

test('by default the first agent is the lead: others cannot end the room, the lead can', () => {
  const s = orchestrator.getConsensusSettings();
  assert.equal(s.closeBy, 'lead');
  assert.equal(s.leadAgent, '');
  assert.equal(s.minTurns, 0);
  assert.equal(s.maxTurns, 0);
  assert.equal(orchestrator._leadAgent().name, 'Ann Test');
  orchestrator.turnCount = 6;
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ben()), null);
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', cy()), null, 'a quorum of non-leads does not end it');
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ann()), 'lead_closed');
});

test('the vote is still one setting away, and behaves as it always did', () => {
  orchestrator.updateConsensusSettings({ closeBy: 'vote' });
  assert.equal(orchestrator._leadAgent(), null);
  orchestrator.turnCount = 6;
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ann()), null);
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ben()), 'consensus_reached');
});

test('a solo chat always uses the vote: there is no one to be lead or to vote, and a marker must not end a chat that is waiting for the next message', () => {
  orchestrator.mode = 'solo';
  assert.equal(orchestrator._leadAgent(), null);
  assert.deepEqual(orchestrator._endingForPrompt(orchestrator.agents[0]), { mode: 'vote' });
  orchestrator.turnCount = 6;
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ann()), null, 'one vote is never a quorum of two');
});

test('the new settings are validated and clamped', () => {
  orchestrator.updateConsensusSettings({ closeBy: 'dictator', leadAgent: '  Ben Test ', minTurns: -4, maxTurns: 'abc' });
  const s = orchestrator.getConsensusSettings();
  assert.equal(s.closeBy, 'lead', 'an unknown method is ignored, the default stays');
  assert.equal(s.leadAgent, 'Ben Test');
  assert.equal(s.minTurns, 0, 'negative clamps to zero');
  assert.equal(s.maxTurns, 0, 'junk is ignored');
  orchestrator.updateConsensusSettings({ closeBy: 'lead', minTurns: '12', maxTurns: 40.9 });
  assert.equal(orchestrator.getConsensusSettings().closeBy, 'lead');
  assert.equal(orchestrator.getConsensusSettings().minTurns, 12);
  assert.equal(orchestrator.getConsensusSettings().maxTurns, 40);
});

// ── the lead closes ──────────────────────────────────────────────────────────

test('with a lead, a quorum of other agents cannot end the session', () => {
  orchestrator.updateConsensusSettings({ closeBy: 'lead', leadAgent: 'Ann Test' });
  orchestrator.turnCount = 8;
  assert.equal(orchestrator.checkForCompletion('Done. [CONSENSUS REACHED]', ben()), null);
  assert.equal(orchestrator.checkForCompletion('Agreed. [CONSENSUS REACHED]', cy()), null);
  const last = named('consensus_proposed').at(-1);
  assert.equal(last.leadRequired, true);
  assert.equal(last.lead, 'Ann Test');
  assert.equal(last.votes, 2, 'both recommendations are recorded');
});

test("the lead's explicit marker, or [END SESSION], ends it", () => {
  orchestrator.updateConsensusSettings({ closeBy: 'lead', leadAgent: 'ann test' });   // case-insensitive
  orchestrator.turnCount = 8;
  assert.equal(orchestrator.checkForCompletion('Closing. [CONSENSUS REACHED]', ann()), 'lead_closed');
  assert.equal(orchestrator.checkForCompletion('That is all. [end session]', ann()), 'lead_closed');
});

test('[END SESSION] from anyone but the lead, or without a lead, means nothing', () => {
  orchestrator.turnCount = 8;
  orchestrator.consensusSettings.requireExplicitMarker = true;      // so nothing falls through to the judge or the phrase list
  orchestrator.updateConsensusSettings({ closeBy: 'vote' });
  assert.equal(orchestrator.checkForCompletion('[END SESSION]', ann()), null, 'vote mode ignores it');
  orchestrator.updateConsensusSettings({ closeBy: 'lead', leadAgent: 'Ann Test' });
  assert.equal(orchestrator.checkForCompletion('[END SESSION]', ben()), null);
});

test("a completion phrase from the lead is a recommendation, not a close", () => {
  orchestrator.updateConsensusSettings({ closeBy: 'lead', leadAgent: 'Ann Test' });
  orchestrator.turnCount = 8;
  assert.equal(orchestrator.checkForCompletion("OK, that's a wrap for the first section.", ann()), null);
  assert.equal(orchestrator.checkForCompletion('Thanks everyone, great session, signing off, wrapping up.', ann()), null);
});

test('with no name the lead is the first agent; an unknown name falls back to the vote', () => {
  orchestrator.updateConsensusSettings({ closeBy: 'lead' });
  assert.equal(orchestrator._leadAgent().name, 'Ann Test');
  orchestrator.updateConsensusSettings({ leadAgent: 'Nobody' });
  assert.equal(orchestrator._leadAgent(), null);
  orchestrator.turnCount = 8;
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ben()), null);
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', cy()), 'consensus_reached', 'the room can still be ended');
});

test("a user message still starts the cooldown, in lead mode too", () => {
  orchestrator.updateConsensusSettings({ closeBy: 'lead', leadAgent: 'Ann Test' });
  orchestrator.injectMessage('wait, one more thing');
  orchestrator.turnCount = orchestrator.lastUserMessageTurn + 1;
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ann()), null);
});

test("the lead is told who is ready to close, and that it is only a recommendation", () => {
  orchestrator.updateConsensusSettings({ closeBy: 'lead', leadAgent: 'Ann Test' });
  orchestrator.turnCount = 8;
  orchestrator.checkForCompletion('[CONSENSUS REACHED]', ben());
  const forLead = orchestrator._closingNotes(orchestrator.agents[0]);
  assert.match(forLead, /Ben Test/);
  assert.match(forLead, /recommendation, not a decision/);
  assert.equal(orchestrator._closingNotes(orchestrator.agents[1]), null, 'the others get no such note');
});

test('the prompt says who ends the session', () => {
  assert.match(endingInstructions(), /When the goal is achieved, say "\[CONSENSUS REACHED\]"/);
  assert.match(endingInstructions({ mode: 'lead', leadName: 'Ann Test', isLead: true }), /only you can end this session/);
  assert.match(endingInstructions({ mode: 'lead', leadName: 'Ann Test', isLead: true }), /not evidence/);
  const other = endingInstructions({ mode: 'lead', leadName: 'Ann Test', isLead: false });
  assert.match(other, /Only Ann Test can end this session/);
  assert.match(other, /only Ann Test writes the closing marker/);
  assert.doesNotMatch(other, /say "\[CONSENSUS REACHED\]" to tell them/, 'the others are not asked to write the marker');
  assert.deepEqual(orchestrator._endingForPrompt(orchestrator.agents[1]), { mode: 'lead', leadName: 'Ann Test', isLead: false }, 'the default');
  assert.equal(orchestrator._endingForPrompt(orchestrator.agents[0]).isLead, true);
  orchestrator.updateConsensusSettings({ closeBy: 'vote' });
  assert.deepEqual(orchestrator._endingForPrompt(orchestrator.agents[1]), { mode: 'vote' });
});

// ── the floor ────────────────────────────────────────────────────────────────

test('minTurns holds off both the vote and the lead until enough turns have been taken', () => {
  orchestrator.updateConsensusSettings({ minTurns: 10, closeBy: 'vote' });
  orchestrator.turnCount = 4;
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ann()), null);
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ben()), null, 'quorum met, still too early');
  assert.equal(named('consensus_proposed').at(-1).tooEarly, true);
  orchestrator.turnCount = 10;
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', cy()), null, 'the early votes aged out of the window');
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ann()), 'consensus_reached', 'two fresh votes after the floor');

  orchestrator.updateConsensusSettings({ closeBy: 'lead', leadAgent: 'Ann Test' });
  orchestrator.turnCount = 6;
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ann()), null);
  orchestrator.turnCount = 10;
  assert.equal(orchestrator.checkForCompletion('[CONSENSUS REACHED]', ann()), 'lead_closed');
});

// ── the turn limit ───────────────────────────────────────────────────────────

test('maxTurns ends the session after exactly that many turns, with nobody agreeing to anything', async () => {
  orchestrator.updateConsensusSettings({ maxTurns: 4, sensitivity: 'manual' });
  const gen = replying(n => `Turn ${n}: still talking.`);
  orchestrator._generate = gen;
  await orchestrator.start('talk', 100000);
  await until(() => !orchestrator.isRunning);

  assert.equal(gen.calls.length, 4);
  assert.equal(orchestrator.completionReason, 'turn_limit_reached');
  assert.equal(named('session_end')[0].reason, 'turn_limit_reached');
});

test('the agents are warned in the last round, and told which turn is the last', async () => {
  orchestrator.updateConsensusSettings({ maxTurns: 6, sensitivity: 'manual' });
  const gen = replying(n => `Turn ${n}.`);
  orchestrator._generate = gen;
  await orchestrator.start('talk', 100000);
  await until(() => !orchestrator.isRunning);

  const notes = gen.calls.map(c => c.options.systemNotes);
  assert.equal(notes[0], null, 'no warning at the start');
  assert.equal(notes[2], null);
  assert.match(notes[3], /TURN LIMIT: this session stops after 6 turns and this is turn 4, with 2 more after it/);
  assert.match(notes[5], /turn 6, the LAST one/);
});

test('a message after a turn-limit ending restarts the room with a fresh allowance', async () => {
  orchestrator.updateConsensusSettings({ maxTurns: 3, sensitivity: 'manual' });
  const gen = replying(n => `Turn ${n}.`);
  orchestrator._generate = gen;
  await orchestrator.start('talk', 100000);
  await until(() => !orchestrator.isRunning);
  assert.equal(gen.calls.length, 3);

  orchestrator.injectMessage('three more, please');
  await until(() => !orchestrator.isRunning && gen.calls.length >= 6);
  assert.equal(gen.calls.length, 6);
  assert.equal(orchestrator.completionReason, 'turn_limit_reached');
});

test('the lead can end a running session before the turn limit', async () => {
  orchestrator.updateConsensusSettings({ closeBy: 'lead', leadAgent: 'Ann Test', maxTurns: 30 });
  // dynamic speaker choice is not under test: fix the order
  orchestrator.setSpeakingOrder('round-robin');
  // Ben and Cy declare victory every time they speak; the lead only does at its second turn
  const gen = replying((n, agent) => agent.name !== 'Ann Test' ? 'Looks done to me. [CONSENSUS REACHED]'
    : n >= 4 ? 'The deliverable is posted. [CONSENSUS REACHED]' : 'Not yet: the second section is missing.');
  orchestrator._generate = gen;
  await orchestrator.start('talk', 100000);
  await until(() => !orchestrator.isRunning);

  assert.equal(orchestrator.completionReason, 'lead_closed');
  assert.ok(gen.calls.length < 30);
  assert.ok(gen.calls.some(c => c.agent !== 'Ann Test'), 'others spoke, and their markers did not close it');
  assert.equal(gen.calls.at(-1).agent, 'Ann Test');
  assert.equal(gen.calls[0].options.ending.mode, 'lead');
});
