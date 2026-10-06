import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamTagFilter, STREAM_TAG_NAMES } from './streamTagFilter.js';

/** Feed `text` through a fresh filter in chunks of `size` characters; return what a viewer sees. */
function shown(text, size = text.length || 1) {
  const f = createStreamTagFilter();
  let out = '';
  for (let i = 0; i < text.length; i += size) out += f.push(text.slice(i, i + size));
  return out + f.flush();
}

test('plain text passes through untouched, whatever the chunking', () => {
  const text = 'Luna says hello, and then some more. No tags here.';
  for (const size of [1, 3, 7, text.length]) assert.equal(shown(text, size), text);
});

test('a complete tag is hidden and the text around it is kept', () => {
  assert.equal(shown('Look: [GENERATE_IMAGE: a teal fern] nice.'), 'Look:  nice.');
});

test('the tag is hidden even when chunks split it anywhere', () => {
  const text = 'Before [COMPOSE_FROM: a132f6c1-b563 | a glowing moss, extreme macro] after.';
  for (const size of [1, 2, 5, 11]) assert.equal(shown(text, size), 'Before  after.', `chunk size ${size}`);
});

test('tag names are case-insensitive, like the parsers', () => {
  assert.equal(shown('x [generate_image: a cat] y', 3), 'x  y');
});

test('every name the parsers act on is hidden', () => {
  for (const name of STREAM_TAG_NAMES.filter(n => n !== 'ARTIFACT')) {
    assert.equal(shown(`a [${name}: payload] b`, 4), 'a  b', name);
  }
});

test('brackets that are not tags are kept', () => {
  for (const text of ['see [1] and [2]', 'a [Note: this stays] b', 'array[i] = 3', 'trailing [', 'x [SEARCHES] y']) {
    assert.equal(shown(text, 2), text);
  }
});

test('a half-typed tag name is held back, then released when it turns out not to be a tag', () => {
  const f = createStreamTagFilter();
  assert.equal(f.push('hi [SEA'), 'hi ');
  assert.equal(f.push('RCHES] there'), '[SEARCHES] there');
});

test('nested brackets inside a tag (JSON-ish payloads) stay hidden until the tag closes', () => {
  const text = 'ok [WORKFLOW_TEMPLATE: t1 | steps=[a,[b,c]] | x=1] done';
  assert.equal(shown(text, 4), 'ok  done');
});

test('an artifact body is hidden up to its closing tag, and the text after it is shown', () => {
  const text = 'Here you go. [ARTIFACT: app.js]\nconst a = [1, 2];\nconsole.log(a[0]);\n[/ARTIFACT] Thoughts?';
  for (const size of [1, 4, 9, text.length]) assert.equal(shown(text, size), 'Here you go.  Thoughts?', `chunk size ${size}`);
});

test('an unfinished artifact shows nothing further until the turn ends', () => {
  assert.equal(shown('Writing it now. [ARTIFACT: a.js]\nlet x = 1;\nlet y = 2;', 6), 'Writing it now. ');
});

test('an unbalanced "[" in a tag cannot hide the rest of the reply for ever', () => {
  const f = createStreamTagFilter();
  let out = f.push('start [URL: broken');
  out += f.push('x'.repeat(7000));
  out += f.push(' and the conversation goes on');
  assert.ok(out.includes('and the conversation goes on'));
});
