/* capture2.mjs — second pass. Adds the scenes the first pass missed, and closes
 * modals properly: the Templates picker is NOT a .studio-modal, so the first
 * pass left it open underneath everything and every later shot was polluted.
 * Escape now closes modals (2026-07-27 a11y work), so that is the cleanup path.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = 'http://localhost:8000/synthograsizer/';
const OUT = process.argv[2] || './shots';
const PROFILE = join(tmpdir(), 'synth-manual2-' + Date.now());
const PORT = 9334;
const W = 1600, H = 1000;

mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--force-device-scale-factor=1',
  'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0; const pending = new Map();
const send = (method, params = {}) => {
  const id = ++msgId; ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
};

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = t.find(x => x.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        ws.onmessage = ev => {
          const m = JSON.parse(ev.data);
          if (m.id && pending.has(m.id)) {
            const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
            m.error ? reject(new Error(m.error.message)) : resolve(m.result);
          }
        };
        return;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools');
}

const evaluate = async expr => {
  const r = await send('Runtime.evaluate', {
    expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('  saved', name + '.png');
}

/* Close everything. Escape handles the studio modals; the Templates picker and
 * the p5 panel need their own controls. Belt and braces on purpose — a leaked
 * modal silently poisons every screenshot after it. */
const CLOSE_ALL = `
  document.querySelectorAll('.studio-modal.active .studio-close-modal').forEach(b=>b.click());
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  const tm=[...document.querySelectorAll('.modal, .template-modal, [class*="modal"]')]
    .filter(m=>/templates/i.test(m.innerText||'') && m.offsetParent!==null);
  tm.forEach(m=>{ const x=m.querySelector('button'); if(x) x.click(); });
  await new Promise(r=>setTimeout(r,350));`;

const byText = (sel, text) => `
  const e=[...document.querySelectorAll(${JSON.stringify(sel)})]
    .find(x=>(x.textContent||'').toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
  if(!e) return 'NOT FOUND ${text}'; e.click(); return 'ok';`;

const openTool = id => `${CLOSE_ALL}
  const b=document.getElementById(${JSON.stringify(id)});
  if(!b) return 'NO BUTTON ${id}'; b.click(); return 'opened';`;

const scenes = [
  ['01-perform-first-run', `${CLOSE_ALL} return 'default';`, 1200],
  ['02-templates-picker',  `${CLOSE_ALL} document.getElementById('template-button').click(); return 'ok';`, 900],
  ['03-studio-mode',       `${CLOSE_ALL} ${byText('.mode-toggle-btn,.layout-btn,button', 'studio')}`, 1500],
  ['04-knobs',             byText('.mode-toggle-btn', 'knobs'), 900],
  ['05-dpad',              byText('.mode-toggle-btn', 'd-pad'), 900],
  ['06-image-studio',      openTool('studio-image-btn'), 1300],
  ['07-smart-transform',   openTool('studio-transform-btn'), 1300],
  ['08-workflows-grid',    openTool('studio-workflow-btn'), 2500],
  ['09-workflow-params',   `const c=document.querySelectorAll('.wfr-template-card');
                            if(!c.length) return 'no cards'; c[0].click(); return 'ok';`, 1200],
  ['10-agent-studio',      openTool('studio-agent-btn'), 1600],
  ['11-glitcher-studio',   openTool('studio-glitcher-btn'), 2200],
  ['12-batch-generator',   openTool('studio-batch-btn'), 1300],
  ['13-settings',          openTool('studio-settings-btn'), 1300],
  ['14-p5-canvas',         `${CLOSE_ALL} document.getElementById('p5-run-main-btn').click(); return 'ok';`, 3000],
  ['15-composer-mode',     `document.getElementById('p5-close-v6')?.click(); await new Promise(r=>setTimeout(r,400));
                            ${byText('.mode-toggle-btn,.layout-btn,button', 'composer')}`, 2200],
  ['16-perform-mode',      byText('.mode-toggle-btn,.layout-btn,button', 'perform'), 1600],
];

(async () => {
  await connect();
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: APP });
  await sleep(4500);

  for (const [name, expr, wait] of scenes) {
    let r; try { r = await evaluate(expr); } catch (e) { r = 'ERR ' + e.message.slice(0, 60); }
    await sleep(wait);
    console.log(name, '->', r);
    await shot(name);
  }

  await send('Page.navigate', { url: APP + 'display.html' });
  await sleep(2500); await shot('17-display-window');
  await send('Page.navigate', { url: 'http://localhost:8000/' });
  await sleep(2200); await shot('18-hub');
  await send('Page.navigate', { url: 'http://localhost:8000/glitcher/' });
  await sleep(3000); await shot('19-glitcher-standalone');

  ws.close(); chrome.kill(); await sleep(400);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  console.log('\ndone ->', OUT); process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); try { chrome.kill(); } catch {} process.exit(1); });
