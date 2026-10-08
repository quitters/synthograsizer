import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema, lastJsonIn, evaluate, describeResult, parseCriteriaText, criteriaToText, normalizeCriteria } from './doneWhen.js';

// ── the JSON-Schema subset ───────────────────────────────────────────────────

test('a count is checked by the machine, in words an agent can act on', () => {
  const schema = { type: 'object', required: ['variables'], properties: { variables: { type: 'array', minItems: 6, maxItems: 6, items: { type: 'object', properties: { values: { type: 'array', minItems: 12, maxItems: 12 } } } } } };
  const six = (n) => ({ variables: Array.from({ length: 6 }, () => ({ values: Array.from({ length: n }, (_, i) => i) })) });
  assert.deepEqual(validateSchema(six(12), schema), []);
  // "models cannot count to twelve": eleven is caught, with the path
  assert.deepEqual(validateSchema(six(11), schema).slice(0, 2), ['$.variables[0].values: 11 items, needs exactly 12', '$.variables[1].values: 11 items, needs exactly 12']);
  assert.deepEqual(validateSchema({ variables: [] }, schema), ['$.variables: 0 items, needs exactly 6']);
  assert.deepEqual(validateSchema({}, schema), ['$: missing "variables"']);
  assert.deepEqual(validateSchema([], schema), ['$: expected object, found array']);
});

test('types, strings, numbers, enums, uniqueness and extra properties', () => {
  assert.deepEqual(validateSchema(3, { type: 'integer' }), []);
  assert.deepEqual(validateSchema(3.5, { type: 'integer' }), ['$: expected integer, found number']);
  assert.deepEqual(validateSchema(3.5, { type: 'number' }), []);
  assert.deepEqual(validateSchema('x', { type: ['string', 'null'] }), []);
  assert.deepEqual(validateSchema(null, { type: ['string', 'null'] }), []);
  assert.deepEqual(validateSchema('ab', { type: 'string', minLength: 3 }), ['$: 2 characters, needs at least 3']);
  assert.deepEqual(validateSchema('abcd', { type: 'string', maxLength: 3, pattern: '^a' }), ['$: 4 characters, at most 3 allowed']);
  assert.deepEqual(validateSchema('b', { pattern: '^a' }), ['$: does not match /^a/']);
  assert.deepEqual(validateSchema(11, { minimum: 1, maximum: 10 }), ['$: 11 is above 10']);
  assert.deepEqual(validateSchema('c', { enum: ['a', 'b'] }), ['$: must be one of "a", "b"']);
  assert.deepEqual(validateSchema([1, 2, 1], { uniqueItems: true }), ['$: duplicate item 1']);
  assert.deepEqual(validateSchema({ a: 1, b: 2 }, { properties: { a: {} }, additionalProperties: false }), ['$: unexpected "b"']);
  assert.deepEqual(validateSchema({ a: { b: { c: 'x' } } }, { properties: { a: { properties: { b: { properties: { c: { type: 'number' } } } } } } }), ['$.a.b.c: expected number, found string']);
});

test('errors stop at eight', () => {
  const errors = validateSchema(Array.from({ length: 30 }, () => 'x'), { items: { type: 'number' } });
  assert.equal(errors.length, 8);
});

// ── finding the last JSON ────────────────────────────────────────────────────

test('the last JSON an agent posted: a fenced block, else bare JSON, newest first', () => {
  const msgs = [
    { agentName: 'Ann', content: 'Draft:\n```json\n{"v": 1}\n```' },
    { agentName: 'Ben', content: 'No JSON here.' },
    { agentName: 'Cy', content: 'Revised: {"v": 2}' },
  ];
  assert.deepEqual(lastJsonIn(msgs), { value: { v: 2 }, from: 'Cy' });
  assert.deepEqual(lastJsonIn(msgs.slice(0, 2)), { value: { v: 1 }, from: 'Ann' });
  assert.equal(lastJsonIn([{ content: 'nothing' }]), null);
  assert.equal(lastJsonIn([{ content: '```json\n{not json}\n```' }]), null);
});

// ── evaluating ───────────────────────────────────────────────────────────────

const store = (files) => ({ get: (name) => (name in files ? { content: files[name] } : undefined) });
const ctx = (over = {}) => ({ messages: [], artifactStore: store({}), ...over });

test('artifact: present, empty, missing', async () => {
  const c = [{ type: 'artifact', name: 'a.json' }];
  assert.equal((await evaluate(c, ctx({ artifactStore: store({ 'a.json': '{}' }) }))).passed, true);
  const empty = await evaluate(c, ctx({ artifactStore: store({ 'a.json': '  ' }) }));
  assert.equal(empty.passed, false);
  assert.match(empty.results[0].detail, /is empty/);
  const missing = await evaluate(c, ctx());
  assert.match(missing.results[0].detail, /no artifact named "a.json" has been saved/);
});

test('regex: in the last message, any message, or an artifact', async () => {
  const messages = [{ content: 'we said FINAL ANSWER earlier' }, { content: 'now talking', isUser: false }, { content: 'a user note', isUser: true }];
  assert.equal((await evaluate([{ type: 'regex', pattern: 'FINAL ANSWER', in: 'any_message' }], ctx({ messages }))).passed, true);
  const last = await evaluate([{ type: 'regex', pattern: 'FINAL ANSWER' }], ctx({ messages }));
  assert.equal(last.passed, false, 'the last agent message does not have it, a user note after it does not count');
  assert.equal((await evaluate([{ type: 'regex', pattern: 'v\\d+', flags: 'i', in: 'artifact:notes.md' }], ctx({ artifactStore: store({ 'notes.md': 'release V2' }) }))).passed, true);
  const bad = await evaluate([{ type: 'regex', pattern: '(' }], ctx());
  assert.match(bad.results[0].detail, /bad pattern/);
});

test('json: an artifact, or the last JSON posted, against a schema', async () => {
  const schema = { type: 'object', required: ['name'] };
  assert.equal((await evaluate([{ type: 'json', in: 'artifact:t.json', schema }], ctx({ artifactStore: store({ 't.json': '{"name":"x"}' }) }))).passed, true);
  const wrong = await evaluate([{ type: 'json', in: 'artifact:t.json', schema }], ctx({ artifactStore: store({ 't.json': '{}' }) }));
  assert.match(wrong.results[0].detail, /JSON from t.json: \$: missing "name"/);
  const broken = await evaluate([{ type: 'json', in: 'artifact:t.json', schema }], ctx({ artifactStore: store({ 't.json': '{oops' }) }));
  assert.match(broken.results[0].detail, /is not valid JSON/);
  const last = await evaluate([{ type: 'json', schema }], ctx({ messages: [{ agentName: 'Ann', content: '{"name": "y"}' }] }));
  assert.equal(last.passed, true);
  assert.match((await evaluate([{ type: 'json', schema }], ctx())).results[0].detail, /no JSON has been posted yet/);
});

test('url: answers, does not answer, must contain, or a status that is itself the answer', async () => {
  const ok = async () => 'all good';
  assert.equal((await evaluate([{ type: 'url', url: 'http://x/health' }], ctx({ fetchText: ok }))).passed, true);
  assert.equal((await evaluate([{ type: 'url', url: 'http://x/health', contains: 'good' }], ctx({ fetchText: ok }))).passed, true);
  const missing = await evaluate([{ type: 'url', url: 'http://x/health', contains: 'ready' }], ctx({ fetchText: ok }));
  assert.match(missing.results[0].detail, /does not contain "ready"/);
  const down = await evaluate([{ type: 'url', url: 'http://x/health' }], ctx({ fetchText: async () => { throw new Error('connect ECONNREFUSED'); } }));
  assert.match(down.results[0].detail, /did not answer: connect ECONNREFUSED/);
  const gone = async () => { throw new Error('HTTP 404 from server'); };
  assert.equal((await evaluate([{ type: 'url', url: 'http://x/none', status: 404 }], ctx({ fetchText: gone }))).passed, true, 'a 404 is the wanted answer');
  assert.equal((await evaluate([{ type: 'url', url: 'http://x/none', status: 200 }], ctx({ fetchText: gone }))).passed, false);
});

test('a check that blows up counts as failed, and all checks are always run', async () => {
  const r = await evaluate([{ type: 'nonsense' }, { type: 'artifact', name: 'a' }, { type: 'regex', pattern: 'x' }], ctx({ artifactStore: { get() { throw new Error('store down'); } } }));
  assert.equal(r.passed, false);
  assert.equal(r.results.length, 3);
  assert.match(r.results[0].detail, /unknown check type/);
  assert.match(r.results[1].detail, /failed to run: store down/);
  assert.equal((await evaluate([], ctx())).passed, true, 'no checks, nothing to fail');
});

test('what the room is told lists every check, with the reason under each failure', async () => {
  const r = await evaluate([{ type: 'artifact', name: 'a.json', label: 'the engine is saved' }, { type: 'regex', pattern: 'DONE' }], ctx({ artifactStore: store({ 'a.json': '{}' }), messages: [{ content: 'not yet' }] }));
  const text = describeResult(r);
  assert.match(text, /^DONE-WHEN CHECK: the session cannot end yet\./);
  assert.match(text, /PASS {2}the engine is saved/);
  assert.match(text, /FAIL {2}the last message matches \/DONE\/\n {6}the last message does not match \/DONE\//);
  assert.match(describeResult({ passed: true, results: [] }), /every check passes/);
});

// ── the one-line-per-check form ──────────────────────────────────────────────

test('the text form reads each kind of check, skips comments, and reports bad lines by number', () => {
  const text = [
    '# the deliverable',
    'artifact: engine.json',
    'regex: /FINAL ANSWER/i in last_message',
    'regex: /v\\d+/ in artifact:notes.md',
    'json: engine.json {"type":"object","required":["promptTemplate"]}',
    'json: last {"type":"array"}',
    'url: http://localhost:8000/api/health 200',
    '',
  ].join('\n');
  const { criteria, errors } = parseCriteriaText(text);
  assert.deepEqual(errors, []);
  assert.deepEqual(criteria.map(c => c.type), ['artifact', 'regex', 'regex', 'json', 'json', 'url']);
  assert.equal(criteria[3].in, 'artifact:engine.json');
  assert.equal(criteria[4].in, 'last_json');
  assert.equal(criteria[5].status, 200);
  // and back again
  assert.deepEqual(parseCriteriaText(criteriaToText(criteria)).criteria, criteria);

  const bad = parseCriteriaText('hello\nartifact:\nregex: no slashes\nregex: /(/\njson: engine.json {bad}\njson: onlyname\nurl: ftp://x');
  assert.equal(bad.criteria.length, 0);
  assert.deepEqual(bad.errors.map(e => e.split(':')[0]), ['line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7']);
});

test('structured criteria from an API caller are cleaned: unknown fields dropped, bad ones reported, at most 20', () => {
  const { criteria, errors } = normalizeCriteria([
    { type: 'artifact', name: 'a.json', evil: 'x' },
    { type: 'regex', pattern: '(' },
    { type: 'url', url: 'javascript:alert(1)' },
    { type: 'json', schema: { type: 'object' } },
    { type: 'regex', pattern: 'ok', flags: 'ixq', label: 'says ok' },
    'nonsense',
  ]);
  assert.deepEqual(criteria, [
    { type: 'artifact', name: 'a.json' },
    { type: 'json', in: 'last_json', schema: { type: 'object' } },
    { type: 'regex', pattern: 'ok', flags: 'i', label: 'says ok' },
  ]);
  assert.equal(errors.length, 3);
  assert.equal(normalizeCriteria(Array.from({ length: 25 }, () => ({ type: 'artifact', name: 'a' }))).criteria.length, 20);
  assert.deepEqual(normalizeCriteria('nope').errors, ['criteria must be a list']);
});
