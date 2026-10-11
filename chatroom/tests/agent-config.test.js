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
  canonicalModelId,
  thinkingLevelFor,
  normalizeMaxOutputTokens,
  MAX_OUTPUT_TOKENS_CEILING,
  LEGACY_MODEL_IDS,
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

  test('the deliberate tier is Gemini 4 Argon, and the id it replaced is not offered', () => {
    assert.equal(MODELS.SMART, 'gemini-4-argon');
    assert.ok(!AGENT_MODEL_CHOICES.some(c => c.id === 'gemini-3.1-pro-preview'));
  });
});

describe('replaced model ids', () => {
  test('an id the registry used to offer means its replacement', () => {
    assert.equal(canonicalModelId('gemini-3.1-pro-preview'), MODELS.SMART);
    assert.equal(canonicalModelId(MODELS.FAST), MODELS.FAST, 'a current id is untouched');
    assert.equal(canonicalModelId('gemini-9-imaginary'), 'gemini-9-imaginary', 'an unknown id is not guessed at');
    assert.equal(canonicalModelId(null), null);
    assert.equal(canonicalModelId('toString'), 'toString', 'a name from Object.prototype is not a legacy id');
  });

  test('every legacy id maps onto a model that is offered', () => {
    for (const [old, now] of Object.entries(LEGACY_MODEL_IDS)) {
      assert.ok(isKnownAgentModel(now), `${old} maps to ${now}, which is not offered`);
      assert.ok(isKnownAgentModel(old), `${old} should still be recognised, as ${now}`);
    }
  });
});

describe('thinkingLevelFor', () => {
  test('Argon is never sent "minimal" (the API answers 400); it gets the next level up', () => {
    assert.equal(thinkingLevelFor(MODELS.SMART, 'minimal'), 'low');
    for (const level of ['low', 'medium', 'high']) assert.equal(thinkingLevelFor(MODELS.SMART, level), level);
  });

  test('a model with no known restriction gets the level it was given', () => {
    for (const level of THINKING_LEVELS) {
      assert.equal(thinkingLevelFor(MODELS.FAST, level), level);
      assert.equal(thinkingLevelFor('gemini-from-the-future', level), level);
    }
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

describe('normalizeMaxOutputTokens', () => {
  test('keeps a number in range, clamps one outside it, and treats anything else as "use the default"', () => {
    assert.equal(normalizeMaxOutputTokens(20000), 20000);
    assert.equal(normalizeMaxOutputTokens('24000'), 24000);
    assert.equal(normalizeMaxOutputTokens(1_000_000), MAX_OUTPUT_TOKENS_CEILING);
    assert.equal(normalizeMaxOutputTokens(10), 4096);
    for (const bad of [null, undefined, '', 'lots', NaN, {}, []]) assert.equal(normalizeMaxOutputTokens(bad), null);
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

  test('an agent can carry its own output cap; the default is none', () => {
    assert.equal(orchestrator.addAgent('Ada', 'bio').maxOutputTokens, null);
    assert.equal(orchestrator.addAgent('Grace', 'bio', { maxOutputTokens: 32768 }).maxOutputTokens, 32768);
    assert.equal(orchestrator.updateAgent('Ada', { maxOutputTokens: 20000 }).maxOutputTokens, 20000);
    assert.equal(orchestrator.updateAgent('Ada', { maxOutputTokens: null }).maxOutputTokens, null, 'null puts it back to the default');
    assert.equal(orchestrator.updateAgent('Ada', { bio: 'new bio' }).maxOutputTokens, null, 'an update that does not mention it leaves it alone');
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

  test('an agent saved with the replaced Pro id runs on Argon, not on the default', () => {
    // Restoring a session, or an API caller that still sends the old id, used to fall through "unknown" to the cheap default.
    const added = orchestrator.addAgent('Ada', 'bio', { model: 'gemini-3.1-pro-preview' });
    assert.equal(added.model, MODELS.SMART);
    orchestrator.addAgent('Grace', 'bio');
    assert.equal(orchestrator.updateAgent('Grace', { model: 'gemini-3.1-pro-preview' }).model, MODELS.SMART);
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
