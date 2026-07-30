/* Signed-in (free-tier, non-admin) surfaces of the hosted service.
 *
 * PRIVACY: the account email is replaced with a neutral placeholder in the DOM
 * immediately before every screenshot, so it is never written to a PNG at all —
 * rather than captured and blurred afterwards, which leaves the real value in
 * the file's history and in any intermediate copy.
 */
import { mkdirSync } from 'node:fs';
import { attach, sleep } from './cdp.mjs';

const OUT = './shots_hosted';
mkdirSync(OUT, { recursive: true });
const c = await attach(9335, 'synthograsizer');
await c.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

/* Swap the real address for a placeholder everywhere it is rendered. Walks text
 * nodes and also input values / title attributes, because the account menu uses
 * more than one of those. */
const REDACT = `
  const RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g;
  const SAFE = 'you@example.com';
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits = [];
  while (w.nextNode()) if (RE.test(w.currentNode.nodeValue)) hits.push(w.currentNode);
  hits.forEach(n => { n.nodeValue = n.nodeValue.replace(RE, SAFE); });
  document.querySelectorAll('input,textarea').forEach(el => {
    if (el.value && RE.test(el.value)) el.value = el.value.replace(RE, SAFE);
  });
  document.querySelectorAll('[title]').forEach(el => {
    if (RE.test(el.title)) el.title = el.title.replace(RE, SAFE);
  });
  return hits.length;`;

const CLOSE = `
  document.querySelectorAll('.studio-modal.active .studio-close-modal').forEach(b=>b.click());
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await new Promise(r=>setTimeout(r,400));`;   // NO return — this is a prefix, not a scene

async function scene(name, expr, wait = 1400) {
  let r; try { r = await c.evaluate(expr); } catch (e) { r = 'ERR ' + e.message.slice(0, 70); }
  await sleep(wait);
  const redacted = await c.evaluate(REDACT);
  await c.shot(OUT, name);
  console.log(`${name} -> ${r}${redacted ? `  [redacted ${redacted} email node(s)]` : ''}`);
}

const clickText = (sel, t) => `
  const e=[...document.querySelectorAll(${JSON.stringify(sel)})]
    .find(x=>(x.textContent||'').toLowerCase().includes(${JSON.stringify(t.toLowerCase())}));
  if(!e) return 'NOT FOUND'; e.click(); return 'ok';`;

await c.send('Page.navigate', { url: 'https://www.synthograsizer.com/synthograsizer/' });
await sleep(5000);

const me = await c.evaluate(`
  const r = await fetch('/api/me'); if(!r.ok) return 'SIGNED OUT';
  const m = await r.json();
  return JSON.stringify({credits:m.credits?.balance, admin:m.admin, storage:m.storage});`);
console.log('account:', me);
if (me === 'SIGNED OUT') { console.log('\nABORT: not signed in.'); c.close(); process.exit(2); }

await scene('s1-signed-in-perform', `return 'as loaded';`, 1200);
await scene('s2-studio-mode', clickText('.mode-toggle-btn,.layout-btn,button', 'studio'), 1600);
await scene('s3-generate-menu',
  `${CLOSE.replace('return \'closed\';','')}
   const t=[...document.querySelectorAll('button')].find(b=>/^generate/i.test(b.innerText.trim()));
   if(!t) return 'no trigger'; t.click(); return 'opened';`, 800);
await scene('s4-account-menu',
  `document.body.click(); await new Promise(r=>setTimeout(r,300));
   const pill=document.querySelector('.sy-pill, #synth-account-slot button');
   if(!pill) return 'no pill'; pill.click(); return 'opened';`, 1000);
await scene('s5-my-creations',
  `const g=document.getElementById('sy-gallery') || [...document.querySelectorAll('a,button')]
     .find(e=>/my creations/i.test(e.innerText||''));
   if(!g) return 'no entry'; g.click(); return 'opened';`, 3200);
await scene('s6-image-studio', `${CLOSE} document.getElementById('studio-image-btn').click(); return 'ok';`, 1500);
await scene('s7-smart-transform', `${CLOSE} document.getElementById('studio-transform-btn').click(); return 'ok';`, 1600);
await scene('s8-workflows', `${CLOSE} document.getElementById('studio-workflow-btn').click(); return 'ok';`, 3000);
await scene('s9-locked-workflow',
  `const cards=[...document.querySelectorAll('.wfr-template-card')];
   const locked=cards.find(c=>/lock|🔒/i.test(c.innerText) || c.className.includes('locked'));
   if(!locked) return 'no locked card found (admin? or none)';
   locked.scrollIntoView({block:'center'}); locked.click(); return 'clicked locked';`, 1500);
await scene('s10-connections', `${CLOSE}
   const conn=document.querySelector('[class*="connections"]');
   if(conn) conn.scrollIntoView({block:'center'}); return 'ok';`, 1000);
await scene('s11-settings', `${CLOSE} document.getElementById('studio-settings-btn').click(); return 'ok';`, 1500);

await c.evaluate(CLOSE);
c.close();
console.log('\nsigned-in pass done (no credits spent yet)');
