const styleKey = getVar('style') ?? 'Party';
const riskVal = getVar('risk') ?? 3;
const roundLimit = getVar('round_length') ?? 20;
const confettiOn = getVar('confetti_storm') ?? true;

// Palettes
const themes = {
  Party: { bg: '#0e0b16', ground: '#1a1429', text: '#ffffff', glow: '#ffd166', rim: '#ffffff' },
  'Neon Rave': { bg: '#05030a', ground: '#0f081d', text: '#00f5d4', glow: '#f72585', rim: '#7209b7' },
  Carnival: { bg: '#160808', ground: '#2a1111', text: '#ffe66d', glow: '#ff6b6b', rim: '#4ecdc4' }
};
const th = themes[styleKey] ?? themes.Party;

// State setup
room.state.balloons ??= {};
room.state.shreds ??= [];
room.state.puffs ??= [];
room.state.roundState ??= 'playing'; // 'playing' | 'winner'
room.state.roundTime ??= 0;
room.state.stateTime ??= 0;
room.state.lastAction ??= frame.t;
room.state.winnerName ??= '';
room.state.winnerHue ??= 45;
room.state.banner ??= 'PUMP!';
room.state.bannerTimer ??= 1.5;

const dt = Math.min(frame.dt || 0.016, 0.05);
room.state.roundTime += dt;
room.state.stateTime += dt;
if (room.state.bannerTimer > 0) room.state.bannerTimer -= dt;

// Player roster resolution (use room.people or 4 demo players in attract)
const rawPeople = room.people && room.people.length > 0 ? room.people : null;
const players = [];
if (rawPeople) {
  for (let i = 0; i < rawPeople.length; i++) {
    players.push({ id: rawPeople[i].id, hue: rawPeople[i].hue ?? (i * 57) % 360, name: `P${i + 1}` });
  }
} else {
  const botColors = [340, 48, 168, 215, 280];
  for (let i = 0; i < 5; i++) {
    players.push({ id: `bot-${i}`, hue: botColors[i], name: `P${i + 1}` });
  }
}

// Ensure balloon state records
for (const p of players) {
  room.state.balloons[p.id] ??= {
    size: 0.35,
    targetSize: 0.35,
    status: 'active', // 'active' | 'tied' | 'popped'
    pumpPulse: 0,
    wobble: 0,
    hue: p.hue,
    name: p.name,
    score: 0
  };
  room.state.balloons[p.id].hue = p.hue;
  room.state.balloons[p.id].name = p.name;
}

// Helpers
function spawnShreds(x, y, hue, count) {
  for (let i = 0; i < count; i++) {
    if (room.state.shreds.length >= 180) room.state.shreds.shift();
    const ang = Math.random() * Math.PI * 2;
    const spd = 140 + Math.random() * 450;
    room.state.shreds.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 90,
      rot: Math.random() * 6.28,
      vrot: (Math.random() - 0.5) * 16,
      w: 8 + Math.random() * 14,
      h: 5 + Math.random() * 8,
      hue: (hue + (Math.random() * 40 - 20) + 360) % 360,
      life: 1.0
    });
  }
}

function spawnPuff(x, y) {
  if (room.state.puffs.length >= 40) room.state.puffs.shift();
  room.state.puffs.push({ x, y, r: 12, alpha: 0.8 });
}

function doPump(pid, isBot = false) {
  const b = room.state.balloons[pid];
  if (!b || b.status !== 'active') return;
  room.state.lastAction = frame.t;
  const gain = 0.16 + (Math.random() * 0.06);
  b.targetSize += gain;
  b.pumpPulse = 1.0;
  b.wobble = (Math.random() - 0.5) * 0.45;

  // Burst hazard logic
  const riskFactor = riskVal * 0.28;
  const burstChance = Math.max(0, (b.targetSize - 0.75)) * riskFactor * 0.36;
  if (Math.random() < burstChance || b.targetSize >= 2.6) {
    b.status = 'popped';
    b.score = 0;
    b.targetSize = 0;
    b.size = 0;
    room.state.banner = 'POP!';
    room.state.bannerTimer = 1.0;
  }
}

function doTie(pid) {
  const b = room.state.balloons[pid];
  if (!b || b.status !== 'active') return;
  room.state.lastAction = frame.t;
  b.status = 'tied';
  b.score = Math.max(10, Math.round(b.size * 100));
  b.pumpPulse = 0.8;
}

// Process incoming interactive events
if (room.events && room.events.length > 0) {
  for (const ev of room.events) {
    const pid = ev.participantId ?? (players[0] ? players[0].id : null);
    if (!pid) continue;
    if (ev.name === 'pump') doPump(pid);
    if (ev.name === 'tie') doTie(pid);
  }
}

// Attract mode AI when idle
const isIdle = (frame.t - room.state.lastAction) > 3.0;
if (isIdle && room.state.roundState === 'playing') {
  if (Math.random() < 0.12) {
    const activeIds = players.map(p => p.id).filter(id => room.state.balloons[id]?.status === 'active');
    if (activeIds.length > 0) {
      const pick = activeIds[Math.floor(Math.random() * activeIds.length)];
      const b = room.state.balloons[pick];
      if (b.size > 1.25 && Math.random() < 0.4) {
        doTie(pick);
      } else {
        doPump(pick, true);
      }
    }
  }
}

// Round management
let allDone = true;
let highestScore = -1;
let winnerId = null;

for (const p of players) {
  const b = room.state.balloons[p.id];
  if (!b) continue;
  if (b.status === 'active') allDone = false;
  if (b.score > highestScore) {
    highestScore = b.score;
    winnerId = p.id;
  }
}

if (room.state.roundState === 'playing') {
  if (allDone || room.state.roundTime >= roundLimit) {
    room.state.roundState = 'winner';
    room.state.stateTime = 0;
    if (winnerId && highestScore > 0) {
      const wb = room.state.balloons[winnerId];
      room.state.winnerName = wb.name;
      room.state.winnerHue = wb.hue;
      room.state.banner = `${wb.name} WINS!`;
    } else {
      room.state.winnerName = 'NOBODY';
      room.state.winnerHue = 0;
      room.state.banner = 'ALL BURST!';
    }
    room.state.bannerTimer = 4.0;
  }
} else if (room.state.roundState === 'winner') {
  if (room.state.stateTime > 4.5) {
    // Reset round
    room.state.roundState = 'playing';
    room.state.roundTime = 0;
    room.state.stateTime = 0;
    room.state.banner = 'GO!';
    room.state.bannerTimer = 1.2;
    for (const pid in room.state.balloons) {
      const b = room.state.balloons[pid];
      b.size = 0.35;
      b.targetSize = 0.35;
      b.status = 'active';
      b.score = 0;
      b.pumpPulse = 0.5;
    }
  }
}

// DRAWING
ctx.save();

// Dark gradient party backdrop
const bgGrad = ctx.createLinearGradient(0, 0, 0, frame.height);
bgGrad.addColorStop(0, th.bg);
bgGrad.addColorStop(1, th.ground);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

// Audio reactive ambient wall spots
const beatKick = audio.beat ? 1.0 : (audio.bass || 0);
ctx.save();
ctx.globalAlpha = 0.08 + beatKick * 0.12;
for (let i = 0; i < 4; i++) {
  const lx = (frame.width / 5) * (i + 1);
  const ly = frame.height * 0.25 + Math.sin(frame.t * 1.2 + i) * 60;
  const rad = 140 + beatKick * 80;
  const spot = ctx.createRadialGradient(lx, ly, 10, lx, ly, rad);
  spot.addColorStop(0, th.glow);
  spot.addColorStop(1, 'transparent');
  ctx.fillStyle = spot;
  ctx.beginPath();
  ctx.arc(lx, ly, rad, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// Layout computation for balloons
const total = players.length;
const cols = total <= 6 ? total : Math.ceil(Math.sqrt(total * 1.6));
const rows = Math.ceil(total / cols);
const cellW = frame.width / (cols + 0.5);
const cellH = (frame.height - 180) / rows;
const baseYOffset = 130;

// Draw each player's balloon lane
for (let i = 0; i < total; i++) {
  const p = players[i];
  const b = room.state.balloons[p.id];
  if (!b) continue;

  // Smooth spring size animation
  b.size += (b.targetSize - b.size) * 0.22;
  b.pumpPulse *= 0.88;
  b.wobble *= 0.86;

  const row = Math.floor(i / cols);
  const col = i % cols;
  const cx = (col + 0.75) * cellW;
  const cy = baseYOffset + (row + 0.65) * cellH;

  const maxR = Math.min(cellW * 0.44, cellH * 0.42);
  const currentR = Math.max(8, b.size * (maxR * 0.52));
  const squash = 1 + b.pumpPulse * 0.28;
  const stretch = 1 - b.pumpPulse * 0.20;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(b.wobble * 0.35 + Math.sin(frame.t * 2.5 + i) * 0.05);

  // String down to floor/anchor
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, currentR * 1.05);
  ctx.quadraticCurveTo(
    Math.sin(frame.t * 3 + i) * 12,
    currentR + 25,
    0,
    currentR + 55
  );
  ctx.stroke();

  if (b.status !== 'popped') {
    // Balloon Body
    ctx.save();
    ctx.scale(squash, stretch);

    const bassBoost = (audio.bass || 0) * 0.08;
    const glowR = currentR * (1.08 + bassBoost);
    
    // Knot
    ctx.fillStyle = `hsl(${b.hue}, 85%, 45%)`;
    ctx.beginPath();
    ctx.moveTo(-6, currentR * 0.98);
    ctx.lineTo(6, currentR * 0.98);
    ctx.lineTo(0, currentR * 1.08);
    ctx.closePath();
    ctx.fill();

    // Balloon gradient
    const bGrad = ctx.createRadialGradient(
      -glowR * 0.25, -glowR * 0.35, glowR * 0.1,
      0, 0, glowR
    );
    bGrad.addColorStop(0, `hsl(${b.hue}, 100%, 75%)`);
    bGrad.addColorStop(0.65, `hsl(${b.hue}, 90%, 52%)`);
    bGrad.addColorStop(1, `hsl(${b.hue}, 95%, 32%)`);

    ctx.fillStyle = bGrad;
    ctx.beginPath();
    // Organic balloon silhouette
    ctx.ellipse(0, 0, glowR * 0.92, glowR * 1.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gloss highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.ellipse(-glowR * 0.35, -glowR * 0.38, glowR * 0.22, glowR * 0.14, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // Pop alert shimmer if huge
    if (b.size > 1.4 && b.status === 'active') {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + Math.sin(frame.t * 18) * 0.35})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();

    // Status Tag or Tied Ribbon
    if (b.status === 'tied') {
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-28, currentR + 24, 56, 20);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(-28, currentR + 24, 56, 20);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${b.score}pt`, 0, currentR + 35);
    }
  } else {
    // Deflated knot remains
    ctx.fillStyle = `hsl(${b.hue}, 30%, 30%)`;
    ctx.beginPath();
    ctx.arc(0, 30, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#ff4d6d';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', 0, 52);
  }

  // Player Name and Hue badge
  ctx.fillStyle = th.text;
  ctx.font = '900 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(p.name, 0, currentR + 62);

  // Air puff on pump
  if (b.pumpPulse > 0.6) {
    spawnPuff(cx, cy + currentR + 10);
  }

  // Burst effect trigger check
  if (b.status === 'popped' && b.size > 0.05) {
    spawnShreds(cx, cy, b.hue, 35);
    b.size = 0;
  }

  ctx.restore();
}

// Update & Draw Air Puffs
ctx.save();
for (let i = room.state.puffs.length - 1; i >= 0; i--) {
  const pf = room.state.puffs[i];
  pf.r += 28 * dt;
  pf.alpha -= 1.8 * dt;
  if (pf.alpha <= 0) {
    room.state.puffs.splice(i, 1);
    continue;
  }
  ctx.strokeStyle = `rgba(255, 255, 255, ${pf.alpha})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(pf.x, pf.y, pf.r, 0, Math.PI * 2);
  ctx.stroke();
}
ctx.restore();

// Update & Draw Confetti Shreds
if (confettiOn) {
  ctx.save();
  for (let i = room.state.shreds.length - 1; i >= 0; i--) {
    const s = room.state.shreds[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 450 * dt; // Gravity
    s.rot += s.vrot * dt;
    s.life -= 0.65 * dt;

    if (s.life <= 0 || s.y > frame.height + 50) {
      room.state.shreds.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.fillStyle = `hsla(${s.hue}, 95%, 60%, ${Math.min(1, s.life * 1.5)})`;
    ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }
  ctx.restore();
}

// Top HUD Bar
ctx.save();
ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
ctx.fillRect(0, 0, frame.width, 74);

// Round Timer & Title
ctx.fillStyle = th.text;
ctx.font = '900 24px sans-serif';
ctx.textAlign = 'left';
ctx.textBaseline = 'middle';
ctx.fillText('PUMP TILL IT POPS', 28, 38);

// Risk meter
ctx.font = 'bold 14px sans-serif';
ctx.fillStyle = '#ff758f';
ctx.fillText(`RISK: ${riskVal}x`, 280, 38);

// Time Bar
const timeLeft = Math.max(0, roundLimit - room.state.roundTime);
const tRatio = room.state.roundState === 'playing' ? (timeLeft / roundLimit) : 0;
ctx.fillStyle = '#222';
ctx.fillRect(frame.width - 240, 26, 210, 22);
ctx.fillStyle = timeLeft < 5 ? '#ff0055' : th.glow;
ctx.fillRect(frame.width - 240, 26, 210 * tRatio, 22);
ctx.fillStyle = '#fff';
ctx.font = 'bold 12px sans-serif';
ctx.textAlign = 'center';
ctx.fillText(`${Math.ceil(timeLeft)}s`, frame.width - 135, 38);

// Prominent Dynamic Center Banner
if (room.state.bannerTimer > 0) {
  ctx.save();
  const bounce = Math.sin(room.state.bannerTimer * 4) * 0.08;
  const scale = 1 + bounce;
  ctx.translate(frame.width / 2, frame.height * 0.46);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Shadow
  ctx.font = '900 64px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText(room.state.banner, 0, 6);

  // Main banner text
  ctx.fillStyle = room.state.roundState === 'winner' ? `hsl(${room.state.winnerHue}, 100%, 65%)` : '#ffffff';
  ctx.fillText(room.state.banner, 0, 0);
  ctx.restore();
}

// Attract overlay hint if room is idle
if (isIdle) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = 'italic 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PRESS PUMP TO INFLATE • PRESS TIE TO BANK YOUR POINTS', frame.width / 2, frame.height - 24);
}

ctx.restore();