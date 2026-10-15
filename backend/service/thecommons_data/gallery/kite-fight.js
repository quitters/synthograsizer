const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);
const t = frame.t;

// --- Variable Lookups ---
const skyPalettes = {
  sunset_ember: {
    top: '#0a081d', mid: '#2c1236', low: '#741f3b', glow: '#f06e28', floor: '#140c1c'
  },
  midnight_indigo: {
    top: '#03071e', mid: '#0f1738', low: '#1e2c5e', glow: '#4c64ad', floor: '#080c18'
  },
  desert_rose: {
    top: '#180e29', mid: '#381c3a', low: '#752b47', glow: '#e38466', floor: '#160b18'
  },
  neon_twilight: {
    top: '#05021a', mid: '#1c0336', low: '#540d4e', glow: '#ff2a85', floor: '#0d0414'
  }
};
const pal = skyPalettes[getVar('sky_palette')] ?? skyPalettes.sunset_ember;
const windForce = getVar('wind_force') ?? 25;
const kiteStyle = getVar('kite_style') ?? 'classic_diamond';
const rooftopMood = getVar('rooftop_mood') ?? 'roaring_festival';
const showTrails = getVar('trails') ?? true;

// --- Persistent State Initialization ---
room.state.inited ??= false;
if (!room.state.inited) {
  room.state.inited = true;
  room.state.score0 = 0;
  room.state.score1 = 0;
  room.state.round = 1;
  room.state.roundState = 'PLAYING';
  room.state.stateTimer = 0;
  room.state.lastInputTime = t;
  room.state.banner = 'ROUND 1 - GO!';
  room.state.bannerSub = 'PRESS TUG TO DIVE & CUT';
  room.state.bannerColor = '#ffffff';
  room.state.bannerTimer = 2.5;
  room.state.crossTime = 0;
  room.state.sparks = [];
  room.state.drifters = [];
  room.state.k0 = {
    x: W * 0.32, y: H * 0.38, vx: 0, vy: -10, ang: -0.2, vang: 0, tugTimer: 0, lineCut: false, lastTugT: 0
  };
  room.state.k1 = {
    x: W * 0.68, y: H * 0.38, vx: 0, vy: -10, ang: 0.2, vang: 0, tugTimer: 0, lineCut: false, lastTugT: 0
  };
}

// Ensure kite positions stay responsive if canvas resizes
const k0 = room.state.k0;
const k1 = room.state.k1;
const anc0 = { x: W * 0.22, y: H * 0.84 };
const anc1 = { x: W * 0.78, y: H * 0.84 };

// Determine teams from room.people
const people = room.people || [];
const hasPeople = people.length > 0;
const uniqueTables = new Set(people.map(p => p.table).filter(Boolean));
const useTables = uniqueTables.size > 1;

function getTeamForPerson(pId) {
  if (!pId || !hasPeople) return Math.random() < 0.5 ? 0 : 1;
  const idx = people.findIndex(p => p.id === pId);
  if (idx === -1) return 0;
  if (useTables) {
    let tIdx = 0;
    for (const tbl of uniqueTables) {
      if (tbl === people[idx].table) return tIdx % 2;
      tIdx++;
    }
  }
  return idx % 2;
}

// --- Handle Events (Tug Trigger) ---
const events = room.events || [];
let tuggedTeam0 = false;
let tuggedTeam1 = false;

for (let i = 0; i < events.length; i++) {
  const ev = events[i];
  if (ev.name === 'tug') {
    room.state.lastInputTime = t;
    const team = getTeamForPerson(ev.participantId);
    if (team === 0) tuggedTeam0 = true;
    else tuggedTeam1 = true;
  }
}

// --- Autonomous Bot Tug if idle ---
if (t - room.state.lastInputTime > 3.2) {
  const botPulse0 = Math.sin(t * 2.8 + 0.3);
  const botPulse1 = Math.cos(t * 2.5 + 1.1);
  if (botPulse0 > 0.84 && Math.random() < 0.25) tuggedTeam0 = true;
  if (botPulse1 > 0.84 && Math.random() < 0.25) tuggedTeam1 = true;
}
if (people.length === 1) {
  if (Math.sin(t * 3.1) > 0.86 && Math.random() < 0.3) {
    tuggedTeam1 = true;
  }
}

// Apply Tug Impulse
function applyTug(k, dirSign, isTugged) {
  if (!isTugged || room.state.roundState !== 'PLAYING') return;
  k.tugTimer = 0.42;
  k.lastTugT = t;
  const spd = 360 + (audio.bass || 0) * 140;
  k.vx += Math.cos(k.ang) * spd * 0.7 + (dirSign * 80);
  k.vy += Math.sin(k.ang) * spd * 0.7 - 70;
  k.vang += (Math.random() - 0.48) * 4.5;

  for (let s = 0; s < 5; s++) {
    if (room.state.sparks.length < 120) {
      room.state.sparks.push({
        x: (dirSign < 0 ? anc0.x : anc1.x) + (Math.random() - 0.5) * 20,
        y: (dirSign < 0 ? anc0.y : anc1.y) - 10,
        vx: (Math.random() - 0.5) * 140,
        vy: -Math.random() * 120 - 40,
        color: dirSign < 0 ? '#ffb703' : '#00f5d4',
        life: 0.35 + Math.random() * 0.25
      });
    }
  }
}
applyTug(k0, 1, tuggedTeam0);
applyTug(k1, -1, tuggedTeam1);

// --- Kite Aerodynamics Simulation ---
const gust = Math.sin(t * 1.3) * (windForce * 1.5) + (audio.beat ? 35 : 0);
function updateKite(k, anchor, homeX, baseAng, isLeft) {
  k.tugTimer = Math.max(0, k.tugTimer - dt);

  const dx = k.x - anchor.x;
  const dy = k.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  const maxLine = Math.min(W, H) * 0.95;

  if (dist > maxLine) {
    const pull = (dist - maxLine) * 3.0;
    k.vx -= (dx / dist) * pull;
    k.vy -= (dy / dist) * pull;
  }

  const lift = 160 + (audio.mid || 0) * 70;
  k.vy -= lift * dt;
  k.vx += gust * dt;
  k.vy += 120 * dt;
  k.vx *= 0.965;
  k.vy *= 0.965;

  const swayTarget = baseAng + Math.sin(t * 2.2 + (isLeft ? 0 : 2.5)) * 0.75;
  k.vang += (swayTarget - k.ang) * 5.0 * dt;
  k.vang *= 0.92;
  k.ang += k.vang * dt;

  k.x += k.vx * dt;
  k.y += k.vy * dt;
  k.x = Math.max(W * 0.1, Math.min(W * 0.9, k.x));
  k.y = Math.max(H * 0.12, Math.min(H * 0.72, k.y));
}

if (room.state.roundState === 'PLAYING') {
  updateKite(k0, anc0, W * 0.35, 0.25, true);
  updateKite(k1, anc1, W * 0.65, -0.25, false);
}

// --- Line Intersection & Cutting Mechanics ---
function lineSegIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (Math.abs(denom) < 0.0001) return null;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  if (ua >= 0.06 && ua <= 0.98 && ub >= 0.06 && ub <= 0.98) {
    return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1) };
  }
  return null;
}

const hit = lineSegIntersect(anc0.x, anc0.y, k0.x, k0.y, anc1.x, anc1.y, k1.x, k1.y);

if (hit && room.state.roundState === 'PLAYING') {
  room.state.crossTime += dt;

  const sparkCount = Math.floor(2 + (audio.treble || 0) * 4);
  for (let s = 0; s < sparkCount; s++) {
    if (room.state.sparks.length < 120) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 220;
      room.state.sparks.push({
        x: hit.x + (Math.random() - 0.5) * 8,
        y: hit.y + (Math.random() - 0.5) * 8,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color: Math.random() < 0.5 ? '#fff475' : '#ff0055',
        life: 0.28 + Math.random() * 0.2
      });
    }
  }

  const spd0 = Math.hypot(k0.vx, k0.vy) + (k0.tugTimer > 0 ? 250 : 0);
  const spd1 = Math.hypot(k1.vx, k1.vy) + (k1.tugTimer > 0 ? 250 : 0);

  if (room.state.crossTime > 0.35 || Math.abs(spd0 - spd1) > 280) {
    let winnerTeam = 0;
    if (spd1 > spd0) winnerTeam = 1;
    else if (spd0 === spd1) winnerTeam = Math.random() < 0.5 ? 0 : 1;

    const loserTeam = 1 - winnerTeam;
    const cutKite = loserTeam === 0 ? k0 : k1;

    if (room.state.drifters.length < 8) {
      room.state.drifters.push({
        x: cutKite.x,
        y: cutKite.y,
        vx: (loserTeam === 0 ? -120 : 120) + (Math.random() - 0.5) * 60,
        vy: -90 - Math.random() * 60,
        ang: cutKite.ang,
        vang: (Math.random() - 0.5) * 5.0,
        team: loserTeam,
        life: 7.0
      });
    }

    if (winnerTeam === 0) room.state.score0++;
    else room.state.score1++;

    room.state.roundState = 'CUT';
    room.state.stateTimer = 3.6;
    room.state.crossTime = 0;
    room.state.banner = winnerTeam === 0 ? 'TEAM SUN CUTS!' : 'TEAM MOON CUTS!';
    room.state.bannerSub = `${room.state.score0}  —  ${room.state.score1}`;
    room.state.bannerColor = winnerTeam === 0 ? '#ffb703' : '#00f5d4';
    room.state.bannerTimer = 3.4;
  }
} else {
  room.state.crossTime = Math.max(0, room.state.crossTime - dt * 2);
}

// State Timer / Round Progression
if (room.state.roundState === 'CUT') {
  room.state.stateTimer -= dt;
  if (room.state.stateTimer <= 0) {
    if (room.state.score0 >= 5 || room.state.score1 >= 5) {
      const matchWinner = room.state.score0 >= 5 ? 'TEAM SUN WINS THE DUSK!' : 'TEAM MOON WINS THE DUSK!';
      room.state.banner = matchWinner;
      room.state.bannerSub = 'NEW MATCH STARTING';
      room.state.bannerColor = room.state.score0 >= 5 ? '#ffb703' : '#00f5d4';
      room.state.bannerTimer = 4.0;
      room.state.score0 = 0;
      room.state.score1 = 0;
      room.state.round = 1;
    } else {
      room.state.round++;
      room.state.banner = `ROUND ${room.state.round}`;
      room.state.bannerSub = 'TUG TO CUT THE LINE!';
      room.state.bannerColor = '#ffffff';
      room.state.bannerTimer = 2.0;
    }

    k0.x = W * 0.32;
    k0.y = H * 0.42;
    k0.vx = 0;
    k0.vy = -60;
    k0.ang = -0.2;
    k0.vang = 0;
    k0.tugTimer = 0;

    k1.x = W * 0.68;
    k1.y = H * 0.42;
    k1.vx = 0;
    k1.vy = -60;
    k1.ang = 0.2;
    k1.vang = 0;
    k1.tugTimer = 0;

    room.state.roundState = 'PLAYING';
  }
}

if (room.state.bannerTimer > 0) {
  room.state.bannerTimer -= dt;
}

// --- UPDATE PARTICLES & DRIFTERS ---
for (let i = room.state.sparks.length - 1; i >= 0; i--) {
  const s = room.state.sparks[i];
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.vy += 180 * dt;
  s.life -= dt;
  if (s.life <= 0) room.state.sparks.splice(i, 1);
}

for (let i = room.state.drifters.length - 1; i >= 0; i--) {
  const d = room.state.drifters[i];
  d.x += d.vx * dt;
  d.y += d.vy * dt;
  d.ang += d.vang * dt;
  d.vy += 35 * dt;
  d.life -= dt;
  if (d.life <= 0 || d.x < -150 || d.x > W + 150) {
    room.state.drifters.splice(i, 1);
  }
}

// ==========================================================
// --- RENDERING ---
// ==========================================================
ctx.save();

// 1. Dusk Sky Gradient
if (!showTrails) {
  ctx.clearRect(0, 0, W, H);
}
const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.88);
skyGrad.addColorStop(0.0, pal.top);
skyGrad.addColorStop(0.35, pal.mid);
skyGrad.addColorStop(0.7, pal.low);
skyGrad.addColorStop(1.0, pal.glow);

ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = showTrails ? (room.state.roundState === 'CUT' ? 'rgba(10, 8, 26, 0.45)' : 'rgba(10, 8, 26, 0.65)') : pal.top;
ctx.fillRect(0, 0, W, H);

// Horizon Dusk Glow
ctx.save();
ctx.fillStyle = skyGrad;
ctx.globalAlpha = showTrails ? 0.45 : 1.0;
ctx.fillRect(0, 0, W, H * 0.88);
ctx.restore();

// Crescent Moon / Evening Star
ctx.save();
ctx.fillStyle = '#fff7d6';
ctx.shadowColor = '#ffeaa7';
ctx.shadowBlur = 15;
ctx.beginPath();
ctx.arc(W * 0.86, H * 0.16, 22, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = pal.top;
ctx.beginPath();
ctx.arc(W * 0.84, H * 0.15, 20, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// 2. Rooftops & Lanterns
function drawRooftops() {
  const roofBaseY = H * 0.78;
  ctx.save();
  ctx.fillStyle = '#100b1a';
  for (let rx = 0; rx < W; rx += 90) {
    const rh = 60 + ((Math.sin(rx * 0.03) * 4321) % 55);
    ctx.fillRect(rx, roofBaseY - rh * 0.6, 92, H - roofBaseY + rh);
    if (rx % 180 === 0) {
      ctx.strokeStyle = '#231834';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx + 25, roofBaseY - rh * 0.6);
      ctx.lineTo(rx + 25, roofBaseY - rh * 0.6 - 35);
      ctx.stroke();
    }
  }

  ctx.fillStyle = pal.floor;
  for (let rx = -20; rx < W + 40; rx += 140) {
    ctx.fillRect(rx, roofBaseY, 142, H - roofBaseY);
    ctx.fillStyle = '#2d1830';
    ctx.fillRect(rx - 2, roofBaseY, 146, 7);
    ctx.fillStyle = pal.floor;

    if (rx % 280 === 0) {
      ctx.fillStyle = '#1e1124';
      ctx.fillRect(rx + 40, roofBaseY - 45, 32, 45);
      ctx.fillStyle = pal.floor;
    }
  }

  const festoonY = roofBaseY + 6;
  ctx.strokeStyle = 'rgba(255, 220, 150, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, festoonY);
  for (let fx = 0; fx <= W; fx += 80) {
    ctx.quadraticCurveTo(fx + 40, festoonY + 12, fx + 80, festoonY);
  }
  ctx.stroke();

  for (let fx = 40; fx < W; fx += 80) {
    let glowBulb;
    if (rooftopMood === 'electric_carnival') {
      glowBulb = (fx % 240 === 0) ? '#ff007f' : ((fx % 160 === 0) ? '#00f5d4' : '#ffe600');
    } else if (rooftopMood === 'lantern_vigil') {
      glowBulb = '#ffaa33';
    } else {
      glowBulb = (fx % 160 === 0) ? '#ff5400' : '#ffd166';
    }
    ctx.fillStyle = glowBulb;
    ctx.shadowColor = glowBulb;
    ctx.shadowBlur = 8 + (audio.bass || 0) * 12;
    ctx.beginPath();
    ctx.arc(fx, festoonY + 9, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}
drawRooftops();

// 3. Cheering Rooftop Crowd
function drawCrowd() {
  const roofY = H * 0.78;
  const crowdCount = Math.max(people.length, 14);
  const moodFactor = rooftopMood === 'electric_carnival' ? 1.5 : (rooftopMood === 'lantern_vigil' ? 0.6 : 1.0);
  const cheerBounce = Math.abs(Math.sin(t * 8)) * (audio.beat ? 14 : 4) * moodFactor;

  for (let i = 0; i < crowdCount; i++) {
    const p = people[i % people.length];
    const team = p ? getTeamForPerson(p.id) : (i % 2);
    const roofSpan = W * 0.38;
    const x = team === 0
      ? W * 0.05 + ((i * 47) % roofSpan)
      : W * 0.57 + ((i * 47) % roofSpan);
    const y = roofY + 2;

    const playerHue = p ? p.hue : (team === 0 ? 38 : 175);
    const isCheering = (room.state.roundState === 'CUT') || (audio.beat && Math.random() < 0.4 * moodFactor);
    const py = y - (isCheering ? cheerBounce : 0);

    ctx.save();
    ctx.fillStyle = '#0a0512';
    ctx.fillRect(x - 4, py - 20, 8, 20);
    ctx.beginPath();
    ctx.arc(x, py - 24, 5, 0, Math.PI * 2);
    ctx.fill();

    if (isCheering) {
      ctx.strokeStyle = '#0a0512';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 4, py - 14);
      ctx.lineTo(x - 9, py - 28);
      ctx.moveTo(x + 4, py - 14);
      ctx.lineTo(x + 9, py - 28);
      ctx.stroke();
    }

    ctx.fillStyle = `hsl(${playerHue}, 90%, 62%)`;
    ctx.shadowColor = `hsl(${playerHue}, 100%, 70%)`;
    ctx.shadowBlur = 6;
    ctx.fillRect(x - 3, py - 18, 6, 7);
    ctx.restore();
  }
}
drawCrowd();

// 4. Kites & Lines Drawing Function
function drawKite(x, y, ang, team, style, isCut, tugTimer) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);

  const isTeam0 = team === 0;
  const baseColor = isTeam0 ? '#ffb703' : '#00f5d4';
  const secColor = isTeam0 ? '#d90429' : '#7b2cbf';
  const accent = isTeam0 ? '#fff3b0' : '#e0aaff';
  const sz = Math.min(W, H) * 0.052;

  if (tugTimer > 0) {
    ctx.save();
    ctx.shadowColor = baseColor;
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, sz * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';

  if (style === 'classic_diamond' || style === 'dragon_swallow') {
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.3);
    ctx.lineTo(-sz * 0.95, 0);
    ctx.lineTo(0, sz * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = secColor;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.3);
    ctx.lineTo(sz * 0.95, 0);
    ctx.lineTo(0, sz * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 0.45);
    ctx.lineTo(sz * 0.35, 0);
    ctx.lineTo(0, sz * 0.45);
    ctx.lineTo(-sz * 0.35, 0);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.2);
    ctx.lineTo(sz * 0.85, -sz * 0.4);
    ctx.lineTo(sz * 0.85, sz * 0.5);
    ctx.lineTo(0, sz * 1.2);
    ctx.lineTo(-sz * 0.85, sz * 0.5);
    ctx.lineTo(-sz * 0.85, -sz * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = secColor;
    ctx.beginPath();
    ctx.arc(0, 0, sz * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(0, -sz * 1.3);
  ctx.lineTo(0, sz * 1.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-sz * 0.95, 0);
  ctx.quadraticCurveTo(0, -sz * 0.25, sz * 0.95, 0);
  ctx.stroke();

  const tailLen = isCut ? 5 : 7;
  const wavePhase = t * 14 + (isTeam0 ? 0 : 2);
  ctx.lineWidth = 3.0;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, sz * 1.1);
  let curX = 0;
  let curY = sz * 1.1;
  for (let s = 1; s <= tailLen; s++) {
    const sw = Math.sin(wavePhase + s * 0.8) * (8 + s * 4);
    curX += sw * 0.4;
    curY += 12;
    ctx.lineTo(curX, curY);
  }
  ctx.stroke();
  ctx.restore();
}

// Draw Glinting Fighting String
function drawLine(anc, kite, team, isTugged) {
  const isTeam0 = team === 0;
  const baseCol = isTeam0 ? '#ffb703' : '#00f5d4';

  ctx.save();
  const midX = (anc.x + kite.x) * 0.5;
  const sag = (isTugged ? 8 : 28) + Math.sin(t * 12 + (isTeam0 ? 0 : 3)) * 4;
  const midY = (anc.y + kite.y) * 0.5 + sag;

  ctx.strokeStyle = baseCol;
  ctx.shadowColor = baseCol;
  ctx.shadowBlur = isTugged ? 16 : 6;
  ctx.lineWidth = isTugged ? 3.0 : 1.8;
  ctx.beginPath();
  ctx.moveTo(anc.x, anc.y);
  ctx.quadraticCurveTo(midX, midY, kite.x, kite.y);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.0;
  ctx.stroke();

  const glintCount = 4;
  for (let g = 0; g < glintCount; g++) {
    const param = (t * 0.75 + g / glintCount) % 1.0;
    const qx = (1 - param) * (1 - param) * anc.x + 2 * (1 - param) * param * midX + param * param * kite.x;
    const qy = (1 - param) * (1 - param) * anc.y + 2 * (1 - param) * param * midY + param * param * kite.y;

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(qx, qy, 2.2 + (audio.treble || 0) * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

if (room.state.roundState === 'PLAYING') {
  drawLine(anc0, k0, 0, k0.tugTimer > 0);
  drawLine(anc1, k1, 1, k1.tugTimer > 0);
  drawKite(k0.x, k0.y, k0.ang, 0, kiteStyle, false, k0.tugTimer);
  drawKite(k1, k1.x, k1.y, k1.ang, 1, kiteStyle, false, k1.tugTimer);
} else if (room.state.roundState === 'CUT') {
  if (room.state.score0 > room.state.score1) {
    drawLine(anc0, k0, 0, false);
    drawKite(k0.x, k0.y, k0.ang, 0, kiteStyle, false, 0);
  } else {
    drawLine(anc1, k1, 1, false);
    drawKite(k1, k1.x, k1.y, k1.ang, 1, kiteStyle, false, 0);
  }
}

for (let i = 0; i < room.state.drifters.length; i++) {
  const d = room.state.drifters[i];
  drawKite(d.x, d.y, d.ang, d.team, kiteStyle, true, 0);
}

ctx.save();
for (let i = 0; i < room.state.sparks.length; i++) {
  const s = room.state.sparks[i];
  ctx.fillStyle = s.color;
  ctx.shadowColor = s.color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 2.8, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// 5. Score HUD & Banners
ctx.save();
const badgeW = 210;
const badgeH = 72;

// Team 0 Badge
ctx.fillStyle = 'rgba(18, 10, 28, 0.85)';
ctx.strokeStyle = '#ffb703';
ctx.lineWidth = 3;
ctx.beginPath();
if (ctx.roundRect) ctx.roundRect(24, 20, badgeW, badgeH, 12);
else ctx.rect(24, 20, badgeW, badgeH);
ctx.fill();
ctx.stroke();

ctx.fillStyle = '#ffb703';
ctx.beginPath();
ctx.moveTo(56, 36);
ctx.lineTo(70, 56);
ctx.lineTo(56, 76);
ctx.lineTo(42, 56);
ctx.closePath();
ctx.fill();

ctx.fillStyle = '#ffffff';
ctx.font = '900 16px monospace';
ctx.fillText('SOLAR', 86, 44);
ctx.font = '900 36px monospace';
ctx.fillStyle = '#ffb703';
ctx.fillText(String(room.state.score0), 86, 78);

// Team 1 Badge
ctx.fillStyle = 'rgba(18, 10, 28, 0.85)';
ctx.strokeStyle = '#00f5d4';
ctx.lineWidth = 3;
ctx.beginPath();
if (ctx.roundRect) ctx.roundRect(W - badgeW - 24, 20, badgeW, badgeH, 12);
else ctx.rect(W - badgeW - 24, 20, badgeW, badgeH);
ctx.fill();
ctx.stroke();

ctx.fillStyle = '#00f5d4';
ctx.beginPath();
ctx.moveTo(W - 56, 36);
ctx.lineTo(W - 42, 56);
ctx.lineTo(W - 56, 76);
ctx.lineTo(W - 70, 56);
ctx.closePath();
ctx.fill();

ctx.fillStyle = '#ffffff';
ctx.font = '900 16px monospace';
ctx.fillText('LUNAR', W - badgeW + 28, 44);
ctx.font = '900 36px monospace';
ctx.fillStyle = '#00f5d4';
ctx.fillText(String(room.state.score1), W - badgeW + 28, 78);

if (room.state.bannerTimer > 0) {
  const alpha = Math.min(1.0, room.state.bannerTimer * 2.0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '900 58px sans-serif';
  ctx.fillStyle = room.state.bannerColor;
  ctx.shadowColor = room.state.bannerColor;
  ctx.shadowBlur = 28 + (audio.bass || 0) * 20;
  ctx.fillText(room.state.banner, W * 0.5, H * 0.17);

  ctx.shadowBlur = 0;
  ctx.font = '800 20px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(room.state.bannerSub, W * 0.5, H * 0.23);
  ctx.restore();
}

ctx.textAlign = 'center';
ctx.font = '700 15px monospace';
ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
ctx.fillText(
  hasPeople
    ? `${people.length} FLYERS ON THE ROOFS  •  TAP 'TUG' TO MANEUVER & CUT`
    : "AUTONOMOUS CLASH  •  PRESS 'TUG' TO TAKE A TEAM'S REEL",
  W * 0.5,
  H - 18
);

ctx.restore();