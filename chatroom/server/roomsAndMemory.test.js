/**
 * Chat rooms meet the modernization work: the things that used to be one-per-server
 * (the long-term memory store, the orphan sweeper, the judge's usage counter) must now
 * be one-per-visitor, or one visitor could read, wipe or pay for another's.
 *
 * The File Search and judge clients are stand-ins; nothing here touches the network.
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'chatroom-mem-'));
process.env.WORKFLOW_DATA_DIR = dataDir;
process.env.WORKFLOW_TRACES_DIR = join(dataDir, 'traces');

const { createApp } = await import('./app.js');
const { getRoom, clearRooms } = await import('./services/sessionRegistry.js');
const fileSearch = await import('./services/fileSearch.js');
const judge = await import('./services/judge.js');

/** A File Search service that keeps its stores in a Map. */
function fakeFileSearch() {
  const stores = new Map();
  const deleted = [];
  let n = 0;
  return {
    stores,
    deleted,
    fileSearchStores: {
      async list() { return (async function* () { yield* [...stores.values()]; })(); },
      async create({ config }) {
        const store = { name: `fileSearchStores/s${++n}`, displayName: config.displayName };
        stores.set(store.name, store);
        return store;
      },
      async delete({ name }) { stores.delete(name); deleted.push(name); },
      documents: {
        async list({ parent }) {
          return (async function* () { yield { name: `${parent}/documents/d1`, displayName: `notes held in ${parent}` }; })();
        },
      },
    },
  };
}

let server, base, fake;

before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections?.();
  server.close();
  clearRooms();
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  fake = fakeFileSearch();
  fileSearch.initializeFileSearch('test-key', fake);
  fileSearch.resetMemoryStoreCache();
});

function visitor() {
  let cookie = null;
  return {
    get roomId() { return cookie?.split('=')[1]; },
    async call(method, path) {
      const res = await fetch(base + path, { method, headers: cookie ? { cookie } : {} });
      const issued = res.headers.getSetCookie().find(c => c.startsWith('cr_sid='));
      if (issued) cookie = issued.split(';')[0];
      return { status: res.status, json: await res.json().catch(() => null) };
    },
  };
}

// ── long-term memory ─────────────────────────────────────────────────────────

test('each owner has a store of their own; with no owner it is the original single store', () => {
  assert.equal(fileSearch.memoryStoreNameFor(null), 'chatroom-longterm-memory');
  assert.equal(fileSearch.memoryStoreNameFor('abc'), 'chatroom-longterm-memory-abc');
  assert.notEqual(fileSearch.memoryStoreNameFor('a'), fileSearch.memoryStoreNameFor('b'));
});

test('two owners get two memory stores, and asking again finds the same one', async () => {
  const a = await fileSearch.getOrCreateMemoryStore('owner-a');
  const b = await fileSearch.getOrCreateMemoryStore('owner-b');
  assert.notEqual(a, b);
  assert.equal(await fileSearch.getOrCreateMemoryStore('owner-a'), a);
  assert.equal(fake.stores.size, 2);
  assert.deepEqual([...fake.stores.values()].map(s => s.displayName).sort(),
    ['chatroom-longterm-memory-owner-a', 'chatroom-longterm-memory-owner-b']);
});

test('an archived conversation goes into its owner\'s memory and nobody else\'s', async () => {
  await fileSearch.archiveSession({ sessionId: 's1', goal: 'g', agents: [], messages: [], ownerId: 'owner-a' });
  const names = [...fake.stores.values()].map(s => s.displayName);
  assert.deepEqual(names, ['chatroom-longterm-memory-owner-a']);
});

test("the memory routes show and wipe only the visitor's own memory", async () => {
  const [a, b] = [visitor(), visitor()];
  const listA = await a.call('GET', '/api/chat/memory');
  const listB = await b.call('GET', '/api/chat/memory');
  assert.equal(listA.json.enabled, true);
  assert.notEqual(listA.json.storeName, listB.json.storeName);
  assert.match(listA.json.documents[0].displayName, new RegExp(listA.json.storeName.replace(/\//g, '\\/')));

  const wiped = await a.call('DELETE', '/api/chat/memory');
  assert.equal(wiped.json.forgotten, true);
  assert.deepEqual(fake.deleted, [listA.json.storeName], 'only A\'s store was deleted');
  assert.ok([...fake.stores.keys()].includes(listB.json.storeName), "B's memory is untouched");
  assert.equal((await b.call('GET', '/api/chat/memory')).json.storeName, listB.json.storeName);
});

test('the room looks up its own memory store when a chat starts', async () => {
  const room = getRoom('1'.repeat(32));
  room.orchestrator._resolveMemoryStore();
  for (let i = 0; i < 50 && !room.orchestrator.memoryStoreName; i++) await new Promise(r => setTimeout(r, 5));
  assert.ok(room.orchestrator.memoryStoreName);
  assert.equal([...fake.stores.values()][0].displayName, `chatroom-longterm-memory-${'1'.repeat(32)}`);
});

// ── the orphan sweeper ───────────────────────────────────────────────────────

test("sweeping orphaned stores never deletes a store another visitor's chat is using", async () => {
  const [a, b] = [visitor(), visitor()];
  await a.call('GET', '/api/agents');
  await b.call('GET', '/api/agents');
  fake.stores.set('fileSearchStores/live-a', { name: 'fileSearchStores/live-a', displayName: `${fileSearch.STORE_PREFIX}aaa` });
  fake.stores.set('fileSearchStores/live-b', { name: 'fileSearchStores/live-b', displayName: `${fileSearch.STORE_PREFIX}bbb` });
  fake.stores.set('fileSearchStores/crashed', { name: 'fileSearchStores/crashed', displayName: `${fileSearch.STORE_PREFIX}old` });
  getRoom(a.roomId).orchestrator.fileSearchStoreName = 'fileSearchStores/live-a';
  getRoom(b.roomId).orchestrator.fileSearchStoreName = 'fileSearchStores/live-b';

  const swept = await b.call('DELETE', '/api/chat/file-search/orphans');     // B runs the sweep
  assert.equal(swept.json.deleted, 1);
  assert.deepEqual(fake.deleted, ['fileSearchStores/crashed']);
  assert.ok(fake.stores.has('fileSearchStores/live-a'), "A's live store survived B's sweep");
  assert.ok(fake.stores.has('fileSearchStores/live-b'));
});

// ── the judge's usage counter ────────────────────────────────────────────────

test("a room's judgement usage is counted in that room only", async () => {
  const client = { interactions: { async create() {
    return { output_text: JSON.stringify({ complete: false, confidence: 0.1, rationale: 'no' }),
             usage: { total_input_tokens: 40, total_output_tokens: 5, total_tokens: 45 } };
  } } };
  judge.initializeJudge('test-key', client);

  const roomA = getRoom('a'.repeat(32)).orchestrator;
  const roomB = getRoom('b'.repeat(32)).orchestrator;
  assert.notEqual(roomA.judgeUsage, roomB.judgeUsage);

  await judge.assessCompletion({ content: 'we are done', goal: 'g', agentName: 'Ann', usage: roomA.judgeUsage });
  await judge.assessCompletion({ content: 'we are done', goal: 'g', agentName: 'Ann', usage: roomA.judgeUsage });
  await judge.assessCompletion({ content: 'we are done', goal: 'g', agentName: 'Ben', usage: roomB.judgeUsage });

  assert.equal(roomA.judgeUsage.calls, 2);
  assert.equal(roomA.judgeUsage.inputTokens, 80);
  assert.equal(roomB.judgeUsage.calls, 1);
  assert.equal(judge.getJudgeUsage().calls, 0, 'the shared fallback counter is untouched');
});

test("starting one room's chat does not reset another room's counters", () => {
  const roomA = getRoom('c'.repeat(32)).orchestrator;
  const roomB = getRoom('d'.repeat(32)).orchestrator;
  roomA.judgeUsage.calls = 7;
  roomB.addAgent('Ann', 'You are Ann.');
  roomB.addAgent('Ben', 'You are Ben.');
  roomB.broadcast = () => {};
  roomB.runConversationLoop = () => {};            // do not actually run a chat
  roomB.start('a goal', 1000);
  assert.equal(roomA.judgeUsage.calls, 7);
  assert.equal(roomB.judgeUsage.calls, 0);
  roomB.isRunning = false;
});
