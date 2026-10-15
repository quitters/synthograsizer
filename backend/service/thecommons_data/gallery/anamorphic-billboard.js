ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;
const bass = audio.bass ?? 0;
const beat = audio.beat ? 1 : 0;
const treble = audio.treble ?? 0;
const mid = audio.mid ?? 0;

// 1. PALETTES & PRESETS
const palettes = {
  'Neo-Tokyo Cyan & Magenta': { pri: '#00f0ff', sec: '#ff0055', accent: '#ffe600', dark: '#040b16', glow: 'rgba(0, 240, 255, 0.45)' },
  'Solar Flare Gold & Amber': { pri: '#ffaa00', sec: '#ff3700', accent: '#fff0a0', dark: '#120701', glow: 'rgba(255, 170, 0, 0.45)' },
  'Deep Abyssal Blue & Jade': { pri: '#00ffa3', sec: '#0055ff', accent: '#b0ffff', dark: '#010c14', glow: 'rgba(0, 255, 163, 0.45)' },
  'Monochrome Silver & Platinum': { pri: '#e0e6ed', sec: '#7a889b', accent: '#ffffff', dark: '#0a0d12', glow: 'rgba(224, 230, 237, 0.35)' }
};
const pal = palettes[getVar('palette')] ?? palettes['Neo-Tokyo Cyan & Magenta'];
const subject = getVar('subject') ?? 'Chrome Hyper-Sphere';
const cornerStyle = getVar('corner_curvature') ?? 'Rounded Fillet';
const protrudeMult = getVar('protrusion_scale') ?? 1.2;
const showStreet = getVar('street_atmosphere') ?? true;
const showLedGrid = getVar('led_grid_fx') ?? true;

// Persistent room state
room.state.beatPulse = Math.max(0, (room.state.beatPulse ?? 0) * 0.9 + beat * 0.4);
const pulse = room.state.beatPulse;

// 2. CLEAR BACKGROUND (PITCH BLACK / NIGHT SKY)
ctx.fillStyle = '#020306';
ctx.fillRect(0, 0, W, H);

// 3. ARCHITECTURAL SCREEN GEOMETRY (The 90° Corner Billboard)
// Screen center & vantage
const cx = W * 0.5;
const cy = H * 0.46;
const sw = Math.min(W * 0.78, 1200);
const sh = Math.min(H * 0.62, 720);

// Screen corners: Left wing vanishing left, Right wing vanishing right
// The corner edge sits close to the horizontal center
const cornerX = cx - sw * 0.05;
const topCornerY = cy - sh * 0.48;
const botCornerY = cy + sh * 0.40;

const leftEdgeX = cornerX - sw * 0.44;
const leftTopY = topCornerY + sh * 0.12;
const leftBotY = botCornerY - sh * 0.08;

const rightEdgeX = cornerX + sw * 0.46;
const rightTopY = topCornerY + sh * 0.14;
const rightBotY = botCornerY - sh * 0.06;

// Back interior corner of the 3D "room" inside the billboard
const backCornerX = cornerX;
const backTopY = topCornerY + sh * 0.16;
const backBotY = botCornerY - sh * 0.18;

// 4. DRAW URBAN SURROUNDINGS / TOP ROOF / BOTTOM ROAD
if (showStreet) {
  // Distant subtle building silhouettes
  ctx.fillStyle = '#060911';
  ctx.fillRect(0, H * 0.75, W, H * 0.25);
  // Street ground wet asphalt reflection
  const streetGrad = ctx.createLinearGradient(0, H * 0.78, 0, H);
  streetGrad.addColorStop(0, '#04070d');
  streetGrad.addColorStop(0.3, '#070f1a');
  streetGrad.addColorStop(1, '#020306');
  ctx.fillStyle = streetGrad;
  ctx.fillRect(0, H * 0.78, W, H * 0.22);

  // Reflected puddle sheen below the billboard
  const puddleGrad = ctx.createRadialGradient(cornerX, H * 0.90, 20, cornerX, H * 0.90, sw * 0.4);
  puddleGrad.addColorStop(0, pal.glow);
  puddleGrad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
  puddleGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = puddleGrad;
  ctx.fillRect(0, H * 0.78, W, H * 0.22);

  // Crowd silhouettes observing on the street
  if (room.people && room.people.length > 0) {
    for (let i = 0; i < Math.min(room.people.length, 36); i++) {
      const p = room.people[i];
      const px = W * 0.15 + ((i * 73 + 19) % Math.floor(W * 0.7));
      const py = H * 0.92 + ((i * 13) % 18);
      ctx.fillStyle = `hsla(${p.hue}, 70%, 50%, 0.4)`;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Mini phone camera light pointing at the billboard
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillRect(px - 1, py - 4, 1.5, 1.5);
      }
    }
  }
}

// Billboard Outer Frame Drop-Shadow (gives massive physical presence)
ctx.save();
ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
ctx.shadowBlur = 40;
ctx.shadowOffsetY = 25;
ctx.fillStyle = '#080a0f';
// Concrete soffit and rim
ctx.beginPath();
ctx.moveTo(leftEdgeX - 12, leftTopY - 14);
ctx.lineTo(cornerX, topCornerY - 20);
ctx.lineTo(rightEdgeX + 12, rightTopY - 14);
ctx.lineTo(rightEdgeX + 12, rightBotY + 22);
ctx.lineTo(cornerX, botCornerY + 28);
ctx.lineTo(leftEdgeX - 12, leftBotY + 22);
ctx.closePath();
ctx.fill();
ctx.restore();

// 5. INNER BOX WALLS (FORCED PERSPECTIVE ILLUSION)
// Left Interior Wall
const leftWallGrad = ctx.createLinearGradient(leftEdgeX, cy, cornerX, cy);
leftWallGrad.addColorStop(0, '#070a12');
leftWallGrad.addColorStop(1, '#0f1422');
ctx.fillStyle = leftWallGrad;
ctx.beginPath();
ctx.moveTo(leftEdgeX, leftTopY);
ctx.lineTo(backCornerX, backTopY);
ctx.lineTo(backCornerX, backBotY);
ctx.lineTo(leftEdgeX, leftBotY);
ctx.closePath();
ctx.fill();

// Right Interior Wall
const rightWallGrad = ctx.createLinearGradient(cornerX, cy, rightEdgeX, cy);
rightWallGrad.addColorStop(0, '#101726');
rightWallGrad.addColorStop(1, '#05070d');
ctx.fillStyle = rightWallGrad;
ctx.beginPath();
ctx.moveTo(backCornerX, backTopY);
ctx.lineTo(rightEdgeX, rightTopY);
ctx.lineTo(rightEdgeX, rightBotY);
ctx.lineTo(backCornerX, backBotY);
ctx.closePath();
ctx.fill();

// Interior Ceiling & Floor
ctx.fillStyle = '#05070b';
ctx.beginPath();
ctx.moveTo(leftEdgeX, leftTopY);
ctx.lineTo(cornerX, topCornerY);
ctx.lineTo(rightEdgeX, rightTopY);
ctx.lineTo(backCornerX, backTopY);
ctx.closePath();
ctx.fill();

ctx.fillStyle = '#040609';
ctx.beginPath();
ctx.moveTo(leftEdgeX, leftBotY);
ctx.lineTo(cornerX, botCornerY);
ctx.lineTo(rightEdgeX, rightBotY);
ctx.lineTo(backCornerX, backBotY);
ctx.closePath();
ctx.fill();

// Interior Perspective Depth Grid Lines on floor and walls
ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
ctx.lineWidth = 1.2;
ctx.beginPath();
for (let g = 0.2; g < 1.0; g += 0.2) {
  // Left wall horizontal guides
  const lyT = leftTopY + (leftBotY - leftTopY) * g;
  const byT = backTopY + (backBotY - backTopY) * g;
  ctx.moveTo(leftEdgeX, lyT);
  ctx.lineTo(backCornerX, byT);
  // Right wall horizontal guides
  const ryT = rightTopY + (rightBotY - rightTopY) * g;
  ctx.moveTo(backCornerX, byT);
  ctx.lineTo(rightEdgeX, ryT);
}
// Floor depth lines radiating from back corner
for (let fx = 0.2; fx <= 0.8; fx += 0.2) {
  const fxPt = leftEdgeX + (cornerX - leftEdgeX) * fx;
  const fyPt = leftBotY + (botCornerY - leftBotY) * fx;
  ctx.moveTo(backCornerX, backBotY);
  ctx.lineTo(fxPt, fyPt);

  const rxPt = cornerX + (rightEdgeX - cornerX) * fx;
  const ryPt = botCornerY + (rightBotY - botCornerY) * fx;
  ctx.moveTo(backCornerX, backBotY);
  ctx.lineTo(rxPt, ryPt);
}
ctx.stroke();

// 6. THE PROTRUDING 3D HERO OBJECT (FORCED PERSPECTIVE ANAMORPHIC POP)
// Z position pops outward towards viewer, reacting heavily to audio bass & beat
const popZ = 1.0 + (bass * 0.45 + pulse * 0.25) * protrudeMult;
const heroCenterX = cornerX + Math.sin(t * 0.8) * 20;
const heroCenterY = cy + Math.cos(t * 1.1) * 15 + sh * 0.04 * (1.0 - popZ * 0.3);
const heroBaseRadius = Math.min(sw, sh) * 0.31 * popZ;

// Cast shadow of the protruding object onto the box back and screen bottom rim
ctx.save();
ctx.beginPath();
const shadowY = botCornerY + 12 * popZ;
const shadowRx = heroBaseRadius * 1.05;
const shadowRy = heroBaseRadius * 0.32;
ctx.ellipse(heroCenterX, shadowY, shadowRx, shadowRy, 0, 0, Math.PI * 2);
ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
ctx.filter = 'blur(16px)';
ctx.fill();
ctx.restore();

// Render Specific Hero Subject
if (subject === 'Chrome Hyper-Sphere' || subject === 'Liquid Mercury Bloom') {
  const isMercury = subject === 'Liquid Mercury Bloom';
  const deform = isMercury ? (0.12 + bass * 0.18) : (0.02 + bass * 0.05);

  // Base reflective sphere
  ctx.save();
  ctx.beginPath();
  const numPts = 64;
  for (let i = 0; i <= numPts; i++) {
    const a = (i / numPts) * Math.PI * 2;
    const waveR = heroBaseRadius * (1.0 + Math.sin(a * 4 + t * 2.5) * deform + Math.cos(a * 7 - t * 1.8) * (deform * 0.5));
    const px = heroCenterX + Math.cos(a) * waveR;
    const py = heroCenterY + Math.sin(a) * waveR;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // Glossy high-contrast chrome gradient (anamorphic horizon reflection)
  const chromeGrad = ctx.createLinearGradient(
    heroCenterX - heroBaseRadius * 0.6,
    heroCenterY - heroBaseRadius * 0.8,
    heroCenterX + heroBaseRadius * 0.6,
    heroCenterY + heroBaseRadius * 0.9
  );
  chromeGrad.addColorStop(0.00, pal.accent);
  chromeGrad.addColorStop(0.25, pal.pri);
  chromeGrad.addColorStop(0.48, '#0b1320');
  chromeGrad.addColorStop(0.50, '#ffffff'); // Sharp horizon line
  chromeGrad.addColorStop(0.54, '#1b2234');
  chromeGrad.addColorStop(0.75, pal.sec);
  chromeGrad.addColorStop(1.00, '#04060a');
  ctx.fillStyle = chromeGrad;
  ctx.fill();

  // Inner iridescent rim light
  ctx.lineWidth = 4 + treble * 6;
  ctx.strokeStyle = pal.pri;
  ctx.globalCompositeOperation = 'screen';
  ctx.stroke();

  // Specular hot spot exploding out of frame (breaks boundary)
  const specGrad = ctx.createRadialGradient(
    heroCenterX - heroBaseRadius * 0.35,
    heroCenterY - heroBaseRadius * 0.38,
    4,
    heroCenterX - heroBaseRadius * 0.35,
    heroCenterY - heroBaseRadius * 0.38,
    heroBaseRadius * 0.6
  );
  specGrad.addColorStop(0, '#ffffff');
  specGrad.addColorStop(0.2, pal.accent);
  specGrad.addColorStop(0.6, 'rgba(255,255,255,0)');
  ctx.fillStyle = specGrad;
  ctx.beginPath();
  ctx.arc(heroCenterX - heroBaseRadius * 0.35, heroCenterY - heroBaseRadius * 0.38, heroBaseRadius * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Orbiting rings that physically punch through the screen's front plane
  const ringCount = isMercury ? 5 : 3;
  for (let r = 0; r < ringCount; r++) {
    ctx.save();
    ctx.translate(heroCenterX, heroCenterY);
    ctx.rotate((t * 0.4 * (r % 2 === 0 ? 1 : -1)) + r * 1.1);
    const rx = heroBaseRadius * (1.35 + r * 0.22);
    const ry = heroBaseRadius * (0.38 + r * 0.08);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.lineWidth = 3 + (r === 0 ? treble * 4 : 0);
    ctx.strokeStyle = (r % 2 === 0) ? pal.pri : pal.sec;
    ctx.shadowColor = pal.pri;
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.restore();
  }

} else if (subject === 'Tidal Wave Surge') {
  // Massive curling water crest bursting toward camera
  const waveLayers = 6;
  for (let l = 0; l < waveLayers; l++) {
    ctx.save();
    const layerZ = (l + 1) / waveLayers;
    const lyrRadius = heroBaseRadius * (0.6 + layerZ * 0.65);
    const waveY = heroCenterY + (waveLayers - l) * 14;
    const waveX = heroCenterX + Math.sin(t * 1.2 + l) * 25;

    ctx.beginPath();
    ctx.moveTo(leftEdgeX, leftBotY);
    const crestSteps = 30;
    for (let s = 0; s <= crestSteps; s++) {
      const prog = s / crestSteps;
      const sx = leftEdgeX + (rightEdgeX - leftEdgeX) * prog;
      const surge = Math.sin(prog * Math.PI) * lyrRadius * (1.1 + bass * 0.4);
      const sy = waveY - surge + Math.sin(prog * 12 + t * 4 + l) * (8 + bass * 12);
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo(rightEdgeX, rightBotY);
    ctx.lineTo(cornerX, botCornerY + 30 * protrudeMult);
    ctx.closePath();

    const waveGrad = ctx.createLinearGradient(waveX, waveY - lyrRadius, waveX, waveY + lyrRadius * 0.5);
    if (l === waveLayers - 1) {
      // Top crest foam layer
      waveGrad.addColorStop(0, '#ffffff');
      waveGrad.addColorStop(0.3, pal.pri);
      waveGrad.addColorStop(1, 'rgba(0, 30, 60, 0.85)');
    } else {
      waveGrad.addColorStop(0, pal.pri);
      waveGrad.addColorStop(0.5, pal.sec);
      waveGrad.addColorStop(1, '#030812');
    }
    ctx.fillStyle = waveGrad;
    ctx.globalAlpha = 0.85;
    ctx.fill();

    // High-speed foam spray droplets popping beyond screen edge
    ctx.fillStyle = '#ffffff';
    for (let d = 0; d < 8; d++) {
      const dx = waveX + (Math.sin(l * 11 + d * 7 + t * 5) * lyrRadius * 0.9);
      const dy = waveY - lyrRadius * 0.8 - ((t * 90 + d * 35) % 80) + Math.cos(d * 4) * 20;
      ctx.beginPath();
      ctx.arc(dx, dy, 2 + Math.random() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
} else {
  // Neon Singularity: Geometric nested cyber crystal / tesseract popping out
  const polySides = 8;
  const layers = 5;
  for (let l = layers; l >= 1; l--) {
    const rScale = heroBaseRadius * (l / layers) * (1.1 + (layers - l) * 0.12);
    const rot = t * (0.5 + l * 0.15) * (l % 2 === 0 ? 1 : -1);
    ctx.save();
    ctx.translate(heroCenterX, heroCenterY);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i <= polySides; i++) {
      const a = (i / polySides) * Math.PI * 2;
      const px = Math.cos(a) * rScale;
      const py = Math.sin(a) * rScale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.lineWidth = 3 + l + treble * 4;
    ctx.strokeStyle = (l === layers) ? pal.accent : (l % 2 === 0 ? pal.pri : pal.sec);
    ctx.shadowColor = pal.pri;
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.fillStyle = `rgba(5, 10, 20, ${0.35 + l * 0.1})`;
    ctx.fill();
    ctx.restore();
  }
}

// 7. BILLBOARD HARD BEZEL & CORNER SEAM (Crucial for the 3D optical illusion)
// The corner seam and outer bevel define the display boundary that the object seems to spill over
ctx.save();
ctx.strokeStyle = '#222d42';
ctx.lineWidth = 6;
ctx.beginPath();
// Left top & bottom rim
ctx.moveTo(leftEdgeX, leftTopY);
if (cornerStyle === 'Rounded Fillet') {
  ctx.arcTo(cornerX, topCornerY, rightEdgeX, rightTopY, 32);
} else {
  ctx.lineTo(cornerX, topCornerY);
}
ctx.lineTo(rightEdgeX, rightTopY);
ctx.stroke();

// Bottom rim
ctx.beginPath();
ctx.moveTo(leftEdgeX, leftBotY);
if (cornerStyle === 'Rounded Fillet') {
  ctx.arcTo(cornerX, botCornerY, rightEdgeX, rightBotY, 32);
} else {
  ctx.lineTo(cornerX, botCornerY);
}
ctx.lineTo(rightEdgeX, rightBotY);
ctx.stroke();

// Center Corner Mullion Seam (subtle LED panel seam)
ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.moveTo(cornerX, topCornerY);
ctx.lineTo(cornerX, botCornerY);
ctx.stroke();
ctx.restore();

// 8. OPTIONAL LED MATRIX PIXEL SUB-GRID OVERLAY
if (showLedGrid) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.lineWidth = 1;
  // Fast scanline pass bounded to screen height
  ctx.beginPath();
  const scanStep = 4;
  for (let y = Math.floor(topCornerY); y < botCornerY + 30; y += scanStep) {
    ctx.moveTo(leftEdgeX, y);
    ctx.lineTo(rightEdgeX, y);
  }
  ctx.stroke();
  ctx.restore();
}

// 9. FORCED-PERSPECTIVE ILLUSION GLOW OVERHANG
// Flare & Volumetric light bleeding into the dark room in front of the screen
ctx.save();
ctx.globalCompositeOperation = 'screen';
const flareGrad = ctx.createRadialGradient(
  heroCenterX,
  heroCenterY,
  heroBaseRadius * 0.2,
  heroCenterX,
  heroCenterY,
  heroBaseRadius * 1.5
);
flareGrad.addColorStop(0, pal.glow);
flareGrad.addColorStop(0.5, 'rgba(0, 240, 255, 0.08)');
flareGrad.addColorStop(1, 'transparent');
ctx.fillStyle = flareGrad;
ctx.beginPath();
ctx.arc(heroCenterX, heroCenterY, heroBaseRadius * 1.5, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// Outer Corner Billboard Header Branding Bar
ctx.save();
ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
ctx.font = 'bold 11px monospace';
ctx.fillText('SHINJUKU VISION // 8K 120Hz ANAMORPHIC', leftEdgeX + 16, leftTopY - 18);
ctx.fillStyle = pal.pri;
ctx.fillText(`AUDIO_SYNC: ${(bass * 100).toFixed(0)}%`, rightEdgeX - 160, rightTopY - 18);
ctx.restore();

ctx.restore();