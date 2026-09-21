// INTERFERENCE -- sets of concentric rings drifting over each other. Where
// they overlap, new patterns appear that nobody drew: the rings are just
// XORed together, one bit of parity per set.
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
  S.bw = bw; S.bh = bh;
}

const rgb = (r, g, b) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
const palName = getVar('palette') ?? 'mono';
if (S.palKey !== palName) {
  // mono and cga are true two- and four-colour looks; the others are ramps.
  if (palName === 'mono') S.pal = [rgb(0, 0, 0), rgb(235, 235, 235)];
  else if (palName === 'cga') S.pal = [rgb(0, 0, 0), rgb(85, 255, 255), rgb(255, 85, 255), rgb(255, 255, 255)];
  else {
    const hot = palName === 'ember';
    S.pal = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const p = (i & 127) / 127, lit = i >= 128;
      const r = hot ? 255 * p : 120 * p + (lit ? 90 : 0);
      const g = hot ? 140 * p * p : 40 * p;
      const b = hot ? (lit ? 40 : 0) : 255 * p;
      S.pal[i] = rgb(Math.min(255, r), Math.min(255, g), Math.min(255, b));
    }
  }
  S.palKey = palName;
}

S.t = (S.t ?? 0) + Math.min(frame.dt, 0.1) * (getVar('drift') ?? 0.6) * (1 + audio.level * 0.8);
const t = S.t;
const n = Math.max(2, Math.min(4, Math.round(getVar('centers') ?? 2)));
const spacing = (getVar('ring_spacing') ?? 10) * bw / 320;   // same rings at any resolution
const cxs = [], cys = [];
for (let i = 0; i < n; i++) {
  cxs.push(bw * (0.5 + 0.34 * Math.sin(t * (0.7 + i * 0.23) + i * 2.1)));
  cys.push(bh * (0.5 + 0.34 * Math.cos(t * (0.9 + i * 0.17) + i * 1.3)));
}

const px = S.px, pal = S.pal, ramp = pal.length === 256, four = pal.length === 4;
const cycle = (t * 30) | 0;
let o = 0;
for (let y = 0; y < bh; y++) {
  for (let x = 0; x < bw; x++, o++) {
    let parity = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const dx = x - cxs[i], dy = y - cys[i];
      const r = Math.sqrt(dx * dx + dy * dy) / spacing;
      parity ^= r & 1;
      sum += r;
    }
    if (ramp) px[o] = pal[(parity << 7) | ((sum * 8 + cycle) & 127)];
    else if (four) px[o] = pal[parity | (((sum * 0.5) & 1) << 1)];
    else px[o] = pal[parity];
  }
}

S.bctx.putImageData(S.img, 0, 0);
ctx.save();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(S.buf, 0, 0, W, H);
ctx.restore();
