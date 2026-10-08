/**
 * Session archive: every chat room's conversations saved to disk as they happen, and loadable again.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * A room otherwise lives only in the server's memory. Closing the tab, restarting the server or losing power loses the
 * conversation; the only other save is the Export button in a client. Two swarm sessions were lost that way. This keeps a
 * folder per session under <data>/rooms/<room id>/:
 *
 *   session.json      who, what goal, the agents (with their bios), the settings, when it started and how it ended
 *   transcript.jsonl  one message per line, appended the moment it is said (media moved out to files)
 *   media/            generated images and videos, by id
 *   uploads/          files the host attached to the room
 *   artifacts/        the latest version of each artifact, and artifacts/.versions/<name>.v<N> for every version
 *
 * Privacy, because this keeps people's conversations: it is ON for a local install and OFF on a hosted instance
 * (SYNTH_HOSTED=1) unless CHATROOM_AUTOSAVE=1; CHATROOM_AUTOSAVE=0 turns it off anywhere. A room only ever sees its own folder (the
 * folder name is the room's secret id). Sessions are deleted after CHATROOM_AUTOSAVE_DAYS (default 30; 0 keeps them) and any one,
 * or all, can be deleted at any time. Nothing is sent anywhere. `chatroom/data/rooms/` is git-ignored.
 *
 * `toStudioExport` writes the shape the Agent Studio's own Export button downloads ({ goal, mode, agents, messages, artifacts,
 * workflows }) and `fromStudioExport` reads it back, so a downloaded session, a saved session and a hand-made one all load the same way.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = path.resolve(HERE, '../../data');

const ID_RE = /^[0-9]{8}-[0-9]{6}(?:-[a-z0-9-]{1,40})?(?:-[0-9]+)?$/;
const MAX_LINE_CHARS = 400_000;            // a transcript line longer than this is truncated, never the whole write refused
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'application/json': 'json', 'text/plain': 'txt', 'text/markdown': 'md' };

/** Whether rooms are saved to disk at all, from the environment. Off in tests (NODE_TEST_CONTEXT) unless forced with CHATROOM_AUTOSAVE=1. */
export function autosaveEnabled(env = process.env) {
  if (env.CHATROOM_AUTOSAVE === '1') return true;
  if (env.CHATROOM_AUTOSAVE === '0' || env.NODE_TEST_CONTEXT) return false;
  return !(env.SYNTH_HOSTED === '1' || !!env.VERCEL);      // a hosted instance (the same test workflow-engine's isHostedInstance makes)
}

export function retentionDays(env = process.env) {
  const n = Number(env.CHATROOM_AUTOSAVE_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

export function dataDir(env = process.env) {
  return env.CHATROOM_DATA_DIR ? path.resolve(env.CHATROOM_DATA_DIR) : DEFAULT_DATA_DIR;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
function stamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/g, '');
}
/** A file name an agent chose, made safe to write: its last path part, no leading dots, plain characters. */
export function safeName(name, fallback = 'file') {
  const base = path.basename(String(name || '').replace(/\\/g, '/')).replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '').slice(0, 120);
  return base || fallback;
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export class SessionArchive {
  /**
   * @param {{ rootDir?: string, roomId: string, retentionDays?: number, now?: () => Date }} options
   */
  constructor({ rootDir = DEFAULT_DATA_DIR, roomId, retentionDays: days = retentionDays(), now = () => new Date() } = {}) {
    if (!/^[a-f0-9]{32}$/.test(String(roomId))) throw new Error('SessionArchive needs a 32-hex room id');
    this.roomDir = path.join(rootDir, 'rooms', roomId);
    this.retentionDays = days;
    this.now = now;
  }

  _dir(id) {
    if (!ID_RE.test(String(id))) throw new Error('bad session id');
    return path.join(this.roomDir, id);
  }

  has(id) {
    try { return ID_RE.test(String(id)) && fs.existsSync(path.join(this._dir(id), 'session.json')); } catch { return false; }
  }

  /** Start a folder for a new session. Returns its id. */
  begin({ goal = '', meta = {} } = {}) {
    fs.mkdirSync(this.roomDir, { recursive: true });
    const base = `${stamp(this.now())}${slug(goal) ? `-${slug(goal)}` : ''}`;
    let id = base;
    for (let n = 2; fs.existsSync(path.join(this.roomDir, id)); n++) id = `${base}-${n}`;
    fs.mkdirSync(path.join(this.roomDir, id, 'media'), { recursive: true });
    this.updateMeta(id, { id, version: 1, goal, startedAt: this.now().toISOString(), endedAt: null, endReason: null, messageCount: 0, ...meta });
    return id;
  }

  readMeta(id) {
    try { return JSON.parse(fs.readFileSync(path.join(this._dir(id), 'session.json'), 'utf8')); } catch { return null; }
  }

  updateMeta(id, patch) {
    const file = path.join(this._dir(id), 'session.json');
    const current = this.readMeta(id) || {};
    writeJsonAtomic(file, { ...current, ...patch });
  }

  /** Save media bytes (base64) under media/ and return the relative path. */
  saveMedia(id, mediaId, mimeType, base64) {
    if (!base64 || typeof base64 !== 'string') return null;
    const ext = MIME_EXT[mimeType] || 'bin';
    const rel = `media/${safeName(mediaId, 'media')}.${ext}`;
    const file = path.join(this._dir(id), rel);
    if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    return rel;
  }

  saveUpload(id, item) {
    const dir = path.join(this._dir(id), 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    const rel = `uploads/${safeName(item.id, 'upload')}-${safeName(item.name, 'file')}`;
    if (item.data) fs.writeFileSync(path.join(this._dir(id), rel), Buffer.from(String(item.data), 'base64'));
    const meta = this.readMeta(id) || {};
    const uploads = (meta.uploads || []).filter(u => u.id !== item.id);
    uploads.push({ id: item.id, name: item.name, mimeType: item.mimeType, description: item.description || '', file: rel });
    this.updateMeta(id, { uploads });
    return rel;
  }

  saveArtifact(id, { filename, content, version }) {
    const dir = path.join(this._dir(id), 'artifacts');
    fs.mkdirSync(path.join(dir, '.versions'), { recursive: true });
    const name = safeName(filename, 'artifact');
    fs.writeFileSync(path.join(dir, name), String(content ?? ''));
    fs.writeFileSync(path.join(dir, '.versions', `${name}.v${Number(version) || 1}`), String(content ?? ''));
  }

  /**
   * Append one message to the transcript. Heavy fields go to files; a pathological line is truncated, never refused.
   * @param {object} message  a chat message as the orchestrator makes it
   * @param {(mediaId: string) => ({ data: string, mimeType: string } | undefined)} [lookupMedia] to fetch a generated item's bytes
   */
  appendMessage(id, message, lookupMedia = () => undefined) {
    const record = JSON.parse(JSON.stringify(message));
    if (Array.isArray(record.images)) {
      record.images = record.images.map(img => {
        const { imageData, ...rest } = img;
        const file = this.saveMedia(id, img.id || uuidv4(), img.mimeType || 'image/png', imageData);
        return file ? { ...rest, file } : rest;
      });
    }
    if (Array.isArray(record.synthMedia)) {
      record.synthMedia = record.synthMedia.map(sm => {
        const stored = sm.id ? lookupMedia(sm.id) : undefined;
        const file = stored?.data ? this.saveMedia(id, sm.id, stored.mimeType || sm.mimeType, stored.data) : null;
        return file ? { ...sm, file } : sm;
      });
    }
    let line = JSON.stringify(record);
    if (line.length > MAX_LINE_CHARS) {
      record.content = `${String(record.content || '').slice(0, 20000)}\n[truncated: this message was ${line.length} characters]`;
      delete record.toolResults;
      delete record.toolCalls;
      delete record.synthResults;
      line = JSON.stringify(record);
    }
    fs.appendFileSync(path.join(this._dir(id), 'transcript.jsonl'), `${line}\n`);
  }

  readMessages(id) {
    try {
      return fs.readFileSync(path.join(this._dir(id), 'transcript.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  }

  readFileBase64(id, rel) {
    const file = path.resolve(this._dir(id), rel);
    if (!file.startsWith(this._dir(id) + path.sep)) return null;          // never read outside the session's own folder
    try { return fs.readFileSync(file).toString('base64'); } catch { return null; }
  }

  readArtifacts(id) {
    const dir = path.join(this._dir(id), 'artifacts');
    const out = [];
    let names = [];
    try { names = fs.readdirSync(dir).filter(n => n !== '.versions'); } catch { return out; }
    for (const name of names) {
      const versions = [];
      try {
        for (const v of fs.readdirSync(path.join(dir, '.versions'))) {
          const m = v.startsWith(`${name}.v`) && /^\d+$/.test(v.slice(name.length + 2)) ? Number(v.slice(name.length + 2)) : null;
          if (m) versions.push({ version: m, content: fs.readFileSync(path.join(dir, '.versions', v), 'utf8') });
        }
      } catch { /* no versions folder */ }
      versions.sort((a, b) => a.version - b.version);
      out.push({ filename: name, content: fs.readFileSync(path.join(dir, name), 'utf8'), versions });
    }
    return out;
  }

  /** Saved sessions, newest first. */
  list() {
    let dirs = [];
    try { dirs = fs.readdirSync(this.roomDir); } catch { return []; }
    return dirs.filter(d => ID_RE.test(d)).map(d => this.readMeta(d)).filter(Boolean)
      .map(m => ({
        id: m.id, goal: m.goal, mode: m.mode, startedAt: m.startedAt, endedAt: m.endedAt, endReason: m.endReason,
        messageCount: m.messageCount ?? 0, agents: (m.agents || []).map(a => a.name), artifactCount: (m.artifactNames || []).length,
      }))
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  }

  /** Everything needed to put a session back into a room. */
  load(id) {
    const meta = this.readMeta(id);
    if (!meta) return null;
    return { meta, messages: this.readMessages(id), artifacts: this.readArtifacts(id) };
  }

  remove(id) {
    fs.rmSync(this._dir(id), { recursive: true, force: true });
  }

  removeAll() {
    for (const m of this.list()) this.remove(m.id);
  }

  /** Delete sessions older than the retention window. Returns how many. */
  prune() {
    if (!(this.retentionDays > 0)) return 0;
    const cutoff = this.now().getTime() - this.retentionDays * 86_400_000;
    let removed = 0;
    for (const s of this.list()) {
      const t = Date.parse(s.endedAt || s.startedAt);
      if (Number.isFinite(t) && t < cutoff) { this.remove(s.id); removed++; }
    }
    return removed;
  }
}

// ── the Agent Studio's own export shape ───────────────────────────────────────────────────────────────────────────────

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|(?:hsl|rgb)a?\([\d\s.,%/-]+\))$/;
const MAX_AGENTS = 12;
const MAX_MESSAGES = 5000;
const MAX_TEXT = 200_000;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const clip = (v, n) => String(v ?? '').slice(0, n);

/**
 * The session as a download: what the Studio's Export button writes, with images inline so the file stands alone.
 * @param {{ meta: object, messages: object[], artifacts: object[] }} saved  from SessionArchive.load
 * @param {(rel: string) => string|null} readBase64  fetch a media file by its relative path
 */
export function toStudioExport(saved, readBase64 = () => null) {
  const messages = saved.messages.map(m => {
    const out = { ...m };
    if (Array.isArray(out.images)) {
      out.images = out.images.map(({ file, ...img }) => (file ? { ...img, imageData: readBase64(file) } : img));
    }
    return out;
  });
  return {
    exportedAt: new Date().toISOString(),
    goal: saved.meta.goal || '',
    mode: saved.meta.mode || 'group',
    agents: (saved.meta.agents || []).map(a => ({ id: a.id, name: a.name, bio: a.bio, color: a.color, muted: !!a.muted })),
    messages,
    workflows: [],
    artifacts: saved.artifacts.map(a => ({ filename: a.filename, content: a.content, version: a.versions.length || 1 })),
    composerContext: null,
  };
}

/**
 * Read a session file (the Studio's export, or toStudioExport's output) into what a room can load, dropping anything unexpected and
 * capping sizes. Throws an Error with a plain message when the file is not a session.
 * @returns {{ meta: object, messages: object[], artifacts: object[] }}
 */
export function fromStudioExport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('This is not a session file (expected a JSON object).');
  if (!Array.isArray(data.messages)) throw new Error('This is not a session file: it has no "messages" list.');
  if (data.messages.length > MAX_MESSAGES) throw new Error(`Too many messages (${data.messages.length}; the limit is ${MAX_MESSAGES}).`);
  const rawAgents = Array.isArray(data.agents) ? data.agents : [];
  if (rawAgents.length > MAX_AGENTS) throw new Error(`Too many agents (${rawAgents.length}; the limit is ${MAX_AGENTS}).`);

  const agents = rawAgents.filter(a => a && typeof a === 'object' && a.name).map(a => ({
    id: typeof a.id === 'string' && a.id ? clip(a.id, 80) : uuidv4(),
    name: clip(a.name, 80),
    bio: clip(a.bio, 20_000),
    color: COLOR_RE.test(String(a.color || '')) ? String(a.color) : null,
    muted: !!a.muted,
    ...(typeof a.model === 'string' ? { model: clip(a.model, 80) } : {}),
  }));

  const messages = data.messages.filter(m => m && typeof m === 'object' && (m.content !== undefined || m.images)).map(m => {
    const out = {
      id: typeof m.id === 'string' && m.id ? clip(m.id, 80) : uuidv4(),
      agentId: clip(m.agentId || (m.isUser ? 'user' : ''), 80),
      agentName: clip(m.agentName || (m.isUser ? 'User' : 'Agent'), 80),
      content: clip(m.content, MAX_TEXT),
      timestamp: typeof m.timestamp === 'string' ? clip(m.timestamp, 40) : new Date().toISOString(),
      isUser: !!m.isUser,
      tokenCount: Number.isFinite(m.tokenCount) ? m.tokenCount : Math.max(1, Math.round(String(m.content || '').length / 4)),
    };
    if (COLOR_RE.test(String(m.color || ''))) out.color = String(m.color);
    if (typeof m.model === 'string') out.model = clip(m.model, 80);
    if (m.isNote) out.isNote = true;
    if (Array.isArray(m.images)) {
      out.images = m.images.filter(img => img && typeof img.imageData === 'string' && IMAGE_TYPES.has(img.mimeType)).map(img => ({
        id: typeof img.id === 'string' && img.id ? clip(img.id, 80) : uuidv4(), prompt: clip(img.prompt, 4000), caption: clip(img.caption, 4000),
        mimeType: img.mimeType, imageData: img.imageData,
      }));
      if (!out.images.length) delete out.images;
    }
    return out;
  });

  const artifacts = (Array.isArray(data.artifacts) ? data.artifacts : Object.values(data.artifacts || {}))
    .filter(a => a && typeof a.filename === 'string' && typeof a.content === 'string')
    .slice(0, 100)
    .map(a => ({ filename: safeName(a.filename, 'artifact'), content: clip(a.content, 2_000_000), versions: Array.isArray(a.versions) ? a.versions.filter(v => typeof v?.content === 'string').map((v, i) => ({ version: v.version || i + 1, content: clip(v.content, 2_000_000) })) : [] }));

  return {
    meta: {
      goal: clip(data.goal, 4000),
      mode: data.mode === 'solo' ? 'solo' : 'group',
      agents,
      tokenLimit: Number.isFinite(data.tokenLimit) ? data.tokenLimit : undefined,
      endReason: null,
    },
    messages,
    artifacts,
  };
}

// ── putting a saved session back, and keeping a live room saved ──────────────────────────────────────────────────────

/** A saved session with its media read back in, ready for ChatOrchestrator.restoreSession. */
export function hydrateSaved(archive, id) {
  const saved = archive.load(id);
  if (!saved) return null;
  const media = [];
  const messages = saved.messages.map(m => {
    const out = { ...m };
    if (Array.isArray(out.images)) {
      out.images = out.images.map(({ file, ...img }) => (file ? { ...img, imageData: archive.readFileBase64(id, file) } : img))
        .filter(img => img.imageData);
    }
    if (Array.isArray(out.synthMedia)) {
      for (const sm of out.synthMedia) {
        const data = sm.file ? archive.readFileBase64(id, sm.file) : null;
        if (data) media.push({ id: sm.id, type: sm.type, mimeType: sm.mimeType, prompt: sm.prompt || '', data });
      }
    }
    return out;
  });
  return { meta: saved.meta, messages, artifacts: saved.artifacts, media, archiveId: id };
}

const agentSnapshot = a => ({ id: a.id, name: a.name, bio: a.bio, color: a.color, model: a.model ?? null, thinkingLevel: a.thinkingLevel ?? null, tools: a.tools ?? null, voice: a.voice ?? null, muted: !!a.muted });

/** What a session folder records about the room at a moment: enough to rebuild it. */
export function snapshotRoom(o) {
  return {
    mode: o.mode,
    goal: o.goal,
    tokenLimit: o.tokenLimit,
    tokenCount: o.tokenCount,
    turnCount: o.turnCount,
    agents: o.agents.map(agentSnapshot),
    settings: { consensus: { ...o.consensusSettings }, doneWhen: o.doneWhen ? o.doneWhen.criteria : [] },
    messageCount: o.messages.length,
  };
}

/**
 * Save a room as it talks: a folder begins when a session starts, every message is appended as it is said, artifacts and uploads
 * are written as they change, and the folder is closed off (how and when it ended) when the session ends. A session restored from
 * disk keeps writing into its own folder; one imported from a file starts a new folder holding what was imported.
 * @returns {() => void} detach
 */
export function attachArchive(orchestrator, archive) {
  let id = null;
  const begin = () => {
    id = archive.begin({ goal: orchestrator.goal, meta: snapshotRoom(orchestrator) });
    orchestrator._archiveId = id;
    return id;
  };
  const ensure = () => id || begin();
  const lookup = (mediaId) => orchestrator.mediaStore?.get?.(mediaId);

  const handle = (event, data) => {
    switch (event) {
      case 'session_start':
        begin();
        break;
      case 'reset':
        id = null;
        orchestrator._archiveId = null;
        break;
      case 'session_restored':
        if (data.archiveId && archive.has(data.archiveId)) {
          id = data.archiveId;
          orchestrator._archiveId = id;
          archive.updateMeta(id, { endedAt: null, endReason: null });
        } else {
          begin();                                                       // an imported file: save what came in
          for (const m of orchestrator.messages) archive.appendMessage(id, m, lookup);
          for (const a of orchestrator.artifactStore.artifacts.values()) {
            a.versions.forEach(v => archive.saveArtifact(id, { filename: a.filename, content: v.content, version: v.version }));
          }
          archive.updateMeta(id, { ...snapshotRoom(orchestrator), importedFrom: data.source || 'file', artifactNames: [...orchestrator.artifactStore.artifacts.keys()] });
        }
        break;
      case 'session_resumed':
        archive.updateMeta(ensure(), { endedAt: null, endReason: null });
        break;
      case 'message':
        archive.appendMessage(ensure(), data, lookup);
        archive.updateMeta(id, snapshotRoom(orchestrator));
        break;
      case 'artifact_update': {
        archive.saveArtifact(ensure(), data);
        const names = new Set(archive.readMeta(id)?.artifactNames || []);
        names.add(data.filename);
        archive.updateMeta(id, { artifactNames: [...names] });
        break;
      }
      case 'session_media':
        archive.saveUpload(ensure(), data);
        break;
      case 'session_end':
        archive.updateMeta(ensure(), { ...snapshotRoom(orchestrator), endedAt: new Date().toISOString(), endReason: data.reason || null });
        break;
      default:
    }
  };

  const detach = orchestrator.addObserver((event, data) => {
    try { handle(event, data); } catch (err) { console.warn(`[archive] ${event}: ${err.message}`); }   // saving must never cost a turn
  });
  return detach;
}
