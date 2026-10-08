import test from 'node:test';
import assert from 'node:assert/strict';
import { checkClaim, recordText, recordOf, summaryPrompt, summarizeFor, transcriptFor, closeOutRoom, MEMORY_SCHEMA } from './memory.js';
import { sqliteAvailable } from './sqlite.js';
import { RosterStore } from './roster.js';
import { admitDepartment, MEMORY_HEADING } from './admit.js';
import { ChatOrchestrator } from '../../services/orchestrator.js';
import { MediaStore } from '../../services/mediaStore.js';
import { ArtifactStore } from '../../services/artifactStore.js';
import { newId } from '../util.js';

/**
 * Memory: written by the person, given the record first, and checked against it. The pilot's lead wrote that the team had "approved publishing" when
 * nothing had been proposed; the claim is flagged, kept for the owner to see, and not handed back.
 */
const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';

const rec = (over = {}) => ({ renders: 0, images: 0, artifacts: [], versions: {}, offered: 0, pending: 0, approved: 0, rejected: 0, blocked: 0, superseded: 0, messages: 0, ...over });

test('a claim the record contradicts is flagged with the reason; one it supports is confirmed; what it cannot answer is unchecked', () => {
  const none = rec();
  const c = checkClaim('The team approved publishing.', none);
  assert.equal(c.verdict, 'contradicted');
  assert.match(c.notes[0], /says something was approved for publication, but the owner approved nothing/);
  assert.equal(checkClaim('The team approved publishing.', rec({ approved: 1 })).verdict, 'confirmed');
  assert.equal(checkClaim('We published the engine on day two.', none).verdict, 'unchecked', 'not a form of claim the check reads');
  assert.equal(checkClaim('The engine was published at the end.', none).verdict, 'contradicted');
  assert.equal(checkClaim('Rima keeps the running order and calls the close in stage terms.', none).verdict, 'unchecked');

  assert.equal(checkClaim('We proposed the final engine for publication.', none).verdict, 'contradicted');
  assert.equal(checkClaim('We proposed the final engine for publication.', rec({ offered: 3, pending: 1, superseded: 2 })).verdict, 'confirmed');

  assert.equal(checkClaim('Zayd saved engine.json and we drew 4 pictures.', rec({ artifacts: ['engine.json'], images: 4 })).verdict, 'confirmed');
  const fewer = checkClaim('We looked at four fresh draws.', rec({ images: 2, renders: 1 }));
  assert.equal(fewer.verdict, 'contradicted');
  assert.match(fewer.notes[0], /mentions 4 pictures, but the room made 2/);
  assert.equal(checkClaim('I wrote engine.json myself.', rec()).verdict, 'contradicted');
  assert.match(checkClaim('Zayd saved engine.json twice.', rec({ artifacts: ['other.json'] })).notes[0], /says engine\.json was saved, but there is no such file/);
  assert.equal(checkClaim('We rendered it and looked at the pictures.', rec()).verdict, 'contradicted');
  assert.equal(checkClaim('We rendered it and looked at the pictures.', rec({ images: 5, renders: 2 })).verdict, 'confirmed');
});

test('a sentence that is negated, hypothetical or about next time is not a claim', () => {
  for (const text of [
    'We did not approve publishing; Rima said so twice.', 'Nobody approved publishing, and nobody could.', 'Next time we should render before we close.', 'Still waiting for the owner to approve publication.',
    'If it were approved for publication we would celebrate.', 'We never proposed it for publication.', 'I hope to propose it for publication tomorrow.', 'We need to draw 6 pictures before closing.',
  ]) assert.notEqual(checkClaim(text, rec()).verdict, 'contradicted', text);
  // one sentence claims and another hedges: the claim is still read
  assert.equal(checkClaim('We did not draw anything yet. The team approved publishing.', rec()).verdict, 'contradicted');
});

test('the record: what the room made, saved, offered and had decided, in plain sentences', () => {
  const orchestrator = new ChatOrchestrator({ mediaStore: new MediaStore(), artifactStore: new ArtifactStore() });
  orchestrator.policy = { roomId: 'r1' };
  orchestrator.mediaStore.add({ id: 'i1', type: 'image', data: 'x', mimeType: 'image/png', prompt: 'p' });
  orchestrator.mediaStore.add({ id: 'i2', type: 'image', data: 'x', mimeType: 'image/png', prompt: 'p' });
  orchestrator.artifactStore.save('engine.json', '{}');
  orchestrator.artifactStore.save('engine.json', '{"v":2}');
  orchestrator.ledger.record('tool', { tool: 'render_artifact', ok: true });
  orchestrator.ledger.record('tool', { tool: 'render_artifact', ok: false });
  orchestrator.messages.push({ agentId: 'a', agentName: 'A', content: 'hi' }, { agentId: 'user', agentName: 'Producer', content: 'note', isNote: true, isUser: true });
  const r = recordOf({ orchestrator, proposals: [{ roomId: 'r1', status: 'superseded' }, { roomId: 'r1', status: 'pending' }, { roomId: 'other', status: 'approved' }] });
  assert.deepEqual([r.images, r.renders, r.artifacts, r.versions, r.offered, r.pending, r.superseded, r.approved, r.messages], [2, 1, ['engine.json'], { 'engine.json': 2 }, 2, 1, 1, 0, 1]);
  const text = recordText(r);
  assert.match(text, /Pictures the room made: 2, from 1 successful render\./);
  assert.match(text, /Files saved: engine\.json \(2 versions\)\./);
  assert.match(text, /Offered for publication: 2 times\. Waiting for the owner: 1\. Approved by the owner: 0\./);
  assert.match(text, /Nothing has been approved\. Only the owner can approve, and the room cannot\./);
  assert.match(recordText(rec()), /Nothing was offered for publication, so nothing was approved or published\./);
});

test('the person is given the record first, and told it is the truth', async () => {
  const seen = [];
  const ask = async (call) => { seen.push(call); return { summary: 'We chose the Archive concept; Kasia held the line on lettering.', lesson: 'Draw before discussing.', relationships: [{ colleague: 'Kasia Wójcik-Lindqvist', note: 'blunt and right about the captions' }, { colleague: 'Zayd Siddiqui', note: '   ' }] }; };
  const entries = await summarizeFor({ ask, bio: 'Rima, the producer.', transcript: 'Rima: hello', record: rec({ images: 4 }), colleagues: ['Kasia Wójcik-Lindqvist', 'Zayd Siddiqui'], model: 'gemini-3.8-flash', thinking: 'high' });
  assert.equal(seen[0].system, 'Rima, the producer.');
  assert.equal(seen[0].thinking, 'medium', 'a person on high thinking summarises on medium');
  assert.match(seen[0].prompt, /THE RECORD \(what the server saw; it is the truth, and your memory must agree with it\)\nPictures the room made: 4\./);
  assert.match(seen[0].prompt, /do not claim anything the record above does not show/);
  assert.match(seen[0].prompt, /THE SESSION\nRima: hello/);
  assert.deepEqual(entries, [
    { kind: 'summary', text: 'We chose the Archive concept; Kasia held the line on lettering.' },
    { kind: 'lesson', text: 'Draw before discussing.' },
    { kind: 'relationship', text: 'Kasia: blunt and right about the captions' },
  ]);
  assert.ok(MEMORY_SCHEMA.required.includes('lesson'));
  assert.match(summaryPrompt({ transcript: 't', record: rec(), colleagues: ['A', 'B'] }), /The people in it: A, B\./);
});

test('the transcript is bounded, newest kept, notes left out, tools named', () => {
  const messages = [
    { agentName: 'Rima Haddad-Boudreau', content: 'first' }, { agentName: 'Producer', content: 'a note', isNote: true },
    { agentName: 'Zayd Siddiqui', content: 'second', toolCalls: [{ name: 'write_artifact' }, { name: 'render_artifact' }] },
  ];
  assert.equal(transcriptFor(messages), 'Rima: first\n\nZayd: second  [used: write_artifact, render_artifact]');
  const many = Array.from({ length: 100 }, (_, i) => ({ agentName: 'A B', content: `line ${i} ${'x'.repeat(2000)}` }));
  const t = transcriptFor(many, { maxChars: 10_000 });
  assert.ok(t.length <= 10_100 && t.startsWith('(earlier messages left out)') && t.includes('line 99'), 'the end of the session, which is what they remember');
});

test('closing out a session: each person who spoke writes their memory, it is checked against the record, flagged ones are kept and not handed back, and the room starts the next day from it', { skip }, async () => {
  const roster = RosterStore.open({ file: ':memory:' });
  const ownerId = newId();
  const company = { id: newId() };
  const department = { id: 'abcd1234' };
  const names = ['Rima Haddad-Boudreau', 'Kasia Wójcik-Lindqvist', 'Zayd Siddiqui'];
  for (const name of names) {
    const c = roster.addCandidate(ownerId, { profile: { id: `p_${name}`, name, bioTemplate: '{{agent_name}}, a person.', variables: [], anchors: { agent_name: name }, tags: [] }, archetype: 'steward', role: 'x', status: 'ready' });
    roster.hire(ownerId, { companyId: company.id, departmentId: department.id, candidateId: c.id, position: 'x' });
  }
  const orchestrator = new ChatOrchestrator({ mediaStore: new MediaStore(), artifactStore: new ArtifactStore() });
  orchestrator.delay = () => Promise.resolve();
  orchestrator.broadcast = () => {};
  admitDepartment({ roster, ownerId, companyId: company.id, departmentId: department.id, orchestrator });
  const [rima, kasia] = orchestrator.agents;
  orchestrator.messages.push(
    { id: '1', agentId: rima.id, agentName: rima.name, content: 'Let us begin.', isUser: false },
    { id: '2', agentId: kasia.id, agentName: kasia.name, content: 'Value six prints lettering.', isUser: false },
  );
  orchestrator.artifactStore.save('engine.json', '{}');

  const calls = [];
  const ask = async (call) => {
    calls.push(call);
    const who = call.system.split(',')[0];
    return who === 'Rima Haddad-Boudreau'
      ? { summary: 'The team approved publishing.', lesson: 'Close only with pictures.', relationships: [] }
      : { summary: `We began; ${who.split(' ')[0]} spoke up about lettering.`, lesson: '', relationships: [{ colleague: 'Rima Haddad-Boudreau', note: 'calls the close in stage terms' }] };
  };
  const out = await closeOutRoom({ ask, roster, ownerId, company, department, orchestrator, proposals: [], session: 'day-1' });

  assert.equal(calls.length, 2, 'Zayd did not speak, so he has nothing to write down');
  assert.deepEqual(out.people.map(p => [p.name.split(' ')[0], p.entries.length, p.skipped || null]), [['Rima', 2, null], ['Kasia', 2, null], ['Zayd', 0, 'did not speak']]);
  assert.equal(out.session, 'day-1');
  assert.equal(out.flagged.length, 1);
  assert.equal(out.flagged[0].name, 'Rima Haddad-Boudreau');
  assert.match(out.flagged[0].note, /Contradicted by the record: says something was approved for publication, but the owner approved nothing/);

  // kept for the owner (flagged), not handed back; the others are
  const rimaId = orchestrator.agents[0].employeeId;
  const kept = roster.listMemory(ownerId, rimaId);
  assert.deepEqual(kept.map(m => [m.kind, m.verified, m.source, m.session]), [['summary', 'contradicted', 'agent', 'day-1'], ['lesson', 'unchecked', 'agent', 'day-1']]);
  assert.deepEqual(roster.memoryForBio(ownerId, rimaId).map(m => m.text), ['Close only with pictures.']);
  const kasiaMemory = roster.listMemory(ownerId, kasia.employeeId);
  assert.deepEqual(kasiaMemory.map(m => m.text), ['We began; Kasia spoke up about lettering.', 'Rima: calls the close in stage terms']);

  // the sessions are counted for everyone seated, and the live room's bios already carry what they remember
  assert.deepEqual(roster.seatsOf(ownerId, company.id).map(s => s.sessions), [1, 1, 1]);
  assert.ok(kasia.bio.includes(`${MEMORY_HEADING}\n- (day-1) We began; Kasia spoke up about lettering.`));
  assert.ok(!orchestrator.agents[0].bio.includes('approved publishing'));
  assert.ok(orchestrator.agents[0].bio.includes('Close only with pictures.'));
  roster.close();
});

test('closing out draws each person\'s three settings again for the next session, within the band their casting allows, the same way every time', { skip }, async () => {
  const roster = RosterStore.open({ file: ':memory:' });
  const ownerId = newId();
  const company = { id: newId() };
  const department = { id: 'abcd1234' };
  const names = ['Rima Haddad-Boudreau', 'Kasia Wójcik-Lindqvist'];
  const dissent = { 'Rima Haddad-Boudreau': 'low', 'Kasia Wójcik-Lindqvist': 'high' };
  for (const name of names) {
    const c = roster.addCandidate(ownerId, { profile: { id: `p_${name}`, name, bioTemplate: '{{agent_name}}, a person.', variables: [], anchors: { agent_name: name }, tags: [] }, casting: { dissent: dissent[name] }, archetype: 'steward', role: 'x', status: 'ready' });
    roster.hire(ownerId, { companyId: company.id, departmentId: department.id, candidateId: c.id, position: 'x', knobs: { tempo: 0, candor: 0, push: 0 } });
  }
  const orchestrator = new ChatOrchestrator({ mediaStore: new MediaStore(), artifactStore: new ArtifactStore() });
  orchestrator.delay = () => Promise.resolve();
  orchestrator.broadcast = () => {};
  admitDepartment({ roster, ownerId, companyId: company.id, departmentId: department.id, orchestrator });
  orchestrator.messages.push({ id: '1', agentId: orchestrator.agents[0].id, agentName: orchestrator.agents[0].name, content: 'Hello.', isUser: false });
  const ask = async () => ({ summary: 'We began.', lesson: '', relationships: [] });
  const bands = { low: { candor: [0, 1], push: [0, 2], tempo: [0, 2] }, high: { candor: [2, 3], push: [2, 3], tempo: [1, 2] } };
  const before = roster.employeesOf(ownerId, company.id).map(e => e.knobs);
  assert.deepEqual(before, [{ tempo: 0, candor: 0, push: 0 }, { tempo: 0, candor: 0, push: 0 }]);
  await closeOutRoom({ ask, roster, ownerId, company, department, orchestrator });
  const after = roster.employeesOf(ownerId, company.id);
  for (const e of after) {
    const band = bands[dissent[e.name]];
    for (const [k, [lo, hi]] of Object.entries(band)) assert.ok(e.knobs[k] >= lo && e.knobs[k] <= hi, `${e.name} ${k}=${e.knobs[k]} is inside ${lo}-${hi}`);
  }
  assert.ok(after[1].knobs.candor >= 2, 'a person cast to disagree is not drawn gentle');
  // and the next session's draw is inside the band too
  await closeOutRoom({ ask, roster, ownerId, company, department, orchestrator });
  for (const e of roster.employeesOf(ownerId, company.id)) {
    for (const [k, [lo, hi]] of Object.entries(bands[dissent[e.name]])) assert.ok(e.knobs[k] >= lo && e.knobs[k] <= hi, `${e.name} ${k}=${e.knobs[k]} (second session)`);
  }
  roster.close();
});
