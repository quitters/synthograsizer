ctx.save();
const W = frame.width, H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// Lookups and Controls
const paletteChoice = getVar('palette') ?? 'Amiga Copper';
const numSlices = Math.floor(getVar('slices') ?? 40);
const twistLag = getVar('twist_lag') ?? 2.0;
const jellySpring = getVar('jelly_spring') ?? 1.5;
const styleChoice = getVar('shading_style') ?? 'Solid Shaded + Wire';
const scaleMultiplier = getVar('cube_scale') ?? 1.2;

// Persistent buffers & audio wobble spring
room.state.wobble ??= 0;
room.state.wobblePhase ??= 0;
const beatKick = (audio.beat ? 1.8 : 0) + (audio.bass || 0) * 0.9;
room.state.wobble += beatKick * 4.0 * dt;
room.state.wobble = Math.max(0, room.state.wobble - dt * 2.8);
room.state.wobblePhase += dt * (8.0 * jellySpring + (audio.mid || 0) * 4.0);

// Pre-allocated coordinate buffers in room.state
const maxVertices = 70 * 4;
if (!room.state.px || room.state.px.length < maxVertices) {
  room.state.px = new Float32Array(maxVertices);
  room.state.py = new Float32Array(maxVertices);
  room.state.pz = new Float32Array(maxVertices);
  room.state.nx = new Float32Array(maxVertices);
  room.state.ny = new Float32Array(maxVertices);
  room.state.nz = new Float32Array(maxVertices);
}
const px = room.state.px, py = room.state.py, pz = room.state.pz;
const nx = room.state.nx, ny = room.state.ny, nz = room.state.nz;

// Color palettes with base hues and Amiga copper style gradients
const palettes = {
  'Amiga Copper': { bg1: '#0a0014', bg2: '#200530', copper: [290, 330, 20], baseHue: 320, sat: 85 },
  'Cyberpunk Neon': { bg1: '#020612', bg2: '#0b162c', copper: [185, 290, 160], baseHue: 190, sat: 90 },
  'Monochrome Phosphor': { bg1: '#030a04', bg2: '#081c0c', copper: [120, 135, 110], baseHue: 130, sat: 80 },
  'Sunburst Gold': { bg1: '#120700', bg2: '#281402', copper: [35, 50, 15], baseHue: 42, sat: 95 },
  'Acid Emerald': { bg1: '#010c08', bg2: '#062016', copper: [155, 175, 80], baseHue: 160, sat: 85 }
};
const pal = palettes[paletteChoice] || palettes['Amiga Copper'];

// Background: Raster copper bars backdrop
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, pal.bg1);
bgGrad.addColorStop(0.5, pal.bg2);
bgGrad.addColorStop(1, pal.bg1);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Subtle retro demoscene horizontal raster stripes
ctx.lineWidth = 1;
const copperY = (t * 60) % 24;
ctx.fillStyle = `hsla(${pal.copper[0]}, 60%, 50%, 0.035)`;
for (let y = copperY; y < H; y += 24) {
  ctx.fillRect(0, y, W, 10);
}

// Cube geometry parameters
const halfSize = Math.min(W, H) * 0.22 * scaleMultiplier;
const baseAngleY = t * 1.35;
const tiltX = 0.35 + Math.sin(t * 0.8) * 0.15;
const tiltZ = Math.cos(t * 0.6) * 0.2;
const cosX = Math.cos(tiltX), sinX = Math.sin(tiltX);
const cosZ = Math.cos(tiltZ), sinZ = Math.sin(tiltZ);
const cx = W * 0.5, cy = H * 0.52;
const camDist = 900;

// Normalized corner offsets for square cross section
const cornerX = [-1, 1, 1, -1];
const cornerZ = [-1, -1, 1, 1];

// Compute vertices slice by slice
for (let i = 0; i <= numSlices; i++) {
  const vRatio = i / numSlices; // 0 (top) to 1 (bottom)
  const yLocal = (1.0 - 2.0 * vRatio) * halfSize;

  // Lagged rotation and damped sinusoidal wobble traveling down the cube
  const lagAngle = vRatio * twistLag * (1.1 + (audio.mid || 0) * 0.5);
  const wobbleWave = Math.sin(room.state.wobblePhase - vRatio * 4.2) * room.state.wobble * 0.45;
  const angleY = baseAngleY - lagAngle + wobbleWave;

  const cosY = Math.cos(angleY), sinY = Math.sin(angleY);
  const idxOffset = i * 4;

  for (let c = 0; c < 4; c++) {
    const lx = cornerX[c] * halfSize;
    const lz = cornerZ[c] * halfSize;

    // Rotate around Y (with scanline twist)
    const x1 = lx * cosY - lz * sinY;
    const z1 = lx * sinY + lz * cosY;
    const y1 = yLocal;

    // Rotate around X (tilt)
    const y2 = y1 * cosX - z1 * sinX;
    const z2 = y1 * sinX + z1 * cosX;

    // Rotate around Z (roll)
    const x3 = x1 * cosZ - y2 * sinZ;
    const y3 = x1 * sinZ + y2 * cosZ;
    const z3 = z2;

    // Perspective projection
    const scale = camDist / (camDist + z3 + halfSize * 1.5);
    const vi = idxOffset + c;
    px[vi] = cx + x3 * scale;
    py[vi] = cy + y3 * scale;
    pz[vi] = z3;
    nx[vi] = x3;
    ny[vi] = y3;
    nz[vi] = z3;
  }
}

// Light vector (upper left, pointing towards camera)
const lx = -0.577, ly = -0.577, lz = 0.577;

// Render slices: painter's order determined by global tiltX
const startSlice = tiltX > 0 ? 0 : numSlices - 1;
const endSlice = tiltX > 0 ? numSlices : -1;
const stepSlice = tiltX > 0 ? 1 : -1;

// Draw top or bottom cap if visible
function drawCap(sliceIndex, isTop) {
  const off = sliceIndex * 4;
  // Screen space winding check
  const cp = (px[off + 1] - px[off]) * (py[off + 2] - py[off]) -
             (py[off + 1] - py[off]) * (px[off + 2] - px[off]);
  if ((isTop && cp > 0) || (!isTop && cp < 0)) {
    ctx.beginPath();
    ctx.moveTo(px[off], py[off]);
    for (let c = 1; c < 4; c++) ctx.lineTo(px[off + c], py[off + c]);
    ctx.closePath();
    const capNormY = isTop ? 1 : -1;
    const normY3D = capNormY * cosX;
    const normZ3D = capNormY * sinX;
    const dot = Math.max(0, -(normY3D * ly + normZ3D * lz));
    const lum = 35 + dot * 45;
    const capHue = (pal.baseHue + (isTop ? 20 : -20) + 360) % 360;
    if (styleChoice !== 'Vector Outlines') {
      ctx.fillStyle = `hsl(${capHue}, ${pal.sat}%, ${lum}%)`;
      ctx.fill();
    }
    ctx.strokeStyle = `hsla(${capHue}, 90%, 80%, 0.8)`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}

if (tiltX <= 0) drawCap(0, true);

// Side quadrilaterals
for (let i = startSlice; i !== endSlice; i += stepSlice) {
  if (i >= numSlices) continue;
  const i0 = i * 4;
  const i1 = (i + 1) * 4;
  const vNorm = i / numSlices;

  for (let c = 0; c < 4; c++) {
    const nextC = (c + 1) % 4;
    const p0 = i0 + c;
    const p1 = i0 + nextC;
    const p2 = i1 + nextC;
    const p3 = i1 + c;

    // Screen cross-product for backface culling
    const cross = (px[p1] - px[p0]) * (py[p2] - py[p0]) - (py[p1] - py[p0]) * (px[p2] - px[p0]);
    if (cross <= 0) continue; // culled

    // 3D face normal calculation
    const uX = nx[p1] - nx[p0], uY = ny[p1] - ny[p0], uZ = nz[p1] - nz[p0];
    const vX = nx[p3] - nx[p0], vY = ny[p3] - ny[p0], vZ = nz[p3] - nz[p0];
    let normX = uY * vZ - uZ * vY;
    let normY = uZ * vX - uX * vZ;
    let normZ = uX * vY - uY * vX;
    const len = Math.hypot(normX, normY, normZ) || 1;
    normX /= len; normY /= len; normZ /= len;

    const diffuse = Math.max(0, -(normX * lx + normY * ly + normZ * lz));
    const faceHue = (pal.baseHue + c * 38 + vNorm * 35) % 360;
    const lightness = 22 + diffuse * 50 + (audio.level || 0) * 15;

    ctx.beginPath();
    ctx.moveTo(px[p0], py[p0]);
    ctx.lineTo(px[p1], py[p1]);
    ctx.lineTo(px[p2], py[p2]);
    ctx.lineTo(px[p3], py[p3]);
    ctx.closePath();

    if (styleChoice === 'Flat Facets' || styleChoice === 'Solid Shaded + Wire' || styleChoice === 'CRT Scanlines') {
      ctx.fillStyle = `hsl(${faceHue}, ${pal.sat}%, ${lightness}%)`;
      ctx.fill();
    }

    if (styleChoice === 'Solid Shaded + Wire' || styleChoice === 'Vector Outlines') {
      ctx.strokeStyle = `hsla(${(faceHue + 25) % 360}, 95%, ${Math.min(95, lightness + 30)}%, 0.75)`;
      ctx.lineWidth = styleChoice === 'Vector Outlines' ? 2.0 : 1.0;
      ctx.stroke();
    } else if (styleChoice === 'CRT Scanlines') {
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fill();
      }
    }
  }
}

if (tiltX > 0) drawCap(0, true);
if (tiltX < 0) drawCap(numSlices, false);

// Room connection markers: demoparty sparks orbiting the wobbly rubber core
if (room.people && room.people.length > 0) {
  ctx.save();
  const pCount = room.people.length;
  for (let idx = 0; idx < pCount; idx++) {
    const p = room.people[idx];
    const orbAngle = t * 1.5 + (idx / pCount) * Math.PI * 2;
    const orbRadius = halfSize * (1.65 + Math.sin(t * 2 + idx) * 0.15);
    const orbHeight = Math.sin(t * 1.8 + idx * 1.3) * halfSize * 0.9;
    const ox = cx + Math.cos(orbAngle) * orbRadius;
    const oy = cy + orbHeight;
    const pColor = `hsl(${p.hue % 360}, 90%, 65%)`;

    ctx.beginPath();
    ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = pColor;
    ctx.shadowColor = pColor;
    ctx.shadowBlur = 10;
    ctx.fill();
  }
  ctx.restore();
}

ctx.restore();