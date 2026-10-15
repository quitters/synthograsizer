ctx.save();

const paletteChoice = getVar('light_palette') ?? 'neon_cyber';
const styleChoice = getVar('calligraphy_style') ?? 'spiro_ribbon';
const persistence = getVar('trail_persistence') ?? 0.95;
const ribbonWidth = getVar('ribbon_width') ?? 10;
const speed = getVar('speed') ?? 1.0;
const sparkles = getVar('sparkles') ?? true;

// Color palette definitions
const palettes = {
  neon_cyber:   { h1: 180, h2: 310, core: '#ffffff', glow: '#00e5ff' },
  molten_ember: { h1: 20,  h2: 50,  core: '#fff5ea', glow: '#ff5500' },
  auroral_glow: { h1: 140, h2: 260, core: '#f0fff4', glow: '#00ff88' },
  solar_flare:  { h1: 45,  h2: 340, core: '#ffffff', glow: '#ffaa00' }
};
const pal = palettes[paletteChoice] ?? palettes.neon_cyber;

// Shutter long-exposure decay (darkening over previous frames)
// Lower alpha = longer trails / slower fade
const fadeAlpha = Math.max(0.015, Math.min(0.18, (1.0 - persistence) * 1.8));
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = `rgba(3, 3, 6, ${fadeAlpha})`;
ctx.fillRect(0, 0, frame.width, frame.height);

// Room state ring buffer for persistent trail points & sparks
room.state.tPrev ??= frame.t;
room.state.phase ??= 0;
room.state.sparks ??= [];

const dt = Math.min(frame.dt || 0.016, 0.05);
const bassBoost = (audio.bass || 0) * 1.4;
const trebleBoost = (audio.treble || 0);
room.state.phase += dt * speed * (1.0 + bassBoost * 0.8);
const p = room.state.phase;

const cx = frame.width * 0.5;
const cy = frame.height * 0.5;
const minDim = Math.min(frame.width, frame.height);
const scale = minDim * 0.38;

// Precompute parametric curves for the torch path
let x = 0, y = 0, z = 0;
if (styleChoice === 'lissajous') {
  x = cx + Math.sin(p * 1.7) * scale * 1.1 + Math.cos(p * 0.5) * (scale * 0.25);
  y = cy + Math.cos(p * 2.3) * scale * 0.75 + Math.sin(p * 1.1) * (scale * 0.2);
  z = Math.sin(p * 3.1);
} else if (styleChoice === 'orbital_knot') {
  const r = scale * (0.65 + 0.35 * Math.sin(p * 3.0));
  x = cx + Math.cos(p * 1.4) * r + Math.sin(p * 5.0) * (scale * 0.15);
  y = cy + Math.sin(p * 1.4) * r * 0.75 + Math.cos(p * 5.0) * (scale * 0.2);
  z = Math.cos(p * 2.2);
} else if (styleChoice === 'wild_flourish') {
  const r = scale * (0.5 + 0.45 * Math.sin(p * 0.8) * Math.cos(p * 2.2));
  x = cx + Math.cos(p * 2.1) * r + Math.cos(p * 7.7) * (scale * 0.18);
  y = cy + Math.sin(p * 1.6) * r * 0.85 + Math.sin(p * 6.3) * (scale * 0.18);
  z = Math.sin(p * 4.4);
} else {
  // spiro_ribbon (default)
  const R = scale * 0.72;
  const r = scale * 0.28;
  const d = scale * 0.45 * (1.0 + bassBoost * 0.25);
  const diff = R - r;
  x = cx + diff * Math.cos(p * 1.3) + d * Math.cos(diff / r * p * 1.3);
  y = cy + (diff * Math.sin(p * 1.3) - d * Math.sin(diff / r * p * 1.3)) * 0.78;
  z = Math.sin(p * 2.6);
}

// Subtle audio vibration on torch head
if (trebleBoost > 0.05) {
  const jitter = trebleBoost * 14;
  x += (Math.sin(frame.t * 80) - 0.5) * jitter;
  y += (Math.cos(frame.t * 93) - 0.5) * jitter;
}

// Store previous torch positions (max 40) for smooth continuous ribbon stroke
room.state.history ??= [];
const hist = room.state.history;
hist.push({ x, y, z, t: frame.t, bass: bassBoost });
if (hist.length > 36) hist.shift();

// Draw torch stroke using additive blending for brilliant luminescent glow
ctx.globalCompositeOperation = 'lighter';

if (hist.length > 2) {
  const baseHue = (pal.h1 + (pal.h2 - pal.h1) * ((Math.sin(p * 0.5) + 1) * 0.5)) % 360;
  const strokeBase = ribbonWidth * (1.0 + bassBoost * 0.6);

  // Multi-pass glow: wide soft aura, saturated mid-glow, razor sharp brilliant core
  const passes = [
    { width: strokeBase * 3.8, alpha: 0.14, color: `hsl(${baseHue}, 100%, 50%)` },
    { width: strokeBase * 1.8, alpha: 0.35, color: `hsl(${baseHue + 15}, 100%, 65%)` },
    { width: Math.max(1.5, strokeBase * 0.5), alpha: 0.95, color: pal.core }
  ];

  for (let passIdx = 0; passIdx < passes.length; passIdx++) {
    const pass = passes[passIdx];
    ctx.beginPath();
    ctx.moveTo(hist[0].x, hist[0].y);
    for (let i = 1; i < hist.length - 1; i++) {
      const xc = (hist[i].x + hist[i + 1].x) * 0.5;
      const yc = (hist[i].y + hist[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(hist[i].x, hist[i].y, xc, yc);
    }
    ctx.lineTo(hist[hist.length - 1].x, hist[hist.length - 1].y);
    ctx.lineWidth = pass.width;
    ctx.strokeStyle = pass.color;
    ctx.globalAlpha = pass.alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

// Per-person satellite torches (people steering secondary subtle light tips)
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 12);
  for (let i = 0; i < pCount; i++) {
    const person = room.people[i];
    const offsetAngle = (i / pCount) * Math.PI * 2 + p * 0.8;
    const satRadius = 40 + (i % 3) * 22 + bassBoost * 30;
    const sx = x + Math.cos(offsetAngle) * satRadius;
    const sy = y + Math.sin(offsetAngle) * satRadius;
    const sHue = person.hue !== undefined ? person.hue : (pal.h2 + i * 25) % 360;

    const radGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 16);
    radGrad.addColorStop(0, `hsla(${sHue}, 100%, 90%, 0.8)`);
    radGrad.addColorStop(0.4, `hsla(${sHue}, 100%, 60%, 0.35)`);
    radGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radGrad;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(sx, sy, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Hot tip of the main torch
const tipRadius = 24 + bassBoost * 20;
const tipGrad = ctx.createRadialGradient(x, y, 0, x, y, tipRadius);
tipGrad.addColorStop(0, '#ffffff');
tipGrad.addColorStop(0.25, pal.glow);
tipGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.globalAlpha = 1.0;
ctx.fillStyle = tipGrad;
ctx.beginPath();
ctx.arc(x, y, tipRadius, 0, Math.PI * 2);
ctx.fill();

// Sparkles / burning torch embers falling in the dark
if (sparkles) {
  const sparks = room.state.sparks;
  const spawnCount = audio.beat ? 7 : (trebleBoost > 0.3 ? 3 : 1);
  for (let s = 0; s < spawnCount && sparks.length < 140; s++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 20 + Math.random() * (70 + trebleBoost * 90);
    sparks.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd + 15,
      life: 1.0,
      decay: 0.5 + Math.random() * 0.9,
      size: 1.2 + Math.random() * 2.8,
      hue: pal.h1 + Math.random() * 40
    });
  }

  // Update and draw sparks in fixed loop
  let writeIdx = 0;
  for (let i = 0; i < sparks.length; i++) {
    const spk = sparks[i];
    spk.life -= dt * spk.decay;
    if (spk.life > 0) {
      spk.x += spk.vx * dt;
      spk.y += spk.vy * dt;
      spk.vy += 35 * dt; // slight gravity

      ctx.globalAlpha = spk.life * 0.9;
      ctx.fillStyle = `hsl(${spk.hue}, 100%, ${60 + (1.0 - spk.life) * 40}%)`;
      ctx.beginPath();
      ctx.arc(spk.x, spk.y, spk.size * spk.life, 0, Math.PI * 2);
      ctx.fill();

      sparks[writeIdx++] = spk;
    }
  }
  sparks.length = writeIdx;
}

ctx.restore();