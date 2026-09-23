ctx.save();
const W = frame.width;
const H = frame.height;
const minDim = Math.min(W, H);
const cx = W * 0.5;
const cy = H * 0.5;

// Persistent buffers allocated once to prevent GC hitches
const MAX_STEPS = 720;
room.state.ptsX ??= new Float32Array(MAX_STEPS);
room.state.ptsY ??= new Float32Array(MAX_STEPS);
room.state.morphPhase ??= 0;
room.state.bassPulse ??= 0;

const paletteKey = getVar('ink_palette') ?? 'banknote_green';
const symKey = getVar('symmetry') ?? 'septenary_7';
const geomKey = getVar('geometry_mode') ?? 'hypotrochoid';
const styleKey = getVar('render_style') ?? 'fine_intaglio';
const strandCount = Math.floor(getVar('strand_count') ?? 24);
const driftSpeed = getVar('drift_speed') ?? 0.6;

const symMap = {
  hexagonal_6: 6,
  septenary_7: 7,
  octagonal_8: 8,
  hendecagonal_11: 11,
  tridecagonal_13: 13
};
const petals = symMap[symKey] ?? 7;

const palettes = {
  banknote_green: { bg: '#040d08', baseH: 152, sat: 75, lum: 54, accentH: 180 },
  imperial_crimson: { bg: '#100306', baseH: 345, sat: 82, lum: 58, accentH: 28 },
  cobalt_security: { bg: '#030814', baseH: 216, sat: 86, lum: 62, accentH: 260 },
  aurum_gilt: { bg: '#0d0902', baseH: 42, sat: 90, lum: 60, accentH: 18 },
  monochrome_steel: { bg: '#08090a', baseH: 210, sat: 12, lum: 75, accentH: 195 }
};
const pal = palettes[paletteKey] ?? palettes.banknote_green;

// Drift phase accumulation and audio tracking
const bass = audio ? (audio.bass || 0) : 0;
const beat = audio ? (audio.beat ? 1 : 0) : 0;
room.state.bassPulse += (bass * 0.4 + beat * 0.2 - room.state.bassPulse) * Math.min(1, frame.dt * 12);
room.state.morphPhase += frame.dt * driftSpeed * 0.45;
const t = room.state.morphPhase;

// Banknote dark cardstock background
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Subtle background crosshatch grid vignette
ctx.lineWidth = 0.5;
ctx.strokeStyle = `hsla(${pal.baseH}, ${pal.sat * 0.3}%, 20%, 0.15)`;
const gridStep = Math.max(32, Math.floor(minDim / 28));
ctx.beginPath();
for (let gx = (cx % gridStep); gx < W; gx += gridStep) {
  ctx.moveTo(gx, 0);
  ctx.lineTo(gx, H);
}
for (let gy = (cy % gridStep); gy < H; gy += gridStep) {
  ctx.moveTo(0, gy);
  ctx.lineTo(W, gy);
}
ctx.stroke();

// Security seal outer border
ctx.beginPath();
ctx.arc(cx, cy, minDim * 0.46, 0, Math.PI * 2);
ctx.strokeStyle = `hsla(${pal.baseH}, ${pal.sat}%, ${pal.lum * 0.7}%, 0.35)`;
ctx.lineWidth = 1.2;
ctx.stroke();

ctx.beginPath();
ctx.arc(cx, cy, minDim * 0.445, 0, Math.PI * 2);
ctx.setLineDash([2, 4]);
ctx.stroke();
ctx.setLineDash([]);

// People presence: accent medallions around border
const people = room.people || [];
if (people.length > 0) {
  const ringRad = minDim * 0.452;
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const ang = (i / people.length) * Math.PI * 2 + t * 0.2;
    const px = cx + Math.cos(ang) * ringRad;
    const py = cy + Math.sin(ang) * ringRad;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.hue}, 85%, 65%)`;
    ctx.fill();
  }
}

// Composite setup per style
if (styleKey === 'phosphor_bloom') {
  ctx.globalCompositeOperation = 'screen';
} else if (styleKey === 'spectral_moire') {
  ctx.globalCompositeOperation = 'lighter';
} else {
  ctx.globalCompositeOperation = 'source-over';
}

// Rosette dimension parameters
const baseR = minDim * 0.28;
const r = baseR / petals;
const dBase = baseR * (0.62 + 0.18 * Math.sin(t * 0.8));
const bassOffset = room.state.bassPulse * (minDim * 0.04);
const isEpi = (geomKey === 'epitrochoid');
const isCompound = (geomKey === 'nested_compound');

const pxBuf = room.state.ptsX;
const pyBuf = room.state.ptsY;
const twoPi = Math.PI * 2;
const totalLaps = petals;
const dTheta = (twoPi * totalLaps) / MAX_STEPS;

// Draw interlaced rosette ribbons
for (let s = 0; s < strandCount; s++) {
  const sNorm = s / strandCount;
  const strandD = dBase + (s - strandCount * 0.5) * (3.8 + bassOffset * 0.15);
  const rotOffset = (sNorm * 0.08) * Math.sin(t * 1.1 + s * 0.1);
  const phaseShift = sNorm * twoPi * (0.25 + 0.1 * Math.cos(t * 0.5));
  
  let R_cur = baseR;
  let r_cur = r;
  if (isCompound && (s % 2 === 1)) {
    R_cur = baseR * 0.65;
    r_cur = R_cur / (petals - 1 || 1);
  }

  const k = isEpi ? (R_cur + r_cur) : (R_cur - r_cur);
  const ratio = isEpi ? ((R_cur + r_cur) / r_cur) : ((R_cur - r_cur) / r_cur);
  const sign = isEpi ? -1 : -1;
  const signY = isEpi ? 1 : -1;

  // Compute points directly into TypedArray (zero allocations)
  for (let i = 0; i < MAX_STEPS; i++) {
    const theta = i * dTheta + phaseShift;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const subT = ratio * theta;
    const cosSub = Math.cos(subT);
    const sinSub = Math.sin(subT);

    let x = k * cosT + sign * strandD * cosSub;
    let y = k * sinT + signY * strandD * sinSub;

    if (rotOffset !== 0) {
      const cRot = Math.cos(rotOffset);
      const sRot = Math.sin(rotOffset);
      const rx = x * cRot - y * sRot;
      const ry = x * sRot + y * cRot;
      x = rx;
      y = ry;
    }

    pxBuf[i] = cx + x;
    pyBuf[i] = cy + y;
  }

  // Line rendering style
  const hueOffset = (sNorm - 0.5) * 36 + (styleKey === 'spectral_moire' ? sNorm * 120 : 0);
  const finalHue = (pal.baseH + hueOffset + 360) % 360;
  const alpha = styleKey === 'fine_intaglio' ? 0.42 : (0.24 + sNorm * 0.18);
  const lightness = pal.lum + (s % 3 === 0 ? 12 : -6);

  ctx.strokeStyle = `hsla(${finalHue}, ${pal.sat}%, ${lightness}%, ${alpha})`;
  ctx.lineWidth = styleKey === 'phosphor_bloom' ? (s % 4 === 0 ? 1.8 : 0.8) : 0.85;

  ctx.beginPath();
  ctx.moveTo(pxBuf[0], pyBuf[0]);
  for (let i = 1; i < MAX_STEPS; i++) {
    ctx.lineTo(pxBuf[i], pyBuf[i]);
  }
  ctx.closePath();
  ctx.stroke();
}

// Center medallion security ringlet
const coreRad = minDim * (0.05 + 0.015 * Math.sin(t * 2));
ctx.beginPath();
ctx.arc(cx, cy, coreRad, 0, twoPi);
ctx.strokeStyle = `hsla(${pal.accentH}, 80%, 75%, 0.6)`;
ctx.lineWidth = 1.0;
ctx.stroke();

ctx.restore();