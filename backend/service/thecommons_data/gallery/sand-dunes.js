const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt, 0.05);

// Palettes tuned for high wall projection: deep voids against piercing golden raking light
const palettes = {
  'Sahara Gold': {
    shadowDark: '#050308', shadowMid: '#160a14', shadowBounce: '#281216',
    sandTrough: '#8c3d10', sandMid: '#d47220', sandCrest: '#ffc852',
    crestHighlight: '#fff8db', plume: '255, 210, 115',
    rippleDark: 'rgba(80, 26, 6, 0.40)', rippleLight: 'rgba(255, 230, 145, 0.32)'
  },
  'Namib Crimson': {
    shadowDark: '#040206', shadowMid: '#160410', shadowBounce: '#2a0815',
    sandTrough: '#6e140a', sandMid: '#b62e15', sandCrest: '#ee5b24',
    crestHighlight: '#ffd4b2', plume: '255, 165, 110',
    rippleDark: 'rgba(65, 10, 8, 0.45)', rippleLight: 'rgba(255, 195, 145, 0.30)'
  },
  'Solstice Amber': {
    shadowDark: '#06020c', shadowMid: '#190a20', shadowBounce: '#2c1030',
    sandTrough: '#753512', sandMid: '#c5681c', sandCrest: '#f6ad2d',
    crestHighlight: '#fffbc7', plume: '255, 232, 145',
    rippleDark: 'rgba(70, 20, 26, 0.38)', rippleLight: 'rgba(255, 242, 165, 0.33)'
  },
  'Dusk Obsidian': {
    shadowDark: '#020204', shadowMid: '#0a090e', shadowBounce: '#16141c',
    sandTrough: '#382f24', sandMid: '#746046', sandCrest: '#caa05a',
    crestHighlight: '#ffffff', plume: '240, 215, 165',
    rippleDark: 'rgba(16, 14, 18, 0.50)', rippleLight: 'rgba(240, 220, 175, 0.28)'
  }
};

const duneCounts = { 'Monumental': 6, 'Rolling Erg': 9, 'Vast Sea': 13 };
const sunConfigs = {
  'Skimming Low': { shadowMul: 0.88, glareX: -0.15, glareY: 0.15, crestGlow: 1.4 },
  'Golden Dusk':   { shadowMul: 0.65, glareX: -0.10, glareY: 0.05, crestGlow: 1.0 },
  'Backlit Rim':   { shadowMul: 0.95, glareX: 0.30,  glareY: -0.20, crestGlow: 1.8 }
};
const plumeConfigs = {
  'Whispering':     { maxActive: 55,  spawnRate: 3,  baseAlpha: 0.38, width: 1.0 },
  'Gale Streamers': { maxActive: 120, spawnRate: 7,  baseAlpha: 0.58, width: 1.5 },
  'Sandstorm':      { maxActive: 180, spawnRate: 14, baseAlpha: 0.78, width: 2.2 }
};

const pal = palettes[getVar('palette')] ?? palettes['Sahara Gold'];
const N = duneCounts[getVar('dune_scale')] ?? duneCounts['Rolling Erg'];
const sun = sunConfigs[getVar('sun_angle')] ?? sunConfigs['Skimming Low'];
const plume = plumeConfigs[getVar('plume_density')] ?? plumeConfigs['Gale Streamers'];
const windSpeed = getVar('wind_speed') ?? 1.0;
const shadowDepth = getVar('shadow_depth') ?? 0.85;
const drawRipples = getVar('ripples') ?? true;
const drawHaze = getVar('heat_haze') ?? true;

const bass = audio ? (audio.bass ?? 0) : 0;
const mid = audio ? (audio.mid ?? 0) : 0;
const treble = audio ? (audio.treble ?? 0) : 0;
const beat = audio ? (audio.beat ?? false) : false;

// Demoscene economy: Persistent Sine LUT and preallocated arrays
if (!room.state.sinLUT) {
  room.state.sinLUT = new Float32Array(1024);
  for (let j = 0; j < 1024; j++) {
    room.state.sinLUT[j] = Math.sin((j / 1024) * Math.PI * 2);
  }
}
const fsin = (rad) => {
  const n = (rad * 0.159154943) % 1;
  const idx = ((n < 0 ? n + 1 : n) * 1024) | 0;
  return room.state.sinLUT[idx & 1023];
};
const fcos = (rad) => fsin(rad + 1.5707963);

const SAMPLES = 84;
const MAX_DUNES = 16;
if (!room.state.crests) {
  room.state.crests = [];
  for (let i = 0; i < MAX_DUNES; i++) {
    room.state.crests.push({
      x: new Float32Array(SAMPLES),
      y: new Float32Array(SAMPLES),
      sy: new Float32Array(SAMPLES)
    });
  }
}

if (!room.state.sand) {
  room.state.sand = [];
  for (let k = 0; k < 180; k++) {
    room.state.sand.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1 });
  }
}

room.state.hazeCanvas ??= new OffscreenCanvas(240, 135);
room.state.hazeCtx ??= room.state.hazeCanvas.getContext('2d');

ctx.save();
ctx.fillStyle = pal.shadowDark;
ctx.fillRect(0, 0, W, H);

// 1. Calculate Dune Ridge Geometry
for (let i = 0; i <= N; i++) {
  const crest = room.state.crests[i];
  const baseY = ((i - 0.35) / N) * (H * 1.24) - H * 0.12;
  const a1 = (H / N) * (0.34 + 0.12 * fcos(i * 1.9));
  const a2 = (H / N) * (0.15 + 0.05 * fsin(i * 3.1));
  const a3 = 7 + bass * 14;
  const p1 = i * 2.1 + frame.t * 0.025 * windSpeed;
  const p2 = i * 4.3 - frame.t * 0.040 * windSpeed;

  for (let s = 0; s < SAMPLES; s++) {
    const x = (s / (SAMPLES - 1)) * (W + 60) - 30;
    const tilt = (x - W * 0.5) * 0.20;
    const yCrest = baseY + tilt + a1 * fsin(x * 0.0019 + p1) + a2 * fsin(x * 0.0048 + p2) + a3 * fsin(x * 0.011 + i * 5.7);
    crest.x[s] = x;
    crest.y[s] = yCrest;
  }
}

// Calculate shadow toe lines
for (let i = 0; i < N; i++) {
  const crest = room.state.crests[i];
  const nextCrest = room.state.crests[i + 1];
  for (let s = 0; s < SAMPLES; s++) {
    const span = nextCrest.y[s] - crest.y[s];
    const sMod = 0.92 + 0.14 * fcos(crest.x[s] * 0.0055 + i * 2.7);
    const sFactor = Math.min(0.96, Math.max(0.22, (shadowDepth * sun.shadowMul + bass * 0.10) * sMod));
    crest.sy[s] = crest.y[s] + span * sFactor;
  }
}

// 2. Render Dune Bands
const midSample = (SAMPLES / 2) | 0;
for (let i = 0; i < N; i++) {
  const crest = room.state.crests[i];
  const nextCrest = room.state.crests[i + 1];

  // ZONE A: Deep Slip-Face Shadow
  ctx.beginPath();
  for (let s = 0; s < SAMPLES; s++) {
    if (s === 0) ctx.moveTo(crest.x[s], crest.y[s]);
    else ctx.lineTo(crest.x[s], crest.y[s]);
  }
  for (let s = SAMPLES - 1; s >= 0; s--) {
    ctx.lineTo(crest.x[s], crest.sy[s]);
  }
  ctx.closePath();
  const gradA = ctx.createLinearGradient(0, crest.y[midSample], 0, crest.sy[midSample]);
  gradA.addColorStop(0, pal.shadowDark);
  gradA.addColorStop(0.55, pal.shadowMid);
  gradA.addColorStop(1, pal.shadowBounce);
  ctx.fillStyle = gradA;
  ctx.fill();

  // ZONE B: Golden Windward Lit Slope
  ctx.beginPath();
  for (let s = 0; s < SAMPLES; s++) {
    if (s === 0) ctx.moveTo(crest.x[s], crest.sy[s]);
    else ctx.lineTo(crest.x[s], crest.sy[s]);
  }
  for (let s = SAMPLES - 1; s >= 0; s--) {
    ctx.lineTo(nextCrest.x[s], nextCrest.y[s]);
  }
  ctx.closePath();
  const gradB = ctx.createLinearGradient(0, crest.sy[midSample], 0, nextCrest.y[midSample]);
  gradB.addColorStop(0, pal.sandTrough);
  gradB.addColorStop(0.5, pal.sandMid);
  gradB.addColorStop(1, pal.sandCrest);
  ctx.fillStyle = gradB;
  ctx.fill();

  // Wind Ripples on Lit Slope
  if (drawRipples) {
    const numRipples = N > 10 ? 5 : 7;
    const ripPhase = frame.t * 1.6 * windSpeed + mid * 2.2;
    for (let r = 1; r <= numRipples; r++) {
      const f = r / (numRipples + 1);
      // Shadow crevice
      ctx.beginPath();
      for (let s = 0; s < SAMPLES; s++) {
        const ry = crest.sy[s] + (nextCrest.y[s] - crest.sy[s]) * f + 2.6 * fsin(crest.x[s] * 0.042 + ripPhase + r * 1.6 + i * 3.1);
        if (s === 0) ctx.moveTo(crest.x[s], ry);
        else ctx.lineTo(crest.x[s], ry);
      }
      ctx.strokeStyle = pal.rippleDark;
      ctx.lineWidth = 1.0;
      ctx.stroke();
      // Illuminated ripple crest
      ctx.beginPath();
      for (let s = 0; s < SAMPLES; s++) {
        const ry = crest.sy[s] + (nextCrest.y[s] - crest.sy[s]) * f + 2.6 * fsin(crest.x[s] * 0.042 + ripPhase + r * 1.6 + i * 3.1) - 1.1;
        if (s === 0) ctx.moveTo(crest.x[s], ry);
        else ctx.lineTo(crest.x[s], ry);
      }
      ctx.strokeStyle = pal.rippleLight;
      ctx.lineWidth = 0.85;
      ctx.stroke();
    }
  }

  // Razor Crest Knife-Edge Highlight
  ctx.beginPath();
  for (let s = 0; s < SAMPLES; s++) {
    if (s === 0) ctx.moveTo(crest.x[s], crest.y[s]);
    else ctx.lineTo(crest.x[s], crest.y[s]);
  }
  ctx.strokeStyle = pal.crestHighlight;
  ctx.lineWidth = (1.1 + treble * 1.3) * sun.crestGlow * (beat ? 1.9 : 1.0);
  ctx.stroke();
}

// 3. Sand Saltation Plumes Streaming Off Crests
let toSpawn = plume.spawnRate * (dt * 60) * windSpeed;
if (beat) toSpawn += 16;
toSpawn = Math.min(toSpawn, 24);

for (let k = 0; k < plume.maxActive; k++) {
  const p = room.state.sand[k];
  if (p.life <= 0 && toSpawn > 0) {
    const dIdx = (Math.random() * (N - 1)) | 0;
    p.x = Math.random() * (W + 60) - 30;
    const sIdx = Math.max(0, Math.min(SAMPLES - 1, (((p.x + 30) / (W + 60)) * (SAMPLES - 1)) | 0));
    p.y = room.state.crests[dIdx].y[sIdx] + (Math.random() - 0.5) * 3;
    const ang = 0.40 + (Math.random() - 0.5) * 0.28;
    const spd = (150 + Math.random() * 140) * windSpeed * (1 + bass * 0.45);
    p.vx = Math.cos(ang) * spd;
    p.vy = Math.sin(ang) * spd;
    p.life = p.maxLife = 0.6 + Math.random() * 0.85;
    p.size = (0.9 + Math.random() * 1.4) * plume.width;
    toSpawn--;
  }
}

ctx.lineCap = 'round';
for (let k = 0; k < plume.maxActive; k++) {
  const p = room.state.sand[k];
  if (p.life <= 0) continue;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  if (p.life <= 0) continue;

  const lifeRatio = p.life / p.maxLife;
  const alpha = fsin(lifeRatio * Math.PI) * plume.baseAlpha * (1 + treble * 0.4);
  const tailLen = 0.045 * (1 + windSpeed * 0.25);
  const tx = p.x - p.vx * tailLen;
  const ty = p.y - p.vy * tailLen;

  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = 'rgba(' + pal.plume + ', ' + alpha.toFixed(3) + ')';
  ctx.lineWidth = p.size;
  ctx.stroke();

  if (p.size > 1.3) {
    ctx.fillStyle = 'rgba(255, 255, 240, ' + (alpha * 0.85).toFixed(3) + ')';
    ctx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
  }
}

// 4. Interactive Wanderers (Nomadic beacons mapped to connected people)
if (room.people && room.people.length > 0) {
  const count = Math.min(room.people.length, 20);
  for (let pi = 0; pi < count; pi++) {
    const person = room.people[pi];
    const dIdx = (pi * 2 + 1) % (N - 1);
    const crest = room.state.crests[dIdx];
    const progress = ((frame.t * 0.010 * windSpeed + pi / count) % 1.0);
    const sFrac = progress * (SAMPLES - 1);
    const s0 = Math.floor(sFrac);
    const s1 = Math.min(SAMPLES - 1, s0 + 1);
    const f = sFrac - s0;
    const px = crest.x[s0] + (crest.x[s1] - crest.x[s0]) * f;
    const py = crest.y[s0] + (crest.y[s1] - crest.y[s0]) * f;

    ctx.strokeStyle = 'rgba(5, 2, 7, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 7, py + 12);
    ctx.stroke();

    ctx.fillStyle = '#0f0608';
    ctx.fillRect(px - 1.5, py - 4, 3, 4);

    const hue = (typeof person.hue === 'number' && !isNaN(person.hue)) ? person.hue : (pi * 51) % 360;
    ctx.fillStyle = 'hsla(' + hue + ', 95%, 68%, 0.95)';
    ctx.beginPath();
    ctx.arc(px + 0.5, py - 5, 2.0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'hsla(' + hue + ', 90%, 62%, ' + (0.22 + treble * 0.25).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(px + 0.5, py - 5, 7 + treble * 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 5. Atmospheric Golden Glare (Offscreen low-res scattering buffer)
if (drawHaze) {
  const hw = room.state.hazeCanvas.width;
  const hh = room.state.hazeCanvas.height;
  const hCtx = room.state.hazeCtx;
  hCtx.clearRect(0, 0, hw, hh);

  const gx = hw * (sun.glareX + 0.15);
  const gy = hh * (sun.glareY + 0.15);
  const hGrad = hCtx.createRadialGradient(gx, gy, 4, gx, gy, hw * 0.95);
  hGrad.addColorStop(0, 'rgba(255, 240, 205, ' + (0.32 + bass * 0.16).toFixed(3) + ')');
  hGrad.addColorStop(0.35, 'rgba(235, 155, 55, ' + (0.16 + bass * 0.07).toFixed(3) + ')');
  hGrad.addColorStop(0.75, 'rgba(160, 65, 15, 0.05)');
  hGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  hCtx.fillStyle = hGrad;
  hCtx.fillRect(0, 0, hw, hh);

  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(room.state.hazeCanvas, 0, 0, W, H);
}

ctx.restore();