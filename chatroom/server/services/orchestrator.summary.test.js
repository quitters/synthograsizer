import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrator } from './orchestrator.js';
import { RECENT_WINDOW, SUMMARY_BATCH, MAX_FOLD_MESSAGES } from './summarizer.js';

/** Messages m0..m{n-1}. */
const fill = (n) => {
  orchestrator.messages = Array.from({ length: n }, (_, i) => ({
    id: `m${i}`, agentId: 'a', agentName: i % 2 ? 'Ben' : 'Ann', content: `message number ${i}`,
  }));
};

const settled = async () => {
  for (let i = 0; i < 200 && orchestrator._summaryBusy; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(orchestrator._summaryBusy, false, 'the refresh finished');
};

let prompts, events;

beforeEach(() => {
  orchestrator.reset();
  prompts = [];
  events = [];
  orchestrator.goal = 'plan a launch';
  orchestrator.broadcast = (event, data) => { events.push([event, data]); };
  orchestrator._summarize = async (prompt) => { prompts.push(prompt); return `NOTES v${prompts.length}`; };
});

test('no model call is made until a batch of messages has aged out of the window', async () => {
  fill(RECENT_WINDOW + SUMMARY_BATCH - 1);
  orchestrator._maybeRefreshSummary();
  await settled();
  assert.equal(prompts.length, 0);
  assert.equal(orchestrator.summary, null);
});

test('once a batch has aged out, it is folded into notes in the background', async () => {
  fill(RECENT_WINDOW + SUMMARY_BATCH);
  orchestrator._maybeRefreshSummary();
  assert.equal(orchestrator._summaryBusy, true, 'it returns at once; the work happens behind the turn');
  await settled();

  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /plan a launch/);
  assert.match(prompts[0], /message number 0/);
  assert.match(prompts[0], new RegExp(`message number ${SUMMARY_BATCH - 1}\\b`));
  assert.doesNotMatch(prompts[0], new RegExp(`message number ${SUMMARY_BATCH}\\b`), 'only the aged-out ones');
  assert.deepEqual(orchestrator.summary, { text: 'NOTES v1', upTo: SUMMARY_BATCH, lastId: `m${SUMMARY_BATCH - 1}` });
  assert.deepEqual(events.find(([e]) => e === 'summary_updated')[1], { upTo: SUMMARY_BATCH, chars: 8 });
  assert.equal(orchestrator._summaryForPrompt().text, 'NOTES v1');
  assert.equal(orchestrator.getState().summarizedMessages, SUMMARY_BATCH);
});

test('the next refresh builds on the previous notes and only adds what is new', async () => {
  fill(RECENT_WINDOW + SUMMARY_BATCH);
  orchestrator._maybeRefreshSummary(); await settled();
  fill(RECENT_WINDOW + SUMMARY_BATCH * 2);
  orchestrator._maybeRefreshSummary(); await settled();

  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /NOTES v1/);
  assert.match(prompts[1], new RegExp(`message number ${SUMMARY_BATCH}\\b`));
  assert.doesNotMatch(prompts[1], /message number 0\b/, 'already in the notes');
  assert.equal(orchestrator.summary.upTo, SUMMARY_BATCH * 2);
});

test('a failed refresh changes nothing and is tried again on the next turn', async () => {
  fill(RECENT_WINDOW + SUMMARY_BATCH);
  orchestrator._summarize = async () => { throw new Error('429 slow down'); };
  orchestrator._maybeRefreshSummary(); await settled();
  assert.equal(orchestrator.summary, null);
  assert.equal(orchestrator._summaryForPrompt(), null);

  orchestrator._summarize = async () => 'NOTES recovered';
  orchestrator._maybeRefreshSummary(); await settled();
  assert.equal(orchestrator.summary.text, 'NOTES recovered');
});

test('an empty answer from the model is not kept as notes', async () => {
  fill(RECENT_WINDOW + SUMMARY_BATCH);
  orchestrator._summarize = async () => '  ';
  orchestrator._maybeRefreshSummary(); await settled();
  assert.equal(orchestrator.summary, null);
});

test('a refresh already in flight is not started twice', async () => {
  fill(RECENT_WINDOW + SUMMARY_BATCH);
  orchestrator._maybeRefreshSummary();
  orchestrator._maybeRefreshSummary();
  orchestrator._maybeRefreshSummary();
  await settled();
  assert.equal(prompts.length, 1);
});

test('notes finished after the history was rewound are thrown away', async () => {
  fill(RECENT_WINDOW + SUMMARY_BATCH * 2);
  let release;
  orchestrator._summarize = () => new Promise((resolve) => { release = () => resolve('NOTES for a history that is gone'); });
  orchestrator._maybeRefreshSummary();

  orchestrator.messages = orchestrator.messages.slice(0, 4);      // the user rewinds while the model works
  release();
  await settled();

  assert.equal(orchestrator.summary, null);
});

test('rewinding or restoring a branch makes existing notes unusable at once', async () => {
  fill(RECENT_WINDOW + SUMMARY_BATCH);
  orchestrator._maybeRefreshSummary(); await settled();
  assert.ok(orchestrator._summaryForPrompt());

  orchestrator.messages = orchestrator.messages.slice(0, SUMMARY_BATCH - 1);       // rewound past them
  assert.equal(orchestrator._summaryForPrompt(), null);
  assert.equal(orchestrator.getState().summarizedMessages, 0);

  fill(RECENT_WINDOW + SUMMARY_BATCH);                       // same length again, but different message objects...
  assert.ok(orchestrator._summaryForPrompt(), '...with the same ids the notes still describe');
  orchestrator.messages[SUMMARY_BATCH - 1] = { id: 'restored-from-a-branch', agentName: 'Ann', content: 'x' };
  assert.equal(orchestrator._summaryForPrompt(), null, 'a different message where the notes end');
});

test('a reset forgets the notes', async () => {
  fill(RECENT_WINDOW + SUMMARY_BATCH);
  orchestrator._maybeRefreshSummary(); await settled();
  orchestrator.reset();
  assert.equal(orchestrator.summary, null);
  assert.equal(orchestrator._summaryForPrompt(), null);
});

test('a long backlog is worked off in bounded steps', async () => {
  fill(RECENT_WINDOW + 100);
  orchestrator._maybeRefreshSummary(); await settled();
  assert.equal(orchestrator.summary.upTo, MAX_FOLD_MESSAGES);
  assert.equal(prompts.length, 1);

  orchestrator._maybeRefreshSummary(); await settled();
  assert.equal(orchestrator.summary.upTo, MAX_FOLD_MESSAGES * 2);
});

// ── through the real conversation loop ───────────────────────────────────────

test('in a live chat the notes are built after enough turns and reach a later speaker', async () => {
  const { setGeminiClient } = await import('./gemini.js');
  const TURNS = RECENT_WINDOW + SUMMARY_BATCH + 3;
  const requests = [];
  const client = {
    interactions: {
      async create(request) {
        requests.push(JSON.stringify(request.input));
        if (requests.length > TURNS) orchestrator.stop();                 // enough: end the run
        const n = requests.length;
        return (async function* () {
          yield { event_type: 'step.start', step: { type: 'model_output' } };
          yield { event_type: 'step.delta', delta: { type: 'text', text: `reply number ${n} from the model` } };
          yield { event_type: 'interaction.completed', interaction: { status: 'completed' } };
        })();
      },
    },
  };
  const previous = setGeminiClient(client);
  try {
    orchestrator.delay = () => Promise.resolve();
    orchestrator.addAgent('Ann Test', 'You are Ann.');
    orchestrator.addAgent('Ben Test', 'You are Ben.');
    await orchestrator.start('plan a launch', 1000000);
    for (let i = 0; i < 400 && orchestrator.isRunning; i++) await new Promise(r => setTimeout(r, 10));
    await settled();

    assert.equal(orchestrator.isRunning, false);
    assert.ok(orchestrator.messages.length >= RECENT_WINDOW + SUMMARY_BATCH, `${orchestrator.messages.length} messages`);
    assert.ok(prompts.length >= 1, 'a summary was requested during the chat');
    assert.ok(orchestrator.summary?.text.startsWith('NOTES v'), 'and stored');

    const withNotes = requests.filter(r => r.includes('NOTES v1'));
    assert.ok(withNotes.length >= 1, 'a later turn was given the notes');
    assert.ok(!requests[0].includes('NOTES'), 'the first turn had none');
    // those turns see the notes instead of one-line notes for the oldest messages
    assert.ok(withNotes.every(r => !r.includes('discussed:') || r.includes('briefly')));
  } finally {
    setGeminiClient(previous);
  }
});
