ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const minDim = Math.min(W, H);
const globeR = minDim * 0.42;
const coreR = globeR * 0.18;

// Pre-allocated persistent state in room.state
room.state.bolts ??= [];
room.state.touchAngle ??= 0;
room.state.touchStrength ??= 0;
room.state.smoothBass ??= 0;
room.state.ptPool ??= new Float32Array(256 * 2); // reuse coords buffer

// Smooth audio tracking
room.state.smoothBass += (audio.bass - room.state.smoothBass) * 0.25;
const bassHit = room.state.smoothBass;

// Variables & lookups
const gas = getVar('gas_type') ?? 'Violet Xenon';
const numBolts = Math.round(getVar('filament_count') ?? 16);
const energy = getVar('energy_level') ?? 1.2;
const touchMode = getVar('touch_mode') ?? 'Beat Clustered';
const showRim = getVar('rim_glow') ?? true;

const palettes = {
  'Violet Xenon': { core: '#ffffff', mid: '#b24bf3', edge: '#4a159d', tint: [180, 75, 243] },
  'Neon Flame':   { core: '#fff5ea', mid: '#ff3d00', edge: '#a800ff', tint: [255, 70, 20] },
  'Krypton Ice':  { core: '#f0ffff', mid: '#00e5ff', edge: '#002699', tint: [0, 229, 255] },
  'Emerald Ray':  { core: '#f5fff8', mid: '#00ff88', edge: '#7b00ff', tint: [0, 255, 140] }
};
const pal = palettes[gas] ?? palettes['Violet Xenon'];

// Background: deep dark glass chamber with fading persist trails
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = 'rgba(5, 3, 10, 0.28)';
ctx.fillRect(0, 0, W, H);

// Maintain bolts array up to numBolts
const bolts = room.state.bolts;
while (bolts.length < numBolts) {
  bolts.push({
    baseAngle: Math.random() * Math.PI * 2,
    targetAngle: Math.random() * Math.PI * 2,
    speed: (Math.random() * 0.4 + 0.1) * (Math.random() < 0.5 ? -1 : 1),
    life: Math.random(),
    subTendrils: Math.floor(Math.random() * 3) + 1,
    noiseOffset: Math.random() * 100
  });
}
if (bolts.length > numBolts) bolts.length = numBolts;

// Touch point / convergence logic
if (touchMode === 'Crowd Touch' && room.people && room.people.length > 0) {
  const pIdx = Math.floor((frame.t * 0.3) % room.people.length);
  const p = room.people[pIdx];
  const targetA = ((p.hue || 0) / 360) * Math.PI * 2;
  room.state.touchAngle += (targetA - room.state.touchAngle) * 0.08;
  room.state.touchStrength = 0.8 + bassHit * 0.4;
} else if (touchMode === 'Wandering Hand') {
  room.state.touchAngle = Math.sin(frame.t * 0.7) * 1.8 + Math.PI * 0.25;
  room.state.touchStrength = 0.65 + Math.sin(frame.t * 2.1) * 0.25 + bassHit * 0.3;
} else {
  // Beat Clustered default: snaps and gathers tightly on beats
  if (audio.beat) {
    room.state.touchAngle = (room.state.touchAngle + Math.PI * 0.55 + Math.random() * 0.8) % (Math.PI * 2);
    room.state.touchStrength = 1.0;
  }
  room.state.touchStrength += (bassHit * 0.9 - room.state.touchStrength) * 0.15;
}

const touchA = room.state.touchAngle;
const touchP = Math.min(1.0, Math.max(0.0, room.state.touchStrength));

// 1. Draw outer glass sphere shell
ctx.save();
if (showRim) {
  const rimGrad = ctx.createRadialGradient(cx, cy, globeR * 0.88, cx, cy, globeR * 1.02);
  rimGrad.addColorStop(0, 'rgba(10, 8, 25, 0)');
  rimGrad.addColorStop(0.85, 'rgba(40, 25, 60, 0.25)');
  rimGrad.addColorStop(0.98, `rgba(${pal.tint[0]}, ${pal.tint[1]}, ${pal.tint[2]}, 0.45)`);
  rimGrad.addColorStop(1, 'rgba(2, 1, 8, 0.9)');
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, globeR * 1.02, 0, Math.PI * 2);
  ctx.fill();
}

// 2. Draw Central Electrode
const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, coreR * 1.2);
coreGrad.addColorStop(0, '#ffffff');
coreGrad.addColorStop(0.3, pal.mid);
coreGrad.addColorStop(0.7, '#140822');
coreGrad.addColorStop(1, 'rgba(5, 2, 10, 0)');
ctx.fillStyle = coreGrad;
ctx.beginPath();
ctx.arc(cx, cy, coreR * 1.25, 0, Math.PI * 2);
ctx.fill();

const coreSolid = ctx.createRadialGradient(cx - coreR * 0.25, cy - coreR * 0.25, 1, cx, cy, coreR);
coreSolid.addColorStop(0, '#352545');
coreSolid.addColorStop(0.6, '#0f0518');
coreSolid.addColorStop(1, '#000000');
ctx.fillStyle = coreSolid;
ctx.beginPath();
ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// Helper to draw lightning branch into canvas
const drawBranch = (startX, startY, endX, endY, segments, jitter, width, alpha, color) => {
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  let prevX = startX;
  let prevY = startY;
  const dx = (endX - startX) / segments;
  const dy = (endY - startY) / segments;
  const normalX = -dy;
  const normalY = dx;
  const len = Math.hypot(normalX, normalY) || 1;
  const nx = normalX / len;
  const ny = normalY / len;

  for (let s = 1; s < segments; s++) {
    const progress = s / segments;
    // envelope: quiet near ends, wild in middle
    const env = Math.sin(progress * Math.PI);
    const disp = (Math.sin(s * 7.7 + frame.t * 31.0 + startX) * 0.5 + (Math.random() - 0.5)) * jitter * env;
    const px = startX + dx * s + nx * disp;
    const py = startY + dy * s + ny * disp;
    ctx.lineTo(px, py);
    prevX = px;
    prevY = py;
  }
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.stroke();
};

// 3. Draw plasma filaments in additive blend
ctx.save();
ctx.globalCompositeOperation = 'lighter';

const t = frame.t;
for (let i = 0; i < bolts.length; i++) {
  const b = bolts[i];
  b.baseAngle += b.speed * (0.012 + audio.mid * 0.02);
  
  // Pull tendrils toward touch / beat attractor
  let angleDiff = touchA - b.baseAngle;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

  const attraction = touchP * 0.68;
  const finalAngle = b.baseAngle + angleDiff * attraction + Math.sin(t * 5.0 + i) * 0.08 * energy;

  // Electrode origin with slight jitter
  const sx = cx + Math.cos(finalAngle) * (coreR * 0.85);
  const sy = cy + Math.sin(finalAngle) * (coreR * 0.85);

  // Outer contact point on sphere wall
  const arcLen = globeR * (0.97 + Math.sin(t * 12 + i) * 0.015);
  const ex = cx + Math.cos(finalAngle) * arcLen;
  const ey = cy + Math.sin(finalAngle) * arcLen;

  const boltJitter = (18 + audio.treble * 22) * energy;
  const segments = 18;

  // Multi-pass glow hierarchy (halo -> core -> white hot filament)
  // Pass 1: Outer wide halo
  drawBranch(sx, sy, ex, ey, segments, boltJitter * 1.1, 7.0, 0.18 + audio.treble * 0.15, pal.edge);
  // Pass 2: Main bright plasma arc
  drawBranch(sx, sy, ex, ey, segments, boltJitter, 2.8, 0.75, pal.mid);
  // Pass 3: Searing hot white core
  drawBranch(sx, sy, ex, ey, segments, boltJitter * 0.9, 1.1, 0.95, pal.core);

  // Secondary forking tendrils
  if (b.subTendrils > 1) {
    const forkProg = 0.45 + (i % 3) * 0.12;
    const forkX = sx + (ex - sx) * forkProg + (Math.random() - 0.5) * 8;
    const forkY = sy + (ey - sy) * forkProg + (Math.random() - 0.5) * 8;
    const sideAngle = finalAngle + ((i % 2 === 0 ? 0.35 : -0.35) * (0.6 + energy * 0.4));
    const forkEx = cx + Math.cos(sideAngle) * (globeR * 0.94);
    const forkEy = cy + Math.sin(sideAngle) * (globeR * 0.94);
    
    drawBranch(forkX, forkY, forkEx, forkEy, 10, boltJitter * 0.7, 3.5, 0.18, pal.edge);
    drawBranch(forkX, forkY, forkEx, forkEy, 10, boltJitter * 0.7, 1.2, 0.65, pal.mid);
  }

  // Contact flash splash at the glass wall
  const spotGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, 18 + bassHit * 14);
  spotGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  spotGrad.addColorStop(0.3, `rgba(${pal.tint[0]}, ${pal.tint[1]}, ${pal.tint[2]}, 0.6)`);
  spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = spotGrad;
  ctx.beginPath();
  ctx.arc(ex, ey, 22 + bassHit * 16, 0, Math.PI * 2);
  ctx.fill();
}

// Touch point attractor glow on the glass surface
if (touchP > 0.05) {
  const tx = cx + Math.cos(touchA) * globeR;
  const ty = cy + Math.sin(touchA) * globeR;
  const touchBloom = ctx.createRadialGradient(tx, ty, 2, tx, ty, 50 * touchP + bassHit * 30);
  touchBloom.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  touchBloom.addColorStop(0.25, `rgba(${pal.tint[0]}, ${pal.tint[1]}, ${pal.tint[2]}, 0.8)`);
  touchBloom.addColorStop(0.65, `rgba(${pal.tint[0]}, ${pal.tint[1]}, ${pal.tint[2]}, 0.2)`);
  touchBloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = touchBloom;
  ctx.beginPath();
  ctx.arc(tx, ty, 65 * touchP + bassHit * 35, 0, Math.PI * 2);
  ctx.fill();
}

// Glass curved surface highlight reflection
ctx.globalCompositeOperation = 'screen';
ctx.lineWidth = 2.5;
ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
ctx.beginPath();
ctx.arc(cx - globeR * 0.06, cy - globeR * 0.06, globeR * 0.95, -Math.PI * 0.75, -Math.PI * 0.25);
ctx.stroke();

ctx.restore();
ctx.restore();