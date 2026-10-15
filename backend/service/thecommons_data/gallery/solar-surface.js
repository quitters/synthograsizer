ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// --- Variable & Audio Unpacking ---
const palKey = getVar('palette_mode') ?? 'hydrogen_alpha';
const activity = getVar('activity_level') ?? 3;
const gSpeedVar = getVar('granulation_speed') ?? 1.0;
const spotScaleVar = getVar('sunspot_scale') ?? 80;
const promStyle = getVar('prominence_style') ?? 'magnetic_loops';
const coronaFactor = getVar('corona_glow') ?? 0.75;
const flareEnabled = getVar('solar_flare') ?? true;

const bass = audio ? (audio.bass || 0) : 0;
const mid = audio ? (audio.mid || 0) : 0;
const treble = audio ? (audio.treble || 0) : 0;
const beat = audio ? (audio.beat || false) : false;

// --- Persistent State Initialization ---
const GW = 140, GH = 90;
if (!room.state.granCanvas) {
  room.state.granCanvas = new OffscreenCanvas(GW, GH);
  room.state.granCtx = room.state.granCanvas.getContext('2d');
  room.state.granImg = room.state.granCtx.createImageData(GW, GH);
  room.state.granU32 = new Uint32Array(room.state.granImg.data.buffer);
  room.state.lut = new Uint32Array(256);
  room.state.activePalette = '';
  room.state.flareEnergy = 0;
  room.state.waveRadius = 0;

  const cols = 15, rows = 10;
  const count = cols * rows;
  room.state.seedCount = count;
  room.state.cols = cols;
  room.state.rows = rows;
  room.state.seedBaseX = new Float32Array(count);
  room.state.seedBaseY = new Float32Array(count);
  room.state.seedPhase = new Float32Array(count);
  room.state.seedSpeed = new Float32Array(count);
  room.state.curX = new Float32Array(count);
  room.state.curY = new Float32Array(count);

  let sIdx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      room.state.seedBaseX[sIdx] = (c + 0.5) * (GW / cols);
      room.state.seedBaseY[sIdx] = (r + 0.5) * (GH / rows);
      room.state.seedPhase[sIdx] = (sIdx * 1.618) % (Math.PI * 2);
      room.state.seedSpeed[sIdx] = 0.6 + ((sIdx * 37) % 50) * 0.015;
      sIdx++;
    }
  }

  room.state.plasma = [];
  for (let i = 0; i < 90; i++) {
    room.state.plasma.push({
      u: (i * 0.011) % 1.0,
      strand: i % 6,
      speed: 0.04 + ((i * 13) % 40) * 0.002,
      size: 1.5 + (i % 3) * 1.2,
      offset: ((i % 7) - 3) * 4
    });
  }
}

// --- Palette LUT Rebuild on Switch ---
if (room.state.activePalette !== palKey) {
  room.state.activePalette = palKey;
  const lut = room.state.lut;
  let stops;
  if (palKey === 'solar_gold') {
    stops = [
      [0.00, 16, 7, 2],
      [0.18, 65, 28, 4],
      [0.48, 190, 95, 8],
      [0.78, 255, 195, 38],
      [1.00, 255, 255, 230]
    ];
  } else if (palKey === 'extreme_uv') {
    stops = [
      [0.00, 8, 3, 22],
      [0.18, 45, 12, 90],
      [0.48, 130, 28, 190],
      [0.78, 20, 190, 235],
      [1.00, 240, 255, 255]
    ];
  } else {
    stops = [
      [0.00, 20, 2, 4],
      [0.18, 85, 10, 6],
      [0.48, 205, 32, 10],
      [0.78, 255, 140, 22],
      [1.00, 255, 250, 220]
    ];
  }
  for (let i = 0; i < 256; i++) {
    const p = i / 255;
    let s = 0;
    while (s < stops.length - 2 && stops[s + 1][0] < p) s++;
    const t0 = stops[s][0], t1 = stops[s + 1][0];
    const f = Math.max(0, Math.min(1, (p - t0) / (t1 - t0)));
    const r = Math.round(stops[s][1] + f * (stops[s + 1][1] - stops[s][1]));
    const g = Math.round(stops[s][2] + f * (stops[s + 1][2] - stops[s][2]));
    const b = Math.round(stops[s][3] + f * (stops[s + 1][3] - stops[s][3]));
    lut[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
}

// --- Theme Colors for Overlays ---
const themes = {
  hydrogen_alpha: {
    space: '#020003',
    limbGlow: 'rgba(255, 60, 15, 0.45)',
    spicule: '#ff3d14',
    promPrimary: 'rgba(255, 65, 20, 0.85)',
    promHighlight: 'rgba(255, 200, 80, 0.95)',
    flareCore: '#fff5ea',
    sunspotPen: 'rgba(90, 14, 8, 0.75)',
    faculae: 'rgba(255, 180, 70, 0.35)'
  },
  solar_gold: {
    space: '#030200',
    limbGlow: 'rgba(245, 160, 20, 0.45)',
    spicule: '#ffaa10',
    promPrimary: 'rgba(235, 140, 15, 0.85)',
    promHighlight: 'rgba(255, 235, 130, 0.95)',
    flareCore: '#fffff0',
    sunspotPen: 'rgba(80, 36, 6, 0.75)',
    faculae: 'rgba(255, 225, 90, 0.35)'
  },
  extreme_uv: {
    space: '#020108',
    limbGlow: 'rgba(10, 190, 230, 0.45)',
    spicule: '#14b8a6',
    promPrimary: 'rgba(139, 92, 246, 0.85)',
    promHighlight: 'rgba(103, 232, 249, 0.95)',
    flareCore: '#ecfeff',
    sunspotPen: 'rgba(40, 15, 80, 0.75)',
    faculae: 'rgba(147, 197, 253, 0.35)'
  }
};
const col = themes[palKey] || themes.hydrogen_alpha;

// --- Flare Reconnection & Beat Dynamics ---
if (flareEnabled) {
  if (beat || bass > 0.68) {
    room.state.flareEnergy = Math.min(1.0, room.state.flareEnergy + 0.45);
    if (room.state.waveRadius <= 0 || room.state.waveRadius > W * 0.8) {
      room.state.waveRadius = 15;
    }
  }
  room.state.flareEnergy *= Math.pow(0.88, dt * 60);
  if (room.state.waveRadius > 0) {
    room.state.waveRadius += dt * (W * 0.45);
    if (room.state.waveRadius > W * 0.9) room.state.waveRadius = 0;
  }
} else {
  room.state.flareEnergy = 0;
  room.state.waveRadius = 0;
}

// --- Cellular Granulation in Low-Res Offscreen Buffer ---
const gSpeed = gSpeedVar * (0.8 + mid * 0.9);
const sCount = room.state.seedCount;
const cols = room.state.cols;
const rows = room.state.rows;
const seedX = room.state.seedBaseX;
const seedY = room.state.seedBaseY;
const seedPh = room.state.seedPhase;
const seedSp = room.state.seedSpeed;
const curX = room.state.curX;
const curY = room.state.curY;

for (let i = 0; i < sCount; i++) {
  const ph = seedPh[i] + t * seedSp[i] * gSpeed;
  curX[i] = seedX[i] + Math.sin(ph) * 3.5;
  curY[i] = seedY[i] + Math.cos(ph * 1.25) * 3.5;
}

const u32 = room.state.granU32;
const lut = room.state.lut;
let pIdx = 0;
const cellW = GW / cols;
const cellH = GH / rows;

for (let y = 0; y < GH; y++) {
  const gy = Math.floor(y / cellH);
  for (let x = 0; x < GW; x++) {
    const gx = Math.floor(x / cellW);
    let d1 = 99999, d2 = 99999;
    for (let oy = -1; oy <= 1; oy++) {
      const ry = gy + oy;
      if (ry < 0 || ry >= rows) continue;
      const rOffset = ry * cols;
      for (let ox = -1; ox <= 1; ox++) {
        const rx = gx + ox;
        if (rx < 0 || rx >= cols) continue;
        const sIndex = rOffset + rx;
        const dx = x - curX[sIndex];
        const dy = y - curY[sIndex];
        const distSq = dx * dx + dy * dy;
        if (distSq < d1) {
          d2 = d1;
          d1 = distSq;
        } else if (distSq < d2) {
          d2 = distSq;
        }
      }
    }
    const d1s = Math.sqrt(d1);
    const d2s = Math.sqrt(d2);
    const edge = Math.min(1.0, (d2s - d1s) * 0.44);
    const center = Math.max(0.0, 1.0 - d1s * 0.14);
    let val = center * 0.68 + edge * 0.32;
    val = Math.max(0, Math.min(1, val));
    u32[pIdx++] = lut[(val * 255) | 0];
  }
}
room.state.granCtx.putImageData(room.state.granImg, 0, 0);

// --- Solar Disc Geometry: Monumental Curved Limb ---
const discX = W * 0.28;
const discY = H * 1.34;
const discR = Math.hypot(W, H) * 0.74;

// Clear void of space
ctx.fillStyle = col.space;
ctx.fillRect(0, 0, W, H);

// Outer Space Coronal Streamers
ctx.save();
ctx.globalCompositeOperation = 'screen';
const numStreamers = 18;
for (let i = 0; i < numStreamers; i++) {
  const ang = -1.55 + (i / numStreamers) * 1.15 + Math.sin(t * 0.2 + i) * 0.03;
  const strLen = discR * 1.45 + (i % 4) * 80;
  const ex = discX + Math.cos(ang) * strLen;
  const ey = discY + Math.sin(ang) * strLen;
  const grad = ctx.createLinearGradient(discX + Math.cos(ang) * discR, discY + Math.sin(ang) * discR, ex, ey);
  grad.addColorStop(0, col.promPrimary);
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 14 + (i % 5) * 8;
  ctx.beginPath();
  ctx.moveTo(discX + Math.cos(ang) * discR, discY + Math.sin(ang) * discR);
  ctx.lineTo(ex, ey);
  ctx.stroke();
}
ctx.restore();

// --- Draw Solar Photosphere (Clipped to Disc) ---
ctx.save();
ctx.beginPath();
ctx.arc(discX, discY, discR, 0, Math.PI * 2);
ctx.clip();

// Upscale boiling granulation
ctx.imageSmoothingEnabled = true;
ctx.drawImage(room.state.granCanvas, 0, 0, W, H);

// Limb Darkening Radial Gradient Overlay
const limbGrad = ctx.createRadialGradient(discX, discY, discR * 0.45, discX, discY, discR);
limbGrad.addColorStop(0.00, 'rgba(255, 230, 160, 0.05)');
limbGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.00)');
limbGrad.addColorStop(0.88, 'rgba(0, 0, 0, 0.38)');
limbGrad.addColorStop(1.00, 'rgba(5, 0, 0, 0.88)');
ctx.fillStyle = limbGrad;
ctx.fillRect(0, 0, W, H);

// --- Active Sunspots with Penumbra & Light Bridges ---
const spotR = (spotScaleVar * (W / 1200)) * (0.95 + bass * 0.1);
const spotX = W * 0.40;
const spotY = H * 0.74;

// Bright Faculae / Plage around spots
ctx.save();
ctx.globalCompositeOperation = 'screen';
ctx.fillStyle = col.faculae;
for (let i = 0; i < 7; i++) {
  const fx = spotX + Math.cos(i * 1.1) * (spotR * 1.55);
  const fy = spotY + Math.sin(i * 1.1) * (spotR * 1.15);
  ctx.beginPath();
  ctx.ellipse(fx, fy, spotR * 0.5, spotR * 0.28, i * 0.7, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// Primary Leader Sunspot: Radial Penumbral Filaments
const penCount = 72;
ctx.lineWidth = 2.0;
ctx.strokeStyle = col.sunspotPen;
ctx.beginPath();
for (let i = 0; i < penCount; i++) {
  const a = (i / penCount) * Math.PI * 2;
  const rIn = spotR * (0.42 + Math.sin(i * 5 + t * 0.5) * 0.05);
  const rOut = spotR * (1.15 + Math.sin(i * 7 + t * 0.3) * 0.18);
  const x1 = spotX + Math.cos(a) * rIn;
  const y1 = spotY + Math.sin(a) * rIn * 0.85;
  const x2 = spotX + Math.cos(a + 0.08) * rOut;
  const y2 = spotY + Math.sin(a + 0.08) * rOut * 0.85;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
}
ctx.stroke();

// Dark Umbra Core
ctx.fillStyle = '#030104';
ctx.beginPath();
const umbVerts = 18;
for (let i = 0; i < umbVerts; i++) {
  const a = (i / umbVerts) * Math.PI * 2;
  const r = spotR * (0.46 + Math.sin(i * 4 + 1.2) * 0.09);
  const ux = spotX + Math.cos(a) * r;
  const uy = spotY + Math.sin(a) * r * 0.85;
  if (i === 0) ctx.moveTo(ux, uy);
  else ctx.lineTo(ux, uy);
}
ctx.closePath();
ctx.fill();

// Incandescent Light Bridge splitting Umbra
ctx.save();
ctx.strokeStyle = col.promHighlight;
ctx.lineWidth = 2.5;
ctx.globalAlpha = 0.85;
ctx.beginPath();
ctx.moveTo(spotX - spotR * 0.36, spotY - spotR * 0.05);
ctx.quadraticCurveTo(spotX, spotY + spotR * 0.12, spotX + spotR * 0.38, spotY + spotR * 0.02);
ctx.stroke();
ctx.restore();

// Trailer Follower Sunspot Group
const trX = spotX + spotR * 1.55;
const trY = spotY - spotR * 0.32;
const trR = spotR * 0.52;
ctx.beginPath();
ctx.strokeStyle = col.sunspotPen;
ctx.lineWidth = 1.4;
for (let i = 0; i < 36; i++) {
  const a = (i / 36) * Math.PI * 2;
  const rIn = trR * 0.38;
  const rOut = trR * (1.1 + Math.sin(i * 3) * 0.15);
  ctx.moveTo(trX + Math.cos(a) * rIn, trY + Math.sin(a) * rIn);
  ctx.lineTo(trX + Math.cos(a) * rOut, trY + Math.sin(a) * rOut);
}
ctx.stroke();
ctx.fillStyle = '#040105';
ctx.beginPath();
ctx.arc(trX, trY, trR * 0.42, 0, Math.PI * 2);
ctx.fill();

// Dynamic Flare Moreton Shockwave Ripple
if (room.state.waveRadius > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = col.promHighlight;
  ctx.lineWidth = Math.max(1, 6 * (1 - room.state.waveRadius / (W * 0.9)));
  ctx.globalAlpha = (1 - room.state.waveRadius / (W * 0.9)) * 0.7;
  ctx.beginPath();
  ctx.arc(discX + Math.cos(-1.38) * discR, discY + Math.sin(-1.38) * discR, room.state.waveRadius, -0.6, 1.2);
  ctx.stroke();
  ctx.restore();
}
ctx.restore(); // End Disc Clip

// --- Chromosphere Limb & Spicule Forest ---
ctx.save();
ctx.beginPath();
ctx.arc(discX, discY, discR, -1.6, -0.7);
ctx.strokeStyle = col.limbGlow;
ctx.lineWidth = 28 * coronaFactor;
ctx.stroke();

ctx.beginPath();
ctx.arc(discX, discY, discR, -1.6, -0.7);
ctx.strokeStyle = col.flareCore;
ctx.lineWidth = 2.5;
ctx.stroke();

ctx.strokeStyle = col.spicule;
ctx.lineWidth = 1.6;
ctx.beginPath();
const numSpicules = 220;
for (let i = 0; i < numSpicules; i++) {
  const a = -1.60 + (i / numSpicules) * 0.92;
  const spLen = 8 + Math.sin(i * 3.7 + t * 8) * 4 + mid * 10 + ((i % 5) === 0 ? 9 : 0);
  const bx = discX + Math.cos(a) * discR;
  const by = discY + Math.sin(a) * discR;
  const tx = discX + Math.cos(a) * (discR + spLen);
  const ty = discY + Math.sin(a) * (discR + spLen);
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty);
}
ctx.stroke();
ctx.restore();

// --- Monumental Prominence Arching into Space ---
const angA = -1.38;
const angB = -0.92;
const p0x = discX + Math.cos(angA) * discR;
const p0y = discY + Math.sin(angA) * discR;
const p3x = discX + Math.cos(angB) * discR;
const p3y = discY + Math.sin(angB) * discR;

const baseH = H * (0.32 + activity * 0.05) + bass * (H * 0.16);
const cp1x = p0x + Math.cos(angA) * (baseH * 0.85);
const cp1y = p0y + Math.sin(angA) * (baseH * 0.85);
const cp2x = p3x + Math.cos(angB) * (baseH * 0.85);
const cp2y = p3y + Math.sin(angB) * (baseH * 0.85);

ctx.save();
ctx.globalCompositeOperation = 'screen';

if (promStyle === 'twisted_ribbon') {
  const steps = 44;
  const strands = 3;
  for (let s = 0; s < strands; s++) {
    const sOffset = (s / strands) * Math.PI * 2;
    ctx.strokeStyle = s === 0 ? col.promHighlight : col.promPrimary;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const u1 = 1 - u;
      const bx = u1 * u1 * u1 * p0x + 3 * u1 * u1 * u * cp1x + 3 * u1 * u * u * cp2x + u * u * u * p3x;
      const by = u1 * u1 * u1 * p0y + 3 * u1 * u1 * u * cp1y + 3 * u1 * u * u * cp2y + u * u * u * p3y;
      const tx = 3 * u1 * u1 * (cp1x - p0x) + 6 * u1 * u * (cp2x - cp1x) + 3 * u * u * (p3x - cp2x);
      const ty = 3 * u1 * u1 * (cp1y - p0y) + 6 * u1 * u * (cp2y - cp1y) + 3 * u * u * (p3y - cp2y);
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len;
      const ny = tx / len;
      const twistR = 26 * Math.sin(u * Math.PI) * (1 + bass * 0.4);
      const helix = Math.sin(u * 14 + t * 4 + sOffset) * twistR;
      const qx = bx + nx * helix;
      const qy = by + ny * helix;
      if (k === 0) ctx.moveTo(qx, qy);
      else ctx.lineTo(qx, qy);
    }
    ctx.stroke();
  }
} else if (promStyle === 'eruptive_plume') {
  ctx.strokeStyle = col.promPrimary;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(p0x, p0y);
  ctx.bezierCurveTo(cp1x, cp1y, cp1x + 60, cp1y - 90, p0x + Math.cos(angA) * (baseH * 1.25), p0y + Math.sin(angA) * (baseH * 1.25));
  ctx.stroke();
  const apexX = p0x + Math.cos(angA) * (baseH * 1.25);
  const apexY = p0y + Math.sin(angA) * (baseH * 1.25);
  for (let b = 0; b < 14; b++) {
    const bDist = 18 + (b % 4) * 12 + bass * 25;
    const bx = apexX + Math.cos(t * 1.2 + b * 0.45) * bDist;
    const by = apexY + Math.sin(t * 1.2 + b * 0.45) * bDist * 0.8;
    ctx.fillStyle = b % 2 === 0 ? col.promHighlight : col.promPrimary;
    ctx.beginPath();
    ctx.arc(bx, by, 10 + (b % 3) * 6, 0, Math.PI * 2);
    ctx.fill();
  }
} else {
  const loopCount = 7;
  for (let l = 0; l < loopCount; l++) {
    const f = (l + 1) / loopCount;
    const hMult = 0.55 + f * 0.52;
    const lcp1x = p0x + Math.cos(angA) * (baseH * hMult);
    const lcp1y = p0y + Math.sin(angA) * (baseH * hMult);
    const lcp2x = p3x + Math.cos(angB) * (baseH * hMult);
    const lcp2y = p3y + Math.sin(angB) * (baseH * hMult);
    ctx.strokeStyle = l === loopCount - 1 ? col.promHighlight : col.promPrimary;
    ctx.lineWidth = 1.8 + (l % 3) * 1.2;
    ctx.globalAlpha = 0.45 + (l / loopCount) * 0.5;
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.bezierCurveTo(lcp1x, lcp1y, lcp2x, lcp2y, p3x, p3y);
    ctx.stroke();
  }
}

// Streaming Plasma Beads along Field Lines
const plasma = room.state.plasma;
for (let i = 0; i < plasma.length; i++) {
  const p = plasma[i];
  p.u = (p.u + p.speed * dt * (activity * 0.35 + 0.6)) % 1.0;
  const u = p.u;
  const u1 = 1 - u;
  const strandH = 0.65 + (p.strand / 6) * 0.45;
  const c1x = p0x + Math.cos(angA) * (baseH * strandH);
  const c1y = p0y + Math.sin(angA) * (baseH * strandH);
  const c2x = p3x + Math.cos(angB) * (baseH * strandH);
  const c2y = p3y + Math.sin(angB) * (baseH * strandH);
  const px = u1 * u1 * u1 * p0x + 3 * u1 * u1 * u * c1x + 3 * u1 * u * c2x + u * u * u * p3x;
  const py = u1 * u1 * u1 * p0y + 3 * u1 * u1 * u * c1y + 3 * u1 * u * c2y + u * u * u * p3y;
  ctx.fillStyle = i % 3 === 0 ? col.promHighlight : col.promPrimary;
  ctx.beginPath();
  ctx.arc(px, py, p.size * (1 + bass * 0.5), 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// --- Magnetic Reconnection Flare Core at Footpoint ---
if (room.state.flareEnergy > 0.04) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const fEnergy = room.state.flareEnergy;
  const flX = p0x;
  const flY = p0y;
  const flareGrad = ctx.createRadialGradient(flX, flY, 0, flX, flY, 180 * fEnergy);
  flareGrad.addColorStop(0.0, col.flareCore);
  flareGrad.addColorStop(0.3, col.promHighlight);
  flareGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = flareGrad;
  ctx.beginPath();
  ctx.arc(flX, flY, 180 * fEnergy, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = col.flareCore;
  ctx.lineWidth = 3.0 * fEnergy;
  ctx.beginPath();
  for (let s = 0; s < 6; s++) {
    const sAng = (s / 6) * Math.PI + t * 0.5;
    const sLen = (120 + (s % 2) * 80) * fEnergy;
    ctx.moveTo(flX - Math.cos(sAng) * sLen, flY - Math.sin(sAng) * sLen);
    ctx.lineTo(flX + Math.cos(sAng) * sLen, flY + Math.sin(sAng) * sLen);
  }
  ctx.stroke();
  ctx.restore();
}

// --- Room People as Solar Magnetic Probes ---
const people = room.people || [];
if (people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let idx = 0; idx < people.length; idx++) {
    const p = people[idx];
    const pFrac = (idx + 0.5) / people.length;
    const pAng = -1.48 + pFrac * 0.72;
    const pDist = discR + 45 + Math.sin(t * 1.5 + idx * 2.1) * 28;
    const px = discX + Math.cos(pAng) * pDist;
    const py = discY + Math.sin(pAng) * pDist;
    const pHue = (p.hue !== undefined && p.hue !== null) ? p.hue : ((idx * 67) % 360);

    ctx.strokeStyle = `hsla(${pHue}, 90%, 65%, 0.35)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(discX + Math.cos(pAng) * discR, discY + Math.sin(pAng) * discR);
    ctx.lineTo(px, py);
    ctx.stroke();

    ctx.fillStyle = `hsl(${pHue}, 95%, 70%)`;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `hsla(${pHue}, 95%, 65%, 0.25)`;
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

ctx.restore();