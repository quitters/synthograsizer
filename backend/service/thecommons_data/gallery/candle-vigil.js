ctx.save();

// --- State Initialization ---
room.state.flares ??= {};
room.state.embers ??= [];
room.state.gust ??= 0;
room.state.totalFlareEnergy ??= 0;

// Handle interactive triggers
for (const ev of (room.events || [])) {
  if (ev.name === 'shield') {
    const id = ev.participantId || 'anon_' + Math.random().toString(36).slice(2, 6);
    room.state.flares[id] = 1.0;
  } else if (ev.name === 'breathe') {
    room.state.gust = Math.min(room.state.gust + 1.2, 2.5);
  }
}

// Decay gust and flares
room.state.gust *= Math.max(0, 1 - frame.dt * 1.8);
let activeFlareCount = 0;
for (const id in room.state.flares) {
  room.state.flares[id] -= frame.dt * 0.45;
  if (room.state.flares[id] <= 0) {
    delete room.state.flares[id];
  } else {
    activeFlareCount++;
  }
}

// Smooth collective energy
const targetEnergy = Math.min(1.0, activeFlareCount / Math.max(2, (room.people ? room.people.length : 1)));
room.state.totalFlareEnergy += (targetEnergy - room.state.totalFlareEnergy) * Math.min(1, frame.dt * 3.0);

// Parameter extraction
const paletteKey = getVar('flame_palette') || 'amber_gold';
const waxKey = getVar('wax_style') || 'dripping_pillars';
const draftKey = getVar('draft_intensity') || 'gentle_whisper';
const maxEmbers = getVar('ember_density') ?? 70;
const enableBloom = getVar('collective_bloom') ?? true;

const drafts = { hushed_stillness: 0.25, gentle_whisper: 0.8, gathering_gale: 1.9 };
const draftSpeed = drafts[draftKey] ?? 0.8;

// Color profiles [huePrimary, hueInner, sat, light]
const palettes = {
  amber_gold: { h: 36, h2: 52, s: 95, warmR: 255, warmG: 160, warmB: 40 },
  sacred_violet: { h: 285, h2: 320, s: 90, warmR: 210, warmG: 100, warmB: 255 },
  celestial_cyan: { h: 185, h2: 210, s: 85, warmR: 90, warmG: 220, warmB: 255 },
  crimson_ember: { h: 12, h2: 38, s: 95, warmR: 255, warmG: 70, warmB: 25 }
};
const col = palettes[paletteKey] || palettes.amber_gold;

const W = frame.width;
const H = frame.height;
const bass = audio ? audio.bass : 0;
const beat = audio ? (audio.beat ? 1 : 0) : 0;

// Clear background to obsidian darkness with subtle warm floor gradient
ctx.fillStyle = '#050406';
ctx.fillRect(0, 0, W, H);

// Floor plane perspective glow
const horizonY = H * 0.42;
const floorGrad = ctx.createLinearGradient(0, horizonY, 0, H);
floorGrad.addColorStop(0, 'rgba(8, 6, 8, 0)');
floorGrad.addColorStop(0.6, `rgba(${col.warmR * 0.12}, ${col.warmG * 0.08}, ${col.warmB * 0.04}, 0.35)`);
floorGrad.addColorStop(1, `rgba(${col.warmR * 0.22}, ${col.warmG * 0.14}, ${col.warmB * 0.06}, 0.55)`);
ctx.fillStyle = floorGrad;
ctx.fillRect(0, horizonY, W, H - horizonY);

// Build candle grid: include all room.people, padded to at least 14 candles
const people = room.people || [];
const candleCount = Math.max(14, people.length);
const candles = [];

for (let i = 0; i < candleCount; i++) {
  const p = i < people.length ? people[i] : null;
  const id = p ? p.id : `vigil_${i}`;
  const flare = room.state.flares[id] || 0;
  // Deterministic seed placement across floor
  const row = Math.floor(i / 7);
  const colIdx = i % 7;
  const normRow = (row + 0.6) / (Math.ceil(candleCount / 7) + 0.5);
  const normCol = (colIdx + 0.5 + Math.sin(i * 3.7) * 0.2) / 7.2;

  const depth = normRow; // 0 (near horizon) to 1 (near foreground)
  const cx = W * (0.12 + 0.76 * normCol);
  const cy = horizonY + (H - horizonY) * (0.18 + 0.75 * Math.pow(depth, 1.4));
  const customHue = p ? p.hue : null;

  candles.push({ id, cx, cy, depth, flare, customHue, seed: i });
}

// Sort candles by depth so foreground renders on top of background
candles.sort((a, b) => a.depth - b.depth);

// Wind draft displacement
const windTime = frame.t * draftSpeed * 1.5;
const windOffset = Math.sin(windTime * 0.8) * 6 + room.state.gust * 18;

// --- Render Wax & Ambient Light Cones ---
for (let i = 0; i < candles.length; i++) {
  const c = candles[i];
  const scale = 0.55 + c.depth * 0.65;
  const baseH = waxKey === 'floating_vessels' ? 14 : (waxKey === 'crystalline_tapers' ? 80 : 50) * scale;
  const baseW = (waxKey === 'floating_vessels' ? 32 : 18) * scale;

  // Warm candle puddle glow on table/floor
  const haloR = (60 + c.flare * 120 + bass * 30) * scale;
  const halo = ctx.createRadialGradient(c.cx, c.cy, 2, c.cx, c.cy, haloR);
  halo.addColorStop(0, `rgba(${col.warmR}, ${col.warmG}, ${col.warmB}, ${0.28 + c.flare * 0.4})`);
  halo.addColorStop(0.5, `rgba(${col.warmR * 0.7}, ${col.warmG * 0.5}, ${col.warmB * 0.2}, ${0.12 + c.flare * 0.2})`);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(c.cx, c.cy, haloR * 1.3, haloR * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // Candle body
  ctx.fillStyle = '#1c1815';
  ctx.strokeStyle = `rgba(${col.warmR}, ${col.warmG}, ${col.warmB}, 0.35)`;
  ctx.lineWidth = 1.2 * scale;

  if (waxKey === 'floating_vessels') {
    ctx.beginPath();
    ctx.ellipse(c.cx, c.cy, baseW * 0.7, baseW * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Pillar wax body
    const waxTop = c.cy - baseH;
    const waxGrad = ctx.createLinearGradient(c.cx - baseW * 0.5, 0, c.cx + baseW * 0.5, 0);
    waxGrad.addColorStop(0, '#0c0a09');
    waxGrad.addColorStop(0.5, `rgba(${col.warmR * 0.4}, ${col.warmG * 0.3}, ${col.warmB * 0.15}, 0.9)`);
    waxGrad.addColorStop(1, '#090807');
    ctx.fillStyle = waxGrad;

    ctx.beginPath();
    ctx.moveTo(c.cx - baseW * 0.4, c.cy);
    ctx.lineTo(c.cx - baseW * 0.35, waxTop);
    ctx.quadraticCurveTo(c.cx, waxTop - 3 * scale, c.cx + baseW * 0.35, waxTop);
    ctx.lineTo(c.cx + baseW * 0.4, c.cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Little drips for dripping_pillars
    if (waxKey === 'dripping_pillars') {
      ctx.fillStyle = `rgba(${col.warmR * 0.6}, ${col.warmG * 0.45}, ${col.warmB * 0.2}, 0.75)`;
      ctx.beginPath();
      ctx.arc(c.cx - baseW * 0.28, waxTop + baseH * 0.35, 2.2 * scale, 0, Math.PI * 2);
      ctx.arc(c.cx + baseW * 0.22, waxTop + baseH * 0.6, 1.8 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Wick
  const wickY = waxKey === 'floating_vessels' ? c.cy - 4 : c.cy - baseH;
  ctx.strokeStyle = '#3a342e';
  ctx.lineWidth = 1.8 * scale;
  ctx.beginPath();
  ctx.moveTo(c.cx, wickY + 2);
  ctx.lineTo(c.cx, wickY - 7 * scale);
  ctx.stroke();
}

// --- Render Flames & Flaring Halos (Additive for rich glow) ---
ctx.globalCompositeOperation = 'screen';

for (let i = 0; i < candles.length; i++) {
  const c = candles[i];
  const scale = 0.55 + c.depth * 0.65;
  const baseH = waxKey === 'floating_vessels' ? 14 : (waxKey === 'crystalline_tapers' ? 80 : 50) * scale;
  const flameBaseY = (waxKey === 'floating_vessels' ? c.cy - 5 : c.cy - baseH) - 6 * scale;

  // Organic flicker based on unique candle seed, draft, and audio
  const tSeed = frame.t * 3.2 + c.seed * 2.13;
  const flicker1 = Math.sin(tSeed) * Math.cos(tSeed * 1.7) * 0.25;
  const flicker2 = Math.sin(frame.t * 9.5 + c.seed * 5.1) * 0.15;
  const flicker = 1.0 + flicker1 + flicker2 + bass * 0.35;

  const flareScale = 1.0 + c.flare * 1.8;
  const flameH = (26 * scale * flicker * flareScale) + beat * 6;
  const flameW = (11 * scale * flareScale) * (1.0 - flicker1 * 0.3);

  // Tilt flame with breeze
  const tiltX = (Math.sin(windTime + c.cx * 0.01) * 7 * draftSpeed + windOffset * 0.8) * scale;
  const flameTipX = c.cx + tiltX;
  const flameTipY = flameBaseY - flameH;

  const currentHue = c.customHue !== null ? c.customHue : col.h;
  const innerHue = c.customHue !== null ? (c.customHue + 25) % 360 : col.h2;

  // Outer tear-drop flame
  ctx.fillStyle = `hsla(${currentHue}, ${col.s}%, 55%, ${0.85 + c.flare * 0.15})`;
  ctx.beginPath();
  ctx.moveTo(c.cx, flameBaseY);
  ctx.bezierCurveTo(c.cx - flameW, flameBaseY - flameH * 0.35, flameTipX - flameW * 0.5, flameTipY + flameH * 0.25, flameTipX, flameTipY);
  ctx.bezierCurveTo(flameTipX + flameW * 0.5, flameTipY + flameH * 0.25, c.cx + flameW, flameBaseY - flameH * 0.35, c.cx, flameBaseY);
  ctx.fill();

  // Inner fiery incandescent core
  const coreH = flameH * 0.58;
  const coreW = flameW * 0.52;
  ctx.fillStyle = `hsla(${innerHue}, 100%, 88%, 0.95)`;
  ctx.beginPath();
  ctx.moveTo(c.cx, flameBaseY);
  ctx.bezierCurveTo(c.cx - coreW, flameBaseY - coreH * 0.35, flameTipX - coreW * 0.4, flameTipY + coreH * 0.7, flameTipX, flameTipY + coreH * 0.45);
  ctx.bezierCurveTo(flameTipX + coreW * 0.4, flameTipY + coreH * 0.7, c.cx + coreW, flameBaseY - coreH * 0.35, c.cx, flameBaseY);
  ctx.fill();

  // Intense flare halo when shielded or beat hits
  if (c.flare > 0.05 || room.state.totalFlareEnergy > 0.3) {
    const auraSize = (45 + c.flare * 90 + room.state.totalFlareEnergy * 40) * scale;
    const aura = ctx.createRadialGradient(c.cx, flameBaseY - flameH * 0.5, 2, c.cx, flameBaseY - flameH * 0.5, auraSize);
    aura.addColorStop(0, `hsla(${innerHue}, 90%, 75%, ${0.5 * (c.flare + room.state.totalFlareEnergy * 0.4)})`);
    aura.addColorStop(0.4, `hsla(${currentHue}, 90%, 50%, ${0.2 * (c.flare + room.state.totalFlareEnergy * 0.3)})`);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(c.cx, flameBaseY - flameH * 0.5, auraSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Bounded Embers Simulation ---
// Spawn new embers up to maxEmbers
while (room.state.embers.length < maxEmbers) {
  const source = candles[Math.floor(Math.random() * candles.length)];
  room.state.embers.push({
    x: source.cx + (Math.random() - 0.5) * 8,
    y: source.cy - 30,
    vx: (Math.random() - 0.5) * 12,
    vy: -(25 + Math.random() * 45),
    life: 0.8 + Math.random() * 1.5,
    maxLife: 2.0,
    size: 1.0 + Math.random() * 2.2,
    hue: source.customHue !== null ? source.customHue : col.h
  });
}

// Update and draw embers
for (let i = room.state.embers.length - 1; i >= 0; i--) {
  const p = room.state.embers[i];
  p.life -= frame.dt;
  if (p.life <= 0 || p.y < -10) {
    room.state.embers.splice(i, 1);
    continue;
  }
  p.x += (p.vx + windOffset * 1.2 + Math.sin(frame.t * 3.0 + p.y * 0.05) * 8) * frame.dt;
  p.y += (p.vy - room.state.totalFlareEnergy * 30) * frame.dt;

  const alpha = Math.min(1.0, p.life / 0.6);
  ctx.fillStyle = `hsla(${p.hue}, 95%, 70%, ${alpha * 0.8})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
}

// --- Collective Bloom / Resonance Field ---
// When multiple candles flare simultaneously, a radiant ambient veil blankets the room
if (enableBloom && room.state.totalFlareEnergy > 0.05) {
  const resonance = room.state.totalFlareEnergy;
  const bGrad = ctx.createRadialGradient(W * 0.5, H * 0.55, 30, W * 0.5, H * 0.55, W * 0.7);
  bGrad.addColorStop(0, `rgba(${col.warmR}, ${col.warmG}, ${col.warmB}, ${resonance * 0.38})`);
  bGrad.addColorStop(0.5, `rgba(${col.warmR * 0.7}, ${col.warmG * 0.3}, ${col.warmB * 0.1}, ${resonance * 0.18})`);
  bGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bGrad;
  ctx.fillRect(0, 0, W, H);
}

// Vignette darkness along border for cathedral depth
ctx.globalCompositeOperation = 'multiply';
const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.35, W * 0.5, H * 0.5, W * 0.75);
vig.addColorStop(0, 'rgba(255,255,255,1)');
vig.addColorStop(0.8, 'rgba(100,90,85,0.7)');
vig.addColorStop(1, 'rgba(0,0,0,0.92)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();