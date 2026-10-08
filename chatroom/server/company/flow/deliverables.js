/**
 * What a room is making, and how a machine can tell it is done.
 * ──────────────────────────────────────────────────────────────
 * A department's brief ends in a file, and the pilot found what "done" has to be made of: the server's check on the file (a model cannot count to twelve),
 * a picture looked at after the last save (the lead dropped that rule on day one), the person whose job is to object having spoken after the last save
 * (the dissenter went quiet when it mattered), and the work offered for a person to decide (the lead closed in the same message that asked for the
 * proposal). Each is a "done when" check, written here once per kind of deliverable so a brief never has to remember them.
 *
 *   engine     an image-prompt engine for the Synthograsizer: a sentence with {{placeholders}} and n variables of m weighted values
 *   document   a written piece in Markdown
 *
 * The kinds are data: add one by adding an entry. `doneWhen` returns criteria in the shape the room takes (services/doneWhen.js).
 */

const clampInt = (v, lo, hi, dflt) => (Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : dflt);

/** The schema the server checks an engine against: shape, counts, and the things a model gets wrong when it counts by eye. */
export function engineSchema({ variables = 6, values = 12 } = {}) {
  return {
    type: 'object',
    required: ['name', 'emoji', 'promptTemplate', 'variables'],
    properties: {
      name: { type: 'string', minLength: 3, maxLength: 40 },
      emoji: { type: 'string', minLength: 1, maxLength: 8 },
      promptTemplate: { type: 'string', minLength: 40, maxLength: 600, pattern: '\\{\\{[a-z][a-z0-9_]*\\}\\}' },
      variables: {
        type: 'array', minItems: variables, maxItems: variables,
        items: {
          type: 'object', required: ['name', 'feature_name', 'values'],
          properties: {
            name: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
            feature_name: { type: 'string', minLength: 2, maxLength: 30 },
            values: {
              type: 'array', minItems: values, maxItems: values, uniqueItems: true,
              items: {
                type: 'object', required: ['text', 'weight'],
                properties: { text: { type: 'string', pattern: '^(?!.*[{}])\\S+(?:\\s+\\S+){1,9}$' }, weight: { type: 'integer', enum: [1, 2, 3] } },
              },
            },
          },
        },
      },
    },
  };
}

export const DELIVERABLES = Object.freeze({
  engine: {
    id: 'engine',
    label: 'an image-prompt engine for the Synthograsizer',
    defaultFile: 'engine.json',
    extensions: ['json'],
    defaults: { variables: 6, values: 12 },
    /** Whether this kind needs someone who can save files and draw (a tier that holds write_artifact and render_artifact). */
    needsBuilder: true,
    explain: ({ variables, values, file }) =>
      `WHAT AN ENGINE IS. A template sentence with {{placeholders}}, plus exactly ${variables} variables of exactly ${values} weighted values (weights 3, 2 or 1). A player randomizes, the sentence fills in, an image model draws it. A good engine is a small invented world: every random draw is a coherent, striking, different picture, and no draw contradicts itself. ` +
      `The file ${file} is one JSON object: {"name": "...", "emoji": "one emoji", "promptTemplate": "one sentence with {{variable}} placeholders", "variables": [{"name": "snake_case", "feature_name": "Short Label", "values": [{"text": "...", "weight": 3}, ...${values} values]}, ...${variables} variables]}. The server checks it each time the file is saved.`,
    criteria: ({ file, variables, values }) => [{
      type: 'json', in: `artifact:${file}`, schema: engineSchema({ variables, values }),
      label: `${file} is an engine: exactly ${variables} variables with exactly ${values} weighted values each, a {{placeholder}} sentence, no placeholder inside a value`,
    }],
    /** Looking at the work is part of making it: a picture drawn from the latest version. */
    looks: true,
  },
  document: {
    id: 'document',
    label: 'a written piece',
    defaultFile: 'document.md',
    extensions: ['md'],
    defaults: { minChars: 600 },
    needsBuilder: true,
    explain: ({ file, minChars }) => `WHAT THE PIECE IS. One Markdown file, ${file}, of at least ${minChars} characters, that someone who has not been in this room can read and understand. Plain, specific, finished: a title, sections with headings, no placeholders, no notes to each other left in the text.`,
    criteria: ({ file, minChars }) => [{ type: 'artifact', name: file, minChars, label: `${file} exists and is at least ${minChars} characters` }],
    looks: false,
  },
});

export const DELIVERABLE_KINDS = Object.freeze(Object.keys(DELIVERABLES));

/** The kind's parameters, held to sane bounds. */
export function resolveDeliverable({ kind = 'engine', file, variables, values, minChars } = {}) {
  const d = DELIVERABLES[kind];
  if (!d) throw new Error(`deliverable kind must be one of ${DELIVERABLE_KINDS.join(', ')}`);
  const params = kind === 'engine'
    ? { variables: clampInt(variables, 2, 10, d.defaults.variables), values: clampInt(values, 4, 20, d.defaults.values) }
    : { minChars: clampInt(minChars, 100, 20000, d.defaults.minChars) };
  // a file name that fits the kind (an engine is JSON, a piece is Markdown): anything else gets the kind's own
  const ok = typeof file === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}\.[A-Za-z0-9]{1,8}$/.test(file) && d.extensions.includes(file.split('.').pop().toLowerCase());
  const f = ok ? file : d.defaultFile;
  return { kind, file: f, ...params };
}

/**
 * The "done when" checks for a department: the kind's own, then the three the pilot showed a room skips if it is not made to.
 * @param {{ kind: string, file: string }} deliverable  from resolveDeliverable
 * @param {{ reviewers: string[], builders?: number }} team  names of the people whose job is to object
 */
export function doneWhenFor(deliverable, { reviewers = [] } = {}) {
  const d = DELIVERABLES[deliverable.kind];
  const list = [...d.criteria(deliverable)];
  if (d.looks) list.push({ type: 'tool_used', tool: 'render_artifact', artifact: deliverable.file, after: `artifact:${deliverable.file}`, label: `${deliverable.file} has been rendered, and the pictures looked at, since it was last saved` });
  for (const name of reviewers) list.push({ type: 'said_after', agent: name, after: `artifact:${deliverable.file}`, label: `${name} has reviewed ${deliverable.file} since it was last saved` });
  list.push({ type: 'proposal', artifact: deliverable.file, label: `the latest ${deliverable.file} has been offered for publication (a person decides)` });
  return list;
}

/** The review hand-offs for the same reviewers: after every save they speak next. */
export function handoffsFor(deliverable, { reviewers = [] } = {}) {
  return reviewers.map(next => ({ next, artifact: deliverable.file }));
}
