// keepAwake: counted holds, the right helper per platform, harmless misuse, and the hook in the workflow engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKeepAwake, holdCommand } from '../keepAwake.js';

process.env.WORKFLOW_DATA_DIR = mkdtempSync(join(tmpdir(), 'workflow-engine-test-'));

function fakeSpawn() {
  const spawned = [];
  const fn = (command, args) => {
    const child = { command, args, killed: false, handlers: {}, on(ev, cb) { this.handlers[ev] = cb; }, kill() { this.killed = true; }, unref() {} };
    spawned.push(child);
    return child;
  };
  fn.spawned = spawned;
  return fn;
}

test('windows holds with SetThreadExecutionState from a hidden PowerShell that ends with this process', () => {
  const cmd = holdCommand('win32', 4242);
  assert.equal(cmd.command, 'powershell.exe');
  assert.ok(cmd.args.includes('Hidden'));
  const script = cmd.args.at(-1);
  assert.match(script, /SetThreadExecutionState\(0x80000001\)/);   // ES_CONTINUOUS | ES_SYSTEM_REQUIRED
  assert.match(script, /Get-Process -Id 4242/);
});

test('macOS uses caffeinate bound to this process; other platforms do nothing', () => {
  assert.deepEqual(holdCommand('darwin', 7), { command: 'caffeinate', args: ['-i', '-w', '7'] });
  assert.equal(holdCommand('linux'), null);
});

test('the first hold starts the helper, the last release stops it, and holds in between do not start more', () => {
  const spawnFn = fakeSpawn();
  const keepAwake = createKeepAwake({ spawnFn, platform: 'win32', env: {}, pid: 1 });
  const a = keepAwake('a');
  const b = keepAwake('b');
  assert.equal(spawnFn.spawned.length, 1);
  assert.deepEqual(keepAwake.status(), { holds: 2, helperRunning: true });
  a();
  assert.equal(spawnFn.spawned[0].killed, false, 'one hold is still open');
  b();
  assert.equal(spawnFn.spawned[0].killed, true);
  assert.deepEqual(keepAwake.status(), { holds: 0, helperRunning: false });
  keepAwake()();                                  // and it can be taken again
  assert.equal(spawnFn.spawned.length, 2);
});

test('releasing twice does not release someone else\'s hold', () => {
  const spawnFn = fakeSpawn();
  const keepAwake = createKeepAwake({ spawnFn, platform: 'win32', env: {}, pid: 1 });
  const a = keepAwake();
  keepAwake();
  a(); a(); a();
  assert.equal(keepAwake.status().holds, 1);
  assert.equal(spawnFn.spawned[0].killed, false);
});

test('SYNTH_KEEP_AWAKE=0 and the node test runner turn it off; an unavailable helper never throws', () => {
  const off = fakeSpawn();
  createKeepAwake({ spawnFn: off, platform: 'win32', env: { SYNTH_KEEP_AWAKE: '0' } })()();
  createKeepAwake({ spawnFn: off, platform: 'win32', env: { NODE_TEST_CONTEXT: 'child-v8' } })()();
  assert.equal(off.spawned.length, 0);
  const broken = createKeepAwake({ spawnFn: () => { throw new Error('ENOENT'); }, platform: 'win32', env: {} });
  const release = broken('x');
  assert.doesNotThrow(release);
  assert.equal(broken.status().helperRunning, false);
  const noHelperPlatform = createKeepAwake({ spawnFn: off, platform: 'linux', env: {} });
  noHelperPlatform()();
  assert.equal(off.spawned.length, 0);
});

test('a helper that exits on its own does not leave the module thinking it is running', () => {
  const spawnFn = fakeSpawn();
  const keepAwake = createKeepAwake({ spawnFn, platform: 'darwin', env: {}, pid: 1 });
  const release = keepAwake();
  spawnFn.spawned[0].handlers.exit();
  assert.equal(keepAwake.status().helperRunning, false);
  release();
  assert.equal(keepAwake.status().holds, 0);
});

test('the workflow engine holds the machine awake for the length of a run, and lets go when it fails too', async () => {
  const { workflowEngine } = await import('../workflowEngine.js');
  const { synthClient } = await import('../synthClient.js');
  const events = [];
  workflowEngine.configure({ mediaStore: { add() {}, get() { return null; } }, keepAwake: (reason) => { events.push(`hold ${reason}`); return () => events.push('release'); } });
  synthClient.generateText = async () => ({ text: 'ok' });
  // workflow_complete is broadcast just before the engine releases its hold, so give the release a moment
  const finish = async (def) => {
    await new Promise(resolve => workflowEngine.submit(def, { broadcast: (e) => { if (e === 'workflow_complete' || e === 'workflow_error') resolve(); } }));
    await new Promise(r => setTimeout(r, 50));
  };
  await finish({ name: 'fine', steps: [{ id: 'a', type: 'synth_text', params: { prompt: 'x' } }] });
  assert.deepEqual(events, ['hold workflow: fine', 'release']);
  events.length = 0;
  synthClient.generateText = async () => { throw new Error('boom'); };
  await finish({ name: 'broken', steps: [{ id: 'a', type: 'synth_text', params: { prompt: 'x' } }] });
  assert.deepEqual(events, ['hold workflow: broken', 'release']);
  workflowEngine.configure({ keepAwake: () => { throw new Error('no hold available'); } });
  synthClient.generateText = async () => ({ text: 'ok' });
  await finish({ name: 'unheld', steps: [{ id: 'a', type: 'synth_text', params: { prompt: 'x' } }] });   // a failing hook must not stop the work
});
