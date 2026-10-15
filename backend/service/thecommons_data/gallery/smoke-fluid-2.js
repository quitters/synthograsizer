const W = frame.width;
const H = frame.height;
const GW = 64;
const GH = 48;
const SIZE = GW * GH;

// Allocate and retain fluid grids
if (!room.state.u || room.state.GW !== GW || room.state.GH !== GH) {
  room.state.GW = GW;
  room.state.GH = GH;
  room.state.u = new Float32Array(SIZE);
  room.state.v = new Float32Array(SIZE);
  room.state.u0 = new Float32Array(SIZE);
  room.state.v0 = new Float32Array(SIZE);
  room.state.r = new Float32Array(SIZE);
  room.state.g = new Float32Array(SIZE);
  room.state.b = new Float32Array(SIZE);
  room.state.r0 = new Float32Array(SIZE);
  room.state.g0 = new Float32Array(SIZE);
  room.state.b0 = new Float32Array(SIZE);
  room.state.p = new Float32Array(SIZE);
  room.state.div = new Float32Array(SIZE);
  room.state.offscreen = new OffscreenCanvas(GW, GH);
  room.state.offCtx = room.state.offscreen.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(GW, GH);
  room.state.sparks = [];
  room.state.hueOffset = 0;
}

const u = room.state.u;
const v = room.state.v;
const u0 = room.state.u0;
const v0 = room.state.v0;
const densR = room.state.r;
const densG = room.state.g;
const densB = room.state.b;
const r0 = room.state.r0;
const g0 = room.state.g0;
const b0 = room.state.b0;
const p = room.state.p;
const div = room.state.div;

// Controls
const paletteChoice = getVar('palette_style') ?? 'Neon Aurora';
const viscosityChoice = getVar('smoke_viscosity') ?? 'Billowing & Thick';
const swirlMult = getVar('swirl_force') ?? 2.5;
const riseSpeed = getVar('rise_speed') ?? 3.5;
const decay = getVar('dissipation') ?? 0.985;
const beatMode = getVar('beat_burst') ?? 'Pulse Vortex';

const viscMap = {
  'Ethereal & Light': { diff: 0.0001, drag: 0.994, iters: 6 },
  'Billowing & Thick': { diff: 0.0004, drag: 0.988, iters: 9 },
  'Heavy Vapor': { diff: 0.0012, drag: 0.978, iters: 12 }
};
const cfg = viscMap[viscosityChoice] ?? viscMap['Billowing & Thick'];

const IX = (x, y) => x + y * GW;

// Beat triggers & pulse events
if (audio.beat) {
  room.state.hueOffset = (room.state.hueOffset + 45) % 360;
  if (beatMode === 'Shockwave') {
    const cx = GW >> 1;
    const cy = GH - 10;
    for (let y = 1; y < GH - 1; y++) {
      for (let x = 1; x < GW - 1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy) + 0.1;
        if (dist < 22) {
          const force = (1 - dist / 22) * 5 * (audio.bass + 0.5);
          u[IX(x, y)] += (dx / dist) * force;
          v[IX(x, y)] += (dy / dist) * force - 1.5;
        }
      }
    }
  } else if (beatMode === 'Pulse Vortex') {
    const vx1 = Math.floor(GW * 0.35);
    const vx2 = Math.floor(GW * 0.65);
    const vy = GH - 12;
    for (let y = -5; y <= 5; y++) {
      for (let x = -5; x <= 5; x++) {
        const d2 = x * x + y * y;
        if (d2 <= 25) {
          const f = (1 - Math.sqrt(d2) / 5) * 4;
          u[IX(vx1 + x, vy + y)] += -y * f * 0.4;
          v[IX(vx1 + x, vy + y)] += (x * f * 0.4) - 2.5;
          u[IX(vx2 + x, vy + y)] += y * f * 0.4;
          v[IX(vx2 + x, vy + y)] += (-x * f * 0.4) - 2.5;
        }
      }
    }
  }
}

// Inject continuous plumes at the base
const people = room.people && room.people.length > 0 ? room.people : [{ id: 'p0', hue: 180 }];
const time = frame.t;

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  let c = (1 - Math.abs(2 * l - 1)) * s;
  let x = c * (1 - Math.abs((h * 6) % 2 - 1));
  let m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 1/6) { r = c; g = x; }
  else if (h < 2/6) { r = x; g = c; }
  else if (h < 3/6) { g = c; b = x; }
  else if (h < 4/6) { g = x; b = c; }
  else if (h < 5/6) { r = x; b = c; }
  else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const plumeCount = Math.max(3, people.length);
for (let i = 0; i < plumeCount; i++) {
  const pPerson = people[i % people.length];
  const spread = (i + 1) / (plumeCount + 1);
  const wobble = Math.sin(time * 1.8 + i * 2.1) * 0.08;
  const gx = Math.floor(Math.min(GW - 3, Math.max(2, (spread + wobble) * GW)));
  const gy = GH - 3;

  // Determine plume color based on palette
  let rgb = [200, 200, 200];
  let baseHue = (pPerson.hue + (beatMode === 'Color Shift' ? room.state.hueOffset : 0)) % 360;
  if (paletteChoice === 'Neon Aurora') {
    rgb = hslToRgb(baseHue + Math.sin(time + i) * 30, 0.9, 0.55);
  } else if (paletteChoice === 'Volcanic') {
    const warm = [0, 25, 45][i % 3];
    rgb = hslToRgb(warm, 1.0, 0.45 + (audio.bass * 0.3));
  } else if (paletteChoice === 'Incense') {
    const tone = 200 + Math.sin(time * 0.5 + i) * 30;
    rgb = hslToRgb(tone, 0.25, 0.65);
  } else if (paletteChoice === 'Bioluminescent') {
    const cyanTeal = 150 + (i % 2) * 45;
    rgb = hslToRgb(cyanTeal, 0.95, 0.5);
  }

  const upward = -(riseSpeed * (1.0 + audio.bass * 1.2));
  const sway = Math.cos(time * 2.2 + i * 1.7) * swirlMult;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const idx = IX(gx + dx, gy + dy);
      const falloff = 1 - Math.hypot(dx, dy) / 3;
      if (falloff > 0) {
        densR[idx] = Math.min(255, densR[idx] + rgb[0] * falloff * 0.7);
        densG[idx] = Math.min(255, densG[idx] + rgb[1] * falloff * 0.7);
        densB[idx] = Math.min(255, densB[idx] + rgb[2] * falloff * 0.7);
        u[idx] += sway * falloff * 0.5;
        v[idx] += upward * falloff * 0.6;
      }
    }
  }
}

// Vorticity / swirling buoyancy injection across middle
const curlTime = time * 0.9;
for (let y = 4; y < GH - 4; y += 4) {
  for (let x = 4; x < GW - 4; x += 4) {
    const idx = IX(x, y);
    const angle = Math.sin(x * 0.15 + curlTime) + Math.cos(y * 0.15 + curlTime * 1.1);
    u[idx] += Math.cos(angle) * swirlMult * 0.08 * (0.8 + audio.mid);
    v[idx] += Math.sin(angle) * swirlMult * 0.08 - (0.05 * riseSpeed);
  }
}

// Advect velocity
const dtSim = 0.2;
for (let y = 1; y < GH - 1; y++) {
  for (let x = 1; x < GW - 1; x++) {
    const idx = IX(x, y);
    let px = x - u[idx] * dtSim;
    let py = y - v[idx] * dtSim;
    px = Math.max(0.5, Math.min(GW - 1.5, px));
    py = Math.max(0.5, Math.min(GH - 1.5, py));
    const x0 = Math.floor(px);
    const x1 = x0 + 1;
    const y0 = Math.floor(py);
    const y1 = y0 + 1;
    const sx = px - x0;
    const sy = py - y0;
    u0[idx] = (1 - sx) * ((1 - sy) * u[IX(x0, y0)] + sy * u[IX(x0, y1)]) +
               sx * ((1 - sy) * u[IX(x1, y0)] + sy * u[IX(x1, y1)]);
    v0[idx] = (1 - sx) * ((1 - sy) * v[IX(x0, y0)] + sy * v[IX(x0, y1)]) +
               sx * ((1 - sy) * v[IX(x1, y0)] + sy * v[IX(x1, y1)]);
  }
}
for (let i = 0; i < SIZE; i++) {
  u[i] = u0[i] * cfg.drag;
  v[i] = v0[i] * cfg.drag;
}

// Pressure Poisson projection (Jacobi iteration for incompressibility)
for (let y = 1; y < GH - 1; y++) {
  for (let x = 1; x < GW - 1; x++) {
    div[IX(x, y)] = -0.5 * ((u[IX(x + 1, y)] - u[IX(x - 1, y)]) +
                             (v[IX(x, y + 1)] - v[IX(x, y - 1)]));
    p[IX(x, y)] = 0;
  }
}
for (let k = 0; k < cfg.iters; k++) {
  for (let y = 1; y < GH - 1; y++) {
    for (let x = 1; x < GW - 1; x++) {
      p[IX(x, y)] = (div[IX(x, y)] + p[IX(x - 1, y)] + p[IX(x + 1, y)] +
                     p[IX(x, y - 1)] + p[IX(x, y + 1)]) * 0.25;
    }
  }
}
for (let y = 1; y < GH - 1; y++) {
  for (let x = 1; x < GW - 1; x++) {
    const idx = IX(x, y);
    u[idx] -= 0.5 * (p[IX(x + 1, y)] - p[IX(x - 1, y)]);
    v[idx] -= 0.5 * (p[IX(x, y + 1)] - p[IX(x, y - 1)]);
  }
}

// Advect & dissipate color channels
for (let y = 1; y < GH - 1; y++) {
  for (let x = 1; x < GW - 1; x++) {
    const idx = IX(x, y);
    let px = x - u[idx] * dtSim;
    let py = y - v[idx] * dtSim;
    px = Math.max(0.5, Math.min(GW - 1.5, px));
    py = Math.max(0.5, Math.min(GH - 1.5, py));
    const x0 = Math.floor(px);
    const x1 = x0 + 1;
    const y0 = Math.floor(py);
    const y1 = y0 + 1;
    const sx = px - x0;
    const sy = py - y0;

    const rInterp = (1 - sx) * ((1 - sy) * densR[IX(x0, y0)] + sy * densR[IX(x0, y1)]) +
                     sx * ((1 - sy) * densR[IX(x1, y0)] + sy * densR[IX(x1, y1)]);
    const gInterp = (1 - sx) * ((1 - sy) * densG[IX(x0, y0)] + sy * densG[IX(x0, y1)]) +
                     sx * ((1 - sy) * densG[IX(x1, y0)] + sy * densG[IX(x1, y1)]);
    const bInterp = (1 - sx) * ((1 - sy) * densB[IX(x0, y0)] + sy * densB[IX(x0, y1)]) +
                     sx * ((1 - sy) * densB[IX(x1, y0)] + sy * densB[IX(x1, y1)]);

    r0[idx] = rInterp * decay;
    g0[idx] = gInterp * decay;
    b0[idx] = bInterp * decay;
  }
}

// Copy back & build pixel buffer
const data = room.state.imgData.data;
let pIdx = 0;
for (let i = 0; i < SIZE; i++) {
  densR[i] = r0[i];
  densG[i] = g0[i];
  densB[i] = b0[i];

  const cr = densR[i];
  const cg = densG[i];
  const cb = densB[i];
  const alpha = Math.min(255, (cr + cg + cb) * 0.45);

  data[pIdx++] = cr;
  data[pIdx++] = cg;
  data[pIdx++] = cb;
  data[pIdx++] = alpha;
}

// Render fluid texture to offscreen, then upscale smoothly to wall
room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.save();
ctx.fillStyle = '#06070a';
ctx.fillRect(0, 0, W, H);

// Draw smooth upscaled fluid smoke
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
ctx.globalCompositeOperation = 'screen';
ctx.drawImage(room.state.offscreen, 0, 0, W, H);

// Subtle bloom layer with extra scale
ctx.globalAlpha = 0.35 + audio.treble * 0.25;
ctx.filter = 'blur(16px)';
ctx.drawImage(room.state.offscreen, -W * 0.03, -H * 0.03, W * 1.06, H * 1.06);
ctx.filter = 'none';

// Render floating ember sparks carried by fluid flow
const sparks = room.state.sparks;
if (sparks.length < 90 && Math.random() < 0.6 + audio.mid * 0.4) {
  sparks.push({
    x: (0.15 + Math.random() * 0.7) * GW,
    y: GH - 4,
    life: 1.0,
    hue: (room.state.hueOffset + Math.random() * 60) % 360
  });
}

ctx.globalCompositeOperation = 'lighter';
for (let i = sparks.length - 1; i >= 0; i--) {
  const s = sparks[i];
  const gx = Math.max(0, Math.min(GW - 1, Math.floor(s.x)));
  const gy = Math.max(0, Math.min(GH - 1, Math.floor(s.y)));
  const idx = IX(gx, gy);
  s.x += u[idx] * 0.2;
  s.y += v[idx] * 0.2 - 0.4;
  s.life -= 0.009;

  if (s.life <= 0 || s.y < 0) {
    sparks.splice(i, 1);
    continue;
  }

  const screenX = (s.x / GW) * W;
  const screenY = (s.y / GH) * H;
  const radius = (1.5 + (1 - s.life) * 2.5) * (1 + audio.treble);

  ctx.fillStyle = `hsla(${s.hue}, 90%, 75%, ${s.life * 0.8})`;
  ctx.beginPath();
  ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
  ctx.fill();
}

ctx.restore();