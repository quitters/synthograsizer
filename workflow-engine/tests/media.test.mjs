// Reference images on synth_image, the synth_combine step, and the two templates built on them (look_locked_deck, storyboard_film).
// The synth client is replaced by a recorder, so these check what the engine sends and how results are threaded, not Gemini or Veo.
// Run:  node --test workflow-engine/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The engine checkpoints every step to <WORKFLOW_DATA_DIR>; keep the test runs out of the repo.
process.env.WORKFLOW_DATA_DIR = mkdtempSync(join(tmpdir(), 'workflow-engine-test-'));
const { workflowEngine, resolveImageReferences, LOOK_ONLY_CLAUSE } = await import('../workflowEngine.js');
const { synthClient } = await import('../synthClient.js');
const { buildWorkflow, getTemplate } = await import('../workflowTemplates.js');

function makeStore(seed = {}) {
  const items = new Map(Object.entries(seed).map(([id, data]) => [id, { id, data }]));
  return { add: m => items.set(m.id, m), get: id => items.get(id), items };
}

/** Run a workflow to the end; resolves with the events and the final status. */
function run(def, store) {
  return new Promise((resolve, reject) => {
    const events = [];
    const timer = setTimeout(() => reject(new Error('workflow did not finish')), 5000);
    workflowEngine.submit(def, {
      mediaStore: store,
      broadcast: (event, data) => {
        events.push({ event, data });
        if (event === 'workflow_complete' || event === 'workflow_error') { clearTimeout(timer); resolve({ events, status: data.status, stepResults: data.stepResults || [] }); }
      },
    });
  });
}

function recorder() {
  const calls = { image: [], video: [], combine: [] };
  let n = 0;
  synthClient.generateImage = async (prompt, opts) => { calls.image.push({ prompt, opts }); return { image: `IMG${++n}-${'x'.repeat(10)}` }; };
  synthClient.generateVideo = async (prompt, opts) => { calls.video.push({ prompt, opts }); return { video: `VID${++n}-${'v'.repeat(10)}` }; };
  synthClient.combineVideos = async (clips, opts) => { calls.combine.push({ clips, opts }); return { video: `FILM-${clips.length}` }; };
  return calls;
}

const stepOf = (result, id) => result.stepResults.find(s => s.id === id);
const errorOf = (result, id) => result.events.find(e => e.event === 'workflow_step_error' && e.data.stepId === id)?.data.error ?? '';

test('a style reference is sent in its slot, with the look-only clause', async () => {
  const calls = recorder();
  const store = makeStore({ ref1: 'REFDATA' });
  const result = await run({ name: 't', steps: [{ id: 'a', type: 'synth_image', params: { prompt: 'an owl card', references: { style: ['ref1'] } } }] }, store);
  assert.equal(result.status, 'complete');
  assert.deepEqual(calls.image[0].opts.references, { style: ['REFDATA'] });
  assert.ok(calls.image[0].prompt.startsWith('an owl card'));
  assert.ok(calls.image[0].prompt.endsWith(LOOK_ONLY_CLAUSE));
  assert.deepEqual(stepOf(result, 'a').references_used, { input_images: 0, style: 1 });
});

test('look_only: false leaves the prompt alone', async () => {
  const calls = recorder();
  const store = makeStore({ ref1: 'REFDATA' });
  await run({ name: 't', steps: [{ id: 'a', type: 'synth_image', params: { prompt: 'an owl card', look_only: false, references: { style: ['ref1'] } } }] }, store);
  assert.equal(calls.image[0].prompt, 'an owl card');
});

test('character and object slots carry no look-only clause; flat ids become input_images', async () => {
  const calls = recorder();
  const store = makeStore({ c1: 'C1', c2: 'C2', o1: 'O1', f1: 'F1', f2: 'F2' });
  await run({ name: 't', steps: [{ id: 'a', type: 'synth_image', params: { prompt: 'she walks', references: { character: ['c1', 'c2'], objects: 'o1' }, reference_image_ids: 'f1, f2' } }] }, store);
  const { prompt, opts } = calls.image[0];
  assert.equal(prompt, 'she walks');
  assert.deepEqual(opts.references, { objects: ['O1'], character: ['C1', 'C2'] });
  assert.deepEqual(opts.input_images, ['F1', 'F2']);
  assert.equal(opts.look_only, undefined, 'engine params must not leak into the request');
});

test('an id that is not in the store fails the step instead of being dropped', async () => {
  recorder();
  const result = await run({ name: 't', steps: [{ id: 'a', type: 'synth_image', params: { prompt: 'x', references: { character: ['missing'] } } }] }, makeStore());
  assert.equal(result.status, 'failed');
  assert.match(errorOf(result, 'a'), /character reference "missing" is not in the media store/);
});

test('too many references for a slot, and an unknown slot, are refused', () => {
  const store = makeStore({ a: 'A' });
  assert.throws(() => resolveImageReferences({ references: { character: ['a', 'a', 'a', 'a', 'a'] } }, store), /at most 4 character reference/);
  assert.throws(() => resolveImageReferences({ references: { styles: ['a'] } }, store), /unknown reference slot "styles"/);
  assert.deepEqual(resolveImageReferences({}, store), {});
  assert.deepEqual(resolveImageReferences({ references: { style: [] } }, store), {});
});

test('a long string is taken as base64 already', () => {
  const raw = 'A'.repeat(300);
  assert.deepEqual(resolveImageReferences({ reference_image_ids: [raw] }, makeStore()), { input_images: [raw] });
});

test('look_locked_deck: the first card is drawn alone and every other card is held to it', async () => {
  const calls = recorder();
  const def = buildWorkflow('look_locked_deck', { subjects: 'a fox || an owl || a heron', deck_look: 'gilded tarot border' });
  const result = await run(def, makeStore());
  assert.equal(result.status, 'complete');
  assert.equal(calls.image.length, 3);
  assert.equal(calls.image[0].opts.references, undefined);
  const firstImage = 'IMG1-xxxxxxxxxx';
  for (const call of calls.image.slice(1)) {
    assert.deepEqual(call.opts.references, { style: [firstImage] });
    assert.ok(call.prompt.endsWith(LOOK_ONLY_CLAUSE));
  }
  assert.match(calls.image[1].prompt, /^gilded tarot border\. an owl/);
});

test('look_locked_deck with a supplied reference draws every card with it', async () => {
  const calls = recorder();
  const def = buildWorkflow('look_locked_deck', { subjects: 'a fox, an owl', reference: 'ref9' });
  assert.deepEqual(def.steps.map(s => s.id), ['card1', 'card2']);
  await run(def, makeStore({ ref9: 'NINE' }));
  assert.deepEqual(calls.image.map(c => c.opts.references), [{ style: ['NINE'] }, { style: ['NINE'] }]);
});

test('storyboard_film: each frame is animated by its motion line, the clips are joined in order, the score goes under', async () => {
  const calls = recorder();
  const store = makeStore({ f1: 'FRAME1', f2: 'FRAME2', f3: 'FRAME3', score1: 'SCOREDATA' });
  const def = buildWorkflow('storyboard_film', {
    frames: 'f1,f2,f3', motions: 'slow push in, rain on glass || cut to her hands || pull back to the ferry',
    score: 'score1', score_volume: '0.5',
  });
  assert.equal(def.steps.length, 4);
  const result = await run(def, store);
  assert.equal(result.status, 'complete');
  assert.deepEqual(calls.video.map(c => c.prompt), ['slow push in, rain on glass', 'cut to her hands', 'pull back to the ferry']);
  assert.deepEqual(calls.video.map(c => c.opts.start_frame_image), ['FRAME1', 'FRAME2', 'FRAME3']);
  assert.equal(calls.combine.length, 1);
  assert.equal(calls.combine[0].clips.length, 3);
  assert.equal(calls.combine[0].opts.audio, 'SCOREDATA');
  assert.equal(calls.combine[0].opts.audio_volume, '0.5');
  const film = stepOf(result, 'film');
  assert.equal(film.clips, 3);
  assert.equal(film.scored, true);
  assert.ok(film.mediaId);
  // clips were joined in scene order: the video each clip step produced, in sequence
  const clipData = ['clip1', 'clip2', 'clip3'].map(id => store.items.get(stepOf(result, id).mediaId).data);
  assert.deepEqual(calls.combine[0].clips, clipData);
});

test('storyboard_film accepts scenes as a list of { frame, motion }, and one scene without a score skips the join', async () => {
  const calls = recorder();
  const def = buildWorkflow('storyboard_film', { scenes: [{ frame: 'f1', motion: 'a slow dolly' }] });
  const result = await run(def, makeStore({ f1: 'FRAME1' }));
  assert.equal(result.status, 'complete');
  assert.equal(calls.video.length, 1);
  assert.equal(calls.combine.length, 0, 'one clip and no score is already the film');
  assert.ok(stepOf(result, 'film').mediaId);
});

test('storyboard_film checks its inputs before anything is paid for', () => {
  assert.throws(() => buildWorkflow('storyboard_film', {}), /needs frames/);
  assert.throws(() => buildWorkflow('storyboard_film', { frames: 'a,b', motions: 'one' }), /2 frames but 1 motion line/);
  assert.throws(() => buildWorkflow('storyboard_film', { frames: 'a', motions: ' ' }), /1 frame but 0 motion lines/);
  assert.throws(() => buildWorkflow('storyboard_film', { frames: Array.from({ length: 13 }, (_, i) => `f${i}`).join(','), motions: Array(13).fill('m').join('||') }), /at most 12/);
  assert.throws(() => buildWorkflow('storyboard_film', { scenes: 'not json' }), /not valid JSON/);
});

test('synth_combine reports a clip that is not in the store', async () => {
  recorder();
  const result = await run({ name: 't', steps: [{ id: 'f', type: 'synth_combine', params: { video_ids: ['nope', 'nada'] } }] }, makeStore());
  assert.equal(result.status, 'failed');
  assert.match(errorOf(result, 'f'), /clip "nope" is not in the media store/);
});

test('both templates are registered and listed for agents', () => {
  for (const id of ['look_locked_deck', 'storyboard_film']) assert.ok(getTemplate(id), id);
});
