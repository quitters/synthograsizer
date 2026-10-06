// MANDALA -- rebuilt from the Synthograsizer template "sacred-geometry".
// Points on a golden-angle spiral breathe in and out, and near neighbours
// are joined by threads; the whole wedge repeats round the centre. The
// original stroked every thread of every wedge separately. Here each wedge's
// points are rotated into place by hand, and every thread of every wedge
// goes into one of three paths by brightness: a few strokes a frame, however
// many threads there are, with the glow drawn into a quarter-size bloom
// buffer. "Per person" gives each wedge the colour of someone in the room.
const S = room.state;
const W = frame.width, H = frame.height;
const dt = Math.min(frame.dt, 0.1);

const HUES = { gold: 45, celestial: 210, emerald: 140, amethyst: 278, sunset: 18 };
const sym = Math.max(2, Math.min(12, Math.round(getVar('symmetry') ?? 6)));
const count = Math.max(20, Math.min(120, Math.round(getVar('points') ?? 60)));
const palName = getVar('palette') ?? 'gold';
const speed = getVar('motion') ?? 0.6;
const reach = getVar('web') ?? 1;
const people = room.people || [];

S.t = (S.t ?? 0) + dt * speed;
S.glow = Math.max(0, (S.glow ?? 0) * Math.exp(-dt * 5) + (audio.beat ? 1 : 0));
const t = S.t;

if (S.n !== count) {
  S.n = count;
  const PHI = (1 + Math.sqrt(5)) / 2;
  S.base = new Float32Array(count * 2);   // angle, radius (as a fraction)
  for (let i = 0; i < count; i++) {
    S.base[i * 2] = i * Math.PI * 2 * PHI;
    S.base[i * 2 + 1] = Math.sqrt(i + 1) / Math.sqrt(count);
  }
  S.x = new Float32Array(count * 12); S.y = new Float32Array(count * 12);
  S.lx = new Float32Array(count); S.ly = new Float32Array(count);
}

const R = Math.min(W, H) * 0.44 * (1 + audio.bass * 0.06);
const wobble = R * 0.055;
// One wedge's points, breathing.
for (let i = 0; i < count; i++) {
  const r = S.base[i * 2 + 1] * R + Math.sin(t * 2.2 + i * 0.22) * wobble;
  S.lx[i] = Math.cos(S.base[i * 2]) * r;
  S.ly[i] = Math.sin(S.base[i * 2]) * r;
}
// ...rotated into every wedge.
const spin = t * 0.15;
for (let s = 0; s < sym; s++) {
  const a = (s * Math.PI * 2) / sym + spin, ca = Math.cos(a), sa = Math.sin(a);
  for (let i = 0; i < count; i++) {
    S.x[s * count + i] = W / 2 + S.lx[i] * ca - S.ly[i] * sa;
    S.y[s * count + i] = H / 2 + S.lx[i] * sa + S.ly[i] * ca;
  }
}

// Wedges share a colour unless each belongs to a person.
const perPerson = palName === 'per person' && people.length > 0;
const hueOf = (s) => (perPerson ? people[s % people.length].hue : HUES[palName] ?? HUES.gold);
const groups = new Map();
for (let s = 0; s < sym; s++) {
  const h = hueOf(s);
  if (!groups.has(h)) groups.set(h, []);
  groups.get(h).push(s);
}

ctx.save();
ctx.fillStyle = 'rgba(6, 6, 14, 0.22)';
ctx.fillRect(0, 0, W, H);
const unit = Math.min(W, H) / 400;
const link = 48 * unit * reach * (R / (Math.min(W, H) * 0.44));

// Which neighbours are threaded, and how brightly: worked out once, for one
// wedge, then drawn in every wedge.
S.pairs ??= new Int16Array(120 * 9 * 2);
S.band ??= new Uint8Array(120 * 9);
let np = 0;
for (let i = 0; i < count; i++) {
  const lim = Math.min(count, i + 10);
  for (let j = i + 1; j < lim; j++) {
    const dx = S.lx[i] - S.lx[j], dy = S.ly[i] - S.ly[j];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= link) continue;
    S.pairs[np * 2] = i; S.pairs[np * 2 + 1] = j;
    S.band[np++] = d < link / 3 ? 0 : d < (2 * link) / 3 ? 1 : 2;
  }
}
const BRIGHT = [0.55, 0.3, 0.12];
function threads(g, wedges, band) {
  g.beginPath();
  for (let k = 0; k < np; k++) {
    if (S.band[k] !== band) continue;
    const i = S.pairs[k * 2], j = S.pairs[k * 2 + 1];
    for (const s of wedges) {
      const o = s * count;
      g.moveTo(S.x[o + i], S.y[o + i]);
      g.lineTo(S.x[o + j], S.y[o + j]);
    }
  }
}
function points(g, wedges, grow) {
  g.beginPath();
  for (const s of wedges) {
    const o = s * count;
    for (let i = 0; i < count; i++) {
      const size = unit * (1.2 + 2.4 * S.base[i * 2 + 1]) * (1 + S.glow * 0.6) * grow;
      g.moveTo(S.x[o + i] + size, S.y[o + i]);
      g.arc(S.x[o + i], S.y[o + i], size, 0, Math.PI * 2);
    }
  }
}

// The glow is a bloom buffer: wide strokes drawn a quarter the size and
// stretched over the wall. Thousands of wide translucent threads were what
// cost the frames; at a sixteenth of the pixels they're nearly free.
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
g.globalCompositeOperation = 'lighter';
g.lineWidth = unit * 5;
for (const [hue, wedges] of groups) {
  for (let b = 0; b < 3; b++) {
    g.strokeStyle = `hsla(${hue}, 80%, 70%, ${BRIGHT[b] * 0.6})`;
    threads(g, wedges, b);
    g.stroke();
  }
  g.fillStyle = `hsla(${hue}, 85%, 70%, 0.5)`;
  points(g, wedges, 2.4);
  g.fill();
}
ctx.globalCompositeOperation = 'lighter';
ctx.imageSmoothingEnabled = true;
ctx.drawImage(S.bloom, 0, 0, W, H);

// Thin threads and the points themselves, at full size.
ctx.lineWidth = unit * 1.1;
for (const [hue, wedges] of groups) {
  for (let b = 0; b < 3; b++) {
    ctx.strokeStyle = `hsla(${hue}, 72%, 78%, ${BRIGHT[b]})`;
    threads(ctx, wedges, b);
    ctx.stroke();
  }
  ctx.fillStyle = `hsla(${hue}, 85%, 72%, ${0.75 + S.glow * 0.25})`;
  points(ctx, wedges, 1);
  ctx.fill();
}
ctx.restore();
