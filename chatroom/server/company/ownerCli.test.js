/**
 * The owner command (scripts/owner.mjs), run as a person would run it: against a data folder, with the output read as text. Bringing a cookie's companies
 * under a Google account that has signed in, by its email address; and a key owner made under the id that already owns them.
 */
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCompanyServices } from './index.js';
import { markerClassifier, tempDir } from './testKit.js';
import { newId } from './util.js';
import { ownerIdForGoogle } from './googleAuth.js';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'owner.mjs');
const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const dir = () => { const d = tempDir(); dirs.push(d); return d; };
const run = (dataDir, ...args) => spawnSync(process.execPath, ['--experimental-sqlite', '--no-warnings', script, ...args, '--data', dataDir], { encoding: 'utf8' });

function oldCompany(dataDir, old) {
  const s = createCompanyServices({ dataDir, env: {}, classify: markerClassifier() });
  const company = s.store.create(old, { name: 'Tide Pool Works', departments: ['Desk'] });
  s.close();
  return company;
}

test('status lists the Google accounts that have signed in and who owns what', () => {
  const d = dir();
  const old = newId();
  const company = oldCompany(d, old);
  const g = ownerIdForGoogle('sub-me');
  fs.mkdirSync(path.join(d, 'owner'), { recursive: true });
  fs.writeFileSync(path.join(d, 'owner', 'accounts.json'), JSON.stringify({ version: 1, accounts: { [g]: { email: 'me@example.com', firstSeen: 'a', lastSeen: 'b' } } }));
  const out = run(d, 'status').stdout;
  assert.match(out, new RegExp(`me@example.com\\s+${g}`));
  assert.match(out, new RegExp(`${old}[\\s\\S]*Tide Pool Works \\(${company.id.slice(0, 8)}\\)`));
});

test('adopt --to-email moves the companies to the Google account (a dry run first, then --apply), by the address however it is cased', () => {
  const d = dir();
  const old = newId();
  const company = oldCompany(d, old);
  const g = ownerIdForGoogle('sub-me');
  fs.mkdirSync(path.join(d, 'owner'), { recursive: true });
  fs.writeFileSync(path.join(d, 'owner', 'accounts.json'), JSON.stringify({ version: 1, accounts: { [g]: { email: 'me@example.com', firstSeen: 'a', lastSeen: 'b' } } }));

  const unknown = run(d, 'adopt', '--from', old, '--to-email', 'stranger@example.com');
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /No Google account stranger@example.com has signed in/);

  const dry = run(d, 'adopt', '--from', old, '--to-email', 'ME@Example.com');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, new RegExp(`Would move to ${g}`));
  assert.match(dry.stdout, /Tide Pool Works/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'companies', company.id, 'company.json'), 'utf8')).ownerId, old, 'a dry run changes nothing');

  const done = run(d, 'adopt', '--from', old, '--to-email', 'me@example.com', '--apply');
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /Moved 1 company/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'companies', company.id, 'company.json'), 'utf8')).ownerId, g);
  assert.ok(fs.readdirSync(d).some(f => f.startsWith('backup-adopt-')), 'and a backup was taken');
});

test('with no key owner and no target, adopt says what to give; init makes the key owner under the old id and never prints the key', () => {
  const d = dir();
  const old = newId();
  oldCompany(d, old);
  const nowhere = run(d, 'adopt', '--from', old);
  assert.equal(nowhere.status, 1);
  assert.match(nowhere.stderr, /--to-email|--to <owner id>|make a key owner first/);
  const init = run(d, 'init', '--owner-id', old);
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, new RegExp(`The owner is ${old}`));
  const key = fs.readFileSync(path.join(d, 'owner', 'owner.key'), 'utf8').trim();
  assert.ok(!init.stdout.includes(key) && !init.stderr.includes(key), 'the key is in its file, not in the output');
  assert.equal(run(d, 'init').status, 1, 'a second init refuses');
});
