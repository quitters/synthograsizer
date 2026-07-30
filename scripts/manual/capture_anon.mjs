/* Anonymous-visitor surfaces of the hosted service. No session, no credits. */
import { mkdirSync } from 'node:fs';
import { attach, sleep } from './cdp.mjs';

const OUT = './shots_hosted';
mkdirSync(OUT, { recursive: true });
const c = await attach(9335, 'synthograsizer');

await c.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

const go = async (url, wait = 3000) => { await c.send('Page.navigate', { url }); await sleep(wait); };

await go('https://www.synthograsizer.com/');
await c.shot(OUT, 'a1-landing');
console.log('a1-landing');

await go('https://www.synthograsizer.com/synthograsizer/', 4500);
await c.shot(OUT, 'a2-app-signed-out');
console.log('a2-app-signed-out');

// What an anonymous visitor gets when they try to generate: the app is fully
// usable for templates/knobs, and only the AI calls are walled.
const probe = await c.evaluate(`
  const btn = document.getElementById('generate-button');
  if (!btn) return 'no generate button';
  btn.click();
  await new Promise(r=>setTimeout(r,2600));
  const toast = document.querySelector('.toast, .sy-toast, [class*="toast"]');
  return JSON.stringify({ clicked:true, toast: toast ? toast.innerText.trim().slice(0,120) : null });
`);
console.log('anon generate ->', probe);
await c.shot(OUT, 'a3-anon-generate-wall');

// The sign-in control itself
await c.evaluate(`
  const slot=document.getElementById('synth-account-slot');
  if(slot) slot.scrollIntoView({block:'center'});
  return 'ok';`);
await sleep(600);
await c.shot(OUT, 'a4-sign-in-control');
console.log('a4-sign-in-control');

await go('https://www.synthograsizer.com/terms/', 2500);
await c.shot(OUT, 'a5-terms');
console.log('a5-terms');

c.close();
console.log('anonymous pass done');
