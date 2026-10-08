import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { evaluate, parseCriteriaText, criteriaToText, normalizeCriteria } from './doneWhen.js';
import { RoomLedger } from './roomLedger.js';

/**
 * The checks that look at what the server saw (tool_used, proposal, said_after) and not at what anyone said happened.
 * The pilot company's lead skipped "look at the pictures" on day one and "make the proposal" on day two; neither could be
 * written as a check before these.
 */

const store = (files) => ({ get: (name) => (name in files ? { content: files[name], versions: [{}] } : undefined) });
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/** A room in which Zayd saved engine.json (version 3) in the message at index 4, the fifth message. */
function roomWithSave() {
  const ledger = new RoomLedger();
  const messages = Array.from({ length: 5 }, (_, i) => ({ agentName: i === 4 ? 'Zayd Siddiqui' : 'Someone Else', content: `message number ${i} with enough words`, isUser: false }));
  ledger.record('save', { artifact: 'engine.json', version: 3, messageCount: 4, agentId: 'zayd' });
  return { ledger, messages };
}

test('tool_used: a render counts only if it came after the latest save, and a failed one does not count', async () => {
  const { ledger, messages } = roomWithSave();
  const check = [{ type: 'tool_used', tool: 'render_artifact', artifact: 'engine.json', after: 'artifact:engine.json' }];
  const ctx = { messages, artifactStore: store({ 'engine.json': '{}' }), ledger };

  let r = await evaluate(check, ctx);
  assert.equal(r.passed, false);
  assert.match(r.results[0].detail, /render_artifact has not succeeded on "engine\.json" since "engine\.json" was last saved \(version 3\)/);

  ledger.record('tool', { tool: 'render_artifact', ok: false, agent: 'Zayd', artifact: 'engine.json' });
  r = await evaluate(check, ctx);
  assert.equal(r.passed, false);
  assert.match(r.results[0].detail, /the last attempt failed/);

  ledger.record('tool', { tool: 'render_artifact', ok: true, agent: 'Zayd', artifact: 'engine.json' });
  r = await evaluate(check, ctx);
  assert.equal(r.passed, true);
  assert.match(r.results[0].detail, /ran after version 3/);

  // a new save makes the old render stale again: the check is about the LATEST version
  ledger.record('save', { artifact: 'engine.json', version: 4, messageCount: 5, agentId: 'zayd' });
  r = await evaluate(check, ctx);
  assert.equal(r.passed, false);
  assert.match(r.results[0].detail, /\(version 4\)/);
});

test('tool_used: another file, another tool and a count are each their own condition', async () => {
  const { ledger, messages } = roomWithSave();
  ledger.record('tool', { tool: 'render_artifact', ok: true, agent: 'Zayd', artifact: 'other.json' });
  ledger.record('tool', { tool: 'generate_image', ok: true, agent: 'Hyun-woo' });
  const ctx = { messages, artifactStore: store({ 'engine.json': '{}' }), ledger };
  assert.equal((await evaluate([{ type: 'tool_used', tool: 'render_artifact', artifact: 'engine.json', after: 'artifact:engine.json' }], ctx)).passed, false, 'a render of a different file does not count');
  assert.equal((await evaluate([{ type: 'tool_used', tool: 'render_artifact', artifact: 'other.json' }], ctx)).passed, true);
  assert.equal((await evaluate([{ type: 'tool_used', tool: 'generate_image' }], ctx)).passed, true);
  const twice = await evaluate([{ type: 'tool_used', tool: 'generate_image', times: 2 }], ctx);
  assert.equal(twice.passed, false);
  assert.match(twice.results[0].detail, /\(1 of 2\)/);
  // without a ledger the check cannot be met, and says why; a file never saved cannot have been rendered after its save
  assert.match((await evaluate([{ type: 'tool_used', tool: 'x_y' }], { messages: [], artifactStore: store({}) })).results[0].detail, /keeps no record/);
  assert.match((await evaluate([{ type: 'tool_used', tool: 'render_artifact', after: 'artifact:gone.json' }], ctx)).results[0].detail, /no artifact named "gone\.json"/);
});

test('tool_used: a file that is in the store but was never announced counts as saved before everything', async () => {
  const ledger = new RoomLedger();
  ledger.record('tool', { tool: 'render_artifact', ok: true, agent: 'Zayd', artifact: 'engine.json' });
  const r = await evaluate([{ type: 'tool_used', tool: 'render_artifact', after: 'artifact:engine.json' }], { messages: [], artifactStore: store({ 'engine.json': '{}' }), ledger });
  assert.equal(r.passed, true);
});

test('proposal: the latest version must be in the queue; an earlier one, a blocked one and a rejected one are not enough', async () => {
  const content = '{"v":2}';
  const artifactStore = store({ 'engine.json': content });
  const earlier = { id: 'aaaa1111bbbb2222', kind: 'artifact', filename: 'engine.json', sha256: sha('{"v":1}'), status: 'pending' };
  const latest = (status) => ({ id: 'cccc3333dddd4444', kind: 'artifact', filename: 'engine.json', sha256: sha(content), status });
  const check = [{ type: 'proposal', artifact: 'engine.json' }];
  const run = (proposals) => evaluate(check, { messages: [], artifactStore, proposals });

  let r = await run([earlier]);
  assert.equal(r.passed, false);
  assert.match(r.results[0].detail, /1 earlier version of "engine\.json" was offered, not the latest/);

  r = await run([]);
  assert.match(r.results[0].detail, /has not been offered for publication yet/);

  for (const status of ['blocked', 'rejected', 'superseded']) {
    r = await run([earlier, latest(status)]);
    assert.equal(r.passed, false, status);
    assert.match(r.results[0].detail, new RegExp(`is ${status}`));
  }
  for (const status of ['pending', 'unavailable', 'approved']) {
    assert.equal((await run([earlier, latest(status)])).passed, true, status);
  }
  // the queue can be a function, even an async one; a room with none cannot meet the check
  assert.equal((await run(async () => [latest('pending')])).passed, true);
  assert.match((await run(null)).results[0].detail, /no publish queue/);
  assert.match((await evaluate([{ type: 'proposal', artifact: 'gone.json' }], { messages: [], artifactStore, proposals: [] })).results[0].detail, /no artifact named "gone\.json"/);
});

test('said_after: the named agent must speak after the message that carried the save (the saver\'s own message does not count)', async () => {
  const { ledger, messages } = roomWithSave();
  const check = [{ type: 'said_after', agent: 'Kasia', after: 'artifact:engine.json' }];
  const ctx = (msgs) => ({ messages: msgs, artifactStore: store({ 'engine.json': '{}' }), ledger });
  const kasia = (content, extra = {}) => ({ agentName: 'Kasia Wójcik-Lindqvist', content, isUser: false, ...extra });

  let r = await evaluate(check, ctx(messages));
  assert.equal(r.passed, false);
  assert.match(r.results[0].detail, /Kasia has not spoken since "engine\.json" was last saved \(version 3\)/);

  // she spoke BEFORE the save: still not enough
  assert.equal((await evaluate(check, ctx([kasia('an objection from earlier in the session'), ...messages]))).passed, false);

  // a note or a user message under her name, or a one-word reply, is not a review
  const noise = [...messages, kasia('a note posted under her name for the room', { isUser: true }), kasia('a second note for the room, flagged', { isNote: true }), kasia('ok')];
  assert.equal((await evaluate(check, ctx(noise))).passed, false);

  const after = [...messages, kasia('Value six prints lettering; fix that before this closes.')];
  r = await evaluate(check, ctx(after));
  assert.equal(r.passed, true);
  assert.match(r.results[0].detail, /Kasia spoke after version 3/);

  // the full name works too, and someone else does not
  assert.equal((await evaluate([{ type: 'said_after', agent: 'Kasia Wójcik-Lindqvist', after: 'artifact:engine.json' }], ctx(after))).passed, true);
  assert.equal((await evaluate([{ type: 'said_after', agent: 'Zayd', after: 'artifact:engine.json' }], ctx(after))).passed, false);
});

test('the three new checks: text form, round trip, structured form', () => {
  const text = [
    'tool: render_artifact on engine.json after engine.json x2',
    'tool: generate_image',
    'proposal: engine.json',
    'said: Kasia Wójcik-Lindqvist after engine.json',
  ].join('\n');
  const { criteria, errors } = parseCriteriaText(text);
  assert.deepEqual(errors, []);
  assert.deepEqual(criteria, [
    { type: 'tool_used', tool: 'render_artifact', artifact: 'engine.json', after: 'artifact:engine.json', times: 2 },
    { type: 'tool_used', tool: 'generate_image' },
    { type: 'proposal', artifact: 'engine.json' },
    { type: 'said_after', agent: 'Kasia Wójcik-Lindqvist', after: 'artifact:engine.json' },
  ]);
  assert.deepEqual(parseCriteriaText(criteriaToText(criteria)).criteria, criteria);
  assert.deepEqual(normalizeCriteria(criteria), { criteria, errors: [] });

  const bad = parseCriteriaText('tool: 12\nproposal: two words\nsaid: nobody');
  assert.equal(bad.criteria.length, 0);
  assert.equal(bad.errors.length, 3);
  const messy = normalizeCriteria([
    { type: 'tool_used', tool: 'Bad Name' },
    { type: 'tool_used', tool: 'render_artifact', after: 'engine.json' },
    { type: 'tool_used', tool: 'render_artifact', times: 99 },
    { type: 'proposal' },
    { type: 'said_after', agent: 'K', after: 'nope' },
    { type: 'said_after', agent: 'K', after: 'artifact:f', evil: 1 },
  ]);
  assert.deepEqual(messy.criteria, [{ type: 'said_after', agent: 'K', after: 'artifact:f' }]);
  assert.equal(messy.errors.length, 5);
});
