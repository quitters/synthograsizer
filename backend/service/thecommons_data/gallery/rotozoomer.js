// ROTOZOOMER -- rotate and zoom a texture at the same time, the effect that
// closed out the 2D era of PC demos. Combining the two costs almost nothing:
// each screen pixel just steps through texture space by a rotated, scaled
// vector, so the inner loop is two additions and a lookup.
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

const texName = getVar('texture') ?? 'checker';
if (S.texKey !== texName) {
  S.tex = new Uint8Array(65536);
  for (let v = 0; v < 256; v++) for (let u = 0; u < 256; u++) {
    let c;
    if (texName === 'xor') c = u ^ v;
    else if (texName === 'bricks') {
      const off = (v >> 5) & 1 ? 32 : 0;
      c = (v & 31) < 3 || ((u + off) & 63) < 3 ? 16 : 140 + ((u * 5 + v * 11) & 63);
    } else if (texName === 'diamonds') {
      const du = Math.abs((u & 63) - 32), dv = Math.abs((v & 63) - 32);
      c = du + dv < 30 ? 120 + (du + dv) * 4 : 20 + ((u + v) & 31);
    } else c = ((u >> 5) ^ (v >> 5)) & 1 ? 230 : 40;
    S.tex[(v << 8) | u] = c & 255;
  }
  S.texKey = texName;
}

const PALETTES = {
  amiga:     [[0, 0, 0, 80], [0.5, 255, 80, 0], [1, 255, 255, 255]],
  gameboy:   [[0, 15, 56, 15], [0.33, 48, 98, 48], [0.66, 139, 172, 15], [1, 155, 188, 15]],
  vaporwave: [[0, 40, 0, 70], [0.5, 255, 80, 200], [1, 90, 240, 255]],
  copper:    [[0, 30, 8, 0], [0.5, 190, 90, 30], [1, 255, 225, 170]],
};
const palName = getVar('palette') ?? 'amiga';
if (S.palKey !== palName) {
  const stops = PALETTES[palName] ?? PALETTES.amiga;
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

S.t = (S.t ?? 0) + Math.min(frame.dt, 0.1);
S.spin = (S.spin ?? 0) + Math.min(frame.dt, 0.1) * (getVar('spin') ?? 0.4) * (1 + audio.bass * 0.8);
const t = S.t;
const depth = getVar('zoom_depth') ?? 0.6;
// Texels per screen pixel. Scaled by resolution so the look is the same at any size.
const zoom = Math.exp(depth * Math.sin(t * 0.55) * 1.4) * (320 / bw) * 0.9;
const ca = Math.cos(S.spin) * zoom, sa = Math.sin(S.spin) * zoom;
// Wander across the texture so it never sits still at the centre.
const cu = 128 + Math.sin(t * 0.31) * 300, cv = 128 + Math.cos(t * 0.23) * 300;
let u0 = cu - (bw / 2) * ca + (bh / 2) * sa;
let v0 = cv - (bw / 2) * sa - (bh / 2) * ca;

const { px, pal, tex } = S;
let o = 0;
for (let y = 0; y < bh; y++) {
  let u = u0, v = v0;
  for (let x = 0; x < bw; x++, o++) {
    px[o] = pal[tex[((v & 255) << 8) | (u & 255)]];
    u += ca;
    v += sa;
  }
  u0 -= sa;
  v0 += ca;
}

S.bctx.putImageData(S.img, 0, 0);
ctx.save();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(S.buf, 0, 0, W, H);
ctx.restore();
