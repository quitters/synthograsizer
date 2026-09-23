ctx.save();
const W = frame.width;
const H = frame.height;

// Options
const style = getVar('grid_style') ?? 'checker';
const massCount = getVar('mass_count') ?? 4;
const scheme = getVar('color_scheme') ?? 'pulsar';
const warpMult = getVar('warp_intensity') ?? 1.0;

// Persistent buffers & preallocation (demoscene zero-GC rule)
const COLS = 54;
const ROWS = 36;
const TOTAL_VERTS = (COLS + 1) * (ROWS + 1);

if (!room.state.px || room.state.px.length !== TOTAL_VERTS) {
  room.state.px = new Float32Array(TOTAL_VERTS);
  room.state.py = new Float32Array(TOTAL_VERTS);
  room.state.pz = new Float32Array(TOTAL_VERTS);
  room.state.massX = new Float32Array(8);
  room.state.massY = new Float32Array(8);
  room.state.massZ = new Float32Array(8);
  room.state.massM = new Float32Array(8);
  room.state.pulse = 0;
}

// Acoustic punch accumulator
const bass = audio.bass ?? 0;
const beat = audio.beat ? 1.0 : 0;
room.state.pulse += (bass * 2.0 + beat * 0.5 - room.state.pulse) * Math.min(1.0, frame.dt * 12);

// Palette map
const palettes = {
  pulsar:  { bg: '#03020a', c1: '#110c2e', c2: '#00ffee', wire: '#88ffff', glow: '#ff2a8d' },
  vector:  { bg: '#000502', c1: '#001a0a', c2: '#003314', wire: '#20ff60', glow: '#a0ffa0' },
  monolith:{ bg: '#000000', c1: '#121212', c2: '#222222', wire: '#ffffff', glow: '#6699ff' },
  supernova:{ bg: '#080101', c1: '#260404', c2: '#4a0800', wire: '#ffaa33', glow: '#ff0044' }
};
const pal = palettes[scheme] ?? palettes.pulsar;

// Background
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Mass trajectory updates
const masses = Math.min(8, Math.max(1, massCount));
const t = frame.t;
const people = room.people || [];

for (let m = 0; m < masses; m++) {
  // Incorporate room.people if present
  const person = people[m % (people.length || 1)];
  const pHueOffset = person ? (person.hue / 360) * Math.PI * 2 : 0;
  const speed = 0.45 + m * 0.18;
  const phase = m * 1.57 + pHueOffset;
  
  room.state.massX[m] = Math.sin(t * speed + phase) * 2.2 + Math.cos(t * 0.23 + m) * 0.6;
  room.state.massZ[m] = 3.6 + Math.cos(t * speed * 0.8 + phase) * 1.8;
  room.state.massY[m] = Math.sin(t * 0.6 + phase) * 0.2;
  
  // Mass depth scales heavily with bass
  const baseM = 0.55 + 0.25 * Math.sin(t * 1.1 + m);
  room.state.massM[m] = (baseM + room.state.pulse * 0.9) * warpMult;
}

// 3D Grid Parameters (plane spanning z: 1.5 -> 7.0, x: -4.5 -> 4.5)
const xMin = -4.2, xMax = 4.2;
const zMin = 1.3, zMax = 6.8;
const fov = H * 0.95;
const cx = W * 0.5;
const cy = H * 0.38;
const planeBaseY = 0.85; // Baseline floor below camera

const px = room.state.px;
const py = room.state.py;
const pz = room.state.pz;

// Compute deformed vertex mesh
let idx = 0;
for (let r = 0; r <= ROWS; r++) {
  const v = r / ROWS;
  const gz = zMin + v * (zMax - zMin);
  for (let c = 0; c <= COLS; c++) {
    const u = c / COLS;
    const gx = xMin + u * (xMax - xMin);
    let gy = planeBaseY;

    // Gravitational lensing / spacetime depression
    for (let m = 0; m < masses; m++) {
      const dx = gx - room.state.massX[m];
      const dz = gz - room.state.massZ[m];
      const distSq = dx * dx + dz * dz + 0.08;
      gy += (room.state.massM[m] / distSq) * 0.58;
    }

    // Project to screen
    const invZ = 1.0 / (gz > 0.1 ? gz : 0.1);
    px[idx] = cx + gx * invZ * fov;
    py[idx] = cy + gy * invZ * fov;
    pz[idx] = gz;
    idx++;
  }
}

// Render Quads / Wireframes
const stride = COLS + 1;

if (style === 'checker' || style === 'hybrid') {
  for (let r = 0; r < ROWS; r++) {
    const rStride = r * stride;
    const nextRStride = (r + 1) * stride;
    for (let c = 0; c < COLS; c++) {
      const i0 = rStride + c;
      const i1 = rStride + c + 1;
      const i2 = nextRStride + c + 1;
      const i3 = nextRStride + c;

      const isEven = (r + c) % 2 === 0;
      ctx.fillStyle = isEven ? pal.c1 : pal.c2;

      ctx.beginPath();
      ctx.moveTo(px[i0], py[i0]);
      ctx.lineTo(px[i1], py[i1]);
      ctx.lineTo(px[i2], py[i2]);
      ctx.lineTo(px[i3], py[i3]);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// Grid lines
if (style === 'wireframe' || style === 'hybrid' || style === 'checker') {
  ctx.lineWidth = style === 'checker' ? 0.8 : 1.3;
  ctx.strokeStyle = pal.wire;
  ctx.globalAlpha = style === 'checker' ? 0.35 : 0.85;

  // Longitudinal lines
  for (let c = 0; c <= COLS; c += 2) {
    ctx.beginPath();
    ctx.moveTo(px[c], py[c]);
    for (let r = 1; r <= ROWS; r++) {
      const i = r * stride + c;
      ctx.lineTo(px[i], py[i]);
    }
    ctx.stroke();
  }

  // Latitudinal lines
  for (let r = 0; r <= ROWS; r += 2) {
    const rStride = r * stride;
    ctx.beginPath();
    ctx.moveTo(px[rStride], py[rStride]);
    for (let c = 1; c <= COLS; c++) {
      const i = rStride + c;
      ctx.lineTo(px[i], py[i]);
    }
    ctx.stroke();
  }
}

// Draw Event Horizons / Singularities at well centers
ctx.globalAlpha = 1.0;
for (let m = 0; m < masses; m++) {
  const mx = room.state.massX[m];
  const mz = room.state.massZ[m];
  const depth = (planeBaseY + (room.state.massM[m] / 0.08) * 0.58);
  const invZ = 1.0 / mz;
  const sx = cx + mx * invZ * fov;
  const sy = cy + depth * invZ * fov;
  const radius = Math.max(3, (32 * room.state.massM[m]) * invZ);

  // Halo
  const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 3.5);
  grad.addColorStop(0, pal.glow);
  grad.addColorStop(0.3, pal.wire);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  
  ctx.beginPath();
  ctx.arc(sx, sy, radius * 3.5, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Dark event core
  ctx.beginPath();
  ctx.arc(sx, sy, radius * 0.7, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = pal.wire;
  ctx.stroke();
}

// Subtle CRT horizon scanline vignette
ctx.fillStyle = 'rgba(0,0,0,0.18)';
for (let y = 0; y < H; y += 4) {
  ctx.fillRect(0, y, W, 1);
}

ctx.restore();