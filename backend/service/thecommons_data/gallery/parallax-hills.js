ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// --- State initialization (Lookup tables & reusable buffers) ---
if (!room.state.init) {
  room.state.init = true;
  room.state.scrolls = [0, 0, 0, 0, 0]; // 5 parallax layers
  
  // Generate height tables for mountain/hill profiles (256 samples each)
  const SAMPLES = 256;
  room.state.SAMPLES = SAMPLES;
  room.state.farH = new Float32Array(SAMPLES);
  room.state.midH = new Float32Array(SAMPLES);
  room.state.nearH = new Float32Array(SAMPLES);
  room.state.cloudH = new Float32Array(SAMPLES);
  
  for (let i = 0; i < SAMPLES; i++) {
    const a = (i / SAMPLES) * Math.PI * 2;
    // Far craggy peaks: harmonic sums
    room.state.farH[i] = 0.5 * Math.sin(a * 2) + 0.3 * Math.sin(a * 5 + 1.2) + 0.2 * Math.sin(a * 11 + 0.4);
    // Mid ridge: sharper saw/sine mix
    room.state.midH[i] = 0.55 * Math.sin(a * 3 + 2.1) + 0.25 * Math.cos(a * 7 - 0.8) + 0.15 * Math.sin(a * 13);
    // Near rolling hills & pine tooth rhythm
    const base = 0.45 * Math.sin(a * 2 + 4.0) + 0.25 * Math.sin(a * 4 + 1.0);
    const pine = Math.abs((i % 8) - 4) / 4.0 * 0.15;
    room.state.nearH[i] = base - pine;
    // Cloud puff shape
    room.state.cloudH[i] = Math.max(0, Math.sin(a * 3)) * 0.6 + Math.max(0, Math.sin(a * 6 + 1.0)) * 0.4;
  }
  
  // Bird fleet state (fixed pool)
  room.state.birds = [];
  for (let i = 0; i < 16; i++) {
    room.state.birds.push({
      x: (i * 137.5) % W,
      y: 0.15 + (i * 0.05) % 0.35,
      spd: 0.35 + (i % 5) * 0.12,
      flapOffset: i * 0.7,
      size: 7 + (i % 4) * 3
    });
  }
}

// --- Variable & palette setup ---
const speedMult = getVar('scroll_speed') ?? 1.0;
const bandCount = Math.floor(getVar('sky_bands') ?? 12);
const maxBirds = Math.floor(getVar('bird_count') ?? 6);
const phase = getVar('moon_phase') || 'full_orb';
const theme = getVar('palette_theme') || 'copper_sunset';

const PALETTES = {
  copper_sunset: {
    skyTop: [16, 12, 38],
    skyMid: [162, 54, 76],
    skyBottom: [248, 172, 82],
    moon: '#ffeedd',
    moonGlow: 'rgba(255, 200, 140, 0.25)',
    cloud: 'rgba(92, 36, 68, 0.85)',
    far: '#28132e',
    mid: '#1a0d26',
    near: '#0b0413'
  },
  fm_towns_twilight: {
    skyTop: [8, 10, 32],
    skyMid: [72, 48, 118],
    skyBottom: [224, 116, 160],
    moon: '#e2f4ff',
    moonGlow: 'rgba(180, 220, 255, 0.22)',
    cloud: 'rgba(44, 28, 72, 0.85)',
    far: '#19153a',
    mid: '#100c28',
    near: '#060414'
  },
  cyber_dusk: {
    skyTop: [12, 6, 28],
    skyMid: [26, 78, 138],
    skyBottom: [245, 78, 162],
    moon: '#ffe66d',
    moonGlow: 'rgba(245, 78, 162, 0.3)',
    cloud: 'rgba(38, 22, 60, 0.88)',
    far: '#1c1032',
    mid: '#110722',
    near: '#06010f'
  },
  emerald_dawn: {
    skyTop: [6, 20, 24],
    skyMid: [18, 92, 90],
    skyBottom: [180, 224, 142],
    moon: '#fffde2',
    moonGlow: 'rgba(180, 240, 180, 0.22)',
    cloud: 'rgba(14, 52, 52, 0.85)',
    far: '#0a2926',
    mid: '#051b19',
    near: '#020d0c'
  }
};
const pal = PALETTES[theme] ?? PALETTES.copper_sunset;

// Bass/beat punch
const bassBoost = (audio?.bass || 0) * 0.15;
const beatFlash = audio?.beat ? 0.08 : 0.0;

// --- 1. Stepped Sky Raster Bands (Copper-bar style) ---
const bandH = Math.ceil(H / bandCount);
for (let b = 0; b < bandCount; b++) {
  const k = b / (bandCount - 1);
  let r, g, bl;
  if (k < 0.5) {
    const u = k / 0.5;
    r = pal.skyTop[0] + (pal.skyMid[0] - pal.skyTop[0]) * u;
    g = pal.skyTop[1] + (pal.skyMid[1] - pal.skyTop[1]) * u;
    bl = pal.skyTop[2] + (pal.skyMid[2] - pal.skyTop[2]) * u;
  } else {
    const u = (k - 0.5) / 0.5;
    r = pal.skyMid[0] + (pal.skyBottom[0] - pal.skyMid[0]) * u;
    g = pal.skyMid[1] + (pal.skyBottom[1] - pal.skyMid[1]) * u;
    bl = pal.skyMid[2] + (pal.skyBottom[2] - pal.skyMid[2]) * u;
  }
  // Subtle raster scanline variation + audio kick
  const light = 1 + beatFlash + (b % 2 === 0 ? 0.03 : -0.03);
  ctx.fillStyle = `rgb(${Math.min(255, r * light | 0)}, ${Math.min(255, g * light | 0)}, ${Math.min(255, bl * light | 0)})`;
  ctx.fillRect(0, b * bandH, W, bandH + 1);
}

// --- 2. Moon / Celestial Body ---
const moonX = W * 0.72;
const moonY = H * 0.26;
const baseR = Math.min(W, H) * (phase === 'giant_sol' ? 0.14 : 0.085) * (1 + bassBoost * 0.5);

// Outer glow rings
ctx.fillStyle = pal.moonGlow;
ctx.beginPath();
ctx.arc(moonX, moonY, baseR * 1.8, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
ctx.arc(moonX, moonY, baseR * 1.35, 0, Math.PI * 2);
ctx.fill();

// Moon body
ctx.fillStyle = pal.moon;
ctx.beginPath();
ctx.arc(moonX, moonY, baseR, 0, Math.PI * 2);
ctx.fill();

// Crescent shadow carve
if (phase === 'blood_crescent') {
  ctx.fillStyle = `rgb(${pal.skyTop[0]}, ${pal.skyTop[1]}, ${pal.skyTop[2]})`;
  ctx.beginPath();
  ctx.arc(moonX + baseR * 0.45, moonY - baseR * 0.2, baseR * 0.88, 0, Math.PI * 2);
  ctx.fill();
} else if (phase === 'giant_sol') {
  // Scanline cutouts through giant sun
  ctx.fillStyle = `rgba(${pal.skyMid[0]}, ${pal.skyMid[1]}, ${pal.skyMid[2]}, 0.85)`;
  for (let s = 0; s < 7; s++) {
    const sy = moonY + baseR * (0.05 + s * 0.13);
    const sh = 2 + s * 1.3;
    ctx.fillRect(moonX - baseR * 1.1, sy, baseR * 2.2, sh);
  }
}

// --- 3. Update Parallax Scrolls ---
const baseSpeed = 40 * speedMult;
const speeds = [0.15, 0.35, 0.7, 1.4, 2.5]; // clouds, far, mid, near, front
for (let i = 0; i < 5; i++) {
  room.state.scrolls[i] = (room.state.scrolls[i] + speeds[i] * baseSpeed * dt) % (W * 2);
}

const SAMPLES = room.state.SAMPLES;

// Helper to draw a continuous profile from LUT
function drawLayer(lut, scroll, baseY, amp, fillStyle) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(0, H);
  
  const stepPx = 12;
  const steps = Math.ceil(W / stepPx) + 1;
  const offsetNorm = (scroll / W) % 1.0;
  
  for (let s = 0; s <= steps; s++) {
    const x = s * stepPx;
    const u = ((x / W) + offsetNorm) % 1.0;
    const idx = Math.floor((u < 0 ? u + 1 : u) * (SAMPLES - 1));
    const y = baseY + lut[idx] * amp;
    if (s === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

// Layer 0: Slow drifting cloud bank
const cloudScroll = room.state.scrolls[0];
ctx.fillStyle = pal.cloud;
ctx.beginPath();
ctx.moveTo(0, H * 0.52);
for (let s = 0; s <= Math.ceil(W / 16); s++) {
  const x = s * 16;
  const u = ((x / W) + (cloudScroll / (W * 1.5))) % 1.0;
  const idx = Math.floor(Math.abs(u) * (SAMPLES - 1));
  const y = H * 0.44 - room.state.cloudH[idx] * (H * 0.08);
  ctx.lineTo(x, y);
}
ctx.lineTo(W, H * 0.58);
ctx.lineTo(0, H * 0.58);
ctx.closePath();
ctx.fill();

// Layer 1: Distant Craggy Mountains
drawLayer(room.state.farH, room.state.scrolls[1], H * 0.56, H * 0.14, pal.far);

// Layer 2: Mid Forest Ridgeline
drawLayer(room.state.midH, room.state.scrolls[2], H * 0.68, H * 0.11, pal.mid);

// Layer 3: Foreground Pine Foothills
drawLayer(room.state.nearH, room.state.scrolls[3], H * 0.84, H * 0.08, pal.near);

// Layer 4: Extreme Foreground Silhouette Edge (Telegraph poles / grass)
const fgScroll = room.state.scrolls[4];
ctx.fillStyle = '#000000';
ctx.fillRect(0, H * 0.94, W, H * 0.06);
// Sparse posts scrolling rapidly
const poleSpacing = 320;
const poleOffset = fgScroll % poleSpacing;
for (let px = -poleSpacing; px < W + poleSpacing; px += poleSpacing) {
  const x = px - poleOffset;
  const poleH = H * 0.18;
  const poleY = H * 0.94 - poleH;
  ctx.fillRect(x, poleY, 4, poleH);
  ctx.fillRect(x - 12, poleY + 10, 28, 3);
  ctx.fillRect(x - 16, poleY + 22, 36, 3);
}

// --- 4. Silhouetted Birds (Flapping cycle) ---
ctx.fillStyle = '#06020c';
const birdCount = Math.min(maxBirds, room.state.birds.length);
const flapSpeed = 9 + (audio?.mid || 0) * 8;

for (let i = 0; i < birdCount; i++) {
  const b = room.state.birds[i];
  // Advance birds from right to left or left to right
  b.x = (b.x + b.spd * 80 * dt) % (W + 80);
  const actualX = b.x - 40;
  const actualY = b.y * H + Math.sin(t * 1.5 + b.flapOffset) * 12;
  
  const flap = Math.sin(t * flapSpeed + b.flapOffset);
  const wingSpan = b.size;
  const wingLift = flap * (wingSpan * 0.7);
  
  // Demoscene M-style bird silhouette with depth
  ctx.beginPath();
  ctx.moveTo(actualX, actualY);
  ctx.quadraticCurveTo(actualX - wingSpan * 0.5, actualY - wingLift, actualX - wingSpan, actualY + wingLift * 0.3);
  ctx.quadraticCurveTo(actualX - wingSpan * 0.5, actualY - wingLift * 0.4, actualX, actualY + 2);
  ctx.quadraticCurveTo(actualX + wingSpan * 0.5, actualY - wingLift * 0.4, actualX + wingSpan, actualY + wingLift * 0.3);
  ctx.quadraticCurveTo(actualX + wingSpan * 0.5, actualY - wingLift, actualX, actualY);
  ctx.fill();
}

// --- 5. Connected Room People (Subtle fireflies along foreground ridge) ---
if (room.people && room.people.length > 0) {
  const numP = Math.min(room.people.length, 32);
  for (let i = 0; i < numP; i++) {
    const p = room.people[i];
    const px = ((i + 0.5) / numP) * W + Math.sin(t * 2 + i) * 15;
    const py = H * 0.88 + Math.cos(t * 1.8 + i * 1.5) * 18;
    const hue = p.hue ?? 45;
    ctx.fillStyle = `hsla(${hue}, 90%, 65%, 0.75)`;
    ctx.beginPath();
    ctx.arc(px, py, 2.5 + (audio?.treble || 0) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();