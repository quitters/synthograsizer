ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const minDim = Math.min(W, H);

// --- Variable unpacking ---
const speedMult = getVar('spin_speed') ?? 1.0;
const tubeRatio = getVar('torus_fatness') ?? 0.45;
const shine = getVar('specular_shine') ?? 24;
const audioScale = getVar('audio_pulse') ?? 1.0;
const palName = getVar('palette') ?? 'chrome';
const shadeStyle = getVar('shading_style') ?? 'smooth_gouraud';
const wireMode = getVar('wire_overlay') ?? 'off';
const backMode = getVar('backdrop') ?? 'void';

// --- Persistent mesh & preallocations ---
const NU = 32;
const NV = 16;
const TOTAL_VERTS = NU * NV;
const TOTAL_QUADS = NU * NV;

if (!room.state.initialized || room.state.nu !== NU || room.state.nv !== NV) {
  room.state.initialized = true;
  room.state.nu = NU;
  room.state.nv = NV;
  room.state.angX = 0.4;
  room.state.angY = 0.6;
  room.state.angZ = 0.0;
  room.state.vx = new Float32Array(TOTAL_VERTS);
  room.state.vy = new Float32Array(TOTAL_VERTS);
  room.state.vz = new Float32Array(TOTAL_VERTS);
  room.state.nx = new Float32Array(TOTAL_VERTS);
  room.state.ny = new Float32Array(TOTAL_VERTS);
  room.state.nz = new Float32Array(TOTAL_VERTS);
  room.state.sx = new Float32Array(TOTAL_VERTS);
  room.state.sy = new Float32Array(TOTAL_VERTS);
  room.state.diffuse = new Float32Array(TOTAL_VERTS);
  room.state.spec = new Float32Array(TOTAL_VERTS);

  // Preallocate quads array of objects to sort without allocation
  const quads = [];
  for (let u = 0; u < NU; u++) {
    const nextU = (u + 1) % NU;
    for (let v = 0; v < NV; v++) {
      const nextV = (v + 1) % NV;
      const i0 = u * NV + v;
      const i1 = nextU * NV + v;
      const i2 = nextU * NV + nextV;
      const i3 = u * NV + nextV;
      quads.push({ i0, i1, i2, i3, depth: 0 });
    }
  }
  room.state.quads = quads;
}

// --- Time & Audio Step ---
const dt = frame.dt || 0.016;
const bassBump = (audio.bass || 0) * audioScale;
const trebleBump = (audio.treble || 0) * audioScale;
const beatKick = audio.beat ? 0.06 : 0.0;

room.state.angX += (0.45 * speedMult + trebleBump * 0.3) * dt;
room.state.angY += (0.75 * speedMult + bassBump * 0.4 + beatKick) * dt;
room.state.angZ += (0.22 * speedMult) * dt;

// People presence factor: room attendees subtly adjust rim light tint
let attendeeHue = 200;
if (room.people && room.people.length > 0) {
  const firstPerson = room.people[0];
  if (typeof firstPerson.hue === 'number') {
    attendeeHue = firstPerson.hue;
  }
}

// --- Backdrop Rendering ---
ctx.fillStyle = '#05070d';
ctx.fillRect(0, 0, W, H);

if (backMode === 'grid') {
  ctx.save();
  ctx.strokeStyle = 'rgba(70, 110, 170, 0.18)';
  ctx.lineWidth = 1;
  const gridSpacing = 48;
  ctx.beginPath();
  for (let x = (frame.t * 20) % gridSpacing; x < W; x += gridSpacing) {
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
  }
  for (let y = (frame.t * 20) % gridSpacing; y < H; y += gridSpacing) {
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();
} else if (backMode === 'horizon') {
  const grad = ctx.createLinearGradient(0, H * 0.4, 0, H);
  grad.addColorStop(0, '#05070d');
  grad.addColorStop(0.5, '#180a2a');
  grad.addColorStop(1, '#34103f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H * 0.4, W, H * 0.6);
  ctx.strokeStyle = 'rgba(230, 90, 180, 0.28)';
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const y = H * 0.55 + Math.pow(i / 8, 2) * (H * 0.45);
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();
} else if (backMode === 'nebula') {
  const nGrad = ctx.createRadialGradient(cx, cy, minDim * 0.1, cx, cy, minDim * 0.75);
  nGrad.addColorStop(0, 'rgba(50, 20, 90, 0.45)');
  nGrad.addColorStop(0.6, 'rgba(10, 30, 60, 0.25)');
  nGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = nGrad;
  ctx.fillRect(0, 0, W, H);
}

// --- Torus Geometry computation ---
const R = minDim * 0.30 * (1.0 + bassBump * 0.12);
const r = R * tubeRatio * (1.0 + Math.sin(frame.t * 1.5) * 0.04);
const fov = minDim * 1.2;
const camDist = minDim * 1.05;

// Euler rotation matrix elements
const ax = room.state.angX;
const ay = room.state.angY;
const az = room.state.angZ;
const cx0 = Math.cos(ax), sx0 = Math.sin(ax);
const cy0 = Math.cos(ay), sy0 = Math.sin(ay);
const cz0 = Math.cos(az), sz0 = Math.sin(az);

// Combined rotation matrix R = Rz * Ry * Rx
const m00 = cz0 * cy0;
const m01 = cz0 * sy0 * sx0 - sz0 * cx0;
const m02 = cz0 * sy0 * cx0 + sz0 * sx0;
const m10 = sz0 * cy0;
const m11 = sz0 * sy0 * sx0 + cz0 * cx0;
const m12 = sz0 * sy0 * cx0 - cz0 * sx0;
const m20 = -sy0;
const m21 = cy0 * sx0;
const m22 = cy0 * cx0;

// Light direction in world/view space (normalized)
let lx = 0.55;
let ly = -0.70;
let lz = 0.45;
const lLen = Math.hypot(lx, ly, lz);
lx /= lLen; ly /= lLen; lz /= lLen;

// Blinn-Phong halfway vector with view (0, 0, 1)
let hx = lx, hy = ly, hz = lz + 1.0;
const hLen = Math.hypot(hx, hy, hz);
hx /= hLen; hy /= hLen; hz /= hLen;

const vxArr = room.state.vx;
const vyArr = room.state.vy;
const vzArr = room.state.vz;
const sxArr = room.state.sx;
const syArr = room.state.sy;
const diffArr = room.state.diffuse;
const specArr = room.state.spec;

const twoPi = Math.PI * 2;

// Vertex calculation, rotation, lighting, and screen projection
let idx = 0;
for (let u = 0; u < NU; u++) {
  const theta = (u / NU) * twoPi;
  const cosU = Math.cos(theta);
  const sinU = Math.sin(theta);

  for (let v = 0; v < NV; v++) {
    const phi = (v / NV) * twoPi;
    const cosV = Math.cos(phi);
    const sinV = Math.sin(phi);

    // Torus surface coordinates (unrotated)
    const ox = (R + r * cosV) * cosU;
    const oy = (R + r * cosV) * sinU;
    const oz = r * sinV;

    // Surface normal (unrotated unit vector)
    const onx = cosV * cosU;
    const ony = cosV * sinU;
    const onz = sinV;

    // Rotate position
    const rx = m00 * ox + m01 * oy + m02 * oz;
    const ry = m10 * ox + m11 * oy + m12 * oz;
    const rz = m20 * ox + m21 * oy + m22 * oz;

    // Rotate normal
    const rnx = m00 * onx + m01 * ony + m02 * onz;
    const rny = m10 * onx + m11 * ony + m12 * onz;
    const rnz = m20 * onx + m21 * ony + m22 * onz;

    // Project to screen
    const zTotal = rz + camDist;
    const invZ = fov / (zTotal > 1 ? zTotal : 1);
    vxArr[idx] = rx;
    vyArr[idx] = ry;
    vzArr[idx] = rz;
    sxArr[idx] = cx + rx * invZ;
    syArr[idx] = cy + ry * invZ;

    // Lighting (Lambertian diffuse + Blinn-Phong specular)
    const nDotL = rnx * lx + rny * ly + rnz * lz;
    const diff = nDotL > 0 ? nDotL : 0;
    diffArr[idx] = diff;

    if (nDotL > 0) {
      const nDotH = rnx * hx + rny * hy + rnz * hz;
      specArr[idx] = nDotH > 0 ? Math.pow(nDotH, shine) : 0;
    } else {
      specArr[idx] = 0;
    }

    idx++;
  }
}

// --- Painter's sort of quads by average depth ---
const quads = room.state.quads;
for (let i = 0; i < TOTAL_QUADS; i++) {
  const q = quads[i];
  q.depth = vzArr[q.i0] + vzArr[q.i1] + vzArr[q.i2] + vzArr[q.i3];
}
quads.sort((a, b) => a.depth - b.depth);

// --- Palette definition helper ---
function getPaletteColor(diff, spec, paramU) {
  let rCol, gCol, bCol;
  if (palName === 'chrome') {
    // Metallic cool-cyan with searing bright specular
    const base = 0.08 + diff * 0.72;
    rCol = base * 200 + spec * 255;
    gCol = base * 225 + spec * 255;
    bCol = base * 255 + spec * 255;
  } else if (palName === 'synthwave') {
    // Magenta darks, cyan mids, hot-white highlight
    rCol = (0.25 + diff * 0.75) * 245 + spec * 255;
    gCol = (0.05 + diff * 0.50) * 140 + spec * 240;
    bCol = (0.40 + diff * 0.60) * 255 + spec * 255;
  } else if (palName === 'copper') {
    // Burnished amber and gleaming copper
    rCol = (0.15 + diff * 0.85) * 255 + spec * 255;
    gCol = (0.08 + diff * 0.55) * 165 + spec * 220;
    bCol = (0.04 + diff * 0.25) * 90 + spec * 180;
  } else if (palName === 'emerald') {
    // Deep jade to vivid electric turquoise
    rCol = (0.04 + diff * 0.3) * 60 + spec * 210;
    gCol = (0.15 + diff * 0.85) * 255 + spec * 255;
    bCol = (0.10 + diff * 0.65) * 190 + spec * 245;
  } else {
    // Amiga classic copper sheen with animated rainbow tint
    const hue = (paramU * 180 + frame.t * 30) % 360;
    const rad = hue * (Math.PI / 180);
    const pr = Math.sin(rad) * 0.5 + 0.5;
    const pg = Math.sin(rad + 2.09) * 0.5 + 0.5;
    const pb = Math.sin(rad + 4.18) * 0.5 + 0.5;
    rCol = (0.15 + diff * 0.75) * pr * 255 + spec * 255;
    gCol = (0.15 + diff * 0.75) * pg * 255 + spec * 255;
    bCol = (0.15 + diff * 0.75) * pb * 255 + spec * 255;
  }

  // Subtle audience hue influence on the specular rim
  if (spec > 0.3) {
    const attRad = attendeeHue * (Math.PI / 180);
    rCol += (Math.cos(attRad) * 0.5 + 0.5) * spec * 25;
    bCol += (Math.sin(attRad) * 0.5 + 0.5) * spec * 35;
  }

  const rFinal = rCol > 255 ? 255 : (rCol < 0 ? 0 : rCol | 0);
  const gFinal = gCol > 255 ? 255 : (gCol < 0 ? 0 : gCol | 0);
  const bFinal = bCol > 255 ? 255 : (bCol < 0 ? 0 : bCol | 0);
  return `rgb(${rFinal},${gFinal},${bFinal})`;
}

// --- Rasterize Sorted Polygons ---
const drawWire = wireMode !== 'off';
const wireAlpha = wireMode === 'bright' ? 0.35 : 0.12;

for (let k = 0; k < TOTAL_QUADS; k++) {
  const q = quads[k];
  const { i0, i1, i2, i3 } = q;

  const x0 = sxArr[i0], y0 = syArr[i0];
  const x1 = sxArr[i1], y1 = syArr[i1];
  const x2 = sxArr[i2], y2 = syArr[i2];
  const x3 = sxArr[i3], y3 = syArr[i3];

  // Backface culling in screen coordinates (cross product of quad diagonals)
  const cross = (x2 - x0) * (y3 - y1) - (y2 - y0) * (x3 - x1);
  if (cross <= 0) continue; // Face points away

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();

  if (shadeStyle === 'smooth_gouraud' || shadeStyle === 'iridescent') {
    // Fake Gouraud: Linear gradient across the quad diagonal reflecting vertex intensity variation
    let lit0 = diffArr[i0] + specArr[i0] * 1.3;
    let lit2 = diffArr[i2] + specArr[i2] * 1.3;

    if (shadeStyle === 'iridescent') {
      lit0 += Math.sin((vzArr[i0] * 0.02) + frame.t * 3.0) * 0.25;
      lit2 += Math.sin((vzArr[i2] * 0.02) + frame.t * 3.0) * 0.25;
    }

    const uNorm = (i0 / NV) / NU;
    const grad = ctx.createLinearGradient(x0, y0, x2, y2);
    grad.addColorStop(0, getPaletteColor(diffArr[i0], specArr[i0], uNorm));
    grad.addColorStop(1, getPaletteColor(diffArr[i2], specArr[i2], uNorm));
    ctx.fillStyle = grad;
  } else {
    // Flat specular: average quad lighting
    const avgDiff = (diffArr[i0] + diffArr[i1] + diffArr[i2] + diffArr[i3]) * 0.25;
    const avgSpec = (specArr[i0] + specArr[i1] + specArr[i2] + specArr[i3]) * 0.25;
    const uNorm = (i0 / NV) / NU;
    ctx.fillStyle = getPaletteColor(avgDiff, avgSpec, uNorm);
  }

  ctx.fill();

  if (drawWire) {
    ctx.strokeStyle = `rgba(255,255,255,${wireAlpha})`;
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }
}

// --- Specular Center Flare / Glint Accent ---
if (audio.beat || audioScale > 1.2) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const flareGrad = ctx.createRadialGradient(cx + lx * R * 0.5, cy + ly * R * 0.5, 0, cx + lx * R * 0.5, cy + ly * R * 0.5, minDim * 0.28);
  flareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  flareGrad.addColorStop(0.3, 'rgba(120, 200, 255, 0.15)');
  flareGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = flareGrad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

ctx.restore();