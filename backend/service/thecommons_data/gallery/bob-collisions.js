const count = Math.min(48, Math.max(16, getVar('ball_count') ?? 32));
const palKey = getVar('palette') ?? 'copper_amiga';
const styleKey = getVar('bob_style') ?? 'classic_specular';
const spinRate = getVar('box_spin') ?? 0.8;
const restitution = getVar('bounciness') ?? 1.0;

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const BOX_SIZE = Math.min(W, H) * 0.32;
const MAX_BALLS = 48;

// Init persistent state buffers once
if (!room.state.initialized) {
  room.state.initialized = true;
  room.state.px = new Float32Array(MAX_BALLS);
  room.state.py = new Float32Array(MAX_BALLS);
  room.state.pz = new Float32Array(MAX_BALLS);
  room.state.vx = new Float32Array(MAX_BALLS);
  room.state.vy = new Float32Array(MAX_BALLS);
  room.state.vz = new Float32Array(MAX_BALLS);
  room.state.rad = new Float32Array(MAX_BALLS);
  room.state.col = new Int32Array(MAX_BALLS);
  room.state.order = new Int32Array(MAX_BALLS);
  room.state.rotX = 0.4;
  room.state.rotY = 0.6;
  room.state.rotZ = 0.1;
  room.state.lastPal = '';
  room.state.lastStyle = '';
  room.state.sprites = [];

  for (let i = 0; i < MAX_BALLS; i++) {
    const r = 16 + (i % 5) * 3;
    room.state.rad[i] = r;
    const spread = BOX_SIZE - r - 4;
    room.state.px[i] = (Math.random() * 2 - 1) * spread * 0.7;
    room.state.py[i] = (Math.random() * 2 - 1) * spread * 0.7;
    room.state.pz[i] = (Math.random() * 2 - 1) * spread * 0.7;
    const spd = 70 + (i % 4) * 20;
    const phi = Math.random() * Math.PI * 2;
    const theta = (Math.random() - 0.5) * Math.PI;
    room.state.vx[i] = Math.cos(theta) * Math.cos(phi) * spd;
    room.state.vy[i] = Math.sin(theta) * spd;
    room.state.vz[i] = Math.cos(theta) * Math.sin(phi) * spd;
    room.state.col[i] = i % 4;
    room.state.order[i] = i;
  }
}

// Rebuild retro bob sprites whenever palette or shading style shifts
const palConfig = {
  copper_amiga: [
    [255, 180, 70], [240, 100, 30], [210, 45, 80], [255, 230, 140]
  ],
  chrome_blue: [
    [100, 210, 255], [30, 120, 240], [180, 240, 255], [40, 60, 180]
  ],
  cyber_neon: [
    [255, 0, 130], [0, 240, 255], [170, 0, 255], [255, 220, 0]
  ],
  monochrome: [
    [240, 240, 240], [170, 175, 185], [110, 115, 130], [210, 215, 225]
  ]
};

const curPal = palConfig[palKey] ?? palConfig.copper_amiga;
if (room.state.lastPal !== palKey || room.state.lastStyle !== styleKey) {
  room.state.lastPal = palKey;
  room.state.lastStyle = styleKey;
  room.state.sprites = [];
  const S_SIZE = 96;
  const sRad = S_SIZE * 0.46;
  const scx = S_SIZE * 0.5;
  const scy = S_SIZE * 0.5;

  for (let c = 0; c < 4; c++) {
    const cvs = new OffscreenCanvas(S_SIZE, S_SIZE);
    const sctx = cvs.getContext('2d');
    const base = curPal[c];
    const img = sctx.createImageData(S_SIZE, S_SIZE);
    const d = img.data;

    const lx = -0.42;
    const ly = -0.52;
    const lz = 0.74;

    for (let y = 0; y < S_SIZE; y++) {
      const ny = (y - scy) / sRad;
      for (let x = 0; x < S_SIZE; x++) {
        const nx = (x - scx) / sRad;
        const d2 = nx * nx + ny * ny;
        const idx = (y * S_SIZE + x) * 4;
        if (d2 <= 1.0) {
          const nz = Math.sqrt(Math.max(0, 1.0 - d2));
          let diff = nx * lx + ny * ly + nz * lz;
          diff = Math.max(0, diff);

          // Specular reflection
          const rx = 2 * diff * nx - lx;
          const ry = 2 * diff * ny - ly;
          const rz = 2 * diff * nz - lz;
          let spec = Math.max(0, rz);
          spec = Math.pow(spec, styleKey === 'glossy_metal' ? 24 : 14);

          if (styleKey === 'stepped_dither') {
            // Amiga 16/32 color quantized look
            diff = Math.floor(diff * 4.99) / 4;
            spec = spec > 0.4 ? 1.0 : 0.0;
          }

          const rim = Math.pow(1.0 - nz, 3) * 0.35;
          const ambient = 0.18;

          let r = base[0] * (ambient + diff * 0.75) + 255 * spec + base[0] * rim;
          let g = base[1] * (ambient + diff * 0.75) + 255 * spec + base[1] * rim;
          let b = base[2] * (ambient + diff * 0.75) + 255 * spec + base[2] * rim;

          // Soft pixel boundary for antialiasing rim
          const edge = Math.min(1.0, (1.0 - Math.sqrt(d2)) * sRad);
          d[idx] = Math.min(255, r);
          d[idx + 1] = Math.min(255, g);
          d[idx + 2] = Math.min(255, b);
          d[idx + 3] = Math.floor(edge * 255);
        } else {
          d[idx + 3] = 0;
        }
      }
    }
    sctx.putImageData(img, 0, 0);
    room.state.sprites.push(cvs);
  }
}

// Physics Simulation step inside box frame [-BOX_SIZE, +BOX_SIZE]^3
const dt = Math.min(0.04, frame.dt > 0 ? frame.dt : 0.016);
const steps = 2;
const sdt = dt / steps;
const speedFactor = (audio.beat ? 1.25 : 1.0) * (1.0 + audio.bass * 0.4);

for (let step = 0; step < steps; step++) {
  for (let i = 0; i < count; i++) {
    room.state.px[i] += room.state.vx[i] * sdt * speedFactor;
    room.state.py[i] += room.state.vy[i] * sdt * speedFactor;
    room.state.pz[i] += room.state.vz[i] * sdt * speedFactor;

    const r = room.state.rad[i];
    const bound = BOX_SIZE - r;

    // Wall bounces
    if (room.state.px[i] < -bound) { room.state.px[i] = -bound; room.state.vx[i] = Math.abs(room.state.vx[i]) * restitution; }
    else if (room.state.px[i] > bound) { room.state.px[i] = bound; room.state.vx[i] = -Math.abs(room.state.vx[i]) * restitution; }
    if (room.state.py[i] < -bound) { room.state.py[i] = -bound; room.state.vy[i] = Math.abs(room.state.vy[i]) * restitution; }
    else if (room.state.py[i] > bound) { room.state.py[i] = bound; room.state.vy[i] = -Math.abs(room.state.vy[i]) * restitution; }
    if (room.state.pz[i] < -bound) { room.state.pz[i] = -bound; room.state.vz[i] = Math.abs(room.state.vz[i]) * restitution; }
    else if (room.state.pz[i] > bound) { room.state.pz[i] = bound; room.state.vz[i] = -Math.abs(room.state.vz[i]) * restitution; }
  }

  // Sphere-to-sphere collisions
  for (let i = 0; i < count; i++) {
    const pxi = room.state.px[i];
    const pyi = room.state.py[i];
    const pzi = room.state.pz[i];
    const ri = room.state.rad[i];

    for (let j = i + 1; j < count; j++) {
      const dx = room.state.px[j] - pxi;
      const dy = room.state.py[j] - pyi;
      const dz = room.state.pz[j] - pzi;
      const distSq = dx * dx + dy * dy + dz * dz;
      const minD = ri + room.state.rad[j];

      if (distSq < minD * minD && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;

        // Separate spheres to prevent overlap latching
        const overlap = (minD - dist) * 0.5;
        room.state.px[i] -= nx * overlap;
        room.state.py[i] -= ny * overlap;
        room.state.pz[i] -= nz * overlap;
        room.state.px[j] += nx * overlap;
        room.state.py[j] += ny * overlap;
        room.state.pz[j] += nz * overlap;

        // Elastic impulse along collision normal
        const kx = room.state.vx[i] - room.state.vx[j];
        const ky = room.state.vy[i] - room.state.vy[j];
        const kz = room.state.vz[i] - room.state.vz[j];
        const p = 2 * (nx * kx + ny * ky + nz * kz) / 2;

        if (p > 0) {
          room.state.vx[i] -= p * nx * restitution;
          room.state.vy[i] -= p * ny * restitution;
          room.state.vz[i] -= p * nz * restitution;
          room.state.vx[j] += p * nx * restitution;
          room.state.vy[j] += p * ny * restitution;
          room.state.vz[j] += p * nz * restitution;
        }
      }
    }
  }
}

// Update rotating 3D box orientation
room.state.rotX += dt * spinRate * 0.47;
room.state.rotY += dt * spinRate * 0.73;
room.state.rotZ += dt * spinRate * 0.28;

const ax = room.state.rotX;
const ay = room.state.rotY;
const az = room.state.rotZ;

const c1 = Math.cos(ax), s1 = Math.sin(ax);
const c2 = Math.cos(ay), s2 = Math.sin(ay);
const c3 = Math.cos(az), s3 = Math.sin(az);

// Combined rotation matrix R = Rz * Ry * Rx
const r00 = c2 * c3;
const r01 = c3 * s1 * s2 - c1 * s3;
const r02 = c1 * c3 * s2 + s1 * s3;
const r10 = c2 * s3;
const r11 = c1 * c3 + s1 * s2 * s3;
const r12 = -c3 * s1 + c1 * s2 * s3;
const r20 = -s2;
const r21 = c2 * s1;
const r22 = c1 * c2;

const FOV = 800;
const CAM_DIST = 720;

// Transform and depth-sort balls
const rotatedZ = new Float32Array(count);
const screenX = new Float32Array(count);
const screenY = new Float32Array(count);
const screenScale = new Float32Array(count);

for (let i = 0; i < count; i++) {
  room.state.order[i] = i;
  const bx = room.state.px[i];
  const by = room.state.py[i];
  const bz = room.state.pz[i];

  const wx = r00 * bx + r01 * by + r02 * bz;
  const wy = r10 * bx + r11 * by + r12 * bz;
  const wz = r20 * bx + r21 * by + r22 * bz;

  rotatedZ[i] = wz;
  const zDist = CAM_DIST + wz;
  const persp = FOV / Math.max(80, zDist);
  screenX[i] = cx + wx * persp;
  screenY[i] = cy + wy * persp;
  screenScale[i] = persp;
}

// Insertion sort on order array by transformed Z (furthest to nearest)
for (let i = 1; i < count; i++) {
  const key = room.state.order[i];
  const keyZ = rotatedZ[key];
  let j = i - 1;
  while (j >= 0 && rotatedZ[room.state.order[j]] > keyZ) {
    room.state.order[j + 1] = room.state.order[j];
    j--;
  }
  room.state.order[j + 1] = key;
}

// Background: retro copper scanline tint
ctx.save();
ctx.fillStyle = '#06070e';
ctx.fillRect(0, 0, W, H);

// Subtle perspective grid on the floor
ctx.lineWidth = 1;
ctx.strokeStyle = 'rgba(40, 50, 80, 0.25)';
ctx.beginPath();
for (let gx = -BOX_SIZE * 1.6; gx <= BOX_SIZE * 1.6; gx += 70) {
  ctx.moveTo(cx + gx * 1.5, H);
  ctx.lineTo(cx + gx * 0.3, cy + BOX_SIZE * 0.9);
}
ctx.stroke();

// Cube vertices & edge definitions
const S = BOX_SIZE;
const corners = [
  [-S, -S, -S], [S, -S, -S], [S, S, -S], [-S, S, -S],
  [-S, -S, S],  [S, -S, S],  [S, S, S],  [-S, S, S]
];

const cScrX = new Float32Array(8);
const cScrY = new Float32Array(8);
const cRotZ = new Float32Array(8);

for (let i = 0; i < 8; i++) {
  const [vx, vy, vz] = corners[i];
  const wx = r00 * vx + r01 * vy + r02 * vz;
  const wy = r10 * vx + r11 * vy + r12 * vz;
  const wz = r20 * vx + r21 * vy + r22 * vz;
  cRotZ[i] = wz;
  const p = FOV / (CAM_DIST + wz);
  cScrX[i] = cx + wx * p;
  cScrY[i] = cy + wy * p;
}

const edges = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7]
];

// Render back edges of the bounding cage (z < 0)
for (let e = 0; e < 12; e++) {
  const i1 = edges[e][0];
  const i2 = edges[e][1];
  const midZ = (cRotZ[i1] + cRotZ[i2]) * 0.5;
  if (midZ <= 0) {
    ctx.beginPath();
    ctx.moveTo(cScrX[i1], cScrY[i1]);
    ctx.lineTo(cScrX[i2], cScrY[i2]);
    ctx.strokeStyle = `rgba(80, 110, 180, ${0.15 + audio.bass * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// Draw depth-sorted spheres
const sprites = room.state.sprites;
for (let o = 0; o < count; o++) {
  const idx = room.state.order[o];
  const sx = screenX[idx];
  const sy = screenY[idx];
  const rad = room.state.rad[idx];
  const scale = screenScale[idx];
  const drawR = rad * scale;
  const spr = sprites[room.state.col[idx]];

  if (spr && drawR > 1) {
    ctx.drawImage(spr, sx - drawR, sy - drawR, drawR * 2, drawR * 2);
  }
}

// Render front edges of the bounding cage (z > 0)
for (let e = 0; e < 12; e++) {
  const i1 = edges[e][0];
  const i2 = edges[e][1];
  const midZ = (cRotZ[i1] + cRotZ[i2]) * 0.5;
  if (midZ > 0) {
    const alpha = Math.min(1.0, 0.4 + (midZ / BOX_SIZE) * 0.5 + audio.treble * 0.3);
    ctx.beginPath();
    ctx.moveTo(cScrX[i1], cScrY[i1]);
    ctx.lineTo(cScrX[i2], cScrY[i2]);
    ctx.strokeStyle = `rgba(160, 210, 255, ${alpha})`;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
}

// Corner joint pips
for (let i = 0; i < 8; i++) {
  const pZ = cRotZ[i];
  const pAlpha = 0.3 + (pZ / BOX_SIZE) * 0.5 + (audio.beat ? 0.3 : 0);
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, Math.min(1, pAlpha))}`;
  ctx.beginPath();
  ctx.arc(cScrX[i], cScrY[i], 3.5, 0, Math.PI * 2);
  ctx.fill();
}

ctx.restore();