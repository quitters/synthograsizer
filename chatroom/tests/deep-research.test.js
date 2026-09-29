/**
 * Phase 7: Deep Research.
 *
 * The thing that matters here is the budget. An autonomous room with an
 * uncapped $1–3 tool can spend real money while nobody is watching, so most
 * of these tests are about the cap holding rather than the happy path.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const {
  initializeDeepResearch, submitResearch, pollToCompletion, extractReport,
} = await import('../server/services/deepResearch.js');
const {
  RESEARCH_AGENT, RESEARCH_AGENT_MAX, MAX_TASKS_PER_SESSION,
} = await import('../server/config/research.js');
const { TOOL_TIERS } = await import('../server/config/tools.js');
const { FUNCTION_DECLARATIONS } = await import('../server/services/toolDefinitions.js');
const { createToolDispatcher } = await import('../server/services/toolDispatch.js');
const { orchestrator } = await import('../server/services/orchestrator.js');

function researchClient({ statuses = ['completed'], text = 'The report.', images = [], throwOnCreate = null } = {}) {
  const calls = { created: [], gets: 0, cancelled: [] };
  let i = 0;
  return {
    calls,
    interactions: {
      create: async (req) => {
        calls.created.push(req);
        if (throwOnCreate) throw new Error(throwOnCreate);
        return { id: 'int_research_1' };
      },
      get: async () => {
        const status = statuses[Math.min(i++, statuses.length - 1)];
        return {
          id: 'int_research_1',
          status,
          output_text: status === 'completed' ? text : '',
          steps: status === 'completed'
            ? [{ type: 'model_output', content: [
                { type: 'text', text },
                ...images.map(d => ({ type: 'image', data: d, mime_type: 'image/png' })),
              ] }]
            : [],
        };
      },
      cancel: async (id) => { calls.cancelled.push(id); return {}; },
    },
  };
}

describe('submitting a task', () => {
  test('runs in the background — a multi-minute task cannot be synchronous', async () => {
    const client = researchClient();
    initializeDeepResearch(null, client);
    const { id } = await submitResearch('history of TPUs');

    assert.equal(id, 'int_research_1');
    const req = client.calls.created[0];
    assert.equal(req.background, true);
    assert.equal(req.agent, RESEARCH_AGENT);
    assert.equal(req.agent_config.collaborative_planning, false,
      'the room cannot answer a clarifying question mid-task');
  });

  test('thorough mode selects the Max agent', async () => {
    const client = researchClient();
    initializeDeepResearch(null, client);
    await submitResearch('topic', { max: true });
    assert.equal(client.calls.created[0].agent, RESEARCH_AGENT_MAX);
  });

  test('refuses an empty topic before spending anything', async () => {
    initializeDeepResearch(null, researchClient());
    await assert.rejects(() => submitResearch('   '), /empty/);
  });
});

describe('polling to completion', () => {
  test('returns the report once the task finishes', async () => {
    initializeDeepResearch(null, researchClient({ text: 'TPUs began in 2013.' }));
    const result = await pollToCompletion('int_research_1');

    assert.equal(result.ok, true);
    assert.equal(result.status, 'completed');
    assert.match(result.text, /TPUs began/);
  });

  test('reports a failed task rather than hanging', async () => {
    initializeDeepResearch(null, researchClient({ statuses: ['failed'] }));
    const result = await pollToCompletion('int_research_1');

    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
  });

  test('surfaces a transport error instead of retrying forever', async () => {
    initializeDeepResearch(null, {
      interactions: { get: async () => { throw new Error('network down'); } },
    });
    const result = await pollToCompletion('int_research_1');

    assert.equal(result.ok, false);
    assert.match(result.error, /network down/);
  });
});

describe('extracting the report', () => {
  test('collects generated visualisations alongside the text', () => {
    const { text, images } = extractReport({
      output_text: 'Findings.',
      steps: [{ type: 'model_output', content: [
        { type: 'text', text: 'Findings.' },
        { type: 'image', data: 'AAAA', mime_type: 'image/png' },
      ] }],
    });
    assert.equal(text, 'Findings.');
    assert.equal(images.length, 1);
  });

  test('falls back to walking steps when output_text is empty', () => {
    const { text } = extractReport({
      output_text: '',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Recovered.' }] }],
    });
    assert.equal(text, 'Recovered.');
  });
});

describe('the per-session budget', () => {
  beforeEach(() => {
    orchestrator.reset();
    // 'completed' on the first poll, so the background poller _startResearch
    // launches resolves immediately. An 'in_progress' client would leave a
    // 15-second-interval timer alive and the test runner would never exit.
    initializeDeepResearch(null, researchClient({ statuses: ['completed'] }));
  });

  test('stops submitting once the cap is reached', async () => {
    const speaker = orchestrator.addAgent('Ada', 'bio');

    for (let i = 0; i < MAX_TASKS_PER_SESSION; i++) {
      const ok = await orchestrator._startResearch(`topic ${i}`, {}, speaker);
      assert.equal(ok.ok, true, `task ${i + 1} should be allowed`);
    }
    const denied = await orchestrator._startResearch('one too many', {}, speaker);

    assert.equal(denied.ok, false);
    assert.match(denied.error, /limit/);
    assert.equal(orchestrator.researchTasksUsed, MAX_TASKS_PER_SESSION,
      'a refused task must not consume budget');
  });

  test('a failed submit does not consume budget', async () => {
    initializeDeepResearch(null, researchClient({ throwOnCreate: 'service unavailable' }));
    const speaker = orchestrator.addAgent('Ada', 'bio');

    const result = await orchestrator._startResearch('topic', {}, speaker);
    assert.equal(result.ok, false);
    assert.equal(orchestrator.researchTasksUsed, 0, 'budget is refunded on failure');
  });

  test('the budget resets with the session', async () => {
    const speaker = orchestrator.addAgent('Ada', 'bio');
    await orchestrator._startResearch('topic', {}, speaker);
    assert.ok(orchestrator.researchTasksUsed > 0);

    orchestrator.reset();
    assert.equal(orchestrator.researchTasksUsed, 0);
  });

  test('the tool refuses cleanly when deep research is disabled', async () => {
    // No startResearch injected = the feature is off for this session.
    const dispatch = createToolDispatcher({
      agent: { id: 'a', name: 'Ada' },
      mediaStore: { get: () => null, getAll: () => [], add: () => {} },
      artifactStore: { save: () => ({}) },
    });
    const outcome = await dispatch({
      id: 'c1', name: 'deep_research', arguments: { topic: 'anything' },
    });

    assert.equal(outcome.ok, false);
    assert.match(outcome.summary, /not available/);
  });
});

describe('reports reach the next speaker', () => {
  beforeEach(() => orchestrator.reset());

  test('a completed report is drained into a system note', () => {
    orchestrator.pendingResearchOutcomes.push({
      topic: 'TPU history', agentName: 'Ada', ok: true, text: 'TPUs began in 2013.',
    });
    const note = orchestrator._drainWorkflowOutcomes();

    assert.match(note, /RESEARCH REPORT/);
    assert.match(note, /TPU history/);
    assert.match(note, /TPUs began in 2013/);
    assert.equal(orchestrator.pendingResearchOutcomes.length, 0, 'drained exactly once');
  });

  test('a long report is truncated rather than flooding the turn', () => {
    orchestrator.pendingResearchOutcomes.push({
      topic: 'everything', agentName: 'Ada', ok: true, text: 'x'.repeat(20000),
    });
    const note = orchestrator._drainWorkflowOutcomes();

    assert.ok(note.length < 8000, `note was ${note.length} chars`);
    assert.match(note, /truncated/);
  });

  test('a failed report tells the agent not to invent findings', () => {
    orchestrator.pendingResearchOutcomes.push({
      topic: 'TPU history', agentName: 'Ada', ok: false, error: 'task failed',
    });
    const note = orchestrator._drainWorkflowOutcomes();

    assert.match(note, /FAILED/);
    assert.match(note, /inventing findings/);
  });

  test('research and workflow outcomes coexist in one note', () => {
    orchestrator.pendingWorkflowOutcomes.push({
      label: 'Dreamscape', agentName: 'Grace', status: 'succeeded',
    });
    orchestrator.pendingResearchOutcomes.push({
      topic: 'TPUs', agentName: 'Ada', ok: true, text: 'Report.',
    });
    const note = orchestrator._drainWorkflowOutcomes();

    assert.match(note, /Dreamscape/);
    assert.match(note, /RESEARCH REPORT/);
  });

  test('nothing pending drains to null', () => {
    assert.equal(orchestrator._drainWorkflowOutcomes(), null);
  });
});

describe('tool availability', () => {
  test('deep_research is its own tier, not folded into full', () => {
    assert.ok(TOOL_TIERS.researcher.includes('deep_research'));
    assert.ok(!TOOL_TIERS.full.includes('deep_research'),
      'a $1-3 tool should not be handed out by default');
    assert.ok(!TOOL_TIERS.research.includes('deep_research'));
  });

  test('its description warns about cost and latency', () => {
    const d = FUNCTION_DECLARATIONS.deep_research.description;
    assert.match(d, /MINUTES/);
    assert.match(d, /expensive/);
    assert.match(d, /google_search instead/);
  });
});
