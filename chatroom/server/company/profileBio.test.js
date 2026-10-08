import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Agent Profile → bio. The rendering is one pure module (static/synthograsizer/js/profile-bio.js) shared by the Composer's page module,
 * scripts and the chat room's server. The page module's own resolveProfileBio is a wrapper over it; these tests hold the two to the same answers.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.resolve(HERE, '../../../static/synthograsizer/js');
const { renderBio } = await import(pathToFileURL(path.join(JS, 'profile-bio.js')).href);

// the page module touches window and localStorage when it loads
globalThis.window ||= globalThis;
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const { resolveProfileBio, migrateProfileSchema } = await import(pathToFileURL(path.join(JS, 'agent-profiles.js')).href);

const knob = (name, texts, valueIdx) => ({ name, feature_name: name, ...(valueIdx === undefined ? {} : { valueIdx }), values: texts.map((text, i) => ({ text, weight: i + 1 })) });
const profile = (over = {}) => ({
  id: 'p1', name: 'Zayd', bioTemplate: '{{agent_name}}, the {{role}}. Pace: {{tempo}}. Candor: {{candor}}. {{ unknown }}Done.',
  anchors: { agent_name: 'Zayd Siddiqui', role: 'template engineer' },
  variables: [knob('tempo', ['slow', 'steady', 'brisk'], 1), knob('candor', ['gentle', 'plain', 'blunt'], 2)],
  ...over,
});

test('anchors and the profile\'s own settings fill the template; what is left unfilled is dropped', () => {
  assert.equal(renderBio(profile()), 'Zayd Siddiqui, the template engineer. Pace: steady. Candor: blunt. Done.');
});

test('a value is chosen by override, then UI knob, then the profile\'s own setting', () => {
  const p = profile();
  assert.match(renderBio(p, { uiVariableStates: { tempo: { index: 0 } } }), /Pace: slow\./);
  assert.match(renderBio(p, { uiVariableStates: { tempo: { index: 9 } } }), /Pace: steady\./, 'a knob outside the list is ignored');
  const sessionConfig = { agents: [{ profileId: 'p1', overrides: { tempo: 'in a hurry' } }] };
  assert.match(renderBio(p, { sessionConfig, uiVariableStates: { tempo: { index: 0 } } }), /Pace: in a hurry\./, 'the session\'s override wins over a knob');
  assert.match(renderBio(p, { sessionConfig: { agents: [{ profileId: 'other', overrides: { tempo: 'x' } }] } }), /Pace: steady\./, 'another agent\'s override is not ours');
});

test('without a setting a weighted pick is made, and it avoids repeating the last one', () => {
  const p = profile({ variables: [knob('tempo', ['slow', 'steady', 'brisk'])] });
  const memory = {};
  const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };
  // weights 1, 2, 3: a draw of 0.0 picks "slow", of 0.99 picks "brisk"
  assert.match(renderBio(p, { random: seq([0.0]), pickMemory: memory }), /Pace: slow\./);
  assert.equal(memory.tempo, 'slow');
  // the same draw would give "slow" again; the pick is re-rolled (0.0, then 0.99)
  assert.match(renderBio(p, { random: seq([0.0, 0.99]), pickMemory: memory }), /Pace: brisk\./);
  // a single value cannot avoid itself
  const one = profile({ variables: [knob('tempo', ['only'])] });
  assert.match(renderBio(one, { random: () => 0, pickMemory: { tempo: 'only' } }), /Pace: only\./);
  // knob weights replace the profile's weights for a draw
  assert.match(renderBio(p, { random: () => 0.5, uiVariableStates: { tempo: { weights: [0, 0, 1] } } }), /Pace: brisk\./);
});

test('the extra pool (the Composer passes the taste profile) is a fallback: the profile\'s own anchors and variables shadow it', () => {
  const p = profile({ bioTemplate: '{{agent_name}} likes {{taste}} in {{tempo}} work.', variables: [knob('tempo', ['slow', 'steady'], 0)], anchors: { agent_name: 'Zayd' } });
  const extra = { anchors: { agent_name: 'Someone Else', taste: 'teal' }, variables: [knob('tempo', ['x', 'y'], 0), knob('unused', ['u'], 0)] };
  assert.equal(renderBio(p, { extra }), 'Zayd likes teal in slow work.');
});

test('a value is inserted as written: "$&" and friends are not replacement patterns', () => {
  const p = profile({ bioTemplate: 'Fee: {{fee}}', anchors: {}, variables: [knob('fee', ['$& and $1 and $\''], 0)] });
  assert.equal(renderBio(p), 'Fee: $& and $1 and $\'');
});

test('a profile with no template gives its plain bio; nothing at all gives nothing', () => {
  assert.equal(renderBio({ bio: 'Just text.' }), 'Just text.');
  assert.equal(renderBio(null), '');
  assert.equal(renderBio(undefined), '');
});

test('the old flat-array value format still renders', () => {
  const p = { id: 'x', bioTemplate: '{{v}}', variables: [{ name: 'v', values: ['a', 'b'], weights: [1, 1], valueIdx: 1 }] };
  assert.equal(renderBio(p), 'b');
});

test('the page module\'s resolveProfileBio gives the same bio as the shared function', () => {
  const p = profile();
  assert.equal(resolveProfileBio(p), renderBio(p));
  const sessionConfig = { sharedAnchors: { role: 'ignored: the profile\'s own anchor wins' }, agents: [{ profileId: 'p1', overrides: { candor: 'quiet' } }] };
  const ui = { tempo: { index: 2 } };
  assert.equal(resolveProfileBio(p, sessionConfig, ui), renderBio(p, { sessionConfig, uiVariableStates: ui }));
  assert.equal(resolveProfileBio({ bio: 'plain' }), 'plain');
  // a migrated profile (the Composer's own path) reads the same through both
  const { profile: migrated } = migrateProfileSchema({ name: 'Old', bio: 'Old bio {{x}}', bioTemplate: 'Old bio {{x}}', variables: [{ name: 'x', values: ['one', 'two'], valueIdx: 1 }] });
  assert.equal(resolveProfileBio(migrated), renderBio(migrated));
  assert.equal(renderBio(migrated), 'Old bio two');
});

test('the page module adds the active taste profile as a fallback pool', () => {
  globalThis.TasteProfileStore = { asBioContext: () => ({ anchors: { taste_name: 'Harbour dusk' }, variables: [knob('taste_tendency', ['soft', 'hard'], 1)] }) };
  try {
    const p = { id: 't', bioTemplate: 'Taste: {{taste_name}}, {{taste_tendency}}.', anchors: {}, variables: [] };
    assert.equal(resolveProfileBio(p), 'Taste: Harbour dusk, hard.');
    assert.equal(renderBio(p), 'Taste: , .', 'the shared function alone knows no taste profile (both placeholders are dropped)');
  } finally {
    delete globalThis.TasteProfileStore;
  }
});
