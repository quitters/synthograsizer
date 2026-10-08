/**
 * The creation flow's request shapes, as JSON Schema, for GET /api/company/schema and for validating requests.
 * ────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Built from the constants the flow itself uses (sizes, styles, archetypes, the facts a person can have fixed), so the description an agent reads cannot
 * drift from what the server accepts. What a value MEANS (a mission that is too long, an archetype for a title, two rooms with one name) is checked by the
 * flow with a message that says what to change; the schema holds the shape.
 *
 * Built from a function because the company-level pieces (mandate, ceilings, tools, collaboration) live in schema.js, which imports this file.
 */
import { SIZE_IDS, ORG_STYLES } from './flow/orgs.js';
import { ARCHETYPE_IDS } from './flow/archetypes.js';
import { LOCKABLE } from './flow/casting.js';
import { DELIVERABLE_KINDS } from './flow/deliverables.js';
import { MISSION_MAX_CHARS } from './mission.js';
import { HOUSE_RULES_MAX_CHARS } from './houseRules.js';

export function buildFlowSchemas({ mandate, ceilings, tools, collaboration }) {
  const text = (max, description) => ({ type: 'string', minLength: 1, maxLength: max, ...(description ? { description } : {}) });

  const deliverable = {
    type: 'object', additionalProperties: false,
    description: 'What a room makes. An engine is a Synthograsizer image-prompt template (a .json file); a document is a Markdown piece (a .md file).',
    properties: {
      kind: { type: 'string', enum: [...DELIVERABLE_KINDS] }, file: text(70, 'The file name; it must end .json for an engine and .md for a document, or the kind\'s own name is used.'),
      variables: { type: 'integer', minimum: 2, maximum: 10, description: 'Engine only: how many variables.' }, values: { type: 'integer', minimum: 4, maximum: 20, description: 'Engine only: how many values for each.' },
      minChars: { type: 'integer', minimum: 100, maximum: 20000, description: 'Document only: the shortest it may be.' },
    },
  };

  const position = {
    type: 'object', additionalProperties: false,
    description: 'One person\'s place in a room. Whatever you give is fixed: the model does not change it. With "key" it edits that position (or removes it with remove: true); without one it adds a position.',
    properties: {
      key: text(20, 'The position\'s key, from the proposal.'), remove: { type: 'boolean' },
      title: text(80, 'The job title. If it is not a known role, also give an archetype.'),
      archetype: { type: 'string', enum: [...ARCHETYPE_IDS], description: 'The casting template (GET /api/company/flow/options lists them).' },
      lead: { type: 'boolean', description: 'Exactly one position in a room leads it and closes its sessions.' },
      reviewer: { type: 'boolean', description: 'A reviewer\'s job is to object. A room of three or more has one.' },
      tier: { type: 'string', description: 'The tool tier this person starts at (none, research, builder, ...). A room that makes a file needs one builder.' },
      candidateId: { type: ['string', 'null'], pattern: '^[a-f0-9]{16}$', description: 'Someone already in the roster, chosen for this position. null takes the choice back.' },
      locked: { type: 'object', additionalProperties: false, description: 'Facts about the person you fix; the rest is drawn.', properties: Object.fromEntries(LOCKABLE.map(k => [k, {}])) },
    },
  };

  const room = {
    type: 'object', additionalProperties: false,
    description: 'A department and its room. With "key" it edits that room (or removes it with remove: true); without one it adds a room.',
    properties: {
      key: text(20, 'The room\'s key, from the proposal.'), remove: { type: 'boolean' },
      name: text(80), purpose: { type: 'string', maxLength: 300 }, assignment: { type: 'string', maxLength: 1500, description: 'What the room is asked to make first, and what makes it good. It becomes the opening of the room\'s brief.' },
      deliverable, positions: { type: 'array', maxItems: 8, items: position },
    },
  };

  const companyFields = {
    name: text(80), purpose: { type: 'string', minLength: 1, maxLength: 400 },
    mission: { type: 'string', minLength: 1, maxLength: MISSION_MAX_CHARS, description: 'Written for you from the purpose and the humanist default unless you give one.' },
    houseRules: { type: 'string', maxLength: HOUSE_RULES_MAX_CHARS },
    mandate, ceilings, tools, collaboration,
  };

  const flowPropose = {
    type: 'object', additionalProperties: false, required: ['prompt'],
    description: 'Level 0: say what the company is for, and a company is proposed. Everything you give in "locks" is fixed; everything you leave out is filled in. Nothing is created and nothing is spent but a cent or two.',
    properties: {
      prompt: text(2000, 'A sentence or two about what the company makes and for whom.'),
      size: { type: 'string', enum: [...SIZE_IDS], description: 'How big. Without it the model picks the smallest that can do the job.' },
      style: { type: 'string', enum: Object.keys(ORG_STYLES), description: 'How the rooms are organised.' },
      locks: {
        type: 'object', additionalProperties: false,
        description: 'Level 2: fix anything. Fixed values are never changed by the model.',
        properties: { ...companyFields, size: { type: 'string', enum: [...SIZE_IDS] }, style: { type: 'string', enum: Object.keys(ORG_STYLES) }, people: { type: 'integer', minimum: 1, maximum: 96, description: 'An exact headcount; it overrides the layout.' }, departments: { type: 'array', minItems: 1, maxItems: 12, items: room } },
      },
      budgetUsd: { type: 'number', minimum: 0, description: 'The most this flow may spend in all. It can only lower the operator\'s ceiling.' },
      reuse: { type: 'boolean', description: 'Take people from the roster where they fit (default true). false writes everyone new.' },
    },
  };

  const flowEdit = {
    type: 'object', additionalProperties: false,
    description: 'Level 1: edit the proposal. Every field you change is yours from then on. All or nothing: a change that would leave the plan unsound is refused with every problem named.',
    properties: { company: { type: 'object', additionalProperties: false, properties: companyFields }, departments: { type: 'array', maxItems: 12, items: room } },
  };

  const flowCast = {
    type: 'object', additionalProperties: false,
    description: 'Start writing the people. It runs in the background: poll GET /api/company/flow/:id. This is where the money goes.',
    properties: {
      reuse: { type: 'boolean', description: 'Overrides the flow\'s setting.' },
      budgetUsd: { type: 'number', minimum: 0, description: 'Overrides the flow\'s allowance (never past the operator\'s). How to go on after a flow stopped at its allowance.' },
    },
  };

  const flowCloseOut = {
    type: 'object', additionalProperties: false,
    description: 'After a session: each person who spoke writes down what they remember of it, checked against what the server saw.',
    properties: { session: text(80, 'A label for the session (default: its time).') },
  };

  return { flowPropose, flowEdit, flowCast, flowCloseOut, flowRoom: room, flowPosition: position };
}
