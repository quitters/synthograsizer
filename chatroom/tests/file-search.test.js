/**
 * Phase 4: File Search.
 *
 * The behaviour worth pinning: which uploads get indexed, that an indexed
 * file stops riding inline (the whole point — no more 5,000-character
 * truncation and no more base64 on every early turn), and that a built-in
 * tool reaches the model without dragging the turn onto the function path.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const { initializeGemini, generateAgentResponse } =
  await import('../server/services/gemini.js');
const {
  initializeFileSearch, createSessionStore, indexMedia, destroySessionStore,
  listOrphanedStores, fileSearchTool, STORE_PREFIX,
} = await import('../server/services/fileSearch.js');
const { shouldIndex } = await import('../server/config/fileSearch.js');
const { FakeGenAI, makeAgent, drain } = await import('./helpers/fakeGenAI.js');

const GOAL = 'Review the attached brief.';
const OTHERS = [makeAgent(), makeAgent({ id: 'agent-2', name: 'Grace Hopper' })];

/** Minimal fake of the fileSearchStores + operations surface. */
function makeStoreClient({ failUpload = false, neverDone = false } = {}) {
  const calls = { created: [], uploaded: [], deleted: [], polls: 0 };
  return {
    calls,
    fileSearchStores: {
      create: async ({ config }) => {
        calls.created.push(config.displayName);
        return { name: `fileSearchStores/${config.displayName}-abc123` };
      },
      uploadToFileSearchStore: async ({ file, fileSearchStoreName, config }) => {
        calls.uploaded.push({
          store: fileSearchStoreName,
          displayName: config.displayName,
          mimeType: config.mimeType,
          size: file.size,
        });
        if (failUpload) throw new Error('quota exceeded');
        return { done: !neverDone, name: 'operations/op1' };
      },
      delete: async ({ name }) => { calls.deleted.push(name); return {}; },
      list: async () => ({
        async *[Symbol.asyncIterator]() {
          yield { name: 'fileSearchStores/x1', displayName: `${STORE_PREFIX}dead` };
          yield { name: 'fileSearchStores/x2', displayName: 'someone-elses-store' };
        },
      }),
    },
    operations: {
      get: async ({ operation }) => { calls.polls++; return { ...operation, done: true }; },
    },
  };
}

const textMedia = (over = {}) => ({
  id: 'media-1',
  name: 'brief.md',
  mimeType: 'text/markdown',
  data: Buffer.from('# Brief\nShip the dashboard.').toString('base64'),
  ...over,
});

describe('what gets indexed', () => {
  test('documents and text formats do', () => {
    for (const m of ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json']) {
      assert.ok(shouldIndex(m), `${m} should be indexed`);
    }
  });

  test('images and media do not — an agent needs to SEE a reference image', () => {
    for (const m of ['image/png', 'image/jpeg', 'video/mp4', 'audio/mpeg']) {
      assert.ok(!shouldIndex(m), `${m} must stay inline`);
    }
  });

  test('missing or unknown types do not', () => {
    assert.ok(!shouldIndex(undefined));
    assert.ok(!shouldIndex('application/octet-stream'));
  });
});

describe('store lifecycle', () => {
  test('creates a prefixed store so it can be found again', async () => {
    const client = makeStoreClient();
    initializeFileSearch(null, client);
    const name = await createSessionStore('sess-42');

    assert.equal(client.calls.created[0], `${STORE_PREFIX}sess-42`);
    assert.ok(name.startsWith('fileSearchStores/'));
  });

  test('uploads in-memory base64 as a Blob, no filesystem round trip', async () => {
    const client = makeStoreClient();
    initializeFileSearch(null, client);
    const result = await indexMedia('fileSearchStores/s1', textMedia());

    assert.equal(result.ok, true);
    const up = client.calls.uploaded[0];
    assert.equal(up.store, 'fileSearchStores/s1');
    assert.equal(up.displayName, 'brief.md');
    assert.equal(up.mimeType, 'text/markdown');
    assert.ok(up.size > 0, 'the Blob should carry the decoded bytes');
  });

  test('polls the operation until indexing is done', async () => {
    const client = makeStoreClient({ neverDone: true });
    initializeFileSearch(null, client);
    const result = await indexMedia('fileSearchStores/s1', textMedia());

    assert.equal(result.ok, true);
    assert.ok(client.calls.polls >= 1, 'an unfinished operation must be polled');
  });

  test('an upload failure is reported, not thrown', async () => {
    const client = makeStoreClient({ failUpload: true });
    initializeFileSearch(null, client);
    const result = await indexMedia('fileSearchStores/s1', textMedia());

    assert.equal(result.ok, false);
    assert.match(result.error, /quota/);
  });

  test('delete is forced so a non-empty store still goes', async () => {
    const client = makeStoreClient();
    initializeFileSearch(null, client);
    await destroySessionStore('fileSearchStores/s1');
    assert.deepEqual(client.calls.deleted, ['fileSearchStores/s1']);
  });

  test('deleting a store that is already gone is not fatal', async () => {
    initializeFileSearch(null, {
      fileSearchStores: { delete: async () => { throw new Error('404'); } },
    });
    const result = await destroySessionStore('fileSearchStores/gone');
    assert.equal(result.ok, false, 'reported, but it did not throw');
  });

  test('orphan listing finds our stores and ignores everyone else\'s', async () => {
    const client = makeStoreClient();
    initializeFileSearch(null, client);
    const orphans = await listOrphanedStores();

    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].displayName, `${STORE_PREFIX}dead`);
  });
});

describe('the tool on a turn', () => {
  test('declares the store and a retrieval depth', () => {
    const tool = fileSearchTool('fileSearchStores/s1', 7);
    assert.deepEqual(tool, {
      type: 'file_search',
      file_search_store_names: ['fileSearchStores/s1'],
      top_k: 7,
    });
  });

  test('an indexed file is named but NOT inlined', { timeout: 15000 }, async () => {
    const fake = new FakeGenAI([{ fixture: 'simple-turn' }]);
    initializeGemini(null, fake);
    const media = [
      textMedia({ indexed: true }),
      textMedia({
        id: 'media-2',
        name: 'notes.txt',
        mimeType: 'text/plain',
        indexed: false,
        // Distinct content, so the assertions below can tell which file's
        // bytes reached the prompt.
        data: Buffer.from('loose notes, not indexed').toString('base64'),
      }),
    ];
    await drain(generateAgentResponse(makeAgent(), OTHERS, [], GOAL, media, {
      tools: [fileSearchTool('fileSearchStores/s1')],
    }));

    const text = fake.request(0).input[0].text;
    assert.ok(text.includes('SEARCHABLE REFERENCE DOCUMENTS'));
    assert.ok(text.includes('brief.md'), 'the model must know the indexed file exists');
    assert.ok(!text.includes('Ship the dashboard'),
      'indexed content must NOT be pasted into the prompt as well');
    // The un-indexed one still rides inline in full, which is the correct
    // fallback while its indexing is still in flight.
    assert.ok(text.includes('notes.txt'));
    assert.ok(text.includes('loose notes, not indexed'));
  });

  test('a built-in tool does not drag the turn onto the function path', { timeout: 15000 }, async () => {
    const fake = new FakeGenAI([{ fixture: 'simple-turn' }]);
    initializeGemini(null, fake);
    await drain(generateAgentResponse(makeAgent(), OTHERS, [], GOAL, [], {
      tools: [fileSearchTool('fileSearchStores/s1')],
      // no dispatch: file_search runs server-side and needs none
    }));

    const req = fake.request(0);
    assert.deepEqual(req.tools, [fileSearchTool('fileSearchStores/s1')],
      'the built-in must still be sent on the tag path');
    assert.equal(req.generation_config.tool_choice, undefined,
      "'validated' is only required when built-ins are combined with custom functions");
    assert.ok(req.system_instruction.includes('[IMAGE:'),
      'the tag vocabulary must survive — only custom functions suppress it');
  });
});

beforeEach(() => {
  initializeGemini(null, new FakeGenAI([{ throws: 'no fake installed' }]));
});
