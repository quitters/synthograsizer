const clarity = getVar('water_clarity') ?? 'tropical_cyan';
const waveSpeed = getVar('wave_speed') ?? 0.8;
const causticSharpness = getVar('caustic_sharpness') ?? 2.5;
const depthFeel = getVar('depth_feel') ?? 'lap_pool';
const tileScale = getVar('tile_scale') ?? 35;
const wobble = getVar('refraction_wobble') ?? 0.7;
const sunIntensity = getVar('sun_intensity') ?? 1.3;
const showRipples = getVar('swimmer_ripples') ?? true;
const showSparkles = getVar('sparkles') ?? true;
const chromatic = getVar('chromatic_fringe') ?? true;

const palettes = {
  tropical_cyan: {
    bgDeep: '#020b14',
    bgMid: '#06263a',
    bgShallow: '#0b4a6b',
    tileHighlight: '#18648c',
    grout: '#051d2c',
    laneMarker: '#02101a',
    cR: 140, cG: 245, cB: 255
  },
  caribbean_teal: {
    bgDeep: '#010f0f',
    bgMid: '#042826',
    bgShallow: '#0a4f48',
    tileHighlight: '#166e64',
    grout: '#031f1d',
    laneMarker: '#011210',
    cR: 110, cG: 255, cB: 220
  },
  deep_abyss: {
    bgDeep: '#01050f',
    bgMid: '#03122c',
    bgShallow: '#072b61',
    tileHighlight: '#134794',
    grout: '#020d20',
    laneMarker: '#000714',
    cR: 90, cG: 195, cB: 255
  },
  midnight_neon: {
    bgDeep: '#050112',
    bgMid: '#12052b',
    bgShallow: '#260d54',
    tileHighlight: '#4c1ca0',
    grout: '#0a0218',
    laneMarker: '#04010a',
    cR: 180, cG: 140, cB: 255
  }
};
const pal = palettes[clarity] ?? palettes.tropical_cyan;

const depths = {
  shallow_sunlit: { vignOpacity: 0.42, causticScale: 1.25, tileBright: 1.25 },
  lap_pool: { vignOpacity: 0.65, causticScale: 1.0, tileBright: 1.0 },
  deep_end: { vignOpacity: 0.88, causticScale: 0.8, tileBright: 0.72 }
};
const dep = depths[depthFeel] ?? depths.lap_pool;

const s = room.state;
if (!s.lut) {
  s.lutSize = 1024;
  s.lut = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    s.lut[i] = Math.sin((i / 1024) * Math.PI * 2);
  }
  s.cW = 160;
  s.cH = 100;
  s.offCanvas = new OffscreenCanvas(s.cW, s.cH);
  s.offCtx = s.offCanvas.getContext('2d');
  s.imgData = s.offCtx.createImageData(s.cW, s.cH);
  s.motes = [];
  for (let i = 0; i < 85; i++) {
    s.motes.push({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 2.2 + 0.8,
      seed: Math.random() * 100,
      speed: Math.random() * 0.45 + 0.25
    });
  }
  s.pulses = [];
  s.lastBeatTime = 0;
}

const lut = s.lut;
const MASK = 1023;
const FACTOR = 1024 / (Math.PI * 2);
const fsin = (v) => lut[((v * FACTOR) & MASK) | 0];
const fcos = (v) => lut[(((v * FACTOR) + 256) & MASK) | 0];

const bassLvl = audio.bass ?? 0;
const midLvl = audio.mid ?? 0;
const trebLvl = audio.treble ?? 0;
const beat = audio.beat ?? false;

if (beat && (frame.t - s.lastBeatTime > 0.26)) {
  s.lastBeatTime = frame.t;
  s.pulses.push({
    x: frame.width * (0.35 + 0.3 * fsin(frame.t * 1.4)),
    y: frame.height * (0.35 + 0.3 * fcos(frame.t * 1.1)),
    radius: 12,
    maxRadius: Math.max(frame.width, frame.height) * 0.55,
    strength: 1.0
  });
  if (s.pulses.length > 5) s.pulses.shift();
}

for (let i = s.pulses.length - 1; i >= 0; i--) {
  const p = s.pulses[i];
  p.radius += frame.dt * 460;
  p.strength -= frame.dt * 0.72;
  if (p.strength <= 0 || p.radius >= p.maxRadius) {
    s.pulses.splice(i, 1);
  }
}

ctx.save();
const baseGrad = ctx.createRadialGradient(
  frame.width * 0.5, frame.height * 0.45, frame.width * 0.1,
  frame.width * 0.5, frame.height * 0.5, frame.width * 0.75
);
baseGrad.addColorStop(0, pal.bgShallow);
baseGrad.addColorStop(0.55, pal.bgMid);
baseGrad.addColorStop(1, pal.bgDeep);
ctx.fillStyle = baseGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

const tWav = frame.t * waveSpeed;
const wMag = wobble * 14 * (1.0 + bassLvl * 1.5);

const getWobble = (px, py) => {
  const nx = (px / frame.width) * 5.0;
  const ny = (py / frame.height) * 3.5;
  let dx = (fsin(ny * 2.4 + tWav * 0.9) + fcos(nx * 1.7 - tWav * 0.6)) * wMag;
  let dy = (fcos(nx * 2.2 - tWav * 0.8) + fsin(ny * 2.0 + tWav * 0.7)) * wMag;
  for (let i = 0; i < s.pulses.length; i++) {
    const p = s.pulses[i];
    const rx = px - p.x;
    const ry = py - p.y;
    const dist = Math.hypot(rx, ry);
    const diff = dist - p.radius;
    if (Math.abs(diff) < 75) {
      const wave = Math.sin(diff * 0.12) * p.strength * 18;
      const inv = 1 / (dist + 0.001);
      dx += rx * inv * wave;
      dy += ry * inv * wave;
    }
  }
  return { dx, dy };
};

const laneLeft = frame.width * 0.44;
const laneRight = frame.width * 0.56;
ctx.fillStyle = pal.laneMarker;
ctx.globalAlpha = 0.6 * dep.tileBright;
ctx.beginPath();
for (let y = 0; y <= frame.height; y += 35) {
  const { dx, dy } = getWobble(laneLeft, y);
  if (y === 0) ctx.moveTo(laneLeft + dx, y + dy);
  else ctx.lineTo(laneLeft + dx, y + dy);
}
for (let y = frame.height; y >= 0; y -= 35) {
  const { dx, dy } = getWobble(laneRight, y);
  ctx.lineTo(laneRight + dx, y + dy);
}
ctx.closePath();
ctx.fill();
ctx.globalAlpha = 1.0;

const step = tileScale;
ctx.lineWidth = 1.6;
ctx.strokeStyle = pal.grout;
ctx.globalAlpha = 0.8 * dep.tileBright;
ctx.beginPath();
for (let y = 0; y <= frame.height; y += step) {
  for (let x = 0; x <= frame.width; x += 35) {
    const { dx, dy } = getWobble(x, y);
    if (x === 0) ctx.moveTo(x + dx, y + dy);
    else ctx.lineTo(x + dx, y + dy);
  }
}
for (let x = 0; x <= frame.width; x += step) {
  for (let y = 0; y <= frame.height; y += 35) {
    const { dx, dy } = getWobble(x, y);
    if (y === 0) ctx.moveTo(x + dx, y + dy);
    else ctx.lineTo(x + dx, y + dy);
  }
}
ctx.stroke();

ctx.lineWidth = 1.0;
ctx.strokeStyle = pal.tileHighlight;
ctx.globalAlpha = 0.3 * dep.tileBright;
ctx.beginPath();
for (let y = 1; y <= frame.height; y += step) {
  for (let x = 0; x <= frame.width; x += 45) {
    const { dx, dy } = getWobble(x, y);
    if (x === 0) ctx.moveTo(x + dx, y + dy - 1);
    else ctx.lineTo(x + dx, y + dy - 1);
  }
}
ctx.stroke();

const data = s.imgData.data;
const cw = s.cW;
const ch = s.cH;
const cScale = dep.causticScale;
const cR = pal.cR;
const cG = pal.cG;
const cB = pal.cB;
const bFactor = bassLvl * 0.45;
const mFactor = midLvl * 0.4;

let ptr = 0;
const invCH = 4.2 / ch;
const invCW = 6.8 / cw;

for (let y = 0; y < ch; y++) {
  const vy = y * invCH * cScale;
  const dy1 = fsin(vy * 2.2 + tWav * 0.85);
  const dy2 = fcos(vy * 3.3 - tWav * 0.7);
  const dy3 = fsin(vy * 1.5 + tWav * 0.4);

  for (let x = 0; x < cw; x++) {
    const ux = x * invCW * cScale;
    const dx1 = fcos(ux * 2.1 - tWav * 0.65);
    const dx2 = fsin(ux * 3.4 + tWav * 0.8);
    const dx3 = fcos(ux * 1.6 - tWav * 0.5);

    const u2 = ux + 0.34 * (dy1 + dx2) + bFactor * dy3;
    const v2 = vy + 0.34 * (dx1 + dy2) + bFactor * dx3;

    const w1 = fsin(u2 * 3.6 + v2 * 2.0 + tWav * 0.5);
    const w2 = fcos(u2 * 2.2 - v2 * 3.5 - tWav * 0.6);
    const w3 = fsin((u2 + v2) * 2.6 + tWav * 0.4);

    const d = Math.abs(w1 + w2) * 0.58 + Math.abs(w2 - w3) * 0.42;
    let intensity = Math.exp(-d * causticSharpness);
    intensity *= (0.75 + bFactor * 0.6 + mFactor * 0.5) * sunIntensity;

    if (intensity < 0.14) {
      data[ptr] = 0;
      data[ptr + 1] = 0;
      data[ptr + 2] = 0;
      data[ptr + 3] = 0;
    } else if (intensity < 0.55) {
      const t = (intensity - 0.14) / 0.41;
      data[ptr] = (cR * t * 0.8) | 0;
      data[ptr + 1] = (cG * t * 0.9) | 0;
      data[ptr + 2] = (cB * t) | 0;
      data[ptr + 3] = (t * 210) | 0;
    } else {
      const t = Math.min(1.0, (intensity - 0.55) / 0.45);
      data[ptr] = (cR + (255 - cR) * t) | 0;
      data[ptr + 1] = (cG + (255 - cG) * t) | 0;
      data[ptr + 2] = (cB + (255 - cB) * t) | 0;
      data[ptr + 3] = (210 + t * 45) | 0;
    }
    ptr += 4;
  }
}
s.offCtx.putImageData(s.imgData, 0, 0);

ctx.save();
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

if (chromatic) {
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.42;
  ctx.drawImage(s.offCanvas, 4, 3, frame.width, frame.height);
}

ctx.globalCompositeOperation = 'lighter';
ctx.globalAlpha = 0.95;
ctx.drawImage(s.offCanvas, 0, 0, frame.width, frame.height);
ctx.restore();

if (showRipples) {
  const people = (room.people && room.people.length > 0) ? room.people : [
    { hue: 190, idx: 0 },
    { hue: 155, idx: 1 },
    { hue: 40, idx: 2 }
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const count = Math.min(people.length, 10);
  for (let i = 0; i < count; i++) {
    const p = people[i];
    const pHue = (p.hue !== undefined ? p.hue : (i * 68) % 360);
    const orbitR = 75 + (pHue % 90);
    const orbitSpd = 0.22 + (pHue % 40) * 0.005;
    const bx = frame.width * (0.2 + 0.6 * ((pHue * 13) % 100) / 100);
    const by = frame.height * (0.2 + 0.6 * ((pHue * 29) % 100) / 100);
    const px = bx + fcos(frame.t * orbitSpd + pHue) * orbitR;
    const py = by + fsin(frame.t * (orbitSpd * 0.85) + pHue * 2) * orbitR;

    for (let r = 0; r < 3; r++) {
      const phase = ((frame.t * 1.4 + r * 1.2 + i) % 3.6);
      const rad = phase * 26 + 10;
      const alpha = Math.max(0, (1 - phase / 3.6) * 0.4);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = `hsla(${pHue}, 85%, 72%, ${alpha})`;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.1; a += Math.PI / 8) {
        const wOff = fsin(a * 4 + frame.t * 3.2) * 3.5;
        const rx = px + Math.cos(a) * (rad + wOff);
        const ry = py + Math.sin(a) * (rad + wOff);
        if (a === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.stroke();
    }

    const glowGrad = ctx.createRadialGradient(px, py, 2, px, py, 32);
    glowGrad.addColorStop(0, `hsla(${pHue}, 100%, 88%, 0.45)`);
    glowGrad.addColorStop(0.5, `hsla(${pHue}, 85%, 60%, 0.15)`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(px, py, 32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

if (s.pulses.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < s.pulses.length; i++) {
    const p = s.pulses[i];
    ctx.lineWidth = 4 * p.strength + 1;
    ctx.strokeStyle = `rgba(180, 245, 255, ${p.strength * 0.5})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

if (showSparkles) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const tSpk = frame.t * 0.45;
  for (let i = 0; i < s.motes.length; i++) {
    const m = s.motes[i];
    const mx = ((m.x * frame.width + fsin(tSpk * m.speed + m.seed) * 35) % frame.width + frame.width) % frame.width;
    const my = ((m.y * frame.height + fcos(tSpk * (m.speed * 0.8) + m.seed) * 25 - frame.t * 12 * m.speed) % frame.height + frame.height) % frame.height;
    const glint = Math.pow(Math.max(0, fsin(frame.t * 3.0 + m.seed * 5.0)), 4.0);
    const size = m.size * (1.0 + glint * 1.5 + trebLvl * 1.3);
    const alpha = (0.2 + glint * 0.7 + trebLvl * 0.5) * sunIntensity;

    ctx.fillStyle = `rgba(225, 255, 255, ${Math.min(1.0, alpha)})`;
    ctx.beginPath();
    ctx.arc(mx, my, size, 0, Math.PI * 2);
    ctx.fill();

    if (glint > 0.8) {
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.55})`;
      ctx.beginPath();
      ctx.moveTo(mx - size * 3.8, my);
      ctx.lineTo(mx + size * 3.8, my);
      ctx.moveTo(mx, my - size * 3.8);
      ctx.lineTo(mx, my + size * 3.8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

ctx.save();
const vigGrad = ctx.createRadialGradient(
  frame.width * 0.5, frame.height * 0.5, Math.min(frame.width, frame.height) * 0.38,
  frame.width * 0.5, frame.height * 0.5, Math.max(frame.width, frame.height) * 0.74
);
vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
vigGrad.addColorStop(0.68, `rgba(1, 4, 10, ${dep.vignOpacity * 0.65})`);
vigGrad.addColorStop(1, `rgba(0, 0, 0, ${dep.vignOpacity})`);
ctx.fillStyle = vigGrad;
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.restore();

ctx.restore();