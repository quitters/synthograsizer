ctx.save();

// --- Demoparty setup: preallocated pools & static tables in room.state ---
if (!room.state.init) {
  room.state.init = true;
  // Fixed pool of 24 concurrent bolts to eliminate per-frame allocations
  const MAX_BOLTS = 24;
  const MAX_SEGS = 400;
  room.state.bolts = [];
  for (let i = 0; i < MAX_BOLTS; i++) {
    room.state.bolts.push({
      active: false,
      life: 0,
      maxLife: 0.35,
      width: 3,
      hue: 205,
      flash: 0,
      segCount: 0,
      // Flat buffer: x0, y0, x1, y1 for each segment
      segs: new Float32Array(MAX_SEGS * 4)
    });
  }
  // Flat cloud heightmap buffer (256 samples across screen)
  room.state.cloudMap = new Float32Array(256);
  room.state.ambientFlash = 0;
  room.state.lastBeat = false;
  room.state.rngSeed = 1337;
}

// Fast LCG pseudorandom helper
let seed = (room.state.rngSeed + ((frame.t * 1000) | 0)) >>> 0;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed >>> 8) * (1 / 16777216);
}

const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

// Parameter extraction
const intensity = getVar('storm_intensity') ?? 3;
const branchFactor = getVar('branching') ?? 2;
const decayMult = getVar('decay_speed') ?? 1.5;
const cloudDensity = getVar('cloud_density') ?? 'rolling';
const palChoice = getVar('palette') ?? 'electric_blue';

const palettes = {
  electric_blue: { hue: 205, sat: '100%', glow: 'rgba(90, 180, 255, ' },
  violet_arc:    { hue: 275, sat: '100%', glow: 'rgba(190, 100, 255, ' },
  acid_green:    { hue: 135, sat: '100%', glow: 'rgba(80, 255, 140, ' },
  solar_gold:    { hue: 45,  sat: '100%', glow: 'rgba(255, 200, 70, ' }
};
const curPal = palettes[palChoice] ?? palettes.electric_blue;

// Midpoint displacement generator writing directly into a bolt buffer
function emitBolt(startX, startY, targetX, targetY, boltHue, power) {
  const pool = room.state.bolts;
  let slot = null;
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) { slot = pool[i]; break; }
  }
  if (!slot) {
    // Steal oldest
    slot = pool[0];
    for (let i = 1; i < pool.length; i++) {
      if (pool[i].life < slot.life) slot = pool[i];
    }
  }

  slot.active = true;
  slot.maxLife = Math.max(0.18, 0.45 / decayMult) * (0.8 + rnd() * 0.4);
  slot.life = slot.maxLife;
  slot.width = (2.2 + power * 2.5);
  slot.hue = boltHue;
  slot.flash = power;
  slot.segCount = 0;
  const maxS = slot.segs.length / 4;

  // Stack-based recursive midpoint displacement without call stack allocations
  // Stack stores: [x0, y0, x1, y1, depth, disp]
  const stack = [startX, startY, targetX, targetY, 0, (H * 0.16) * (0.7 + power * 0.5)];
  let sIdx = 6;

  while (sIdx > 0 && slot.segCount < maxS) {
    sIdx -= 6;
    const x0 = stack[sIdx];
    const y0 = stack[sIdx + 1];
    const x1 = stack[sIdx + 2];
    const y1 = stack[sIdx + 3];
    const depth = stack[sIdx + 4];
    const disp = stack[sIdx + 5];

    const dx = x1 - x0;
    const dy = y1 - y0;
    const distSq = dx * dx + dy * dy;

    if (depth >= 6 || distSq < 144) {
      const p = slot.segCount * 4;
      slot.segs[p] = x0;
      slot.segs[p + 1] = y0;
      slot.segs[p + 2] = x1;
      slot.segs[p + 3] = y1;
      slot.segCount++;
      continue;
    }

    // Midpoint + normal jitter
    const mx = (x0 + x1) * 0.5;
    const my = (y0 + y1) * 0.5;
    const len = Math.sqrt(distSq) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = (rnd() - 0.5) * 2 * disp;
    const cx = mx + nx * offset;
    const cy = my + ny * offset;

    // Push two halves
    const nextDisp = disp * 0.54;
    if (sIdx + 18 <= 256) {
      stack[sIdx]     = x0; stack[sIdx + 1] = y0; stack[sIdx + 2] = cx; stack[sIdx + 3] = cy;
      stack[sIdx + 4] = depth + 1; stack[sIdx + 5] = nextDisp;
      stack[sIdx + 6] = cx; stack[sIdx + 7] = cy; stack[sIdx + 8] = x1; stack[sIdx + 9] = y1;
      stack[sIdx + 10]= depth + 1; stack[sIdx + 11]= nextDisp;
      sIdx += 12;

      // Fork branch
      const branchThreshold = 0.48 - (branchFactor * 0.08);
      if (depth >= 2 && depth <= 4 && rnd() > branchThreshold && sIdx + 6 <= 256) {
        const angle = (rnd() - 0.5) * 1.2;
        const bLen = len * (0.35 + rnd() * 0.35);
        const bx = cx + (dx * Math.cos(angle) - dy * Math.sin(angle)) * (bLen / len);
        const by = cy + (dx * Math.sin(angle) + dy * Math.cos(angle)) * (bLen / len);
        stack[sIdx]     = cx; stack[sIdx + 1] = cy; stack[sIdx + 2] = bx; stack[sIdx + 3] = by;
        stack[sIdx + 4] = depth + 2; stack[sIdx + 5] = nextDisp * 0.6;
        sIdx += 6;
      }
    }
  }

  room.state.ambientFlash = Math.min(1.4, room.state.ambientFlash + 0.6 * power);
}

// --- Event & Audio Triggering ---
for (const e of room.events) {
  if (e.name === 'strike') {
    const person = room.people?.find(p => p.id === e.participantId);
    const phue = person ? person.hue : curPal.hue;
    const originX = (rnd() * 0.7 + 0.15) * W;
    const groundX = originX + (rnd() - 0.5) * W * 0.4;
    emitBolt(originX, H * 0.12, groundX, H * 0.96, phue, 1.4);
  }
}

// Audio beat & spontaneous storm strikes
const isBeat = !!audio.beat;
if (isBeat && !room.state.lastBeat) {
  const nStrikes = Math.min(4, 1 + ((audio.bass * intensity) | 0));
  for (let k = 0; k < nStrikes; k++) {
    const startRatio = (k + rnd()) / (nStrikes + 1);
    const sx = (startRatio * 0.8 + 0.1) * W;
    const tx = sx + (rnd() - 0.5) * W * 0.35;
    emitBolt(sx, H * (0.08 + rnd() * 0.1), tx, H * 0.95, curPal.hue, 0.9 + audio.level);
  }
} else if (rnd() < 0.015 * intensity) {
  const sx = (rnd() * 0.8 + 0.1) * W;
  emitBolt(sx, H * 0.1, sx + (rnd() - 0.5) * W * 0.3, H * 0.95, curPal.hue, 0.6);
}
room.state.lastBeat = isBeat;

// Ambient flash decay
room.state.ambientFlash = Math.max(0, room.state.ambientFlash - dt * decayMult * 2.2);
const flashVal = room.state.ambientFlash;

// --- Render Background & Cloudbank Illuminated from within ---
const baseDarkness = 0.08;
const bgR = Math.min(255, (10 + flashVal * 60 + (audio.bass * 20)) | 0);
const bgG = Math.min(255, (12 + flashVal * 70 + (audio.mid * 15)) | 0);
const bgB = Math.min(255, (22 + flashVal * 110 + (audio.treble * 30)) | 0);
ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
ctx.fillRect(0, 0, W, H);

// Precompute cloud ceiling profile in 256-sample buffer
const cSteps = 256;
const cStepW = W / (cSteps - 1);
const densityFactors = { mist: 0.15, rolling: 0.28, monolithic: 0.45 };
const cAmp = (densityFactors[cloudDensity] ?? 0.28) * H;
const tCloud = frame.t * 0.4;

for (let i = 0; i < cSteps; i++) {
  const nx = i * 0.04;
  // Fast layered sinusoid approximating fractals
  const h = Math.sin(nx + tCloud) * 0.5 
          + Math.sin(nx * 2.3 - tCloud * 0.7) * 0.3 
          + Math.sin(nx * 5.1 + tCloud * 1.4) * 0.2;
  room.state.cloudMap[i] = H * 0.12 + (h + 1) * 0.5 * cAmp;
}

// Draw cloud ceiling (internal glow reactive to lightning & audio)
ctx.save();
ctx.beginPath();
ctx.moveTo(0, 0);
ctx.lineTo(0, room.state.cloudMap[0]);
for (let i = 1; i < cSteps; i++) {
  ctx.lineTo(i * cStepW, room.state.cloudMap[i]);
}
ctx.lineTo(W, 0);
ctx.closePath();

const cloudGrad = ctx.createLinearGradient(0, 0, 0, H * 0.5);
const cloudLight = Math.min(0.9, 0.15 + flashVal * 0.55 + audio.mid * 0.2);
cloudGrad.addColorStop(0, `hsla(${curPal.hue}, 40%, ${(12 + cloudLight * 50) | 0}%, 0.95)`);
cloudGrad.addColorStop(0.6, `hsla(${curPal.hue}, 60%, ${(8 + cloudLight * 35) | 0}%, 0.85)`);
cloudGrad.addColorStop(1, 'rgba(5, 7, 15, 0)');
ctx.fillStyle = cloudGrad;
ctx.fill();
ctx.restore();

// --- Render Lightning Bolts (Glow & Core) ---
ctx.save();
ctx.lineCap = 'round';
ctx.lineJoin = 'miter';

for (let b = 0; b < room.state.bolts.length; b++) {
  const bolt = room.state.bolts[b];
  if (!bolt.active) continue;

  bolt.life -= dt * decayMult;
  if (bolt.life <= 0) {
    bolt.active = false;
    continue;
  }

  const alpha = Math.min(1, bolt.life / (bolt.maxLife * 0.5));
  const segs = bolt.segs;
  const count = bolt.segCount;

  // Pass 1: Additive wide diffuse glow
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = `hsla(${bolt.hue}, 100%, 65%, ${alpha * 0.4})`;
  ctx.lineWidth = bolt.width * 4;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    ctx.moveTo(segs[p], segs[p + 1]);
    ctx.lineTo(segs[p + 2], segs[p + 3]);
  }
  ctx.stroke();

  // Pass 2: Main colored shaft
  ctx.strokeStyle = `hsla(${bolt.hue}, 95%, 75%, ${alpha * 0.85})`;
  ctx.lineWidth = bolt.width * 1.8;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    ctx.moveTo(segs[p], segs[p + 1]);
    ctx.lineTo(segs[p + 2], segs[p + 3]);
  }
  ctx.stroke();

  // Pass 3: White-hot core
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
  ctx.lineWidth = Math.max(1.2, bolt.width * 0.6);
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    ctx.moveTo(segs[p], segs[p + 1]);
    ctx.lineTo(segs[p + 2], segs[p + 3]);
  }
  ctx.stroke();
}
ctx.restore();

// --- Distant Terrain Silhouette & Atmospheric Ground Fog ---
ctx.save();
ctx.fillStyle = '#040609';
ctx.beginPath();
ctx.moveTo(0, H);
ctx.lineTo(0, H * 0.92);
for (let x = 0; x <= W; x += 40) {
  const ty = H * 0.92 + Math.sin(x * 0.01) * 15 + Math.cos(x * 0.025) * 8;
  ctx.lineTo(x, ty);
}
ctx.lineTo(W, H);
ctx.closePath();
ctx.fill();

// Connected people represented as atmospheric lightning rods/beacons on the horizon
if (room.people && room.people.length > 0) {
  const pCount = room.people.length;
  const spacing = W / (pCount + 1);
  for (let idx = 0; idx < pCount; idx++) {
    const person = room.people[idx];
    const px = spacing * (idx + 1);
    const py = H * 0.91;
    const spark = (Math.sin(frame.t * 8 + idx * 3) + 1) * 0.5;
    
    // Antenna pole
    ctx.strokeStyle = '#182430';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py - 36);
    ctx.stroke();
    
    // Static coronal discharge at top
    ctx.fillStyle = `hsla(${person.hue}, 90%, 70%, ${0.5 + spark * 0.5})`;
    ctx.beginPath();
    ctx.arc(px, py - 36, 2.5 + spark * 2 + audio.treble * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
ctx.restore();

room.state.rngSeed = seed;
ctx.restore();