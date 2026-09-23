ctx.save();

const W = frame.width;
const H = frame.height;
const minDim = Math.min(W, H);
const cx0 = W * 0.5;
const cy0 = H * 0.5;

// --- Variable Lookups ---
const speciesKey = getVar('species') ?? 'Ancient Oak';
const growthSpeed = getVar('growth_speed') ?? 0.8;
const knotCount = Math.floor(getVar('knots_count') ?? 3);
const climateVol = getVar('climate_volatility') ?? 0.5;
const cracksKey = getVar('cracks_detail') ?? 'Subtle Heartshakes';
const barkKey = getVar('bark_texture') ?? 'Rough Cork';

const SPECIES = {
  'Ancient Oak':       { hCore: 26, sCore: 55, lCore: 18, hSap: 38, sSap: 48, lSap: 52, hBark: 24, sBark: 22, lBark: 14, hLate: 20, lLate: 11 },
  'Bristlecone Pine':  { hCore: 14, sCore: 70, lCore: 24, hSap: 32, sSap: 60, lSap: 54, hBark: 210, sBark: 12, lBark: 26, hLate: 10, lLate: 10 },
  'Giant Sequoia':     { hCore: 7,  sCore: 68, lCore: 28, hSap: 22, sSap: 62, lSap: 48, hBark: 12,  sBark: 45, lBark: 20, hLate: 4,  lLate: 12 },
  'Birch & Moss':      { hCore: 40, sCore: 38, lCore: 42, hSap: 48, sSap: 32, lSap: 72, hBark: 88,  sBark: 30, lBark: 32, hLate: 35, lLate: 20 }
};
const pal = SPECIES[speciesKey] ?? SPECIES['Ancient Oak'];

// --- Persistent State & Precomputed LUTs ---
const MAX_RINGS = 130;
const N_ANG = 160;

if (!room.state.init) {
  room.state.init = true;
  room.state.cosTab = new Float32Array(N_ANG);
  room.state.sinTab = new Float32Array(N_ANG);
  for (let a = 0; a < N_ANG; a++) {
    const th = (a / N_ANG) * Math.PI * 2;
    room.state.cosTab[a] = Math.cos(th);
    room.state.sinTab[a] = Math.sin(th);
  }

  // Synthetic climate record (11-year solar cycles + sporadic droughts)
  room.state.climate = new Float32Array(MAX_RINGS);
  let phase = 1.3;
  for (let i = 0; i < MAX_RINGS; i++) {
    const solar = Math.sin(i * 0.57) * 0.3;
    const macro = Math.cos(i * 0.12) * 0.25;
    const spike = (Math.sin(i * 3.81 + phase) > 0.72) ? -0.4 : (Math.cos(i * 2.19) > 0.8 ? 0.45 : 0.0);
    room.state.climate[i] = Math.max(0.2, 1.0 + solar + macro + spike);
  }

  // Knots parameters
  room.state.knots = [
    { angle: 0.85,  distFrac: 0.38, spread: 26, strength: 0.42 },
    { angle: 2.45,  distFrac: 0.62, spread: 34, strength: 0.50 },
    { angle: 4.10,  distFrac: 0.50, spread: 30, strength: 0.46 },
    { angle: 5.60,  distFrac: 0.72, spread: 24, strength: 0.38 },
    { angle: 1.60,  distFrac: 0.80, spread: 28, strength: 0.44 },
    { angle: 3.40,  distFrac: 0.28, spread: 20, strength: 0.35 }
  ];

  // Medullary ray angles
  room.state.rays = new Float32Array(36);
  for (let r = 0; r < 36; r++) {
    room.state.rays[r] = (r / 36) * Math.PI * 2 + (Math.sin(r * 4.3) * 0.05);
  }

  room.state.currentYear = 8;
  room.state.pulseR = 0;
}

// --- Year Growth & Audio Resonances ---
const dt = Math.min(frame.dt || 0.016, 0.05);
room.state.currentYear += dt * growthSpeed * 2.2;
if (room.state.currentYear > MAX_RINGS - 1) {
  room.state.currentYear = MAX_RINGS - 1;
}
const activeYear = room.state.currentYear;
const maxVisibleRing = Math.floor(activeYear);
const ringFraction = activeYear - maxVisibleRing;

// Audio beat sap-wave progression
if (audio.beat) {
  room.state.pulseR = 0;
}
room.state.pulseR += dt * 110;

// Determine canvas scale so growing trunk fits comfortably with breathing room
const maxTargetRadius = minDim * 0.42;
const baseStep = maxTargetRadius / Math.max(35, activeYear);
const bassThump = (audio.bass || 0) * 8;

// Fill rich crosscut backdrop
ctx.fillStyle = `hsl(${pal.hBark}, ${pal.sBark * 0.6}%, ${Math.max(3, pal.lBark * 0.45)}%)`;
ctx.fillRect(0, 0, W, H);

// --- Calculate Knot Positions in Pixel Space ---
const cosTab = room.state.cosTab;
const sinTab = room.state.sinTab;
const currentMaxRadius = activeYear * baseStep;

const knotCountClamped = Math.min(knotCount, 6);
const knotPositions = [];
for (let k = 0; k < knotCountClamped; k++) {
  const kd = room.state.knots[k];
  const kDist = kd.distFrac * currentMaxRadius;
  knotPositions.push({
    x: cx0 + Math.cos(kd.angle) * kDist,
    y: cy0 + Math.sin(kd.angle) * kDist,
    spread2: Math.pow(kd.spread * (baseStep / 3.8), 2),
    strength: kd.strength * (1 + (audio.mid || 0) * 0.2)
  });
}

// Helper to evaluate deflected ring coordinates
function getRingPoint(baseR, angleIdx, centerOffX, centerOffY) {
  const ca = cosTab[angleIdx];
  const sa = sinTab[angleIdx];

  // Elliptical lean & low harmonic out-of-roundness
  const th = (angleIdx / N_ANG) * Math.PI * 2;
  const harmonic = 1.0 + 0.045 * Math.cos(2 * th - 0.7) + 0.02 * Math.cos(3 * th + 1.2);
  const r = baseR * harmonic;

  let px = cx0 + centerOffX + ca * r;
  let py = cy0 + centerOffY + sa * r;

  // Knot flow deflection (hydrodynamic dipole around branch)
  for (let k = 0; k < knotCountClamped; k++) {
    const kn = knotPositions[k];
    const dx = px - kn.x;
    const dy = py - kn.y;
    const d2 = dx * dx + dy * dy;
    const infl = (kn.spread2 / (d2 + kn.spread2)) * kn.strength;
    px += dx * infl;
    py += dy * infl;
  }
  return [px, py];
}

// --- Draw Sapwood/Heartwood Body Gradient ---
let accumR = bassThump;
let prevR = 0;

// Draw earlywood filled disks from outer to inner to establish rich wood grain tones
for (let i = maxVisibleRing; i >= 0; i--) {
  const clim = 1.0 + (room.state.climate[i] - 1.0) * climateVol;
  const isFractional = (i === maxVisibleRing);
  const ringWidth = baseStep * clim * (isFractional ? ringFraction : 1.0);
  accumR = 0;
  for (let j = 0; j <= i; j++) {
    const c = 1.0 + (room.state.climate[j] - 1.0) * climateVol;
    accumR += baseStep * c * (j === maxVisibleRing ? ringFraction : 1.0);
  }

  const tNorm = accumR / (currentMaxRadius + 0.001);
  // Blend heartwood (inner dark) to sapwood (outer bright)
  const h = pal.hCore + (pal.hSap - pal.hCore) * tNorm;
  const s = pal.sCore + (pal.sSap - pal.sCore) * tNorm;
  const l = pal.lCore + (pal.lSap - pal.lCore) * (Math.pow(tNorm, 0.85));

  // Center eccentricity drift (pith lean)
  const offX = Math.cos(1.2) * accumR * 0.08;
  const offY = Math.sin(1.2) * accumR * 0.08;

  ctx.beginPath();
  for (let a = 0; a < N_ANG; a++) {
    const [px, py] = getRingPoint(accumR, a, offX, offY);
    if (a === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = `hsl(${h}, ${s}%, ${l}%)`;
  ctx.fill();
}

// --- Draw Medullary Rays (Perpendicular micro-fissures) ---
const rayAlpha = 0.07 + (audio.treble || 0) * 0.12;
ctx.strokeStyle = `hsla(${pal.hSap}, ${pal.sSap * 0.5}%, ${pal.lSap * 1.3}%, ${rayAlpha})`;
ctx.lineWidth = 1.0;
const rays = room.state.rays;
for (let r = 0; r < rays.length; r++) {
  const th = rays[r];
  const cosR = Math.cos(th);
  const sinR = Math.sin(th);
  ctx.beginPath();
  for (let step = 8; step <= maxVisibleRing; step += 3) {
    let rad = 0;
    for (let j = 0; j <= step; j++) rad += baseStep * (1.0 + (room.state.climate[j] - 1.0) * climateVol);
    const wobble = Math.sin(step * 0.7 + r * 3) * 2.5;
    let px = cx0 + (cosR * rad) - (sinR * wobble);
    let py = cy0 + (sinR * rad) + (cosR * wobble);
    // Knot deflection on rays
    for (let k = 0; k < knotCountClamped; k++) {
      const kn = knotPositions[k];
      const dx = px - kn.x;
      const dy = py - kn.y;
      const d2 = dx * dx + dy * dy;
      const infl = (kn.spread2 / (d2 + kn.spread2)) * kn.strength;
      px += dx * infl;
      py += dy * infl;
    }
    if (step === 8) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

// --- Draw Latewood Annular Boundaries (Dark condensed ring borders) ---
accumR = bassThump;
for (let i = 0; i <= maxVisibleRing; i++) {
  const clim = 1.0 + (room.state.climate[i] - 1.0) * climateVol;
  const isLast = (i === maxVisibleRing);
  accumR += baseStep * clim * (isLast ? ringFraction : 1.0);

  const tNorm = accumR / (currentMaxRadius + 0.001);
  const offX = Math.cos(1.2) * accumR * 0.08;
  const offY = Math.sin(1.2) * accumR * 0.08;

  // Highlight ring under audio sap pulse
  const distToPulse = Math.abs(accumR - room.state.pulseR);
  const pulseBoost = distToPulse < 18 ? (1.0 - distToPulse / 18) * 0.45 : 0;

  const lateL = pal.lLate + pulseBoost * 45;
  const lateAlpha = 0.55 + pulseBoost * 0.4;
  ctx.strokeStyle = `hsla(${pal.hLate}, ${pal.sCore}%, ${lateL}%, ${lateAlpha})`;
  ctx.lineWidth = Math.max(0.7, 1.3 - tNorm * 0.5 + pulseBoost * 1.5);

  ctx.beginPath();
  for (let a = 0; a < N_ANG; a++) {
    const [px, py] = getRingPoint(accumR, a, offX, offY);
    if (a === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

// --- Draw Knots (Branches) Dense Cores ---
for (let k = 0; k < knotCountClamped; k++) {
  const kn = knotPositions[k];
  const coreRad = Math.max(4, Math.sqrt(kn.spread2) * 0.28);
  const grad = ctx.createRadialGradient(kn.x, kn.y, 0, kn.x, kn.y, coreRad * 2.2);
  grad.addColorStop(0, `hsl(${pal.hLate}, 70%, 8%)`);
  grad.addColorStop(0.5, `hsl(${pal.hCore}, 60%, 14%)`);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(kn.x, kn.y, coreRad * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Tiny concentric knot core rings
  ctx.strokeStyle = `hsla(${pal.hSap}, 50%, 35%, 0.5) `;
  ctx.lineWidth = 1.0;
  for (let kr = 3; kr < coreRad * 1.8; kr += 3) {
    ctx.beginPath();
    ctx.arc(kn.x, kn.y, kr, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// --- Connected People: Resin Beads along Sap Pores ---
if (room.people && room.people.length > 0) {
  for (let p = 0; p < room.people.length; p++) {
    const person = room.people[p];
    const pAng = (p / room.people.length) * Math.PI * 2 + frame.t * 0.05;
    const pRad = currentMaxRadius * (0.35 + (p % 5) * 0.12);
    const px = cx0 + Math.cos(pAng) * pRad;
    const py = cy0 + Math.sin(pAng) * pRad;

    ctx.fillStyle = `hsla(${person.hue}, 85%, 60%, 0.85)`;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

// --- Draw Cracks / Heartwood Shakes ---
const crackConfigs = {
  'Subtle Heartshakes':     { num: 3, lengthFrac: 0.35, width: 1.2 },
  'Deep Lightning Cracks':  { num: 4, lengthFrac: 0.88, width: 2.2 },
  'Weathered Frost Fissures': { num: 6, lengthFrac: 0.55, width: 1.8 }
};
const crackCfg = crackConfigs[cracksKey] ?? crackConfigs['Subtle Heartshakes'];
ctx.strokeStyle = `rgba(12, 6, 3, 0.88)`;
ctx.lineCap = 'round';

for (let c = 0; c < crackCfg.num; c++) {
  const baseTheta = (c * 2.399) + 0.4;
  ctx.lineWidth = crackCfg.width;
  ctx.beginPath();
  let curX = cx0;
  let curY = cy0;
  ctx.moveTo(curX, curY);
  const maxSteps = Math.floor(28 * crackCfg.lengthFrac);
  const stepLen = (currentMaxRadius * crackCfg.lengthFrac) / maxSteps;

  for (let s = 1; s <= maxSteps; s++) {
    const angWobble = Math.sin(s * 1.7 + c * 4.1) * 0.35;
    curX += Math.cos(baseTheta + angWobble) * stepLen;
    curY += Math.sin(baseTheta + angWobble) * stepLen;
    ctx.lineTo(curX, curY);
  }
  ctx.stroke();

  // Subtle highlighted lip on one side of crack
  ctx.strokeStyle = `hsla(${pal.hSap}, 40%, 65%, 0.25)`;
  ctx.lineWidth = crackCfg.width * 0.5;
  ctx.stroke();
}

// --- Bark Texture Layer (Cambium & Outer Crust) ---
const barkR = accumR;
const barkThick = Math.max(10, baseStep * 3.2);

ctx.save();
// Outer rugged bark perimeter
ctx.beginPath();
for (let a = 0; a <= N_ANG; a++) {
  const aIdx = a % N_ANG;
  const th = (aIdx / N_ANG) * Math.PI * 2;
  const offX = Math.cos(1.2) * barkR * 0.08;
  const offY = Math.sin(1.2) * barkR * 0.08;

  let barkNoise = Math.sin(th * 38) * 3.5 + Math.cos(th * 73) * 2.0;
  if (barkKey === 'Rough Cork') {
    barkNoise += (Math.abs(Math.sin(th * 19)) > 0.65 ? 8 : -4);
  } else if (barkKey === 'Charred Fire-Scar') {
    barkNoise += (th > 2.0 && th < 3.8) ? -12 + Math.sin(th * 60) * 4 : 2;
  } else if (barkKey === 'Lichen & Velvet') {
    barkNoise += Math.sin(th * 12) * 5;
  }

  const [px, py] = getRingPoint(barkR + barkThick + barkNoise, aIdx, offX, offY);
  if (a === 0) ctx.moveTo(px, py);
  else ctx.lineTo(px, py);
}

// Inner cambium cutout
for (let a = N_ANG; a >= 0; a--) {
  const aIdx = a % N_ANG;
  const offX = Math.cos(1.2) * barkR * 0.08;
  const offY = Math.sin(1.2) * barkR * 0.08;
  const [px, py] = getRingPoint(barkR, aIdx, offX, offY);
  ctx.lineTo(px, py);
}
ctx.closePath();

let barkColor = `hsl(${pal.hBark}, ${pal.sBark}%, ${pal.lBark}%)`;
if (barkKey === 'Charred Fire-Scar') {
  barkColor = 'hsl(10, 20%, 8%)';
} else if (barkKey === 'Lichen & Velvet') {
  barkColor = 'hsl(110, 25%, 22%)';
}
ctx.fillStyle = barkColor;
ctx.fill();

// Cambium green/gold living boundary line
ctx.strokeStyle = `hsla(${pal.hSap + 20}, 75%, 45%, 0.75)`;
ctx.lineWidth = 1.8;
ctx.beginPath();
for (let a = 0; a <= N_ANG; a++) {
  const aIdx = a % N_ANG;
  const offX = Math.cos(1.2) * barkR * 0.08;
  const offY = Math.sin(1.2) * barkR * 0.08;
  const [px, py] = getRingPoint(barkR, aIdx, offX, offY);
  if (a === 0) ctx.moveTo(px, py);
  else ctx.lineTo(px, py);
}
ctx.stroke();
ctx.restore();

// --- Center Pith Eye (Origin of the Tree) ---
const pithGrad = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, 9 + bassThump * 0.4);
pithGrad.addColorStop(0, `hsl(${pal.hLate}, 75%, 8%)`);
pithGrad.addColorStop(0.6, `hsl(${pal.hCore}, 65%, 15%)`);
pithGrad.addColorStop(1, 'transparent');
ctx.fillStyle = pithGrad;
ctx.beginPath();
ctx.arc(cx0, cy0, 9 + bassThump * 0.4, 0, Math.PI * 2);
ctx.fill();

ctx.restore();