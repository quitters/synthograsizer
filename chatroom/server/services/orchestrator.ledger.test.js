import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrator, ChatOrchestrator } from './orchestrator.js';

/**
 * The room's ledger and the review hand-off: what the server saw (saves, tools that ran) noted in order, a named reviewer who speaks
 * after each save, and the "done when" gate that holds the lead to both. No network.
 */

let events;
const PNG = Buffer.from('a pretend png').toString('base64');

beforeEach(() => {
  orchestrator.reset();
  orchestrator.mediaStore.clear();
  orchestrator.artifactStore.clear();
  orchestrator.sseClients.clear();
  events = [];
  // (record the events AND run the real broadcast: the ledger notes saves there)
  orchestrator.broadcast = (event, data) => { events.push([event, data]); ChatOrchestrator.prototype.broadcast.call(orchestrator, event, data); };
  orchestrator.delay = () => Promise.resolve();
  orchestrator._draw = async () => ({ imageData: PNG, mimeType: 'image/png' });
  orchestrator.addAgent('Rima Lead', 'You are Rima, the lead.');
  orchestrator.addAgent('Zayd Builder', 'You are Zayd.');
  orchestrator.addAgent('Kasia Skeptic', 'You are Kasia.');
});

const agentNamed = (name) => orchestrator.agents.find(a => a.name === name);
const say = (name, content, extra = {}) => orchestrator.messages.push({ id: `m${orchestrator.messages.length}`, agentId: agentNamed(name).id, agentName: name, content, timestamp: new Date().toISOString(), isUser: false, ...extra });
const ENGINE = JSON.stringify({ promptTemplate: 'A {{thing}}.', variables: [{ name: 'thing', values: [{ text: 'fox', weight: 1 }, { text: 'owl', weight: 1 }] }] });

async function until(cond, ms = 4000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting for the conversation loop');
    await new Promise(r => setTimeout(r, 5));
  }
}

// ── the ledger ───────────────────────────────────────────────────────────────

test('a save is noted with the number of messages before it, whichever way it was made', async () => {
  say('Rima Lead', 'Let us begin.');
  say('Kasia Skeptic', 'Agreed.');
  const dispatch = orchestrator._createDispatcher(agentNamed('Zayd Builder'), []);
  const outcome = await dispatch({ id: 'c1', name: 'write_artifact', arguments: { filename: 'engine.json', content: ENGINE } });
  assert.equal(outcome.ok, true);

  const save = orchestrator.ledger.latestSave('engine.json');
  assert.equal(save.version, 1);
  assert.equal(save.messageCount, 2, 'the message that will carry it is the third');
  const tool = orchestrator.ledger.latest('tool', e => e.tool === 'write_artifact');
  assert.deepEqual([tool.ok, tool.agent, tool.artifact], [true, 'Zayd Builder', 'engine.json']);

  // the host's own edit (POST /api/artifacts) announces the same event, so it is noted too
  orchestrator.artifactStore.save('engine.json', ENGINE + ' ', null, 'UI');
  orchestrator.broadcast('artifact_update', { filename: 'engine.json', version: 2, agentId: null });
  assert.equal(orchestrator.ledger.latestSave('engine.json').version, 2);
});

test('a failed tool call is noted as failed, and a render is noted once, by render() itself', async () => {
  const dispatch = orchestrator._createDispatcher(agentNamed('Zayd Builder'), []);
  const bad = await dispatch({ id: 'c1', name: 'write_artifact', arguments: { filename: 'x.json', content: '' } });
  assert.equal(bad.ok, false);
  assert.equal(orchestrator.ledger.latest('tool', e => e.tool === 'write_artifact').ok, false);

  assert.equal(orchestrator.ledger.latest('tool', e => e.tool === 'render_artifact'), null);
  orchestrator.artifactStore.save('engine.json', ENGINE, null, 'x');
  const ok = await dispatch({ id: 'c2', name: 'render_artifact', arguments: { artifact: 'engine.json', draws: 1 } });
  assert.equal(ok.ok, true);
  assert.equal(orchestrator.ledger.all('tool', e => e.tool === 'render_artifact').length, 1, 'not noted twice');
  assert.equal(orchestrator.ledger.latest('tool', e => e.tool === 'render_artifact').artifact, 'engine.json');

  const missing = await dispatch({ id: 'c3', name: 'render_artifact', arguments: { artifact: 'nothing.json' } });
  assert.equal(missing.ok, false);
  assert.equal(orchestrator.ledger.latest('tool', e => e.tool === 'render_artifact').ok, false);
});

test('files put back by a restore are noted as saved before everything now said', () => {
  orchestrator.restoreSession({
    meta: { goal: 'g', agents: [{ name: 'Rima Lead', bio: 'b' }, { name: 'Zayd Builder', bio: 'b' }], settings: { handoffs: [{ next: 'Zayd' }] } },
    messages: [{ id: '1', agentId: 'a', agentName: 'Rima Lead', content: 'earlier', isUser: false, timestamp: new Date().toISOString() }],
    artifacts: [{ filename: 'engine.json', content: ENGINE, versions: [{ version: 1, content: ENGINE }, { version: 2, content: ENGINE + ' ' }] }],
  });
  const save = orchestrator.ledger.latestSave('engine.json');
  assert.deepEqual([save.version, save.messageCount, save.restored], [2, 0, true]);
  assert.deepEqual(orchestrator.getHandoffs(), [{ on: 'save', next: 'Zayd' }], 'hand-offs come back with the session');
});

test('reset clears the ledger and the hand-offs', () => {
  orchestrator.ledger.record('save', { artifact: 'a', messageCount: 0 });
  orchestrator.setHandoffs([{ next: 'Kasia' }]);
  orchestrator.reset();
  assert.equal(orchestrator.ledger.entries.length, 0);
  assert.deepEqual(orchestrator.getHandoffs(), []);
});

// ── the review hand-off ──────────────────────────────────────────────────────

test('hand-offs are cleaned: a name is required, at most eight, the file is optional', () => {
  const got = orchestrator.setHandoffs([{ next: '  Kasia  ' }, { next: '' }, null, { next: 'Rima', artifact: 'engine.json', evil: 1 }, { next: 5 }]);
  assert.deepEqual(got, [{ on: 'save', next: 'Kasia' }, { on: 'save', next: 'Rima', artifact: 'engine.json' }]);
  assert.equal(orchestrator.setHandoffs(Array.from({ length: 20 }, () => ({ next: 'Kasia' }))).length, 8);
  assert.deepEqual(orchestrator.setHandoffs('nope'), []);
});

test('after a save the reviewer speaks next, whatever the speaking order, and not again once she has', () => {
  orchestrator.setHandoffs([{ next: 'Kasia', artifact: 'engine.json' }]);
  say('Rima Lead', 'Zayd, please write it.');
  orchestrator.lastSpeakerId = agentNamed('Rima Lead').id;
  assert.equal(orchestrator._dueHandoff(), null, 'nothing has been saved');

  // Zayd saves; his message (the one that carries the save) is posted after
  orchestrator.broadcast('artifact_update', { filename: 'engine.json', version: 1, agentId: agentNamed('Zayd Builder').id });
  assert.equal(orchestrator._dueHandoff(), null, 'the message that carries the save is not posted yet');
  say('Zayd Builder', 'Saved engine.json, version 1.');
  orchestrator.lastSpeakerId = agentNamed('Zayd Builder').id;

  for (const mode of ['dynamic', 'round-robin', 'random', 'priority']) {
    orchestrator.setSpeakingOrder(mode);
    for (let i = 0; i < 6; i++) assert.equal(orchestrator.selectNextSpeaker().name, 'Kasia Skeptic', `${mode}: the reviewer is due`);
  }
  assert.equal(orchestrator._dueHandoff().artifact, 'engine.json');

  // she speaks: the hand-off is met until the next save
  say('Kasia Skeptic', 'Value six prints lettering. Fix that.');
  orchestrator.lastSpeakerId = agentNamed('Kasia Skeptic').id;
  assert.equal(orchestrator._dueHandoff(), null);
  orchestrator.broadcast('artifact_update', { filename: 'engine.json', version: 2, agentId: agentNamed('Zayd Builder').id });
  say('Zayd Builder', 'Fixed. Version 2.');
  orchestrator.lastSpeakerId = agentNamed('Zayd Builder').id;
  assert.equal(orchestrator.selectNextSpeaker().name, 'Kasia Skeptic', 'a new save asks her again');
});

test('a reviewer who saved the file herself, who is muted, who just spoke, or a hand-off for another file, is not asked', () => {
  const kasia = agentNamed('Kasia Skeptic');
  orchestrator.setHandoffs([{ next: 'Kasia', artifact: 'engine.json' }]);
  orchestrator.broadcast('artifact_update', { filename: 'engine.json', version: 1, agentId: kasia.id });
  say('Kasia Skeptic', 'I saved it myself.');
  say('Rima Lead', 'Thanks.');
  orchestrator.lastSpeakerId = agentNamed('Rima Lead').id;
  assert.equal(orchestrator._dueHandoff(), null, 'no second review of her own save');

  orchestrator.broadcast('artifact_update', { filename: 'engine.json', version: 2, agentId: agentNamed('Zayd Builder').id });
  say('Zayd Builder', 'Version 2.');
  orchestrator.lastSpeakerId = agentNamed('Zayd Builder').id;
  assert.equal(orchestrator._dueHandoff().agent.id, kasia.id);
  kasia.muted = true;
  assert.equal(orchestrator._dueHandoff(), null, 'muted agents are never picked');
  kasia.muted = false;
  orchestrator.lastSpeakerId = kasia.id;
  assert.equal(orchestrator._dueHandoff(), null, 'she cannot speak twice in a row');
  orchestrator.lastSpeakerId = agentNamed('Zayd Builder').id;
  orchestrator.setHandoffs([{ next: 'Kasia', artifact: 'other.json' }]);
  assert.equal(orchestrator._dueHandoff(), null, 'a save of another file does not call for her');
  orchestrator.setHandoffs([{ next: 'Nobody' }]);
  assert.equal(orchestrator._dueHandoff(), null, 'an unknown name is ignored, not an error');
});

test('the reviewer is told why she is speaking, and only she is', () => {
  orchestrator.setHandoffs([{ next: 'Kasia' }]);
  orchestrator.broadcast('artifact_update', { filename: 'engine.json', version: 3, agentId: agentNamed('Zayd Builder').id });
  say('Zayd Builder', 'Version 3.');
  orchestrator.lastSpeakerId = agentNamed('Zayd Builder').id;
  const forKasia = orchestrator._closingNotes(agentNamed('Kasia Skeptic'));
  assert.match(forKasia, /REVIEW: a new version of "engine\.json" was saved \(version 3\)/);
  assert.match(forKasia, /no objection and what you checked/);
  assert.equal(orchestrator._closingNotes(agentNamed('Rima Lead')), null);
});

// ── the gate, end to end ─────────────────────────────────────────────────────

test('the lead cannot close until the render, the proposal and the reviewer are all in the record', async () => {
  const queue = [];
  orchestrator.policy = {
    publish: { list: () => queue },
    companyId: 'c', roomId: 'r',
    clampMaxTurns: (n) => n || 60, toolNamesFor: () => [], strikeLimit: 3, record() {}, screensDrafts: false,
    canRun: () => ({ ok: true }), startLimits: ({ tokenLimit }) => ({ tokenLimit }), checkGoal: (g) => g,
    layerFor: () => ({ head: '', tail: '', nonce: 'n' }), spendLimitUsd: 100,
  };
  orchestrator.setDoneWhen([
    { type: 'tool_used', tool: 'render_artifact', artifact: 'engine.json', after: 'artifact:engine.json' },
    { type: 'proposal', artifact: 'engine.json' },
    { type: 'said_after', agent: 'Kasia', after: 'artifact:engine.json' },
  ]);
  orchestrator.artifactStore.save('engine.json', ENGINE, 'z', 'Zayd Builder');
  orchestrator.broadcast('artifact_update', { filename: 'engine.json', version: 1, agentId: 'z' });
  say('Zayd Builder', 'Saved.');

  // the lead tries to close with none of the three in the record
  let gate = await orchestrator._runDoneGate('lead_closed');
  assert.equal(gate.allowed, false);
  const refusal = orchestrator.messages.filter(m => m.isNote).at(-1).content;
  assert.match(refusal, /FAIL {2}render_artifact has succeeded on "engine\.json"/);
  assert.match(refusal, /FAIL {2}the latest version of "engine\.json" has been offered for publication/);
  assert.match(refusal, /FAIL {2}Kasia has spoken since "engine\.json" was last saved/);

  // she looks (the render), says what she thinks, and the proposal is made
  await orchestrator.render({ artifact: 'engine.json', draws: 1, speaker: agentNamed('Kasia Skeptic') });
  say('Kasia Skeptic', 'I looked at the draws; nothing prints lettering now.');
  const sha = (await import('node:crypto')).createHash('sha256').update(ENGINE, 'utf8').digest('hex');
  queue.push({ id: 'p1', kind: 'artifact', filename: 'engine.json', sha256: sha, status: 'pending', roomId: 'r' });
  gate = await orchestrator._runDoneGate('lead_closed');
  assert.equal(gate.allowed, true);

  // and an edit after all that puts all three back to failing
  orchestrator.artifactStore.save('engine.json', ENGINE + ' ', 'z', 'Zayd Builder');
  orchestrator.broadcast('artifact_update', { filename: 'engine.json', version: 2, agentId: 'z' });
  say('Zayd Builder', 'One more change.');
  const again = await orchestrator.checkDoneWhen();
  assert.equal(again.passed, false);
  assert.equal(again.results.filter(r => !r.passed).length, 3);
});
