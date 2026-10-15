ctx.save();

const coreType = getVar('potato_core') ?? 'magma';
const fuseSetting = getVar('fuse_speed') ?? 'tense';
const arenaStyle = getVar('arena_glow') ?? 'deep_void';
const sparkMult = getVar('sparks_intensity') ?? 3;
const allowShake = getVar('shake_fx') ?? true;

const fusePaces = {
  chill: [10, 16],
  tense: [6, 11],
  panic: [3.5, 7.5],
  mayhem: [2, 4.5]
};
const curPace = fusePaces[fuseSetting] ?? fusePaces.tense;

room.state.seats ??= [];
room.state.particles ??= [];
room.state.potato ??= {
  holderId: null,
  targetId: null,
  flightT: 1,
  flightDur: 0.42,
  fromX: 0,
  fromY: 0,
  toX: 0,
  toY: 0,
  x: frame.width * 0.5,
  y: frame.height * 0.52
};
room.state.gameState ??= 'PLAYING';
room.state.fuse ??= 8;
room.state.maxFuse ??= 8;
room.state.lastPassT ??= frame.t;
room.state.stateTimer ??= 0;
room.state.shakeVal ??= 0;
room.state.banner ??= { text: 'HOT POTATO', sub: 'PASS BEFORE IT BLOWS!', alpha: 1.5, color: '#ffea00' };
room.state.roundNum ??= 1;
room.state.lastBeat ??= false;

const activePeople = (room.people && room.people.length >= 2) ? room.people : [
  { id: 'bot_0', table: 'Seat 1', hue: 15 },
  { id: 'bot_1', table: 'Seat 2', hue: 65 },
  { id: 'bot_2', table: 'Seat 3', hue: 145 },
  { id: 'bot_3', table: 'Seat 4', hue: 195 },
  { id: 'bot_4', table: 'Seat 5', hue: 280 },
  { id: 'bot_5', table: 'Seat 6', hue: 330 }
];

const personMap = new Map();
for (let i = 0; i < activePeople.length; i++) {
  personMap.set(activePeople[i].id, activePeople[i]);
}

room.state.seats = room.state.seats.filter(s => personMap.has(s.id));
for (let i = 0; i < activePeople.length; i++) {
  const p = activePeople[i];
  let s = room.state.seats.find(seat => seat.id === p.id);
  if (!s) {
    const name = p.table ? (p.table.length > 8 ? p.table.slice(0, 8) : p.table) : ('P' + (room.state.seats.length + 1));
    room.state.seats.push({
      id: p.id,
      name: name,
      hue: (typeof p.hue === 'number') ? p.hue : ((i * 55) % 360),
      eliminated: false,
      wins: 0,
      pop: 0
    });
  } else {
    s.hue = (typeof p.hue === 'number') ? p.hue : s.hue;
  }
}

const cx = frame.width * 0.5;
const cy = frame.height * 0.52;
const ringR = Math.min(frame.width, frame.height) * 0.36;
const nSeats = room.state.seats.length;
const seatRadius = Math.max(14, Math.min(32, (2 * Math.PI * ringR) / (Math.max(nSeats, 4) * 2.3)));

for (let i = 0; i < nSeats; i++) {
  const seat = room.state.seats[i];
  const ang = (i / nSeats) * Math.PI * 2 - Math.PI / 2;
  seat.x = cx + Math.cos(ang) * ringR;
  seat.y = cy + Math.sin(ang) * ringR;
  seat.pop = Math.max(0, seat.pop - frame.dt * 2.5);
}

function spawnParticles(px, py, count, hue, type) {
  for (let k = 0; k < count; k++) {
    if (room.state.particles.length > 180) room.state.particles.shift();
    const ang = Math.random() * Math.PI * 2;
    const spd = (type === 'smoke') ? (20 + Math.random() * 80) : (60 + Math.random() * 260);
    room.state.particles.push({
      x: px,
      y: py,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - (type === 'smoke' ? 25 : 0),
      life: 1.0,
      decay: (type === 'smoke') ? (0.6 + Math.random() * 0.6) : (1.4 + Math.random() * 1.8),
      size: (type === 'smoke') ? (16 + Math.random() * 24) : (3 + Math.random() * 6),
      hue: hue,
      type: type
    });
  }
}

function startNewRound() {
  for (const s of room.state.seats) s.eliminated = false;
  room.state.gameState = 'PLAYING';
  room.state.fuse = curPace[0] + Math.random() * (curPace[1] - curPace[0]);
  room.state.maxFuse = room.state.fuse;
  const starter = room.state.seats[Math.floor(Math.random() * room.state.seats.length)];
  room.state.potato.holderId = starter ? starter.id : null;
  room.state.potato.targetId = null;
  room.state.potato.flightT = 1;
  room.state.lastPassT = frame.t;
  room.state.banner = { text: 'ROUND ' + room.state.roundNum, sub: 'READY... GO!', alpha: 2.2, color: '#00ffcc' };
  room.state.roundNum++;
}

let livingSeats = room.state.seats.filter(s => !s.eliminated);
if (livingSeats.length === 0) {
  startNewRound();
  livingSeats = room.state.seats.filter(s => !s.eliminated);
}

let passTrigger = false;
let detonateTrigger = false;
let triggerId = null;
if (room.events) {
  for (const ev of room.events) {
    if (ev.name === 'pass') {
      passTrigger = true;
      triggerId = ev.participantId;
    } else if (ev.name === 'detonate') {
      detonateTrigger = true;
    }
  }
}

const attractDelay = Math.max(1.8, 3.2 - (1 - room.state.fuse / Math.max(0.1, room.state.maxFuse)) * 1.5);
if (room.state.gameState === 'PLAYING' && (frame.t - room.state.lastPassT > attractDelay)) {
  passTrigger = true;
}

const potato = room.state.potato;
let currentHolder = room.state.seats.find(s => s.id === potato.holderId);
if (!currentHolder || currentHolder.eliminated) {
  currentHolder = livingSeats[0];
  potato.holderId = currentHolder ? currentHolder.id : null;
}

if (room.state.gameState === 'PLAYING') {
  if (passTrigger && potato.flightT >= 1 && livingSeats.length > 1) {
    const candidates = livingSeats.filter(s => s.id !== potato.holderId);
    const chosenTarget = candidates[Math.floor(Math.random() * candidates.length)];
    if (chosenTarget && currentHolder) {
      potato.fromX = currentHolder.x;
      potato.fromY = currentHolder.y;
      potato.toX = chosenTarget.x;
      potato.toY = chosenTarget.y;
      potato.targetId = chosenTarget.id;
      potato.flightT = 0;
      potato.flightDur = Math.max(0.22, 0.42 - (1 - room.state.fuse / Math.max(0.1, room.state.maxFuse)) * 0.18);
      room.state.lastPassT = frame.t;
      currentHolder.pop = 1.0;
      const passerHue = currentHolder.hue;
      spawnParticles(currentHolder.x, currentHolder.y, 8 * sparkMult, passerHue, 'spark');
      room.state.banner = { text: 'PASS!', sub: currentHolder.name + ' → ' + chosenTarget.name, alpha: 1.1, color: '#ffea00' };
      if (allowShake) room.state.shakeVal = Math.max(room.state.shakeVal, 4);
    }
  }

  if (detonateTrigger) {
    room.state.fuse = 0;
  }

  room.state.fuse -= frame.dt;

  if (room.state.fuse <= 0) {
    room.state.gameState = 'EXPLODED';
    room.state.stateTimer = 2.4;
    if (currentHolder) currentHolder.eliminated = true;
    if (allowShake) room.state.shakeVal = 26;
    spawnParticles(potato.x, potato.y, 45, 0, 'smoke');
    spawnParticles(potato.x, potato.y, 35 * sparkMult, 25, 'spark');
    room.state.banner = {
      text: 'BOOM!',
      sub: (currentHolder ? currentHolder.name : 'PLAYER') + ' GOT CHARRED!',
      alpha: 2.8,
      color: '#ff2222'
    };
  }
} else if (room.state.gameState === 'EXPLODED') {
  room.state.stateTimer -= frame.dt;
  if (room.state.stateTimer <= 0) {
    livingSeats = room.state.seats.filter(s => !s.eliminated);
    if (livingSeats.length <= 1) {
      room.state.gameState = 'WINNER';
      room.state.stateTimer = 4.2;
      const champ = livingSeats[0] || room.state.seats[0];
      if (champ) champ.wins = (champ.wins || 0) + 1;
      room.state.banner = {
        text: 'CROWNED!',
        sub: (champ ? champ.name : 'NOBODY') + ' SURVIVES THE HEAT!',
        alpha: 3.5,
        color: '#ffdd00'
      };
      spawnParticles(cx, cy, 50 * sparkMult, champ ? champ.hue : 50, 'spark');
    } else {
      room.state.gameState = 'PLAYING';
      room.state.fuse = curPace[0] + Math.random() * (curPace[1] - curPace[0]);
      room.state.maxFuse = room.state.fuse;
      const nextH = livingSeats[Math.floor(Math.random() * livingSeats.length)];
      potato.holderId = nextH ? nextH.id : null;
      potato.targetId = null;
      potato.flightT = 1;
      room.state.lastPassT = frame.t;
      room.state.banner = {
        text: 'ROUND CONTINUES',
        sub: livingSeats.length + ' PLAYERS REMAIN',
        alpha: 1.6,
        color: '#00ffcc'
      };
    }
  }
} else if (room.state.gameState === 'WINNER') {
  room.state.stateTimer -= frame.dt;
  if (frame.t % 0.4 < frame.dt) {
    spawnParticles(cx + (Math.random() - 0.5) * ringR, cy + (Math.random() - 0.5) * ringR, 12, Math.random() * 360, 'spark');
  }
  if (room.state.stateTimer <= 0) {
    startNewRound();
  }
}

if (potato.flightT < 1) {
  potato.flightT += frame.dt / potato.flightDur;
  if (potato.flightT >= 1) {
    potato.flightT = 1;
    potato.holderId = potato.targetId;
    potato.targetId = null;
    const catcher = room.state.seats.find(s => s.id === potato.holderId);
    if (catcher) {
      catcher.pop = 0.9;
      spawnParticles(catcher.x, catcher.y, 10 * sparkMult, catcher.hue, 'spark');
    }
  }
  const ft = potato.flightT;
  const midX = (potato.fromX + potato.toX) * 0.5;
  const midY = (potato.fromY + potato.toY) * 0.5;
  const ctrlX = midX * 0.55 + cx * 0.45;
  const ctrlY = midY * 0.55 + cy * 0.45;
  const invT = 1 - ft;
  potato.x = invT * invT * potato.fromX + 2 * invT * ft * ctrlX + ft * ft * potato.toX;
  potato.y = invT * invT * potato.fromY + 2 * invT * ft * ctrlY + ft * ft * potato.toY;
} else {
  const hold = room.state.seats.find(s => s.id === potato.holderId);
  if (hold) {
    potato.x = hold.x;
    potato.y = hold.y;
  }
}

if (audio && audio.beat && !room.state.lastBeat) {
  spawnParticles(potato.x, potato.y, 6 * sparkMult, 40, 'spark');
}
room.state.lastBeat = !!(audio && audio.beat);

let shakeX = 0, shakeY = 0;
if (allowShake && room.state.shakeVal > 0.05) {
  shakeX = (Math.random() - 0.5) * room.state.shakeVal;
  shakeY = (Math.random() - 0.5) * room.state.shakeVal;
  room.state.shakeVal *= 0.88;
}
ctx.translate(shakeX, shakeY);

if (arenaStyle === 'ember_crypt') {
  const bgGrad = ctx.createRadialGradient(cx, cy, ringR * 0.2, cx, cy, ringR * 1.5);
  bgGrad.addColorStop(0, '#220806');
  bgGrad.addColorStop(0.7, '#0f0404');
  bgGrad.addColorStop(1, '#050101');
  ctx.fillStyle = bgGrad;
} else if (arenaStyle === 'cyber_grid') {
  const bgGrad = ctx.createRadialGradient(cx, cy, ringR * 0.1, cx, cy, ringR * 1.4);
  bgGrad.addColorStop(0, '#0a1626');
  bgGrad.addColorStop(1, '#02070f');
  ctx.fillStyle = bgGrad;
} else {
  const bgGrad = ctx.createRadialGradient(cx, cy, ringR * 0.2, cx, cy, ringR * 1.4);
  bgGrad.addColorStop(0, '#13141f');
  bgGrad.addColorStop(0.8, '#090a10');
  bgGrad.addColorStop(1, '#030306');
  ctx.fillStyle = bgGrad;
}
ctx.fillRect(0, 0, frame.width, frame.height);

if (arenaStyle === 'cyber_grid') {
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.07)';
  ctx.lineWidth = 1;
  const gStep = 60;
  for (let gx = 0; gx < frame.width; gx += gStep) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, frame.height);
    ctx.stroke();
  }
  for (let gy = 0; gy < frame.height; gy += gStep) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(frame.width, gy);
    ctx.stroke();
  }
  ctx.restore();
}

ctx.save();
ctx.beginPath();
ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
ctx.strokeStyle = arenaStyle === 'ember_crypt' ? 'rgba(255, 80, 20, 0.15)' : 'rgba(255, 255, 255, 0.08)';
ctx.lineWidth = 2;
ctx.setLineDash([8, 12]);
ctx.stroke();
ctx.restore();

const fuseRatio = Math.max(0, Math.min(1, room.state.fuse / Math.max(0.1, room.state.maxFuse)));
const gaugeR = ringR * 0.44;
const bassBoost = audio ? audio.bass * 14 : 0;

ctx.save();
ctx.beginPath();
ctx.arc(cx, cy, gaugeR, 0, Math.PI * 2);
ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
ctx.lineWidth = 14;
ctx.stroke();

ctx.beginPath();
const startAng = -Math.PI / 2;
const endAng = startAng + fuseRatio * Math.PI * 2;
ctx.arc(cx, cy, gaugeR, startAng, endAng, false);
let gaugeColor = '#00ffcc';
if (fuseRatio < 0.28) {
  gaugeColor = (Math.sin(frame.t * 22) > 0) ? '#ff1122' : '#ffffff';
} else if (fuseRatio < 0.55) {
  gaugeColor = '#ffbb00';
}
ctx.strokeStyle = gaugeColor;
ctx.lineWidth = 12 + (fuseRatio < 0.28 ? 6 : 0) + (audio ? audio.level * 6 : 0);
ctx.lineCap = 'round';
ctx.stroke();

ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = gaugeColor;
ctx.font = '900 ' + Math.round(gaugeR * 0.42 + bassBoost) + 'px system-ui, sans-serif';
if (room.state.gameState === 'PLAYING') {
  ctx.fillText(Math.max(0, room.state.fuse).toFixed(1) + 's', cx, cy - 6);
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText('HOT FUSE', cx, cy + gaugeR * 0.32);
} else if (room.state.gameState === 'EXPLODED') {
  ctx.fillStyle = '#ff2222';
  ctx.fillText('KABOOM', cx, cy);
} else {
  ctx.fillStyle = '#ffd700';
  ctx.fillText('WINNER', cx, cy);
}
ctx.restore();

for (let i = 0; i < nSeats; i++) {
  const s = room.state.seats[i];
  const isHolder = (s.id === potato.holderId && potato.flightT >= 1);
  const isTarget = (s.id === potato.targetId);
  const rad = seatRadius * (1 + s.pop * 0.4);

  ctx.save();
  if (s.eliminated) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = '#1c1c22';
    ctx.fill();
    ctx.strokeStyle = '#3a3a44';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = '#ff3344';
    ctx.lineWidth = 3;
    const d = rad * 0.45;
    ctx.beginPath();
    ctx.moveTo(s.x - d, s.y - d);
    ctx.lineTo(s.x + d, s.y + d);
    ctx.moveTo(s.x + d, s.y - d);
    ctx.lineTo(s.x - d, s.y + d);
    ctx.stroke();
  } else {
    if (isHolder || isTarget) {
      const haloPulse = (Math.sin(frame.t * 14) * 0.5 + 0.5);
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad + 10 + haloPulse * 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'hsla(' + s.hue + ', 100%, 65%, ' + (0.5 + haloPulse * 0.4) + ')';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    const sGrad = ctx.createRadialGradient(s.x - rad * 0.3, s.y - rad * 0.3, rad * 0.1, s.x, s.y, rad);
    sGrad.addColorStop(0, 'hsl(' + s.hue + ', 95%, 75%)');
    sGrad.addColorStop(0.7, 'hsl(' + s.hue + ', 85%, 45%)');
    sGrad.addColorStop(1, 'hsl(' + s.hue + ', 90%, 25%)');
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = sGrad;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = isHolder ? 4 : 2;
    ctx.stroke();

    if (s.wins > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(s.x + rad * 0.7, s.y - rad * 0.7, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.font = '900 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.wins, s.x + rad * 0.7, s.y - rad * 0.7);
    }
  }

  ctx.font = '700 ' + Math.max(11, Math.min(16, seatRadius * 0.75)) + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = s.eliminated ? '#777788' : '#ffffff';
  const labelY = (s.y > cy) ? (s.y + rad + 14) : (s.y - rad - 12);
  ctx.fillText(s.name, s.x, labelY);
  ctx.restore();
}

if (room.state.gameState !== 'EXPLODED') {
  ctx.save();
  const potScale = 1.0 + (audio ? audio.bass * 0.35 : 0) + (fuseRatio < 0.25 ? Math.sin(frame.t * 32) * 0.14 : 0);
  const baseRad = Math.max(16, seatRadius * 0.95) * potScale;
  const px = potato.x;
  const py = potato.y;

  const corePalettes = {
    magma: { inner: '#fff7cc', mid: '#ff8800', outer: '#d41100', spark: 30 },
    plasma: { inner: '#ffffff', mid: '#00e5ff', outer: '#7b00ff', spark: 200 },
    radioactive: { inner: '#f0ffb0', mid: '#88ff00', outer: '#1b8000', spark: 95 },
    cyber_neon: { inner: '#ffffff', mid: '#ff00aa', outer: '#330088', spark: 310 }
  };
  const pal = corePalettes[coreType] ?? corePalettes.magma;

  ctx.beginPath();
  ctx.arc(px, py, baseRad * 2.2, 0, Math.PI * 2);
  const haloG = ctx.createRadialGradient(px, py, baseRad * 0.4, px, py, baseRad * 2.2);
  haloG.addColorStop(0, pal.mid);
  haloG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = haloG;
  ctx.globalAlpha = 0.45;
  ctx.fill();
  ctx.globalAlpha = 1.0;

  ctx.beginPath();
  const pts = 12;
  for (let p = 0; p < pts; p++) {
    const a = (p / pts) * Math.PI * 2;
    const deform = Math.sin(frame.t * 18 + p * 3) * (baseRad * 0.18);
    const r = baseRad + deform;
    const gx = px + Math.cos(a) * r;
    const gy = py + Math.sin(a) * r;
    if (p === 0) ctx.moveTo(gx, gy);
    else ctx.lineTo(gx, gy);
  }
  ctx.closePath();
  const pGrad = ctx.createRadialGradient(px - baseRad * 0.3, py - baseRad * 0.3, baseRad * 0.1, px, py, baseRad * 1.1);
  pGrad.addColorStop(0, pal.inner);
  pGrad.addColorStop(0.45, pal.mid);
  pGrad.addColorStop(1, pal.outer);
  ctx.fillStyle = pGrad;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const fuseAng = frame.t * 8;
  const fuseTipX = px + Math.cos(fuseAng) * (baseRad * 1.5);
  const fuseTipY = py + Math.sin(fuseAng) * (baseRad * 1.5);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.quadraticCurveTo(px + Math.cos(fuseAng + 0.6) * (baseRad * 1.2), py + Math.sin(fuseAng + 0.6) * (baseRad * 1.2), fuseTipX, fuseTipY);
  ctx.strokeStyle = '#ffddaa';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(fuseTipX, fuseTipY, 5 + Math.random() * 4, 0, Math.PI * 2);
  ctx.fillStyle = (Math.random() > 0.5) ? '#ffffff' : pal.mid;
  ctx.fill();

  if (frame.t % 0.08 < frame.dt * 2) {
    spawnParticles(fuseTipX, fuseTipY, 2 * sparkMult, pal.spark, 'spark');
  }
  ctx.restore();
}

for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  p.life -= p.decay * frame.dt;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  ctx.save();
  if (p.type === 'smoke') {
    p.size += frame.dt * 28;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 40, 48, ' + (p.life * 0.45) + ')';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(' + p.hue + ', 100%, 65%, ' + p.life + ')';
    ctx.fill();
  }
  ctx.restore();
}

const banner = room.state.banner;
if (banner && banner.alpha > 0.01) {
  banner.alpha = Math.max(0, banner.alpha - frame.dt * 0.7);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const topY = Math.max(54, frame.height * 0.09);

  ctx.font = '900 46px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0, 0, 0, ' + Math.min(1, banner.alpha) + ')';
  ctx.fillText(banner.text, cx + 2, topY + 2);

  ctx.fillStyle = banner.color;
  ctx.globalAlpha = Math.min(1, banner.alpha);
  ctx.fillText(banner.text, cx, topY);

  if (banner.sub) {
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, ' + Math.min(1, banner.alpha * 0.9) + ')';
    ctx.fillText(banner.sub, cx, topY + 36);
  }
  ctx.restore();
}

ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'bottom';
ctx.font = '800 18px system-ui, sans-serif';
ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
ctx.fillText('PRESS [PASS!] TO THROW • SURVIVE THE DETONATION', cx, frame.height - 20);
ctx.restore();

ctx.restore();