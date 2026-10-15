const GRID_DIM = 32;
const COUNT = GRID_DIM * GRID_DIM;
const formation = getVar('formation') ?? 'morphing';
const metal = getVar('metal') ?? 'rose_copper';
const waveDepth = getVar('wave_depth') ?? 1.2;
const camTilt = getVar('camera_tilt') ?? 'low_angle';
const beadScale = getVar('droplet_scale') ?? 1.4;
const wireGlow = getVar('wire_glow') ?? true;

// 1. Initialise demoscene fixed buffers and LUTs
if (!room.state.init) {
  room.state.init = true;
  room.state.gx = new Float32Array(COUNT);
  room.state.gz = new Float32Array(COUNT);
  room.state.cy = new Float32Array(COUNT);
  room.state.px = new Float32Array(COUNT);
  room.state.py = new Float32Array(COUNT);
  room.state.pz = new Float32Array(COUNT);
  room.state.cwY = new Float32Array(COUNT);
  room.state.indices = new Int32Array(COUNT);
  room.state.phase = 0;

  for (let i = 0; i < COUNT; i++) {
    const ix = i % GRID_DIM;
    const iz = (i / GRID_DIM) | 0;
    room.state.gx[i] = (ix / (GRID_DIM - 1) - 0.5) * 3.4;
    room.state.gz[i] = (iz / (GRID_DIM - 1) - 0.5) * 3.4;
    room.state.cy[i] = 0.8;
    room.state.indices[i] = i;
  }

  // Offscreen pre-rendered copper droplet sprite (128x128)
  room.state.sprite = new OffscreenCanvas(128, 128);
  room.state.lastMetal = '';
}

// 2. Re-render offscreen copper bead sprite when palette changes
if (room.state.lastMetal !== metal) {
  room.state.lastMetal = metal;
  const sctx = room.state.sprite.getContext('2d');
  sctx.clearRect(0, 0, 128, 128);

  let cRim, cBody, cShade, cSpecular;
  if (metal === 'burnished_brass') {
    cRim = 'rgba(255, 235, 170, 0.9)';
    cBody = '#d49b38';
    cShade = '#2b1a04';
    cSpecular = '#ffffff';
  } else if (metal === 'liquid_patina') {
    cRim = 'rgba(120, 240, 210, 0.85)';
    cBody = '#43977c';
    cShade = '#102820';
    cSpecular = '#d8fff0';
  } else if (metal === 'molten_gold') {
    cRim = 'rgba(255, 245, 190, 0.95)';
    cBody = '#e8a917';
    cShade = '#3a2000';
    cSpecular = '#ffffff';
  } else {
    // rose_copper default
    cRim = 'rgba(255, 190, 160, 0.9)';
    cBody = '#c85a32';
    cShade = '#330f08';
    cSpecular = '#fff4ee';
  }

  // Base ambient glow
  const gGlow = sctx.createRadialGradient(64, 64, 20, 64, 64, 62);
  gGlow.addColorStop(0, cRim);
  gGlow.addColorStop(0.5, 'rgba(0,0,0,0.15)');
  gGlow.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = gGlow;
  sctx.beginPath();
  sctx.arc(64, 64, 62, 0, Math.PI * 2);
  sctx.fill();

  // Droplet teardrop / sphere body
  const gBody = sctx.createRadialGradient(52, 48, 4, 64, 64, 44);
  gBody.addColorStop(0, cSpecular);
  gBody.addColorStop(0.18, cRim);
  gBody.addColorStop(0.55, cBody);
  gBody.addColorStop(0.95, cShade);
  gBody.addColorStop(1.0, '#000000');
  sctx.fillStyle = gBody;
  sctx.beginPath();
  sctx.arc(64, 64, 42, 0, Math.PI * 2);
  sctx.fill();

  // Sharp metallic highlight reflection
  sctx.fillStyle = cSpecular;
  sctx.beginPath();
  sctx.ellipse(50, 46, 12, 6, -Math.PI / 4, 0, Math.PI * 2);
  sctx.fill();

  // Secondary lower bounce reflection
  sctx.fillStyle = 'rgba(255,200,160,0.25)';
  sctx.beginPath();
  sctx.ellipse(74, 82, 16, 5, 0.3, 0, Math.PI * 2);
  sctx.fill();
}

// 3. Clear canvas with dark atmospheric vignette
ctx.save();
ctx.fillStyle = '#020204';
ctx.fillRect(0, 0, frame.width, frame.height);

// Backdrop warm ambient radiance from the copper field
const ambGrad = ctx.createRadialGradient(
  frame.width * 0.5, frame.height * 0.42, 10,
  frame.width * 0.5, frame.height * 0.45, frame.width * 0.7
);
const bLevel = audio ? (audio.bass * 0.25 + audio.level * 0.15) : 0;
ambGrad.addColorStop(0, metal === 'liquid_patina' ? `rgba(18, 55, 45, ${0.45 + bLevel})` : `rgba(60, 20, 10, ${0.45 + bLevel})`);
ambGrad.addColorStop(0.6, '#060507');
ambGrad.addColorStop(1, '#020204');
ctx.fillStyle = ambGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

// 4. Update droplet target heights (wave mechanics)
const t = frame.t * 1.1;
const bassBoost = audio ? audio.bass * 0.7 : 0;
const beatPulse = (audio && audio.beat) ? 0.35 : 0;
const ceilingY = 2.4;

// Morphing cycle between shapes
let shapeWeightWave = 0;
let shapeWeightPlane = 0;
let shapeWeightSpiral = 0;
let shapeWeightSphere = 0;

if (formation === 'morphing') {
  const cycle = (t * 0.22) % 4;
  if (cycle < 1) {
    shapeWeightWave = 1 - cycle;
    shapeWeightPlane = cycle;
  } else if (cycle < 2) {
    shapeWeightPlane = 2 - cycle;
    shapeWeightSpiral = cycle - 1;
  } else if (cycle < 3) {
    shapeWeightSpiral = 3 - cycle;
    shapeWeightSphere = cycle - 2;
  } else {
    shapeWeightSphere = 4 - cycle;
    shapeWeightWave = cycle - 3;
  }
} else if (formation === 'ocean_wave') {
  shapeWeightWave = 1;
} else if (formation === 'flight_wing') {
  shapeWeightPlane = 1;
} else if (formation === 'spiral_vortex') {
  shapeWeightSpiral = 1;
} else {
  shapeWeightSphere = 1;
}

// People interaction: slight harmonic wobble keyed to presence
const peopleMod = room.people.length > 0 ? (room.people.length * 0.04) : 0;
const speedMult = 1.0 + peopleMod;

for (let i = 0; i < COUNT; i++) {
  const x = room.state.gx[i];
  const z = room.state.gz[i];
  const dist = Math.hypot(x, z);
  const angle = Math.atan2(z, x);

  // Shape A: Ocean Wave (diagonal traveling interferometry)
  const hWave = Math.sin(x * 2.2 + t * 2.4 * speedMult) * Math.cos(z * 1.8 + t * 1.7) *
                (0.5 + 0.3 * Math.sin(dist * 2.5 - t * 3.0));

  // Shape B: Airplane Taking Off (swept dihedral wings with bow pitch & wingtip curl)
  const wingSpan = Math.abs(x) * 0.7;
  const sweepZ = -z * 0.65;
  const dihedral = wingSpan * wingSpan * 0.35;
  const pitch = -z * 0.45;
  const engineThrust = Math.sin(t * 7.0 + z * 4.0) * 0.08 * (1.0 - Math.min(1, Math.abs(x)));
  const hPlane = (pitch + dihedral + engineThrust - 0.3);

  // Shape C: Spiral Vortex
  const spiralTurns = angle * 2.0 - dist * 3.2 + t * 2.8 * speedMult;
  const hSpiral = Math.sin(spiralTurns) * Math.cos(dist * 1.5) * 0.85;

  // Shape D: Harmonic Sphere (nested dome rising from the grid)
  const rNorm = dist / 2.4;
  const dome = rNorm < 1.0 ? Math.sqrt(Math.max(0, 1.0 - rNorm * rNorm)) * 1.25 : 0;
  const pulse = Math.sin(t * 3.0) * 0.25;
  const hSphere = (dome * (1.0 + pulse) - 0.45);

  const blendedH = (hWave * shapeWeightWave +
                    hPlane * shapeWeightPlane +
                    hSpiral * shapeWeightSpiral +
                    hSphere * shapeWeightSphere) * waveDepth * (0.9 + bassBoost + beatPulse);

  // Physical hanging range: clamped safely under ceiling
  const targetY = 1.1 + blendedH * 0.55;
  // Critically damped spring towards target
  room.state.cy[i] += (targetY - room.state.cy[i]) * 0.16;
}

// 5. Camera Transformation setup
let camY = -0.55;
let camDist = 3.6;
let pitchAngle = 0.52;
let yawAngle = t * 0.07;

if (camTilt === 'steep_under') {
  camY = -1.25;
  camDist = 2.9;
  pitchAngle = 0.95;
  yawAngle = Math.sin(t * 0.09) * 0.3;
} else if (camTilt === 'sweeping_orbit') {
  camY = -0.45 + Math.sin(t * 0.3) * 0.35;
  camDist = 3.8;
  pitchAngle = 0.48;
  yawAngle = t * 0.22;
} else {
  // low_angle default
  yawAngle = Math.sin(t * 0.12) * 0.38;
}

const cosYaw = Math.cos(yawAngle);
const sinYaw = Math.sin(yawAngle);
const cosPit = Math.cos(pitchAngle);
const sinPit = Math.sin(pitchAngle);

const focal = Math.min(frame.width, frame.height) * 0.95;
const cx = frame.width * 0.5;
const cy = frame.height * 0.54;

// 6. Project all 1024 droplets and ceiling attachment points
for (let i = 0; i < COUNT; i++) {
  const worldX = room.state.gx[i];
  const worldY = room.state.cy[i];
  const worldZ = room.state.gz[i];

  // Rotate Yaw
  const x1 = worldX * cosYaw - worldZ * sinYaw;
  const z1 = worldX * sinYaw + worldZ * cosYaw;

  // Translate camera Z & Y
  const x2 = x1;
  const y2 = worldY - camY;
  const z2 = z1 + camDist;

  // Rotate Pitch
  const yCam = y2 * cosPit - z2 * sinPit;
  const zCam = y2 * sinPit + z2 * cosPit;
  const xCam = x2;

  // Ceiling wire projection point
  const yCeil2 = ceilingY - camY;
  const yCeilCam = yCeil2 * cosPit - z2 * sinPit;
  const zCeilCam = yCeil2 * sinPit + z2 * cosPit;

  room.state.pz[i] = zCam;
  if (zCam > 0.3) {
    const invZ = 1.0 / zCam;
    room.state.px[i] = cx + (xCam * invZ) * focal;
    room.state.py[i] = cy - (yCam * invZ) * focal;

    const invCeilZ = 1.0 / Math.max(0.3, zCeilCam);
    room.state.cwY[i] = cy - (yCeilCam * invCeilZ) * focal;
  } else {
    room.state.px[i] = -9999;
    room.state.py[i] = -9999;
  }
}

// 7. Depth-sort indices (back to front painter's algorithm)
const indices = room.state.indices;
const depths = room.state.pz;
indices.sort((a, b) => depths[b] - depths[a]);

// 8. Render Wires (fast batch line draw with faint glimmer)
if (wireGlow) {
  ctx.beginPath();
  for (let k = 0; k < COUNT; k++) {
    const idx = indices[k];
    const z = depths[idx];
    if (z <= 0.4) continue;
    const x = room.state.px[idx];
    const y = room.state.py[idx];
    const cwy = room.state.cwY[idx];
    ctx.moveTo(x, cwy);
    ctx.lineTo(x, y);
  }
  const wireAlpha = Math.min(0.24, 0.08 + (audio ? audio.treble * 0.15 : 0.04));
  ctx.strokeStyle = (metal === 'liquid_patina')
    ? `rgba(100, 200, 180, ${wireAlpha})`
    : `rgba(230, 170, 130, ${wireAlpha})`;
  ctx.lineWidth = 0.85;
  ctx.stroke();
}

// 9. Render Polished Copper Droplets from pre-rendered sprite
const sprite = room.state.sprite;
const baseDropR = 14 * beadScale;
const trebleSpark = audio ? audio.treble * 0.35 : 0;

for (let k = 0; k < COUNT; k++) {
  const idx = indices[k];
  const z = depths[idx];
  if (z <= 0.4) continue;

  const x = room.state.px[idx];
  const y = room.state.py[idx];

  // Perspective scaling
  const rad = Math.max(2, (baseDropR / z) * 1.5);
  const diam = rad * 2;

  // Subtle depth attenuation
  const depthFade = Math.min(1.0, 4.5 / (z + 0.4));
  ctx.globalAlpha = depthFade;
  ctx.drawImage(sprite, x - rad, y - rad, diam, diam);

  // Specular flash on audio peaks for front droplets
  if (trebleSpark > 0.08 && z < 3.2 && (idx % 7 === 0)) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - rad * 0.28, y - rad * 0.32, rad * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 10. Foreground theatrical rim vignette and dust motes
ctx.globalAlpha = 1.0;
const fgGrad = ctx.createLinearGradient(0, frame.height * 0.78, 0, frame.height);
fgGrad.addColorStop(0, 'rgba(2, 2, 4, 0)');
fgGrad.addColorStop(1, 'rgba(2, 2, 4, 0.7)');
ctx.fillStyle = fgGrad;
ctx.fillRect(0, frame.height * 0.75, frame.width, frame.height * 0.25);

ctx.restore();