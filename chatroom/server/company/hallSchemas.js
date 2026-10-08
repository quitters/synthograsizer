/**
 * Machine-readable shapes for the roster, the people of a company and the Hall.
 * ──────────────────────────────────────────────────────────────────────────────
 * Every control the owner has here is an API call with a schema (served at GET /api/company/schema), so an agent that builds or changes a
 * company uses the same actions a person does. The stores validate again, in words, so a request that gets past the shape still gets a clear
 * answer for what is wrong inside it.
 */
import { TOOL_TIERS } from '../config/tools.js';
import { MEMORY_KINDS, MEMORY_VERIFIED, CANDIDATE_STATUSES } from './flow/roster.js';
import { HALL_LIMITS } from './hall/limits.js';

const id16 = { type: 'string', pattern: '^[a-f0-9]{16}$' };
const text = (max, description) => ({ type: 'string', minLength: 1, maxLength: max, ...(description ? { description } : {}) });
const names = (max, description, min = 0) => ({ type: 'array', ...(min ? { minItems: min } : {}), maxItems: max, items: text(80), ...(description ? { description } : {}) });

const seatFields = {
  position: text(80, 'The job in this room, e.g. "Template engineer".'),
  reportsTo: text(80, 'Name (or id) of a colleague at this company.'),
  isLead: { type: 'boolean', description: 'Leads the department: closes its sessions and may post where only leads may.' },
  reviewerOf: text(200, 'A file this person reviews: the room has them speak after every save of it, and a "done when" check can require it.'),
  tier: { type: 'string', enum: Object.keys(TOOL_TIERS), description: 'Defaults to the candidate\'s own; must fit inside the company\'s tool grant.' },
  model: text(80),
  thinking: text(20),
};

const hire = {
  type: 'object', additionalProperties: false, required: ['candidateId', 'department', 'position'],
  description: 'Hire a person from the roster into a department of this company: they become an employee (one mailbox, one memory here) with a first seat in that room.',
  properties: { candidateId: id16, department: text(80, 'A department of this company, by id or name.'), ...seatFields, knobs: { type: 'object', description: 'The settings the sheet\'s knobs have for the first session: { knobName: index }.' } },
};

const seat = {
  type: 'object', additionalProperties: false, required: ['department', 'position'],
  description: 'Give an employee another seat: a second department, or a task team.',
  properties: { department: text(80, 'A department of this company, by id or name.'), ...seatFields, taskId: text(40) },
};

const memoryEntry = {
  type: 'object', additionalProperties: false, required: ['text'],
  description: 'A note the owner adds to what a person remembers. They will read it at the start of their next session.',
  properties: { text: text(1200), kind: { type: 'string', enum: [...MEMORY_KINDS] }, session: text(80), note: text(300) },
};

const memoryPatch = {
  type: 'object', additionalProperties: false,
  description: 'Correct what a person remembers. Changing the text makes it the owner\'s word (confirmed); marking it contradicted stops it being handed back.',
  properties: { text: text(1200), kind: { type: 'string', enum: [...MEMORY_KINDS] }, verified: { type: 'string', enum: [...MEMORY_VERIFIED] }, note: { type: 'string', maxLength: 300 } },
};

const candidateImport = {
  type: 'object', additionalProperties: false, required: ['profile'],
  description: 'Import one person as an Agent Profile (the Composer\'s v5 JSON). It enters the roster as a draft until it is approved.',
  properties: {
    profile: { type: 'object', description: 'The Agent Profile: name, bioTemplate, variables, anchors.' },
    archetype: text(40), role: text(80), status: { type: 'string', enum: [...CANDIDATE_STATUSES] },
    casting: { type: 'object', description: 'The facts about the person: bornYear, birthplace { city, country, region }, culture, pronoun, temperament, workingStyle, dissent, intendedType, tier, model, thinking, skills.' },
    skills: { type: 'array', maxItems: 12, items: text(60) },
  },
};

const candidatePatch = {
  type: 'object', additionalProperties: false,
  description: 'Edit a person in the roster. A new profile is checked again.',
  properties: { profile: { type: 'object' }, status: { type: 'string', enum: [...CANDIDATE_STATUSES] }, role: text(80), tier: { type: 'string', enum: Object.keys(TOOL_TIERS) }, model: text(80), thinking: text(20), skills: { type: 'array', maxItems: 12, items: text(60) } },
};

const ownerMail = {
  type: 'object', additionalProperties: false, required: ['to', 'subject', 'body'],
  description: 'A notice from the owner to some of the people: it arrives in their mailbox, nobody replies to it.',
  properties: { to: names(20, 'Names or employee ids.', 1), subject: text(HALL_LIMITS.mail.subject), body: text(HALL_LIMITS.mail.body) },
};

const forumChannel = {
  type: 'object', additionalProperties: false, required: ['title'],
  properties: { title: text(80), slug: text(HALL_LIMITS.forum.slug), purpose: { type: 'string', maxLength: HALL_LIMITS.forum.purpose }, postPolicy: { type: 'string', enum: ['everyone', 'leads', 'owner'] } },
};
const forumThread = { type: 'object', additionalProperties: false, required: ['title', 'body'], properties: { title: text(HALL_LIMITS.forum.title), body: text(HALL_LIMITS.forum.body) } };
const forumReply = { type: 'object', additionalProperties: false, required: ['body'], properties: { body: text(HALL_LIMITS.forum.body) } };

const workspaceWrite = {
  type: 'object', additionalProperties: false, required: ['path', 'content'],
  description: 'Write a workspace file (the owner can write locked files too). Optionally lock it in the same request.',
  properties: { path: text(HALL_LIMITS.workspace.path), content: text(HALL_LIMITS.workspace.bytes), note: { type: 'string', maxLength: HALL_LIMITS.workspace.note }, locked: { type: 'boolean' } },
};
const workspaceLock = { type: 'object', additionalProperties: false, required: ['path', 'locked'], properties: { path: text(HALL_LIMITS.workspace.path), locked: { type: 'boolean' } } };

const boardCreate = {
  type: 'object', additionalProperties: false, required: ['title'],
  properties: {
    title: text(HALL_LIMITS.board.title), description: { type: 'string', maxLength: HALL_LIMITS.board.description }, lead: text(80), members: names(HALL_LIMITS.board.members + 1),
    deliverable: text(200), needsTeam: { type: 'boolean' }, doneWhen: { type: 'array', maxItems: 10, items: { type: 'object' }, description: 'The same checks a room\'s "done when" takes.' },
  },
};
const boardPatch = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['todo', 'doing', 'review', 'done', 'blocked', 'cancelled'] }, note: text(HALL_LIMITS.board.note), lead: text(80), members: names(HALL_LIMITS.board.members + 1),
    deliverable: { type: 'string', maxLength: 200 }, needsTeam: { type: 'boolean' },
  },
};

export const HALL_SCHEMAS = { hire, seat, memoryEntry, memoryPatch, candidateImport, candidatePatch, ownerMail, forumChannel, forumThread, forumReply, workspaceWrite, workspaceLock, boardCreate, boardPatch };
