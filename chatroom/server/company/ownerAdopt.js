/**
 * Bringing companies that a visitor cookie owned under the owner account.
 *
 * Before owner sign-in, a company belonged to a cookie's id. When sign-in is switched on those companies still carry the old id, so nobody who signs
 * in sees them. Two ways to fix that, from the command line (this is operator work: it needs the data folder, not a browser):
 *
 *   1. `owner init --owner-id <old id>` makes the owner under the id the companies already have. Nothing moves. For one owner id, do this.
 *   2. `owner adopt --from <old id>` moves everything an old id owns to the owner's id, for the second and third ids. It prints what it would do
 *      and does nothing unless it is told `--apply`; with it, it first copies everything it will touch into <data>/backup-adopt-<time>/.
 *
 * What an owner id is on disk: `ownerId` in each companies/<id>/company.json; the folder flow/<ownerId>/ and `ownerId` in each flow file inside; and
 * `owner_id` in every table of company.sqlite (the roster, the people's memory, and the Hall). Publishing queues, audit logs and saved sessions are
 * kept by company or room, not by owner, and need nothing. Stop the server first: it keeps companies in memory and would not see the change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isId } from './util.js';
import { PolicyError } from './errors.js';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const listDir = (dir) => { try { return fs.readdirSync(dir); } catch { return []; } };

function openSqlite(file) {
  try {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    return new DatabaseSync(file);
  } catch {
    return null;
  }
}

/** Every table with an owner_id column, and how many rows an owner has in each. */
function ownedRows(db, ownerId) {
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    const columns = db.prepare(`PRAGMA table_info("${name.replace(/"/g, '""')}")`).all();
    if (!columns.some(c => c.name === 'owner_id')) continue;
    const n = db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}" WHERE owner_id = ?`).get(ownerId).n;
    if (n) out[name] = n;
  }
  return out;
}

/** Who owns what in a data folder: owner id -> { companies: [{ id, name }], flows, rows }. */
export function survey(dataDir) {
  const owners = new Map();
  const of = (id) => { if (!owners.has(id)) owners.set(id, { companies: [], flows: 0, rows: {} }); return owners.get(id); };
  for (const id of listDir(path.join(dataDir, 'companies'))) {
    try {
      const c = readJson(path.join(dataDir, 'companies', id, 'company.json'));
      if (isId(c.ownerId)) of(c.ownerId).companies.push({ id: c.id || id, name: c.name || '(unnamed)' });
    } catch { /* not a company folder */ }
  }
  for (const ownerId of listDir(path.join(dataDir, 'flow'))) {
    if (isId(ownerId)) of(ownerId).flows = listDir(path.join(dataDir, 'flow', ownerId)).filter(f => f.endsWith('.json')).length;
  }
  const dbFile = path.join(dataDir, 'company.sqlite');
  if (fs.existsSync(dbFile)) {
    const db = openSqlite(dbFile);
    if (db) {
      try {
        const ids = new Set();
        for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
          if (db.prepare(`PRAGMA table_info("${name}")`).all().some(c => c.name === 'owner_id')) {
            for (const r of db.prepare(`SELECT DISTINCT owner_id FROM "${name}"`).all()) if (isId(r.owner_id)) ids.add(r.owner_id);
          }
        }
        for (const id of ids) of(id).rows = ownedRows(db, id);
      } finally { db.close(); }
    }
  }
  return owners;
}

function checkIds(from, to) {
  if (!isId(from)) throw new PolicyError('--from must be an owner id: 32 lower-case hex characters.', { status: 400, code: 'bad_owner_id', field: 'from' });
  if (!isId(to)) throw new PolicyError('There is no owner to move the companies to. Make one first (owner init).', { status: 409, code: 'no_owner' });
  if (from === to) throw new PolicyError('That id is already the owner.', { status: 409, code: 'same_owner' });
}

/** What would move, without moving it. */
export function planAdoption(dataDir, from, to) {
  checkIds(from, to);
  const mine = survey(dataDir).get(from) || { companies: [], flows: 0, rows: {} };
  return { from, to, companies: mine.companies, flows: mine.flows, rows: mine.rows, nothing: !mine.companies.length && !mine.flows && !Object.keys(mine.rows).length };
}

/** Copy what is about to change, so a mistake can be put back by hand. Returns the folder. */
function backUp(dataDir, from, plan, stamp) {
  // never into a folder that is already there: two moves in the same second must not overwrite each other's copy of the database
  let dest = path.join(dataDir, `backup-adopt-${stamp}`);
  for (let n = 2; fs.existsSync(dest); n += 1) dest = path.join(dataDir, `backup-adopt-${stamp}-${n}`);
  fs.mkdirSync(dest, { recursive: true });
  for (const c of plan.companies) {
    fs.mkdirSync(path.join(dest, 'companies', c.id), { recursive: true });
    fs.copyFileSync(path.join(dataDir, 'companies', c.id, 'company.json'), path.join(dest, 'companies', c.id, 'company.json'));
  }
  const flows = path.join(dataDir, 'flow', from);
  if (fs.existsSync(flows)) fs.cpSync(flows, path.join(dest, 'flow', from), { recursive: true });
  for (const f of ['company.sqlite', 'company.sqlite-wal', 'company.sqlite-shm']) {
    if (fs.existsSync(path.join(dataDir, f))) fs.copyFileSync(path.join(dataDir, f), path.join(dest, f));
  }
  return dest;
}

/**
 * Move everything `from` owns to `to`. All or nothing as far as the database goes (one transaction; a name that the new owner already has in the
 * roster stops it before anything else is changed). Returns what was done and where the backup is.
 */
export function applyAdoption(dataDir, from, to, { now = () => new Date() } = {}) {
  const plan = planAdoption(dataDir, from, to);
  if (plan.nothing) return { ...plan, backup: null, moved: { companies: 0, flows: 0, rows: {} } };
  const stamp = now().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
  const backup = backUp(dataDir, from, plan, stamp);

  // the database first: it is the one step that can refuse (two people with one name in the same roster), and it can be undone
  const rows = {};
  const dbFile = path.join(dataDir, 'company.sqlite');
  if (Object.keys(plan.rows).length) {
    const db = openSqlite(dbFile);
    if (!db) throw new PolicyError('company.sqlite has rows to move and this Node cannot open it (node:sqlite: Node 22.12 needs --experimental-sqlite).', { status: 503, code: 'no_sqlite' });
    try {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const table of Object.keys(plan.rows)) {
          const q = `"${table.replace(/"/g, '""')}"`;
          const r = db.prepare(`UPDATE ${q} SET owner_id = ? WHERE owner_id = ?`).run(to, from);
          rows[table] = Number(r.changes);
        }
        db.exec('COMMIT');
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw new PolicyError(`The roster could not be moved (${String(err.message).slice(0, 160)}). Nothing was changed. The new owner may already have someone with the same name; rename or retire one and run this again.`, { status: 409, code: 'adopt_conflict' });
      }
    } finally { db.close(); }
  }

  for (const c of plan.companies) {
    const file = path.join(dataDir, 'companies', c.id, 'company.json');
    const company = readJson(file);
    company.ownerId = to;
    fs.writeFileSync(file, `${JSON.stringify(company, null, 2)}\n`);
  }

  let flows = 0;
  const fromDir = path.join(dataDir, 'flow', from);
  const toDir = path.join(dataDir, 'flow', to);
  if (fs.existsSync(fromDir)) {
    fs.mkdirSync(toDir, { recursive: true });
    for (const name of listDir(fromDir).filter(f => f.endsWith('.json'))) {
      if (fs.existsSync(path.join(toDir, name))) throw new PolicyError(`flow ${name} exists under both owners; the companies and the roster were moved, move the flows by hand (backup: ${backup}).`, { status: 409, code: 'adopt_conflict' });
      const flow = readJson(path.join(fromDir, name));
      flow.ownerId = to;
      fs.writeFileSync(path.join(toDir, name), `${JSON.stringify(flow, null, 2)}\n`);
      fs.rmSync(path.join(fromDir, name));
      flows += 1;
    }
    if (!listDir(fromDir).length) fs.rmdirSync(fromDir);
  }
  return { ...plan, backup, moved: { companies: plan.companies.length, flows, rows } };
}
