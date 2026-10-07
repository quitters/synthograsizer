import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectFactory } from '../core/effect-system/effect-factory.js';
import { EffectChainManager } from '../core/effect-system/effect-chain-manager.js';
import { PRESET_PACKS, allPresets, presetProblems, applyPreset, presetFromChain } from '../ui/presets.js';

const factory = new EffectFactory();
factory.registerFilterEffectsWithApp({ apply: (image) => image });

test('there are packs, each with a name and presets with distinct names', () => {
  assert.ok(PRESET_PACKS.length >= 4);
  const names = allPresets().map(p => p.name);
  assert.equal(new Set(names).size, names.length, 'preset names must be unique across packs');
  for (const pack of PRESET_PACKS) {
    assert.ok(pack.id && pack.name && pack.blurb, pack.id);
    assert.ok(pack.presets.length > 0, pack.id);
  }
});

for (const preset of allPresets()) {
  test(`preset "${preset.name}" loads cleanly against the real effect registry`, () => {
    assert.deepEqual(presetProblems(preset, factory), []);
    const chain = new EffectChainManager();
    const { loaded, failed } = applyPreset(preset, chain, factory);
    assert.equal(failed.length, 0);
    assert.equal(loaded, preset.chain.length);
    assert.equal(chain.chain.length, preset.chain.length);
    // parameters really arrive on the effect
    preset.chain.forEach((cfg, i) => {
      for (const [k, v] of Object.entries(cfg.parameters || {})) assert.equal(chain.chain[i].parameters[k], v, `${cfg.type}.${k}`);
    });
  });
}

test('presetProblems names what is wrong', () => {
  const bad = {
    name: 'Bad',
    chain: [
      { type: 'direction', parameters: {} },
      { type: 'direction-movement', parameters: { direction: 'sideways', speed: 99, nope: 1 } },
      { type: 'direction-movement', parameters: {} }
    ]
  };
  const problems = presetProblems(bad, factory).join(' | ');
  assert.match(problems, /unknown effect "direction"/);
  assert.match(problems, /direction: "sideways"/);
  assert.match(problems, /speed: 99 is outside/);
  assert.match(problems, /no parameter "nope"/);
  assert.match(problems, /appears twice/);
  assert.deepEqual(presetProblems({ name: 'Empty', chain: [] }, factory), ['empty chain']);
});

test('"selection": "all" marks every effect as covering the whole image; other presets leave it off', () => {
  const chain = new EffectChainManager();
  const archive = allPresets().find(p => p.selection === 'all');
  assert.ok(archive, 'at least one whole-image preset');
  applyPreset(archive, chain, factory);
  assert.ok(chain.chain.every(e => e.wholeImage === true));
  const classic = allPresets().find(p => !p.selection);
  assert.ok(classic, 'at least one preset without it');
  applyPreset(classic, chain, factory);
  assert.ok(chain.chain.every(e => e.wholeImage === false));
});

test('loading replaces the stack and skips (and reports) an effect that cannot be built', () => {
  const chain = new EffectChainManager();
  chain.addEffect(factory.createEffect('color-invert'));
  const warn = console.warn; console.warn = () => {};
  try {
    const { loaded, failed } = applyPreset({ name: 'Mixed', chain: [{ type: 'hue-shift', parameters: {} }, { type: 'no-such-effect', parameters: {} }] }, chain, factory);
    assert.equal(loaded, 1);
    assert.deepEqual(failed, ['no-such-effect']);
  } finally { console.warn = warn; }
  assert.deepEqual(chain.chain.map(e => e.id), ['hue-shift']);
});

test('a stack saved as a preset loads back the same (id, mode, parameters, whole-image flag)', () => {
  const source = new EffectChainManager();
  applyPreset(allPresets().find(p => p.name === 'Nitrate Decay'), source, factory);
  source.chain[1].enabled = false;
  const saved = presetFromChain('My look', source.chain, { description: 'mine' });
  assert.equal(saved.selection, 'all');
  assert.deepEqual(presetProblems(saved, factory), []);
  const copy = new EffectChainManager();
  applyPreset(JSON.parse(JSON.stringify(saved)), copy, factory);
  assert.deepEqual(copy.chain.map(e => [e.id, e.mode, e.enabled, e.wholeImage, e.parameters]),
                   source.chain.map(e => [e.id, e.mode, e.enabled, e.wholeImage, e.parameters]));
});
