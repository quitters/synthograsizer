ctx.save();

const knotType = getVar('knot_type') ?? 'trefoil_2_3';
const paletteTheme = getVar('palette_theme') ?? 'amiga_copper';
const shadingStyle = getVar('shading_style') ?? 'flat_retro';
const speed = getVar('rotation_speed') ?? 1.0;
const tubeThick = getVar('tube_thickness') ?? 0.45;
const bloom = getVar('bloom_intensity') ?? 0.4;

const PALETTES = {
  amiga_copper: [
    '#0a0514', '#150a26', '#260d3f', '#3c0f59',
    '#58136e', '#781977', '#9c246f', '#be345a',
    '#d9493a', '#ec651b', '#f6860d', '#faa917',
    '#fccb2c', '#fde654', '#fef48a', '#ffffff'
  ],
  cyber_neon: [
    '#040516', '#08112e', '#0b2349', '#0d3d69',
    '#0d5e89', '#0d819e', '#12a6a8', '#20c99f',
    '#44e68e', '#77f573', '#b3fa4f', '#f5ea38',
    '#fa9c3b', '#fa4a5f', '#f91d8e', '#ffffff'
  ],
  monochrome_amber: [
    '#100700', '#220d00', '#361500', '#4d1e00',
    '#662800', '#823400', '#a04200', '#bf5200',
    '#de6403', '#f27a0d', '#fa931c', '#fcac33',
    '#fdc651', '#fee07b', '#fff2ac', '#ffffff'
  ],
  vga_twilight: [
    '#060614', '#0d0d26', '#17143d', '#251b58',
    '#392070', '#502484', '#6a2892', '#832d97',
    '#963c96', '#9c539a', '#9470aa', '#8396c0',
    '#74bed8', '#7de4ea', '#b1f7f9', '#ffffff'
  ]
};
const pal = PALETTES[paletteTheme] ?? PALETTES.amiga_copper;

// Mesh geometry configuration
const NU = 64;
const NV = 8;
const NUM_VERTS = NU * NV;
const NUM_QUADS = NU * NV;

// Persistent buffers in room.state
room.state.baseVerts ??= new Float32Array(NUM_VERTS * 3);
room.state.screenVerts ??= new Float32Array(NUM_VERTS * 3);
room.state.quads ??= new Int32Array(NUM_QUADS * 4);
room.state.visDepths ??= new Float32Array(NUM_QUADS);
room.state.visShades ??= new Uint8Array(NUM_QUADS);
room.state.visOrder ??= [];
room.state.rotX ??= 0.35;
room.state.rotY ??= 0.25;
room.state.rotZ ??= 0.1;

// Recompute parametric knot frame if configuration changed
if (room.state.loadedKnot !== knotType || room.state.loadedThick !== tubeThick) {
  room.state.loadedKnot = knotType;
  room.state.loadedThick = tubeThick;

  let p = 2, q = 3;
  if (knotType === 'cinquefoil_2_5') { p = 2; q = 5; }
  else if (knotType === 'star_3_4') { p = 3; q = 4; }
  else if (knotType === 'septafoliate_3_5') { p = 3; q = 5; }

  const twoPi = Math.PI * 2;
  const cX = new Float32Array(NU + 1);
  const cY = new Float32Array(NU + 1);
  const cZ = new Float32Array(NU + 1);
  const tX = new Float32Array(NU + 1);
  const tY = new Float32Array(NU + 1);
  const tZ = new Float32Array(NU + 1);

  for (let i = 0; i <= NU; i++) {
    const u = (i % NU) * (twoPi / NU);
    const r = Math.cos(q * u) + 2.1;
    cX[i] = r * Math.cos(p * u);
    cY[i] = r * Math.sin(p * u);
    cZ[i] = -Math.sin(q * u) * 1.45;

    const dr = -q * Math.sin(q * u);
    let tx = dr * Math.cos(p * u) - p * r * Math.sin(p * u);
    let ty = dr * Math.sin(p * u) + p * r * Math.cos(p * u);
    let tz = -1.45 * q * Math.cos(q * u);
    const tl = Math.hypot(tx, ty, tz) || 1;
    tX[i] = tx / tl; tY[i] = ty / tl; tZ[i] = tz / tl;
  }

  const nX = new Float32Array(NU + 1);
  const nY = new Float32Array(NU + 1);
  const nZ = new Float32Array(NU + 1);
  const bX = new Float32Array(NU + 1);
  const bY = new Float32Array(NU + 1);
  const bZ = new Float32Array(NU + 1);

  let ax = 0, ay = 0, az = 1;
  if (Math.abs(tZ[0]) > 0.85) { ax = 0; ay = 1; az = 0; }
  const d0 = ax * tX[0] + ay * tY[0] + az * tZ[0];
  let inx = ax - d0 * tX[0], iny = ay - d0 * tY[0], inz = az - d0 * tZ[0];
  const inl = Math.hypot(inx, iny, inz) || 1;
  nX[0] = inx / inl; nY[0] = iny / inl; nZ[0] = inz / inl;
  bX[0] = tY[0] * nZ[0] - tZ[0] * nY[0];
  bY[0] = tZ[0] * nX[0] - tX[0] * nZ[0];
  bZ[0] = tX[0] * nY[0] - tY[0] * nX[0];

  for (let i = 1; i <= NU; i++) {
    const t0x = tX[i - 1], t0y = tY[i - 1], t0z = tZ[i - 1];
    const t1x = tX[i], t1y = tY[i], t1z = tZ[i];
    let vx = t0y * t1z - t0z * t1y;
    let vy = t0z * t1x - t0x * t1z;
    let vz = t0x * t1y - t0y * t1x;
    const vl = Math.hypot(vx, vy, vz);
    if (vl > 1e-6) {
      vx /= vl; vy /= vl; vz /= vl;
      const c = Math.max(-1, Math.min(1, t0x * t1x + t0y * t1y + t0z * t1z));
      const s = Math.sqrt(Math.max(0, 1 - c * c));
      const px = nX[i - 1], py = nY[i - 1], pz = nZ[i - 1];
      const vdp = vx * px + vy * py + vz * pz;
      const cxpx = vy * pz - vz * py;
      const cxpy = vz * px - vx * pz;
      const cxpz = vx * py - vy * px;
      nX[i] = px * c + cxpx * s + vx * vdp * (1 - c);
      nY[i] = py * c + cxpy * s + vy * vdp * (1 - c);
      nZ[i] = pz * c + cxpz * s + vz * vdp * (1 - c);
    } else {
      nX[i] = nX[i - 1]; nY[i] = nY[i - 1]; nZ[i] = nZ[i - 1];
    }
    const d = nX[i] * t1x + nY[i] * t1y + nZ[i] * t1z;
    nX[i] -= d * t1x; nY[i] -= d * t1y; nZ[i] -= d * t1z;
    const nl = Math.hypot(nX[i], nY[i], nZ[i]) || 1;
    nX[i] /= nl; nY[i] /= nl; nZ[i] /= nl;
    bX[i] = t1y * nZ[i] - t1z * nY[i];
    bY[i] = t1z * nX[i] - t1x * nZ[i];
    bZ[i] = t1x * nY[i] - t1y * nX[i];
  }

  const dotClose = Math.max(-1, Math.min(1, nX[0] * nX[NU] + nY[0] * nY[NU] + nZ[0] * nZ[NU]));
  let twist = Math.acos(dotClose);
  if (bX[0] * nX[NU] + bY[0] * nY[NU] + bZ[0] * nZ[NU] < 0) twist = -twist;

  for (let i = 0; i < NU; i++) {
    const ang = -twist * (i / NU);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const nx = nX[i], ny = nY[i], nz = nZ[i];
    const bx = bX[i], by = bY[i], bz = bZ[i];
    nX[i] = nx * ca - bx * sa;
    nY[i] = ny * ca - by * sa;
    nZ[i] = nz * ca - bz * sa;
    bX[i] = nx * sa + bx * ca;
    bY[i] = ny * sa + by * ca;
    bZ[i] = nz * sa + bz * ca;
  }

  const bVerts = room.state.baseVerts;
  for (let i = 0; i < NU; i++) {
    const cx = cX[i], cy = cY[i], cz = cZ[i];
    const nx = nX[i], ny = nY[i], nz = nZ[i];
    const bx = bX[i], by = bY[i], bz = bZ[i];
    for (let j = 0; j < NV; j++) {
      const v = j * (twoPi / NV);
      const cv = Math.cos(v), sv = Math.sin(v);
      const vIdx = (i * NV + j) * 3;
      bVerts[vIdx]     = cx + tubeThick * (cv * nx + sv * bx);
      bVerts[vIdx + 1] = cy + tubeThick * (cv * ny + sv * by);
      bVerts[vIdx + 2] = cz + tubeThick * (cv * nz + sv * bz);
    }
  }

  const quads = room.state.quads;
  let qIdx = 0;
  for (let i = 0; i < NU; i++) {
    const nextI = (i + 1) % NU;
    for (let j = 0; j < NV; j++) {
      const nextJ = (j + 1) % NV;
      quads[qIdx]     = i * NV + j;
      quads[qIdx + 1] = i * NV + nextJ;
      quads[qIdx + 2] = nextI * NV + nextJ;
      quads[qIdx + 3] = nextI * NV + j;
      qIdx += 4;
    }
  }
}

// Frame update & rotation
const dt = Math.min(frame.dt || 0.016, 0.05);
const spd = speed * (1.0 + (audio?.bass ?? 0) * 0.45);
room.state.rotX += 0.42 * spd * dt;
room.state.rotY += 0.72 * spd * dt;
room.state.rotZ += (0.24 * spd + (audio?.beat ? 0.05 : 0)) * dt;

// Rotation matrix components
const cx = Math.cos(room.state.rotX), sx = Math.sin(room.state.rotX);
const cy = Math.cos(room.state.rotY), sy = Math.sin(room.state.rotY);
const cz = Math.cos(room.state.rotZ), sz = Math.sin(room.state.rotZ);
const m00 = cy * cz;
const m01 = sx * sy * cz - cx * sz;
const m02 = cx * sy * cz + sx * sz;
const m10 = cy * sz;
const m11 = sx * sy * sz + cx * cz;
const m12 = cx * sy * sz - sx * cz;
const m20 = -sy;
const m21 = sx * cy;
const m22 = cx * cy;

// Screen projection
const scale = Math.min(frame.width, frame.height) * 0.165 * (1.0 + (audio?.bass ?? 0) * 0.1);
const hw = frame.width * 0.5;
const hh = frame.height * 0.5;
const bVerts = room.state.baseVerts;
const sVerts = room.state.screenVerts;

for (let i = 0; i < NUM_VERTS; i++) {
  const idx = i * 3;
  const x = bVerts[idx], y = bVerts[idx + 1], z = bVerts[idx + 2];
  const rx = m00 * x + m01 * y + m02 * z;
  const ry = m10 * x + m11 * y + m12 * z;
  const rz = m20 * x + m21 * y + m22 * z;
  const p = 12.0 / (14.0 + rz);
  sVerts[idx]     = hw + rx * scale * p;
  sVerts[idx + 1] = hh + ry * scale * p;
  sVerts[idx + 2] = rz;
}

// Directional light vector
let lx = 0.55, ly = -0.65, lz = -0.52;
const llen = Math.hypot(lx, ly, lz);
lx /= llen; ly /= llen; lz /= llen;

// Backface culling, normal calculation, and lighting
const quads = room.state.quads;
const visOrder = room.state.visOrder;
const visDepths = room.state.visDepths;
const visShades = room.state.visShades;
let visCount = 0;

for (let q = 0; q < NUM_QUADS; q++) {
  const qBase = q * 4;
  const i0 = quads[qBase] * 3;
  const i1 = quads[qBase + 1] * 3;
  const i3 = quads[qBase + 3] * 3;

  // Transformed 3D vectors from quad corner
  const ax = sVerts[i1] - sVerts[i0];
  const ay = sVerts[i1 + 1] - sVerts[i0 + 1];
  const az = sVerts[i1 + 2] - sVerts[i0 + 2];

  const bx = sVerts[i3] - sVerts[i0];
  const by = sVerts[i3 + 1] - sVerts[i0 + 1];
  const bz = sVerts[i3 + 2] - sVerts[i0 + 2];

  // View-space normal (cross product A x B)
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;

  // Backface cull: reject if pointing away from camera
  if (nz >= 0) continue;

  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;

  const dot = Math.max(0, nx * lx + ny * ly + nz * lz);
  const spec = Math.pow(Math.max(0, -nz), 6) * 0.3;
  const lightLevel = 0.08 + dot * 0.78 + spec + (audio?.bass ?? 0) * 0.12;
  const shade = Math.min(15, Math.max(0, Math.floor(lightLevel * 15.99)));

  const i2 = quads[qBase + 2] * 3;
  visDepths[q] = (sVerts[i0 + 2] + sVerts[i1 + 2] + sVerts[i2 + 2] + sVerts[i3 + 2]) * 0.25;
  visShades[q] = shade;
  visOrder[visCount++] = q;
}

// Painter's algorithm: sort visible faces back-to-front (furthest Z first)
visOrder.length = visCount;
visOrder.sort((a, b) => visDepths[b] - visDepths[a]);

// Clear canvas with demoscene vignette background
const bgGrad = ctx.createRadialGradient(hw, hh, scale * 0.2, hw, hh, Math.hypot(hw, hh));
bgGrad.addColorStop(0, '#100b20');
bgGrad.addColorStop(0.65, '#05030a');
bgGrad.addColorStop(1, '#000000');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

// Faint copper raster bars in backdrop
const numBars = 12;
const barHeight = frame.height / numBars;
for (let b = 0; b < numBars; b++) {
  const barY = b * barHeight;
  const wave = Math.sin(frame.t * 1.5 + b * 0.6) * 0.5 + 0.5;
  const colIdx = Math.floor(wave * 5);
  ctx.fillStyle = pal[colIdx];
  ctx.globalAlpha = 0.045 + (audio?.mid ?? 0) * 0.04;
  ctx.fillRect(0, barY, frame.width, barHeight * 0.5);
}
ctx.globalAlpha = 1.0;

// Subtle bloom halo behind the knot
if (bloom > 0.05) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const bloomGrad = ctx.createRadialGradient(hw, hh, scale * 0.4, hw, hh, scale * 2.8);
  bloomGrad.addColorStop(0, pal[Math.min(15, 6 + Math.floor((audio?.bass ?? 0) * 4))]);
  bloomGrad.addColorStop(1, 'transparent');
  ctx.globalAlpha = bloom * (0.22 + (audio?.level ?? 0) * 0.2);
  ctx.fillStyle = bloomGrad;
  ctx.beginPath();
  ctx.arc(hw, hh, scale * 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Render sorted polygons
for (let i = 0; i < visCount; i++) {
  const q = visOrder[i];
  const qBase = q * 4;
  const idx0 = quads[qBase] * 3;
  const idx1 = quads[qBase + 1] * 3;
  const idx2 = quads[qBase + 2] * 3;
  const idx3 = quads[qBase + 3] * 3;

  const shade = visShades[q];
  const color = pal[shade];

  ctx.beginPath();
  ctx.moveTo(sVerts[idx0], sVerts[idx0 + 1]);
  ctx.lineTo(sVerts[idx1], sVerts[idx1 + 1]);
  ctx.lineTo(sVerts[idx2], sVerts[idx2 + 1]);
  ctx.lineTo(sVerts[idx3], sVerts[idx3 + 1]);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  if (shadingStyle === 'wire_on_flat') {
    ctx.strokeStyle = pal[Math.min(15, shade + 3)];
    ctx.lineWidth = 1.0;
    ctx.stroke();
  } else if (shadingStyle === 'dither_specular') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    if (shade >= 14) {
      const cx = (sVerts[idx0] + sVerts[idx2]) * 0.5;
      const cy = (sVerts[idx0 + 1] + sVerts[idx2 + 1]) * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
  } else {
    // Clean retro facet seal to eliminate sub-pixel seam cracks
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

// Room people presence: orbiting retro light sprites
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 32);
  for (let k = 0; k < pCount; k++) {
    const p = room.people[k];
    const angle = frame.t * 0.6 + (k / pCount) * Math.PI * 2;
    const orbRadius = 4.8 + Math.sin(frame.t * 1.2 + k) * 0.8;
    const ox = Math.cos(angle) * orbRadius;
    const oy = Math.sin(angle * 1.5) * 1.6;
    const oz = Math.sin(angle) * orbRadius;

    const rx = m00 * ox + m01 * oy + m02 * oz;
    const ry = m10 * ox + m11 * oy + m12 * oz;
    const rz = m20 * ox + m21 * oy + m22 * oz;
    const persp = 12.0 / (14.0 + rz);
    const px = hw + rx * scale * persp;
    const py = hh + ry * scale * persp;

    const size = Math.max(2, (rz < 0 ? 5 : 2.5) * persp);
    ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
    ctx.fillRect(px - size * 0.5, py - size * 0.5, size, size);
  }
}

// Retro CRT scanline texture
ctx.fillStyle = '#000000';
ctx.globalAlpha = 0.12;
for (let y = 0; y < frame.height; y += 4) {
  ctx.fillRect(0, y, frame.width, 1);
}
ctx.globalAlpha = 1.0;

// Demoparty HUD overlay
ctx.fillStyle = pal[11];
ctx.font = '11px monospace';
ctx.fillText('16-COL TORUS KNOT // 512 FACES // 60 FPS', 24, frame.height - 24);

// Audio VU indicator bars
const vuX = frame.width - 140;
const vuY = frame.height - 24;
const vuLevels = [audio?.bass ?? 0, audio?.mid ?? 0, audio?.treble ?? 0];
for (let v = 0; v < 3; v++) {
  const h = Math.max(3, vuLevels[v] * 18);
  ctx.fillStyle = pal[6 + v * 3];
  ctx.fillRect(vuX + v * 28, vuY - h, 18, h);
}

ctx.restore();