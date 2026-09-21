import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EffectFactory } from '../core/effect-system/effect-factory.js';
import { completeEffectCatalog } from '../ui/effect-catalog.js';

const factory = new EffectFactory();
const calls = [];
class FilterSpy {
  static apply(image, type, intensity, options) {
    calls.push({ type, intensity, options });
    return image;
  }
}
factory.registerFilterEffectsWithApp(new FilterSpy());
const source = readFileSync(new URL('../ui/chain-bridge.js', import.meta.url), 'utf8');
const curated = vm.runInNewContext(source.match(/const CATS = (\[[\s\S]*?\n\]);/)[1]);

test('Studio lists every registered effect exactly once, including future additions', () => {
  completeEffectCatalog(curated, factory.getAvailableEffects());
  const ids = curated.flatMap(category => category.effects.map(effect => effect.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), factory.getAvailableEffects().map(effect => effect.id).sort());
  completeEffectCatalog(curated, [{ id: 'future-effect', name: 'Future', category: 'New category' }]);
  assert.ok(curated.some(category => category.effects.some(effect => effect.id === 'future-effect')));
});

test('every classic filter is available and constructible in Studio', () => {
  const html = readFileSync(new URL('../classic.html', import.meta.url), 'utf8');
  const filterSelect = html.match(/<select[^>]*id="filter-effect-select"[\s\S]*?<\/select>/)[0];
  const aliases = { popArt: 'pop-art-filter', vintage: 'vintage-filter', emboss: 'emboss-filter', edgeDetect: 'edge-detect-filter', motionBlur: 'motion-blur-filter', vignette: 'vignette-filter', halftone: 'halftone-filter', liquify: 'liquify-warp', colorGrading: 'color-grading', noise: 'noise-texture' };
  for (const [, value] of filterSelect.matchAll(/<option value="([^"]+)"/g)) {
    if (value === 'off') continue;
    const effect = factory.createEffect(aliases[value] || value);
    assert.equal(typeof effect.processFunction, 'function', value);
    effect.processFunction({ width: 2, height: 2, data: new Uint8ClampedArray(16) }, effect.parameters);
  }
});

test('Dithering passes the chosen algorithm and palette to the filter', () => {
  const effect = factory.createEffect('dithering', { algorithm: 'atkinson', colorMode: 'gameboy' });
  effect.processFunction({ data: new Uint8ClampedArray(16) }, effect.parameters);
  assert.equal(calls.at(-1).options.dithering.algorithm, 'atkinson');
  assert.equal(calls.at(-1).options.dithering.colorMode, 'gameboy');
});
