ctx.save();
const W = frame.width, H = frame.height;
const cx = W * 0.5, cy = H * 0.5;
const R = Math.min(cx, cy) * 0.88;
const dt = Math.min(frame.dt || 0.016, 0.05);

const paletteMap = {
  'Cherenkov Blue': { h: 216, s: 95, l: 62 },
  'Cryo Ice': { h: 192, s: 90, l: 68 },
  'Radium Glow': { h: 142, s: 95, l: 60 },
  'Infrared Mist': { h: 312, s: 85, l: 64 }
};
const curPal = paletteMap[getVar('vapor_palette')] ?? paletteMap['Cherenkov Blue'];
const radSource = getVar('radiation_source') ?? 'Americium-241';
const bField = (getVar('magnetic_field') ?? 3.0) * 0.04;
const illumMode = getVar('illumination') ?? 'Cross Beam';
const superSat = getVar('supersaturation') ?? 1.25;
const decaySpd = getVar('decay_speed') ?? 1.0;
const bloomMult = getVar('droplet_bloom') ?? 1.5;
const soundIon = getVar('sound_ionization') ?? true;

const audioBoost = soundIon ? (audio.level || 0) : 0;
const bassBump = soundIon ? (audio.bass || 0) : 0;
const trebleTick = soundIon ? (audio.treble || 0) : 0;

const POOL_SIZE = 120;
const MAX_PTS = 64;
const DROP_POOL = 160;

room.state.pool ??= Array.from({ length: POOL_SIZE }, () => ({
  x: new Float32Array(MAX_PTS),
  y: new Float32Array(MAX_PTS),
  count: 0,
  type: 0,
  age: 0,
  maxAge: 1.6,
  baseW: 2.0,
  hue: curPal.h,
  alive: false,
  braggX: 0,
  braggY: 0
}));

room.state.droplets ??= Array.from({ length: DROP_POOL }, () => ({
  x: 0, y: 0, vx: 0, vy: 0, r: 1.0, age: 0, maxAge: 1.0, alive: false, hue: 0
}));

room.state.nextSpawn ??= 0;

function spawnTrack(typeOverride, startX, startY, userHue) {
  let slot = null;
  for (let i = 0; i < POOL_SIZE; i++) {
    if (!room.state.pool[i].alive) { slot = room.state.pool[i]; break; }
  }
  if (!slot) return;

  let type = typeOverride;
  if (type === undefined) {
    const r = Math.random();
    if (radSource === 'Americium-241') {
      type = r < 0.72 ? 0 : (r < 0.88 ? 1 : 2);
    } else if (radSource === 'Strontium-90') {
      type = r < 0.55 ? 1 : (r < 0.85 ? 2 : 3);
    } else if (radSource === 'Cosmic Rays') {
      type = r < 0.50 ? 3 : (r < 0.78 ? 2 : 1);
    } else {
      type = Math.floor(r * 4);
    }
  }

  let sx = startX, sy = startY;
  let ang;
  if (sx === undefined || sy === undefined) {
    if (type === 3) {
      ang = (Math.random() * 0.6 + 0.2) * Math.PI;
      if (Math.random() < 0.5) ang += Math.PI;
      sx = cx + Math.cos(ang + Math.PI) * (R * 1.05);
      sy = cy + Math.sin(ang + Math.PI) * (R * 1.05);
    } else {
      const radDist = Math.random() < 0.6 ? R * (0.3 + Math.random() * 0.65) : R * Math.random() * 0.4;
      const theta = Math.random() * Math.PI * 2;
      sx = cx + Math.cos(theta) * radDist;
      sy = cy + Math.sin(theta) * radDist;
      ang = Math.random() * Math.PI * 2;
    }
  } else {
    ang = Math.atan2(cy - sy, cx - sx) + (Math.random() - 0.5) * 0.8;
  }

  let nPts, stepDist, baseW, maxAge;
  if (type === 0) {
    nPts = Math.floor(24 + Math.random() * 18);
    stepDist = 4.5 + Math.random() * 2.5;
    baseW = 3.6 + bassBump * 1.5;
    maxAge = 1.4 + Math.random() * 0.8;
  } else if (type === 1) {
    nPts = Math.floor(32 + Math.random() * 28);
    stepDist = 4.0 + Math.random() * 3.0;
    baseW = 1.4 + trebleTick * 0.8;
    maxAge = 1.0 + Math.random() * 0.6;
  } else if (type === 2) {
    nPts = Math.floor(38 + Math.random() * 26);
    stepDist = 5.5 + Math.random() * 2.0;
    baseW = 1.8;
    maxAge = 1.3 + Math.random() * 0.7;
  } else {
    nPts = Math.floor(36 + Math.random() * 20);
    stepDist = 18.0 + Math.random() * 8.0;
    baseW = 2.2 + audioBoost * 1.2;
    maxAge = 1.8 + Math.random() * 0.6;
  }

  nPts = Math.min(nPts, MAX_PTS);
  let curX = sx, curY = sy;
  let curAng = ang;
  let curStep = stepDist;

  slot.x[0] = curX;
  slot.y[0] = curY;

  for (let p = 1; p < nPts; p++) {
    if (type === 0) {
      curAng += (Math.random() - 0.5) * 0.06;
      if (p > nPts - 5) curAng += (Math.random() - 0.5) * 0.4;
    } else if (type === 1) {
      if (Math.random() < 0.28) curAng += (Math.random() - 0.5) * 1.3;
      else curAng += (Math.random() - 0.5) * 0.2;
    } else if (type === 2) {
      const spiralDir = bField >= 0 ? 1 : -1;
      const curvature = (Math.abs(bField) + 0.02) * (1.0 + p * 0.055);
      curAng += curvature * spiralDir;
      curStep = Math.max(1.8, curStep * 0.978);
    } else {
      curAng += (Math.random() - 0.5) * 0.02;
    }

    curX += Math.cos(curAng) * curStep;
    curY += Math.sin(curAng) * curStep;
    slot.x[p] = curX;
    slot.y[p] = curY;
  }

  slot.count = nPts;
  slot.type = type;
  slot.age = 0;
  slot.maxAge = maxAge / decaySpd;
  slot.baseW = baseW;
  slot.hue = userHue !== undefined ? userHue : curPal.h;
  slot.braggX = curX;
  slot.braggY = curY;
  slot.alive = true;

  if (type === 0) {
    for (let d = 0; d < 6; d++) {
      for (let k = 0; k < DROP_POOL; k++) {
        if (!room.state.droplets[k].alive) {
          const dp = room.state.droplets[k];
          dp.x = curX + (Math.random() - 0.5) * 12;
          dp.y = curY + (Math.random() - 0.5) * 12;
          dp.vx = (Math.random() - 0.5) * 8;
          dp.vy = (Math.random() - 0.5) * 8 + 3;
          dp.r = (1.5 + Math.random() * 2.8) * bloomMult;
          dp.age = 0;
          dp.maxAge = slot.maxAge * 0.8;
          dp.hue = slot.hue;
          dp.alive = true;
          break;
        }
      }
    }
  }
}

room.state.nextSpawn -= dt;
const baseSpawnRate = 0.06 / Math.max(0.2, superSat);
if (room.state.nextSpawn <= 0) {
  spawnTrack();
  if (Math.random() < 0.35) spawnTrack();
  room.state.nextSpawn = baseSpawnRate * (0.5 + Math.random());
}

if (soundIon && audio.beat) {
  const burstCount = Math.floor(2 + audioBoost * 4);
  for (let b = 0; b < burstCount; b++) spawnTrack();
}

if (room.people && room.people.length > 0 && Math.random() < 0.04) {
  const person = room.people[Math.floor(Math.random() * room.people.length)];
  const pTheta = ((person.hue % 360) / 360) * Math.PI * 2;
  const px = cx + Math.cos(pTheta) * (R * 0.96);
  const py = cy + Math.sin(pTheta) * (R * 0.96);
  spawnTrack(Math.random() < 0.5 ? 0 : 2, px, py, person.hue);
}

ctx.fillStyle = '#020306';
ctx.fillRect(0, 0, W, H);

const gradChamber = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.05);
gradChamber.addColorStop(0, '#06080e');
gradChamber.addColorStop(0.7, '#040508');
gradChamber.addColorStop(1, '#000002');
ctx.fillStyle = gradChamber;
ctx.beginPath();
ctx.arc(cx, cy, R, 0, Math.PI * 2);
ctx.fill();

const coldMist = ctx.createLinearGradient(0, cy - R * 0.2, 0, cy + R);
coldMist.addColorStop(0, 'rgba(4, 8, 16, 0)');
coldMist.addColorStop(1, `hsla(${curPal.h}, 60%, 8%, ${0.28 + bassBump * 0.15})`);
ctx.fillStyle = coldMist;
ctx.beginPath();
ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
ctx.fill();

if (illumMode === 'Cross Beam') {
  const bG = ctx.createLinearGradient(0, cy - R * 0.7, 0, cy + R * 0.7);
  bG.addColorStop(0, 'rgba(0,0,0,0.5)');
  bG.addColorStop(0.5, `hsla(${curPal.h}, 80%, 20%, ${0.06 + audioBoost * 0.04})`);
  bG.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = bG;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
} else if (illumMode === 'Radial Core') {
  const rG = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.85);
  rG.addColorStop(0, `hsla(${curPal.h}, 70%, 25%, ${0.08 + audioBoost * 0.05})`);
  rG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rG;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
}

function getIllumFactor(x, y) {
  if (illumMode === 'Cross Beam') {
    const dy = Math.abs(y - cy) / (R * 0.8);
    return Math.max(0.18, 1.0 - dy * dy);
  } else if (illumMode === 'Radial Core') {
    const d = Math.hypot(x - cx, y - cy) / R;
    return Math.max(0.2, 1.0 - d * 0.75);
  }
  return 0.95;
}

ctx.save();
ctx.beginPath();
ctx.arc(cx, cy, R * 0.985, 0, Math.PI * 2);
ctx.clip();

ctx.globalCompositeOperation = 'lighter';

for (let i = 0; i < POOL_SIZE; i++) {
  const t = room.state.pool[i];
  if (!t.alive) continue;

  t.age += dt;
  if (t.age >= t.maxAge) {
    t.alive = false;
    continue;
  }

  const lifeRatio = 1.0 - (t.age / t.maxAge);
  const fade = Math.pow(lifeRatio, 1.4);
  const driftY = dt * (3.5 + (t.type === 0 ? 3.0 : 0.8));

  for (let p = 0; p < t.count; p++) {
    t.y[p] += driftY;
  }

  const midIdx = Math.floor(t.count * 0.5);
  const illum = getIllumFactor(t.x[midIdx], t.y[midIdx]);
  const effAlpha = fade * illum * (0.85 + audioBoost * 0.3);
  const expW = t.baseW * (1.0 + (t.age / t.maxAge) * 2.2) * bloomMult;

  const trackHue = t.hue;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(t.x[0], t.y[0]);
  for (let p = 1; p < t.count; p++) {
    ctx.lineTo(t.x[p], t.y[p]);
  }

  ctx.lineWidth = expW * 4.2;
  ctx.strokeStyle = `hsla(${trackHue}, ${curPal.s}%, ${curPal.l * 0.6}%, ${effAlpha * 0.12})`;
  ctx.stroke();

  ctx.lineWidth = expW * 1.8;
  ctx.strokeStyle = `hsla(${trackHue}, ${curPal.s}%, ${curPal.l}%, ${effAlpha * 0.38})`;
  ctx.stroke();

  ctx.lineWidth = Math.max(0.75, expW * 0.45);
  ctx.strokeStyle = `rgba(255, 255, 255, ${effAlpha * 0.95})`;
  ctx.stroke();

  if (t.type === 0 && t.count > 4) {
    const last = t.count - 1;
    const bx = t.x[last], by = t.y[last];
    const braggR = (expW * 2.8 + bassBump * 3.0);
    const bGrad = ctx.createRadialGradient(bx, by, 0, bx, by, braggR);
    bGrad.addColorStop(0, `rgba(255, 255, 255, ${effAlpha * 0.9})`);
    bGrad.addColorStop(0.4, `hsla(${trackHue}, 90%, 75%, ${effAlpha * 0.5})`);
    bGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.arc(bx, by, braggR, 0, Math.PI * 2);
    ctx.fill();
  }
}

for (let k = 0; k < DROP_POOL; k++) {
  const dp = room.state.droplets[k];
  if (!dp.alive) continue;

  dp.age += dt;
  if (dp.age >= dp.maxAge) {
    dp.alive = false;
    continue;
  }

  dp.x += dp.vx * dt;
  dp.y += dp.vy * dt;
  dp.vx *= 0.96;
  dp.vy *= 0.96;

  const dFade = 1.0 - (dp.age / dp.maxAge);
  const rNow = dp.r * (1.0 + (dp.age / dp.maxAge) * 1.8);
  const illum = getIllumFactor(dp.x, dp.y);

  ctx.fillStyle = `hsla(${dp.hue}, 85%, 70%, ${dFade * illum * 0.45})`;
  ctx.beginPath();
  ctx.arc(dp.x, dp.y, rNow, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(255, 255, 255, ${dFade * illum * 0.75})`;
  ctx.beginPath();
  ctx.arc(dp.x, dp.y, rNow * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

ctx.restore();

ctx.save();
ctx.lineWidth = Math.max(3, R * 0.025);
const rimGrad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
rimGrad.addColorStop(0, '#3a4454');
rimGrad.addColorStop(0.5, '#181e28');
rimGrad.addColorStop(1, '#090d14');
ctx.strokeStyle = rimGrad;
ctx.beginPath();
ctx.arc(cx, cy, R, 0, Math.PI * 2);
ctx.stroke();

ctx.lineWidth = 1.5;
ctx.strokeStyle = `hsla(${curPal.h}, 40%, 30%, 0.4)`;
ctx.beginPath();
ctx.arc(cx, cy, R * 0.985, 0, Math.PI * 2);
ctx.stroke();

if (room.people && room.people.length > 0) {
  room.people.forEach((p, idx) => {
    const angle = ((p.hue % 360) / 360) * Math.PI * 2;
    const bx = cx + Math.cos(angle) * R;
    const by = cy + Math.sin(angle) * R;
    ctx.fillStyle = `hsl(${p.hue}, 85%, 65%)`;
    ctx.beginPath();
    ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

ctx.restore();
ctx.restore();