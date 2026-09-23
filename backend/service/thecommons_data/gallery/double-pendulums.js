ctx.save();
const W = frame.width;
const H = frame.height;
const count = Math.min(96, Math.max(12, Math.floor(getVar('pendulum_count') ?? 60)));
const spreadMul = (getVar('chaos_spread') ?? 2) * 0.00015;

const speedMap = { languid: 0.8, brisk: 1.4, hyper: 2.2 };
const simSpeed = speedMap[getVar('speed_rate')] ?? 1.4;

const fadeMap = { evanescent: 0.16, phosphor: 0.065, infinite: 0.02 };
const trailFade = fadeMap[getVar('trail_glow')] ?? 0.065;

const palChoice = getVar('color_scheme') ?? 'spectral';

// Allocate fixed demoscene buffers once inside room.state
const MAX_N = 96;
if (!room.state.th1) {
  room.state.th1 = new Float64Array(MAX_N);
  room.state.th2 = new Float64Array(MAX_N);
  room.state.w1 = new Float64Array(MAX_N);
  room.state.w2 = new Float64Array(MAX_N);
  room.state.prevX2 = new Float32Array(MAX_N);
  room.state.prevY2 = new Float32Array(MAX_N);
  room.state.currX2 = new Float32Array(MAX_N);
  room.state.currY2 = new Float32Array(MAX_N);
  room.state.prevX1 = new Float32Array(MAX_N);
  room.state.prevY1 = new Float32Array(MAX_N);
  room.state.currX1 = new Float32Array(MAX_N);
  room.state.currY1 = new Float32Array(MAX_N);
  room.state.cycleTimer = 0;
  room.state.baseAngle1 = Math.PI * 0.55;
  room.state.baseAngle2 = Math.PI * 0.55;
  room.state.initialized = false;
}

const resetFan = () => {
  const base1 = Math.PI * (0.45 + 0.35 * Math.sin(frame.t * 0.3));
  const base2 = Math.PI * (0.45 + 0.35 * Math.cos(frame.t * 0.23));
  for (let i = 0; i < MAX_N; i++) {
    const offset = (i - (count - 1) * 0.5) * spreadMul;
    room.state.th1[i] = base1 + offset;
    room.state.th2[i] = base2 + offset * 1.5;
    room.state.w1[i] = 0;
    room.state.w2[i] = 0;
    room.state.prevX2[i] = -1;
  }
};

if (!room.state.initialized) {
  resetFan();
  room.state.initialized = true;
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, W, H);
}

// Timed divergence cycle: reset every ~22 seconds or when chaos stabilizes
room.state.cycleTimer += frame.dt * simSpeed;
const CYCLE_PERIOD = 22;
if (room.state.cycleTimer > CYCLE_PERIOD) {
  room.state.cycleTimer = 0;
  resetFan();
}

// Backdrop trail wipe
ctx.fillStyle = `rgba(5, 5, 10, ${trailFade})`;
ctx.fillRect(0, 0, W, H);

// Physics constants & sub-stepping for numerical precision
const g = 9.81 * (1.0 + (audio.bass || 0) * 0.45);
const L1 = Math.min(W, H) * 0.22;
const L2 = Math.min(W, H) * 0.20;
const m1 = 1.0;
const m2 = 1.0;
const ox = W * 0.5;
const oy = H * 0.32;

// Euler-Cromer integration with small substeps for stability
const dtSim = Math.min(0.04, frame.dt || 0.016) * simSpeed;
const steps = 6;
const h = dtSim / steps;

for (let s = 0; s < steps; s++) {
  for (let i = 0; i < count; i++) {
    const t1 = room.state.th1[i];
    const t2 = room.state.th2[i];
    const v1 = room.state.w1[i];
    const v2 = room.state.w2[i];
    const delta = t1 - t2;
    const sinD = Math.sin(delta);
    const cosD = Math.cos(delta);

    const den1 = L1 * (2 * m1 + m2 - m2 * Math.cos(2 * t1 - 2 * t2));
    const num1 = -g * (2 * m1 + m2) * Math.sin(t1) - m2 * g * Math.sin(t1 - 2 * t2) - 2 * sinD * m2 * (v2 * v2 * L2 + v1 * v1 * L1 * cosD);
    const a1 = num1 / den1;

    const den2 = L2 * (2 * m1 + m2 - m2 * Math.cos(2 * t1 - 2 * t2));
    const num2 = 2 * sinD * (v1 * v1 * L1 * (m1 + m2) + g * (m1 + m2) * Math.cos(t1) + v2 * v2 * L2 * m2 * cosD);
    const a2 = num2 / den2;

    room.state.w1[i] = (v1 + a1 * h) * 0.9999;
    room.state.w2[i] = (v2 + a2 * h) * 0.9999;
    room.state.th1[i] += room.state.w1[i] * h;
    room.state.th2[i] += room.state.w2[i] * h;
  }
}

// Compute screen positions
for (let i = 0; i < count; i++) {
  const t1 = room.state.th1[i];
  const t2 = room.state.th2[i];
  const x1 = ox + L1 * Math.sin(t1);
  const y1 = oy + L1 * Math.cos(t1);
  const x2 = x1 + L2 * Math.sin(t2);
  const y2 = y1 + L2 * Math.cos(t2);

  room.state.currX1[i] = x1;
  room.state.currY1[i] = y1;
  room.state.currX2[i] = x2;
  room.state.currY2[i] = y2;
}

// Palette calculation helper
const getPendulumColor = (idx, total, alpha) => {
  const fraction = idx / total;
  let h = 0;
  let s = 95;
  let l = 55 + (audio.treble || 0) * 20;
  if (palChoice === 'spectral') {
    h = (fraction * 360 + frame.t * 6) % 360;
  } else if (palChoice === 'aurora') {
    h = 130 + Math.sin(fraction * Math.PI) * 110;
    s = 90;
    l = 50;
  } else {
    h = 10 + fraction * 65;
    s = 100;
    l = 52;
  }
  return `hsla(${h.toFixed(1)}, ${s}%, ${l}%, ${alpha.toFixed(3)})`;
};

ctx.globalCompositeOperation = 'lighter';

// Render ribbon trails between previous & current tip positions
ctx.lineWidth = 1.6 + (audio.treble || 0) * 2.0;
for (let i = 0; i < count; i++) {
  if (room.state.prevX2[i] >= 0) {
    ctx.beginPath();
    ctx.moveTo(room.state.prevX2[i], room.state.prevY2[i]);
    ctx.lineTo(room.state.currX2[i], room.state.currY2[i]);
    ctx.strokeStyle = getPendulumColor(i, count, 0.85);
    ctx.stroke();
  }
}

// Translucent connecting fan-sheet across the array when coherent
if (count > 1) {
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    if (i === 0) ctx.moveTo(room.state.currX2[i], room.state.currY2[i]);
    else ctx.lineTo(room.state.currX2[i], room.state.currY2[i]);
  }
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + (audio.mid || 0) * 0.2})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

// Pendulum rods & bobs
const rodAlpha = 0.08 + (audio.bass || 0) * 0.12;
for (let i = 0; i < count; i += 3) {
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(room.state.currX1[i], room.state.currY1[i]);
  ctx.lineTo(room.state.currX2[i], room.state.currY2[i]);
  ctx.strokeStyle = `rgba(180, 200, 255, ${rodAlpha})`;
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

// Glowing tips
const bobR = 2.2 + (audio.bass || 0) * 2.5;
for (let i = 0; i < count; i++) {
  ctx.beginPath();
  ctx.arc(room.state.currX2[i], room.state.currY2[i], bobR, 0, Math.PI * 2);
  ctx.fillStyle = getPendulumColor(i, count, 0.95);
  ctx.fill();
}

// Central anchor point
ctx.beginPath();
ctx.arc(ox, oy, 4 + (audio.bass || 0) * 3, 0, Math.PI * 2);
ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
ctx.fill();

// Connect to people in room with subtle peripheral resonance
if (room.people && room.people.length > 0) {
  const pLen = Math.min(room.people.length, 12);
  for (let p = 0; p < pLen; p++) {
    const targetPend = Math.floor((p / pLen) * count);
    const ph = room.people[p].hue ?? 200;
    ctx.beginPath();
    ctx.arc(room.state.currX2[targetPend], room.state.currY2[targetPend], bobR * 1.8, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${ph}, 90%, 65%, 0.4)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

// Cache positions for next frame's trail segments
for (let i = 0; i < count; i++) {
  room.state.prevX2[i] = room.state.currX2[i];
  room.state.prevY2[i] = room.state.currY2[i];
  room.state.prevX1[i] = room.state.currX1[i];
  room.state.prevY1[i] = room.state.currY1[i];
}

ctx.restore();