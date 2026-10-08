/**
 * The owner's console: served as plain files under a strict policy, and written so that it cannot put HTML on the page. It shows words that models and
 * other people wrote, so a name like <img onerror=...> has to stay a name.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflowDir = mkdtempSync(join(tmpdir(), 'chatroom-console-wf-'));
process.env.WORKFLOW_DATA_DIR = workflowDir;
process.env.WORKFLOW_TRACES_DIR = join(workflowDir, 'traces');

const { createApp, CONSOLE_CSP } = await import('./app.js');
const { makeServices } = await import('./company/testKit.js');

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'company');
const kit = makeServices();
let server, base;

before(async () => {
  server = createApp({ company: kit.services }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections?.(); server.close(); kit.cleanup(); rmSync(workflowDir, { recursive: true, force: true }); });

test('the console is served with a policy that lets nothing but its own script and sheet run', async () => {
  for (const [url, type] of [['/company/', /text\/html/], ['/company/console.js', /javascript/], ['/company/console.css', /text\/css/]]) {
    const res = await fetch(base + url);
    assert.equal(res.status, 200, url);
    assert.match(res.headers.get('content-type'), type, url);
    assert.equal(res.headers.get('content-security-policy'), CONSOLE_CSP, url);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  }
  assert.match(CONSOLE_CSP, /default-src 'none'/);
  assert.match(CONSOLE_CSP, /script-src 'self'(;|$)/);
  assert.doesNotMatch(CONSOLE_CSP, /unsafe-inline|unsafe-eval|\*/);
  assert.match(CONSOLE_CSP, /frame-ancestors 'none'/);
  assert.match(CONSOLE_CSP, /connect-src 'self'/);
});

test('only the console\'s own files are served under /company, and nothing outside them', async () => {
  assert.equal((await fetch(`${base}/company/nope.js`)).status, 404);
  assert.equal((await fetch(`${base}/company/../app.js`)).status, 404);
  assert.equal((await fetch(`${base}/company/%2e%2e/app.js`)).status, 404);
  assert.equal((await fetch(`${base}/company/.env`)).status, 404);
  const html = await (await fetch(`${base}/company/`)).text();
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i, 'no inline script');
  assert.doesNotMatch(html, /\son\w+\s*=/i, 'no inline handlers');
  assert.doesNotMatch(html, /<style/i, 'no inline style');
  assert.doesNotMatch(html, /https?:\/\//i, 'nothing is loaded from anywhere else');
});

test('the console cannot put HTML on the page: it has no way to set markup, run strings, or load code', () => {
  const js = fs.readFileSync(path.join(dir, 'console.js'), 'utf8');
  for (const banned of [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\b/, /setTimeout\s*\(\s*['"`]/, /setInterval\s*\(\s*['"`]/, /importScripts/, /\.srcdoc\b/, /createContextualFragment/, /DOMParser/, /\bimport\s*\(/]) {
    assert.doesNotMatch(js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), banned, String(banned));
  }
  // the only thing it builds elements with refuses markup: strings become text nodes
  assert.match(js, /document\.createTextNode\(String\(kid\)\)/);
  const css = fs.readFileSync(path.join(dir, 'console.css'), 'utf8');
  assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/i, 'the stylesheet loads nothing from elsewhere');
});

test('the console\'s builder turns a hostile name into text', async () => {
  // run the builder in a minimal DOM: h() is the one place elements are made, so what it does with a string is what the whole page does
  const js = fs.readFileSync(path.join(dir, 'console.js'), 'utf8');
  const start = js.indexOf('function h(tag');
  const end = js.indexOf('const money');
  assert.ok(start > 0 && end > start);
  const created = [];
  const document = {
    createElement: (tag) => { const el = { tag, children: [], attrs: {}, listeners: {}, className: '', setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, f) { this.listeners[k] = f; }, append(...kids) { this.children.push(...kids); } }; created.push(el); return el; },
    createTextNode: (text) => ({ nodeType: 3, text }),
  };
  class Node {}
  const h = new Function('document', 'Node', `${js.slice(start, end)}; return h;`)(document, Node);
  const el = h('div', { class: 'x' }, '<img src=x onerror=alert(1)>', 7, null, false, ['<b>', undefined]);
  assert.deepEqual(el.children.map(c => c.text), ['<img src=x onerror=alert(1)>', '7', '<b>']);
  assert.ok(el.children.every(c => c.nodeType === 3), 'every string became a text node');
  assert.equal(el.className, 'x');
});
