/* cdp.mjs — tiny CDP client shared by the hosted capture scripts. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function attach(port, matchUrl) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page' && (!matchUrl || (t.url || '').includes(matchUrl)))
            || targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target on port ' + port);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  };
  const send = (method, params = {}) => {
    const n = ++id; ws.send(JSON.stringify({ id: n, method, params }));
    return new Promise((res, rej) => pending.set(n, { resolve: res, reject: rej }));
  };
  await send('Page.enable'); await send('Runtime.enable');

  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', {
      expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async (dir, name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(dir, `${name}.png`), Buffer.from(data, 'base64'));
    return name;
  };
  return { send, evaluate, shot, close: () => ws.close(), url: page.url };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
