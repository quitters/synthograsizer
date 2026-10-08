import test from 'node:test';
import assert from 'node:assert/strict';
import { writePerson, writeSeed, factsBlock, seedPrompt, sheetPrompt, MAX_SHEET_ATTEMPTS } from './writer.js';
import { adviceFrom, hardFindings, admissionScreen, REVIEW_SCHEMA } from './review.js';
import { takenFrom } from './lint.js';
import { MODELS } from '../../config/models.js';
import { DEFAULT_OPERATOR_MANDATE, resolveMandate } from '../mandate.js';
import { fakeAsk, fakeSheet, fakeSeed, castFor, CLEAN_REVIEW } from './flowKit.js';

/**
 * Writing a person: a seed, then a sheet, checked, reviewed and screened. The model is a stand-in; what is held to account is the pipeline: what the
 * writer is told, what is sent back to it, what stops a sheet from being hired.
 */

const YEAR = 2026;
const company = { name: 'Parallax Works', purpose: 'A studio that designs image-prompt engines.' };
const department = { name: 'Studio Desk', purpose: 'One small team that does the whole job.' };
const casting = castFor(1);
const mandate = resolveMandate(DEFAULT_OPERATOR_MANDATE, {});
const write = (over = {}) => writePerson({ ask: over.ask, casting, id: 'flow_x1', company, department, year: YEAR, ...over });
const passing = { check: async () => ({ verdict: 'pass', findings: [] }) };

test('a person is written in order: a seed on the fast model, a sheet on the smart one, a blind review, and the screen; the result is hired material', async () => {
  const ask = fakeAsk({}, { casting });
  const r = await write({ ask, screen: passing, mandate });
  assert.equal(r.status, 'ready');
  assert.deepEqual(ask.calls.map(c => c.step), ['seed', 'sheet', 'blind_review']);
  assert.equal(ask.calls[0].model, MODELS.FAST);
  assert.equal(ask.calls[1].model, MODELS.SMART);
  assert.equal(r.profile.name, r.seed.name);
  assert.equal(r.profile.x_flow.writtenBy, MODELS.SMART);
  assert.deepEqual(r.checks, { attempts: 1, problems: [], notes: r.checks.notes, review: { advice: [], hard: [], particular: 4, mostGeneric: 'the flask', mostSpecific: 'the spare in every drawer' }, screen: { ok: true, verdict: 'pass', findings: [] } });
  assert.match(r.bio, new RegExp(`^${r.seed.name}, the ${casting.title.toLowerCase()}\\.`));
});

test('the writer is told the facts that were drawn, the team already cast, and what has been learned about this kind of person', async () => {
  const ask = fakeAsk({}, { casting });
  const others = [writeProfile(0), writeProfile(2)];
  const lessons = [{ text: 'He is always given a camera shop.' }];
  await write({ ask, others, lessons });
  const seed = ask.calls[0].prompt;
  const sheet = ask.calls[1].prompt;
  for (const p of [seed, sheet]) {
    assert.match(p, new RegExp(`Born ${casting.bornYear} in ${casting.birthplace.city}`));
    assert.match(p, /Raised by /);
    assert.match(p, /A setback: /);
    assert.match(p, /He is always given a camera shop\./);
    assert.match(p, new RegExp(others[0].name));
    assert.match(p, /Parallax Works\. A studio that designs image-prompt engines\./);
    assert.match(p, /Studio Desk\. One small team/);
  }
  assert.match(seed, /do not repeat their names/);
  assert.match(seed, new RegExp(`Names in use: ${others.map(o => o.name.toLowerCase()).join(', ')}\\.`));
  assert.match(sheet, /Habits already begin with these verbs/);
  assert.match(sheet, /Signature phrases already taken: "Good\. That one stays"/);
  assert.match(sheet, /Write only this person\./);
  assert.match(sheet, new RegExp(`THIS YEAR: ${YEAR}\\.`));
  assert.match(sheet, /The temperament to show in what they DO off the clock:/);
  assert.match(factsBlock(casting), new RegExp(`Irrationally fond of: ${casting.fondness}`));
  assert.match(sheet, /Third person throughout, never "I"\./);
  assert.match(sheet, /Do not name a food as their identity\./);
});

function writeProfile(i) {
  const c = castFor(i);
  const s = fakeSeed(c, i);
  return { id: `p${i}`, name: s.name, anchors: { agent_name: s.name, role: c.title.toLowerCase(), born: `Born in ${c.birthplace.city}.`, ...Object.fromEntries(Object.entries(fakeSheet(c, s, i)).map(([k, v]) => [k, Array.isArray(v) ? (k === 'opinions' ? v.map(o => o.claim).join('; ') : v.join('; ')) : (typeof v === 'string' ? v : '')])) } };
}

test('a sheet with a problem is sent back with the problem in words, up to twice more; the third try can pass', async () => {
  const ask = fakeAsk({
    sheet: (call, n) => (n < 3
      ? fakeSheet(casting, fakeSeed(casting, 1), 1, { career: `Started in ${casting.bornYear - 8} and never looked back, through every kind of weather and a great many offices.`, blind_spot: 'Trusts the language model over people.' })
      : fakeSheet(casting, fakeSeed(casting, 1), 1)),
  }, { casting });
  const r = await write({ ask, review: false });
  assert.equal(r.status, 'ready');
  assert.equal(r.checks.attempts, 3);
  const second = ask.calls.filter(c => c.step === 'sheet')[1].prompt;
  assert.match(second, /Your previous attempt had these problems; fix them: .*a year before the birth year/);
  assert.match(second, /mentions AI or a program/);
  assert.doesNotMatch(ask.calls.filter(c => c.step === 'sheet')[0].prompt, /previous attempt/);
  assert.equal(ask.calls.filter(c => c.step === 'seed').length, 1, 'the seed is not rewritten');
});

test('a sheet that is still wrong after three tries is a draft, with the problems kept; it is not reviewed or screened', async () => {
  const ask = fakeAsk({ sheet: () => fakeSheet(casting, fakeSeed(casting, 1), 1, { blind_spot: 'Trusts the language model over people.' }) }, { casting });
  let screened = 0;
  const r = await write({ ask, screen: { check: async () => { screened++; return { verdict: 'pass', findings: [] }; } }, mandate });
  assert.equal(r.status, 'draft');
  assert.equal(r.checks.attempts, MAX_SHEET_ATTEMPTS);
  assert.ok(r.checks.problems.some(p => /mentions AI or a program/.test(p)));
  assert.equal(ask.calls.filter(c => c.step === 'blind_review').length, 0);
  assert.equal(screened, 0);
  assert.equal(r.checks.screen, null);
  assert.ok(r.profile && r.bio, 'it is kept for a person to edit');
});

test('the blind reviewer: stereotypes are advice shown beside the sheet; a real person named, or a famous name, sends it back once', async () => {
  const advice = { ...CLEAN_REVIEW, stereotypes: [{ detail: 'the spice jar on the shelf', why: 'a food as identity' }], inconsistencies: ['moved at 6 but remembers a school there at 9'], particular_vs_type: 2, most_generic_detail: 'the hobby that goes with the job' };
  const r = await write({ ask: fakeAsk({ blind_review: () => advice }, { casting }) });
  assert.equal(r.status, 'ready', 'advice does not stop a hire');
  assert.deepEqual(r.checks.review.advice.map(a => a.kind), ['stereotype', 'inconsistency', 'generic']);
  assert.match(r.checks.review.advice[0].text, /^"the spice jar on the shelf": a food as identity$/);

  // a real person named: back to the writer with the finding, and a second review
  const reviews = [{ ...CLEAN_REVIEW, real_people_named: [{ name: 'A Famous Person', role_in_sheet: 'mentor' }] }, CLEAN_REVIEW];
  const ask = fakeAsk({ blind_review: (c, n) => reviews[n - 1] }, { casting });
  const second = await write({ ask });
  assert.equal(second.status, 'ready');
  assert.equal(ask.calls.filter(c => c.step === 'sheet').length, 2);
  assert.match(ask.calls.filter(c => c.step === 'sheet')[1].prompt, /the sheet names real people \(A Famous Person\); invent them/);

  // still wrong the second time: a draft
  const stubborn = await write({ ask: fakeAsk({ blind_review: () => ({ ...CLEAN_REVIEW, name_is_famous_person: true }) }, { casting }) });
  assert.equal(stubborn.status, 'draft');
  assert.deepEqual(stubborn.checks.review.hard, ['the person\'s name is a famous real person\'s; choose a different name']);
});

test('the company\'s own screen has the last word: a sheet that does not pass, or that it could not read, stays a draft', async () => {
  const seen = [];
  const screen = { check: async (req) => { seen.push(req); return { verdict: 'block', findings: [{ rule: 'real_person', severity: 'block', why: 'x' }] }; } };
  const blocked = await write({ ask: fakeAsk({}, { casting }), screen, mandate });
  assert.equal(blocked.status, 'draft');
  assert.deepEqual([blocked.checks.screen.ok, blocked.checks.screen.verdict], [false, 'block']);
  assert.equal(seen[0].stage, 'drafting');
  assert.equal(seen[0].mandate, mandate);
  assert.match(seen[0].parts[0].text, /^.+, the /);
  assert.equal(seen[0].parts[0].label, 'a character sheet for an invented person');
  const unavailable = await write({ ask: fakeAsk({}, { casting }), screen: { check: async () => ({ verdict: 'unavailable', findings: [], error: 'timed out' }) }, mandate });
  assert.deepEqual([unavailable.status, unavailable.checks.screen.error], ['draft', 'timed out']);
  // with no screen given (a test of the writing alone) nothing is screened
  assert.equal((await write({ ask: fakeAsk({}, { casting }) })).checks.screen, null);
});

test('a seed the owner chose or edited is used as given and not rewritten', async () => {
  const given = { name: 'Rima Haddad-Boudreau', seed: 'Stage manager for fifteen years.', unique: 'knows how to get six strong personalities to finish by a fixed hour', skills: ['scheduling', 'cues', 'calm'] };
  const ask = fakeAsk({ sheet: () => fakeSheet(casting, given, 1) }, { casting });
  const r = await write({ ask, seed: given });
  assert.deepEqual(ask.calls.map(c => c.step), ['sheet', 'blind_review']);
  assert.equal(r.profile.name, 'Rima Haddad-Boudreau');
  assert.match(ask.calls[0].prompt, /Name: Rima Haddad-Boudreau\./);
  assert.match(ask.calls[0].prompt, /Stage manager for fifteen years\./);
  assert.match(ask.calls[0].prompt, /The one thing only they know: knows how to get six strong personalities to finish by a fixed hour\./);
  assert.equal(r.profile.x_flow.unique, given.unique);
});

test('the models can be chosen for the seed and the sheet', async () => {
  const ask = fakeAsk({}, { casting });
  await write({ ask, models: { seed: MODELS.LITE, sheet: MODELS.FAST } });
  assert.equal(ask.calls[0].model, MODELS.LITE);
  assert.equal(ask.calls[1].model, MODELS.FAST);
  assert.equal(seedPrompt({ casting, company, department, taken: takenFrom([]), team: [], lessons: [] }).includes('(nobody yet)'), true);
  assert.equal((await writeSeed({ ask: fakeAsk({ seed: () => ({ name: '  Ada   Lovell ', seed: 's', unique: 'u', skills: ['a', 'b', 'c'] }) }, { casting }), casting, company, department, taken: takenFrom([]), team: [], lessons: [] })).name, 'Ada Lovell');
  assert.match(sheetPrompt({ casting, seed: fakeSeed(casting, 1), company, department, taken: takenFrom([]), team: [], lessons: [], year: YEAR }), new RegExp(casting.title));
});

test('review helpers: advice reads as quoted details; only the findings that are not matters of judgement are hard', () => {
  assert.deepEqual(adviceFrom(CLEAN_REVIEW), []);
  assert.deepEqual(adviceFrom({ ...CLEAN_REVIEW, harmful_pushes: ['pushes toward a cause'] }), [{ kind: 'push', text: 'pushes toward a cause' }]);
  assert.deepEqual(hardFindings(CLEAN_REVIEW), []);
  assert.deepEqual(hardFindings({ ...CLEAN_REVIEW, recognizable_real_person: true }), ['the sheet could identify a real person']);
  assert.ok(REVIEW_SCHEMA.required.includes('name_is_famous_person'));
});

test('the screen helper reports a pass as ok and anything else as not', async () => {
  const mk = (verdict, extra = {}) => ({ check: async () => ({ verdict, findings: [], ...extra }) });
  assert.deepEqual(await admissionScreen({ screen: mk('pass'), mandate, bio: 'x' }), { ok: true, verdict: 'pass', findings: [] });
  assert.equal((await admissionScreen({ screen: mk('block'), mandate, bio: 'x' })).ok, false);
  assert.equal((await admissionScreen({ screen: mk('unavailable', { error: 'down' }), mandate, bio: 'x' })).error, 'down');
});

test('names already in the roster are as taken as a teammate\'s: the seed is told, and a name that clashes is chosen again, not just rewritten', async () => {
  const names = ['Mara Quill', 'Odel Brandt'];
  let seeds = 0;
  const ask = fakeAsk({
    seed: () => { seeds += 1; return { ...fakeSeed(casting, 3), name: seeds === 1 ? 'Odel Brandt' : 'Teodor Ruiz' }; },
    sheet: (call) => fakeSheet(casting, { ...fakeSeed(casting, 3), name: /Name: Odel Brandt/.test(call.prompt) ? 'Odel Brandt' : 'Teodor Ruiz' }, 3),
  }, { casting });
  const r = await write({ ask, avoidNames: names, review: false });
  assert.equal(seeds, 2, 'the seed was written again');
  assert.equal(r.profile.name, 'Teodor Ruiz');
  assert.equal(r.status, 'ready');
  assert.match(ask.calls[0].prompt, /Names in use: mara quill, odel brandt\./);
  assert.match(ask.calls.filter(c => c.step === 'seed')[1].prompt, /Names in use: mara quill, odel brandt, odel brandt\./, 'the clashing name is added for the second try');
});

test('an owner\'s seed is never rewritten, even when its name clashes: the sheet stays a draft with the reason', async () => {
  const given = { ...fakeSeed(casting, 2), name: 'Mara Quill' };
  const ask = fakeAsk({}, { casting });
  const r = await write({ ask, seed: given, avoidNames: ['Mara Quill'], review: false });
  assert.equal(r.status, 'draft');
  assert.ok(r.checks.problems.some(p => /name is already a teammate/.test(p)));
  assert.equal(ask.calls.filter(c => c.step === 'seed').length, 0);
});
