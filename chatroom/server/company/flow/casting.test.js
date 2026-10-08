import test from 'node:test';
import assert from 'node:assert/strict';
import { castPositions, castOnce, applyLocks, carerWorkFor, ensureDissent, LOCKABLE } from './casting.js';
import { COUNTRIES, REGIONS, PARENT_WORK, WATCHED_TRADES, GLOBALLY_WATCHED, TEMPERAMENTS, WORKING_STYLES, HUBS, BIRTH_YEARS } from './tables.js';
import { ARCHETYPES, archetype, archetypeForRole } from './archetypes.js';
import { SIZES, planOrg, checkOrg, headcount } from './orgs.js';
import { diversityReport, describeReport } from './diversity.js';
import { rng, shuffle, cycler, weighted } from './rng.js';

/**
 * Casting by code: the facts about an invented person are drawn from tables, stratified and scored against the diversity targets, reproducible from a
 * seed, shaped by the position, and open to the owner's locks. These tests hold the sampler to what the pilot needed it to do.
 */

const YEAR = 2026;
const positionsOf = (size) => planOrg({ size }).departments.flatMap((d) => d.positions.map((p, i) => ({ key: `${d.name}:${i}`, department: d.name, ...p })));
const desk = () => positionsOf('desk');

test('the tables are what the sampler relies on: every country has a known region, cities and a demonym; every region is used; no entry names a watched trade', () => {
  for (const [name, c] of Object.entries(COUNTRIES)) {
    assert.ok(REGIONS.includes(c.region), `${name}: region`);
    assert.ok(c.cities.length >= 2, `${name}: cities`);
    assert.ok(c.demonym && c.languages.length, `${name}: demonym and languages`);
  }
  for (const region of REGIONS) assert.ok(Object.values(COUNTRIES).some(c => c.region === region), region);
  assert.ok(TEMPERAMENTS.length >= 24 && WORKING_STYLES.length >= 12);
  assert.equal(new Set(PARENT_WORK.map(w => w[0])).size, PARENT_WORK.length, 'no duplicate jobs');
  // the garment and food-shop trades the pilot's writer reached for are not in the pool a draw takes from
  for (const [text] of PARENT_WORK) for (const w of GLOBALLY_WATCHED) assert.ok(!text.toLowerCase().includes(w), `${text} is watched (${w})`);
  for (const h of HUBS) assert.ok(h.city && h.country && h.adjective);
});

test('the same seed gives the same people; another seed gives others', () => {
  const a = castPositions({ positions: desk(), seed: 'same', year: YEAR });
  const b = castPositions({ positions: desk(), seed: 'same', year: YEAR });
  const c = castPositions({ positions: desk(), seed: 'other', year: YEAR });
  assert.deepEqual(a.rows, b.rows);
  assert.notDeepEqual(a.rows.map(r => r.birthplace.city), c.rows.map(r => r.birthplace.city));
});

test('a small team spreads: different countries, parts of the world, ages, temperaments, working styles and types; no pronoun for most of them', () => {
  for (let seed = 0; seed < 40; seed++) {
    const { rows, report } = castPositions({ positions: desk(), seed: `desk-${seed}`, year: YEAR });
    assert.equal(rows.length, 6);
    assert.equal(report.ok, true, `${seed}: ${describeReport(report)}`);
    assert.equal(new Set(rows.map(r => r.birthplace.region)).size, 6, 'six people, six parts of the world (stratified, not retried into)');
    assert.equal(new Set(rows.map(r => r.temperament)).size, 6);
    assert.equal(new Set(rows.map(r => r.workingStyle)).size, 6);
    const ages = rows.map(r => r.age);
    assert.ok(Math.max(...ages) - Math.min(...ages) >= 25, `${seed}: ages ${ages}`);
    assert.ok(ages.every(a => a >= YEAR - BIRTH_YEARS.max && a <= YEAR - BIRTH_YEARS.min));
    const counts = {};
    for (const r of rows) counts[r.pronoun] = (counts[r.pronoun] || 0) + 1;
    assert.ok(Math.max(...Object.values(counts)) <= 3, `${seed}: ${JSON.stringify(counts)}`);
  }
});

test('the targets hold at every size the planner makes, over many seeds', () => {
  for (const size of Object.keys(SIZES)) {
    let met = 0;
    const runs = 25;
    for (let seed = 0; seed < runs; seed++) {
      const { report } = castPositions({ positions: positionsOf(size), seed: `${size}-${seed}`, year: YEAR });
      if (report.ok) met++;
    }
    assert.ok(met >= runs * 0.9, `${size}: ${met} of ${runs} drew a team that met every target`);
  }
});

test('the position shapes the person: archetype, tier, model, thinking, dissent, types, skills, and a path from that archetype', () => {
  const { rows } = castPositions({ positions: desk(), seed: 'shape', year: YEAR });
  const by = Object.fromEntries(rows.map(r => [r.title, r]));
  assert.deepEqual([by['Producer'].archetype, by['Producer'].tier, by['Producer'].dissent, by['Producer'].lead], ['steward', 'none', 'low', true]);
  assert.deepEqual([by['Skeptic'].archetype, by['Skeptic'].dissent, by['Skeptic'].model, by['Skeptic'].thinking, by['Skeptic'].reviewer], ['contrarian', 'high', 'gemini-3.1-pro-preview', 'medium', true]);
  assert.deepEqual([by['Template engineer'].tier, by['Template engineer'].thinking], ['builder', 'medium']);
  assert.equal(by['Researcher'].tier, 'research');
  for (const r of rows) {
    const a = archetype(r.archetype);
    assert.ok(a.types.includes(r.intendedType), `${r.title}: ${r.intendedType}`);
    assert.ok(a.paths.includes(r.path));
    assert.equal(r.skills.length, 3);
    assert.ok(r.skills.every(s => a.skills.includes(s)));
    assert.match(r.intendedType, /^[EI][SN][TF][JP]$/);
  }
  // a position can narrow or set a tier
  const custom = castPositions({ positions: [{ key: 'a', department: 'D', title: 'Writer', archetype: 'storyteller', tier: 'research' }], seed: 'tier', year: YEAR });
  assert.equal(custom.rows[0].tier, 'research');
  assert.throws(() => castPositions({ positions: [{ key: 'a', department: 'D', title: 'X', archetype: 'wizard' }], seed: 's' }), /archetype that does not exist: wizard/);
});

test('what the carers did is drawn from a pool that excludes the trades used as shorthand for a region, and jobs that did not exist then', () => {
  for (const region of REGIONS) {
    const watched = [...(WATCHED_TRADES[region] || []), ...GLOBALLY_WATCHED];
    for (const [text] of carerWorkFor(region, 1975)) for (const w of watched) assert.ok(!text.toLowerCase().includes(w), `${region}: ${text} (${w})`);
  }
  const texts = (year) => carerWorkFor('Europe', year).map(x => x[0]);
  assert.ok(texts(1960).includes('a telephone exchange operator'));
  assert.ok(!texts(2000).includes('a telephone exchange operator'), 'gone by the time a child born in 2000 was growing up');
  assert.ok(!texts(1960).includes('a software tester'), 'not yet a job');
  assert.ok(texts(2000).includes('a software tester'));
  for (let seed = 0; seed < 30; seed++) {
    for (const r of castOnce({ positions: positionsOf('large'), seed: `carers-${seed}`, year: YEAR })) {
      const allowed = new Set(carerWorkFor(r.birthplace.region, r.bornYear).map(x => x[0]));
      assert.ok(r.carers.every(c => allowed.has(c)), `${r.title}: ${r.carers}`);
      assert.equal(r.carers.length, r.household === 'one parent' ? 1 : 2);
    }
  }
});

test('where they live and whether they moved: about three in ten move, never to where they were born, and the culture says so', () => {
  let moved = 0;
  let total = 0;
  for (let seed = 0; seed < 40; seed++) {
    for (const r of castOnce({ positions: positionsOf('large'), seed: `move-${seed}`, year: YEAR })) {
      total++;
      if (r.moved) {
        moved++;
        assert.notEqual(r.moved.to.country, r.birthplace.country);
        assert.deepEqual(r.livesIn, r.moved.to);
        assert.ok(r.moved.age >= 3 && r.moved.age <= 26 && r.moved.age < r.age);
        assert.equal(r.culture, `${COUNTRIES[r.birthplace.country].demonym} ${r.moved.adjective}`);
      } else {
        assert.deepEqual(r.livesIn, { city: r.birthplace.city, country: r.birthplace.country });
        assert.equal(r.culture, COUNTRIES[r.birthplace.country].demonym);
      }
      assert.ok(COUNTRIES[r.birthplace.country].cities.includes(r.birthplace.city));
    }
  }
  const share = moved / total;
  assert.ok(share > 0.2 && share < 0.4, `moved share ${share.toFixed(2)}`);
});

test('the owner\'s locks are laid over the draw as given, and what depends on them is mended; the sampler fills only what was left open', () => {
  const positions = desk().map((p, i) => (i === 0 ? { ...p, locked: { name: 'Rima Haddad-Boudreau', bornYear: 1971, birthplace: { country: 'Canada', city: 'Halifax' }, pronoun: 'she', temperament: 'calm and dry', dissent: 'medium', tier: 'research' } } : p));
  const { rows } = castPositions({ positions, seed: 'locks', year: YEAR });
  const rima = rows[0];
  assert.deepEqual([rima.name, rima.bornYear, rima.age, rima.pronoun, rima.temperament, rima.dissent, rima.tier], ['Rima Haddad-Boudreau', 1971, 55, 'she', 'calm and dry', 'medium', 'research']);
  assert.deepEqual(rima.birthplace, { city: 'Halifax', country: 'Canada', region: 'North America' });
  assert.equal(rima.nameStyle.demonym, 'Canadian');
  assert.equal(rima.nameStyle.decade, 1970);
  assert.deepEqual([...rima.locked].sort(), ['birthplace', 'bornYear', 'dissent', 'name', 'pronoun', 'temperament', 'tier']);
  assert.deepEqual(rows[1].locked, [], 'nobody else is locked');
  assert.ok(LOCKABLE.includes('culture'));

  // a locked country with no city gets one of that country's; an unknown country is kept as written, with no region
  const row = castOnce({ positions: desk(), seed: 'x', year: YEAR })[0];
  assert.ok(COUNTRIES.Japan.cities.includes(applyLocks(row, { birthplace: { country: 'Japan' } }, YEAR).birthplace.city));
  assert.deepEqual(applyLocks(row, { birthplace: { country: 'Atlantis', city: 'Poseidonis' } }, YEAR).birthplace, { city: 'Poseidonis', country: 'Atlantis', region: 'unknown' });
  // a locked culture is not overwritten by a locked country
  assert.equal(applyLocks(row, { birthplace: { country: 'Japan' }, culture: 'Okinawan Japanese' }, YEAR).culture, 'Okinawan Japanese');
  // a moved person born in the country they were "moved to" has not moved
  const mover = { ...row, moved: { age: 9, from: { city: 'A', country: 'Peru' }, to: { city: 'Toronto', country: 'Canada' }, adjective: 'Canadian' } };
  assert.equal(applyLocks(mover, { birthplace: { country: 'Canada' } }, YEAR).moved, null);
});

test('every room of three or more has a dissenter: the reviewer becomes one if the draw left none', () => {
  const rows = [
    { department: 'A', lead: true, reviewer: false, dissent: 'low', locked: [] }, { department: 'A', lead: false, reviewer: false, dissent: 'low', locked: [] },
    { department: 'A', lead: false, reviewer: true, dissent: 'medium', locked: [] }, { department: 'B', lead: true, reviewer: false, dissent: 'low', locked: [] },
    { department: 'B', lead: false, reviewer: false, dissent: 'low', locked: [] },
  ];
  const out = ensureDissent(rows);
  assert.deepEqual(out.filter(r => r.department === 'A').map(r => r.dissent), ['low', 'low', 'high'], 'the reviewer');
  assert.deepEqual(out.filter(r => r.department === 'B').map(r => r.dissent), ['low', 'low'], 'a room of two is left alone');
  assert.equal(rows[2].dissent, 'medium', 'the input is not changed');
  // a locked dissent is respected
  const locked = [{ department: 'C', lead: true, dissent: 'low', locked: [] }, { department: 'C', reviewer: true, dissent: 'low', locked: ['dissent'] }, { department: 'C', dissent: 'low', locked: [] }];
  assert.deepEqual(ensureDissent(locked).map(r => r.dissent), ['low', 'low', 'high']);
});

test('the diversity report names the target that failed and by how much', () => {
  const person = (over) => ({ department: 'D', bornYear: 1990, birthplace: { country: 'Peru', region: 'Latin America & Caribbean' }, pronoun: 'she', temperament: 't', workingStyle: 'w', dissent: 'low', tier: 'none', model: 'm', intendedType: 'ISTJ', ...over });
  const samey = [person({}), person({}), person({}), person({})];
  const report = diversityReport(samey, { year: YEAR });
  assert.equal(report.ok, false);
  const failed = report.targets.filter(t => !t.met).map(t => t.id);
  for (const id of ['countries', 'regions', 'ages', 'pronouns', 'region_share', 'dissent', 'temperaments', 'working_styles', 'intended_types', 'models']) assert.ok(failed.includes(id), id);
  assert.match(describeReport(report), /NOT {4}At least 4 different countries of birth: 1: Peru/);
  assert.match(report.targets.find(t => t.id === 'dissent').detail, /no dissenter in: D/);
  // two people are too few for the targets to apply
  assert.equal(diversityReport(samey.slice(0, 2), { year: YEAR }).targets.length, 0);
  // measured types count only once enough people have taken the quiz
  const withTypes = [person({ measuredType: 'ISTJ' }), person({ measuredType: 'ENFP' }), person({ measuredType: 'INTP' }), person({ measuredType: 'ESFJ' })];
  assert.equal(diversityReport(withTypes, { year: YEAR }).targets.find(t => t.id === 'measured_types').met, true);
});

test('the plans: every size keeps one lead and a reviewer a room, at most eight a room, and the headcount it says', () => {
  for (const [size, layout] of Object.entries(SIZES)) {
    const plan = planOrg({ size });
    assert.deepEqual(checkOrg(plan), [], size);
    assert.equal(headcount(plan), layout.people, `${size}: ${headcount(plan)} people`);
    for (const d of plan.departments) for (const p of d.positions) assert.ok(archetype(p.archetype), `${size}/${d.name}/${p.title}`);
  }
  assert.equal(planOrg({ size: 'desk' }).departments.length, 1);
  const problems = checkOrg({ departments: [{ name: 'Big', positions: Array.from({ length: 9 }, (_, i) => ({ title: `P${i}`, archetype: 'steward' })) }, { name: 'Empty', positions: [] }] });
  assert.ok(problems.some(p => /Big has 9 positions; a room holds at most 8/.test(p)));
  assert.ok(problems.some(p => /Big needs exactly one lead \(it has 0\)/.test(p)));
  assert.ok(problems.some(p => /Big has 9 people and nobody whose job is to object/.test(p)));
  assert.ok(problems.some(p => /Empty has no positions/.test(p)));
  assert.throws(() => planOrg({ size: 'enormous' }), /size must be one of/);
  // a plan is a copy
  const plan = planOrg({ size: 'desk' });
  plan.departments[0].positions.pop();
  assert.equal(headcount(planOrg({ size: 'desk' })), 6);
});

test('the archetypes: eleven, each complete, mapped from role titles by the best match', () => {
  assert.equal(ARCHETYPES.length, 11);
  for (const a of ARCHETYPES) {
    assert.ok(a.id && a.name && a.summary && a.roles.length && a.types.length && a.skills.length >= 3 && a.paths.length >= 5 && a.blindSpots.length && a.disagrees, a.id);
    for (const t of a.types) assert.match(t, /^[EI][SN][TF][JP]$/);
    assert.ok(['none', 'research', 'builder', 'analyst', 'visual'].includes(a.tier), `${a.id}: ${a.tier}`);
    assert.ok(['low', 'medium', 'high'].includes(a.dissent));
  }
  assert.equal(ARCHETYPES.filter(a => a.dissent === 'high').length, 1, 'one archetype exists to object');
  assert.equal(ARCHETYPES.filter(a => a.lead).length, 2);
  assert.equal(archetypeForRole('Skeptic').id, 'contrarian');
  assert.equal(archetypeForRole('Image director').id, 'craftsman', 'the exact role beats the word "director"');
  assert.equal(archetypeForRole('Creative director').id, 'director');
  assert.equal(archetypeForRole('Lighthouse keeper'), null);
  assert.equal(archetypeForRole(''), null);
});

test('the seeded source: repeatable, shuffles without loss, bags cycle through everything before repeating, weights are honoured', () => {
  const a = rng('x');
  const b = rng('x');
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(rng('x')(), rng('y')());
  const r = rng('shuffle');
  assert.deepEqual([...shuffle(r, [1, 2, 3, 4, 5])].sort(), [1, 2, 3, 4, 5]);
  const next = cycler(rng('bag'), ['a', 'b', 'c']);
  const first = [next(), next(), next()];
  assert.deepEqual([...first].sort(), ['a', 'b', 'c']);
  const w = rng('weights');
  const counts = { heavy: 0, light: 0 };
  for (let i = 0; i < 2000; i++) counts[weighted(w, [['heavy', 9], ['light', 1]])]++;
  assert.ok(counts.heavy > 1650 && counts.light > 100, JSON.stringify(counts));
});

test('an imported profile\'s archetype and birthplace are read the way the roster keeps them', async () => {
  const { archetypeId, normalizeCasting } = await import('./archetypes.js');
  assert.equal(archetypeId('The Steward'), 'steward');
  assert.equal(archetypeId('  the CONTRARIAN '), 'contrarian');
  assert.equal(archetypeId('machinist'), 'machinist');
  assert.equal(archetypeId('Craftsman'), 'craftsman', 'without the article');
  assert.equal(archetypeId('wizard'), null);
  assert.equal(archetypeId(undefined), null);
  assert.deepEqual(normalizeCasting({ birthplace: 'Gdańsk, Poland', region: 'Europe', dissent: 'high' }), { birthplace: { city: 'Gdańsk', country: 'Poland', region: 'Europe' }, region: 'Europe', dissent: 'high' });
  assert.deepEqual(normalizeCasting({ birthplace: 'Lagos, Lagos State, Nigeria' }).birthplace, { city: 'Lagos', country: 'Lagos State, Nigeria' });
  const given = { birthplace: { city: 'Lisbon', country: 'Portugal', region: 'Europe' } };
  assert.deepEqual(normalizeCasting(given), given, 'a birthplace that is already an object is left as it is');
  assert.deepEqual(normalizeCasting(null), {});
});
