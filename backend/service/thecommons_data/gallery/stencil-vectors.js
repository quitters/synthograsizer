const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;

// Precomputed sine/cosine LUT and persistent memory in room.state
const LUT_SIZE = 1024;
const LUT_MASK = 1023;
const lut = room.state.lut ??= (() => {
  const arr = new Float32Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) arr[i] = Math.sin((i * Math.PI * 2) / LUT_SIZE);
  return arr;
})();
const fSin = (rad) => lut[Math.floor((rad * (LUT_SIZE / (Math.PI * 2))) % LUT_SIZE + LUT_SIZE) & LUT_MASK];
const fCos = (rad) => fSin(rad + Math.PI * 0.5);

// Vertex buffers: fixed size, reused every frame
const ptsA = room.state.ptsA ??= new Float32Array(32);
const ptsB = room.state.ptsB ??= new Float32Array(32);

// Decay beat pulse accumulator
room.state.pulse = (room.state.pulse ?? 0) * 0.88;
if (audio.beat) room.state.pulse = 1.0;
const kick = (room.state.pulse * 0.4 + (audio.bass || 0) * 0.6) * (getVar('beat_kick') ?? 1.0);

// Palette selections
const palettes = {
  cyber_mono: { colA: '#ffffff', colB: '#ffffff', strokeA: '#ffffff', strokeB: '#aaaaaa' },
  laser_neon: { colA: '#ff007f', colB: '#00ff88', strokeA: '#ff55aa', strokeB: '#66ffbb' },
  electric_cmyk: { colA: '#00f0ff', colB: '#ffee00', strokeA: '#66f5ff', strokeB: '#fff566' },
  solar_flare: { colA: '#ff5500', colB: '#0088ff', strokeA: '#ff8833', strokeB: '#55aaff' }
};
const pal = palettes[getVar('palette')] ?? palettes.cyber_mono;

// Polygon configurations (sides, star flag)
const polyDefs = {
  tri_and_quad: { sidesA: 3, starA: false, sidesB: 4, starB: false },
  pent_and_hex: { sidesA: 5, starA: false, sidesB: 6, starB: false },
  oct_and_tri: { sidesA: 8, starA: false, sidesB: 3, starB: false },
  star_and_square: { sidesA: 4, starA: true, sidesB: 4, starB: false }
};
const polyCfg = polyDefs[getVar('polygons')] ?? polyDefs.tri_and_quad;

// Motion kinematics
const motionMode = getVar('orbit_mode') ?? 'counter_spin';
const baseR = Math.min(W, H) * 0.22;
const radA = baseR * (1.0 + kick * 0.28);
const radB = baseR * (0.95 + kick * 0.22);

let xA = cx, yA = cy, xB = cx, yB = cy;
const t = frame.t * 0.75;

if (motionMode === 'counter_spin') {
  const dist = baseR * 0.82;
  xA = cx + fCos(t) * dist;
  yA = cy + fSin(t) * dist * 0.7;
  xB = cx + fCos(t + Math.PI) * dist;
  yB = cy + fSin(t + Math.PI) * dist * 0.7;
} else if (motionMode === 'figure_eight') {
  const scale = baseR * 1.0;
  xA = cx + fSin(t) * scale;
  yA = cy + fSin(t * 2.0) * scale * 0.45;
  xB = cx + fSin(t + Math.PI) * scale;
  yB = cy + fSin((t + Math.PI) * 2.0) * scale * 0.45;
} else {
  const d = fSin(t * 1.5) * (baseR * 0.9);
  xA = cx - d;
  yA = cy;
  xB = cx + d;
  yB = cy;
}

// Build polygon vertex paths into preallocated buffers
function buildPolygon(buf, count, isStar, cxPos, cyPos, radius, rot) {
  const total = isStar ? count * 2 : count;
  const step = (Math.PI * 2) / total;
  for (let i = 0; i < total; i++) {
    const r = (isStar && (i & 1)) ? radius * 0.46 : radius;
    const a = rot + i * step;
    buf[i * 2] = cxPos + fCos(a) * r;
    buf[i * 2 + 1] = cyPos + fSin(a) * r;
  }
  return total;
}

const rotA = frame.t * 0.85 + kick * 0.4;
const rotB = -frame.t * 0.65 - kick * 0.3;
const countA = buildPolygon(ptsA, polyCfg.sidesA, polyCfg.starA, xA, yA, radA, rotA);
const countB = buildPolygon(ptsB, polyCfg.sidesB, polyCfg.starB, xB, yB, radB, rotB);

function tracePoly(buffer, total) {
  ctx.beginPath();
  ctx.moveTo(buffer[0], buffer[1]);
  for (let i = 1; i < total; i++) {
    ctx.lineTo(buffer[i * 2], buffer[i * 2 + 1]);
  }
  ctx.closePath();
}

// Background fill (pure black for absolute XOR/difference fidelity)
ctx.save();
ctx.fillStyle = '#030305';
ctx.fillRect(0, 0, W, H);

// Subtle background telemetry vector grid
ctx.strokeStyle = '#0f1118';
ctx.lineWidth = 1;
ctx.beginPath();
for (let gx = 0; gx < W; gx += 80) {
  ctx.moveTo(gx, 0);
  ctx.lineTo(gx, H);
}
for (let gy = 0; gy < H; gy += 80) {
  ctx.moveTo(0, gy);
  ctx.lineTo(W, gy);
}
ctx.stroke();

// Connecting vector tether between windows
ctx.beginPath();
ctx.setLineDash([4, 4]);
ctx.moveTo(xA, yA);
ctx.lineTo(xB, yB);
ctx.strokeStyle = '#1e2436';
ctx.lineWidth = 1.5;
ctx.stroke();
ctx.setLineDash([]);

// WINDOW 1: Stripes inside Polygon A
const stripeW = getVar('stripe_density') ?? 16;
ctx.save();
tracePoly(ptsA, countA);
ctx.clip();
ctx.translate(xA, yA);
ctx.rotate(frame.t * 0.5 + (audio.mid || 0) * 0.5);
ctx.fillStyle = pal.colA;
const spanA = radA * 2.2;
for (let x = -spanA; x < spanA; x += stripeW * 2) {
  ctx.fillRect(x, -spanA, stripeW, spanA * 2);
}
ctx.restore();

// WINDOW 2: Checkerboard inside Polygon B (Overlap inverted via 'difference')
const cellW = getVar('grid_scale') ?? 28;
ctx.save();
tracePoly(ptsB, countB);
ctx.clip();
ctx.globalCompositeOperation = 'difference';
ctx.translate(xB, yB);
ctx.rotate(-frame.t * 0.4 + (audio.treble || 0) * 0.4);
ctx.fillStyle = pal.colB;
const spanB = radB * 2.2;
for (let y = -spanB; y < spanB; y += cellW) {
  const rowShift = ((Math.floor(y / cellW) % 2 + 2) % 2) * cellW;
  for (let x = -spanB + rowShift; x < spanB; x += cellW * 2) {
    ctx.fillRect(x, y, cellW, cellW);
  }
}
ctx.restore();

// Vector wireframes and laser borders
const glow = getVar('wireframe_glow') ?? 2;
ctx.lineWidth = glow;

// Polygon A outline
ctx.strokeStyle = pal.strokeA;
tracePoly(ptsA, countA);
ctx.stroke();

// Polygon B outline
ctx.strokeStyle = pal.strokeB;
tracePoly(ptsB, countB);
ctx.stroke();

// Vertex corner nodes & crosshairs
ctx.fillStyle = '#ffffff';
for (let i = 0; i < countA; i++) {
  const vx = ptsA[i * 2], vy = ptsA[i * 2 + 1];
  ctx.fillRect(vx - 2, vy - 2, 5, 5);
}
for (let i = 0; i < countB; i++) {
  const vx = ptsB[i * 2], vy = ptsB[i * 2 + 1];
  ctx.fillRect(vx - 2, vy - 2, 5, 5);
}

// Center crosshairs
const drawCross = (px, py, col) => {
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px - 6, py); ctx.lineTo(px + 6, py);
  ctx.moveTo(px, py - 6); ctx.lineTo(px, py + 6);
  ctx.stroke();
};
drawCross(xA, yA, pal.strokeA);
drawCross(xB, yB, pal.strokeB);

// Room audience telemetry: orbiting vector markers along canvas perimeter
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 32);
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const angle = (i / pCount) * Math.PI * 2 + frame.t * 0.1;
    const orbR = Math.min(W, H) * 0.46;
    const ox = cx + fCos(angle) * orbR;
    const oy = cy + fSin(angle) * orbR;
    ctx.fillStyle = `hsl(${p.hue}, 85%, 65%)`;
    ctx.fillRect(ox - 2, oy - 2, 4, 4);
  }
}

// Demoscene telemetry HUD
ctx.fillStyle = '#55607a';
ctx.font = '10px monospace';
ctx.fillText(`VEC.STENCIL // MODE: ${motionMode.toUpperCase()} // STRIPE: ${stripeW}px // GRID: ${cellW}px`, 20, 24);
ctx.fillText(`KICK: ${kick.toFixed(2)} // OVERLAP: XOR_DIFF // 60FPS`, 20, 38);

ctx.restore();