import test from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ, layout, score, drift, takeQuiz, QUIZ_FRAMING } from './quiz.js';

/**
 * The preference quiz: twenty original questions, shuffled per person, scored in code, used to catch a person who has drifted from their casting.
 */

test('twenty original questions, five to each of the four preference pairs, each offering one answer for each pole', () => {
  assert.equal(QUIZ.items.length, 20);
  for (const dim of Object.keys(QUIZ.poles)) {
    const items = QUIZ.items.filter(i => i.dim === dim);
    assert.equal(items.length, 5, dim);
    for (const i of items) assert.deepEqual([i.a.pole, i.b.pole], QUIZ.poles[dim], `${i.id}: each side offers a different pole`);
  }
  assert.equal(new Set(QUIZ.items.map(i => i.id)).size, 20);
  assert.match(QUIZ_FRAMING, /outside work/);
});

test('the order of the questions and of the two answers is the person\'s own, repeatable, and balanced between the poles', () => {
  const a = layout('person-a');
  assert.deepEqual(a, layout('person-a'));
  assert.notDeepEqual(a.map(r => r.id), layout('person-b').map(r => r.id));
  assert.deepEqual([...a.map(r => r.id)].sort((x, y) => x - y), Array.from({ length: 20 }, (_, i) => i + 1), 'every question once');
  assert.deepEqual(a.map(r => r.n), Array.from({ length: 20 }, (_, i) => i + 1));
  // over many people the first answer is the first pole about half the time: no position favours a pole
  let firstIsFirstPole = 0;
  let total = 0;
  for (let p = 0; p < 60; p++) for (const row of layout(`p${p}`)) { total++; if (row.A.pole === QUIZ.poles[row.dim][0]) firstIsFirstPole++; }
  const share = firstIsFirstPole / total;
  assert.ok(share > 0.45 && share < 0.55, `share ${share.toFixed(3)}`);
});

test('scoring is code: the pole with more answers wins each pair; clarity says how sure; a missing answer ties to X', () => {
  const rows = layout('scorer');
  const pick = (poleFor) => rows.map(r => ({ n: r.n, choice: r.A.pole === poleFor(r.dim) ? 'A' : 'B', reason: 'because' }));
  const s = score(rows, pick(dim => QUIZ.poles[dim][0]));
  assert.equal(s.type, 'ESTJ');
  assert.deepEqual(Object.values(s.axes).map(a => a.clarity), [5, 5, 5, 5]);
  assert.equal(score(rows, pick(dim => QUIZ.poles[dim][1])).type, 'INFP');
  assert.equal(s.detail.length, 20);

  // 3 to 2 is the thinnest win; clarity 1
  const mixed = pick(dim => QUIZ.poles[dim][0]);
  const ei = rows.filter(r => r.dim === 'EI').map(r => r.n);
  for (const n of ei.slice(0, 2)) mixed.find(a => a.n === n).choice = mixed.find(a => a.n === n).choice === 'A' ? 'B' : 'A';
  const m = score(rows, mixed);
  assert.equal(m.axes.EI.letter, 'E');
  assert.equal(m.axes.EI.clarity, 1);

  // an unanswered or malformed answer is not counted; four answered of five can still decide, but 2-2 is a tie
  const fewer = pick(dim => QUIZ.poles[dim][0]).filter(a => !ei.slice(0, 1).includes(a.n));
  assert.equal(score(rows, fewer).axes.EI.letter, 'E');
  const tie = pick(dim => QUIZ.poles[dim][0]).filter(a => !ei.slice(0, 1).includes(a.n));
  for (const n of ei.slice(1, 3)) tie.find(a => a.n === n).choice = tie.find(a => a.n === n).choice === 'A' ? 'B' : 'A';
  assert.equal(score(rows, tie).axes.EI.letter, 'X', 'two each, and one question unanswered');
  assert.equal(score(rows, [{ n: 1, choice: 'C' }]).type, 'XXXX');
});

test('drift is the number of letters that differ', () => {
  assert.equal(drift('ISTJ', 'ISTJ'), 0);
  assert.equal(drift('ISTJ', 'ESTJ'), 1);
  assert.equal(drift('ISTJ', 'ENFP'), 4);
  assert.equal(drift('ISTJ', 'XXXX'), 4);
});

/** A stand-in person who answers by a policy on the pole, and records what the prompt said. */
function person(poleFor, record = {}) {
  return async (call) => {
    record.call = call;
    const rows = layout(record.personId);
    return { answers: rows.map(r => ({ n: r.n, choice: r.A.pole === poleFor(r.dim) ? 'A' : 'B', reason: 'because it is me' })) };
  };
}

test('taking the quiz in character: the sheet is the system prompt, the questions are framed outside work, the score and the comparison with the cast are code', async () => {
  const record = { personId: 'p-1' };
  const ask = person(dim => ({ EI: 'I', SN: 'S', TF: 'T', JP: 'J' }[dim]), record);
  const res = await takeQuiz({ ask, bio: 'Mara Quill, the producer.', personId: 'p-1', model: 'gemini-3.8-flash', intended: 'ISTJ' });
  assert.deepEqual([res.type, res.intended, res.matches, res.drift, res.drifted], ['ISTJ', 'ISTJ', 4, 0, false]);
  assert.equal(res.answers.length, 20);
  assert.equal(res.instrument, QUIZ.name);
  assert.match(record.call.system, /^Mara Quill, the producer\./);
  assert.match(record.call.system, /outside work/);
  assert.match(record.call.system, /not by what sounds best/);
  assert.match(record.call.prompt, /^Here are 20 short questions\./);
  assert.equal(record.call.model, 'gemini-3.8-flash');

  // the person has drifted from the casting: two letters differ, which is the flag
  const drifted = await takeQuiz({ ask: person(dim => ({ EI: 'E', SN: 'N', TF: 'T', JP: 'J' }[dim]), { personId: 'p-1' }), bio: 'x', personId: 'p-1', intended: 'ISTJ' });
  assert.deepEqual([drifted.type, drifted.drift, drifted.matches, drifted.drifted], ['ENTJ', 2, 2, true]);
  const near = await takeQuiz({ ask: person(dim => ({ EI: 'E', SN: 'S', TF: 'T', JP: 'J' }[dim]), { personId: 'p-1' }), bio: 'x', personId: 'p-1', intended: 'ISTJ' });
  assert.deepEqual([near.drift, near.drifted], [1, false], 'one letter is the person, not a drift');
  assert.equal((await takeQuiz({ ask: person(() => 'E', { personId: 'p-1' }), bio: 'x', personId: 'p-1' })).drifted, false, 'with nothing cast there is nothing to drift from');
});

test('an answer sheet that misses a question is asked again, three times at most', async () => {
  let calls = 0;
  const ask = async () => {
    calls++;
    const rows = layout('p-2');
    return { answers: rows.slice(calls < 3 ? 1 : 0).map(r => ({ n: r.n, choice: 'A', reason: 'x' })) };
  };
  const ok = await takeQuiz({ ask, bio: 'x', personId: 'p-2' });
  assert.equal(calls, 3);
  assert.equal(ok.answers.length, 20);
  await assert.rejects(takeQuiz({ ask: async () => ({ answers: [] }), bio: 'x', personId: 'p-2' }), /did not come back with an answer to every question/);
});
