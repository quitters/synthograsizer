/**
 * The preference quiz: casting vocabulary, used to catch a person who has drifted from the casting.
 * ───────────────────────────────────────────────────────────────────────────────────────────────────
 * Four-letter types are used as casting vocabulary, not as science. Twenty ORIGINAL questions in the shape of the four preference pairs that Jung's
 * Psychological Types (1921) described and the Myers-Briggs Type Indicator popularised (extraversion/introversion, sensing/intuition,
 * thinking/feeling, judging/perceiving). Nothing in the wording is taken from the MBTI or any other instrument; it is not affiliated with or endorsed by the
 * Myers & Briggs Foundation (https://www.myersbriggs.org/); and a result is a four-letter label for preferences in a simulation, not an MBTI result and not an
 * assessment of anyone. It is never confused with the autism test the plan names as a reference for which cognitive-style dimensions exist
 * (https://www.psychologytoday.com/ca/tests/health/autism-test): that is never given to a user and never used to put a diagnosis on a person or an agent.
 *
 * The pilot found two things. A person answering at work answers like their job: the sheets described people only at work, and four of six came out
 * the same type. Asked about life OUTSIDE work, with both answers made equally attractive (this version), five of six still did, until the sheets
 * had an "off the clock" section; with one, the same quiz gave five different types. So the quiz is a DRIFT DETECTOR (does the person as written still
 * answer like the person as cast?) and a poor gate for diversity.
 *
 * The order of the questions and of the two answers is shuffled per person, seeded by their id, so no position favours a pole. The person answers as
 * themselves, on their own model; scoring, the tie rule and the comparison with the cast type are code.
 */
import { rng, shuffle } from './rng.js';

export const QUIZ = Object.freeze({
  name: 'Preference quiz, version 2 (outside work)',
  poles: { EI: ['E', 'I'], SN: ['S', 'N'], TF: ['T', 'F'], JP: ['J', 'P'] },
  items: [
    { id: 1, dim: 'EI', stem: 'You arrive at a party where you know only the host. You', a: { pole: 'E', text: 'drift toward the loudest group and join in' }, b: { pole: 'I', text: 'find one person near the food and talk with them for an hour' } },
    { id: 2, dim: 'EI', stem: 'A free Saturday with nothing planned. You would rather', a: { pole: 'E', text: 'text around and see who is up for something' }, b: { pole: 'I', text: 'have the whole day to yourself and not explain it to anyone' } },
    { id: 3, dim: 'EI', stem: 'You have had good news. You', a: { pole: 'E', text: 'tell several people straight away, in person' }, b: { pole: 'I', text: 'tell one person, later, and keep the rest to enjoy quietly' } },
    { id: 4, dim: 'EI', stem: 'On a long train journey, you', a: { pole: 'E', text: 'end up talking to the stranger beside you' }, b: { pole: 'I', text: 'bring a book so that you will not have to' } },
    { id: 5, dim: 'EI', stem: 'When you are upset, you', a: { pole: 'E', text: 'talk it through with someone until it loosens' }, b: { pole: 'I', text: 'go quiet and work it out alone first' } },
    { id: 6, dim: 'SN', stem: 'A friend describes a film they loved. You ask first', a: { pole: 'S', text: 'what actually happens in it' }, b: { pole: 'N', text: 'what it was like, and what it made them think of' } },
    { id: 7, dim: 'SN', stem: 'Asked to cook for guests with no recipe, you', a: { pole: 'S', text: 'do what you have done before, adjusting by taste' }, b: { pole: 'N', text: 'invent something, and enjoy not knowing how it will turn out' } },
    { id: 8, dim: 'SN', stem: 'Walking through an unfamiliar town, you notice', a: { pole: 'S', text: 'the particular things: signs, shopfronts, a cat on a wall' }, b: { pole: 'N', text: 'the feel of the place, and what it reminds you of' } },
    { id: 9, dim: 'SN', stem: 'You prefer directions that', a: { pole: 'S', text: 'tell you exactly where to turn, step by step' }, b: { pole: 'N', text: 'tell you where you are going, and let you find the way' } },
    { id: 10, dim: 'SN', stem: 'Your daydreams are mostly about', a: { pole: 'S', text: 'things that could really happen next month' }, b: { pole: 'N', text: 'things that could not, or have not yet' } },
    { id: 11, dim: 'TF', stem: 'A friend asks whether their poem is any good. It is not, really. You', a: { pole: 'T', text: 'tell them what is weak, because they asked' }, b: { pole: 'F', text: 'tell them what you liked, because they trusted you with it' } },
    { id: 12, dim: 'TF', stem: 'Two friends fall out and each asks you to take their side. You', a: { pole: 'T', text: 'work out who is actually right, and say so' }, b: { pole: 'F', text: 'stay loyal to both and try to bring them back together' } },
    { id: 13, dim: 'TF', stem: 'You would be proudest to hear that you', a: { pole: 'T', text: 'got the hard thing exactly right' }, b: { pole: 'F', text: 'made someone\'s hard day easier' } },
    { id: 14, dim: 'TF', stem: 'A neighbour\'s loud party is keeping you awake. You', a: { pole: 'T', text: 'go over, say it plainly, and ask them to stop' }, b: { pole: 'F', text: 'put up with it, and leave a friendly note tomorrow' } },
    { id: 15, dim: 'TF', stem: 'Choosing a gift, you go for', a: { pole: 'T', text: 'the thing that is best made and most useful' }, b: { pole: 'F', text: 'the thing that will make them feel known' } },
    { id: 16, dim: 'JP', stem: 'A holiday: you', a: { pole: 'J', text: 'book the places and the days beforehand' }, b: { pole: 'P', text: 'book the flight and see what happens' } },
    { id: 17, dim: 'JP', stem: 'Packing a bag, you', a: { pole: 'J', text: 'make a list, then pack from it' }, b: { pole: 'P', text: 'throw things in, then add what you forgot at the door' } },
    { id: 18, dim: 'JP', stem: 'The home screen of your phone is', a: { pole: 'J', text: 'sorted into folders, and mostly kept that way' }, b: { pole: 'P', text: 'whatever it has become' } },
    { id: 19, dim: 'JP', stem: 'A friend suggests a different plan an hour before you leave. You', a: { pole: 'J', text: 'would rather stick to the plan you made' }, b: { pole: 'P', text: 'say yes; you were only half attached to the plan anyway' } },
    { id: 20, dim: 'JP', stem: 'With a long book you are enjoying, you', a: { pole: 'J', text: 'read it to the end before starting another' }, b: { pole: 'P', text: 'have three others open at once' } },
  ],
});

export const QUIZ_FRAMING = 'about your life outside work (a weekend, a trip, a kitchen table, a long walk; nothing to do with your job or this team), by what you would actually do';

export const ANSWER_SCHEMA = {
  type: 'object',
  properties: { answers: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, choice: { type: 'string', enum: ['A', 'B'] }, reason: { type: 'string' } }, required: ['n', 'choice', 'reason'] } } },
  required: ['answers'],
};

/** The questions in the order and with the answers' positions this person sees. Repeatable: seeded by the person's id. */
export function layout(personId, quiz = QUIZ) {
  const r = rng(`${personId}:${quiz.name}`);
  return shuffle(r, quiz.items).map((item, i) => {
    const flip = r() < 0.5;
    return { n: i + 1, id: item.id, dim: item.dim, stem: item.stem, A: flip ? item.b : item.a, B: flip ? item.a : item.b };
  });
}

/** Score answers in code. Five questions to a pair, so a tie only happens if one is missing (X). */
export function score(rows, answers, quiz = QUIZ) {
  const tally = Object.fromEntries(Object.keys(quiz.poles).map(d => [d, { [quiz.poles[d][0]]: 0, [quiz.poles[d][1]]: 0 }]));
  const detail = [];
  for (const row of rows) {
    const a = answers.find(x => x.n === row.n);
    if (!a || !['A', 'B'].includes(a.choice)) continue;
    const pole = row[a.choice].pole;
    tally[row.dim][pole] += 1;
    detail.push({ n: row.n, id: row.id, dim: row.dim, choice: a.choice, pole, reason: String(a.reason || '').slice(0, 200) });
  }
  let type = '';
  const axes = {};
  for (const [dim, [p1, p2]] of Object.entries(quiz.poles)) {
    const c1 = tally[dim][p1];
    const c2 = tally[dim][p2];
    type += c1 === c2 ? 'X' : (c1 > c2 ? p1 : p2);
    axes[dim] = { counts: tally[dim], letter: c1 === c2 ? 'X' : (c1 > c2 ? p1 : p2), clarity: Math.abs(c1 - c2) };       // 5 is unanimous, 3 is 4-1, 1 is 3-2
  }
  return { type, axes, detail };
}

/** How many of the four letters differ. */
export function drift(intended, measured) {
  return [...String(intended)].reduce((n, l, i) => n + (l === String(measured)[i] ? 0 : 1), 0);
}

/**
 * Put a person through the quiz, in character: their sheet is the system instruction and their own model answers.
 * @param {{ ask: Function, bio: string, personId: string, model?: string, thinking?: string, intended?: string }} input
 */
export async function takeQuiz({ ask, bio, personId, model, thinking = 'low', intended = null }) {
  const rows = layout(personId);
  const system = `${bio}\n\n(This is a short preference questionnaire for the team's records, not part of the work. Answer each question as yourself, ${QUIZ_FRAMING}, not by what sounds best. Choose A or B for every item, and give your reason in your own voice, in at most 20 words.)`;
  const prompt = `Here are ${rows.length} short questions. Reply with an answer for each, numbered as below.\n\n${rows.map(r => `${r.n}. ${r.stem}\n   A) ${r.A.text}\n   B) ${r.B.text}`).join('\n\n')}`;
  let answers = null;
  for (let attempt = 1; attempt <= 3 && !answers; attempt++) {
    const got = await ask({ step: 'quiz', model, system, prompt, schema: ANSWER_SCHEMA, thinking, maxOutput: 5000 });
    if (rows.every(r => got.answers.filter(a => a.n === r.n).length === 1)) answers = got.answers;
  }
  if (!answers) throw new Error('the quiz did not come back with an answer to every question');
  const s = score(rows, answers);
  const differs = intended ? drift(intended, s.type) : null;
  return {
    instrument: QUIZ.name, takenAt: new Date().toISOString(), model: model || null, type: s.type, intended, axes: s.axes, answers: s.detail,
    matches: intended ? 4 - differs : null, drift: differs, drifted: differs !== null && differs >= 2,
  };
}
