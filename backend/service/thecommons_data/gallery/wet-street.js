ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.05);

// ---- Lookup palettes ----
const PALETTES = {
  cyber_tokyo: {
    bg: '#040711',
    fog: 'rgba(8, 20, 48, 0.65)',
    neons: ['#ff0055', '#00e5ff', '#ffbe0b', '#7928ca', '#3a86ff'],
    headlight: 'rgba(230, 245, 255, 0.95)',
    taillight: 'rgba(255, 30, 60, 0.95)'
  },
  noir_amber: {
    bg: '#080503',
    fog: 'rgba(40, 22, 10, 0.65)',
    neons: ['#ffb703', '#fb8500', '#d4a373', '#ffeedd', '#e07a5f'],
    headlight: 'rgba(255, 235, 180, 0.95)',
    taillight: 'rgba(215, 35, 20, 0.95)'
  },
  acid_rain: {
    bg: '#030806',
    fog: 'rgba(10, 35, 25, 0.65)',
    neons: ['#00f5d4', '#70e000', '#9b5de5', '#f15bb5', '#38b000'],
    headlight: 'rgba(220, 255, 240, 0.95)',
    taillight: 'rgba(255, 0, 110, 0.95)'
  },
  deep_crimson: {
    bg: '#090306',
    fog: 'rgba(45, 10, 25, 0.65)',
    neons: ['#e63946', '#ff4d6d', '#800f2f', '#48cae4', '#c9184a'],
    headlight: 'rgba(240, 230, 255, 0.95)',
    taillight: 'rgba(255, 15, 50, 0.95)'
  }
};

const paletteKey = getVar('city_palette') ?? 'cyber_tokyo';
const pal = PALETTES[paletteKey] ?? PALETTES.cyber_tokyo;
const rainInt = getVar('rain_intensity') ?? 3;
const gloss = getVar('wetness_gloss') ?? 0.8;
const trafficChoice = getVar('traffic_flow') ?? 'steady_traffic';
const windDeg = getVar('wind_angle') ?? 10;
const hasHaze = getVar('steam_haze') ?? true;

const carCounts = { quiet_night: 4, steady_traffic: 8, busy_boulevard: 14 };
const targetCars = carCounts[trafficChoice] ?? 8;

// ---- Persistent State Initialization ----
const S = room.state;
if (!S.inited) {
  S.inited = true;
  S.signs = [];
  // Skyline neon signs & window clusters (x in 0..1 relative to width)
  for (let i = 0; i < 28; i++) {
    S.signs.push({
      nx: (i * 0.036 + (i * i * 0.17) % 0.03) % 1.0,
      ny: 0.08 + (Math.sin(i * 3.7) * 0.5 + 0.5) * 0.22,
      w: 0.015 + ((i * 7) % 5) * 0.006,
      h: 0.03 + ((i * 11) % 6) * 0.014,
      colIdx: i % 5,
      flickerOffset: i * 1.618,
      flickerSpeed: 1.5 + (i % 3) * 2.1
    });
  }

  // Car pool
  S.cars = [];
  for (let i = 0; i < 16; i++) {
    S.cars.push({
      z: 0.05 + (i / 16) * 0.95,
      speed: 0.08 + ((i * 13) % 7) * 0.02,
      lane: (i % 4) - 1.5,
      isOpposing: i % 2 === 0
    });
  }

  // Rain splash ripples pool (fixed capacity ring buffer)
  S.maxRipples = 120;
  S.ripples = [];
  for (let i = 0; i < S.maxRipples; i++) {
    S.ripples.push({ active: false, x: 0, y: 0, r: 0, maxR: 20, col: '#fff', life: 0 });
  }
  S.ripHead = 0;

  // Fast rain streaks lookup
  S.rainDrops = [];
  for (let i = 0; i < 240; i++) {
    S.rainDrops.push({
      x: Math.random(),
      y: Math.random(),
      speed: 0.8 + Math.random() * 0.9,
      len: 25 + Math.random() * 35,
      thick: 0.8 + Math.random() * 1.2
    });
  }
}

const horizonY = H * 0.36;
const roadBottomY = H;
const vpX = W * 0.48;

// ---- 1. Sky & Silhouetted City Backdrop ----
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Sky gradient into road horizon
const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
skyGrad.addColorStop(0, '#000206');
skyGrad.addColorStop(0.7, pal.bg);
skyGrad.addColorStop(1, pal.fog);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, horizonY);

// Building silhouettes (low cost, atmospheric blocks)
ctx.fillStyle = '#020408';
const bCount = 18;
for (let i = 0; i < bCount; i++) {
  const bx = (i / bCount) * W * 1.1 - W * 0.05;
  const bw = (W / bCount) * 1.35;
  const bh = H * (0.16 + Math.abs(Math.sin(i * 2.3 + 1)) * 0.22);
  ctx.fillRect(bx, horizonY - bh, bw, bh);
}

// Audioreactive lightning flash on beat
if (audio && audio.beat) {
  ctx.fillStyle = 'rgba(180, 220, 255, 0.08)';
  ctx.fillRect(0, 0, W, H);
}

// ---- 2. Neon Signs & Pedestrians on Skyline ----
const bassPulse = audio ? audio.bass * 0.4 : 0;
const lightEmitters = []; // Cache emitters for asphalt reflections

for (let i = 0; i < S.signs.length; i++) {
  const s = S.signs[i];
  const col = pal.neons[s.colIdx % pal.neons.length];
  const sx = s.nx * W;
  const sy = s.ny * H;
  const sw = s.w * W;
  const sh = s.h * H;

  // Subtle flicker & audio reactivity
  const flick = Math.sin(t * s.flickerSpeed + s.flickerOffset);
  const alpha = flick < -0.92 ? 0.25 : (0.75 + bassPulse + 0.2 * Math.sin(t * 2 + i));

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 12 + bassPulse * 20;
  ctx.fillRect(sx - sw * 0.5, sy - sh * 0.5, sw, sh);
  ctx.restore();

  // Register emitter for ground reflection
  lightEmitters.push({ x: sx, col: col, baseAlpha: alpha * 0.45, w: sw * 1.2 });
}

// Connect room.people as silhouettes & umbrellas under neon awnings
if (room.people && room.people.length > 0) {
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const px = (0.08 + (i * 0.19) % 0.84) * W;
    const py = horizonY - 14;
    const userCol = `hsl(${p.hue}, 95%, 60%)`;

    ctx.save();
    ctx.fillStyle = '#06060c';
    // Umbrella dome
    ctx.beginPath();
    ctx.arc(px, py - 12, 11, Math.PI, 0, false);
    ctx.fill();
    // Person body
    ctx.fillRect(px - 3, py - 12, 6, 26);

    // Umbrella rim rim-light from connected user color
    ctx.strokeStyle = userCol;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    lightEmitters.push({ x: px, col: userCol, baseAlpha: 0.35, w: 18 });
  }
}

// ---- 3. Traffic Updates & Emitter Registration ----
for (let i = 0; i < targetCars; i++) {
  const c = S.cars[i];
  c.z += c.speed * dt * (c.isOpposing ? 1.0 : -0.7);
  if (c.z > 1.0) c.z -= 0.98;
  if (c.z < 0.02) c.z += 0.98;

  // Perspective projection
  const pz = Math.max(0.04, c.z);
  const cy = horizonY + (roadBottomY - horizonY) * (pz * pz * 0.9 + pz * 0.1);
  const laneWidth = (W * 0.42) * pz;
  const cx = vpX + c.lane * laneWidth + (c.isOpposing ? -laneWidth * 0.4 : laneWidth * 0.4);
  const scale = 0.4 + pz * 1.6;

  const col = c.isOpposing ? pal.headlight : pal.taillight;
  const isHead = c.isOpposing;

  // Car lamps (twin lights)
  const separation = 14 * scale;
  const glowRad = (isHead ? 26 : 14) * scale * (1 + bassPulse * 0.6);

  ctx.save();
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = glowRad;

  // Left & right light
  ctx.beginPath();
  ctx.arc(cx - separation, cy, 3 * scale, 0, Math.PI * 2);
  ctx.arc(cx + separation, cy, 3 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Register bright vehicle light for wet asphalt streak
  lightEmitters.push({
    x: cx,
    col: col,
    baseAlpha: isHead ? 0.75 : 0.6,
    w: separation * 2.8
  });
}

// ---- 4. Rain-Slicked Wet Asphalt Surface ----
// Deep base road gradient
const roadGrad = ctx.createLinearGradient(0, horizonY, 0, H);
roadGrad.addColorStop(0, '#05070c');
roadGrad.addColorStop(0.3, '#040508');
roadGrad.addColorStop(1, '#010204');
ctx.fillStyle = roadGrad;
ctx.fillRect(0, horizonY, W, H - horizonY);

// Asphalt texture & sheen via blended horizontal scan stripes
ctx.save();
ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
for (let y = horizonY; y < H; y += 4) {
  if ((y | 0) % 8 === 0) {
    ctx.fillRect(0, y, W, 1.2);
  }
}
ctx.restore();

// ---- 5. Vertical Streaked Reflections (The core visual) ----
// Neon and lamps melt into long downward vertical streaks, modulated by distance & puddle waves
ctx.save();
ctx.globalCompositeOperation = 'screen';

for (let i = 0; i < lightEmitters.length; i++) {
  const em = lightEmitters[i];
  const streakX = em.x;
  // Perspective spread of reflection width towards bottom
  const wTop = Math.max(3, em.w * 0.6);
  const wBottom = wTop * 3.8 * gloss;
  const totalStreakH = (H - horizonY);

  // Create vertical smeared light streak
  const refGrad = ctx.createLinearGradient(0, horizonY, 0, H);
  const alpha = em.baseAlpha * gloss;
  refGrad.addColorStop(0, 'rgba(0,0,0,0)');
  refGrad.addColorStop(0.08, em.col);
  refGrad.addColorStop(0.45, em.col);
  refGrad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = refGrad;
  ctx.globalAlpha = Math.min(0.85, alpha);

  // Draw reflection trapezoid with subtle puddle wobble
  const wobble1 = Math.sin(t * 3.5 + streakX * 0.02) * (8 * gloss);
  const wobble2 = Math.cos(t * 2.8 + streakX * 0.03) * (14 * gloss);

  ctx.beginPath();
  ctx.moveTo(streakX - wTop * 0.5, horizonY + 2);
  ctx.lineTo(streakX + wTop * 0.5, horizonY + 2);
  ctx.lineTo(streakX + wBottom * 0.5 + wobble2, H);
  ctx.lineTo(streakX - wBottom * 0.5 + wobble1, H);
  ctx.closePath();
  ctx.fill();
}
ctx.restore();

// ---- 6. Puddle Raindrop Ring Ripples (Shattering reflections) ----
// Spawn new ripples based on rain intensity
const spawnsThisFrame = Math.min(10, Math.floor(rainInt * 1.8 + (audio ? audio.treble * 5 : 0)));
for (let k = 0; k < spawnsThisFrame; k++) {
  const rip = S.ripples[S.ripHead];
  S.ripHead = (S.ripHead + 1) % S.maxRipples;
  rip.active = true;
  rip.x = Math.random() * W;
  // Weighted towards camera (bottom) for dramatic depth
  const ny = Math.pow(Math.random(), 0.65);
  rip.y = horizonY + 10 + ny * (H - horizonY - 14);
  rip.r = 1;
  // Perspective scaling for ripple radius
  const depthFactor = (rip.y - horizonY) / (H - horizonY);
  rip.maxR = 12 + depthFactor * 38;
  rip.life = 1.0;
  rip.col = (Math.random() > 0.4) ? pal.neons[(Math.random() * pal.neons.length) | 0] : '#ffffff';
}

// Render ripples: squashed concentric perspective ellipses
ctx.save();
for (let i = 0; i < S.maxRipples; i++) {
  const r = S.ripples[i];
  if (!r.active) continue;

  r.r += (r.maxR - r.r) * dt * 4.2;
  r.life -= dt * (0.8 + (1 - gloss) * 0.5);

  if (r.life <= 0.02 || r.r >= r.maxR - 0.5) {
    r.active = false;
    continue;
  }

  const alpha = r.life * 0.55;
  ctx.strokeStyle = r.col;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = Math.min(1, alpha);

  // Perspective compression: vertically flattened ellipse
  ctx.beginPath();
  ctx.ellipse(r.x, r.y, r.r, r.r * 0.28, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Second inner ring for clean water-drop interference
  if (r.r > 6) {
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.r * 0.55, r.r * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}
ctx.restore();

// ---- 7. Falling Rain Streaks ----
const windRad = (windDeg * Math.PI) / 180;
const dx = Math.tan(windRad);
const rainSpeedMult = 900 + rainInt * 220;
const dropCount = Math.floor(S.rainDrops.length * (rainInt / 5));

ctx.save();
ctx.strokeStyle = 'rgba(210, 235, 255, 0.45)';
ctx.lineWidth = 1.1;
ctx.beginPath();

for (let i = 0; i < dropCount; i++) {
  const d = S.rainDrops[i];
  d.y += d.speed * (rainSpeedMult * dt) / H;
  d.x += dx * (d.speed * 400 * dt) / W;

  if (d.y > 1.0) {
    d.y -= 1.05;
    d.x = Math.random();
  }
  if (d.x < -0.1) d.x += 1.2;
  if (d.x > 1.1) d.x -= 1.2;

  const rx1 = d.x * W;
  const ry1 = d.y * H;
  const rx2 = rx1 + dx * d.len;
  const ry2 = ry1 + d.len;

  ctx.moveTo(rx1, ry1);
  ctx.lineTo(rx2, ry2);
}
ctx.stroke();
ctx.restore();

// ---- 8. Ambient Steam Haze & Street Rim Vignette ----
if (hasHaze) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const hazeGrad = ctx.createRadialGradient(W * 0.5, horizonY + 20, 20, W * 0.5, horizonY + 40, W * 0.55);
  hazeGrad.addColorStop(0, pal.fog);
  hazeGrad.addColorStop(0.5, 'rgba(10, 18, 30, 0.25)');
  hazeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(0, horizonY - 40, W, H - horizonY + 40);
  ctx.restore();
}

// Cinematic camera vignette & dark edge framing
ctx.save();
const vig = ctx.createRadialGradient(W * 0.5, H * 0.52, H * 0.35, W * 0.5, H * 0.52, W * 0.75);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(0.7, 'rgba(0,0,0,0.3)');
vig.addColorStop(1, 'rgba(0,0,0,0.88)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);
ctx.restore();

ctx.restore();