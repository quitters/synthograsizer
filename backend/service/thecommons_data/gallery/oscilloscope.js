// OSCILLOSCOPE -- rebuilt from the Synthograsizer template "lissajous-lab".
// Two sine waves on an XY scope trace a figure; their frequency ratio decides
// its shape. The original drew ~29k separate line() calls a frame. Here each
// layer is one path: a thin bright beam at full size, and its glow drawn into
// a quarter-size bloom buffer. The phosphor's afterglow is a translucent
// black wash over what's already on screen -- a fixed cost however long the
// wall runs.
const S = room.state;
const W = frame.width, H = frame.height;
const dt = Math.min(frame.dt, 0.1);

const PALETTES = {
  'phosphor green': ['#33ff66', '#1fdc55', '#7dffa0', '#00c850'],
  amber: ['#ffb000', '#ffcc4d', '#ff9500', '#ffe08a'],
  neon: ['#ff0096', '#00ffc8', '#ff6400', '#c800ff'],
  laser: ['#ff2020', '#20ff40', '#2080ff', '#ffffff'],
  synthwave: ['#ff0064', '#00c8ff', '#ff64c8', '#6400ff'],
};
const RATIOS = { unison: [1, 1], octave: [1, 2], fifth: [2, 3], fourth: [3, 4], seventh: [4, 7] };

const figure = getVar('figure') ?? 'lissajous';
const [a, b] = RATIOS[getVar('ratio')] ?? RATIOS.octave;
const layers = Math.max(1, Math.min(12, Math.round(getVar('layers') ?? 4)));
const phosphor = getVar('phosphor') ?? 0.5;
const colours = PALETTES[getVar('palette')] ?? PALETTES['phosphor green'];

S.t = (S.t ?? 0) + dt;
S.rot = (S.rot ?? 0) + dt * (getVar('drift') ?? 0.2) * 0.5;
S.flash = Math.max(0, (S.flash ?? 0) * Math.exp(-dt * 6) + (audio.beat ? 1 : 0));

ctx.save();
// Afterglow: long phosphor keeps most of the last frame. Never fainter than
// 0.08, or 8-bit rounding leaves a grey haze that never fully clears.
ctx.fillStyle = S.started ? `rgba(0, 0, 0, ${0.08 + (1 - phosphor) * 0.4})` : '#000';
ctx.fillRect(0, 0, W, H);
S.started = true;

// The graticule: ten by eight divisions, as on the bench.
const grid = colours[0];
ctx.globalAlpha = 0.1;
ctx.strokeStyle = grid;
ctx.lineWidth = 1;
ctx.beginPath();
for (let i = 1; i < 10; i++) { const x = (W * i) / 10; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
for (let i = 1; i < 8; i++) { const y = (H * i) / 8; ctx.moveTo(0, y); ctx.lineTo(W, y); }
ctx.stroke();

const R = Math.min(W, H) * 0.42 * (1 + audio.bass * 0.08);
const N = 720;
const TAU = Math.PI * 2;
const beam = Math.max(1, Math.min(W, H) / 500);

// Every layer's trace, worked out once and drawn twice.
S.pts ??= new Float32Array(12 * (N + 1) * 2);
const pts = S.pts;
for (let l = 0; l < layers; l++) {
  const phase = S.t * 0.35 + l * 0.35;
  const scale = R * (1 - l * 0.035);
  for (let i = 0, o = l * (N + 1) * 2; i <= N; i++, o += 2) {
    const u = i / N;
    let x, y;
    if (figure === 'rose') {
      // r = cos(k·θ) closes after b turns when k = a/b.
      const th = u * TAU * b;
      const r = Math.cos((a / b) * th + phase);
      x = r * Math.cos(th); y = r * Math.sin(th);
    } else if (figure === 'spirograph') {
      // A hypotrochoid whose wheel ratio comes from the frequencies, so it closes.
      const q = a / (b + 1), k = (1 - q) / q, d = q * (0.75 + 0.2 * Math.sin(phase));
      const th = u * TAU * a;
      x = ((1 - q) * Math.cos(th) + d * Math.cos(k * th + phase)) / (1 - q + d);
      y = ((1 - q) * Math.sin(th) - d * Math.sin(k * th + phase)) / (1 - q + d);
    } else if (figure === 'harmonograph') {
      // Two damped pendulums per axis, winding inward.
      const th = u * TAU * 5, damp = Math.exp(-0.045 * th);
      x = damp * (Math.sin(a * th + phase) + 0.5 * Math.sin(b * th + 1.3)) / 1.5;
      y = damp * (Math.sin(b * th + 0.7) + 0.5 * Math.sin(a * th + phase * 1.3)) / 1.5;
    } else {
      const th = u * TAU;
      x = Math.sin(a * th + phase); y = Math.sin(b * th);
    }
    pts[o] = x * scale; pts[o + 1] = y * scale;
  }
}
function trace(g, l) {
  g.beginPath();
  const o0 = l * (N + 1) * 2;
  g.moveTo(pts[o0], pts[o0 + 1]);
  for (let i = 1, o = o0 + 2; i <= N; i++, o += 2) g.lineTo(pts[o], pts[o + 1]);
}

// The glow is the demo-scene bloom: wide strokes drawn into a quarter-size
// buffer, then stretched over the screen, where the stretch itself blurs
// them. Wide translucent strokes are the costly thing to rasterise at full
// size; at a sixteenth of the pixels they're nearly free.
const gw = Math.max(64, Math.round(W / 4)), gh = Math.max(36, Math.round(H / 4));
if (!S.bloom || S.bloom.width !== gw || S.bloom.height !== gh) {
  S.bloom = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(gw, gh)
    : Object.assign(document.createElement('canvas'), { width: gw, height: gh });
  S.gctx = S.bloom.getContext('2d');
}
const g = S.gctx;
g.setTransform(1, 0, 0, 1, 0, 0);
g.globalCompositeOperation = 'source-over';
g.globalAlpha = 1;
g.clearRect(0, 0, gw, gh);
g.setTransform(gw / W, 0, 0, gh / H, 0, 0);
g.translate(W / 2, H / 2);
g.rotate(S.rot);
g.globalCompositeOperation = 'lighter';
g.lineWidth = beam * 9;
g.globalAlpha = 0.3 + S.flash * 0.15;
for (let l = 0; l < layers; l++) {
  g.strokeStyle = colours[l % colours.length];
  trace(g, l);
  g.stroke();
}
ctx.globalCompositeOperation = 'lighter';
ctx.globalAlpha = 1;
ctx.imageSmoothingEnabled = true;
ctx.drawImage(S.bloom, 0, 0, W, H);

// The beam itself, thin and at full size.
ctx.translate(W / 2, H / 2);
ctx.rotate(S.rot);
ctx.globalAlpha = 0.9;
ctx.lineWidth = beam * (1.2 + S.flash);
for (let l = 0; l < layers; l++) {
  ctx.strokeStyle = colours[l % colours.length];
  trace(ctx, l);
  ctx.stroke();
}
ctx.restore();
