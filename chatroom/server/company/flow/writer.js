/**
 * Writing a person: a seed, then a sheet, checked, reviewed and screened.
 * ────────────────────────────────────────────────────────────────────────
 * The pilot wrote six people with one Pro call each after a hand-made casting, then a person read them all. This is that, as a pipeline per person:
 *
 *   1. SEED    a cheap call picks the name and writes three sentences and "the one thing only they know", AROUND the drawn facts (casting.js).
 *              The owner sees seeds before any sheet is paid for, and can change one.
 *   2. SHEET   one Pro call writes the sheet and the off-the-clock section together, told what the rest of the team already used (names, habit verbs,
 *              signature phrases, touchstones, voice openers) and what has been learned about casting this archetype. Code assembles the Agent Profile.
 *   3. CHECKS  lint.js. A problem sends the writer back with the problem in words, up to twice more.
 *   4. REVIEW  a blind reader (review.js). A real person named, or a famous name, sends it back once; everything else is advice kept with the person.
 *   5. SCREEN  the company's own independent screen on the finished bio. A sheet that does not pass stays a draft and is never hired.
 *
 * Everything model-shaped goes through `ask` (model.js), so a test can stand in for the model and a flow can be capped on spend.
 */
import { MODELS } from '../../config/models.js';
import { archetype as getArchetype } from './archetypes.js';
import { SEED_SCHEMA, SHEET_SCHEMA, assembleProfile, bornLine } from './sheet.js';
import { lintSheet, takenFrom } from './lint.js';
import { blindReview, adviceFrom, hardFindings, admissionScreen } from './review.js';

export const MAX_SHEET_ATTEMPTS = 3;          // the first, and up to two regenerations

const fmt = (c) => `${c.title}: born ${c.bornYear} in ${c.birthplace.city}, ${c.birthplace.country}; ${c.path}`;

/** The drawn facts, as lines the writer is told not to change. */
export function factsBlock(c) {
  const lines = [
    `Born ${c.bornYear} in ${c.birthplace.city}, ${c.birthplace.country} (${c.culture}); languages at home: ${c.languages.join(', ')}. Pronouns: ${c.pronoun}.`,
    c.moved ? `Moved to ${c.moved.to.city}, ${c.moved.to.country} at ${c.moved.age}.` : `Still lives in ${c.birthplace.city}, or near it.`,
    `Raised by ${c.household}. Their work: ${c.carers.join('; ')}. ${c.siblings === 0 ? 'No siblings' : `${c.siblings} sibling${c.siblings === 1 ? '' : 's'}`}.`,
    `Something from childhood: ${c.childhood}.`,
    `A setback: ${c.setback}.`,
    `${c.yearsInField} years in this kind of work; a way in: ${c.path}.`,
    `Comes across as: ${c.temperament}. Works by: ${c.workingStyle}.`,
    `Irrationally fond of: ${c.fondness}.`,
  ];
  return lines.map(l => `- ${l}`).join('\n');
}

const teamBlock = (team) => (team.length ? team.map(t => `- ${t}`).join('\n') : '- (nobody yet)');
const lessonBlock = (lessons) => (lessons?.length ? `\nWHAT HAS BEEN LEARNED ABOUT CASTING THIS KIND OF PERSON (do not repeat these mistakes)\n${lessons.map(l => `- ${l.text ?? l}`).join('\n')}\n` : '');

const SEED_RULES = `Rules.
- The person is invented. Not a real or recognisable person, and the name must not be a famous person's.
- Choose a name that real people of this origin, family and decade actually have, but not the most obvious one. It must not repeat a teammate's name or first name.
- Do not make their origin their personality. Do not give the family a business, a shop or a trade beyond the work listed in the facts. Do not make a food their identity.
- Plain, concrete English. No lists inside text fields.`;

export function seedPrompt({ casting: c, company, department, taken, team, lessons }) {
  const a = getArchetype(c.archetype);
  const role = `${c.title} (${a.name}: ${a.summary})${c.lead ? ' They lead the room and close its sessions.' : ''}${c.reviewer ? ' Their job in the room is to object: to review what is made and say what is wrong.' : ''}`;
  return `You are casting an INVENTED person for a small creative team. You choose their name and write a three-sentence seed; a second writer will write the full character sheet from it.

THE COMPANY: ${company.name}. ${company.purpose || ''}
THE ROOM: ${department.name}. ${department.purpose || ''}
THE POSITION: ${role}

THE FACTS (already decided; do not change them)
${factsBlock(c)}

THE REST OF THE TEAM (do not repeat their names, trades or ways in)
${teamBlock(team)}
${taken.names.length ? `Names in use: ${taken.names.join(', ')}.\n` : ''}${lessonBlock(lessons)}
${SEED_RULES}`;
}

export const SHEET_RULES = `You are writing a character sheet for an INVENTED person on a small creative team. Write it the way a good novelist or casting director would: specific, plausible, a little surprising, never a stereotype.

Rules.
- The person is invented. Do not make them a real or recognisable person, and do not name any real person as their parent, partner, teacher, friend or hero. Touchstones may be works, places, foods, games, objects, sounds, institutions and brands; never living artists, authors, directors or musicians.
- The facts below are decided. Do not change where or when they were born, who raised them, or what that work was; do not invent a family business, shop or trade. Use real places and plausible years: every year you name must be after the birth year, and no later than this year. Details should be the kind a person would actually remember (a street, a job, a smell), not a tourist's list.
- Avoid the clichés of the person's culture or profession. Their origin is where they are from, not who they are. Do not name a food as their identity.
- A working professional, not a character study of a mood. Nothing mystical, no talk of being an AI or a program, no drifting. Third person throughout, never "I".
- Opinions are about the WORK (craft, process, taste, how to run a room), each with a reason from their own life, and other people on the team could disagree with them.
- The three knobs are settings for what changes from one session to the next: tempo (how fast and how patient they are today), candor (how blunt they are today), push (what they will insist on today, in terms of this team's work). Each has four settings, ordered from lowest to highest intensity, as short phrases (3 to 12 words) written to be dropped into a sentence.
- The off-the-clock section shows the temperament below as what they DO, never naming a type or a trait word like "introvert". Nothing about work in it.
- The signature phrase is something they say when a thing is right, in their own words, and they say it rarely.
- Plain, concrete English. No lists inside text fields.`;

export const BEHAVES = {
  E: 'gets energy from other people, thinks aloud, starts conversations with strangers',
  I: 'gets energy from time alone, thinks before speaking, prefers one deep conversation to a crowd',
  S: 'notices concrete particulars, trusts what has been tested, likes things step by step',
  N: 'notices patterns and possibilities, trusts hunches, wants to know what a thing is for and then find their own way',
  T: 'decides by what is correct and says the hard thing plainly',
  F: 'decides by who will be affected, protects feelings and loyalties, softens the hard thing',
  J: 'plans, makes lists, finishes things in order, dislikes last-minute change',
  P: 'keeps options open, starts many things, likes a change of plan',
};

export function sheetPrompt({ casting: c, seed, company, department, taken, team, lessons, year, problems = [] }) {
  const a = getArchetype(c.archetype);
  const behaviours = [...c.intendedType].map(l => BEHAVES[l]).join('; ');
  const used = [
    taken.firstHabitVerbs.length ? `Habits already begin with these verbs (use others): ${[...new Set(Object.keys(taken.habitVerbs))].slice(0, 30).join(', ')}.` : '',
    taken.signatures.length ? `Signature phrases already taken: ${taken.signatures.map(s => `"${s}"`).join(', ')}.` : '',
    taken.voiceOpeners.length ? `Voices already begin: ${taken.voiceOpeners.map(s => `"${s}"`).join(', ')}.` : '',
    taken.touchstones.length ? `Touchstones already used by others (find your own): ${taken.touchstones.slice(0, 24).join('; ')}.` : '',
  ].filter(Boolean).join('\n');
  return `${SHEET_RULES}

THIS YEAR: ${year}.
THE COMPANY: ${company.name}. ${company.purpose || ''}
THE ROOM: ${department.name}. ${department.purpose || ''}
THE POSITION: ${c.title} (${a.name}: ${a.summary}). Their typical blind spot: ${a.blindSpots.join(' or ')}. They disagree ${a.disagrees}.${c.lead ? ' They lead the room and close its sessions.' : ''}${c.reviewer ? ' Their job in the room is to object.' : ''}

WHO THEY ARE (decided)
Name: ${seed.name}. ${bornLine(c)}
${seed.seed}
The one thing only they know: ${seed.unique}.
${factsBlock(c)}
The temperament to show in what they DO off the clock: ${behaviours}.
How they disagree: ${c.dissent === 'high' ? 'often, early, on purpose' : c.dissent === 'medium' ? 'when something is wrong, plainly' : 'rarely, gently, and with a fix in hand'}.

THE REST OF THE TEAM (so this person is different)
${teamBlock(team)}
${used}${lessonBlock(lessons)}
Write only this person.${problems.length ? `\n\nYour previous attempt had these problems; fix them: ${problems.join('; ')}.` : ''}`;
}

/** @returns {Promise<{ name: string, seed: string, unique: string, skills: string[] }>} */
export async function writeSeed({ ask, model = MODELS.FAST, ...ctx }) {
  const seed = await ask({ step: 'seed', model, thinking: 'low', maxOutput: 1500, schema: SEED_SCHEMA, prompt: seedPrompt(ctx) });
  return { ...seed, name: String(seed.name).replace(/\s+/g, ' ').trim() };
}

/**
 * Write one person from a casting.
 * @param {object} input
 * @param {Function} input.ask  model.askJson
 * @param {object} input.casting  a casting row (casting.js)
 * @param {{ id: string }} input.id  the profile id to give
 * @param {{ name: string, purpose?: string }} input.company
 * @param {{ name: string, purpose?: string }} input.department
 * @param {object[]} [input.others]  profiles already written for this team, so this one is different
 * @param {{ text: string }[]} [input.lessons]
 * @param {object} [input.seed]  a seed the owner has already chosen or edited (not rewritten)
 * @param {import('../screen.js').Screen} [input.screen]
 * @param {object} [input.mandate]
 * @param {number} [input.year]
 * @returns {Promise<{ profile: object, bio: string, status: 'ready'|'draft', seed: object, checks: object }>}
 */
export async function writePerson({ ask, casting, id, company, department, others = [], lessons = [], seed: given = null, screen = null, mandate = null, year = new Date().getFullYear(), models = {}, review = true, avoidNames = [] }) {
  const sheetModel = models.sheet || MODELS.SMART;
  const taken = takenFrom(others);
  // names already in the roster are as taken as a teammate's: the seed is told, and the check holds the sheet to it
  for (const n of avoidNames) { const k = String(n).toLowerCase(); if (k && !taken.names.includes(k)) taken.names.push(k); }
  const team = others.map(p => `${p.name}: ${p.anchors?.role || ''}; ${p.anchors?.born || ''}`);
  const ctx = { casting, company, department, taken, team, lessons };

  let seed = given || await writeSeed({ ask, model: models.seed, ...ctx });

  let profile = null;
  let lint = null;
  let problems = [];
  let attempts = 0;
  let reviewed = null;
  let hard = [];
  for (let reviewPass = 0; reviewPass < 2; reviewPass++) {
    const carried = hard;                                               // what the reviewer found last pass is told to the writer this pass
    for (let attempt = 1; attempt <= MAX_SHEET_ATTEMPTS; attempt++) {
      attempts += 1;
      const sheet = await ask({
        step: 'sheet', model: sheetModel, thinking: 'low', maxOutput: 8000, schema: SHEET_SCHEMA,
        prompt: sheetPrompt({ ...ctx, seed, year, problems: [...carried, ...problems] }),
      });
      profile = assembleProfile({ id, casting, seed, sheet, writtenBy: sheetModel });
      lint = lintSheet({ profile, casting, taken, year });
      problems = lint.problems;
      if (!problems.length) break;
      // a name that is a teammate's (or is in the roster already) is the seed's fault, not the sheet's: the sheet cannot fix it, so choose the name again
      if (!given && problems.some(p => /^the (first )?name\b/i.test(p)) && attempt < MAX_SHEET_ATTEMPTS) {
        taken.names.push(seed.name.toLowerCase());
        taken.firstNames.push(seed.name.split(/[ -]/)[0].toLowerCase());
        seed = await writeSeed({ ask, model: models.seed, ...ctx });
      }
    }
    if (problems.length || !review) break;
    reviewed = await blindReview({ ask, bio: lint.bio });
    hard = hardFindings(reviewed);
    if (!hard.length) break;
    problems = [];
  }

  const checks = {
    attempts, problems, notes: lint?.notes || [],
    review: reviewed ? { advice: adviceFrom(reviewed), hard, particular: reviewed.particular_vs_type, mostGeneric: reviewed.most_generic_detail, mostSpecific: reviewed.most_specific_detail } : null,
    screen: null,
  };
  let status = problems.length || hard.length ? 'draft' : 'ready';
  if (status === 'ready' && screen) {
    checks.screen = await admissionScreen({ screen, mandate, bio: lint.bio });
    if (!checks.screen.ok) status = 'draft';
  }
  return { profile, bio: lint.bio, status, seed, checks };
}
