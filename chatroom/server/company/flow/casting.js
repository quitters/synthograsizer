/**
 * Casting by code.
 * ────────────────
 * Given the positions a company needs, draw the people who will fill them: where each was born and when, where they live now, whether and when they
 * moved, what the adults who raised them did, what set them back, what they are fond of, how they come across, how they work, which of the sixteen
 * four-letter types they are cast as, and what they can touch. Every one of those is a draw from a table (tables.js) shaped by what the position
 * needs (archetypes.js), and none of them is the model's to invent: Gemini writes the person around these facts, not the facts.
 *
 * It is a sampler with a target. A small team's attributes are stratified (a shuffled bag per attribute, so the first n draws are all different), and the
 * whole draw is scored against the diversity targets (diversity.js); the best of several seeded attempts is kept. The same seed gives the same people, so
 * a casting can be reproduced, tested and argued about.
 *
 * Anything the owner fixes is LOCKED: a position can carry `locked` fields (a name, a birth year, a country, a pronoun, a temperament...) and they are laid over
 * the draw as given. The sampler only fills what was left open.
 */
import { COUNTRIES, REGIONS, HUBS, PARENT_WORK, CHILDHOOD_THINGS, SETBACKS, FONDNESSES, TEMPERAMENTS, WORKING_STYLES, BIRTH_YEARS, WATCHED_TRADES, GLOBALLY_WATCHED } from './tables.js';
import { archetype as getArchetype, MODEL_CLASSES } from './archetypes.js';
import { rng, pick, shuffle, between, weighted, cycler } from './rng.js';
import { diversityReport } from './diversity.js';

export const MAX_ATTEMPTS = 30;

const HOUSEHOLDS = [['two parents', 60], ['one parent', 20], ['a parent and a grandparent', 10], ['grandparents', 5], ['an aunt and an uncle', 3], ['foster carers', 2]];
const SIBLINGS = [[0, 15], [1, 35], [2, 30], [3, 12], [4, 8]];

/** Work a person's carers might have done that is not shorthand for where they are from, and that existed while the person was growing up. */
export function carerWorkFor(region, bornYear) {
  const watched = [...(WATCHED_TRADES[region] || []), ...GLOBALLY_WATCHED];
  return PARENT_WORK.filter(([text, from, until]) => from <= bornYear + 10 && until >= bornYear + 5 && !watched.some(w => text.toLowerCase().includes(w)));
}

const decade = (y) => Math.floor(y / 10) * 10;

/** Fields an owner may lock, and the check that each is the right kind of thing. */
export const LOCKABLE = Object.freeze(['name', 'bornYear', 'pronoun', 'birthplace', 'culture', 'temperament', 'workingStyle', 'dissent', 'intendedType', 'tier', 'model', 'thinking', 'skills']);

/** One draw for all positions. @returns {object[]} casting rows, in the order of the positions */
export function castOnce({ positions, seed, year = new Date().getFullYear() }) {
  const r = rng(seed);
  const n = positions.length;

  // stratified bags: the first draws of each are all different
  const nextRegion = cycler(r, REGIONS);
  const nextCountryIn = {};
  const countryBag = (region) => (nextCountryIn[region] ||= cycler(r, Object.keys(COUNTRIES).filter(c => COUNTRIES[c].region === region)));
  const nextHub = cycler(r, HUBS);
  const nextTemperament = cycler(r, TEMPERAMENTS);
  const nextStyle = cycler(r, WORKING_STYLES);
  const nextChildhood = cycler(r, CHILDHOOD_THINGS);
  const nextSetback = cycler(r, SETBACKS);
  const nextFondness = cycler(r, FONDNESSES);

  // ages: one band each, shuffled, so a small team spans the range
  const span = BIRTH_YEARS.max - BIRTH_YEARS.min + 1;
  const bands = shuffle(r, Array.from({ length: n }, (_, i) => i));
  const birthYearFor = (i) => {
    const lo = BIRTH_YEARS.min + Math.floor((bands[i] * span) / n);
    const hi = BIRTH_YEARS.min + Math.floor(((bands[i] + 1) * span) / n) - 1;
    return between(r, lo, Math.max(lo, hi));
  };

  // pronouns: balanced she/he, with a they now and then (about one in ten, never a majority)
  const they = n >= 6 ? (r() < 0.5 ? Math.max(1, Math.round(n * 0.1)) : 0) : 0;
  const first = r() < 0.5 ? 'she' : 'he';
  const second = first === 'she' ? 'he' : 'she';
  const pronounBag = shuffle(r, [...Array(they).fill('they'), ...Array.from({ length: n - they }, (_, i) => (i % 2 === 0 ? first : second))]);

  const usedTypes = new Set();
  const archetypeUse = {};

  return positions.map((position, i) => {
    const a = getArchetype(position.archetype);
    if (!a) throw new Error(`position "${position.title}" names an archetype that does not exist: ${position.archetype}`);
    const region = nextRegion();
    const country = nextCountryIn[region] ? nextCountryIn[region]() : countryBag(region)();
    const c = COUNTRIES[country];
    const city = pick(r, c.cities);
    const bornYear = birthYearFor(i);
    const age = year - bornYear;

    // whether and when they moved (about three in ten), to somewhere other than where they were born
    let moved = null;
    if (r() < 0.3) {
      let hub = nextHub();
      for (let tries = 0; hub.country === country && tries < 5; tries++) hub = nextHub();
      if (hub.country !== country) moved = { age: between(r, 3, Math.min(26, Math.max(4, age - 20))), from: { city, country }, to: { city: hub.city, country: hub.country }, adjective: hub.adjective };
    }
    const culture = moved ? `${c.demonym} ${moved.adjective}` : c.demonym;
    const languages = c.languages.length > 1 && r() < 0.6 ? shuffle(r, c.languages).slice(0, 2) : [c.languages[0]];

    const household = weighted(r, HOUSEHOLDS);
    const pool = carerWorkFor(region, bornYear);
    const carers = shuffle(r, pool).slice(0, household === 'one parent' ? 1 : 2).map(([text]) => text);

    archetypeUse[a.id] = (archetypeUse[a.id] || 0) + 1;
    const path = a.paths[(archetypeUse[a.id] - 1 + between(r, 0, a.paths.length - 1)) % a.paths.length];
    const types = a.types.filter(t => !usedTypes.has(t));
    const intendedType = pick(r, types.length ? types : a.types);
    usedTypes.add(intendedType);

    const row = {
      key: position.key, department: position.department, title: position.title, archetype: a.id, lead: Boolean(position.lead), reviewer: Boolean(position.reviewer),
      bornYear, age, pronoun: pronounBag[i],
      birthplace: { city, country, region }, livesIn: moved ? moved.to : { city, country }, moved, culture, languages,
      household, carers, siblings: weighted(r, SIBLINGS), childhood: nextChildhood(), setback: nextSetback(), fondness: nextFondness(), path,
      yearsInField: Math.max(3, Math.min(age - 24, between(r, 4, 32))),
      temperament: nextTemperament(), workingStyle: nextStyle(), dissent: a.dissent, intendedType,
      tier: position.tier || a.tier, model: MODEL_CLASSES[a.model], thinking: a.thinking,
      skills: shuffle(r, a.skills).slice(0, 3),
      nameStyle: { demonym: c.demonym, region, pronoun: pronounBag[i], decade: decade(bornYear), languages },
      locked: [],
    };
    return row;
  });
}

/** Lay the owner's fixed fields over a draw, and mend what depends on them. */
export function applyLocks(row, locked = {}, year = new Date().getFullYear()) {
  const out = { ...row, locked: [] };
  const lock = (field) => { if (!out.locked.includes(field)) out.locked.push(field); };
  for (const field of LOCKABLE) {
    if (locked[field] === undefined || locked[field] === null) continue;
    lock(field);
    if (field === 'birthplace') {
      const country = locked.birthplace.country ?? out.birthplace.country;
      const known = COUNTRIES[country];
      out.birthplace = { city: locked.birthplace.city ?? (known && known.cities.includes(out.birthplace.city) ? out.birthplace.city : (known?.cities[0] || out.birthplace.city)), country, region: known?.region || locked.birthplace.region || 'unknown' };
      if (!locked.culture) out.culture = known ? known.demonym : out.culture;
      out.nameStyle = { ...out.nameStyle, demonym: known?.demonym || out.nameStyle.demonym, region: out.birthplace.region };
      if (out.moved) { out.moved = { ...out.moved, from: { city: out.birthplace.city, country } }; if (out.moved.to.country === country) out.moved = null; }
      if (!out.moved) out.livesIn = { city: out.birthplace.city, country };
    } else if (field === 'bornYear') {
      out.bornYear = locked.bornYear;
      out.age = year - locked.bornYear;
      out.nameStyle = { ...out.nameStyle, decade: decade(locked.bornYear) };
    } else if (field === 'pronoun') {
      out.pronoun = locked.pronoun;
      out.nameStyle = { ...out.nameStyle, pronoun: locked.pronoun };
    } else {
      out[field] = locked[field];
    }
  }
  return out;
}

/**
 * Draw the people for a list of positions, keeping the best of several seeded attempts against the diversity targets.
 * @param {object} args
 * @param {{ key: string, department: string, title: string, archetype: string, lead?: boolean, reviewer?: boolean, tier?: string, locked?: object }[]} args.positions
 * @param {string} args.seed
 * @param {number} [args.year]
 * @param {object[]} [args.existing]  people already on the team (casting rows), counted by the report and not redrawn
 * @returns {{ rows: object[], report: object, attempts: number, seed: string }}
 */
export function castPositions({ positions, seed, year = new Date().getFullYear(), existing = [], maxAttempts = MAX_ATTEMPTS }) {
  let best = null;
  let attempts = 0;
  for (attempts = 1; attempts <= maxAttempts; attempts++) {
    const drawn = castOnce({ positions, seed: `${seed}:${attempts}`, year }).map((row, i) => applyLocks(row, positions[i].locked || {}, year));
    const rows = ensureDissent(drawn);
    const report = diversityReport([...existing, ...rows], { year });
    const unmet = report.targets.length - report.met;
    if (!best || unmet < best.unmet) best = { rows, report, unmet, attempt: attempts };
    if (unmet === 0) break;
  }
  return { rows: best.rows, report: best.report, attempts: Math.min(attempts, maxAttempts), seed: `${seed}:${best.attempt}` };
}

/** Every room of three or more has someone whose job is to object: if the draw left a room without a "high", its reviewer (or, failing that, its most senior non-lead) becomes one. */
export function ensureDissent(rows) {
  const byRoom = new Map();
  for (const row of rows) { if (!byRoom.has(row.department)) byRoom.set(row.department, []); byRoom.get(row.department).push(row); }
  const out = rows.map(r => ({ ...r }));
  for (const [dept, members] of byRoom) {
    if (members.length < 3 || members.some(m => m.dissent === 'high')) continue;
    const candidates = out.filter(r => r.department === dept && !r.lead);
    const chosen = candidates.find(r => r.reviewer && !r.locked.includes('dissent')) || candidates.find(r => !r.locked.includes('dissent'));
    if (chosen) chosen.dissent = 'high';
  }
  return out;
}
