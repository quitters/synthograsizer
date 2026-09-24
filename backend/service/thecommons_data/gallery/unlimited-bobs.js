ctx.save();

const BW = 960;
const BH = 540;
const MAX_BUFFERS = 16;

// 1. Initialise persistent buffers and LUTs once in room.state
if (!room.state.init) {
  room.state.buffers = [];
  for (let i = 0; i < MAX_BUFFERS; i++) {
    room.state.buffers.push(new OffscreenCanvas(BW, BH));
  }
  room.state.spriteCanvas = new OffscreenCanvas(160, 160);
  room.state.bufIdx = 0;
  room.state.tSim = 0;
  room.state.lastTheme = '';
  room.state.lastSize = -1;
  room.state.lastBufCount = -1;
  room.state.init = true;
}

// 2. Read knobs & fallbacks
const bufCountMap = { '8 Buffers': 8, '12 Buffers': 12, '16 Buffers': 16 };
const nBuffers = bufCountMap[getVar('buffer_count')] ?? 12;

const fadeMap = { 'Tight Trail': 0.055, 'Standard Snake': 0.022, 'Endless Ribbon': 0.007 };
const fadeRate = fadeMap[getVar('fade_length')] ?? 0.022;

const rawSpeed = getVar('snake_speed');
const speed = (typeof rawSpeed === 'number' ? rawSpeed : 1.0);

const rawSize = getVar('bob_size');
const baseSize = (typeof rawSize === 'number' ? rawSize : 48);

const themeKey = getVar('copper_theme') ?? 'Classic Copper';
const curveKey = getVar('curve_pattern') ?? 'Lissajous';

// Clear buffers if ring size changed to prevent residual ghost jumps
if (room.state.lastBufCount !== nBuffers) {
  for (let i = 0; i < MAX_BUFFERS; i++) {
    const bctx = room.state.buffers[i].getContext('2d');
    bctx.clearRect(0, 0, BW, BH);
  }
  room.state.lastBufCount = nBuffers;
}

// 3. Render / Update Chrome Bob Sprite when size or theme changes
const targetSpriteRadius = Math.round(baseSize * 0.5);
if (room.state.lastSize !== targetSpriteRadius || room.state.lastTheme !== themeKey) {
  const sc = room.state.spriteCanvas;
  const sctx = sc.getContext('2d');
  sctx.clearRect(0, 0, 160, 160);

  const cx = 80, cy = 80, r = targetSpriteRadius;
  const grad = sctx.createRadialGradient(cx - r * 0.32, cy - r * 0.38, r * 0.05, cx, cy, r);
  grad.addColorStop(0.00, '#ffffff');
  grad.addColorStop(0.12, '#edf4fc');
  grad.addColorStop(0.30, '#5f758d');
  grad.addColorStop(0.48, '#0d1622');
  grad.addColorStop(0.50, '#ffffff'); // Chrome horizon line reflection
  grad.addColorStop(0.58, '#d47832'); // Warm earth/copper reflection
  grad.addColorStop(0.78, '#321004');
  grad.addColorStop(0.96, '#0f0401');
  grad.addColorStop(1.00, 'rgba(0,0,0,0)');

  sctx.beginPath();
  sctx.arc(cx, cy, r, 0, Math.PI * 2);
  sctx.fillStyle = grad;
  sctx.fill();

  // Subtle chrome specular rim
  sctx.beginPath();
  sctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  sctx.strokeStyle = 'rgba(255, 230, 200, 0.4)';
  sctx.lineWidth = 1.5;
  sctx.stroke();

  room.state.lastSize = targetSpriteRadius;
  room.state.lastTheme = themeKey;
}

// 4. Draw Amiga Copper Backdrop into primary canvas
const palettes = {
  'Classic Copper': ['#050200', '#1c0802', '#541c05', '#b64f16', '#ff9a48', '#8f3309', '#1a0501'],
  'Molten Bronze':  ['#040302', '#221508', '#643c10', '#c88722', '#ffe182', '#9e5a14', '#130a02'],
  'Amiga Sunset':   ['#080210', '#2b092a', '#781240', '#d9383a', '#ff9245', '#701048', '#0d0218'],
  'Neon Oxide':     ['#020708', '#082329', '#0d575c', '#1fc2af', '#a8fff5', '#0f7069', '#031012']
};
const pal = palettes[themeKey] ?? palettes['Classic Copper'];

const copperGrad = ctx.createLinearGradient(0, 0, 0, frame.height);
const bassShift = (audio.bass - 0.5) * 0.08;
copperGrad.addColorStop(0.00, pal[0]);
copperGrad.addColorStop(0.20, pal[1]);
copperGrad.addColorStop(0.40, pal[2]);
copperGrad.addColorStop(Math.min(0.95, Math.max(0.05, 0.52 + bassShift)), pal[3]);
copperGrad.addColorStop(Math.min(0.98, Math.max(0.08, 0.58 + bassShift)), pal[4]);
copperGrad.addColorStop(0.75, pal[5]);
copperGrad.addColorStop(1.00, pal[6]);
ctx.fillStyle = copperGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

// Subtle copper scanlines for demoscene CRT raster texture
ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
for (let y = 0; y < frame.height; y += 4) {
  ctx.fillRect(0, y, frame.width, 2);
}

// 5. Compute Bob Trajectory (Lissajous / Knot / Harmonograph)
room.state.tSim += (frame.dt || 0.016) * speed * (1.0 + audio.mid * 0.4);
const t = room.state.tSim;

let nx = 0, ny = 0;
if (curveKey === 'Torus Knot') {
  const p = 3, q = 5;
  const rk = 0.5 + 0.3 * Math.cos(q * t * 0.35);
  nx = rk * Math.cos(p * t * 0.35);
  ny = rk * Math.sin(p * t * 0.35) * 0.85;
} else if (curveKey === 'Figure Eight') {
  nx = Math.sin(t * 0.9);
  ny = Math.sin(t * 1.8) * 0.55;
} else if (curveKey === 'Rose Petals') {
  const k = 4;
  const rad = Math.cos(k * t * 0.3) * 0.8;
  nx = rad * Math.cos(t * 0.3);
  ny = rad * Math.sin(t * 0.3);
} else {
  // Lissajous default
  nx = Math.sin(t * 1.1) * 0.65 + Math.sin(t * 2.3) * 0.25;
  ny = Math.cos(t * 0.85) * 0.55 + Math.cos(t * 1.9) * 0.3;
}

const beatKick = audio.beat ? 1.08 : 1.0;
const bobX = BW * 0.5 + nx * (BW * 0.42) * beatKick;
const bobY = BH * 0.5 + ny * (BH * 0.42) * beatKick;

// 6. Unlimited Bobs Core: Blit 1 Bob into current buffer in the ring
room.state.bufIdx = (room.state.bufIdx + 1) % nBuffers;
const activeBuf = room.state.buffers[room.state.bufIdx];
const bctx = activeBuf.getContext('2d');

// Decay existing buffer content slightly so snake has controlled tail length
bctx.globalCompositeOperation = 'destination-out';
bctx.fillStyle = `rgba(0, 0, 0, ${fadeRate})`;
bctx.fillRect(0, 0, BW, BH);
bctx.globalCompositeOperation = 'source-over';

// Blit the single pre-rendered chrome bob
const r = targetSpriteRadius;
const sx = bobX - 80;
const sy = bobY - 80;
bctx.drawImage(room.state.spriteCanvas, sx, sy);

// Orbiting satellite bob modulated by connected room members
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 3);
  for (let pi = 0; pi < pCount; pi++) {
    const p = room.people[pi];
    const ang = t * 3.0 + (pi * Math.PI * 2) / pCount;
    const dist = r * 1.6 + audio.bass * 20;
    const satX = bobX + Math.cos(ang) * dist - 40;
    const satY = bobY + Math.sin(ang) * dist - 40;
    bctx.save();
    bctx.globalAlpha = 0.85;
    bctx.drawImage(room.state.spriteCanvas, 80 - r * 0.5, 80 - r * 0.5, r, r, satX, satY, r, r);
    bctx.restore();
  }
}

// 7. Present active buffer rotated on top of copper background
ctx.save();
ctx.imageSmoothingEnabled = true;
ctx.drawImage(activeBuf, 0, 0, frame.width, frame.height);
ctx.restore();

ctx.restore();