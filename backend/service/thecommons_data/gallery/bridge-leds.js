ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.1);

// Read interactive parameters
const cableCount = Math.floor(getVar('cable_count') ?? 120);
const speed = getVar('speed') ?? 1.0;
const rippleMul = getVar('water_ripple') ?? 1.0;
const cityGlow = getVar('city_glow') ?? 0.6;
const trafficDensity = Math.floor(getVar('traffic_density') ?? 60);
const fogDensity = getVar('fog_density') ?? 0.5;
const audioSurge = getVar('audio_surge') ?? true;

// Palettes
const palettes = {
  'Pure White & Ice': {
    core: '#ffffff',
    glow: 'rgba(140, 235, 255, 0.75)',
    accent: 'rgba(70, 190, 255, 0.5)',
    tintH: 195,
    waterGlow: 'rgba(80, 200, 255, 0.35)'
  },
  'Cyberpunk Tokyo': {
    core: '#ffffff',
    glow: 'rgba(255, 0, 136, 0.85)',
    accent: 'rgba(0, 245, 212, 0.8)',
    tintH: 320,
    waterGlow: 'rgba(255, 0, 160, 0.4)'
  },
  'Warm Amber': {
    core: '#fff8ea',
    glow: 'rgba(255, 175, 40, 0.85)',
    accent: 'rgba(255, 100, 15, 0.6)',
    tintH: 35,
    waterGlow: 'rgba(255, 140, 30, 0.4)'
  },
  'Deep Ocean': {
    core: '#e8ffff',
    glow: 'rgba(0, 240, 190, 0.8)',
    accent: 'rgba(0, 130, 255, 0.65)',
    tintH: 170,
    waterGlow: 'rgba(0, 210, 210, 0.35)'
  },
  'Monochrome Noir': {
    core: '#ffffff',
    glow: 'rgba(210, 220, 240, 0.65)',
    accent: 'rgba(130, 145, 170, 0.45)',
    tintH: 220,
    waterGlow: 'rgba(170, 185, 210, 0.25)'
  }
};
const palChoice = getVar('palette') ?? 'Pure White & Ice';
const pal = palettes[palChoice] ?? palettes['Pure White & Ice'];
const pattern = getVar('pattern') ?? 'Rain Cascade';

// Geometry setup
const yWater = H * 0.618;
const yDeck = yWater - 24;
const xT1 = W * 0.27;
const xT2 = W * 0.73;
const yTowerTop = H * 0.15;
const ySag = yDeck - 20;

function getCableTop(x) {
  if (x < xT1) {
    const u = (xT1 - x) / xT1;
    return yTowerTop + (yDeck + 12 - yTowerTop) * (u * u);
  } else if (x <= xT2) {
    const halfSpan = (xT2 - xT1) * 0.5;
    const u = (x - (xT1 + xT2) * 0.5) / halfSpan;
    return ySag - (ySag - yTowerTop) * (1 - u * u);
  } else {
    const u = (x - xT2) / (W - xT2);
    return yTowerTop + (yDeck + 12 - yTowerTop) * (u * u);
  }
}

// One-time persistent state initialization
if (!room.state.stars) {
  const s = [];
  for (let i = 0; i < 90; i++) {
    s.push({
      x: Math.random(),
      y: Math.random() * 0.48,
      r: 0.6 + Math.random() * 1.4,
      ph: Math.random() * Math.PI * 2
    });
  }
  room.state.stars = s;
}

if (!room.state.skyline) {
  const b = [];
  const count = 48;
  for (let i = 0; i < count; i++) {
    const u = i / count;
    const bw = 0.016 + ((i * 37) % 11) * 0.0022;
    const bh = 0.04 + ((i * 73) % 19) * 0.0075;
    const bx = u * 1.04 - 0.02;
    const cols = 2 + (i % 4);
    const rows = Math.floor(bh * 260);
    const winBits = [];
    for (let r = 0; r < rows; r++) {
      winBits.push(Math.sin(i * 19.3 + r * 7.1) > -0.25 ? 1 : 0);
    }
    b.push({ bx, bw, bh, cols, rows, winBits, beacon: i % 7 === 0 });
  }
  room.state.skyline = b;
}

if (!room.state.traffic) {
  const cars = [];
  for (let i = 0; i < 120; i++) {
    cars.push({
      u: Math.random(),
      spd: 0.05 + ((i * 17) % 13) * 0.008,
      dir: i % 2 === 0 ? 1 : -1,
      lane: (i % 3) * 2,
      len: 0.006 + ((i * 11) % 7) * 0.002
    });
  }
  room.state.traffic = cars;
}
room.state.pulses ??= [];

// Beat pulse trigger
const audioBoost = audioSurge ? (audio.bass * 0.8 + audio.level * 0.4) : 0;
if (audioSurge && audio.beat) {
  if (!room.state.lastBeat || (t - room.state.lastBeat > 0.22)) {
    room.state.lastBeat = t;
    room.state.pulses.push({ t0: t, speed: 1.2 + audio.level });
    if (room.state.pulses.length > 4) room.state.pulses.shift();
  }
}

// 1. SKY & DISTANT ATMOSPHERE
const skyGrad = ctx.createLinearGradient(0, 0, 0, yWater);
skyGrad.addColorStop(0, '#01040a');
skyGrad.addColorStop(0.65, '#040b17');
skyGrad.addColorStop(1, '#091527');
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, yWater);

// Stars
ctx.fillStyle = '#ffffff';
const stars = room.state.stars;
for (let i = 0; i < stars.length; i++) {
  const st = stars[i];
  const alpha = 0.35 + 0.45 * Math.sin(t * 1.8 + st.ph);
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.fillRect(st.x * W, st.y * H, st.r, st.r);
}
ctx.globalAlpha = 1.0;

// Distant City Skyline
if (cityGlow > 0.01) {
  const bldgs = room.state.skyline;
  for (let i = 0; i < bldgs.length; i++) {
    const b = bldgs[i];
    const bx = b.bx * W;
    const bw = b.bw * W;
    const bh = b.bh * H * (0.8 + cityGlow * 0.35);
    const by = yWater - bh;

    // Building silhouette
    ctx.fillStyle = '#050c18';
    ctx.fillRect(bx, by, bw, bh);

    // Lit windows
    ctx.fillStyle = (i % 3 === 0) ? 'rgba(255, 210, 140, 0.75)' : 'rgba(160, 220, 255, 0.65)';
    const wSpacingX = bw / (b.cols + 1);
    const wSpacingY = bh / (b.rows + 1);
    const winW = Math.max(1, wSpacingX * 0.5);
    const winH = Math.max(1, wSpacingY * 0.6);

    for (let r = 0; r < b.rows; r++) {
      if (!b.winBits[r]) continue;
      const wy = by + (r + 1) * wSpacingY;
      for (let c = 0; c < b.cols; c++) {
        if ((r + c + i) % 5 === 0) continue;
        const wx = bx + (c + 1) * wSpacingX;
        ctx.fillRect(wx, wy, winW, winH);
      }
    }

    // Antenna blinker atop selected towers
    if (b.beacon) {
      ctx.fillStyle = (Math.sin(t * 3.5 + i) > 0) ? '#ff2a2a' : '#550000';
      ctx.fillRect(bx + bw * 0.5 - 1, by - 12, 2, 12);
      ctx.fillRect(bx + bw * 0.5 - 2, by - 14, 4, 3);
    }
  }
}

// Distant city haze
const hazeGrad = ctx.createLinearGradient(0, yWater - 80, 0, yWater);
hazeGrad.addColorStop(0, 'rgba(6, 18, 38, 0)');
hazeGrad.addColorStop(1, `rgba(18, 36, 68, ${0.45 * cityGlow})`);
ctx.fillStyle = hazeGrad;
ctx.fillRect(0, yWater - 80, W, 80);

// 2. WATER BASE
const waterGrad = ctx.createLinearGradient(0, yWater, 0, H);
waterGrad.addColorStop(0, '#040914');
waterGrad.addColorStop(0.2, '#02050b');
waterGrad.addColorStop(1, '#000205');
ctx.fillStyle = waterGrad;
ctx.fillRect(0, yWater, W, H - yWater);

// Water subtle horizon line
ctx.fillStyle = 'rgba(70, 110, 160, 0.25)';
ctx.fillRect(0, yWater - 1, W, 1.5);

// 3. MAIN CATENARY SUSPENSION CABLES
function traceCatenary(yOff) {
  ctx.beginPath();
  const step = Math.max(4, Math.floor(W / 240));
  for (let x = 0; x <= W; x += step) {
    const y = getCableTop(x) + yOff;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineTo(W, getCableTop(W) + yOff);
}

// Catenary glow & crisp steel core
ctx.save();
ctx.lineWidth = 5;
ctx.strokeStyle = pal.accent;
ctx.globalAlpha = 0.3 + audioBoost * 0.25;
traceCatenary(0);
ctx.stroke();
ctx.lineWidth = 2.0;
ctx.strokeStyle = '#c5d8ea';
ctx.globalAlpha = 0.95;
traceCatenary(0);
ctx.stroke();
ctx.restore();

// 4. LED HANGER CABLES & LIGHT SEQUENCES (Batch Path Demoscene Method)
const hangerBaseX = [];
const hangerYTop = [];
const hangerYBot = [];
const hangerLen = [];

for (let i = 0; i < cableCount; i++) {
  const u = (i + 0.5) / cableCount;
  const x = W * (0.02 + 0.96 * u);
  // Skip space immediately occupied by tower core legs
  if (Math.abs(x - xT1) < 14 || Math.abs(x - xT2) < 14) continue;
  const yTop = getCableTop(x);
  const yBot = yDeck - 4 * Math.sin(Math.PI * (x / W));
  if (yBot - yTop > 8) {
    hangerBaseX.push(x);
    hangerYTop.push(yTop);
    hangerYBot.push(yBot);
    hangerLen.push(yBot - yTop);
  }
}

// Draw base physical hanger cables
ctx.beginPath();
for (let i = 0; i < hangerBaseX.length; i++) {
  ctx.moveTo(hangerBaseX[i], hangerYTop[i]);
  ctx.lineTo(hangerBaseX[i], hangerYBot[i]);
}
ctx.lineWidth = 1.0;
ctx.strokeStyle = 'rgba(70, 95, 125, 0.35)';
ctx.stroke();

// LED Pulse Calculation per cable
const numCables = hangerBaseX.length;
const pulseHeads = [];
const pulseTails = [];
const pulseAlphas = [];

for (let i = 0; i < numCables; i++) {
  const u = i / (numCables - 1);
  const len = hangerLen[i];
  let pHead = 0;
  let pTail = 0;
  let pAlpha = 0.85;

  if (pattern === 'Rain Cascade') {
    // Falling droplets with randomized phase & audio speed-up
    const dropSpd = (0.7 + ((i * 17) % 11) * 0.08) * speed;
    const phase = (t * dropSpd + ((i * 31.7) % 7.0)) % 1.0;
    pHead = phase;
    pTail = Math.max(0, phase - 0.22);
    pAlpha = 0.4 + 0.6 * (1.0 - phase * 0.3);
  } else if (pattern === 'Tidal Surge') {
    // Breathing vertical tide sweeping left to right
    const wave = Math.sin(u * 7.0 - t * 1.8 * speed + Math.cos(u * 3.0 + t)) * 0.5 + 0.5;
    const breathe = Math.sin(t * 1.2 * speed + u * 2.0) * 0.25 + 0.5;
    pHead = Math.min(1.0, 1.0 - (1.0 - wave) * breathe + 0.15);
    pTail = Math.max(0.0, pHead - 0.35);
    pAlpha = 0.5 + 0.5 * wave;
  } else if (pattern === 'Aurora Veil') {
    // Luminous undulating ribbon floating down and across cables
    const center = 0.5 + 0.38 * Math.sin(u * 9.0 + Math.sin(t * speed + u * 4.0) * 2.5);
    pHead = Math.min(1.0, center + 0.18);
    pTail = Math.max(0.0, center - 0.18);
    pAlpha = 0.6 + 0.4 * Math.cos(u * 12.0 - t * 2.0 * speed);
  } else if (pattern === 'Shadow & Echo') {
    // Deep dramatic traveling shadow slots across illuminated field
    const block = Math.sin(u * 6.0 - t * 1.4 * speed);
    if (block > -0.2) {
      pHead = 1.0;
      pTail = 0.0;
      pAlpha = Math.max(0.1, block);
    } else {
      pHead = 0;
      pTail = 0;
      pAlpha = 0;
    }
  } else { // 'Equalizer Waves'
    // Audio frequency bands rising from deck upward
    const freqVal = (u < 0.33) ? audio.bass : (u < 0.66 ? audio.mid : audio.treble);
    const barHeight = Math.min(1.0, 0.15 + freqVal * 0.75 + 0.15 * Math.sin(u * 14.0 + t * 4.0 * speed));
    pHead = 1.0;
    pTail = Math.max(0.0, 1.0 - barHeight);
    pAlpha = 0.6 + 0.4 * freqVal;
  }

  // Check outward audio shockwave ripples
  for (let p = 0; p < room.state.pulses.length; p++) {
    const pulse = room.state.pulses[p];
    const pAge = (t - pulse.t0) * pulse.speed;
    const dist = Math.abs(u - 0.5) * 2.0;
    const waveFront = pAge - dist;
    if (waveFront > 0 && waveFront < 0.35) {
      const boostVal = (1.0 - waveFront / 0.35);
      pAlpha = Math.min(1.0, pAlpha + boostVal * 0.75);
      pTail = Math.max(0, pTail - 0.15);
    }
  }

  pulseHeads.push(pHead);
  pulseTails.push(pTail);
  pulseAlphas.push(pAlpha);
}

// Draw LED Active Glow Segments (Additive)
ctx.save();
ctx.globalCompositeOperation = 'lighter';

// Layer A: Wide outer soft neon glow
ctx.beginPath();
for (let i = 0; i < numCables; i++) {
  if (pulseAlphas[i] <= 0.02) continue;
  const x = hangerBaseX[i];
  const yTop = hangerYTop[i];
  const len = hangerLen[i];
  const y1 = yTop + pulseTails[i] * len;
  const y2 = yTop + pulseHeads[i] * len;
  if (Math.abs(y2 - y1) > 1) {
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
  }
}
ctx.lineWidth = 4.0 + audioBoost * 2.5;
ctx.strokeStyle = pal.glow;
ctx.stroke();

// Layer B: Intense brilliant core
ctx.beginPath();
for (let i = 0; i < numCables; i++) {
  if (pulseAlphas[i] <= 0.02) continue;
  const x = hangerBaseX[i];
  const yTop = hangerYTop[i];
  const len = hangerLen[i];
  const y1 = yTop + pulseTails[i] * len;
  const y2 = yTop + pulseHeads[i] * len;
  if (Math.abs(y2 - y1) > 1) {
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
  }
}
ctx.lineWidth = 1.6;
ctx.strokeStyle = pal.core;
ctx.stroke();

// Small bright splashing sparks when drops hit the deck
if (pattern === 'Rain Cascade') {
  ctx.fillStyle = pal.core;
  for (let i = 0; i < numCables; i++) {
    if (pulseHeads[i] > 0.94) {
      const x = hangerBaseX[i];
      const y = hangerYBot[i];
      const spkSize = 2.0 + Math.sin(t * 15 + i) * 1.0;
      ctx.fillRect(x - spkSize * 0.5, y - 2, spkSize, spkSize);
    }
  }
}
ctx.restore(); // Restore from 'lighter'

// 5. WATER REFLECTIONS OF LED CABLES (Mirrored & Blurred with Wave Distortion)
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const reflMaxDepth = (H - yWater) * 0.88;

// Broad wavy reflection strokes in the water
for (let pass = 0; pass < 2; pass++) {
  ctx.beginPath();
  const isWide = (pass === 0);
  ctx.lineWidth = isWide ? (6.0 * rippleMul + 2.0) : (2.5 * rippleMul + 1.0);
  ctx.strokeStyle = isWide ? pal.waterGlow : pal.glow;
  ctx.globalAlpha = isWide ? (0.28 + audioBoost * 0.15) : (0.45 + audioBoost * 0.2);

  for (let i = 0; i < numCables; i++) {
    if (pulseAlphas[i] <= 0.05) continue;
    const x = hangerBaseX[i];
    const yTop = hangerYTop[i];
    const yBot = hangerYBot[i];
    const len = hangerLen[i];

    const yAir1 = yTop + pulseTails[i] * len;
    const yAir2 = yTop + pulseHeads[i] * len;
    if (Math.abs(yAir2 - yAir1) < 2) continue;

    // Project into mirrored water space
    const d1 = (yAir1 - yDeck);
    const d2 = (yAir2 - yDeck);
    const yRefl1 = yWater + Math.abs(d1) * 0.78;
    const yRefl2 = Math.min(H, yWater + Math.abs(d2) * 0.78);
    if (yRefl2 <= yWater) continue;

    // Ripple offsets
    const ripPhase = yRefl1 * 0.045 + t * 2.6 * speed + (x * 0.02);
    const ripDx1 = Math.sin(ripPhase) * 5.0 * rippleMul;
    const ripDx2 = Math.sin(ripPhase + 1.6) * 7.5 * rippleMul;

    ctx.moveTo(x + ripDx1, yRefl1);
    ctx.lineTo(x + ripDx2, yRefl2);
  }
  ctx.stroke();
}

// Water shimmer lines (horizontal specular reflections across river surface)
ctx.beginPath();
const shimStep = Math.max(6, Math.floor((H - yWater) / 14));
for (let y = yWater + 6; y < H - 8; y += shimStep) {
  const depthNorm = (y - yWater) / (H - yWater);
  const rip = Math.sin(y * 0.18 + t * 2.2 * speed);
  if (rip > 0.2) {
    const spanW = W * (0.3 + 0.65 * (1.0 - depthNorm));
    const spanX = (W - spanW) * 0.5 + Math.cos(y * 0.08 + t) * 40 * rippleMul;
    ctx.moveTo(spanX, y);
    ctx.lineTo(spanX + spanW, y);
  }
}
ctx.lineWidth = 1.0;
ctx.strokeStyle = pal.waterGlow;
ctx.globalAlpha = 0.35 + audioBoost * 0.2;
ctx.stroke();
ctx.restore();

// 6. BRIDGE TOWERS (Architectural Silhouette & Illumination)
function drawTower(xCenter) {
  const legHalfW = 16;
  const legThickness = 7.5;
  const yBase = yWater + 18;

  // Tower Shadow Legs
  ctx.fillStyle = '#060c18';
  ctx.beginPath();
  // Left leg
  ctx.moveTo(xCenter - legHalfW - legThickness, yBase);
  ctx.lineTo(xCenter - legHalfW + 2, yBase);
  ctx.lineTo(xCenter - 4, yTowerTop);
  ctx.lineTo(xCenter - 10, yTowerTop);
  ctx.closePath();
  // Right leg
  ctx.moveTo(xCenter + legHalfW - 2, yBase);
  ctx.lineTo(xCenter + legHalfW + legThickness, yBase);
  ctx.lineTo(xCenter + 10, yTowerTop);
  ctx.lineTo(xCenter + 4, yTowerTop);
  ctx.closePath();
  ctx.fill();

  // Tower Portal Cross-struts (Classic suspension trusses)
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#091322';
  ctx.beginPath();
  const struts = [0.3, 0.52, 0.72, 0.88];
  for (let s = 0; s < struts.length; s++) {
    const sy = yTowerTop + (yBase - yTowerTop) * struts[s];
    const span = (legHalfW + 4) * (1.0 - struts[s] * 0.45);
    ctx.moveTo(xCenter - span, sy);
    ctx.lineTo(xCenter + span, sy);
    // Cross X
    if (s < struts.length - 1) {
      const syNext = yTowerTop + (yBase - yTowerTop) * struts[s + 1];
      const spanNext = (legHalfW + 4) * (1.0 - struts[s + 1] * 0.45);
      ctx.moveTo(xCenter - span, sy);
      ctx.lineTo(xCenter + spanNext, syNext);
      ctx.moveTo(xCenter + span, sy);
      ctx.lineTo(xCenter - spanNext, syNext);
    }
  }
  ctx.stroke();

  // Edge Highlights (Catching city and LED cable rim light)
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#2b4466';
  ctx.beginPath();
  ctx.moveTo(xCenter - legHalfW - legThickness, yBase);
  ctx.lineTo(xCenter - 10, yTowerTop);
  ctx.moveTo(xCenter + legHalfW + legThickness, yBase);
  ctx.lineTo(xCenter + 10, yTowerTop);
  ctx.stroke();

  // Spire Pinnacle Cap
  ctx.fillStyle = '#112238';
  ctx.fillRect(xCenter - 7, yTowerTop - 22, 14, 22);
  ctx.fillStyle = '#3a5982';
  ctx.fillRect(xCenter - 1.5, yTowerTop - 36, 3, 14);

  // Aircraft warning beacons on tower spires
  const beaconFlash = (Math.sin(t * 2.8 + (xCenter > W * 0.5 ? 1.4 : 0)) > 0.1);
  ctx.fillStyle = beaconFlash ? '#ff1e1e' : '#440a0a';
  ctx.fillRect(xCenter - 2.5, yTowerTop - 38, 5, 4);
  if (beaconFlash) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255, 30, 30, 0.5)';
    ctx.beginPath();
    ctx.arc(xCenter, yTowerTop - 36, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

drawTower(xT1);
drawTower(xT2);

// Tower Water Reflections (Dark monolithic reflections cutting the river)
ctx.save();
ctx.fillStyle = 'rgba(3, 7, 14, 0.75)';
for (let tx of [xT1, xT2]) {
  const rip = Math.sin(t * 2.0 + tx) * 8 * rippleMul;
  ctx.beginPath();
  ctx.moveTo(tx - 28 + rip, yWater);
  ctx.lineTo(tx + 28 + rip, yWater);
  ctx.lineTo(tx + 40 - rip, H);
  ctx.lineTo(tx - 40 - rip, H);
  ctx.closePath();
  ctx.fill();
}
ctx.restore();

// 7. BRIDGE ROADWAY DECK & VEHICLE TRAFFIC
// Under-deck structural truss girder
ctx.fillStyle = '#050a14';
ctx.fillRect(0, yDeck, W, 14);
ctx.strokeStyle = '#122036';
ctx.lineWidth = 1.2;
ctx.beginPath();
ctx.moveTo(0, yDeck);
ctx.lineTo(W, yDeck);
ctx.moveTo(0, yDeck + 14);
ctx.lineTo(W, yDeck + 14);
// Truss diagonal pattern
const trussStep = 18;
for (let x = 0; x < W; x += trussStep) {
  ctx.moveTo(x, yDeck + 14);
  ctx.lineTo(x + trussStep * 0.5, yDeck);
  ctx.lineTo(x + trussStep, yDeck + 14);
}
ctx.stroke();

// Traffic Trails
const cars = room.state.traffic;
const carCount = Math.min(cars.length, trafficDensity);

ctx.save();
ctx.globalCompositeOperation = 'lighter';
for (let i = 0; i < carCount; i++) {
  const c = cars[i];
  c.u += c.spd * speed * dt * (c.dir > 0 ? 1 : 1);
  if (c.u > 1.0) c.u -= 1.0;

  const cx1 = c.u * W;
  const cx2 = cx1 + c.len * W * c.dir;
  const cy = yDeck + 3 + c.lane;

  if (c.dir > 0) {
    // Headlights (Warm White / Amber travelling right)
    ctx.strokeStyle = 'rgba(255, 245, 200, 0.85)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx1, cy);
    ctx.lineTo(cx2, cy);
    ctx.stroke();
  } else {
    // Taillights (Vivid Ruby Red travelling left)
    ctx.strokeStyle = 'rgba(255, 25, 45, 0.9)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx1, cy);
    ctx.lineTo(cx2, cy);
    ctx.stroke();
  }
}
ctx.restore();

// Deck continuous edge illumination glow
ctx.save();
ctx.globalCompositeOperation = 'lighter';
ctx.strokeStyle = 'rgba(180, 215, 255, 0.4)';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.moveTo(0, yDeck);
ctx.lineTo(W, yDeck);
ctx.stroke();
ctx.restore();

// 8. ROOM PEOPLE INTEGRATION (Connected Audience Beacons)
if (room.people && room.people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let idx = 0; idx < room.people.length; idx++) {
    const p = room.people[idx];
    const pNorm = (idx + 0.5) / room.people.length;
    const px = W * (0.05 + 0.9 * pNorm);
    const py = yDeck - 2;
    const pHue = (typeof p.hue === 'number') ? p.hue : ((idx * 57) % 360);
    const pPulse = 0.5 + 0.5 * Math.sin(t * 3.0 + idx);

    // Beacon dot
    ctx.fillStyle = `hsl(${pHue}, 95%, 70%)`;
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Halo
    ctx.fillStyle = `hsla(${pHue}, 95%, 60%, ${0.35 * pPulse})`;
    ctx.beginPath();
    ctx.arc(px, py, 7.0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 9. RIVER MIST & ATMOSPHERIC FOG
if (fogDensity > 0.02) {
  const fogGrad = ctx.createLinearGradient(0, yWater - 24, 0, yWater + 60);
  fogGrad.addColorStop(0, 'rgba(10, 24, 46, 0)');
  fogGrad.addColorStop(0.35, `rgba(18, 38, 64, ${0.38 * fogDensity})`);
  fogGrad.addColorStop(1, 'rgba(4, 10, 20, 0)');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, yWater - 24, W, 84);
}

// Screen Vignette for projection contrast in dark room
const vigGrad = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.35, W * 0.5, H * 0.5, W * 0.75);
vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
vigGrad.addColorStop(1, 'rgba(0, 2, 6, 0.75)');
ctx.fillStyle = vigGrad;
ctx.fillRect(0, 0, W, H);

ctx.restore();