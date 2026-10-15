const W = 64;
const H = 48;
const N = W * H;

const paletteKey = getVar('palette') ?? 'bioluminescent';
const plumeStyle = getVar('plume_style') ?? 'chimney_jets';
const buoyancy = getVar('buoyancy') ?? 1.5;
const swirlFactor = getVar('swirl_factor') ?? 1.5;
const smokeDensity = getVar('smoke_density') ?? 1.0;
const dissipation = getVar('dissipation_rate') ?? 0.98;
const glowIntensity = getVar('glow_intensity') ?? 1.25;
const ambientDrift = getVar('ambient_drift') ?? 0.2;

room.state.u ??= new Float32Array(N);
room.state.v ??= new Float32Array(N);
room.state.u0 ??= new Float32Array(N);
room.state.v0 ??= new Float32Array(N);
room.state.p ??= new Float32Array(N);
room.state.div ??= new Float32Array(N);
room.state.r ??= new Float32Array(N);
room.state.g ??= new Float32Array(N);
room.state.b ??= new Float32Array(N);
room.state.r0 ??= new Float32Array(N);
room.state.g0 ??= new Float32Array(N);
room.state.b0 ??= new Float32Array(N);

if (!room.state.offCanvas) {
  if (typeof OffscreenCanvas !== 'undefined') {
    room.state.offCanvas = new OffscreenCanvas(W, H);
  }
  if (room.state.offCanvas) {
    room.state.offCtx = room.state.offCanvas.getContext('2d');
    room.state.imgData = room.state.offCtx.createImageData(W, H);
  }
}

const u = room.state.u;
const v = room.state.v;
const u0 = room.state.u0;
const v0 = room.state.v0;
const p = room.state.p;
const div = room.state.div;
const r = room.state.r;
const g = room.state.g;
const b = room.state.b;
const r0 = room.state.r0;
const g0 = room.state.g0;
const b0 = room.state.b0;

const dt = Math.min(frame.dt || 0.016, 0.033);
const t = frame.t;

const palettes = {
  bioluminescent: [[0.05, 0.85, 0.95], [0.35, 0.15, 0.95], [0.10, 0.95, 0.65], [0.70, 0.12, 0.85]],
  incandescent:   [[0.95, 0.25, 0.05], [1.00, 0.75, 0.15], [0.80, 0.08, 0.15], [1.00, 0.95, 0.65]],
  aurora:         [[0.05, 0.95, 0.50], [0.95, 0.15, 0.65], [0.15, 0.75, 0.98], [0.55, 0.20, 0.92]],
  prismatic:      [[0.98, 0.12, 0.55], [0.98, 0.85, 0.10], [0.05, 0.88, 0.98], [0.45, 0.95, 0.15]],
  monochrome:     [[0.85, 0.90, 0.95], [0.45, 0.55, 0.70], [0.95, 0.96, 0.98], [0.30, 0.35, 0.42]]
};
const selectedPalette = palettes[paletteKey] ?? palettes.bioluminescent;

const hslToRgb = (h, s, l) => {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p0 = 2 * l - q;
  const chan = (tc) => {
    if (tc < 0) tc += 1;
    if (tc > 1) tc -= 1;
    if (tc < 1 / 6) return p0 + (q - p0) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p0 + (q - p0) * (2 / 3 - tc) * 6;
    return p0;
  };
  return [chan(h + 1 / 3), chan(h), chan(h - 1 / 3)];
};

let emitters = [];
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 6);
  for (let k = 0; k < pCount; k++) {
    const person = room.people[k];
    const ex = ((k + 0.5) / pCount) * (W - 12) + 6;
    emitters.push({ x: ex, col: hslToRgb(person.hue, 0.85, 0.6) });
  }
} else {
  const count = 4;
  for (let k = 0; k < count; k++) {
    let ex = ((k + 0.5) / count) * (W - 14) + 7;
    if (plumeStyle === 'dancing_braids') {
      ex += Math.sin(t * 1.8 + k * 1.57) * 4.5;
    }
    emitters.push({ x: ex, col: selectedPalette[k % selectedPalette.length] });
  }
}

const ey = H - 3;
const pulse = plumeStyle === 'vortex_rings' ? Math.max(0, Math.sin(t * 4.2)) ** 3 + (audio.beat ? 0.9 : 0) : 1.0;
const liftForce = (2.2 + buoyancy * 1.2 + audio.bass * 3.0) * (plumeStyle === 'vortex_rings' ? pulse * 1.8 : 1.0);
const emitVol = (0.55 + audio.level * 0.65) * pulse * smokeDensity;

for (let k = 0; k < emitters.length; k++) {
  const em = emitters[k];
  const sway = (Math.sin(t * 2.2 + k * 1.7) * 1.4 + (plumeStyle === 'dancing_braids' ? Math.cos(t * 3.0 + k) * 2.0 : 0)) * swirlFactor;
  const cx = Math.round(em.x);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gi = cx + dx;
      const gj = ey + dy;
      if (gi >= 1 && gi < W - 1 && gj >= 1 && gj < H - 1) {
        const idx = gi + gj * W;
        const wght = (dx === 0 && dy === 0) ? 1.0 : 0.45;
        u[idx] += (sway + ambientDrift * 1.5) * wght;
        v[idx] -= liftForce * wght;
        r[idx] += em.col[0] * emitVol * wght;
        g[idx] += em.col[1] * emitVol * wght;
        b[idx] += em.col[2] * emitVol * wght;
      }
    }
  }
}

if (audio.beat) {
  const swirlDir = (Math.sin(t * 7.1) > 0 ? 1 : -1) * swirlFactor * 3.6;
  const vx = Math.max(6, Math.min(W - 7, ((0.3 + 0.4 * Math.sin(t * 1.9)) * W) | 0));
  const vy = Math.max(8, Math.min(H - 10, ((0.42 + 0.16 * Math.cos(t * 2.3)) * H) | 0));
  const rad = 6;
  for (let dy = -rad; dy <= rad; dy++) {
    const gj = vy + dy;
    if (gj < 1 || gj >= H - 1) continue;
    for (let dx = -rad; dx <= rad; dx++) {
      const gi = vx + dx;
      if (gi < 1 || gi >= W - 1) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rad * rad && d2 > 0) {
        const fall = 1 - Math.sqrt(d2) / rad;
        const idx = gi + gj * W;
        u[idx] += -dy * fall * swirlDir * 0.25;
        v[idx] +=  dx * fall * swirlDir * 0.25;
      }
    }
  }
}

const buoyFactor = buoyancy * 0.55;
const driftFactor = ambientDrift * 0.3;
const trebleTurb = audio.treble * 0.4 * swirlFactor;
for (let j = 1; j < H - 1; j++) {
  const jW = j * W;
  const wave = Math.sin(j * 0.35 + t * 3.0) * trebleTurb;
  for (let i = 1; i < W - 1; i++) {
    const idx = i + jW;
    const totalDens = r[idx] + g[idx] + b[idx];
    v[idx] -= totalDens * buoyFactor * dt * 3.0;
    u[idx] += (driftFactor + wave) * dt * 2.0;
  }
}

const setBnd = (axis, fld) => {
  for (let i = 1; i < W - 1; i++) {
    fld[i] = axis === 2 ? (fld[i + W] < 0 ? fld[i + W] : 0) : fld[i + W];
    fld[i + (H - 1) * W] = axis === 2 ? -fld[i + (H - 2) * W] : fld[i + (H - 2) * W];
  }
  for (let j = 1; j < H - 1; j++) {
    const jW = j * W;
    fld[jW] = axis === 1 ? -fld[1 + jW] : fld[1 + jW];
    fld[W - 1 + jW] = axis === 1 ? -fld[W - 2 + jW] : fld[W - 2 + jW];
  }
  fld[0] = 0.5 * (fld[1] + fld[W]);
  fld[W - 1] = 0.5 * (fld[W - 2] + fld[2 * W - 1]);
  fld[(H - 1) * W] = 0.5 * (fld[(H - 2) * W] + fld[(H - 1) * W + 1]);
  fld[W * H - 1] = 0.5 * (fld[W * H - 2] + fld[(H - 1) * W - 1]);
};

const advect = (axis, d, d0, velU, velV) => {
  const dtScale = dt * 26.0;
  for (let j = 1; j < H - 1; j++) {
    const jW = j * W;
    for (let i = 1; i < W - 1; i++) {
      const idx = i + jW;
      let x = i - dtScale * velU[idx];
      let y = j - dtScale * velV[idx];
      if (x < 0.5) x = 0.5; else if (x > W - 1.5) x = W - 1.5;
      if (y < 0.5) y = 0.5; else if (y > H - 1.5) y = H - 1.5;
      const i0 = x | 0;
      const i1 = i0 + 1;
      const j0 = y | 0;
      const j1 = j0 + 1;
      const s1 = x - i0;
      const s0 = 1 - s1;
      const t1 = y - j0;
      const t0 = 1 - t1;
      const r0idx = j0 * W;
      const r1idx = j1 * W;
      d[idx] = s0 * (t0 * d0[i0 + r0idx] + t1 * d0[i0 + r1idx]) +
               s1 * (t0 * d0[i1 + r0idx] + t1 * d0[i1 + r1idx]);
    }
  }
  setBnd(axis, d);
};

u0.set(u);
v0.set(v);
advect(1, u, u0, u0, v0);
advect(2, v, v0, u0, v0);

for (let j = 1; j < H - 1; j++) {
  const jW = j * W;
  for (let i = 1; i < W - 1; i++) {
    div[i + jW] = -0.5 * (u[i + 1 + jW] - u[i - 1 + jW] + v[i + jW + W] - v[i + jW - W]);
    p[i + jW] = 0;
  }
}
setBnd(0, div);
setBnd(0, p);

for (let k = 0; k < 6; k++) {
  for (let j = 1; j < H - 1; j++) {
    const jW = j * W;
    for (let i = 1; i < W - 1; i++) {
      p[i + jW] = (div[i + jW] + p[i - 1 + jW] + p[i + 1 + jW] + p[i + jW - W] + p[i + jW + W]) * 0.25;
    }
  }
  setBnd(0, p);
}

for (let j = 1; j < H - 1; j++) {
  const jW = j * W;
  for (let i = 1; i < W - 1; i++) {
    u[i + jW] -= 0.5 * (p[i + 1 + jW] - p[i - 1 + jW]);
    v[i + jW] -= 0.5 * (p[i + jW + W] - p[i + jW - W]);
  }
}
setBnd(1, u);
setBnd(2, v);

r0.set(r);
g0.set(g);
b0.set(b);
advect(0, r, r0, u, v);
advect(0, g, g0, u, v);
advect(0, b, b0, u, v);

for (let j = 0; j < H; j++) {
  const jW = j * W;
  const edgeDiss = j < 6 ? (j / 6) : 1.0;
  const totalDiss = dissipation * edgeDiss;
  for (let i = 0; i < W; i++) {
    const idx = i + jW;
    r[idx] *= totalDiss;
    g[idx] *= totalDiss;
    b[idx] *= totalDiss;
  }
}

ctx.save();
const bgGrad = ctx.createLinearGradient(0, 0, 0, frame.height);
bgGrad.addColorStop(0, '#030508');
bgGrad.addColorStop(0.7, '#06080d');
bgGrad.addColorStop(1, '#090e16');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

if (room.state.offCanvas && room.state.imgData) {
  const pix = room.state.imgData.data;
  const bright = 1.0 + audio.bass * 0.45;
  for (let idx = 0; idx < N; idx++) {
    const p4 = idx << 2;
    const cr = r[idx];
    const cg = g[idx];
    const cb = b[idx];
    const dSum = cr + cg + cb;
    if (dSum < 0.002) {
      pix[p4 + 3] = 0;
      continue;
    }
    const alpha = Math.min(255, (1.0 - Math.exp(-dSum * 2.2 * smokeDensity)) * 255);
    pix[p4]     = Math.min(255, (1.0 - Math.exp(-cr * 2.6 * smokeDensity)) * 255 * bright) | 0;
    pix[p4 + 1] = Math.min(255, (1.0 - Math.exp(-cg * 2.6 * smokeDensity)) * 255 * bright) | 0;
    pix[p4 + 2] = Math.min(255, (1.0 - Math.exp(-cb * 2.6 * smokeDensity)) * 255 * bright) | 0;
    pix[p4 + 3] = alpha | 0;
  }
  room.state.offCtx.putImageData(room.state.imgData, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(room.state.offCanvas, 0, 0, frame.width, frame.height);

  if (glowIntensity > 0.6) {
    ctx.globalCompositeOperation = 'screen';
    const glowAlpha = Math.min(0.65, (glowIntensity - 0.5) * 0.3 + (audio.beat ? 0.22 : 0) + audio.level * 0.15);
    ctx.globalAlpha = glowAlpha;
    ctx.drawImage(room.state.offCanvas, -frame.width * 0.02, -frame.height * 0.02, frame.width * 1.04, frame.height * 1.04);
  }
}

if (room.people && room.people.length > 0) {
  ctx.globalCompositeOperation = 'source-over';
  const pCount = Math.min(room.people.length, 12);
  for (let k = 0; k < pCount; k++) {
    const person = room.people[k];
    const px = ((k + 0.5) / pCount) * (frame.width * 0.84) + frame.width * 0.08;
    const py = frame.height - 6;
    const rad = 3.5 + audio.bass * 3.5;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${person.hue}, 90%, 65%)`;
    ctx.fill();
  }
}

ctx.restore();