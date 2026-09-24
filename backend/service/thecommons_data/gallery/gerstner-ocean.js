const W = frame.width;
const H = frame.height;
const t = frame.t;

// Demoparty grid dimensions
const COLS = 44;
const ROWS = 52;
const VERT_COUNT = COLS * ROWS;

// Allocate persistent typed arrays once in room.state
room.state.px ??= new Float32Array(VERT_COUNT);
room.state.py ??= new Float32Array(VERT_COUNT);
room.state.crest ??= new Float32Array(VERT_COUNT);
room.state.spec ??= new Float32Array(VERT_COUNT);
room.state.zDist ??= new Float32Array(VERT_COUNT);

const px = room.state.px;
const py = room.state.py;
const crest = room.state.crest;
const spec = room.state.spec;
const zDist = room.state.zDist;

// Read variables
const moodKey = getVar('moon_mood') ?? 'Silver Mist';
const glitterKey = getVar('glitter_width') ?? 'Glinting Path';
const swell = (getVar('swell_scale') ?? 1.2) * (1.0 + audio.bass * 0.75);
const steepness = getVar('steepness') ?? 0.7;
const speed = (getVar('ocean_speed') ?? 1.0) * (0.85 + audio.level * 0.35);

const palettes = {
  'Silver Mist': {
    skyTop: '#02050c', skyBot: '#0d182b', moon: '#eef4ff',
    waterDeep: [4, 9, 20], waterShallow: [16, 36, 68],
    foam: [220, 238, 255], glitter: [240, 248, 255], moonHue: 215
  },
  'Arctic Cyan': {
    skyTop: '#01080d', skyBot: '#082230', moon: '#d0fbff',
    waterDeep: [2, 14, 22], waterShallow: [10, 48, 64],
    foam: [180, 252, 255], glitter: [210, 255, 255], moonHue: 185
  },
  'Blood Moon': {
    skyTop: '#080103', skyBot: '#26090e', moon: '#ff6242',
    waterDeep: [16, 4, 8], waterShallow: [58, 16, 22],
    foam: [255, 180, 160], glitter: [255, 200, 150], moonHue: 12
  },
  'Deep Indigo': {
    skyTop: '#04020a', skyBot: '#130d2a', moon: '#ded2ff',
    waterDeep: [8, 4, 22], waterShallow: [30, 18, 68],
    foam: [225, 210, 255], glitter: [245, 235, 255], moonHue: 265
  }
};
const pal = palettes[moodKey] ?? palettes['Silver Mist'];

const glitterPow = {
  'Narrow Beam': 36.0,
  'Glinting Path': 18.0,
  'Broad Shimmer': 7.0
}[glitterKey] ?? 18.0;

// Sky and Moon setup
const horizonY = H * 0.38;
const moonX = W * 0.5;
const moonY = horizonY - H * 0.16;
const moonR = Math.max(22, H * 0.055);

ctx.save();

// Draw sky gradient
const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY + 20);
skyGrad.addColorStop(0, pal.skyTop);
skyGrad.addColorStop(0.7, pal.skyBot);
skyGrad.addColorStop(1, '#050b14');
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

// Moon halo & disk
const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.3, moonX, moonY, moonR * 4.5);
halo.addColorStop(0, `hsla(${pal.moonHue}, 80%, 85%, ${0.45 + audio.bass * 0.2})`);
halo.addColorStop(0.35, `hsla(${pal.moonHue}, 70%, 55%, 0.16)`);
halo.addColorStop(1, 'transparent');
ctx.fillStyle = halo;
ctx.beginPath();
ctx.arc(moonX, moonY, moonR * 4.5, 0, Math.PI * 2);
ctx.fill();

ctx.fillStyle = pal.moon;
ctx.beginPath();
ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
ctx.fill();

// Gerstner Wave Harmonic Parameters: [dx, dz, freq, speed, ampWeight, QWeight]
const w0_dx = 0.22,  w0_dz = 0.97,  w0_f = 0.32, w0_s = 1.25 * speed, w0_a = 0.62 * swell, w0_q = 0.55 * steepness;
const w1_dx = -0.38, w1_dz = 0.92,  w1_f = 0.68, w1_s = 1.70 * speed, w1_a = 0.28 * swell, w1_q = 0.65 * steepness;
const w2_dx = 0.58,  w2_dz = 0.81,  w2_f = 1.22, w2_s = 2.40 * speed, w2_a = 0.14 * swell, w2_q = 0.70 * steepness;
const w3_dx = -0.15, w3_dz = 0.99,  w3_f = 2.10, w3_s = 3.30 * speed, w3_a = 0.07 * swell, w3_q = 0.75 * steepness;

// Low-angle perspective camera
const camY = 2.1 + audio.bass * 0.4;
const fov = H * 0.72;
const zNear = 2.2;
const zFar = 42.0;
const invZNear = 1.0 / zNear;
const invZFar = 1.0 / zFar;

// Compute vertices
let idx = 0;
for (let r = 0; r < ROWS; r++) {
  const rowT = r / (ROWS - 1);
  // Non-linear z-spacing for smooth perspective horizon
  const invZ = invZFar + (invZNear - invZFar) * Math.pow(rowT, 2.2);
  const z0 = 1.0 / invZ;
  const xExtent = z0 * 1.65 * (W / H);

  for (let c = 0; c < COLS; c++) {
    const colT = c / (COLS - 1);
    const x0 = (colT - 0.5) * 2.0 * xExtent;

    // Gerstner harmonic evaluation
    const p0 = (x0 * w0_dx + z0 * w0_dz) * w0_f - t * w0_s;
    const p1 = (x0 * w1_dx + z0 * w1_dz) * w1_f - t * w1_s;
    const p2 = (x0 * w2_dx + z0 * w2_dz) * w2_f - t * w2_s;
    const p3 = (x0 * w3_dx + z0 * w3_dz) * w3_f - t * w3_s;

    const s0 = Math.sin(p0), c0 = Math.cos(p0);
    const s1 = Math.sin(p1), c1 = Math.cos(p1);
    const s2 = Math.sin(p2), c2 = Math.cos(p2);
    const s3 = Math.sin(p3), c3 = Math.cos(p3);

    // Displacements
    const gx = x0 - (w0_q * w0_a * w0_dx * s0 + w1_q * w1_a * w1_dx * s1 + w2_q * w2_a * w2_dx * s2 + w3_q * w3_a * w3_dx * s3);
    const gz = z0 - (w0_q * w0_a * w0_dz * s0 + w1_q * w1_a * w1_dz * s1 + w2_q * w2_a * w2_dz * s2 + w3_q * w3_a * w3_dz * s3);
    const gy = (c0 * w0_a + c1 * w1_a + c2 * w2_a + c3 * w3_a);

    // Crest sharpening measure (curvature / wave height)
    const crestVal = Math.max(0, (c0 * 0.5 + c1 * 0.3 + c2 * 0.2 + 0.15 * audio.treble));

    // Specular moon alignment: glitter aligns towards moon center (gx ~ 0)
    const pathAlign = Math.max(0, 1.0 - Math.abs(gx) / (gz * 0.45 + 1.5));
    // Slope facing camera reflects the low moon
    const slopeFacing = Math.max(0, s0 * 0.6 + s1 * 0.4);
    const sp = Math.pow(pathAlign * slopeFacing, glitterPow * 0.2) * Math.min(1.0, 18.0 / (gz + 4.0));

    // Perspective projection
    const projZ = Math.max(0.6, gz);
    px[idx] = W * 0.5 + (gx * fov) / projZ;
    py[idx] = horizonY + ((camY - gy) * fov) / projZ;
    crest[idx] = crestVal;
    spec[idx] = sp;
    zDist[idx] = gz;
    idx++;
  }
}

// Render Ocean Ribbons: Far to Near (r = 0..ROWS-2)
const wDeep = pal.waterDeep;
const wShal = pal.waterShallow;
const fm = pal.foam;
const gl = pal.glitter;

for (let r = 0; r < ROWS - 1; r++) {
  const rowT = r / (ROWS - 1);
  const rowZ = zDist[r * COLS];
  const fog = Math.min(1.0, Math.max(0.0, (rowZ - 3.0) / (zFar - 3.0)));
  const fogInv = 1.0 - fog;

  for (let c = 0; c < COLS - 1; c++) {
    const i0 = r * COLS + c;
    const i1 = i0 + 1;
    const i2 = (r + 1) * COLS + (c + 1);
    const i3 = (r + 1) * COLS + c;

    const x0 = px[i0], y0 = py[i0];
    const x1 = px[i1], y1 = py[i1];
    const x2 = px[i2], y2 = py[i2];
    const x3 = px[i3], y3 = py[i3];

    // Skip degenerate or off-screen quads
    if (x1 < 0 || x0 > W || y2 < horizonY - 10 || y0 > H + 40) continue;

    const avgCrest = (crest[i0] + crest[i1] + crest[i2] + crest[i3]) * 0.25;
    const avgSpec = (spec[i0] + spec[i1] + spec[i2] + spec[i3]) * 0.25;

    // Interpolate water color based on depth, crest & specular glitter
    const crestMix = Math.min(1.0, Math.pow(avgCrest, 2.2) * 1.3);
    const specMix = Math.min(1.0, avgSpec * (1.3 + audio.treble * 1.5));

    let red = (wDeep[0] * (1 - rowT) + wShal[0] * rowT) * fogInv + pal.skyBot.slice(1, 3);
    let grn = (wDeep[1] * (1 - rowT) + wShal[1] * rowT) * fogInv;
    let blu = (wDeep[2] * (1 - rowT) + wShal[2] * rowT) * fogInv + 22 * fog;

    red = red * (1 - crestMix) + fm[0] * crestMix;
    grn = grn * (1 - crestMix) + fm[1] * crestMix;
    blu = blu * (1 - crestMix) + fm[2] * crestMix;

    red = Math.min(255, red * (1 - specMix) + gl[0] * specMix);
    grn = Math.min(255, grn * (1 - specMix) + gl[1] * specMix);
    blu = Math.min(255, blu * (1 - specMix) + gl[2] * specMix);

    ctx.fillStyle = `rgb(${red | 0},${grn | 0},${blu | 0})`;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();

    // Foam line on sharpened crests
    if (avgCrest > 0.82 && fog < 0.75) {
      ctx.strokeStyle = `rgba(${fm[0]}, ${fm[1]}, ${fm[2]}, ${(avgCrest - 0.82) * 2.8 * fogInv})`;
      ctx.lineWidth = Math.max(1, 2.4 * fogInv);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
}

// Room connected participants as floating lanterns on swells
const people = room.people ?? [];
for (let pIdx = 0; pIdx < people.length; pIdx++) {
  const person = people[pIdx];
  const phash = (person.hue * 17.31 + pIdx * 43.17) % 1000;
  const targetCol = Math.floor(6 + (phash % (COLS - 12)));
  const targetRow = Math.floor(10 + ((phash * 3.7) % (ROWS - 22)));
  const vIdx = targetRow * COLS + targetCol;

  const bx = px[vIdx];
  const by = py[vIdx] - 4;
  const bZ = zDist[vIdx];
  if (bx > 20 && bx < W - 20 && by > horizonY && by < H) {
    const scale = Math.max(2, (18 / bZ));
    ctx.fillStyle = `hsla(${person.hue}, 95%, 70%, 0.85)`;
    ctx.beginPath();
    ctx.arc(bx, by, scale, 0, Math.PI * 2);
    ctx.fill();

    // Water reflection under lantern
    ctx.fillStyle = `hsla(${person.hue}, 90%, 60%, ${0.35 * (1.0 - bZ / zFar)})`;
    ctx.fillRect(bx - scale * 0.8, by + scale * 0.8, scale * 1.6, scale * 2.2);
  }
}

// Subtle vignette
const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.4, W * 0.5, H * 0.5, W * 0.75);
vig.addColorStop(0, 'transparent');
vig.addColorStop(1, 'rgba(0, 3, 8, 0.6)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();