/* hosted_launch.mjs — start a VISIBLE Chrome with its own throwaway profile and a
 * debugging port, then get out of the way so the operator can sign in themselves.
 *
 * Why not reuse the extension's already-signed-in tab: the extension cannot write
 * screenshots to disk (verified — save_to_disk produced no local file anywhere
 * under the user profile), and a PDF needs real files.
 *
 * Why not copy the real Chrome profile: that means copying live session cookies
 * and saved credentials around the filesystem. Asking the operator to sign in
 * once, in a window they can see, costs one click and touches nothing of theirs.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
const PROFILE = join(tmpdir(), 'synth-hosted-capture');
mkdirSync(PROFILE, { recursive: true });

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--window-size=1600,1000',
  '--no-first-run', '--no-default-browser-check',
  'https://www.synthograsizer.com/',
], { detached: true, stdio: 'ignore' });
chrome.unref();

console.log(`Chrome launched (pid ${chrome.pid}) on debugging port ${PORT}`);
console.log(`Throwaway profile: ${PROFILE}`);
console.log('\nSign in in that window, then the capture script can attach.');
process.exit(0);
