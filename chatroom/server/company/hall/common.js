/**
 * Small helpers the Hall's parts share: cleaning text a person or an agent wrote, and the errors that go with it.
 */
import { PolicyError } from '../errors.js';
import { assertNoSecrets } from '../secrets.js';
import { newId } from '../util.js';

export const rid = () => newId().slice(0, 16);
export const parse = (text, fallback) => { try { return text == null ? fallback : JSON.parse(text); } catch { return fallback; } };
export const bad = (message, extra = {}) => new PolicyError(message, { status: 400, code: 'bad_request', ...extra });
export const refuse = (message, code, status = 409, extra = {}) => new PolicyError(message, { status, code, ...extra });
export const missing = (what) => new PolicyError(`No such ${what}.`, { status: 404, code: `no_${what.replace(/\s+/g, '_')}` });

// Control characters (other than tab, newline) have no place in a message; the last class is the bidirectional and zero-width marks that
// can hide text from a reader. Built from code points so the source holds no invisible characters.
const HIDDEN = new RegExp(`[${[[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x7f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]]
  .map(([a, b]) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`).join('')}]`, 'gu');

/** One line: no line breaks, runs of space collapsed. */
export function cleanLine(value, label, max, field) {
  if (typeof value !== 'string') throw bad(`${label} must be text.`, { field });
  const text = value.replace(HIDDEN, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw bad(`${label} cannot be empty.`, { field });
  if (text.length > max) throw bad(`${label} can be at most ${max} characters (this one is ${text.length}).`, { field });
  assertNoSecrets(text, label, field);
  return text;
}

/** Several lines: line breaks kept, hidden characters removed. */
export function cleanBlock(value, label, max, field, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw bad(`${label} must be text.`, { field });
  const text = value.replace(HIDDEN, '').replace(/\r\n?/g, '\n').trim();
  if (!text && !allowEmpty) throw bad(`${label} cannot be empty.`, { field });
  if (text.length > max) throw bad(`${label} can be at most ${max} characters (this one is ${text.length}).`, { field });
  assertNoSecrets(text, label, field);
  return text;
}

/** Cut text for a digest, at a word where it can, saying that it was cut. */
export function clip(text, max) {
  const t = String(text ?? '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}… [cut; ${t.length - max} more characters]`;
}

/** "3 minutes ago", for what a person reads in a digest. */
export function ago(iso, now = new Date()) {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hours ago`;
  return `${Math.round(h / 24)} days ago`;
}
