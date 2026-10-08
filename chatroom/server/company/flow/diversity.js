/**
 * The diversity report: how a set of people spreads, and whether it meets the targets.
 * ────────────────────────────────────────────────────────────────────────────────────────
 * "Build diversity in on purpose. Vary background, culture, age, temperament and working style across the roster, report the spread, and give every
 * team at least one dissenting voice." The pilot checked a casting by hand after the fact. This is the same check as code, run on every casting (the
 * sampler keeps the best of several draws) and again on the finished people, so a team that falls short says which target and by how much.
 *
 * Attributes of attributes are not diversity of voice: whether six people SOUND different in a room is measured from a transcript, not asserted here.
 * What this counts is what code can count: where people were born, how old they are, how they are described, what they are for, what they can touch.
 */

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const tally = (list) => { const t = {}; for (const v of list) { const k = v || 'unknown'; t[k] = (t[k] || 0) + 1; } return t; };
const distinct = (list) => new Set(list.filter(Boolean)).size;

/**
 * @param {object[]} people  each: { department?, bornYear, birthplace: { country, region }, pronoun, temperament, workingStyle, dissent, tier, model, intendedType, measuredType? }
 * @param {{ year?: number }} [options]
 */
export function diversityReport(people, { year = new Date().getFullYear() } = {}) {
  const n = people.length;
  const ages = people.filter(p => Number.isInteger(p.bornYear)).map(p => year - p.bornYear);
  const spread = {
    people: n,
    regions: tally(people.map(p => p.birthplace?.region)), countries: tally(people.map(p => p.birthplace?.country)),
    pronouns: tally(people.map(p => p.pronoun)), dissent: tally(people.map(p => p.dissent)), tiers: tally(people.map(p => p.tier)), models: tally(people.map(p => p.model)),
    intendedTypes: tally(people.map(p => p.intendedType)), measuredTypes: tally(people.map(p => p.measuredType)),
    ages: ages.length ? { min: Math.min(...ages), max: Math.max(...ages), median: median(ages), mean: Math.round(mean(ages) * 10) / 10 } : null,
  };

  const targets = [];
  const target = (id, text, applies, met, detail) => { if (applies) targets.push({ id, text, met: Boolean(met), detail }); };
  const maxShare = (counts) => Math.max(0, ...Object.values(counts)) / (n || 1);

  const wantCountries = Math.min(n, 4);
  target('countries', `At least ${wantCountries} different countries of birth`, n >= 3, distinct(people.map(p => p.birthplace?.country)) >= wantCountries,
    `${distinct(people.map(p => p.birthplace?.country))}: ${Object.keys(spread.countries).join(', ')}`);
  const wantRegions = Math.min(n, 3);
  target('regions', `At least ${wantRegions} different parts of the world`, n >= 3, distinct(people.map(p => p.birthplace?.region)) >= wantRegions,
    `${distinct(people.map(p => p.birthplace?.region))}: ${Object.keys(spread.regions).join(', ')}`);
  const wantSpan = n >= 4 ? 25 : 15;
  target('ages', `Ages span at least ${wantSpan} years`, n >= 3 && spread.ages !== null, spread.ages && spread.ages.max - spread.ages.min >= wantSpan,
    spread.ages ? `${spread.ages.min} to ${spread.ages.max} (median ${spread.ages.median})` : 'no ages');
  const cap = n >= 5 ? 0.6 : 0.67;
  target('pronouns', `No one pronoun for more than ${Math.round(cap * 100)}% of people`, n >= 3, maxShare(spread.pronouns) <= cap + 1e-9,
    Object.entries(spread.pronouns).map(([k, v]) => `${k} ${v}`).join(', '));
  target('region_share', 'No part of the world for more than half of the people', n >= 4, maxShare(spread.regions) <= 0.5 + 1e-9,
    `largest share ${Math.round(maxShare(spread.regions) * 100)}%`);

  // every room of three or more has someone whose job is to object (high), and there is one somewhere regardless
  const byDept = new Map();
  for (const p of people) { const d = p.department || ''; if (!byDept.has(d)) byDept.set(d, []); byDept.get(d).push(p); }
  const rooms = [...byDept.entries()].filter(([, ps]) => ps.length >= 3);
  const withoutDissent = rooms.filter(([, ps]) => !ps.some(p => p.dissent === 'high')).map(([d]) => d || 'the room');
  target('dissent', 'Every room of three or more has a dissenting voice', n >= 3, withoutDissent.length === 0 && people.some(p => p.dissent === 'high'),
    withoutDissent.length ? `no dissenter in: ${withoutDissent.join(', ')}` : `${people.filter(p => p.dissent === 'high').length} dissenter${people.filter(p => p.dissent === 'high').length === 1 ? '' : 's'}`);

  const wantTemp = Math.min(n, 12);
  target('temperaments', `At least ${wantTemp} different temperaments`, n >= 3, distinct(people.map(p => p.temperament)) >= wantTemp, `${distinct(people.map(p => p.temperament))} of ${n}`);
  const wantStyle = Math.min(n, 8);
  target('working_styles', `At least ${wantStyle} different working styles`, n >= 3, distinct(people.map(p => p.workingStyle)) >= wantStyle, `${distinct(people.map(p => p.workingStyle))} of ${n}`);
  const wantTypes = Math.min(n, 6);
  target('intended_types', `At least ${wantTypes} different intended types`, n >= 3, distinct(people.map(p => p.intendedType)) >= wantTypes, `${distinct(people.map(p => p.intendedType))}: ${Object.keys(spread.intendedTypes).join(', ')}`);
  const measured = people.filter(p => p.measuredType);
  const wantMeasured = Math.min(measured.length, 4);
  target('measured_types', `At least ${wantMeasured} different measured types (after the quiz)`, measured.length >= 4, distinct(measured.map(p => p.measuredType)) >= wantMeasured, `${distinct(measured.map(p => p.measuredType))}: ${Object.keys(spread.measuredTypes).join(', ')}`);

  const widened = people.filter(p => p.tier && p.tier !== 'none').length;
  target('least_privilege', 'At most half of the people hold any tool', n >= 4, widened <= n / 2, `${widened} of ${n} hold tools`);
  target('models', 'At least two different models', n >= 4, distinct(people.map(p => p.model)) >= 2, Object.keys(spread.models).join(', '));

  return { spread, targets, met: targets.filter(t => t.met).length, total: targets.length, ok: targets.every(t => t.met) };
}

/** The report as lines for a person to read. */
export function describeReport(report) {
  const lines = report.targets.map(t => `${t.met ? 'met   ' : 'NOT   '} ${t.text}: ${t.detail}`);
  return `${report.met} of ${report.total} targets met\n${lines.join('\n')}`;
}
