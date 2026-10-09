import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrator } from './orchestrator.js';

/**
 * A person who keeps saying the same thing pauses the room for someone to look (repeatDetector.js). These drive the real conversation
 * loop with scripted agents, so nothing here touches the network.
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

const STUCK = 'The renderer returned render_artifact failed once more and the connection to the image generation endpoint remains down, so I will wait on that socket and verify the token distributions again meanwhile.';
const NEW_THOUGHTS = [
  'The first draft keeps six variables with balanced weights, and every value is a short noun phrase that can stand alone in the sentence.',
  'The lighting values overlap with the plumage values, which would let two different draws collapse into the same picture, so one list needs trimming.',
  'Merging the two weakest perches frees a slot for a second water behaviour, since the reflections carry most of the mood in these scenes.',
  'The reviewers disagree about the title, so the safest move is to shorten it and let the subtitle carry the rest of the meaning for readers.',
  'Next the captions: they must never print lettering in the picture, so the template needs a clause that forbids any signage or writing at all.',
  'A final read of the weights shows the rare values sit at one and the common ones at three, which is the spread the brief asked for here.',
];

/** Ann says the same thing every turn; Ben says something new. */
function annRepeatsBenDoesNot(onCall) {
  const counts = { Ann: 0, Ben: 0 };
  const gen = async function* (speaker) {
    const who = speaker.name.split(' ')[0];
    counts[who] += 1;
    const text = who === 'Ann' ? STUCK : NEW_THOUGHTS[(counts.Ben - 1) % NEW_THOUGHTS.length];
    onCall?.(who, counts[who]);
    yield { type: 'chunk', text };
    yield { type: 'complete', fullResponse: text, tokenCount: 10 };
  };
  gen.counts = counts;
  return gen;
}

test('three near-identical messages from one person pause the room, say who, and leave it waiting for a person', async () => {
  const gen = annRepeatsBenDoesNot();
  orchestrator._generate = gen;
  await orchestrator.start('keep going', 1000000);
  await until(() => orchestrator.isPaused);

  assert.equal(gen.counts.Ann, 3, 'stopped at her third, not at the turn limit');
  assert.equal(orchestrator.isRunning, true, 'paused, not ended: a person can carry on');
  const pause = named('repeat_pause');
  assert.equal(pause.length, 1);
  assert.equal(pause[0].agentName, 'Ann Test');
  assert.equal(pause[0].count, 3);
  assert.ok(pause[0].similarity >= 0.8);
  assert.equal(orchestrator.getState().repeatPause.agentName, 'Ann Test');
  const note = orchestrator.messages.at(-1);
  assert.equal(note.agentName, 'Loop check');
  assert.equal(note.isNote, true);
  assert.match(note.content, /Ann Test's last 3 messages say almost the same thing/);
  assert.equal(named('session_paused').length, 1);
  orchestrator.stop();
});

test('resuming starts the count again: three more repeats pause it again, not one', async () => {
  const gen = annRepeatsBenDoesNot();
  orchestrator._generate = gen;
  await orchestrator.start('keep going', 1000000);
  await until(() => orchestrator.isPaused);
  assert.equal(gen.counts.Ann, 3);

  orchestrator.resume();
  assert.equal(orchestrator.getState().repeatPause, null, 'a person has looked');
  await until(() => orchestrator.isPaused && named('repeat_pause').length === 2);
  assert.equal(gen.counts.Ann, 6, 'three more of hers before the second pause');
  orchestrator.stop();
});

test('a message from the host starts the count again and carries the room on', async () => {
  const gen = annRepeatsBenDoesNot();
  orchestrator._generate = gen;
  await orchestrator.start('keep going', 1000000);
  await until(() => orchestrator.isPaused);

  orchestrator.injectMessage('Please try a different approach.');
  assert.equal(orchestrator.getState().repeatPause, null);
  assert.equal(orchestrator.isPaused, false, 'the host\'s message resumes a paused room, as it always did');
  await until(() => named('repeat_pause').length === 2);
  assert.equal(gen.counts.Ann, 6);
  orchestrator.stop();
});

test('people who say new things are never paused', async () => {
  let n = 0;
  orchestrator._generate = async function* () {
    const text = NEW_THOUGHTS[n % NEW_THOUGHTS.length] + ` (turn ${n})`;
    n += 1;
    if (n > 12) { orchestrator.stop(); return; }
    yield { type: 'chunk', text };
    yield { type: 'complete', fullResponse: text, tokenCount: 10 };
  };
  await orchestrator.start('keep going', 1000000);
  await until(() => !orchestrator.isRunning);
  assert.equal(named('repeat_pause').length, 0);
  assert.equal(orchestrator.getState().repeatPause, null);
});

test('repeatWindow 0 turns it off; 2 makes it quicker; the settings take only numbers it can use', async () => {
  assert.equal(orchestrator.getConsensusSettings().repeatWindow, 3, 'on by default');
  orchestrator.updateConsensusSettings({ repeatWindow: 0 });
  assert.equal(orchestrator.getConsensusSettings().repeatWindow, 0);
  orchestrator.updateConsensusSettings({ repeatWindow: 'banana' });
  assert.equal(orchestrator.getConsensusSettings().repeatWindow, 0, 'junk changes nothing');
  orchestrator.updateConsensusSettings({ repeatWindow: 99 });
  assert.equal(orchestrator.getConsensusSettings().repeatWindow, 10);
  orchestrator.updateConsensusSettings({ repeatWindow: 1 });
  assert.equal(orchestrator.getConsensusSettings().repeatWindow, 2, 'one alike message is not a repeat');

  orchestrator.updateConsensusSettings({ repeatWindow: 0 });
  const gen = annRepeatsBenDoesNot((who, count) => { if (who === 'Ann' && count === 8) orchestrator.stop(); });
  orchestrator._generate = gen;
  await orchestrator.start('keep going', 1000000);
  await until(() => !orchestrator.isRunning);
  assert.equal(named('repeat_pause').length, 0, 'eight repeats and nothing paused it');

  orchestrator.reset();
  orchestrator.addAgent('Ann Test', 'You are Ann.');
  orchestrator.addAgent('Ben Test', 'You are Ben.');
  orchestrator.updateConsensusSettings({ closeBy: 'vote', repeatWindow: 2 });
  const quick = annRepeatsBenDoesNot();
  orchestrator._generate = quick;
  await orchestrator.start('keep going', 1000000);
  await until(() => orchestrator.isPaused);
  assert.equal(quick.counts.Ann, 2);
  orchestrator.stop();
});

test('progress is never a repeat: a message that saved a file or made media starts the count again', async () => {
  const speaker = orchestrator.agents[0];
  const message = { content: STUCK };
  assert.equal(orchestrator._checkRepeat(speaker, message, false), false);
  assert.equal(orchestrator._checkRepeat(speaker, message, false), false);
  assert.equal(orchestrator._checkRepeat(speaker, message, true), false, 'it saved a file this time');
  assert.equal(orchestrator._checkRepeat(speaker, message, false), false);
  assert.equal(orchestrator._checkRepeat(speaker, message, false), false);
  assert.equal(orchestrator._checkRepeat(speaker, message, false), true, 'three in a row after the file');
  assert.equal(orchestrator.isPaused, true);
});

/** Ann repeats herself and makes `call` every turn (a tool call and its result, as the model layer yields them); Ben says new things. */
function annRepeatsAndCalls(call, onAnn) {
  let anns = 0;
  let bens = 0;
  const gen = async function* (speaker) {
    if (speaker.name.startsWith('Ben')) {
      const text = NEW_THOUGHTS[bens++ % NEW_THOUGHTS.length];
      yield { type: 'chunk', text };
      yield { type: 'complete', fullResponse: text, tokenCount: 10 };
      return;
    }
    anns += 1;
    onAnn?.(anns);
    yield { type: 'tool_call', id: `c${anns}`, name: call.name, args: call.args };
    yield { type: 'tool_result', id: `c${anns}`, name: call.name, ok: call.ok, summary: call.ok ? 'done' : 'failed' };
    yield { type: 'chunk', text: STUCK };
    yield { type: 'complete', fullResponse: STUCK, tokenCount: 10 };
  };
  gen.anns = () => anns;
  return gen;
}

test('a turn that saved a file is progress: the same words around a new file version never pause the room', async () => {
  const gen = annRepeatsAndCalls({ name: 'write_artifact', args: { filename: 'engine.json' }, ok: true }, (n) => { if (n === 8) orchestrator.stop(); });
  orchestrator._generate = gen;
  await orchestrator.start('keep going', 1000000);
  await until(() => !orchestrator.isRunning);
  assert.equal(named('repeat_pause').length, 0);
  assert.ok(gen.anns() >= 8);
});

test('a failed attempt is not progress: the live loop (a render that never came back) is caught', async () => {
  const gen = annRepeatsAndCalls({ name: 'render_artifact', args: { filename: 'engine.json' }, ok: false });
  orchestrator._generate = gen;
  await orchestrator.start('keep going', 1000000);
  await until(() => orchestrator.isPaused);
  assert.equal(gen.anns(), 3);
  assert.equal(named('repeat_pause')[0].agentName, 'Ann Test');
  orchestrator.stop();
});

test('writing to the company workspace is progress; reading it, or sending mail, is not', async () => {
  const run = async (call) => {
    orchestrator.reset();
    orchestrator.addAgent('Ann Test', 'You are Ann.');
    orchestrator.addAgent('Ben Test', 'You are Ben.');
    orchestrator.updateConsensusSettings({ closeBy: 'vote' });
    const gen = annRepeatsAndCalls(call, (n) => { if (n === 6) orchestrator.stop(); });
    orchestrator._generate = gen;
    await orchestrator.start('keep going', 1000000);
    await until(() => !orchestrator.isRunning || orchestrator.isPaused);
    const paused = orchestrator.isPaused;
    orchestrator.stop();
    return paused;
  };
  assert.equal(await run({ name: 'workspace', args: { action: 'write', path: 'a.md' }, ok: true }), false);
  assert.equal(await run({ name: 'workspace', args: { action: 'read', path: 'a.md' }, ok: true }), true);
  assert.equal(await run({ name: 'mailbox', args: { action: 'send' }, ok: true }), true);
});

test('a solo chat is never paused for this: the person is already in the loop', () => {
  orchestrator.mode = 'solo';
  const speaker = orchestrator.agents[0];
  for (let n = 0; n < 6; n++) assert.equal(orchestrator._checkRepeat(speaker, { content: STUCK }, false), false);
});
