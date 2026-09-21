import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SelectionEngine } from '../selection/selection-engine.js';
import { EnhancedSelectionUI } from '../ui/enhanced-selection-ui.js';

const bridgeSource = readFileSync(new URL('../ui/chain-bridge.js', import.meta.url), 'utf8');
const wiring = bridgeSource.match(/function wireAnimationControls\(\) \{[\s\S]*?\n\}/)[0];

// Minimal form harness: options and defaults come from the shipped HTML.
// Reproduce native select behavior (an unsupported value becomes empty).
function formFor(page) {
  const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
  const nodes = new Map();
  for (const match of html.matchAll(/<(select|input|span|output)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [, tag, attrs, id] = match;
    const contents = tag === 'select' ? html.slice(match.index + match[0].length).split('</select>')[0] : '';
    const options = [...(contents || '').matchAll(/<option\b([^>]*)>/g)];
    const values = options.map(option => option[1].match(/value="([^"]+)"/)?.[1]);
    const selected = options.findIndex(option => /\bselected\b/.test(option[1]));
    let value = tag === 'select' ? values[Math.max(0, selected)] : attrs.match(/\bvalue="([^"]*)"/)?.[1] || '';
    const listeners = new Map();
    nodes.set(id, {
      tagName: tag.toUpperCase(), options: values, textContent: '', disabled: false,
      get value() { return value; },
      set value(next) { value = tag === 'select' && !values.includes(String(next)) ? '' : String(next); },
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
      dispatchEvent(event) {
        for (const callback of listeners.get(event.type) || []) callback({ type: event.type, target: this });
      }
    });
  }
  return { nodes, getElementById: id => nodes.get(id) || null };
}

function mount(page, t, restored = {}) {
  const document = formFor(page);
  for (const [id, value] of Object.entries(restored)) document.getElementById(id).value = value;
  t.mock.method(console, 'log', () => {});
  const previousDocument = globalThis.document;
  globalThis.document = document;
  t.after(() => { globalThis.document = previousDocument; });
  const engine = new SelectionEngine({ data: new Uint8ClampedArray(1024 * 1024 * 4) }, 1024, 1024);
  const ui = Object.assign(Object.create(EnhancedSelectionUI.prototype), {
    currentSelectionMethod: 'random', selectionSensitivity: 1,
    showMethodControls() {}, showNotification() {},
    selectionManager: { isInManualMode: () => false, generateAutomaticSelections: (method, config) => engine.generateSelections(method, config) }
  });
  ui.setupMethodSpecificControls();
  document.getElementById('selection-method').addEventListener('change', event => ui.handleSelectionMethodChange(event.target.value));
  const app = { activeClumps: [{}] };
  for (const [id, property] of [['min-lifetime', 'minLifetime'], ['max-lifetime', 'maxLifetime']]) {
    document.getElementById(id).addEventListener('input', event => { app[property] = Number(event.target.value); });
  }
  vm.runInNewContext(`${wiring}\nwireAnimationControls();`, { app, document, Event });
  const change = (id, value) => {
    const node = document.getElementById(id);
    node.value = value;
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input'));
  };
  return { document, engine, ui, app, change };
}

for (const page of ['index.html', 'v2.html']) {
  test(`${page}: visible sizes reach the engine and produce distinct, Classic-compatible regions`, t => {
    const { ui, change, app } = mount(page, t);
    t.mock.method(Math, 'random', () => 0.999999);
    change('v2-concurrent', '10');
    for (const [size, expected] of [['small', 85], ['medium', 170], ['large', 341], ['extraLarge', 512]]) {
      app.activeClumps = [{}];
      change('v2-intensity', size);
      const regions = ui.generateSelections();
      assert.equal(regions.length, 10);
      assert.equal(regions[0].w, expected);
      assert.equal(regions[0].h, expected);
      assert.equal(app.activeClumps.length, 0, 'new settings replace existing selections');
    }
  });

  test(`${page}: every method reaches its algorithm; returning to Random preserves the count`, t => {
    const { document, engine, ui, change } = mount(page, t);
    const algorithms = { colorRange: 'selectByColorRange', brightness: 'selectByBrightness', edgeDetection: 'selectByEdges', contentAware: 'selectContentAware' };
    for (const [method, algorithm] of Object.entries(algorithms)) {
      t.mock.method(engine, algorithm, () => [{ x: 1, y: 2, w: 3, h: 4, algorithm }]);
      change('v2-sel-method', method);
      assert.equal(ui.currentSelectionMethod, method);
      assert.equal(ui.generateSelections()[0].algorithm, algorithm);
      assert.equal(document.getElementById('v2-intensity').disabled, true);
      assert.equal(document.getElementById('v2-concurrent').disabled, true);
    }
    change('v2-sel-method', 'random');
    change('v2-concurrent', '10');
    assert.equal(ui.generateSelections().length, 10);
    assert.equal(document.getElementById('v2-intensity').disabled, false);
    assert.equal(document.getElementById('v2-concurrent').disabled, false);
  });

  test(`${page}: restored values and crossed lifetime limits stay synchronized`, t => {
    const { document, ui, app, change } = mount(page, t, {
      'v2-intensity': 'large', 'v2-concurrent': '10', 'v2-minlife': '200', 'v2-maxlife': '100'
    });
    assert.equal(ui.getMethodSpecificConfig().intensity, 'large');
    assert.equal(ui.generateSelections().length, 10);
    assert.equal(app.minLifetime, 200);
    assert.equal(app.maxLifetime, 200);
    change('v2-maxlife', '50');
    assert.equal(app.minLifetime, 50);
    assert.equal(app.maxLifetime, 50);
    assert.equal(document.getElementById('v2-minlife-val').textContent, '50');
    change('v2-minlife', '250');
    assert.equal(app.minLifetime, 250);
    assert.equal(app.maxLifetime, 250);
    assert.equal(document.getElementById('v2-maxlife-val').textContent, '250');
  });
}

test('random selections remain inside tiny and narrow images for all sizes', t => {
  const engine = new SelectionEngine(null, 1, 1);
  for (const random of [0, 0.5, 0.999999]) {
    t.mock.method(Math, 'random', () => random);
    for (const [width, height] of [[1, 1], [3, 100], [100, 2], [9, 9]]) {
      for (const size of ['small', 'medium', 'large', 'extraLarge']) {
        const { x, y, w, h } = engine.pickRandomClump(size, width, height);
        assert.ok(x >= 0 && y >= 0 && w >= 1 && h >= 1 && x + w <= width && y + h <= height);
      }
    }
  }
});

test('method controls work on pages that omit their readouts', t => {
  // Studio renders the controls but not Classic's readout elements.
  const controls = ['intensity-select', 'concurrent-selections', 'organic-intensity-select',
    'target-hue', 'color-tolerance', 'min-region-size', 'edge-threshold', 'shape-randomness', 'shape-count'];
  const nodes = new Map(controls.map(id => {
    const listeners = new Map();
    return [id, {
      value: id === 'shape-randomness' ? '0.4' : id.endsWith('select') ? 'large' : '7',
      addEventListener(type, callback) { listeners.set(type, callback); },
      fire() { for (const [type, callback] of listeners) callback({ type, target: this }); }
    }];
  }));
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById: id => nodes.get(id) || null };
  t.after(() => { globalThis.document = previousDocument; });

  let colorPreviews = 0;
  const ui = Object.assign(Object.create(EnhancedSelectionUI.prototype), {
    updateColorPreview() { colorPreviews++; }
  });
  ui.setupMethodSpecificControls();
  for (const node of nodes.values()) assert.doesNotThrow(() => node.fire());
  assert.equal(colorPreviews, 2, 'color controls still refresh the preview');
});
