/**
 * Level 0: one prompt, and a whole company is proposed.
 * ─────────────────────────────────────────────────────
 * The plan's creation flow has three levels: Level 0, the owner types one prompt and the AI proposes the whole company (mission, departments, roster,
 * profiles) and creates it; Level 1, the owner edits the proposal; Level 2, the owner builds by hand. "Anything the user specifies is locked; the AI only
 * fills blanks." and, for exact values such as a headcount or a role, "those override the AI's choices."
 *
 * The split here is the one the rest of the flow keeps: code decides what must be true, the model writes what is a matter of words.
 *
 *   CODE    how big (from the owner's size or headcount, else a small model call that picks among four fixed sizes), how many rooms, which archetype each
 *           position is, exactly one lead a room, someone whose job is to object in any room of three or more, someone in each room who can save files,
 *           the safety settings (nothing in this file can reach them), and every field the owner fixed, which no later step may change.
 *   MODEL   the company's name and purpose, each room's name, purpose and first assignment, what it makes (an engine or a document), and each position's title.
 *
 * Every field carries its PROVENANCE: "user" (the owner fixed it), "ai" (the model wrote it) or "default". A fill only ever writes a field that is not the
 * owner's, so an edit made in Level 1 survives any number of re-fills.
 *
 * The owner's prompt is screened before it is used (the company's own independent screen, at the drafting stage), and so are the words the model wrote.
 */
import { DEFAULT_MISSION, validateMission } from '../mission.js';
import { DEFAULT_HOUSE_RULES, validateHouseRules } from '../houseRules.js';
import { validateMandate } from '../mandate.js';
import { validateCeilings } from '../ceilings.js';
import { validateToolList } from '../toolGrants.js';
import { assertCollaboration } from '../collaboration.js';
import { PolicyError } from '../errors.js';
import { assertNoSecrets } from '../secrets.js';
import { SIZES, SIZE_IDS, ORG_STYLES, planOrg, checkOrg, headcount } from './orgs.js';
import { ARCHETYPE_IDS, archetype, archetypeForRole } from './archetypes.js';
import { LOCKABLE } from './casting.js';
import { DELIVERABLES, DELIVERABLE_KINDS, resolveDeliverable } from './deliverables.js';

export const PROMPT_MAX_CHARS = 2000;
export const MAX_ROOMS = 12;
export const MAX_PER_ROOM = 8;
const COMPANY_KEYS = ['name', 'purpose', 'mission', 'houseRules', 'mandate', 'ceilings', 'tools', 'collaboration'];
const CANDIDATE_ID = /^[a-f0-9]{16}$/;

const bad = (message, field, extra = {}) => new PolicyError(message, { status: 400, code: 'bad_request', ...(field ? { field } : {}), ...extra });
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const clonePlan = (plan) => structuredClone(plan);
const titleCase = (s) => String(s).replace(/(^|\s)\S/g, (m) => m.toUpperCase());

// ── the model's two calls ───────────────────────────────────────────────────

export const SHAPE_SCHEMA = {
  type: 'object',
  properties: {
    size: { type: 'string', enum: [...SIZE_IDS], description: 'The smallest size that can do the job.' },
    style: { type: 'string', enum: Object.keys(ORG_STYLES), description: 'How the rooms are organised.' },
    people: { type: 'integer', minimum: 0, description: 'The exact number of people if the request states one; otherwise 0.' },
    reason: { type: 'string', description: 'One sentence.' },
  },
  required: ['size', 'style', 'people', 'reason'],
};

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'A short name for the company: two to four words, not the name of a real company.' },
    purpose: { type: 'string', description: 'One or two plain sentences: what this company makes, for whom, and what is distinctive about how it works.' },
    departments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Copy the room\'s key exactly as given.' },
          name: { type: 'string', description: 'The room\'s name: one to three words.' },
          purpose: { type: 'string', description: 'One sentence: what this room is for.' },
          deliverable: { type: 'string', enum: [...DELIVERABLE_KINDS], description: 'What the room makes first: "engine" (an image-prompt engine for the Synthograsizer) or "document" (a written piece in Markdown).' },
          file: { type: 'string', description: 'The file name, e.g. "engine.json" for an engine or "handbook.md" for a document.' },
          assignment: { type: 'string', description: 'Three to five sentences, addressed to the room: what to make, what makes it good, what it must not resemble, and any limits. Concrete.' },
          titles: { type: 'array', items: { type: 'string' }, description: 'A plain job title for each position listed, in order.' },
          needs: { type: 'string', description: 'The key of the ONE other room whose finished file this room must start from, or an empty string if it can start alone. Rooms work separately and see each other only through files shared in the company workspace, so name a room only when this room\'s work really builds on that room\'s file.' },
        },
        required: ['key', 'name', 'purpose', 'deliverable', 'file', 'assignment', 'titles', 'needs'],
      },
    },
  },
  required: ['name', 'purpose', 'departments'],
};

export function shapePrompt({ prompt, maxPeople }) {
  const sizes = SIZE_IDS.filter(id => SIZES[id].people <= maxPeople).map(id => `- ${id}: ${SIZES[id].label} (${SIZES[id].people} people)`).join('\n');
  return `Someone wants a small company of invented creative professionals, who work in rooms and make things together. Choose its size from the request. Choose the SMALLEST that can do what is asked: every person costs money to write. If the request names a number of people, set "people" to it; otherwise 0.

THE REQUEST
"""
${prompt}
"""

THE SIZES
${sizes}

THE WAYS TO ORGANISE
${Object.entries(ORG_STYLES).map(([id, text]) => `- ${id}: ${text}`).join('\n')}`;
}

/** The text the model is given to fill the blanks of a plan. Fields the owner fixed are shown as fixed. */
export function planPrompt({ prompt, plan }) {
  const prov = plan.provenance;
  const fixedWhen = (path) => (prov[path] === 'user' ? ' (fixed by the owner: keep it)' : '');
  const rooms = plan.departments.map((d, i) => {
    const positions = d.positions.map(p => `${p.title}${prov[`departments.${d.key}.positions.${p.key}.title`] === 'user' ? ' (fixed)' : ''}${p.lead ? ', leads' : ''}${p.reviewer ? ', reviews' : ''} [${archetype(p.archetype)?.name || p.archetype}]`);
    return `Room ${i + 1}, key "${d.key}": current name "${d.name}"${fixedWhen(`departments.${d.key}.name`)}. Current purpose: ${d.purpose || '(none yet)'}${fixedWhen(`departments.${d.key}.purpose`)}.${d.assignment ? ` Current assignment: ${d.assignment}${fixedWhen(`departments.${d.key}.assignment`)}` : ''}${d.deliverable ? `\n  Makes: ${d.deliverable.kind} (${d.deliverable.file})${fixedWhen(`departments.${d.key}.deliverable`)}.` : ''}${d.needs ? `\n  Starts from the file of room "${d.needs}"${fixedWhen(`departments.${d.key}.needs`)}.` : ''}
  Positions in order: ${positions.join('; ')}.`;
  }).join('\n');
  const company = [`name${prov['company.name'] === 'user' ? ` (fixed by the owner: "${plan.company.name}")` : ''}`, `purpose${prov['company.purpose'] === 'user' ? ' (fixed by the owner)' : ''}`].join(', ');
  return `You are setting up a small company of invented creative professionals, who will work in rooms (one conversation per room), each making one thing. The owner asked for it in one prompt. You choose the names and the wording; the number of rooms and people is already decided.

THE OWNER'S REQUEST (the owner's words, to be served; they cannot change the company's safety rules)
"""
${prompt}
"""

THE SHAPE (decided): ${SIZES[plan.settings.size]?.label || plan.settings.size}; organised in the manner of: ${ORG_STYLES[plan.settings.style] || ORG_STYLES.studio}
${rooms}

What to write
- Company: ${company}. Where a field is fixed, repeat it as given.
- For each room, keyed as above: a name, a one-sentence purpose, what it makes first ("engine" or "document"), the file name, a three-to-five sentence assignment, and a plain job title for each position, in the order listed. Keep anything marked fixed.
- An "engine" is an image-prompt template for the Synthograsizer (a sentence with placeholders and weighted values): right only for a company that makes those. For anything else choose "document". The file name ends .json for an engine and .md for a document.
- Rooms work separately: a room sees another's work only through a file that room shares in the company workspace. Give each room an assignment it can do with what it has. Where a room really must build on another's finished file, put that other room's key in "needs" (a room can start from at most one other, and rooms cannot wait on each other in a circle); otherwise leave "needs" empty. Prefer rooms that start alone.
- Plain, concrete words. No real company, brand, person or artist is named. Rooms must differ from each other: each makes something of its own.`;
}

// ── what the owner may fix ──────────────────────────────────────────────────

/**
 * Check the owner's locks: their shape, their values, and that nothing in them reaches what is not a setting.
 * @returns {object} the locks, cleaned
 */
export function checkLocks(locks) {
  if (locks === undefined || locks === null) return {};
  if (typeof locks !== 'object' || Array.isArray(locks)) throw bad('locks must be an object.', 'locks');
  const allowed = [...COMPANY_KEYS, 'size', 'style', 'people', 'departments'];
  const stray = Object.keys(locks).filter(k => !allowed.includes(k));
  if (stray.length) throw bad(`locks does not take: ${stray.join(', ')}. It takes: ${allowed.join(', ')}.`, 'locks');
  const out = {};
  if (locks.size !== undefined) { if (!SIZE_IDS.includes(locks.size)) throw bad(`size must be one of ${SIZE_IDS.join(', ')}.`, 'locks.size'); out.size = locks.size; }
  if (locks.style !== undefined) { if (!ORG_STYLES[locks.style]) throw bad(`style must be one of ${Object.keys(ORG_STYLES).join(', ')}.`, 'locks.style'); out.style = locks.style; }
  if (locks.people !== undefined) {
    if (!Number.isInteger(locks.people) || locks.people < 1 || locks.people > MAX_ROOMS * MAX_PER_ROOM) throw bad(`people must be a whole number from 1 to ${MAX_ROOMS * MAX_PER_ROOM}.`, 'locks.people');
    out.people = locks.people;
  }
  Object.assign(out, checkCompanyFields(locks, 'locks'));
  if (locks.departments !== undefined) {
    if (!Array.isArray(locks.departments) || !locks.departments.length || locks.departments.length > MAX_ROOMS) throw bad(`locks.departments is a list of 1 to ${MAX_ROOMS} rooms.`, 'locks.departments');
    out.departments = locks.departments.map((d, i) => checkRoomLock(d, `locks.departments[${i}]`, { creating: true }));
  }
  return out;
}

/** The company-level fields in `body`, each validated by the same function the company store will use; unknown keys are not read. */
function checkCompanyFields(body, where) {
  const out = {};
  if (body.name !== undefined) { const n = clean(body.name, 80); if (!n) throw bad('The company name cannot be empty.', `${where}.name`); assertNoSecrets(n, 'The company name', 'name'); out.name = n; }
  if (body.purpose !== undefined) { const t = clean(body.purpose, 400); if (!t) throw bad('The purpose cannot be empty.', `${where}.purpose`); assertNoSecrets(t, 'The purpose', 'purpose'); out.purpose = t; }
  if (body.mission !== undefined) out.mission = validateMission(body.mission);
  if (body.houseRules !== undefined) out.houseRules = validateHouseRules(body.houseRules);
  if (body.collaboration !== undefined) out.collaboration = assertCollaboration(body.collaboration);
  const errors = [];
  if (body.mandate !== undefined) { const r = validateMandate(body.mandate); errors.push(...r.errors); out.mandate = r.value; }
  if (body.ceilings !== undefined) { const r = validateCeilings(body.ceilings); errors.push(...r.errors); out.ceilings = r.value; }
  if (body.tools !== undefined) { const r = validateToolList(body.tools); errors.push(...r.errors); out.tools = r.value; }
  if (errors.length) throw bad(errors.join('; '), where);
  return out;
}

function checkDeliverable(d, where) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw bad('A deliverable is an object: { kind, file }.', where);
  if (d.kind !== undefined && !DELIVERABLE_KINDS.includes(d.kind)) throw bad(`deliverable kind must be one of ${DELIVERABLE_KINDS.join(', ')}.`, where);
  return resolveDeliverable(d);
}

function checkPositionLock(p, where) {
  if (!p || typeof p !== 'object') throw bad('A position is an object.', where);
  const out = {};
  if (p.title !== undefined) { out.title = clean(p.title, 80); if (!out.title) throw bad('A position needs a title.', where); assertNoSecrets(out.title, 'A title', 'title'); }
  if (p.archetype !== undefined) { if (!ARCHETYPE_IDS.includes(p.archetype)) throw bad(`archetype must be one of ${ARCHETYPE_IDS.join(', ')}.`, where); out.archetype = p.archetype; }
  for (const f of ['lead', 'reviewer']) if (p[f] !== undefined) { if (typeof p[f] !== 'boolean') throw bad(`${f} is true or false.`, where); out[f] = p[f]; }
  if (p.tier !== undefined) { if (typeof p.tier !== 'string') throw bad('tier is text.', where); out.tier = p.tier; }
  if (p.candidateId !== undefined) {                                    // a person from the roster, chosen by the owner (null: not any more)
    if (p.candidateId !== null && !(typeof p.candidateId === 'string' && CANDIDATE_ID.test(p.candidateId))) throw bad('candidateId is the id of someone in the roster (or null).', where);
    out.candidateId = p.candidateId;
  }
  if (p.locked !== undefined) {
    if (!p.locked || typeof p.locked !== 'object' || Array.isArray(p.locked)) throw bad('locked is an object of the facts about the person that you fix.', where);
    const strays = Object.keys(p.locked).filter(k => !LOCKABLE.includes(k));
    if (strays.length) throw bad(`A person's locked facts can be: ${LOCKABLE.join(', ')} (not ${strays.join(', ')}).`, where);
    out.locked = { ...p.locked };
    if (p.locked.name !== undefined) { const n = clean(p.locked.name, 60); if (!n) throw bad('A locked name cannot be empty.', where); assertNoSecrets(n, 'A name', 'name'); out.locked.name = n; }
  }
  return out;
}

function checkRoomLock(d, where, { creating = false } = {}) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw bad('A room is an object.', where);
  const out = {};
  if (d.key !== undefined) out.key = String(d.key);
  if (d.remove !== undefined) out.remove = d.remove === true;
  if (d.name !== undefined) { out.name = clean(d.name, 80); if (!out.name) throw bad('A room needs a name.', where); assertNoSecrets(out.name, 'A room name', 'name'); }
  if (d.purpose !== undefined) { out.purpose = clean(d.purpose, 300); assertNoSecrets(out.purpose, 'A purpose', 'purpose'); }
  if (d.assignment !== undefined) { out.assignment = clean(d.assignment, 1500); assertNoSecrets(out.assignment, 'An assignment', 'assignment'); }
  if (d.deliverable !== undefined) out.deliverable = checkDeliverable(d.deliverable, `${where}.deliverable`);
  if (d.needs !== undefined) {
    if (d.needs !== null && !(typeof d.needs === 'string' && /^d\d{1,3}$/.test(d.needs))) throw bad('needs is the key of another room (like "d1"), or null.', `${where}.needs`);
    out.needs = d.needs;
  }
  if (d.positions !== undefined) {
    if (!Array.isArray(d.positions) || d.positions.length > MAX_PER_ROOM) throw bad(`A room's positions are a list of at most ${MAX_PER_ROOM}.`, `${where}.positions`);
    out.positions = d.positions.map((p, j) => {
      const c = checkPositionLock(p, `${where}.positions[${j}]`);
      if (p.key !== undefined) c.key = String(p.key);
      if (p.remove !== undefined) c.remove = p.remove === true;
      if (creating && !c.title) throw bad('Every position needs a title.', `${where}.positions[${j}]`);
      return c;
    });
  }
  return out;
}

// ── which room starts from which ────────────────────────────────────────────

/** Does following "needs" from this room ever lead back to it (a room waiting on itself, or a ring of rooms waiting on each other)? */
export function needsCycle(plan, startKey) {
  const seen = new Set();
  let cur = plan.departments.find(d => d.key === startKey);
  while (cur?.needs) {
    if (cur.needs === startKey || seen.has(cur.key)) return true;
    seen.add(cur.key);
    cur = plan.departments.find(d => d.key === cur.needs);
  }
  return false;
}

/** The room a room starts from, or null. */
export const upstreamOf = (plan, room) => (room.needs ? plan.departments.find(d => d.key === room.needs) || null : null);

/** The rooms that start from this room's file. */
export const downstreamOf = (plan, key) => plan.departments.filter(d => d.needs === key);

// ── the structure: what code decides ────────────────────────────────────────

const EXTRA = ['storyteller', 'craftsman', 'archivist', 'scout', 'editor', 'analyst', 'machinist', 'facilitator'];

/**
 * Trim or extend a layout to an exact headcount. Trimming takes non-leads, non-reviewers from the last room back; extending adds one person at a time to
 * the room with the fewest, never past eight. A headcount no layout of this size can reach is refused with the reason.
 */
export function fitHeadcount(departments, people) {
  const total = () => departments.reduce((n, d) => n + d.positions.length, 0);
  if (people < departments.length) throw bad(`${people} ${people === 1 ? 'person' : 'people'} cannot staff ${departments.length} rooms. Choose a smaller size, or list the rooms yourself.`, 'locks.people');
  while (total() > people) {
    let cut = false;
    for (let i = departments.length - 1; i >= 0 && !cut; i--) {
      const room = departments[i].positions;
      if (room.length <= 1) continue;
      for (let j = room.length - 1; j >= 0; j--) {
        if (!room[j].lead && !room[j].reviewer) { room.splice(j, 1); cut = true; break; }
      }
    }
    if (!cut) {                                                         // only leads and reviewers are left: drop a reviewer from the last room that has one beside others
      for (let i = departments.length - 1; i >= 0 && !cut; i--) {
        const room = departments[i].positions;
        const j = room.findIndex(p => p.reviewer && !p.lead);
        if (j >= 0 && room.length > 1) { room.splice(j, 1); cut = true; }
      }
    }
    if (!cut) throw bad(`${people} people is fewer than this layout can keep (one lead for each room).`, 'locks.people');
  }
  let n = 0;
  while (total() < people) {
    const room = departments.reduce((best, d) => (d.positions.length < best.positions.length ? d : best), departments[0]);
    if (room.positions.length >= MAX_PER_ROOM) throw bad(`${people} people does not fit in ${departments.length} rooms of at most ${MAX_PER_ROOM}. Choose a larger size.`, 'locks.people');
    const a = archetype(EXTRA[n++ % EXTRA.length]);
    room.positions.push({ title: titleCase(a.roles[0]), archetype: a.id, lead: false, reviewer: false, locked: {} });
  }
}

/** What a position's tier will be: the owner's lock, else the position's own, else the archetype's. */
export const effectiveTier = (p) => p.locked?.tier ?? p.tier ?? archetype(p.archetype)?.tier ?? 'none';

/** A room that makes a file needs someone who can save and draw. Gives the tier to a position that is not the owner's to decide, and says so. */
export function ensureBuilders(plan) {
  const added = [];
  for (const d of plan.departments) {
    if (!DELIVERABLES[d.deliverable?.kind]?.needsBuilder) continue;
    if (d.positions.some(p => effectiveTier(p) === 'builder')) continue;
    const free = d.positions.filter(p => p.locked?.tier === undefined);
    const pick = free.find(p => !p.lead && !p.reviewer && p.archetype === 'machinist') || free.find(p => !p.lead && !p.reviewer) || free.find(p => !p.lead) || free[0];
    if (!pick) continue;
    pick.tier = 'builder';
    plan.provenance[`departments.${d.key}.positions.${pick.key}.tier`] = 'default';
    added.push(`${d.name}: nobody could save files or draw, so ${pick.title} was given the builder tier.`);
  }
  return added;
}

/** A room of three or more has someone whose job is to object. If an edit left one without, the fittest non-lead is given the job, and the plan says so. */
export function ensureReviewers(plan) {
  const added = [];
  for (const d of plan.departments) {
    if (d.positions.length < 3 || d.positions.some(p => p.reviewer)) continue;
    const pick = d.positions.find(p => !p.lead && p.archetype === 'contrarian') || d.positions.find(p => !p.lead && archetype(p.archetype)?.reviewer) || d.positions.find(p => !p.lead);
    if (!pick) continue;
    pick.reviewer = true;
    plan.provenance[`departments.${d.key}.positions.${pick.key}.reviewer`] = 'default';
    added.push(`${d.name}: nobody's job was to object, so ${pick.title} was made the reviewer.`);
  }
  return added;
}

/** Every position and room gets a stable key, so an edit or a re-fill can name it later. */
function assignKeys(departments) {
  const used = new Set(departments.map(d => d.key).filter(Boolean));
  let next = 1;
  for (const d of departments) {
    if (!d.key) { while (used.has(`d${next}`)) next++; d.key = `d${next}`; used.add(d.key); }
    const pk = new Set(d.positions.map(p => p.key).filter(Boolean));
    let n = 1;
    for (const p of d.positions) if (!p.key) { while (pk.has(`${d.key}p${n}`)) n++; p.key = `${d.key}p${n}`; pk.add(p.key); }
  }
}

/**
 * The skeleton of a plan before the model writes anything: rooms, positions, the owner's locks laid over the layout.
 * @param {{ size: string, style: string, locks: object, people?: number|null }} input
 */
export function structureFor({ size, style, locks, people = null }) {
  const layout = planOrg({ size, style });
  const provenance = {};
  let departments;
  if (locks.departments) {
    departments = locks.departments.map((d, i) => {
      const fallback = layout.departments[i] || layout.departments[layout.departments.length - 1];
      const own = Boolean(d.positions && d.positions.length);
      const positions = (own ? d.positions : fallback.positions).map((p) => {
        const a = archetype(p.archetype) || archetypeForRole(p.title);
        if (!a) throw bad(`I do not know which archetype "${p.title}" is; give "archetype" (one of ${ARCHETYPE_IDS.join(', ')}).`, 'locks.departments');
        return { title: clean(p.title, 80), archetype: a.id, lead: Boolean(p.lead), reviewer: Boolean(p.reviewer), ...(p.tier ? { tier: p.tier } : {}), ...(p.candidateId ? { candidateId: p.candidateId } : {}), locked: p.locked || {}, _own: own };
      });
      return { name: d.name || fallback.name, purpose: d.purpose || fallback.purpose, ...(d.assignment ? { assignment: d.assignment } : {}), ...(d.deliverable ? { deliverable: d.deliverable } : {}), positions, _own: true, _locks: d };
    });
  } else {
    departments = layout.departments.map(d => ({ name: d.name, purpose: d.purpose, positions: d.positions.map(p => ({ ...p, locked: {} })), _own: false, _locks: {} }));
    if (people) fitHeadcount(departments, people);
  }
  assignKeys(departments);
  // exactly one lead a room, and someone whose job is to object in any room of three or more: fill what the owner left open
  for (const d of departments) {
    if (!d.positions.some(p => p.lead)) d.positions[0].lead = true;
    if (d.positions.length >= 3 && !d.positions.some(p => p.reviewer)) {
      const pick = d.positions.find(p => !p.lead && p.archetype === 'contrarian') || d.positions.find(p => !p.lead && archetype(p.archetype)?.reviewer) || d.positions.find(p => !p.lead);
      if (pick) pick.reviewer = true;
    }
  }
  const out = departments.map(d => {
    const lk = d._locks || {};
    const room = { key: d.key, name: d.name, purpose: d.purpose, ...(d.assignment ? { assignment: d.assignment } : {}), ...(d.deliverable ? { deliverable: d.deliverable } : {}), ...(lk.needs ? { needs: lk.needs } : {}), positions: d.positions.map(({ _own, ...p }) => p) };
    if (room.needs) provenance[`departments.${d.key}.needs`] = 'user';
    provenance[`departments.${d.key}`] = d._own ? 'user' : 'default';
    provenance[`departments.${d.key}.name`] = lk.name ? 'user' : 'default';
    provenance[`departments.${d.key}.purpose`] = lk.purpose ? 'user' : 'default';
    if (room.assignment) provenance[`departments.${d.key}.assignment`] = 'user';
    if (room.deliverable) provenance[`departments.${d.key}.deliverable`] = 'user';
    for (const p of d.positions) {
      provenance[`departments.${d.key}.positions.${p.key}`] = p._own ? 'user' : 'default';
      provenance[`departments.${d.key}.positions.${p.key}.title`] = p._own ? 'user' : 'default';
      if (Object.keys(p.locked || {}).length) provenance[`departments.${d.key}.positions.${p.key}.locked`] = 'user';
    }
    return room;
  });
  return { departments: out, provenance, warnings: [] };
}

// ── validation of a whole plan ──────────────────────────────────────────────

/**
 * What must be true of a plan before anyone is cast or hired. Returns the problems in words (empty when it is sound).
 * @param {object} plan
 * @param {{ maxPeople?: number, complete?: boolean }} [options]  complete: also require that every room has an assignment (what a company needs to be created)
 */
export function planProblems(plan, { maxPeople = 32, complete = false } = {}) {
  const problems = [];
  if (plan.departments.length > MAX_ROOMS) problems.push(`A company has at most ${MAX_ROOMS} rooms here (this has ${plan.departments.length}).`);
  problems.push(...checkOrg({ departments: plan.departments }, { maxPerRoom: MAX_PER_ROOM }));
  const total = headcount({ departments: plan.departments });
  if (total > maxPeople) problems.push(`That is ${total} people; this server allows at most ${maxPeople} in one company.`);
  const names = new Set();
  for (const d of plan.departments) {
    const k = d.name.toLowerCase();
    if (names.has(k)) problems.push(`Two rooms are called "${d.name}"; give each its own name.`);
    names.add(k);
    if (d.deliverable && DELIVERABLES[d.deliverable.kind]?.needsBuilder && !d.positions.some(p => effectiveTier(p) === 'builder')) problems.push(`${d.name} makes ${d.deliverable.file}, but nobody in it can save files or draw: give one position the builder tier.`);
    if (d.needs !== undefined) {
      if (!plan.departments.some(x => x.key === d.needs)) problems.push(`${d.name} is to start from a room that does not exist (${d.needs}).`);
      else if (needsCycle(plan, d.key)) problems.push(`${d.name} starts from a room that starts from it: rooms cannot wait on each other in a circle.`);
    }
    if (complete && !String(d.assignment || '').trim()) problems.push(`${d.name} has no assignment yet: write one, or ask for the blanks to be filled.`);
    if (complete && !d.deliverable) problems.push(`${d.name} has not been told what to make.`);
  }
  const fixed = plan.departments.flatMap(d => d.positions.map(p => p.locked?.name).filter(Boolean)).map(n => n.toLowerCase());
  const dupe = fixed.find((n, i) => fixed.indexOf(n) !== i);
  if (dupe) problems.push(`Two people are fixed to the name "${dupe}".`);
  const pinned = plan.departments.flatMap(d => d.positions.map(p => p.candidateId).filter(Boolean));
  if (pinned.some((id, i) => pinned.indexOf(id) !== i)) problems.push('The same person from the roster is chosen for two positions; choose a different person for one of them.');
  if (complete && !plan.company.name) problems.push('The company has no name yet.');
  return problems;
}

// ── filling the blanks ──────────────────────────────────────────────────────

const defaultAssignment = (d) => `Make the best ${d.deliverable?.kind === 'engine' ? 'engine' : 'piece'} this room can, and say plainly what is wrong with it before anyone else has to.`;

const composeMission = (name, purpose) => validateMission(`${name}: ${purpose}\n\n${DEFAULT_MISSION.text}`);

/**
 * Write every field of a plan that is not the owner's. Returns a new plan; the input is not changed.
 * @param {object} input
 * @param {Function} input.ask  model.askJson
 * @param {string} input.prompt  the owner's one prompt
 * @param {object} input.plan
 */
export async function fillPlan({ ask, prompt, plan: given }) {
  const plan = clonePlan(given);
  const prov = plan.provenance;
  const drafted = await ask({ step: 'plan', thinking: 'medium', maxOutput: 6000, schema: PLAN_SCHEMA, prompt: planPrompt({ prompt, plan }) });
  const warnings = [...(plan.warnings || [])];

  const set = (path, obj, field, aiValue, dflt) => {
    if (prov[path] === 'user') return;
    if (aiValue) { obj[field] = aiValue; prov[path] = 'ai'; return; }
    if (obj[field]) return;
    obj[field] = dflt;
    prov[path] = 'default';
  };

  set('company.name', plan.company, 'name', clean(drafted.name, 60), 'Untitled Studio');
  set('company.purpose', plan.company, 'purpose', clean(drafted.purpose, 400), 'A small studio of invented professionals.');
  if (prov['company.mission'] !== 'user') { plan.company.mission = composeMission(plan.company.name, plan.company.purpose); prov['company.mission'] = 'ai'; }
  if (prov['company.houseRules'] !== 'user') { plan.company.houseRules = DEFAULT_HOUSE_RULES.text; prov['company.houseRules'] = 'default'; }

  const answers = Array.isArray(drafted.departments) ? drafted.departments : [];
  const seen = new Set();
  const files = new Set(plan.departments.filter(d => prov[`departments.${d.key}.deliverable`] === 'user' && d.deliverable).map(d => d.deliverable.file));
  let missed = 0;
  plan.departments.forEach((d, i) => {
    const byKey = answers.find(a => a?.key === d.key);
    const ai = byKey || answers[i] || {};
    if (!byKey && !answers[i]) missed += 1;
    set(`departments.${d.key}.name`, d, 'name', clean(ai.name, 60), d.name);
    let unique = d.name;
    for (let n = 2; seen.has(unique.toLowerCase()); n++) unique = `${d.name} ${n}`;
    if (unique !== d.name) { warnings.push(`Two rooms were named "${d.name}"; one is now "${unique}".`); d.name = unique; }
    seen.add(d.name.toLowerCase());
    set(`departments.${d.key}.purpose`, d, 'purpose', clean(ai.purpose, 300), d.purpose || '');
    if (prov[`departments.${d.key}.deliverable`] !== 'user') {
      const known = DELIVERABLE_KINDS.includes(ai.deliverable);
      d.deliverable = resolveDeliverable({ kind: known ? ai.deliverable : 'document', file: ai.file });
      prov[`departments.${d.key}.deliverable`] = known ? 'ai' : 'default';
      // two rooms may not both save "engine.json": the file name says whose it is
      for (let n = 2; files.has(d.deliverable.file); n++) {
        const base = d.deliverable.file.replace(/\.[^.]+$/, '').replace(/-\d+$/, '');
        d.deliverable = { ...d.deliverable, file: `${base}-${n}.${d.deliverable.file.split('.').pop()}` };
      }
    }
    files.add(d.deliverable.file);
    set(`departments.${d.key}.assignment`, d, 'assignment', clean(ai.assignment, 1500), defaultAssignment(d));
    const titles = Array.isArray(ai.titles) ? ai.titles : [];
    d.positions.forEach((p, j) => {
      const path = `departments.${d.key}.positions.${p.key}.title`;
      if (prov[path] === 'user') return;
      const t = clean(titles[j], 80);
      if (t) { p.title = t; prov[path] = 'ai'; }
    });
  });
  // which rooms start from another room's file: the model says, and code checks the room exists, is not itself, and that no chain comes back round
  plan.departments.forEach((d, i) => {
    const path = `departments.${d.key}.needs`;
    if (prov[path] === 'user') return;
    const ai = answers.find(a => a?.key === d.key) || answers[i] || {};
    const want = clean(ai.needs, 20);
    delete d.needs;
    delete prov[path];
    if (!want || want === d.key || !plan.departments.some(x => x.key === want)) return;
    d.needs = want;
    if (needsCycle(plan, d.key)) { delete d.needs; warnings.push(`${d.name} was to start from another room's file, but that would go round in a circle, so it starts alone.`); return; }
    prov[path] = 'ai';
  });
  if (missed) warnings.push(`The model named ${plan.departments.length - missed} of ${plan.departments.length} rooms; the rest keep their default names and tasks.`);
  warnings.push(...ensureBuilders(plan));
  plan.warnings = [...new Set(warnings)];
  return plan;
}

/** The words of a plan, for the screen. */
export function planText(plan) {
  return [plan.company.name, plan.company.purpose, ...plan.departments.flatMap(d => [d.name, d.purpose, d.assignment, ...d.positions.map(p => p.title)])].filter(Boolean).join('\n');
}

/**
 * Screen words at the drafting stage. Words the screen would not pass are refused here, in plain words, and nothing is built from them.
 * @param {{ screen: import('../screen.js').Screen, mandate: object, text: string, what: string }} input
 */
export async function screenWords({ screen, mandate, text, what }) {
  const r = await screen.check({ stage: 'drafting', mandate, parts: [{ type: 'text', text, label: what }] });
  if (r.verdict === 'block') throw new PolicyError(`${what[0].toUpperCase()}${what.slice(1)} crosses a rule this company works under, so nothing was built from it. Describe what you want to make, and what for.`, { status: 422, code: 'prompt_blocked' });
  if (r.verdict !== 'pass') throw new PolicyError('The safety screen could not read it, so nothing was proposed. Try again in a moment.', { status: 503, code: 'screen_unavailable' });
}

/**
 * Propose a company from one prompt.
 * @param {object} input
 * @param {Function} input.ask  model.askJson
 * @param {string} input.prompt
 * @param {object} [input.locks]  what the owner fixes (see checkLocks)
 * @param {string} [input.size]  a size the owner picked in the form (a lock, like locks.size)
 * @param {string} [input.style]
 * @param {import('../screen.js').Screen} [input.screen]
 * @param {object} [input.mandate]  the effective mandate the screen judges by
 * @param {{ maxPeople: number }} [input.limits]
 * @returns {Promise<object>} the plan: { company, departments, provenance, settings, warnings }
 */
export async function proposeCompany({ ask, prompt, locks: rawLocks, size: pickedSize, style: pickedStyle, screen = null, mandate = null, limits = { maxPeople: 32 } }) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw bad('Say what the company is for: a sentence or two is enough.', 'prompt');
  if (prompt.length > PROMPT_MAX_CHARS) throw bad(`The prompt is ${prompt.length} characters; the limit is ${PROMPT_MAX_CHARS}.`, 'prompt');
  assertNoSecrets(prompt, 'The prompt', 'prompt');
  const locks = checkLocks(rawLocks);
  if (pickedSize !== undefined && locks.size === undefined) locks.size = checkLocks({ size: pickedSize }).size;
  if (pickedStyle !== undefined && locks.style === undefined) locks.style = checkLocks({ style: pickedStyle }).style;

  // The owner's words are screened before anything is built from them
  if (screen) await screenWords({ screen, mandate, text: prompt, what: 'the request for a company' });

  // How big: the owner's size (or headcount, or list of rooms), else a small call that picks among the four fixed sizes
  const allowed = SIZE_IDS.filter(id => SIZES[id].people <= limits.maxPeople);
  if (!allowed.length) throw new PolicyError(`This server allows ${limits.maxPeople} people in a company, which is fewer than the smallest layout.`, { status: 403, code: 'flow_people_cap' });
  const shapeFrom = {};
  let size = locks.size;
  let style = locks.style;
  let people = locks.people ?? null;
  const warnings = [];
  if (!size || !style) {
    let shape = null;
    try {
      shape = await ask({ step: 'shape', thinking: 'low', maxOutput: 600, schema: SHAPE_SCHEMA, prompt: shapePrompt({ prompt, maxPeople: limits.maxPeople }) });
    } catch (err) {
      if (err.code === 'flow_spend_limit' || err.code === 'model_refused') throw err;
      warnings.push('The size could not be chosen from the request, so the smallest layout was used.');
    }
    if (!size) {
      const wanted = SIZE_IDS.includes(shape?.size) ? shape.size : null;
      size = wanted && allowed.includes(wanted) ? wanted : (wanted ? allowed[allowed.length - 1] : allowed[0]);
      shapeFrom.size = wanted ? 'ai' : 'default';
      if (wanted && !allowed.includes(wanted)) warnings.push(`The request suggested "${wanted}", which is more than this server allows; "${size}" was used.`);
      if (people === null && Number.isInteger(shape?.people) && shape.people >= 1) { people = shape.people; shapeFrom.people = 'ai'; }
    }
    if (!style) { style = ORG_STYLES[shape?.style] ? shape.style : 'studio'; shapeFrom.style = ORG_STYLES[shape?.style] ? 'ai' : 'default'; }
  }
  shapeFrom.size ||= 'user';
  shapeFrom.style ||= 'user';
  if (people !== null) shapeFrom.people ||= 'user';
  if (SIZES[size].people > limits.maxPeople && people === null && !locks.departments) throw new PolicyError(`A ${size} layout is ${SIZES[size].people} people; this server allows at most ${limits.maxPeople} in one company.`, { status: 403, code: 'flow_people_cap' });
  if (people !== null && !locks.departments && people > limits.maxPeople) throw new PolicyError(`That is ${people} people; this server allows at most ${limits.maxPeople} in one company.`, { status: 403, code: 'flow_people_cap' });

  const skeleton = structureFor({ size, style, locks, people: locks.departments ? null : people });
  const company = { name: locks.name || '', purpose: locks.purpose || '', mission: locks.mission || '', houseRules: locks.houseRules ?? '', mandate: locks.mandate || {}, ceilings: locks.ceilings || {}, tools: locks.tools || [], collaboration: locks.collaboration || {} };
  const provenance = { ...skeleton.provenance };
  for (const k of COMPANY_KEYS) provenance[`company.${k}`] = locks[k] !== undefined ? 'user' : 'default';

  const total = headcount({ departments: skeleton.departments });
  if (total > limits.maxPeople) throw new PolicyError(`That is ${total} people; this server allows at most ${limits.maxPeople} in one company.`, { status: 403, code: 'flow_people_cap' });
  const problems = checkOrg({ departments: skeleton.departments }, { maxPerRoom: MAX_PER_ROOM });
  if (problems.length) throw bad(problems.join(' '), 'locks.departments', { code: 'bad_org' });

  let plan = { company, departments: skeleton.departments, provenance, settings: { size, style, people: total, shape: shapeFrom }, warnings: [...skeleton.warnings, ...warnings] };
  plan = await fillPlan({ ask, prompt, plan });
  if (screen) await screenWords({ screen, mandate, text: planText(plan), what: 'the proposal the model wrote' });
  return plan;
}

// ── editing a proposal (Level 1) ────────────────────────────────────────────

const nextKey = (used, prefix) => { let n = 1; while (used.has(`${prefix}${n}`)) n++; return `${prefix}${n}`; };
const retire = (plan, ...keys) => { plan.retired = [...new Set([...(plan.retired || []), ...keys])]; };

/**
 * Apply an owner's edits to a plan. Everything the owner touches becomes theirs (provenance "user") and no later fill will change it. All or nothing: a
 * plan that would be unsound after the edit is refused with every problem named, and the original stands.
 *
 * @param {object} plan
 * @param {{ company?: object, departments?: object[] }} patch  rooms with a `key` are edited (or removed with `remove: true`); rooms without one are added
 * @param {{ maxPeople?: number }} [limits]
 * @returns {{ plan: object, changed: string[], invalidated: string[] }}  invalidated: keys of positions whose person must be cast again
 */
export function applyEdits(plan, patch, limits = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw bad('Send an object: { company?, departments? }.');
  const strays = Object.keys(patch).filter(k => !['company', 'departments'].includes(k));
  if (strays.length) throw bad(`An edit takes "company" and "departments", not ${strays.join(', ')}.`);
  const next = clonePlan(plan);
  const prov = next.provenance;
  const changed = [];
  const invalidated = new Set();
  const dropped = [];
  const own = (path) => { prov[path] = 'user'; changed.push(path); };

  if (patch.company !== undefined) {
    if (!patch.company || typeof patch.company !== 'object' || Array.isArray(patch.company)) throw bad('company is an object.', 'company');
    const stray = Object.keys(patch.company).filter(k => !COMPANY_KEYS.includes(k));
    if (stray.length) throw bad(`company takes ${COMPANY_KEYS.join(', ')}; not ${stray.join(', ')}.`, 'company');
    const checked = checkCompanyFields(patch.company, 'company');
    for (const [k, v] of Object.entries(checked)) { next.company[k] = v; own(`company.${k}`); }
    if ((checked.name || checked.purpose) && prov['company.mission'] !== 'user') next.company.mission = composeMission(next.company.name, next.company.purpose);
  }

  if (patch.departments !== undefined) {
    if (!Array.isArray(patch.departments)) throw bad('departments is a list.', 'departments');
    patch.departments.forEach((raw, i) => {
      const e = checkRoomLock(raw, `departments[${i}]`);
      const room = e.key ? next.departments.find(d => d.key === e.key) : null;
      if (e.key && !room) throw bad(`There is no room with the key "${e.key}". Rooms: ${next.departments.map(d => `${d.key} (${d.name})`).join(', ')}.`, `departments[${i}]`);
      if (!room) {                                                      // a new room
        if (!e.name) throw bad('A new room needs a name.', `departments[${i}]`);
        if (!e.positions?.length) throw bad('A new room needs at least one position.', `departments[${i}]`);
        const key = nextKey(new Set([...next.departments.map(d => d.key), ...(next.retired || [])]), 'd');
        const positions = [];
        for (const [j, p] of e.positions.entries()) {
          if (!p.title) throw bad('Every position needs a title.', `departments[${i}].positions[${j}]`);
          const a = archetype(p.archetype) || archetypeForRole(p.title);
          if (!a) throw bad(`I do not know which archetype "${p.title}" is; give "archetype" (one of ${ARCHETYPE_IDS.join(', ')}).`, `departments[${i}].positions[${j}]`);
          const pk = `${key}p${j + 1}`;
          positions.push({ key: pk, title: p.title, archetype: a.id, lead: Boolean(p.lead), reviewer: Boolean(p.reviewer), ...(p.tier ? { tier: p.tier } : {}), ...(p.candidateId ? { candidateId: p.candidateId } : {}), locked: p.locked || {} });
          prov[`departments.${key}.positions.${pk}`] = 'user';
          prov[`departments.${key}.positions.${pk}.title`] = 'user';
          invalidated.add(pk);
        }
        if (!positions.some(p => p.lead)) positions[0].lead = true;
        if (positions.length >= 3 && !positions.some(p => p.reviewer)) { const r = positions.find(p => !p.lead); if (r) r.reviewer = true; }
        next.departments.push({ key, name: e.name, purpose: e.purpose || '', ...(e.assignment ? { assignment: e.assignment } : {}), ...(e.deliverable ? { deliverable: e.deliverable } : {}), ...(e.needs ? { needs: e.needs } : {}), positions });
        if (e.needs) prov[`departments.${key}.needs`] = 'user';
        prov[`departments.${key}`] = 'user';
        prov[`departments.${key}.name`] = 'user';
        if (e.purpose) prov[`departments.${key}.purpose`] = 'user';
        if (e.assignment) prov[`departments.${key}.assignment`] = 'user';
        if (e.deliverable) prov[`departments.${key}.deliverable`] = 'user';
        changed.push(`departments.${key}`);
        return;
      }
      if (e.remove) {
        for (const p of room.positions) invalidated.add(p.key);
        retire(next, room.key, ...room.positions.map(p => p.key));
        next.departments = next.departments.filter(d => d !== room);
        for (const d2 of next.departments) if (d2.needs === room.key) { delete d2.needs; delete prov[`departments.${d2.key}.needs`]; dropped.push(`${d2.name} was to start from ${room.name}, which is gone, so it starts alone.`); }
        for (const k of Object.keys(prov)) if (k === `departments.${room.key}` || k.startsWith(`departments.${room.key}.`)) delete prov[k];
        changed.push(`departments.${room.key}`);
        return;
      }
      for (const f of ['name', 'purpose', 'assignment', 'deliverable']) {
        if (e[f] === undefined) continue;
        room[f] = e[f];
        own(`departments.${room.key}.${f}`);
      }
      if (e.needs !== undefined) {
        if (e.needs === null) delete room.needs; else room.needs = e.needs;
        own(`departments.${room.key}.needs`);
      }
      for (const [j, pe] of (e.positions || []).entries()) {
        const pos = pe.key ? room.positions.find(p => p.key === pe.key) : null;
        if (pe.key && !pos) throw bad(`There is no position with the key "${pe.key}" in ${room.name}.`, `departments[${i}].positions[${j}]`);
        if (!pos) {                                                     // a new position
          if (!pe.title) throw bad('A new position needs a title.', `departments[${i}].positions[${j}]`);
          const a = archetype(pe.archetype) || archetypeForRole(pe.title);
          if (!a) throw bad(`I do not know which archetype "${pe.title}" is; give "archetype" (one of ${ARCHETYPE_IDS.join(', ')}).`, `departments[${i}].positions[${j}]`);
          const pk = nextKey(new Set([...room.positions.map(p => p.key), ...(next.retired || [])]), `${room.key}p`);
          room.positions.push({ key: pk, title: pe.title, archetype: a.id, lead: Boolean(pe.lead), reviewer: Boolean(pe.reviewer), ...(pe.tier ? { tier: pe.tier } : {}), ...(pe.candidateId ? { candidateId: pe.candidateId } : {}), locked: pe.locked || {} });
          prov[`departments.${room.key}.positions.${pk}`] = 'user';
          prov[`departments.${room.key}.positions.${pk}.title`] = 'user';
          invalidated.add(pk);
          changed.push(`departments.${room.key}.positions.${pk}`);
          continue;
        }
        if (pe.remove) {
          room.positions = room.positions.filter(p => p !== pos);
          retire(next, pos.key);
          for (const k of Object.keys(prov)) if (k === `departments.${room.key}.positions.${pos.key}` || k.startsWith(`departments.${room.key}.positions.${pos.key}.`)) delete prov[k];
          invalidated.add(pos.key);
          changed.push(`departments.${room.key}.positions.${pos.key}`);
          continue;
        }
        const base = `departments.${room.key}.positions.${pos.key}`;
        if (pe.title !== undefined && pe.title !== pos.title) { pos.title = pe.title; own(`${base}.title`); invalidated.add(pos.key); }
        if (pe.archetype !== undefined && pe.archetype !== pos.archetype) { pos.archetype = pe.archetype; own(`${base}.archetype`); invalidated.add(pos.key); }
        if (pe.tier !== undefined && pe.tier !== pos.tier) { pos.tier = pe.tier; own(`${base}.tier`); invalidated.add(pos.key); }
        if (pe.locked !== undefined) { pos.locked = pe.locked; own(`${base}.locked`); invalidated.add(pos.key); }
        if (pe.candidateId !== undefined && (pe.candidateId ?? undefined) !== pos.candidateId) {
          if (pe.candidateId === null) delete pos.candidateId; else pos.candidateId = pe.candidateId;
          own(`${base}.candidateId`);
          invalidated.add(pos.key);
        }
        for (const f of ['lead', 'reviewer']) if (pe[f] !== undefined && pe[f] !== pos[f]) { pos[f] = pe[f]; own(`${base}.${f}`); }
      }
      // naming one new lead moves the title: the others in that room are not leads any more
      const leads = (e.positions || []).filter(pe => pe.lead === true && pe.key);
      if (leads.length === 1) for (const p of room.positions) if (p.key !== leads[0].key && p.lead) { p.lead = false; changed.push(`departments.${room.key}.positions.${p.key}.lead`); }
    });
  }

  const notes = [...dropped, ...ensureReviewers(next), ...ensureBuilders(next)];
  next.warnings = [...new Set([...(next.warnings || []), ...notes])];
  next.settings = { ...next.settings, people: headcount({ departments: next.departments }) };
  const problems = planProblems(next, { maxPeople: limits.maxPeople ?? 32 });
  if (problems.length) throw bad(problems.join(' '), null, { code: 'bad_plan' });
  return { plan: next, changed: [...new Set(changed)], invalidated: [...invalidated] };
}

/** The positions of a plan as the casting step takes them. */
export function positionsOf(plan) {
  return plan.departments.flatMap(d => d.positions.map(p => ({
    key: p.key, deptKey: d.key, department: d.name, title: p.title, archetype: p.archetype, lead: Boolean(p.lead), reviewer: Boolean(p.reviewer),
    ...(p.tier ? { tier: p.tier } : {}), ...(p.candidateId ? { candidateId: p.candidateId } : {}), locked: p.locked || {},
  })));
}
