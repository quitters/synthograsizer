// OP ART -- rebuilt from the Synthograsizer template "moire-waves" (its
// concentric mode lives on as Interference). A few striped layers, each
// turning or flowing a little differently, are XORed together: where they
// disagree the moire appears. The original ran sqrt, atan2 and sin for every
// pixel of every layer. Here a pixel's angle and distance are worked out once
// per screen size, a stripe is just "which half of the period is this?", and
// the ripple is a table lookup, so no trig runs per pixel at all.
//
// Two tones only, and on purpose nothing flashes: the stripes move, but half
// the screen is always light and half dark.
const S = room.state;
const W = frame.width, H = frame.height;
const dt = Math.min(frame.dt, 0.1);

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
  // Coordinates in screen heights from the centre, angle in turns.
  S.nx = new Float32Array(bw * bh); S.ny = new Float32Array(bw * bh);
  S.dist = new Float32Array(bw * bh); S.ang = new Float32Array(bw * bh);
  for (let y = 0, o = 0; y < bh; y++) for (let x = 0; x < bw; x++, o++) {
    const nx = (x - bw / 2) / bh, ny = (y - bh / 2) / bh;
    S.nx[o] = nx; S.ny[o] = ny;
    S.dist[o] = Math.hypot(nx, ny);
    S.ang[o] = Math.atan2(ny, nx) / (Math.PI * 2) + 0.5;
  }
  S.sine = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) S.sine[i] = Math.sin((i / 1024) * Math.PI * 2);
  S.bw = bw; S.bh = bh;
}

const TONES = {
  'black and white': [0x000000, 0xffffff],
  blueprint: [0x0b2a6b, 0xdfe9ff],
  infrared: [0x1a0000, 0xff4a1a],
  gold: [0x0d0a00, 0xffd24a],
  acid: [0x000000, 0xb6ff00],
};
const [dark, light] = (TONES[getVar('palette')] ?? TONES['black and white'])
  .map((c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16)) >>> 0);   // RGB -> ABGR

const PATTERNS = ['stripes', 'spokes', 'spiral', 'chevron'];
const pattern = Math.max(0, PATTERNS.indexOf(getVar('pattern') ?? 'stripes'));
const layers = Math.max(2, Math.min(4, Math.round(getVar('layers') ?? 3)));
const density = (getVar('density') ?? 1.2) * (1 + audio.bass * 0.05);
const speed = getVar('motion') ?? 0.6;
const warp = getVar('ripple') ?? 0.2;

S.t = (S.t ?? 0) + dt * speed;
S.kick = (S.kick ?? 0) * Math.exp(-dt * 3) + (audio.beat ? 0.25 : 0);
const t = S.t;

// Per-layer constants, once per frame: a direction, a frequency and a phase.
// Neighbouring layers turn and flow against each other.
S.c ??= new Float32Array(4); S.s ??= new Float32Array(4); S.f ??= new Float32Array(4);
S.ph ??= new Float32Array(4); S.rt ??= new Float32Array(4);
for (let w = 0; w < layers; w++) {
  const dir = w % 2 ? -1 : 1;
  const rot = dir * t * (0.05 + 0.03 * w) + w * 0.09;
  S.c[w] = Math.cos(rot); S.s[w] = Math.sin(rot);
  S.rt[w] = rot / (Math.PI * 2);
  S.f[w] = density * 9 * (1 + w * 0.06);
  S.ph[w] = dir * t * (0.3 + 0.15 * w) + (w === 0 ? S.kick : 0);
}

const px = S.px, nxA = S.nx, nyA = S.ny, dist = S.dist, ang = S.ang, sine = S.sine;
const c = S.c, s = S.s, f = S.f, ph = S.ph, rt = S.rt;
const ripple = warp * 0.6, ripPhase = t * 0.8;
const n = bw * bh;
for (let o = 0; o < n; o++) {
  const nx = nxA[o], ny = nyA[o], d = dist[o], a = ang[o];
  const rip = ripple * sine[((d * 5 - ripPhase) * 1024) & 1023];
  let bits = 0;
  for (let w = 0; w < layers; w++) {
    let v;
    if (pattern === 0) v = (nx * c[w] + ny * s[w]) * f[w];
    else if (pattern === 1) v = (a + rt[w]) * (10 + 2 * w);
    else if (pattern === 2) v = (a + rt[w]) * 3 + d * f[w];
    else {
      const xr = nx * c[w] - ny * s[w], yr = nx * s[w] + ny * c[w];
      const zig = xr * 4 - Math.floor(xr * 4 + 0.5);
      v = (yr + (zig < 0 ? -zig : zig) * 0.35) * f[w];
    }
    v += ph[w] + rip;
    bits ^= (v - Math.floor(v)) < 0.5 ? 1 : 0;
  }
  px[o] = bits ? light : dark;
}

S.bctx.putImageData(S.img, 0, 0);
ctx.save();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(S.buf, 0, 0, W, H);
ctx.restore();
