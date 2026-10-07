import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrator } from './orchestrator.js';
import { roomToolsInstructions } from './gemini.js';
import { readShownImage, parseRoomRequests, stripRoomTags, drawValues, fillTemplate, classifyArtifact, buildCriticPrompt, describeScore } from './roomTools.js';

/**
 * What a room does beyond talking, with no network: the "done when" gate on ending, the independent critic, showing the room
 * pictures, and rendering what an agent wrote.
 */

let events;
const PNG = Buffer.from('a pretend png').toString('base64');

beforeEach(() => {
  orchestrator.reset();
  orchestrator.mediaStore.clear();
  orchestrator.artifactStore.clear();
  orchestrator.sseClients.clear();
  events = [];
  orchestrator.broadcast = (event, data) => { events.push([event, data]); };
  orchestrator.delay = () => Promise.resolve();
  orchestrator.addAgent('Ann Test', 'You are Ann.');
  orchestrator.addAgent('Ben Test', 'You are Ben.');
});

const named = (name) => events.filter(([e]) => e === name).map(([, d]) => d);
const notes = () => orchestrator.messages.filter(m => m.isNote);

async function until(cond, ms = 4000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting for the conversation loop');
    await new Promise(r => setTimeout(r, 5));
  }
}

/** Scripted agents: script(callNumber, agentName) returns the reply. */
function scripted(script) {
  let calls = 0;
  orchestrator._generate = async function* (agent, _all, _messages, _goal, _media, options) {
    calls += 1;
    scripted.lastOptions = options;
    const text = script(calls, agent.name);
    yield { type: 'chunk', text };
    yield { type: 'complete', fullResponse: text, tokenCount: 10 };
  };
  return () => calls;
}

const ENGINE = JSON.stringify({ promptTemplate: 'A {{thing}} at {{hour}}.', variables: [{ name: 'thing', values: [{ text: 'fox', weight: 3 }, { text: 'owl', weight: 1 }] }, { name: 'hour', values: ['dawn', 'dusk'] }] });
const asArtifact = (name, body) => `Saving it.\n[ARTIFACT: ${name}]\n${body}\n[/ARTIFACT]`;

// ── done when: the gate ──────────────────────────────────────────────────────

test('the lead cannot end the room until the checks pass: the refusal says why, the room carries on, a new version is judged, and then it ends', async () => {
  orchestrator.setDoneWhen([{ type: 'artifact', name: 'engine.json' }, { type: 'json', in: 'artifact:engine.json', schema: { type: 'object', required: ['promptTemplate', 'variables'], properties: { variables: { type: 'array', minItems: 2, maxItems: 2 } } } }]);
  const calls = scripted((n, who) => {
    if (n === 3) return 'Everything is done. [CONSENSUS REACHED]';                       // Ann, with no artifact yet
    if (n === 4) return asArtifact('engine.json', JSON.stringify({ promptTemplate: 'x', variables: [{ name: 'a', values: [] }] }));   // Ben: one variable, needs two
    if (n === 6) return asArtifact('engine.json', ENGINE);                                // Ben again, fixed
    if (who === 'Ann Test' && n > 6) return 'Now it is complete. [CONSENSUS REACHED]';
    return `${who} talking, line ${n}.`;
  });
  await orchestrator.start('Make an engine', 100000);
  await until(() => !orchestrator.isRunning);

  assert.equal(orchestrator.completionReason, 'lead_closed');
  const refusal = notes().find(m => /cannot end yet/.test(m.content));
  assert.ok(refusal, 'the first attempt was refused');
  assert.equal(refusal.agentName, 'Producer');
  assert.match(refusal.content, /FAIL {2}the artifact "engine.json" exists\n {6}no artifact named "engine.json" has been saved/);
  // after Ben's wrong version the room is told what is wrong with it, without anyone asking
  const judged = notes().find(m => /DONE-WHEN CHECK after engine.json:/.test(m.content));
  assert.ok(judged, 'the new version was judged');
  assert.match(judged.content, /\$\.variables: 1 item, needs exactly 2/);
  // and when the fixed version lands, the room hears that it passes
  assert.ok(notes().some(m => /every check passes/.test(m.content)));
  assert.ok(orchestrator.doneWhen.blocks >= 1);
  assert.ok(calls() > 6);
  const checks = named('done_check');
  assert.ok(checks.some(c => c.attempted === 'lead_closed' && c.passed === false));
  assert.ok(checks.some(c => c.attempted === 'lead_closed' && c.passed === true));
});

test('the vote is gated too: a quorum cannot end a room whose checks fail', async () => {
  orchestrator.updateConsensusSettings({ closeBy: 'vote' });
  orchestrator.setDoneWhen([{ type: 'artifact', name: 'never.json' }], { maxBlocks: 50 });
  orchestrator.delay = () => new Promise(r => setTimeout(r, 20));
  scripted((n, who) => `${who} says it is done. [CONSENSUS REACHED]`);
  await orchestrator.start('Anything', 100000, {});
  await until(() => orchestrator.doneWhen.blocks >= 2);
  assert.equal(orchestrator.isRunning, true, 'still running after repeated attempts');
  assert.equal(orchestrator.completionReason, null);
  orchestrator.stop('user_stopped');
});

test('a check nobody can pass does not loop until the token limit: by default the room ends after 8 refusals, saying so', async () => {
  assert.equal(orchestrator.doneWhen.maxBlocks, 8);
  orchestrator.setDoneWhen([{ type: 'artifact', name: 'never.json' }]);
  scripted((n, who) => `${who} says it is done. [CONSENSUS REACHED]`);
  orchestrator.updateConsensusSettings({ closeBy: 'vote' });
  await orchestrator.start('Anything', 100000, {});
  await until(() => !orchestrator.isRunning);
  assert.equal(orchestrator.completionReason, 'done_check_unmet');
  assert.equal(orchestrator.doneWhen.blocks, 8);
});

test('maxBlocks lets a room that cannot pass end anyway, and says so', async () => {
  orchestrator.setDoneWhen([{ type: 'artifact', name: 'never.json' }], { maxBlocks: 2 });
  scripted((n, who) => (who === 'Ann Test' && n >= 3 ? 'Done. [CONSENSUS REACHED]' : `${who} line ${n}`));
  await orchestrator.start('Anything', 100000);
  await until(() => !orchestrator.isRunning);
  assert.equal(orchestrator.completionReason, 'done_check_unmet');
  assert.equal(orchestrator.doneWhen.blocks, 2);
  assert.ok(notes().some(m => /still failing after 2 attempts/.test(m.content)));
});

test('hard stops (a turn limit) are never held back by the checks', async () => {
  orchestrator.updateConsensusSettings({ maxTurns: 3 });
  orchestrator.setDoneWhen([{ type: 'artifact', name: 'never.json' }]);
  scripted((n, who) => `${who} line ${n}`);
  await orchestrator.start('Anything', 100000);
  await until(() => !orchestrator.isRunning);
  assert.equal(orchestrator.completionReason, 'turn_limit_reached');
});

test('with no checks nothing changes; every agent is told the checks when there are some', () => {
  assert.equal(orchestrator._closingNotes(orchestrator.agents[1]), null);
  orchestrator.setDoneWhen([{ type: 'artifact', name: 'engine.json' }, { type: 'regex', pattern: 'FINAL', label: 'the answer is marked FINAL' }]);
  for (const agent of orchestrator.agents) {
    const note = orchestrator._closingNotes(agent);
    assert.match(note, /DONE WHEN: the server will not let this session end/);
    assert.match(note, /- the artifact "engine.json" exists/);
    assert.match(note, /- the answer is marked FINAL/);
  }
});

test('the same failing artifact is announced once, not on every save', async () => {
  orchestrator.setDoneWhen([{ type: 'json', in: 'artifact:engine.json', schema: { type: 'object', required: ['nope'] } }], { maxBlocks: 2 });
  scripted((n, who) => (n <= 3 ? asArtifact('engine.json', '{"a":1}') : (who === 'Ann Test' ? 'Done. [CONSENSUS REACHED]' : `${who} thinks.`)));
  await orchestrator.start('Anything', 100000);
  await until(() => !orchestrator.isRunning);
  assert.equal(notes().filter(m => /DONE-WHEN CHECK after engine.json/.test(m.content)).length, 1);
});

// ── the independent critic ───────────────────────────────────────────────────

test('the critic scores a picture it is given against a reference, and a low score tells the room not to accept it', async () => {
  orchestrator.mediaStore.add({ id: 'ref', type: 'image', data: PNG, mimeType: 'image/png' });
  orchestrator.mediaStore.add({ id: 'cand', type: 'image', data: PNG, mimeType: 'image/png' });
  const asked = [];
  orchestrator._critique = async (args) => { asked.push(args); return { score: 3, differs: 'a painting, not a photograph', model: 'm' }; };
  orchestrator.setCritic({ enabled: true, referenceId: 'ref', minScore: 6, criteria: 'the same woman' });
  const r = await orchestrator.critique({ imageId: 'cand' });
  assert.equal(r.ok, true);
  assert.equal(r.score, 3);
  assert.equal(r.below, true);
  assert.match(r.text, /^3\/10\. a painting, not a photograph That is below the bar of 6: do not accept this as matching\./);
  assert.equal(asked[0].reference.data, PNG);
  assert.equal(asked[0].criteria, 'the same woman');
  assert.equal(named('critic_score')[0].below, true);
  assert.equal(orchestrator.critic.calls, 1);
});

test('the critic refuses what it cannot judge: unknown pictures, nothing to judge against, and past its budget', async () => {
  orchestrator.mediaStore.add({ id: 'cand', type: 'image', data: PNG, mimeType: 'image/png' });
  orchestrator._critique = async () => ({ score: 9, differs: 'nothing' });
  assert.match((await orchestrator.critique({ imageId: 'nope' })).error, /no picture "nope"/);
  assert.match((await orchestrator.critique({ imageId: 'cand' })).error, /needs a reference picture or a description/);
  assert.match((await orchestrator.critique({ imageId: 'cand', referenceId: 'gone' })).error, /no reference picture "gone"/);
  orchestrator.setCritic({ maxCalls: 1 });
  assert.equal((await orchestrator.critique({ imageId: 'cand', criteria: 'a red door' })).ok, true);
  assert.match((await orchestrator.critique({ imageId: 'cand', criteria: 'a red door' })).error, /budget of 1 scores/);
  orchestrator._critique = async () => null;
  orchestrator.setCritic({ maxCalls: 5 });
  assert.match((await orchestrator.critique({ imageId: 'cand', criteria: 'a red door' })).error, /could not be reached/);
});

test('a file the host attached can be the reference, by id or by name', async () => {
  orchestrator.sessionMedia.push({ id: 's1', name: 'sheet.jpg', mimeType: 'image/jpeg', data: PNG });
  orchestrator.mediaStore.add({ id: 'cand', type: 'image', data: PNG, mimeType: 'image/png' });
  const seen = [];
  orchestrator._critique = async (a) => { seen.push(a.reference?.mimeType); return { score: 8, differs: 'nothing' }; };
  assert.equal((await orchestrator.critique({ imageId: 'cand', referenceId: 'sheet.jpg' })).ok, true);
  assert.equal((await orchestrator.critique({ imageId: 'cand', referenceId: 's1' })).ok, true);
  assert.deepEqual(seen, ['image/jpeg', 'image/jpeg']);
});

test('with the critic on, pictures an agent makes are scored for the whole room, in one note, before anyone can agree among themselves', async () => {
  orchestrator.sessionMedia.push({ id: 'sheet', name: 'sheet.png', mimeType: 'image/png', data: PNG });
  orchestrator.mediaStore.add({ id: 'img-A', type: 'image', data: PNG, mimeType: 'image/png', prompt: 'p' });
  orchestrator.setCritic({ enabled: true, referenceId: 'sheet', minScore: 6 });
  orchestrator._critique = async () => ({ score: 2, differs: 'the face is different', model: 'm' });
  await orchestrator._autoCritique(['img-A']);
  const note = notes().at(-1);
  assert.equal(note.agentName, 'Producer');
  assert.match(note.content, /^INDEPENDENT CRITIC \(it saw only the pictures, not this conversation/);
  assert.match(note.content, /picture img-A: 2\/10\. the face is different That is below the bar of 6/);
  // off, or with nothing to judge against, it stays quiet
  const before = orchestrator.messages.length;
  orchestrator.setCritic({ enabled: false });
  await orchestrator._autoCritique(['img-A']);
  orchestrator.setCritic({ enabled: true, referenceId: null, criteria: '' });
  await orchestrator._autoCritique(['img-A']);
  assert.equal(orchestrator.messages.length, before);
});

test('an agent can ask for a score with a tag, and the answer reaches the next speaker', async () => {
  orchestrator.mediaStore.add({ id: 'ref', type: 'image', data: PNG, mimeType: 'image/png' });
  orchestrator.mediaStore.add({ id: 'cand', type: 'image', data: PNG, mimeType: 'image/png' });
  orchestrator.setCritic({ enabled: true, referenceId: 'ref', auto: false });
  orchestrator._critique = async () => ({ score: 9, differs: 'nothing', model: 'm' });
  scripted((n, who) => (n === 1 ? 'Checking my frame. [CRITIC: cand | criteria=same coat]' : (who === 'Ann Test' ? 'Fine. [CONSENSUS REACHED]' : `${who} replies.`)));
  await orchestrator.start('Check a frame', 100000);
  await until(() => !orchestrator.isRunning);
  const first = orchestrator.messages[0];
  assert.equal(first.content, 'Checking my frame.', 'the tag is stripped from what the room reads');
  assert.deepEqual(first.toolResults, [{ type: 'critic', imageId: 'cand', ok: true, text: '9/10.' }]);
  const { buildConversationPrompt } = await import('./gemini.js');
  assert.match(buildConversationPrompt(orchestrator.messages, 'g', 'Ben Test'), /\[Independent critic on picture cand: 9\/10\.\]/);
});

test('the critic is only advertised to agents when it is on; the prompt says scores are not up for debate', () => {
  assert.equal(roomToolsInstructions({}), '');
  const on = roomToolsInstructions({ critic: true, criticReference: 'sheet', criticMinScore: 7, render: true });
  assert.match(on, /\[CRITIC: <picture id>/);
  assert.match(on, /not up for debate/);
  assert.match(on, /default reference picture/);
  assert.match(on, /below 7/);
  assert.match(on, /\[RENDER: engine\.json/);
  assert.ok(!roomToolsInstructions({ render: true }).includes('CRITIC'));
});

// ── show the room ────────────────────────────────────────────────────────────

test('showing the room a picture: it joins the conversation as a note, is kept, and the next speaker is shown it', () => {
  const r = orchestrator.showToRoom({ images: [{ dataUrl: `data:image/png;base64,${PNG}`, label: 'contact sheet' }], caption: 'This is what the harness saw.' });
  assert.equal(r.ok, true);
  const note = orchestrator.messages.at(-1);
  assert.equal(note.agentName, 'Producer');
  assert.equal(note.isNote, true);
  assert.equal(note.content, 'This is what the harness saw.');
  assert.equal(note.images[0].imageData, PNG);
  assert.equal(orchestrator.mediaStore.get(r.imageIds[0]).data, PNG);
  assert.equal(orchestrator.recentGenImages.at(-1).id, r.imageIds[0], 'in the vision window');
  assert.equal(named('message').at(-1).images.length, 1);
});

test('showing refuses what is not a picture, too many, or nothing', () => {
  assert.match(orchestrator.showToRoom({ images: [] }).error, /at least one image/);
  assert.match(orchestrator.showToRoom({ images: [{ data: '<script>alert(1)</script>' }] }).error, /not base64/);
  assert.match(orchestrator.showToRoom({ images: [{ data: PNG, mimeType: 'application/x-msdownload' }] }).error, /unsupported image type/);
  assert.match(orchestrator.showToRoom({ images: Array(7).fill({ data: PNG }) }).error, /at most 6/);
  assert.equal(orchestrator.messages.length, 0, 'nothing was added by the refusals');
  assert.deepEqual(readShownImage({ dataUrl: 'data:text/html;base64,AAAA' }).error, 'unsupported image type text/html');
  assert.equal(readShownImage({ dataUrl: 'not a data url' }).error, 'dataUrl must be a base64 data: URL');
});

// ── rendering ────────────────────────────────────────────────────────────────

test('an engine is rendered by drawing random combinations of its values, and the draws are shown to the room', async () => {
  orchestrator.artifactStore.save('engine.json', ENGINE, 'a', 'Ann Test');
  const prompts = [];
  orchestrator._draw = async (prompt) => { prompts.push(prompt); return { imageData: PNG, mimeType: 'image/png' }; };
  const r = await orchestrator.render({ artifact: 'engine.json', draws: 3, speaker: orchestrator.agents[0] });
  assert.equal(r.ok, true);
  assert.equal(r.images.length, 3);
  assert.equal(prompts.length, 3);
  for (const p of prompts) assert.match(p, /^A (fox|owl) at (dawn|dusk)\.$/);
  assert.equal(orchestrator.recentGenImages.length, 3);
  assert.match(r.text, /3 draws from engine.json/);
  assert.equal(orchestrator.renderState.used, 1);
});

test('a render says plainly what it cannot do: no such artifact, not renderable, no browser, past the limit', async () => {
  assert.match((await orchestrator.render({ artifact: 'x.json' })).text, /no artifact named "x.json" \(the artifacts are: none yet\)/);
  orchestrator.artifactStore.save('notes.md', '# hi', 'a', 'Ann');
  assert.match((await orchestrator.render({ artifact: 'notes.md' })).text, /not something that can be rendered/);
  orchestrator.artifactStore.save('bad.json', '{oops', 'a', 'Ann');
  assert.match((await orchestrator.render({ artifact: 'bad.json' })).text, /not valid JSON/);
  orchestrator.artifactStore.save('thing.json', '{"a":1}', 'a', 'Ann');
  assert.match((await orchestrator.render({ artifact: 'thing.json' })).text, /JSON but not a template/);
  orchestrator.artifactStore.save('sketch.js', 'p.setup=()=>{}', 'a', 'Ann');
  const noBrowser = await orchestrator.render({ artifact: 'sketch.js' });
  assert.match(noBrowser.text, /no browser is attached/);
  assert.equal(orchestrator.renderState.used, 0, 'a render that could not start is not charged');
  orchestrator.renderState.max = 1;
  orchestrator.artifactStore.save('engine.json', ENGINE, 'a', 'Ann');
  orchestrator._draw = async () => ({ imageData: PNG, mimeType: 'image/png' });
  assert.equal((await orchestrator.render({ artifact: 'engine.json', draws: 1 })).ok, true);
  assert.match((await orchestrator.render({ artifact: 'engine.json' })).text, /limit of 1 renders/);
});

test('an instrument is rendered by a browser attached to the room, which is asked over the event stream and answers with pictures', async () => {
  const template = JSON.stringify({ promptTemplate: 'x {{a}}', variables: [{ name: 'a', values: ['one', 'two'] }], p5Code: 'p.setup=()=>{p.createCanvas(10,10)};p.draw=()=>{p.background(1)}' });
  orchestrator.artifactStore.save('inst.json', template, 'a', 'Ann Test');
  orchestrator.sseClients.add({ write() {} });
  const pending = orchestrator.render({ artifact: 'inst.json', draws: 2, speaker: orchestrator.agents[0] });
  await until(() => named('render_request').length === 1);
  const req = named('render_request')[0];
  assert.equal(req.kind, 'p5-template');
  assert.ok(req.p5Code.includes('p.setup'));
  assert.equal(req.samples.length, 2, 'the server chooses the settings, so what is rendered is what is reported');
  assert.ok(req.samples.every(s => ['one', 'two'].includes(s.a)));
  assert.equal(orchestrator.resolveRender(req.requestId, { ok: true, images: [{ dataUrl: `data:image/png;base64,${PNG}`, label: 'a=one' }, { dataUrl: `data:image/png;base64,${PNG}`, label: 'a=two' }], note: 'ran 3 s' }), true);
  const r = await pending;
  assert.equal(r.ok, true);
  assert.equal(r.images.length, 2);
  assert.match(r.text, /2 renders of inst.json with different settings/);
  assert.match(r.text, /Browser note: ran 3 s/);
  assert.equal(orchestrator.resolveRender(req.requestId, { ok: true, images: [] }), false, 'an answer to nothing is refused');
});

test('a browser that does not answer, or answers with an error or nothing usable, is reported, not waited for', async () => {
  orchestrator.artifactStore.save('page.html', '<canvas></canvas>', 'a', 'Ann');
  orchestrator.sseClients.add({ write() {} });
  const slow = await orchestrator.render({ artifact: 'page.html', timeoutMs: 30 });
  assert.match(slow.text, /no browser answered within/);
  const latest = () => named('render_request').at(-1).requestId;
  const p = orchestrator.render({ artifact: 'page.html', timeoutMs: 2000 });
  await until(() => named('render_request').length === 2);
  orchestrator.resolveRender(latest(), { ok: false, error: 'the sketch threw: p is not defined' });
  assert.match((await p).text, /rendering page.html failed: the sketch threw/);
  const q = orchestrator.render({ artifact: 'page.html', timeoutMs: 2000 });
  await until(() => named('render_request').length === 3);
  orchestrator.resolveRender(latest(), { ok: true, images: [{ data: '<not base64>' }] });
  assert.match((await q).text, /sent no usable picture/);
});

test('a reset releases a render that was waiting', async () => {
  orchestrator.artifactStore.save('page.html', '<canvas></canvas>', 'a', 'Ann');
  orchestrator.sseClients.add({ write() {} });
  const p = orchestrator.render({ artifact: 'page.html', timeoutMs: 5000 });
  await until(() => named('render_request').length === 1);
  orchestrator.reset();
  assert.match((await p).text, /the room was reset/);
});

test('[RENDER: file] in an agent reply shows the room the draws and tells the next speaker what they are', async () => {
  orchestrator.artifactStore.save('engine.json', ENGINE, 'a', 'Ann Test');
  orchestrator._draw = async () => ({ imageData: PNG, mimeType: 'image/png' });
  scripted((n, who) => (n === 1 ? 'Let us look at it. [RENDER: engine.json | draws=2]' : (who === 'Ann Test' ? 'Fine. [CONSENSUS REACHED]' : `${who} replies.`)));
  await orchestrator.start('Look at the engine', 100000);
  await until(() => !orchestrator.isRunning);
  const first = orchestrator.messages[0];
  assert.equal(first.content, 'Let us look at it.');
  assert.equal(first.images.length, 2, 'the pictures are in the message the room reads');
  assert.equal(first.toolResults[0].type, 'render');
  assert.match(first.toolResults[0].text, /2 draws from engine.json/);
});

// ── pure helpers ─────────────────────────────────────────────────────────────

test('room tags parse, in order, with their options, and strip cleanly', () => {
  const text = 'Look. [CRITIC: img-1 | reference=sheet | criteria=same coat and braid] Then [RENDER: engine.json | draws=3] done.';
  const reqs = parseRoomRequests(text);
  assert.deepEqual(reqs.map(r => r.type), ['critic', 'render']);
  assert.equal(reqs[0].imageId, 'img-1');
  assert.equal(reqs[0].referenceId, 'sheet');
  assert.equal(reqs[0].criteria, 'same coat and braid');
  assert.equal(reqs[1].artifact, 'engine.json');
  assert.equal(reqs[1].draws, 3);
  assert.equal(stripRoomTags(text), 'Look.  Then  done.');
  assert.deepEqual(parseRoomRequests('no tags [here] and [CRITIC: ]'), []);
});

test('samples are drawn by weight, one value per variable, and fill the template', () => {
  const vars = [{ name: 'a', values: [{ text: 'rare', weight: 1 }, { text: 'common', weight: 9 }] }, { name: 'b', values: ['x'] }, { name: 'empty', values: [] }];
  assert.deepEqual(drawValues(vars, () => 0.05), { a: 'rare', b: 'x' });
  assert.deepEqual(drawValues(vars, () => 0.95), { a: 'common', b: 'x' });
  assert.equal(fillTemplate('A {{a}} and {{ b }} and {{missing}}.', { a: 'cat', b: 'dog' }), 'A cat and dog and {{missing}}.');
  assert.equal(classifyArtifact({ filename: 'x.json', content: ENGINE }).kind, 'prompt-template');
  assert.equal(classifyArtifact({ filename: 'x.js', content: '' }).kind, 'page');
});

test('the critic is asked a question that cannot mention the conversation, in the scoring form', () => {
  const withRef = buildCriticPrompt({ hasReference: true, criteria: 'the same woman' });
  assert.match(withRef, /you have not seen any conversation/);
  assert.match(withRef, /Rate 1 to 10/);
  assert.match(withRef, /the same woman/);
  assert.ok(!/MATCH|RETAKE/.test(withRef), 'a score, not a checklist verdict');
  const briefOnly = buildCriticPrompt({ hasReference: false, criteria: 'a red door' });
  assert.match(briefOnly, /candidate/i);
  assert.match(briefOnly, /a red door/);
  assert.equal(describeScore({ score: 8, differs: 'nothing' }), '8/10.');
});
