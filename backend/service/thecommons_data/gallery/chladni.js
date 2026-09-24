ctx.save();

const count = Math.min(4500, Math.max(1500, getVar('particle_count') ?? 3000));
const drive = getVar('vibration_power') ?? 1.25;
const matKey = getVar('plate_material') ?? 'Dark Slate';
const palKey = getVar('grain_palette') ?? 'Fine Quartz';
const switchMode = getVar('auto_switch') ?? 'On Beat';

const MODES = [
  { n: 1, m: 2, a: 1.0, b: 1.0 },
  { n: 1, m: 3, a: 1.0, b: 0.9 },
  { n: 2, m: 3, a: 1.0, b: 1.0 },
  { n: 3, m: 3, a: 0.9, b: 1.1 },
  { n: 2, m: 4, a: 1.1, b: 0.8 },
  { n: 1, m: 5, a: 0.8, b: 1.2 },
  { n: 3, m: 5, a: 1.0, b: 1.0 },
  { n: 4, m: 5, a: 1.0, b: 0.9 },
  { n: 2, m: 6, a: 0.9, b: 1.1 },
  { n: 5, m: 5, a: 1.0, b: 1.0 }
];

const MATS = {
  'Dark Slate':      { bg: '#0b0d11', rim: '#3b4252', plate: '#14171f', glow: 'rgba(59,66,82,0.3)' },
  'Obsidian Mirror': { bg: '#050508', rim: '#483d8b', plate: '#0c0b14', glow: 'rgba(106,90,205,0.25)' },
  'Aged Brass':      { bg: '#100c06', rim: '#8c6b2d', plate: '#1f190e', glow: 'rgba(218,165,32,0.25)' },
  'Deep Indigo':     { bg: '#060814', rim: '#2a3a7c', plate: '#0e1329', glow: 'rgba(65,105,225,0.3)' }
};

const PALS = {
  'Fine Quartz':     { r: 240, g: 242, b: 245, a: 0.85, shadow: 'rgba(255,255,255,0.4)' },
  'Burnished Gold':  { r: 255, g: 215, b: 90,  a: 0.88, shadow: 'rgba(255,200,50,0.5)' },
  'Phosphor Green':  { r: 100, g: 255, b: 160, a: 0.85, shadow: 'rgba(80,255,140,0.5)' },
  'Bismuth Violet':  { r: 210, g: 150, b: 255, a: 0.85, shadow: 'rgba(180,100,255,0.45)' }
};

const mat = MATS[matKey] ?? MATS['Dark Slate'];
const pal = PALS[palKey] ?? PALS['Fine Quartz'];

if (!room.state.px || room.state.px.length < 4500) {
  room.state.px = new Float32Array(4500);
  room.state.py = new Float32Array(4500);
  room.state.vx = new Float32Array(4500);
  room.state.vy = new Float32Array(4500);
  for (let i = 0; i < 4500; i++) {
    room.state.px[i] = (Math.random() * 2 - 1) * 0.94;
    room.state.py[i] = (Math.random() * 2 - 1) * 0.94;
    room.state.vx[i] = 0;
    room.state.vy[i] = 0;
  }
  room.state.modeA = 0;
  room.state.modeB = 1;
  room.state.blend = 1;
  room.state.lastSwitchT = 0;
}

let triggerFired = false;
if (room.events) {
  for (const e of room.events) {
    if (e.name === 'switch_mode') triggerFired = true;
  }
}

const now = frame.t;
let shouldAdvance = triggerFired;
if (switchMode === 'On Beat' && audio.beat && (now - room.state.lastSwitchT > 1.2)) {
  shouldAdvance = true;
} else if (switchMode === 'Slow Drift' && (now - room.state.lastSwitchT > 7.0)) {
  shouldAdvance = true;
}

if (shouldAdvance) {
  room.state.modeA = room.state.modeB;
  let next = (room.state.modeB + 1 + Math.floor(Math.random() * 2)) % MODES.length;
  if (next === room.state.modeA) next = (next + 1) % MODES.length;
  room.state.modeB = next;
  room.state.blend = 0;
  room.state.lastSwitchT = now;
}

room.state.blend = Math.min(1, room.state.blend + frame.dt * 1.5);

const mA = MODES[room.state.modeA];
const mB = MODES[room.state.modeB];
const bl = room.state.blend;
const sbl = bl * bl * (3 - 2 * bl);

const n_val = (1 - sbl) * mA.n + sbl * mB.n;
const m_val = (1 - sbl) * mA.m + sbl * mB.m;
const a_val = (1 - sbl) * mA.a + sbl * mB.a;
const b_val = (1 - sbl) * mA.b + sbl * mB.b;

ctx.fillStyle = mat.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

const side = Math.min(frame.width, frame.height) * 0.84;
const cx = frame.width * 0.5;
const cy = frame.height * 0.5;
const half = side * 0.5;

ctx.save();
ctx.translate(cx, cy);

ctx.shadowColor = mat.glow;
ctx.shadowBlur = 35 + audio.bass * 25;
ctx.fillStyle = mat.plate;
ctx.fillRect(-half, -half, side, side);
ctx.shadowBlur = 0;

ctx.strokeStyle = mat.rim;
ctx.lineWidth = 4;
ctx.strokeRect(-half, -half, side, side);

ctx.strokeStyle = 'rgba(255,255,255,0.06)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(-half, 0); ctx.lineTo(half, 0);
ctx.moveTo(0, -half); ctx.lineTo(0, half);
ctx.stroke();

const px = room.state.px;
const py = room.state.py;
const vx = room.state.vx;
const vy = room.state.vy;

const baseAmp = 0.045 * drive * (1 + audio.bass * 1.8 + audio.level * 0.6);
const drag = 0.80;
const pi = Math.PI;
const kn = n_val * pi * 0.5;
const km = m_val * pi * 0.5;

for (let i = 0; i < count; i++) {
  const x = px[i];
  const y = py[i];

  const cnx = Math.cos(kn * x);
  const cmy = Math.cos(km * y);
  const cmx = Math.cos(km * x);
  const cny = Math.cos(kn * y);
  const w = a_val * cnx * cmy - b_val * cmx * cny;

  const snx = Math.sin(kn * x);
  const smy = Math.sin(km * y);
  const smx = Math.sin(km * x);
  const sny = Math.sin(kn * y);

  const dw_dx = -a_val * kn * snx * cmy + b_val * km * smx * cny;
  const dw_dy = -a_val * km * cnx * smy + b_val * kn * cmx * sny;

  const gradUx = w * dw_dx;
  const gradUy = w * dw_dy;

  const bounce = Math.abs(w) * baseAmp;
  const angle = ((i * 101.3) + frame.t * 37) % 6.283;
  const kickX = Math.cos(angle) * bounce;
  const kickY = Math.sin(angle) * bounce;

  let curVx = (vx[i] - gradUx * 0.035 * drive + kickX) * drag;
  let curVy = (vy[i] - gradUy * 0.035 * drive + kickY) * drag;

  let nextX = x + curVx;
  let nextY = y + curVy;

  if (nextX < -0.95) { nextX = -0.95; curVx = Math.abs(curVx) * 0.5; }
  else if (nextX > 0.95) { nextX = 0.95; curVx = -Math.abs(curVx) * 0.5; }
  if (nextY < -0.95) { nextY = -0.95; curVy = Math.abs(curVy) * 0.5; }
  else if (nextY > 0.95) { nextY = 0.95; curVy = -Math.abs(curVy) * 0.5; }

  px[i] = nextX;
  py[i] = nextY;
  vx[i] = curVx;
  vy[i] = curVy;
}

ctx.fillStyle = `rgba(${pal.r}, ${pal.g}, ${pal.b}, ${pal.a})`;
const grainSize = side < 600 ? 1.5 : 2.0;
const pRad = half;

for (let i = 0; i < count; i++) {
  const sx = px[i] * pRad;
  const sy = py[i] * pRad;
  ctx.fillRect(sx, sy, grainSize, grainSize);
}

if (room.people && room.people.length > 0) {
  const pStep = (side * 2) / (room.people.length + 1);
  for (let idx = 0; idx < room.people.length; idx++) {
    const person = room.people[idx];
    const pinX = -half + pStep * (idx + 1);
    ctx.fillStyle = `hsl(${person.hue ?? 40}, 80%, 55%)`;
    ctx.beginPath();
    ctx.arc(pinX, half + 7, 3, 0, 6.283);
    ctx.fill();
  }
}

ctx.font = '10px monospace';
ctx.fillStyle = 'rgba(255,255,255,0.45)';
ctx.textAlign = 'right';
ctx.fillText(`MODE [${mB.n}, ${mB.m}] | Δ ${audio.bass.toFixed(2)}`, half - 8, half - 8);

ctx.restore();
ctx.restore();