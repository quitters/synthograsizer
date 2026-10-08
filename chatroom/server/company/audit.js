/**
 * The audit log: what the safety layer did, one JSON line at a time.
 * ──────────────────────────────────────────────────────────────────
 * Append-only, per company, at <data>/companies/<id>/audit.jsonl. It records DECISIONS (a turn was withheld, a tool was refused, a
 * proposal was approved, a ceiling was clamped) with ids, rule ids and short reasons, and never the content they were about:
 * a log that kept withheld text would be a store of exactly what the layer exists to keep out. Strings are cut short, and a few
 * field names that mean "the content itself" are dropped on the way in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isId } from './util.js';

const MAX_STRING = 300;
const MAX_ITEMS = 20;
const NEVER_LOGGED = new Set(['content', 'text', 'body', 'bio', 'prompt', 'message', 'data', 'imageData', 'quote']);

function tidy(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map(v => tidy(v, depth + 1));
  if (typeof value === 'object' && depth < 3) {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!NEVER_LOGGED.has(k)) out[k] = tidy(v, depth + 1);
    return out;
  }
  return undefined;
}

export class AuditLog {
  /** @param {{ rootDir: string, now?: () => Date }} options */
  constructor({ rootDir, now = () => new Date() }) {
    this.rootDir = rootDir;
    this.now = now;
  }

  _file(companyId) {
    if (!isId(companyId)) throw new Error('bad company id');
    return path.join(this.rootDir, 'companies', companyId, 'audit.jsonl');
  }

  /** @param {string} companyId @param {{ type: string } & Record<string, unknown>} entry */
  append(companyId, entry) {
    const file = this._file(companyId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const line = JSON.stringify({ ts: this.now().toISOString(), ...tidy(entry) });
    fs.appendFileSync(file, `${line}\n`);
  }

  /** The most recent entries, oldest first. */
  read(companyId, { limit = 200, type = null } = {}) {
    let text;
    try { text = fs.readFileSync(this._file(companyId), 'utf8'); } catch { return []; }
    const entries = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); if (!type || e.type === type) entries.push(e); } catch { /* a torn last line is skipped */ }
    }
    return entries.slice(-Math.max(1, Math.min(limit, 5000)));
  }
}
