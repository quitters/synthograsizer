/**
 * Typed composition slots — payload building.
 *
 * The backend caps slots at 10 object / 4 character / 3 style; these tests pin
 * the client half: roles route into `references`, un-roled images stay in the
 * flat `input_images` list exactly as before, and over-cap slots trim rather
 * than throw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReferencePayload,
  resolveSlot,
  SLOT_LIMITS,
} from './imageReferences.js';

const ref = (id, role) => ({ imageData: id, mimeType: 'image/png', ...(role ? { role } : {}) });

test('untyped references keep the historical flat shape', () => {
  const payload = buildReferencePayload([ref('a'), ref('b')]);
  assert.deepEqual(payload, { input_images: ['a', 'b'] });
  assert.equal(payload.references, undefined);
});

test('an empty list sends neither field', () => {
  assert.deepEqual(buildReferencePayload([]), {});
  assert.deepEqual(buildReferencePayload(), {});
});

test('roles route into their slots', () => {
  const payload = buildReferencePayload([
    ref('o', 'object'),
    ref('c', 'character'),
    ref('s', 'style'),
  ]);
  assert.deepEqual(payload.references, {
    objects: ['o'],
    character: ['c'],
    style: ['s'],
  });
  assert.equal(payload.input_images, undefined);
});

test('flat and typed references are additive', () => {
  const payload = buildReferencePayload([ref('flat'), ref('hero', 'character')]);
  assert.deepEqual(payload, {
    input_images: ['flat'],
    references: { character: ['hero'] },
  });
});

test('slots are emitted in a stable object/character/style order', () => {
  const payload = buildReferencePayload([
    ref('s', 'style'),
    ref('c', 'character'),
    ref('o', 'object'),
  ]);
  assert.deepEqual(Object.keys(payload.references), ['objects', 'character', 'style']);
});

test('over-cap slots trim instead of failing the generation', () => {
  const warnings = [];
  const many = Array.from({ length: 7 }, (_, i) => ref(`c${i}`, 'character'));
  const payload = buildReferencePayload(many, { warn: (m) => warnings.push(m) });
  assert.equal(payload.references.character.length, SLOT_LIMITS.character);
  assert.deepEqual(payload.references.character, ['c0', 'c1', 'c2', 'c3']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /character/);
});

test('each slot honours its own cap', () => {
  const payload = buildReferencePayload(
    [
      ...Array.from({ length: 12 }, (_, i) => ref(`o${i}`, 'object')),
      ...Array.from({ length: 5 }, (_, i) => ref(`s${i}`, 'style')),
    ],
    { warn: () => {} }
  );
  assert.equal(payload.references.objects.length, 10);
  assert.equal(payload.references.style.length, 3);
});

test('singular and plural role spellings both resolve', () => {
  assert.equal(resolveSlot('object'), 'objects');
  assert.equal(resolveSlot('objects'), 'objects');
  assert.equal(resolveSlot('characters'), 'character');
  assert.equal(resolveSlot('STYLE'), 'style');
});

test('a missing role means untyped, not an error', () => {
  assert.equal(resolveSlot(undefined), null);
  assert.equal(resolveSlot(null), null);
  assert.equal(resolveSlot(''), null);
});

test('an unknown role is a programming error and throws', () => {
  assert.throws(() => resolveSlot('background'), /Unknown reference role/);
  assert.throws(() => buildReferencePayload([ref('x', 'lighting')]));
});

test('references without image data are skipped', () => {
  const payload = buildReferencePayload([null, { mimeType: 'image/png' }, ref('a')]);
  assert.deepEqual(payload, { input_images: ['a'] });
});
