const W = frame.width;
const H = frame.height;
const t = frame.t;
const bass = audio.bass || 0;
const beat = audio.beat ? 1 : 0;

// Init persistent demoscene buffers & state
if (!room.state.init) {
  room.state.init = true;
  // Fixed starfield (x, y normalized, size, seed)
  room.state.stars = [];
  for (let i = 0; i < 140; i++) {
    room.state.stars.push({
      x: Math.random(),
      y: Math.random() * 0.52,
      s: 0.6 + Math.random() * 1.8,
      p: Math.random() * Math.PI * 2
    });
  }
  // 1D height lookup table for mountains (64 samples)
  room.state.mountainLut = [];
  let v = 0;
  for (let i = 0; i < 64; i++) {
    v = 0.5 * Math.sin(i * 0.23) + 0.3 * Math.cos(i * 0.58) + 0.2 * Math.sin(i * 1.15);
    room.state.mountainLut.push(Math.abs(v));
  }
  room.state.gridOffset = 0;
  room.state.beatPulse = 0;
}

// Parameters
const speed = getVar('speed') ?? 1.2;
const mtScale = getVar('mountain_height') ?? 1.0;
const themeName = getVar('theme') ?? 'outrun';
const sunStyle = getVar('sun_style') ?? 'sliced';
const curvature = getVar('curvature') ?? 'straight';

// Color palettes [skyTop, skyHorizon, sunTop, sunBot, gridNeon, mtNeon]
const PALETTES = {
  outrun:     ['#0d0221', '#26083b', '#ff007f', '#ffe600', '#ff00aa', '#00f0ff'],
  miami:      ['#031826', '#143642', '#ff598f', '#fd8a5e', '#00e5ff', '#ff00a0'],
  cyberpunk:  ['#050814', '#101c3d', '#ffe600', '#00ffcc', '#00ffcc', '#ff0055'],
  solar_void: ['#000000', '#1c0700', '#ff3300', '#ffaa00', '#ff5500', '#7722ff']
};
const pal = PALETTES[themeName] ?? PALETTES.outrun;

// Beat decay
room.state.beatPulse = Math.max(room.state.beatPulse * 0.88, beat ? 1.0 : 0);
const bounce = bass * 14 * (1 + room.state.beatPulse * 0.5);
const horizonY = Math.floor(H * 0.52) - bounce * 0.3;

ctx.save();

// 1. SKY GRADIENT
const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
skyGrad.addColorStop(0, pal[0]);
skyGrad.addColorStop(1, pal[1]);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, horizonY + 2);

// 2. STARS
const stars = room.state.stars;
for (let i = 0; i < stars.length; i++) {
  const s = stars[i];
  const twinkle = 0.4 + 0.6 * Math.sin(t * 2.5 + s.p);
  ctx.fillStyle = `rgba(255, 255, 255, ${twinkle * 0.85})`;
  ctx.fillRect(s.x * W, s.y * horizonY, s.s, s.s);
}

// 3. SETTING SUN
const sunR = Math.min(W, H) * 0.22;
const sunCX = W * 0.5;
const sunCY = horizonY - sunR * 0.18;

ctx.save();
// Base sun glow
const sunGrad = ctx.createLinearGradient(sunCX, sunCY - sunR, sunCX, sunCY + sunR);
sunGrad.addColorStop(0, pal[2]);
sunGrad.addColorStop(1, pal[3]);

// Draw sun disk with stripes
ctx.beginPath();
ctx.arc(sunCX, sunCY, sunR, Math.PI, 0, false);
ctx.lineTo(sunCX + sunR, horizonY);
ctx.lineTo(sunCX - sunR, horizonY);
ctx.closePath();
ctx.fillStyle = sunGrad;
ctx.shadowColor = pal[2];
ctx.shadowBlur = 30 + bass * 35;
ctx.fill();
ctx.shadowBlur = 0;

// Sun horizontal blind cuts (classic 80s)
const numStripes = sunStyle === 'fine_stripes' ? 14 : (sunStyle === 'segmented' ? 7 : 10);
for (let i = 0; i < numStripes; i++) {
  const frac = i / numStripes;
  const sy = horizonY - Math.pow(frac, 1.4) * (sunR * 1.05);
  const cutH = (1 - frac) * (sunR * 0.045) + 1.5;
  ctx.fillStyle = pal[1];
  ctx.fillRect(sunCX - sunR - 10, sy - cutH, (sunR + 10) * 2, cutH);
}
ctx.restore();

// 4. WIREFRAME MOUNTAINS (Left and Right Flanks)
const mtLut = room.state.mountainLut;
const lutLen = mtLut.length;
const peakH = H * 0.24 * mtScale;

ctx.strokeStyle = pal[5];
ctx.lineWidth = 1.6;
ctx.shadowColor = pal[5];
ctx.shadowBlur = 8 + bass * 12;

// Left Mountain range
ctx.beginPath();
for (let i = 0; i < 28; i++) {
  const u = i / 27;
  const px = u * (W * 0.44);
  const lutIdx = (i + 5) % lutLen;
  const hVal = mtLut[lutIdx] * (1 - u * 0.85);
  const py = horizonY - hVal * peakH;
  if (i === 0) ctx.moveTo(px, horizonY);
  else ctx.lineTo(px, py);
}
ctx.lineTo(W * 0.44, horizonY);
ctx.fillStyle = 'rgba(10, 2, 22, 0.9)';
ctx.fill();
ctx.stroke();

// Right Mountain range
ctx.beginPath();
for (let i = 0; i < 28; i++) {
  const u = i / 27;
  const px = W - u * (W * 0.44);
  const lutIdx = (i + 19) % lutLen;
  const hVal = mtLut[lutIdx] * (1 - u * 0.85);
  const py = horizonY - hVal * peakH;
  if (i === 0) ctx.moveTo(px, horizonY);
  else ctx.lineTo(px, py);
}
ctx.lineTo(W * 0.56, horizonY);
ctx.fillStyle = 'rgba(10, 2, 22, 0.9)';
ctx.fill();
ctx.stroke();
ctx.shadowBlur = 0;

// 5. GROUND GRID (Continuous rushing motion)
room.state.gridOffset = (room.state.gridOffset + frame.dt * speed * 1.8) % 1.0;
const gridZOffset = room.state.gridOffset;

// Floor dark backdrop
const floorGrad = ctx.createLinearGradient(0, horizonY, 0, H);
floorGrad.addColorStop(0, '#0a0014');
floorGrad.addColorStop(1, '#020005');
ctx.fillStyle = floorGrad;
ctx.fillRect(0, horizonY, W, H - horizonY);

// Transverse (horizontal) grid lines
const numHLines = 22;
const gridPulse = room.state.beatPulse * 0.4;
ctx.strokeStyle = pal[4];

for (let i = 1; i <= numHLines; i++) {
  const normZ = (i - gridZOffset) / numHLines;
  if (normZ <= 0.01) continue;
  // Hyperbolic projection: mapping 0..1 to horizon..bottom
  const pZ = Math.pow(normZ, 2.8);
  const lineY = horizonY + pZ * (H - horizonY);
  
  const alpha = Math.min(1.0, normZ * 1.4) * (0.6 + gridPulse);
  ctx.lineWidth = 1.0 + normZ * 2.2;
  ctx.strokeStyle = pal[4];
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  ctx.beginPath();
  if (curvature === 'warp') {
    const curveDip = (1 - normZ) * 45 * Math.sin(t * 2);
    ctx.moveTo(0, lineY);
    ctx.quadraticCurveTo(W * 0.5, lineY + curveDip, W, lineY);
  } else if (curvature === 'valley') {
    const valleyDip = Math.sin(normZ * Math.PI) * 28;
    ctx.moveTo(0, lineY - valleyDip);
    ctx.quadraticCurveTo(W * 0.5, lineY + valleyDip, W, lineY - valleyDip);
  } else {
    ctx.moveTo(0, lineY);
    ctx.lineTo(W, lineY);
  }
  ctx.stroke();
}

// Perspective (longitudinal) grid lines radiating from center horizon
const numLongLines = 26;
const centerX = W * 0.5;
ctx.lineWidth = 1.4;
for (let j = 0; j <= numLongLines; j++) {
  const u = j / numLongLines;
  const spreadBottom = (u - 0.5) * (W * 2.6);
  const bottomX = centerX + spreadBottom;
  
  // Line intensity stronger towards center road
  const distFromCenter = Math.abs(u - 0.5) * 2;
  const roadGlow = 1.0 - distFromCenter * 0.5;
  ctx.globalAlpha = (0.35 + roadGlow * 0.45 + gridPulse * 0.3);
  
  ctx.beginPath();
  ctx.moveTo(centerX + (u - 0.5) * 20, horizonY);
  if (curvature === 'warp') {
    const curveBend = (u - 0.5) * 120 * Math.sin(t * 1.5);
    ctx.quadraticCurveTo(centerX + spreadBottom * 0.4 + curveBend, horizonY + (H - horizonY) * 0.5, bottomX, H);
  } else {
    ctx.lineTo(bottomX, H);
  }
  ctx.stroke();
}

// 6. CONNECTED AUDIENCE RETRO VEHICLES ON THE HORIZON HIGHWAY
const people = room.people || [];
if (people.length > 0) {
  for (let idx = 0; idx < Math.min(people.length, 12); idx++) {
    const p = people[idx];
    const laneU = ((idx + 0.5) / Math.min(people.length, 12) - 0.5) * 0.65;
    const dist = 0.25 + ((idx * 0.17 + t * 0.15 * speed) % 0.7);
    const carY = horizonY + Math.pow(dist, 2.6) * (H - horizonY);
    const carX = centerX + laneU * (W * 1.8) * dist;
    const carW = 10 + dist * 32;
    const carH = carW * 0.38;
    
    ctx.globalAlpha = 0.85;
    // Taillights glowing
    const tailHue = p.hue !== undefined ? p.hue : (idx * 45) % 360;
    ctx.fillStyle = `hsl(${tailHue}, 100%, 55%)`;
    ctx.shadowColor = `hsl(${tailHue}, 100%, 55%)`;
    ctx.shadowBlur = 12;
    ctx.fillRect(carX - carW * 0.45, carY - carH * 0.5, carW * 0.28, carH * 0.4);
    ctx.fillRect(carX + carW * 0.17, carY - carH * 0.5, carW * 0.28, carH * 0.4);
    ctx.shadowBlur = 0;
  }
}

ctx.restore();