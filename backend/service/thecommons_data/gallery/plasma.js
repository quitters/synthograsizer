// PLASMA -- a handful of sine waves summed per pixel, then the palette
// itself cycles, so the whole screen ripples and pulses. The four terms
// below are separable (angle addition), so only one Math.sin runs per pixel.
const S = room.state;
const W = frame.width, H = frame.height;

const RES = { classic: 320, chunky: 160, fine: 480 };
const bw = Math.max(16, Math.min(RES[getVar('resolution')] ?? 320, Math.floor(W)));
const bh = Math.max(9, Math.round(bw * H / W));
if (S.bw !== bw || S.bh !== bh) {
  S.buf = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(bw, bh)
    : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
  S.bctx = S.buf.getContext('2d');
  S.img = S.bctx.createImageData(bw, bh);
  S.px = new Uint32Array(S.img.data.buffer);
  S.colA = new Float32Array(bw); S.colS = new Float32Array(bw); S.colC = new Float32Array(bw);
  S.rowB = new Float32Array(bh); S.rowS = new Float32Array(bh); S.rowC = new Float32Array(bh);
  // Distance from the centre never changes, so it is worked out once per size.
  S.dist = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    S.dist[y * bw + x] = Math.hypot(x - bw / 2, y - bh / 2) / bw;
  }
  S.bw = bw; S.bh = bh;
}

// Palettes loop back to their first colour so cycling never shows a seam.
const PALETTES = {
  acid:       [[0, 0, 0, 0], [0.25, 0, 255, 90], [0.5, 255, 255, 0], [0.75, 255, 0, 200], [1, 0, 0, 0]],
  inferno:    [[0, 0, 0, 0], [0.2, 130, 0, 0], [0.4, 255, 90, 0], [0.5, 255, 230, 90], [0.6, 255, 90, 0], [0.8, 130, 0, 0], [1, 0, 0, 0]],
  'deep sea': [[0, 0, 8, 40], [0.3, 0, 90, 170], [0.5, 130, 255, 240], [0.7, 0, 90, 170], [1, 0, 8, 40]],
  copper:     [[0, 24, 6, 0], [0.3, 170, 70, 20], [0.5, 255, 210, 150], [0.7, 170, 70, 20], [1, 24, 6, 0]],
  candy:      [[0, 255, 90, 180], [0.25, 130, 90, 255], [0.5, 90, 230, 255], [0.75, 255, 240, 120], [1, 255, 90, 180]],
};
const palName = getVar('palette') ?? 'acid';
if (S.palKey !== palName) {
  const stops = PALETTES[palName] ?? PALETTES.acid;
  S.pal = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const p = i / 255;
    let k = 0;
    while (k < stops.length - 2 && p > stops[k + 1][0]) k++;
    const a = stops[k], b = stops[k + 1];
    const f = Math.min(1, Math.max(0, (p - a[0]) / ((b[0] - a[0]) || 1)));
    S.pal[i] = (0xff000000 | ((a[3] + (b[3] - a[3]) * f) << 16)
      | ((a[2] + (b[2] - a[2]) * f) << 8) | (a[1] + (b[1] - a[1]) * f)) >>> 0;
  }
  S.palKey = palName;
}

const speed = (getVar('flow_speed') ?? 1) * (1 + audio.bass * 0.6);
S.t = (S.t ?? 0) + Math.min(frame.dt, 0.1) * speed;
S.kick = Math.max(0, (S.kick ?? 0) * 0.92 + (audio.beat ? 48 : 0));
const t = S.t;
const k = (getVar('pattern_scale') ?? 1.2) * 8 / bw;

for (let x = 0; x < bw; x++) {
  const u = x * k;
  S.colA[x] = Math.sin(u + t);
  S.colS[x] = Math.sin(u * 0.7 + t * 0.9);
  S.colC[x] = Math.cos(u * 0.7 + t * 0.9);
}
for (let y = 0; y < bh; y++) {
  const v = y * k;
  S.rowB[y] = Math.sin((v + t * 0.7) * 1.3);
  S.rowS[y] = Math.sin(v * 0.7);
  S.rowC[y] = Math.cos(v * 0.7);
}

const px = S.px, pal = S.pal, dist = S.dist;
const ring = 20 * (getVar('pattern_scale') ?? 1.2);
const cycle = t * 40 + S.kick;
let o = 0;
for (let y = 0; y < bh; y++) {
  const rb = S.rowB[y], rs = S.rowS[y], rc = S.rowC[y];
  for (let x = 0; x < bw; x++, o++) {
    const v = S.colA[x] + rb + (S.colS[x] * rc + S.colC[x] * rs) + Math.sin(dist[o] * ring - t * 2);
    px[o] = pal[((v + 4) * 32 + cycle) & 255];
  }
}

S.bctx.putImageData(S.img, 0, 0);
ctx.save();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(S.buf, 0, 0, W, H);
ctx.restore();
