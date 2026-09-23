const MAX_POINTS = 720;
const count = Math.min(MAX_POINTS, Math.max(120, Math.floor(getVar('dot_count') ?? 420)));
const rotSpeed = getVar('rotation_speed') ?? 1.0;
const focalDist = getVar('depth_field') ?? 550;
const morphStyle = getVar('morph_style') ?? 'smooth_cycle';
const paletteChoice = getVar('palette') ?? 'plasma';
const ptStyle = getVar('point_style') ?? 'glowing_discs';

// One-time initialization of shape lookup tables in room.state
if (!room.state.init) {
  room.state.init = true;
  room.state.sSphere = new Float32Array(MAX_POINTS * 3);
  room.state.sTorus = new Float32Array(MAX_POINTS * 3);
  room.state.sCube = new Float32Array(MAX_POINTS * 3);
  room.state.sHelix = new Float32Array(MAX_POINTS * 3);
  room.state.currPos = new Float32Array(MAX_POINTS * 3);
  room.state.projZ = new Float32Array(MAX_POINTS);
  room.state.indices = new Int32Array(MAX_POINTS);
  room.state.morphProg = 0;
  room.state.targetShape = 0;
  room.state.beatCooldown = 0;

  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < MAX_POINTS; i++) {
    const i3 = i * 3;
    // 1. Fibonacci Sphere
    const theta = 2 * Math.PI * i / goldenRatio;
    const phi = Math.acos(1 - 2 * (i + 0.5) / MAX_POINTS);
    const sr = 180;
    room.state.sSphere[i3] = sr * Math.sin(phi) * Math.cos(theta);
    room.state.sSphere[i3 + 1] = sr * Math.cos(phi);
    room.state.sSphere[i3 + 2] = sr * Math.sin(phi) * Math.sin(theta);

    // 2. Torus
    const u = (i / MAX_POINTS) * Math.PI * 2 * 7;
    const v = (i / MAX_POINTS) * Math.PI * 2;
    const trBig = 160;
    const trSmall = 65;
    room.state.sTorus[i3] = (trBig + trSmall * Math.cos(u)) * Math.cos(v);
    room.state.sTorus[i3 + 1] = (trBig + trSmall * Math.cos(u)) * Math.sin(v);
    room.state.sTorus[i3 + 2] = trSmall * Math.sin(u);

    // 3. Cube (distribute evenly across 6 faces)
    const face = i % 6;
    const uVal = (((Math.floor(i / 6) * 17) % 100) / 50 - 1) * 140;
    const vVal = (((Math.floor(i / 6) * 31) % 100) / 50 - 1) * 140;
    const cR = 140;
    if (face === 0) { room.state.sCube[i3] = cR; room.state.sCube[i3 + 1] = uVal; room.state.sCube[i3 + 2] = vVal; }
    else if (face === 1) { room.state.sCube[i3] = -cR; room.state.sCube[i3 + 1] = uVal; room.state.sCube[i3 + 2] = vVal; }
    else if (face === 2) { room.state.sCube[i3] = uVal; room.state.sCube[i3 + 1] = cR; room.state.sCube[i3 + 2] = vVal; }
    else if (face === 3) { room.state.sCube[i3] = uVal; room.state.sCube[i3 + 1] = -cR; room.state.sCube[i3 + 2] = vVal; }
    else if (face === 4) { room.state.sCube[i3] = uVal; room.state.sCube[i3 + 1] = vVal; room.state.sCube[i3 + 2] = cR; }
    else { room.state.sCube[i3] = uVal; room.state.sCube[i3 + 1] = vVal; room.state.sCube[i3 + 2] = -cR; }

    // 4. Double Helix
    const strand = (i % 2 === 0) ? 0 : Math.PI;
    const tHelix = (i / MAX_POINTS) * Math.PI * 8;
    const hY = ((i / MAX_POINTS) - 0.5) * 360;
    const hRad = 110;
    room.state.sHelix[i3] = Math.cos(tHelix + strand) * hRad;
    room.state.sHelix[i3 + 1] = hY;
    room.state.sHelix[i3 + 2] = Math.sin(tHelix + strand) * hRad;
  }
}

// Determine morph transition progress
const shapes = [room.state.sSphere, room.state.sTorus, room.state.sCube, room.state.sHelix];
room.state.beatCooldown = Math.max(0, room.state.beatCooldown - frame.dt);

let morphParam = 0;
if (morphStyle === 'beat_snap') {
  if (audio.beat && room.state.beatCooldown <= 0) {
    room.state.targetShape = (room.state.targetShape + 1) % 4;
    room.state.beatCooldown = 0.28;
  }
  room.state.morphProg += (room.state.targetShape - room.state.morphProg) * Math.min(1, frame.dt * 6.0);
  morphParam = room.state.morphProg;
} else if (morphStyle === 'audio_driven') {
  const target = (frame.t * 0.15 + audio.bass * 2.0) % 4;
  room.state.morphProg += (target - room.state.morphProg) * Math.min(1, frame.dt * 4.0);
  morphParam = room.state.morphProg;
} else {
  morphParam = (frame.t * 0.28) % 4;
}

// Smooth cosine interpolation between consecutive shapes
const sIdx0 = Math.floor(morphParam) % 4;
const sIdx1 = (sIdx0 + 1) % 4;
const rawFrac = morphParam - Math.floor(morphParam);
const blend = (1 - Math.cos(rawFrac * Math.PI)) * 0.5;

const curS = shapes[sIdx0];
const nextS = shapes[sIdx1];

// Rotation matrix components
const rx = frame.t * 0.45 * rotSpeed + (audio.bass * 0.2);
const ry = frame.t * 0.75 * rotSpeed + (audio.mid * 0.15);
const rz = frame.t * 0.25 * rotSpeed;

const cx = Math.cos(rx), sx = Math.sin(rx);
const cy = Math.cos(ry), sy = Math.sin(ry);
const cz = Math.cos(rz), sz = Math.sin(rz);

// Combined scale bounce on bass
const scaleBoost = 1.0 + (audio.bass * 0.22);

// Compute rotated and projected positions
const projZ = room.state.projZ;
const indices = room.state.indices;
const currPos = room.state.currPos;

for (let i = 0; i < count; i++) {
  indices[i] = i;
  const i3 = i * 3;
  const px = (curS[i3] + (nextS[i3] - curS[i3]) * blend) * scaleBoost;
  const py = (curS[i3 + 1] + (nextS[i3 + 1] - curS[i3 + 1]) * blend) * scaleBoost;
  const pz = (curS[i3 + 2] + (nextS[i3 + 2] - curS[i3 + 2]) * blend) * scaleBoost;

  // Rotate Y
  let x1 = px * cy + pz * sy;
  let y1 = py;
  let z1 = -px * sy + pz * cy;

  // Rotate X
  let x2 = x1;
  let y2 = y1 * cx - z1 * sx;
  let z2 = y1 * sx + z1 * cx;

  // Rotate Z
  let x3 = x2 * cz - y2 * sz;
  let y3 = x2 * sz + y2 * cz;
  let z3 = z2;

  currPos[i3] = x3;
  currPos[i3 + 1] = y3;
  currPos[i3 + 2] = z3;
  projZ[i] = z3;
}

// Back-to-front depth sort for accurate depth layering
Array.prototype.sort.call(indices.subarray(0, count), (a, b) => projZ[a] - projZ[b]);

// Frame clearing with deep demoscene trail / wash
ctx.save();
ctx.fillStyle = 'rgba(6, 6, 10, 0.38)';
ctx.fillRect(0, 0, frame.width, frame.height);

// Draw subtle coordinate reticle in demoscene style
const midX = frame.width * 0.5;
const midY = frame.height * 0.5;
ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(midX - 40, midY); ctx.lineTo(midX + 40, midY);
ctx.moveTo(midX, midY - 40); ctx.lineTo(midX, midY + 40);
ctx.stroke();

// Render points with additive blend
ctx.globalCompositeOperation = 'lighter';
const baseHueOffset = (room.people && room.people.length > 0) ? (room.people[0].hue || 0) : 0;

for (let k = 0; k < count; k++) {
  const i = indices[k];
  const i3 = i * 3;
  const z = currPos[i3 + 2];
  const zDist = focalDist + z;
  if (zDist <= 10) continue;

  const perspective = focalDist / zDist;
  const screenX = midX + currPos[i3] * perspective;
  const screenY = midY + currPos[i3 + 1] * perspective;

  // Depth normalization (0 = far, 1 = near)
  const depthNorm = Math.max(0, Math.min(1, (z + 240) / 480));
  const alpha = 0.18 + depthNorm * 0.75;
  const rad = Math.max(0.8, (1.8 + depthNorm * 4.8) * perspective * 0.7);

  // Color selection based on palette knob
  let hue = 180, sat = 90, lit = 50 + depthNorm * 30;
  if (paletteChoice === 'plasma') {
    hue = (depthNorm * 160 + frame.t * 30 + baseHueOffset) % 360;
    sat = 95;
  } else if (paletteChoice === 'amber_glow') {
    hue = 28 + depthNorm * 28;
    sat = 100;
    lit = 30 + depthNorm * 55;
  } else if (paletteChoice === 'cyan_vector') {
    hue = 175 + (i % 30);
    sat = 90;
    lit = 35 + depthNorm * 50;
  } else {
    // Monochrome silver
    hue = 210;
    sat = 8;
    lit = 25 + depthNorm * 70;
  }

  ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lit}%, ${alpha})`;
  ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${Math.min(100, lit + 25)}%, ${alpha * 0.9})`;

  ctx.beginPath();
  ctx.arc(screenX, screenY, rad, 0, Math.PI * 2);
  ctx.fill();

  if (ptStyle === 'glowing_discs' && depthNorm > 0.45) {
    ctx.beginPath();
    ctx.arc(screenX, screenY, rad * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lit}%, ${alpha * 0.16})`;
    ctx.fill();
  } else if (ptStyle === 'ringed_nodes') {
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, rad * 1.8, 0, Math.PI * 2);
    ctx.stroke();
  }
}

ctx.restore();