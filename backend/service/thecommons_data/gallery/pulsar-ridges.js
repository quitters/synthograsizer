const count = getVar('line_count') ?? 50;
const maxPeak = getVar('peak_height') ?? 90;
const speed = getVar('drift_speed') ?? 0.6;
const harmonics = getVar('roughness') ?? 3;
const styleKey = getVar('signal_style') || 'pulsar';
const palKey = getVar('palette') || 'stark_white';

const LUT_SIZE = 2048;
if (!room.state.lut) {
  room.state.lut = new Float32Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) {
    const a = (i / LUT_SIZE) * Math.PI * 2;
    room.state.lut[i] = Math.sin(a) + 0.45 * Math.sin(a * 2.71 + 1.2) + 0.25 * Math.cos(a * 5.17 + 0.8);
  }
  room.state.smoothBass = 0;
  room.state.phase = 0;
}

const bassTarget = audio ? (audio.bass * 1.6 + (audio.beat ? 0.6 : 0)) : 0;
room.state.smoothBass += (bassTarget - room.state.smoothBass) * Math.min(1, frame.dt * 12);
room.state.phase += frame.dt * speed * (0.8 + room.state.smoothBass * 0.5);

const lut = room.state.lut;
const w = frame.width;
const h = frame.height;
const SAMPLES = 128;

ctx.save();
ctx.fillStyle = '#060608';
ctx.fillRect(0, 0, w, h);

const palettes = {
  stark_white: { stroke: 'rgba(240,242,245,0.92)', glow: 'rgba(255,255,255,0.18)', bg: '#060608' },
  cyan_glow:   { stroke: 'rgba(90,225,255,0.95)',  glow: 'rgba(0,180,255,0.28)',  bg: '#04090e' },
  amber_phosphor: { stroke: 'rgba(255,185,60,0.95)', glow: 'rgba(255,130,10,0.25)', bg: '#0b0804' },
  aurora:      { stroke: 'rgba(110,255,190,0.95)', glow: 'rgba(160,80,255,0.26)', bg: '#060809' }
};
const pal = palettes[palKey] || palettes.stark_white;

const tableX = new Float32Array(SAMPLES);
const tableY = new Float32Array(SAMPLES);

const marginX = w * 0.16;
const plotWidth = w - marginX * 2;
const topY = h * 0.14;
const bottomY = h * 0.88;
const rowSpacing = (bottomY - topY) / (count - 1);

const phase = room.state.phase;
const bassBoost = room.state.smoothBass;

for (let i = 0; i < count; i++) {
  const rowNorm = i / (count - 1);
  const baseY = topY + i * rowSpacing;
  const rowSeed = i * 19.371 + phase * 0.65;

  for (let j = 0; j < SAMPLES; j++) {
    const u = j / (SAMPLES - 1);
    tableX[j] = marginX + u * plotWidth;

    const centerDist = Math.abs(u - 0.5);
    const env = Math.exp(-centerDist * centerDist * 38.0);
    const subEnv = Math.exp(-Math.pow(u - 0.44 - Math.sin(rowSeed * 0.3) * 0.08, 2) * 55.0);

    let val = 0;
    let freq = (styleKey === 'crystalline' ? 6.0 : 4.0);
    let amp = 1.0;
    for (let k = 0; k < harmonics; k++) {
      const idx = Math.floor((u * freq * 180 + rowSeed * 42 + k * 311) % LUT_SIZE + LUT_SIZE) % LUT_SIZE;
      val += lut[idx] * amp;
      freq *= 2.13;
      amp *= 0.52;
    }

    if (styleKey === 'turbulent') {
      const sharpIdx = Math.floor((u * 400 + rowSeed * 120) % LUT_SIZE + LUT_SIZE) % LUT_SIZE;
      val = Math.abs(val) + Math.max(0, lut[sharpIdx]) * 0.8;
    } else if (styleKey === 'synthwave') {
      val = Math.sin(u * 32.0 + rowSeed) * 0.8 + Math.sin(u * 8.0 - rowSeed * 0.5) * 1.2;
    }

    const pulse = Math.max(0, val) * env + Math.max(0, -val) * subEnv * 0.45;
    const dynScale = maxPeak * (0.35 + bassBoost * 0.95);
    tableY[j] = baseY - pulse * dynScale;
  }

  ctx.beginPath();
  ctx.moveTo(tableX[0], baseY + rowSpacing * 1.5);
  ctx.lineTo(tableX[0], tableY[0]);
  for (let j = 1; j < SAMPLES; j++) {
    ctx.lineTo(tableX[j], tableY[j]);
  }
  ctx.lineTo(tableX[SAMPLES - 1], baseY + rowSpacing * 1.5);
  ctx.closePath();
  ctx.fillStyle = pal.bg;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(tableX[0], tableY[0]);
  for (let j = 1; j < SAMPLES; j++) {
    ctx.lineTo(tableX[j], tableY[j]);
  }
  ctx.strokeStyle = pal.stroke;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  if (bassBoost > 0.4 && (i % 6 === 0)) {
    ctx.strokeStyle = pal.glow;
    ctx.lineWidth = 4.0;
    ctx.stroke();
  }
}

if (room.people && room.people.length > 0) {
  for (let p = 0; p < room.people.length; p++) {
    const person = room.people[p];
    const px = marginX + ((p + 0.5) / room.people.length) * plotWidth;
    ctx.fillStyle = 'hsla(' + (person.hue || 0) + ', 85%, 65%, 0.7)';
    ctx.beginPath();
    ctx.arc(px, bottomY + 22, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();