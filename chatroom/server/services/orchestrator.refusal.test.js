import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrator } from './orchestrator.js';

/**
 * When the model service declines a turn, that is final for the turn in a plain room too: it is not asked again, and the room is told.
 * (A company's room has always done this; the compliance roadmap says such blocks are "surfaced as failures, not retried around".)
 */

let events;

beforeEach(() => {
  orchestrator.reset();
  events = [];
  orchestrator.broadcast = (event, data) => { events.push([event, data]); };
  orchestrator.delay = () => Promise.resolve();
  orchestrator.addAgent('Ann Test', 'You are Ann.');
  orchestrator.addAgent('Ben Test', 'You are Ben.');
  orchestrator.updateConsensusSettings({ closeBy: 'vote' });
});

const named = (name) => events.filter(([e]) => e === name).map(([, d]) => d);

async function until(cond, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting for the conversation loop');
    await new Promise(r => setTimeout(r, 5));
  }
}

const SAYINGS = [
  'The first draft keeps six variables with balanced weights, and every value is a short noun phrase that can stand alone in the sentence.',
  'The lighting values overlap with the plumage values, which would let two different draws collapse into the same picture, so one list needs trimming.',
  'Merging the two weakest perches frees a slot for a second water behaviour, since the reflections carry most of the mood in these scenes.',
  'The reviewers disagree about the title, so the safest move is to shorten it and let the subtitle carry the rest of the meaning for readers.',
];

/** `declined(name, n)` says whether this speaker's nth turn is declined by the model service. */
function scripted(declined, onTurn) {
  const turns = {};
  const gen = async function* (speaker) {
    const who = speaker.name;
    turns[who] = (turns[who] || 0) + 1;
    gen.calls.push(who);
    onTurn?.(who, turns[who]);
    if (declined(who, turns[who])) { yield { type: 'refusal', detail: 'SAFETY' }; return; }
    const text = SAYINGS[gen.calls.length % SAYINGS.length];
    yield { type: 'chunk', text };
    yield { type: 'complete', fullResponse: text, tokenCount: 10 };
  };
  gen.calls = [];
  return gen;
}

test('a declined turn is not tried again: the room is told, the turn is skipped and the conversation goes on', async () => {
  const gen = scripted((who, n) => who === 'Ann Test' && n === 1, () => { if (gen.calls.length >= 6) orchestrator.stop(); });
  orchestrator._generate = gen;
  await orchestrator.start('keep going', 1000000);
  await until(() => !orchestrator.isRunning);

  const note = orchestrator.messages.find(m => m.isNote && /declined Ann Test's turn/.test(m.content));
  assert.ok(note, 'the room is told in plain words');
  assert.match(note.content, /final for this turn: it will not be retried, reworded or sent to another model/);
  assert.equal(named('provider_refusal').length, 1);
  assert.equal(named('provider_refusal')[0].agentName, 'Ann Test');
  assert.ok(!orchestrator.messages.some(m => m.agentName === 'Ann Test' && !m.isNote && /SAFETY/.test(m.content)), 'nothing of the declined turn is kept');
  assert.equal(gen.calls.slice(0, 2).join(), 'Ann Test,Ben Test', 'after the refusal it is the next person\'s turn, not Ann asked again straight away');
  assert.equal(orchestrator.consecutiveFailures === 0 || orchestrator.consecutiveFailures === 1, true);
});

test('a room in which every turn is declined stops after five, with the reason, instead of asking for ever', async () => {
  const gen = scripted(() => true);
  orchestrator._generate = gen;
  await orchestrator.start('keep going', 1000000);
  await until(() => !orchestrator.isRunning);
  assert.equal(gen.calls.length, 5, 'five turns asked once each');
  assert.equal(orchestrator.completionReason, 'error_limit_reached');
  assert.match(orchestrator.getState().error, /safety filters declined .* turn \(SAFETY\)/);
  assert.equal(named('provider_refusal').length, 5);
});

test('a turn that goes well clears the count, so scattered refusals never stop a healthy room', async () => {
  // every third turn is declined, and nobody is declined twice in a row
  const gen = scripted(() => false);
  let n = 0;
  orchestrator._generate = async function* (speaker) {
    n += 1;
    if (n % 3 === 0) { yield { type: 'refusal', detail: 'SAFETY' }; return; }
    if (n > 20) { orchestrator.stop(); return; }
    yield* gen(speaker);
  };
  await orchestrator.start('keep going', 1000000);
  await until(() => !orchestrator.isRunning);
  assert.equal(orchestrator.completionReason, 'user_stopped');
  assert.ok(named('provider_refusal').length >= 6);
});

test('a solo chat waits for the person after a declined turn, as it does after any failed one', async () => {
  orchestrator.reset();
  orchestrator.addAgent('Ann Test', 'You are Ann.');
  orchestrator.mode = 'solo';
  const gen = scripted(() => true);
  orchestrator._generate = gen;
  await orchestrator.start('say hi', 1000000, { mode: 'solo' });
  orchestrator.injectMessage('hello?');
  await until(() => orchestrator.isPaused && gen.calls.length >= 1);
  assert.equal(gen.calls.length, 1, 'asked once, not retried');
  assert.ok(named('session_waiting_user').length >= 1);
  orchestrator.stop();
});
