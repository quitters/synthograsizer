import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeServices, makeRoom, scripted, until, named } from './testKit.js';

/**
 * A company's room has the repeat check whatever its settings say (an unattended room is exactly where a loop is expensive),
 * writes it in the company's audit log without the words, and pauses for the owner like any other stop.
 */

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

function setup(opts = {}) {
  const { services, cleanup } = makeServices(opts.services);
  cleanups.push(cleanup);
  const room = makeRoom({ services, ...opts.room });
  cleanups.push(() => { if (room.orchestrator.isRunning) room.orchestrator.stop('test_over'); });
  return { services, ...room };
}

const STUCK = 'The renderer returned render_artifact failed once more and the connection to the image generation endpoint remains down, so I will wait on that socket and verify the token distributions again meanwhile.';
const NEW = [
  'The first draft keeps six variables with balanced weights, and every value is a short noun phrase that can stand alone in the sentence.',
  'The lighting values overlap with the plumage values, which would let two different draws collapse into the same picture, so one list needs trimming.',
  'Merging the two weakest perches frees a slot for a second water behaviour, since the reflections carry most of the mood in these scenes.',
];
const annStuck = (n, who) => (who.startsWith('Ann') ? STUCK : NEW[Math.floor(n / 2) % NEW.length]);

test('a company room pauses for the owner when a person repeats, writes it to the audit log without the words, and resumes', async () => {
  const { orchestrator, events, services, company } = setup();
  orchestrator.addAgent('Ann Test', 'You are Ann.');
  orchestrator.addAgent('Ben Test', 'You are Ben.');
  const agents = scripted(orchestrator, annStuck);
  await orchestrator.start('Make a poster', 100000);
  await until(() => orchestrator.isPaused);

  assert.equal(named(events, 'repeat_pause')[0].agentName, 'Ann Test');
  assert.equal(orchestrator.getState().repeatPause.count, 3);
  assert.equal(orchestrator.getState().policy.safety.pausedFor, null, 'not a safety strike: the safety layer did nothing');
  const entry = services.audit.read(company.id).find(e => e.type === 'repeat_pause');
  assert.equal(entry.agent, 'Ann Test');
  assert.equal(entry.count, 3);
  assert.ok(!JSON.stringify(services.audit.read(company.id)).includes('render_artifact'), 'the decision is logged, never the words');

  const before = agents.calls();
  orchestrator.resume();
  assert.equal(orchestrator.isPaused, false);
  await until(() => orchestrator.isPaused && named(events, 'repeat_pause').length === 2);
  assert.ok(agents.calls() > before);
  orchestrator.stop();
});

test('in a company room the check cannot be turned off from the settings', async () => {
  const { orchestrator, events } = setup();
  orchestrator.addAgent('Ann Test', 'You are Ann.');
  orchestrator.addAgent('Ben Test', 'You are Ben.');
  orchestrator.updateConsensusSettings({ repeatWindow: 0 });
  assert.equal(orchestrator.getConsensusSettings().repeatWindow, 0, 'the setting says off');
  scripted(orchestrator, annStuck);
  await orchestrator.start('Make a poster', 100000);
  await until(() => orchestrator.isPaused);
  assert.equal(named(events, 'repeat_pause').length, 1, 'and it paused anyway');
  orchestrator.stop();
});
