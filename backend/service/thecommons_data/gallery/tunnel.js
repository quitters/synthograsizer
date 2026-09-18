// TUNNEL -- the classic texture-mapped tunnel. Nothing here is 3D: every
// pixel's angle and depth are worked out ONCE into lookup tables, and each
// frame just slides a texture through them. The tables are twice the screen
// size so the viewpoint can drift around inside them for free.
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
  const TW = bw * 2, TH = bh * 2, ratio = 32 * bw / 320;
  S.ang = new Uint8Array(TW * TH);
  S.dep = new Uint8Array(TW * TH);
  S.shade = new Uint8Array(TW * TH);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const dx = x - TW / 2, dy = y - TH / 2, d = Math.sqrt(dx * dx + dy * dy) || 1, i = y * TW + x;
    S.dep[i] = ((ratio * 256) / d) & 255;
    S.ang[i] = (256 * (Math.atan2(dy, dx) / (2 * Math.PI) + 0.5)) & 255;
    S.shade[i] = Math.min(7, (d / (bw * 0.55)) * 8) | 0;      // darker far down the tunnel
  }
  S.TW = TW;
  S.bw = bw; S.bh = bh;
}

// 256x256 texture of palette indices, regenerated only when the choice changes.
const texName = getVar('texture') ?? 'checker';
if (S.texKey !== texName) {
  S.tex = new Uint8Array(65536);
  for (let v = 0; v < 256; v++) for (let u = 0; u < 256; u++) {
    let c;
    if (texName === 'xor') c = u ^ v;
    else if (texName === 'rings') c = ((v >> 4) & 1 ? 200 : 60) + (u & 31) * 2;
    else if (texName === 'bricks') {
      const off = (v >> 5) & 1 ? 32 : 0;
      c = (v & 31) < 3 || ((u + off) & 63) < 3 ? 20 : 150 + ((u * 7 + v * 13) & 63);
    } else c = ((u >> 5) ^ (v >> 5)) & 1 ? 210 - (u & 31) : 50 + (v & 31);
    S.tex[(v << 8) | u] = c & 255;
  }
  S.texKey = texName;
}

// Eight pre-shaded copies of the palette: shading is a table lookup, not maths.
const PALETTES = {
  neon:   [[0, 10, 0, 40], [0.5, 255, 0, 170], [1, 0, 255, 255]],
  copper: [[0, 30, 8, 0], [0.5, 200, 90, 30], [1, 255, 230, 180]],
  toxic:  [[0, 0, 20, 0], [0.5, 60, 200, 0], [1, 230, 255, 80]],
  ice:    [[0, 0, 10, 40], [0.5, 60, 140, 255], [1, 230, 250, 255]],
};
const palName = getVar('palette') ?? 'neon';
if (S.palKey !== palName) {
  const stops = PALETTES[palName] ?? PALETTES.neon;
  S.shaded = new Uint32Array(8 * 256);
  for (let i = 0; i < 256; i++) {
    const p = i / 255;
    let k = 0;
    while (k < stops.length - 2 && p > stops[k + 1][0]) k++;
    const a = stops[k], b = stops[k + 1];
    const f = Math.min(1, Math.max(0, (p - a[0]) / ((b[0] - a[0]) || 1)));
    const r = a[1] + (b[1] - a[1]) * f, g = a[2] + (b[2] - a[2]) * f, bl = a[3] + (b[3] - a[3]) * f;
    for (let s = 0; s < 8; s++) {
      const m = (s + 1) / 8;
      S.shaded[s * 256 + i] = (0xff000000 | ((bl * m) << 16) | ((g * m) << 8) | (r * m)) >>> 0;
    }
  }
  S.palKey = palName;
}

const speed = (getVar('speed') ?? 1) * (1 + audio.level);
S.t = (S.t ?? 0) + Math.min(frame.dt, 0.1) * speed;
S.look = (S.look ?? 0) + Math.min(frame.dt, 0.1);
const shiftV = (S.t * 90) | 0;
const shiftU = (S.look * 12) | 0;
const twist = getVar('twist') ?? 0.5;
const ox = ((bw / 2) * (1 + 0.45 * Math.sin(S.look * 0.37))) | 0;
const oy = ((bh / 2) * (1 + 0.45 * Math.cos(S.look * 0.29))) | 0;

const { px, ang, dep, shade, tex, shaded, TW } = S;
let o = 0;
for (let y = 0; y < bh; y++) {
  let i = (y + oy) * TW + ox;
  for (let x = 0; x < bw; x++, o++, i++) {
    const d = dep[i];
    const u = (ang[i] + ((d * twist) | 0) + shiftU) & 255;
    const v = (d + shiftV) & 255;
    px[o] = shaded[(shade[i] << 8) | tex[(v << 8) | u]];
  }
}

S.bctx.putImageData(S.img, 0, 0);
ctx.save();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(S.buf, 0, 0, W, H);
ctx.restore();
