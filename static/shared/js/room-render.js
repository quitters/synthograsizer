/**
 * Rendering for a chat room: the room's agents write instruments, pages and templates, and ask to SEE them (the [RENDER: file] tag
 * and the render_artifact tool). The server cannot draw a sketch; a browser attached to the room can. This renders what the
 * server asks for in a hidden frame and returns pictures for the room to look at.
 *
 *   import { handleRenderRequest } from '/shared/js/room-render.js';
 *   const { images, note } = await handleRenderRequest(event, { buildPageDoc: (filename, content) => '<html>...' });
 *   // then POST { requestId, images, note } to /api/chat/render-result
 *
 * Why it exists: crews that could see their own output fixed a pond made of moire, a stained glass of flat primaries and a chain
 * that was confetti; the same crews without a picture shipped them. Numbers cannot see taste.
 */

// the same p5 the Synthograsizer's own viewer loads, so a template renders here as it plays there
export const P5_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js';

// Inside a rendered frame: a bridge for console output and a responder that sends back the first canvas on request
// (the same messages the Agent Studio's artifact preview uses).
export const FRAME_HARNESS = `<script>
(function(){
  function post(level, args){
    var msg = Array.prototype.map.call(args, function(a){ try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e){ return String(a); } }).join(' ');
    window.parent.postMessage({type:'artifact-console', level:level, message:msg}, '*');
  }
  ['log','info','warn','error'].forEach(function(lv){ var o = console[lv]; console[lv] = function(){ post(lv, arguments); o.apply(console, arguments); }; });
  window.onerror = function(msg, src, line, col, err){ post('error', [err ? (err.stack || err.toString()) : (msg + ' (line ' + line + ')')]); return false; };
  window.onunhandledrejection = function(e){ post('error', ['Unhandled rejection: ' + (e.reason && e.reason.stack || e.reason || e)]); };
  window.addEventListener('message', function(e){
    if (e.data && e.data.type === 'capture-screenshot') {
      var c = document.querySelector('canvas');
      if (c) { try { window.parent.postMessage({type:'artifact-screenshot', dataUrl:c.toDataURL('image/png')}, '*'); } catch(err){ post('error', ['Screenshot failed: ' + err.message]); } }
      else post('warn', ['No <canvas> element found for screenshot']);
    }
  });
})();
<\/script>`;

/** A page for a p5 instrument template (what the app's viewer builds): getSynthVar over `values`, a test card for getRefImage. */
export function buildP5TemplateDoc({ p5Code, values = {} }) {
  const safeCode = String(p5Code).replace(/<\/script/gi, '<\\/script');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0a0a0a}body{display:flex;align-items:center;justify-content:center}canvas{display:block;flex-shrink:0}</style>
${FRAME_HARNESS}
<script src="${P5_CDN}"><\/script></head><body><script>
var __sv = ${JSON.stringify(values).replace(/</g, '\\u003c')};
try {
new p5(function(p){
p.getSynthVar = function(k){ return (__sv && k in __sv) ? __sv[k] : null; };
var __ref = null;
p.getRefImage = function(){ if(!__ref){ var g = __ref = p.createGraphics(160,120); g.noStroke(); for(var i=0;i<160;i++){ g.fill(p.lerpColor(p.color(255,70,120),p.color(40,120,255),i/159)); g.rect(i,0,1,120); } g.fill(255,230,90); g.circle(50,40,44); g.fill(30,220,170); g.circle(110,80,56); g.fill(255,255,255,200); g.rect(20,86,70,10);} return __ref; };
${safeCode}
});
} catch (e) { console.error(e.stack || e.message); }
<\/script></body></html>`;
}

/**
 * Render a document in a hidden frame and capture its canvas.
 * @returns {Promise<{ dataUrl?: string, errors: string[] }>} dataUrl is missing when nothing could be captured
 */
export function renderInFrame(doc, { settleMs = 2500, timeoutMs = 20000, width = 640, height = 480 } = {}) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-modals');
    // Inside the viewport but invisible: Chrome stops animating a cross-origin frame that is scrolled away or hidden, and a sketch whose
    // draw() never runs captures as an empty canvas. (The frame is sandboxed without allow-same-origin, so the sketch cannot reach this page.)
    frame.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:0;opacity:0.01;pointer-events:none;z-index:-1`;
    const errors = [];
    let done = false;
    const finish = (dataUrl) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      frame.remove();
      resolve({ dataUrl, errors });
    };
    const onMessage = (e) => {
      if (e.source !== frame.contentWindow || !e.data) return;
      if (e.data.type === 'artifact-console' && e.data.level === 'error') errors.push(String(e.data.message).slice(0, 300));
      if (e.data.type === 'artifact-screenshot' && e.data.dataUrl) finish(e.data.dataUrl);
      if (e.data.type === 'artifact-console' && e.data.level === 'warn' && /No <canvas>/.test(e.data.message)) finish(undefined);
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    frame.addEventListener('load', () => setTimeout(() => {
      try { frame.contentWindow.postMessage({ type: 'capture-screenshot' }, '*'); } catch { finish(undefined); }
    }, settleMs));
    frame.srcdoc = doc;
    document.body.appendChild(frame);
  });
}

/**
 * Answer a render_request event from the chat server.
 * @param {{ requestId: string, kind: 'p5-template'|'page', filename: string, content: string, p5Code?: string, samples?: object[] }} request
 * @param {{ buildPageDoc: (filename: string, content: string) => string }} hooks  how this host turns a page or sketch into a document
 * @returns {Promise<{ images: {dataUrl: string, label: string}[], note?: string, error?: string }>}
 */
export async function handleRenderRequest(request, { buildPageDoc } = {}) {
  const images = [];
  const errors = [];
  if (request.kind === 'p5-template') {
    for (const values of (request.samples?.length ? request.samples : [{}]).slice(0, 4)) {
      const out = await renderInFrame(buildP5TemplateDoc({ p5Code: request.p5Code, values }));
      errors.push(...out.errors);
      if (out.dataUrl) images.push({ dataUrl: out.dataUrl, label: Object.entries(values).map(([k, v]) => `${k}=${v}`).join(', ').slice(0, 190) || request.filename });
    }
  } else if (request.kind === 'page') {
    if (typeof buildPageDoc !== 'function') return { images: [], error: 'this page cannot render artifacts' };
    const out = await renderInFrame(buildPageDoc(request.filename, request.content));
    errors.push(...out.errors);
    if (out.dataUrl) images.push({ dataUrl: out.dataUrl, label: request.filename });
  } else {
    return { images: [], error: `cannot render a ${request.kind}` };
  }
  const unique = [...new Set(errors)].slice(0, 3);
  const note = unique.length ? `console errors while rendering: ${unique.join(' | ')}` : undefined;
  if (!images.length) return { images, error: unique.length ? `nothing was drawn (${unique[0]})` : 'nothing was drawn: the page has no canvas, or it did not draw within a few seconds' };
  return { images, note };
}
