// A step's `retries`: how many times a failed step is tried again; Veo is not charged twice by default; continueOnError really soft-fails.
// The synth client is replaced by a recorder that fails on purpose. Run:  node --test workflow-engine/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.WORKFLOW_DATA_DIR = mkdtempSync(join(tmpdir(), 'workflow-engine-retries-'));
const { workflowEngine, retriesFor, DEFAULT_RETRIES } = await import('../workflowEngine.js');
const { synthClient } = await import('../synthClient.js');

workflowEngine.retryDelayMs = 5;                         // (three seconds in service)

function makeStore() {
  const items = new Map();
  return { add: m => items.set(m.id, m), get: id => items.get(id), items };
}

function run(def) {
  return new Promise((resolve, reject) => {
    const events = [];
    const timer = setTimeout(() => reject(new Error('workflow did not finish')), 5000);
    workflowEngine.submit(def, {
      mediaStore: makeStore(),
      broadcast: (event, data) => {
        events.push({ event, data });
        if (event === 'workflow_complete' || event === 'workflow_error') { clearTimeout(timer); resolve({ events, stepResults: data.stepResults || [] }); }
      },
    });
  });
}

/** Both generators fail `failures` times and then work. Returns the call counts. */
function flaky(failures) {
  const calls = { image: 0, video: 0 };
  synthClient.generateImage = async () => { calls.image += 1; if (calls.image <= failures) throw new Error('image blocked'); return { image: 'IMG-xxxxxxxxxx' }; };
  synthClient.generateVideo = async () => { calls.video += 1; if (calls.video <= failures) throw new Error('video blocked'); return { video: 'VID-vvvvvvvvvv' }; };
  return calls;
}

const image = (extra = {}) => ({ name: 't', steps: [{ id: 'a', type: 'synth_image', params: { prompt: 'an owl' }, ...extra }] });
const video = (extra = {}) => ({ name: 't', steps: [{ id: 'a', type: 'synth_video', params: { prompt: 'an owl flies' }, ...extra }] });
const status = (r) => r.stepResults.find(s => s.id === 'a').status;
const attempts = (r) => r.events.filter(e => e.event === 'workflow_step_complete' || e.event === 'workflow_step_error').at(-1).data.attempts;

test('the defaults: a failed image step is tried once more, a failed video step is not', () => {
  assert.equal(DEFAULT_RETRIES, 1);
  assert.equal(retriesFor({ type: 'synth_image' }), 1);
  assert.equal(retriesFor({ type: 'synth_video' }), 0);
});

test('an image step that fails once is tried again and works, and says it took two attempts', async () => {
  const calls = flaky(1);
  const r = await run(image());
  assert.equal(status(r), 'complete');
  assert.equal(calls.image, 2);
  assert.equal(attempts(r), 2);
});

test('retries: 0 tries once and fails: nothing is paid for twice', async () => {
  const calls = flaky(1);
  const r = await run(image({ retries: 0 }));
  assert.equal(status(r), 'failed');
  assert.equal(calls.image, 1);
  assert.equal(attempts(r), 1);
});

test('a Veo step is tried once by default, and asking for a retry gives it one and no more', async () => {
  let calls = flaky(1);
  assert.equal(status(await run(video())), 'failed');
  assert.equal(calls.video, 1, 'a blocked request is not charged twice');

  calls = flaky(1);
  assert.equal(status(await run(video({ retries: 1 }))), 'complete');
  assert.equal(calls.video, 2);

  calls = flaky(9);
  assert.equal(status(await run(video({ retries: 3 }))), 'failed');
  assert.equal(calls.video, 2, 'a video step cannot ask for more than one retry');
});

test('other steps can ask for up to three retries and no more', async () => {
  let calls = flaky(2);
  assert.equal(status(await run(image({ retries: 3 }))), 'complete');
  assert.equal(calls.image, 3);

  calls = flaky(99);
  assert.equal(status(await run(image({ retries: 50 }))), 'failed');
  assert.equal(calls.image, 4, 'one try and three retries');
});

test('junk in retries falls back to the default, and a number is rounded down', () => {
  assert.equal(retriesFor({ type: 'synth_image', retries: 'many' }), 1);
  assert.equal(retriesFor({ type: 'synth_image', retries: -4 }), 0);
  assert.equal(retriesFor({ type: 'synth_image', retries: 2.9 }), 2);
  assert.equal(retriesFor({ type: 'synth_image', retries: '2' }), 2);
  assert.equal(retriesFor({ type: 'synth_video', retries: 'many' }), 0);
  assert.equal(retriesFor({ type: 'synth_image', retries: null }), 1);
});

test('continueOnError: a step that still fails is skipped with a stub, and the run goes on', async () => {
  const calls = flaky(99);
  const def = { name: 't', steps: [
    { id: 'a', type: 'synth_image', params: { prompt: 'an owl' }, continueOnError: true },
    { id: 'b', type: 'synth_image', params: { prompt: 'second' }, dependsOn: ['a'] },
  ] };
  const r = await run(def);
  assert.equal(r.stepResults.find(s => s.id === 'a').status, 'skipped', 'it used to say failed: the flag was dropped');
  assert.ok(calls.image >= 2);
});
