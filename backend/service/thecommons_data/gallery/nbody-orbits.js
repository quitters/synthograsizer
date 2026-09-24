ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const dt = Math.min(frame.dt, 0.033);

// --- State Initialization (Fixed Buffers, Zero Hot Allocations) ---
const MAX_PLANETS = 140;
const TRAIL_LEN = 18;

if (!room.state.x) {
  room.state.x = new Float32Array(MAX_PLANETS);
  room.state.y = new Float32Array(MAX_PLANETS);
  room.state.vx = new Float32Array(MAX_PLANETS);
  room.state.vy = new Float32Array(MAX_PLANETS);
  room.state.hue = new Float32Array(MAX_PLANETS);
  room.state.life = new Float32Array(MAX_PLANETS);
  room.state.active = new Uint8Array(MAX_PLANETS);
  room.state.trailX = new Float32Array(MAX_PLANETS * TRAIL_LEN);
  room.state.trailY = new Float32Array(MAX_PLANETS * TRAIL_LEN);
  room.state.trailHead = new Uint8Array(MAX_PLANETS);
  room.state.pulses = [];
  room.state.nextSlot = 0;
  room.state.seedTimer = 0;

  // Seed initial constellation
  for (let i = 0; i < 48; i++) {
    const slot = i;
    const ang = (i / 48) * Math.PI * 2;
    const r = 180 + (i % 6) * 45;
    room.state.x[slot] = cx + Math.cos(ang) * r;
    room.state.y[slot] = cy + Math.sin(ang) * r;
    const spd = Math.sqrt(180000 / (r + 10));
    room.state.vx[slot] = -Math.sin(ang) * spd;
    room.state.vy[slot] = Math.cos(ang) * spd;
    room.state.hue[slot] = (i * 19) % 360;
    room.state.life[slot] = 1.0;
    room.state.active[slot] = 1;
    for (let k = 0; k < TRAIL_LEN; k++) {
      const idx = slot * TRAIL_LEN + k;
      room.state.trailX[idx] = room.state.x[slot];
      room.state.trailY[idx] = room.state.y[slot];
    }
  }
}

// Controls & Fallbacks
const sunsMode = getVar('suns_mode') ?? 'Binary Dance';
const trailStyle = getVar('trail_style') ?? 'Phosphor';
const gScale = getVar('gravity_strength') ?? 1.25;

// Canvas Darkening Trail Pass
const fadeAlphas = { Phosphor: 0.18, 'Neon Starlight': 0.12, 'Deep Ion': 0.26 };
ctx.fillStyle = `rgba(5, 7, 14, ${fadeAlphas[trailStyle] ?? 0.16})`;
ctx.fillRect(0, 0, W, H);

// --- Suns Simulation ---
const t = frame.t;
const bassBoost = (audio?.bass ?? 0) * 0.45;
let sunCount = 2;
const suns = room.state.sunBuf ?? [{ x: 0, y: 0, m: 0, h: 45 }, { x: 0, y: 0, m: 0, h: 200 }, { x: 0, y: 0, m: 0, h: 320 }];
room.state.sunBuf = suns;

if (sunsMode === 'Chaotic Trio') {
  sunCount = 3;
  const rad = 130 + Math.sin(t * 0.8) * 40;
  for (let s = 0; s < 3; s++) {
    const ang = t * 0.7 + (s * Math.PI * 2) / 3;
    suns[s].x = cx + Math.cos(ang) * rad + Math.sin(t * 1.5 + s) * 25;
    suns[s].y = cy + Math.sin(ang) * rad * 0.75 + Math.cos(t * 1.3 + s) * 25;
    suns[s].m = (140000 + (audio?.bass ?? 0) * 80000) * gScale;
    suns[s].h = (30 + s * 115) % 360;
  }
} else if (sunsMode === 'Pulsar Twins') {
  sunCount = 2;
  const rad = 90 + Math.sin(t * 3.0) * 20;
  const ang = t * 2.2;
  suns[0].x = cx + Math.cos(ang) * rad;
  suns[0].y = cy + Math.sin(ang) * rad;
  suns[0].m = (190000 + Math.sin(t * 12) * 50000) * gScale;
  suns[0].h = (t * 80) % 360;
  suns[1].x = cx - Math.cos(ang) * rad;
  suns[1].y = cy - Math.sin(ang) * rad;
  suns[1].m = suns[0].m;
  suns[1].h = (suns[0].h + 180) % 360;
} else {
  // Binary Dance
  sunCount = 2;
  const rad = 140 + Math.cos(t * 0.4) * 30;
  const ang = t * 0.9;
  suns[0].x = cx + Math.cos(ang) * rad;
  suns[0].y = cy + Math.sin(ang) * rad * 0.8;
  suns[0].m = (175000 + bassBoost * 100000) * gScale;
  suns[0].h = 38;
  suns[1].x = cx - Math.cos(ang) * rad;
  suns[1].y = cy - Math.sin(ang) * rad * 0.8;
  suns[1].m = (155000 + bassBoost * 100000) * gScale;
  suns[1].h = 195;
}

// Helper to spawn a planet
function spawnPlanet(targetHue) {
  let slot = -1;
  for (let i = 0; i < MAX_PLANETS; i++) {
    if (!room.state.active[i]) { slot = i; break; }
  }
  if (slot === -1) {
    slot = room.state.nextSlot;
    room.state.nextSlot = (room.state.nextSlot + 1) % MAX_PLANETS;
  }

  const edge = Math.floor(Math.random() * 4);
  let px = 0, py = 0;
  if (edge === 0) { px = Math.random() * W; py = 10; }
  else if (edge === 1) { px = W - 10; py = Math.random() * H; }
  else if (edge === 2) { px = Math.random() * W; py = H - 10; }
  else { px = 10; py = Math.random() * H; }

  const dx = cx - px;
  const dy = cy - py;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = 75 + Math.random() * 95;
  // Tangential injection for orbital insertion
  const sign = Math.random() > 0.5 ? 1 : -1;
  room.state.x[slot] = px;
  room.state.y[slot] = py;
  room.state.vx[slot] = (dx / dist) * speed * 0.55 + (-dy / dist) * speed * 0.85 * sign;
  room.state.vy[slot] = (dy / dist) * speed * 0.55 + (dx / dist) * speed * 0.85 * sign;
  room.state.hue[slot] = targetHue;
  room.state.life[slot] = 1.0;
  room.state.active[slot] = 1;
  room.state.trailHead[slot] = 0;

  for (let k = 0; k < TRAIL_LEN; k++) {
    const idx = slot * TRAIL_LEN + k;
    room.state.trailX[idx] = px;
    room.state.trailY[idx] = py;
  }
}

// --- Handle Actions ---
if (room.events) {
  for (const e of room.events) {
    if (e.name === 'launch') {
      const p = room.people?.find(person => person.id === e.participantId);
      spawnPlanet(p ? p.hue : Math.floor(Math.random() * 360));
    } else if (e.name === 'shockwave') {
      if (room.state.pulses.length < 8) {
        room.state.pulses.push({ x: cx, y: cy, r: 10, maxR: Math.max(W, H) * 0.7, t: 1.0 });
      }
    }
  }
}

// Audio beat auto-pulse
if (audio?.beat && room.state.pulses.length < 4) {
  room.state.pulses.push({ x: cx, y: cy, r: 20, maxR: Math.min(W, H) * 0.45, t: 0.7 });
}

// Auto-replenish if quiet
room.state.seedTimer += dt;
let activeCount = 0;
for (let i = 0; i < MAX_PLANETS; i++) if (room.state.active[i]) activeCount++;
if (activeCount < 28 && room.state.seedTimer > 0.2) {
  const pList = room.people ?? [];
  const p = pList.length > 0 ? pList[Math.floor(Math.random() * pList.length)] : null;
  spawnPlanet(p ? p.hue : Math.random() * 360);
  room.state.seedTimer = 0;
}

// --- Update Pulses ---
for (let i = room.state.pulses.length - 1; i >= 0; i--) {
  const pulse = room.state.pulses[i];
  pulse.r += 620 * dt;
  pulse.t -= dt * 1.2;
  if (pulse.t <= 0 || pulse.r >= pulse.maxR) {
    room.state.pulses.splice(i, 1);
  }
}

// --- Physics Update ---
const softSq = 900; // Softening parameter to prevent infinity slingshots
const boundMargin = 120;

for (let i = 0; i < MAX_PLANETS; i++) {
  if (!room.state.active[i]) continue;

  let px = room.state.x[i];
  let py = room.state.y[i];
  let pvx = room.state.vx[i];
  let pvy = room.state.vy[i];

  // Gravitational attraction from suns
  for (let s = 0; s < sunCount; s++) {
    const sx = suns[s].x;
    const sy = suns[s].y;
    const dx = sx - px;
    const dy = sy - py;
    const r2 = dx * dx + dy * dy + softSq;
    const invR = 1 / Math.sqrt(r2);
    const f = (suns[s].m / r2) * invR * dt;
    pvx += dx * f;
    pvy += dy * f;
  }

  // Shockwave kicks
  for (let pIdx = 0; pIdx < room.state.pulses.length; pIdx++) {
    const pulse = room.state.pulses[pIdx];
    const pdx = px - pulse.x;
    const pdy = py - pulse.y;
    const pDist = Math.hypot(pdx, pdy);
    if (Math.abs(pDist - pulse.r) < 35 && pDist > 1) {
      const kick = (600 / pDist) * pulse.t;
      pvx += (pdx / pDist) * kick;
      pvy += (pdy / pDist) * kick;
    }
  }

  // Damping limit to stabilize orbit escapes
  pvx *= 0.9992;
  pvy *= 0.9992;

  px += pvx * dt;
  py += pvy * dt;

  // Stray culling
  if (px < -boundMargin || px > W + boundMargin || py < -boundMargin || py > H + boundMargin) {
    room.state.active[i] = 0;
    continue;
  }

  // Store trail in ring-buffer
  let head = (room.state.trailHead[i] + 1) % TRAIL_LEN;
  room.state.trailHead[i] = head;
  const tBase = i * TRAIL_LEN + head;
  room.state.trailX[tBase] = px;
  room.state.trailY[tBase] = py;

  room.state.x[i] = px;
  room.state.y[i] = py;
  room.state.vx[i] = pvx;
  room.state.vy[i] = pvy;
}

// --- Render Trails & Planets ---
ctx.globalCompositeOperation = 'lighter';

for (let i = 0; i < MAX_PLANETS; i++) {
  if (!room.state.active[i]) continue;

  const phue = room.state.hue[i];
  const head = room.state.trailHead[i];
  const base = i * TRAIL_LEN;

  // Draw trail ribbon
  ctx.beginPath();
  const hX = room.state.trailX[base + head];
  const hY = room.state.trailY[base + head];
  ctx.moveTo(hX, hY);

  for (let k = 1; k < TRAIL_LEN; k++) {
    const idx = base + ((head - k + TRAIL_LEN) % TRAIL_LEN);
    ctx.lineTo(room.state.trailX[idx], room.state.trailY[idx]);
  }

  ctx.strokeStyle = `hsla(${phue}, 85%, 60%, 0.45)`;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Planet Core
  ctx.fillStyle = `hsl(${phue}, 95%, 75%)`;
  ctx.beginPath();
  ctx.arc(hX, hY, 2.8 + (audio?.treble ?? 0) * 1.5, 0, Math.PI * 2);
  ctx.fill();
}

// --- Render Suns ---
for (let s = 0; s < sunCount; s++) {
  const sun = suns[s];
  const baseRad = (sunsMode === 'Pulsar Twins' ? 18 : 28) + bassBoost * 22;

  // Corona Glow
  const grad = ctx.createRadialGradient(sun.x, sun.y, baseRad * 0.15, sun.x, sun.y, baseRad * 3.6);
  grad.addColorStop(0, `hsla(${sun.h}, 100%, 95%, 0.9)`);
  grad.addColorStop(0.3, `hsla(${sun.h}, 90%, 60%, 0.45)`);
  grad.addColorStop(0.7, `hsla(${sun.h}, 100%, 40%, 0.12)`);
  grad.addColorStop(1, 'transparent');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, baseRad * 3.6, 0, Math.PI * 2);
  ctx.fill();

  // Hot Core
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, baseRad * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

// --- Render Shockwave Rings ---
for (let i = 0; i < room.state.pulses.length; i++) {
  const p = room.state.pulses[i];
  ctx.strokeStyle = `rgba(180, 220, 255, ${Math.max(0, p.t * 0.7)})`;
  ctx.lineWidth = 2.5 + p.t * 3.0;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.stroke();
}

// --- Minimal Telemetry (Demoscene Aesthetic) ---
ctx.globalCompositeOperation = 'source-over';
ctx.font = '11px monospace';
ctx.fillStyle = 'rgba(160, 190, 230, 0.4)';
ctx.fillText(`SYSTEM: ${sunsMode.toUpperCase()} | BODIES: ${activeCount}/${MAX_PLANETS} | GRAV: ${gScale.toFixed(2)}G`, 24, H - 24);

ctx.restore();