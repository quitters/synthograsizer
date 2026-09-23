ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = frame.dt || 0.016;

// 1. Initialize persistent state & LUT
room.state.scrollX ??= 0;
if (!room.state.sinLUT) {
  room.state.sinLUT = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    room.state.sinLUT[i] = Math.sin((i / 512) * Math.PI * 2);
  }
}
const lut = room.state.sinLUT;
const fastSin = (angle) => {
  let a = (angle * (512 / (Math.PI * 2))) & 511;
  if (a < 0) a += 512;
  return lut[a | 0];
};

// 2. Read knobs
const palettes = {
  copper_gold: { base: '#150600', mid: '#d45a08', hi: '#ffe394', glow: 'rgba(255,140,20,0.25)', textHi: '#ffffff', textLo: '#d86208' },
  amiga_cyan:  { base: '#000f1c', mid: '#009bd9', hi: '#bbf6ff', glow: 'rgba(0,180,255,0.25)', textHi: '#ffffff', textLo: '#008bbd' },
  cyber_pink:  { base: '#140018', mid: '#d11582', hi: '#ffd1fa', glow: 'rgba(230,20,150,0.25)', textHi: '#ffffff', textLo: '#bd1075' },
  acid_green:  { base: '#041402', mid: '#4cd115', hi: '#e5ffd1', glow: 'rgba(80,240,20,0.25)',  textHi: '#ffffff', textLo: '#3ba310' }
};
const pal = palettes[getVar('palette')] ?? palettes.copper_gold;
const bounceMode = getVar('bounce_style') ?? 'classic_sine';
const speedMult = getVar('scroll_speed') ?? 3;
const barIntensity = getVar('bar_intensity') ?? 3;
const rippleStrength = getVar('water_ripple') ?? 3;

// Audio drivers
const bassBoost = (audio.bass || 0) * 1.5;
const beatKick = audio.beat ? 1.0 : 0.0;
room.state.beatPulse = Math.max(beatKick, (room.state.beatPulse || 0) * 0.88);

// Advance scroller position
room.state.scrollX += (140 + speedMult * 60) * dt;

// 3. Clear Background
ctx.fillStyle = '#040407';
ctx.fillRect(0, 0, W, H);

// Grid / Scanlines in upper half
ctx.fillStyle = 'rgba(255,255,255,0.015)';
for (let y = 0; y < H * 0.55; y += 4) {
  ctx.fillRect(0, y, W, 1);
}

// 4. Metallic Raster Bars (Amiga Copper effect)
const numBars = 3 + Math.floor(barIntensity * 0.7);
const barThickness = 32 + barIntensity * 10;
const barCenterY = H * 0.38;
const barSpread = H * 0.18 + bassBoost * 30;

ctx.globalCompositeOperation = 'screen';
for (let i = 0; i < numBars; i++) {
  const phase = t * 1.8 + i * 1.25;
  const barY = barCenterY + fastSin(phase) * barSpread * (0.6 + i * 0.15);
  const grad = ctx.createLinearGradient(0, barY - barThickness * 0.5, 0, barY + barThickness * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.28, pal.base);
  grad.addColorStop(0.48, pal.mid);
  grad.addColorStop(0.5, '#ffffff');
  grad.addColorStop(0.52, pal.hi);
  grad.addColorStop(0.75, pal.mid);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, barY - barThickness * 0.5, W, barThickness);
}
ctx.globalCompositeOperation = 'source-over';

// 5. Scroller Greeting Text Assembly
if (!room.state.textString || (frame.t - (room.state.lastTextBuild || 0) > 3.0)) {
  room.state.lastTextBuild = frame.t;
  const tbls = (room.people || [])
    .map(p => p.table ? String(p.table).toUpperCase() : null)
    .filter(Boolean);
  const uniqueTbls = Array.from(new Set(tbls));
  const tableGreeting = uniqueTbls.length > 0
    ? uniqueTbls.join(' * ')
    : 'MAIN FLOOR * VIP BALCONY * SYNTH LOUNGE';
  room.state.textString = `+++ GREETINGS TO ALL TABLES: [ ${tableGreeting} ] +++ PURE DYCP DEMO ENGINE +++ KEEP THE BEAT ALIVE +++ `;
}
const msg = room.state.textString;

// 6. Font & Typography setup
const charWidth = 42;
const fontSize = 48;
ctx.font = `900 ${fontSize}px monospace`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

const totalTextPixelLen = msg.length * charWidth;
const baselineY = H * 0.44;
const baseAmp = 45 + bassBoost * 40 + room.state.beatPulse * 20;

// Precompute visible indices to skip off-screen work
const startIdx = Math.floor(room.state.scrollX / charWidth);
const visibleCount = Math.ceil(W / charWidth) + 3;

// Bounce function lookup
const computeY = (idx, time) => {
  const ph = time * 3.2 + idx * 0.22;
  if (bounceMode === 'split_harmonics') {
    return fastSin(ph) * baseAmp * 0.7 + fastSin(ph * 2.3) * (baseAmp * 0.35);
  } else if (bounceMode === 'whiplash') {
    const s = fastSin(ph);
    return Math.sign(s) * Math.pow(Math.abs(s), 0.5) * baseAmp;
  } else if (bounceMode === 'gravity_plunge') {
    const saw = ((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return (Math.abs(saw) / Math.PI - 0.5) * baseAmp * 1.8;
  }
  return fastSin(ph) * baseAmp;
};

// 7. Render Primary DYCP Characters
for (let i = 0; i < visibleCount; i++) {
  const charIndex = (startIdx + i) % msg.length;
  const char = msg[charIndex];
  const screenX = (i * charWidth) - (room.state.scrollX % charWidth);
  const dy = computeY(startIdx + i, t);
  const screenY = baselineY + dy;

  // Metallic character shading: deep dropshadow, colored body, bright highlight
  ctx.fillStyle = '#000000';
  ctx.fillText(char, screenX + 3, screenY + 4);

  ctx.fillStyle = pal.textLo;
  ctx.fillText(char, screenX, screenY + 1);

  ctx.fillStyle = pal.textHi;
  ctx.fillText(char, screenX, screenY - 1);
}

// 8. Water Horizon Line & Metallic Edge
const waterY = H * 0.54;
const gradEdge = ctx.createLinearGradient(0, waterY - 2, 0, waterY + 4);
gradEdge.addColorStop(0, pal.mid);
gradEdge.addColorStop(0.5, '#ffffff');
gradEdge.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = gradEdge;
ctx.fillRect(0, waterY - 2, W, 4);

// 9. Rippling Mirror Reflection
// Render reflection characters upside down with water ripple and perspective damping
ctx.save();
for (let i = 0; i < visibleCount; i++) {
  const charIndex = (startIdx + i) % msg.length;
  const char = msg[charIndex];
  const rawX = (i * charWidth) - (room.state.scrollX % charWidth);
  const dy = computeY(startIdx + i, t);
  const charTopY = baselineY + dy;

  // Mirror calculation relative to water line
  const distFromHorizon = Math.max(4, waterY - charTopY);
  const reflectY = waterY + distFromHorizon * 0.72;
  if (reflectY > H + 40) continue;

  // Sine turbulence for water ripples
  const ripOffset = fastSin(reflectY * 0.08 - t * 4.0 + (startIdx + i) * 0.35) * (rippleStrength * 4.2 + bassBoost * 6);
  const alpha = Math.max(0, 0.65 - (reflectY - waterY) / (H * 0.44));

  ctx.globalAlpha = alpha;
  ctx.fillStyle = pal.hi;
  ctx.save();
  ctx.translate(rawX + ripOffset, reflectY);
  ctx.scale(1, -0.65);
  ctx.fillText(char, 0, 0);
  ctx.restore();
}
ctx.restore();

// 10. Horizontal Ripple Scanline Overlay in Water Area
const ripStep = 5;
ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
for (let y = waterY; y < H; y += ripStep) {
  const barH = 1 + ((y - waterY) / (H - waterY)) * 2;
  ctx.fillRect(0, y, W, barH);
}

// Outer Vignette for cinematic CRT/Demoscene frame
const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.35, W * 0.5, H * 0.5, W * 0.72);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, 'rgba(0,0,0,0.75)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();