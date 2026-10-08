/**
 * The character sheet: what the writer returns, and how it becomes an Agent Profile.
 * ───────────────────────────────────────────────────────────────────────────────────
 * Gemini writes the voice, the habits, the opinions and the way a person tells their own story; code writes the facts (the born line, the role, the
 * knob settings). The result is the Composer's v5 profile (a bioTemplate with {{placeholders}}, anchors filling them, and three knobs of four
 * settings each), so a person made here opens in the Composer and Agent Studio like any other, and renders through the same function.
 *
 * Changes from the pilot's template, each a finding from it:
 *   - no "how the team works" paragraph: that is the company's house rules now (one copy, in the fixed layer, that outranks the sheet);
 *   - an "off the clock" section: the people as written answered like their jobs until the sheet showed who they are outside work;
 *   - a signature phrase marked rare: a line written as "what she says when impressed" was said whether or not she was.
 */
import { rng, between } from './rng.js';

export const KNOBS = Object.freeze(['tempo', 'candor', 'push']);

const knob = {
  type: 'object',
  properties: { values: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } } },
  required: ['values'],
};

export const SHEET_SCHEMA = {
  type: 'object',
  properties: {
    identity_line: { type: 'string', description: 'One sentence saying who this person is on the team and what they are known for. Does not start with their name.' },
    upbringing: { type: 'string', description: 'Two or three sentences on where they grew up and what shaped them. Use the facts you were given about who raised them; invent nothing about the family beyond those.' },
    career: { type: 'string', description: 'Three or four sentences: the jobs, places and years that led here, including the setback you were given. Years must be after the birth year.' },
    touchstones: { type: 'array', minItems: 4, maxItems: 5, items: { type: 'string' }, description: 'Works, places, games, objects, sounds, institutions or brands that formed their taste. No living artists, authors, directors or musicians; no real people.' },
    off_clock: { type: 'string', description: 'Four or five sentences, third person: a free Saturday; a party or a long journey; when they are upset; how they plan a holiday; and the irrational fondness you were given. Behaviour, not traits; nothing about work.' },
    working_style: { type: 'string', description: 'Two sentences on how they actually work in a team.' },
    habits: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' }, description: 'Three concrete, observable habits, each beginning with a different verb.' },
    voice: { type: 'string', description: 'How they speak: sentence length, tics, what they never say. Begin with something particular to them, not "short, declarative".' },
    signature: { type: 'string', description: 'One short phrase (3 to 8 words) they say when something is right, in their own words. It will be marked as rare.' },
    opinions: {
      type: 'array', minItems: 3, maxItems: 3,
      items: { type: 'object', properties: { claim: { type: 'string' }, because: { type: 'string', description: 'The reason, from their own life.' } }, required: ['claim', 'because'] },
      description: 'Three opinions about the work (craft, process, taste) that they will defend in a meeting, and that others on the team could disagree with.',
    },
    blind_spot: { type: 'string', description: 'One real flaw that costs the team something.' },
    dissent_style: { type: 'string', description: 'How they disagree, and what makes them back down.' },
    tempo: knob, candor: knob, push: knob,
  },
  required: ['identity_line', 'upbringing', 'career', 'touchstones', 'off_clock', 'working_style', 'habits', 'voice', 'signature', 'opinions', 'blind_spot', 'dissent_style', 'tempo', 'candor', 'push'],
};

export const SEED_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Their full name as they would give it: two to four words, plausible for their origin, year of birth and family. Not the name of any famous real person.' },
    seed: { type: 'string', description: 'Three plain sentences: who they are at work and how they got here. Use the facts given.' },
    unique: { type: 'string', description: 'The one thing only this person knows or can do that the others on the team cannot, as a short clause that begins "knows how to ..." or "can ...".' },
    skills: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' }, description: 'Skills, as short phrases.' },
  },
  required: ['name', 'seed', 'unique', 'skills'],
};

export const BIO_TEMPLATE = `{{agent_name}}, the {{role}}. {{identity_line}}

WHO YOU ARE
{{born}} {{upbringing}}
Your path: {{career}}
Things that formed your taste: {{touchstones}}.
Off the clock: {{off_clock}}

HOW YOU WORK
{{working_style}}
Your habits: {{habits}}.
How you speak: {{voice}} A phrase of yours, used rarely (once a session at most, and never as the last words of a message): "{{signature}}".
What you will argue for in any meeting:
{{opinions}}
Your blind spot: {{blind_spot}}
When you disagree: {{dissent_style}}

TODAY
Your pace: {{tempo}}. Your candor: {{candor}}. What you will push on: {{push}}.`;

const ICONS = { steward: '🎭', director: '🎬', storyteller: '📖', craftsman: '🎞️', archivist: '🗂️', contrarian: '🔍', machinist: '⚙️', editor: '✂️', facilitator: '🤝', scout: '🔭', analyst: '📊' };
const COLORS = ['#b86840', '#c08a30', '#4f7aa8', '#7a6e5e', '#a84868', '#5a9870', '#8868a8', '#3f8f8f', '#a05a5a', '#6a7fb0', '#9a8a40', '#5a7a5a'];

const noStop = (s) => String(s).trim().replace(/[.;]+$/, '');
const list = (a) => a.map(noStop).join('; ');
const bullets = (ops) => ops.map(o => `- ${noStop(o.claim)}. (${noStop(o.because)}.)`).join('\n');

/** The born line, from the facts the draw gave (never the writer's). */
export function bornLine(casting) {
  const b = casting.birthplace;
  let line = `Born in ${b.city}, ${b.country}, in ${casting.bornYear}.`;
  if (casting.moved) line += ` Moved to ${casting.moved.to.city}, ${casting.moved.to.country}, at ${casting.moved.age}.`;
  return line;
}

/**
 * Which setting of each knob a person starts at, from how they disagree: a dissenter is brisk, blunt and insistent; a gentle person is not. Seeded, so the
 * same person gets the same settings. A session redraws them (admit.js) within the same band: what changes day to day is small.
 */
export function chooseKnobs(casting, seed) {
  const r = rng(`${seed}:knobs`);
  const band = { high: { candor: [2, 3], push: [2, 3], tempo: [1, 2] }, medium: { candor: [1, 2], push: [1, 2], tempo: [1, 2] }, low: { candor: [0, 1], push: [0, 2], tempo: [0, 2] } }[casting.dissent] || { candor: [1, 2], push: [1, 2], tempo: [1, 2] };
  return Object.fromEntries(KNOBS.map(k => [k, between(r, band[k][0], band[k][1])]));
}

/**
 * Put the writer's output and the drawn facts together as an Agent Profile (v5).
 * @param {{ id: string, casting: object, seed: { name: string, seed: string, unique: string, skills: string[] }, sheet: object, writtenBy?: string, label?: string }} input
 */
export function assembleProfile({ id, casting, seed, sheet, writtenBy = null, label = 'Company flow' }) {
  const knobIdx = chooseKnobs(casting, id);
  const variables = KNOBS.map(name => ({
    name, feature_name: name[0].toUpperCase() + name.slice(1), valueIdx: knobIdx[name],
    values: sheet[name].values.map((text, w) => ({ text, weight: 1 + (w === knobIdx[name] ? 1 : 0) })),
  }));
  return {
    id,
    name: seed.name,
    icon: ICONS[casting.archetype] || '🙂',
    color: COLORS[Math.abs(hash(id)) % COLORS.length],
    category: 'roleplay',
    description: `${casting.title[0].toUpperCase()}${casting.title.slice(1)}. Born ${casting.bornYear}, ${casting.birthplace.city}.`,
    bioTemplate: BIO_TEMPLATE,
    variables,
    anchors: {
      agent_name: seed.name, role: casting.title.toLowerCase(), identity_line: sheet.identity_line, born: bornLine(casting), upbringing: sheet.upbringing, career: sheet.career,
      touchstones: list(sheet.touchstones), off_clock: sheet.off_clock, working_style: sheet.working_style, habits: list(sheet.habits), voice: sheet.voice,
      signature: noStop(sheet.signature).replace(/^["“']|["”']$/g, ''), opinions: bullets(sheet.opinions), blind_spot: sheet.blind_spot, dissent_style: sheet.dissent_style,
    },
    tags: [{ type: 'creator', label }],
    // Everything below has no place in the v5 format. Unknown fields survive the Composer's migration and are not shown there.
    x_flow: {
      archetype: casting.archetype, intendedType: casting.intendedType, unique: seed.unique, skills: seed.skills, seed: seed.seed, writtenBy,
      run: { tier: casting.tier, model: casting.model, thinkingLevel: casting.thinking },
    },
  };
}

function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
