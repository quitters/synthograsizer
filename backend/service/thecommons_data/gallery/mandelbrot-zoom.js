ctx.save();

const BW = 240;
const BH = 135;

room.state.offscreen ??= new OffscreenCanvas(BW, BH);
room.state.offCtx ??= room.state.offscreen.getContext('2d');
room.state.imgData ??= room.state.offCtx.createImageData(BW, BH);
room.state.buf32 ??= new Uint32Array(room.state.imgData.data.buffer);
room.state.lut ??= new Uint32Array(1024);
room.state.palShift ??= 0;
room.state.zoomPhase ??= 0;
room.state.lastPal ??= '';

const paletteKey = getVar('palette_mode') ?? 'electric_neon';
const zoomSpeed = getVar('zoom_speed') ?? 1.0;
const maxIter = Math.floor(getVar('iteration_depth') ?? 64);
const reactKey = getVar('audio_reactivity') ?? 'harmonic';

const reactMultipliers = { harmonic: 0.6, surge: 1.2, strobe: 2.0 };
const reactMul = reactMultipliers[reactKey] ?? 0.6;

const cosinePalettes = {
  electric_neon: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.33, 0.67]
  },
  cyber_amber: {
    a: [0.55, 0.32, 0.12],
    b: [0.45, 0.35, 0.15],
    c: [1.0, 0.8, 0.4],
    d: [0.05, 0.15, 0.25]
  },
  deep_void: {
    a: [0.35, 0.2, 0.45],
    b: [0.4, 0.4, 0.55],
    c: [1.0, 0.7, 0.4],
    d: [0.1, 0.3, 0.6]
  },
  acid_matrix: {
    a: [0.15, 0.45, 0.2],
    b: [0.2, 0.5, 0.35],
    c: [1.0, 1.0, 0.6],
    d: [0.35, 0.55, 0.8]
  }
};

const pal = cosinePalettes[paletteKey] ?? cosinePalettes.electric_neon;
const lut = room.state.lut;
const TAU = Math.PI * 2;

for (let i = 0; i < 1024; i++) {
  const t = i / 1024;
  const r = Math.floor(Math.max(0, Math.min(255, (pal.a[0] + pal.b[0] * Math.cos(TAU * (pal.c[0] * t + pal.d[0]))) * 255)));
  const g = Math.floor(Math.max(0, Math.min(255, (pal.a[1] + pal.b[1] * Math.cos(TAU * (pal.c[1] * t + pal.d[1]))) * 255)));
  const b = Math.floor(Math.max(0, Math.min(255, (pal.a[2] + pal.b[2] * Math.cos(TAU * (pal.c[2] * t + pal.d[2]))) * 255)));
  lut[i] = (255 << 24) | (b << 16) | (g << 8) | r;
}

const bassBoost = audio.bass * reactMul;
const speedFactor = zoomSpeed * (1 + bassBoost * 0.4);
room.state.zoomPhase += frame.dt * speedFactor * 0.35;
const cycleLen = 14;
const cycleT = room.state.zoomPhase % cycleLen;

room.state.palShift = (room.state.palShift + frame.dt * 70 * zoomSpeed + (audio.level + bassBoost) * 160) % 1024;
const palShift = Math.floor(room.state.palShift);

const baseScale = 2.4;
let scale = baseScale * Math.pow(0.5, cycleT);
if (audio.beat) scale *= (1 - 0.04 * reactMul);

const targetX = -0.7436438870371587;
const targetY = 0.1318259042053120;
const sway = Math.sin(frame.t * 0.2) * (scale * 0.02);
const cx = targetX + sway;
const cy = targetY + Math.cos(frame.t * 0.17) * (scale * 0.02);

const buf32 = room.state.buf32;
const dx = scale / BH;
const dy = scale / BH;
const minX = cx - (BW * 0.5) * dx;
const minY = cy - (BH * 0.5) * dy;

let idx = 0;
for (let y = 0; y < BH; y++) {
  const c_im = minY + y * dy;
  for (let x = 0; x < BW; x++) {
    const c_re = minX + x * dx;
    let z_re = c_re;
    let z_im = c_im;
    let n = 0;
    let z_re2 = z_re * z_re;
    let z_im2 = z_im * z_im;

    while (z_re2 + z_im2 <= 4.0 && n < maxIter) {
      z_im = 2 * z_re * z_im + c_im;
      z_re = z_re2 - z_im2 + c_re;
      z_re2 = z_re * z_re;
      z_im2 = z_im * z_im;
      n++;
    }

    if (n === maxIter) {
      buf32[idx++] = 0xFF050302;
    } else {
      const mag2 = z_re2 + z_im2;
      const smooth = n + 1 - Math.log(Math.max(1.0001, mag2)) * 0.7213475;
      const lutIdx = ((Math.floor(smooth * 28) + palShift) & 1023);
      buf32[idx++] = lut[lutIdx];
    }
  }
}

room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'medium';
ctx.drawImage(room.state.offscreen, 0, 0, frame.width, frame.height);

const flashAlpha = Math.max(0, Math.min(1, Math.sin((cycleT / cycleLen) * Math.PI * 2) ** 16));
if (flashAlpha > 0.01) {
  ctx.fillStyle = `rgba(255, 255, 255, ${(flashAlpha * 0.45).toFixed(3)})`;
  ctx.fillRect(0, 0, frame.width, frame.height);
}

if (room.people && room.people.length > 0) {
  const count = Math.min(room.people.length, 24);
  const midX = frame.width * 0.5;
  const midY = frame.height * 0.5;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < count; i++) {
    const p = room.people[i];
    const ang = (i / count) * TAU + frame.t * 0.25;
    const dist = 120 + Math.sin(frame.t * 0.8 + i) * 35 + bassBoost * 45;
    const px = midX + Math.cos(ang) * dist;
    const py = midY + Math.sin(ang) * dist * 0.7;
    ctx.strokeStyle = `hsla(${p.hue}, 90%, 65%, 0.7)`;
    ctx.fillStyle = `hsla(${p.hue}, 95%, 75%, 0.9)`;
    ctx.beginPath();
    ctx.arc(px, py, 3 + (audio.beat ? 2 : 0), 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

ctx.font = '10px monospace';
ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
const zoomExp = (cycleT * 1.442).toFixed(1);
ctx.fillText(`SEAHORSE VALLEY // 2^${zoomExp}X`, 24, frame.height - 24);
ctx.fillText(`AUDIO REACT // ${(audio.level * 100).toFixed(0)}%`, frame.width - 160, frame.height - 24);

ctx.restore();