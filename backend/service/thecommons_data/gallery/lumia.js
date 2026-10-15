const count = Math.round(getVar('veil_count') ?? 5);
const speedMult = getVar('drift_speed') ?? 0.8;
const undulation = getVar('undulation') ?? 1.25;
const sheer = getVar('sheer_veil') ?? true;
const palChoice = getVar('palette') ?? 'Opalescent';
const formation = getVar('focal_depth') ?? 'Wide Floating';

const palettes = {
  'Opalescent': [
    [165, 85, 55], [195, 90, 60], [275, 75, 55], [330, 80, 65], [140, 70, 50]
  ],
  'Astral': [
    [220, 85, 55], [280, 80, 60], [340, 85, 65], [35, 95, 58], [200, 75, 50]
  ],
  'Auroral': [
    [130, 85, 50], [165, 90, 55], [50, 95, 60], [285, 70, 55], [105, 80, 52]
  ],
  'Nocturne': [
    [230, 80, 45], [260, 85, 50], [310, 70, 55], [190, 75, 48], [40, 80, 60]
  ]
};
const activePalette = palettes[palChoice] ?? palettes['Opalescent'];

// Persistent buffers and motor phase state in room.state
room.state.phases ??= new Float32Array([0.0, 1.3, 2.7, 4.1, 5.5, 0.7, 3.2, 4.8]);
room.state.ptX ??= new Float32Array(64);
room.state.ptY1 ??= new Float32Array(64);
room.state.ptY2 ??= new Float32Array(64);

// Gear ratios (Wilfred-style incommensurate periods)
const gears = [0.173, 0.239, 0.311, 0.419, 0.523, 0.647, 0.787, 0.911];
const dt = Math.min(frame.dt, 0.05);
const t = frame.t * speedMult;
const bass = audio ? audio.bass : 0;
const mid = audio ? audio.mid : 0;
const treble = audio ? audio.treble : 0;

for (let i = 0; i < 8; i++) {
  room.state.phases[i] += (gears[i] * speedMult + bass * 0.12) * dt * 2.0;
}

ctx.save();
// Soft lumia persistence trails into deep absolute black
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = sheer ? 'rgba(2, 3, 6, 0.14)' : 'rgba(2, 3, 6, 0.22)';
ctx.fillRect(0, 0, frame.width, frame.height);

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const steps = 36;

ctx.globalCompositeOperation = 'screen';

for (let v = 0; v < count; v++) {
  const pIdx = v % activePalette.length;
  const baseHsl = activePalette[pIdx];
  const p1 = room.state.phases[v % 8];
  const p2 = room.state.phases[(v + 2) % 8];
  const p3 = room.state.phases[(v + 4) % 8];

  // Harmonic ribbon path generation
  let startX, startY, endX, endY;
  if (formation === 'Diagonal Drift') {
    startX = W * 0.15;
    startY = H * 0.85;
    endX = W * 0.85;
    endY = H * 0.15;
  } else if (formation === 'Suspended Monolith') {
    startX = cx + Math.sin(p1 * 0.5) * (W * 0.1);
    startY = H * 0.92;
    endX = cx + Math.sin(p2 * 0.5) * (W * 0.1);
    endY = H * 0.08;
  } else {
    startX = W * 0.08;
    startY = cy + Math.sin(p1 * 0.4 + v) * (H * 0.25);
    endX = W * 0.92;
    endY = cy + Math.cos(p2 * 0.4 + v) * (H * 0.25);
  }

  const spanX = endX - startX;
  const spanY = endY - startY;
  const perpX = -spanY / Math.hypot(spanX, spanY);
  const perpY = spanX / Math.hypot(spanX, spanY);

  const ribbonThickness = (H * 0.18) * (1.0 + bass * 0.45);
  const warpFreq = undulation * (1.2 + v * 0.28);

  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const alongX = startX + spanX * u;
    const alongY = startY + spanY * u;

    // Folding motion: sum of non-synchronous sine mirrors
    const env = Math.sin(u * Math.PI);
    const fold1 = Math.sin(u * warpFreq * 4.0 + p1 + t * 0.3) * (H * 0.09);
    const fold2 = Math.cos(u * warpFreq * 7.0 - p2 * 1.3) * (H * 0.05 * (1 + mid * 0.5));
    const fold3 = Math.sin(u * 12.0 + p3 * 2.1) * (H * 0.02 * (1 + treble * 0.8));
    const totalDisplace = (fold1 + fold2 + fold3) * env;

    const thick = ribbonThickness * env * (0.4 + 0.6 * Math.sin(u * warpFreq * 2.5 + p2));

    const px = alongX + perpX * totalDisplace;
    const py = alongY + perpY * totalDisplace;

    room.state.ptX[s] = px;
    room.state.ptY1[s] = py - perpY * thick * 0.5;
    room.state.ptY2[s] = py + perpY * thick * 0.5;
  }

  // Draw folded veil ribbon with multi-stop glowing gradient
  const grad = ctx.createLinearGradient(startX, startY, endX, endY);
  const hueOffset = (v * 16 + bass * 25) % 360;
  const h = (baseHsl[0] + hueOffset) % 360;
  const sat = baseHsl[1];
  const lit = baseHsl[2] + treble * 10;
  const alpha = sheer ? 0.24 : 0.42;

  grad.addColorStop(0, `hsla(${h}, ${sat}%, ${lit * 0.4}%, 0)`);
  grad.addColorStop(0.3, `hsla(${(h + 15) % 360}, ${sat}%, ${lit}%, ${alpha})`);
  grad.addColorStop(0.7, `hsla(${(h - 18 + 360) % 360}, ${sat}%, ${lit * 1.1}%, ${alpha * 0.9})`);
  grad.addColorStop(1, `hsla(${h}, ${sat}%, ${lit * 0.3}%, 0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(room.state.ptX[0], room.state.ptY1[0]);
  for (let s = 1; s <= steps; s++) {
    const midX = (room.state.ptX[s - 1] + room.state.ptX[s]) * 0.5;
    const midY = (room.state.ptY1[s - 1] + room.state.ptY1[s]) * 0.5;
    ctx.quadraticCurveTo(room.state.ptX[s - 1], room.state.ptY1[s - 1], midX, midY);
  }
  ctx.lineTo(room.state.ptX[steps], room.state.ptY1[steps]);

  for (let s = steps; s >= 1; s--) {
    const midX = (room.state.ptX[s] + room.state.ptX[s - 1]) * 0.5;
    const midY = (room.state.ptY2[s] + room.state.ptY2[s - 1]) * 0.5;
    ctx.quadraticCurveTo(room.state.ptX[s], room.state.ptY2[s], midX, midY);
  }
  ctx.lineTo(room.state.ptX[0], room.state.ptY2[0]);
  ctx.closePath();
  ctx.fill();

  // Subtle radiant spine thread through the veil's core
  ctx.lineWidth = 1.4 + treble * 2.0;
  ctx.strokeStyle = `hsla(${(h + 30) % 360}, 95%, 85%, ${alpha * 0.6})`;
  ctx.beginPath();
  for (let s = 0; s <= steps; s++) {
    const mx = room.state.ptX[s];
    const my = (room.state.ptY1[s] + room.state.ptY2[s]) * 0.5;
    if (s === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
  }
  ctx.stroke();
}

// Presence nodes: gently cast connected people as floating prism motes in the curtains
if (room.people && room.people.length > 0) {
  const pLen = Math.min(room.people.length, 16);
  for (let i = 0; i < pLen; i++) {
    const person = room.people[i];
    const ph = (room.state.phases[i % 8] + i * 1.618);
    const px = cx + Math.sin(ph * 0.7) * (W * 0.38);
    const py = cy + Math.cos(ph * 0.53) * (H * 0.34);
    const rad = 28 + Math.sin(t * 2 + i) * 10 + bass * 18;

    const pGrad = ctx.createRadialGradient(px, py, 0, px, py, rad);
    pGrad.addColorStop(0, `hsla(${person.hue}, 90%, 75%, 0.45)`);
    pGrad.addColorStop(0.5, `hsla(${person.hue}, 85%, 55%, 0.15)`);
    pGrad.addColorStop(1, `hsla(${person.hue}, 80%, 40%, 0)`);

    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Wilfred proscenium vignette: ensures deep velvety blacks at room perimeter
ctx.globalCompositeOperation = 'multiply';
const vig = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.max(W, H) * 0.72);
vig.addColorStop(0, 'rgba(255, 255, 255, 1)');
vig.addColorStop(0.65, 'rgba(200, 200, 210, 0.9)');
vig.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();