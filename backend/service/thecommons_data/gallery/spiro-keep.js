ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const minDim = Math.min(W, H);

// 1. Initialise and track persistent state
room.state.theta ??= 0;
room.state.totalAngle ??= 0;
room.state.lastX ??= null;
room.state.lastY ??= null;
room.state.sparks ??= [];

// Allocate persistent offscreen buffer for continuous ink trail
if (!room.state.trailCanvas || room.state.trailCanvas.width !== W || room.state.trailCanvas.height !== H) {
  room.state.trailCanvas = new OffscreenCanvas(W, H);
  room.state.trailCtx = room.state.trailCanvas.getContext('2d');
  room.state.lastX = null;
  room.state.lastY = null;
}
const tctx = room.state.trailCtx;

// 2. Variable parsing and config
const gearRatios = {
  '5:2 Star': { R: 100, r: 40, period: Math.PI * 4 },
  '3:1 Trefoil': { R: 100, r: 33.333, period: Math.PI * 2 },
  '7:3 Rosette': { R: 100, r: 42.857, period: Math.PI * 6 },
  '8:5 Lace': { R: 100, r: 62.5, period: Math.PI * 10 },
  '11:4 Nebula': { R: 100, r: 36.364, period: Math.PI * 8 }
};

const gearChoice = gearRatios[getVar('gear_ratio')] ?? gearRatios['5:2 Star'];
const penReach = getVar('pen_reach') ?? 0.9;
const speedMul = getVar('speed') ?? 1.5;
const lineWidth = getVar('line_width') ?? 2;
const keepTrail = getVar('keep_trail') ?? true;
const paletteChoice = getVar('palette') ?? 'Neon Cyan & Magenta';

// Scale geometry to fit viewport nicely
const baseR = minDim * 0.34;
const ratioFactor = baseR / gearChoice.R;
const R = gearChoice.R * ratioFactor;
const r = gearChoice.r * ratioFactor;
// Bass modulates pen distance slightly
const bassBoost = (audio.bass || 0) * (minDim * 0.04);
const d = (r * penReach) + bassBoost;

// Palette map
const palettes = {
  'Neon Cyan & Magenta': { bg: '#06060c', ring: 'rgba(50,70,120,0.22)', c1: '#00f0ff', c2: '#ff0077', c3: '#9933ff' },
  'Brass Blueprint': { bg: '#081726', ring: 'rgba(212,175,55,0.25)', c1: '#e6c66e', c2: '#ffffff', c3: '#38bdf8' },
  'Emerald Aurora': { bg: '#03120e', ring: 'rgba(16,185,129,0.2)', c1: '#34d399', c2: '#a7f3d0', c3: '#06b6d4' },
  'Solar Prism': { bg: '#100604', ring: 'rgba(249,115,22,0.25)', c1: '#f59e0b', c2: '#ef4444', c3: '#fbbf24' }
};
const pal = palettes[paletteChoice] ?? palettes['Neon Cyan & Magenta'];

// Reset or fade trail canvas on mode change or loop completion
if (!keepTrail) {
  // Gentle fade per frame so it wipes clean cleanly as new loops draw
  tctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
  tctx.fillRect(0, 0, W, H);
  if (room.state.totalAngle >= gearChoice.period) {
    tctx.clearRect(0, 0, W, H);
    room.state.totalAngle = 0;
  }
}

// 3. Step forward through spirograph curve
const stepsPerFrame = 16;
const dtBase = Math.min(frame.dt, 0.05);
const totalDTheta = (dtBase * speedMul * 2.8) * (1 + (audio.level || 0) * 0.4);
const stepTheta = totalDTheta / stepsPerFrame;

let curX = room.state.lastX;
let curY = room.state.lastY;

tctx.save();
tctx.lineWidth = lineWidth;
tctx.lineCap = 'round';
tctx.lineJoin = 'round';

for (let i = 0; i < stepsPerFrame; i++) {
  room.state.theta += stepTheta;
  room.state.totalAngle += stepTheta;
  const th = room.state.theta;

  // Hypotrochoid math
  const diff = R - r;
  const k = diff / r;
  const px = cx + diff * Math.cos(th) + d * Math.cos(k * th);
  const py = cy + diff * Math.sin(th) - d * Math.sin(k * th);

  if (curX !== null && curY !== null) {
    // Dynamic stroke color along the path
    const colorPhase = (th * 0.3) % (Math.PI * 2);
    const mix = 0.5 + 0.5 * Math.sin(colorPhase);
    
    tctx.beginPath();
    tctx.moveTo(curX, curY);
    tctx.lineTo(px, py);
    
    // Audio glow boost
    const alpha = 0.6 + (audio.mid || 0) * 0.4;
    tctx.strokeStyle = mix > 0.5 ? pal.c1 : pal.c2;
    tctx.globalAlpha = alpha;
    tctx.stroke();
  }
  curX = px;
  curY = py;
}
tctx.restore();

room.state.lastX = curX;
room.state.lastY = curY;

// 4. Draw to main canvas
// Base background
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Background blueprint grid / radial markings
ctx.save();
ctx.strokeStyle = pal.ring;
ctx.lineWidth = 1;

// Outer stationary ring
ctx.beginPath();
ctx.arc(cx, cy, R, 0, Math.PI * 2);
ctx.stroke();

// Subtle radial notches on outer ring
for (let a = 0; a < 36; a++) {
  const ang = (a / 36) * Math.PI * 2;
  const x1 = cx + Math.cos(ang) * (R - 4);
  const y1 = cy + Math.sin(ang) * (R - 4);
  const x2 = cx + Math.cos(ang) * (R + 4);
  const y2 = cy + Math.sin(ang) * (R + 4);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
ctx.restore();

// Render persistent drawing trails
ctx.drawImage(room.state.trailCanvas, 0, 0);

// 5. Draw mechanical apparatus on top (Rolling gear, arm, and glowing pen)
const currentTh = room.state.theta;
const diffR = R - r;
const gearCenterX = cx + diffR * Math.cos(currentTh);
const gearCenterY = cy + diffR * Math.sin(currentTh);
const penX = curX ?? cx;
const penY = curY ?? cy;

ctx.save();
// Rolling small gear body
ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.arc(gearCenterX, gearCenterY, r, 0, Math.PI * 2);
ctx.stroke();

// Gear axle
ctx.fillStyle = pal.c3;
ctx.beginPath();
ctx.arc(gearCenterX, gearCenterY, 3.5, 0, Math.PI * 2);
ctx.fill();

// Mechanical pen linkage arm connecting gear center to pen tip
ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
ctx.setLineDash([4, 4]);
ctx.beginPath();
ctx.moveTo(gearCenterX, gearCenterY);
ctx.lineTo(penX, penY);
ctx.stroke();
ctx.setLineDash([]);

// Glowing pen head
const penPulse = 4 + (audio.bass || 0) * 8;
const glowGrad = ctx.createRadialGradient(penX, penY, 1, penX, penY, penPulse * 2.5);
glowGrad.addColorStop(0, '#ffffff');
glowGrad.addColorStop(0.3, pal.c1);
glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = glowGrad;
ctx.beginPath();
ctx.arc(penX, penY, penPulse * 2.5, 0, Math.PI * 2);
ctx.fill();

// 6. Interactive sparks on audio beat or room presence
if (audio.beat) {
  for (let s = 0; s < 8; s++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 40 + Math.random() * 90;
    room.state.sparks.push({
      x: penX,
      y: penY,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 1.0
    });
  }
}

// Render sparks
for (let i = room.state.sparks.length - 1; i >= 0; i--) {
  const spk = room.state.sparks[i];
  spk.x += spk.vx * dtBase;
  spk.y += spk.vy * dtBase;
  spk.life -= dtBase * 2.2;
  if (spk.life <= 0) {
    room.state.sparks.splice(i, 1);
    continue;
  }
  ctx.fillStyle = pal.c2;
  ctx.globalAlpha = spk.life;
  ctx.fillRect(spk.x - 1.5, spk.y - 1.5, 3, 3);
}
if (room.state.sparks.length > 100) {
  room.state.sparks.splice(0, room.state.sparks.length - 100);
}

// 7. Room connected people indicators around the perimeter ring
const people = room.people || [];
if (people.length > 0) {
  people.forEach((p, idx) => {
    const angle = (idx / people.length) * Math.PI * 2 + (frame.t * 0.1);
    const pxRing = cx + Math.cos(angle) * (R + 18);
    const pyRing = cy + Math.sin(angle) * (R + 18);
    ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(pxRing, pyRing, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

ctx.restore();