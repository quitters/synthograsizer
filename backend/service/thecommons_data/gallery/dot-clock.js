ctx.save();
const w = frame.width;
const h = frame.height;
const cx = w * 0.5;
const cy = h * 0.5;
const minDim = Math.min(w, h);
const baseR = minDim * 0.38;

const showSec = getVar('show_seconds') ?? true;
const themeKey = getVar('theme') ?? 'deep_space';
const density = getVar('particle_density') ?? 90;
const audioReact = getVar('audio_reactivity') ?? 0.6;
const motionKey = getVar('dial_motion') ?? 'orbital';

const palettes = {
  deep_space: { bg: '#030712', hr: 'hsla(215, 95%, 68%, ', min: 'hsla(180, 90%, 65%, ', sec: 'hsla(330, 95%, 68%, ', glow: 'hsla(200, 100%, 75%, ', tick: 'rgba(148, 163, 184, 0.4)' },
  solaris:    { bg: '#0c0704', hr: 'hsla(30, 95%, 60%, ', min: 'hsla(48, 95%, 65%, ', sec: 'hsla(12, 100%, 65%, ', glow: 'hsla(40, 100%, 70%, ', tick: 'rgba(251, 146, 60, 0.4)' },
  neon_pulse: { bg: '#08010f', hr: 'hsla(280, 100%, 70%, ', min: 'hsla(160, 100%, 65%, ', sec: 'hsla(320, 100%, 65%, ', glow: 'hsla(290, 100%, 80%, ', tick: 'rgba(216, 180, 254, 0.4)' },
  slate:      { bg: '#05070a', hr: 'hsla(210, 30%, 80%, ', min: 'hsla(190, 35%, 70%, ', sec: 'hsla(45, 80%, 75%, ', glow: 'hsla(200, 20%, 90%, ', tick: 'rgba(203, 213, 225, 0.3)' }
};
const pal = palettes[themeKey] ?? palettes.deep_space;

ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, w, h);

const bassBoost = (audio.bass || 0) * audioReact;
const midBoost = (audio.mid || 0) * audioReact;
const trebleBoost = (audio.treble || 0) * audioReact;
const beatKick = (audio.beat ? 1.0 : 0.0) * audioReact;

const now = new Date();
const ms = now.getMilliseconds();
const secPrecise = now.getSeconds() + ms / 1000;
const minPrecise = now.getMinutes() + secPrecise / 60;
const hrPrecise = (now.getHours() % 12) + minPrecise / 60;

const hrAng = (hrPrecise / 12) * Math.PI * 2 - Math.PI * 0.5;
const minAng = (minPrecise / 60) * Math.PI * 2 - Math.PI * 0.5;
const secAng = (secPrecise / 60) * Math.PI * 2 - Math.PI * 0.5;

ctx.lineWidth = 1.2;
ctx.strokeStyle = pal.tick;
for (let i = 0; i < 60; i++) {
  const a = (i / 60) * Math.PI * 2 - Math.PI * 0.5;
  const isMajor = i % 5 === 0;
  const rOut = baseR * (1 + bassBoost * 0.05);
  const rIn = isMajor ? rOut - minDim * 0.035 : rOut - minDim * 0.015;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
  ctx.lineTo(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut);
  ctx.stroke();
}

ctx.beginPath();
ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
ctx.strokeStyle = pal.glow + '0.15)';
ctx.lineWidth = 1.5;
ctx.stroke();

room.state.rings ??= [];
if (room.state.rings.length < density) {
  for (let i = room.state.rings.length; i < density; i++) {
    room.state.rings.push({
      seed: Math.random() * Math.PI * 2,
      spd: 0.3 + Math.random() * 0.7,
      track: i % 3,
      radOffset: (Math.random() - 0.5) * 18,
      size: 1.5 + Math.random() * 2.5
    });
  }
} else if (room.state.rings.length > density) {
  room.state.rings.length = density;
}

const trackRadii = [baseR * 0.52, baseR * 0.76, baseR * 0.94];

ctx.save();
ctx.globalCompositeOperation = 'screen';

for (let i = 0; i < room.state.rings.length; i++) {
  const p = room.state.rings[i];
  let tr = trackRadii[p.track] + p.radOffset;
  let ang = p.seed;

  if (motionKey === 'orbital') {
    ang += frame.t * p.spd * 0.4;
  } else if (motionKey === 'vortex') {
    ang += frame.t * p.spd * 0.7 + (p.track * 0.5);
    tr *= (0.95 + 0.1 * Math.sin(frame.t * 1.5 + p.seed));
  } else {
    ang += Math.sin(frame.t * p.spd + p.seed) * 1.8;
  }

  let colorPrefix = p.track === 0 ? pal.hr : (p.track === 1 ? pal.min : pal.sec);
  if (p.track === 2 && !showSec) colorPrefix = pal.min;
  const sz = p.size * (1 + (p.track === 0 ? bassBoost : trebleBoost) * 0.8);
  const alpha = 0.35 + 0.35 * Math.sin(frame.t * 2 + p.seed) + beatKick * 0.25;

  const px = cx + Math.cos(ang) * tr;
  const py = cy + Math.sin(ang) * tr;
  ctx.fillStyle = colorPrefix + Math.min(1, alpha) + ')';
  ctx.beginPath();
  ctx.arc(px, py, sz, 0, Math.PI * 2);
  ctx.fill();
}

function drawPointerGroup(angle, length, width, colorPrefix, flareSize, pulse) {
  const ex = cx + Math.cos(angle) * length;
  const ey = cy + Math.sin(angle) * length;

  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(angle) * (length * 0.15), cy - Math.sin(angle) * (length * 0.15));
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = colorPrefix + (0.55 + pulse * 0.4) + ')';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();

  const grad = ctx.createRadialGradient(ex, ey, 0, ex, ey, flareSize * (1 + pulse));
  grad.addColorStop(0, colorPrefix + '0.95)');
  grad.addColorStop(0.3, colorPrefix + '0.45)');
  grad.addColorStop(1, colorPrefix + '0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ex, ey, flareSize * (1 + pulse), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ex, ey, Math.max(1.5, width * 0.6), 0, Math.PI * 2);
  ctx.fill();
}

drawPointerGroup(hrAng, baseR * 0.52, 4.5, pal.hr, 20, bassBoost);
drawPointerGroup(minAng, baseR * 0.76, 3.0, pal.min, 16, midBoost);
if (showSec) {
  drawPointerGroup(secAng, baseR * 0.94, 1.6, pal.sec, 12, trebleBoost + beatKick * 0.5);
}

if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 36);
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const pHue = (p && typeof p.hue === 'number') ? p.hue : (i * 37) % 360;
    const userAng = (i / pCount) * Math.PI * 2 + frame.t * 0.15;
    const userR = baseR * 1.05;
    const ux = cx + Math.cos(userAng) * userR;
    const uy = cy + Math.sin(userAng) * userR;
    ctx.fillStyle = 'hsla(' + pHue + ', 90%, 65%, 0.85)';
    ctx.beginPath();
    ctx.arc(ux, uy, 3.0 + beatKick * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 0.25 * (1 + bassBoost * 0.3));
coreGlow.addColorStop(0, pal.glow + (0.5 + beatKick * 0.3) + ')');
coreGlow.addColorStop(0.5, pal.glow + '0.12)');
coreGlow.addColorStop(1, pal.glow + '0)');
ctx.fillStyle = coreGlow;
ctx.beginPath();
ctx.arc(cx, cy, baseR * 0.25 * (1 + bassBoost * 0.3), 0, Math.PI * 2);
ctx.fill();

ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(cx, cy, 3.5 + bassBoost * 2, 0, Math.PI * 2);
ctx.fill();

ctx.restore();
ctx.restore();