const W = frame.width;
const H = frame.height;

// --- State initialization (bounded, demoscene LUTs) ---
if (!room.state.init) {
  room.state.init = true;
  // Precompute sine/perlin-like table for cloud rim modulation
  const lutSize = 256;
  room.state.lut = new Float32Array(lutSize);
  for (let i = 0; i < lutSize; i++) {
    const a = (i / lutSize) * Math.PI * 2;
    room.state.lut[i] = Math.sin(a) * 0.45 + Math.sin(a * 3 + 1.2) * 0.3 + Math.sin(a * 7 - 0.5) * 0.15 + Math.sin(a * 13) * 0.1;
  }
  // Rain curtain filaments
  room.state.curtains = Array.from({ length: 48 }, (_, i) => ({
    xOff: (i / 48) * 2 - 1,
    phase: Math.random() * 6.28,
    speed: 0.7 + Math.random() * 0.6,
    width: 8 + Math.random() * 24,
    alpha: 0.1 + Math.random() * 0.25
  }));
  // Lightning state
  room.state.lightning = {
    timer: 0,
    flash: 0,
    sheetAlpha: 0,
    bolt: null,
    boltOrigin: [0, 0],
    boltHits: []
  };
}

const lut = room.state.lut;
const lutMask = 255;
const getNoise = (idx) => lut[(idx & lutMask)];

// --- Controls & Palettes ---
const palettes = {
  'Twilight Ember': {
    skyTop: '#080511', skyMid: '#240d22', horizon: '#f26829',
    cloudShadow: '#100b18', cloudBody: '#281a2e', cloudHighlight: '#e09875',
    lightning: '#ffe7d6', rim: '#fca34d'
  },
  'Bruised Plum': {
    skyTop: '#04020a', skyMid: '#1a0d2e', horizon: '#b64279',
    cloudShadow: '#090714', cloudBody: '#201633', cloudHighlight: '#b894e6',
    lightning: '#eedeff', rim: '#d66ba0'
  },
  'Tornado Emerald': {
    skyTop: '#020909', skyMid: '#0a2321', horizon: '#57966b',
    cloudShadow: '#061211', cloudBody: '#132b26', cloudHighlight: '#7fc9ab',
    lightning: '#d6fff2', rim: '#6ee7b7'
  },
  'Electric Indigo': {
    skyTop: '#02030d', skyMid: '#0d1838', horizon: '#3b6ab5',
    cloudShadow: '#070a17', cloudBody: '#152042', cloudHighlight: '#8aaee8',
    lightning: '#e0f0ff', rim: '#60a5fa'
  }
};

const paletteChoice = getVar('storm_palette') ?? 'Twilight Ember';
const pal = palettes[paletteChoice] ?? palettes['Twilight Ember'];
const rotSpeed = getVar('rotation_speed') ?? 0.8;
const curtainDrift = getVar('curtain_drift') ?? 1.0;
const anvilSize = getVar('anvil_size') ?? 1.0;
const prairieSilhouettes = getVar('prairie_silhouettes') ?? true;

const lightningRates = { 'Simmering': 0.35, 'Rolling Thunder': 0.8, 'Catastrophic': 1.6 };
const flashRate = (lightningRates[getVar('lightning_rate')] ?? 0.8) * (1 + (audio?.mid ?? 0) * 1.5);

// --- Lightning & audio reaction ---
const lt = room.state.lightning;
lt.timer -= frame.dt * flashRate;
if (audio?.beat || lt.timer <= 0) {
  lt.timer = 1.0 + Math.random() * 2.5;
  const strike = Math.random() < 0.45 || (audio?.bass ?? 0) > 0.65;
  lt.flash = strike ? 0.95 : 0.4;
  lt.sheetAlpha = 0.5 + Math.random() * 0.4;
  
  if (strike) {
    // Generate a jagged cloud-to-ground fork
    const bx = W * (0.38 + (Math.random() - 0.4) * 0.25);
    const by = H * 0.52;
    const segs = [];
    let cx = bx;
    let cy = by;
    const targetY = H * 0.82;
    const steps = 14;
    const dy = (targetY - by) / steps;
    for (let s = 0; s < steps; s++) {
      const nx = cx + (Math.random() - 0.48) * (W * 0.035);
      const ny = cy + dy;
      segs.push([cx, cy, nx, ny]);
      cx = nx;
      cy = ny;
      if (Math.random() < 0.3) {
        // Sub branch
        segs.push([cx, cy, cx + (Math.random() - 0.5) * (W * 0.05), cy + dy * 0.8]);
      }
    }
    lt.bolt = segs;
  } else {
    lt.bolt = null;
  }
}
lt.flash = Math.max(0, lt.flash - frame.dt * 3.5);
lt.sheetAlpha = Math.max(0, lt.sheetAlpha - frame.dt * 2.2);

ctx.save();

// 1. Sky & Dusk Horizon Gradient
const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.86);
skyGrad.addColorStop(0, pal.skyTop);
skyGrad.addColorStop(0.55, pal.skyMid);
skyGrad.addColorStop(0.82, pal.horizon);
skyGrad.addColorStop(1, '#050204');
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

// Intracloud sheet lightning sky backwash
if (lt.flash > 0.02) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const flashGrad = ctx.createRadialGradient(W * 0.44, H * 0.48, 20, W * 0.44, H * 0.48, W * 0.7);
  flashGrad.addColorStop(0, pal.lightning);
  flashGrad.addColorStop(0.4, pal.rim);
  flashGrad.addColorStop(1, 'transparent');
  ctx.globalAlpha = lt.flash * 0.65;
  ctx.fillStyle = flashGrad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// 2. Mesocyclone / Wall Cloud geometry
const stormCenterX = W * 0.45;
const horizonY = H * 0.82;
const t = frame.t * rotSpeed;

// High Anvil Outflow (sheared spreading disk across top)
ctx.save();
const anvilWidth = W * 0.85 * anvilSize;
const anvilHeight = H * 0.28 * anvilSize;
const anvilGrad = ctx.createRadialGradient(stormCenterX - W * 0.1, H * 0.22, 40, stormCenterX, H * 0.25, anvilWidth);
anvilGrad.addColorStop(0, pal.cloudBody);
anvilGrad.addColorStop(0.65, pal.cloudShadow);
anvilGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = anvilGrad;
ctx.beginPath();
ctx.ellipse(stormCenterX + W * 0.05, H * 0.22, anvilWidth * 0.6, anvilHeight, -0.05, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// 3. Rotating Banded Cloud Tiers (Stacked barber-pole mesocyclone)
const tiers = 7;
for (let i = tiers; i >= 0; i--) {
  const prog = i / tiers; // 0: bottom wall cloud, 1: upper mid-levels
  const tierY = H * (0.62 - prog * 0.32);
  const rx = (W * 0.22) * (0.6 + prog * 1.35) * anvilSize;
  const ry = rx * 0.27;
  const rotOffset = t * (0.8 + (1 - prog) * 0.6) + prog * 2.2;
  const numLobes = 24;

  ctx.save();
  ctx.beginPath();
  
  // Banded perimeter with harmonic turbulence
  for (let j = 0; j <= numLobes; j++) {
    const angle = (j / numLobes) * Math.PI * 2;
    const lutIdx = Math.floor(((angle + rotOffset) / (Math.PI * 2)) * 256) & 255;
    const bump = getNoise(lutIdx) * (rx * 0.1) * (0.8 + (audio?.bass ?? 0) * 0.4);
    const radX = rx + bump;
    const radY = ry + bump * 0.3;
    const px = stormCenterX + Math.cos(angle) * radX;
    const py = tierY + Math.sin(angle) * radY;
    if (j === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // Shading: dark base, twilight edge lighting on the windward side
  const tierGrad = ctx.createLinearGradient(stormCenterX - rx, tierY, stormCenterX + rx, tierY + ry * 0.8);
  const shadowAlpha = 0.92 - prog * 0.1;
  tierGrad.addColorStop(0, pal.cloudShadow);
  tierGrad.addColorStop(0.5, pal.cloudBody);
  tierGrad.addColorStop(0.85, pal.cloudHighlight);
  tierGrad.addColorStop(1, pal.cloudShadow);

  ctx.fillStyle = tierGrad;
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 24;
  ctx.fill();

  // Internal lightning glow highlight inside the wall cloud
  if (lt.sheetAlpha > 0.05 && i <= 3) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = lt.sheetAlpha * (1 - prog * 0.4);
    ctx.strokeStyle = pal.lightning;
    ctx.lineWidth = 3 + (3 - i) * 2;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// 4. Rain & Hail Curtains (Precipitation cascade falling to prairie)
ctx.save();
ctx.beginPath();
const wallCloudBaseY = H * 0.62;
const curtainLeft = stormCenterX - W * 0.28;
const curtainRight = stormCenterX + W * 0.12;

// Sheared curtain envelope
ctx.moveTo(curtainLeft + W * 0.05, wallCloudBaseY);
ctx.lineTo(curtainRight, wallCloudBaseY);
ctx.lineTo(curtainRight + W * 0.06 * curtainDrift, horizonY);
ctx.lineTo(curtainLeft - W * 0.04 * curtainDrift, horizonY);
ctx.closePath();

const rainGrad = ctx.createLinearGradient(0, wallCloudBaseY, 0, horizonY);
rainGrad.addColorStop(0, 'rgba(8, 6, 14, 0.85)');
rainGrad.addColorStop(0.7, 'rgba(15, 12, 25, 0.7)');
rainGrad.addColorStop(1, 'rgba(40, 25, 45, 0.4)');
ctx.fillStyle = rainGrad;
ctx.fill();

// Rain streaks / filaments drifting with wind shear
ctx.lineWidth = 2.5;
for (let i = 0; i < room.state.curtains.length; i++) {
  const c = room.state.curtains[i];
  const driftPos = (c.xOff * (W * 0.18) + (frame.t * 30 * curtainDrift * c.speed)) % (W * 0.38);
  const sx = stormCenterX - W * 0.1 + driftPos;
  const sy = wallCloudBaseY + Math.sin(frame.t + c.phase) * 6;
  const ex = sx + (horizonY - sy) * 0.22 * curtainDrift;

  ctx.strokeStyle = (i % 3 === 0) ? pal.cloudHighlight : pal.cloudBody;
  ctx.globalAlpha = c.alpha * (0.5 + (audio?.mid ?? 0) * 0.5);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, horizonY);
  ctx.stroke();
}
ctx.restore();

// 5. Cloud-to-ground lightning bolts
if (lt.bolt && lt.flash > 0.1) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  
  // Core bright stroke
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass === 0 ? 5.5 : 1.8;
    ctx.strokeStyle = pass === 0 ? pal.rim : '#ffffff';
    ctx.globalAlpha = pass === 0 ? lt.flash * 0.6 : lt.flash;
    ctx.beginPath();
    for (let k = 0; k < lt.bolt.length; k++) {
      const [x1, y1, x2, y2] = lt.bolt[k];
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
  // Flash flare at ground strike point
  const lastSeg = lt.bolt[lt.bolt.length - 1];
  if (lastSeg) {
    const flareGrad = ctx.createRadialGradient(lastSeg[2], lastSeg[3], 2, lastSeg[2], lastSeg[3], W * 0.12);
    flareGrad.addColorStop(0, '#ffffff');
    flareGrad.addColorStop(0.3, pal.lightning);
    flareGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = flareGrad;
    ctx.fillRect(lastSeg[2] - W * 0.12, lastSeg[3] - W * 0.12, W * 0.24, W * 0.24);
  }
  ctx.restore();
}

// 6. Plains Ground Silhouette
ctx.save();
ctx.fillStyle = '#030205';
ctx.beginPath();
ctx.rect(0, horizonY, W, H - horizonY);
ctx.fill();

// Horizon twilight edge highlight
const horizonGlow = ctx.createLinearGradient(0, horizonY - 4, 0, horizonY + 6);
horizonGlow.addColorStop(0, pal.rim);
horizonGlow.addColorStop(0.4, 'rgba(0,0,0,0.8)');
horizonGlow.addColorStop(1, '#030205');
ctx.fillStyle = horizonGlow;
ctx.fillRect(0, horizonY - 4, W, 8);

// 7. Prairie Details & Connected People
if (prairieSilhouettes) {
  ctx.strokeStyle = '#08060a';
  ctx.fillStyle = '#08060a';
  ctx.lineWidth = 1.8;

  // Distant utility poles & sagging wire line along plains
  const poleCount = 14;
  let prevPoleX = 0;
  let prevPoleY = 0;
  for (let p = 0; p < poleCount; p++) {
    const px = (p / (poleCount - 1)) * W;
    const poleH = 14 + (p % 3) * 4;
    const py = horizonY - poleH;

    // Pole
    ctx.beginPath();
    ctx.moveTo(px, horizonY + 2);
    ctx.lineTo(px, py);
    // Crossarm
    ctx.moveTo(px - 4, py + 3);
    ctx.lineTo(px + 4, py + 3);
    ctx.stroke();

    // Power lines
    if (p > 0) {
      ctx.beginPath();
      ctx.moveTo(prevPoleX, prevPoleY + 3);
      ctx.quadraticCurveTo((prevPoleX + px) * 0.5, prevPoleY + 7, px, py + 3);
      ctx.stroke();
    }
    prevPoleX = px;
    prevPoleY = py;
  }

  // Distant prairie wind pump / windmill silhouette on the right plains
  const millX = W * 0.88;
  const millY = horizonY;
  ctx.beginPath();
  ctx.moveTo(millX - 8, millY);
  ctx.lineTo(millX, millY - 38);
  ctx.lineTo(millX + 8, millY);
  ctx.moveTo(millX - 5, millY - 18);
  ctx.lineTo(millX + 5, millY - 18);
  ctx.stroke();
  // Vane / wheel
  ctx.beginPath();
  ctx.arc(millX, millY - 38, 9, 0, Math.PI * 2);
  ctx.stroke();
}

// Room people: mapped to distant storm chaser headlights & radio towers on the horizon
if (room.people && room.people.length > 0) {
  for (let i = 0; i < room.people.length; i++) {
    const person = room.people[i];
    const px = ((i + 1) / (room.people.length + 1)) * (W * 0.9) + (W * 0.05);
    const py = horizonY + 2;
    
    // Chaser vehicle lights with slow atmospheric beacon flicker
    const blink = Math.sin(frame.t * 3.5 + i * 1.7) > 0.1;
    ctx.save();
    ctx.fillStyle = `hsl(${person.hue}, 90%, ${blink ? '65%' : '35%'})`;
    ctx.beginPath();
    ctx.arc(px, py, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Slight glow
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.4 + (audio?.level ?? 0) * 0.4;
    ctx.fillStyle = `hsl(${person.hue}, 90%, 50%)`;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

ctx.restore();