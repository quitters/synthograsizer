import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeCompany, fillPlan, applyEdits, checkLocks, planProblems, structureFor, fitHeadcount, positionsOf, effectiveTier, PROMPT_MAX_CHARS, planPrompt } from './planner.js';
import { fakeAsk, fakePlanAnswer } from './flowKit.js';
import { Screen } from '../screen.js';
import { markerClassifier, FORBIDDEN } from '../testKit.js';
import { headcount, SIZES } from './orgs.js';
import { DEFAULT_MISSION } from '../mission.js';
import { DEFAULT_HOUSE_RULES } from '../houseRules.js';

/** Level 0 and Level 1: a plan from one prompt, with what the owner fixes laid over it, and the owner's edits to it. */

const PROMPT = 'A studio that makes alpine snow-safety posters and the image templates to draw them.';
const propose = (over = {}, ask = fakeAsk()) => proposeCompany({ ask, prompt: PROMPT, ...over });

test('one prompt makes a whole plan: a name, a mission, rooms with keys, positions with archetypes, one lead a room', async () => {
  const ask = fakeAsk();
  const plan = await propose({}, ask);
  assert.equal(plan.company.name, 'Parallax Works');
  assert.match(plan.company.mission, /^Parallax Works: Makes small invented worlds/);
  assert.ok(plan.company.mission.endsWith(DEFAULT_MISSION.text), 'the humanist default follows the purpose');
  assert.equal(plan.company.houseRules, DEFAULT_HOUSE_RULES.text);
  assert.equal(plan.departments.length, 1, 'the model chose the desk');
  const [room] = plan.departments;
  assert.equal(room.key, 'd1');
  assert.equal(room.name, 'Room 1 Works');
  assert.equal(room.deliverable.kind, 'engine');
  assert.equal(room.deliverable.file, 'engine.json');
  assert.deepEqual(room.positions.map(p => p.key), ['d1p1', 'd1p2', 'd1p3', 'd1p4', 'd1p5', 'd1p6']);
  assert.deepEqual(room.positions.map(p => p.title), ['Title 1-1', 'Title 1-2', 'Title 1-3', 'Title 1-4', 'Title 1-5', 'Title 1-6']);
  assert.equal(room.positions.filter(p => p.lead).length, 1);
  assert.ok(room.positions.some(p => p.reviewer));
  assert.equal(plan.settings.people, 6);
  assert.deepEqual(ask.calls.map(c => c.step), ['shape', 'plan']);
});

test('every field says whose it is: the model\'s, a default, or the owner\'s', async () => {
  const plan = await propose({ locks: { name: 'Snowline Studio' } });
  assert.equal(plan.provenance['company.name'], 'user');
  assert.equal(plan.provenance['company.purpose'], 'ai');
  assert.equal(plan.provenance['company.houseRules'], 'default');
  assert.equal(plan.provenance['departments.d1.name'], 'ai');
  assert.equal(plan.provenance['departments.d1.positions.d1p1.title'], 'ai');
  assert.equal(plan.provenance['departments.d1.deliverable'], 'ai');
  assert.equal(plan.settings.shape.size, 'ai');
  assert.equal(plan.company.name, 'Snowline Studio', 'the model\'s own name did not replace the owner\'s');
});

test('what the owner fixes is never overwritten: name, mission, a room, a title, a person\'s facts', async () => {
  const plan = await propose({
    locks: {
      name: 'Snowline Studio', mission: 'We make safety posters, honestly.', size: 'desk',
      departments: [{
        name: 'The Print Room', assignment: 'Draw four posters and no more.',
        deliverable: { kind: 'document', file: 'posters.md' },
        positions: [
          { title: 'Producer', lead: true, locked: { name: 'Mara Quill', bornYear: 1980 } },
          { title: 'Writer' },
          { title: 'Skeptic', reviewer: true },
        ],
      }],
    },
  });
  const room = plan.departments[0];
  assert.equal(room.name, 'The Print Room');
  assert.equal(room.assignment, 'Draw four posters and no more.');
  assert.deepEqual(room.deliverable, { kind: 'document', file: 'posters.md', minChars: 600 });
  assert.equal(plan.company.mission, 'We make safety posters, honestly.');
  assert.deepEqual(room.positions.map(p => p.title), ['Producer', 'Writer', 'Skeptic'], 'the owner\'s titles stand against the model\'s');
  assert.deepEqual(room.positions[0].locked, { name: 'Mara Quill', bornYear: 1980 });
  assert.equal(plan.provenance['departments.d1.name'], 'user');
  assert.equal(plan.provenance['departments.d1.assignment'], 'user');
  assert.equal(plan.provenance['departments.d1.deliverable'], 'user');
  assert.equal(plan.provenance['departments.d1.positions.d1p1.locked'], 'user');
  assert.equal(plan.provenance['departments.d1.purpose'], 'ai', 'what the owner left open the model filled');
});

test('a headcount the owner types overrides the layout: trimmed, extended, and refused when it cannot be met', async () => {
  const four = await propose({ locks: { size: 'desk', people: 4 } });
  assert.equal(headcount(four), 4);
  assert.ok(four.departments[0].positions.some(p => p.lead) && four.departments[0].positions.some(p => p.reviewer), 'the lead and the reviewer stay');
  const eight = await propose({ locks: { size: 'desk', people: 8 } });
  assert.equal(headcount(eight), 8);
  assert.equal(eight.provenance['departments.d1.positions.d1p7'], 'default');
  await assert.rejects(() => propose({ locks: { size: 'small', people: 1 } }), /cannot staff 2 rooms/);
  await assert.rejects(() => propose({ locks: { size: 'desk', people: 9 } }), /does not fit in 1 rooms/);
  await assert.rejects(() => propose({ locks: { people: 0 } }), /whole number from 1 to 96/);
});

test('a number in the request, read by the model, sets the headcount too (marked as the model\'s reading)', async () => {
  const ask = fakeAsk({ shape: () => ({ size: 'desk', style: 'studio', people: 5, reason: 'the request asked for five' }) });
  const plan = await propose({}, ask);
  assert.equal(headcount(plan), 5);
  assert.equal(plan.settings.shape.people, 'ai');
});

test('the operator\'s people cap holds for every way in: a size, a headcount, a list of rooms, and the model\'s own choice', async () => {
  await assert.rejects(() => propose({ locks: { size: 'large' }, limits: { maxPeople: 12 } }), (e) => e.code === 'flow_people_cap' && /32 people/.test(e.message));
  await assert.rejects(() => propose({ locks: { people: 20 }, limits: { maxPeople: 12 } }), (e) => e.code === 'flow_people_cap');
  const room = (n) => ({ name: 'R', positions: Array.from({ length: n }, (_, i) => ({ title: i ? 'Writer' : 'Producer', lead: i === 0 })) });
  await assert.rejects(() => propose({ locks: { departments: [room(8), room(8)] }, limits: { maxPeople: 12 } }), (e) => e.code === 'flow_people_cap');
  const ask = fakeAsk({ shape: () => ({ size: 'large', style: 'studio', people: null, reason: 'big' }) });
  const plan = await propose({ limits: { maxPeople: 12 } }, ask);
  assert.equal(plan.settings.size, 'small', 'the largest size that fits');
  assert.match(plan.warnings.join(' '), /suggested "large", which is more than this server allows/);
});

test('if the size cannot be chosen the smallest layout is used, and it says so', async () => {
  const ask = fakeAsk({ shape: () => { throw new Error('model down'); } });
  const plan = await propose({}, ask);
  assert.equal(plan.settings.size, 'desk');
  assert.equal(plan.settings.shape.size, 'default');
  assert.match(plan.warnings.join(' '), /size could not be chosen/);
  const spent = fakeAsk({ shape: () => { const e = new Error('limit'); e.code = 'flow_spend_limit'; throw e; } });
  await assert.rejects(() => propose({}, spent), (e) => e.code === 'flow_spend_limit');
});

test('a bigger size gives more rooms, each with its own name, file and lead', async () => {
  const plan = await propose({ locks: { size: 'medium' } });
  assert.equal(plan.departments.length, 4);
  const files = plan.departments.map(d => d.deliverable.file);
  assert.equal(new Set(files).size, 4, `file names are distinct: ${files}`);
  assert.deepEqual(files, ['engine.json', 'notes.md', 'engine-2.json', 'notes-2.md']);
  for (const d of plan.departments) assert.equal(d.positions.filter(p => p.lead).length, 1, d.name);
  assert.equal(new Set(plan.departments.map(d => d.name)).size, 4);
});

test('a room that makes a file has someone who can save one, and the plan says which person was given the tier', async () => {
  const plan = await propose({ locks: { size: 'medium' } });
  const direction = plan.departments[0];                                       // producer, director, facilitator, skeptic: nobody is a machinist
  assert.ok(direction.positions.some(p => effectiveTier(p) === 'builder'));
  assert.match(plan.warnings.join(' '), /nobody could save files or draw/);
  assert.deepEqual(planProblems(plan), []);
  for (const d of plan.departments) assert.ok(d.positions.some(p => effectiveTier(p) === 'builder'), d.name);
});

test('two rooms the model gave the same name are told apart', async () => {
  const ask = fakeAsk({ plan: (call) => { const a = fakePlanAnswer(call); a.departments.forEach(d => { d.name = 'Studio'; }); return a; } });
  const plan = await propose({ locks: { size: 'small' } }, ask);
  assert.deepEqual(plan.departments.map(d => d.name), ['Studio', 'Studio 2']);
});

test('a model that forgets rooms leaves them their defaults, and the plan says so', async () => {
  const ask = fakeAsk({ plan: (call) => { const a = fakePlanAnswer(call); a.departments = a.departments.slice(0, 1); return a; } });
  const plan = await propose({ locks: { size: 'small' } }, ask);
  assert.equal(plan.departments[1].name, 'Production Desk');
  assert.equal(plan.provenance['departments.d2.name'], 'default');
  assert.match(plan.departments[1].assignment, /Make the best/);
  assert.match(plan.warnings.join(' '), /named 1 of 2 rooms/);
});

test('a file name that does not fit the kind gets the kind\'s own', async () => {
  const ask = fakeAsk({ plan: (call) => { const a = fakePlanAnswer(call); a.departments[0].deliverable = 'engine'; a.departments[0].file = 'poster.png'; return a; } });
  const plan = await propose({}, ask);
  assert.equal(plan.departments[0].deliverable.file, 'engine.json');
});

test('the prompt is held to its limits and for secrets before anything is asked of the model', async () => {
  const ask = fakeAsk();
  await assert.rejects(() => propose({ prompt: '  ' }, ask), /Say what the company is for/);
  await assert.rejects(() => propose({ prompt: 'x'.repeat(PROMPT_MAX_CHARS + 1) }, ask), /limit is 2000/);
  await assert.rejects(() => propose({ prompt: 'Use my key AIzaSyA1234567890abcdefghijklmnopqrstuvw to make a studio' }, ask), (e) => e.code === 'secret_in_text');
  assert.equal(ask.calls.length, 0);
});

test('the owner\'s request goes through the company\'s own screen first; a block stops everything, with no model call', async () => {
  const classify = markerClassifier();
  const screen = new Screen({ classify });
  const ask = fakeAsk();
  await assert.rejects(() => proposeCompany({ ask, prompt: `Make a studio. ${FORBIDDEN}`, screen, mandate: {} }), (e) => e.code === 'prompt_blocked' && /nothing was built from it/.test(e.message));
  assert.equal(ask.calls.length, 0, 'the model was never asked');
  assert.equal(classify.calls[0].stage, 'drafting');
});

test('the words the model wrote are screened too, and a plan that does not pass is not kept', async () => {
  const screen = new Screen({ classify: markerClassifier() });
  const ask = fakeAsk({ plan: (call) => fakePlanAnswer(call, { purpose: `A studio. ${FORBIDDEN}` }) });
  await assert.rejects(() => proposeCompany({ ask, prompt: PROMPT, screen, mandate: {} }), (e) => e.code === 'prompt_blocked' && /proposal the model wrote/.test(e.message));
  const down = new Screen({ classify: async () => { throw new Error('screen down'); } });
  await assert.rejects(() => proposeCompany({ ask: fakeAsk(), prompt: PROMPT, screen: down, mandate: {} }), (e) => e.code === 'screen_unavailable');
});

test('a bad lock is refused with the field named: a stray key, a size, a style, an archetype, a fact', () => {
  assert.throws(() => checkLocks('nope'), /locks must be an object/);
  assert.throws(() => checkLocks({ safety: 'off' }), /does not take: safety/);
  assert.throws(() => checkLocks({ size: 'huge' }), /size must be one of/);
  assert.throws(() => checkLocks({ style: 'chaos' }), /style must be one of/);
  assert.throws(() => checkLocks({ departments: [] }), /1 to 12 rooms/);
  assert.throws(() => checkLocks({ departments: [{ name: 'R', positions: [{ title: 'Producer', archetype: 'wizard' }] }] }), /archetype must be one of/);
  assert.throws(() => checkLocks({ departments: [{ name: 'R', positions: [{ title: 'Producer', locked: { nope: 1 } }] }] }), /locked facts can be/);
  assert.throws(() => checkLocks({ departments: [{ name: 'R', positions: [{ locked: {} }] }] }), /needs a title/);
  assert.throws(() => checkLocks({ mission: '' }), /cannot be empty/);
  assert.throws(() => checkLocks({ tools: ['teleport'] }), /is not a tool/);
  assert.throws(() => checkLocks({ ceilings: { maxAgents: -1 } }), Error);
  assert.throws(() => checkLocks({ collaboration: { mail: 'yes' } }), Error);
  assert.deepEqual(checkLocks(undefined), {});
  const ok = checkLocks({ name: ' Snowline  Studio ', tools: ['google_search'], collaboration: { mail: false } });
  assert.equal(ok.name, 'Snowline Studio');
  assert.deepEqual(ok.tools, ['google_search']);
});

test('an unknown job title needs an archetype, a known one finds its own', async () => {
  await assert.rejects(() => propose({ locks: { departments: [{ name: 'R', positions: [{ title: 'Quokka wrangler', lead: true }] }] } }), /do not know which archetype "Quokka wrangler" is/);
  const plan = await propose({ locks: { departments: [{ name: 'R', positions: [{ title: 'Quokka wrangler', archetype: 'steward', lead: true }, { title: 'Sound designer' }] }] } });
  assert.deepEqual(plan.departments[0].positions.map(p => p.archetype), ['steward', 'craftsman']);
});

test('rooms the owner lists without positions get the layout\'s people for that slot', async () => {
  const plan = await propose({ locks: { size: 'small', departments: [{ name: 'Scripts' }, { name: 'Sound' }] } });
  assert.equal(plan.departments.length, 2);
  assert.equal(plan.departments[0].name, 'Scripts');
  assert.equal(plan.departments[0].positions.length, 6);
  assert.equal(plan.provenance['departments.d1.positions.d1p1.title'], 'ai', 'the titles were open, so the model named them');
  assert.equal(structureFor({ size: 'small', style: 'studio', locks: checkLocks({ departments: [{ name: 'Scripts' }] }) }).provenance['departments.d1.positions.d1p1.title'], 'default');
  assert.equal(plan.provenance['departments.d1'], 'user');
});

test('a re-fill writes only what is not the owner\'s, however many times it runs', async () => {
  const first = await propose({ locks: { name: 'Snowline Studio' } });
  const edited = applyEdits(first, { departments: [{ key: 'd1', name: 'The Print Room', positions: [{ key: 'd1p1', title: 'Chief of Posters' }] }] }).plan;
  const ask = fakeAsk({ plan: (call) => fakePlanAnswer(call, { name: 'Something Else', departments: [{ key: 'd1', name: 'Model Name', purpose: 'A new purpose.', deliverable: 'document', file: 'x.md', assignment: 'A new assignment for the room, of three sentences. It is the second. And the third.', titles: ['A', 'B', 'C', 'D', 'E', 'F'] }] }) });
  const again = await fillPlan({ ask, prompt: PROMPT, plan: edited });
  assert.equal(again.company.name, 'Snowline Studio');
  assert.equal(again.departments[0].name, 'The Print Room');
  assert.equal(again.departments[0].positions[0].title, 'Chief of Posters');
  assert.equal(again.departments[0].positions[1].title, 'B', 'the open titles took the new answer');
  assert.equal(again.departments[0].purpose, 'A new purpose.');
  assert.equal(again.departments[0].deliverable.kind, 'document');
  assert.equal(edited.departments[0].purpose, first.departments[0].purpose, 'the input plan was not changed');
  assert.match(planPrompt({ prompt: PROMPT, plan: edited }), /name "The Print Room" \(fixed by the owner: keep it\)/);
  assert.match(planPrompt({ prompt: PROMPT, plan: edited }), /Chief of Posters \(fixed\)/);
});

// ── editing ──────────────────────────────────────────────────────────────────

test('an edit makes the field the owner\'s, and says what changed', async () => {
  const plan = await propose({});
  const { plan: next, changed, invalidated } = applyEdits(plan, { company: { name: 'Snowline Studio' }, departments: [{ key: 'd1', name: 'Print Room', assignment: 'Four posters, no more than four.' }] });
  assert.equal(next.company.name, 'Snowline Studio');
  assert.equal(next.provenance['company.name'], 'user');
  assert.equal(next.provenance['departments.d1.name'], 'user');
  assert.deepEqual(changed.sort(), ['company.name', 'departments.d1.assignment', 'departments.d1.name']);
  assert.deepEqual(invalidated, [], 'wording does not send anyone back to be written');
  assert.match(next.company.mission, /^Snowline Studio: /, 'the mission follows the new name while the mission is not the owner\'s');
  assert.equal(plan.company.name, 'Parallax Works', 'the original is untouched');
});

test('an edit to a mission the owner wrote leaves it alone when the name changes', async () => {
  const plan = await propose({ locks: { mission: 'Our own words.' } });
  const { plan: next } = applyEdits(plan, { company: { name: 'Renamed' } });
  assert.equal(next.company.mission, 'Our own words.');
});

test('changing who a position is sends that person back to be cast; changing the room\'s words does not', async () => {
  const plan = await propose({});
  const r = applyEdits(plan, { departments: [{ key: 'd1', positions: [{ key: 'd1p2', title: 'Lead Worldbuilder' }, { key: 'd1p3', archetype: 'storyteller' }, { key: 'd1p4', lead: false, reviewer: true }] }] });
  assert.deepEqual(r.invalidated.sort(), ['d1p2', 'd1p3']);
  assert.equal(r.plan.departments[0].positions[1].title, 'Lead Worldbuilder');
  assert.equal(r.plan.provenance['departments.d1.positions.d1p2.title'], 'user');
});

test('naming a new lead moves the lead; no lead at all is refused', async () => {
  const plan = await propose({});
  const r = applyEdits(plan, { departments: [{ key: 'd1', positions: [{ key: 'd1p2', lead: true }] }] });
  assert.deepEqual(r.plan.departments[0].positions.filter(p => p.lead).map(p => p.key), ['d1p2']);
  assert.throws(() => applyEdits(plan, { departments: [{ key: 'd1', positions: [{ key: 'd1p1', lead: false }] }] }), /needs exactly one lead \(it has 0\)/);
});

test('people and rooms can be added and removed; keys are never reused', async () => {
  const plan = await propose({ locks: { size: 'small' } });
  const a = applyEdits(plan, { departments: [{ key: 'd1', positions: [{ key: 'd1p5', remove: true }, { title: 'Image director' }] }] });
  assert.equal(a.plan.departments[0].positions.length, 6);
  assert.equal(a.plan.departments[0].positions.at(-1).key, 'd1p7', 'the removed key d1p5 is not handed out again');
  assert.deepEqual(a.invalidated.sort(), ['d1p5', 'd1p7']);
  assert.ok(a.plan.retired.includes('d1p5'));
  const b = applyEdits(a.plan, { departments: [{ key: 'd2', remove: true }] });
  assert.equal(b.plan.departments.length, 1);
  assert.ok(b.invalidated.includes('d2p1'));
  assert.ok(!Object.keys(b.plan.provenance).some(k => k.startsWith('departments.d2')), 'the removed room leaves no provenance behind');
  const c = applyEdits(b.plan, { departments: [{ name: 'Sound', purpose: 'Sound.', positions: [{ title: 'Producer', lead: true }, { title: 'Sound designer' }] }] });
  assert.equal(c.plan.departments.at(-1).key, 'd3', 'the removed room\'s key d2 is not handed out again');
  assert.deepEqual(c.plan.departments.at(-1).positions.map(p => p.key), ['d3p1', 'd3p2']);
  assert.ok(c.plan.departments.at(-1).positions.some(p => effectiveTier(p) === 'builder') || !c.plan.departments.at(-1).deliverable, 'a room with no deliverable yet needs no builder');
});

test('a bad edit is refused whole: every problem is named and the plan stands', async () => {
  const plan = await propose({ locks: { size: 'small' } });
  const before = JSON.stringify(plan);
  assert.throws(() => applyEdits(plan, { departments: [{ key: 'd1', name: 'room 2 works' }] }), (e) => e.code === 'bad_plan' && /Two rooms are called "room 2 works"/i.test(e.message));
  assert.throws(() => applyEdits(plan, { departments: [{ key: 'd9', name: 'X' }] }), /no room with the key "d9"/);
  assert.throws(() => applyEdits(plan, { departments: [{ key: 'd1', positions: [{ key: 'd1p99', title: 'X' }] }] }), /no position with the key "d1p99"/);
  assert.throws(() => applyEdits(plan, { departments: [{ name: 'Empty', positions: [] }] }), /at least one position/);
  assert.throws(() => applyEdits(plan, { departments: [{ positions: [{ title: 'Producer' }] }] }), /needs a name/);
  assert.throws(() => applyEdits(plan, { safety: 'off' }), /takes "company" and "departments"/);
  assert.throws(() => applyEdits(plan, { company: { mandate: { nope: 1 } } }), Error);
  assert.throws(() => applyEdits(plan, { departments: [{ key: 'd1', positions: Array.from({ length: 3 }, () => ({ title: 'Writer' })) }] }), /room holds at most 8/);
  assert.throws(() => applyEdits(plan, { departments: [{ key: 'd1', positions: [{ title: 'Writer' }, { title: 'Writer' }, { title: 'Writer' }] }] }, { maxPeople: 12 }), /allows at most 12/);
  assert.equal(JSON.stringify(plan), before, 'the plan was not changed by any of them');
});

test('taking away the only person who could save files gives the tier to someone else, and says so', async () => {
  const plan = await propose({});
  const builder = plan.departments[0].positions.find(p => effectiveTier(p) === 'builder');
  const r = applyEdits(plan, { departments: [{ key: 'd1', positions: [{ key: builder.key, remove: true }] }] });
  assert.ok(r.plan.departments[0].positions.some(p => effectiveTier(p) === 'builder'));
  assert.match(r.plan.warnings.join(' '), /was given the builder tier/);
});

test('a person the owner fixed to a tier is not given a different one to make up a builder', () => {
  const room = { key: 'd1', name: 'R', deliverable: { kind: 'document', file: 'x.md', minChars: 600 }, positions: [
    { key: 'd1p1', title: 'Producer', archetype: 'steward', lead: true, locked: { tier: 'none' } },
    { key: 'd1p2', title: 'Writer', archetype: 'storyteller', locked: { tier: 'research' } },
  ] };
  const plan = { company: { name: 'X' }, departments: [room], provenance: {}, settings: { size: 'desk', style: 'studio' }, warnings: [] };
  const problems = planProblems(plan);
  assert.match(problems.join(' '), /nobody in it can save files or draw/);
});

test('a plan is complete only when every room has an assignment and a deliverable', () => {
  const plan = { company: { name: '' }, departments: [{ key: 'd1', name: 'R', positions: [{ key: 'd1p1', title: 'Producer', archetype: 'steward', lead: true, locked: {} }] }], provenance: {}, settings: {}, warnings: [] };
  assert.deepEqual(planProblems(plan), []);
  const p = planProblems(plan, { complete: true }).join(' ');
  assert.match(p, /R has no assignment yet/);
  assert.match(p, /R has not been told what to make/);
  assert.match(p, /company has no name/);
});

test('two people fixed to the same name are caught before anyone is written', async () => {
  const plan = await propose({});
  assert.throws(() => applyEdits(plan, { departments: [{ key: 'd1', positions: [{ key: 'd1p1', locked: { name: 'Mara Quill' } }, { key: 'd1p2', locked: { name: 'mara quill' } }] }] }), /fixed to the name "mara quill"/);
});

test('a position can be fixed to a person already in the roster; the same person cannot fill two', async () => {
  const id = 'a'.repeat(16);
  const plan = await propose({ locks: { departments: [{ name: 'R', positions: [{ title: 'Producer', lead: true, candidateId: id }, { title: 'Writer' }] }] } });
  assert.equal(plan.departments[0].positions[0].candidateId, id);
  assert.equal(positionsOf(plan)[0].candidateId, id);
  assert.throws(() => checkLocks({ departments: [{ name: 'R', positions: [{ title: 'Producer', candidateId: 'not an id' }] }] }), /candidateId is the id of someone in the roster/);
  const other = 'b'.repeat(16);
  const r = applyEdits(plan, { departments: [{ key: 'd1', positions: [{ key: 'd1p2', candidateId: other }] }] });
  assert.equal(r.plan.departments[0].positions[1].candidateId, other);
  assert.deepEqual(r.invalidated, ['d1p2']);
  assert.equal(r.plan.provenance['departments.d1.positions.d1p2.candidateId'], 'user');
  assert.throws(() => applyEdits(plan, { departments: [{ key: 'd1', positions: [{ key: 'd1p2', candidateId: id }] }] }), /same person from the roster is chosen for two positions/);
  const unpinned = applyEdits(r.plan, { departments: [{ key: 'd1', positions: [{ key: 'd1p2', candidateId: null }] }] });
  assert.equal(unpinned.plan.departments[0].positions[1].candidateId, undefined);
  assert.deepEqual(unpinned.invalidated, ['d1p2']);
});

test('positionsOf is what the casting step takes: keys, rooms, flags, the owner\'s facts', async () => {
  const plan = await propose({ locks: { departments: [{ name: 'R', positions: [{ title: 'Producer', lead: true, locked: { name: 'Mara Quill' } }, { title: 'Writer' }] }] } });
  const ps = positionsOf(plan);
  assert.equal(ps.length, 2);
  assert.deepEqual(ps[0], { key: 'd1p1', deptKey: 'd1', department: plan.departments[0].name, title: 'Producer', archetype: 'steward', lead: true, reviewer: false, locked: { name: 'Mara Quill' } });
  assert.equal(ps[1].locked && Object.keys(ps[1].locked).length, 0);
});

test('fitHeadcount keeps one lead a room however hard it trims', () => {
  const rooms = () => SIZES.medium.departments.map(d => ({ positions: d.positions.map(p => ({ ...p })) }));
  const r = rooms();
  fitHeadcount(r, 4);
  assert.equal(r.reduce((n, d) => n + d.positions.length, 0), 4);
  assert.ok(r.every(d => d.positions.some(p => p.lead)));
  assert.throws(() => fitHeadcount(rooms(), 3), /cannot staff 4 rooms/);
  const s = structureFor({ size: 'desk', style: 'studio', locks: {}, people: 3 });
  assert.equal(s.departments[0].positions.length, 3);
});

test('a room that grows to three people gets someone whose job is to object, and the plan says who', async () => {
  const plan = await propose({ locks: { departments: [{ name: 'Pair', positions: [{ title: 'Producer', lead: true }, { title: 'Writer' }] }] } });
  const r = applyEdits(plan, { departments: [{ key: 'd1', positions: [{ title: 'Skeptic', archetype: 'contrarian' }] }] });
  assert.equal(r.plan.departments[0].positions.filter(p => p.reviewer).length, 1);
  assert.equal(r.plan.departments[0].positions.find(p => p.reviewer).title, 'Skeptic', 'the contrarian is the natural reviewer');
  assert.match(r.plan.warnings.join(' '), /nobody's job was to object, so Skeptic was made the reviewer/);
  const r2 = applyEdits(plan, { departments: [{ key: 'd1', positions: [{ title: 'Editor', archetype: 'editor' }] }] });
  assert.equal(r2.plan.departments[0].positions.find(p => p.reviewer).title, 'Editor', 'an archetype that reviews will do');
  // an owner who names the reviewer is not overruled
  const r3 = applyEdits(plan, { departments: [{ key: 'd1', positions: [{ title: 'Skeptic', archetype: 'contrarian' }, { key: 'd1p2', reviewer: true }] }] });
  assert.deepEqual(r3.plan.departments[0].positions.filter(p => p.reviewer).map(p => p.title), ['Writer']);
});
