ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const bass = audio ? audio.bass || 0 : 0;
const beat = audio ? (audio.beat ? 1 : 0) : 0;

const sliceH = Math.max(2, Math.floor(getVar('slice_height') ?? 3));
const baseAmp = getVar('wave_depth') ?? 75;
const speed = getVar('wave_speed') ?? 1.5;
const emblem = getVar('emblem_style') || 'Vector Crest';
const palette = getVar('color_mode') || 'Mercury Cyan';
const phaseMode = getVar('glitch_burst') || 'Clean Wave';

// Allocate persistent offscreen buffer and state once
room.state.bufSize ??= 600;
const B = room.state.bufSize;
if (!room.state.buffer) {
  room.state.buffer = new OffscreenCanvas(B, B);
  room.state.lastEmblem = '';
  room.state.lastPalette = '';
}

// Palette definitions: metallic chrome highlights + electric cyan accents
const colors = {
  'Mercury Cyan': {
    bg: '#04080e',
    grad1: ['#00f0ff', '#ffffff', '#004c66', '#a5f3fc', '#ffffff', '#083344'],
    glow: 'rgba(0, 240, 255, 0.45)',
    accent: '#38bdf8',
    tint: 'rgba(0, 245, 255, 0.08)'
  },
  'Deep Cobalt': {
    bg: '#020514',
    grad1: ['#38bdf8', '#e0f2fe', '#0369a1', '#7dd3fc', '#ffffff', '#0c224b'],
    glow: 'rgba(56, 189, 248, 0.5)',
    accent: '#818cf8',
    tint: 'rgba(99, 102, 241, 0.08)'
  },
  'Electric Mirror': {
    bg: '#000000',
    grad1: ['#f8fafc', '#22d3ee', '#ffffff', '#0e7490', '#f1f5f9', '#082f49'],
    glow: 'rgba(34, 211, 238, 0.6)',
    accent: '#67e8f9',
    tint: 'rgba(34, 211, 238, 0.12)'
  }
}[palette] || colors['Mercury Cyan'];

// Redraw emblem to offscreen buffer only when requested style/palette changes
if (room.state.lastEmblem !== emblem || room.state.lastPalette !== palette) {
  room.state.lastEmblem = emblem;
  room.state.lastPalette = palette;
  const bctx = room.state.buffer.getContext('2d');
  bctx.clearRect(0, 0, B, B);
  bctx.save();
  bctx.translate(B / 2, B / 2);

  // Chiseled chrome metallic gradient
  const gChrome = bctx.createLinearGradient(-B / 2, -B / 2, B / 2, B / 2);
  const stops = colors.grad1;
  for (let i = 0; i < stops.length; i++) {
    gChrome.addColorStop(i / (stops.length - 1), stops[i]);
  }
  bctx.fillStyle = gChrome;
  bctx.strokeStyle = '#ffffff';
  bctx.lineWidth = 3;

  if (emblem === 'Vector Crest') {
    // Shield + Concentric faceted chevron wings
    bctx.beginPath();
    bctx.moveTo(0, -220);
    bctx.lineTo(190, -90);
    bctx.lineTo(130, 110);
    bctx.lineTo(0, 230);
    bctx.lineTo(-130, 110);
    bctx.lineTo(-190, -90);
    bctx.closePath();
    bctx.fill();
    bctx.stroke();

    bctx.fillStyle = '#020b14';
    bctx.beginPath();
    bctx.moveTo(0, -160);
    bctx.lineTo(130, -70);
    bctx.lineTo(90, 80);
    bctx.lineTo(0, 170);
    bctx.lineTo(-90, 80);
    bctx.lineTo(-130, -70);
    bctx.closePath();
    bctx.fill();

    // Inset chrome core diamond
    bctx.fillStyle = gChrome;
    bctx.beginPath();
    bctx.moveTo(0, -110);
    bctx.lineTo(70, 0);
    bctx.lineTo(0, 110);
    bctx.lineTo(-70, 0);
    bctx.closePath();
    bctx.fill();
    bctx.stroke();
  } else if (emblem === 'Cyber Falcon') {
    // Aggressive low-poly raptor wings & beak
    bctx.beginPath();
    bctx.moveTo(0, 170);
    bctx.lineTo(35, 90);
    bctx.lineTo(140, 120);
    bctx.lineTo(240, -40);
    bctx.lineTo(120, -70);
    bctx.lineTo(210, -180);
    bctx.lineTo(60, -120);
    bctx.lineTo(0, -220);
    bctx.lineTo(-60, -120);
    bctx.lineTo(-210, -180);
    bctx.lineTo(-120, -70);
    bctx.lineTo(-240, -40);
    bctx.lineTo(-140, 120);
    bctx.lineTo(-35, 90);
    bctx.closePath();
    bctx.fill();
    bctx.stroke();

    // Cutout center
    bctx.fillStyle = '#030a12';
    bctx.beginPath();
    bctx.moveTo(0, -130);
    bctx.lineTo(50, -40);
    bctx.lineTo(0, 70);
    bctx.lineTo(-50, -40);
    bctx.closePath();
    bctx.fill();
  } else if (emblem === 'Solar Shard') {
    // 8-fold faceted solar star with razor blades
    for (let i = 0; i < 8; i++) {
      bctx.save();
      bctx.rotate((i * Math.PI) / 4);
      bctx.beginPath();
      bctx.moveTo(0, 0);
      bctx.lineTo(28, -60);
      bctx.lineTo(0, -230);
      bctx.lineTo(-28, -60);
      bctx.closePath();
      bctx.fill();
      bctx.stroke();
      bctx.restore();
    }
    bctx.fillStyle = '#ffffff';
    bctx.beginPath();
    bctx.arc(0, 0, 48, 0, Math.PI * 2);
    bctx.fill();
  } else {
    // Neon Sigil: Interlocking square-circle tech rune
    bctx.lineWidth = 14;
    bctx.strokeRect(-150, -150, 300, 300);
    bctx.save();
    bctx.rotate(Math.PI / 4);
    bctx.strokeRect(-120, -120, 240, 240);
    bctx.restore();
    bctx.beginPath();
    bctx.arc(0, 0, 160, 0, Math.PI * 2);
    bctx.stroke();
    bctx.beginPath();
    bctx.arc(0, 0, 70, 0, Math.PI * 2);
    bctx.fill();
  }

  // Polished chrome horizontal specular reflection stripe
  bctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  bctx.fillRect(-B / 2, -18, B, 36);
  bctx.restore();
}

// Background fill
ctx.fillStyle = colors.bg;
ctx.fillRect(0, 0, W, H);

// Distant perspective grid floor & ceiling
ctx.save();
ctx.strokeStyle = colors.tint;
ctx.lineWidth = 1;
const horizon = H * 0.5;
for (let x = -W * 0.2; x <= W * 1.2; x += W / 14) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(W / 2 + (x - W / 2) * 0.15, horizon);
  ctx.lineTo(x, H);
  ctx.stroke();
}
ctx.restore();

// Amplitude calculation with audio beat punch
const amp = (baseAmp + bass * 80) * (1 + beat * 0.2);
const timeSpeed = t * speed * 2.2;

// Centered placement with scale fit
const targetH = Math.min(H * 0.72, W * 0.65);
const scale = targetH / B;
const renderW = B * scale;
const renderH = B * scale;
const originX = (W - renderW) / 2;
const originY = (H - renderH) / 2;

// Scanline wobbler pass
const numSlices = Math.ceil(B / sliceH);
const jitterAmp = phaseMode === 'Raster Jitter' ? (bass * 25 + beat * 18) : 0;
const dualPhase = phaseMode === 'Dual Phase' ? 1.85 : 1.0;

// Ambient shadow / blue bloom pass behind wobbler
ctx.save();
ctx.globalCompositeOperation = 'screen';
ctx.shadowColor = colors.glow;
ctx.shadowBlur = 40 + bass * 40;
ctx.shadowOffsetX = 0;
ctx.shadowOffsetY = 0;
ctx.fillStyle = colors.glow;
ctx.fillRect(originX + renderW * 0.1, originY + renderH * 0.1, renderW * 0.8, renderH * 0.8);
ctx.restore();

// Wobbled raster drawing
for (let i = 0; i < numSlices; i++) {
  const sy = i * sliceH;
  const sh = Math.min(sliceH, B - sy);
  const dy = originY + sy * scale;
  const dh = sh * scale + 0.5;
  const normY = sy / B;

  // Layered sine equations (Demoscene standard: 3 sinusoids at irrational ratios)
  const w1 = Math.sin(normY * 8.2 + timeSpeed);
  const w2 = Math.sin(normY * 17.6 - timeSpeed * 1.37 * dualPhase) * 0.45;
  const w3 = Math.cos(normY * 3.1 + timeSpeed * 0.6) * 0.3;
  let shift = (w1 + w2 + w3) * amp;

  if (jitterAmp > 0 && (i % 2 === 0)) {
    shift += (Math.sin(i * 123.4 + t * 40) > 0.3 ? jitterAmp : -jitterAmp);
  }

  const dx = originX + shift;
  ctx.drawImage(room.state.buffer, 0, sy, B, sh, dx, dy, renderW, dh);
}

// Overlay subtle scanlines over wobbler for retro tube sheen
ctx.save();
ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
for (let y = 0; y < H; y += 4) {
  ctx.fillRect(0, y, W, 1.5);
}

// Subtle audio level HUD bars on edges
if (audio && audio.level > 0.01) {
  ctx.fillStyle = colors.accent;
  const barH = audio.level * (H * 0.4);
  ctx.fillRect(16, (H - barH) / 2, 3, barH);
  ctx.fillRect(W - 19, (H - barH) / 2, 3, barH);
}
ctx.restore();

ctx.restore();