ctx.save();

const depthTarget = Math.round(getVar('max_depth') ?? 5);
const tone = getVar('gold_tone') ?? 'classic';
const motion = getVar('motion_style') ?? 'steady_drift';
const reveal = getVar('reveal_mode') ?? 'eternal_bloom';
const lineBase = getVar('line_weight') ?? 1.5;
const glowLevel = getVar('glow_intensity') ?? 5;

const palettes = {
  classic: { primary: '232, 196, 104', highlight: '255, 238, 168', core: '170, 126, 42' },
  champagne: { primary: '242, 222, 196', highlight: '255, 248, 235', core: '168, 142, 116' },
  rose_gold: { primary: '240, 165, 155', highlight: '255, 218, 212', core: '184, 102, 118' },
  sunfire: { primary: '255, 180, 48', highlight: '255, 230, 120', core: '220, 80, 20' }
};
const col = palettes[tone] ?? palettes.classic;

// Precompute gasket into fixed typed buffer stored in room.state
const MAX_CIRCLES = 4096;
room.state.buf ??= new Float32Array(MAX_CIRCLES * 4); // [x, y, r, depth]
room.state.count ??= 0;
room.state.rot ??= 0;
room.state.pulse ??= 0;

if (room.state.cachedDepth !== depthTarget) {
  let ptr = 0;
  const buf = room.state.buf;
  const pushCircle = (x, y, r, d) => {
    if (ptr < MAX_CIRCLES && r > 0.001) {
      const i = ptr * 4;
      buf[i] = x;
      buf[i + 1] = y;
      buf[i + 2] = r;
      buf[i + 3] = d;
      ptr++;
    }
  };

  const r1 = 2 * Math.sqrt(3) - 3;
  const k1 = 1 / r1;
  const dCenter = 1 - r1;
  const c0 = { x: 0, y: 0, k: -1 };
  const c1 = { x: dCenter, y: 0, k: k1 };
  const c2 = { x: dCenter * Math.cos(2 * Math.PI / 3), y: dCenter * Math.sin(2 * Math.PI / 3), k: k1 };
  const c3 = { x: dCenter * Math.cos(4 * Math.PI / 3), y: dCenter * Math.sin(4 * Math.PI / 3), k: k1 };

  pushCircle(c0.x, c0.y, 1, 0);
  pushCircle(c1.x, c1.y, r1, 1);
  pushCircle(c2.x, c2.y, r1, 1);
  pushCircle(c3.x, c3.y, r1, 1);

  const solveDescartes = (a, b, c, old) => {
    const kn = 2 * (a.k + b.k + c.k) - old.k;
    if (Math.abs(kn) < 1e-6) return null;
    const xn = (2 * (a.k * a.x + b.k * b.x + c.k * c.x) - old.k * old.x) / kn;
    const yn = (2 * (a.k * a.y + b.k * b.y + c.k * c.y) - old.k * old.y) / kn;
    return { x: xn, y: yn, k: kn, r: Math.abs(1 / kn) };
  };

  const recurse = (a, b, c, d, currentDepth) => {
    if (currentDepth > depthTarget) return;
    const next = solveDescartes(a, b, c, d);
    if (!next || next.r < 0.0015) return;
    pushCircle(next.x, next.y, next.r, currentDepth);
    recurse(next, b, c, a, currentDepth + 1);
    recurse(a, next, c, b, currentDepth + 1);
    recurse(a, b, next, c, currentDepth + 1);
  };

  const center = solveDescartes(c1, c2, c3, c0);
  if (center) {
    pushCircle(center.x, center.y, center.r, 1);
    recurse(center, c2, c3, c1, 2);
    recurse(c1, center, c3, c2, 2);
    recurse(c1, c2, center, c3, 2);
  }
  recurse(c0, c2, c3, c1, 2);
  recurse(c1, c0, c3, c2, 2);
  recurse(c1, c2, c0, c3, 2);

  room.state.count = ptr;
  room.state.cachedDepth = depthTarget;
}

// Dynamics
const bass = audio.bass ?? 0;
const treble = audio.treble ?? 0;
const mid = audio.mid ?? 0;
if (audio.beat) room.state.pulse = 1.0;
room.state.pulse *= Math.exp(-frame.dt * 6.5);

let rotSpeed = 0.08;
if (motion === 'orbital_pulse') rotSpeed = 0.05 + bass * 0.18;
else if (motion === 'harmonic_spin') rotSpeed = 0.12 * Math.sin(frame.t * 0.35) + 0.04;
room.state.rot += rotSpeed * frame.dt;

// Background fill with subtle vignette
const w = frame.width;
const h = frame.height;
const cx = w * 0.5;
const cy = h * 0.5;
const minDim = Math.min(w, h);

const bgGrad = ctx.createRadialGradient(cx, cy, minDim * 0.05, cx, cy, minDim * 0.85);
bgGrad.addColorStop(0, '#0a1224');
bgGrad.addColorStop(0.65, '#040814');
bgGrad.addColorStop(1, '#02040a');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, w, h);

// Center aura glow on audio pulse
if (glowLevel > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const glowRad = minDim * (0.35 + bass * 0.25 + room.state.pulse * 0.15);
  const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRad);
  const auraAlpha = (glowLevel / 10) * (0.12 + bass * 0.1 + room.state.pulse * 0.1);
  aura.addColorStop(0, `rgba(${col.highlight}, ${auraAlpha * 1.5})`);
  aura.addColorStop(0.4, `rgba(${col.primary}, ${auraAlpha * 0.6})`);
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, cy, glowRad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Transform space
ctx.save();
ctx.translate(cx, cy);
ctx.rotate(room.state.rot);

const baseScale = minDim * 0.46 * (1 + bass * 0.02 + room.state.pulse * 0.025);
const buf = room.state.buf;
const total = room.state.count;

// Group draw calls by depth for peak demoscene throughput
for (let d = 0; d <= depthTarget; d++) {
  let alpha = 0.85;
  let lw = lineBase;

  if (reveal === 'eternal_bloom') {
    const cycle = (frame.t * 0.45) % (depthTarget + 1);
    const dist = Math.abs(cycle - d);
    alpha = Math.max(0.12, 1.0 - dist * 0.35) + room.state.pulse * 0.2;
  } else if (reveal === 'ripple_burst') {
    const phase = (frame.t * 1.5 - d * 0.8) % (Math.PI * 2);
    alpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(phase)) + room.state.pulse * 0.25;
  } else {
    alpha = (0.9 - d * 0.1) + treble * 0.25;
  }

  if (d === 0) {
    lw = lineBase * 2.2 + bass * 1.5;
    alpha = 0.95;
  } else if (d === 1) {
    lw = lineBase * 1.5 + room.state.pulse * 0.8;
  } else {
    lw = Math.max(0.5, lineBase * (1.1 - d * 0.12) + treble * 0.4);
  }

  alpha = Math.min(1.0, Math.max(0.05, alpha));

  ctx.beginPath();
  const isCore = d <= 1;
  const strokeColor = isCore
    ? `rgba(${col.highlight}, ${alpha})`
    : `rgba(${col.primary}, ${alpha * 0.85})`;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lw;

  if (glowLevel > 2 && d < 3) {
    ctx.shadowColor = `rgba(${col.highlight}, ${0.4 * (glowLevel / 10)})`;
    ctx.shadowBlur = 4 + glowLevel;
  } else {
    ctx.shadowBlur = 0;
  }

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const cd = buf[idx + 3];
    if (cd !== d) continue;

    const bx = buf[idx] * baseScale;
    const by = buf[idx + 1] * baseScale;
    const br = buf[idx + 2] * baseScale;

    if (reveal === 'clockwork' && d > 1) {
      const ang = Math.atan2(by, bx) + Math.PI;
      const sweep = ((frame.t * 0.8) % (Math.PI * 2));
      if (Math.abs(ang - sweep) > 1.8 && Math.abs(ang - sweep) < (Math.PI * 2 - 1.8)) continue;
    }

    ctx.moveTo(bx + br, by);
    ctx.arc(bx, by, br, 0, Math.PI * 2);
  }
  ctx.stroke();
}

// Room audience satellite nodes
if (room.people && room.people.length > 0) {
  ctx.shadowBlur = 6;
  const n = room.people.length;
  for (let p = 0; p < n; p++) {
    const person = room.people[p];
    const ang = (p / n) * Math.PI * 2 - room.state.rot * 1.5;
    const px = Math.cos(ang) * baseScale;
    const py = Math.sin(ang) * baseScale;
    const pHue = person.hue ?? 45;
    ctx.fillStyle = `hsla(${pHue}, 85%, 68%, 0.85)`;
    ctx.shadowColor = `hsla(${pHue}, 90%, 60%, 0.8)`;
    ctx.beginPath();
    ctx.arc(px, py, 2.5 + mid * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();
ctx.restore();