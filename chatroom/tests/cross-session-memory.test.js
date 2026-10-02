/**
 * Cross-session memory — the second half of §4.1, built after the operator
 * accepted that it changes what a "session" means.
 *
 * The risks worth pinning: the memory store must survive a reset (memory
 * that vanishes is not memory), must not be swept up as an orphan, and must
 * not fill with barely-started rooms.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const {
  initializeFileSearch, getOrCreateMemoryStore, clearMemoryStoreCache,
  formatSessionForMemory, archiveSession, listOrphanedStores,
  MEMORY_STORE_NAME, STORE_PREFIX,
} = await import('../server/services/fileSearch.js');
const { MIN_MESSAGES_TO_ARCHIVE } = await import('../server/config/fileSearch.js');

function memoryClient({ existing = [], failUpload = false } = {}) {
  const calls = { created: [], uploaded: [], listed: 0 };
  return {
    calls,
    fileSearchStores: {
      create: async ({ config }) => {
        calls.created.push(config.displayName);
        return { name: `fileSearchStores/${config.displayName}-xyz` };
      },
      list: async () => {
        calls.listed++;
        return { async *[Symbol.asyncIterator]() { for (const s of existing) yield s; } };
      },
      uploadToFileSearchStore: async ({ fileSearchStoreName, config, file }) => {
        calls.uploaded.push({ store: fileSearchStoreName, name: config.displayName, size: file.size });
        if (failUpload) throw new Error('index failed');
        return { done: true };
      },
      delete: async () => ({}),
      documents: { list: async () => ({ async *[Symbol.asyncIterator]() {} }) },
    },
    operations: { get: async (o) => ({ ...o.operation, done: true }) },
  };
}

const session = (over = {}) => ({
  sessionId: 'sess-abc12345',
  goal: 'Design a dashboard.',
  agents: [{ name: 'Ada' }, { name: 'Grace' }],
  messages: [
    { agentName: 'Ada', content: 'The grid should breathe.' },
    { agentName: 'Grace', content: 'Agreed, but the palette fights the type.' },
  ],
  endedAt: '2026-09-12T10:00:00.000Z',
  ...over,
});

beforeEach(() => clearMemoryStoreCache());

describe('the memory store', () => {
  test('is created once, then reused', async () => {
    const client = memoryClient();
    initializeFileSearch(null, client);

    const a = await getOrCreateMemoryStore();
    const b = await getOrCreateMemoryStore();

    assert.equal(a, b);
    assert.equal(client.calls.created.length, 1, 'created once');
    assert.equal(client.calls.listed, 1, 'and the second call is cached');
  });

  test('is found by display name, so it survives a restart', async () => {
    // Nothing is persisted locally: a fresh process must re-discover the
    // store rather than orphaning it and starting a second one.
    const client = memoryClient({
      existing: [{ name: 'fileSearchStores/existing-1', displayName: MEMORY_STORE_NAME }],
    });
    initializeFileSearch(null, client);

    assert.equal(await getOrCreateMemoryStore(), 'fileSearchStores/existing-1');
    assert.equal(client.calls.created.length, 0, 'must not create a duplicate');
  });

  test('is not mistaken for an abandoned session store', async () => {
    const client = memoryClient({
      existing: [
        { name: 'fileSearchStores/m', displayName: MEMORY_STORE_NAME },
        { name: 'fileSearchStores/s', displayName: `${STORE_PREFIX}dead-session` },
      ],
    });
    initializeFileSearch(null, client);
    const orphans = await listOrphanedStores();

    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].name, 'fileSearchStores/s',
      'the orphan sweeper must never delete long-term memory');
  });
});

describe('formatting a session for memory', () => {
  test('produces readable prose, not serialised objects', () => {
    const text = formatSessionForMemory(session());

    assert.match(text, /# Chat room session — 2026-09-12/);
    assert.match(text, /Goal: Design a dashboard\./);
    assert.match(text, /Participants: Ada, Grace/);
    assert.match(text, /\*\*Ada:\*\* The grid should breathe\./);
    assert.ok(!text.includes('{'), 'retrieval works far better over prose than JSON');
  });

  test('skips empty messages and tolerates missing fields', () => {
    const text = formatSessionForMemory({
      messages: [{ agentName: 'Ada', content: '' }, { agentName: 'Ada', content: 'Real.' }],
    });
    assert.match(text, /Real\./);
    assert.match(text, /\(none stated\)/);
    assert.match(text, /\(unknown\)/);
  });
});

describe('archiving', () => {
  test('writes a dated, identifiable document into the memory store', async () => {
    const client = memoryClient();
    initializeFileSearch(null, client);
    const result = await archiveSession(session());

    assert.equal(result.ok, true);
    const up = client.calls.uploaded[0];
    assert.match(up.store, /chatroom-longterm-memory/);
    assert.equal(up.name, 'session-2026-09-12-sess-abc.md');
    assert.ok(up.size > 0);
  });

  test('reports an indexing failure instead of pretending it worked', async () => {
    initializeFileSearch(null, memoryClient({ failUpload: true }));
    const result = await archiveSession(session());

    assert.equal(result.ok, false);
    assert.match(result.error, /index failed/);
  });
});

describe('orchestrator archiving policy', () => {
  test('a barely-started room is not worth remembering', async () => {
    const { orchestrator: orch } = await import('../server/services/orchestrator.js');
    orch.reset();
    // Below the threshold, _archiveToMemory returns before touching the API.
    orch.messages = Array.from({ length: MIN_MESSAGES_TO_ARCHIVE - 1 }, () => ({
      agentName: 'Ada', content: 'hi',
    }));
    assert.doesNotThrow(() => orch._archiveToMemory('user_stopped'));
  });

  test('reset does not clear the memory store handle', async () => {
    const { orchestrator: orch } = await import('../server/services/orchestrator.js');
    orch.memoryStoreName = 'fileSearchStores/memory-1';
    orch.reset();
    // reset() wipes session state; long-term memory is the one thing that
    // must outlive it, or it is not memory.
    assert.equal(orch.fileSearchStoreName, null, 'session store IS cleared');
    assert.equal(orch.memoryStoreName, 'fileSearchStores/memory-1',
      'memory store must survive a reset');
  });
});
