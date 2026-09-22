/**
 * Grounding compliance and cost visibility (plan §5.1, §5.2).
 *
 * Two things the room was getting wrong about Google Search grounding:
 *
 *   1. The `google_search_result` step carries a `search_suggestions` HTML
 *      snippet that the Grounding with Google Search terms require to be
 *      displayed. It was parsed past and dropped.
 *   2. Grounding on Gemini 3.x bills per query the model executes, not per
 *      prompt. One tool call can be several billable units, so a token meter
 *      alone cannot show what a search-happy agent loop is spending.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const { initializeTools, webSearch, research, formatToolResults } =
  await import('../server/services/tools.js');
const { orchestrator } = await import('../server/services/orchestrator.js');

const SUGGESTIONS_HTML =
  '<style>.container{}</style><div class="container"><a href="https://www.google.com/search?q=x">x</a></div>';

/**
 * Stand-in for the Interactions client. tools.js awaits a whole interaction
 * rather than a stream, so this returns the finished object.
 */
function fakeClient({ queries = [], suggestions = SUGGESTIONS_HTML, text = 'answer' } = {}) {
  const steps = [
    {
      type: 'model_output',
      content: [{
        type: 'text',
        annotations: [{ type: 'url_citation', url: 'https://example.com', title: 'Example', end_index: 6 }],
      }],
    },
  ];
  if (queries.length) steps.push({ type: 'google_search_call', arguments: { queries } });
  if (suggestions) steps.push({ type: 'google_search_result', search_suggestions: suggestions });

  return {
    requests: [],
    interactions: {
      create: async function (request) {
        this.requests?.push?.(request);
        return { steps, output_text: text, usage: {} };
      },
    },
  };
}

describe('Search Suggestions are carried, not dropped', () => {
  test('webSearch returns the snippet the terms require displaying', async () => {
    initializeTools('unused', fakeClient({ queries: ['cats'] }));
    const result = await webSearch('cats');
    assert.equal(result.searchSuggestions, SUGGESTIONS_HTML);
  });

  test('research returns it too — it grounds with the same tool', async () => {
    initializeTools('unused', fakeClient({ queries: ['cats'] }));
    const result = await research('cats');
    assert.equal(result.searchSuggestions, SUGGESTIONS_HTML);
  });

  test('it survives the trip to the client payload', () => {
    const formatted = formatToolResults([
      { type: 'search', query: 'cats', text: 'a', sources: [], searchQueries: ['cats'], searchSuggestions: SUGGESTIONS_HTML },
      { type: 'research', query: 'dogs', text: 'b', sources: [], searchQueries: ['dogs'], searchSuggestions: SUGGESTIONS_HTML },
    ]);
    for (const entry of formatted) {
      assert.equal(entry.searchSuggestions, SUGGESTIONS_HTML, `${entry.type} dropped the suggestions`);
    }
  });

  test('absent suggestions stay absent rather than becoming "undefined"', async () => {
    initializeTools('unused', fakeClient({ queries: ['cats'], suggestions: '' }));
    const result = await webSearch('cats');
    assert.equal(result.searchSuggestions, '');
  });
});

describe('the search meter counts billable queries', () => {
  /** The orchestrator is a singleton; each test starts from a clean meter. */
  function freshUsage() {
    orchestrator.usage = null;
    return orchestrator;
  }

  test('counts queries executed, not tool calls made', () => {
    const room = freshUsage();
    // One tool call, three billable queries — the distinction that matters.
    room.countSearchQueries({ type: 'search', searchQueries: ['a', 'b', 'c'] });
    assert.equal(room.usage.searchQueries, 3);
  });

  test('accumulates across calls', () => {
    const room = freshUsage();
    room.countSearchQueries({ searchQueries: ['a'] });
    room.countSearchQueries({ searchQueries: ['b', 'c'] });
    assert.equal(room.usage.searchQueries, 3);
  });

  test('a result that did no searching leaves the meter alone', () => {
    const room = freshUsage();
    room.countSearchQueries({ type: 'url', searchQueries: [] });
    room.countSearchQueries({ type: 'url' });
    room.countSearchQueries(null);
    assert.equal(room.usage, null, 'no search should not even allocate a meter');
  });

  test('research results count too', () => {
    const room = freshUsage();
    room.countSearchQueries({ type: 'research', searchQueries: ['a', 'b'] });
    assert.equal(room.usage.searchQueries, 2);
  });
});
