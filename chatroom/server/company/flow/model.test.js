import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel, Spend } from './model.js';
import { MODELS } from '../../config/models.js';

/** The flow's own model calls: priced like a room's, capped, retried, and a refusal is final. */

const reply = (obj, usage = { total_input_tokens: 1000, total_output_tokens: 500 }) => ({ output_text: JSON.stringify(obj), usage });
const clientOf = (create) => () => ({ interactions: { create } });
const noWait = async () => {};

test('a call sends the schema and the settings it was given, and the answer is the parsed JSON', async () => {
  const seen = [];
  const { askJson } = createModel({ getClient: clientOf(async (req) => { seen.push(req); return reply({ ok: true }); }), sleep: noWait });
  const out = await askJson({ step: 'seed', model: MODELS.SMART, system: 'sys', prompt: 'p', schema: { type: 'object' }, thinking: 'medium', maxOutput: 777 });
  assert.deepEqual(out, { ok: true });
  assert.equal(seen[0].model, MODELS.SMART);
  assert.equal(seen[0].input, 'p');
  assert.equal(seen[0].system_instruction, 'sys');
  assert.equal(seen[0].store, false);
  assert.deepEqual(seen[0].generation_config, { thinking_level: 'medium', max_output_tokens: 777 });
  assert.deepEqual(seen[0].response_format, { type: 'text', mime_type: 'application/json', schema: { type: 'object' } });
  const { askJson: bare } = createModel({ getClient: clientOf(async (req) => { seen.push(req); return reply({}); }), sleep: noWait });
  await bare({ step: 's', prompt: 'p', schema: {} });
  assert.equal(seen[1].model, MODELS.FAST, 'the fast model unless asked');
  assert.ok(!('system_instruction' in seen[1]));
});

test('what it costs is counted by step, at the same list prices the rooms use, rounded up', async () => {
  const spend = new Spend();
  const { askJson } = createModel({ getClient: clientOf(async () => reply({}, { total_input_tokens: 1_000_000, total_output_tokens: 100_000 })), spend, sleep: noWait });
  await askJson({ step: 'sheet', model: MODELS.SMART, prompt: 'p', schema: {} });
  await askJson({ step: 'sheet', model: MODELS.SMART, prompt: 'p', schema: {} });
  await askJson({ step: 'review', model: MODELS.FAST, prompt: 'p', schema: {} });
  const snap = spend.snapshot();
  assert.equal(snap.calls, 3);
  assert.equal(snap.byStep.sheet.calls, 2);
  assert.equal(snap.byStep.sheet.usd, 6.4, '(1M in at $2 + 100k out at $12) twice');
  assert.equal(snap.byStep.review.usd, 1.125, '(1M in at $0.75 + 100k out at $3.75)');
  assert.equal(snap.usd, 7.525);
  // thought tokens bill as output
  const s = new Spend();
  s.record('x', MODELS.FAST, { total_input_tokens: 0, total_output_tokens: 0, total_thought_tokens: 1_000_000 });
  assert.equal(s.usd, 3.75);
});

test('a failed call is tried again with a growing pause, three times at most, and the last reason is given', async () => {
  const waits = [];
  let n = 0;
  const { askJson } = createModel({ getClient: clientOf(async () => { n++; if (n < 3) throw new Error('503 overloaded'); return reply({ done: true }); }), sleep: async (ms) => { waits.push(ms); } });
  assert.deepEqual(await askJson({ step: 's', prompt: 'p', schema: {} }), { done: true });
  assert.deepEqual(waits, [1500, 3000]);

  const failing = createModel({ getClient: clientOf(async () => { throw new Error('upstream connection reset'); }), sleep: noWait });
  await assert.rejects(failing.askJson({ step: 'sheet', prompt: 'p', schema: {} }), (e) => e.code === 'model_failed' && e.status === 502 && /"sheet" step \(upstream connection reset\)/.test(e.message));
  // bad JSON is a failure too
  const bad = createModel({ getClient: clientOf(async () => ({ output_text: 'not json', usage: null })), sleep: noWait });
  await assert.rejects(bad.askJson({ step: 'x', prompt: 'p', schema: {}, attempts: 2 }), (e) => e.code === 'model_failed');
});

test('a refusal from the model service is final: not retried, not reworded', async () => {
  let n = 0;
  const { askJson } = createModel({ getClient: clientOf(async () => { n++; throw new Error('Response blocked by safety filters'); }), sleep: noWait });
  await assert.rejects(askJson({ step: 's', prompt: 'p', schema: {} }), (e) => e.code === 'model_refused' && e.status === 422 && /final/.test(e.message));
  assert.equal(n, 1);
  // a block hidden behind a generic message by the SDK is still read
  const hidden = createModel({ getClient: clientOf(async () => { const err = new Error('400 API error occurred'); err.status = 400; err.error = { message: 'The request was blocked: prohibited content' }; throw err; }), sleep: noWait });
  await assert.rejects(hidden.askJson({ step: 's', prompt: 'p', schema: {} }), (e) => e.code === 'model_refused');
});

test('once the flow has spent its allowance it makes no further call, and says so', async () => {
  const spend = new Spend();
  let n = 0;
  const { askJson } = createModel({ getClient: clientOf(async () => { n++; return reply({}, { total_input_tokens: 1_000_000, total_output_tokens: 0 }); }), spend, limitUsd: 1, sleep: noWait });
  await askJson({ step: 'a', model: MODELS.SMART, prompt: 'p', schema: {} });          // $2 spent, past the $1 allowance
  await assert.rejects(askJson({ step: 'b', prompt: 'p', schema: {} }), (e) => e.code === 'flow_spend_limit' && e.status === 402 && /\$1\.00/.test(e.message));
  assert.equal(n, 1);
});

test('without a model client the flow says what is missing', async () => {
  await assert.rejects(createModel({ getClient: () => null }).askJson({ step: 's', prompt: 'p', schema: {} }), (e) => e.code === 'no_model' && e.status === 503 && /GEMINI_API_KEY/.test(e.message));
});
