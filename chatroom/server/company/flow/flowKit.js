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

const nWord = (i, k) => NOUNS[(i * 11 + k * 3) % NOUNS.length];
const vWord = (i, k) => VERBS[(i * 5 + k * 7) % VERBS.length];
const n = nWord;
const v = vWord;

const knob = (i, name) => ({ values: [`${name} one and unhurried, number ${i}`, `${name} two and steady, number ${i}`, `${name} three and brisk, number ${i}`, `${name} four and insistent, number ${i}`] });

/** A valid sheet for a casting, different for each `i`, long enough to pass the length check. */
export function fakeSheet(casting, seed, i = 0, over = {}, { word: n = nWord, verb: v = vWord } = {}) {
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

const FIRST = ['Mara', 'Odel', 'Ines', 'Teodor', 'Lien', 'Sefa', 'Anouk', 'Dmitri', 'Rosa', 'Kwame', 'Noor', 'Yuki', 'Bastien', 'Ilse', 'Tomas', 'Wanjiru', 'Pavel', 'Haruka', 'Soledad', 'Emeka', 'Aino', 'Rahul', 'Greta', 'Joaquin', 'Mihail', 'Nadia', 'Osei', 'Petra', 'Quentin', 'Rangi', 'Saoirse', 'Tariq'];
const LAST = ['Quill', 'Brandt', 'Okafor', 'Ruiz', 'Park', 'Tuilagi', 'Meer', 'Vale', 'Ibarra', 'Asare', 'Haddad', 'Arai', 'Lindqvist', 'Mbeki', 'Kovac', 'Duarte', 'Nakamura', 'Fallon', 'Szabo', 'Oyelaran', 'Varga', 'Moreau', 'Eriksen', 'Tanaka', 'Bianchi', 'Hollis', 'Pereira', 'Wójcik', 'Aldana', 'Rautio', 'Dlamini', 'Castellan'];

/** A person for the i-th seed: the first twelve are fixed (tests name them); after that the names are made up from two lists, never repeating inside 96. */
export const fakeName = (i) => (i < 12
  ? ['Mara Quill', 'Odel Brandt', 'Ines Okafor', 'Teodor Ruiz', 'Lien Park', 'Sefa Tuilagi', 'Anouk Meer', 'Dmitri Vale', 'Rosa Ibarra', 'Kwame Asare', 'Noor Haddad', 'Yuki Arai'][i]
  : `${FIRST[i % FIRST.length]} ${LAST[(Math.floor(i / FIRST.length) + i * 5) % LAST.length]}`);

export const fakeSeed = (casting, i = 0, over = {}) => ({
  name: fakeName(i),
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

const SYLLABLES = ['bu', 'ko', 'lu', 'mi', 'ne', 'po', 'ra', 'si', 'tu', 've', 'wa', 'xo', 'yi', 'zu', 'da', 'fe', 'gi', 'ho', 'ju', 'ka'];
/** A made-up word (no syllable that could spell a trade the lint watches for, such as "bak"), different for every (i, k): sheets written with these share no words, so the lint's "words your teammates already use" never fires. */
export const pseudo = (i, k) => { const x = i * 97 + k * 13 + 7; return SYLLABLES[x % 20] + SYLLABLES[Math.floor(x / 20) % 20] + SYLLABLES[Math.floor(x / 400) % 20] + SYLLABLES[Math.floor(x / 8000) % 20]; };

const run = (i, k0, count) => Array.from({ length: count }, (_, j) => pseudo(i, k0 + j)).join(' ');

/**
 * A valid sheet that shares no word, habit verb or signature with any other \`uniqueSheet\` of a different i, so a whole team of them passes the checks
 * (the lint holds a sheet to the words its teammates already use, and a template shares most of its words). Only the facts the checks read are kept
 * (the born line, who raised them, the years); everything else is made-up words and words of four letters or fewer.
 */
export const uniqueSheet = (c, seed, i = 0, over = {}) => fakeSheet(c, seed, i, {
  identity_line: `Known on the team for the ${pseudo(i, 1)} and the ${pseudo(i, 2)} they bring to every ${c.title.toLowerCase()} decision.`,
  upbringing: `Grew up in ${c.birthplace.city}, with ${c.siblings} of kin, where ${c.carers[0]} set the day. ${run(i, 3, 44)}.`,
  career: `Started out in ${c.bornYear + 22} and has kept at it for ${c.yearsInField} years. ${run(i, 50, 44)}.`,
  touchstones: [`${pseudo(i, 10)} ${pseudo(i, 11)}`, `${pseudo(i, 12)}`, `${pseudo(i, 13)} ${pseudo(i, 14)}`, `${pseudo(i, 15)}`, `${pseudo(i, 16)} ${pseudo(i, 17)}`],
  off_clock: `On a free day they go out with no plan. ${run(i, 90, 48)}.`,
  working_style: `Works from the ${pseudo(i, 20)} out, one ${pseudo(i, 26)} at a time. Says what they will do next, then does it.`,
  habits: [`${pseudo(i, 100)} a ${pseudo(i, 21)} near the ${pseudo(i, 22)}`, `${pseudo(i, 101)} the ${pseudo(i, 23)} each day`, `${pseudo(i, 102)} every ${pseudo(i, 27)} on the desk`],
  voice: `${pseudo(i, 24)} first, ${pseudo(i, 25)} after, and calm.`,
  signature: `${pseudo(i, 200)} and ${pseudo(i, 201)}, then rest`,
  ...over,
});

const BORN_FACT = /- Born (\d{4}) in (.+?), (.+?) \(/;
/** Which of the flow's drawn people a seed or sheet prompt is about, read from the facts the prompt states. */
export function castingFrom(prompt, castings) {
  const m = BORN_FACT.exec(prompt);
  return m ? castings().find(c => String(c.bornYear) === m[1] && c.birthplace.city === m[2] && c.birthplace.country === m[3]) || null : null;
}

/**
 * A stand-in for model.askJson. `handlers` maps a step to a function (call, count) => answer; the defaults write a valid person for every step.
 * With `castings` (a function returning the people the flow drew), the seed and sheet are written for the person the prompt is about, and every sheet is
 * different from every other. Every call is recorded in `calls`.
 */
export function fakeAsk(handlers = {}, { casting = null, castings = null } = {}) {
  const calls = [];
  const counts = {};
  const ask = async (call) => {
    calls.push(call);
    counts[call.step] = (counts[call.step] || 0) + 1;
    const h = handlers[call.step];
    if (h) {                                                            // a handler that answers nothing (it only waited, or counted) leaves the default to answer
      const answer = await h(call, counts[call.step]);
      if (answer !== undefined) return answer;
    }
    const i = (counts[call.step] || 1) - 1;
    switch (call.step) {
      case 'seed': {
        const drawn = castings && castingFrom(call.prompt, castings);
        return fakeSeed(drawn || casting || { title: 'Editor', yearsInField: 9, path: 'at a small press' }, calls.filter(c => c.step === 'seed').length - 1);
      }
      case 'sheet': {
        const drawn = castings && castingFrom(call.prompt, castings);
        const k = calls.filter(c => c.step === 'sheet').length - 1;
        if (drawn) return uniqueSheet(drawn, null, k);
        return fakeSheet(casting || castFor(i), fakeSeed(casting || castFor(i), i), k);
      }
      case 'memory': return { summary: 'I took part in the session and said what I saw in the work.', lesson: 'Say what is wrong sooner.', relationships: [] };
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
