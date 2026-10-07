/**
 * "Done when": checks on the deliverable that a room must pass before it may end.
 * ─────────────────────────────────────────────────────────────────────────────
 * A lead agent cuts premature endings but is not a verifier: in one experiment the room's only failure was an agent that wrote "the
 * checks are complete, six variables, twelve values each" about a block with a wrong count, and the lead believed it. Models cannot
 * count to twelve. A check run by the server can. These are the checks:
 *
 *   { type: 'artifact', name: 'engine.json' }                          the artifact exists and is not empty
 *   { type: 'regex', pattern: 'FINAL', flags: 'i', in: 'last_message' }  in: last_message | any_message | artifact:<name>
 *   { type: 'json', in: 'artifact:engine.json' | 'last_json', schema }   the JSON validates against a small JSON-Schema subset
 *   { type: 'url', url: 'http://localhost:8000/api/health', status: 200, contains?: 'ok' }   a URL that answers
 *
 * Every criterion may carry a `label`. `evaluate` returns { passed, results }; each result says what was wrong in words the agents
 * can act on ("variables: 5 items, needs exactly 6"). parseCriteriaText reads the one-line-per-check form the settings screens use.
 * Nothing here talks to a model.
 */
import { safeFetchText } from 'workflow-engine';

const MAX_ERRORS = 8;

// ── a small JSON-Schema subset ────────────────────────────────────────────────

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const matchesType = (v, t) => (t === 'number' ? typeof v === 'number' : typeOf(v) === t);

/**
 * Validate `value` against `schema`. Supported keywords: type (string or list), required, properties, items, minItems, maxItems,
 * uniqueItems, minLength, maxLength, pattern, enum, const, minimum, maximum, additionalProperties: false.
 * @returns {string[]} what is wrong, as "path: message" (empty when valid), at most MAX_ERRORS
 */
export function validateSchema(value, schema, path = '$', errors = []) {
  if (errors.length >= MAX_ERRORS || !schema || typeof schema !== 'object') return errors;
  const fail = (message) => { if (errors.length < MAX_ERRORS) errors.push(`${path}: ${message}`); };

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => matchesType(value, t))) { fail(`expected ${types.join(' or ')}, found ${typeOf(value)}`); return errors; }
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) fail(`must be ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(value))) fail(`must be one of ${schema.enum.map(e => JSON.stringify(e)).join(', ')}`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(`${value.length} characters, needs at least ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(`${value.length} characters, at most ${schema.maxLength} allowed`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) fail(`does not match /${schema.pattern}/`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`${value} is below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`${value} is above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    const exact = schema.minItems !== undefined && schema.minItems === schema.maxItems;
    if (exact && value.length !== schema.minItems) fail(`${value.length} item${value.length === 1 ? '' : 's'}, needs exactly ${schema.minItems}`);
    else {
      if (schema.minItems !== undefined && value.length < schema.minItems) fail(`${value.length} item${value.length === 1 ? '' : 's'}, needs at least ${schema.minItems}`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`${value.length} items, at most ${schema.maxItems} allowed`);
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) { fail(`duplicate item ${key.slice(0, 40)}`); break; }
        seen.add(key);
      }
    }
    if (schema.items) value.forEach((item, i) => validateSchema(item, schema.items, `${path}[${i}]`, errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) fail(`missing "${key}"`);
    for (const [key, sub] of Object.entries(schema.properties || {})) if (key in value) validateSchema(value[key], sub, `${path}.${key}`, errors);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (schema.properties || {}))) fail(`unexpected "${key}"`);
    }
  }
  return errors;
}

// ── finding the thing to check ────────────────────────────────────────────────

/** The newest JSON value an agent posted: a fenced block, else a bare {...} or [...] that parses. */
export function lastJsonIn(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = String(messages[i].content || '');
    const fences = [...text.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi)].map(m => m[1]);
    for (const raw of fences.reverse()) {
      try { return { value: JSON.parse(raw), from: messages[i].agentName }; } catch { /* not JSON */ }
    }
    const start = text.search(/[{[]/);
    if (start >= 0) {
      try { return { value: JSON.parse(text.slice(start).trim()), from: messages[i].agentName }; } catch { /* not JSON */ }
    }
  }
  return null;
}

function artifactText(artifactStore, name) {
  const a = artifactStore?.get?.(name) || artifactStore?.artifacts?.get?.(name);
  return a ? String(a.content ?? '') : null;
}

// ── evaluating ────────────────────────────────────────────────────────────────

export function describeCriterion(c) {
  if (c.label) return c.label;
  switch (c.type) {
    case 'artifact': return `the artifact "${c.name}" exists`;
    case 'regex': return `${c.in && c.in !== 'last_message' ? c.in.replace('_', ' ') : 'the last message'} matches /${c.pattern}/${c.flags || ''}`;
    case 'json': return `${c.in === 'last_json' || !c.in ? 'the last JSON an agent posted' : c.in.replace('artifact:', 'the artifact ')} is valid: ${JSON.stringify(c.schema).slice(0, 120)}`;
    case 'url': return `${c.url} answers${c.status ? ` with ${c.status}` : ''}`;
    default: return JSON.stringify(c);
  }
}

async function evaluateOne(c, ctx) {
  switch (c.type) {
    case 'artifact': {
      const text = artifactText(ctx.artifactStore, c.name);
      if (text === null) return { passed: false, detail: `no artifact named "${c.name}" has been saved` };
      if (text.trim().length < (c.minChars ?? 1)) return { passed: false, detail: `"${c.name}" is empty` };
      return { passed: true, detail: `"${c.name}" exists (${text.length} characters)` };
    }
    case 'regex': {
      let re;
      try { re = new RegExp(c.pattern, c.flags || ''); } catch (e) { return { passed: false, detail: `bad pattern: ${e.message}` }; }
      const where = c.in || 'last_message';
      let haystacks;
      if (where.startsWith('artifact:')) {
        const text = artifactText(ctx.artifactStore, where.slice(9));
        if (text === null) return { passed: false, detail: `no artifact named "${where.slice(9)}" has been saved` };
        haystacks = [text];
      } else if (where === 'any_message') {
        haystacks = ctx.messages.map(m => String(m.content || ''));
      } else {
        const last = [...ctx.messages].reverse().find(m => !m.isUser);
        haystacks = [String(last?.content || '')];
      }
      const what = where.startsWith('artifact:') ? `"${where.slice(9)}" does not match` : where === 'any_message' ? 'no message matches' : 'the last message does not match';
      return haystacks.some(h => re.test(h)) ? { passed: true, detail: 'found' } : { passed: false, detail: `${what} /${c.pattern}/${c.flags || ''}` };
    }
    case 'json': {
      let value;
      let from;
      const where = c.in || 'last_json';
      if (where.startsWith('artifact:')) {
        const text = artifactText(ctx.artifactStore, where.slice(9));
        if (text === null) return { passed: false, detail: `no artifact named "${where.slice(9)}" has been saved` };
        try { value = JSON.parse(text); } catch (e) { return { passed: false, detail: `"${where.slice(9)}" is not valid JSON (${e.message.slice(0, 80)})` }; }
        from = where.slice(9);
      } else {
        const found = lastJsonIn(ctx.messages);
        if (!found) return { passed: false, detail: 'no JSON has been posted yet' };
        ({ value, from } = found);
      }
      const errors = validateSchema(value, c.schema || {});
      return errors.length ? { passed: false, detail: `JSON from ${from}: ${errors.join('; ')}` } : { passed: true, detail: `JSON from ${from} is valid` };
    }
    case 'url': {
      try {
        const text = await (ctx.fetchText || safeFetchText)(c.url, { timeoutMs: 8000, maxBytes: 256 * 1024 });
        if (c.contains && !String(text).includes(c.contains)) return { passed: false, detail: `${c.url} answered but does not contain "${c.contains}"` };
        return { passed: true, detail: `${c.url} answered` };
      } catch (e) {
        const wanted = c.status;
        const m = /HTTP (\d{3})/.exec(String(e.message));
        if (wanted && m && Number(m[1]) === Number(wanted)) return { passed: true, detail: `${c.url} answered ${wanted}` };
        return { passed: false, detail: `${c.url} did not answer: ${String(e.message).slice(0, 100)}` };
      }
    }
    default:
      return { passed: false, detail: `unknown check type "${c.type}"` };
  }
}

/**
 * Run every criterion. Never throws: a check that blows up counts as failed, with the reason.
 * @param {object[]} criteria
 * @param {{ messages: object[], artifactStore?: object, fetchText?: Function }} ctx
 * @returns {Promise<{ passed: boolean, results: {criterion: object, label: string, passed: boolean, detail: string}[] }>}
 */
export async function evaluate(criteria, ctx) {
  const results = [];
  for (const criterion of criteria || []) {
    let outcome;
    try { outcome = await evaluateOne(criterion, ctx); } catch (e) { outcome = { passed: false, detail: `check failed to run: ${e.message}` }; }
    results.push({ criterion, label: describeCriterion(criterion), ...outcome });
  }
  return { passed: results.every(r => r.passed), results };
}

/** The message a room is given when a check fails or flips: what is met, what is not, in order. */
export function describeResult({ passed, results }, { heading } = {}) {
  const lines = results.map(r => `${r.passed ? 'PASS' : 'FAIL'}  ${r.label}${r.passed ? '' : `\n      ${r.detail}`}`);
  const head = heading || (passed ? 'DONE-WHEN CHECK: every check passes.' : 'DONE-WHEN CHECK: the session cannot end yet.');
  return `${head}\n${lines.join('\n')}`;
}

// ── one line per check ────────────────────────────────────────────────────────

/**
 * Read the text form the settings screens use, one check per line (blank lines and # comments are skipped):
 *   artifact: engine.json
 *   regex: /FINAL ANSWER/i in last_message           (the "in ..." part is optional: last_message, any_message, artifact:<name>)
 *   json: engine.json {"type":"object","required":["promptTemplate"]}     (engine.json, or "last", then a schema)
 *   url: http://localhost:8000/api/health 200
 * @returns {{ criteria: object[], errors: string[] }}
 */
export function parseCriteriaText(text) {
  const criteria = [];
  const errors = [];
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const bad = (msg) => errors.push(`line ${i + 1}: ${msg}`);
    const m = /^(artifact|regex|json|url)\s*:\s*(.*)$/i.exec(line);
    if (!m) return bad('start with artifact:, regex:, json: or url:');
    const kind = m[1].toLowerCase();
    const rest = m[2].trim();
    if (kind === 'artifact') {
      if (!rest) return bad('artifact: needs a file name');
      criteria.push({ type: 'artifact', name: rest });
    } else if (kind === 'regex') {
      const r = /^\/(.+)\/([a-z]*)(?:\s+in\s+(last_message|any_message|artifact:\S+))?$/i.exec(rest);
      if (!r) return bad('regex: needs /pattern/flags, then optionally "in last_message", "in any_message" or "in artifact:<name>"');
      try { new RegExp(r[1], r[2]); } catch (e) { return bad(`bad pattern: ${e.message}`); }
      criteria.push({ type: 'regex', pattern: r[1], flags: r[2], ...(r[3] ? { in: r[3] } : {}) });
    } else if (kind === 'json') {
      const r = /^(\S+)\s+(\{[\s\S]*\})$/.exec(rest);
      if (!r) return bad('json: needs an artifact name (or "last") and a schema in { }');
      let schema;
      try { schema = JSON.parse(r[2]); } catch (e) { return bad(`the schema is not valid JSON (${e.message.slice(0, 60)})`); }
      criteria.push({ type: 'json', in: r[1] === 'last' ? 'last_json' : `artifact:${r[1]}`, schema });
    } else {
      const r = /^(https?:\/\/\S+)(?:\s+(\d{3}))?$/i.exec(rest);
      if (!r) return bad('url: needs an http(s) address and optionally a status such as 200');
      criteria.push({ type: 'url', url: r[1], ...(r[2] ? { status: Number(r[2]) } : {}) });
    }
  });
  return { criteria, errors };
}

/** Criteria back to the one-line form (what the settings screens show). */
export function criteriaToText(criteria) {
  return (criteria || []).map(c => {
    switch (c.type) {
      case 'artifact': return `artifact: ${c.name}`;
      case 'regex': return `regex: /${c.pattern}/${c.flags || ''}${c.in ? ` in ${c.in}` : ''}`;
      case 'json': return `json: ${c.in === 'last_json' || !c.in ? 'last' : c.in.replace('artifact:', '')} ${JSON.stringify(c.schema)}`;
      case 'url': return `url: ${c.url}${c.status ? ` ${c.status}` : ''}`;
      default: return `# ${JSON.stringify(c)}`;
    }
  }).join('\n');
}

/** Validate structured criteria from an API caller; returns { criteria, errors } with unknown fields dropped. */
export function normalizeCriteria(list) {
  const criteria = [];
  const errors = [];
  if (!Array.isArray(list)) return { criteria, errors: ['criteria must be a list'] };
  if (list.length > 20) errors.push('at most 20 checks');
  list.slice(0, 20).forEach((c, i) => {
    const bad = (m) => errors.push(`check ${i + 1}: ${m}`);
    if (!c || typeof c !== 'object') return bad('not an object');
    const label = typeof c.label === 'string' ? c.label.slice(0, 200) : undefined;
    const keep = (o) => criteria.push(label ? { ...o, label } : o);
    if (c.type === 'artifact' && typeof c.name === 'string' && c.name) keep({ type: 'artifact', name: c.name.slice(0, 200), ...(Number.isFinite(c.minChars) ? { minChars: c.minChars } : {}) });
    else if (c.type === 'regex' && typeof c.pattern === 'string' && c.pattern) {
      const flags = String(c.flags || '').replace(/[^dgimsuvy]/g, '');
      try { new RegExp(c.pattern, flags); } catch (e) { return bad(`bad pattern: ${e.message}`); }
      keep({ type: 'regex', pattern: c.pattern.slice(0, 500), flags, ...(c.in ? { in: String(c.in) } : {}) });
    } else if (c.type === 'json' && c.schema && typeof c.schema === 'object') keep({ type: 'json', in: String(c.in || 'last_json'), schema: c.schema });
    else if (c.type === 'url' && /^https?:\/\//i.test(c.url || '')) keep({ type: 'url', url: String(c.url).slice(0, 500), ...(c.status ? { status: Number(c.status) } : {}), ...(c.contains ? { contains: String(c.contains).slice(0, 200) } : {}) });
    else bad(`unrecognised or incomplete check (${JSON.stringify(c).slice(0, 60)})`);
  });
  return { criteria, errors };
}
