// ATTRACTORS -- rebuilt from the Synthograsizer template "strange-attractors".
// Two engines, both a fixed cost per frame however long the wall runs:
//  - flows (Lorenz, Aizawa, Thomas, Halvorsen): each stream is a ring buffer
//    of recent points, drawn as four batched paths that fade toward the tail,
//    instead of thousands of separate line() calls;
//  - maps (Clifford, De Jong): a fixed number of iterations per frame lands in
//    a 480-wide hit buffer that fades a little each frame and is tone-mapped
//    through a 256-entry palette -- the density plot demos drew these as.
const S = room.state;
const W = frame.width, H = frame.height;
const dt = Math.min(frame.dt, 0.1);

const PALETTES = {
  electric: ['#0096ff', '#00ffc8', '#6400ff', '#ffffff', '#00dcff'],
  fire: ['#ff3c00', '#ffa000', '#ffdc32', '#ff6432', '#c80000'],
  ice: ['#64b4ff', '#c8e6ff', '#96c8f0', '#dcf0ff', '#508cdc'],
  aurora: ['#00ff78', '#00c8ff', '#7800ff', '#ff00b4', '#00ffc8'],
  vapor: ['#ff64c8', '#64c8ff', '#c896ff', '#96ffc8', '#ffb4dc'],
};
// Flow attractors: derivative, step size, a centre and radius to frame them,
// and a start point inside the basin.
const FLOWS = {
  lorenz: { d: (x, y, z, o) => { o[0] = 10 * (y - x); o[1] = x * (28 - z) - y; o[2] = x * y - 8 / 3 * z; },
            h: 0.006, c: [0, 0, 25], r: 30, p0: [1, 1, 1] },
  aizawa: { d: (x, y, z, o) => { o[0] = (z - 0.7) * x - 3.5 * y; o[1] = 3.5 * x + (z - 0.7) * y;
                                 o[2] = 0.6 + 0.95 * z - z * z * z / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x; },
            h: 0.01, c: [0, 0, 0.6], r: 1.7, p0: [0.1, 0, 0] },
  thomas: { d: (x, y, z, o) => { o[0] = Math.sin(y) - 0.208186 * x; o[1] = Math.sin(z) - 0.208186 * y; o[2] = Math.sin(x) - 0.208186 * z; },
            h: 0.08, c: [0, 0, 0], r: 4.5, p0: [1, 0, 0] },
  halvorsen: { d: (x, y, z, o) => { o[0] = -1.89 * x - 4 * y - 4 * z - y * y; o[1] = -1.89 * y - 4 * z - 4 * x - z * z;
                                    o[2] = -1.89 * z - 4 * x - 4 * y - x * x; },
               h: 0.004, c: [-3, -3, -3], r: 9, p0: [-1.5, 0, 0] },
};
const MAPS = {
  clifford: [-1.4, 1.6, 1.0, 0.7],
  'de jong': [-2.0, -2.0, -1.2, 2.0],
};

const kind = getVar('attractor') ?? 'lorenz';
const palName = getVar('palette') ?? 'electric';
const streams = Math.max(1, Math.min(24, Math.round(getVar('streams') ?? 8)));
const spin = getVar('spin') ?? 0.3;
const linger = getVar('linger') ?? 0.6;
const people = room.people || [];
const colours = palName === 'per person' && people.length
  ? people.map((p) => `hsl(${p.hue} 90% 62%)`)
  : PALETTES[palName] ?? PALETTES.electric;

S.flare = Math.max(0, (S.flare ?? 0) * Math.exp(-dt * 4) + (audio.beat ? 1 : 0));
S.angle = (S.angle ?? 0) + dt * spin * (0.6 + audio.bass);
S.t = (S.t ?? 0) + dt;

ctx.save();
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, W, H);

if (FLOWS[kind]) {
  const f = FLOWS[kind];
  const LEN = 600;          // points kept per stream
  const SUB = 5;            // integration steps per 60fps frame
  if (S.kind !== kind || !S.ring) {
    S.kind = kind;
    S.ring = []; S.pos = []; S.head = 0;
    S.proj = new Float32Array(LEN * 2);
    S.deriv = new Float32Array(3);
  }
  // Streams start inside the basin and are run forward before they're shown,
  // so none draws a line in from the origin.
  while (S.ring.length < streams) {
    const p = f.p0.map((v) => v + (Math.random() - 0.5) * 0.2);
    for (let i = 0; i < 400; i++) {
      f.d(p[0], p[1], p[2], S.deriv);
      p[0] += S.deriv[0] * f.h; p[1] += S.deriv[1] * f.h; p[2] += S.deriv[2] * f.h;
    }
    const ring = new Float32Array(LEN * 3);
    for (let i = 0; i < LEN; i++) ring.set(p, i * 3);
    S.ring.push(ring); S.pos.push(p);
  }
  S.ring.length = S.pos.length = streams;

  const steps = Math.max(1, Math.min(12, Math.round(dt * 60 * SUB)));
  for (let s = 0; s < streams; s++) {
    const p = S.pos[s], ring = S.ring[s];
    let head = S.head;
    for (let i = 0; i < steps; i++) {
      f.d(p[0], p[1], p[2], S.deriv);
      p[0] += S.deriv[0] * f.h; p[1] += S.deriv[1] * f.h; p[2] += S.deriv[2] * f.h;
      // Numerical trouble resets the stream rather than spreading NaN.
      if (!(Math.abs(p[0]) < 1e3 && Math.abs(p[1]) < 1e3 && Math.abs(p[2]) < 1e3)) {
        p[0] = f.p0[0] + Math.random() * 0.1; p[1] = f.p0[1]; p[2] = f.p0[2];
      }
      head = (head + 1) % LEN;
      ring[head * 3] = p[0]; ring[head * 3 + 1] = p[1]; ring[head * 3 + 2] = p[2];
    }
  }
  S.head = (S.head + steps) % LEN;

  const scale = Math.min(W, H) * 0.42 / f.r;
  const ca = Math.cos(S.angle), sa = Math.sin(S.angle);
  const tilt = 0.35 + 0.2 * Math.sin(S.t * 0.13);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const shown = Math.max(40, Math.round(LEN * (0.15 + 0.85 * linger)));
  const CHUNKS = 4, per = Math.ceil(shown / CHUNKS);
  // Plain joins and caps: round ones cost a lot of GPU time on thousands of
  // short segments, and at this width nobody can tell.
  ctx.globalCompositeOperation = 'lighter';
  const width = Math.max(1, Math.min(W, H) / 540) * (1 + S.flare * 0.8);
  for (let s = 0; s < streams; s++) {
    const ring = S.ring[s], pr = S.proj;
    // Project newest-first into pr: rotate about the vertical, then tilt.
    for (let i = 0; i < shown; i++) {
      const k = ((S.head - i) % LEN + LEN) % LEN * 3;
      const x = ring[k] - f.c[0], y = ring[k + 1] - f.c[1], z = ring[k + 2] - f.c[2];
      const x1 = x * ca - y * sa, y1 = x * sa + y * ca;
      pr[i * 2] = W / 2 + x1 * scale;
      pr[i * 2 + 1] = H / 2 - (z * ct - y1 * st) * scale;
    }
    ctx.strokeStyle = colours[s % colours.length];
    for (let c = 0; c < CHUNKS; c++) {
      const from = c * per, to = Math.min(shown - 1, from + per);
      if (to <= from) break;
      ctx.globalAlpha = (1 - c / CHUNKS) * 0.9;
      ctx.lineWidth = width * (1.3 - c * 0.2);
      ctx.beginPath();
      ctx.moveTo(pr[from * 2], pr[from * 2 + 1]);
      for (let i = from + 1; i <= to; i++) ctx.lineTo(pr[i * 2], pr[i * 2 + 1]);
      ctx.stroke();
    }
  }
} else {
  const base = MAPS[kind] ?? MAPS.clifford;
  const bw = Math.max(16, Math.min(480, Math.floor(W))), bh = Math.max(9, Math.round(bw * H / W));
  if (S.bw !== bw || S.bh !== bh || S.kind !== kind) {
    S.kind = kind; S.bw = bw; S.bh = bh;
    S.buf = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(bw, bh)
      : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
    S.bctx = S.buf.getContext('2d');
    S.img = S.bctx.createImageData(bw, bh);
    S.px = new Uint32Array(S.img.data.buffer);
    S.hist = new Float32Array(bw * bh);
    S.mx = 0.1; S.my = 0.1; S.max = 1;
  }
  const palKey = palName + '|' + colours.join();
  if (S.palKey !== palKey) {
    // Black up through the palette's colours, brightest last.
    S.pal = new Uint32Array(256);
    const stops = ['#000000', ...colours.slice(0, 3)];
    const rgb = stops.map((c) => {
      if (c[0] === '#') return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      const hue = parseFloat(c.slice(4));  // hsl(h 90% 62%) from a person's hue
      const k = (n) => { const a = (n + hue / 30) % 12; return 0.62 - 0.9 * 0.38 * Math.max(-1, Math.min(a - 3, 9 - a, 1)); };
      return [k(0) * 255, k(8) * 255, k(4) * 255];
    });
    for (let i = 0; i < 256; i++) {
      const u = (i / 255) * (rgb.length - 1), j = Math.min(rgb.length - 2, Math.floor(u)), f = u - j;
      const c = [0, 1, 2].map((n) => rgb[j][n] + (rgb[j + 1][n] - rgb[j][n]) * f);
      S.pal[i] = (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
    }
    S.palKey = palKey;
  }
  // The parameters drift, so the figure slowly folds into new shapes; spin
  // sets how fast.
  const m = S.t * (0.05 + Math.abs(spin) * 0.15);
  const a = base[0] + 0.25 * Math.sin(m), b = base[1] + 0.2 * Math.sin(m * 0.7 + 1);
  const c = base[2] + 0.2 * Math.sin(m * 0.5 + 2), d = base[3] + 0.2 * Math.sin(m * 0.3 + 3);
  const iterations = streams * 1600;   // at most ~38k a frame
  const hist = S.hist, s2 = bh / 4.6;
  let x = S.mx, y = S.my;
  for (let i = 0; i < iterations; i++) {
    let nx, ny;
    if (kind === 'de jong') { nx = Math.sin(a * y) - Math.cos(b * x); ny = Math.sin(c * x) - Math.cos(d * y); }
    else { nx = Math.sin(a * y) + c * Math.cos(a * x); ny = Math.sin(b * x) + d * Math.cos(b * y); }
    x = nx; y = ny;
    const px = (bw / 2 + x * s2) | 0, py = (bh / 2 + y * s2) | 0;
    if (px >= 0 && px < bw && py >= 0 && py < bh) hist[py * bw + px] += 1;
  }
  S.mx = Number.isFinite(x) ? x : 0.1; S.my = Number.isFinite(y) ? y : 0.1;

  // Fade, find the peak, and colour in one pass. Last frame's peak scales
  // this frame, which nobody can see and saves a second pass.
  const keep = 0.9 + 0.095 * linger;
  const inv = 1 / Math.max(1, S.max), pal = S.pal, out = S.px, boost = 1 + S.flare * 0.5;
  let peak = 0;
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i] * keep;
    hist[i] = h;
    if (h > peak) peak = h;
    const v = Math.sqrt(h * inv) * 255 * boost;
    out[i] = pal[v > 255 ? 255 : v | 0];
  }
  S.max = peak;
  S.bctx.putImageData(S.img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(S.buf, 0, 0, W, H);
}
ctx.restore();
