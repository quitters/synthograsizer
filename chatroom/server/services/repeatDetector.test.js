import test from 'node:test';
import assert from 'node:assert/strict';
import { RepeatDetector, proseWords, similarity, clampWindow, MIN_WORDS } from './repeatDetector.js';

// A message in the shape of the live loop: the same report with a few words changed each time.
const stuck = (n) => `Kamran, the renderer returned render_artifact failed once more (attempt ${n}). The connection to the image generation endpoint remains down. While we wait on that socket I verified our token distributions again and everything holds.`;
const fresh = [
  'The first draft names six variables and each value is a short noun phrase, so the weights can stay balanced across the whole sheet.',
  'Looking at the second pass, the lighting values overlap with the plumage ones, which would let two different draws collapse into one picture.',
  'I would now merge the two weakest perches and spend the freed slot on a second water behaviour, since the reflections carry most of the mood.',
  'The reviewers disagree about the title length, so the safest move is to shorten it below forty characters and let the subtitle carry the rest.',
];

test('prose is lower case words with fenced code left out, an unclosed fence included', () => {
  assert.deepEqual(proseWords('Hello, World! ```js\nconst x = 1;\n``` Bye.'), ['hello', 'world', 'bye']);
  assert.deepEqual(proseWords('Cut off ```js\nconst x = 1;'), ['cut', 'off']);
  assert.deepEqual(proseWords(null), []);
});

test('similarity: the same words are 1, unrelated words are near 0, a few changed words stay high', () => {
  assert.equal(similarity(stuck(1), stuck(1)), 1);
  assert.ok(similarity(fresh[0], fresh[1]) < 0.1);
  const close = similarity(stuck(1), stuck(2));
  assert.ok(close > 0.8 && close < 1, `got ${close}`);
});

test('three alike messages from one person trip it; two do not', () => {
  const d = new RepeatDetector();
  assert.equal(d.observe({ agentId: 'a', text: stuck(1) }), null);
  assert.equal(d.observe({ agentId: 'a', text: stuck(2) }), null);
  const hit = d.observe({ agentId: 'a', text: stuck(3) });
  assert.equal(hit.agentId, 'a');
  assert.equal(hit.count, 3);
  assert.ok(hit.similarity >= 0.8);
});

test('a different message in between ends the run: the count starts again from it', () => {
  const d = new RepeatDetector();
  d.observe({ agentId: 'a', text: stuck(1) });
  d.observe({ agentId: 'a', text: stuck(2) });
  assert.equal(d.observe({ agentId: 'a', text: fresh[0] }), null);
  assert.equal(d.observe({ agentId: 'a', text: stuck(3) }), null);
  assert.equal(d.observe({ agentId: 'a', text: stuck(4) }), null);
  assert.ok(d.observe({ agentId: 'a', text: stuck(5) }), 'three alike again after the break');
});

test('each person is counted on their own: others speaking in between do not hide a repeat', () => {
  const d = new RepeatDetector();
  const seen = [];
  for (let n = 1; n <= 3; n++) {
    seen.push(d.observe({ agentId: 'a', text: stuck(n) }));
    seen.push(d.observe({ agentId: 'b', text: fresh[n] }));
  }
  assert.equal(seen.filter(Boolean).length, 1);
  assert.equal(seen.find(Boolean).agentId, 'a');
});

test('it is about one person saying it again: two people who say alike things, two messages each, are not a repeat', () => {
  const d = new RepeatDetector();
  const hits = [];
  for (let n = 1; n <= 2; n++) { hits.push(d.observe({ agentId: 'a', text: stuck(n) })); hits.push(d.observe({ agentId: 'b', text: stuck(n) })); }
  assert.deepEqual(hits, [null, null, null, null], 'two each is under the window of three');
});

test('progress clears the run: saving a file or making a picture is something new, however alike the words', () => {
  const d = new RepeatDetector();
  d.observe({ agentId: 'a', text: stuck(1) });
  d.observe({ agentId: 'a', text: stuck(2) });
  assert.equal(d.observe({ agentId: 'a', text: stuck(3), progress: true }), null);
  assert.equal(d.observe({ agentId: 'a', text: stuck(4) }), null, 'the count started again');
  assert.equal(d.observe({ agentId: 'a', text: stuck(5) }), null);
  assert.ok(d.observe({ agentId: 'a', text: stuck(6) }));
});

test('reset forgets everything: the host spoke, or a person looked', () => {
  const d = new RepeatDetector();
  d.observe({ agentId: 'a', text: stuck(1) });
  d.observe({ agentId: 'a', text: stuck(2) });
  d.reset();
  assert.equal(d.observe({ agentId: 'a', text: stuck(3) }), null);
});

test('short messages are not compared, and do not end a run either', () => {
  const d = new RepeatDetector();
  assert.ok(proseWords('Agreed, moving on.').length < MIN_WORDS);
  d.observe({ agentId: 'a', text: stuck(1) });
  d.observe({ agentId: 'a', text: 'Agreed, moving on.' });
  d.observe({ agentId: 'a', text: stuck(2) });
  assert.equal(d.observe({ agentId: 'a', text: '' }), null);
  assert.ok(d.observe({ agentId: 'a', text: stuck(3) }));
  // and the same short line any number of times is never a repeat
  const e = new RepeatDetector();
  for (let n = 0; n < 8; n++) assert.equal(e.observe({ agentId: 'a', text: 'I have nothing further to add.' }), null);
});

test('revising a file means posting it again: code blocks are not what is compared', () => {
  const code = '```js\n' + Array.from({ length: 200 }, (_, i) => `const v${i} = Math.sin(${i} * 0.1) * ${i};`).join('\n') + '\n```';
  const d = new RepeatDetector();
  for (let n = 0; n < 4; n++) assert.equal(d.observe({ agentId: 'a', text: `${fresh[n]}\n\n${code}` }), null, 'new words every time, the same sketch under them');
  // and a message that is only the code has no words to compare
  for (let n = 0; n < 4; n++) assert.equal(d.observe({ agentId: 'a', text: code }), null);
});

test('the window is a setting: 2 trips on the second, 0 is off, a bad value falls back', () => {
  const two = new RepeatDetector();
  two.observe({ agentId: 'a', text: stuck(1), window: 2 });
  assert.ok(two.observe({ agentId: 'a', text: stuck(2), window: 2 }));
  const off = new RepeatDetector();
  for (let n = 0; n < 6; n++) assert.equal(off.observe({ agentId: 'a', text: stuck(n), window: 0 }), null);
  assert.deepEqual([clampWindow(0), clampWindow(1), clampWindow(2), clampWindow(5), clampWindow(99), clampWindow('x'), clampWindow(undefined)], [0, 2, 2, 5, 10, 3, 3]);
});

test('a very long message is compared by its first 600 words: a different tail past that does not hide a repeat', () => {
  const body = stuck(1);
  const tail = (n) => Array.from({ length: 900 }, (_, i) => `tail${n}word${i}`).join(' ');
  const padded = (n) => `${body} ${Array.from({ length: 700 }, () => 'filler').join(' ')} ${tail(n)}`;
  const d = new RepeatDetector();
  d.observe({ agentId: 'a', text: padded(1) });
  d.observe({ agentId: 'a', text: padded(2) });
  assert.ok(d.observe({ agentId: 'a', text: padded(3) }));
});
