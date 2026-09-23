ctx.save();

const paletteKey = getVar('palette') ?? 'dune';
const motionStyle = getVar('motion_feel') ?? 'drifting';
const numRibbons = Math.min(5, Math.max(2, getVar('ribbon_count') ?? 3));
const grainBudget = Math.min(5000, Math.max(1000, getVar('grain_density') ?? 3000));
const baseSpread = getVar('ribbon_spread') ?? 35;
const fadeAlpha = getVar('persistence') ?? 0.06;

const motionMult = motionStyle === 'surging' ? 1.6 : (motionStyle === 'hypnotic' ? 0.6 : 1.0);

// Audio hooks
const bass = audio.bass ?? 0;
const mid = audio.mid ?? 0;
const treble = audio.treble ?? 0;
const spread = baseSpread * (1.0 + bass * 0.9);

// Pre-allocate fixed state and reusable lookup tables once
const ST = room.state;
ST.t ??= 0;
ST.t += frame.dt * motionMult;

const CP_COUNT = 7;
if (!ST.ptsX) {
  ST.ptsX = new Float32Array(5 * CP_COUNT);
  ST.ptsY = new Float32Array(5 * CP_COUNT);
  // Fast sine lookup table (1024 samples)
  ST.sinLut = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    ST.sinLut[i] = Math.sin((i / 1024) * Math.PI * 2);
  }
}

// Pseudo-random fast hash (PRNG without allocations)
let seed = ((frame.t * 1000) | 0) ^ 0x9e3779b9;
function rnd() {
  seed = (seed ^ (seed << 13)) >>> 0;
  seed = (seed ^ (seed >>> 17)) >>> 0;
  seed = (seed ^ (seed << 5)) >>> 0;
  return (seed >>> 0) / 4294967296;
}

// Fading persistent canvas wash
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = `rgba(5, 6, 10, ${fadeAlpha})`;
ctx.fillRect(0, 0, frame.width, frame.height);

// Palette definitions: returns hue based on ribbon index & sample position
function getHue(ribbonIdx, u) {
  if (paletteKey === 'aurora') {
    return 130 + Math.sin(u * 6.283 + ST.t) * 45 + ribbonIdx * 35;
  } else if (paletteKey === 'spectral') {
    return (u * 360 + ribbonIdx * 50 + ST.t * 20) % 360;
  } else if (paletteKey === 'monochrome') {
    return 210;
  }
  // dune: amber, sand, terracotta
  return 28 + Math.sin(u * 3.1415 + ribbonIdx) * 18 + mid * 25;
}

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const minDim = Math.min(W, H) * 0.38;
const t = ST.t;

// Update control points for all active ribbons
for (let r = 0; r < numRibbons; r++) {
  const rOff = r * CP_COUNT;
  const rPhase = r * 1.83;
  for (let i = 0; i < CP_COUNT; i++) {
    const angle = (i / CP_COUNT) * Math.PI * 2;
    const harmonic1 = Math.sin(t * 0.55 + i * 1.3 + rPhase);
    const harmonic2 = Math.cos(t * 0.37 - i * 0.9 + rPhase * 0.7);
    const rad = minDim * (0.55 + 0.35 * harmonic1) * (1.0 + (audio.beat ? 0.08 : 0));
    const wobbleX = harmonic2 * 45 * (1.0 + mid * 0.5);
    const wobbleY = Math.sin(t * 0.81 + i * 2.1) * 35;
    ST.ptsX[rOff + i] = cx + Math.cos(angle) * rad + wobbleX;
    ST.ptsY[rOff + i] = cy + Math.sin(angle) * rad + wobbleY;
  }
}

// Light additive sand grain accumulation
ctx.globalCompositeOperation = 'lighter';

const grainsPerRibbon = (grainBudget / numRibbons) | 0;
const grainAlpha = paletteKey === 'monochrome' ? 0.12 : (0.08 + treble * 0.06);

for (let r = 0; r < numRibbons; r++) {
  const rOff = r * CP_COUNT;
  const baseH = getHue(r, 0);
  const sat = paletteKey === 'monochrome' ? '8%' : '75%';
  const lit = paletteKey === 'monochrome' ? '70%' : '58%';
  ctx.fillStyle = `hsla(${baseH | 0}, ${sat}, ${lit}, ${grainAlpha})`;

  for (let g = 0; g < grainsPerRibbon; g++) {
    // Parameter u around closed loop [0, CP_COUNT)
    const uTotal = rnd() * CP_COUNT;
    const i1 = (uTotal | 0) % CP_COUNT;
    const frac = uTotal - (uTotal | 0);
    const i0 = (i1 - 1 + CP_COUNT) % CP_COUNT;
    const i2 = (i1 + 1) % CP_COUNT;
    const i3 = (i1 + 2) % CP_COUNT;

    // Closed Catmull-Rom spline evaluation (inline for max demoscene efficiency)
    const p0x = ST.ptsX[rOff + i0], p0y = ST.ptsY[rOff + i0];
    const p1x = ST.ptsX[rOff + i1], p1y = ST.ptsY[rOff + i1];
    const p2x = ST.ptsX[rOff + i2], p2y = ST.ptsY[rOff + i2];
    const p3x = ST.ptsX[rOff + i3], p3y = ST.ptsY[rOff + i3];

    const f2 = frac * frac;
    const f3 = f2 * frac;

    // Spline point
    const px = 0.5 * ((2 * p1x) + (-p0x + p2x) * frac + (2 * p0x - 5 * p1x + 4 * p2x - p3x) * f2 + (-p0x + 3 * p1x - 3 * p2x + p3x) * f3);
    const py = 0.5 * ((2 * p1y) + (-p0y + p2y) * frac + (2 * p0y - 5 * p1y + 4 * p2y - p3y) * f2 + (-p0y + 3 * p1y - 3 * p2y + p3y) * f3);

    // Spline tangent
    const tx = 0.5 * ((-p0x + p2x) + 2 * (2 * p0x - 5 * p1x + 4 * p2x - p3x) * frac + 3 * (-p0x + 3 * p1x - 3 * p2x + p3x) * f2);
    const ty = 0.5 * ((-p0y + p2y) + 2 * (2 * p0y - 5 * p1y + 4 * p2y - p3y) * frac + 3 * (-p0y + 3 * p1y - 3 * p2y + p3y) * f2);

    const len = Math.hypot(tx, ty) || 1;
    // Normal vector perpendicular to spline curve
    const nx = -ty / len;
    const ny = tx / len;

    // Gaussian-like sand distribution across normal
    const spreadFactor = (rnd() + rnd() + rnd() - 1.5) * spread;
    const jitter = (rnd() - 0.5) * (1.5 + bass * 3.0);

    const gx = px + nx * spreadFactor + jitter;
    const gy = py + ny * spreadFactor + jitter;

    // Micro sand grains rendered as single pixel stamps
    ctx.fillRect(gx, gy, 1.25, 1.25);
  }
}

// Integrate connected room participants into the sand stream
if (room.people && room.people.length > 0) {
  const pCount = room.people.length;
  const activeCount = Math.min(pCount, 16);
  for (let k = 0; k < activeCount; k++) {
    const person = room.people[k];
    const pAngle = (k / activeCount) * Math.PI * 2 + ST.t * 0.15;
    const rDist = minDim * 0.95 + Math.sin(ST.t * 1.5 + k) * 30;
    const px = cx + Math.cos(pAngle) * rDist;
    const py = cy + Math.sin(pAngle) * rDist;
    const pHue = person.hue ?? ((k * 360 / activeCount) | 0);

    ctx.fillStyle = `hsla(${pHue}, 90%, 65%, 0.35)`;
    ctx.beginPath();
    ctx.arc(px, py, 2.5 + bass * 2.0, 0, 6.283);
    ctx.fill();
  }
}

ctx.restore();