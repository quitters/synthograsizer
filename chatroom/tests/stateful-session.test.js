/**
 * Phase 3: stateful chains, prompt ordering, and the delta transcript.
 *
 * The contract worth pinning is that stateless remains the default and is
 * byte-for-byte unaffected, and that when chaining IS on, a turn stops
 * re-sending history the server already holds.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const { initializeGemini, generateAgentResponse, deleteInteractions } =
  await import('../server/services/gemini.js');
const { FakeGenAI, makeAgent, drain } = await import('./helpers/fakeGenAI.js');

const GOAL = 'Design a legible dashboard.';
const OTHERS = [makeAgent(), makeAgent({ id: 'agent-2', name: 'Grace Hopper' })];

function messagesFixture(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    agentName: i % 2 === 0 ? 'Ada Lovelace' : 'Grace Hopper',
    content: `Message number ${i}.`,
    tokenCount: 5,
  }));
}

async function runTurn(script, options = {}, messages = []) {
  const fake = new FakeGenAI(script);
  initializeGemini(null, fake);
  const result = await drain(
    generateAgentResponse(makeAgent(), OTHERS, messages, GOAL, [], options)
  );
  return { fake, ...result };
}

beforeEach(() => {
  initializeGemini(null, new FakeGenAI([{ throws: 'no fake installed' }]));
});

describe('the app default is retention ON', () => {
  test('isStatefulEnabled() is true unless explicitly opted out', async () => {
    // Flipped 2026-09-12: the operator accepted the 55-day retention in
    // exchange for chaining and implicit caching. Only the literal string
    // "false" opts out, so a typo cannot silently change the posture.
    const { isStatefulEnabled } = await import('../server/config/session.js');
    assert.equal(isStatefulEnabled(), process.env.GEMINI_STORE_INTERACTIONS !== 'false');
    if (!process.env.GEMINI_STORE_INTERACTIONS) {
      assert.equal(isStatefulEnabled(), true, 'retention should be on by default');
    }
  });
});

describe('generateAgentResponse stays stateless unless told otherwise', () => {
  // The function-level default is still false: the orchestrator decides the
  // session posture and passes it in, so a direct caller cannot accidentally
  // create stored interactions.
  test('store is false and no chain is sent', { timeout: 15000 }, async () => {
    const { fake, complete } = await runTurn([{ fixture: 'simple-turn' }], {}, messagesFixture(5));
    const req = fake.request(0);

    assert.equal(req.store, false);
    assert.equal(req.previous_interaction_id, undefined);
    assert.equal(complete.interactionId, null, 'nothing to chain from when nothing is stored');
  });

  test('the full windowed transcript is sent every turn', { timeout: 15000 }, async () => {
    const { fake } = await runTurn([{ fixture: 'simple-turn' }], {}, messagesFixture(5));
    const text = fake.request(0).input[0].text;

    assert.ok(text.includes('CONVERSATION TRANSCRIPT'));
    for (let i = 0; i < 5; i++) {
      assert.ok(text.includes(`Message number ${i}.`), `message ${i} missing`);
    }
  });

  test('a chain id is ignored unless store is on', { timeout: 15000 }, async () => {
    const { fake } = await runTurn(
      [{ fixture: 'simple-turn' }],
      { previousInteractionId: 'int_stale_001', sinceMessageIndex: 3 },
      messagesFixture(5)
    );
    assert.equal(fake.request(0).previous_interaction_id, undefined);
    assert.ok(fake.request(0).input[0].text.includes('Message number 0.'),
      'without store, the full transcript must still be sent');
  });
});

describe('stateful chaining', () => {
  test('sends store:true and returns a chainable id', { timeout: 15000 }, async () => {
    const { fake, complete } = await runTurn(
      [{ fixture: 'simple-turn' }], { store: true }, messagesFixture(3)
    );
    assert.equal(fake.request(0).store, true);
    assert.equal(complete.interactionId, 'int_simple_001');
  });

  test('a first turn has no chain, so it sends the full transcript', { timeout: 15000 }, async () => {
    const { fake } = await runTurn([{ fixture: 'simple-turn' }], { store: true }, messagesFixture(4));
    assert.equal(fake.request(0).previous_interaction_id, undefined);
    assert.ok(fake.request(0).input[0].text.includes('CONVERSATION TRANSCRIPT'));
  });

  test('a chained turn sends only messages the agent has not seen', { timeout: 15000 }, async () => {
    const { fake } = await runTurn(
      [{ fixture: 'simple-turn' }],
      { store: true, previousInteractionId: 'int_prev_001', sinceMessageIndex: 3 },
      messagesFixture(5)
    );
    const req = fake.request(0);
    const text = req.input[0].text;

    assert.equal(req.previous_interaction_id, 'int_prev_001');
    assert.ok(text.includes('SINCE YOUR LAST TURN (2 new messages)'));
    assert.ok(text.includes('Message number 3.'));
    assert.ok(text.includes('Message number 4.'));
    // The whole point: history the server already holds is not re-sent.
    assert.ok(!text.includes('Message number 0.'));
    assert.ok(!text.includes('Message number 2.'));
    assert.ok(!text.includes('CONVERSATION TRANSCRIPT'));
  });

  test('handles a chained turn where nothing new was said', { timeout: 15000 }, async () => {
    const { fake } = await runTurn(
      [{ fixture: 'simple-turn' }],
      { store: true, previousInteractionId: 'int_prev_002', sinceMessageIndex: 5 },
      messagesFixture(5)
    );
    assert.ok(fake.request(0).input[0].text.includes('Nothing new has been said'));
  });

  test('an interaction that did not complete is not chainable', { timeout: 15000 }, async () => {
    // truncated-turn ends 'incomplete'; chaining from a non-completed
    // interaction is a documented 400.
    const { complete } = await runTurn(
      [{ fixture: 'truncated-turn' }], { store: true }, messagesFixture(2)
    );
    assert.equal(complete.interactionId, null);
    assert.equal(complete.wasTruncated, true);
  });

  test('a truncation continuation does not re-anchor to the chain head', { timeout: 15000 }, async () => {
    const { fake } = await runTurn(
      [{ fixture: 'truncated-turn' }, { fixture: 'continuation-turn' }],
      { store: true, previousInteractionId: 'int_prev_003', sinceMessageIndex: 0 },
      messagesFixture(2)
    );
    assert.equal(fake.request(0).previous_interaction_id, 'int_prev_003');
    assert.equal(fake.request(1).previous_interaction_id, undefined,
      'the continuation re-sends the prompt plus partial text; chaining it would duplicate history');
  });
});

describe('prompt ordering for cache hits', () => {
  test('the room-shared block precedes the per-agent persona', { timeout: 15000 }, async () => {
    const { fake } = await runTurn([{ fixture: 'simple-turn' }]);
    const prompt = fake.request(0).system_instruction;

    const toolsAt = prompt.indexOf('TOOLS (use sparingly');
    const personaAt = prompt.indexOf('YOUR CHARACTER: you are roleplaying as');
    assert.ok(toolsAt >= 0 && personaAt >= 0, 'both sections should be present in tag mode');
    assert.ok(toolsAt < personaAt,
      'shared content must lead so all agents share one cacheable prefix');
  });

  test('two agents in the same room share an identical prefix', { timeout: 15000 }, async () => {
    const fake = new FakeGenAI([{ fixture: 'simple-turn' }]);
    initializeGemini(null, fake);
    await drain(generateAgentResponse(
      makeAgent({ id: 'a', name: 'Ada Lovelace' }), OTHERS, [], GOAL, [], {}
    ));
    await drain(generateAgentResponse(
      makeAgent({ id: 'b', name: 'Grace Hopper', bio: 'Compiler pioneer.' }), OTHERS, [], GOAL, [], {}
    ));

    const [a, b] = [fake.request(0).system_instruction, fake.request(1).system_instruction];
    let shared = 0;
    while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;

    // Before Phase 3 these diverged at the agent name, roughly byte 40.
    assert.ok(shared > 1000,
      `agents share only ${shared} chars of prefix — reordering regressed`);
    assert.notEqual(a, b, 'the personas must still differ');
  });
});

describe('interaction cleanup', () => {
  test('deletes each id and survives failures', async () => {
    const deleted = [];
    initializeGemini(null, {
      interactions: {
        create: async () => { throw new Error('unused'); },
        delete: async (id) => {
          deleted.push(id);
          if (id === 'boom') throw new Error('already gone');
          return {};
        },
      },
    });

    const result = await deleteInteractions(['a', 'boom', 'c', null]);
    assert.deepEqual(deleted, ['a', 'boom', 'c'], 'nulls skipped, one failure not fatal');
    assert.equal(result.deleted, 2);
    assert.equal(result.failed, 1);
  });

  test('is a no-op with nothing to delete', async () => {
    const result = await deleteInteractions([]);
    assert.deepEqual(result, { deleted: 0, failed: 0 });
  });
});
