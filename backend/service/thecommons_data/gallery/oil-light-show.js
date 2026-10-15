ctx.save();

const BW = 160;
const BH = 90;

if (!room.state.init) {
  room.state.init = true;
  room.state.offCanvas = new OffscreenCanvas(BW, BH);
  room.state.offCtx = room.state.offCanvas.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(BW, BH);
  room.state.buf = new Uint32Array(room.state.imgData.data.buffer);

  const blobs = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const dist = 20 + (i % 3) * 16;
    blobs.push({
      x: BW * 0.5 + Math.cos(angle) * dist,
      y: BH * 0.5 + Math.sin(angle) * dist,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      baseR: 16 + (i % 4) * 5,
      r2: 400,
      phase: i * 1.37,
      speed: 0.6 + (i % 3) * 0.35,
      hue: (i * 36) % 360,
      r: 255, g: 100, b: 50
    });
  }
  room.state.blobs = blobs;

  const bubbles = [];
  for (let i = 0; i < 45; i++) {
    bubbles.push({
      u: Math.random(),
      v: Math.random(),
      rad: 2.5 + Math.random() * 5.5,
      driftX: (Math.random() - 0.5) * 0.03,
      driftY: -0.015 - Math.random() * 0.04,
      phase: Math.random() * 6.28
    });
  }
  room.state.bubbles = bubbles;
}

const paletteChoice = getVar('palette') ?? 'Fillmore Acid';
const viscosityChoice = getVar('viscosity') ?? 'Warm Liquid';
const fringeDensity = getVar('fringe_density') ?? 3;
const platePressure = getVar('plate_pressure') ?? 1.2;
const showVignette = getVar('projector_vignette') ?? true;
const showBubbles = getVar('bubble_layer') ?? true;

const viscSpeeds = {
  'Slow Viscous': 0.45,
  'Warm Liquid': 1.0,
  'Swirling Rush': 1.85
};
const speedMult = viscSpeeds[viscosityChoice] ?? 1.0;
const dt = Math.min(frame.dt || 0.016, 0.05) * speedMult;

const bass = audio.bass || 0;
const beat = audio.beat ? 1.0 : 0.0;
const treble = audio.treble || 0;
const press = platePressure * (1.0 + bass * 0.65 + beat * 0.3);

const palettes = {
  'Fillmore Acid': [330, 185, 50, 280, 160, 15, 305, 195, 40, 260],
  'Liquid Amber': [38, 14, 52, 355, 25, 48, 8, 30, 4, 340],
  'Solarized Psyche': [150, 220, 315, 90, 180, 260, 340, 130, 205, 80],
  'Ultraviolet Trip': [275, 320, 190, 250, 300, 175, 285, 335, 210, 265]
};
const baseHues = palettes[paletteChoice] ?? palettes['Fillmore Acid'];

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [(r + m) * 255 | 0, (g + m) * 255 | 0, (b + m) * 255 | 0];
}

const blobs = room.state.blobs;
const people = room.people || [];
const nBlobs = blobs.length;
const cx = BW * 0.5;
const cy = BH * 0.5;
const t = frame.t * speedMult;

for (let i = 0; i < nBlobs; i++) {
  const b = blobs[i];
  let hue = baseHues[i % baseHues.length];
  if (people.length > 0 && i < people.length) {
    hue = (hue * 0.4 + people[i].hue * 0.6) % 360;
  }
  const [r, g, bl] = hsl2rgb(hue, 0.95, 0.52);
  b.r = r;
  b.g = g;
  b.b = bl;

  const dynamicRad = b.baseR * Math.sqrt(press) * (1.0 + 0.18 * Math.sin(t * 2.0 + b.phase) + bass * 0.25);
  b.r2 = dynamicRad * dynamicRad;

  const dx = b.x - cx;
  const dy = b.y - cy;
  const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
  const swirl = (0.7 + bass * 1.2) * (i % 2 === 0 ? 1 : -0.75);
  b.vx += (-dy / d) * swirl * dt * 28.0;
  b.vy += (dx / d) * swirl * dt * 28.0;

  b.vx += Math.cos(t * b.speed + b.phase) * 14.0 * dt;
  b.vy += Math.sin(t * b.speed * 0.85 + b.phase) * 14.0 * dt;

  if (d > 38) {
    b.vx -= (dx / d) * (d - 38) * 0.8 * dt;
    b.vy -= (dy / d) * (d - 38) * 0.8 * dt;
  }

  b.vx *= 0.94;
  b.vy *= 0.94;
  b.x += b.vx * dt * 10;
  b.y += b.vy * dt * 10;
}

const buf = room.state.buf;
const threshold = 1.05 / press;
const fringeWave = t * 3.5 + bass * 4.0;
let ptr = 0;

for (let y = 0; y < BH; y++) {
  for (let x = 0; x < BW; x++) {
    let totV = 0.0;
    let accR = 0.0;
    let accG = 0.0;
    let accB = 0.0;

    for (let i = 0; i < nBlobs; i++) {
      const b = blobs[i];
      const dx = x - b.x;
      const dy = y - b.y;
      const d2 = dx * dx + dy * dy + 80.0;
      const v = b.r2 / d2;
      totV += v;
      accR += v * b.r;
      accG += v * b.g;
      accB += v * b.b;
    }

    if (totV < threshold * 0.72) {
      const halo = Math.max(0, totV / threshold);
      const deepR = (halo * accR * 0.04) | 0;
      const deepG = (halo * accG * 0.04) | 0;
      const deepB = (halo * accB * 0.04) | 0;
      buf[ptr++] = 0xFF000000 | (deepB << 16) | (deepG << 8) | deepR;
    } else {
      const invV = 1.0 / totV;
      const normR = accR * invV;
      const normG = accG * invV;
      const normB = accB * invV;

      const excess = totV - threshold;
      const fringe = Math.sin(excess * fringeDensity * 2.2 - fringeWave);
      let lum = 1.0 + 0.38 * fringe;

      if (excess < 0.28) {
        const meniscus = 1.0 - (excess / 0.28);
        lum += meniscus * 1.8;
      }

      let finalR = (normR * lum);
      let finalG = (normG * lum);
      let finalB = (normB * lum);

      if (finalR > 255) finalR = 255;
      if (finalG > 255) finalG = 255;
      if (finalB > 255) finalB = 255;

      buf[ptr++] = 0xFF000000 | (((finalB | 0) & 255) << 16) | (((finalG | 0) & 255) << 8) | ((finalR | 0) & 255);
    }
  }
}

room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.fillStyle = '#020101';
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
ctx.drawImage(room.state.offCanvas, 0, 0, frame.width, frame.height);

if (showBubbles) {
  const bubbles = room.state.bubbles;
  const nb = bubbles.length;
  const shake = treble * 3.5;
  ctx.lineWidth = 1.4;

  for (let i = 0; i < nb; i++) {
    const b = bubbles[i];
    b.u += (b.driftX + Math.sin(t + b.phase) * 0.0006) * speedMult;
    b.v += (b.driftY + Math.cos(t * 0.8 + b.phase) * 0.0004) * speedMult;
    if (b.u < 0.05) b.u += 0.9;
    if (b.u > 0.95) b.u -= 0.9;
    if (b.v < 0.05) b.v += 0.9;
    if (b.v > 0.95) b.v -= 0.9;

    const bx = b.u * frame.width + Math.sin(b.phase + t * 4) * shake;
    const by = b.v * frame.height + Math.cos(b.phase + t * 4) * shake;
    const r = b.rad * (1.0 + bass * 0.4);

    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 4, 2, 0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 250, 220, 0.7)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(bx - r * 0.32, by - r * 0.32, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
  }
}

if (showVignette) {
  const maxDim = Math.max(frame.width, frame.height);
  const minDim = Math.min(frame.width, frame.height);
  const vGrad = ctx.createRadialGradient(
    frame.width * 0.5, frame.height * 0.5, minDim * 0.35,
    frame.width * 0.5, frame.height * 0.5, maxDim * 0.68
  );
  vGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.0)');
  vGrad.addColorStop(0.55, 'rgba(12, 4, 1, 0.25)');
  vGrad.addColorStop(0.85, 'rgba(3, 1, 0, 0.82)');
  vGrad.addColorStop(1.0, 'rgba(0, 0, 0, 1.0)');

  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, frame.width, frame.height);

  ctx.beginPath();
  ctx.arc(frame.width * 0.5, frame.height * 0.5, minDim * 0.47, 0, Math.PI * 2);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(255, 170, 70, 0.18)';
  ctx.stroke();
}

ctx.restore();