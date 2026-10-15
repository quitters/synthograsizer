ctx.save();

const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);
const now = frame.t;

// --- Configuration & Variables ---
const themeKey = getVar('felt_theme') || 'classic_green';
const paceKey = getVar('round_speed') || 'brisk';
const starCount = getVar('particle_burst') ?? 30;
const gameGoal = getVar('game_mode') || 'first_to_ten';
const showScores = getVar('show_scores') ?? true;

const paceSpeeds = { chill: 1.0, brisk: 1.45, frantic: 2.1 };
const speedMult = paceSpeeds[paceKey] ?? 1.45;

const themes = {
  classic_green: { bg: '#0b1d12', felt: '#1c5e32', rim: '#0e3a1d', hole: '#06150b', accent: '#ffe600' },
  neon_arcade:   { bg: '#0b061a', felt: '#241442', rim: '#481d80', hole: '#0d041a', accent: '#00f7ff' },
  midnight_velvet:{ bg: '#100b14', felt: '#361830', rim: '#581e4b', hole: '#12040f', accent: '#ff4081' }
};
const theme = themes[themeKey] || themes.classic_green;

// --- State Initialization ---
room.state.init ??= false;
room.state.roundState ??= 'playing'; // 'playing' | 'winner'
room.state.roundTimer ??= 0;
room.state.winnerName ??= '';
room.state.winnerHue ??= 45;
room.state.winnerTimer ??= 0;
room.state.shake ??= 0;
room.state.scores ??= {};
room.state.holes ??= [];
room.state.particles ??= [];
room.state.floats ??= [];
room.state.lastActionT ??= now;
room.state.spawnTimer ??= 0.5;

const people = (room.people && room.people.length > 0) ? room.people : [
  { id: 'solo', table: 'table-1', hue: 45 }
];

// Ensure holes grid matches player count gracefully (min 4, max 16)
const targetHoles = Math.min(16, Math.max(4, Math.ceil(people.length * 1.5)));
let cols = 3;
let rows = 2;
if (targetHoles <= 4) { cols = 2; rows = 2; }
else if (targetHoles <= 6) { cols = 3; rows = 2; }
else if (targetHoles <= 9) { cols = 3; rows = 3; }
else if (targetHoles <= 12) { cols = 4; rows = 3; }
else { cols = 4; rows = 4; }
const totalHoles = cols * rows;

if (room.state.holes.length !== totalHoles) {
  room.state.holes = [];
  for (let i = 0; i < totalHoles; i++) {
    room.state.holes.push({
      state: 'down', // down, up, bonked, miss
      height: 0,
      timer: 0,
      duration: 1.8,
      ownerId: null,
      hue: 45,
      ownerName: 'P1'
    });
  }
}

// Screen shake on hit
let shakeX = 0;
let shakeY = 0;
if (room.state.shake > 0) {
  shakeX = (Math.random() - 0.5) * room.state.shake;
  shakeY = (Math.random() - 0.5) * room.state.shake;
  room.state.shake = Math.max(0, room.state.shake - dt * 25);
}
ctx.translate(shakeX, shakeY);

// --- Helper Functions ---
function addParticles(x, y, hue, count) {
  for (let i = 0; i < count; i++) {
    if (room.state.particles.length > 180) room.state.particles.shift();
    const ang = Math.random() * Math.PI * 2;
    const spd = 120 + Math.random() * 320;
    room.state.particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 60,
      life: 0,
      maxLife: 0.5 + Math.random() * 0.5,
      hue: (hue + (Math.random() * 40 - 20) + 360) % 360,
      size: 6 + Math.random() * 10
    });
  }
}

function addFloat(text, x, y, hue, scale = 1) {
  if (room.state.floats.length > 25) room.state.floats.shift();
  room.state.floats.push({
    text, x, y, hue, life: 0, maxLife: 0.9, scale
  });
}

// --- Event Handling (Bonk triggers) ---
const bonkEvents = [];
if (room.events && room.events.length > 0) {
  for (let e of room.events) {
    if (e.name === 'bonk') {
      bonkEvents.push(e);
      room.state.lastActionT = now;
    }
  }
}

// Attract mode auto-bonk if quiet for > 4s
if (bonkEvents.length === 0 && (now - room.state.lastActionT) > 4.5 && room.state.roundState === 'playing') {
  if (Math.random() < dt * 1.6) {
    const activeMoles = room.state.holes.filter(h => h.state === 'up');
    if (activeMoles.length > 0) {
      const pick = activeMoles[Math.floor(Math.random() * activeMoles.length)];
      bonkEvents.push({ participantId: pick.ownerId, isAuto: true });
    }
  }
}

// Process Bonks
for (let ev of bonkEvents) {
  if (room.state.roundState !== 'playing') continue;
  const p = people.find(item => item.id === ev.participantId) || people[0];
  const targetHole = room.state.holes.find(h => h.state === 'up' && h.ownerId === p.id);
  
  if (targetHole) {
    // Hit!
    targetHole.state = 'bonked';
    targetHole.timer = 0;
    room.state.shake = 16;
    const ptKey = p.id;
    room.state.scores[ptKey] = (room.state.scores[ptKey] || 0) + 1;
    
    // Positions
    const idx = room.state.holes.indexOf(targetHole);
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cellW = (W * 0.85) / cols;
    const cellH = (H * 0.65) / rows;
    const hx = W * 0.075 + col * cellW + cellW * 0.5;
    const hy = H * 0.22 + row * cellH + cellH * 0.55;
    
    addParticles(hx, hy - 40, p.hue, starCount);
    addFloat('WHAM! +1', hx, hy - 60, p.hue, 1.2);

    // Check win condition
    const score = room.state.scores[ptKey];
    if (gameGoal === 'first_to_ten' && score >= 10) {
      room.state.roundState = 'winner';
      room.state.winnerName = (p.table ? `${p.table.toUpperCase()}` : `PLAYER`);
      room.state.winnerHue = p.hue;
      room.state.winnerTimer = 0;
    }
  } else {
    // Missed bonk (pressed with no mole)
    room.state.shake = 6;
    const active = room.state.holes.find(h => h.state === 'up');
    if (active) {
      active.state = 'miss';
      active.timer = 0;
      const idx = room.state.holes.indexOf(active);
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cellW = (W * 0.85) / cols;
      const cellH = (H * 0.65) / rows;
      const hx = W * 0.075 + col * cellW + cellW * 0.5;
      const hy = H * 0.22 + row * cellH + cellH * 0.55;
      addFloat('PFFFFT! 😛', hx, hy - 50, 0, 0.9);
    }
  }
}

// --- Game Progression & Spawning ---
if (room.state.roundState === 'playing') {
  room.state.roundTimer += dt;
  
  if (gameGoal === 'timed_rush' && room.state.roundTimer > 40) {
    // Find top scorer
    let topScore = -1;
    let topP = people[0];
    for (let p of people) {
      const sc = room.state.scores[p.id] || 0;
      if (sc > topScore) {
        topScore = sc;
        topP = p;
      }
    }
    room.state.roundState = 'winner';
    room.state.winnerName = topP.table ? topP.table.toUpperCase() : 'HERO';
    room.state.winnerHue = topP.hue;
    room.state.winnerTimer = 0;
  }

  // Faster mole spawns as round progresses
  const timeFactor = 1 + Math.min(1.2, room.state.roundTimer * 0.03);
  const currentSpeed = speedMult * timeFactor;
  room.state.spawnTimer -= dt * currentSpeed;

  if (room.state.spawnTimer <= 0) {
    room.state.spawnTimer = 0.65 + Math.random() * 0.7;
    const downHoles = room.state.holes.filter(h => h.state === 'down');
    if (downHoles.length > 0) {
      const pick = downHoles[Math.floor(Math.random() * downHoles.length)];
      const randomPlayer = people[Math.floor(Math.random() * people.length)];
      pick.state = 'up';
      pick.height = 0;
      pick.timer = 0;
      pick.duration = Math.max(0.65, (1.8 / currentSpeed));
      pick.ownerId = randomPlayer.id;
      pick.hue = randomPlayer.hue;
      pick.ownerName = randomPlayer.table ? randomPlayer.table.replace('table-', 'T') : 'P';
    }
  }
} else if (room.state.roundState === 'winner') {
  room.state.winnerTimer += dt;
  if (room.state.winnerTimer > 5.0) {
    // Auto restart new round
    room.state.roundState = 'playing';
    room.state.roundTimer = 0;
    room.state.scores = {};
    for (let h of room.state.holes) h.state = 'down';
  }
}

// Update Mole Animations
for (let h of room.state.holes) {
  if (h.state === 'up') {
    h.timer += dt;
    h.height = Math.min(1, h.height + dt * 6.5);
    if (h.timer >= h.duration) {
      // Timed out: raspberry miss
      h.state = 'miss';
      h.timer = 0;
    }
  } else if (h.state === 'bonked') {
    h.timer += dt;
    h.height = Math.max(0, h.height - dt * 3.5);
    if (h.timer > 0.4) h.state = 'down';
  } else if (h.state === 'miss') {
    h.timer += dt;
    h.height = Math.max(0, h.height - dt * 2.8);
    if (h.timer > 0.5) h.state = 'down';
  } else {
    h.height = 0;
  }
}

// --- DRAWING ---

// 1. Background arena
ctx.fillStyle = theme.bg;
ctx.fillRect(0, 0, W, H);

// Green felt board with rounded corners
const feltPadX = W * 0.05;
const feltPadY = H * 0.16;
const feltW = W * 0.9;
const feltH = H * 0.76;

ctx.save();
ctx.shadowColor = 'rgba(0,0,0,0.65)';
ctx.shadowBlur = 30;
ctx.shadowOffsetY = 15;
ctx.fillStyle = theme.felt;
ctx.beginPath();
ctx.roundRect(feltPadX, feltPadY, feltW, feltH, 36);
ctx.fill();
ctx.restore();

// Subtle felt texture lines
ctx.save();
ctx.strokeStyle = theme.rim;
ctx.lineWidth = 4;
ctx.beginPath();
ctx.roundRect(feltPadX + 8, feltPadY + 8, feltW - 16, feltH - 16, 28);
ctx.stroke();
ctx.restore();

// Audio beat pulse on arena trim
const bassBoost = (audio && audio.bass) ? audio.bass * 6 : 0;
if (bassBoost > 0.5) {
  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = Math.min(0.6, bassBoost * 0.1);
  ctx.lineWidth = 6 + bassBoost;
  ctx.beginPath();
  ctx.roundRect(feltPadX, feltPadY, feltW, feltH, 36);
  ctx.stroke();
  ctx.restore();
}

// 2. Holes & Moles
const cellW = (W * 0.84) / cols;
const cellH = (H * 0.68) / rows;
const gridStartX = W * 0.08;
const gridStartY = H * 0.20;

for (let i = 0; i < totalHoles; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const cx = gridStartX + col * cellW + cellW * 0.5;
  const cy = gridStartY + row * cellH + cellH * 0.62;
  const holeRadiusX = Math.min(cellW * 0.38, 90);
  const holeRadiusY = holeRadiusX * 0.42;
  const hole = room.state.holes[i];

  // Hole Rim (Back/Base)
  ctx.save();
  ctx.fillStyle = theme.rim;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, holeRadiusX + 6, holeRadiusY + 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hole Depths
  ctx.fillStyle = theme.hole;
  ctx.beginPath();
  ctx.ellipse(cx, cy, holeRadiusX, holeRadiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Clip mole rising out of hole
  if (hole && hole.height > 0) {
    ctx.save();
    ctx.beginPath();
    // Clipping rectangle above the hole center so mole stays cleanly inside cavity rim
    ctx.rect(cx - holeRadiusX * 1.5, cy - holeRadiusX * 2.5, holeRadiusX * 3, holeRadiusX * 2.5 + 4);
    ctx.clip();

    const moleH = holeRadiusX * 1.5;
    const popY = cy + 4 - (hole.height * moleH * 0.95);
    const moleW = holeRadiusX * 1.25;
    const moleHue = hole.hue;

    // Mole Body
    ctx.fillStyle = `hsl(${moleHue}, 80%, 45%)`;
    ctx.beginPath();
    ctx.roundRect(cx - moleW * 0.5, popY, moleW, moleH * 1.2, [moleW * 0.5, moleW * 0.5, 10, 10]);
    ctx.fill();

    // Snout
    ctx.fillStyle = `hsl(${moleHue}, 90%, 75%)`;
    ctx.beginPath();
    ctx.ellipse(cx, popY + moleH * 0.35, moleW * 0.28, moleW * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx, popY + moleH * 0.31, moleW * 0.09, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (Expressive: bonked = X, miss = teasing, up = alert)
    const eyeY = popY + moleH * 0.2;
    const eyeSpacing = moleW * 0.24;

    if (hole.state === 'bonked') {
      // Dizzy X eyes
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      [-1, 1].forEach(side => {
        const ex = cx + side * eyeSpacing;
        ctx.beginPath();
        ctx.moveTo(ex - 6, eyeY - 6); ctx.lineTo(ex + 6, eyeY + 6);
        ctx.moveTo(ex + 6, eyeY - 6); ctx.lineTo(ex - 6, eyeY + 6);
        ctx.stroke();
      });
    } else if (hole.state === 'miss') {
      // Teasing eyes & tongue
      ctx.fillStyle = '#fff';
      [-1, 1].forEach(side => {
        ctx.beginPath();
        ctx.arc(cx + side * eyeSpacing, eyeY, 6, 0, Math.PI, true);
        ctx.fill();
      });
      // Raspberry Tongue sticking out
      ctx.fillStyle = '#ff2b55';
      ctx.beginPath();
      ctx.ellipse(cx, popY + moleH * 0.46, 7, 11, 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Bright curious eyes
      [-1, 1].forEach(side => {
        const ex = cx + side * eyeSpacing;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex, eyeY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(ex, eyeY, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Player Hat / Name Badge on forehead
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Impact", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(hole.ownerName || 'BONK', cx, popY - 10);

    ctx.restore();
  }

  // Front Rim of Hole to cover mole bottom cleanly
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, holeRadiusX, holeRadiusY, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

// 3. Particles (Flying Stars)
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.life += dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += 450 * dt; // gravity
  const alpha = Math.max(0, 1 - p.life / p.maxLife);
  
  if (alpha <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = `hsl(${p.hue}, 100%, 65%)`;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.life * 8);
  // Draw 5-point star
  ctx.beginPath();
  const rOut = p.size;
  const rIn = rOut * 0.45;
  for (let s = 0; s < 10; s++) {
    const r = (s % 2 === 0) ? rOut : rIn;
    const a = (s * Math.PI) / 5;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 4. Floating Hit Texts
for (let i = room.state.floats.length - 1; i >= 0; i--) {
  const fl = room.state.floats[i];
  fl.life += dt;
  fl.y -= dt * 70;
  const alpha = Math.max(0, 1 - fl.life / fl.maxLife);
  if (alpha <= 0) {
    room.state.floats.splice(i, 1);
    continue;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${Math.round(28 * fl.scale)}px "Impact", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fl.hue ? `hsl(${fl.hue}, 100%, 65%)` : '#ffdd00';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.fillText(fl.text, fl.x, fl.y);
  ctx.restore();
}

// 5. Header HUD (Scoreboard & Instructions)
ctx.save();
ctx.textAlign = 'left';
ctx.textBaseline = 'top';
ctx.font = '900 36px "Impact", "Arial Black", sans-serif';
ctx.fillStyle = '#ffffff';
ctx.shadowColor = '#000';
ctx.shadowBlur = 10;
ctx.fillText('WHACK-A-MOLE PARTY!', W * 0.05, H * 0.045);

// Subtitle action guide
ctx.font = 'bold 18px sans-serif';
ctx.fillStyle = '#ffde59';
const actionHint = 'Press BONK when YOUR colour pops up!';
ctx.fillText(actionHint, W * 0.05, H * 0.095);

// Top Scores ticker / badges
if (showScores) {
  const badgeStartX = W * 0.52;
  const badgeY = H * 0.045;
  const displayPeople = people.slice(0, 6);
  
  displayPeople.forEach((p, idx) => {
    const bx = badgeStartX + idx * 110;
    if (bx + 95 < W) {
      const sc = room.state.scores[p.id] || 0;
      ctx.save();
      ctx.fillStyle = `hsl(${p.hue}, 80%, 45%)`;
      ctx.beginPath();
      ctx.roundRect(bx, badgeY, 95, 48, 10);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const name = p.table ? p.table.replace('table-', 'T') : `P${idx + 1}`;
      ctx.fillText(name, bx + 47, badgeY + 6);

      ctx.font = '900 20px "Impact", sans-serif';
      ctx.fillText(`${sc}`, bx + 47, badgeY + 22);
      ctx.restore();
    }
  });
}
ctx.restore();

// 6. Winner / Game Over Overlay
if (room.state.roundState === 'winner') {
  ctx.save();
  ctx.fillStyle = 'rgba(5, 5, 12, 0.85)';
  ctx.fillRect(0, 0, W, H);

  // Pulsing banner
  const pulse = 1 + Math.sin(now * 6) * 0.05;
  ctx.translate(W * 0.5, H * 0.5);
  ctx.scale(pulse, pulse);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 84px "Impact", sans-serif';
  ctx.fillStyle = `hsl(${room.state.winnerHue}, 100%, 65%)`;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 25;
  ctx.fillText('WINNER!', 0, -50);

  ctx.font = '900 56px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(room.state.winnerName, 0, 35);

  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#ffde59';
  ctx.fillText('NEXT ROUND STARTING SOON...', 0, 110);
  ctx.restore();
}

ctx.restore();