const themeName = getVar('planet_theme') ?? 'earthlike';
const cloudParam = getVar('cloud_density') ?? 'balanced';
const rotSpeed = getVar('rotation_speed') ?? 0.8;
const glowParam = getVar('atmosphere_glow') ?? 'radiant';
const moonParam = getVar('moon_system') ?? 'inner_outer';

const cloudThresholds = { sparse: 0.65, balanced: 0.52, dense: 0.40, stormy: 0.30 };
const cloudThresh = cloudThresholds[cloudParam] ?? 0.52;

const BUF_W = 160;
const BUF_H = 160;
const BUF_R = 66;
const BUF_CX = 80;
const BUF_CY = 80;
const TEX_W = 512;
const TEX_H = 256;

if (!room.state.initialized) {
  room.state.initialized = true;
  room.state.currentTheme = '';
  room.state.planetRot = 0;
  room.state.cloudRot = 0;
  room.state.offCanvas = new OffscreenCanvas(BUF_W, BUF_H);
  room.state.offCtx = room.state.offCanvas.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(BUF_W, BUF_H);
  room.state.pixels32 = new Uint32Array(room.state.imgData.data.buffer);
  room.state.heightMap = new Float32Array(TEX_W * TEX_H);
  room.state.cloudMap = new Float32Array(TEX_W * TEX_H);
  room.state.cityMap = new Float32Array(TEX_W * TEX_H);

  for (let y = 0; y < TEX_H; y++) {
    const lat = (y / TEX_H - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let x = 0; x < TEX_W; x++) {
      const lon = (x / TEX_W) * Math.PI * 2;
      const nx = cosLat * Math.cos(lon);
      const ny = sinLat;
      const nz = cosLat * Math.sin(lon);
      let h = Math.sin(nx * 2.2 + ny * 1.6) * Math.cos(nz * 2.4)
            + 0.55 * Math.sin(nx * 4.4 - nz * 3.7) * Math.sin(ny * 4.1)
            + 0.25 * Math.cos(nx * 8.8 + ny * 7.2) * Math.sin(nz * 8.1)
            + 0.12 * Math.sin(nx * 17.0 + nz * 15.5);
      const idx = y * TEX_W + x;
      room.state.heightMap[idx] = h * 0.5 + 0.5;
      let c = Math.sin(lat * 14.0 + Math.sin(lon * 4.0) * 0.8) * 0.28
            + Math.sin(nx * 6.0 + nz * 5.2 + ny * 3.0) * 0.42
            + Math.cos(nx * 12.0 - nz * 10.5) * 0.30;
      room.state.cloudMap[idx] = Math.max(0, Math.min(1, c * 0.5 + 0.5));
      const coast = (room.state.heightMap[idx] > 0.52 && room.state.heightMap[idx] < 0.68) && Math.abs(ny) < 0.65;
      const seed = Math.sin(nx * 31.0 + nz * 27.0) * Math.cos(ny * 23.0);
      room.state.cityMap[idx] = (coast && seed > 0.35) ? 1.0 : 0.0;
    }
  }

  let spherePixelCount = 0;
  for (let y = 0; y < BUF_H; y++) {
    for (let x = 0; x < BUF_W; x++) {
      const dx = (x - BUF_CX) / BUF_R;
      const dy = (y - BUF_CY) / BUF_R;
      if (dx * dx + dy * dy <= 1.0) spherePixelCount++;
    }
  }

  room.state.spCount = spherePixelCount;
  room.state.spIdx = new Int32Array(spherePixelCount);
  room.state.spU = new Int32Array(spherePixelCount);
  room.state.spV = new Int32Array(spherePixelCount);
  room.state.spDiff = new Float32Array(spherePixelCount);
  room.state.spRim = new Float32Array(spherePixelCount);
  room.state.spNy = new Float32Array(spherePixelCount);

  const tilt = 0.38;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const Lx = -0.65, Ly = -0.32, Lz = 0.68;
  const Llen = Math.hypot(Lx, Ly, Lz);
  const nLx = Lx / Llen, nLy = Ly / Llen, nLz = Lz / Llen;

  let p = 0;
  for (let y = 0; y < BUF_H; y++) {
    for (let x = 0; x < BUF_W; x++) {
      const dx = (x - BUF_CX) / BUF_R;
      const dy = (y - BUF_CY) / BUF_R;
      const r2 = dx * dx + dy * dy;
      if (r2 <= 1.0) {
        const dz = Math.sqrt(Math.max(0, 1.0 - r2));
        room.state.spIdx[p] = y * BUF_W + x;
        const diff = dx * nLx + dy * nLy + dz * nLz;
        room.state.spDiff[p] = diff;
        const fresnel = Math.pow(1.0 - dz, 2.6);
        room.state.spRim[p] = fresnel;
        const py_tilt = dy * cosT - dz * sinT;
        const pz_tilt = dy * sinT + dz * cosT;
        const px_tilt = dx;
        const lat = Math.asin(Math.max(-1, Math.min(1, py_tilt)));
        const lon = Math.atan2(px_tilt, pz_tilt);
        room.state.spV[p] = Math.floor(((lat / Math.PI) + 0.5) * (TEX_H - 1));
        room.state.spU[p] = Math.floor(((lon / (Math.PI * 2) + 1.0) % 1.0) * TEX_W);
        room.state.spNy[p] = py_tilt;
        p++;
      }
    }
  }

  room.state.stars = [];
  for (let i = 0; i < 110; i++) {
    room.state.stars.push({
      nx: Math.random(),
      ny: Math.random(),
      r: 0.6 + Math.random() * 1.4,
      b: 0.4 + Math.random() * 0.6,
      blink: 1.0 + Math.random() * 4.0
    });
  }
}

if (room.state.currentTheme !== themeName) {
  room.state.currentTheme = themeName;
  room.state.texDayR = new Uint8Array(TEX_W * TEX_H);
  room.state.texDayG = new Uint8Array(TEX_W * TEX_H);
  room.state.texDayB = new Uint8Array(TEX_W * TEX_H);
  room.state.texNightR = new Uint8Array(TEX_W * TEX_H);
  room.state.texNightG = new Uint8Array(TEX_W * TEX_H);
  room.state.texNightB = new Uint8Array(TEX_W * TEX_H);

  const palettes = {
    earthlike: {
      ocean: [12, 38, 82], coast: [22, 110, 140], land: [44, 118, 62], peak: [135, 115, 80], snow: [225, 235, 245],
      city: [255, 205, 85]
    },
    mars_desert: {
      ocean: [55, 22, 16], coast: [145, 52, 28], land: [188, 78, 34], peak: [132, 48, 22], snow: [238, 214, 204],
      city: [255, 130, 60]
    },
    ice_world: {
      ocean: [10, 24, 52], coast: [30, 85, 130], land: [95, 155, 195], peak: [165, 205, 235], snow: [245, 250, 255],
      city: [110, 225, 255]
    },
    alien_toxic: {
      ocean: [38, 12, 58], coast: [78, 24, 105], land: [24, 128, 85], peak: [110, 185, 45], snow: [210, 245, 160],
      city: [85, 255, 170]
    }
  };
  const pal = palettes[themeName] ?? palettes.earthlike;

  for (let i = 0; i < TEX_W * TEX_H; i++) {
    const h = room.state.heightMap[i];
    let r, g, b;
    if (h < 0.48) {
      const f = h / 0.48;
      r = pal.ocean[0] + f * (pal.coast[0] - pal.ocean[0]);
      g = pal.ocean[1] + f * (pal.coast[1] - pal.ocean[1]);
      b = pal.ocean[2] + f * (pal.coast[2] - pal.ocean[2]);
    } else if (h < 0.72) {
      const f = (h - 0.48) / 0.24;
      r = pal.coast[0] + f * (pal.land[0] - pal.coast[0]);
      g = pal.coast[1] + f * (pal.land[1] - pal.coast[1]);
      b = pal.coast[2] + f * (pal.land[2] - pal.coast[2]);
    } else if (h < 0.88) {
      const f = (h - 0.72) / 0.16;
      r = pal.land[0] + f * (pal.peak[0] - pal.land[0]);
      g = pal.land[1] + f * (pal.peak[1] - pal.land[1]);
      b = pal.land[2] + f * (pal.peak[2] - pal.land[2]);
    } else {
      const f = (h - 0.88) / 0.12;
      r = pal.peak[0] + f * (pal.snow[0] - pal.peak[0]);
      g = pal.peak[1] + f * (pal.snow[1] - pal.peak[1]);
      b = pal.peak[2] + f * (pal.snow[2] - pal.peak[2]);
    }
    room.state.texDayR[i] = r;
    room.state.texDayG[i] = g;
    room.state.texDayB[i] = b;

    const isCity = room.state.cityMap[i] > 0.5;
    room.state.texNightR[i] = isCity ? pal.city[0] : 0;
    room.state.texNightG[i] = isCity ? pal.city[1] : 0;
    room.state.texNightB[i] = isCity ? pal.city[2] : 0;
  }
}

const dt = frame.dt || 0.016;
room.state.planetRot += dt * 14.0 * rotSpeed;
room.state.cloudRot += dt * (18.0 * rotSpeed + audio.mid * 8.0);

const pRot = Math.floor(room.state.planetRot) % TEX_W;
const cRot = Math.floor(room.state.cloudRot) % TEX_W;
const bassBump = audio.bass * 0.45;
const trebleSpark = audio.treble * 0.35;

const spCount = room.state.spCount;
const spIdx = room.state.spIdx;
const spU = room.state.spU;
const spV = room.state.spV;
const spDiff = room.state.spDiff;
const spRim = room.state.spRim;
const spNy = room.state.spNy;
const p32 = room.state.pixels32;
const dayR = room.state.texDayR;
const dayG = room.state.texDayG;
const dayB = room.state.texDayB;
const nightR = room.state.texNightR;
const nightG = room.state.texNightG;
const nightB = room.state.texNightB;
const cloudMap = room.state.cloudMap;

p32.fill(0);

for (let i = 0; i < spCount; i++) {
  const mapIdx = (spV[i] << 9) | ((spU[i] + pRot) & 511);
  const cldIdx = (spV[i] << 9) | ((spU[i] + cRot) & 511);
  const diff = spDiff[i];
  const rim = spRim[i];
  const ny = spNy[i];

  let r = 0, g = 0, b = 0;
  const cloudVal = cloudMap[cldIdx];
  const hasCloud = cloudVal > cloudThresh;

  if (diff > 0.0) {
    const light = Math.min(1.0, 0.12 + diff * 0.95);
    r = (dayR[mapIdx] * light) | 0;
    g = (dayG[mapIdx] * light) | 0;
    b = (dayB[mapIdx] * light) | 0;

    if (hasCloud) {
      const cLight = Math.min(255, 40 + (diff * 220) | 0);
      const cAlpha = Math.min(1.0, (cloudVal - cloudThresh) * 3.2);
      r = (r * (1.0 - cAlpha) + cLight * cAlpha) | 0;
      g = (g * (1.0 - cAlpha) + cLight * cAlpha) | 0;
      b = (b * (1.0 - cAlpha) + (cLight * 1.05) * cAlpha) | 0;
    }

    if (diff < 0.22) {
      const sunset = (1.0 - diff / 0.22) * 0.65;
      r = Math.min(255, (r + sunset * 120) | 0);
      g = Math.min(255, (g + sunset * 45) | 0);
    }
  } else {
    const nightLit = Math.max(0, 1.0 + diff * 5.0);
    if (nightLit > 0.0 && !hasCloud) {
      const tw = (1.0 + trebleSpark);
      r = (nightR[mapIdx] * nightLit * tw) | 0;
      g = (nightG[mapIdx] * nightLit * tw) | 0;
      b = (nightB[mapIdx] * nightLit * tw) | 0;
    }
    if (Math.abs(ny) > 0.68) {
      const aurora = Math.sin(ny * 18.0 + frame.t * 3.0 + spU[i] * 0.05) * 0.5 + 0.5;
      const aP = aurora * (0.2 + bassBump * 1.2) * (1.0 + diff * 2.0);
      if (aP > 0.0) {
        g = Math.min(255, (g + aP * 140) | 0);
        b = Math.min(255, (b + aP * 110) | 0);
      }
    }
  }

  const rimGlow = rim * (0.35 + bassBump) * Math.max(0.1, diff + 0.45);
  r = Math.min(255, (r + rimGlow * 90) | 0);
  g = Math.min(255, (g + rimGlow * 155) | 0);
  b = Math.min(255, (b + rimGlow * 240) | 0);

  p32[spIdx[i]] = 0xFF000000 | (b << 16) | (g << 8) | r;
}

room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.save();
ctx.fillStyle = '#05070c';
ctx.fillRect(0, 0, frame.width, frame.height);

const W = frame.width;
const H = frame.height;
for (let i = 0; i < room.state.stars.length; i++) {
  const s = room.state.stars[i];
  const tw = Math.sin(frame.t * s.blink + i) * 0.3 + 0.7 + audio.treble * 0.4;
  ctx.fillStyle = `rgba(220, 235, 255, ${Math.min(1, s.b * tw)})`;
  ctx.fillRect(s.nx * W, s.ny * H, s.r, s.r);
}

const cx = W * 0.48;
const cy = H * 0.50;
const viewScale = Math.min(W, H) * 0.70 / BUF_W;
const planetRad = BUF_R * viewScale;

const glowMult = glowParam === 'radiant' ? 1.6 : (glowParam === 'auroral' ? 2.2 : 0.9);
const haloGrad = ctx.createRadialGradient(cx, cy, planetRad * 0.85, cx, cy, planetRad * (1.32 + bassBump * 0.25));
haloGrad.addColorStop(0.0, `rgba(80, 160, 255, ${0.45 * glowMult})`);
haloGrad.addColorStop(0.5, `rgba(40, 90, 200, ${0.18 * glowMult})`);
haloGrad.addColorStop(1.0, 'rgba(0, 10, 40, 0)');
ctx.fillStyle = haloGrad;
ctx.beginPath();
ctx.arc(cx, cy, planetRad * 1.45, 0, Math.PI * 2);
ctx.fill();

const moonConfigs = {
  binary_twins: [{ r: 8, dist: 1.65, spd: 0.45, inc: 0.2 }, { r: 7, dist: 1.85, spd: 0.42, inc: -0.25, phase: 2.8 }],
  inner_outer: [{ r: 6, dist: 1.38, spd: 0.75, inc: 0.15 }, { r: 11, dist: 2.25, spd: 0.28, inc: -0.35, phase: 1.5 }],
  distant_watchers: [{ r: 9, dist: 2.10, spd: 0.32, inc: 0.4 }, { r: 8, dist: 2.60, spd: 0.22, inc: -0.45, phase: 3.4 }]
};
const moons = moonConfigs[moonParam] ?? moonConfigs.inner_outer;

function renderMoon(m, isBack) {
  const phase = m.phase ?? 0;
  const angle = frame.t * m.spd * rotSpeed + phase;
  const d = planetRad * m.dist;
  const mx = cx + Math.cos(angle) * d;
  const my = cy + Math.sin(angle) * (d * m.inc);
  const mz = Math.sin(angle) * d;

  if ((isBack && mz > 0) || (!isBack && mz <= 0)) return;

  const mRad = m.r * (viewScale * 0.85) * (1.0 + mz / (d * 3.5));

  if (!isBack && mz > 0) {
    const sDist = Math.hypot(mx - cx, my - cy);
    if (sDist < planetRad * 0.95) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.arc(mx + planetRad * 0.08, my + planetRad * 0.04, mRad * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, mRad, 0, Math.PI * 2);
  ctx.fillStyle = '#14171d';
  ctx.fill();

  ctx.clip();
  const sunG = ctx.createRadialGradient(mx - mRad * 0.45, my - mRad * 0.35, 1, mx, my, mRad * 1.25);
  sunG.addColorStop(0.0, '#e5ebf0');
  sunG.addColorStop(0.6, '#6b7787');
  sunG.addColorStop(1.0, '#14171d');
  ctx.fillStyle = sunG;
  ctx.beginPath();
  ctx.arc(mx, my, mRad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

renderMoon(moons[0], true);
renderMoon(moons[1], true);

ctx.save();
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'medium';
ctx.translate(cx, cy);
ctx.drawImage(room.state.offCanvas, -planetRad, -planetRad, planetRad * 2, planetRad * 2);
ctx.restore();

renderMoon(moons[0], false);
renderMoon(moons[1], false);

if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 18);
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const pAngle = frame.t * 0.35 + (i * Math.PI * 2) / pCount;
    const pDist = planetRad * (1.18 + 0.15 * Math.sin(i * 1.7));
    const px = cx + Math.cos(pAngle) * pDist;
    const py = cy + Math.sin(pAngle) * (pDist * 0.32);
    ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
    ctx.beginPath();
    ctx.arc(px, py, 2.2 + audio.beat * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();