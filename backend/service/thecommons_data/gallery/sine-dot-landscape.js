ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.52;

const palChoice = getVar('palette') ?? 'cyber_cyan';
const waveMode = getVar('wave_complexity') ?? 'smooth_ripple';
const viewAngle = getVar('view_angle') ?? 'horizon';
const pointStyle = getVar('point_style') ?? 'phosphor_dot';
const speed = getVar('speed') ?? 1.0;
const elevation = getVar('elevation') ?? 1.5;

// --- PRECOMPUTED PALETTES (0..127 LUT in room.state) ---
if (!room.state.colorLUT || room.state.activePal !== palChoice) {
  room.state.activePal = palChoice;
  room.state.colorLUT = new Array(128);
  for (let i = 0; i < 128; i++) {
    const f = i / 127;
    let r = 0, g = 0, b = 0;
    if (palChoice === 'amber_crt') {
      r = Math.min(255, Math.floor(40 + f * 215));
      g = Math.min(255, Math.floor(Math.pow(f, 1.5) * 195));
      b = Math.min(255, Math.floor(Math.pow(f, 3.8) * 220));
    } else if (palChoice === 'synthwave') {
      if (f < 0.5) {
        const t = f * 2;
        r = Math.floor(80 + t * 175);
        g = Math.floor(15 + t * 30);
        b = Math.floor(150 + t * 105);
      } else {
        const t = (f - 0.5) * 2;
        r = Math.floor(255 - t * 210);
        g = Math.floor(45 + t * 210);
        b = Math.floor(255);
      }
    } else if (palChoice === 'matrix_emerald') {
      r = Math.min(255, Math.floor(Math.pow(f, 3.0) * 200));
      g = Math.min(255, Math.floor(35 + f * 220));
      b = Math.min(255, Math.floor(Math.pow(f, 1.8) * 150));
    } else {
      // cyber_cyan
      r = Math.min(255, Math.floor(Math.pow(f, 2.4) * 210));
      g = Math.min(255, Math.floor(30 + f * 225));
      b = Math.min(255, Math.floor(90 + f * 165));
    }
    room.state.colorLUT[i] = `rgb(${r},${g},${b})`;
  }
}
const colorLUT = room.state.colorLUT;

// --- FIXED DEMOSCENE BUFFERS ---
const NX = 48;
const NZ = 48;
const TOTAL_PTS = NX * NZ;
room.state.projX ??= new Float32Array(TOTAL_PTS);
room.state.projY ??= new Float32Array(TOTAL_PTS);
room.state.projZ ??= new Float32Array(TOTAL_PTS);
room.state.projS ??= new Float32Array(TOTAL_PTS);
room.state.projH ??= new Float32Array(TOTAL_PTS);

const pxBuf = room.state.projX;
const pyBuf = room.state.projY;
const pzBuf = room.state.projZ;
const psBuf = room.state.projS;
const phBuf = room.state.projH;

// --- SHOCKWAVE QUEUE (triggered on musical beat) ---
room.state.shockwaves ??= [];
if (audio.beat && (!room.state.lastBeat || frame.t - room.state.lastBeat > 0.2)) {
  room.state.lastBeat = frame.t;
  if (room.state.shockwaves.length > 3) room.state.shockwaves.shift();
  room.state.shockwaves.push({ t0: frame.t, speed: 680 + audio.bass * 400 });
}

// --- PERSISTENT PHOSPHOR BACKGROUND FADE ---
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = 'rgba(6, 7, 12, 0.32)';
ctx.fillRect(0, 0, W, H);

// --- CAMERA RIG & ANGLES ---
let pitch = 0.26;
let camY = 240;
if (viewAngle === 'bird_eye') {
  pitch = 0.65;
  camY = 640;
} else if (viewAngle === 'low_angle') {
  pitch = 0.12;
  camY = 110;
}

const slowYaw = Math.sin(frame.t * 0.12) * 0.14;
const cp = Math.cos(pitch);
const sp = Math.sin(pitch);
const cyaw = Math.cos(slowYaw);
const syaw = Math.sin(slowYaw);
const fov = H * 0.88;

// --- SIMULATION GEOMETRY ---
const spanX = 1350;
const spanZ = 1350;
const dx = spanX / (NX - 1);
const dz = spanZ / (NZ - 1);
const startX = -spanX * 0.5;
const startZ = 280;
const wt = frame.t * speed;

// Active attendees as membrane harmonic probes
const people = room.people || [];
const numPeople = Math.min(6, people.length);

let minH = 9999;
let maxH = -9999;

// 1ST PASS: HEIGHT COMPUTATION & 3D PROJECTION
for (let gz = 0; gz < NZ; gz++) {
  const wz = startZ + gz * dz;
  const v = wz * 0.0045;

  for (let gx = 0; gx < NX; gx++) {
    const idx = gz * NX + gx;
    const wx = startX + gx * dx;
    const u = wx * 0.0045;

    let h = 0;
    if (waveMode === 'standing_chladni') {
      h = (Math.sin(u * 2.8) * Math.sin(v * 2.8) - Math.cos(u * 4.2) * Math.cos(v * 4.2)) * 48;
      h += Math.sin((u + v) * 3.5 - wt * 2.2) * (20 + audio.mid * 35);
    } else if (waveMode === 'cross_swell') {
      h = Math.sin(u * 2.2 + v * 1.6 - wt * 2.0) * 34 + Math.sin(-u * 1.8 + v * 2.4 + wt * 1.7) * 34;
      h += Math.cos(u * 4.8 - wt * 3.2) * (14 + audio.mid * 35);
    } else if (waveMode === 'chaotic_surge') {
      h = Math.sin(u * 1.8 + wt) * 24 + Math.sin(v * 2.7 - wt * 1.3) * 24 + Math.cos((u - v) * 3.4 + wt * 1.9) * 24;
      h += Math.sin(Math.hypot(u, v) * 5.0 - wt * 3.0) * (20 + audio.bass * 50);
    } else {
      // smooth_ripple
      const r = Math.hypot(u, v);
      h = Math.sin(u * 1.8 - wt * 1.4) * 28 + Math.cos(v * 1.8 - wt * 1.1) * 28;
      h += Math.sin(r * 3.8 - wt * 2.6) * (34 + audio.bass * 60);
    }

    // Musical beat shockwave rings
    const distCenter = Math.hypot(wx, wz - (startZ + spanZ * 0.5));
    for (let s = 0; s < room.state.shockwaves.length; s++) {
      const sw = room.state.shockwaves[s];
      const waveR = (frame.t - sw.t0) * sw.speed;
      const delta = Math.abs(distCenter - waveR);
      if (delta < 140) {
        h += Math.sin(delta * 0.045) * Math.exp(-delta * 0.02) * (45 + audio.bass * 35);
      }
    }

    // Room people harmonics
    for (let p = 0; p < numPeople; p++) {
      const person = people[p];
      const rad = (person.hue || 0) * (Math.PI / 180);
      const pWorldX = Math.sin(rad) * 380;
      const pWorldZ = startZ + spanZ * 0.5 + Math.cos(rad) * 320;
      const distP = Math.hypot(wx - pWorldX, wz - pWorldZ);
      if (distP < 360) {
        h += Math.sin(distP * 0.035 - wt * 3.0) * Math.exp(-distP * 0.007) * 20;
      }
    }

    // Final world height
    const wy = h * elevation * (1.0 + audio.bass * 0.7);
    if (wy < minH) minH = wy;
    if (wy > maxH) maxH = wy;

    // 3D transformation
    const dy = wy - camY;
    const y1 = dy * cp - wz * sp;
    const z1 = dy * sp + wz * cp;

    const x2 = wx * cyaw + z1 * syaw;
    const z2 = -wx * syaw + z1 * cyaw;
    const y2 = y1;

    if (z2 <= 30) {
      pzBuf[idx] = -1.0;
      continue;
    }

    const invZ = 1.0 / z2;
    pxBuf[idx] = cx + x2 * fov * invZ;
    pyBuf[idx] = cy - y2 * fov * invZ;
    pzBuf[idx] = z2;
    psBuf[idx] = Math.max(1.0, 3.8 * fov * invZ);
    phBuf[idx] = wy;
  }
}

const heightSpan = Math.max(1.0, maxH - minH);
const invSpan = 1.0 / heightSpan;

// 2ND PASS: WIREFRAME HORIZONTAL RASTER LINES
ctx.globalCompositeOperation = 'lighter';
ctx.lineWidth = 0.85;
for (let gz = 0; gz < NZ; gz += 2) {
  let lineStarted = false;
  const avgIdx = gz * NX + (NX >> 1);
  const normH = Math.max(0, Math.min(127, Math.floor(((phBuf[avgIdx] - minH) * invSpan) * 127)));
  ctx.strokeStyle = colorLUT[normH];
  ctx.globalAlpha = 0.22 + audio.level * 0.25;
  ctx.beginPath();

  for (let gx = 0; gx < NX; gx++) {
    const idx = gz * NX + gx;
    if (pzBuf[idx] <= 0) continue;
    if (!lineStarted) {
      ctx.moveTo(pxBuf[idx], pyBuf[idx]);
      lineStarted = true;
    } else {
      ctx.lineTo(pxBuf[idx], pyBuf[idx]);
    }
  }
  if (lineStarted) ctx.stroke();
}

// 3RD PASS: PHOSPHOR DOT MATRIX (BACK TO FRONT OCCLUSION)
for (let gz = NZ - 1; gz >= 0; gz--) {
  for (let gx = 0; gx < NX; gx++) {
    const idx = gz * NX + gx;
    const z = pzBuf[idx];
    if (z <= 0) continue;

    const px = pxBuf[idx];
    const py = pyBuf[idx];
    if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;

    const sz = psBuf[idx];
    const normH = (phBuf[idx] - minH) * invSpan;
    const colorIdx = Math.max(0, Math.min(127, Math.floor((normH + audio.mid * 0.25) * 127)));
    ctx.fillStyle = colorLUT[colorIdx];
    ctx.globalAlpha = Math.min(1.0, 0.45 + normH * 0.55 + audio.treble * 0.25);

    if (pointStyle === 'square_voxel') {
      ctx.fillRect(px - sz * 0.65, py - sz * 0.65, sz * 1.3, sz * 1.3);
    } else if (pointStyle === 'ring_blip') {
      ctx.strokeStyle = colorLUT[colorIdx];
      ctx.lineWidth = Math.max(1, sz * 0.25);
      ctx.beginPath();
      ctx.arc(px, py, sz * 0.75, 0, 6.283);
      ctx.stroke();
    } else {
      // phosphor_dot
      if (sz < 2.4) {
        ctx.fillRect(px - sz * 0.5, py - sz * 0.5, sz, sz);
      } else {
        ctx.beginPath();
        ctx.arc(px, py, sz * 0.55, 0, 6.283);
        ctx.fill();
      }
    }

    // Crest audio glitter
    if (normH > 0.85 && audio.treble > 0.35) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = audio.treble;
      ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
    }
  }
}

// 4TH PASS: ROOM PARTICIPANT BEACONS
for (let p = 0; p < numPeople; p++) {
  const person = people[p];
  const rad = (person.hue || 0) * (Math.PI / 180);
  const pWorldX = Math.sin(rad) * 380;
  const pWorldZ = startZ + spanZ * 0.5 + Math.cos(rad) * 320;

  const bDy = -camY - 70;
  const bY1 = bDy * cp - pWorldZ * sp;
  const bZ1 = bDy * sp + pWorldZ * cp;
  const bX2 = pWorldX * cyaw + bZ1 * syaw;
  const bZ2 = -pWorldX * syaw + bZ1 * cyaw;

  if (bZ2 > 40) {
    const bInvZ = 1.0 / bZ2;
    const bSx = cx + bX2 * fov * bInvZ;
    const bSy = cy - bY1 * fov * bInvZ;
    const bR = Math.max(3, 10 * fov * bInvZ);

    ctx.strokeStyle = `hsl(${person.hue}, 95%, 65%)`;
    ctx.fillStyle = `hsla(${person.hue}, 95%, 65%, 0.4)`;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;

    // Diamond reticle
    ctx.beginPath();
    ctx.moveTo(bSx, bSy - bR * 1.5);
    ctx.lineTo(bSx + bR, bSy);
    ctx.lineTo(bSx, bSy + bR * 1.5);
    ctx.lineTo(bSx - bR, bSy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Vertical sonar drop beam
    ctx.strokeStyle = `hsla(${person.hue}, 85%, 65%, 0.3)`;
    ctx.beginPath();
    ctx.moveTo(bSx, bSy);
    ctx.lineTo(bSx, bSy + bR * 3.5);
    ctx.stroke();
  }
}

// --- DEMOSCENE TELEMETRY HUD ---
ctx.globalCompositeOperation = 'source-over';
ctx.font = '10px monospace';
ctx.fillStyle = colorLUT[75];
ctx.globalAlpha = 0.65;
ctx.fillText(`MEMBRANE OSCILLATOR // RES: ${NX}x${NZ} // BASS: ${audio.bass.toFixed(2)}`, 24, 28);
ctx.fillText(`MODE: ${waveMode.toUpperCase()} // PAL: ${palChoice.toUpperCase()}`, 24, 44);

ctx.restore();