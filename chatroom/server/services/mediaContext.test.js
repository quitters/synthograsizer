import test from 'node:test';
import assert from 'node:assert/strict';
import { planSessionMedia, isFresh, MEDIA_LIMITS } from './mediaContext.js';

const b64 = (text) => Buffer.from(text, 'utf-8').toString('base64');
const image = (id, chars = 1000, addedAtMessage = 0) => ({ id, name: `${id}.png`, mimeType: 'image/png', data: 'A'.repeat(chars), addedAtMessage });
const video = (id, chars = 1000, addedAtMessage = 0) => ({ id, name: `${id}.mp4`, mimeType: 'video/mp4', data: 'A'.repeat(chars), addedAtMessage });
const pdf = (id, chars = 1000, addedAtMessage = 0) => ({ id, name: `${id}.pdf`, mimeType: 'application/pdf', data: 'A'.repeat(chars), addedAtMessage });
const text = (id, body, addedAtMessage = 0) => ({ id, name: `${id}.txt`, mimeType: 'text/plain', data: b64(body), addedAtMessage });

const late = { messageCount: 40, agentCount: 3 };          // well into a conversation
const byId = (plan) => Object.fromEntries(plan.map(e => [e.media.id, e]));

// ── freshness ────────────────────────────────────────────────────────────────

test('everything is fresh in the opening turns', () => {
  for (const messageCount of [0, 1, 2]) assert.equal(isFresh({ addedAtMessage: 0 }, { messageCount, agentCount: 2 }), true);
  assert.equal(isFresh({ addedAtMessage: 0 }, { messageCount: 3, agentCount: 2 }), false);
  // ...and with more agents, long enough for each of them to have a turn
  assert.equal(isFresh({ addedAtMessage: 0 }, { messageCount: 3, agentCount: 4 }), true);
});

test('a file stays fresh for as many turns as there are agents after it is added', () => {
  const media = { addedAtMessage: 20 };
  for (const messageCount of [20, 21, 22, 23]) assert.equal(isFresh(media, { messageCount, agentCount: 3 }), true, `at ${messageCount}`);
  assert.equal(isFresh(media, { messageCount: 24, agentCount: 3 }), false);
});

test('if the history is rewound to before a file was added, it counts as fresh again', () => {
  assert.equal(isFresh({ addedAtMessage: 30 }, { messageCount: 12, agentCount: 2 }), true);
});

test('a file with no recorded position is treated as added at the very start', () => {
  assert.equal(isFresh({}, { messageCount: 10, agentCount: 2 }), false);
});

// ── images ───────────────────────────────────────────────────────────────────

test('images are attached on every turn, however late', () => {
  for (const messageCount of [0, 3, 40, 500]) {
    const [entry] = planSessionMedia([image('a')], { messageCount, agentCount: 2 });
    assert.equal(entry.attached, true, `at ${messageCount}`);
    assert.equal(entry.kind, 'image');
  }
});

test('only the newest images are attached when there are more than the cap', () => {
  const media = Array.from({ length: 11 }, (_, i) => image(`i${i}`, 1000, i));
  const plan = planSessionMedia(media, late);
  const attached = plan.filter(e => e.attached).map(e => e.media.id);
  assert.equal(attached.length, MEDIA_LIMITS.maxImages);
  assert.deepEqual(attached.sort(), ['i10', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9'].sort());
  assert.match(byId(plan).i0.reason, /8 newest images/);
});

test('images over the byte budget are left out, newest first, with the reason', () => {
  const big = MEDIA_LIMITS.imageBudgetChars / 2 + 1;          // two of these cannot both fit
  const plan = planSessionMedia([image('old', big, 1), image('new', big, 9)], late);
  assert.equal(byId(plan).new.attached, true);
  assert.equal(byId(plan).old.attached, false);
  assert.match(byId(plan).old.reason, /size budget/);
});

test('the plan lists every file in upload order, attached or not', () => {
  const plan = planSessionMedia([image('first', 100, 5), text('second', 'hi'), image('third', 100, 1)], late);
  assert.deepEqual(plan.map(e => e.media.id), ['first', 'second', 'third']);
});

// ── video and PDF ────────────────────────────────────────────────────────────

test('video and PDF are attached in the opening turns and left out once they are stale', () => {
  const media = [video('clip'), pdf('script')];
  for (const e of planSessionMedia(media, { messageCount: 2, agentCount: 3 })) assert.equal(e.attached, true);

  const stale = byId(planSessionMedia(media, late));
  assert.equal(stale.clip.attached, false);
  assert.equal(stale.script.attached, false);
  assert.match(stale.clip.reason, /only attached for a few turns/);
});

test('a video uploaded mid-conversation is attached for the turns that follow, so every agent sees it', () => {
  const media = [video('clip', 1000, 20)];
  assert.equal(planSessionMedia(media, { messageCount: 20, agentCount: 3 })[0].attached, true);
  assert.equal(planSessionMedia(media, { messageCount: 23, agentCount: 3 })[0].attached, true);
  assert.equal(planSessionMedia(media, { messageCount: 24, agentCount: 3 })[0].attached, false);
});

test('video and PDF have their own size budget', () => {
  const big = MEDIA_LIMITS.heavyBudgetChars / 2 + 1;
  const plan = byId(planSessionMedia([video('a', big, 1), pdf('b', big, 2)], { messageCount: 2, agentCount: 2 }));
  assert.equal(plan.b.attached, true, 'newer wins');
  assert.equal(plan.a.attached, false);
  assert.match(plan.a.reason, /size budget/);
});

// ── text ─────────────────────────────────────────────────────────────────────

test('text files are included in full on every turn', () => {
  const [entry] = planSessionMedia([text('notes', 'The codeword is PERIWINKLE-42.')], late);
  assert.equal(entry.attached, true);
  assert.equal(entry.text, 'The codeword is PERIWINKLE-42.');
  assert.equal(entry.truncated, false);
});

test('a long text file is cut to the per-file limit and says how long it was', () => {
  const [entry] = planSessionMedia([text('long', 'x'.repeat(20000))], late);
  assert.equal(entry.text.length, MEDIA_LIMITS.textPerFileChars);
  assert.equal(entry.truncated, true);
  assert.equal(entry.totalChars, 20000);
});

test('text files share one budget', () => {
  const files = Array.from({ length: 6 }, (_, i) => text(`t${i}`, 'y'.repeat(20000)));
  const plan = planSessionMedia(files, late);
  const total = plan.reduce((n, e) => n + e.text.length, 0);
  assert.ok(total <= MEDIA_LIMITS.textBudgetChars, `${total}`);
  assert.ok(plan.every(e => e.text.length >= MEDIA_LIMITS.minTextPerFileChars));
});

test('other file types are only listed', () => {
  const [entry] = planSessionMedia([{ id: 'z', name: 'z.zip', mimeType: 'application/zip', data: 'AAAA' }], late);
  assert.equal(entry.kind, 'other');
  assert.equal(entry.attached, false);
});

test('no files, no plan', () => {
  assert.deepEqual(planSessionMedia([], late), []);
});

// ── chained (stateful) turns ─────────────────────────────────────────────────

test('on a chained turn, files the agent was already shown are not sent again', () => {
  const media = [image('old', 100, 0), image('mid', 100, 8), text('notes', 'hi', 0), video('clip', 100, 3)];
  const plan = byId(planSessionMedia(media, { messageCount: 12, agentCount: 3, seenUpTo: 10 }));
  for (const id of ['old', 'mid', 'notes', 'clip']) {
    assert.equal(plan[id].seen, true, id);
    assert.equal(plan[id].attached, false, id);
  }
});

test('a file added since the agent last spoke is sent, including one added during its own last turn', () => {
  const media = [image('during', 100, 9), image('after', 100, 11), text('late', 'new notes', 10)];
  const plan = byId(planSessionMedia(media, { messageCount: 12, agentCount: 3, seenUpTo: 10 }));
  assert.equal(plan.during.seen, false);
  assert.equal(plan.during.attached, true);
  assert.equal(plan.after.attached, true);
  assert.equal(plan.late.attached, true);
  assert.equal(plan.late.text, 'new notes');
});

test('files already in the history do not use up the budget for new ones', () => {
  const old = Array.from({ length: 8 }, (_, i) => image(`old${i}`, 100, 0));
  const plan = byId(planSessionMedia([...old, image('fresh', 100, 11)], { messageCount: 12, agentCount: 3, seenUpTo: 10 }));
  assert.equal(plan.fresh.attached, true);
  assert.ok(old.every(m => plan[m.id].seen));
});

test('without seenUpTo (a first or stateless turn) nothing counts as already seen', () => {
  const plan = planSessionMedia([image('a', 100, 0)], { messageCount: 12, agentCount: 3 });
  assert.equal(plan[0].seen, false);
  assert.equal(plan[0].attached, true);
});
