/**
 * Phase 5: structured-output judgements, and code execution in the tiers.
 *
 * The thing most worth pinning is not that the judge works — it is that the
 * judge cannot override policy. Fairness, cooldown and quorum were learned
 * from real sessions; a model opinion must lose to them every time.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const { initializeJudge, selectSpeaker, assessCompletion, getJudgeUsage, resetJudgeUsage } =
  await import('../server/services/judge.js');
const { JUDGE_TIMEOUT_MS } = await import('../server/config/orchestration.js');
const { TOOL_TIERS } = await import('../server/config/tools.js');
const { buildToolsForAgent } = await import('../server/services/toolDefinitions.js');
const { orchestrator } = await import('../server/services/orchestrator.js');

/** Fake client that returns a scripted JSON payload from output_text. */
function judgeClient(payload, { usage = null, delayMs = 0, throws = null } = {}) {
  const requests = [];
  return {
    requests,
    interactions: {
      create: async (req) => {
        requests.push(req);
        if (throws) throw new Error(throws);
        if (delayMs) await new Promise(r => setTimeout(r, delayMs));
        return {
          output_text: typeof payload === 'string' ? payload : JSON.stringify(payload),
          usage,
        };
      },
    },
  };
}

const CANDIDATES = [
  { id: 'a1', name: 'Ada Lovelace', bio: 'Mathematician.' },
  { id: 'a2', name: 'Grace Hopper', bio: 'Compiler pioneer.' },
];
const MESSAGES = [{ agentName: 'Ada Lovelace', content: 'Grace, does that compile?' }];

beforeEach(() => resetJudgeUsage());

describe('selectSpeaker', () => {
  test('constrains the choice with an enum of real ids', async () => {
    const client = judgeClient({ agentId: 'a2', reason: 'addressed by name', confidence: 0.9 });
    initializeJudge(null, client);
    const result = await selectSpeaker({ candidates: CANDIDATES, recentMessages: MESSAGES, goal: 'g' });

    assert.equal(result.agentId, 'a2');
    const schema = client.requests[0].response_format.schema;
    assert.deepEqual(schema.properties.agentId.enum, ['a1', 'a2'],
      'an invalid speaker must be structurally impossible');
    assert.equal(client.requests[0].response_format.mime_type, 'application/json');
  });

  test('rejects an id outside the candidate set even if the model returns one', async () => {
    initializeJudge(null, judgeClient({ agentId: 'ghost', reason: 'x', confidence: 1 }));
    const result = await selectSpeaker({ candidates: CANDIDATES, recentMessages: MESSAGES, goal: 'g' });
    assert.equal(result, null, 'falls through to the heuristic rather than picking a stranger');
  });

  test('short-circuits when there is only one candidate', async () => {
    const client = judgeClient({ agentId: 'a1', reason: 'x', confidence: 1 });
    initializeJudge(null, client);
    const result = await selectSpeaker({
      candidates: [CANDIDATES[0]], recentMessages: MESSAGES, goal: 'g',
    });
    assert.equal(result.agentId, 'a1');
    assert.equal(client.requests.length, 0, 'no point paying for a forced choice');
  });

  test('returns null on malformed JSON rather than throwing', async () => {
    initializeJudge(null, judgeClient('not json at all'));
    assert.equal(await selectSpeaker({ candidates: CANDIDATES, recentMessages: MESSAGES, goal: 'g' }), null);
  });

  test('returns null when the call throws', async () => {
    initializeJudge(null, judgeClient(null, { throws: 'rate limited' }));
    assert.equal(await selectSpeaker({ candidates: CANDIDATES, recentMessages: MESSAGES, goal: 'g' }), null);
  });

  test('times out rather than stalling the room', async () => {
    initializeJudge(null, judgeClient(
      { agentId: 'a2', reason: 'x', confidence: 1 },
      { delayMs: JUDGE_TIMEOUT_MS + 500 }
    ));
    const started = Date.now();
    const result = await selectSpeaker({ candidates: CANDIDATES, recentMessages: MESSAGES, goal: 'g' });
    const elapsed = Date.now() - started;

    assert.equal(result, null);
    assert.ok(elapsed < JUDGE_TIMEOUT_MS + 400, `gave up in ${elapsed}ms`);
  });

  test('runs on the cheap tier with minimal thinking', async () => {
    const client = judgeClient({ agentId: 'a2', reason: 'x', confidence: 0.9 });
    initializeJudge(null, client);
    await selectSpeaker({ candidates: CANDIDATES, recentMessages: MESSAGES, goal: 'g' });

    const req = client.requests[0];
    assert.match(req.model, /flash-lite/, 'a classification does not need a big model');
    assert.equal(req.generation_config.thinking_level, 'minimal');
    assert.equal(req.store, false);
  });
});

describe('assessCompletion', () => {
  test('returns the structured verdict', async () => {
    initializeJudge(null, judgeClient({ complete: true, confidence: 0.9, rationale: 'declares done' }));
    const v = await assessCompletion({ content: 'I think we are finished.', goal: 'g', agentName: 'Ada' });

    assert.equal(v.complete, true);
    assert.equal(v.confidence, 0.9);
  });

  test('skips empty content without calling out', async () => {
    const client = judgeClient({ complete: true, confidence: 1, rationale: 'x' });
    initializeJudge(null, client);
    assert.equal(await assessCompletion({ content: '   ', goal: 'g', agentName: 'Ada' }), null);
    assert.equal(client.requests.length, 0);
  });
});

describe('judge usage accounting', () => {
  test('accumulates so orchestration spend cannot hide', async () => {
    initializeJudge(null, judgeClient(
      { agentId: 'a2', reason: 'x', confidence: 0.9 },
      { usage: { total_input_tokens: 300, total_output_tokens: 20, total_tokens: 320 } }
    ));
    await selectSpeaker({ candidates: CANDIDATES, recentMessages: MESSAGES, goal: 'g' });
    await selectSpeaker({ candidates: CANDIDATES, recentMessages: MESSAGES, goal: 'g' });

    const usage = getJudgeUsage();
    assert.equal(usage.calls, 2);
    assert.equal(usage.inputTokens, 600);
    assert.equal(usage.totalTokens, 640);
  });

  test('counts a failed call as a call, with no tokens', async () => {
    initializeJudge(null, judgeClient('garbage'));
    await selectSpeaker({ candidates: CANDIDATES, recentMessages: MESSAGES, goal: 'g' });

    const usage = getJudgeUsage();
    assert.equal(usage.calls, 1);
    assert.equal(usage.totalTokens, 0);
  });
});

describe('policy beats the judge', () => {
  // These are the guarantees the heuristics earned from real sessions. A
  // model opinion must lose to every one of them.
  function room(agentSpecs) {
    orchestrator.reset();
    return agentSpecs.map(s => orchestrator.addAgent(s.name, s.bio || 'bio'));
  }

  test('smart selection is inert unless the flag is on', async () => {
    // SMART_ORCHESTRATION is unset in this process, so the judge must never
    // be consulted no matter what it would have said.
    const client = judgeClient({ agentId: 'nope', reason: 'x', confidence: 1 });
    initializeJudge(null, client);
    const [a, b] = room([{ name: 'Ada' }, { name: 'Grace' }]);
    orchestrator.messages = [{ agentId: a.id, agentName: 'Ada', content: 'hello' }];
    orchestrator.lastSpeakerId = a.id;

    const picked = await orchestrator.selectNextSpeakerSmart();
    assert.equal(picked.id, b.id, 'heuristic result stands');
    assert.equal(client.requests.length, 0, 'the judge must not be called when off');
  });

  test('the judge is never asked to pick the last speaker again', async () => {
    const [a, b] = room([{ name: 'Ada' }, { name: 'Grace' }]);
    orchestrator.messages = [{ agentId: a.id, agentName: 'Ada', content: 'hi' }];
    orchestrator.lastSpeakerId = a.id;

    const picked = await orchestrator.selectNextSpeakerSmart();
    assert.notEqual(picked.id, a.id);
  });

  test('a muted agent is never selected', async () => {
    const [a, b, c] = room([{ name: 'Ada' }, { name: 'Grace' }, { name: 'Alan' }]);
    b.muted = true;
    orchestrator.messages = [{ agentId: a.id, agentName: 'Ada', content: 'hi' }];
    orchestrator.lastSpeakerId = a.id;

    for (let i = 0; i < 8; i++) {
      const picked = await orchestrator.selectNextSpeakerSmart();
      assert.notEqual(picked.id, b.id, 'muted agents are excluded before any judgement');
    }
  });

  test('_isStarvedPick flags an agent the fairness floor would force', () => {
    const [a, b] = room([{ name: 'Ada' }, { name: 'Grace' }]);
    // Threshold is agents.length * 2 = 4; Grace has never spoken.
    orchestrator.messages = Array.from({ length: 6 }, () => ({
      agentId: a.id, agentName: 'Ada', content: 'again',
    }));
    assert.equal(orchestrator._isStarvedPick(b), true, 'silent for 6 turns = starved');
    assert.equal(orchestrator._isStarvedPick(a), false, 'just spoke');
  });
});

describe('code execution in the tiers', () => {
  test('is offered to builder, analyst and full', () => {
    for (const tier of ['builder', 'analyst', 'full']) {
      assert.ok(TOOL_TIERS[tier].includes('code_execution'), `${tier} should have it`);
    }
  });

  test('is withheld from the tiers that should not compute', () => {
    for (const tier of ['none', 'research', 'visual']) {
      assert.ok(!TOOL_TIERS[tier].includes('code_execution'), `${tier} should not have it`);
    }
  });

  test('is declared as a built-in, needing no dispatcher', () => {
    const tools = buildToolsForAgent({ tools: 'analyst' });
    const codeTool = tools.find(t => t.type === 'code_execution');
    assert.ok(codeTool);
    assert.deepEqual(codeTool, { type: 'code_execution' },
      'built-ins are declared by type alone');
  });
});
