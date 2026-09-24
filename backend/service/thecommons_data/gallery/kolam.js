ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const SAMPLES = 1200;
const DUST_MAX = 80;

// 1. Persistent buffers & state setup (zero heap alloc in hot loop)
room.state.pathX ??= new Float32Array(SAMPLES);
room.state.pathY ??= new Float32Array(SAMPLES);
room.state.dotsX ??= new Float32Array(64);
room.state.dotsY ??= new Float32Array(64);
room.state.dustX ??= new Float32Array(DUST_MAX);
room.state.dustY ??= new Float32Array(DUST_MAX);
room.state.dustVx ??= new Float32Array(DUST_MAX);
room.state.dustVy ??= new Float32Array(DUST_MAX);
room.state.dustLife ??= new Float32Array(DUST_MAX);
room.state.dustHead ??= 0;
room.state.dotsCount ??= 0;
room.state.progress ??= 0;
room.state.mode ??= 'drawing';
room.state.holdTimer ??= 0;
room.state.patternIdx ??= 0;
room.state.cachedKey ??= '';

// 2. Resolve controls
const styleKey = getVar('pattern_style') ?? 'brahma_mudi';
const flourKey = getVar('flour_texture') ?? 'pure_rice';
const floorKey = getVar('floor_tone') ?? 'terracotta';
const gridKey = getVar('grid_density') ?? 'classic_5';
const drawSpeed = getVar('draw_speed') ?? 0.8;
const lineWeight = getVar('line_weight') ?? 4;
const holdDuration = getVar('hold_time') ?? 2.0;

const STYLES = {
  brahma_mudi: { c: [0.46, 0.36, 0.22, 0.14, 0.06], w: [1, -3, 5, -7, 9] },
  kamala:      { c: [0.54, 0.38, 0.24, 0.08, 0.12], w: [1, -3, 5, -7, 9] },
  nakshatra:   { c: [0.40, 0.24, 0.34, 0.18, 0.08], w: [1, -3, 5, -7, 9] },
  ananta:      { c: [0.38, 0.36, 0.16, 0.22, 0.10], w: [1, -3, 5, -7, -11] },
  sahasra:     { c: [0.32, 0.28, 0.26, 0.18, 0.12], w: [1, -3, 5, -7, 9] }
};
const STYLE_KEYS = ['brahma_mudi', 'kamala', 'nakshatra', 'ananta', 'sahasra'];

const GRIDS = {
  classic_5: 2,
  extended_7: 3,
  dense_9: 4
};
const gridSpan = GRIDS[gridKey] ?? 2;

// 3. Rebuild curve & dot geometry when pattern or size changes
const R = Math.min(W, H) * 0.38;
const effectiveStyle = (room.state.mode === 'holding' || room.state.progress > 0)
  ? styleKey
  : STYLE_KEYS[room.state.patternIdx % STYLE_KEYS.length];
const stateKey = `${effectiveStyle}_${gridKey}_${W}_${H}`;

if (room.state.cachedKey !== stateKey) {
  room.state.cachedKey = stateKey;
  const cfg = STYLES[effectiveStyle] ?? STYLES.brahma_mudi;
  const c = cfg.c;
  const wArr = cfg.w;
  const numTerms = c.length;

  // D4 symmetric closed curve via harmonic odd modes (1, -3, 5, -7...)
  for (let i = 0; i < SAMPLES; i++) {
    const u = (i / SAMPLES) * Math.PI * 2;
    let px = 0;
    let py = 0;
    for (let k = 0; k < numTerms; k++) {
      const ang = wArr[k] * u;
      px += c[k] * Math.cos(ang);
      py += c[k] * Math.sin(ang);
    }
    room.state.pathX[i] = cx + px * R;
    room.state.pathY[i] = cy + py * R;
  }

  // Pulli (dots) grid: diamond lattice inside boundary
  let dCount = 0;
  const spacing = (R * 1.05) / (gridSpan + 0.6);
  for (let gx = -gridSpan; gx <= gridSpan; gx++) {
    for (let gy = -gridSpan; gy <= gridSpan; gy++) {
      if (Math.abs(gx) + Math.abs(gy) <= gridSpan + 1) {
        room.state.dotsX[dCount] = cx + gx * spacing;
        room.state.dotsY[dCount] = cy + gy * spacing;
        dCount++;
      }
    }
  }
  room.state.dotsCount = dCount;
}

// 4. Progress & State machine (draw -> complete hold -> next)
if (room.state.mode === 'drawing') {
  room.state.progress += (frame.dt * drawSpeed * 0.28);
  if (room.state.progress >= 1) {
    room.state.progress = 1;
    room.state.mode = 'holding';
    room.state.holdTimer = 0;
  }
} else {
  room.state.holdTimer += frame.dt;
  if (room.state.holdTimer >= holdDuration) {
    room.state.patternIdx++;
    room.state.progress = 0;
    room.state.mode = 'drawing';
    room.state.cachedKey = ''; // trigger regenerate for next pattern
  }
}

// 5. Palette setup
const FLOORS = {
  terracotta:      { c0: '#2b120c', c1: '#110604', ring: 'rgba(215, 120, 80, 0.08)' },
  temple_stone:    { c0: '#181b20', c1: '#07080a', ring: 'rgba(140, 165, 195, 0.08)' },
  twilight_indigo: { c0: '#101526', c1: '#04060c', ring: 'rgba(110, 140, 230, 0.08)' }
};
const floor = FLOORS[floorKey] ?? FLOORS.terracotta;

const FLOURS = {
  pure_rice:     { core: 'rgba(255, 253, 246, 0.96)', haze: 'rgba(255, 248, 238, 0.24)', glow: 'rgba(255, 245, 225, 0.45)', dot: 'rgba(255, 245, 230, 0.85)' },
  turmeric_gold: { core: 'rgba(255, 244, 185, 0.96)', haze: 'rgba(255, 220, 110, 0.26)', glow: 'rgba(255, 205, 70, 0.50)',  dot: 'rgba(255, 230, 130, 0.90)' },
  kumkum_tint:   { core: 'rgba(255, 235, 240, 0.96)', haze: 'rgba(255, 140, 160, 0.26)', glow: 'rgba(255, 110, 130, 0.50)', dot: 'rgba(255, 190, 200, 0.90)' }
};
const flour = FLOURS[flourKey] ?? FLOURS.pure_rice;

// 6. Floor pavement background
const bgGrad = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.max(W, H) * 0.7);
bgGrad.addColorStop(0, floor.c0);
bgGrad.addColorStop(1, floor.c1);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Subtle sacred geometry ground guides
ctx.strokeStyle = floor.ring;
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2);
ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
ctx.stroke();

// 7. Pulli (dots grid)
const dCount = room.state.dotsCount;
const dotPulse = 1 + audio.treble * 0.35;
ctx.fillStyle = flour.dot;
for (let i = 0; i < dCount; i++) {
  const dx = room.state.dotsX[i];
  const dy = room.state.dotsY[i];
  ctx.beginPath();
  ctx.arc(dx, dy, (lineWeight * 0.65) * dotPulse, 0, Math.PI * 2);
  ctx.fill();
}

// 8. Rice flour looping line
const activeCount = Math.max(2, Math.floor(room.state.progress * SAMPLES));
const pX = room.state.pathX;
const pY = room.state.pathY;

ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// Holding aura or drawing dust haze
const isHolding = (room.state.mode === 'holding');
const pulseScale = isHolding ? (1.0 + Math.sin(frame.t * 3) * 0.015 + audio.bass * 0.02) : 1.0;

if (isHolding) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulseScale, pulseScale);
  ctx.translate(-cx, -cy);
  ctx.shadowBlur = 14 + audio.bass * 22;
  ctx.shadowColor = flour.glow;
}

// Flour powdery haze (outer pass)
ctx.strokeStyle = flour.haze;
ctx.lineWidth = lineWeight * (2.2 + audio.bass * 0.4);
ctx.beginPath();
ctx.moveTo(pX[0], pY[0]);
for (let i = 1; i < activeCount; i++) {
  ctx.lineTo(pX[i], pY[i]);
}
if (isHolding) ctx.closePath();
ctx.stroke();

// Solid white chalk core (inner pass)
ctx.strokeStyle = flour.core;
ctx.lineWidth = lineWeight * (1.0 + audio.bass * 0.25);
ctx.beginPath();
ctx.moveTo(pX[0], pY[0]);
for (let i = 1; i < activeCount; i++) {
  ctx.lineTo(pX[i], pY[i]);
}
if (isHolding) ctx.closePath();
ctx.stroke();

if (isHolding) {
  ctx.restore();
}

// 9. Drawing head & rice flour dust particles
const headIdx = activeCount - 1;
const hx = pX[headIdx];
const hy = pY[headIdx];

if (!isHolding) {
  // Spawn flour grains at leading hand position
  const spawnCount = audio.beat ? 3 : 1;
  for (let s = 0; s < spawnCount; s++) {
    const di = room.state.dustHead % DUST_MAX;
    const ang = Math.random() * Math.PI * 2;
    const spd = (12 + audio.bass * 35) * (0.4 + Math.random() * 0.6);
    room.state.dustX[di] = hx + (Math.random() - 0.5) * 6;
    room.state.dustY[di] = hy + (Math.random() - 0.5) * 6;
    room.state.dustVx[di] = Math.cos(ang) * spd;
    room.state.dustVy[di] = Math.sin(ang) * spd;
    room.state.dustLife[di] = 1.0;
    room.state.dustHead++;
  }

  // Flour dropping pinch tip
  ctx.fillStyle = flour.core;
  ctx.beginPath();
  ctx.arc(hx, hy, lineWeight * 1.3 + audio.bass * 2, 0, Math.PI * 2);
  ctx.fill();
}

// Update and render flour motes
ctx.fillStyle = flour.core;
for (let i = 0; i < DUST_MAX; i++) {
  let life = room.state.dustLife[i];
  if (life > 0) {
    life -= frame.dt * 1.8;
    room.state.dustLife[i] = life;
    room.state.dustX[i] += room.state.dustVx[i] * frame.dt;
    room.state.dustY[i] += room.state.dustVy[i] * frame.dt;
    room.state.dustVx[i] *= 0.91;
    room.state.dustVy[i] *= 0.91;

    ctx.globalAlpha = Math.max(0, life * 0.65);
    ctx.beginPath();
    ctx.arc(room.state.dustX[i], room.state.dustY[i], 1.2 + life * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
ctx.globalAlpha = 1.0;

// 10. Room attendees as traditional outer border bindus
const people = room.people ?? [];
const attendeeCount = Math.max(8, Math.min(people.length, 32));
const borderR = R * 1.18;
for (let i = 0; i < attendeeCount; i++) {
  const ang = (i / attendeeCount) * Math.PI * 2 + (frame.t * 0.04);
  const bx = cx + Math.cos(ang) * borderR;
  const by = cy + Math.sin(ang) * borderR;
  const pColor = (people[i] && people[i].hue != null)
    ? `hsla(${people[i].hue}, 80%, 75%, 0.8)`
    : flour.dot;

  ctx.fillStyle = pColor;
  ctx.beginPath();
  ctx.arc(bx, by, 2.2 + audio.mid * 1.5, 0, Math.PI * 2);
  ctx.fill();
}

ctx.restore();