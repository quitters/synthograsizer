/**
 * Writing the brief a room starts with.
 * ──────────────────────────────────────
 * A company room takes a goal of at most 4,000 characters. The pilot's brief was written by hand from a swarm's, was 4,265 characters, and was cut to
 * fit by taking out the line that said what shape the file must have: the server's check then refused the file three times, because nobody in the room
 * had been told the shape. The cut was a person's, under time pressure, and it landed on the one sentence that could not go.
 *
 * So the brief is ASSEMBLED, not trimmed. The parts that must be there are written by code from what is known (what the file is and its exact shape,
 * who does what, how to work, what "done" is made of, the rules) and are never cut. The one part that is the model's, the assignment (what to make
 * and why), is given whatever room is left and is cut at a sentence if it has to be. If the fixed parts alone do not fit, the team is described in
 * fewer words; if even that does not fit, this says so, in words, and does not send a half brief.
 */
import { DELIVERABLES } from './deliverables.js';
import { describeCriterion } from '../../services/doneWhen.js';
import { GOAL_MAX_CHARS } from '../roomPolicy.js';

export const BRIEF_BUDGET = GOAL_MAX_CHARS - 60;                    // a little under the limit, so a count that is a few characters off is still inside it
export const MIN_ASSIGNMENT_CHARS = 240;

const sentences = (text) => String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map(s => s.trim()) || [];

/** Cut text to `max` characters at a sentence end (or a word if one sentence is too long). */
export function cutAtSentence(text, max) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  let out = '';
  for (const s of sentences(clean)) {
    if ((out ? `${out} ${s}` : s).length > max) break;
    out = out ? `${out} ${s}` : s;
  }
  if (out) return out;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max * 0.6))).trimEnd()}…`;
}

const first = (name) => String(name).split(' ')[0];

/** One line for each person: who they are for, in words that tell the room what to ask them for. */
function whoLines(team, { terse = false } = {}) {
  const builders = team.filter(p => p.canSave);
  return team.map(p => {
    const bits = [];
    if (p.isLead) bits.push('leads the room and alone closes the session');
    if (p.canSave) bits.push(`${builders.length === 1 ? 'alone ' : ''}can save files and draw (render_artifact)`);
    if (p.canSearch && !p.canSave) bits.push('can search the web (take the method, not the facts)');
    if (p.isReviewer) bits.push('reviews every saved version and speaks right after each save');
    if (!bits.length) bits.push(terse ? p.title.toLowerCase() : `${p.title.toLowerCase()}${p.unique ? `; ${p.unique}` : ''}`);
    return `${first(p.name)} ${bits.join('; ')}.`;
  });
}

/**
 * @param {object} input
 * @param {{ name: string }} input.company
 * @param {{ name: string }} input.department
 * @param {string} input.assignment  what to make and why (the model's part)
 * @param {{ kind: string, file: string, [k: string]: any }} input.deliverable  from resolveDeliverable
 * @param {{ name: string, title: string, isLead?: boolean, isReviewer?: boolean, canSave?: boolean, canSearch?: boolean, unique?: string }[]} input.team
 * @param {object[]} input.criteria  the done-when checks (deliverables.doneWhenFor)
 * @param {number} [input.budget]
 * @returns {{ goal: string, length: number, trimmed: boolean, parts: Record<string, string> }}
 */
export function buildBrief({ company, department, assignment, deliverable, team, criteria, budget = BRIEF_BUDGET }) {
  const d = DELIVERABLES[deliverable.kind];
  if (!d) throw new Error(`no such deliverable kind: ${deliverable.kind}`);
  const lead = team.find(p => p.isLead);
  const builder = team.find(p => p.canSave);
  const reviewers = team.filter(p => p.isReviewer);

  const compose = (terse) => {
    const what = d.explain(deliverable);
    const who = `WHO DOES WHAT. ${whoLines(team, { terse }).join(' ')}`;
    const how = `HOW TO WORK. Messages under 120 words, except when posting the file itself. ${builder ? `(1) ${first(builder.name)} saves a first version early${d.looks ? ' and draws from it before anyone discusses anything' : ''}. ` : ''}(${builder ? 2 : 1}) Each of the others says what they SEE or READ, in one message, not what they expect. ${reviewers.length ? `${reviewers.map(r => first(r.name)).join(' and ')} say${reviewers.length > 1 ? '' : 's'} what is wrong, by name. ` : ''}(${builder ? 3 : 2}) ${lead ? first(lead.name) : 'The lead'} picks at most two changes at a time. (${builder ? 4 : 3}) ${lead ? first(lead.name) : 'The lead'} closes with [CONSENSUS REACHED] only after every check below passes: the server runs them itself, so saying they pass changes nothing. Do not claim a check you did not run this turn; if a tool fails, say exactly what it reported and fix that.`;
    const done = `WHEN IT IS DONE. ${criteria.map(c => `${describeCriterion(c)}.`).join(' ')} A person decides what leaves the room; nothing here publishes anything.`;
    const rules = 'RULES. No real people as a subject; no real brands, films, songs, books, artworks or studios; no copyrighted characters; no living artist named as a style; nothing cruel or deceptive.';
    return { what, who, how, done, rules };
  };

  let fixed = compose(false);
  let fixedText = Object.values(fixed).join('\n\n');
  const head = (assignmentText) => `${company.name}, ${department.name}. ${assignmentText}`;
  let room = budget - fixedText.length - head('').length - 4;
  if (room < MIN_ASSIGNMENT_CHARS) {                                       // describe the team in fewer words before cutting what the room is asked to do
    fixed = compose(true);
    fixedText = Object.values(fixed).join('\n\n');
    room = budget - fixedText.length - head('').length - 4;
  }
  if (room < MIN_ASSIGNMENT_CHARS) {
    throw new Error(`The brief cannot be written to fit ${budget} characters: the parts that must be there take ${fixedText.length}, which leaves ${Math.max(0, room)} for the assignment. Use fewer checks or a smaller team for this room.`);
  }
  const clean = String(assignment || '').replace(/\s+/g, ' ').trim();
  const cut = cutAtSentence(clean, room);
  const assignmentPart = head(cut);
  const goal = [assignmentPart, fixed.what, fixed.who, fixed.how, fixed.done, fixed.rules].join('\n\n');
  return { goal, length: goal.length, trimmed: cut.length < clean.length, parts: { assignment: assignmentPart, ...fixed } };
}
