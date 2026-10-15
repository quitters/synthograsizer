const W = frame.width;
const H = frame.height;
const t = frame.t;

// --- Variable Lookups & Fallbacks ---
const speedMult = getVar('arrow_speed') ?? 1.8;
const floodGlow = getVar('floodlight_glow') ?? 0.7;
const celebration = getVar('celebration_fx') ?? true;

const atmStyles = {
  "Electric Night": { skyTop: '#050b18', skyBot: '#0d2238', grassTop: '#0a2d1d', grassBot: '#071f14', beam: 'rgba(100, 220, 255, ', t0: '#00f0ff', t1: '#ff2a6d', t0Name: 'CYAN SQUAD', t1Name: 'HOT CORAL' },
  "Neon Cyber": { skyTop: '#100028', skyBot: '#290048', grassTop: '#081e28', grassBot: '#020b12', beam: 'rgba(255, 0, 180, ', t0: '#00f5d4', t1: '#f72585', t0Name: 'NEON WAVE', t1Name: 'CYBER VIPERS' },
  "World Cup Final": { skyTop: '#081220', skyBot: '#152b45', grassTop: '#114a27', grassBot: '#0b321a', beam: 'rgba(255, 220, 120, ', t0: '#ffbe0b', t1: '#3a86ff', t0Name: 'GOLDEN WINGS', t1Name: 'AZURE STARS' },
  "Retro Arcade": { skyTop: '#000000', skyBot: '#121212', grassTop: '#003a12', grassBot: '#00220a', beam: 'rgba(57, 255, 20, ', t0: '#39ff14', t1: '#ff5400', t0Name: 'PIXEL LIONS', t1Name: 'RETRO KICKS' }
};
const atm = atmStyles[getVar('stadium_atmosphere')] ?? atmStyles["Electric Night"];
const crowdMode = getVar('crowd_cheer') ?? "Wild Flashbulbs";

// --- Audio Reactivity Multipliers ---
const bassKick = (audio.bass || 0) * 0.4 + (audio.beat ? 0.35 : 0.0);
const audioLevel = audio.level || 0;

// --- Persistent State Initialization ---
room.state.init ??= false;
if (!room.state.init) {
  room.state.init = true;
  room.state.phase = 'AIMING'; // 'AIMING' | 'KICKED' | 'RESULT' | 'MATCH_OVER'
  room.state.phaseTime = t;
  room.state.scores = [0, 0];
  room.state.turn = 0; // 0: Team 0 shoots, Team 1 keeps; 1: Team 1 shoots, Team 0 keeps
  room.state.round = 1;
  room.state.history = [[], []];
  room.state.aimX = 0;
  room.state.kickAimX = 0;
  room.state.keeperDive = 0; // -1: left, 0: center, 1: right
  room.state.resultType = '';
  room.state.resultText = '';
  room.state.netHitTime = 0;
  room.state.lastActionTime = t;
  room.state.shake = 0;
  room.state.particles = [];
  room.state.flashes = [];
  room.state.lastActivePlayer = null;
}

// Determine teams from connected people
const people = room.people || [];
const tables = [...new Set(people.map(p => p.table))].filter(Boolean);
const getPlayerTeam = (p, idx) => {
  if (tables.length > 1 && p && p.table) return tables.indexOf(p.table) % 2;
  return idx % 2;
};

// --- Interactive Trigger Events Handling ---
const doKick = (participantId) => {
  if (room.state.phase !== 'AIMING') return;
  room.state.phase = 'KICKED';
  room.state.phaseTime = t;
  room.state.kickAimX = room.state.aimX;
  room.state.lastActionTime = t;
  room.state.lastActivePlayer = participantId;
  room.state.shake = 5;
};

const evs = room.events || [];
for (let i = 0; i < evs.length; i++) {
  const e = evs[i];
  if (!e) continue;
  room.state.lastActionTime = t;
  if (e.name === 'shoot') {
    doKick(e.participantId);
  } else if (e.name === 'dive_left') {
    room.state.keeperDive = -1;
    room.state.lastActivePlayer = e.participantId;
  } else if (e.name === 'dive_right') {
    room.state.keeperDive = 1;
    room.state.lastActivePlayer = e.participantId;
  }
}

// --- Attract Mode / Auto-Play Timeout ---
// Keep game alive forever even if no one presses anything
const idleTime = t - room.state.lastActionTime;
if (room.state.phase === 'AIMING' && (t - room.state.phaseTime > 4.2)) {
  doKick('BOT');
}

// Aim arrow sweeping oscillation
if (room.state.phase === 'AIMING') {
  room.state.aimX = Math.sin(t * speedMult * 2.2) * 0.86;
}

// Coordinates for Goal & Pitch
const goalW = W * 0.46;
const goalH = H * 0.28;
const goalX = (W - goalW) * 0.5;
const goalY = H * 0.26;
const penaltySpotX = W * 0.5;
const penaltySpotY = H * 0.81;

// --- State Machine Update & Timers ---
const phaseAge = t - room.state.phaseTime;

// Handle KICKED phase
if (room.state.phase === 'KICKED') {
  // AI keeper reflex if no player pressed a dive direction
  if (room.state.keeperDive === 0 && phaseAge > 0.22) {
    const r = Math.random();
    if (r < 0.48) {
      room.state.keeperDive = room.state.kickAimX < -0.15 ? -1 : (room.state.kickAimX > 0.15 ? 1 : 0);
    } else if (r < 0.80) {
      room.state.keeperDive = room.state.kickAimX < -0.15 ? 1 : -1;
    } else {
      room.state.keeperDive = 0;
    }
  }

  // Flight completed (0.75 seconds)
  if (phaseAge >= 0.75) {
    room.state.phase = 'RESULT';
    room.state.phaseTime = t;
    const aim = room.state.kickAimX;
    const absAim = Math.abs(aim);
    let outcome = 'GOAL';
    let msg = 'GOOOAAALLL!';

    if (absAim > 0.80) {
      outcome = 'POST';
      msg = 'OFF THE POST!';
      room.state.shake = 14;
    } else {
      const ballSide = aim < -0.18 ? -1 : (aim > 0.18 ? 1 : 0);
      if (room.state.keeperDive === ballSide) {
        outcome = 'SAVED';
        msg = 'WHAT A SAVE!';
        room.state.shake = 9;
      } else {
        outcome = 'GOAL';
        msg = 'GOOOAAALLL!';
        room.state.shake = 22;
        room.state.netHitTime = t;
        if (celebration) {
          const col = room.state.turn === 0 ? atm.t0 : atm.t1;
          for (let k = 0; k < 70; k++) {
            room.state.particles.push({
              x: W * 0.5 + aim * (goalW * 0.44) + (Math.random() - 0.5) * 60,
              y: goalY + goalH * 0.4 + (Math.random() - 0.5) * 40,
              vx: (Math.random() - 0.5) * 360,
              vy: -140 - Math.random() * 260,
              color: Math.random() > 0.35 ? col : '#ffffff',
              size: 5 + Math.random() * 8,
              rot: Math.random() * 6.28,
              vrot: (Math.random() - 0.5) * 10,
              life: 2.2
            });
          }
        }
      }
    }
    room.state.resultType = outcome;
    room.state.resultText = msg;
    if (outcome === 'GOAL') {
      room.state.scores[room.state.turn]++;
      room.state.history[room.state.turn].push(true);
    } else {
      room.state.history[room.state.turn].push(false);
    }
  }
}

// Handle RESULT phase
if (room.state.phase === 'RESULT') {
  if (phaseAge >= 2.4) {
    if (room.state.turn === 0) {
      room.state.turn = 1;
      room.state.keeperDive = 0;
      room.state.phase = 'AIMING';
      room.state.phaseTime = t;
    } else {
      room.state.turn = 0;
      room.state.keeperDive = 0;
      room.state.round++;
      const s0 = room.state.scores[0];
      const s1 = room.state.scores[1];
      const k0 = room.state.history[0].length;
      const k1 = room.state.history[1].length;
      const rem0 = Math.max(0, 5 - k0);
      const rem1 = Math.max(0, 5 - k1);

      let matchFinished = false;
      if (k0 >= 5 && k1 >= 5) {
        if (s0 !== s1) matchFinished = true;
      } else {
        if (s0 > s1 + rem1 || s1 > s0 + rem0) matchFinished = true;
      }

      if (matchFinished) {
        room.state.phase = 'MATCH_OVER';
        room.state.phaseTime = t;
        room.state.winner = s0 > s1 ? 0 : 1;
      } else {
        room.state.phase = 'AIMING';
        room.state.phaseTime = t;
      }
    }
  }
}

// Handle MATCH_OVER phase
if (room.state.phase === 'MATCH_OVER') {
  if (phaseAge >= 4.8) {
    room.state.scores = [0, 0];
    room.state.round = 1;
    room.state.turn = 0;
    room.state.history = [[], []];
    room.state.phase = 'AIMING';
    room.state.phaseTime = t;
    room.state.keeperDive = 0;
  }
}

// --- RENDER PIPELINE ---
ctx.save();

// Camera Screen Shake
if (room.state.shake > 0.3) {
  ctx.translate((Math.random() - 0.5) * room.state.shake, (Math.random() - 0.5) * room.state.shake);
  room.state.shake *= 0.90;
}

// 1. Stadium Sky & Bleachers Background
const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.42);
skyGrad.addColorStop(0, atm.skyTop);
skyGrad.addColorStop(1, atm.skyBot);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H * 0.42);

// Crowd tiers (packed stadium rows)
const standsTop = H * 0.08;
const standsBottom = H * 0.34;
for (let row = 0; row < 6; row++) {
  const rowY = standsTop + (standsBottom - standsTop) * (row / 5);
  ctx.fillStyle = (row % 2 === 0) ? 'rgba(15, 25, 40, 0.75)' : 'rgba(25, 38, 58, 0.75)';
  ctx.fillRect(0, rowY, W, (standsBottom - standsTop) / 5);

  // Crowd silhouette heads
  const step = 14;
  for (let cx = (row * 7) % step; cx < W; cx += step) {
    const bob = Math.sin(t * 3 + cx * 0.05) * 1.5;
    ctx.fillStyle = 'rgba(8, 14, 24, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, rowY + 6 + bob, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Camera Flashbulbs in crowd
if (Math.random() < 0.25 || audio.beat || room.state.phase === 'RESULT') {
  const count = room.state.phase === 'RESULT' ? 3 : (audio.beat ? 2 : 1);
  for (let f = 0; f < count; f++) {
    room.state.flashes.push({
      x: Math.random() * W,
      y: standsTop + Math.random() * (standsBottom - standsTop),
      life: 0.16,
      maxLife: 0.16,
      size: 4 + Math.random() * 8
    });
  }
}
for (let i = room.state.flashes.length - 1; i >= 0; i--) {
  const fl = room.state.flashes[i];
  fl.life -= frame.dt;
  if (fl.life <= 0) {
    room.state.flashes.splice(i, 1);
    continue;
  }
  const flAlpha = fl.life / fl.maxLife;
  ctx.fillStyle = `rgba(255, 255, 255, ${flAlpha})`;
  ctx.beginPath();
  ctx.arc(fl.x, fl.y, fl.size * (1 + (1 - flAlpha)), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(fl.x - fl.size * 2, fl.y - 1, fl.size * 4, 2);
  ctx.fillRect(fl.x - 1, fl.y - fl.size * 2, 2, fl.size * 4);
}
if (room.state.flashes.length > 50) {
  room.state.flashes.splice(0, room.state.flashes.length - 50);
}

// 2. Volumetric Floodlights & Gantry Towers
const drawFloodlightTower = (tx, dir) => {
  // Tower frame
  ctx.strokeStyle = '#2b3a4a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tx, 0);
  ctx.lineTo(tx + dir * 30, H * 0.28);
  ctx.moveTo(tx + dir * 60, 0);
  ctx.lineTo(tx + dir * 30, H * 0.28);
  ctx.stroke();

  // Lamp bank
  ctx.fillStyle = '#1c2631';
  ctx.fillRect(tx - 10, H * 0.03, 80, 36);
  for (let lx = 0; lx < 4; lx++) {
    for (let ly = 0; ly < 2; ly++) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(tx + lx * 20, H * 0.03 + 9 + ly * 18, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Light cone
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const beamAlpha = (0.07 + bassKick * 0.08) * floodGlow;
  const beamGrad = ctx.createRadialGradient(tx + 30, H * 0.05, 10, W * 0.5, H * 0.65, W * 0.55);
  beamGrad.addColorStop(0, atm.beam + (beamAlpha * 2.5) + ')');
  beamGrad.addColorStop(1, atm.beam + '0.0)');
  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(tx - 20, H * 0.05);
  ctx.lineTo(W * 0.5 + (dir > 0 ? -1 : 1) * (W * 0.4), H);
  ctx.lineTo(W * 0.5 + (dir > 0 ? 1 : -1) * (W * 0.2), H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};
drawFloodlightTower(W * 0.08, 1);
drawFloodlightTower(W * 0.86, -1);

// 3. Perspective Turf Pitch
const pitchGrad = ctx.createLinearGradient(0, standsBottom, 0, H);
pitchGrad.addColorStop(0, atm.grassTop);
pitchGrad.addColorStop(1, atm.grassBot);
ctx.fillStyle = pitchGrad;
ctx.fillRect(0, standsBottom, W, H - standsBottom);

// Lawn mown perspective stripes
const stripeCount = 9;
for (let s = 0; s < stripeCount; s++) {
  if (s % 2 === 0) {
    const y1 = standsBottom + (H - standsBottom) * (s / stripeCount);
    const y2 = standsBottom + (H - standsBottom) * ((s + 1) / stripeCount);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(0, y1, W, y2 - y1);
  }
}

// Penalty Box Chalk Lines in perspective
ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
ctx.lineWidth = 3;
ctx.beginPath();
// Goal line
ctx.moveTo(W * 0.12, goalY + goalH);
ctx.lineTo(W * 0.88, goalY + goalH);
// Penalty area box
ctx.moveTo(W * 0.18, goalY + goalH);
ctx.lineTo(W * 0.10, H * 0.94);
ctx.lineTo(W * 0.90, H * 0.94);
ctx.lineTo(W * 0.82, goalY + goalH);
// 6-yard box
ctx.moveTo(goalX - 25, goalY + goalH);
ctx.lineTo(goalX - 45, goalY + goalH + 48);
ctx.lineTo(goalX + goalW + 45, goalY + goalH + 48);
ctx.lineTo(goalX + goalW + 25, goalY + goalH);
ctx.stroke();

// Penalty Spot
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(penaltySpotX, penaltySpotY, 6, 0, Math.PI * 2);
ctx.fill();

// 4. The Goal Frame & 3D Net
// Back frame of net
const bW = goalW * 0.90;
const bH = goalH * 0.88;
const bX = (W - bW) * 0.5;
const bY = goalY - goalH * 0.14;

// Net Mesh with Ripple Distortion
const netWave = (t - room.state.netHitTime < 1.6) ? Math.sin((t - room.state.netHitTime) * 16) * Math.exp(-(t - room.state.netHitTime) * 2.5) * 16 : 0;
ctx.strokeStyle = 'rgba(230, 240, 255, 0.35)';
ctx.lineWidth = 1.2;
ctx.beginPath();
// Vertical net cords
const netCols = 18;
for (let c = 0; c <= netCols; c++) {
  const frac = c / netCols;
  const fx = goalX + frac * goalW;
  const bx = bX + frac * bW;
  const rip = Math.sin(frac * Math.PI) * netWave;
  ctx.moveTo(fx, goalY);
  ctx.lineTo(bx + rip * 0.4, bY + rip * 0.3);
  ctx.lineTo(bx + rip * 0.8, bY + bH + rip);
  ctx.lineTo(fx, goalY + goalH);
}
// Horizontal net cords
const netRows = 9;
for (let r = 0; r <= netRows; r++) {
  const frac = r / netRows;
  const fy = goalY + frac * goalH;
  const by = bY + frac * bH + netWave * Math.sin(frac * Math.PI);
  ctx.moveTo(bX, by);
  ctx.lineTo(bX + bW, by);
  ctx.moveTo(goalX, fy);
  ctx.lineTo(bX, by);
  ctx.moveTo(goalX + goalW, fy);
  ctx.lineTo(bX + bW, by);
}
ctx.stroke();

// Rigid White Goal Posts (foreground)
ctx.lineWidth = 8;
ctx.strokeStyle = '#f5f8fa';
ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
ctx.shadowBlur = 8;
ctx.beginPath();
ctx.moveTo(goalX, goalY + goalH);
ctx.lineTo(goalX, goalY);
ctx.lineTo(goalX + goalW, goalY);
ctx.lineTo(goalX + goalW, goalY + goalH);
ctx.stroke();
ctx.shadowBlur = 0;

// 5. The Goalkeeper
const keeperBaseY = goalY + goalH - 4;
let keeperX = W * 0.5;
let keeperY = keeperBaseY;
let keeperAngle = 0;

if (room.state.phase === 'KICKED') {
  const diveFrac = Math.min(1, Math.max(0, (phaseAge - 0.18) / 0.52));
  const smoothDive = Math.sin(diveFrac * Math.PI * 0.5);
  keeperX = W * 0.5 + room.state.keeperDive * (goalW * 0.42) * smoothDive;
  keeperY = keeperBaseY - Math.sin(diveFrac * Math.PI) * (goalH * 0.38);
  keeperAngle = room.state.keeperDive * smoothDive * 1.15;
} else if (room.state.phase === 'RESULT' && room.state.resultType === 'SAVED') {
  keeperX = W * 0.5 + room.state.keeperDive * (goalW * 0.42);
  keeperY = keeperBaseY - 10;
  keeperAngle = room.state.keeperDive * 0.9;
} else {
  // Idle bounce in center
  keeperY += Math.sin(t * 8) * 3 + bassKick * 4;
}

ctx.save();
ctx.translate(keeperX, keeperY);
ctx.rotate(keeperAngle);

// Goalkeeper Body & Kit
const defendingTeam = room.state.turn === 0 ? 1 : 0;
const keeperColor = defendingTeam === 0 ? atm.t0 : atm.t1;

// Shadow under keeper
ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
ctx.beginPath();
ctx.ellipse(0, keeperBaseY - keeperY + 6, 20, 6, 0, 0, Math.PI * 2);
ctx.fill();

// Legs / shorts
ctx.fillStyle = '#11151a';
ctx.fillRect(-12, -18, 9, 20);
ctx.fillRect(3, -18, 9, 20);
// Boots
ctx.fillStyle = '#ffffff';
ctx.fillRect(-13, 2, 11, 6);
ctx.fillRect(2, 2, 11, 6);

// Torso / Jersey
ctx.fillStyle = keeperColor;
ctx.beginPath();
ctx.roundRect(-16, -42, 32, 26, 4);
ctx.fill();
// Number 1 on back
ctx.fillStyle = '#ffffff';
ctx.font = '900 12px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('1', 0, -25);

// Head
ctx.fillStyle = '#ffcf99';
ctx.beginPath();
ctx.arc(0, -52, 9, 0, Math.PI * 2);
ctx.fill();

// Goalie Gloves & Outstretched Arms
ctx.fillStyle = '#ffee00';
if (room.state.phase === 'KICKED' || (room.state.phase === 'RESULT' && room.state.resultType === 'SAVED')) {
  // Leaping arms outstretched
  ctx.fillRect(-28, -48, 12, 10);
  ctx.fillRect(16, -48, 12, 10);
} else {
  // Ready pose with gloves forward
  ctx.fillRect(-22, -34, 10, 10);
  ctx.fillRect(12, -34, 10, 10);
}
ctx.restore();

// 6. The Football & Aim Trajectory
let ballX = penaltySpotX;
let ballY = penaltySpotY;
let ballScale = 1.0;
let ballRot = 0;

if (room.state.phase === 'AIMING') {
  // Aim Arrow sweeping across goal mouth
  const targetX = W * 0.5 + room.state.aimX * (goalW * 0.45);
  const targetY = goalY + goalH * 0.55;

  // Sweeping dashed guide line
  ctx.strokeStyle = (room.state.turn === 0 ? atm.t0 : atm.t1);
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(penaltySpotX, penaltySpotY);
  ctx.lineTo(targetX, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Pulsing Aim Reticle Crosshair
  const reticlePulse = 18 + Math.sin(t * 12) * 4 + audioLevel * 8;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(targetX, targetY, reticlePulse, 0, Math.PI * 2);
  ctx.stroke();
  // Cross lines
  ctx.beginPath();
  ctx.moveTo(targetX - reticlePulse - 5, targetY);
  ctx.lineTo(targetX + reticlePulse + 5, targetY);
  ctx.moveTo(targetX, targetY - reticlePulse - 5);
  ctx.lineTo(targetX, targetY + reticlePulse + 5);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = (room.state.turn === 0 ? atm.t0 : atm.t1);
  ctx.beginPath();
  ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
  ctx.fill();
} else if (room.state.phase === 'KICKED') {
  const p = Math.min(1.0, phaseAge / 0.75);
  const startX = penaltySpotX;
  const startY = penaltySpotY;
  const targetAimX = W * 0.5 + room.state.kickAimX * (goalW * 0.45);
  const targetAimY = goalY + goalH * 0.52;

  ballX = startX + (targetAimX - startX) * p;
  const groundY = startY + (targetAimY - startY) * p;
  const arcHeight = Math.sin(p * Math.PI) * (H * 0.16);
  ballY = groundY - arcHeight;
  ballScale = 1.0 - p * 0.52; // shrinks in distance
  ballRot = p * 16;

  // Ball ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(ballX, groundY, 14 * ballScale, 5 * ballScale, 0, 0, Math.PI * 2);
  ctx.fill();
} else if (room.state.phase === 'RESULT' || room.state.phase === 'MATCH_OVER') {
  const targetAimX = W * 0.5 + room.state.kickAimX * (goalW * 0.45);
  ballX = targetAimX;
  ballY = goalY + goalH * 0.52;
  ballScale = 0.48;
}

// Draw the Ball (3D soccer ball style)
ctx.save();
ctx.translate(ballX, ballY);
ctx.rotate(ballRot);
ctx.scale(ballScale, ballScale);
// Base sphere
const ballGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 14);
ballGrad.addColorStop(0, '#ffffff');
ballGrad.addColorStop(0.8, '#e6ecf2');
ballGrad.addColorStop(1, '#9aa5b1');
ctx.fillStyle = ballGrad;
ctx.beginPath();
ctx.arc(0, 0, 13, 0, Math.PI * 2);
ctx.fill();
// Pentagon patches
ctx.fillStyle = '#1c2430';
for (let a = 0; a < 5; a++) {
  const ang = (a / 5) * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(Math.cos(ang) * 7, Math.sin(ang) * 7, 3.2, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// 7. Confetti / Spark Particles Update & Render
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const pt = room.state.particles[i];
  pt.life -= frame.dt;
  if (pt.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  pt.x += pt.vx * frame.dt;
  pt.y += pt.vy * frame.dt;
  pt.vy += 380 * frame.dt; // gravity
  pt.rot += pt.vrot * frame.dt;

  ctx.save();
  ctx.translate(pt.x, pt.y);
  ctx.rotate(pt.rot);
  ctx.fillStyle = pt.color;
  ctx.fillRect(-pt.size * 0.5, -pt.size * 0.3, pt.size, pt.size * 0.6);
  ctx.restore();
}
if (room.state.particles.length > 140) {
  room.state.particles.splice(0, room.state.particles.length - 140);
}

// 8. Sideline Team Dugouts / Connected Players Display
const drawBench = (teamIndex, bx, by, align) => {
  const teamColor = teamIndex === 0 ? atm.t0 : atm.t1;
  const teamName = teamIndex === 0 ? atm.t0Name : atm.t1;
  const teamPlayers = people.filter((p, idx) => getPlayerTeam(p, idx) === teamIndex);

  // Dugout shelter badge
  ctx.fillStyle = 'rgba(10, 18, 28, 0.85)';
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 2;
  const boxW = Math.max(160, teamPlayers.length * 28 + 30);
  const startX = align === 'left' ? bx : bx - boxW;
  ctx.beginPath();
  ctx.roundRect(startX, by - 36, boxW, 52, 8);
  ctx.fill();
  ctx.stroke();

  // Team label
  ctx.fillStyle = teamColor;
  ctx.font = '900 13px system-ui, sans-serif';
  ctx.textAlign = align === 'left' ? 'left' : 'right';
  ctx.fillText(teamName + ` (${teamPlayers.length})`, align === 'left' ? startX + 10 : startX + boxW - 10, by - 18);

  // Draw player heads
  const count = Math.min(teamPlayers.length, 12);
  for (let pi = 0; pi < count; pi++) {
    const pl = teamPlayers[pi];
    const px = align === 'left' ? startX + 18 + pi * 24 : startX + boxW - 18 - pi * 24;
    const py = by + 2;
    // Player avatar dot in their exact hue
    ctx.fillStyle = pl ? `hsl(${pl.hue}, 95%, 55%)` : teamColor;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();

    // Cheer jump if this player fired the latest action
    if (pl && pl.id === room.state.lastActivePlayer) {
      ctx.fillStyle = '#ffea00';
      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡', px, py - 9);
    }
  }
  if (teamPlayers.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = 'italic 11px system-ui, sans-serif';
    ctx.textAlign = align === 'left' ? 'left' : 'right';
    ctx.fillText('Auto Bot Squad', align === 'left' ? startX + 12 : startX + boxW - 12, by + 4);
  }
};
drawBench(0, 24, H * 0.88, 'left');
drawBench(1, W - 24, H * 0.88, 'right');

// 9. Stadium Main Scoreboard (Top Bar)
const sbW = Math.min(W * 0.72, 820);
const sbH = 88;
const sbX = (W - sbW) * 0.5;
const sbY = 16;

// Scoreboard panel
ctx.fillStyle = 'rgba(6, 12, 20, 0.92)';
ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.roundRect(sbX, sbY, sbW, sbH, 12);
ctx.fill();
ctx.stroke();

// Scoreboard Header: Round / Penalty Indicator
ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
ctx.font = '700 11px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.fillText(`PENALTY SHOOTOUT  •  ROUND ${room.state.round}`, W * 0.5, sbY + 18);

// Scores
ctx.font = '900 42px system-ui, sans-serif';
ctx.fillStyle = '#ffffff';
const scoreScale = 1 + bassKick * 0.15;
ctx.save();
ctx.translate(W * 0.5, sbY + 54);
ctx.scale(scoreScale, scoreScale);
ctx.fillText(`${room.state.scores[0]}  -  ${room.state.scores[1]}`, 0, 0);
ctx.restore();

// Team Names on Board
ctx.font = '900 18px system-ui, sans-serif';
ctx.fillStyle = atm.t0;
ctx.textAlign = 'left';
ctx.fillText(atm.t0Name, sbX + 22, sbY + 44);

ctx.fillStyle = atm.t1;
ctx.textAlign = 'right';
ctx.fillText(atm.t1Name, sbX + sbW - 22, sbY + 44);

// Penalty Dot History Trackers
const drawHistoryDots = (teamIdx, startX, dir) => {
  const hist = room.state.history[teamIdx] || [];
  for (let k = 0; k < 5; k++) {
    const dotX = startX + dir * (k * 18);
    const dotY = sbY + 68;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 5.5, 0, Math.PI * 2);
    if (k < hist.length) {
      if (hist[k]) {
        ctx.fillStyle = '#00ff66'; // Scored goal
        ctx.fill();
      } else {
        ctx.fillStyle = '#ff2233'; // Missed / Saved
        ctx.fill();
      }
    } else if (k === hist.length && room.state.turn === teamIdx) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fill();
      ctx.strokeStyle = teamIdx === 0 ? atm.t0 : atm.t1;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fill();
    }
  }
};
drawHistoryDots(0, sbX + 22, 1);
drawHistoryDots(1, sbX + sbW - 22, -1);

// 10. Role & Action Status Banner
const shootingTeam = room.state.turn;
const shootColor = shootingTeam === 0 ? atm.t0 : atm.t1;
const shootName = shootingTeam === 0 ? atm.t0Name : atm.t1;
const keepColor = shootingTeam === 0 ? atm.t1 : atm.t0;
const keepName = shootingTeam === 0 ? atm.t1Name : atm.t0;

if (room.state.phase === 'AIMING') {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.roundRect(W * 0.5 - 280, sbY + sbH + 10, 560, 36, 18);
  ctx.fill();

  ctx.font = '800 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = shootColor;
  ctx.fillText(`${shootName}: PRESS 'SHOOT'  |  ${keepName}: DIVE ◄ / ►`, W * 0.5, sbY + sbH + 34);
} else if (room.state.phase === 'KICKED') {
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('INCOMING SHOT!', W * 0.5, sbY + sbH + 34);
}

// 11. Large Dramatic Outcome Text (GOAL / SAVED / WINNER)
if (room.state.phase === 'RESULT') {
  const isGoal = room.state.resultType === 'GOAL';
  const popScale = 1 + Math.sin(phaseAge * 8) * 0.12 + bassKick * 0.2;
  ctx.save();
  ctx.translate(W * 0.5, H * 0.44);
  ctx.scale(popScale, popScale);

  ctx.font = '900 78px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(room.state.resultText, 0, 0);

  ctx.fillStyle = isGoal ? '#ffe600' : (room.state.resultType === 'SAVED' ? '#00f0ff' : '#ff4444');
  ctx.fillText(room.state.resultText, 0, 0);
  ctx.restore();
} else if (room.state.phase === 'MATCH_OVER') {
  const winTeam = room.state.winner;
  const winCol = winTeam === 0 ? atm.t0 : atm.t1;
  const winName = winTeam === 0 ? atm.t0Name : atm.t1;

  // Dim overlay backdrop
  ctx.fillStyle = 'rgba(3, 8, 16, 0.88)';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W * 0.5, H * 0.45);
  const winScale = 1.0 + Math.sin(t * 5) * 0.05 + bassKick * 0.15;
  ctx.scale(winScale, winScale);

  // Trophy emblem
  ctx.fillStyle = '#ffc300';
  ctx.font = '64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏆', 0, -80);

  // Champions text
  ctx.font = '900 68px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#000000';
  ctx.strokeText('CHAMPIONS!', 0, -10);
  ctx.fillText('CHAMPIONS!', 0, -10);

  ctx.font = '900 48px system-ui, sans-serif';
  ctx.fillStyle = winCol;
  ctx.strokeText(`${winName} WINS!`, 0, 50);
  ctx.fillText(`${winName} WINS!`, 0, 50);

  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText(`FINAL SCORE: ${room.state.scores[0]} - ${room.state.scores[1]}  •  NEXT MATCH STARTING...`, 0, 100);
  ctx.restore();
}

ctx.restore();