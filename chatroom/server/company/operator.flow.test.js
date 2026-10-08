import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadOperator } from './operator.js';
import { tempDir } from './testKit.js';

/** The operator's say over the creation flow: whether it runs, how many people one company may have, and how much one flow may spend. */

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });
const dirWith = (content) => {
  const dir = tempDir();
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (content !== undefined) fs.writeFileSync(path.join(dir, 'operator-policy.json'), typeof content === 'string' ? content : JSON.stringify(content));
  return dir;
};

test('the defaults: on, thirty-two people, eight dollars', () => {
  const op = loadOperator({ env: {}, dataDir: dirWith() });
  assert.deepEqual({ ...op.flow }, { enabled: true, maxPeople: 32, maxSpendUsd: 8 });
  assert.deepEqual(op.snapshot().flow, { enabled: true, maxPeople: 32, maxSpendUsd: 8 });
});

test('the environment sets all three, and says where each came from', () => {
  const op = loadOperator({ env: { COMPANY_FLOW: '0', COMPANY_FLOW_MAX_PEOPLE: '12', COMPANY_FLOW_MAX_SPEND_USD: '2.5' }, dataDir: dirWith() });
  assert.deepEqual({ ...op.flow }, { enabled: false, maxPeople: 12, maxSpendUsd: 2.5 });
  for (const name of ['COMPANY_FLOW', 'COMPANY_FLOW_MAX_PEOPLE', 'COMPANY_FLOW_MAX_SPEND_USD']) assert.ok(op.sources.includes(`env ${name}`), name);
});

test('the file sets them too, and the environment wins over the file', () => {
  const dir = dirWith({ flow: { enabled: true, maxPeople: 20, maxSpendUsd: 4 } });
  assert.deepEqual({ ...loadOperator({ env: {}, dataDir: dir }).flow }, { enabled: true, maxPeople: 20, maxSpendUsd: 4 });
  assert.equal(loadOperator({ env: { COMPANY_FLOW_MAX_PEOPLE: '9' }, dataDir: dir }).flow.maxPeople, 9);
});

test('a bad value in the environment is ignored with a warning, and the rest still apply', () => {
  const op = loadOperator({ env: { COMPANY_FLOW_MAX_PEOPLE: '40.5', COMPANY_FLOW_MAX_SPEND_USD: '-3', COMPANY_FLOW: '0' }, dataDir: dirWith() });
  assert.equal(op.flow.maxPeople, 32);
  assert.equal(op.flow.maxSpendUsd, 8);
  assert.equal(op.flow.enabled, false);
  assert.equal(op.warnings.length, 2);
  assert.match(op.warnings[0], /COMPANY_FLOW_MAX_PEOPLE=40\.5 was ignored/);
  assert.match(op.warnings[1], /COMPANY_FLOW_MAX_SPEND_USD=-3 was ignored/);
});

test('numbers past the limits are ignored too: 201 people, 1001 dollars', () => {
  const op = loadOperator({ env: { COMPANY_FLOW_MAX_PEOPLE: '201', COMPANY_FLOW_MAX_SPEND_USD: '1001' }, dataDir: dirWith() });
  assert.equal(op.flow.maxPeople, 32);
  assert.equal(op.flow.maxSpendUsd, 8);
  assert.equal(op.warnings.length, 2);
});

test('a bad "flow" section in the file is ignored whole, with a warning that names what it takes', () => {
  for (const bad of [{ flow: { enabled: 'no' } }, { flow: { maxPeople: 0 } }, { flow: { maxPeople: 2.5 } }, { flow: { maxSpendUsd: '5' } }, { flow: { surprise: 1 } }]) {
    const op = loadOperator({ env: {}, dataDir: dirWith(bad) });
    assert.deepEqual({ ...op.flow }, { enabled: true, maxPeople: 32, maxSpendUsd: 8 }, JSON.stringify(bad));
    assert.match(op.warnings[0], /flow takes only "enabled"/, JSON.stringify(bad));
  }
});

test('the settings cannot be changed after the operator is loaded', () => {
  const op = loadOperator({ env: {}, dataDir: dirWith() });
  assert.throws(() => { 'use strict'; op.flow.maxPeople = 200; });
  assert.equal(op.flow.maxPeople, 32);
});
