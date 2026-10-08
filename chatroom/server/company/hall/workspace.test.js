import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable } from '../flow/sqlite.js';
import { normalizePath, WORKSPACE_EXTENSIONS } from './workspace.js';
import { world, clock } from './hallKit.js';
import { HALL_LIMITS } from './limits.js';
import { newId } from '../util.js';

/** The workspace: shared text files that outlast a session, versioned, bounded, lockable by the owner. */
const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';
const L = HALL_LIMITS.workspace;

test('a path is made plain and safe; anything that could reach outside, hide, or is not text is refused', () => {
  assert.equal(normalizePath('notes/style.md'), 'notes/style.md');
  assert.equal(normalizePath('  ./README.md '), 'README.md');
  assert.equal(normalizePath('/notes//a.txt'), 'notes/a.txt');
  assert.equal(normalizePath('notes\\a.json'), 'notes/a.json');
  for (const bad of ['', '   ', '../secret.md', 'a/../b.md', '.hidden.md', 'a b.md', 'a/b/c/d/e.md', 'x'.repeat(L.path + 1) + '.md', 'noext', 'script.exe', 'photo.png', 'a:b.md', 'a/\u0000.md', 5, null]) {
    assert.throws(() => normalizePath(bad), (e) => e.status === 400 && e.field === 'path', JSON.stringify(bad)?.slice(0, 40));
  }
  assert.ok(WORKSPACE_EXTENSIONS.includes('md') && !WORKSPACE_EXTENSIONS.includes('exe'));
});

test('a file is written whole, versioned on every write, and read back; the earlier versions are kept up to a point', { skip }, () => {
  const w = world();
  const ws = w.hall.workspace;
  const zayd = { name: 'Zayd Siddiqui' };
  const first = ws.write(w.ownerId, w.companyId, zayd, { path: 'checklists/engine.md', content: '- six variables\n- twelve values each', note: 'first draft' });
  assert.deepEqual([first.path, first.version, first.writtenBy, first.note, first.locked, first.bytes], ['checklists/engine.md', 1, 'Zayd Siddiqui', 'first draft', false, 36]);
  clock.tick();
  const second = ws.write(w.ownerId, w.companyId, { name: 'Kasia' }, { path: 'CHECKLISTS/Engine.md', content: '- six variables\n- twelve values each\n- no captions', note: 'added captions' });
  assert.deepEqual([second.version, second.writtenBy, second.id === first.id], [2, 'Kasia', true], 'the path is not case-sensitive: same file');
  assert.equal(ws.read(w.ownerId, w.companyId, 'checklists/engine.md').content, '- six variables\n- twelve values each\n- no captions');
  assert.equal(ws.read(w.ownerId, w.companyId, 'checklists/engine.md', { version: 1 }).content, '- six variables\n- twelve values each');
  assert.deepEqual(ws.history(w.ownerId, w.companyId, 'checklists/engine.md').map(v => [v.version, v.writtenBy]), [[2, 'Kasia'], [1, 'Zayd Siddiqui']]);
  assert.throws(() => ws.read(w.ownerId, w.companyId, 'checklists/engine.md', { version: 9 }), (e) => e.code === 'no_version');

  for (let i = 0; i < L.versions + 3; i++) ws.write(w.ownerId, w.companyId, zayd, { path: 'checklists/engine.md', content: `revision ${i}` });
  const kept = ws.history(w.ownerId, w.companyId, 'checklists/engine.md');
  assert.equal(kept.length, L.versions);
  assert.equal(kept[0].version, 2 + L.versions + 3);
  assert.throws(() => ws.read(w.ownerId, w.companyId, 'checklists/engine.md', { version: 1 }), (e) => e.code === 'no_version', 'the oldest were let go');
  w.roster.close();
});

test('a write is checked: size, secrets, empty, the note, and a missing file says what files there are', { skip }, () => {
  const w = world();
  const ws = w.hall.workspace;
  const put = (over) => ws.write(w.ownerId, w.companyId, { name: 'Zayd' }, { path: 'a.md', content: 'text', ...over });
  assert.throws(() => put({ content: '' }), (e) => e.status === 400);
  assert.throws(() => put({ content: 'x'.repeat(L.bytes + 1) }), (e) => /at most 60000/.test(e.message));
  assert.throws(() => put({ content: 'key AIzaSyA1234567890abcdefghijklmnopqrstuvw' }), (e) => e.code === 'secret_in_text');
  assert.throws(() => put({ note: 'n'.repeat(L.note + 1) }), (e) => e.status === 400);
  assert.throws(() => put({ path: '../escape.md' }), (e) => e.field === 'path');
  assert.equal(put({ note: ' two\nlines ' }).note, 'two lines');
  assert.throws(() => ws.read(w.ownerId, w.companyId, 'missing.md'), (e) => e.code === 'no_file' && /Files: a\.md/.test(e.message));
  assert.deepEqual(ws.list(w.ownerId, w.companyId).map(f => f.path), ['a.md']);
  w.roster.close();
});

test('a locked file can be read by everyone and changed only by the owner; only the owner locks, unlocks and removes', { skip }, () => {
  const w = world();
  const ws = w.hall.workspace;
  ws.write(w.ownerId, w.companyId, { name: 'Owner', system: true }, { path: 'README.md', content: 'How we work.' });
  ws.setLocked(w.ownerId, w.companyId, 'readme.md', true);
  assert.equal(ws.read(w.ownerId, w.companyId, 'README.md').locked, true);
  assert.throws(() => ws.write(w.ownerId, w.companyId, { name: 'Zayd' }, { path: 'README.md', content: 'rewritten' }), (e) => e.code === 'file_locked' && /only the owner can change it/.test(e.message));
  assert.equal(ws.write(w.ownerId, w.companyId, { name: 'Owner', system: true }, { path: 'README.md', content: 'How we work, edited.' }).version, 2);
  ws.setLocked(w.ownerId, w.companyId, 'README.md', false);
  assert.equal(ws.write(w.ownerId, w.companyId, { name: 'Zayd' }, { path: 'README.md', content: 'now open' }).version, 3);
  assert.deepEqual(ws.remove(w.ownerId, w.companyId, 'README.md'), { removed: true });
  assert.throws(() => ws.remove(w.ownerId, w.companyId, 'README.md'), (e) => e.status === 404);
  w.roster.close();
});

test('a company keeps only so many files; improving one is always allowed; another owner or company sees none', { skip }, () => {
  const w = world();
  const ws = w.hall.workspace;
  const zayd = { name: 'Zayd' };
  for (let i = 0; i < L.files; i++) ws.write(w.ownerId, w.companyId, zayd, { path: `f${i}.txt`, content: 'x' });
  assert.throws(() => ws.write(w.ownerId, w.companyId, zayd, { path: 'one-too-many.txt', content: 'x' }), (e) => e.code === 'workspace_full');
  assert.equal(ws.write(w.ownerId, w.companyId, zayd, { path: 'f0.txt', content: 'better' }).version, 2);
  assert.equal(ws.list(newId(), w.companyId).length, 0);
  assert.equal(ws.list(w.ownerId, newId()).length, 0);
  assert.deepEqual(ws.removeCompany(w.ownerId, w.companyId), { removed: L.files });
  assert.equal(w.roster.db.prepare('SELECT COUNT(*) AS n FROM workspace_versions').get().n, 0, 'the versions go with the files');
  w.roster.close();
});
