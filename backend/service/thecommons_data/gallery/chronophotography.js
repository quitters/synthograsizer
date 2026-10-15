const action = getVar('motion_action') ?? 'vault';
const pal = getVar('palette') ?? 'silver_cyan';
const strobeDensity = getVar('strobe_density') ?? 14;
const jointGlow = getVar('joint_glow') ?? 3.5;
const showGrid = getVar('chronometer_grid') ?? true;
const showRibbons = getVar('ribbon_traces') ?? true;

const W = frame.width;
const H = frame.height;

// Palettes: [boneStroke, jointCore, jointHalo, ribbonColor]
const PALETTES = {
  silver_cyan: ['rgba(175, 225, 245, 0.75)', '#ffffff', 'rgba(100, 200, 255, 0.4)', 'rgba(120, 220, 255, 0.25)'],
  solar_amber: ['rgba(255, 185, 90, 0.75)', '#fff4d0', 'rgba(255, 120, 30, 0.4)', 'rgba(255, 150, 40, 0.25)'],
  electric_neon: ['rgba(255, 80, 210, 0.75)', '#ffffff', 'rgba(0, 240, 255, 0.45)', 'rgba(230, 60, 255, 0.25)'],
  spectral: ['rgba(180, 255, 140, 0.75)', '#ffffff', 'rgba(255, 230, 100, 0.4)', 'rgba(120, 200, 255, 0.25)']
};
const colors = PALETTES[pal] ?? PALETTES.silver_cyan;

// Predefined bones by joint indices
// 0:pelvis, 1:chest, 2:head, 3:l_shld, 4:l_elb, 5:l_wrst, 6:r_shld, 7:r_elb, 8:r_wrst,
// 9:l_hip, 10:l_knee, 11:l_ank, 12:r_hip, 13:r_knee, 14:r_ank
const BONES = [
  [0, 1], [1, 2],
  [1, 3], [3, 4], [4, 5],
  [1, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11],
  [0, 12], [12, 13], [13, 14]
];
const RIBBON_JOINTS = [2, 5, 8, 11, 14];

// Persistent state
room.state.snapshots ??= [];
room.state.phase ??= 0;
room.state.lastSampleT ??= 0;

// Dynamic action parameters & forward progression
const speedMult = 0.9 + (audio?.mid ?? 0) * 0.4;
room.state.phase += frame.dt * speedMult;
const ph = room.state.phase;

// Action progression: loop normalized 0..1 across screen
const cycleDuration = action === 'run' ? 2.2 : action === 'vault' ? 3.6 : action === 'leap' ? 3.0 : 3.4;
const normProgress = (ph % cycleDuration) / cycleDuration;
const groundY = H * 0.74;
const spanX = W * 0.82;
const startX = W * 0.09;
const rootX = startX + normProgress * spanX;

// Kinematic posture solver (15 points: [x, y])
const pts = new Array(15);
const cyclePh = normProgress * Math.PI * 2;
const bass = audio?.bass ?? 0;
const beatHop = (audio?.beat ? 18 : 0) + bass * 26;

let rootY = groundY - 110;
let torsoTilt = 0;
let lLegA = 0, lKneeA = 0, rLegA = 0, rKneeA = 0;
let lArmA = 0, lElbA = 0, rArmA = 0, rElbA = 0;

if (action === 'run') {
  const p = cyclePh * 2.5;
  rootY = groundY - 110 - Math.abs(Math.sin(p)) * 32 - beatHop;
  torsoTilt = 0.22 + Math.sin(p) * 0.06;
  lLegA = Math.sin(p) * 0.85;
  lKneeA = Math.max(0, -Math.cos(p)) * 1.5 + 0.2;
  rLegA = Math.sin(p + Math.PI) * 0.85;
  rKneeA = Math.max(0, -Math.cos(p + Math.PI)) * 1.5 + 0.2;
  lArmA = -Math.sin(p) * 0.8;
  lElbA = 1.1 + Math.sin(p) * 0.4;
  rArmA = -Math.sin(p + Math.PI) * 0.8;
  rElbA = 1.1 + Math.sin(p + Math.PI) * 0.4;
} else if (action === 'vault') {
  const t = normProgress;
  if (t < 0.28) {
    // Approach run
    const p = t * 14 * Math.PI;
    rootY = groundY - 105 - Math.abs(Math.sin(p)) * 18;
    torsoTilt = 0.3;
    lLegA = Math.sin(p) * 0.7; lKneeA = 0.8;
    rLegA = -Math.sin(p) * 0.7; rKneeA = 0.8;
    lArmA = 0.6; rArmA = 0.7;
  } else if (t < 0.68) {
    // Vault ascension & clearance
    const up = (t - 0.28) / 0.4;
    const arc = Math.sin(up * Math.PI);
    rootY = groundY - 105 - arc * (H * 0.42) - beatHop;
    torsoTilt = 0.3 - up * 2.2;
    lLegA = 1.2 - up * 1.8; lKneeA = Math.sin(up * Math.PI) * 1.8;
    rLegA = 0.8 - up * 1.4; rKneeA = Math.sin(up * Math.PI) * 1.4;
    lArmA = -1.6 + up * 1.8; lElbA = 0.5;
    rArmA = -1.2 + up * 1.6; rElbA = 0.4;
  } else {
    // Landing & absorption
    const down = (t - 0.68) / 0.32;
    rootY = groundY - 95 + Math.sin(down * Math.PI * 0.5) * 20;
    torsoTilt = 0.15;
    lLegA = 0.1; lKneeA = 0.6 * (1 - down);
    rLegA = -0.15; rKneeA = 0.7 * (1 - down);
    lArmA = 0.3; rArmA = -0.2;
  }
} else if (action === 'leap') {
  const arc = Math.sin(normProgress * Math.PI);
  rootY = groundY - 90 - Math.pow(arc, 0.75) * (H * 0.38) - beatHop;
  torsoTilt = 0.35 - arc * 0.45;
  lLegA = -0.3 + arc * 1.1;
  lKneeA = 0.3 + (1 - arc) * 1.1;
  rLegA = 0.7 - arc * 1.6;
  rKneeA = 0.4 + arc * 1.3;
  lArmA = -0.5 - arc * 1.2; lElbA = 0.6;
  rArmA = 0.6 + arc * 1.0; rElbA = 0.9;
} else {
  // Acrobatic flip
  const arc = Math.sin(normProgress * Math.PI);
  rootY = groundY - 95 - arc * (H * 0.44) - beatHop;
  const spin = normProgress * Math.PI * 2;
  torsoTilt = spin;
  const tuck = Math.sin(arc * Math.PI);
  lLegA = spin * 0.1 + tuck * 1.4; lKneeA = tuck * 2.2 + 0.2;
  rLegA = spin * 0.1 + tuck * 1.3; rKneeA = tuck * 2.1 + 0.2;
  lArmA = -tuck * 1.2; lElbA = tuck * 1.8;
  rArmA = -tuck * 1.0; rElbA = tuck * 1.8;
}

// Solve joint coordinates from angles
const scale = Math.min(W, H) * 0.0016;
const spineL = 48 * scale;
const headL = 22 * scale;
const shldW = 18 * scale;
const armU = 32 * scale, armL = 30 * scale;
const hipW = 16 * scale;
const legU = 44 * scale, legL = 46 * scale;

pts[0] = [rootX, rootY]; // Pelvis
pts[1] = [rootX + Math.sin(torsoTilt) * spineL, rootY - Math.cos(torsoTilt) * spineL]; // Chest
pts[2] = [pts[1][0] + Math.sin(torsoTilt * 0.7) * headL, pts[1][1] - Math.cos(torsoTilt * 0.7) * headL]; // Head

const perpT = torsoTilt + Math.PI * 0.5;
pts[3] = [pts[1][0] - Math.cos(perpT) * shldW, pts[1][1] - Math.sin(perpT) * shldW]; // L_Shld
pts[6] = [pts[1][0] + Math.cos(perpT) * shldW, pts[1][1] + Math.sin(perpT) * shldW]; // R_Shld

// Arms
pts[4] = [pts[3][0] + Math.sin(torsoTilt + lArmA) * armU, pts[3][1] + Math.cos(torsoTilt + lArmA) * armU];
pts[5] = [pts[4][0] + Math.sin(torsoTilt + lArmA + lElbA) * armL, pts[4][1] + Math.cos(torsoTilt + lArmA + lElbA) * armL];
pts[7] = [pts[6][0] + Math.sin(torsoTilt + rArmA) * armU, pts[6][1] + Math.cos(torsoTilt + rArmA) * armU];
pts[8] = [pts[7][0] + Math.sin(torsoTilt + rArmA + rElbA) * armL, pts[7][1] + Math.cos(torsoTilt + rArmA + rElbA) * armL];

// Hips & Legs
pts[9] = [pts[0][0] - hipW, pts[0][1]];
pts[12] = [pts[0][0] + hipW, pts[0][1]];
pts[10] = [pts[9][0] + Math.sin(lLegA) * legU, pts[9][1] + Math.cos(lLegA) * legU];
pts[11] = [pts[10][0] + Math.sin(lLegA - lKneeA) * legL, pts[10][1] + Math.cos(lLegA - lKneeA) * legL];
pts[13] = [pts[12][0] + Math.sin(rLegA) * legU, pts[12][1] + Math.cos(rLegA) * legU];
pts[14] = [pts[13][0] + Math.sin(rLegA - rKneeA) * legL, pts[13][1] + Math.cos(rLegA - rKneeA) * legL];

// Add to stroboscopic trace buffer at controlled intervals
const sampleInterval = 1.0 / (strobeDensity * 1.5);
if (frame.t - room.state.lastSampleT >= sampleInterval) {
  room.state.lastSampleT = frame.t;
  const snap = new Float32Array(30);
  for (let i = 0; i < 15; i++) {
    snap[i * 2] = pts[i][0];
    snap[i * 2 + 1] = pts[i][1];
  }
  room.state.snapshots.push({
    coords: snap,
    t: frame.t,
    hueShift: pal === 'spectral' ? (frame.t * 35) % 360 : 0
  });
  // Bound historical snapshots
  if (room.state.snapshots.length > 95) {
    room.state.snapshots.shift();
  }
}

// DRAWING PASS
ctx.save();

// Clear background to rich photographic plate black with faint persistence fade
ctx.fillStyle = '#05070a';
ctx.fillRect(0, 0, W, H);

// Vintage Marey chronometer scale / laboratory grid
if (showGrid) {
  ctx.strokeStyle = 'rgba(70, 95, 120, 0.15)';
  ctx.lineWidth = 1;
  const stepX = W / 32;
  const stepY = H / 18;
  ctx.beginPath();
  for (let x = stepX; x < W; x += stepX) {
    ctx.moveTo(x, H * 0.12);
    ctx.lineTo(x, H * 0.88);
  }
  for (let y = H * 0.16; y < H * 0.88; y += stepY) {
    ctx.moveTo(W * 0.05, y);
    ctx.lineTo(W * 0.95, y);
  }
  ctx.stroke();

  // Ground reference datum line
  ctx.strokeStyle = 'rgba(160, 205, 240, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W * 0.05, groundY + 4);
  ctx.lineTo(W * 0.95, groundY + 4);
  ctx.stroke();

  // Stroboscopic dial chronometer in top-right
  const dialX = W * 0.88;
  const dialY = H * 0.14;
  const dialR = Math.min(W, H) * 0.045;
  ctx.strokeStyle = 'rgba(180, 215, 245, 0.4)';
  ctx.beginPath();
  ctx.arc(dialX, dialY, dialR, 0, Math.PI * 2);
  ctx.stroke();

  const dialNeedle = ph * 4.0;
  ctx.beginPath();
  ctx.moveTo(dialX, dialY);
  ctx.lineTo(dialX + Math.cos(dialNeedle) * dialR * 0.85, dialY + Math.sin(dialNeedle) * dialR * 0.85);
  ctx.stroke();

  // Connected people reference markers along bottom rail
  if (room.people && room.people.length > 0) {
    const pSpan = (W * 0.9) / Math.max(room.people.length, 1);
    for (let pi = 0; pi < room.people.length; pi++) {
      const person = room.people[pi];
      const px = W * 0.05 + pi * pSpan + pSpan * 0.5;
      ctx.fillStyle = `hsla(${person.hue}, 80%, 65%, 0.45)`;
      ctx.fillRect(px - 1.5, groundY + 12, 3, 10);
    }
  }
}

// Glowing ribbons / motion streamlines connecting matching joints across historical snapshots
const snaps = room.state.snapshots;
const snapCount = snaps.length;

if (showRibbons && snapCount > 3) {
  ctx.globalCompositeOperation = 'screen';
  for (let rj = 0; rj < RIBBON_JOINTS.length; rj++) {
    const jIdx = RIBBON_JOINTS[rj];
    ctx.beginPath();
    for (let s = 0; s < snapCount; s++) {
      const sc = snaps[s].coords;
      const sx = sc[jIdx * 2];
      const sy = sc[jIdx * 2 + 1];
      if (s === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    // Streamline stroke fades from tail to head
    ctx.strokeStyle = colors[3];
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

// Render stroboscopic historical figures on the photographic plate
ctx.globalCompositeOperation = 'lighter';
const now = frame.t;
const maxAge = 2.4;
const baseJointR = jointGlow * 1.2;
const trebleJitter = (audio?.treble ?? 0) * 1.8;

for (let s = 0; s < snapCount; s++) {
  const sn = snaps[s];
  const age = now - sn.t;
  if (age > maxAge) continue;
  const decay = Math.max(0, 1 - age / maxAge);
  const alpha = decay * decay * 0.85;
  const sc = sn.coords;

  let boneCol = colors[0];
  let haloCol = colors[2];
  if (pal === 'spectral') {
    boneCol = `hsla(${sn.hueShift}, 85%, 65%, ${alpha})`;
    haloCol = `hsla(${sn.hueShift}, 90%, 75%, ${alpha * 0.5})`;
  }

  // Bones
  ctx.lineWidth = 1.2 + decay * 1.8;
  ctx.strokeStyle = boneCol;
  ctx.beginPath();
  for (let b = 0; b < BONES.length; b++) {
    const i1 = BONES[b][0];
    const i2 = BONES[b][1];
    ctx.moveTo(sc[i1 * 2], sc[i1 * 2 + 1]);
    ctx.lineTo(sc[i2 * 2], sc[i2 * 2 + 1]);
  }
  ctx.stroke();

  // Joint points
  for (let j = 0; j < 15; j++) {
    const jx = sc[j * 2];
    const jy = sc[j * 2 + 1];
    const jRad = (j === 2 ? baseJointR * 1.5 : baseJointR) * (0.6 + decay * 0.6);

    // Halos
    ctx.fillStyle = haloCol;
    ctx.beginPath();
    ctx.arc(jx, jy, jRad * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Dense core spark
    ctx.fillStyle = colors[1];
    ctx.beginPath();
    ctx.arc(jx, jy, Math.max(1, jRad * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }
}

// Current lead figure (crisp white-hot exposure with audio flare)
ctx.lineWidth = 2.8 + bass * 2.0;
ctx.strokeStyle = colors[1];
ctx.beginPath();
for (let b = 0; b < BONES.length; b++) {
  const p1 = pts[BONES[b][0]];
  const p2 = pts[BONES[b][1]];
  ctx.moveTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]);
}
ctx.stroke();

// Lead joints with phosphor blooming
for (let j = 0; j < 15; j++) {
  const p = pts[j];
  const isHead = j === 2;
  const r = (isHead ? baseJointR * 2.2 : baseJointR * 1.4) + bass * 3.0 + trebleJitter;

  // Soft outer flare
  ctx.fillStyle = colors[2];
  ctx.beginPath();
  ctx.arc(p[0], p[1], r * 3.0, 0, Math.PI * 2);
  ctx.fill();

  // Solid hot core
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  ctx.fill();
}

ctx.restore();