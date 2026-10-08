/**
 * One chat room per visitor.
 *
 * The server used to hold a single global orchestrator, so every browser saw (and
 * could stop, reset or inject into) the same conversation, agents, generated media
 * and shared files. A "room" is now everything one visitor's session owns: the
 * orchestrator and its SSE clients, the media their agents generate, and the
 * artifacts they write. Rooms are looked up by an unguessable id the browser keeps
 * in a cookie (see middleware/session.js).
 *
 * Rooms live in memory only, as the single room always did. An unused room is
 * dropped: quickly if it was never used, after hours if it holds a conversation.
 * A room with a running chat or an open browser tab is never dropped.
 */
import crypto from 'node:crypto';
import { ChatOrchestrator } from './orchestrator.js';
import { MediaStore } from './mediaStore.js';
import { ArtifactStore } from './artifactStore.js';
import { SessionArchive, attachArchive, autosaveEnabled, dataDir, retentionDays } from './sessionArchive.js';

export const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;          // never used
export const IDLE_ROOM_TTL_MS = 6 * 60 * 60 * 1000;       // used, then abandoned
export const MAX_ROOMS = 200;                              // soft cap, see sweep()
const MIN_AGE_WHEN_FULL_MS = 60 * 1000;                    // never evict a room younger than this to make space
const SWEEP_EVERY_MS = 10 * 60 * 1000;

const rooms = new Map();
let sweeper = null;

/** A fresh room id: 128 random bits as 32 hex characters. */
export function newRoomId() {
  return crypto.randomBytes(16).toString('hex');
}

export function isRoomId(id) {
  return typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
}

const inUse = (room) => room.orchestrator.isRunning || room.orchestrator.sseClients.size > 0;

function isEmpty(room) {
  const o = room.orchestrator;
  return o.agents.length === 0 && o.messages.length === 0 && o.sessionMedia.length === 0
    && room.mediaStore.media.size === 0 && room.artifactStore.artifacts.size === 0;
}

/**
 * Drop rooms nobody is using: expired ones, then (if still over the cap) the
 * least recently used. Returns how many were dropped.
 */
export function sweep(now = Date.now()) {
  let dropped = 0;
  for (const [id, room] of rooms) {
    if (inUse(room)) continue;
    const ttl = isEmpty(room) ? EMPTY_ROOM_TTL_MS : IDLE_ROOM_TTL_MS;
    if (now - room.lastSeen > ttl) { rooms.delete(id); dropped++; }
  }
  if (rooms.size > MAX_ROOMS) {
    const candidates = [...rooms.values()]
      .filter(r => !inUse(r) && now - r.lastSeen > MIN_AGE_WHEN_FULL_MS)
      .sort((a, b) => a.lastSeen - b.lastSeen);
    for (const room of candidates) {
      if (rooms.size <= MAX_ROOMS) break;
      rooms.delete(room.id); dropped++;
    }
  }
  return dropped;
}

/** The room for `id`, created empty on first use. Touching it keeps it alive. */
export function getRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    sweep();
    const mediaStore = new MediaStore();
    const artifactStore = new ArtifactStore();
    const orchestrator = new ChatOrchestrator({ ownerId: id, mediaStore, artifactStore });
    // Saved to disk as it talks (see sessionArchive.js): on for a local install, off on a hosted one
    let archive = null;
    if (autosaveEnabled()) {
      try {
        archive = new SessionArchive({ rootDir: dataDir(), roomId: id, retentionDays: retentionDays() });
        archive.prune();
        attachArchive(orchestrator, archive);
      } catch (err) {
        console.warn(`[sessionRegistry] saving to disk is unavailable: ${err.message}`);
        archive = null;
      }
    }
    room = {
      id,
      mediaStore,
      artifactStore,
      orchestrator,
      archive,
      lastSeen: Date.now(),
    };
    rooms.set(id, room);
    if (!sweeper) {
      sweeper = setInterval(() => sweep(), SWEEP_EVERY_MS);
      sweeper.unref();
    }
  }
  room.lastSeen = Date.now();
  return room;
}

/** Names of the File Search stores that live rooms are using right now; never to be swept. */
export function activeFileSearchStores() {
  return [...rooms.values()].map(r => r.orchestrator.fileSearchStoreName).filter(Boolean);
}

export const roomCount = () => rooms.size;
export const hasRoom = (id) => rooms.has(id);

/** For tests: forget every room. */
export function clearRooms() {
  rooms.clear();
}
