ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;

// 1. Persistent State Setup (bounded, demoscene LUTs)
room.state.drops ??= [];
room.state.shockwaves ??= [];
room.state.lastDrop ??= -999;
room.state.strobeEnergy ??= 0;

// Handle events: Bass Drop trigger
for (const ev of room.events) {
  if (ev.name === 'drop_bass') {
    room.state.lastDrop = t;
    room.state.strobeEnergy = 1.0;
    room.state.shockwaves.push({ t0: t, x: W * 0.5, y: H * 0.42 });
    if (room.state.shockwaves.length > 8) room.state.shockwaves.shift();
  }
}

// Audio beat pump & natural drop decay
const dropAge = t - room.state.lastDrop;
const isDropping = dropAge >= 0 && dropAge < 3.2;
if (audio.beat && audio.bass > 0.65) {
  room.state.strobeEnergy = Math.max(room.state.strobeEnergy, 0.45);
}
room.state.strobeEnergy *= Math.exp(-frame.dt * 4.5);

// Variables & fallbacks
const beamStyle = getVar('beam_style') ?? 'sweeping_cones';
const glowMul = getVar('glow_intensity') ?? 1.4;
const atmo = getVar('atmosphere') ?? 'thick_haze';
const strobeChoice = getVar('strobe_palette') ?? 'blinding_white';
const extraCrowd = getVar('stagedepth') ?? 80;
const bounceSync = getVar('bounce_sync') ?? true;

const strobeColors = {
  blinding_white: '255, 255, 255',
  electric_cyan: '0, 240, 255',
  acid_magenta: '255, 20, 160',
  solar_gold: '255, 200, 40'
};
const dropRgb = strobeColors[strobeChoice] ?? strobeColors.blinding_white;

// 2. Base Dark Backdrop
ctx.fillStyle = '#030307';
ctx.fillRect(0, 0, W, H);

// Deep arena ambient glow (stage backlight)
const stageY = H * 0.38;
const stageGrad = ctx.createLinearGradient(0, 0, 0, H);
stageGrad.addColorStop(0, '#020205');
stageGrad.addColorStop(0.38, '#080816');
stageGrad.addColorStop(0.7, '#040409');
stageGrad.addColorStop(1, '#000002');
ctx.fillStyle = stageGrad;
ctx.fillRect(0, 0, W, H);

// 3. Volumetric Beams & Moving Heads
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const numRigs = beamStyle === 'prism_lasers' ? 16 : 8;
const beamBass = (audio.bass || 0) * 0.4;
const frenzy = isDropping ? 3.0 : 1.0;

for (let i = 0; i < numRigs; i++) {
  const rigU = (i + 0.5) / numRigs;
  const rigX = W * (0.12 + 0.76 * rigU);
  const rigY = stageY - 15 - Math.sin(rigU * Math.PI) * 40;
  const phase = i * 1.35 + t * (0.8 + 0.3 * (i % 3)) * frenzy;
  
  let spread, targetX, targetY;
  if (beamStyle === 'prism_lasers') {
    spread = 0.015;
    targetX = W * (0.5 + 0.65 * Math.sin(phase * 1.2));
    targetY = H * (0.75 + 0.25 * Math.cos(phase * 0.9));
  } else if (beamStyle === 'stadium_fans') {
    spread = 0.16 + beamBass * 0.08;
    targetX = W * (0.5 + 0.55 * Math.sin(phase * 0.7 + i));
    targetY = H * (0.8 + 0.2 * Math.sin(phase * 0.5));
  } else {
    spread = 0.11 + beamBass * 0.06;
    targetX = W * (rigU + 0.45 * Math.sin(phase));
    targetY = H * 0.95;
  }

  const dx = targetX - rigX;
  const dy = targetY - rigY;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const beamWidthBottom = Math.max(12, dist * spread);

  const beamHue = (i * 45 + t * 25 + (isDropping ? t * 180 : 0)) % 360;
  const beamAlpha = (0.08 + (audio.level || 0) * 0.09) * glowMul;
  const grad = ctx.createLinearGradient(rigX, rigY, targetX, targetY);
  grad.addColorStop(0, `hsla(${beamHue}, 100%, 75%, ${beamAlpha * 2.2})`);
  grad.addColorStop(0.3, `hsla(${beamHue}, 95%, 55%, ${beamAlpha})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(rigX - 3, rigY);
  ctx.lineTo(rigX + 3, rigY);
  ctx.lineTo(targetX + nx * beamWidthBottom, targetY + ny * beamWidthBottom);
  ctx.lineTo(targetX - nx * beamWidthBottom, targetY - ny * beamWidthBottom);
  ctx.closePath();
  ctx.fill();

  // Lens flare dot at fixture
  ctx.fillStyle = `hsla(${beamHue}, 100%, 85%, ${0.35 * glowMul})`;
  ctx.beginPath();
  ctx.arc(rigX, rigY, 7 + audio.mid * 5, 0, Math.PI * 2);
  ctx.fill();
}

// Arena Haze / Fog particles
if (atmo !== 'clean_dark') {
  const hazeHue = atmo === 'neon_mist' ? (t * 20) % 360 : 220;
  const hazeAlpha = (atmo === 'thick_haze' ? 0.06 : 0.09) * (1 + audio.mid * 0.5);
  const hazeGrad = ctx.createRadialGradient(W * 0.5, stageY + 60, 40, W * 0.5, stageY + 100, W * 0.65);
  hazeGrad.addColorStop(0, `hsla(${hazeHue}, 80%, 45%, ${hazeAlpha})`);
  hazeGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(0, stageY - 40, W, H * 0.7);
}
ctx.restore();

// 4. Strobe Pulses & Shockwaves (Bass Drop visual impact)
if (room.state.shockwaves.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let s = room.state.shockwaves.length - 1; s >= 0; s--) {
    const sw = room.state.shockwaves[s];
    const age = t - sw.t0;
    if (age > 1.6) {
      room.state.shockwaves.splice(s, 1);
      continue;
    }
    const prog = age / 1.6;
    const radius = prog * Math.max(W, H) * 0.9;
    ctx.lineWidth = (1 - prog) * 18;
    ctx.strokeStyle = `rgba(${dropRgb}, ${(1 - prog) * 0.7 * glowMul})`;
    ctx.beginPath();
    ctx.ellipse(sw.x, sw.y, radius, radius * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

if (room.state.strobeEnergy > 0.02) {
  const strobeFlash = (Math.sin(t * 70) > 0.1 || isDropping) ? room.state.strobeEnergy : room.state.strobeEnergy * 0.25;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(${dropRgb}, ${Math.min(0.85, strobeFlash * 0.75 * glowMul)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// 5. Crowd Synthesizer
// Build unified crowd: connected people mapped to featured spots + background arena fill
const people = room.people || [];
const bounceBeat = bounceSync ? Math.abs(Math.sin(t * Math.PI * 2.2 + (audio.bass || 0) * 1.5)) : 0;
const jumpBoost = isDropping ? (Math.sin(t * 22) > 0 ? 32 : 8) : 0;

// Depth layers: Distant (Row 0), Mid (Row 1), Front stage silhouettes (Row 2)
const layers = [
  { count: extraCrowd, yMin: stageY + 30, yMax: stageY + 110, scale: 0.35, armReach: 18, alpha: 0.85 },
  { count: Math.floor(extraCrowd * 0.65), yMin: stageY + 100, yMax: stageY + 230, scale: 0.6, armReach: 32, alpha: 0.95 },
  { count: Math.max(people.length, 14), yMin: stageY + 200, yMax: H - 20, scale: 1.0, armReach: 52, alpha: 1.0 }
];

// Deterministic pseudo-random LUT helper (no allocations)
function hash11(p) {
  p = (p * 0.1031) % 1;
  p = p * (p + 33.33);
  p = p * (p + p);
  return (p % 1);
}

layers.forEach((layer, layerIdx) => {
  const isFrontLayer = layerIdx === 2;
  const totalFigures = isFrontLayer ? Math.max(people.length, 14) : layer.count;

  for (let idx = 0; idx < totalFigures; idx++) {
    // Position anchoring across width
    const seed = layerIdx * 1000 + idx;
    const spreadX = (idx + hash11(seed) * 0.75) / (totalFigures + 0.5);
    const baseBx = W * (0.04 + 0.92 * spreadX);
    const baseBy = layer.yMin + (layer.yMax - layer.yMin) * hash11(seed + 17);

    // Associated connected person if front layer
    const person = isFrontLayer && people.length > 0 ? people[idx % people.length] : null;
    const glowHue = person ? person.hue : Math.floor(hash11(seed + 41) * 360);
    
    // Jump / bob mechanics
    const jumpPhase = seed + t * 4.5;
    const naturalBounce = Math.sin(jumpPhase) * 4;
    const audioHop = bounceBeat * (12 + audio.bass * 22) * layer.scale;
    const personHop = (jumpBoost * layer.scale) + audioHop + naturalBounce;
    const y = baseBy - Math.max(0, personHop);
    const x = baseBx + Math.sin(jumpPhase * 0.5) * 3;

    const sc = layer.scale;
    const headR = (9 + hash11(seed + 3) * 3) * sc;
    const shoulderW = (24 + hash11(seed + 4) * 8) * sc;

    // Glowstick wave kinetics
    const waveFreq = 2.4 + hash11(seed + 5) * 2.0 + (isDropping ? 3.0 : 0);
    const wavePhase = t * waveFreq + hash11(seed + 6) * Math.PI * 2;
    const armSwing = Math.sin(wavePhase) * (0.6 + audio.treble * 0.5);
    const armAngle = -Math.PI * 0.5 + armSwing * 0.75;
    const handDist = layer.armReach * (0.85 + 0.3 * Math.cos(wavePhase * 0.5));
    const handX = x + Math.cos(armAngle) * handDist;
    const handY = (y - headR * 1.8) + Math.sin(armAngle) * handDist;

    // 5a. Draw Glowstick (volumetric bloom pass then solid core)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const stickLen = (24 + hash11(seed + 7) * 14) * sc;
    const stickAngle = armAngle + Math.sin(t * 3.5 + seed) * 0.45;
    const sx1 = handX - Math.cos(stickAngle) * (stickLen * 0.3);
    const sy1 = handY - Math.sin(stickAngle) * (stickLen * 0.3);
    const sx2 = handX + Math.cos(stickAngle) * (stickLen * 0.7);
    const sy2 = handY + Math.sin(stickAngle) * (stickLen * 0.7);

    // Outer glow aura
    ctx.strokeStyle = `hsla(${glowHue}, 100%, 55%, ${0.35 * glowMul})`;
    ctx.lineWidth = 10 * sc;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();

    // Crisp vibrant stick core
    ctx.strokeStyle = `hsla(${glowHue}, 100%, 85%, ${0.9 * glowMul})`;
    ctx.lineWidth = 3.5 * sc;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    ctx.restore();

    // 5b. Silhouette Figure (deep festival crowd black against glowing background)
    ctx.save();
    ctx.fillStyle = '#06060c';
    ctx.beginPath();
    // Head
    ctx.arc(x, y - headR * 1.5, headR, 0, Math.PI * 2);
    ctx.fill();

    // Torso / Shoulders
    ctx.beginPath();
    ctx.moveTo(x - shoulderW * 0.5, y + 25 * sc);
    ctx.quadraticCurveTo(x - shoulderW * 0.6, y - headR * 0.4, x, y - headR * 0.6);
    ctx.quadraticCurveTo(x + shoulderW * 0.6, y - headR * 0.4, x + shoulderW * 0.5, y + 25 * sc);
    ctx.closePath();
    ctx.fill();

    // Raised waving arm holding glowstick
    ctx.strokeStyle = '#06060c';
    ctx.lineWidth = 5 * sc;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const shoulderX = x + (handX > x ? shoulderW * 0.35 : -shoulderW * 0.35);
    const shoulderY = y - headR * 0.3;
    const elbowX = (shoulderX + handX) * 0.5 + Math.sin(wavePhase) * 6 * sc;
    const elbowY = (shoulderY + handY) * 0.5 - 6 * sc;
    ctx.moveTo(shoulderX, shoulderY);
    ctx.quadraticCurveTo(elbowX, elbowY, handX, handY);
    ctx.stroke();

    // Subdued second arm for natural depth
    const otherHandX = x - (handX - x) * 0.6;
    const otherHandY = y - 10 * sc + Math.cos(wavePhase * 0.8) * 8 * sc;
    ctx.beginPath();
    ctx.moveTo(x - (handX > x ? shoulderW * 0.35 : -shoulderW * 0.35), shoulderY);
    ctx.lineTo(otherHandX, otherHandY);
    ctx.stroke();

    ctx.restore();
  }
});

// 6. Stage Edge Light Ribbon / Floor Blinders
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const barH = 3;
ctx.fillStyle = `rgba(${dropRgb}, ${0.15 + (audio.level || 0) * 0.25})`;
ctx.fillRect(0, stageY - barH, W, barH * 2);
ctx.restore();

ctx.restore();