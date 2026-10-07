/**
 * keepAwake — ask the operating system not to put the machine to sleep while long work runs.
 *
 *   import { keepAwake } from 'workflow-engine';
 *   const release = keepAwake('chat session');   // returns a function; call it when the work is done
 *   try { ... } finally { release(); }
 *
 * Why: on 2026-10-07 a laptop slept for about two hours in the middle of a batch. Time limits fired after two messages, a Veo
 * call reported 7,300 seconds and another failed with "Server disconnected". Long jobs here (video renders, a chat session,
 * a workflow with Veo steps) should hold the machine awake for exactly as long as they run.
 *
 * Holds are counted: the first acquires, the last release lets go, and releasing twice is harmless. Windows: a hidden PowerShell
 * calls SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) and waits until this process is gone. macOS: `caffeinate -i`.
 * Elsewhere (a server in a data centre does not sleep) it does nothing. SYNTH_KEEP_AWAKE=0 turns it off, and it is off inside
 * `node --test` (so a test suite does not start helper processes). It never throws: if the helper cannot start, work simply
 * proceeds without the hold.
 */
import { spawn } from 'node:child_process';

const WINDOWS_SCRIPT = (pid) =>
  "Add-Type -Namespace W -Name P -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'; "
  + '[void][W.P]::SetThreadExecutionState(0x80000001); '
  + `while (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 5 }`;

/** The command that holds the machine awake on this platform, or null when there is nothing to do. */
export function holdCommand(platform = process.platform, pid = process.pid) {
  if (platform === 'win32') return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', WINDOWS_SCRIPT(pid)] };
  if (platform === 'darwin') return { command: 'caffeinate', args: ['-i', '-w', String(pid)] };
  return null;
}

/**
 * Build a keepAwake function. The defaults are the real thing; tests pass their own spawn and platform.
 * @param {{ spawnFn?: Function, platform?: string, env?: object, pid?: number }} [deps]
 */
export function createKeepAwake({ spawnFn = spawn, platform = process.platform, env = process.env, pid = process.pid } = {}) {
  let holds = 0;
  let child = null;
  const disabled = () => env.SYNTH_KEEP_AWAKE === '0' || !!env.NODE_TEST_CONTEXT;

  function acquire() {
    holds += 1;
    if (holds > 1 || child) return;
    const cmd = holdCommand(platform, pid);
    if (!cmd) return;
    try {
      child = spawnFn(cmd.command, cmd.args, { stdio: 'ignore', windowsHide: true });
      child.on?.('error', () => { child = null; });    // the helper is missing or refused: carry on without it
      child.on?.('exit', () => { child = null; });
      child.unref?.();
    } catch {
      child = null;
    }
  }

  function release() {
    holds = Math.max(0, holds - 1);
    if (holds === 0 && child) {
      try { child.kill(); } catch { /* already gone */ }
      child = null;
    }
  }

  function keepAwake(_reason = '') {
    if (disabled()) return () => {};
    acquire();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      release();
    };
  }
  keepAwake.status = () => ({ holds, helperRunning: !!child });
  return keepAwake;
}

export const keepAwake = createKeepAwake();
