/**
 * Stream-parser regression suite for server/services/gemini.js.
 *
 * These tests exist because Phase 2 of MODERNIZATION_PLAN.md rewrites the tool
 * layer, and the stream parser is the one place where a regression is silent —
 * the room keeps running, it just gets subtly worse. They pin the contract the
 * orchestrator actually consumes: the sequence of yielded events.
 *
 * No API key and no network: a FakeGenAI replays recorded event sequences from
 * tests/fixtures/.
 *
 * Run: npm test   (from chatroom/)
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Point the Synthograsizer client at a closed loopback port before anything
// imports it, so buildSystemPrompt's health check fails fast and identically
// whether or not the Python backend happens to be running locally.
process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const { initializeGemini, generateAgentResponse } =
  await import('../server/services/gemini.js');
const { countTokens } = await import('../server/utils/tokenCounter.js');
const { DEFAULT_AGENT_MODEL, MAX_OUTPUT_TOKENS, MODELS } =
  await import('../server/config/models.js');
const { FakeGenAI, makeAgent, drain } = await import('./helpers/fakeGenAI.js');

const GOAL = 'Design a legible dashboard for a noisy dataset.';
const OTHERS = [makeAgent(), makeAgent({ id: 'agent-2', name: 'Grace Hopper' })];

/** Run one agent turn against a scripted fake client. */
async function runTurn(script, { agent = makeAgent(), messages = [], sessionMedia = [], options = {} } = {}) {
  const fake = new FakeGenAI(script);
  initializeGemini(null, fake);
  const result = await drain(
    generateAgentResponse(agent, OTHERS, messages, GOAL, sessionMedia, options)
  );
  return { fake, ...result };
}

beforeEach(() => {
  // Each test installs its own fake; make sure a leaked real client from a
  // previous run can't satisfy a call.
  initializeGemini(null, new FakeGenAI([{ throws: 'no fake installed for this test' }]));
});

describe('happy path', () => {
  test('streams text deltas as chunks, then completes', { timeout: 15000 }, async () => {
    const { chunks, complete, error } = await runTurn([{ fixture: 'simple-turn' }]);

    assert.equal(error, null);
    assert.deepEqual(chunks, ['The grid ', 'should breathe. ', "Let's start there."]);
    assert.equal(complete.fullResponse, "The grid should breathe. Let's start there.");
    assert.equal(complete.wasTruncated, false);
  });

  test('reports the model and thinking level it actually used', { timeout: 15000 }, async () => {
    const { complete } = await runTurn([{ fixture: 'simple-turn' }]);
    assert.equal(complete.model, DEFAULT_AGENT_MODEL);
    assert.equal(complete.thinkingLevel, 'low');
  });

  test('sends a stateless streaming request with the configured caps', { timeout: 15000 }, async () => {
    const { fake } = await runTurn([{ fixture: 'simple-turn' }]);
    const req = fake.request(0);

    assert.equal(req.stream, true);
    assert.equal(req.store, false, 'store must stay false until the Phase 3 decision is made');
    assert.equal(req.generation_config.max_output_tokens, MAX_OUTPUT_TOKENS);
    assert.equal(req.generation_config.thinking_level, 'low');
    assert.equal(typeof req.system_instruction, 'string');
    assert.ok(req.system_instruction.includes('Ada Lovelace'));
    assert.ok(Array.isArray(req.input));
    assert.equal(req.input[0].type, 'text');
  });
});

describe('thought leakage', () => {
  test('text deltas inside a thought step never reach the transcript', { timeout: 15000 }, async () => {
    const { chunks, complete } = await runTurn([{ fixture: 'thinking-turn' }]);

    const all = chunks.join('');
    assert.ok(!all.includes('SECRET REASONING'), 'reasoning leaked into the chat stream');
    assert.ok(!complete.fullResponse.includes('SECRET REASONING'));
    assert.equal(complete.fullResponse, "I'd push back on the palette. It fights the type.");
  });

  test('thought classification does not outlive the thought step', { timeout: 15000 }, async () => {
    // A text delta arriving after step.stop but before the next step.start
    // used to be swallowed, because currentStepType still said 'thought'.
    const { complete } = await runTurn([{ fixture: 'thought-then-unstepped-text' }]);

    assert.ok(!complete.fullResponse.includes('INTERNAL:'));
    assert.equal(complete.fullResponse, "Both framings work; I'd take the second.");
  });
});

describe('usage accounting', () => {
  test('maps the API snake_case usage fields', { timeout: 15000 }, async () => {
    const { complete } = await runTurn([{ fixture: 'thinking-turn' }]);

    assert.equal(complete.usageReported, true);
    assert.deepEqual(complete.usage, {
      inputTokens: 5200,
      outputTokens: 12,
      thoughtTokens: 340,
      cachedTokens: 4096,
      toolUseTokens: 0,
      totalTokens: 5552,
    });
  });

  test('budget cost is output + thought, not the character estimate', { timeout: 15000 }, async () => {
    const { complete } = await runTurn([{ fixture: 'thinking-turn' }]);
    assert.equal(complete.tokenCount, 12 + 340);
  });

  test('falls back to the character estimate when usage is absent', { timeout: 15000 }, async () => {
    const { complete } = await runTurn([{ fixture: 'no-usage-turn' }]);

    assert.equal(complete.usageReported, false);
    assert.equal(complete.tokenCount, countTokens(complete.fullResponse));
    assert.ok(complete.tokenCount > 0);
  });
});

describe('truncation and continuation', () => {
  test("status 'incomplete' triggers a continuation call", { timeout: 15000 }, async () => {
    const { fake, complete } = await runTurn([
      { fixture: 'truncated-turn' },
      { fixture: 'continuation-turn' },
    ]);

    assert.equal(fake.callCount, 2);
    assert.equal(complete.wasTruncated, true);
    assert.equal(
      complete.fullResponse,
      'Here is the full argument, part one, and it runs long enough that the' +
      ' budget ran out mid-sentence. Part two finishes the thought.'
    );
  });

  test('the continuation request carries the partial text and drops media', { timeout: 15000 }, async () => {
    const { fake } = await runTurn([
      { fixture: 'truncated-turn' },
      { fixture: 'continuation-turn' },
    ]);

    const continuation = fake.request(1);
    assert.equal(continuation.input.length, 1, 'continuations should be text-only');
    assert.equal(continuation.input[0].type, 'text');
    assert.ok(continuation.input[0].text.includes('Your response so far'));
    assert.ok(continuation.input[0].text.includes('cut off'));
  });

  test('usage sums across the continuation', { timeout: 15000 }, async () => {
    const { complete } = await runTurn([
      { fixture: 'truncated-turn' },
      { fixture: 'continuation-turn' },
    ]);

    assert.equal(complete.usage.inputTokens, 4000 + 4500);
    assert.equal(complete.usage.outputTokens, 900 + 200);
    assert.equal(complete.usage.thoughtTokens, 100 + 20);
    assert.equal(complete.usage.totalTokens, 5000 + 4720);
    assert.equal(complete.tokenCount, 1100 + 120);
  });

  test('gives up after the continuation limit instead of looping', { timeout: 15000 }, async () => {
    // Always incomplete: one initial call plus MAX_CONTINUATION_ATTEMPTS (2).
    const { fake, complete } = await runTurn([{ fixture: 'truncated-turn' }]);

    assert.equal(fake.callCount, 3);
    assert.equal(complete.wasTruncated, true);
    assert.ok(complete.fullResponse.length > 0, 'partial text is kept, not discarded');
  });
});

describe('response cleanup', () => {
  test('strips a self-applied name prefix from the final response', { timeout: 15000 }, async () => {
    const { chunks, complete } = await runTurn([{ fixture: 'name-prefixed-turn' }]);

    // The prefix does stream to the client before being corrected at
    // completion — the orchestrator replaces its accumulated text with
    // complete.fullResponse, so this is the behaviour that matters.
    assert.ok(chunks.join('').startsWith('[Ada Lovelace]:'));
    assert.equal(complete.fullResponse, 'Numbers first, rhetoric after.');
  });
});

describe('error handling', () => {
  test('an error before any text yields an error event', { timeout: 15000 }, async () => {
    const { error, complete } = await runTurn([{ fixture: 'immediate-error' }]);

    assert.equal(complete, null);
    assert.match(error.error, /model overloaded/);
  });

  test('an error after partial text keeps what arrived', { timeout: 15000 }, async () => {
    const { error, complete } = await runTurn([{ fixture: 'mid-stream-error' }]);

    assert.equal(error, null, 'partial content should complete, not fail the turn');
    assert.equal(complete.fullResponse, 'I got partway through the point before');
    assert.equal(complete.usageReported, false);
  });

  test('a create() rejection surfaces as an error event', { timeout: 15000 }, async () => {
    const { error } = await runTurn([{ throws: 'API key invalid' }]);
    assert.match(error.error, /API key invalid/);
  });
});

describe('request fallbacks', () => {
  test('retries without thinking_level when the model rejects it', { timeout: 15000 }, async () => {
    const { fake, complete } = await runTurn([
      { throws: 'thinking_level is not supported for this model' },
      { fixture: 'simple-turn' },
    ]);

    assert.equal(fake.callCount, 2);
    assert.equal(
      fake.request(1).generation_config.thinking_level, undefined,
      'the retry must drop the rejected knob'
    );
    assert.equal(fake.request(1).generation_config.max_output_tokens, MAX_OUTPUT_TOKENS);
    assert.ok(complete.fullResponse.length > 0);
  });

  test('retries without document blocks when PDFs are rejected', { timeout: 15000 }, async () => {
    const sessionMedia = [{
      id: 'media-1',
      name: 'brief.pdf',
      mimeType: 'application/pdf',
      data: 'JVBERi0xLjQK',
    }];

    const { fake, complete } = await runTurn(
      [
        { throws: 'document blocks are not supported for this mime type' },
        { fixture: 'simple-turn' },
      ],
      { sessionMedia }
    );

    assert.equal(fake.callCount, 2);
    assert.ok(
      fake.request(0).input.some(b => b.type === 'document'),
      'the first attempt should have carried the PDF'
    );
    assert.ok(
      !fake.request(1).input.some(b => b.type === 'document'),
      'the retry should have dropped it'
    );
    assert.ok(complete.fullResponse.length > 0);
  });
});

describe('model resolution', () => {
  test('a per-agent model wins over the session preference', { timeout: 15000 }, async () => {
    const { fake } = await runTurn([{ fixture: 'simple-turn' }], {
      agent: makeAgent({ model: MODELS.SMART }),
      options: { model: MODELS.LITE },
    });
    assert.equal(fake.request(0).model, MODELS.SMART);
  });

  test('the session preference applies when the agent has no override', { timeout: 15000 }, async () => {
    const { fake } = await runTurn([{ fixture: 'simple-turn' }], {
      agent: makeAgent({ model: null }),
      options: { model: MODELS.LITE },
    });
    assert.equal(fake.request(0).model, MODELS.LITE);
  });

  test('falls back to the registry default when neither is set', { timeout: 15000 }, async () => {
    const { fake } = await runTurn([{ fixture: 'simple-turn' }], {
      agent: makeAgent({ model: null }),
    });
    assert.equal(fake.request(0).model, DEFAULT_AGENT_MODEL);
  });

  test('an explicit thinking level overrides the agent default', { timeout: 15000 }, async () => {
    const { fake, complete } = await runTurn([{ fixture: 'simple-turn' }], {
      agent: makeAgent({ thinkingLevel: 'low' }),
      options: { thinkingLevel: 'high' },
    });
    assert.equal(fake.request(0).generation_config.thinking_level, 'high');
    assert.equal(complete.thinkingLevel, 'high');
  });

  test('a nonsense thinking level degrades to the default', { timeout: 15000 }, async () => {
    const { fake } = await runTurn([{ fixture: 'simple-turn' }], {
      agent: makeAgent({ thinkingLevel: 'ludicrous' }),
    });
    assert.equal(fake.request(0).generation_config.thinking_level, 'low');
  });
});
