ctx.save();

// 1. Demoscene lookup tables & persistent state
if (!room.state.lut) {
  room.state.lut = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    room.state.lut[i] = Math.sin((i / 512) * Math.PI * 2);
  }
}
const lut = room.state.lut;
const fastSin = (rad) => {
  let idx = (rad * 81.48733) & 511;
  if (idx < 0) idx += 512;
  return lut[idx];
};
const fastCos = (rad) => fastSin(rad + 1.5707963);

// Smooth audio envelopes
const bRaw = audio.bass ?? 0;
const mRaw = audio.mid ?? 0;
const tRaw = audio.treble ?? 0;
room.state.sb = (room.state.sb ?? 0) * 0.82 + bRaw * 0.18;
room.state.sm = (room.state.sm ?? 0) * 0.85 + mRaw * 0.15;
room.state.st = (room.state.st ?? 0) * 0.85 + tRaw * 0.15;

// Controls
const layout = getVar('layout') ?? 'Triptych';
const purity = getVar('purity') ?? 'Fluorescent';
const driftSpeed = getVar('drift_speed') ?? 0.6;
const slatDensity = getVar('slat_density') ?? 40;
const shadowPillars = getVar('shadow_pillars') ?? true;
const satBoost = getVar('saturation_boost') ?? 1.0;

// Persistent phase clock
room.state.phase = (room.state.phase ?? 0) + (frame.dt ?? 0.016) * driftSpeed * (1.0 + room.state.sm * 0.75);
const ph = room.state.phase;
const w = frame.width;
const h = frame.height;

// Palette sets (pure R, G, B primaries tailored for additive secondary yields)
const palettes = {
  'Fluorescent': [
    [255, 12, 45],
    [10, 255, 95],
    [25, 75, 255]
  ],
  'Deep Laser': [
    [255, 0, 0],
    [0, 255, 0],
    [0, 20, 255]
  ],
  'Phosphor': [
    [255, 45, 20],
    [30, 255, 185],
    [110, 30, 255]
  ]
};
const pal = palettes[purity] ?? palettes['Fluorescent'];

// 2. Base deep void
ctx.fillStyle = '#030306';
ctx.fillRect(0, 0, w, h);

// 3. Additive Chamber Light Pass
ctx.save();
ctx.globalCompositeOperation = 'lighter';

const beatPulse = (audio.beat ? 0.22 : 0) + room.state.sb * 0.35;
const breath = fastSin(ph * 0.8) * 0.12;

for (let c = 0; c < 3; c++) {
  const [pr, pg, pb] = pal[c];
  const alphaBoost = Math.min(1.0, (0.85 + breath + beatPulse) * satBoost);
  const colorCore = `rgba(${pr}, ${pg}, ${pb}, ${alphaBoost.toFixed(3)})`;
  const colorEdge = `rgba(${pr}, ${pg}, ${pb}, 0)`;

  ctx.save();

  if (layout === 'Triptych') {
    // Drifting architectural vertical zones that bleed horizontally
    const baseFrac = (c + 0.5) / 3;
    const wanderX = fastSin(ph * 0.6 + c * 2.1) * 0.14 * w;
    const centerX = baseFrac * w + wanderX;
    const chamberW = (w * 0.52) * (1.0 + room.state.sb * 0.28);
    const skew = fastCos(ph * 0.4 + c * 1.5) * 60;

    const grad = ctx.createRadialGradient(
      centerX, h * 0.5,
      chamberW * 0.08,
      centerX + skew, h * 0.5,
      chamberW
    );
    grad.addColorStop(0, colorCore);
    grad.addColorStop(0.45, `rgba(${pr}, ${pg}, ${pb}, ${(alphaBoost * 0.7).toFixed(3)})`);
    grad.addColorStop(1, colorEdge);

    ctx.fillStyle = grad;
    ctx.beginPath();
    const ySteps = 12;
    ctx.moveTo(centerX - chamberW * 0.8, 0);
    for (let s = 0; s <= ySteps; s++) {
      const py = (s / ySteps) * h;
      const off = fastSin(ph * 1.2 + s * 0.5 + c * 2.3) * (24 + room.state.sm * 40);
      ctx.lineTo(centerX + chamberW * 0.8 + off, py);
    }
    for (let s = ySteps; s >= 0; s--) {
      const py = (s / ySteps) * h;
      const off = fastCos(ph * 1.1 + s * 0.6 + c * 1.8) * (20 + room.state.st * 30);
      ctx.lineTo(centerX - chamberW * 0.8 - off, py);
    }
    ctx.closePath();
    ctx.fill();

  } else if (layout === 'Labyrinth') {
    // Interlocking rectangular light chambers & doorways
    const ang = (c * 2.094) + ph * 0.45;
    const cx = w * 0.5 + fastCos(ang) * (w * 0.25);
    const cy = h * 0.5 + fastSin(ang) * (h * 0.22);
    const rad = (Math.min(w, h) * 0.48) * (1.0 + room.state.sb * 0.2);

    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, rad);
    grad.addColorStop(0, colorCore);
    grad.addColorStop(0.55, `rgba(${pr}, ${pg}, ${pb}, ${(alphaBoost * 0.55).toFixed(3)})`);
    grad.addColorStop(1, colorEdge);

    ctx.fillStyle = grad;
    const rectW = rad * 1.7;
    const rectH = rad * 1.35;
    const rot = fastSin(ph * 0.3 + c) * 0.25;

    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillRect(-rectW * 0.5, -rectH * 0.5, rectW, rectH);

    const tongueW = rectW * 0.45;
    const tongueL = rad * 1.5;
    ctx.fillRect(-tongueW * 0.5, rectH * 0.3, tongueW, tongueL);

  } else {
    // Prism Vault: Convergent radiant light wedges
    const sourceX = ((c + 1) / 4) * w + fastSin(ph * 0.7 + c) * (w * 0.08);
    const sourceY = fastCos(ph * 0.5 + c * 2.0) * 40;
    const spread = w * (0.35 + room.state.sb * 0.18);

    const grad = ctx.createRadialGradient(sourceX, sourceY, 15, sourceX, h * 0.75, h * 1.1);
    grad.addColorStop(0, colorCore);
    grad.addColorStop(0.6, `rgba(${pr}, ${pg}, ${pb}, ${(alphaBoost * 0.6).toFixed(3)})`);
    grad.addColorStop(1, colorEdge);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sourceX - 40, sourceY);
    ctx.lineTo(sourceX + 40, sourceY);
    ctx.lineTo(sourceX + spread + fastSin(ph + c) * 50, h);
    ctx.lineTo(sourceX - spread - fastCos(ph + c) * 50, h);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}
ctx.restore(); // end lighter

// 4. Cruz-Diez Physichromie Slats (Optical retinal vibration grid)
if (slatDensity > 0) {
  ctx.save();
  const slatCount = Math.floor((slatDensity / 80) * 160 + 20);
  const step = w / slatCount;
  const microShift = fastSin(ph * 1.5) * (step * 0.35);
  ctx.lineWidth = Math.max(1, step * 0.28);

  for (let i = 0; i < slatCount; i++) {
    const sx = i * step + microShift;
    const wave = fastSin(i * 0.22 + ph * 2.0);
    const slitAlpha = 0.18 + wave * 0.12 + room.state.st * 0.15;
    ctx.strokeStyle = `rgba(3, 4, 8, ${slitAlpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.stroke();
  }
  ctx.restore();
}

// 5. Architectural Framing / Shadow Pillars
if (shadowPillars) {
  ctx.save();
  ctx.fillStyle = '#06070a';

  const headerH = h * 0.05;
  const sillH = h * 0.06;
  ctx.fillRect(0, 0, w, headerH);
  ctx.fillRect(0, h - sillH, w, sillH);

  const p1X = w * 0.32 + fastSin(ph * 0.4) * 25;
  const p2X = w * 0.68 + fastCos(ph * 0.35) * 25;
  const pillarW = Math.max(8, w * 0.016);

  const penumbraW = pillarW * 3.5;
  const drawPillarWithShadow = (px) => {
    const shadowGrad = ctx.createLinearGradient(px - penumbraW, 0, px + pillarW + penumbraW, 0);
    shadowGrad.addColorStop(0, 'rgba(4, 5, 8, 0)');
    shadowGrad.addColorStop(0.35, 'rgba(4, 5, 8, 0.7)');
    shadowGrad.addColorStop(0.5, 'rgba(4, 5, 8, 0.96)');
    shadowGrad.addColorStop(0.65, 'rgba(4, 5, 8, 0.7)');
    shadowGrad.addColorStop(1, 'rgba(4, 5, 8, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(px - penumbraW, headerH, pillarW + penumbraW * 2, h - headerH - sillH);

    ctx.fillStyle = '#040508';
    ctx.fillRect(px, headerH, pillarW, h - headerH - sillH);
  };

  drawPillarWithShadow(p1X);
  drawPillarWithShadow(p2X);
  ctx.restore();
}

// 6. Spectator silhouettes / Presence in the Chromosaturation space
if (room.people && room.people.length > 0) {
  ctx.save();
  const count = Math.min(room.people.length, 12);
  for (let i = 0; i < count; i++) {
    const p = room.people[i];
    const pFrac = (i + 1) / (count + 1);
    const wander = fastSin(ph * 0.5 + i * 1.7) * 40;
    const px = pFrac * w + wander;
    const py = h * 0.94;
    const scale = (0.7 + fastCos(i + ph * 0.3) * 0.15) * (h / 700);

    ctx.fillStyle = 'rgba(2, 3, 5, 0.82)';
    ctx.beginPath();
    ctx.arc(px, py - 65 * scale, 11 * scale, 0, Math.PI * 2);
    ctx.moveTo(px - 16 * scale, py);
    ctx.lineTo(px - 13 * scale, py - 48 * scale);
    ctx.lineTo(px + 13 * scale, py - 48 * scale);
    ctx.lineTo(px + 16 * scale, py);
    ctx.closePath();
    ctx.fill();

    const auraHue = p.hue ?? ((i * 120) % 360);
    ctx.fillStyle = `hsla(${auraHue}, 90%, 65%, 0.18)`;
    ctx.beginPath();
    ctx.ellipse(px, py + 4, 28 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

ctx.restore();