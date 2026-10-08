import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief, cutAtSentence, BRIEF_BUDGET, MIN_ASSIGNMENT_CHARS } from './brief.js';
import { DELIVERABLES, DELIVERABLE_KINDS, engineSchema, resolveDeliverable, doneWhenFor, handoffsFor } from './deliverables.js';
import { validateSchema } from '../../services/doneWhen.js';
import { GOAL_MAX_CHARS } from '../roomPolicy.js';

/**
 * The brief a room starts with: assembled from parts that must be there, with the model's assignment given what room is left. The pilot's hand-cut brief
 * lost the line that said what shape the file had to be and the server refused the file three times; here that line cannot be cut.
 */

const company = { name: 'Parallax Works' };
const department = { name: 'Archive Desk' };
const team = [
  { name: 'Rima Haddad-Boudreau', title: 'Producer', isLead: true },
  { name: 'Tavita Fa\'asavalu', title: 'Worldbuilder', unique: 'knows how to make twelve good things where most people stop at four' },
  { name: 'Hyun-woo Baek', title: 'Image director', unique: 'knows how image models misread prompts' },
  { name: 'Marisol Quispe Huamán', title: 'Researcher', canSearch: true },
  { name: 'Kasia Wójcik-Lindqvist', title: 'Skeptic', isReviewer: true },
  { name: 'Zayd Siddiqui', title: 'Template engineer', canSave: true },
];
const engine = resolveDeliverable({ kind: 'engine' });
const criteria = doneWhenFor(engine, { reviewers: ['Kasia Wójcik-Lindqvist'] });
const assignment = 'Design one new image-prompt engine: a small invented archive whose every random draw is a coherent, striking, different picture. It must not resemble the family already made. ';

const valueSet = (n, prefix) => Array.from({ length: n }, (_, i) => ({ text: `${prefix} carved ${['oak', 'pine', 'elm', 'ash', 'fir', 'yew', 'box', 'ivy', 'bay', 'fig', 'gum', 'sal', 'teak', 'alder', 'birch', 'cedar'][i]} plate`, weight: (i % 3) + 1 }));
const goodEngine = (variables = 6, values = 12) => ({
  name: 'Alpine Registry', emoji: '🏔️', promptTemplate: 'A survey plate of {{object}} held in {{place}}, drawn in {{style}}.',
  variables: Array.from({ length: variables }, (_, v) => ({ name: `var_${v}`, feature_name: `Variable ${v}`, values: valueSet(values, `v${v}`) })),
});

test('the engine schema is what a model cannot check by eye: counts, uniqueness, braces, weights', () => {
  const schema = engineSchema({ variables: 6, values: 12 });
  assert.deepEqual(validateSchema(goodEngine(), schema), []);
  assert.match(validateSchema(goodEngine(5), schema)[0], /\$\.variables: 5 items, needs exactly 6/);
  assert.match(validateSchema(goodEngine(6, 11), schema)[0], /11 items, needs exactly 12/);
  const dup = goodEngine();
  dup.variables[0].values[1] = { ...dup.variables[0].values[0] };
  assert.ok(validateSchema(dup, schema).some(e => /duplicate item/.test(e)));
  const brace = goodEngine();
  brace.variables[2].values[0].text = 'a {{nested}} placeholder';
  assert.ok(validateSchema(brace, schema).some(e => /does not match/.test(e)));
  const weight = goodEngine();
  weight.variables[1].values[3].weight = 4;
  assert.ok(validateSchema(weight, schema).some(e => /must be one of 1, 2, 3/.test(e)));
  const noSentence = goodEngine();
  noSentence.promptTemplate = 'A plain sentence of well over forty characters with nothing to fill in at all.';
  assert.ok(validateSchema(noSentence, schema).some(e => /promptTemplate: does not match/.test(e)));
  assert.deepEqual(validateSchema(goodEngine(4, 8), engineSchema({ variables: 4, values: 8 })), [], 'the counts are parameters');
});

test('a deliverable is resolved to sane parameters and a safe file name', () => {
  assert.deepEqual(resolveDeliverable({ kind: 'engine' }), { kind: 'engine', file: 'engine.json', variables: 6, values: 12 });
  assert.deepEqual(resolveDeliverable({ kind: 'engine', variables: 99, values: 1, file: 'alpine.json' }), { kind: 'engine', file: 'alpine.json', variables: 10, values: 4 });
  assert.equal(resolveDeliverable({ kind: 'engine', file: '../etc/passwd' }).file, 'engine.json', 'a path is not a file name');
  assert.deepEqual(resolveDeliverable({ kind: 'document', minChars: 5 }), { kind: 'document', file: 'document.md', minChars: 100 });
  assert.throws(() => resolveDeliverable({ kind: 'sculpture' }), /must be one of engine, document/);
  assert.deepEqual([...DELIVERABLE_KINDS], ['engine', 'document']);
});

test('"done when" for an engine has four checks the pilot\'s rooms skipped or could not write: the server\'s check, the render after the last save, the reviewer after the last save, the proposal', () => {
  assert.deepEqual(criteria.map(c => c.type), ['json', 'tool_used', 'said_after', 'proposal']);
  assert.deepEqual(criteria[1], { type: 'tool_used', tool: 'render_artifact', artifact: 'engine.json', after: 'artifact:engine.json', label: criteria[1].label });
  assert.equal(criteria[2].agent, 'Kasia Wójcik-Lindqvist');
  assert.equal(criteria[3].artifact, 'engine.json');
  const doc = doneWhenFor(resolveDeliverable({ kind: 'document' }), { reviewers: [] });
  assert.deepEqual(doc.map(c => c.type), ['artifact', 'proposal'], 'a document is not rendered');
  assert.deepEqual(handoffsFor(engine, { reviewers: ['Kasia Wójcik-Lindqvist'] }), [{ next: 'Kasia Wójcik-Lindqvist', artifact: 'engine.json' }]);
  assert.deepEqual(handoffsFor(engine, { reviewers: [] }), []);
  assert.ok(DELIVERABLES.engine.needsBuilder && DELIVERABLES.engine.looks && !DELIVERABLES.document.looks);
});

test('the brief fits the limit, says what shape the file is, who does what, how to work, what done is and the rules, and keeps all of it', () => {
  const b = buildBrief({ company, department, assignment, deliverable: engine, team, criteria });
  assert.ok(b.length <= GOAL_MAX_CHARS, `${b.length} characters`);
  assert.equal(b.length, b.goal.length);
  assert.match(b.goal, /^Parallax Works, Archive Desk\. Design one new image-prompt engine/);
  assert.match(b.goal, /WHAT AN ENGINE IS\. A template sentence with \{\{placeholders\}\}, plus exactly 6 variables of exactly 12 weighted values/);
  assert.match(b.goal, /\{"name": "\.\.\.", "emoji": "one emoji", "promptTemplate": "one sentence with \{\{variable\}\} placeholders", "variables": \[/, 'the line the pilot cut');
  assert.match(b.goal, /WHO DOES WHAT\. Rima leads the room and alone closes the session\./);
  assert.match(b.goal, /Zayd alone can save files and draw \(render_artifact\)\./);
  assert.match(b.goal, /Marisol can search the web \(take the method, not the facts\)\./);
  assert.match(b.goal, /Kasia reviews every saved version and speaks right after each save\./);
  assert.match(b.goal, /Tavita worldbuilder; knows how to make twelve good things/);
  assert.match(b.goal, /HOW TO WORK\. Messages under 120 words.*\(1\) Zayd saves a first version early and draws from it before anyone discusses anything\./);
  assert.match(b.goal, /Kasia says what is wrong, by name\./);
  assert.match(b.goal, /Rima closes with \[CONSENSUS REACHED\] only after every check below passes/);
  assert.match(b.goal, /WHEN IT IS DONE\. engine\.json is an engine: exactly 6 variables with exactly 12 weighted values each/);
  assert.match(b.goal, /engine\.json has been rendered, and the pictures looked at, since it was last saved\./);
  assert.match(b.goal, /Kasia Wójcik-Lindqvist has reviewed engine\.json since it was last saved\./);
  assert.match(b.goal, /A person decides what leaves the room/);
  assert.match(b.goal, /RULES\. No real people as a subject/);
  assert.deepEqual(Object.keys(b.parts), ['assignment', 'what', 'who', 'how', 'done', 'rules']);
  assert.equal(b.trimmed, false);
});

test('the assignment gives way, at a sentence, and nothing else does; a very long one cannot push the brief past the limit', () => {
  const long = Array.from({ length: 400 }, (_, i) => `Sentence number ${i} says something specific about the work to be done.`).join(' ');
  const b = buildBrief({ company, department, assignment: long, deliverable: engine, team, criteria });
  assert.ok(b.length <= BRIEF_BUDGET, `${b.length} > ${BRIEF_BUDGET}`);
  assert.equal(b.trimmed, true);
  assert.match(b.parts.assignment, /\.$/, 'cut at a sentence end');
  for (const must of ['WHAT AN ENGINE IS', 'WHO DOES WHAT', 'HOW TO WORK', 'WHEN IT IS DONE', 'RULES.', '"promptTemplate"', 'CONSENSUS REACHED']) assert.ok(b.goal.includes(must), must);
  assert.ok(b.parts.assignment.length >= MIN_ASSIGNMENT_CHARS);
  assert.equal(buildBrief({ company, department, assignment: '', deliverable: engine, team, criteria }).trimmed, false, 'no assignment is not a trimmed one');
});

test('over every team size and many checks the brief fits or says in words that it cannot', () => {
  const names = ['Ann One', 'Ben Two', 'Cy Three', 'Dee Four', 'Eli Five', 'Fay Six', 'Gus Seven', 'Hal Eight'];
  for (let n = 1; n <= 8; n++) {
    const t = names.slice(0, n).map((name, i) => ({ name, title: `Role ${i}`, isLead: i === 0, isReviewer: i === n - 1 && n > 1, canSave: i === 1, canSearch: i === 2, unique: 'knows how to do something rather specific with a lot of detail attached to it' }));
    const reviewers = t.filter(p => p.isReviewer).map(p => p.name);
    const b = buildBrief({ company, department, assignment, deliverable: engine, team: t, criteria: doneWhenFor(engine, { reviewers }) });
    assert.ok(b.length <= BRIEF_BUDGET, `${n} people: ${b.length}`);
    assert.ok(b.goal.includes('"promptTemplate"'));
  }
  const many = Array.from({ length: 40 }, (_, i) => ({ type: 'regex', pattern: `check${i}`, flags: '', label: `a check that has a rather long description number ${i} and goes on` }));
  assert.throws(() => buildBrief({ company, department, assignment, deliverable: engine, team, criteria: many }), /cannot be written to fit .* characters.*Use fewer checks or a smaller team/);
});

test('a team that is too wordy is described tersely before the assignment is cut', () => {
  const wordy = team.map(p => ({ ...p, unique: `${p.unique || 'knows how to do the thing'} ${'and many more things besides, listed at some length. '.repeat(25)}` }));
  const longAssignment = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} says something specific about the work to be done.`).join(' ');
  const normal = buildBrief({ company, department, assignment: longAssignment, deliverable: engine, team: wordy.map(p => ({ ...p, unique: 'knows how to x' })), criteria });
  const squeezed = buildBrief({ company, department, assignment: longAssignment, deliverable: engine, team: wordy, criteria });
  assert.ok(squeezed.length <= BRIEF_BUDGET);
  assert.ok(squeezed.parts.assignment.length >= MIN_ASSIGNMENT_CHARS, 'the room is still asked to do something');
  assert.ok(!squeezed.parts.who.includes('and many more things'), 'the long descriptions were dropped, not the people');
  assert.match(squeezed.parts.who, /Tavita worldbuilder\./);
  assert.ok(normal.parts.who.includes('knows how to x'));
});

test('a document needs no render and no shape line, and the brief says what the piece is', () => {
  const doc = resolveDeliverable({ kind: 'document', file: 'handbook.md', minChars: 900 });
  const b = buildBrief({ company, department, assignment: 'Write the handbook.', deliverable: doc, team: team.slice(0, 3), criteria: doneWhenFor(doc, { reviewers: [] }) });
  assert.match(b.goal, /WHAT THE PIECE IS\. One Markdown file, handbook\.md, of at least 900 characters/);
  assert.match(b.goal, /handbook\.md exists and is at least 900 characters/);
  assert.doesNotMatch(b.goal, /render_artifact\)\.? ?$|draws from it before anyone/);
});

test('cutting at a sentence', () => {
  assert.equal(cutAtSentence('One. Two. Three.', 10), 'One. Two.');
  assert.equal(cutAtSentence('One.  Two.', 100), 'One. Two.');
  assert.equal(cutAtSentence('A single sentence that runs on and on without any full stop whatsoever', 30).endsWith('…'), true);
  assert.ok(cutAtSentence('A single sentence that runs on and on without any full stop whatsoever', 30).length <= 30);
  assert.equal(cutAtSentence('', 10), '');
});
