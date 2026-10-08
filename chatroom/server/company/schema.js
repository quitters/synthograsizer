/**
 * Machine-readable shapes for the company API, and the validator that holds requests to them.
 * ───────────────────────────────────────────────────────────────────────────────────────────
 * Every control is for a person first and is also an API call, so an agent can build or change a company with the same actions.
 * The schemas below are real JSON Schema (draft 2020-12) and are served at GET /api/company/schema. They are BUILT from the
 * constants the rules use (the dials, the ceilings, the tool names), and the same schema is what validates a request, so the
 * description an agent reads cannot drift from what the server accepts.
 *
 * The validator covers the part of JSON Schema these shapes use: type, enum, bounds, pattern, required, properties,
 * additionalProperties and items.
 */
import { MANDATE_DIALS } from './mandate.js';
import { CEILING_FIELDS } from './ceilings.js';
import { KNOWN_TOOLS } from './toolGrants.js';
import { MISSION_MAX_CHARS } from './mission.js';
import { HOUSE_RULES_MAX_CHARS } from './houseRules.js';
import { COLLABORATION_FEATURES } from './collaboration.js';
import { HALL_SCHEMAS } from './hallSchemas.js';
import { buildFlowSchemas } from './flowSchemas.js';

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const isType = (v, t) => (t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t);

/**
 * @param {object} schema
 * @param {unknown} value
 * @param {string} [path]
 * @returns {string[]} what is wrong, in words; empty when the value fits
 */
export function validate(schema, value, path = '$') {
  const errors = [];
  const types = schema.type ? [].concat(schema.type) : null;
  if (types && !types.some(t => isType(value, t))) return [`${path} must be ${types.join(' or ')}`];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must be one of ${schema.enum.join(', ')}`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} must be at most ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path} is not in the expected form`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} needs at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} can have at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, i) => errors.push(...validate(schema.items, item, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const props = schema.properties || {};
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}.${key} is required`);
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) errors.push(...validate(props[key], v, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key} is not a field this accepts`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') errors.push(...validate(schema.additionalProperties, v, `${path}.${key}`));
    }
  }
  return errors;
}

// ── the shapes ────────────────────────────────────────────────────────────────

const mandate = {
  type: 'object',
  description: 'How strict each stage is. A request can tighten a dial and never loosen it past the operator\'s default (the answer lists what was clamped). Levels run from most permissive to strictest.',
  additionalProperties: false,
  properties: {
    drafting: {
      type: 'object', additionalProperties: false,
      properties: { themes: { type: 'string', enum: MANDATE_DIALS['drafting.themes'].levels, description: MANDATE_DIALS['drafting.themes'].title } },
    },
    publishing: {
      type: 'object', additionalProperties: false,
      properties: { audience: { type: 'string', enum: MANDATE_DIALS['publishing.audience'].levels, description: MANDATE_DIALS['publishing.audience'].title } },
    },
  },
};

const ceilings = {
  type: 'object',
  description: 'Caps. A request can lower a ceiling and never raise it past the operator\'s.',
  additionalProperties: false,
  properties: Object.fromEntries(Object.entries(CEILING_FIELDS).map(([name, f]) => [
    name, { type: f.integer ? 'integer' : 'number', minimum: f.min, maximum: f.max, description: f.title },
  ])),
};

const tools = {
  type: 'array', uniqueItems: true,
  description: 'Tools the company\'s agents may be given. Starts at the research tools (google_search, url_context). Widen only when a role needs it, up to what the operator allows.',
  items: { type: 'string', enum: KNOWN_TOOLS },
};

const collaboration = {
  type: 'object',
  description: 'Which parts of the Hall are open to the company\'s people: mail (a mailbox each), forums (lasting group channels), workspace (shared files), board (tasks and task-team requests) and norms (working agreements they can propose and you decide). New companies start with all of them open; the operator can close the Hall altogether. A switch only ever narrows what people can do.',
  additionalProperties: false,
  properties: Object.fromEntries(COLLABORATION_FEATURES.map(f => [f, { type: 'boolean' }])),
};

const name = { type: 'string', minLength: 1, maxLength: 80 };

const companyCreate = {
  type: 'object', additionalProperties: false, required: ['name'],
  properties: {
    name,
    mission: { type: 'string', minLength: 1, maxLength: MISSION_MAX_CHARS, description: 'Defaults to a humanist mission (GET /api/company/mission). Editable; it can never add an exception to a hard limit.' },
    houseRules: { type: 'string', maxLength: HOUSE_RULES_MAX_CHARS, description: 'How the people in this company carry themselves at work (GET /api/company/house-rules for the default, which new companies start with). It goes into the fixed layer of every agent, outranks a character sheet and can never add an exception to a hard limit. An empty string means none.' },
    mandate, ceilings, tools, collaboration,
    departments: { type: 'array', maxItems: 40, items: name, description: 'Department names. Each gets its own isolated room when you create it.' },
  },
};

const companyPatch = {
  type: 'object', additionalProperties: false,
  properties: { name, mission: companyCreate.properties.mission, houseRules: companyCreate.properties.houseRules, mandate, ceilings, tools, collaboration },
};

const roomCreate = {
  type: 'object', additionalProperties: false, required: ['department'],
  properties: { department: name },
};

const proposal = {
  type: 'object', additionalProperties: false, required: ['kind', 'title'],
  description: 'A piece of work offered for publication. A person reviews it; nothing is published until they approve.',
  properties: {
    kind: { type: 'string', enum: ['text', 'artifact', 'image'] },
    title: { type: 'string', minLength: 1, maxLength: 140 },
    ref: { type: 'string', minLength: 1, maxLength: 200, description: 'The artifact file name, or the image id, in the room.' },
    text: { type: 'string', maxLength: 100_000, description: 'The text itself, for kind "text".' },
    note: { type: 'string', maxLength: 2000, description: 'What the reviewer should know.' },
    roomId: { type: 'string', pattern: '^[a-f0-9]{32}$', description: 'Which department room the work is in. Optional when the request is made inside a room.' },
  },
};

const finding = {
  type: 'object', required: ['rule', 'severity', 'why'],
  properties: {
    rule: { type: 'string' }, severity: { type: 'string', enum: ['block', 'note'] }, why: { type: 'string' },
  },
};

const screenResult = {
  type: 'object', required: ['verdict', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'block', 'unavailable'] },
    findings: { type: 'array', items: finding },
    stage: { type: 'string', enum: ['drafting', 'publishing'] },
  },
};

export const SCHEMAS = { ...HALL_SCHEMAS, ...buildFlowSchemas({ mandate, ceilings, tools, collaboration }), mandate, ceilings, tools, collaboration, companyCreate, companyPatch, roomCreate, proposal, screenResult };

/** The document GET /api/company/schema returns. */
export function schemaDocument() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Agent company controls',
    description: 'The shapes the /api/company endpoints accept. Fixed things (the hard limits, the publishing floor, human approval, the AI-generated label) are not fields and cannot be set.',
    $defs: SCHEMAS,
  };
}
