/**
 * Phase 2: function calling.
 *
 * The contract that matters here is the one the tag path could never provide —
 * a tool result reaching the model inside its own turn — plus the stateless
 * continuation that carries it, since `store` is still false.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const { initializeGemini, generateAgentResponse } =
  await import('../server/services/gemini.js');
const { buildToolsForAgent, FUNCTION_DECLARATIONS, isBuiltinTool } =
  await import('../server/services/toolDefinitions.js');
const { TOOL_TIERS, MAX_TOOL_ROUNDS, MAX_CALLS_PER_ROUND } =
  await import('../server/config/tools.js');
const { FakeGenAI, makeAgent, drain } = await import('./helpers/fakeGenAI.js');

const GOAL = 'Build a snow scene.';
const OTHERS = [makeAgent(), makeAgent({ id: 'agent-2', name: 'Grace Hopper' })];

/** A dispatcher that records calls and returns scripted outcomes. */
function makeDispatcher(outcomes = {}) {
  const calls = [];
  const dispatch = async (call) => {
    calls.push(call);
    const outcome = outcomes[call.name];
    if (typeof outcome === 'function') return outcome(call);
    return outcome || {
      ok: true,
      result: [{ type: 'text', text: `${call.name} ok` }],
      summary: `${call.name} ok`,
    };
  };
  dispatch.calls = calls;
  return dispatch;
}

const IMAGE_TOOLS = [FUNCTION_DECLARATIONS.generate_image, { type: 'google_search' }];

async function runTurn(script, { agent = makeAgent(), tools = IMAGE_TOOLS, dispatch, messages = [] } = {}) {
  const fake = new FakeGenAI(script);
  initializeGemini(null, fake);
  const result = await drain(
    generateAgentResponse(agent, OTHERS, messages, GOAL, [], { tools, dispatch })
  );
  return { fake, ...result };
}

beforeEach(() => {
  initializeGemini(null, new FakeGenAI([{ throws: 'no fake installed for this test' }]));
});

describe('tool declarations', () => {
  test('every tier resolves to real declarations', () => {
    for (const [tier, names] of Object.entries(TOOL_TIERS)) {
      const tools = buildToolsForAgent({ tools: tier });
      assert.equal(tools.length, names.length, `tier "${tier}" dropped a tool`);
      for (const tool of tools) {
        assert.ok(tool.type, 'every declaration needs a type');
        if (tool.type === 'function') {
          assert.ok(tool.name, 'function declarations need a name');
          assert.ok(tool.description, `${tool.name} needs a description`);
        } else {
          assert.ok(isBuiltinTool(tool.type), `${tool.type} is not a known built-in`);
        }
      }
    }
  });

  test('no tier exceeds the documented 10-20 active tool guidance', () => {
    for (const [tier, names] of Object.entries(TOOL_TIERS)) {
      assert.ok(names.length <= 20, `tier "${tier}" has ${names.length} tools`);
    }
  });

  test('an unknown tier falls back rather than yielding no tools', () => {
    const tools = buildToolsForAgent({ tools: 'nonsense' });
    assert.ok(tools.length > 0);
  });

  test('write_artifact can be withheld when the room is not building', () => {
    const withArtifacts = buildToolsForAgent({ tools: 'builder' }, { allowArtifacts: true });
    const without = buildToolsForAgent({ tools: 'builder' }, { allowArtifacts: false });
    assert.ok(withArtifacts.some(t => t.name === 'write_artifact'));
    assert.ok(!without.some(t => t.name === 'write_artifact'));
  });
});

describe('request shape', () => {
  test('tools are sent and tool_choice is validated', { timeout: 15000 }, async () => {
    const { fake } = await runTurn(
      [{ fixture: 'tool-call-turn' }, { fixture: 'tool-followup-turn' }],
      { dispatch: makeDispatcher() }
    );
    const req = fake.request(0);
    assert.deepEqual(req.tools, IMAGE_TOOLS);
    // 'auto' is not supported when built-ins are combined with custom
    // function declarations — only 'validated' is.
    assert.equal(req.generation_config.tool_choice, 'validated');
    assert.equal(req.store, false);
  });

  test('the tag vocabulary is suppressed in function mode', { timeout: 15000 }, async () => {
    const { fake } = await runTurn(
      [{ fixture: 'tool-call-turn' }, { fixture: 'tool-followup-turn' }],
      { dispatch: makeDispatcher() }
    );
    const prompt = fake.request(0).system_instruction;
    assert.ok(!prompt.includes('[IMAGE:'), 'tag syntax leaked into function-mode prompt');
    assert.ok(!prompt.includes('[SEARCH:'));
    assert.ok(!prompt.includes('[ARTIFACT:'));
  });

  test('no tools means the legacy tag path, untouched', { timeout: 15000 }, async () => {
    const { fake, complete } = await runTurn([{ fixture: 'simple-turn' }], { tools: [] });
    assert.equal(fake.request(0).tools, undefined);
    assert.equal(fake.request(0).generation_config.tool_choice, undefined);
    assert.ok(fake.request(0).system_instruction.includes('[IMAGE:'));
    assert.equal(complete.toolCalls, undefined, 'tag path yields no toolCalls');
  });
});

describe('the tool round trip', () => {
  test('executes the call and continues the same turn', { timeout: 15000 }, async () => {
    const dispatch = makeDispatcher();
    const { fake, complete, events } = await runTurn(
      [{ fixture: 'tool-call-turn' }, { fixture: 'tool-followup-turn' }],
      { dispatch }
    );

    assert.equal(dispatch.calls.length, 1);
    assert.equal(dispatch.calls[0].name, 'generate_image');
    assert.deepEqual(dispatch.calls[0].arguments, { prompt: 'a fox in deep snow' });

    assert.equal(fake.callCount, 2, 'one call to make the tool call, one to react to it');
    assert.equal(
      complete.fullResponse,
      'Let me sketch that. It came out colder than I meant — the snow reads blue. Good enough to build on.',
      'text from both rounds belongs to one message'
    );

    const kinds = events.map(e => e.type);
    assert.ok(kinds.indexOf('tool_call') < kinds.indexOf('tool_result'));
    assert.ok(kinds.indexOf('tool_result') < kinds.lastIndexOf('chunk'),
      'the agent reacts AFTER the result — that is the point of phase 2');
  });

  test('the continuation echoes prior steps and the function result', { timeout: 15000 }, async () => {
    const dispatch = makeDispatcher({
      generate_image: () => ({
        ok: true,
        result: [
          { type: 'text', text: 'Image generated. id=img-1' },
          { type: 'image', data: 'AAAA', mime_type: 'image/png' },
        ],
        summary: 'Generated image img-1',
        media: { id: 'img-1', type: 'image', mimeType: 'image/png', prompt: 'a fox in deep snow' },
      }),
    });
    const { fake } = await runTurn(
      [{ fixture: 'tool-call-turn' }, { fixture: 'tool-followup-turn' }],
      { dispatch }
    );

    const input = fake.request(1).input;
    assert.equal(input[0].type, 'user_input', 'the original prompt is replayed as a user_input step');
    assert.ok(Array.isArray(input[0].content));

    const result = input.find(s => s.type === 'function_result');
    assert.ok(result, 'the function result must be in the continuation input');
    assert.equal(result.call_id, 'call_abc123', 'call_id must match the function_call id');
    assert.equal(result.name, 'generate_image');
    assert.equal(result.is_error, false);
    assert.ok(result.result.some(b => b.type === 'image'),
      'the generated image is handed back so the agent can judge it');

    assert.ok(input.some(s => s.type === 'function_call'),
      'the model\'s own call is echoed back — stateless mode has no server memory');
  });

  test('a failed tool is reported to the model, not thrown', { timeout: 15000 }, async () => {
    const dispatch = makeDispatcher({
      generate_image: () => ({
        ok: false,
        result: [{ type: 'text', text: 'generate_image failed: backend returned no image.' }],
        summary: 'generate_image failed',
      }),
    });
    const { fake, complete, error, events } = await runTurn(
      [{ fixture: 'tool-call-turn' }, { fixture: 'tool-followup-turn' }],
      { dispatch }
    );

    assert.equal(error, null, 'a tool failure must not fail the turn');
    const result = fake.request(1).input.find(s => s.type === 'function_result');
    assert.equal(result.is_error, true);
    assert.equal(events.find(e => e.type === 'tool_result').ok, false);
    assert.deepEqual(complete.toolCalls, [
      { name: 'generate_image', ok: false, summary: 'generate_image failed' },
    ]);
  });

  test('assembles streamed arguments when completed carries no steps', { timeout: 15000 }, async () => {
    // interaction.completed.steps is optional on streaming payloads; the
    // fallback rebuilds the call from step.start plus arguments_delta.
    const dispatch = makeDispatcher();
    await runTurn(
      [{ fixture: 'tool-call-no-steps' }, { fixture: 'tool-followup-turn' }],
      { dispatch, tools: [FUNCTION_DECLARATIONS.write_artifact] }
    );

    assert.equal(dispatch.calls.length, 1);
    assert.equal(dispatch.calls[0].name, 'write_artifact');
    assert.deepEqual(dispatch.calls[0].arguments, {
      filename: 'sketch.js',
      content: 'function setup(){}',
    });
  });

  test('usage sums across tool rounds, tool tokens included', { timeout: 15000 }, async () => {
    const { complete } = await runTurn(
      [{ fixture: 'tool-call-turn' }, { fixture: 'tool-followup-turn' }],
      { dispatch: makeDispatcher() }
    );

    assert.equal(complete.usage.inputTokens, 4200 + 6100);
    assert.equal(complete.usage.toolUseTokens, 180);
    assert.equal(complete.usage.totalTokens, 4470 + 6137);
    assert.equal(complete.usageReported, true);
  });

  test('a turn with no tool call completes in one round', { timeout: 15000 }, async () => {
    const dispatch = makeDispatcher();
    const { fake, complete } = await runTurn([{ fixture: 'tool-followup-turn' }], { dispatch });

    assert.equal(fake.callCount, 1);
    assert.equal(dispatch.calls.length, 0);
    assert.deepEqual(complete.toolCalls, []);
  });
});

describe('runaway protection', () => {
  test('stops at the tool round limit', { timeout: 20000 }, async () => {
    // tool-call-turn repeats, so the model "keeps" asking for another image.
    const dispatch = makeDispatcher();
    const { fake, complete, error } = await runTurn([{ fixture: 'tool-call-turn' }], {
      dispatch,
    });

    assert.equal(error, null);
    assert.equal(fake.callCount, MAX_TOOL_ROUNDS + 1, 'one request per round, then stop');
    assert.equal(dispatch.calls.length, MAX_TOOL_ROUNDS);
    assert.ok(complete, 'the turn still completes rather than hanging');
  });

  test('refuses calls beyond the per-round cap, explicitly', { timeout: 15000 }, async () => {
    const manyCalls = Array.from({ length: MAX_CALLS_PER_ROUND + 2 }, (_, i) => ({
      type: 'function_call',
      id: `call_${i}`,
      name: 'generate_image',
      arguments: { prompt: `image ${i}` },
    }));
    const dispatch = makeDispatcher();
    const { fake } = await runTurn(
      [
        {
          events: [
            { event_type: 'step.start', step: { type: 'model_output' } },
            { event_type: 'step.delta', delta: { type: 'text', text: 'Making a set.' } },
            { event_type: 'step.stop' },
            {
              event_type: 'interaction.completed',
              interaction: { id: 'int_many', status: 'requires_action', steps: manyCalls },
            },
          ],
        },
        { fixture: 'tool-followup-turn' },
      ],
      { dispatch }
    );

    assert.equal(dispatch.calls.length, MAX_CALLS_PER_ROUND, 'over-cap calls are not executed');
    const results = fake.request(1).input.filter(s => s.type === 'function_result');
    assert.equal(results.length, MAX_CALLS_PER_ROUND + 2,
      'every call still gets a result — a model left waiting on one would stall');
    const refused = results.filter(r => r.is_error);
    assert.equal(refused.length, 2);
    assert.match(refused[0].result[0].text, /at most/);
  });
});
