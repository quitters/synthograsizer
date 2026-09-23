ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const dt = Math.min(frame.dt || 0.016, 0.05);

const speedMult = getVar('zoom_speed') ?? 1.2;
const blurSlices = Math.floor(getVar('blur_passes') ?? 8);
const maxStars = Math.floor(getVar('star_count') ?? 250);
const colorScheme = getVar('color_scheme') || 'amiga_copper';
const glitch = getVar('glitch_style') || 'scanlines';

const PALETTES = {
  amiga_copper: { core: '#ffffff', glow: '#ff5500', halo: '#aa0044', bg: '#080106', accent: '#ffcc00' },
  cyberpunk:    { core: '#e0ffff', glow: '#00f0ff', halo: '#ff0077', bg: '#03020b', accent: '#ffe600' },
  acid_matrix:  { core: '#f5fff0', glow: '#39ff14', halo: '#0d6b1d', bg: '#020803', accent: '#b8ff52' },
  vaporwave:    { core: '#ffffff', glow: '#ff71ce', halo: '#01cdfe', bg: '#0b0416', accent: '#05ffa1' }
};
const pal = PALETTES[colorScheme] ?? PALETTES.amiga_copper;

// Pre-render word bitmaps into room.state once
const WORDS = ['HELLO', 'ROOM', 'DANCE', 'TOGETHER'];
if (!room.state.wordCanvases) {
  room.state.wordCanvases = WORDS.map(w => {
    const oc = new OffscreenCanvas(800, 240);
    const octx = oc.getContext('2d');
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.font = '900 110px monospace';
    octx.lineWidth = 6;
    octx.strokeStyle = '#ffffff';
    octx.strokeText(w, 400, 120);
    octx.fillStyle = '#ffffff';
    octx.fillText(w, 400, 120);
    return oc;
  });
}

// Fixed starfield
if (!room.state.stars) {
  room.state.stars = Array.from({ length: 500 }, () => ({
    x: (Math.random() - 0.5) * 1600,
    y: (Math.random() - 0.5) * 1600,
    z: Math.random() * 1200 + 10,
    pz: 1000
  }));
  room.state.animTime = 0;
  room.state.shake = 0;
}

// Beat kick / shock handling
if (audio && audio.beat) {
  room.state.shake = Math.min((room.state.shake || 0) + 12 * (audio.bass || 0.8), 24);
}
room.state.shake *= 0.88;
const shakeX = (Math.random() - 0.5) * room.state.shake;
const shakeY = (Math.random() - 0.5) * room.state.shake;

// Advance zoom clock
const audioBoost = 1 + (audio ? audio.bass * 0.8 + audio.level * 0.4 : 0);
room.state.animTime += dt * speedMult * 0.45 * audioBoost;
const globalCycle = room.state.animTime;
const wordIndex = Math.floor(globalCycle) % WORDS.length;
const phase = globalCycle % 1.0;
const wordCanvas = room.state.wordCanvases[wordIndex];

// Background fill
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Screen shake offset
ctx.translate(cx + shakeX, cy + shakeY);

// 3D Starfield zoom
const starSpeed = (600 + (audio ? audio.bass * 800 : 200)) * dt * speedMult;
const starCountClamped = Math.min(maxStars, room.state.stars.length);
ctx.save();
ctx.lineWidth = 1.5;
for (let i = 0; i < starCountClamped; i++) {
  const s = room.state.stars[i];
  s.pz = s.z;
  s.z -= starSpeed;
  if (s.z <= 2) {
    s.z = 1200;
    s.pz = 1200;
    s.x = (Math.random() - 0.5) * W * 1.5;
    s.y = (Math.random() - 0.5) * H * 1.5;
  }
  const k = 320 / s.z;
  const pk = 320 / s.pz;
  const sx = s.x * k;
  const sy = s.y * k;
  const px = s.x * pk;
  const py = s.y * pk;

  const bright = Math.min(1, (1200 - s.z) / 900);
  ctx.strokeStyle = pal.halo;
  ctx.globalAlpha = bright * 0.6;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(sx, sy);
  ctx.stroke();
}
ctx.restore();

// Radial text zoom calculation
// Exponential growth from tiny pinhole to full explosion
const zoomP = Math.pow(phase, 2.8);
const baseScale = 0.04 + zoomP * 7.5;
const burstAlpha = phase > 0.82 ? Math.max(0, 1 - (phase - 0.82) / 0.18) : 1;

// Radial ghost blur passes
ctx.save();
ctx.globalCompositeOperation = 'lighter';

for (let b = blurSlices; b >= 1; b--) {
  const sliceFrac = b / blurSlices;
  const sScale = baseScale * (1 - sliceFrac * 0.45);
  const sAlpha = (1 - sliceFrac) * 0.28 * burstAlpha;
  if (sScale <= 0.001 || sAlpha <= 0.005) continue;

  ctx.globalAlpha = sAlpha;
  ctx.fillStyle = pal.halo;
  const sw = 800 * sScale;
  const sh = 240 * sScale;
  ctx.drawImage(wordCanvas, -sw * 0.5, -sh * 0.5, sw, sh);
}

// Mid-glow pass
const glowScale = baseScale * 1.05;
ctx.globalAlpha = 0.45 * burstAlpha;
ctx.drawImage(wordCanvas, -800 * glowScale * 0.5, -240 * glowScale * 0.5, 800 * glowScale, 240 * glowScale);

// RGB Split glitch pass
if (glitch === 'rgb_split' && phase > 0.5) {
  const shift = (phase - 0.5) * 24;
  ctx.globalAlpha = 0.7 * burstAlpha;
  ctx.drawImage(wordCanvas, -800 * baseScale * 0.5 - shift, -240 * baseScale * 0.5, 800 * baseScale, 240 * baseScale);
  ctx.drawImage(wordCanvas, -800 * baseScale * 0.5 + shift, -240 * baseScale * 0.5, 800 * baseScale, 240 * baseScale);
}

// Main crisp core
ctx.globalAlpha = burstAlpha;
const mw = 800 * baseScale;
const mh = 240 * baseScale;
ctx.drawImage(wordCanvas, -mw * 0.5, -mh * 0.5, mw, mh);

// Shockwave burst ring when exploding
if (phase > 0.75) {
  const ringProgress = (phase - 0.75) / 0.25;
  const ringR = ringProgress * Math.max(W, H) * 0.75;
  ctx.lineWidth = 14 * (1 - ringProgress);
  ctx.strokeStyle = pal.accent;
  ctx.globalAlpha = (1 - ringProgress) * 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2);
  ctx.stroke();
}

// People avatars as floating constellation rings
if (room.people && room.people.length > 0) {
  const pCount = room.people.length;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const ang = (i / pCount) * Math.PI * 2 + frame.t * 0.3;
    const dist = 180 + Math.sin(frame.t * 2 + i) * 30;
    const px = Math.cos(ang) * dist;
    const py = Math.sin(ang) * dist;
    ctx.fillStyle = `hsl(${p.hue ?? 180}, 90%, 65%)`;
    ctx.beginPath();
    ctx.arc(px, py, 3 + (audio ? audio.mid * 4 : 0), 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();

// Scanlines overlay
if (glitch === 'scanlines') {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (let y = 0; y < H; y += 4) {
    ctx.fillRect(0, y, W, 1.5);
  }
  ctx.restore();
}

ctx.restore();