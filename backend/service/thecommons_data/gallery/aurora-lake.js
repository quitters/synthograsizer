const w = frame.width;
const h = frame.height;
const t = frame.t;

// Palette map
const palettes = {
  'Emerald Veil': [
    { h: 145, s: 90, l: 55 },
    { h: 168, s: 95, l: 60 },
    { h: 120, s: 85, l: 50 },
    { h: 185, s: 90, l: 65 }
  ],
  'Violet Surge': [
    { h: 275, s: 85, l: 60 },
    { h: 310, s: 90, l: 65 },
    { h: 220, s: 80, l: 55 },
    { h: 165, s: 95, l: 50 }
  ],
  'Solar Storm': [
    { h: 350, s: 90, l: 60 },
    { h: 35, s: 95, l: 55 },
    { h: 160, s: 90, l: 50 },
    { h: 285, s: 85, l: 65 }
  ],
  'Arctic Ghost': [
    { h: 175, s: 60, l: 75 },
    { h: 195, s: 50, l: 80 },
    { h: 215, s: 65, l: 70 },
    { h: 140, s: 45, l: 65 }
  ]
};
const selectedPalette = palettes[getVar('aurora_palette')] ?? palettes['Emerald Veil'];

// Curtain motion styles
const styleName = getVar('curtain_style') ?? 'Luminous Flow';
const waveMult = styleName === 'Gossamer Silk' ? 0.6 : (styleName === 'Furious Shimmer' ? 2.4 : 1.2);
const ribbonLayers = styleName === 'Gossamer Silk' ? 3 : (styleName === 'Furious Shimmer' ? 5 : 4);

// Mountain silhouetting
const mountainStyle = getVar('mountain_silhouette') ?? 'Jagged Fjords';
const mtnFreq = mountainStyle === 'Rolling Tundra' ? 0.0018 : (mountainStyle === 'Glacial Crags' ? 0.0055 : 0.0035);
const mtnAmp = mountainStyle === 'Rolling Tundra' ? 0.08 : (mountainStyle === 'Glacial Crags' ? 0.16 : 0.12);

// Ice appearance
const iceStyle = getVar('ice_texture') ?? 'Dark Gloss';
const ribbonCount = getVar('ribbon_density') ?? 4;

// State init for persistent stars & mountain baseline
room.state.init ??= false;
if (!room.state.init) {
  room.state.stars = [];
  for (let i = 0; i < 90; i++) {
    room.state.stars.push({
      x: Math.random(),
      y: Math.random() * 0.55,
      size: Math.random() * 1.6 + 0.4,
      phase: Math.random() * Math.PI * 2
    });
  }
  room.state.init = true;
}

// Deep night sky background
const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
bgGrad.addColorStop(0, '#02050f');
bgGrad.addColorStop(0.55, '#050c18');
bgGrad.addColorStop(0.58, '#08101a');
bgGrad.addColorStop(1, '#020408');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, w, h);

const horizonY = h * 0.56;

// Draw stars in sky
ctx.save();
for (let i = 0; i < room.state.stars.length; i++) {
  const s = room.state.stars[i];
  const twinkle = 0.4 + 0.6 * Math.sin(t * 1.5 + s.phase + (audio.treble ?? 0) * 3);
  ctx.fillStyle = `rgba(220, 235, 255, ${twinkle * 0.8})`;
  ctx.fillRect(s.x * w, s.y * h, s.size, s.size);
}
ctx.restore();

// Aurora ribbons function
function drawRibbons(targetCtx, isReflect = false) {
  targetCtx.save();
  targetCtx.globalCompositeOperation = 'screen';

  const layers = Math.min(ribbonLayers, ribbonCount);
  const bassPulse = (audio.bass ?? 0) * 0.45;
  const midPulse = (audio.mid ?? 0) * 0.35;

  for (let r = 0; r < layers; r++) {
    const col = selectedPalette[r % selectedPalette.length];
    const speed = (0.2 + r * 0.08) * waveMult;
    const baseAlpha = (0.18 + r * 0.04) * (isReflect ? 0.35 : 0.85);

    const steps = 48;
    const stepX = w / steps;
    
    // Render vertical ray slices for the authentic curtain ripple
    for (let i = 0; i <= steps; i++) {
      const x = i * stepX;
      const nx = x * 0.003;
      const timePhase = t * speed + r * 1.4;
      
      // Multi-sine displacement rippling with music
      const wave1 = Math.sin(nx * 2.2 + timePhase) * 45 * waveMult;
      const wave2 = Math.cos(nx * 4.8 - timePhase * 0.7) * 25 * (1 + bassPulse);
      const musicJitter = Math.sin(nx * 12 + t * 4) * (15 * midPulse);

      const curtainBaseY = horizonY - 40 - r * 35 + wave1 + wave2 + musicJitter;
      const curtainHeight = (h * 0.28 + r * 18 + Math.sin(nx * 3 - timePhase) * 30) * (1 + bassPulse * 0.6);
      
      const colH = (col.h + Math.sin(nx * 1.5 + t) * 12) % 360;
      const colL = Math.min(85, col.l + bassPulse * 20);
      
      const grad = targetCtx.createLinearGradient(x, curtainBaseY, x, curtainBaseY - curtainHeight);
      grad.addColorStop(0, `hsla(${colH}, ${col.s}%, ${colL}%, 0)`);
      grad.addColorStop(0.2, `hsla(${colH}, ${col.s}%, ${colL}%, ${baseAlpha})`);
      grad.addColorStop(0.7, `hsla(${(colH + 20) % 360}, ${col.s}%, ${colL + 10}%, ${baseAlpha * 0.7})`);
      grad.addColorStop(1, `hsla(${(colH + 40) % 360}, ${col.s}%, 90%, 0)`);

      targetCtx.fillStyle = grad;
      targetCtx.fillRect(x - stepX * 0.5, curtainBaseY - curtainHeight, stepX * 1.8, curtainHeight);
    }
  }
  targetCtx.restore();
}

// Sky Aurora
ctx.save();
ctx.beginPath();
ctx.rect(0, 0, w, horizonY + 20);
ctx.clip();
drawRibbons(ctx, false);
ctx.restore();

// Distant silhouette mountains
ctx.save();
ctx.fillStyle = '#03070d';
ctx.beginPath();
ctx.moveTo(0, horizonY);
for (let x = 0; x <= w; x += 8) {
  const n1 = Math.sin(x * mtnFreq * 1.0) * Math.cos(x * mtnFreq * 2.3);
  const n2 = Math.sin(x * mtnFreq * 5.1) * 0.3;
  const mHeight = (n1 + n2 + 0.8) * (h * mtnAmp);
  ctx.lineTo(x, horizonY - mHeight);
}
ctx.lineTo(w, horizonY);
ctx.closePath();
ctx.fill();
ctx.restore();

// Frozen Lake & Mirror Reflection
ctx.save();
ctx.beginPath();
ctx.rect(0, horizonY - 2, w, h - horizonY + 2);
ctx.clip();

// Draw inverted mirror reflection onto ice with squish & blur impression
ctx.save();
ctx.translate(0, horizonY * 2);
ctx.scale(1, -0.92);
// Audio beat shimmer wave
if (audio.beat) {
  ctx.translate((Math.random() - 0.5) * 4, 0);
}
drawRibbons(ctx, true);
ctx.restore();

// Lake surface shading & frost
const lakeOverlay = ctx.createLinearGradient(0, horizonY, 0, h);
if (iceStyle === 'Dark Gloss') {
  lakeOverlay.addColorStop(0, 'rgba(4, 9, 18, 0.4)');
  lakeOverlay.addColorStop(0.3, 'rgba(3, 8, 16, 0.65)');
  lakeOverlay.addColorStop(1, 'rgba(2, 4, 10, 0.92)');
} else if (iceStyle === 'Cracked Glaze') {
  lakeOverlay.addColorStop(0, 'rgba(10, 24, 38, 0.35)');
  lakeOverlay.addColorStop(0.4, 'rgba(6, 16, 26, 0.7)');
  lakeOverlay.addColorStop(1, 'rgba(2, 6, 12, 0.94)');
} else {
  // Frosted Rime
  lakeOverlay.addColorStop(0, 'rgba(28, 48, 62, 0.55)');
  lakeOverlay.addColorStop(0.5, 'rgba(14, 28, 38, 0.78)');
  lakeOverlay.addColorStop(1, 'rgba(4, 10, 16, 0.95)');
}
ctx.fillStyle = lakeOverlay;
ctx.fillRect(0, horizonY - 2, w, h - horizonY + 2);

// Lake surface streak lines (ice rifts / horizontal glare)
ctx.strokeStyle = `rgba(160, 220, 255, ${0.04 + (audio.treble ?? 0) * 0.08})`;
ctx.lineWidth = 1;
for (let y = horizonY + 6; y < h; y += 14) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
}

// Cracked Glaze features if active
if (iceStyle === 'Cracked Glaze') {
  ctx.save();
  ctx.strokeStyle = 'rgba(190, 235, 255, 0.12)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let c = 0; c < 5; c++) {
    let px = (w * 0.2) + c * (w * 0.16);
    let py = horizonY;
    ctx.moveTo(px, py);
    for (let step = 0; step < 6; step++) {
      px += (Math.sin(step * 3 + c) * 35) + (px - w * 0.5) * 0.15;
      py += (h - horizonY) / 6;
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.restore();
}

// Presence of connected room people as small campfire beacons on the shore
if (room.people && room.people.length > 0) {
  for (let idx = 0; idx < room.people.length; idx++) {
    const person = room.people[idx];
    const px = ((idx + 1) / (room.people.length + 1)) * (w * 0.85) + w * 0.075;
    const py = horizonY - 1;
    const glow = 2 + Math.sin(t * 2 + idx) * 1.5 + (audio.level ?? 0) * 3;
    
    ctx.beginPath();
    ctx.fillStyle = `hsla(${person.hue ?? 38}, 95%, 70%, 0.85)`;
    ctx.arc(px, py, glow, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.fillStyle = `hsla(${person.hue ?? 38}, 95%, 65%, 0.25)`;
    ctx.ellipse(px, py + 8, glow * 0.8, 12 + glow * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();