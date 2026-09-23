ctx.save();

const ringCount = Math.floor(getVar('ring_count') ?? 40);
const dotsPerRing = Math.floor(getVar('dots_per_ring') ?? 24);
const speedMul = getVar('tunnel_speed') ?? 1.2;
const bendMul = getVar('snake_bend') ?? 1.0;
const paletteChoice = getVar('palette') ?? 'synthwave';
const dotStyle = getVar('dot_style') ?? 'discs';

const LUT_SIZE = 512;
if (!room.state.lutCos) {
  room.state.lutCos = new Float32Array(LUT_SIZE);
  room.state.lutSin = new Float32Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) {
    const a = (i / LUT_SIZE) * Math.PI * 2;
    room.state.lutCos[i] = Math.cos(a);
    room.state.lutSin[i] = Math.sin(a);
  }
  room.state.dist = 0;
}

const cosTable = room.state.lutCos;
const sinTable = room.state.lutSin;
const lutMask = LUT_SIZE - 1;

const bass = audio?.bass ?? 0;
const treble = audio?.treble ?? 0;
const mid = audio?.mid ?? 0;
const beatKick = (audio?.beat ? 0.35 : 0) + bass * 0.45;

const dt = Math.min(frame.dt || 0.016, 0.05);
room.state.dist = (room.state.dist + dt * speedMul * (0.8 + beatKick * 0.9)) % 1000;
const dist = room.state.dist;

const w = frame.width;
const h = frame.height;
const cx = w * 0.5;
const cy = h * 0.5;
const fov = Math.min(w, h) * 0.85;

ctx.fillStyle = '#03050a';
ctx.fillRect(0, 0, w, h);

const palettes = {
  synthwave: { hStart: 280, hSpan: 90, sat: 95, lightBase: 45 },
  neon_cyan: { hStart: 170, hSpan: 50, sat: 100, lightBase: 50 },
  solar_fire: { hStart: 12, hSpan: 48, sat: 100, lightBase: 50 },
  emerald_matrix: { hStart: 110, hSpan: 50, sat: 90, lightBase: 45 },
  monochrome: { hStart: 210, hSpan: 0, sat: 0, lightBase: 65 }
};
const pal = palettes[paletteChoice] ?? palettes.synthwave;

const people = room.people || [];
const hasPeople = people.length > 0;

ctx.globalCompositeOperation = 'lighter';

const zMin = 0.35;
const zMax = 8.5;
const zRange = zMax - zMin;

for (let i = ringCount - 1; i >= 0; i--) {
  const ringProgress = (i / ringCount + (dist * 0.35)) % 1.0;
  const d = 1.0 - ringProgress;
  const z = zMin + d * d * zRange;
  
  if (z <= 0.28) continue;
  const invZ = 1.0 / z;
  const scale = fov * invZ;
  const proximity = 1.0 - (z - zMin) / zRange;
  
  const pathT = frame.t * 0.9 + z * 0.65;
  const sxOffset = (Math.sin(pathT * 0.6) + Math.sin(pathT * 1.25) * 0.5) * 160 * bendMul;
  const syOffset = (Math.cos(pathT * 0.5) + Math.sin(pathT * 0.95) * 0.45) * 110 * bendMul;
  
  const ringCenterX = cx + sxOffset * invZ * (fov * 0.0035);
  const ringCenterY = cy + syOffset * invZ * (fov * 0.0035);
  
  const baseRadius = (160 + 25 * Math.sin(frame.t * 1.8 + z * 0.8)) * (1.0 + bass * 0.3);
  const ringRadius = baseRadius * invZ;
  
  let hue = (pal.hStart + proximity * pal.hSpan + frame.t * 15) % 360;
  if (hasPeople && (i % 5 === 0)) {
    const person = people[(i + Math.floor(frame.t)) % people.length];
    hue = person.hue;
  }
  
  const lightness = Math.min(96, pal.lightBase + proximity * 42 + beatKick * 18);
  const alpha = Math.min(1.0, Math.max(0.04, proximity * 1.15));
  const dotRad = Math.max(1.1, (2.2 + proximity * 6.5 + treble * 2.0) * (scale * 0.0032));
  
  const strokeCol = 'hsla(' + (hue | 0) + ',' + pal.sat + '%,' + (lightness | 0) + '%,' + alpha.toFixed(3) + ')';
  
  const twistPhase = frame.t * 0.4 + z * 1.1 + (mid * 0.4);
  const twistIdx = ((twistPhase / (Math.PI * 2)) * LUT_SIZE) & lutMask;
  
  ctx.beginPath();
  
  if (dotStyle === 'sparks') {
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = Math.max(1.0, dotRad * 0.55);
    for (let j = 0; j < dotsPerRing; j++) {
      const step = ((j * LUT_SIZE / dotsPerRing) + twistIdx) & lutMask;
      const px = ringCenterX + ringRadius * cosTable[step];
      const py = ringCenterY + ringRadius * sinTable[step];
      ctx.moveTo(px - dotRad, py);
      ctx.lineTo(px + dotRad, py);
      ctx.moveTo(px, py - dotRad);
      ctx.lineTo(px, py + dotRad);
    }
    ctx.stroke();
  } else if (dotStyle === 'diamonds') {
    ctx.fillStyle = strokeCol;
    for (let j = 0; j < dotsPerRing; j++) {
      const step = ((j * LUT_SIZE / dotsPerRing) + twistIdx) & lutMask;
      const px = ringCenterX + ringRadius * cosTable[step];
      const py = ringCenterY + ringRadius * sinTable[step];
      ctx.moveTo(px, py - dotRad * 1.3);
      ctx.lineTo(px + dotRad * 1.1, py);
      ctx.lineTo(px, py + dotRad * 1.3);
      ctx.lineTo(px - dotRad * 1.1, py);
      ctx.closePath();
    }
    ctx.fill();
  } else {
    ctx.fillStyle = strokeCol;
    for (let j = 0; j < dotsPerRing; j++) {
      const step = ((j * LUT_SIZE / dotsPerRing) + twistIdx) & lutMask;
      const px = ringCenterX + ringRadius * cosTable[step];
      const py = ringCenterY + ringRadius * sinTable[step];
      ctx.moveTo(px + dotRad, py);
      ctx.arc(px, py, dotRad, 0, 6.2831853);
    }
    ctx.fill();
  }
}

ctx.restore();