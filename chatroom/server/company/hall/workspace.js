/**
 * The workspace: shared files a company keeps, apart from any one room's own files.
 * ─────────────────────────────────────────────────────────────────────────────────
 * A room's artifacts (artifactStore) live and die with the room. What outlasts a session or must be seen from another room goes here: a
 * README on how the company works, checklists, briefs, style notes, a script kept as text. Files are versioned (every write keeps the one
 * before), small, text only, and named plainly. The company's "programs" are files here; nothing here runs. A script is read like any
 * other text and executed, if at all, by the sandboxed code tool a person's tier already allows.
 *
 * An agent can lock nothing and unlock nothing; the owner locks a file (the README, the norms) so that people can read it and not change it.
 * Every write by an agent is screened before it happens (tools.js).
 */
import { transaction, plain } from '../flow/sqlite.js';
import { HALL_LIMITS } from './limits.js';
import { rid, bad, refuse, missing, cleanBlock } from './common.js';

const L = HALL_LIMITS.workspace;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
export const WORKSPACE_EXTENSIONS = Object.freeze(['md', 'txt', 'json', 'yaml', 'yml', 'csv', 'js', 'mjs', 'py', 'html', 'css']);

/** A path made plain and safe, or a refusal that says what is wrong. */
export function normalizePath(input) {
  if (typeof input !== 'string') throw bad('A file needs a path.', { field: 'path' });
  const raw = input.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  if (!raw) throw bad('A file needs a path.', { field: 'path' });
  if (raw.length > L.path) throw bad(`A path can be at most ${L.path} characters.`, { field: 'path' });
  const parts = raw.split('/');
  if (parts.length > L.segments) throw bad(`A path can have at most ${L.segments} parts (folders and the file name).`, { field: 'path' });
  for (const part of parts) {
    if (part === '.' || part === '..' || !SEGMENT.test(part)) throw bad('Use letters, digits, dot, dash and underscore in a path, starting each part with a letter or digit (no spaces, no "..").', { field: 'path' });
  }
  const ext = parts[parts.length - 1].split('.').pop().toLowerCase();
  if (!parts[parts.length - 1].includes('.') || !WORKSPACE_EXTENSIONS.includes(ext)) {
    throw bad(`The workspace keeps text files only: ${WORKSPACE_EXTENSIONS.map(e => `.${e}`).join(' ')}.`, { field: 'path' });
  }
  return parts.join('/');
}

export class Workspace {
  constructor({ db, now = () => new Date() }) {
    this.db = db;
    this.now = now;
  }

  _stamp() { return this.now().toISOString(); }

  _shape(r, { content = false } = {}) {
    return {
      id: r.id, path: r.path, version: r.version, bytes: Buffer.byteLength(r.content, 'utf8'), locked: Boolean(r.locked), writtenBy: r.written_by, note: r.note,
      createdAt: r.created_at, updatedAt: r.updated_at, ...(content ? { content: r.content } : {}),
    };
  }

  _row(ownerId, companyId, path) {
    const row = this.db.prepare('SELECT * FROM workspace_files WHERE owner_id = ? AND company_id = ? AND path = ?').get(ownerId, companyId, normalizePath(path));
    return row ? plain(row) : null;
  }

  list(ownerId, companyId) {
    return this.db.prepare('SELECT * FROM workspace_files WHERE owner_id = ? AND company_id = ? ORDER BY path').all(ownerId, companyId).map(r => this._shape(plain(r)));
  }

  read(ownerId, companyId, path, { version = null } = {}) {
    const row = this._row(ownerId, companyId, path);
    if (!row) {
      const names = this.list(ownerId, companyId).map(f => f.path).slice(0, 12);
      throw refuse(`There is no file "${String(path).slice(0, 80)}" in the workspace.${names.length ? ` Files: ${names.join(', ')}.` : ''}`, 'no_file', 404);
    }
    if (version === null || Number(version) === row.version) return this._shape(row, { content: true });
    const old = this.db.prepare('SELECT * FROM workspace_versions WHERE file_id = ? AND version = ?').get(row.id, Number(version));
    if (!old) throw refuse(`Version ${Number(version)} of ${row.path} is not kept (the latest is ${row.version}; the last ${L.versions} are kept).`, 'no_version', 404);
    return this._shape({ ...row, ...plain(old), id: row.id, locked: row.locked, updated_at: old.created_at }, { content: true });
  }

  /**
   * Create or replace a file with the COMPLETE new content. An agent cannot change a locked file; the owner can.
   * @param {{ name: string, system?: boolean }} author
   */
  write(ownerId, companyId, author, { path, content, note = '' }) {
    const p = normalizePath(path);
    const text = cleanBlock(content, 'The file', L.bytes, 'content');
    const cleanNote = note ? cleanBlock(note, 'The note', L.note, 'note').replace(/\s+/g, ' ') : null;
    const existing = this._row(ownerId, companyId, p);
    if (existing?.locked && !author.system) throw refuse(`${existing.path} is locked: you can read it, and only the owner can change it. If it should change, say so in #help or propose a norm.`, 'file_locked', 403);
    if (!existing && this.db.prepare('SELECT COUNT(*) AS n FROM workspace_files WHERE company_id = ?').get(companyId).n >= L.files) {
      throw refuse(`The workspace holds at most ${L.files} files. Improve one that exists, or ask the owner to clear some.`, 'workspace_full', 403);
    }
    const stamp = this._stamp();
    return transaction(this.db, () => {
      if (!existing) {
        const id = rid();
        this.db.prepare(
          `INSERT INTO workspace_files (id, owner_id, company_id, path, content, version, locked, written_by, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)`,
        ).run(id, ownerId, companyId, p, text, author.name, cleanNote, stamp, stamp);
        this.db.prepare('INSERT INTO workspace_versions (file_id, version, content, written_by, note, created_at) VALUES (?, 1, ?, ?, ?, ?)').run(id, text, author.name, cleanNote, stamp);
        return this._shape(plain(this.db.prepare('SELECT * FROM workspace_files WHERE id = ?').get(id)));
      }
      const version = existing.version + 1;
      this.db.prepare('UPDATE workspace_files SET content = ?, version = ?, written_by = ?, note = ?, updated_at = ? WHERE id = ?').run(text, version, author.name, cleanNote, stamp, existing.id);
      this.db.prepare('INSERT INTO workspace_versions (file_id, version, content, written_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(existing.id, version, text, author.name, cleanNote, stamp);
      this.db.prepare('DELETE FROM workspace_versions WHERE file_id = ? AND version <= ?').run(existing.id, version - L.versions);
      return this._shape(plain(this.db.prepare('SELECT * FROM workspace_files WHERE id = ?').get(existing.id)));
    });
  }

  /** The versions of a file that are kept, newest first (no content). */
  history(ownerId, companyId, path) {
    const row = this._row(ownerId, companyId, path);
    if (!row) throw missing('file');
    return this.db.prepare('SELECT version, written_by, note, created_at FROM workspace_versions WHERE file_id = ? ORDER BY version DESC').all(row.id)
      .map(v => ({ version: v.version, writtenBy: v.written_by, note: v.note, createdAt: v.created_at }));
  }

  setLocked(ownerId, companyId, path, locked) {
    const row = this._row(ownerId, companyId, path);
    if (!row) throw missing('file');
    this.db.prepare('UPDATE workspace_files SET locked = ? WHERE id = ?').run(locked ? 1 : 0, row.id);
    return this._shape({ ...row, locked: locked ? 1 : 0 });
  }

  remove(ownerId, companyId, path) {
    const row = this._row(ownerId, companyId, path);
    if (!row) throw missing('file');
    this.db.prepare('DELETE FROM workspace_files WHERE id = ?').run(row.id);
    return { removed: true };
  }

  removeCompany(ownerId, companyId) {
    return { removed: Number(this.db.prepare('DELETE FROM workspace_files WHERE owner_id = ? AND company_id = ?').run(ownerId, companyId).changes) };
  }
}
