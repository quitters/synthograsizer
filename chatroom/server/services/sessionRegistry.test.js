import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRoom, newRoomId, isRoomId, sweep, clearRooms, roomCount, hasRoom,
  EMPTY_ROOM_TTL_MS, IDLE_ROOM_TTL_MS, MAX_ROOMS,
} from './sessionRegistry.js';

beforeEach(() => clearRooms());

const MIN = 60 * 1000;

test('room ids are 128 random bits as hex, and only those are accepted back', () => {
  const id = newRoomId();
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.notEqual(id, newRoomId());
  for (const bad of [undefined, '', 'abc', id.toUpperCase(), id + 'a', '../../etc/passwd', `${id.slice(0, 31)}!`, 42, null]) {
    assert.equal(isRoomId(bad), false, String(bad));
  }
  assert.equal(isRoomId(id), true);
});

test('the same id gets the same room; different ids get separate everything', () => {
  const [a, b] = [newRoomId(), newRoomId()];
  const roomA = getRoom(a);
  assert.equal(getRoom(a), roomA);

  const roomB = getRoom(b);
  assert.notEqual(roomA.orchestrator, roomB.orchestrator);
  assert.notEqual(roomA.mediaStore, roomB.mediaStore);
  assert.notEqual(roomA.artifactStore, roomB.artifactStore);

  roomA.orchestrator.addAgent('Ann', 'You are Ann.');
  roomA.mediaStore.add({ id: 'm1', type: 'image', data: 'x', mimeType: 'image/png' });
  roomA.artifactStore.save('a.js', 'let a = 1;', 'agent', 'Ann');

  assert.equal(roomB.orchestrator.getAgents().length, 0);
  assert.equal(roomB.mediaStore.get('m1'), undefined);
  assert.equal(roomB.artifactStore.getAll().length, 0);
});

test("a room's orchestrator tags itself and uses its own stores", () => {
  const room = getRoom(newRoomId());
  assert.equal(room.orchestrator.ownerId, room.id);
  assert.equal(room.orchestrator.mediaStore, room.mediaStore);
  assert.equal(room.orchestrator.artifactStore, room.artifactStore);
});

test('a room that was never used expires quickly; one that holds a conversation lasts hours', () => {
  const empty = getRoom(newRoomId());
  const used = getRoom(newRoomId());
  used.orchestrator.addAgent('Ann', 'You are Ann.');
  const t0 = Date.now();

  assert.equal(sweep(t0 + EMPTY_ROOM_TTL_MS - MIN), 0);
  assert.equal(sweep(t0 + EMPTY_ROOM_TTL_MS + MIN), 1);
  assert.equal(hasRoom(empty.id), false);
  assert.equal(hasRoom(used.id), true);

  assert.equal(sweep(t0 + IDLE_ROOM_TTL_MS + MIN), 1);
  assert.equal(hasRoom(used.id), false);
});

test('touching a room keeps it alive', () => {
  const room = getRoom(newRoomId());
  room.lastSeen = Date.now() - EMPTY_ROOM_TTL_MS - MIN;      // about to expire...
  getRoom(room.id);                                          // ...but someone just used it
  assert.equal(sweep(), 0);
  assert.equal(hasRoom(room.id), true);
});

test('a running chat or an open browser tab is never swept', () => {
  const running = getRoom(newRoomId());
  running.orchestrator.isRunning = true;
  const watched = getRoom(newRoomId());
  watched.orchestrator.sseClients.add({ write() {} });
  const idle = getRoom(newRoomId());

  const far = Date.now() + 100 * 60 * MIN;
  assert.equal(sweep(far), 1);
  assert.equal(hasRoom(running.id), true);
  assert.equal(hasRoom(watched.id), true);
  assert.equal(hasRoom(idle.id), false);
});

test('over the cap, the least recently used idle rooms go first, but not brand-new ones', () => {
  const old = [];
  for (let i = 0; i < MAX_ROOMS + 3; i++) {
    const room = getRoom(newRoomId());
    room.orchestrator.addAgent('x', 'y');                   // not "empty", so the long TTL applies
    room.lastSeen = Date.now() - 5 * MIN - (MAX_ROOMS + 3 - i) * 1000;   // older with smaller i
    old.push(room);
  }
  const fresh = getRoom(newRoomId());                       // under a minute old: protected
  fresh.orchestrator.addAgent('x', 'y');

  sweep();
  assert.equal(roomCount(), MAX_ROOMS);
  assert.equal(hasRoom(fresh.id), true);
  assert.equal(hasRoom(old[0].id), false, 'the oldest was evicted');
  assert.equal(hasRoom(old[old.length - 1].id), true, 'a newer one survived');
});
