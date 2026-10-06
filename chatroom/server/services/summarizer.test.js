import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECENT_WINDOW, SUMMARY_BATCH, SUMMARY_MAX_CHARS,
  describeMessage, buildSummaryPrompt, foldIntoSummary, summaryIsValid, agedRange, needsRefresh,
} from './summarizer.js';

const msgs = (n, start = 0) => Array.from({ length: n }, (_, i) => ({
  id: `m${start + i}`, agentName: i % 2 ? 'Ben' : 'Ann', content: `message number ${start + i}`,
}));

// ── what the summarizer is shown ────────────────────────────────────────────

test('a message is described by who said it and what, with a note of anything attached', () => {
  assert.equal(describeMessage({ agentName: 'Ann', content: 'hello' }), '[Ann]: hello');
  assert.equal(describeMessage({ agentName: 'Kim', content: 'try blue', isUser: true }), '[Kim (the user)]: try blue');

  const rich = describeMessage({
    agentName: 'Ben', content: 'done',
    images: [{ prompt: 'a teal fern' }], toolResults: [{ type: 'search', query: 'ferns' }], workflowIds: ['w1'],
  });
  assert.match(rich, /generated 1 image\(s\): "a teal fern"/);
  assert.match(rich, /used tools: search "ferns"/);
  assert.match(rich, /started 1 workflow\(s\)/);
});

test('a very long message is clipped before it is sent', () => {
  const out = describeMessage({ agentName: 'Ann', content: 'x'.repeat(10000) });
  assert.ok(out.length < 1700 && out.endsWith('...'));
});

test('the prompt carries the goal, the notes so far and only the new messages', () => {
  const prompt = buildSummaryPrompt({ goal: 'plan a launch', previous: 'NOTES-ALREADY', messages: msgs(3, 10) });
  assert.match(prompt, /plan a launch/);
  assert.match(prompt, /NOTES-ALREADY/);
  assert.match(prompt, /message number 10/);
  assert.match(prompt, /message number 12/);
  assert.doesNotMatch(prompt, /message number 9\b/);
  assert.match(buildSummaryPrompt({ goal: 'g', previous: '', messages: msgs(1) }), /There are no notes yet/);
});

// ── turning model output into notes ─────────────────────────────────────────

test('the model output becomes the notes, trimmed', async () => {
  const text = await foldIntoSummary({ goal: 'g', messages: msgs(2), generate: async () => '  Ann and Ben agreed on blue.\n' });
  assert.equal(text, 'Ann and Ben agreed on blue.');
});

test('an empty answer is an error, so a refresh is retried rather than wiping the notes', async () => {
  await assert.rejects(foldIntoSummary({ goal: 'g', messages: msgs(2), generate: async () => '   ' }), /nothing/);
});

test('notes over the budget are cut at a sentence, never mid-word', async () => {
  const long = Array.from({ length: 400 }, (_, i) => `Sentence number ${i} says something.`).join(' ');
  const text = await foldIntoSummary({ goal: 'g', messages: msgs(2), generate: async () => long });
  assert.ok(text.length <= SUMMARY_MAX_CHARS + 4, `${text.length}`);
  assert.match(text, /says something\.( \.\.\.)?$/, 'ends on a whole sentence');
});

// ── when to refresh, and when notes can still be trusted ────────────────────

test('nothing ages out until there are more messages than the window', () => {
  assert.deepEqual(agedRange(msgs(RECENT_WINDOW), null), { from: 0, to: 0 });
  assert.deepEqual(agedRange(msgs(RECENT_WINDOW + 4), null), { from: 0, to: 4 });
});

test('a refresh waits for a batch to age out, then picks up where the last one stopped', () => {
  assert.equal(needsRefresh(msgs(RECENT_WINDOW + SUMMARY_BATCH - 1), null), false);
  assert.equal(needsRefresh(msgs(RECENT_WINDOW + SUMMARY_BATCH), null), true);

  const all = msgs(RECENT_WINDOW + SUMMARY_BATCH + 4);
  const summary = { text: 'notes', upTo: SUMMARY_BATCH, lastId: `m${SUMMARY_BATCH - 1}` };
  assert.deepEqual(agedRange(all, summary), { from: SUMMARY_BATCH, to: SUMMARY_BATCH + 4 });
  assert.equal(needsRefresh(all, summary), false, 'only 4 new ones aged out');
  assert.equal(needsRefresh(msgs(RECENT_WINDOW + SUMMARY_BATCH * 2), summary), true);
});

test('notes stop being valid when the messages they describe change', () => {
  const all = msgs(30);
  const summary = { text: 'notes', upTo: 10, lastId: 'm9' };
  assert.equal(summaryIsValid(summary, all), true);

  assert.equal(summaryIsValid(null, all), false);
  assert.equal(summaryIsValid({ ...summary, text: '' }, all), false);
  assert.equal(summaryIsValid(summary, all.slice(0, 8)), false, 'history was rewound past it');
  assert.equal(summaryIsValid(summary, [...all.slice(0, 9), { id: 'other', agentName: 'x', content: 'y' }, ...all.slice(10)]), false,
    'a different message sits where the notes end (branch restore)');
  assert.equal(summaryIsValid(summary, []), false);
});

test('with invalid notes the whole backlog counts as not yet summarized', () => {
  const all = msgs(30);
  assert.deepEqual(agedRange(all, { text: 'stale', upTo: 10, lastId: 'WRONG' }), { from: 0, to: 30 - RECENT_WINDOW });
});
