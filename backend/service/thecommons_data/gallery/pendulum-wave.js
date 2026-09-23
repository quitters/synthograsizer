ctx.save();

const N_MAX = 64;
if (!room.state.bx) {
  room.state.bx = new Float32Array(N_MAX);
  room.state.by = new Float32Array(N_MAX);
  room.state.bz = new Float32Array(N_MAX);
  room.state.ox = new Float32Array(N_MAX);
  room.state.oy = new Float32Array(N_MAX);
  room.state.flash = 0;
}

const N = Math.min(N_MAX, Math.max(16, getVar('pendulum_count') ?? 40));
const period = getVar('cycle_period') ?? 45;
const ampScale = getVar('swing_depth') ?? 0.8;
const viewMode = getVar('view_mode') || 'isometric';
const style = getVar('visual_style') || 'vector_laser';
const linkMode = getVar('ribbon_link') || 'glowing_ribbon';

const bass = audio ? (audio.bass || 0) : 0;
const beat = audio ? (audio.beat || false) : false;
const treble = audio ? (audio.treble || 0) : 0;
if (beat) room.state.flash = 1.0;
room.state.flash *= 0.91;

// Screen clearing with subtle persistent phosphor trail
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = style === 'amber_crt' ? 'rgba(8, 5, 2, 0.22)' : 'rgba(4, 5, 10, 0.22)';
ctx.fillRect(0, 0, frame.width, frame.height);

// Demoscene palette configurations
const palettes = {
  vector_laser: (i, t) => `hsl(${(160 + i * 4.2 + t * 25) % 360}, 95%, ${65 + bass * 25}%)`,
  neon_cyber: (i, t) => `hsl(${(280 + i * 3.8 + t * 40) % 360}, 100%, ${60 + bass * 30}%)`,
  amber_crt: (i) => `rgba(255, ${160 + (i % 6) * 15}, 35, ${0.75 + bass * 0.25})`,
  deep_void: (i, t) => `hsl(${(200 + Math.sin(t * 0.5 + i * 0.1) * 50) % 360}, 90%, ${70 + treble * 25}%)`
};
const getColor = palettes[style] || palettes.vector_laser;

// Base frequencies: slowest completes baseCycles in 'period' seconds
const baseCycles = 40;
const w = frame.width;
const h = frame.height;
const cx = w * 0.5;
const cy = h * 0.48;

// Audio-boosted swing envelope
const swingAmp = (0.75 + bass * 0.45) * ampScale;
const timePhase = (frame.t % period) / period;

// Perspective camera angles
let pitch = 0.55;
let yaw = -0.42;
let camDist = Math.min(w, h) * 0.85;

if (viewMode === 'front') {
  pitch = 0.05;
  yaw = 0.0;
} else if (viewMode === 'top_down') {
  pitch = 1.52;
  yaw = 0.0;
}

const cosP = Math.cos(pitch);
const sinP = Math.sin(pitch);
const cosY = Math.cos(yaw);
const sinY = Math.sin(yaw);

// Compute 3D coordinates for anchors and bobs
const span = Math.min(w, h) * 1.15;
const step = span / (N - 1);
const startX = -span * 0.5;

const bx = room.state.bx;
const by = room.state.by;
const bz = room.state.bz;
const ox = room.state.ox;
const oy = room.state.oy;

// Suspension rod length scaling across the cascade
for (let i = 0; i < N; i++) {
  const cycles = baseCycles + i;
  const omega = (cycles * 2 * Math.PI) / period;
  const theta = swingAmp * Math.sin(omega * frame.t);
  
  // Physical length relates inversely to square of frequency
  const relLen = Math.pow(baseCycles / cycles, 1.45);
  const arm = (Math.min(w, h) * 0.48) * relLen;

  // Anchor coordinates along the rack (Z-axis in top-down/iso)
  const rackX = startX + i * step;
  const rackY = -Math.min(w, h) * 0.28;
  const rackZ = (i - N * 0.5) * (step * 0.35);

  // Bob local oscillation in perpendicular plane
  const bobLocalX = rackX + Math.sin(theta) * (arm * 0.65);
  const bobLocalY = rackY + Math.cos(theta) * arm;
  const bobLocalZ = rackZ + Math.sin(theta) * (arm * 0.45);

  // 3D Rotation -> 2D Projection for bob
  const x1 = bobLocalX * cosY - bobLocalZ * sinY;
  const z1 = bobLocalX * sinY + bobLocalZ * cosY;
  const y1 = bobLocalY * cosP - z1 * sinP;
  const z2 = bobLocalY * sinP + z1 * cosP + camDist;
  const sB = camDist / Math.max(30, z2);

  bx[i] = cx + x1 * sB;
  by[i] = cy + y1 * sB;
  bz[i] = sB;

  // Project rack anchor
  const ax1 = rackX * cosY - rackZ * sinY;
  const az1 = rackX * sinY + rackZ * cosY;
  const ay1 = rackY * cosP - az1 * sinP;
  const az2 = rackY * sinP + az1 * cosP + camDist;
  const sA = camDist / Math.max(30, az2);

  ox[i] = cx + ax1 * sA;
  oy[i] = cy + ay1 * sA;
}

// Draw suspension rack
ctx.lineWidth = 1.8;
ctx.strokeStyle = style === 'amber_crt' ? 'rgba(255, 170, 50, 0.25)' : 'rgba(100, 180, 255, 0.28)';
ctx.beginPath();
ctx.moveTo(ox[0], oy[0]);
for (let i = 1; i < N; i++) {
  ctx.lineTo(ox[i], oy[i]);
}
ctx.stroke();

// Draw suspension wires (thin, additive glow)
ctx.globalCompositeOperation = 'screen';
for (let i = 0; i < N; i++) {
  const col = getColor(i, frame.t);
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.28 + (i % 2) * 0.12;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(ox[i], oy[i]);
  ctx.lineTo(bx[i], by[i]);
  ctx.stroke();
}

// Draw ribbon linkage (shows the snake wave, counter-spirals, and chaos clearly)
if (linkMode === 'glowing_ribbon') {
  ctx.lineWidth = 2.4 + bass * 2.2;
  ctx.beginPath();
  ctx.moveTo(bx[0], by[0]);
  for (let i = 1; i < N; i++) {
    const xc = (bx[i - 1] + bx[i]) * 0.5;
    const yc = (by[i - 1] + by[i]) * 0.5;
    ctx.quadraticCurveTo(bx[i - 1], by[i - 1], xc, yc);
  }
  ctx.lineTo(bx[N - 1], by[N - 1]);
  ctx.strokeStyle = style === 'amber_crt' ? 'rgba(255, 200, 80, 0.7)' : 'rgba(200, 255, 255, 0.75)';
  ctx.globalAlpha = 0.85;
  ctx.stroke();
} else if (linkMode === 'chasing_sparks') {
  ctx.lineWidth = 1.5;
  const sparkIdx = Math.floor((frame.t * 30) % N);
  for (let i = 0; i < N - 1; i++) {
    const d = Math.abs(i - sparkIdx);
    if (d < 5) {
      ctx.strokeStyle = getColor(i, frame.t);
      ctx.globalAlpha = (1 - d / 5);
      ctx.beginPath();
      ctx.moveTo(bx[i], by[i]);
      ctx.lineTo(bx[i + 1], by[i + 1]);
      ctx.stroke();
    }
  }
}

// Draw the pendulum bobs with depth scaling and audio-pulsed halos
const peopleCount = room.people ? room.people.length : 0;
for (let i = 0; i < N; i++) {
  const scale = bz[i];
  const baseRadius = (5.5 + Math.sin(i * 0.35) * 1.5) * scale * 0.95;
  const radius = baseRadius * (1 + bass * 0.5 + (i % 7 === 0 ? room.state.flash * 0.6 : 0));
  const x = bx[i];
  const y = by[i];

  // People mapped to oscillator hues if connected
  let bobCol = getColor(i, frame.t);
  if (peopleCount > 0 && i < peopleCount) {
    bobCol = `hsl(${room.people[i].hue}, 95%, 70%)`;
  }

  // Outer glow aura
  const glow = radius * (2.8 + bass * 1.5);
  const grad = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, glow));
  grad.addColorStop(0, bobCol);
  grad.addColorStop(0.3, bobCol);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  
  ctx.globalAlpha = 0.45 + bass * 0.3;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, glow, 0, 6.28318);
  ctx.fill();

  // Sharp solid core
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.8, radius * 0.45), 0, 6.28318);
  ctx.fill();
}

// Phase progress HUD & demoscene status line
ctx.globalCompositeOperation = 'source-over';
ctx.globalAlpha = 0.7;
ctx.fillStyle = style === 'amber_crt' ? '#ff9a2b' : '#3bf6ff';
ctx.font = '11px monospace';
const pct = Math.floor(timePhase * 100);
const statusText = `RESONANCE // T+${frame.t.toFixed(1)}s  CYCLE: ${pct}%  NODES: ${N}  AUDIO: ${(bass * 100).toFixed(0)}%`;
ctx.fillText(statusText, 24, h - 22);

// Mini progress bar along bottom
const barW = Math.min(240, w * 0.25);
ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
ctx.fillRect(24, h - 14, barW, 2);
ctx.fillStyle = style === 'amber_crt' ? '#ffaa33' : '#00e5ff';
ctx.fillRect(24, h - 14, barW * timePhase, 2);

ctx.restore();