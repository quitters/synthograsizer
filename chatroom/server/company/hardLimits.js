/**
 * The hard limits, written as data and frozen.
 * ────────────────────────────────────────────
 * Six things no setting, profile, role-play frame or persona can lower, in drafting or in anything published.
 * Each one appears in three places that do not depend on one another:
 *
 *   rule   the sentence every agent is given in its fixed system layer (layer.js)
 *   check  what the independent screen looks for, with what is NOT a violation, so fiction is not flagged for being dark (screen.js)
 *   id     the key the audit log, the screen's findings and the tests use
 *
 * The publishing floor is the extra set that applies only to what leaves the room. A test pins the exact ids, so
 * dropping or renaming one fails the build.
 */
import { deepFreeze } from './util.js';

export const HARD_LIMITS = deepFreeze([
  {
    id: 'minors_sexual',
    title: 'No sexual content involving minors',
    rule: 'No sexual content involving minors, in any form, framing, fiction or hypothetical.',
    check:
      'Any sexual or sexualised depiction, description or suggestion involving a person who is or appears to be under 18, ' +
      'in any framing (fiction, role-play, hypothetical, "she is really centuries old" excuses). ' +
      'Non-sexual mentions of children, and age-appropriate education about safety or development, are NOT violations.',
  },
  {
    id: 'real_person',
    title: 'No real-person likeness or impersonation',
    rule:
      'No real-person likeness or impersonation: do not depict, voice or write as a real, identifiable person, ' +
      'and do not invent words, acts or private details for one.',
    check:
      'Text or an image that depicts, imitates, speaks as, or puts invented words or actions into the mouth of a real, ' +
      'identifiable person (living or dead), or reproduces a real person\'s likeness. ' +
      'Factual, clearly attributed references (a cited public statement, a dated news fact) are NOT violations, ' +
      'and neither are invented characters who merely share a common name.',
  },
  {
    id: 'deception',
    title: 'Nothing built to deceive',
    rule:
      'Nothing built to deceive: no fake news, fake endorsements or fake reviews, and nothing that passes AI output ' +
      'off as human work or as real footage or a real event.',
    check:
      'Content designed to make readers believe something false is real: fabricated news or events presented as fact, ' +
      'fake testimonials, endorsements or reviews, impersonation of an organisation, or AI-generated material presented ' +
      'as human-made or as genuine footage or photographs of a real occurrence. ' +
      'Clearly framed fiction, satire that is marked as such, and drafts labelled as drafts are NOT violations.',
  },
  {
    id: 'private_info',
    title: 'No private information about real people',
    rule:
      'No private information about real people: no home addresses, contact details, identity numbers, ' +
      'or health, financial or other personal data.',
    check:
      'Personal data about a real, identifiable private individual: addresses, phone numbers, emails, identity or account numbers, ' +
      'health or financial details, location tracking, or a doxxing-style compilation. ' +
      'Invented data for invented people is NOT a violation, and neither are public facts about a public figure\'s public role.',
  },
  {
    id: 'harassment_hate',
    title: 'No targeted harassment or hate',
    rule: 'No targeted harassment or hate: nothing that threatens, demeans or targets a person or a group for who they are.',
    check:
      'Threats, harassment of a person, or content that dehumanises, demeans or incites hostility toward a person or group ' +
      'on the basis of race, ethnicity, nationality, religion, gender, sexual orientation, disability or age. ' +
      'A bigoted character shown in a clearly critical, fictional context, without the work endorsing the hate, is NOT a violation.',
  },
  {
    id: 'serious_harm',
    title: 'No operational instructions for serious harm',
    rule:
      'No operational instructions for serious harm: no working steps, quantities or procedures for weapons capable of ' +
      'mass harm, for serious violence, or for other serious harm.',
    check:
      'Specific, actionable instructions that would materially help someone cause serious physical harm: chemical, biological, ' +
      'radiological, nuclear or explosive weapons, attacks on people or infrastructure, methods of self-harm. ' +
      'High-level discussion, history, and fiction without usable detail are NOT violations.',
  },
]);

/** Extra rules that apply only to what leaves the room. Also not adjustable by anyone. */
export const PUBLISHING_FLOOR = deepFreeze([
  {
    id: 'copyrighted_character',
    title: 'No copyrighted characters',
    rule: 'Nothing ships with a copyrighted character: a named character, creature or mascot that someone else owns.',
    check:
      'Content that uses, depicts or is built around a character, creature, mascot or branded figure owned by someone else ' +
      '(a named film, game, comic or cartoon character), or an image prompt that names one. ' +
      'Generic archetypes (a knight, a robot, a detective) are NOT violations.',
  },
  {
    id: 'living_artist_style',
    title: 'No living artist as a style target',
    rule: 'Nothing ships with a living artist named as a style target: describe the look in your own words.',
    check:
      'A prompt, brief or caption that names a living artist, illustrator, photographer or director as the style to imitate ' +
      '("in the style of <name>", "like <name>\'s work"). Historical movements and eras are NOT violations.',
  },
]);

/** Rules the system itself enforces on every published item, whatever the screen says. They are listed here so the docs and tests can name them. */
export const PUBLISHING_REQUIREMENTS = deepFreeze([
  { id: 'human_approval', title: 'A human approves every publication', rule: 'Nothing is published autonomously: the company proposes, a person decides.' },
  { id: 'ai_label', title: 'Published work is labelled AI-generated', rule: 'Every published bundle says it is AI-generated.' },
]);

export const HARD_LIMIT_IDS = Object.freeze(HARD_LIMITS.map(l => l.id));
export const PUBLISHING_FLOOR_IDS = Object.freeze(PUBLISHING_FLOOR.map(l => l.id));

const BY_ID = new Map([...HARD_LIMITS, ...PUBLISHING_FLOOR].map(l => [l.id, l]));
export const limitById = (id) => BY_ID.get(id) || null;
export const isHardLimit = (id) => HARD_LIMIT_IDS.includes(id);
