import test from 'node:test';
import assert from 'node:assert/strict';
import { lintSheet, takenFrom, sheetWords, contextWords, EMPTY_TAKEN } from './lint.js';
import { assembleProfile, BIO_TEMPLATE, bornLine, chooseKnobs } from './sheet.js';
import { fakeSheet, fakeSeed, castFor } from './flowKit.js';

/**
 * The code checks on a sheet: each one that sent a pilot sheet back to a person is a check here, and a clean sheet passes them all.
 */

const YEAR = 2026;
const casting = castFor(2);

/** A profile made from the stand-in writer, with the sheet's fields (or the seed's) changed by the test. */
function make({ i = 2, sheet = {}, seed = {}, cast = casting } = {}) {
  const s = fakeSeed(cast, i, seed);
  return assembleProfile({ id: `flow_${i}`, casting: cast, seed: s, sheet: fakeSheet(cast, s, i, sheet) });
}
const lint = (profile, extra = {}) => lintSheet({ profile, casting, year: YEAR, ...extra });
const has = (res, re) => res.problems.some(p => re.test(p));

test('a clean sheet passes every check', () => {
  const res = lint(make());
  assert.deepEqual(res.problems, []);
  assert.ok(res.bio.length >= 2500 && res.bio.length <= 6500);
  assert.match(res.bio, /^[^,.]+, the [a-z ]+\./);
});

test('the profile is the Composer\'s v5 shape, with the facts written by code and the person\'s extras kept apart', () => {
  const p = make();
  assert.equal(p.bioTemplate, BIO_TEMPLATE);
  assert.equal(p.category, 'roleplay');
  assert.deepEqual(p.variables.map(v => [v.name, v.values.length, typeof v.valueIdx]), [['tempo', 4, 'number'], ['candor', 4, 'number'], ['push', 4, 'number']]);
  assert.equal(p.anchors.born, bornLine(casting));
  assert.match(p.anchors.born, new RegExp(`^Born in ${casting.birthplace.city}, ${casting.birthplace.country}, in ${casting.bornYear}\\.`));
  assert.equal(p.anchors.role, casting.title.toLowerCase());
  assert.equal(p.x_flow.archetype, casting.archetype);
  assert.deepEqual(p.x_flow.run, { tier: casting.tier, model: casting.model, thinkingLevel: casting.thinking });
  assert.ok(!/HOW THE TEAM WORKS/.test(p.bioTemplate), 'that paragraph is the company\'s house rules now');
  assert.match(p.bioTemplate, /used rarely \(once a session at most, and never as the last words of a message\)/);
  assert.match(p.bioTemplate, /Off the clock: \{\{off_clock\}\}/);
  const knobs = chooseKnobs({ dissent: 'high' }, 'x');
  assert.ok(knobs.candor >= 2 && knobs.push >= 2, 'a dissenter is blunt and insistent');
  const gentle = chooseKnobs({ dissent: 'low' }, 'x');
  assert.ok(gentle.candor <= 1);
  assert.deepEqual(chooseKnobs({ dissent: 'low' }, 'x'), gentle, 'the same person gets the same settings');
});

test('a template with nothing to fill a placeholder, or an empty value, is a problem (rendering would quietly drop it)', () => {
  const p = make();
  delete p.anchors.off_clock;
  assert.ok(has(lint(p), /nothing fills \{\{off_clock\}\} in the template/));
  const q = make();
  q.anchors.signature = '  ';
  assert.ok(has(lint(q), /nothing fills \{\{signature\}\}/));
});

test('length, the role line and what must never be in a sheet', () => {
  assert.ok(has(lint(make({ sheet: { upbringing: 'Short.', career: 'Short.', off_clock: 'Short.', working_style: 'Short.', voice: 'Short.' } })), /the bio is \d+ characters/));
  assert.ok(has(lint(make({ sheet: { upbringing: 'x'.repeat(5000) } })), /the bio is \d+ characters/));
  assert.ok(has(lint(make({ seed: { name: 'J. Smith' } })), /does not begin "Name, the role\."/));
  assert.ok(has(lint(make({ sheet: { blind_spot: 'Trusts the language model over people.' } })), /mentions AI or a program/));
  assert.ok(has(lint(make({ sheet: { working_style: 'Reachable at https://example.com or ada@example.org.' } })), /URL, an email address or a phone number/));
  assert.ok(has(lint(make({ sheet: { working_style: 'Keeps the key AIzaSyA1234567890abcdefghijklmnopqrstuvw taped to the desk.' } })), /holds a secret/));
});

test('years: before the birth year or after this year', () => {
  const born = casting.bornYear;
  assert.ok(has(lint(make({ sheet: { career: `Started in ${born - 10} and went on from there for many years, through changes of every kind and several moves besides.` } })), new RegExp(`before the birth year ${born}`)));
  assert.ok(has(lint(make({ sheet: { career: `Will retire in ${YEAR + 3} and has said so since long ago, in meetings and at lunch and on the stairs.` } })), /a year after 2026/));
  assert.ok(lint(make()).notes.some(n => /^years named: /.test(n)));
});

test('a first-person slip in a third-person field, and a personality label anywhere', () => {
  assert.ok(has(lint(make({ sheet: { upbringing: 'I grew up near the harbour, where the ledger was kept by my mother and the lantern was lit at dusk.' } })), /upbringing slips into the first person \("I"\)/));
  assert.ok(has(lint(make({ sheet: { career: 'Went to sea and then, as they put it, found myself in a quarry office for many years of steady record keeping.' } })), /career slips into the first person \("myself"\)/));
  assert.ok(has(lint(make({ sheet: { off_clock: 'An introvert on every free Saturday, they head for the quarry with a flask and no plan whatever.' } })), /off_clock names a personality type or label \("introvert"\)/));
  assert.ok(has(lint(make({ sheet: { habits: ['keeps an INTJ notebook', 'sorts the ledger', 'counts the bellows'] } })), /habits names a personality type or label \("INTJ"\)/));
  // "mine" is a place people work, not a pronoun
  assert.deepEqual(lint(make({ sheet: { upbringing: 'Grew up near a mine where a carer worked as an electrician, and learned to read a quarry by its weight and the foundry by its sound.' } })).problems.filter(p => /first person/.test(p)), []);
  assert.ok(lint(make({ sheet: { off_clock: 'Heads for the quarry on a Saturday after the long week at the office, and stays until the light goes, then walks home by the canal.' } })).notes.some(n => /off-the-clock section mentions work/.test(n)));
});

test('a family in a trade the draw did not give is a problem; one the draw gave is fine', () => {
  const east = { ...casting, birthplace: { city: 'Busan', country: 'South Korea', region: 'East Asia' }, carers: ['a bus driver', 'a nurse'] };
  const takeaway = lintSheet({ profile: make({ cast: east, sheet: { upbringing: 'Grew up above the family restaurant in Busan, where the ledger was balanced each night and the lantern left on for latecomers to the quarry road.' } }), casting: east, year: YEAR });
  assert.ok(has(takeaway, /upbringing gives the family a trade \("restaurant"\) that the facts did not/));
  const garment = lintSheet({ profile: make({ cast: east, sheet: { upbringing: 'Grew up in a household of tailors in Busan, where every ledger was balanced at night and the lantern was left on beside the bellows until late.' } }), casting: east, year: YEAR });
  assert.ok(has(garment, /\("tailor"\)/), 'the trades the pilot\'s writer reached for in every region');
  const given = { ...east, carers: ['a restaurant inspector', 'a nurse'] };
  assert.ok(!has(lintSheet({ profile: make({ cast: given, sheet: { upbringing: 'Grew up in Busan with a parent who inspected restaurants and another who nursed; the ledger of inspections was read aloud at the table and the lantern left on late.' } }), casting: given, year: YEAR }), /gives the family a trade/));
});

test('the four settings of each knob must be distinct and a sensible length', () => {
  const p = make();
  p.variables[0].values[1].text = p.variables[0].values[0].text;
  assert.ok(has(lint(p), /tempo: the four settings are not distinct/));
  const q = make();
  q.variables[1].values[2].text = 'short';
  assert.ok(has(lint(q), /candor: the four settings must each be 8 to 110 characters/));
});

test('against the rest of the team: a name, a first name, a signature phrase, habit verbs, words more than two people share', () => {
  const others = [make({ i: 0, cast: castFor(0) }), make({ i: 1, cast: castFor(1) })];
  const taken = takenFrom(others);
  assert.deepEqual(taken.names, ['mara quill', 'odel brandt']);
  assert.deepEqual(taken.firstNames, ['mara', 'odel']);
  assert.equal(taken.signatures.length, 2);

  const nameClash = lint(make({ i: 5, seed: { name: 'Mara Quill' } }), { taken });
  assert.ok(has(nameClash, /the name is already a teammate's/));
  assert.ok(has(lint(make({ i: 5, seed: { name: 'Mara Okafor' } }), { taken }), /first name "mara" is already a teammate's/));

  const sig = lint(make({ i: 5, sheet: { signature: 'Good. That one stays' } }), { taken });
  assert.ok(has(sig, /signature phrase .* too close to a teammate's/));
  assert.ok(!has(lint(make({ i: 5, sheet: { signature: 'Hold it right there' } }), { taken }), /signature/));

  // the first habit's verb is another's first-habit verb
  const verb = taken.firstHabitVerbs[0];
  const sameVerb = lint(make({ i: 5, sheet: { habits: [`${verb} the almanac every morning`, 'sorts the cistern', 'counts the bobbin'] } }), { taken });
  assert.ok(has(sameVerb, new RegExp(`first habit begins with "${verb}"`)));

  // words two or more teammates already use
  const crowd = takenFrom([make({ i: 0, cast: castFor(0) }), make({ i: 0, cast: castFor(1), seed: { name: 'Zed Twin' } }), make({ i: 0, cast: castFor(3), seed: { name: 'Yan Twin' } })]);
  const same = lint(make({ i: 0, cast: castFor(0), seed: { name: 'Quin Third' } }), { taken: crowd });
  assert.ok(has(same, /words that two or more teammates' sheets already use/), 'the writer repeating itself across people');
});

test('what a team has used is read from the sheets: stems of the uncommon words, not the person\'s own name', () => {
  const p = make({ i: 3 });
  const words = sheetWords(p.anchors);
  assert.ok(words.size > 20);
  for (const w of String(p.anchors.agent_name).toLowerCase().split(/\W+/)) assert.ok(!words.has(w), w);
  assert.ok([...words].every(w => !['years', 'person', 'people', 'family'].includes(w)));
  assert.equal(EMPTY_TAKEN.names.length, 0);
});

test('the words of the place everyone works in are not a motif to avoid: a company called "Sunken Spire" does not make "sunken" and "spire" a repeated word', () => {
  const sheet = { career: 'Spent years at the Sunken Spire archive, where the sunken stairs and the spire keys were their whole world and design was the daily business.' };
  const crowd = (opts) => takenFrom([make({ i: 0, cast: castFor(0), sheet }), make({ i: 0, cast: castFor(1), seed: { name: 'Zed Twin' }, sheet }), make({ i: 0, cast: castFor(3), seed: { name: 'Yan Twin' }, sheet })], opts);
  const mine = make({ i: 0, cast: castFor(0), seed: { name: 'Quin Third' }, sheet });
  assert.ok(has(lint(mine, { taken: crowd() }), /words that two or more teammates' sheets already use/), 'without the context they are flagged');
  const ignore = contextWords('Sunken Spire Studios', 'Designs prompt engines for artists.', 'Concept Desk', '');
  assert.ok(ignore.has('sunken') && ignore.has('spire') && ignore.has('design') && ignore.has('studio'));
  const res = lint(mine, { taken: crowd({ ignore }), ignore });
  assert.ok(!has(res, /sunken|spire|design/), `the place's own words are fine: ${res.problems.join('; ')}`);
});

test('names and phrases are held against the whole company, repeated words against the people in the same room', () => {
  const everyone = [make({ i: 0, cast: castFor(0) }), make({ i: 0, cast: castFor(1), seed: { name: 'Zed Twin' } }), make({ i: 0, cast: castFor(3), seed: { name: 'Yan Twin' } })];
  const mine = make({ i: 0, cast: castFor(0), seed: { name: 'Quin Third' } });
  const wholeCompany = takenFrom(everyone);
  assert.ok(has(lint(mine, { taken: wholeCompany }), /words that two or more teammates' sheets already use/), 'three people in the room share these words');
  const otherRoom = takenFrom(everyone, { roomMates: [everyone[0]] });
  assert.ok(!has(lint(mine, { taken: otherRoom }), /words that two or more teammates/), 'only one of them is in this room');
  assert.deepEqual(otherRoom.names, ['mara quill', 'zed twin', 'yan twin'], 'but a name is taken company-wide');
  assert.equal(otherRoom.signatures.length, 3);
  const nameClash = lint(make({ i: 5, seed: { name: 'Yan Twin' } }), { taken: otherRoom });
  assert.ok(has(nameClash, /the name is already a teammate's/), 'a name in another room is still a clash');
});
