/**
 * Stand-ins for the model, for the flow's tests: a deterministic writer that produces a valid sheet for any casting, and a router that answers each
 * step of the flow (seed, sheet, blind review, quiz, plan, memory) from a table the test can override. Not imported by anything outside the tests.
 */
import { castPositions } from './casting.js';
import { planOrg } from './orgs.js';
import { layout } from './quiz.js';

const NOUNS = ['harbour', 'ledger', 'lantern', 'bellows', 'compass', 'quarry', 'trellis', 'foundry', 'almanac', 'kettle', 'orchard', 'signal', 'loom', 'chisel', 'meadow', 'sextant', 'cistern', 'bobbin', 'tinder', 'anvil',
  'canal', 'pewter', 'thicket', 'mortar', 'gable', 'rivet', 'cobbler', 'tundra', 'plinth', 'mangle', 'ferrule', 'flume', 'wicker', 'brazier', 'furrow', 'galley', 'hawser', 'inkwell', 'jetty', 'kiln',
  'lathe', 'moraine', 'nursery', 'oxbow', 'paddock', 'quoin', 'rampart', 'spindle', 'turret', 'umbra', 'vestry', 'warren', 'yardarm', 'zenith', 'abacus', 'buttress', 'cornice', 'dowel', 'eyelet', 'fulcrum'];
const VERBS = ['keeps', 'sketches', 'counts', 'hums', 'reads', 'sorts', 'labels', 'lists', 'folds', 'walks', 'repairs', 'collects', 'tunes', 'paces', 'rehearses', 'borrows', 'mends', 'copies', 'circles', 'whittles', 'stacks', 'trims', 'weighs', 'draws'];
const SIGNATURES = ['Good. That one stays', 'Now we are getting somewhere', 'Fine. Move on', 'That will do nicely', 'There it is', 'Leave it exactly there', 'Not bad at all', 'I would sign that'];

const n = (i, k) => NOUNS[(i * 11 + k * 3) % NOUNS.length];
const v = (i, k) => VERBS[(i * 5 + k * 7) % VERBS.length];

const knob = (i, name) => ({ values: [`${name} one and unhurried, number ${i}`, `${name} two and steady, number ${i}`, `${name} three and brisk, number ${i}`, `${name} four and insistent, number ${i}`] });

/** A valid sheet for a casting, different for each `i`, long enough to pass the length check. */
export function fakeSheet(casting, seed, i = 0, over = {}) {
  const c = casting;
  const sheet = {
    identity_line: `Known on the team for the ${n(i, 1)} and the ${n(i, 2)} they bring to every ${c.title.toLowerCase()} decision.`,
    upbringing: `Grew up in ${c.birthplace.city}, in a household with ${c.siblings} sibling${c.siblings === 1 ? '' : 's'}, where ${c.carers[0]} set the hours and the ${n(i, 3)} by the window set the mood. Learned early to read a ${n(i, 4)} by its weight, and to wait for the ${n(i, 5)} to come round before saying anything at all. Remembers the street for its ${n(i, 41)} more than for its people, and says so without apology.`,
    career: `Started out ${c.path}, in ${c.bornYear + 22}, and spent the first years learning where the ${n(i, 6)} ended and the ${n(i, 7)} began. Then came ${c.setback}, which changed how they plan: they now keep a spare ${n(i, 8)} in every drawer. Since then, ${c.yearsInField} years of steady work, most of it with a ${n(i, 9)} nearby and a ${n(i, 42)} in reserve for the days when the plan falls apart and somebody has to say what comes next.`,
    touchstones: [`the ${n(i, 10)} on the corner`, `a ${n(i, 11)} song heard once`, `the ${n(i, 12)} game`, `a ${n(i, 13)} museum`, `the smell of ${n(i, 14)} in autumn`],
    off_clock: `On a free Saturday they head for the ${n(i, 15)} with a flask and no plan. At a party they find the ${n(i, 16)} table and stay there; on a long journey they watch the ${n(i, 17)} go by. When upset they walk the length of the ${n(i, 18)} twice. They plan a holiday around one ${n(i, 19)} and let the rest happen, and they are irrationally fond of ${c.fondness}.`,
    working_style: `Works from the ${n(i, 20)} outward, one small piece at a time. Says what they will do next before doing it, and then does it.`,
    habits: [`${v(i, 0)} a ${n(i, 21)} beside the keyboard`, `${v(i, 1)} the ${n(i, 22)} before each session`, `${v(i, 2)} every ${n(i, 23)} that crosses the desk`],
    voice: `Speaks in measured turns, ${n(i, 24)} first and ${n(i, 25)} after, and never raises the volume.`,
    signature: SIGNATURES[i % SIGNATURES.length],
    opinions: [
      { claim: `A ${n(i, 26)} should be checked before it is praised`, because: `a ${n(i, 27)} once failed on them in front of a client` },
      { claim: `Ten small ${n(i, 28)} beat one large ${n(i, 29)}`, because: `the ${n(i, 30)} taught them that at fifteen` },
      { claim: `Write the ${n(i, 31)} down or it did not happen`, because: `they have lost three ${n(i, 32)} to memory` },
    ],
    blind_spot: `Trusts the ${n(i, 33)} over the people holding it.`,
    dissent_style: `Disagrees by laying the ${n(i, 34)} on the table and waiting; backs down when shown a better ${n(i, 35)}.`,
    tempo: knob(i, 'Tempo'), candor: knob(i, 'Candor'), push: knob(i, 'Push'),
    ...over,
  };
  return sheet;
}

export const fakeSeed = (casting, i = 0, over = {}) => ({
  name: ['Mara Quill', 'Odel Brandt', 'Ines Okafor', 'Teodor Ruiz', 'Lien Park', 'Sefa Tuilagi', 'Anouk Meer', 'Dmitri Vale', 'Rosa Ibarra', 'Kwame Asare', 'Noor Haddad', 'Yuki Arai'][i % 12],
  seed: `${casting.title} with ${casting.yearsInField} years behind them. Came up ${casting.path}. Known for a steady hand.`,
  unique: `knows how to keep a ${n(i, 40)} from jamming`,
  skills: ['one skill', 'another skill', 'a third skill'],
  ...over,
});

/** An answer to the plan step: names for every room the prompt lists (by key), a title for every position, engines and documents in turn. */
export function fakePlanAnswer(call, over = {}) {
  const keys = [...call.prompt.matchAll(/key "(d\d+)"/g)].map(m => m[1]);
  return {
    name: 'Parallax Works', purpose: 'Makes small invented worlds for people who like to draw them.',
    departments: keys.map((key, i) => ({
      key, name: `Room ${i + 1} Works`, purpose: `Makes the ${i + 1}th thing.`, deliverable: i % 2 ? 'document' : 'engine', file: i % 2 ? 'notes.md' : 'engine.json',
      assignment: `Make something worth keeping in room ${i + 1}. It should be specific, strange and checked. It must not resemble anything that exists. Say plainly what is wrong with it.`,
      titles: Array.from({ length: 8 }, (_, j) => `Title ${i + 1}-${j + 1}`),
    })),
    ...over,
  };
}

export const CLEAN_REVIEW = {
  recognizable_real_person: false, real_people_named: [], name_is_famous_person: false, stereotypes: [], inconsistencies: [], particular_vs_type: 4,
  most_generic_detail: 'the flask', most_specific_detail: 'the spare in every drawer', harmful_pushes: [],
};

/**
 * A stand-in for model.askJson. `handlers` maps a step to a function (call, count) => answer; the defaults write a valid person for every step.
 * Every call is recorded in `calls`.
 */
export function fakeAsk(handlers = {}, { casting = null } = {}) {
  const calls = [];
  const counts = {};
  const ask = async (call) => {
    calls.push(call);
    counts[call.step] = (counts[call.step] || 0) + 1;
    const h = handlers[call.step];
    if (h) return h(call, counts[call.step]);
    const i = (counts[call.step] || 1) - 1;
    switch (call.step) {
      case 'seed': return fakeSeed(casting || { title: 'Editor', yearsInField: 9, path: 'at a small press' }, calls.filter(c => c.step === 'seed').length - 1);
      case 'sheet': return fakeSheet(casting || castFor(i), fakeSeed(casting || castFor(i), i), calls.filter(c => c.step === 'sheet').length - 1);
      case 'shape': return { size: 'desk', style: 'studio', people: null, reason: 'a small job' };
      case 'plan': return fakePlanAnswer(call);
      case 'blind_review': return CLEAN_REVIEW;
      case 'quiz': return { answers: layout(call.personId || 'x').map(r => ({ n: r.n, choice: 'A', reason: 'because' })) };
      default: throw new Error(`fakeAsk: no answer for step "${call.step}"`);
    }
  };
  ask.calls = calls;
  ask.counts = counts;
  return ask;
}

/** A casting for any index, from the sampler (so a test has realistic facts). */
export function castFor(i = 0, size = 'desk') {
  const plan = planOrg({ size });
  const positions = plan.departments.flatMap(d => d.positions.map((p, k) => ({ key: `${d.name}:${k}`, department: d.name, ...p })));
  const { rows } = castPositions({ positions, seed: 'kit', year: 2026 });
  return rows[i % rows.length];
}
