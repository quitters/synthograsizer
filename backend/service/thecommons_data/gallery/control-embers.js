ctx.save();

const paletteKey = getVar('flame_heat') ?? 'Campfire';
const wind = getVar('wind_strength') ?? 1.5;
const turbulence = getVar('swirl_turbulence') ?? 4;
const maxEmbers = Math.min(190, getVar('ember_count') ?? 120);
const showGlow = getVar('smoke_glow') ?? true;

const palettes = {
  'Campfire': { baseH: 24, spread: 28, light: 55, bgTint: 'rgba(20, 6, 2, 0.4)' },
  'Molten Forge': { baseH: 8, spread: 20, light: 62, bgTint: 'rgba(25, 4, 1, 0.42)' },
  'Ghost Fire': { baseH: 175, spread: 45, light: 65, bgTint: 'rgba(2, 16, 22, 0.42)' },
  'Aurora Borealis': { baseH: 130, spread: 110, light: 60, bgTint: 'rgba(6, 12, 24, 0.42)' }
};
const pal = palettes[paletteKey] ?? palettes['Campfire'];

const bassKick = (audio.bass || 0) * 2.8 + (audio.beat ? 1.4 : 0);
const midRise = (audio.mid || 0) * 1.5;
const w = frame.width;
const h = frame.height;
const cx = w * 0.5;
const baseY = h * 0.94;

// Backdrop clearing with soft persistence trail
ctx.fillStyle = pal.bgTint;
ctx.fillRect(0, 0, w, h);

// Deep ash floor & background gradient
const floorGrad = ctx.createLinearGradient(0, h * 0.75, 0, h);
floorGrad.addColorStop(0, 'rgba(5, 3, 4, 0)');
floorGrad.addColorStop(1, 'rgba(3, 1, 2, 0.85)');
ctx.fillStyle = floorGrad;
ctx.fillRect(0, h * 0.75, w, h * 0.25);

// Core flame hearth glow
if (showGlow) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const hearthGlowRad = Math.max(40, (120 + bassKick * 90));
  const hGlow = ctx.createRadialGradient(cx, baseY, 10, cx, baseY - 40, hearthGlowRad * 1.6);
  const hHue = pal.baseH;
  hGlow.addColorStop(0, `hsla(${hHue}, 100%, 75%, ${0.35 + bassKick * 0.2})`);
  hGlow.addColorStop(0.35, `hsla(${hHue + 15}, 90%, 50%, 0.2)`);
  hGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = hGlow;
  ctx.beginPath();
  ctx.arc(cx, baseY - 30, hearthGlowRad * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Initialize persisted embers pool
room.state.embers ??= [];
const embers = room.state.embers;

// Dynamic spawn count based on music and limit
let spawnsNeeded = Math.min(6, Math.max(1, Math.floor(2 + bassKick * 3)));
while (embers.length < maxEmbers && spawnsNeeded-- > 0) {
  const spreadW = 60 + bassKick * 40;
  embers.push({
    x: cx + (Math.random() - 0.5) * spreadW,
    y: baseY - Math.random() * 20,
    vx: (Math.random() - 0.5) * 1.2,
    vy: -(1.6 + Math.random() * 2.8 + bassKick * 2.2),
    size: 1.5 + Math.random() * 3.2,
    life: 0,
    maxLife: 3.5 + Math.random() * 4.0,
    hueShift: (Math.random() - 0.5) * pal.spread,
    phase: Math.random() * Math.PI * 2,
    freq: 1.2 + Math.random() * 2.5
  });
}

// Keep room state bounded
if (embers.length > maxEmbers) {
  embers.splice(0, embers.length - maxEmbers);
}

// Influence from connected room people (small peripheral sparks)
const people = room.people || [];

ctx.save();
ctx.globalCompositeOperation = 'lighter';

// Update & draw embers
for (let i = embers.length - 1; i >= 0; i--) {
  const e = embers[i];
  e.life += frame.dt;
  if (e.life >= e.maxLife || e.y < -30 || e.x < -60 || e.x > w + 60) {
    embers.splice(i, 1);
    continue;
  }

  const progress = e.life / e.maxLife;
  const currentBass = bassKick * (1 + turbulence * 0.25);

  // Turbulent wind & swirl field
  const wave = Math.sin(frame.t * e.freq + e.y * 0.015 + e.phase);
  const swirl = Math.cos(frame.t * 1.8 + e.x * 0.01) * (turbulence * 0.35 + currentBass * 0.8);
  const draftForce = wind * 14 * frame.dt;

  e.vx += (wave * 2.2 + swirl + draftForce * 0.5) * frame.dt;
  e.vy -= (0.9 + midRise * 1.4) * frame.dt; // buoyant uplift
  e.vx *= 0.985;
  e.vy *= 0.992;

  e.x += e.vx * 60 * frame.dt;
  e.y += e.vy * 60 * frame.dt;

  // Visual attributes with flicker and cooldown
  const flicker = 0.75 + Math.sin(frame.t * 18 + e.phase) * 0.25;
  const alpha = Math.sin(progress * Math.PI) * flicker;
  const size = Math.max(0.6, e.size * (1 - progress * 0.55) * (1 + bassKick * 0.25));
  
  // Shift towards cooler charred tones as it cools
  const hue = pal.baseH + e.hueShift - progress * 22;
  const light = Math.max(25, pal.light + (1 - progress) * 35);

  // Ambient soft glow on larger or younger sparks
  if (size > 1.8 && showGlow) {
    ctx.fillStyle = `hsla(${hue}, 100%, ${light}%, ${alpha * 0.22})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, size * 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Core sharp spark
  ctx.fillStyle = `hsla(${hue}, 95%, ${light + 10}%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(e.x, e.y, size, 0, Math.PI * 2);
  ctx.fill();
}

// Draw presence lanterns around base from people in room
if (people.length > 0) {
  const spacing = Math.min(48, (w * 0.6) / people.length);
  const startX = cx - ((people.length - 1) * spacing) / 2;
  for (let idx = 0; idx < people.length; idx++) {
    const p = people[idx];
    const px = startX + idx * spacing;
    const py = baseY + 12 + Math.sin(frame.t * 2 + idx) * 3;
    const pHue = Number.isFinite(p.hue) ? p.hue : pal.baseH;
    
    ctx.fillStyle = `hsla(${pHue}, 90%, 60%, 0.3)`;
    ctx.beginPath();
    ctx.arc(px, py, 6 + (audio.level || 0) * 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = `hsla(${pHue}, 100%, 80%, 0.8)`;
    ctx.beginPath();
    ctx.arc(px, py, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();
ctx.restore();