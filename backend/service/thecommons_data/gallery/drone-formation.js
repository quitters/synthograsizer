ctx.save();

const MAX = 450;
room.state.initialized ??= false;
if (!room.state.initialized) {
  room.state.x = new Float32Array(MAX);
  room.state.y = new Float32Array(MAX);
  room.state.z = new Float32Array(MAX);
  room.state.vx = new Float32Array(MAX);
  room.state.vy = new Float32Array(MAX);
  room.state.vz = new Float32Array(MAX);
  room.state.seed = new Float32Array(MAX);
  room.state.px = new Float32Array(MAX);
  room.state.py = new Float32Array(MAX);
  room.state.pz = new Float32Array(MAX);
  room.state.scale = new Float32Array(MAX);
  room.state.visible = new Uint8Array(MAX);

  for (let i = 0; i < MAX; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = (Math.random() - 0.5) * Math.PI;
    const rad = 60 + Math.random() * 260;
    room.state.x[i] = Math.cos(ph) * Math.cos(th) * rad;
    room.state.y[i] = Math.sin(ph) * rad;
    room.state.z[i] = Math.cos(ph) * Math.sin(th) * rad;
    room.state.seed[i] = Math.random() * 100;
  }

  room.state.formIdx = 0;
  room.state.lastSwitchT = frame.t;
  room.state.lastChoice = 'Auto Cycle';
  room.state.formationPulse = 0;
  room.state.shockwavePower = 0;
  room.state.shockHue = 195;

  const sz = 64;
  const off = new OffscreenCanvas(sz, sz);
  const octx = off.getContext('2d');
  const h = sz * 0.5;
  const g = octx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.12, 'rgba(220, 245, 255, 0.85)');
  g.addColorStop(0.35, 'rgba(130, 195, 255, 0.35)');
  g.addColorStop(0.7, 'rgba(60, 120, 255, 0.08)');
  g.addColorStop(1, 'rgba(0, 20, 60, 0)');
  octx.fillStyle = g;
  octx.fillRect(0, 0, sz, sz);
  room.state.glowCanvas = off;

  room.state.initialized = true;
}

const formationChoice = getVar('formation') ?? 'Auto Cycle';
const flightSpeed = getVar('flight_speed') ?? 1.2;
const droneCountReq = getVar('drone_count') ?? 300;
const glowChoice = getVar('glow_intensity') ?? 'Vivid Neon';
const motionChoice = getVar('motion_style') ?? 'Fluid Flight';
const trails = getVar('trails') ?? true;

const formMap = {
  'Starlight Matrix': 0,
  'Ocean Wave': 1,
  'Cosmic Helix': 2,
  'Cyber Heart': 3,
  'Saturn Rings': 4
};

const formNames = [
  'STARLIGHT MATRIX',
  'OCEAN WAVE',
  'COSMIC HELIX',
  'CYBER HEART',
  'SATURN RINGS'
];

if (room.events) {
  for (let i = 0; i < room.events.length; i++) {
    const e = room.events[i];
    if (e.name === 'next_formation') {
      room.state.formIdx = (room.state.formIdx + 1) % 5;
      room.state.lastSwitchT = frame.t;
      room.state.formationPulse = 1.3;
    } else if (e.name === 'shockwave') {
      room.state.shockwavePower = 1.4;
      const p = room.people ? room.people.find(pr => pr.id === e.participantId) : null;
      room.state.shockHue = (p && typeof p.hue === 'number') ? p.hue : 195;
    }
  }
}

if (formationChoice !== room.state.lastChoice) {
  room.state.lastChoice = formationChoice;
  if (formMap[formationChoice] !== undefined) {
    room.state.formIdx = formMap[formationChoice];
    room.state.lastSwitchT = frame.t;
    room.state.formationPulse = 1.2;
  }
}

if (formationChoice === 'Auto Cycle' && frame.t - room.state.lastSwitchT > 13.0) {
  room.state.formIdx = (room.state.formIdx + 1) % 5;
  room.state.lastSwitchT = frame.t;
  room.state.formationPulse = 1.0;
}

const activeForm = room.state.formIdx;
const count = Math.min(Math.max(100, Math.floor(droneCountReq)), MAX);
const numPeople = room.people ? room.people.length : 0;

const glowAlphas = { 'Standard': 0.6, 'Vivid Neon': 0.95, 'Hyperdrive': 1.35 };
const glowAlpha = glowAlphas[glowChoice] ?? 0.95;

const glowSizes = { 'Standard': 16, 'Vivid Neon': 23, 'Hyperdrive': 30 };
const baseGlowSize = glowSizes[glowChoice] ?? 23;

const motionParams = {
  'Fluid Flight': { spring: 0.045, damp: 0.88, turb: 0 },
  'Snappy Drones': { spring: 0.11, damp: 0.77, turb: 0 },
  'Turbulent Swarm': { spring: 0.05, damp: 0.84, turb: 1 }
};
const motion = motionParams[motionChoice] ?? motionParams['Fluid Flight'];

if (trails) {
  ctx.fillStyle = 'rgba(2, 4, 10, 0.24)';
  ctx.fillRect(0, 0, frame.width, frame.height);
} else {
  ctx.fillStyle = '#02040a';
  ctx.fillRect(0, 0, frame.width, frame.height);
}

const bass = audio.bass || 0;
const beat = audio.beat || false;
const treble = audio.treble || 0;
const dtFactor = Math.min(frame.dt ? frame.dt * 60 : 1, 2.0);
const transBoost = 1.0 + (room.state.formationPulse || 0) * 1.2;
const curSpring = motion.spring * flightSpeed * transBoost * dtFactor;
const curDamp = Math.pow(motion.damp, dtFactor);

const shock = room.state.shockwavePower || 0;
const camRotY = frame.t * 0.22 + bass * 0.08;
const camRotX = Math.sin(frame.t * 0.15) * 0.24;
const cosY = Math.cos(camRotY), sinY = Math.sin(camRotY);
const cosX = Math.cos(camRotX), sinX = Math.sin(camRotX);
const focal = Math.min(frame.width, frame.height) * 0.95;
const camDist = 650;
const cx = frame.width * 0.5;
const cy = frame.height * 0.5;

for (let i = 0; i < count; i++) {
  let tx = 0, ty = 0, tz = 0;

  if (activeForm === 0) {
    const p = (i / count) * 10;
    const seg = Math.floor(p) % 10;
    const frac = p - Math.floor(p);
    const r0 = (seg % 2 === 0) ? 275 : 105;
    const r1 = ((seg + 1) % 2 === 0) ? 275 : 105;
    const a0 = (seg * Math.PI) / 5 - Math.PI * 0.5;
    const a1 = ((seg + 1) * Math.PI) / 5 - Math.PI * 0.5;
    const x0 = r0 * Math.cos(a0), y0 = r0 * Math.sin(a0);
    const x1 = r1 * Math.cos(a1), y1 = r1 * Math.sin(a1);
    const sc = 1.0 + bass * 0.25;
    tx = (x0 + (x1 - x0) * frac) * sc;
    ty = (y0 + (y1 - y0) * frac) * sc;
    tz = Math.sin(i * 0.35 + frame.t * 2) * 45;
  } else if (activeForm === 1) {
    const cols = 22;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const maxRows = Math.ceil(count / cols);
    const u = (col / (cols - 1) - 0.5) * 580;
    const v = (row / Math.max(1, maxRows - 1) - 0.5) * 360;
    tx = u;
    ty = v + Math.sin(u * 0.012 + frame.t * 2.6) * (60 + bass * 50);
    tz = Math.cos(v * 0.014 + frame.t * 2.2) * 115 + Math.sin(u * 0.008) * 55;
  } else if (activeForm === 2) {
    const arms = 3;
    const arm = i % arms;
    const frac = Math.floor(i / arms) / Math.max(1, Math.floor(count / arms));
    const hAngle = frac * Math.PI * 4.5 + (arm * Math.PI * 2) / arms + frame.t * 0.7;
    const hRad = 35 + frac * 255 * (1.0 + bass * 0.25);
    tx = hRad * Math.cos(hAngle);
    ty = hRad * Math.sin(hAngle) * 0.65;
    tz = (frac - 0.5) * 360 + Math.sin(hAngle * 2) * 35;
  } else if (activeForm === 3) {
    const th = (i / count) * Math.PI * 2;
    const sT = Math.sin(th);
    const hx = 16 * sT * sT * sT;
    const hy = -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th));
    const hScale = 14 + (beat ? 3.5 : 0) + bass * 2.5;
    tx = hx * hScale;
    ty = hy * hScale + 25;
    tz = Math.sin(th * 4 + frame.t * 2.5) * 55;
  } else {
    const coreCount = Math.floor(count * 0.35);
    if (i < coreCount) {
      const pIdx = i + 0.5;
      const pPhi = Math.asin(-1 + (2 * pIdx) / coreCount);
      const pLam = Math.sqrt(coreCount * Math.PI) * pPhi + frame.t * 0.45;
      const spR = 85 * (1 + bass * 0.2);
      tx = spR * Math.cos(pPhi) * Math.cos(pLam);
      ty = spR * Math.sin(pPhi);
      tz = spR * Math.cos(pPhi) * Math.sin(pLam);
    } else {
      const rIdx = i - coreCount;
      const rTot = count - coreCount;
      const rf = rIdx / Math.max(1, rTot);
      const rRad = 140 + rf * 165;
      const rAng = rf * Math.PI * 6 + frame.t * 0.5;
      const rx0 = rRad * Math.cos(rAng);
      const ry0 = rRad * Math.sin(rAng) * 0.2;
      const rz0 = rRad * Math.sin(rAng) * 0.98;
      const tilt = 0.42;
      tx = rx0;
      ty = ry0 * Math.cos(tilt) - rz0 * Math.sin(tilt);
      tz = ry0 * Math.sin(tilt) + rz0 * Math.cos(tilt);
    }
  }

  if (motion.turb) {
    const sd = room.state.seed[i];
    tx += Math.sin(sd + frame.t * 4) * 22;
    ty += Math.cos(sd * 1.3 + frame.t * 4) * 22;
    tz += Math.sin(sd * 0.7 + frame.t * 3) * 22;
  }

  let pxVal = room.state.x[i];
  let pyVal = room.state.y[i];
  let pzVal = room.state.z[i];
  let vxVal = room.state.vx[i];
  let vyVal = room.state.vy[i];
  let vzVal = room.state.vz[i];

  vxVal = (vxVal + (tx - pxVal) * curSpring) * curDamp;
  vyVal = (vyVal + (ty - pyVal) * curSpring) * curDamp;
  vzVal = (vzVal + (tz - pzVal) * curSpring) * curDamp;

  if (shock > 0.005) {
    const d2 = pxVal * pxVal + pyVal * pyVal + pzVal * pzVal + 200;
    const invD = 1 / Math.sqrt(d2);
    const push = shock * 38;
    vxVal += pxVal * invD * push;
    vyVal += pyVal * invD * push;
    vzVal += pzVal * invD * push;
  }

  pxVal += vxVal * dtFactor;
  pyVal += vyVal * dtFactor;
  pzVal += vzVal * dtFactor;

  room.state.x[i] = pxVal;
  room.state.y[i] = pyVal;
  room.state.z[i] = pzVal;
  room.state.vx[i] = vxVal;
  room.state.vy[i] = vyVal;
  room.state.vz[i] = vzVal;

  const rx1 = pxVal * cosY - pzVal * sinY;
  const rz1 = pxVal * sinY + pzVal * cosY;
  const ry2 = pyVal * cosX - rz1 * sinX;
  const rz2 = pyVal * sinX + rz1 * cosX;
  const zTot = rz2 + camDist;

  if (zTot > 35) {
    const sc = focal / zTot;
    room.state.px[i] = cx + rx1 * sc;
    room.state.py[i] = cy + ry2 * sc;
    room.state.pz[i] = zTot;
    room.state.scale[i] = sc;
    room.state.visible[i] = 1;
  } else {
    room.state.visible[i] = 0;
  }
}

room.state.shockwavePower = Math.max(0, (room.state.shockwavePower || 0) * 0.91 - 0.002);
room.state.formationPulse = Math.max(0, (room.state.formationPulse || 0) * 0.93 - 0.002);

ctx.save();
ctx.globalCompositeOperation = 'lighter';
ctx.strokeStyle = 'rgba(90, 160, 255, 0.12)';
ctx.lineWidth = 0.8;
ctx.beginPath();
for (let i = 0; i < count - 1; i++) {
  if (room.state.visible[i] && room.state.visible[i + 1]) {
    const dx = room.state.px[i] - room.state.px[i + 1];
    const dy = room.state.py[i] - room.state.py[i + 1];
    if (dx * dx + dy * dy < 4900) {
      ctx.moveTo(room.state.px[i], room.state.py[i]);
      ctx.lineTo(room.state.px[i + 1], room.state.py[i + 1]);
    }
  }
}
ctx.stroke();
ctx.restore();

if (shock > 0.05) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sRad = (1.4 - shock) * Math.min(frame.width, frame.height) * 0.65;
  ctx.strokeStyle = 'hsla(' + room.state.shockHue + ', 100%, 75%, ' + (shock * 0.7) + ')';
  ctx.lineWidth = 3.5 * shock;
  ctx.beginPath();
  ctx.arc(cx, cy, sRad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

ctx.save();
ctx.globalCompositeOperation = 'lighter';
const glowImg = room.state.glowCanvas;
const startWhite = Math.min(numPeople, count);

for (let i = startWhite; i < count; i++) {
  if (room.state.visible[i]) {
    const sc = room.state.scale[i];
    const sz = Math.max(4, sc * baseGlowSize * (1 + treble * 0.35));
    const depthFade = Math.min(1.0, 750 / room.state.pz[i]);
    ctx.globalAlpha = glowAlpha * depthFade;
    const sx = room.state.px[i];
    const sy = room.state.py[i];
    ctx.drawImage(glowImg, sx - sz, sy - sz, sz * 2, sz * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - 1.2, sy - 1.2, 2.4, 2.4);
  }
}

for (let i = 0; i < startWhite; i++) {
  if (room.state.visible[i]) {
    const p = room.people[i];
    const hue = (p && typeof p.hue === 'number') ? p.hue : 200;
    const sc = room.state.scale[i];
    const sx = room.state.px[i];
    const sy = room.state.py[i];

    ctx.strokeStyle = 'hsl(' + hue + ', 100%, 70%)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(sx, sy, 11 * sc, frame.t * 3.5 + i, frame.t * 3.5 + i + 4.2);
    ctx.stroke();

    ctx.fillStyle = 'hsla(' + hue + ', 100%, 65%, 0.45)';
    ctx.beginPath();
    ctx.arc(sx, sy, 6 * sc, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - 2, sy - 2, 4, 4);

    ctx.strokeStyle = 'hsla(' + hue + ', 100%, 75%, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 15 * sc);
    ctx.lineTo(sx, sy - 7 * sc);
    ctx.moveTo(sx, sy + 7 * sc);
    ctx.lineTo(sx, sy + 15 * sc);
    ctx.stroke();
  }
}
ctx.restore();

ctx.save();
ctx.fillStyle = 'rgba(140, 190, 255, 0.45)';
ctx.font = '11px monospace';
ctx.fillText('SWARM // ' + formNames[activeForm], 24, 28);
ctx.fillText('DRONES: ' + count + ' | PILOTS: ' + numPeople, 24, 44);
ctx.fillStyle = 'rgba(70, 140, 255, 0.25)';
ctx.fillRect(24, 52, 100, 3);
ctx.fillStyle = beat ? '#ffffff' : 'rgba(120, 200, 255, 0.7)';
ctx.fillRect(24, 52, Math.min(100, (audio.level || 0) * 100), 3);
ctx.restore();

ctx.restore();