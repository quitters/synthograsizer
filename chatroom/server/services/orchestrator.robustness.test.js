import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrator } from './orchestrator.js';

/**
 * These drive the real conversation loop with a scripted stand-in for Gemini,
 * so nothing here touches the network.
 */

let events;

beforeEach(() => {
  orchestrator.reset();
  events = [];
  orchestrator.broadcast = (event, data) => { events.push([event, data]); };
  orchestrator.delay = () => Promise.resolve();          // no real waiting between turns
  orchestrator.addAgent('Ann Test', 'You are Ann.');
  orchestrator.addAgent('Ben Test', 'You are Ben.');
  // these tests are about the vote; the default is now a lead agent (see orchestrator.closing.test.js)
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

/** A generator that follows `script`: 'error:<msg>', 'empty', or any other string = a reply. */
function scripted(script, onDone) {
  let i = 0;
  const calls = { n: 0 };
  const gen = async function* () {
    calls.n++;
    const step = script[i++];
    if (step === undefined) { onDone?.(); return; }
    if (step.startsWith('error:')) { yield { type: 'error', error: step.slice(6) }; return; }
    if (step === 'throw') throw new Error('network down');
    if (step === 'empty') { yield { type: 'complete', fullResponse: '', tokenCount: 0 }; return; }
    yield { type: 'chunk', text: step };
    yield { type: 'complete', fullResponse: step, tokenCount: 10 };
  };
  gen.calls = calls;
  return gen;
}

// ── failures stop the session instead of looping for ever ────────────────────

test('repeated API errors stop the session after five failed turns', async () => {
  const gen = scripted(Array(50).fill('error:503 backend unavailable'));
  orchestrator._generate = gen;
  await orchestrator.start('say hi', 100000);
  await until(() => !orchestrator.isRunning);

  assert.equal(gen.calls.n, 5);
  assert.equal(orchestrator.completionReason, 'error_limit_reached');
  const end = named('session_end')[0];
  assert.equal(end.reason, 'error_limit_reached');
  assert.match(end.error, /503/);
});

test('a rejected API key stops the session on the first failure', async () => {
  const gen = scripted(Array(10).fill('error:API key not valid. Please pass a valid API key.'));
  orchestrator._generate = gen;
  await orchestrator.start('say hi', 100000);
  await until(() => !orchestrator.isRunning);

  assert.equal(gen.calls.n, 1);
  assert.equal(orchestrator.completionReason, 'error_limit_reached');
});

test('a thrown exception is counted too', async () => {
  const gen = scripted(Array(20).fill('throw'));
  orchestrator._generate = gen;
  await orchestrator.start('say hi', 100000);
  await until(() => !orchestrator.isRunning);

  assert.equal(gen.calls.n, 5);
  assert.match(named('session_end')[0].error, /network down/);
});

test('empty replies count as failures', async () => {
  const gen = scripted(Array(20).fill('empty'));
  orchestrator._generate = gen;
  await orchestrator.start('say hi', 100000);
  await until(() => !orchestrator.isRunning);

  assert.equal(gen.calls.n, 5);
  assert.equal(orchestrator.completionReason, 'error_limit_reached');
});

test('a good turn resets the streak, so scattered errors never stop a healthy chat', async () => {
  const fail = 'error:429 slow down';
  const script = [fail, fail, fail, fail, 'fine', fail, fail, fail, fail, 'fine again'];
  const gen = scripted(script, () => orchestrator.stop());
  orchestrator._generate = gen;
  await orchestrator.start('say hi', 100000);
  await until(() => !orchestrator.isRunning);

  assert.equal(orchestrator.completionReason, 'user_stopped');
  assert.equal(orchestrator.messages.length, 2);
});

test('retries back off: 1 s, 2 s, 4 s, 8 s, 16 s, then 30 s at most', () => {
  const seen = [];
  for (let n = 1; n <= 7; n++) { orchestrator.consecutiveFailures = n; seen.push(orchestrator._backoffMs()); }
  assert.deepEqual(seen, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
});

test('the loop waits between failed turns', async () => {
  const waits = [];
  orchestrator.delay = (ms) => { waits.push(ms); return Promise.resolve(); };
  orchestrator._generate = scripted(Array(20).fill('error:500 oops'));
  await orchestrator.start('say hi', 100000);
  await until(() => !orchestrator.isRunning);

  assert.deepEqual(waits, [1000, 2000, 4000, 8000]);     // the fifth failure stops it, no wait
});

test('a solo chat that fails waits for the user instead of stopping', async () => {
  orchestrator._generate = scripted(['error:500 oops', 'a reply']);
  await orchestrator.start('help me', 100000, { mode: 'solo' });
  orchestrator.injectMessage('hello?');
  await until(() => named('session_waiting_user').length > 0);

  assert.equal(orchestrator.isRunning, true);
  assert.equal(orchestrator.isPaused, true);
  assert.equal(orchestrator.completionReason, null);
});

test('a new user message clears the failure streak', async () => {
  orchestrator.consecutiveFailures = 4;
  orchestrator.injectMessage('try again');
  assert.equal(orchestrator.consecutiveFailures, 0);
});

// ── control tags stay out of the live stream ─────────────────────────────────

test('chunks sent to the browser never contain control tags, but the finished turn still acts on them', async () => {
  const reply = ['Nice. ', '[COMPOSE_FROM: 1111-2222', ' | a glowing moss] ', 'More text.'];
  let turn = 0;
  orchestrator._generate = async function* () {
    if (turn++ > 0) { yield { type: 'error', error: 'API key not valid' }; return; }   // end the run after one turn
    for (const text of reply) yield { type: 'chunk', text };
    yield { type: 'complete', fullResponse: reply.join(''), tokenCount: 20 };
  };
  await orchestrator.start('say hi', 100000);
  await until(() => !orchestrator.isRunning);

  const streamed = named('chunk').map(c => c.text).join('');
  assert.ok(!streamed.includes('COMPOSE_FROM'), streamed);
  assert.ok(!streamed.includes('glowing moss'), streamed);
  assert.equal(streamed, 'Nice.  More text.');
  // The tag was still parsed from the full text: it tried to remix an image that does not exist.
  assert.equal(named('image_error').length, 1);
});

// ── finishing needs more than one agent ──────────────────────────────────────

const [annId, benId] = [() => orchestrator.agents[0].id, () => orchestrator.agents[1].id];

test("one agent saying \"that's a wrap\" does not end the session", () => {
  orchestrator.turnCount = 6;
  assert.equal(orchestrator.checkForCompletion("OK, that's a wrap for me.", annId()), null);
  assert.equal(named('consensus_proposed').length, 1);
});

test('a completion phrase from two different agents does', () => {
  orchestrator.turnCount = 6;
  assert.equal(orchestrator.checkForCompletion('The final document is ready.', annId()), null);
  orchestrator.turnCount = 7;
  assert.equal(orchestrator.checkForCompletion("Agreed, that's a wrap.", benId()), 'consensus_reached');
});

test('the same agent repeating a phrase is still one vote', () => {
  orchestrator.turnCount = 6;
  orchestrator.checkForCompletion('final document', annId());
  orchestrator.turnCount = 7;
  assert.equal(orchestrator.checkForCompletion('final document, really', annId()), null);
});

test('a phrase and the explicit marker count towards the same vote', () => {
  orchestrator.turnCount = 6;
  orchestrator.checkForCompletion('mission accomplished', annId());
  orchestrator.turnCount = 7;
  assert.equal(orchestrator.checkForCompletion('Yes. [CONSENSUS REACHED]', benId()), 'consensus_reached');
});

test('votes older than the window expire', () => {
  orchestrator.turnCount = 6;
  orchestrator.checkForCompletion('final document', annId());
  orchestrator.turnCount = 20;
  assert.equal(orchestrator.checkForCompletion('final document', benId()), null);
});

test('low sensitivity and "explicit marker only" ignore phrases entirely', () => {
  orchestrator.consensusSettings.sensitivity = 'low';
  orchestrator.turnCount = 6;
  orchestrator.checkForCompletion('final document', annId());
  orchestrator.turnCount = 7;
  assert.equal(orchestrator.checkForCompletion('final document', benId()), null);

  orchestrator.consensusSettings.sensitivity = 'medium';
  orchestrator.consensusSettings.requireExplicitMarker = true;
  orchestrator.consensusVotes = [];
  assert.equal(orchestrator.checkForCompletion('final document', annId()), null);
  assert.equal(orchestrator.checkForCompletion('final document', benId()), null);
});

test("the user's own phrases vote too, case-insensitively", () => {
  orchestrator.consensusSettings.customPhrases = ['Ship It'];
  orchestrator.turnCount = 6;
  assert.equal(orchestrator.checkForCompletion('ship it!', annId()), null);
  orchestrator.turnCount = 7;
  assert.equal(orchestrator.checkForCompletion('SHIP IT', benId()), 'consensus_reached');
});

test('a phrase right after a user message still waits out the cooldown', () => {
  orchestrator.injectMessage('keep going');
  orchestrator.turnCount = orchestrator.lastUserMessageTurn + 1;
  orchestrator.checkForCompletion('final document', annId());
  assert.equal(orchestrator.checkForCompletion('final document', benId()), null);
});
