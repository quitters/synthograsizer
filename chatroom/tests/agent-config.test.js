/**
 * Contract tests for the model registry and the per-agent fields added in
 * Phase 0. Phase 2 tiers tools per agent role on top of these, so the
 * precedence rules and the usage accumulator are worth pinning now.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const {
  MODELS,
  DEFAULT_AGENT_MODEL,
  DEFAULT_THINKING_LEVEL,
  THINKING_LEVELS,
  AGENT_MODEL_CHOICES,
  resolveAgentModel,
  normalizeThinkingLevel,
  isKnownAgentModel,
} = await import('../server/config/models.js');
const { orchestrator } = await import('../server/services/orchestrator.js');

describe('model registry', () => {
  test('no model ID carries a retired -preview image alias', () => {
    // gemini-3.1-flash-image-preview and gemini-3-pro-image-preview were shut
    // down 2026-06-25. Re-adding either silently breaks image generation.
    for (const [name, id] of Object.entries(MODELS)) {
      assert.ok(
        !/image-preview$/.test(id),
        `${name} (${id}) uses a retired preview image alias`
      );
    }
  });

  test('image understanding does not point at an image-generation model', () => {
    assert.ok(
      !/-image$/.test(MODELS.IMAGE_UNDERSTANDING),
      'IMAGE_UNDERSTANDING must be a text model — Nano Banana emits images, it does not describe them'
    );
  });

  test('every offered model is a known model', () => {
    for (const choice of AGENT_MODEL_CHOICES) {
      assert.ok(isKnownAgentModel(choice.id), `${choice.id} is offered but not recognised`);
      assert.ok(choice.label, `${choice.id} has no label`);
      assert.ok(choice.blurb, `${choice.id} has no blurb`);
    }
  });

  test('the default agent model is one of the offered choices', () => {
    assert.ok(isKnownAgentModel(DEFAULT_AGENT_MODEL));
  });

  test('the default thinking level is a valid level', () => {
    assert.ok(THINKING_LEVELS.includes(DEFAULT_THINKING_LEVEL));
  });
});

describe('resolveAgentModel', () => {
  test('per-agent model wins', () => {
    assert.equal(resolveAgentModel({ model: MODELS.SMART }, MODELS.LITE), MODELS.SMART);
  });

  test('session preference applies when the agent has none', () => {
    assert.equal(resolveAgentModel({ model: null }, MODELS.LITE), MODELS.LITE);
  });

  test('registry default is the last resort', () => {
    assert.equal(resolveAgentModel({ model: null }, null), DEFAULT_AGENT_MODEL);
    assert.equal(resolveAgentModel(null, null), DEFAULT_AGENT_MODEL);
  });
});

describe('normalizeThinkingLevel', () => {
  test('passes through valid levels, case-insensitively', () => {
    assert.equal(normalizeThinkingLevel('high'), 'high');
    assert.equal(normalizeThinkingLevel('  HIGH '), 'high');
  });

  test('coerces anything else to the default', () => {
    for (const bad of ['ludicrous', '', null, undefined, 42, {}]) {
      assert.equal(normalizeThinkingLevel(bad), DEFAULT_THINKING_LEVEL);
    }
  });
});

describe('orchestrator agent fields', () => {
  beforeEach(() => orchestrator.reset());

  test('an agent added without a model leaves it unset', () => {
    // Storing the default here would silently override the session-wide
    // model preference that /api/chat/start accepts.
    const agent = orchestrator.addAgent('Ada', 'bio');
    assert.equal(agent.model, null);
    assert.equal(agent.thinkingLevel, DEFAULT_THINKING_LEVEL);
  });

  test('an explicit model is kept; an unknown one is not', () => {
    const good = orchestrator.addAgent('Ada', 'bio', { model: MODELS.SMART });
    assert.equal(good.model, MODELS.SMART);

    const bad = orchestrator.addAgent('Grace', 'bio', { model: 'gemini-9-imaginary' });
    assert.equal(bad.model, null, 'an unknown model should fall back, not be stored');
  });

  test('updateAgent can change model and thinking level by name', () => {
    orchestrator.addAgent('Ada', 'bio');
    const updated = orchestrator.updateAgent('Ada', {
      model: MODELS.LITE,
      thinkingLevel: 'high',
    });
    assert.equal(updated.model, MODELS.LITE);
    assert.equal(updated.thinkingLevel, 'high');
  });

  test('updateAgent ignores an unknown model rather than clearing the old one', () => {
    orchestrator.addAgent('Ada', 'bio', { model: MODELS.SMART });
    const updated = orchestrator.updateAgent('Ada', { model: 'nope' });
    assert.equal(updated.model, MODELS.SMART);
  });
});

describe('orchestrator usage accumulation', () => {
  beforeEach(() => orchestrator.reset());

  test('starts zeroed', () => {
    assert.equal(orchestrator.usage.totalTokens, 0);
    assert.equal(orchestrator.usage.reportedTurns, 0);
    assert.equal(orchestrator.usage.estimatedTurns, 0);
  });

  test('sums reported turns', () => {
    const turn = {
      inputTokens: 100, outputTokens: 20, thoughtTokens: 5,
      cachedTokens: 64, toolUseTokens: 1, totalTokens: 125,
    };
    orchestrator._accumulateUsage(turn, true);
    orchestrator._accumulateUsage(turn, true);

    assert.equal(orchestrator.usage.inputTokens, 200);
    assert.equal(orchestrator.usage.outputTokens, 40);
    assert.equal(orchestrator.usage.thoughtTokens, 10);
    assert.equal(orchestrator.usage.cachedTokens, 128);
    assert.equal(orchestrator.usage.totalTokens, 250);
    assert.equal(orchestrator.usage.reportedTurns, 2);
    assert.equal(orchestrator.usage.estimatedTurns, 0);
  });

  test('counts an unreported turn without corrupting the totals', () => {
    orchestrator._accumulateUsage(null, false);

    assert.equal(orchestrator.usage.totalTokens, 0);
    assert.equal(orchestrator.usage.reportedTurns, 0);
    assert.equal(orchestrator.usage.estimatedTurns, 1);
  });

  test('session state exposes the usage breakdown', () => {
    orchestrator._accumulateUsage(
      { inputTokens: 10, outputTokens: 2, thoughtTokens: 0, cachedTokens: 0, toolUseTokens: 0, totalTokens: 12 },
      true
    );
    const state = orchestrator.getState();
    assert.equal(state.usage.inputTokens, 10);
    assert.equal(state.usage.totalTokens, 12);
  });
});
