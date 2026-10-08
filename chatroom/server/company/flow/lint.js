/**
 * The code checks on a character sheet, run before anyone reads it.
 * ──────────────────────────────────────────────────────────────────
 * The pilot's person read six 5,000-character sheets and made 56 edits, nine a person. About half of what they found a program could have found: a
 * placeholder left unfilled, a year before the birth year, a first-person slip in a third-person sheet, four people whose first habit began "taps",
 * two near-identical "that holds water" lines, three garment-trade families. These are those checks, as a function: it returns PROBLEMS (the writer
 * is asked again with them, up to twice) and NOTES (a person might want to look). What only a person finds (a stereotype that is a matter of
 * judgement) goes to the blind reviewer (review.js), and what it finds is advice for the approval screen, never a gate.
 *
 * Nothing here talks to a model.
 */
import { renderBio } from '../profileBio.js';
import { scanForSecrets } from '../secrets.js';
import { WATCHED_TRADES, GLOBALLY_WATCHED } from './tables.js';

const AI_WORDS = /\b(AI|A\.I\.|artificial intelligence|language model|chatbot|LLM|a program|an algorithm)\b/;
const CONTACT = /https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d/i;
const FIRST_PERSON = /\b(I|I'm|I've|I'd|I'll|me|my|myself)\b/;          // (not "mine": a mine is also a place people work)
const TYPE_WORDS = /\b(?:[EI][SN][TF][JP]|introvert\w*|extrovert\w*|extravert\w*|MBTI|Myers[- ]Briggs)\b/;
const WORKY = /\b(work(?:ing|s|ed)?|office|job|team|project|client|deadline|meeting|studio|colleague\w*)\b/i;
const THIRD_PERSON_FIELDS = ['upbringing', 'career', 'touchstones', 'working_style', 'habits', 'blind_spot', 'dissent_style', 'identity_line', 'off_clock'];
const MOTIF_FIELDS = ['habits', 'touchstones', 'upbringing', 'career', 'voice', 'working_style', 'off_clock'];

// Ordinary words that a lot of sheets share without it meaning anything
const STOP = new Set(`parent three design about above after again against also another because been before being between both could does doing down during each every from have having here into itself just like made make many more most much must never only other over same should since some such than that their them then there these they this those through under until very what when where which while will with without would your yours years year first still often always really
where whose whom whether among along around behind beyond across toward towards within upon onto once even ever else either neither
impressed impress genuinely genuine simply whisper whispers
learned taught teaching early family household spent spend spends career team teams worked working work works started start moved move left later eventually finally became become becomes known person people thing things time times day days long short small large little great good well best better
prompt prompts engine engines image images visual visuals desk room meeting meetings project projects creative studio company
speaks speak speaking sentences sentence words word says said uses used using habit habits hands hand`.split(/\s+/).filter(Boolean));
const stem = (w) => w.toLowerCase().replace(/(ing|ed|es|s)$/, '');

const tokens = (s) => new Set((String(s).toLowerCase().match(/[a-z]+/g) || []));
const jaccard = (a, b) => { const A = tokens(a); const B = tokens(b); const i = [...A].filter(x => B.has(x)).length; return i / (A.size + B.size - i || 1); };
const firstWord = (s) => stem((String(s).match(/^[A-Za-z]+/) || [''])[0]);

/** What the other people on the team have already used: names, habit verbs, signature phrases, the stems of the words their sheets share (`roomMates`: whose words count). */
export function takenFrom(profiles, { ignore = null, roomMates = null } = {}) {
  const out = { names: [], firstNames: [], habitVerbs: {}, firstHabitVerbs: [], signatures: [], voiceOpeners: [], words: new Map(), touchstones: [] };
  profiles.forEach((p, idx) => {
    const a = p.anchors || {};
    const name = String(p.name || a.agent_name || '');
    out.names.push(name.toLowerCase());
    out.firstNames.push(name.split(/[ -]/)[0].toLowerCase());
    const habits = String(a.habits || '').split(/;\s*/).filter(Boolean);
    habits.forEach((h, i) => { const v = firstWord(h); if (v) { out.habitVerbs[v] = (out.habitVerbs[v] || 0) + 1; if (i === 0) out.firstHabitVerbs.push(v); } });
    if (a.signature) out.signatures.push(String(a.signature));
    out.voiceOpeners.push(String(a.voice || '').toLowerCase().split(/\s+/).slice(0, 2).join(' '));
    out.touchstones.push(...String(a.touchstones || '').split(/;\s*/).filter(Boolean));
  });
  // Names, signature phrases and habit verbs must be different across the whole company. Words are held to the people in the same room: with a dozen sheets in the
  // company, a plain word turns up in three of them by chance, and what a room would hear as the writer repeating itself is the people it talks to.
  (roomMates || profiles).forEach((p, idx) => {
    for (const w of sheetWords(p.anchors || {}, ignore)) { if (!out.words.has(w)) out.words.set(w, new Set()); out.words.get(w).add(idx); }
  });
  return out;
}

/** The stems of the uncommon words in a sheet's habits, touchstones, upbringing, career, voice, working style and off-the-clock section (not the person's own name). */
export function sheetWords(anchors, ignore = null) {
  const own = new Set(String(anchors.agent_name || '').toLowerCase().split(/\W+/).map(stem));
  const set = new Set();
  for (const k of MOTIF_FIELDS) for (const w of String(anchors[k] || '').toLowerCase().match(/[a-z][a-z'-]{4,}/g) || []) if (!STOP.has(w) && !STOP.has(stem(w)) && !own.has(stem(w)) && !(ignore && ignore.has(stem(w)))) set.add(stem(w));
  return set;
}

/**
 * The words of the place a person works (the company's name and purpose, the room's name and purpose): everyone's sheet is written for the same place, so
 * everyone's sheet will use them, and that is not a motif to avoid.
 * @returns {Set<string>} their stems
 */
export function contextWords(...texts) {
  const set = new Set();
  for (const t of texts) for (const w of String(t || '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) set.add(stem(w));
  return set;
}

/** How many words a sheet may share with two or more of its room-mates before it is sent back. */
export const SHARED_WORDS_LIMIT = 12;

export const EMPTY_TAKEN = Object.freeze(takenFrom([]));

/**
 * @param {{ profile: object, casting: object, taken?: ReturnType<typeof takenFrom>, year?: number }} input
 * @returns {{ bio: string, problems: string[], notes: string[] }}
 */
export function lintSheet({ profile, casting, taken = EMPTY_TAKEN, year = new Date().getFullYear(), ignore = null }) {
  const problems = [];
  const notes = [];
  const a = profile.anchors;
  const bio = renderBio(profile);

  // (rendering drops a placeholder nobody filled, so look for it in the template: every {{name}} needs an anchor or a knob, and a value)
  const known = new Map([...Object.entries(a), ...(profile.variables || []).map(v => [v.name, v.values?.[v.valueIdx ?? 0]?.text ?? ''])]);
  const unfilled = [...String(profile.bioTemplate).matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g)].map(m => m[1]).filter(name => !String(known.get(name) ?? '').trim());
  if (unfilled.length) problems.push(`nothing fills ${[...new Set(unfilled)].map(n => `{{${n}}}`).join(', ')} in the template`);
  if (bio.length < 2500 || bio.length > 6500) problems.push(`the bio is ${bio.length} characters; it should be 2,500 to 6,500`);
  if (!/^[^,.]{1,60},\s*(?:the\s+)?([^.]{1,60})\./.test(bio)) problems.push('the bio does not begin "Name, the role." (the transcript viewer reads the role from it)');
  if (AI_WORDS.test(JSON.stringify(a))) problems.push('the sheet mentions AI or a program; these are people');
  if (CONTACT.test(bio)) problems.push('the sheet holds a URL, an email address or a phone number');
  if (scanForSecrets(bio).length) problems.push('the sheet looks like it holds a secret');

  const years = [...(`${a.upbringing} ${a.career} ${a.off_clock}`).matchAll(/\b(19[4-9]\d|20[0-2]\d)\b/g)].map(m => Number(m[1]));
  if (years.some(y => y < casting.bornYear - 2)) problems.push(`a year before the birth year ${casting.bornYear} appears`);
  if (years.some(y => y > year)) problems.push(`a year after ${year} appears`);
  if (years.length) notes.push(`years named: ${years.join(', ')} (born ${casting.bornYear})`);

  for (const k of THIRD_PERSON_FIELDS) {
    const m = FIRST_PERSON.exec(String(a[k] || ''));
    if (m) problems.push(`${k} slips into the first person ("${m[0]}"); every other part is in the third`);
  }
  for (const k of ['habits', 'voice', 'off_clock', 'working_style', 'identity_line']) {
    const m = TYPE_WORDS.exec(String(a[k] || ''));
    if (m) problems.push(`${k} names a personality type or label ("${m[0]}"); show the temperament as behaviour`);
  }
  if (WORKY.test(String(a.off_clock || ''))) notes.push('the off-the-clock section mentions work');

  // The draw gave who raised them; a sheet that puts their family in a trade the draw did not give is reaching for a stereotype.
  const carers = (casting.carers || []).join(' ').toLowerCase();
  const watched = [...(WATCHED_TRADES[casting.birthplace?.region] || []), ...GLOBALLY_WATCHED];
  const upbringing = String(a.upbringing || '').toLowerCase();
  const hit = watched.find(w => upbringing.includes(w) && !carers.includes(w));
  if (hit) problems.push(`upbringing gives the family a trade ("${hit}") that the facts did not; use only what you were told about who raised them`);
  if (casting.carers?.length) {
    const nouns = casting.carers.flatMap(c => c.toLowerCase().match(/[a-z]{5,}/g) || []).filter(w => !['worked', 'which', 'would', 'their', 'plant', 'that', 'made', 'also', 'drove', 'taught'].includes(w));
    if (nouns.length && !nouns.some(w => upbringing.includes(w.slice(0, Math.max(5, w.length - 2))))) notes.push('upbringing does not use the facts about who raised them');
  }

  // The knobs: four distinct settings of a sensible length
  for (const v of profile.variables || []) {
    const t = (v.values || []).map(x => x.text);
    if (t.length !== 4 || t.some(x => x.length < 8 || x.length > 110)) problems.push(`${v.name}: the four settings must each be 8 to 110 characters`);
    else if (new Set(t).size !== 4) problems.push(`${v.name}: the four settings are not distinct`);
  }

  // The signature phrase: short, and not a teammate's
  const sig = String(a.signature || '');
  if (sig.length < 3 || sig.length > 70) problems.push('the signature phrase should be 3 to 70 characters');
  const nearSig = taken.signatures.find(s => jaccard(s, sig) >= 0.5);
  if (nearSig) problems.push(`the signature phrase "${sig}" is too close to a teammate's ("${nearSig}")`);

  // Names: not a teammate's, and no teammate's first name
  const name = String(profile.name || '').toLowerCase();
  if (taken.names.includes(name)) problems.push('the name is already a teammate\'s');
  const first = name.split(/[ -]/)[0];
  if (first && taken.firstNames.includes(first)) problems.push(`the first name "${first}" is already a teammate's; the room would confuse them`);

  // Habits: a verb two others already start a habit with, or the same first-habit verb as someone, is the writer repeating itself
  const habits = String(a.habits || '').split(/;\s*/).filter(Boolean);
  const verbs = habits.map(firstWord);
  const repeated = verbs.filter(v => v && (taken.habitVerbs[v] || 0) >= 2);
  if (repeated.length) problems.push(`habits begin with verbs that two teammates' habits already begin with ("${repeated.join('", "')}"); use different ones`);
  if (verbs[0] && taken.firstHabitVerbs.includes(verbs[0])) problems.push(`the first habit begins with "${verbs[0]}", as a teammate's first habit does`);
  const opener = String(a.voice || '').toLowerCase().split(/\s+/).slice(0, 2).join(' ');
  if (opener && taken.voiceOpeners.includes(opener)) notes.push(`the voice begins "${opener}", as a teammate's does`);
  if (/^[^.]{0,80}\bshort\b/i.test(String(a.voice || ''))) notes.push('the voice is described as "short"');

  // Words the room's other sheets already use. A few are only chance: real sheets of three or four thousand characters share plain words (the first live run sent
  // people back for "mother", "table" and "heavy"), so a handful is a note for the person who reads the sheet, and only a sheet that copies its room-mates (a dozen
  // or more) is sent back to the writer.
  const shared = [...sheetWords(a, ignore)].filter(w => (taken.words.get(w)?.size || 0) >= 2);
  if (shared.length >= SHARED_WORDS_LIMIT) problems.push(`words that two or more teammates' sheets already use: ${shared.slice(0, 8).join(', ')} and ${shared.length - 8} more; find your own`);
  else if (shared.length >= 3) notes.push(`words that two or more teammates' sheets already use: ${shared.join(', ')}`);
  else if (shared.length) notes.push(`words shared with two or more teammates: ${shared.join(', ')}`);

  const names = new Set();
  for (const k of ['upbringing', 'career', 'touchstones', 'opinions']) for (const m of String(a[k] || '').matchAll(/(?<![\p{L}])\p{Lu}\p{Ll}+(?: \p{Lu}\p{Ll}+)+(?![\p{L}])/gu)) names.add(m[0]);
  if (names.size) notes.push(`capitalised names to eyeball: ${[...names].join('; ')}`);

  return { bio, problems, notes };
}
