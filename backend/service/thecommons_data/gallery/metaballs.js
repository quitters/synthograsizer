// METABALLS -- one blob for every person in the room. Each pixel sums every
// blob's pull (radius squared over distance squared); where the total crosses
// a threshold, you are inside the goo. When people join, a blob drifts in; when
// they leave, it's gone. Colours blend where blobs merge.
const S = room.state;
const W = frame.width, H = frame.height;

// Lower than most pieces: every pixel visits every blob.
const RES = { classic: 200, chunky: 120, fine: 320 };
const bw = Math.max(16, Math.min(RES[getVar('resolution')] ?? 200, Math.floor(W)));
const bh = Math.max(9, Math.round(bw * H / W));
if (S.bw !== bw || S.bh !== bh) {
  S.buf = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(bw, bh)
    : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
  S.bctx = S.buf.getContext('2d');
  S.img = S.bctx.createImageData(bw, bh);
  S.px = new Uint32Array(S.img.data.buffer);
  S.bw = bw; S.bh = bh;
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function seed(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const palName = getVar('palette') ?? 'per person';
const FIXED = {
  'lava lamp':   { inside: [255, 110, 20], bg: [40, 0, 50] },
  slime:         { inside: [90, 230, 40], bg: [2, 18, 6] },
  'plasma pink': { inside: [255, 70, 190], bg: [30, 0, 30] },
};
const fixed = FIXED[palName];
const bg = fixed ? fixed.bg : [6, 8, 26];

// Everyone present is a blob; a quiet room still gets three ghosts to watch.
const people = room.people.slice(0, 16);
const blobs = people.map((p) => ({ id: String(p.id), hue: p.hue }));
for (let i = 0; blobs.length < 3; i++) blobs.push({ id: `ghost-${i}`, hue: 200 + i * 60 });

S.t = (S.t ?? 0) + Math.min(frame.dt, 0.1) * (getVar('drift') ?? 0.6);
const t = S.t;
const goo = getVar('goo') ?? 1;
const size = bw * 0.1 * Math.sqrt(goo) * (1 + audio.bass * 0.25) * Math.max(0.6, 1.6 / Math.sqrt(blobs.length));
const n = blobs.length;
const bx = new Float32Array(n), by = new Float32Array(n), r2 = new Float32Array(n);
const cr = new Float32Array(n), cg = new Float32Array(n), cb = new Float32Array(n);
for (let i = 0; i < n; i++) {
  const s1 = seed(blobs[i].id), s2 = seed(blobs[i].id + '~'), s3 = seed(blobs[i].id + '#');
  bx[i] = bw * (0.5 + 0.38 * Math.sin(t * (0.5 + s1 * 0.7) + s2 * 6.28));
  by[i] = bh * (0.5 + 0.36 * Math.cos(t * (0.4 + s2 * 0.6) + s3 * 6.28));
  const r = size * (0.8 + s3 * 0.5) * (1 + 0.15 * Math.sin(t * 2 + s1 * 6.28));
  r2[i] = r * r;
  const c = fixed ? fixed.inside : hsl(blobs[i].hue, 0.85, 0.58);
  cr[i] = c[0]; cg[i] = c[1]; cb[i] = c[2];
}

const px = S.px;
let o = 0;
for (let y = 0; y < bh; y++) {
  const shadeRow = 0.6 + 0.4 * (y / bh);
  const br = bg[0] * shadeRow, bgc = bg[1] * shadeRow, bb = bg[2] * shadeRow;
  for (let x = 0; x < bw; x++, o++) {
    let f = 0, sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < n; i++) {
      const dx = x - bx[i], dy = y - by[i];
      const w = r2[i] / (dx * dx + dy * dy + 1);
      f += w; sr += cr[i] * w; sg += cg[i] * w; sb += cb[i] * w;
    }
    let r, g, b;
    if (f >= 1) {
      // Inside: the blend of whoever's blobs are here, brighter toward each core.
      const lit = Math.min(1.35, 0.7 + (f - 1) * 0.12) / f;
      r = sr * lit; g = sg * lit; b = sb * lit;
    } else if (f > 0.72) {
      // A thin glowing rim just outside the surface.
      const k = ((f - 0.72) / 0.28) * 0.55 / f;
      r = br + sr * k; g = bgc + sg * k; b = bb + sb * k;
    } else { r = br; g = bgc; b = bb; }
    px[o] = (0xff000000 | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r)) >>> 0;
  }
}

S.bctx.putImageData(S.img, 0, 0);
ctx.save();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(S.buf, 0, 0, W, H);
ctx.restore();
