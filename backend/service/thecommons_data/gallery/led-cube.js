ctx.save();

const N = 16;
const TOTAL = N * N * N;

// Allocate persistent demoscene buffers once in room.state
if (!room.state.coords) {
  room.state.coords = new Float32Array(TOTAL * 3);
  room.state.intensities = new Float32Array(TOTAL);
  room.state.proj = new Float32Array(TOTAL * 4); // sx, sy, depth, intensity
  room.state.order = new Int32Array(TOTAL);
  room.state.bins = new Int32Array(256 * 200);
  room.state.binCounts = new Int32Array(256);
  room.state.rainDrops = new Float32Array(N * N);
  room.state.rainSpeeds = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    room.state.rainDrops[i] = Math.random() * N;
    room.state.rainSpeeds[i] = 2.5 + Math.random() * 4.0;
  }
  let ptr = 0;
  const step = 1.0 / (N - 1);
  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        room.state.coords[ptr * 3 + 0] = (x * step - 0.5) * 2.0;
        room.state.coords[ptr * 3 + 1] = (y * step - 0.5) * 2.0;
        room.state.coords[ptr * 3 + 2] = (z * step - 0.5) * 2.0;
        ptr++;
      }
    }
  }
}

const mode = getVar('mode') ?? 'sine_sheet';
const palChoice = getVar('palette') ?? 'electric_cyan';
const rotSpeed = getVar('rot_speed') ?? 1.0;
const tiltDeg = getVar('cube_tilt') ?? 20;
const glowMult = getVar('glow_intensity') ?? 1.5;
const showUnlit = getVar('unlit_grid') ?? true;
const audioReact = getVar('audio_punch') ?? true;

// Color palette lookup
const palettes = {
  electric_cyan: [185, 200, 240, 255, 60, 220, 255],
  amber_core:    [28,  35, 255, 200, 80, 255, 120],
  neon_magenta:  [310, 330, 255, 120, 240, 255, 80],
  matrix_green:  [135, 145, 100, 255, 150, 60, 255],
  aurora_shift:  [210, 280, 180, 255, 230, 255, 100]
};
const pal = palettes[palChoice] ?? palettes.electric_cyan;

// Blackout backdrop with subtle vignette
ctx.fillStyle = '#020306';
ctx.fillRect(0, 0, frame.width, frame.height);

// Audio drivers
const bass = audioReact ? (audio.bass || 0) : 0;
const treble = audioReact ? (audio.treble || 0) : 0;
const beatKick = (audioReact && audio.beat) ? 1.0 : 0.0;

// Update rain simulation
const rainDrops = room.state.rainDrops;
const rainSpeeds = room.state.rainSpeeds;
const dt = Math.min(frame.dt || 0.016, 0.05);
for (let i = 0; i < N * N; i++) {
  rainDrops[i] += rainSpeeds[i] * dt * (1.0 + bass * 0.8);
  if (rainDrops[i] >= N) rainDrops[i] -= N;
}

// Volumetric calculation per voxel
const coords = room.state.coords;
const intensities = room.state.intensities;
const t = frame.t;
let idx = 0;

for (let z = 0; z < N; z++) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let br = 0.0;
      if (mode === 'sine_sheet') {
        const dist = Math.hypot(x - 7.5, z - 7.5);
        const wave = 7.5 + Math.sin(dist * 0.7 - t * 3.5) * (3.5 + bass * 2.5) + Math.cos(x * 0.5 + t * 2.0) * 1.5;
        const dy = Math.abs(y - wave);
        if (dy < 1.4) br = Math.max(0, 1.0 - dy / 1.4);
      } else if (mode === 'bouncing_orb') {
        const ox = 7.5 + Math.sin(t * 1.8) * 4.5;
        const oy = 7.5 + Math.abs(Math.sin(t * 2.6)) * 6.0 - 3.0;
        const oz = 7.5 + Math.cos(t * 1.4) * 4.5;
        const rad = 3.6 + bass * 1.8 + beatKick * 0.8;
        const d = Math.hypot(x - ox, y - oy, z - oz);
        const shell = Math.abs(d - rad);
        if (shell < 1.6) br = Math.max(0, 1.0 - shell / 1.6);
        if (d < 1.2) br = 1.0;
      } else if (mode === 'matrix_rain') {
        const col = x + z * N;
        const ry = rainDrops[col];
        const diff = (y - ry + N) % N;
        if (diff < 3.2) br = Math.pow(Math.max(0, 1.0 - diff / 3.2), 1.5);
      } else {
        // spinning_helix
        const angle = y * 0.55 + t * 3.0;
        const rad = 5.0 + Math.sin(y * 0.3 + t) * 1.2 + bass * 1.5;
        const hx1 = 7.5 + Math.cos(angle) * rad;
        const hz1 = 7.5 + Math.sin(angle) * rad;
        const hx2 = 7.5 + Math.cos(angle + Math.PI) * rad;
        const hz2 = 7.5 + Math.sin(angle + Math.PI) * rad;
        const d1 = Math.hypot(x - hx1, z - hz1);
        const d2 = Math.hypot(x - hx2, z - hz2);
        const minD = Math.min(d1, d2);
        if (minD < 1.5) br = Math.max(0, 1.0 - minD / 1.5);
      }
      intensities[idx++] = Math.min(1.0, br + beatKick * 0.15);
    }
  }
}

// 3D Matrix Rotation & Perspective
const yaw = t * 0.45 * rotSpeed + (audio.level || 0) * 0.2;
const pitch = (tiltDeg * Math.PI) / 180 + Math.sin(t * 0.35) * 0.08;
const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

const cx = frame.width * 0.5;
const cy = frame.height * 0.5;
const scale = Math.min(frame.width, frame.height) * 0.42;
const camDist = 3.6;

const proj = room.state.proj;
let minZ = 1e9, maxZ = -1e9;

for (let i = 0; i < TOTAL; i++) {
  const p3 = i * 3;
  const x0 = coords[p3];
  const y0 = coords[p3 + 1];
  const z0 = coords[p3 + 2];

  // Yaw rotation (around Y)
  const x1 = x0 * cosY + z0 * sinY;
  const z1 = -x0 * sinY + z0 * cosY;

  // Pitch rotation (around X)
  const y2 = y0 * cosP - z1 * sinP;
  const z2 = y0 * sinP + z1 * cosP;

  const zCam = z2 + camDist;
  const pFactor = scale / zCam;
  const sx = cx + x1 * pFactor;
  const sy = cy + y2 * pFactor;

  const p4 = i * 4;
  proj[p4 + 0] = sx;
  proj[p4 + 1] = sy;
  proj[p4 + 2] = zCam;
  proj[p4 + 3] = intensities[i];

  if (zCam < minZ) minZ = zCam;
  if (zCam > maxZ) maxZ = zCam;
}

// O(N) integer bucket sort for back-to-front rendering
const binCounts = room.state.binCounts;
binCounts.fill(0);
const bins = room.state.bins;
const zRange = Math.max(0.001, maxZ - minZ);

for (let i = 0; i < TOTAL; i++) {
  const z = proj[i * 4 + 2];
  let b = Math.floor(((z - minZ) / zRange) * 255);
  if (b < 0) b = 0; else if (b > 255) b = 255;
  // Back-to-front: larger z drawn first
  const slot = (255 - b) * 200 + binCounts[255 - b];
  if (binCounts[255 - b] < 199) {
    bins[slot] = i;
    binCounts[255 - b]++;
  }
}

// Render pass 1: Subtle connection struts / cube outer wireframe for demoscene polish
const corners = [
  [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
  [-1,-1, 1],[1,-1, 1],[1,1, 1],[-1,1, 1]
];
const pEdges = [
  [0,1],[1,2],[2,3],[3,0],
  [4,5],[5,6],[6,7],[7,4],
  [0,4],[1,5],[2,6],[3,7]
];
ctx.beginPath();
for (let e = 0; e < pEdges.length; e++) {
  const a = corners[pEdges[e][0]];
  const b = corners[pEdges[e][1]];
  const projCorner = (c) => {
    const x1 = c[0] * cosY + c[2] * sinY;
    const z1 = -c[0] * sinY + c[2] * cosY;
    const y2 = c[1] * cosP - z1 * sinP;
    const z2 = c[1] * sinP + z1 * cosP;
    const pF = scale / (z2 + camDist);
    return [cx + x1 * pF, cy + y2 * pF];
  };
  const pA = projCorner(a);
  const pB = projCorner(b);
  ctx.moveTo(pA[0], pA[1]);
  ctx.lineTo(pB[0], pB[1]);
}
ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
ctx.lineWidth = 1.0;
ctx.stroke();

// Render pass 2: Inactive/dim LEDs in single high-speed batch
if (showUnlit) {
  ctx.fillStyle = 'rgba(120, 160, 210, 0.04)';
  for (let i = 0; i < TOTAL; i += 2) {
    const p4 = i * 4;
    if (proj[p4 + 3] < 0.08) {
      const sx = proj[p4 + 0];
      const sy = proj[p4 + 1];
      ctx.fillRect(sx - 0.75, sy - 0.75, 1.5, 1.5);
    }
  }
}

// Render pass 3: Lit LEDs with bloom and depth styling
ctx.globalCompositeOperation = 'lighter';
const baseH = pal[0];
const altH = pal[1];
const glowR = 12 * glowMult;

for (let b = 0; b < 256; b++) {
  const count = binCounts[b];
  for (let c = 0; c < count; c++) {
    const id = bins[b * 200 + c];
    const p4 = id * 4;
    const br = proj[p4 + 3];
    if (br <= 0.06) continue;

    const sx = proj[p4 + 0];
    const sy = proj[p4 + 1];
    const zCam = proj[p4 + 2];
    const depthNorm = Math.max(0.4, 1.35 - (zCam - minZ) / zRange * 0.7);

    // Color interpolate by height or wave
    const hue = (baseH + (coords[id * 3 + 1] * 0.5 + 0.5) * (altH - baseH) + (palChoice === 'aurora_shift' ? t * 25 : 0)) % 360;
    const rad = (1.5 + br * 3.5) * depthNorm;

    // Wide soft bloom for energized voxels
    if (br > 0.4 && glowMult > 0.6) {
      const bloomSize = glowR * br * depthNorm;
      const alpha = (br * 0.22 + treble * 0.15) * glowMult;
      ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${Math.min(0.45, alpha)})`;
      ctx.fillRect(sx - bloomSize * 0.5, sy - bloomSize * 0.5, bloomSize, bloomSize);
    }

    // Intense core LED bead
    const coreAlpha = Math.min(1.0, br * 0.9 + 0.1);
    ctx.fillStyle = `hsla(${hue}, 100%, ${65 + br * 25}%, ${coreAlpha})`;
    ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
  }
}

// Subtle floor reflection of the volumetric lattice
ctx.globalCompositeOperation = 'screen';
const floorGrad = ctx.createRadialGradient(cx, cy + scale * 0.75, 10, cx, cy + scale * 0.75, scale * 0.9);
floorGrad.addColorStop(0, `hsla(${baseH}, 80%, 45%, ${0.12 + bass * 0.08})`);
floorGrad.addColorStop(1, 'transparent');
ctx.fillStyle = floorGrad;
ctx.fillRect(cx - scale, cy + scale * 0.5, scale * 2, scale * 0.5);

ctx.restore();