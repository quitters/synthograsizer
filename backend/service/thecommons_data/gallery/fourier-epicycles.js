ctx.save();
const W = frame.width;
const H = frame.height;
const S = Math.min(W, H);

// 1. Controls
const shapeType = getVar('shape_type') ?? 'star';
const circleOrder = getVar('circle_order') ?? 24;
const speedMult = getVar('draw_speed') ?? 1.0;
const glowMode = getVar('glow_intensity') ?? 'radiant';
const paletteChoice = getVar('color_palette') ?? 'cyan_gold';

const PALETTES = {
  cyan_gold: { circle: 'rgba(80, 200, 255, 0.22)', arm: 'rgba(100, 220, 255, 0.45)', trail: [180, 50], bg: '#060a12' },
  neon_magenta: { circle: 'rgba(255, 60, 180, 0.22)', arm: 'rgba(255, 120, 220, 0.5)', trail: [310, 260], bg: '#0d0510' },
  emerald_aurora: { circle: 'rgba(40, 240, 160, 0.22)', arm: 'rgba(120, 255, 200, 0.45)', trail: [155, 200], bg: '#030d0a' },
  solar_amber: { circle: 'rgba(255, 170, 40, 0.25)', arm: 'rgba(255, 210, 90, 0.5)', trail: [35, 15], bg: '#0e0803' }
};
const pal = PALETTES[paletteChoice] ?? PALETTES.cyan_gold;

// 2. Persistent State & Precomputed Samples
const N_SAMPLES = 256;
const MAX_COEFFS = 40;
const MAX_TRAIL = 420;

room.state.init ??= false;
if (!room.state.init) {
  room.state.init = true;
  room.state.curShape = shapeType;
  room.state.phase = 0;
  room.state.trailX = new Float32Array(MAX_TRAIL);
  room.state.trailY = new Float32Array(MAX_TRAIL);
  room.state.trailLen = 0;
  room.state.trailHead = 0;
  // Fourier coefficient storage: { freq, amp, phase }
  // Target and current coefficients for smooth morphing/retuning
  room.state.coeffs = [];
  room.state.targetCoeffs = [];
  for (let k = 0; k < MAX_COEFFS; k++) {
    room.state.coeffs.push({ freq: 0, amp: 0, phase: 0 });
    room.state.targetCoeffs.push({ freq: 0, amp: 0, phase: 0 });
  }
}

// Discrete Fourier Transform generator on closed parametric curve
function computeDFT(type) {
  const ptsX = new Float32Array(N_SAMPLES);
  const ptsY = new Float32Array(N_SAMPLES);
  const scale = S * 0.32;

  for (let i = 0; i < N_SAMPLES; i++) {
    const u = (i / N_SAMPLES) * Math.PI * 2;
    let x = 0, y = 0;
    if (type === 'heart') {
      x = 16 * Math.pow(Math.sin(u), 3);
      y = -(13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u));
      x *= scale * 0.052;
      y *= scale * 0.052;
    } else if (type === 'star') {
      const r = 1 + 0.48 * Math.cos(5 * u);
      x = Math.cos(u) * r * (scale * 0.65);
      y = Math.sin(u) * r * (scale * 0.65);
    } else if (type === 'musical_note') {
      // Parametric eighth note approximation with stem and flag
      const t2 = u;
      const head = Math.sin(t2);
      x = Math.cos(t2) * 0.45 + (t2 > 1.5 && t2 < 4.8 ? 0.35 * Math.sin(t2 * 2) : 0);
      y = -Math.sin(t2) * 0.55 + 0.35 * Math.cos(t2 * 1.5);
      x *= scale * 0.95;
      y *= scale * 0.95;
    } else if (type === 'trefoil') {
      x = (Math.sin(u) + 2 * Math.sin(2 * u)) * (scale * 0.28);
      y = (Math.cos(u) - 2 * Math.cos(2 * u)) * (scale * 0.28);
    } else {
      // infinity / lemniscate
      const d = 1 + Math.sin(u) * Math.sin(u);
      x = (Math.cos(u) / d) * (scale * 0.85);
      y = ((Math.sin(u) * Math.cos(u)) / d) * (scale * 0.85);
    }
    ptsX[i] = x;
    ptsY[i] = y;
  }

  // DFT evaluation
  const raw = [];
  const K_MAX = Math.floor(MAX_COEFFS / 2);
  for (let f = -K_MAX; f <= K_MAX; f++) {
    if (f === 0) continue; // omit constant bias to keep centered
    let re = 0, im = 0;
    for (let n = 0; n < N_SAMPLES; n++) {
      const phi = (2 * Math.PI * f * n) / N_SAMPLES;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      re += ptsX[n] * c + ptsY[n] * s;
      im += ptsY[n] * c - ptsX[n] * s;
    }
    re /= N_SAMPLES;
    im /= N_SAMPLES;
    raw.push({
      freq: f,
      amp: Math.sqrt(re * re + im * im),
      phase: Math.atan2(im, re)
    });
  }
  // Sort epicycles by amplitude descending for stable hierarchy
  raw.sort((a, b) => b.amp - a.amp);
  return raw.slice(0, MAX_COEFFS);
}

// Re-compute targets on shape change or first run
if (room.state.curShape !== shapeType || !room.state.computed) {
  room.state.curShape = shapeType;
  room.state.computed = true;
  const newTgt = computeDFT(shapeType);
  for (let k = 0; k < MAX_COEFFS; k++) {
    if (newTgt[k]) {
      room.state.targetCoeffs[k].freq = newTgt[k].freq;
      room.state.targetCoeffs[k].amp = newTgt[k].amp;
      room.state.targetCoeffs[k].phase = newTgt[k].phase;
    }
  }
}

// Smooth coefficient retuning (demoscene morph)
const morphRate = Math.min(1.0, (frame.dt || 0.016) * 4.5);
for (let k = 0; k < MAX_COEFFS; k++) {
  const c = room.state.coeffs[k];
  const t = room.state.targetCoeffs[k];
  c.freq = t.freq;
  c.amp += (t.amp - c.amp) * morphRate;
  // angle lerp
  let dPh = (t.phase - c.phase) % (Math.PI * 2);
  if (dPh < -Math.PI) dPh += Math.PI * 2;
  if (dPh > Math.PI) dPh -= Math.PI * 2;
  c.phase += dPh * morphRate;
}

// Clear background with soft persistent glow
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Audio reactivity modulation
const bassBoost = 1.0 + (audio.bass || 0) * 0.35;
const midJitter = (audio.mid || 0) * 0.15;
const beatPulse = audio.beat ? 1.08 : 1.0;

// Step animation phase
const dt = Math.min(frame.dt || 0.016, 0.05);
const speed = 0.85 * speedMult * (1.0 + (audio.level || 0) * 0.4);
room.state.phase = (room.state.phase + dt * speed) % (Math.PI * 2);

// Center coordinates
const cx = W * 0.5;
const cy = H * 0.5;

// Compute epicycle chain
let prevX = cx;
let prevY = cy;
const nCircles = Math.min(circleOrder, MAX_COEFFS);

ctx.lineWidth = 1.2;
for (let i = 0; i < nCircles; i++) {
  const c = room.state.coeffs[i];
  const r = c.amp * bassBoost * beatPulse;
  if (r < 0.8) continue;

  const theta = c.freq * room.state.phase + c.phase + (i % 2 === 0 ? midJitter : -midJitter);
  const nx = prevX + Math.cos(theta) * r;
  const ny = prevY + Math.sin(theta) * r;

  // Draw circle orbit
  ctx.strokeStyle = pal.circle;
  ctx.beginPath();
  ctx.arc(prevX, prevY, r, 0, Math.PI * 2);
  ctx.stroke();

  // Draw rotating radius vector arm
  ctx.strokeStyle = pal.arm;
  ctx.beginPath();
  ctx.moveTo(prevX, prevY);
  ctx.lineTo(nx, ny);
  ctx.stroke();

  // Joint point
  ctx.fillStyle = pal.arm;
  ctx.beginPath();
  ctx.arc(nx, ny, 1.8, 0, Math.PI * 2);
  ctx.fill();

  prevX = nx;
  prevY = ny;
}

// Record tracer head into ring buffer
const head = room.state.trailHead;
room.state.trailX[head] = prevX;
room.state.trailY[head] = prevY;
room.state.trailHead = (head + 1) % MAX_TRAIL;
if (room.state.trailLen < MAX_TRAIL) room.state.trailLen++;

// Glow composite setup
const isRadiant = glowMode === 'radiant';
const isEthereal = glowMode === 'ethereal';
if (isRadiant) {
  ctx.globalCompositeOperation = 'lighter';
}

// Draw traced trail
const tLen = room.state.trailLen;
const trailH = pal.trail;
const alphaScale = isEthereal ? 0.6 : (isRadiant ? 1.0 : 0.45);

ctx.beginPath();
for (let i = 0; i < tLen; i++) {
  const idx = (room.state.trailHead - 1 - i + MAX_TRAIL) % MAX_TRAIL;
  const x = room.state.trailX[idx];
  const y = room.state.trailY[idx];
  if (i === 0) ctx.moveTo(x, y);
  else ctx.lineTo(x, y);
}
ctx.strokeStyle = `hsla(${trailH[0]}, 90%, 65%, ${0.75 * alphaScale})`;
ctx.lineWidth = isRadiant ? 2.5 : 1.8;
ctx.stroke();

// Accent pass for radiant bloom
if (isRadiant) {
  ctx.lineWidth = 5.0;
  ctx.strokeStyle = `hsla(${trailH[1]}, 95%, 60%, ${0.25 * bassBoost})`;
  ctx.stroke();
}

// Draw tracer spark at current tip
const sparkHue = (trailH[0] + (audio.treble || 0) * 60) % 360;
ctx.fillStyle = `hsl(${sparkHue}, 100%, 80%)`;
ctx.beginPath();
ctx.arc(prevX, prevY, 4.0 * beatPulse, 0, Math.PI * 2);
ctx.fill();

// Room presence: small constellation dots on outer boundary
if (room.people && room.people.length > 0) {
  ctx.globalCompositeOperation = 'source-over';
  const pCount = room.people.length;
  const rimR = S * 0.46;
  for (let p = 0; p < pCount; p++) {
    const person = room.people[p];
    const ang = (p / pCount) * Math.PI * 2 + frame.t * 0.08;
    const px = cx + Math.cos(ang) * rimR;
    const py = cy + Math.sin(ang) * rimR;
    ctx.fillStyle = `hsla(${person.hue}, 85%, 65%, 0.7)`;
    ctx.beginPath();
    ctx.arc(px, py, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();