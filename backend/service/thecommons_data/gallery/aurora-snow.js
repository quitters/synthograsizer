ctx.save();
const w = frame.width;
const h = frame.height;
const t = frame.t;
const dt = frame.dt || 0.016;

const paletteChoice = getVar('aurora_palette') || 'Emerald & Violet';
const numCurtains = Math.round(getVar('curtain_layers') ?? 4);
const speed = getVar('aurora_speed') ?? 1.0;
const showLake = getVar('lake_reflection') ?? true;
const showSnow = getVar('snow') ?? true;

const palettes = {
  'Emerald & Violet': { h1: 145, h2: 275, s: 85, l: 55 },
  'Boreal Violet': { h1: 270, h2: 320, s: 80, l: 60 },
  'Solar Flare': { h1: 355, h2: 45, s: 90, l: 60 },
  'Arctic Cyan': { h1: 185, h2: 220, s: 90, l: 55 }
};
const pal = palettes[paletteChoice] || palettes['Emerald & Violet'];

const waterY = showLake ? Math.floor(h * 0.62) : h;
const skyH = Math.max(10, waterY);

if (!room.state.skyBuf || room.state.skyBuf.width !== Math.floor(w) || room.state.skyBuf.height !== skyH) {
  room.state.skyBuf = new OffscreenCanvas(Math.max(1, Math.floor(w)), skyH);
}
const sCtx = room.state.skyBuf.getContext('2d');

// Render Sky
const skyGrad = sCtx.createLinearGradient(0, 0, 0, skyH);
skyGrad.addColorStop(0, '#02050f');
skyGrad.addColorStop(0.55, '#050e20');
skyGrad.addColorStop(1, '#09182b');
sCtx.fillStyle = skyGrad;
sCtx.fillRect(0, 0, w, skyH);

// Twinkling stars
sCtx.save();
for (let i = 0; i < 90; i++) {
  const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * w;
  const sy = (Math.cos(i * 311.7) * 0.5 + 0.5) * (skyH * 0.85);
  const twinkle = Math.sin(t * 1.5 + i * 2.3) * 0.35 + 0.65 + audio.treble * 0.3;
  const sr = (0.6 + (i % 3) * 0.5) * Math.max(0.4, Math.min(1.5, twinkle));
  sCtx.fillStyle = `rgba(220, 235, 255, ${Math.min(1, 0.4 + twinkle * 0.5)})`;
  sCtx.beginPath();
  sCtx.arc(sx, sy, sr, 0, Math.PI * 2);
  sCtx.fill();
}
sCtx.restore();

// Aurora Curtains
sCtx.save();
sCtx.globalCompositeOperation = 'screen';
const bassBoost = audio.bass * 0.4;
const midBoost = audio.mid * 0.25;

for (let c = 0; c < numCurtains; c++) {
  const layerNorm = c / Math.max(1, numCurtains - 1);
  const cTime = t * speed * 0.35 + c * 1.8;
  const baseElevation = skyH * (0.12 + layerNorm * 0.32);
  const ribbonHeight = skyH * (0.35 + layerNorm * 0.15 + bassBoost * 0.25);
  const segWidth = 14;
  const steps = Math.ceil(w / segWidth) + 1;
  
  const curtainGrad = sCtx.createLinearGradient(0, baseElevation, 0, baseElevation + ribbonHeight);
  const curtainHue = layerNorm < 0.5 ? pal.h1 : pal.h2;
  const topHue = pal.h2;
  const alpha = 0.35 + (audio.level * 0.3) - layerNorm * 0.08;
  curtainGrad.addColorStop(0, `hsla(${topHue}, ${pal.s}%, ${pal.l + 10}%, 0)`);
  curtainGrad.addColorStop(0.3, `hsla(${curtainHue}, ${pal.s}%, ${pal.l}%, ${Math.min(0.85, alpha * 0.9)})`);
  curtainGrad.addColorStop(0.7, `hsla(${pal.h1}, ${pal.s}%, ${pal.l - 5}%, ${Math.min(0.9, alpha * 1.1)})`);
  curtainGrad.addColorStop(1, `hsla(${pal.h1}, ${pal.s}%, ${pal.l - 15}%, 0)`);

  sCtx.fillStyle = curtainGrad;
  sCtx.beginPath();

  // Top wavy edge
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const x = i * segWidth;
    const nx = x * 0.003;
    const wave1 = Math.sin(nx * 4.0 + cTime) * (skyH * 0.08);
    const wave2 = Math.cos(nx * 8.5 - cTime * 1.3) * (skyH * 0.04);
    const wave3 = Math.sin(nx * 18.0 + cTime * 2.0) * (skyH * 0.02 * (1 + midBoost * 2));
    const yTop = baseElevation + wave1 + wave2 + wave3;
    points.push({ x, yTop });
    if (i === 0) sCtx.moveTo(x, yTop);
    else sCtx.lineTo(x, yTop);
  }

  // Bottom wavy edge
  for (let i = steps; i >= 0; i--) {
    const p = points[i];
    const flare = Math.sin(p.x * 0.015 + cTime * 1.5) * (ribbonHeight * 0.25);
    const yBot = p.yTop + ribbonHeight + flare;
    sCtx.lineTo(p.x, yBot);
  }
  sCtx.closePath();
  sCtx.fill();

  // Fine ray folds inside the curtain
  sCtx.lineWidth = segWidth * 0.8;
  for (let i = 0; i <= steps; i += 2) {
    const p = points[i];
    const rayFold = Math.sin(i * 0.65 + cTime * 2.5);
    if (rayFold > 0.15) {
      const foldAlpha = (rayFold - 0.15) * 0.4 * (1 + bassBoost);
      sCtx.strokeStyle = `hsla(${curtainHue}, ${pal.s}%, ${pal.l + 15}%, ${Math.min(0.6, foldAlpha)})`;
      sCtx.beginPath();
      sCtx.moveTo(p.x, p.yTop + ribbonHeight * 0.1);
      sCtx.lineTo(p.x + Math.sin(cTime + i) * 10, p.yTop + ribbonHeight * 0.85);
      sCtx.stroke();
    }
  }
}
sCtx.restore();

// Blit Sky Buffer to Main Canvas
ctx.drawImage(room.state.skyBuf, 0, 0);

// Lake Water and Reflection
if (showLake) {
  const lakeH = h - waterY;
  const waterGrad = ctx.createLinearGradient(0, waterY, 0, h);
  waterGrad.addColorStop(0, '#061324');
  waterGrad.addColorStop(0.4, '#030a14');
  waterGrad.addColorStop(1, '#010408');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, waterY, w, lakeH);

  // Distorted horizontal slice reflection of sky
  ctx.save();
  ctx.globalAlpha = 0.55 + audio.bass * 0.25;
  const sliceH = 4;
  for (let dy = 0; dy < lakeH; dy += sliceH) {
    const lakeRatio = dy / lakeH;
    const srcY = Math.max(0, waterY - (dy * (1.1 - lakeRatio * 0.3)));
    const rippleFreq = 0.12 + lakeRatio * 0.08;
    const rippleSpeed = t * 3.0 + lakeRatio * 5.0;
    const rippleAmp = (2.5 + lakeRatio * 12.0) * (1 + audio.mid * 0.8);
    const offsetX = Math.sin(dy * rippleFreq + rippleSpeed) * rippleAmp;
    ctx.drawImage(room.state.skyBuf, 0, srcY, w, sliceH, offsetX, waterY + dy, w, sliceH);
  }
  ctx.restore();

  // Surface sheen lines on the water
  ctx.save();
  for (let s = 0; s < 7; s++) {
    const sy = waterY + (lakeH * (0.15 + s * 0.12));
    const sheenAlpha = (0.08 + Math.sin(t * 1.2 + s * 1.5) * 0.05) * (1 + audio.treble);
    ctx.strokeStyle = `hsla(${pal.h1}, 70%, 75%, ${sheenAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const sxStart = (Math.sin(s * 73.1 + t * 0.4) * 0.2 + 0.4) * w;
    const sLen = (0.2 + (s % 3) * 0.15) * w;
    ctx.moveTo(sxStart - sLen * 0.5, sy);
    ctx.lineTo(sxStart + sLen * 0.5, sy);
    ctx.stroke();
  }
  ctx.restore();
}

// Draw Hills Silhouettes
function drawMountainLayer(baseY, amp, freq, color, pineStep) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, baseY);
  for (let x = 0; x <= w; x += 15) {
    const nx = x * freq;
    const my = baseY - Math.sin(nx) * amp - Math.cos(nx * 2.3 + 1.2) * (amp * 0.45) - Math.sin(nx * 0.5) * (amp * 0.3);
    ctx.lineTo(x, my);
    if (pineStep && x % pineStep < 15) {
      const treeH = 6 + (Math.sin(x * 13.7) * 0.5 + 0.5) * 12;
      ctx.lineTo(x + 4, my - treeH);
      ctx.lineTo(x + 8, my);
    }
  }
  ctx.lineTo(w, baseY);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

// Layer 1: Distant majestic peaks
drawMountainLayer(waterY - (showLake ? skyH * 0.18 : h * 0.35), skyH * 0.22, 0.003, '#040b17', 0);

// Layer 2: Mid-ground rolling hills with jagged tree tops
drawMountainLayer(waterY - (showLake ? skyH * 0.08 : h * 0.2), skyH * 0.13, 0.006, '#020710', 25);

// Layer 3: Foreground shore / crags
if (showLake) {
  ctx.fillStyle = '#010408';
  ctx.beginPath();
  ctx.moveTo(0, waterY + 4);
  for (let x = 0; x <= w; x += 30) {
    const crag = Math.sin(x * 0.015) * 8 + Math.cos(x * 0.04) * 4;
    ctx.lineTo(x, waterY - 2 + crag);
  }
  ctx.lineTo(w, waterY + 4);
  ctx.closePath();
  ctx.fill();
} else {
  drawMountainLayer(h * 0.9, h * 0.12, 0.009, '#010307', 18);
}

// Campfires / Cozy lights for connected people along the shoreline/hills
if (room.people && room.people.length > 0) {
  ctx.save();
  const count = room.people.length;
  room.people.forEach((p, idx) => {
    const px = (0.1 + (idx + 0.5) / count * 0.8) * w;
    const py = showLake ? waterY - 3 : h * 0.88 - (idx % 3) * 15;
    const flicker = Math.sin(t * 8 + idx * 3) * 0.3 + 0.7 + (audio.beat ? 0.5 : 0);
    const rad = (3 + flicker * 2) * (1 + audio.bass * 0.4);
    
    // Warm fire glow tinted by user's hue
    const fireHue = p.hue ?? 35;
    const fGrad = ctx.createRadialGradient(px, py, 0, px, py, rad * 3.5);
    fGrad.addColorStop(0, `hsla(${fireHue}, 100%, 75%, 0.9)`);
    fGrad.addColorStop(0.3, `hsla(${fireHue}, 90%, 55%, 0.6)`);
    fGrad.addColorStop(1, `hsla(${fireHue}, 90%, 40%, 0)`);
    ctx.fillStyle = fGrad;
    ctx.beginPath();
    ctx.arc(px, py, rad * 3.5, 0, Math.PI * 2);
    ctx.fill();

    if (showLake) {
      // Reflection of campfire on water
      ctx.fillStyle = `hsla(${fireHue}, 90%, 65%, ${0.25 * flicker})`;
      ctx.fillRect(px - 2, waterY, 4, 18 * flicker);
    }
  });
  ctx.restore();
}

// Falling Snow System
room.state.flakes ??= [];
if (showSnow) {
  const maxFlakes = 160;
  while (room.state.flakes.length < maxFlakes) {
    room.state.flakes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.8 + Math.random() * 2.2,
      sp: 35 + Math.random() * 55,
      drift: (Math.random() - 0.5) * 20,
      sway: Math.random() * Math.PI * 2
    });
  }

  ctx.save();
  ctx.fillStyle = 'rgba(235, 245, 255, 0.85)';
  for (let i = 0; i < room.state.flakes.length; i++) {
    const f = room.state.flakes[i];
    f.y += (f.sp + audio.level * 25) * dt;
    f.x += (Math.sin(t * 1.5 + f.sway) * 18 + f.drift) * dt;

    if (f.y > h) {
      f.y = -5;
      f.x = Math.random() * w;
    }
    if (f.x < 0) f.x += w;
    if (f.x > w) f.x -= w;

    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
} else {
  room.state.flakes.length = 0;
}

ctx.restore();