ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.05);

// ---- CONTROLS & LOOKUPS ----
const density = Math.floor(getVar('spike_density') ?? 24);
const strength = getVar('magnet_strength') ?? 1.4;
const rimGlow = getVar('studio_rim') ?? true;
const magnetMode = getVar('magnet_mode') ?? 'breathing';
const sheenMode = getVar('sheen') ?? 'oil_slick';
const viscMode = getVar('viscosity') ?? 'mercury';

const viscSettings = {
  mercury: { damp: 0.88, spring: 14.0 },
  heavy_crude: { damp: 0.72, spring: 8.0 },
  hyper_fluid: { damp: 0.94, spring: 22.0 }
};
const visc = viscSettings[viscMode] ?? viscSettings.mercury;

const palettes = {
  oil_slick: {
    rim: 'rgba(50, 230, 210, 0.85)',
    accent: 'rgba(235, 60, 180, 0.9)',
    spec: '#f5ffff',
    poolR: 12, poolG: 22, poolB: 35,
    chromaHue: 175
  },
  liquid_chrome: {
    rim: 'rgba(200, 225, 255, 0.9)',
    accent: 'rgba(160, 190, 240, 0.75)',
    spec: '#ffffff',
    poolR: 18, poolG: 22, poolB: 28,
    chromaHue: 215
  },
  deep_violet: {
    rim: 'rgba(165, 85, 255, 0.9)',
    accent: 'rgba(255, 75, 160, 0.85)',
    spec: '#ffd9f7',
    poolR: 24, poolG: 10, poolB: 34,
    chromaHue: 285
  },
  obsidian_gold: {
    rim: 'rgba(255, 195, 70, 0.9)',
    accent: 'rgba(255, 95, 30, 0.8)',
    spec: '#fffbe8',
    poolR: 30, poolG: 20, poolB: 10,
    chromaHue: 42
  }
};
const palette = palettes[sheenMode] ?? palettes.oil_slick;

// ---- STATE INITIALISATION (REUSED BUFFERS) ----
if (!room.state.spikes || room.state.density !== density) {
  room.state.spikes = [];
  room.state.density = density;
  const N = density;
  const radLimit = 0.94;
  for (let iy = 0; iy < N; iy++) {
    const rowShift = (iy % 2) * 0.5;
    for (let ix = 0; ix < N; ix++) {
      const nx = ((ix + rowShift) / (N - 1) - 0.5) * 2.1;
      const ny = (iy / (N - 1) - 0.5) * 2.1;
      const distSq = nx * nx + ny * ny;
      if (distSq <= radLimit * radLimit) {
        room.state.spikes.push({
          u: nx,
          v: ny,
          h: 0,
          vh: 0,
          phase: Math.random() * Math.PI * 2,
          dist: Math.sqrt(distSq)
        });
      }
    }
  }
  room.state.spikes.sort((a, b) => a.v - b.v);
  room.state.pulse = 0;
}

// Trigger magnetic shockwave on audio beat
if (audio.beat) {
  room.state.pulse = 1.0;
} else if (room.state.pulse > 0) {
  room.state.pulse = Math.max(0, room.state.pulse - dt * 2.5);
}

// ---- MAGNET POLES ----
const poles = [];
const bassBoost = (audio.bass || 0) * 0.9;
const midBoost = (audio.mid || 0) * 0.5;

if (magnetMode === 'breathing') {
  const zBreath = Math.sin(t * 1.4) * 0.5 + 0.5;
  poles.push({
    x: Math.sin(t * 0.6) * 0.25,
    y: Math.cos(t * 0.5) * 0.2,
    power: (0.4 + zBreath * 0.8 + bassBoost * 0.9) * strength,
    rad: 0.72
  });
} else if (magnetMode === 'orbiting') {
  const orbA = t * 1.8;
  const orbB = -t * 2.3;
  poles.push({
    x: Math.cos(orbA) * 0.52,
    y: Math.sin(orbA) * 0.44,
    power: (0.75 + bassBoost) * strength,
    rad: 0.55
  });
  poles.push({
    x: Math.cos(orbB) * 0.38,
    y: Math.sin(orbB) * 0.32,
    power: (0.65 + midBoost) * strength,
    rad: 0.48
  });
} else if (magnetMode === 'roaming') {
  poles.push({
    x: Math.sin(t * 0.9) * Math.cos(t * 0.4) * 0.65,
    y: Math.cos(t * 1.1) * 0.5,
    power: (0.8 + bassBoost) * strength,
    rad: 0.6
  });
} else {
  const surgeT = Math.pow(Math.max(0, Math.sin(t * 2.2)), 4.0);
  poles.push({
    x: Math.sin(t * 0.4) * 0.15,
    y: Math.cos(t * 0.3) * 0.12,
    power: (0.2 + surgeT * 1.4 + bassBoost * 1.2) * strength,
    rad: 0.85
  });
}

// Integrate room people as secondary micro-magnets
if (room.people && room.people.length > 0) {
  const pplCount = Math.min(room.people.length, 6);
  for (let pi = 0; pi < pplCount; pi++) {
    const p = room.people[pi];
    const ang = (pi / pplCount) * Math.PI * 2 + t * 0.3;
    const pRad = 0.65;
    poles.push({
      x: Math.cos(ang) * pRad,
      y: Math.sin(ang) * pRad * 0.8,
      power: 0.35 * strength,
      rad: 0.38,
      hue: p.hue
    });
  }
}

// ---- CLEAR & BACKGROUND ----
ctx.fillStyle = '#030508';
ctx.fillRect(0, 0, W, H);

// Ambient studio pool glow
const cx = W * 0.5;
const cy = H * 0.54;
const poolW = Math.min(W * 0.84, H * 1.45);
const poolH = poolW * 0.46;

const softbox = ctx.createRadialGradient(cx, cy - poolH * 0.4, 10, cx, cy, poolW * 0.65);
softbox.addColorStop(0, `rgba(${palette.poolR + 35}, ${palette.poolG + 40}, ${palette.poolB + 55}, 0.28)`);
softbox.addColorStop(0.5, `rgba(${palette.poolR}, ${palette.poolG}, ${palette.poolB}, 0.15)`);
softbox.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = softbox;
ctx.beginPath();
ctx.ellipse(cx, cy, poolW * 0.58, poolH * 0.6, 0, 0, Math.PI * 2);
ctx.fill();

// Base liquid disc (mirror puddle)
const puddleGrad = ctx.createRadialGradient(cx, cy - poolH * 0.2, 20, cx, cy, poolW * 0.5);
puddleGrad.addColorStop(0, '#10141a');
puddleGrad.addColorStop(0.65, '#06080b');
puddleGrad.addColorStop(0.98, '#010203');
puddleGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = puddleGrad;
ctx.beginPath();
ctx.ellipse(cx, cy, poolW * 0.48, poolH * 0.48, 0, 0, Math.PI * 2);
ctx.fill();

// Ripple rings around puddle perimeter
ctx.lineWidth = 1.2;
ctx.strokeStyle = `rgba(${palette.poolR + 40}, ${palette.poolG + 60}, ${palette.poolB + 90}, 0.22)`;
ctx.beginPath();
ctx.ellipse(cx, cy, poolW * 0.46, poolH * 0.46, 0, 0, Math.PI * 2);
ctx.stroke();

// ---- UPDATE SPIKES ----
const spikes = room.state.spikes;
const numSpikes = spikes.length;
const shockPulse = room.state.pulse;
const trepJitter = (audio.treble || 0) * 0.15;

for (let i = 0; i < numSpikes; i++) {
  const sp = spikes[i];
  let field = 0;
  for (let pIdx = 0; pIdx < poles.length; pIdx++) {
    const p = poles[pIdx];
    const dx = sp.u - p.x;
    const dy = sp.v - p.y;
    const d2 = dx * dx + dy * dy;
    const r2 = p.rad * p.rad;
    if (d2 < r2 * 2.5) {
      const f = p.power * Math.exp(-d2 / (r2 * 0.6));
      field += f;
    }
  }

  // Shockwave ripple wave from beat
  if (shockPulse > 0.01) {
    const wavePhase = sp.dist * 7.0 - (1.0 - shockPulse) * 9.0;
    field += Math.sin(wavePhase) * shockPulse * 0.45;
  }

  // Rosensweig instability thresholding
  let targetH = 0;
  if (field > 0.15) {
    const excess = field - 0.15;
    targetH = Math.pow(excess, 1.45) * 160;
    targetH += Math.sin(t * 3.0 + sp.phase) * (targetH * 0.06);
    targetH += trepJitter * targetH * 0.2;
  }

  // Damped spring physics
  const force = (targetH - sp.h) * visc.spring;
  sp.vh = (sp.vh + force * dt) * visc.damp;
  sp.h = Math.max(0, sp.h + sp.vh * dt);
}

// ---- DRAW SPIKES (BACK TO FRONT) ----
for (let i = 0; i < numSpikes; i++) {
  const sp = spikes[i];
  const h = sp.h;

  const baseX = cx + sp.u * (poolW * 0.46);
  const baseY = cy + sp.v * (poolH * 0.46);

  if (h < 1.5) {
    ctx.fillStyle = 'rgba(12, 16, 22, 0.4)';
    ctx.beginPath();
    ctx.ellipse(baseX, baseY, 3.5, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    continue;
  }

  const swayX = sp.u * (h * 0.12) + Math.sin(t * 2.2 + sp.phase) * (h * 0.04);
  const tipX = baseX + swayX;
  const tipY = baseY - h;

  const baseRad = Math.min(18, 5.0 + Math.pow(h, 0.48) * 1.8);
  const leftX = baseX - baseRad;
  const rightX = baseX + baseRad;
  const midBaseY = baseY + baseRad * 0.28;

  const waistRatio = 0.58;
  const waistY = baseY - h * (1.0 - waistRatio);
  const waistW = baseRad * 0.38;
  const cplX = baseX - waistW + swayX * 0.3;
  const cprX = baseX + waistW + swayX * 0.3;

  ctx.beginPath();
  ctx.moveTo(baseX, midBaseY);
  ctx.bezierCurveTo(leftX, baseY, leftX + 1, waistY + h * 0.15, cplX, waistY);
  ctx.quadraticCurveTo(tipX - 1.2, tipY + h * 0.12, tipX, tipY);
  ctx.quadraticCurveTo(tipX + 1.2, tipY + h * 0.12, cprX, waistY);
  ctx.bezierCurveTo(rightX - 1, waistY + h * 0.15, rightX, baseY, baseX, midBaseY);
  ctx.closePath();

  const bodyGrad = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
  bodyGrad.addColorStop(0, '#06080b');
  bodyGrad.addColorStop(0.35, '#0b0f14');
  bodyGrad.addColorStop(0.7, '#131920');
  bodyGrad.addColorStop(1, '#1b232c');
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  if (rimGlow && h > 8) {
    ctx.lineWidth = Math.min(2.4, 0.8 + h * 0.015);
    const rimGrad = ctx.createLinearGradient(leftX, baseY, tipX, tipY);
    rimGrad.addColorStop(0, 'rgba(0,0,0,0)');
    rimGrad.addColorStop(0.5, palette.accent);
    rimGrad.addColorStop(0.9, palette.rim);
    rimGrad.addColorStop(1.0, palette.spec);

    ctx.strokeStyle = rimGrad;
    ctx.beginPath();
    ctx.moveTo(leftX + 1, baseY - 2);
    ctx.quadraticCurveTo(cplX, waistY, tipX, tipY);
    ctx.stroke();
  }

  if (h > 12) {
    const spineGrad = ctx.createLinearGradient(tipX, tipY + h * 0.45, tipX, tipY);
    spineGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    spineGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.45)');
    spineGrad.addColorStop(1.0, palette.spec);

    ctx.strokeStyle = spineGrad;
    ctx.lineWidth = Math.max(1.0, Math.min(2.0, h * 0.02));
    ctx.beginPath();
    ctx.moveTo(baseX + (tipX - baseX) * 0.35, baseY - h * 0.35);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const tipGlint = Math.min(3.5, 0.8 + h * 0.025 + (audio.level || 0) * 1.5);
    ctx.fillStyle = palette.spec;
    ctx.beginPath();
    ctx.arc(tipX, tipY, tipGlint * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Foreground reflections and ethereal magnetic ring
const softboxRefl = ctx.createRadialGradient(cx, cy + poolH * 0.22, 10, cx, cy + poolH * 0.22, poolW * 0.35);
softboxRefl.addColorStop(0, 'rgba(210, 235, 255, 0.07)');
softboxRefl.addColorStop(0.5, 'rgba(120, 180, 240, 0.03)');
softboxRefl.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = softboxRefl;
ctx.beginPath();
ctx.ellipse(cx, cy + poolH * 0.22, poolW * 0.38, poolH * 0.2, 0, 0, Math.PI * 2);
ctx.fill();

const haloAlpha = Math.min(0.35, 0.08 + (audio.bass || 0) * 0.3);
ctx.strokeStyle = palette.rim;
ctx.lineWidth = 1.0;
ctx.globalAlpha = haloAlpha;
ctx.setLineDash([4, 12]);
ctx.beginPath();
ctx.ellipse(cx, cy - 80, poolW * 0.32, poolH * 0.32, 0, 0, Math.PI * 2);
ctx.stroke();
ctx.setLineDash([]);
ctx.globalAlpha = 1.0;

// Vignette
const vig = ctx.createRadialGradient(cx, cy, poolW * 0.45, cx, cy, Math.max(W, H) * 0.72);
vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
vig.addColorStop(0.7, 'rgba(2, 4, 7, 0.55)');
vig.addColorStop(1.0, '#010204');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();