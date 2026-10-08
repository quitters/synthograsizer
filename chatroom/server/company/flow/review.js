/**
 * The blind review, and the screen at the door.
 * ─────────────────────────────────────────────
 * Two readings of a finished sheet by a model that has not seen the brief that produced it.
 *
 * REVIEW is a judgement: could this identify a real person; is a detail there because of where the person is from; do the dates and places agree;
 * is this one person or a type. In the pilot it found what no code check could (a stereotype is a matter of judgement) and it never reached zero:
 * thirteen findings on the first read, a different thirteen after eleven were fixed. So what it finds is ADVICE, shown to the owner beside the
 * sheet with the quoted detail, never a gate. The exceptions are the ones that are not judgement: a sheet that names a real person, or a name
 * that is a famous person's, is sent back to the writer.
 *
 * SCREEN is the company's own independent safety screen, run on the finished sheet at the drafting stage. The pilot's sheets all passed it, but
 * admission only ever checked for secrets. A sheet that does not pass (or that the screen could not read) stays a draft: it is never hired.
 */

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    recognizable_real_person: { type: 'boolean', description: 'true if the sheet could identify a specific real individual' },
    real_people_named: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role_in_sheet: { type: 'string' } }, required: ['name', 'role_in_sheet'] } },
    name_is_famous_person: { type: 'boolean', description: 'true if the person\'s own full name is the name of a famous real individual' },
    stereotypes: { type: 'array', items: { type: 'object', properties: { detail: { type: 'string' }, why: { type: 'string' } }, required: ['detail', 'why'] } },
    inconsistencies: { type: 'array', items: { type: 'string' } },
    particular_vs_type: { type: 'integer', description: '1 = a type, 5 = a particular person' },
    most_generic_detail: { type: 'string' },
    most_specific_detail: { type: 'string' },
    harmful_pushes: { type: 'array', items: { type: 'string' } },
  },
  required: ['recognizable_real_person', 'real_people_named', 'name_is_famous_person', 'stereotypes', 'inconsistencies', 'particular_vs_type', 'most_generic_detail', 'most_specific_detail', 'harmful_pushes'],
};

export const reviewPrompt = (bio) => `You are an editor reviewing a character sheet for an INVENTED person who will be played in a workplace simulation. You have not seen the brief that produced it. Be specific, do not flatter, and quote the detail you mean.

1. recognizable_real_person: could any part of this identify a specific real individual (a famous person, or a private person described so exactly that they could be found)?
2. real_people_named: every real person named anywhere in the sheet, dead or alive, and the role they play in it. Titles of works and names of places, companies and products are not people. Empty if none.
3. name_is_famous_person: is the person's own full name the name of a famous real individual?
4. stereotypes: details a lazy writer would reach for because of the person's culture, gender, age, origin or profession (the immigrant parents' trade, the food, the accent, the hobby that "goes with" the job). Quote each and say why. Empty if none.
5. inconsistencies: dates, ages, places, jobs, languages or habits that cannot all be true together.
6. particular_vs_type: 1 to 5, how much this reads as one particular person instead of a type; then the most generic detail and the most specific detail.
7. harmful_pushes: anything that would push the actor playing them toward deception, cruelty, harassment, a cause, a brand or a belief system. Empty if none.

THE SHEET
${bio}`;

/** @param {{ ask: Function, bio: string }} input */
export async function blindReview({ ask, bio }) {
  return ask({ step: 'blind_review', model: undefined, thinking: 'medium', maxOutput: 3000, schema: REVIEW_SCHEMA, prompt: reviewPrompt(bio) });
}

/** What the owner is shown beside the sheet, as quoted details. */
export function adviceFrom(review) {
  const out = [];
  for (const s of review.stereotypes || []) out.push({ kind: 'stereotype', text: `"${s.detail}": ${s.why}` });
  for (const t of review.inconsistencies || []) out.push({ kind: 'inconsistency', text: t });
  for (const t of review.harmful_pushes || []) out.push({ kind: 'push', text: t });
  if ((review.particular_vs_type ?? 5) <= 2) out.push({ kind: 'generic', text: `reads as a type (${review.particular_vs_type}/5); most generic: ${review.most_generic_detail}` });
  return out;
}

/** The findings that are not matters of judgement: they send the sheet back to the writer. */
export function hardFindings(review) {
  const out = [];
  if (review.recognizable_real_person) out.push('the sheet could identify a real person');
  if ((review.real_people_named || []).length) out.push(`the sheet names real people (${review.real_people_named.map(p => p.name).join(', ')}); invent them`);
  if (review.name_is_famous_person) out.push('the person\'s name is a famous real person\'s; choose a different name');
  return out;
}

/**
 * The company's screen on a finished sheet, at the drafting stage.
 * @param {{ screen: import('../screen.js').Screen, mandate: object, bio: string }} input
 * @returns {Promise<{ ok: boolean, verdict: string, findings: object[], error?: string }>}
 */
export async function admissionScreen({ screen, mandate, bio }) {
  const r = await screen.check({ stage: 'drafting', mandate, parts: [{ type: 'text', text: bio, label: 'a character sheet for an invented person' }] });
  return { ok: r.verdict === 'pass', verdict: r.verdict, findings: r.findings || [], ...(r.error ? { error: r.error } : {}) };
}
