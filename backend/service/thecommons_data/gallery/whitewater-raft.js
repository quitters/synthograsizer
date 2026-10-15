ctx.save();
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

// --- Configuration & Controls ---
const speedMult = (getVar('river_speed') ?? 3) * 0.4 + 0.6;
const themeName = getVar('rapids_theme') ?? 'Neon Canyon';
const diffName = getVar('difficulty') ?? 'White Water';
const showSpray = getVar('spray_fx') ?? true;

const themes = {
  'Neon Canyon': { bg: '#060b18', water: '#0f274a', foam: '#38bdf8', bank: '#1e1b4b', rock: '#e11d48', accent: '#00f5ff' },
  'Emerald Gorge': { bg: '#03140d', water: '#0a3824', foam: '#34d399', bank: '#062615', rock: '#f59e0b', accent: '#10b981' },
  'Molten Chasm': { bg: '#160505', water: '#3d0a0a', foam: '#f97316', bank: '#2a0909', rock: '#fbbf24', accent: '#ef4444' }
};
const th = themes[themeName] || themes['Neon Canyon'];
const diffRockFreq = { 'Joyride': 0.015, 'White Water': 0.03, 'Death Flume': 0.055 }[diffName] || 0.03;

// --- State Initialization ---
const S = room.state;
S.gameMode ??= 'running'; // 'running', 'crash', 'gameover'
S.modeTimer ??= 0;
S.distance ??= 0;
S.bestDistance ??= 0;
S.raftX ??= W * 0.5;
S.raftVx ??= 0;
S.raftAngle ??= 0;
S.raftVAngle ??= 0;
S.obstacles ??= [];
S.particles ??= [];
S.strokes ??= [];
S.lastActionT ??= frame.t;
S.spinOut ??= 0;

// --- Handle Events (Paddle Inputs) ---
let leftPressed = 0;
let rightPressed = 0;
let strokeHueLeft = 190;
let strokeHueRight = 45;

if (room.events && room.events.length > 0) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    const person = room.people ? room.people.find(p => p.id === ev.participantId) : null;
    const hue = person ? person.hue : (ev.name === 'paddle_left' ? 200 : 30);
    if (ev.name === 'paddle_left') {
      leftPressed++;
      strokeHueLeft = hue;
      S.strokes.push({ side: -1, hue: hue, t: frame.t });
      S.lastActionT = frame.t;
    } else if (ev.name === 'paddle_right') {
      rightPressed++;
      strokeHueRight = hue;
      S.strokes.push({ side: 1, hue: hue, t: frame.t });
      S.lastActionT = frame.t;
    }
  }
}

// Attract mode if inactive for 3.5s
const isAttract = (frame.t - S.lastActionT) > 3.5;
if (isAttract && S.gameMode === 'running') {
  // Auto-steer towards safe gap between rocks
  let targetOffset = 0;
  let nearestY = 9999;
  for (let i = 0; i < S.obstacles.length; i++) {
    const ob = S.obstacles[i];
    if (ob.y > H * 0.25 && ob.y < nearestY) {
      nearestY = ob.y;
      targetOffset = (ob.x > S.raftX) ? -1 : 1;
    }
  }
  if (Math.sin(frame.t * 3.5) + targetOffset * 0.8 > 0.4) {
    rightPressed += 0.8;
    strokeHueRight = (frame.t * 50) % 360;
  } else if (Math.sin(frame.t * 3.5) + targetOffset * 0.8 < -0.4) {
    leftPressed += 0.8;
    strokeHueLeft = (frame.t * 50 + 180) % 360;
  }
}

// Keep stroke queue bounded
if (S.strokes.length > 25) S.strokes.splice(0, S.strokes.length - 25);

// --- State Machine Updates ---
S.modeTimer += dt;
const currentSpeed = (S.gameMode === 'running') ? (420 * speedMult * (1 + audio.level * 0.4)) : 80;

if (S.gameMode === 'running') {
  S.distance += currentSpeed * dt * 0.1;
  if (S.distance > S.bestDistance) S.bestDistance = S.distance;

  // Steering physics: paddling left steers right and tilts raft clockwise, and vice-versa
  const paddleForce = (leftPressed - rightPressed) * 220;
  S.raftVx += paddleForce * dt;
  S.raftVx += Math.sin(frame.t * 1.5) * 40 * dt; // gentle river surge
  S.raftVx *= Math.pow(0.88, dt * 60);
  S.raftX += S.raftVx * dt;

  // Rotation and spin balance
  const targetAngle = (S.raftVx / 350) + (leftPressed - rightPressed) * 0.25;
  S.raftAngle += (targetAngle - S.raftAngle) * Math.min(1, 10 * dt);
  if (S.spinOut > 0) {
    S.raftAngle += S.spinOut * dt * 8;
    S.spinOut *= 0.94;
  }

  // River bounds check
  const bankMargin = W * 0.16;
  if (S.raftX < bankMargin) {
    S.raftX = bankMargin;
    S.raftVx = Math.abs(S.raftVx) * 0.6 + 60;
    S.spinOut = 3;
  } else if (S.raftX > W - bankMargin) {
    S.raftX = W - bankMargin;
    S.raftVx = -Math.abs(S.raftVx) * 0.6 - 60;
    S.spinOut = -3;
  }

  // Spawn obstacles
  if (Math.random() < diffRockFreq * (1 + audio.bass * 0.6)) {
    if (S.obstacles.length < 30) {
      const laneW = W - bankMargin * 2 - 120;
      const rx = bankMargin + 60 + Math.random() * laneW;
      const rRad = 28 + Math.random() * 32;
      const isChute = Math.random() < 0.25;
      S.obstacles.push({
        x: rx,
        y: -70,
        radius: isChute ? 22 : rRad,
        type: isChute ? 'chute' : 'rock',
        hit: false
      });
    }
  }
} else if (S.gameMode === 'crash') {
  S.raftAngle += 4.5 * dt;
  if (S.modeTimer > 2.8) {
    S.gameMode = 'running';
    S.modeTimer = 0;
    S.distance = 0;
    S.raftX = W * 0.5;
    S.raftVx = 0;
    S.raftAngle = 0;
    S.obstacles.length = 0;
  }
}

// Update Obstacles & Collision
const raftRad = 48;
for (let i = S.obstacles.length - 1; i >= 0; i--) {
  const ob = S.obstacles[i];
  ob.y += currentSpeed * dt;

  if (S.gameMode === 'running' && !ob.hit) {
    const dx = S.raftX - ob.x;
    const dy = (H * 0.72) - ob.y;
    const dist = Math.hypot(dx, dy);
    if (dist < raftRad + ob.radius) {
      ob.hit = true;
      if (ob.type === 'rock') {
        // CRASH!
        S.gameMode = 'crash';
        S.modeTimer = 0;
        S.spinOut = (Math.random() > 0.5 ? 1 : -1) * 7;
        // Burst particles
        for (let p = 0; p < 45; p++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 90 + Math.random() * 260;
          S.particles.push({
            x: S.raftX,
            y: H * 0.72,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            life: 1,
            color: '#ff2255',
            size: 6 + Math.random() * 8
          });
        }
      } else if (ob.type === 'chute') {
        // Bonus speed chute
        S.distance += 75;
        for (let p = 0; p < 25; p++) {
          S.particles.push({
            x: S.raftX + (Math.random() - 0.5) * 40,
            y: H * 0.72,
            vx: (Math.random() - 0.5) * 140,
            vy: -80 - Math.random() * 160,
            life: 0.8,
            color: '#38bdf8',
            size: 5 + Math.random() * 6
          });
        }
      }
    }
  }
  if (ob.y > H + 100) S.obstacles.splice(i, 1);
}

// Paddle Spray Particles
if (showSpray) {
  if (leftPressed > 0) {
    for (let k = 0; k < 6; k++) {
      S.particles.push({
        x: S.raftX - 44,
        y: H * 0.72 + (Math.random() - 0.5) * 30,
        vx: -120 - Math.random() * 180,
        vy: (Math.random() - 0.5) * 90,
        life: 0.6,
        color: `hsl(${strokeHueLeft}, 90%, 65%)`,
        size: 4 + Math.random() * 6
      });
    }
  }
  if (rightPressed > 0) {
    for (let k = 0; k < 6; k++) {
      S.particles.push({
        x: S.raftX + 44,
        y: H * 0.72 + (Math.random() - 0.5) * 30,
        vx: 120 + Math.random() * 180,
        vy: (Math.random() - 0.5) * 90,
        life: 0.6,
        color: `hsl(${strokeHueRight}, 90%, 65%)`,
        size: 4 + Math.random() * 6
      });
    }
  }
}

// Continuous raft foam
if (Math.random() < 0.65 && S.gameMode === 'running') {
  S.particles.push({
    x: S.raftX + (Math.random() - 0.5) * 34,
    y: H * 0.72 + 50,
    vx: (Math.random() - 0.5) * 40,
    vy: currentSpeed * 0.4,
    life: 0.45,
    color: th.foam,
    size: 4 + Math.random() * 5
  });
}

// Particle updates
for (let i = S.particles.length - 1; i >= 0; i--) {
  const p = S.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt * 1.8;
  if (p.life <= 0) S.particles.splice(i, 1);
}
if (S.particles.length > 150) S.particles.splice(0, S.particles.length - 150);

// --- DRAWING ---

// 1. Dark Base Background & River Banks
ctx.fillStyle = th.bg;
ctx.fillRect(0, 0, W, H);

const bankMargin = W * 0.16;

// River water polygon
ctx.fillStyle = th.water;
ctx.beginPath();
ctx.rect(bankMargin, 0, W - bankMargin * 2, H);
ctx.fill();

// Animated River Flow Lines
ctx.strokeStyle = th.foam;
ctx.lineWidth = 2.5;
ctx.globalAlpha = 0.35 + audio.mid * 0.3;
const flowOffset = (frame.t * currentSpeed * 0.8) % 120;
for (let y = -120 + flowOffset; y < H + 120; y += 70) {
  ctx.beginPath();
  const curve = Math.sin((y + frame.t * 80) * 0.012) * 28;
  ctx.moveTo(bankMargin + 25 + curve, y);
  ctx.bezierCurveTo(
    W * 0.35 + curve,
    y + 30,
    W * 0.65 - curve,
    y - 20,
    W - bankMargin - 25 + curve,
    y
  );
  ctx.stroke();
}
ctx.globalAlpha = 1.0;

// Jagged River Bank Borders
ctx.fillStyle = th.bank;
ctx.beginPath();
ctx.rect(0, 0, bankMargin, H);
ctx.rect(W - bankMargin, 0, bankMargin, H);
ctx.fill();

// Bank glow accents
ctx.strokeStyle = th.accent;
ctx.lineWidth = 4;
ctx.beginPath();
ctx.moveTo(bankMargin, 0);
ctx.lineTo(bankMargin, H);
ctx.moveTo(W - bankMargin, 0);
ctx.lineTo(W - bankMargin, H);
ctx.stroke();

// 2. Obstacles (Rocks & Chutes)
for (let i = 0; i < S.obstacles.length; i++) {
  const ob = S.obstacles[i];
  if (ob.type === 'rock') {
    // Jagged neon boulder
    ctx.fillStyle = th.rock;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const sides = 7;
    for (let s = 0; s < sides; s++) {
      const radAng = (s / sides) * Math.PI * 2;
      const rVal = ob.radius * (0.8 + 0.3 * Math.sin(s * 2.8 + ob.x));
      const px = ob.x + Math.cos(radAng) * rVal;
      const py = ob.y + Math.sin(radAng) * rVal;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rock foam wake
    ctx.fillStyle = th.foam;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(ob.x, ob.y + ob.radius * 0.7, ob.radius * 0.9, 0, Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  } else {
    // Chute (boost gate)
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(ob.x, ob.y, ob.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.globalAlpha = 0.3 + 0.3 * Math.sin(frame.t * 10);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

// 3. Spray & Wake Particles
for (let i = 0; i < S.particles.length; i++) {
  const p = S.particles[i];
  ctx.fillStyle = p.color;
  ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
}
ctx.globalAlpha = 1.0;

// 4. Draw The Shared Raft
const raftY = H * 0.72;
ctx.save();
ctx.translate(S.raftX, raftY);
ctx.rotate(S.raftAngle);

// Raft Shadow
ctx.fillStyle = 'rgba(0,0,0,0.45)';
ctx.beginPath();
ctx.roundRect(-42, -56, 84, 126, 32);
ctx.fill();

// Outer inflatable pontoon
ctx.fillStyle = '#f59e0b';
ctx.strokeStyle = '#fbbf24';
ctx.lineWidth = 6;
ctx.beginPath();
ctx.roundRect(-38, -60, 76, 120, 30);
ctx.fill();
ctx.stroke();

// Inner raft floor
ctx.fillStyle = '#0f172a';
ctx.beginPath();
ctx.roundRect(-24, -46, 48, 92, 18);
ctx.fill();

// Cross beams
ctx.fillStyle = '#334155';
ctx.fillRect(-22, -18, 44, 8);
ctx.fillRect(-22, 18, 44, 8);

// Dynamic Crew Seating (Maps all room.people or default party of 4)
const people = (room.people && room.people.length > 0)
  ? room.people
  : [{ id: 'p1', hue: 190 }, { id: 'p2', hue: 45 }, { id: 'p3', hue: 320 }, { id: 'p4', hue: 120 }];

const crewCount = people.length;
const maxVisible = Math.min(crewCount, 16);
const seatSpacing = 84 / (Math.ceil(maxVisible / 2) + 1);

for (let i = 0; i < maxVisible; i++) {
  const p = people[i];
  const isLeft = (i % 2 === 0);
  const row = Math.floor(i / 2);
  const seatX = isLeft ? -15 : 15;
  const seatY = -40 + (row + 1) * seatSpacing;
  const paddleDir = isLeft ? -1 : 1;

  // Oar shaft
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const oarAngle = paddleDir * (0.6 + Math.sin(frame.t * 8 + i) * 0.25);
  const oarTipX = seatX + Math.sin(oarAngle) * 36;
  const oarTipY = seatY + Math.cos(oarAngle) * 18;
  ctx.moveTo(seatX, seatY);
  ctx.lineTo(oarTipX, oarTipY);
  ctx.stroke();

  // Oar blade with player's personal hue
  ctx.fillStyle = `hsl(${p.hue}, 95%, 55%)`;
  ctx.beginPath();
  ctx.ellipse(oarTipX, oarTipY, 6, 12, oarAngle, 0, Math.PI * 2);
  ctx.fill();

  // Crew helmet/body
  ctx.fillStyle = `hsl(${p.hue}, 85%, 60%)`;
  ctx.beginPath();
  ctx.arc(seatX, seatY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

ctx.restore();

// 5. Huge Big-Stage HUD & Feedback

// Score Tracker (Distance run)
ctx.font = '900 48px sans-serif';
ctx.textAlign = 'center';
ctx.fillStyle = '#ffffff';
ctx.fillText(`${Math.floor(S.distance)}m`, W * 0.5, 70);

ctx.font = '700 18px sans-serif';
ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
ctx.fillText(`BEST: ${Math.floor(S.bestDistance)}m  •  CREW: ${people.length}`, W * 0.5, 102);

// Left/Right Action Prompts (Big, punchy labels visible across a hall)
const lScale = 1 + Math.min(0.35, leftPressed * 0.25);
const rScale = 1 + Math.min(0.35, rightPressed * 0.25);

// Left Button Area
ctx.save();
ctx.translate(bankMargin * 0.5, H * 0.85);
ctx.scale(lScale, lScale);
ctx.fillStyle = leftPressed ? '#38bdf8' : 'rgba(255, 255, 255, 0.12)';
ctx.beginPath();
ctx.roundRect(-70, -36, 140, 72, 16);
ctx.fill();
ctx.fillStyle = leftPressed ? '#000000' : '#ffffff';
ctx.font = '900 28px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('◀ LEFT', 0, 0);
ctx.restore();

// Right Button Area
ctx.save();
ctx.translate(W - bankMargin * 0.5, H * 0.85);
ctx.scale(rScale, rScale);
ctx.fillStyle = rightPressed ? '#f59e0b' : 'rgba(255, 255, 255, 0.12)';
ctx.beginPath();
ctx.roundRect(-70, -36, 140, 72, 16);
ctx.fill();
ctx.fillStyle = rightPressed ? '#000000' : '#ffffff';
ctx.font = '900 28px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('RIGHT ▶', 0, 0);
ctx.restore();

// Attract Mode Banner
if (isAttract) {
  ctx.fillStyle = '#fbbf24';
  ctx.font = '900 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PRESS LEFT OR RIGHT TO PADDLE!', W * 0.5, H * 0.18);
}

// Crash / Game Over Overlay
if (S.gameMode === 'crash') {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, W, H);

  ctx.font = '900 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff2255';
  ctx.fillText('WIPEOUT!', W * 0.5, H * 0.44);

  ctx.font = '900 42px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`FINAL RUN: ${Math.floor(S.distance)} METERS`, W * 0.5, H * 0.54);

  const countdown = Math.max(1, Math.ceil(2.8 - S.modeTimer));
  ctx.font = '700 28px sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`NEXT RUN IN ${countdown}...`, W * 0.5, H * 0.62);
}

ctx.restore();