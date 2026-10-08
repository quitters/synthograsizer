/**
 * SQLite for the roster, through Node's built-in node:sqlite.
 * ────────────────────────────────────────────────────────────
 * No dependency to install. Node 22.5 to 22.12 needs `--experimental-sqlite` (the npm scripts pass it); 22.13 and later need nothing. Where
 * it is missing, the roster says so (a 503 with the reason) and everything else in the server works as it did.
 *
 * Migrations are idempotent and numbered, the pattern of scripts/film_factory/db.py: each one runs once, in order, inside a transaction, and
 * PRAGMA user_version records how far a database has got, so opening an old file brings it up to date and opening a current one changes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PolicyError } from '../errors.js';

let Database = null;
let loadError = null;
try {
  ({ DatabaseSync: Database } = await import('node:sqlite'));
} catch (err) {
  loadError = err;
}

export const sqliteAvailable = () => Boolean(Database);

export function sqliteProblem() {
  return 'The roster needs SQLite, which this Node does not have turned on: use Node 22.13 or later, or start the server with --experimental-sqlite (npm run server does).';
}

/** A plain object from a row (the driver hands back rows without a prototype). */
export const plain = (row) => (row ? { ...row } : null);

/**
 * Open (creating if needed) a database file and bring it up to date.
 * @param {string} file  a path, or ':memory:'
 * @param {{ version: number, name: string, sql: string }[]} migrations  in increasing order of version
 */
export function openDatabase(file, migrations) {
  if (!Database) throw new PolicyError(sqliteProblem(), { status: 503, code: 'no_sqlite' });
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  migrate(db, migrations);
  return db;
}

/** The version a database is at. */
export const versionOf = (db) => db.prepare('PRAGMA user_version').get().user_version;

/**
 * Run every migration newer than the database. Each is all-or-nothing.
 * @returns {number[]} the versions that ran (empty when the database was already current)
 */
export function migrate(db, migrations) {
  const ran = [];
  let current = versionOf(db);
  for (const m of migrations) {
    if (m.version <= current) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${Number(m.version)}`);
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* nothing open */ }
      throw new Error(`migration ${m.version} (${m.name}) failed: ${err.message}`);
    }
    current = m.version;
    ran.push(m.version);
  }
  return ran;
}

/** Run `fn` in a transaction: all of it or none. */
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* nothing open */ }
    throw err;
  }
}

export { loadError as sqliteLoadError };
