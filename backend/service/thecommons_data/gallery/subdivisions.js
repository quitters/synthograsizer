// SUBDIVISIONS -- rebuilt from the Synthograsizer template
// "recursive-subdivisions". The wall is split and split again, Mondrian
// style. The original redrew every cell every frame (its "textured" fill was
// 40k noise() calls a frame), its "shuffle" snapped back to the same layout
// the next frame, and "grow" only ever played once. Here a composition is
// painted once into an offscreen canvas and each frame just shows it, plus a
// few cells pulsing with the music. A new one wipes in on a timer, or
// whenever someone presses Recompose.
const S = room.state;
const W = Math.floor(frame.width), H = Math.floor(frame.height);
const dt = Math.min(frame.dt, 0.1);

const PALETTES = {   // three colours, the paper, the lines
  mondrian: ['#e3120b', '#1740a8', '#f7d000', '#f4f1e8', '#111111'],
  bauhaus: ['#e5352c', '#0071bc', '#f9c116', '#efe9dc', '#1e1e1e'],
  pastel: ['#ffb3ba', '#bae1ff', '#ffffba', '#fbf7f2', '#6b6b7a'],
  neon: ['#ff006e', '#00ffa3', '#bf00ff', '#0d0d12', '#fff000'],
  earth: ['#8b5a2b', '#556b2f', '#d2a15a', '#efe4cf', '#3c3c28'],
  jewel: ['#0f6b3a', '#4b0082', '#8b0000', '#f3efe6', '#1a1a1a'],
};
const SPLITS = { golden: () => (S.rng() < 0.5 ? 0.618 : 0.382), equal: () => 0.5,
                 thirds: () => (S.rng() < 0.5 ? 1 / 3 : 2 / 3), random: () => 0.25 + S.rng() * 0.5 };

const palName = getVar('palette') ?? 'mondrian';
const pal = PALETTES[palName] ?? PALETTES.mondrian;
const depth = Math.max(2, Math.min(7, Math.round(getVar('depth') ?? 4)));
const splitName = getVar('split') ?? 'golden';
const fillName = getVar('fill') ?? 'solid';
const lines = Math.max(0, getVar('lines') ?? 6) * Math.min(W, H) / 540;
const tempo = Math.max(4, getVar('tempo') ?? 12);

function canvas() {
  return typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(W, H)
    : Object.assign(document.createElement('canvas'), { width: W, height: H });
}

// A small seeded generator, so a composition is a number and nothing more.
function seed(n) {
  let a = n >>> 0;
  S.rng = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Lay out and paint one composition into `target`; remember its coloured cells.
function compose(target, n) {
  seed(n);
  const cells = [];
  const split = SPLITS[splitName] ?? SPLITS.golden;
  (function cut(x, y, w, h, d) {
    if (d >= depth || (d >= 2 && S.rng() < 0.16) || w < W * 0.05 || h < H * 0.05) { cells.push([x, y, w, h]); return; }
    const across = w > h * 1.25 ? false : h > w * 1.25 ? true : S.rng() < 0.5;
    const r = split();
    if (across) { cut(x, y, w, h * r, d + 1); cut(x, y + h * r, w, h * (1 - r), d + 1); }
    else { cut(x, y, w * r, h, d + 1); cut(x + w * r, y, w * (1 - r), h, d + 1); }
  })(0, 0, W, H, 0);

  const g = target.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = pal[4];
  g.fillRect(0, 0, W, H);
  const lit = [];
  const unit = Math.min(W, H) / 540;
  for (const [x, y, w, h] of cells) {
    const cx = x + lines / 2, cy = y + lines / 2, cw = Math.max(0, w - lines), ch = Math.max(0, h - lines);
    const coloured = S.rng() < 0.38;
    g.fillStyle = coloured ? pal[Math.floor(S.rng() * 3)] : pal[3];
    g.fillRect(cx, cy, cw, ch);
    if (coloured) lit.push(cx, cy, cw, ch);
    const style = fillName === 'mixed' ? ['solid', 'striped', 'dotted'][Math.floor(S.rng() * 3)] : fillName;
    if (style === 'solid' || cw < 20 * unit || ch < 20 * unit) continue;
    g.save();
    g.beginPath(); g.rect(cx, cy, cw, ch); g.clip();
    g.fillStyle = g.strokeStyle = coloured ? pal[3] : pal[Math.floor(S.rng() * 3)];
    g.globalAlpha = 0.55;
    if (style === 'striped') {
      g.lineWidth = 6 * unit;
      g.beginPath();
      for (let k = -ch; k < cw; k += 18 * unit) { g.moveTo(cx + k, cy + ch); g.lineTo(cx + k + ch, cy); }
      g.stroke();
    } else {
      g.beginPath();
      for (let yy = cy + 12 * unit; yy < cy + ch; yy += 24 * unit) {
        for (let xx = cx + 12 * unit; xx < cx + cw; xx += 24 * unit) { g.moveTo(xx + 4 * unit, yy); g.arc(xx, yy, 4 * unit, 0, Math.PI * 2); }
      }
      g.fill();
    }
    g.restore();
  }
  return new Float32Array(lit);
}

// Anything that changes the look recomposes; a size change repaints the same one.
const key = [palName, depth, splitName, fillName, Math.round(lines * 10), W, H].join('|');
if (!S.front || S.front.width !== W || S.front.height !== H) {
  S.front = canvas(); S.back = canvas();
  S.n = S.n ?? 1;
  S.lit = compose(S.front, S.n);
  S.key = key; S.since = 0; S.wipe = -1;
  S.hits = new Float32Array(64);
}
S.since += dt;
let recompose = S.key !== key || S.since >= tempo;
for (const e of room.events) if (e.name === 'recompose') recompose = true;
if (recompose && S.wipe < 0) {
  S.n += 1;
  S.nextLit = compose(S.back, S.n);
  S.key = key; S.since = 0; S.wipe = 0;
}

// On the beat, one coloured cell lights up.
for (let i = 0; i < S.hits.length; i++) S.hits[i] *= Math.exp(-dt * 4);
const cellCount = S.lit.length / 4;
if (audio.beat && cellCount) S.hits[Math.floor(Math.random() * Math.min(cellCount, S.hits.length))] = 1;

ctx.save();
ctx.drawImage(S.front, 0, 0);
if (S.wipe >= 0) {
  S.wipe = Math.min(1, S.wipe + dt / 1.1);
  const e = S.wipe * S.wipe * (3 - 2 * S.wipe), edge = Math.round(W * e);
  if (edge > 0) ctx.drawImage(S.back, 0, 0, edge, H, 0, 0, edge, H);
  ctx.fillStyle = pal[2];
  ctx.fillRect(edge - Math.max(3, lines), 0, Math.max(3, lines), H);
  if (S.wipe >= 1) {
    [S.front, S.back] = [S.back, S.front];
    S.lit = S.nextLit; S.wipe = -1; S.hits.fill(0);
  }
}
// Coloured cells swell with the bass, and the beat's cell flares -- except
// mid-wipe, when half the screen already shows the next composition's cells.
const lift = audio.bass * 0.18;
for (let i = 0; i < (S.wipe < 0 ? S.lit.length / 4 : 0); i++) {   // S.lit may have just swapped
  const a = lift + (i < S.hits.length ? S.hits[i] * 0.45 : 0);
  if (a < 0.02) continue;
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.6, a)})`;
  ctx.fillRect(S.lit[i * 4], S.lit[i * 4 + 1], S.lit[i * 4 + 2], S.lit[i * 4 + 3]);
}
ctx.restore();
