ctx.save();
const W = frame.width, H = frame.height;
const bass = audio?.bass ?? 0;
const treble = audio?.treble ?? 0;
const beat = audio?.beat ?? false;

// Config from controls
const laneStyle = getVar('lane_style') ?? 'Cyber Synth';
const ballWeightType = getVar('ball_weight') ?? 'Heavy Smasher';
const pinGlowType = getVar('pin_glow') ?? 'Electric Cyan';
const aimSpeedVar = getVar('aim_speed') ?? 1.4;
const shakeVar = getVar('shake_intensity') ?? 1.0;
const ambientGlow = getVar('ambient_glow') ?? true;

const weightMap = { 'Heavy Smasher': 1.45, 'Standard 14lb': 1.15, 'Light Cruiser': 0.85 };
const ballMass = weightMap[ballWeightType] ?? 1.2;

// Init persistent state
room.state.init ??= false;
if (!room.state.init) {
  room.state.init = true;
  room.state.phase = 'AIM'; // AIM -> POWER -> ROLL -> IMPACT -> POST -> WINNER
  room.state.phaseTimer = 0;
  room.state.activePlayerIndex = 0;
  room.state.currentFrame = 1;
  room.state.maxFrames = 3;
  room.state.rollNum = 1;
  room.state.aim = 0;
  room.state.power = 0.5;
  room.state.lastInputTime = frame.t;
  room.state.shake = 0;
  room.state.bannerText = 'PRESS BOWL TO AIM!';
  room.state.bannerSub = 'WATCH THE SWEEP';
  room.state.bannerColor = '#00f0ff';
  room.state.bannerLife = 3.0;
  room.state.particles = [];
  room.state.playerScores = {};

  // Base pin formation (triangle)
  room.state.pins = [
    { id: 1, baseRow: 0, x: 0, y: 1.00, vx: 0, vy: 0, down: false, rot: 0, vrot: 0 },
    { id: 2, baseRow: 1, x: -0.09, y: 1.07, vx: 0, vy: 0, down: false, rot: 0, vrot: 0 },
    { id: 3, baseRow: 1, x:  0.09, y: 1.07, vx: 0, vy: 0, down: false, rot: 0, vrot: 0 },
    { id: 4, baseRow: 2, x: -0.18, y: 1.14, vx: 0, vy: 0, down: false, rot: 0, vrot: 0 },
    { id: 5, baseRow: 2, x:  0.00, y: 1.14, vx: 0, vy: 0, down: false, rot: 0, vrot: 0 },
    { id: 6, baseRow: 2, x:  0.18, y: 1.14, vx: 0, vy: 0, down: false, rot: 0, vrot: 0 },
    { id: 7, baseRow: 3, x: -0.27, y: 1.21, vx: 0, vy: 0, down: false, rot: 0, vrot: 0 },
    { id: 8, baseRow: 3, x: -0.09, y: 1.21, vx: 0, vy: 0, down: false, rot: 0, vrot: 0 },
    { id: 9, baseRow: 3, x:  0.09, y: 1.21, vx: 0, vy: 0, down: false, rot: 0, vrot: 0 },
    { id: 10, baseRow: 3, x: 0.27, y: 1.21, vx: 0, vy: 0, down: false, rot: 0, vrot: 0 }
  ];

  room.state.ball = {
    x: 0, y: 0.05, vx: 0, vy: 0, active: false, gutter: false, spin: 0
  };
}

// Active players handling: fallback to 3 virtual guest bowlers if room is empty
let bowlers = [];
if (room.people && room.people.length > 0) {
  bowlers = room.people.map((p, i) => ({
    id: p.id,
    name: p.table ? 'T-' + p.table.replace('table-', '') : `P${i + 1}`,
    hue: p.hue ?? ((i * 73) % 360)
  }));
} else {
  bowlers = [
    { id: 'v1', name: 'PLAYER 1', hue: 195 },
    { id: 'v2', name: 'PLAYER 2', hue: 320 },
    { id: 'v3', name: 'PLAYER 3', hue: 45 }
  ];
}

if (room.state.activePlayerIndex >= bowlers.length) {
  room.state.activePlayerIndex = 0;
}
const activeBowler = bowlers[room.state.activePlayerIndex];
const bowlerHue = activeBowler.hue;

// Ensure player score entry
for (const b of bowlers) {
  room.state.playerScores[b.id] ??= 0;
}

// Reset pins function
function resetPinDeck(preserveStanding = false) {
  const initialOffsets = [
    [0, 1.00],
    [-0.09, 1.07], [0.09, 1.07],
    [-0.18, 1.14], [0.00, 1.14], [0.18, 1.14],
    [-0.27, 1.21], [-0.09, 1.21], [0.09, 1.21], [0.27, 1.21]
  ];
  room.state.pins.forEach((p, idx) => {
    if (!preserveStanding || p.down) {
      p.x = initialOffsets[idx][0];
      p.y = initialOffsets[idx][1];
      p.vx = 0;
      p.vy = 0;
      p.rot = 0;
      p.vrot = 0;
      p.down = preserveStanding;
    }
  });
}

// Trigger spawn particles
function spawnBurst(cx, cy, count, hue, speedScale = 1) {
  for (let i = 0; i < count; i++) {
    if (room.state.particles.length > 180) room.state.particles.shift();
    const ang = Math.random() * Math.PI * 2;
    const spd = (Math.random() * 450 + 120) * speedScale;
    room.state.particles.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 1.0,
      decay: Math.random() * 0.8 + 0.6,
      hue: (hue + (Math.random() * 40 - 20) + 360) % 360,
      size: Math.random() * 7 + 3
    });
  }
}

// Handle events
let bowlPressed = false;
let cheerPressed = false;
for (const e of room.events) {
  if (e.name === 'bowl') bowlPressed = true;
  if (e.name === 'cheer') cheerPressed = true;
}

// Attract mode auto-play if idle for > 4.5s
if (bowlPressed || cheerPressed) {
  room.state.lastInputTime = frame.t;
}
const idleTime = frame.t - room.state.lastInputTime;
if (idleTime > 4.2 && (room.state.phase === 'AIM' || room.state.phase === 'POWER')) {
  bowlPressed = true;
}

if (cheerPressed) {
  spawnBurst(W * 0.5, H * 0.5, 45, bowlerHue, 1.4);
  room.state.shake = Math.max(room.state.shake, 14 * shakeVar);
}

// STATE MACHINE UPDATE
room.state.phaseTimer += frame.dt;

if (room.state.phase === 'AIM') {
  room.state.aim = Math.sin(frame.t * (2.8 * aimSpeedVar)) * 0.72;
  if (bowlPressed) {
    room.state.phase = 'POWER';
    room.state.phaseTimer = 0;
    room.state.shake = 5 * shakeVar;
    spawnBurst(W * 0.5, H * 0.86, 12, bowlerHue, 0.4);
  }
} else if (room.state.phase === 'POWER') {
  // Ping-pong power 0.3 to 1.0
  const rawP = Math.sin(frame.t * 6.0) * 0.5 + 0.5;
  room.state.power = 0.32 + rawP * 0.68;
  if (bowlPressed) {
    room.state.phase = 'ROLL';
    room.state.phaseTimer = 0;
    const b = room.state.ball;
    b.x = 0;
    b.y = 0.04;
    b.gutter = false;
    b.active = true;
    // vx influenced by aim and spin
    b.vx = room.state.aim * 0.95;
    b.vy = 1.0 + room.state.power * 1.55;
    b.spin = -room.state.aim * 25;
    room.state.shake = 8 * shakeVar;
    spawnBurst(W * 0.5, H * 0.84, 20, bowlerHue, 0.8);
  }
} else if (room.state.phase === 'ROLL') {
  const b = room.state.ball;
  const dt = Math.min(frame.dt, 0.05);
  b.y += b.vy * dt;
  b.x += b.vx * dt;

  // Check gutters
  if (Math.abs(b.x) > 0.46) {
    b.gutter = true;
    b.x = Math.sign(b.x) * 0.47;
    b.vx = 0;
  }

  // Collision with pins deck (y >= 0.94)
  if (b.y >= 0.92) {
    room.state.phase = 'IMPACT';
    room.state.phaseTimer = 0;
  }
} else if (room.state.phase === 'IMPACT') {
  const b = room.state.ball;
  const dt = Math.min(frame.dt, 0.04);
  b.y += b.vy * dt;
  b.x += b.vx * dt;

  // Ball-to-pin collisions
  if (!b.gutter && b.y < 1.35) {
    for (const p of room.state.pins) {
      if (p.down) continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.082) {
        p.down = true;
        const ang = Math.atan2(dy, dx);
        const hitSpeed = Math.hypot(b.vx, b.vy) * ballMass;
        p.vx = Math.cos(ang) * hitSpeed * 0.85 + (Math.random() - 0.5) * 0.3;
        p.vy = Math.sin(ang) * hitSpeed * 0.85 + 0.4;
        p.vrot = (Math.random() - 0.5) * 35;
        b.vx *= 0.82;
        b.vy *= 0.88;
        room.state.shake = Math.min(room.state.shake + 5 * shakeVar, 22 * shakeVar);

        // Screen coordinates of pin impact
        const impactScale = 0.28;
        const hitScX = W * 0.5 + p.x * (W * 0.36) * impactScale;
        const hitScY = H * 0.24;
        spawnBurst(hitScX, hitScY, 14, bowlerHue, 0.9);
      }
    }
  }

  // Pin-to-pin scattering
  for (let i = 0; i < room.state.pins.length; i++) {
    const p1 = room.state.pins[i];
    if (!p1.down) continue;
    p1.x += p1.vx * dt;
    p1.y += p1.vy * dt;
    p1.vx *= 0.95;
    p1.vy *= 0.95;
    p1.rot += p1.vrot * dt;

    for (let j = i + 1; j < room.state.pins.length; j++) {
      const p2 = room.state.pins[j];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.088) {
        if (!p2.down) {
          p2.down = true;
          p2.vrot = (Math.random() - 0.5) * 28;
          room.state.shake = Math.min(room.state.shake + 3 * shakeVar, 18 * shakeVar);
        }
        const ang = Math.atan2(dy, dx);
        const spread = (Math.hypot(p1.vx, p1.vy) + Math.hypot(p2.vx, p2.vy)) * 0.5;
        p1.vx -= Math.cos(ang) * spread * 0.5;
        p1.vy -= Math.sin(ang) * spread * 0.5;
        p2.vx += Math.cos(ang) * spread * 0.5;
        p2.vy += Math.sin(ang) * spread * 0.5;
      }
    }
  }

  if (room.state.phaseTimer > 1.8) {
    // Tally frame score
    const knocked = room.state.pins.filter(p => p.down).length;
    let pointsAwarded = 0;
    let banner = '';
    let sub = '';

    if (room.state.rollNum === 1) {
      if (knocked === 10) {
        pointsAwarded = 30;
        banner = '★ STRIKE! ★';
        sub = 'MAXIMUM POWER';
        room.state.bannerColor = `hsl(${bowlerHue}, 100%, 65%)`;
        spawnBurst(W * 0.5, H * 0.28, 90, bowlerHue, 1.8);
        room.state.shake = 22 * shakeVar;
        room.state.rollNum = 1;
        room.state.currentFrame++;
        room.state.activePlayerIndex = (room.state.activePlayerIndex + 1) % bowlers.length;
        resetPinDeck(false);
      } else if (knocked === 0) {
        pointsAwarded = 0;
        banner = 'GUTTER BALL!';
        sub = 'GET THE SPARE';
        room.state.bannerColor = '#ff3366';
        room.state.rollNum = 2;
        resetPinDeck(true);
      } else {
        pointsAwarded = knocked * 2;
        banner = `${knocked} PINS!`;
        sub = 'ROLL 2 FOR SPARE';
        room.state.bannerColor = '#39ff14';
        room.state.rollNum = 2;
        resetPinDeck(true);
      }
    } else {
      // Roll 2
      if (knocked === 10) {
        pointsAwarded = 20;
        banner = 'SPARE!!';
        sub = 'CLUTCH CLEANUP!';
        room.state.bannerColor = `hsl(${bowlerHue}, 100%, 65%)`;
        spawnBurst(W * 0.5, H * 0.28, 60, bowlerHue, 1.3);
      } else {
        pointsAwarded = knocked;
        banner = `${knocked} PINS TOTAL`;
        sub = 'FRAME COMPLETE';
        room.state.bannerColor = '#00f0ff';
      }
      room.state.rollNum = 1;
      room.state.currentFrame++;
      room.state.activePlayerIndex = (room.state.activePlayerIndex + 1) % bowlers.length;
      resetPinDeck(false);
    }

    room.state.playerScores[activeBowler.id] = (room.state.playerScores[activeBowler.id] ?? 0) + pointsAwarded;
    room.state.bannerText = banner;
    room.state.bannerSub = sub;
    room.state.bannerLife = 2.4;

    // Check if tournament round finished
    if (room.state.currentFrame > room.state.maxFrames * bowlers.length) {
      room.state.phase = 'WINNER';
      room.state.phaseTimer = 0;
    } else {
      room.state.phase = 'AIM';
      room.state.phaseTimer = 0;
    }
  }
} else if (room.state.phase === 'WINNER') {
  if (room.state.phaseTimer > 5.5) {
    // Auto reset for next tournament round
    room.state.currentFrame = 1;
    room.state.rollNum = 1;
    room.state.activePlayerIndex = 0;
    for (const b of bowlers) room.state.playerScores[b.id] = 0;
    resetPinDeck(false);
    room.state.phase = 'AIM';
    room.state.phaseTimer = 0;
    room.state.bannerText = 'NEW ROUND STARTS!';
    room.state.bannerSub = 'FIRST UP BOWL!';
    room.state.bannerColor = '#00f0ff';
    room.state.bannerLife = 2.5;
  }
}

// DECAY SHAKE
room.state.shake *= 0.88;
const shakeX = (Math.random() - 0.5) * room.state.shake;
const shakeY = (Math.random() - 0.5) * room.state.shake;
ctx.translate(shakeX, shakeY);

// PERSPECTIVE PROJECTION HELPER
// laneY: 0 (approach / bottom) to 1.3 (pit / top)
function project(lx, ly) {
  const normY = Math.min(Math.max(ly / 1.3, 0), 1);
  const sy = H * 0.86 - normY * (H * 0.63);
  const scale = 1.0 - normY * 0.72;
  const halfW = (W * 0.38) * scale;
  const sx = W * 0.5 + lx * halfW;
  return { x: sx, y: sy, scale };
}

// PALETTES
const palettes = {
  'Cyber Synth': { bg: '#060411', lane: '#0f1026', board1: '#151638', board2: '#1b1d47', gutter: '#09081a', neon: '#00f0ff', accent: '#ff007f' },
  'Classic Maple': { bg: '#0c0704', lane: '#2b1b10', board1: '#4a321e', board2: '#3d2817', gutter: '#120b06', neon: '#ffaa33', accent: '#ff4400' },
  'Midnight Neon': { bg: '#030308', lane: '#090918', board1: '#11112e', board2: '#0b0b22', gutter: '#050510', neon: '#8a2be2', accent: '#39ff14' },
  'Hot Rod Red': { bg: '#100305', lane: '#24080c', board1: '#3d0f15', board2: '#2f0b10', gutter: '#110305', neon: '#ff2a2a', accent: '#ffcc00' }
};
const pal = palettes[laneStyle] ?? palettes['Cyber Synth'];

// PIN GLOW STYLES
const pinGlowColors = {
  'Electric Cyan': '#00f0ff',
  'Pure White': '#ffffff',
  'Golden Crown': '#ffdd33'
};
const activePinGlow = pinGlowColors[pinGlowType] ?? '#00f0ff';

// BACKGROUND
ctx.fillStyle = pal.bg;
ctx.fillRect(-20, -20, W + 40, H + 40);

// BACKGROUND AMBIENT VIBES / RETRO GRID WALL
ctx.save();
ctx.strokeStyle = pal.neon;
ctx.globalAlpha = 0.08 + bass * 0.06;
ctx.lineWidth = 1.5;
const topHorizon = H * 0.23;
for (let gx = 0; gx < W; gx += 45) {
  ctx.beginPath();
  ctx.moveTo(gx, 0);
  ctx.lineTo(W * 0.5 + (gx - W * 0.5) * 0.35, topHorizon);
  ctx.stroke();
}
for (let gy = 0; gy < topHorizon; gy += 25) {
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(W, gy);
  ctx.stroke();
}
ctx.restore();

// DRAW GUTTERS & LANE (Perspective Trapezoid)
const pBottomLeft = project(-1.0, 0);
const pBottomRight = project(1.0, 0);
const pTopLeft = project(-1.0, 1.3);
const pTopRight = project(1.0, 1.3);

// Outer gutter fills
ctx.save();
ctx.fillStyle = pal.gutter;
ctx.beginPath();
ctx.moveTo(pBottomLeft.x, pBottomLeft.y);
ctx.lineTo(pTopLeft.x, pTopLeft.y);
ctx.lineTo(pTopRight.x, pTopRight.y);
ctx.lineTo(pBottomRight.x, pBottomRight.y);
ctx.closePath();
ctx.fill();

// Lane wood surface
const pLaneBL = project(-0.84, 0);
const pLaneBR = project(0.84, 0);
const pLaneTL = project(-0.84, 1.3);
const pLaneTR = project(0.84, 1.3);

ctx.fillStyle = pal.lane;
ctx.beginPath();
ctx.moveTo(pLaneBL.x, pLaneBL.y);
ctx.lineTo(pLaneTL.x, pLaneTL.y);
ctx.lineTo(pLaneTR.x, pLaneTR.y);
ctx.lineTo(pLaneBR.x, pLaneBR.y);
ctx.closePath();
ctx.fill();

// Perspective wood planks
const plankCount = 14;
for (let pl = 1; pl < plankCount; pl++) {
  const plankFract = -0.84 + (1.68 * pl) / plankCount;
  const botP = project(plankFract, 0);
  const topP = project(plankFract, 1.3);
  ctx.strokeStyle = pl % 2 === 0 ? pal.board1 : pal.board2;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(botP.x, botP.y);
  ctx.lineTo(topP.x, topP.y);
  ctx.stroke();
}

// Aim arrows on lane floor
const arrowY = 0.42;
const arrowP = project(0, arrowY);
const arrowSpacing = 0.2;
for (let a = -3; a <= 3; a++) {
  const ap = project(a * arrowSpacing, arrowY);
  const size = 16 * ap.scale;
  ctx.fillStyle = pal.neon;
  ctx.globalAlpha = 0.4 + (a === 0 ? 0.35 : 0);
  ctx.beginPath();
  ctx.moveTo(ap.x, ap.y - size * 1.5);
  ctx.lineTo(ap.x + size, ap.y + size);
  ctx.lineTo(ap.x - size, ap.y + size);
  ctx.closePath();
  ctx.fill();
}
ctx.globalAlpha = 1.0;

// Glowing lane edge rails
ctx.lineWidth = 4 + bass * 5;
ctx.strokeStyle = pal.neon;
if (ambientGlow) {
  ctx.shadowColor = pal.neon;
  ctx.shadowBlur = 15 + bass * 25;
}
ctx.beginPath();
ctx.moveTo(pLaneBL.x, pLaneBL.y);
ctx.lineTo(pLaneTL.x, pLaneTL.y);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(pLaneBR.x, pLaneBR.y);
ctx.lineTo(pLaneTR.x, pLaneTR.y);
ctx.stroke();
ctx.shadowBlur = 0;
ctx.restore();

// DRAW FOUL LINE
ctx.save();
ctx.strokeStyle = pal.accent;
ctx.lineWidth = 5;
ctx.shadowColor = pal.accent;
ctx.shadowBlur = 8;
ctx.beginPath();
ctx.moveTo(pLaneBL.x, pLaneBL.y);
ctx.lineTo(pLaneBR.x, pLaneBR.y);
ctx.stroke();
ctx.restore();

// PIN DECK PIT / BACKBOARD
ctx.save();
ctx.fillStyle = '#050308';
ctx.fillRect(pTopLeft.x - 30, pTopLeft.y - 45, (pTopRight.x - pTopLeft.x) + 60, 48);
ctx.strokeStyle = pal.neon;
ctx.lineWidth = 3;
ctx.strokeRect(pTopLeft.x - 30, pTopLeft.y - 45, (pTopRight.x - pTopLeft.x) + 60, 48);
ctx.restore();

// DRAW PINS (Sort by Y so closer pins overlap farther pins)
const sortedPins = [...room.state.pins].sort((a, b) => b.y - a.y);
for (const pin of sortedPins) {
  const pp = project(pin.x, pin.y);
  const pinW = 24 * pp.scale;
  const pinH = 56 * pp.scale;

  ctx.save();
  ctx.translate(pp.x, pp.y);
  ctx.rotate(pin.rot);

  // Pin shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, pinH * 0.45, pinW * 0.75, pinW * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pin body
  ctx.fillStyle = pin.down ? '#555566' : '#f0f2f5';
  if (!pin.down && ambientGlow) {
    ctx.shadowColor = activePinGlow;
    ctx.shadowBlur = 10 + bass * 12;
  }
  ctx.beginPath();
  // Stylized Bowling Pin Silhouette
  ctx.moveTo(-pinW * 0.4, pinH * 0.4);
  ctx.quadraticCurveTo(-pinW * 0.5, 0, -pinW * 0.22, -pinH * 0.15);
  ctx.quadraticCurveTo(-pinW * 0.16, -pinH * 0.32, -pinW * 0.32, -pinH * 0.44);
  ctx.arc(0, -pinH * 0.45, pinW * 0.32, Math.PI, 0, false);
  ctx.quadraticCurveTo(pinW * 0.16, -pinH * 0.32, pinW * 0.22, -pinH * 0.15);
  ctx.quadraticCurveTo(pinW * 0.5, 0, pinW * 0.4, pinH * 0.4);
  ctx.closePath();
  ctx.fill();

  // Red neck stripes if upright
  if (!pin.down) {
    ctx.fillStyle = '#ff1144';
    ctx.fillRect(-pinW * 0.22, -pinH * 0.34, pinW * 0.44, pinH * 0.05);
    ctx.fillRect(-pinW * 0.24, -pinH * 0.25, pinW * 0.48, pinH * 0.05);
  }
  ctx.restore();
}

// DRAW BOWLING BALL
const b = room.state.ball;
if (room.state.phase === 'ROLL' || room.state.phase === 'IMPACT' || room.state.phase === 'AIM' || room.state.phase === 'POWER') {
  const ballScreen = project(b.x, b.y);
  const ballRadius = (32 * ballMass * 0.85) * ballScreen.scale;

  ctx.save();
  ctx.translate(ballScreen.x, ballScreen.y);

  // Ball shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.ellipse(0, ballRadius * 0.9, ballRadius * 0.95, ballRadius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball gradient in active bowler's hue
  const ballGrad = ctx.createRadialGradient(-ballRadius * 0.35, -ballRadius * 0.35, ballRadius * 0.1, 0, 0, ballRadius);
  ballGrad.addColorStop(0, '#ffffff');
  ballGrad.addColorStop(0.3, `hsl(${bowlerHue}, 100%, 65%)`);
  ballGrad.addColorStop(0.8, `hsl(${bowlerHue}, 100%, 35%)`);
  ballGrad.addColorStop(1, '#050510');

  ctx.fillStyle = ballGrad;
  if (ambientGlow) {
    ctx.shadowColor = `hsl(${bowlerHue}, 100%, 60%)`;
    ctx.shadowBlur = 16 + bass * 20;
  }
  ctx.beginPath();
  ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
  ctx.fill();

  // 3 Finger holes rolling with rotation
  const rollAngle = b.y * 35;
  ctx.rotate(rollAngle);
  ctx.fillStyle = '#0a0a14';
  ctx.shadowBlur = 0;
  const holeR = ballRadius * 0.13;
  ctx.beginPath();
  ctx.arc(-ballRadius * 0.28, -ballRadius * 0.2, holeR, 0, Math.PI * 2);
  ctx.arc(ballRadius * 0.15, -ballRadius * 0.28, holeR, 0, Math.PI * 2);
  ctx.arc(-ballRadius * 0.05, ballRadius * 0.16, holeR * 1.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// DRAW AIM INDICATOR (Phase == AIM)
if (room.state.phase === 'AIM') {
  ctx.save();
  const aimNorm = room.state.aim;
  const origin = project(0, 0.05);
  const target = project(aimNorm * 0.8, 0.65);

  ctx.strokeStyle = `hsl(${bowlerHue}, 100%, 60%)`;
  ctx.lineWidth = 6;
  ctx.shadowColor = `hsl(${bowlerHue}, 100%, 60%)`;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();

  // Aim Arrow Head
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(target.x, target.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// DRAW POWER METER (Phase == POWER)
if (room.state.phase === 'POWER') {
  ctx.save();
  const meterW = 42;
  const meterH = H * 0.38;
  const meterX = W * 0.84;
  const meterY = H * 0.52;

  ctx.fillStyle = 'rgba(10, 10, 25, 0.85)';
  ctx.strokeStyle = pal.neon;
  ctx.lineWidth = 3;
  ctx.strokeRect(meterX, meterY, meterW, meterH);
  ctx.fillRect(meterX, meterY, meterW, meterH);

  // Fill bar
  const fillH = meterH * room.state.power;
  const meterGrad = ctx.createLinearGradient(0, meterY + meterH, 0, meterY);
  meterGrad.addColorStop(0, '#00f0ff');
  meterGrad.addColorStop(0.6, '#ffee00');
  meterGrad.addColorStop(1, '#ff0055');

  ctx.fillStyle = meterGrad;
  ctx.fillRect(meterX + 3, meterY + meterH - fillH, meterW - 6, fillH);

  ctx.font = '900 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('POWER', meterX + meterW * 0.5, meterY - 14);
  ctx.restore();
}

// PARTICLES UPDATE & DRAW
ctx.save();
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const pt = room.state.particles[i];
  pt.x += pt.vx * frame.dt;
  pt.y += pt.vy * frame.dt;
  pt.vy += 220 * frame.dt; // gravity
  pt.life -= pt.decay * frame.dt;
  if (pt.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  ctx.globalAlpha = pt.life;
  ctx.fillStyle = `hsl(${pt.hue}, 100%, 65%)`;
  ctx.shadowColor = `hsl(${pt.hue}, 100%, 65%)`;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// HUD: TOP BANNER (PLAYER SCORES + ACTIVE BOWLER)
ctx.save();
const hudH = H * 0.12;
ctx.fillStyle = 'rgba(6, 4, 18, 0.9)';
ctx.fillRect(0, 0, W, hudH);
ctx.strokeStyle = pal.neon;
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.moveTo(0, hudH);
ctx.lineTo(W, hudH);
ctx.stroke();

// Show Current Bowler Pill
ctx.fillStyle = `hsl(${bowlerHue}, 100%, 55%)`;
ctx.beginPath();
ctx.roundRect(30, 16, 260, hudH - 32, 14);
ctx.fill();

ctx.font = '900 16px system-ui, -apple-system, sans-serif';
ctx.fillStyle = '#060411';
ctx.textAlign = 'left';
ctx.fillText(`UP NOW: FRAME ${room.state.currentFrame}/${room.state.maxFrames}`, 46, 38);

ctx.font = '900 28px system-ui, -apple-system, sans-serif';
ctx.fillStyle = '#060411';
ctx.fillText(`${activeBowler.name}`, 46, 68);

// Leaderboard Carousel / Badges across the top
const displayCount = Math.min(bowlers.length, 7);
const badgeW = 120;
const startX = 320;
for (let i = 0; i < displayCount; i++) {
  const pIdx = (room.state.activePlayerIndex + i) % bowlers.length;
  const bItem = bowlers[pIdx];
  const isCur = pIdx === room.state.activePlayerIndex;
  const bx = startX + i * (badgeW + 12);
  if (bx + badgeW > W - 20) break;

  ctx.fillStyle = isCur ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.07)';
  ctx.strokeStyle = `hsl(${bItem.hue}, 90%, 50%)`;
  ctx.lineWidth = isCur ? 3 : 1;
  ctx.beginPath();
  ctx.roundRect(bx, 16, badgeW, hudH - 32, 10);
  ctx.fill();
  ctx.stroke();

  // Tiny avatar indicator
  ctx.fillStyle = `hsl(${bItem.hue}, 100%, 60%)`;
  ctx.beginPath();
  ctx.arc(bx + 18, 38, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '800 14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(bItem.name, bx + 32, 42);

  ctx.font = '900 20px monospace';
  ctx.fillStyle = isCur ? '#00f0ff' : '#aaaaaa';
  ctx.fillText(`${room.state.playerScores[bItem.id] ?? 0} pts`, bx + 18, 66);
}
ctx.restore();

// ACTION PROMPT / STATUS BANNER AT BOTTOM
ctx.save();
let mainPrompt = '';
let subPrompt = '';
let pulseColor = `hsl(${bowlerHue}, 100%, 65%)`;

if (room.state.phase === 'AIM') {
  mainPrompt = 'AIMING: PRESS BOWL!';
  subPrompt = 'LOCK IN YOUR TRAJECTORY';
} else if (room.state.phase === 'POWER') {
  mainPrompt = 'POWER: PRESS BOWL!';
  subPrompt = 'HIT THE PEAK FOR MAX VELOCITY';
  pulseColor = '#ffcc00';
} else if (room.state.phase === 'ROLL') {
  mainPrompt = 'ROLLING...';
  subPrompt = 'HOLD ON TIGHT!';
} else if (room.state.phase === 'IMPACT') {
  mainPrompt = 'IMPACT!!';
  subPrompt = 'PINS FLYING';
} else if (room.state.phase === 'WINNER') {
  // Find high score
  let bestId = bowlers[0].id;
  let maxPts = -1;
  for (const b of bowlers) {
    const pts = room.state.playerScores[b.id] ?? 0;
    if (pts > maxPts) {
      maxPts = pts;
      bestId = b.id;
    }
  }
  const champ = bowlers.find(b => b.id === bestId) ?? bowlers[0];
  mainPrompt = `🏆 CHAMPION: ${champ.name}!`;
  subPrompt = `SCORE: ${maxPts} POINTS — NEXT ROUND SOON`;
  pulseColor = `hsl(${champ.hue}, 100%, 65%)`;
}

// Big short readable prompt for whole hall
ctx.textAlign = 'center';
ctx.shadowColor = pulseColor;
ctx.shadowBlur = 24 + bass * 25;
ctx.fillStyle = pulseColor;
ctx.font = '900 48px system-ui, -apple-system, sans-serif';
ctx.fillText(mainPrompt, W * 0.5, H * 0.94);

ctx.shadowBlur = 0;
ctx.fillStyle = '#ffffff';
ctx.font = '800 20px system-ui, -apple-system, sans-serif';
ctx.globalAlpha = 0.85;
ctx.fillText(subPrompt, W * 0.5, H * 0.98);
ctx.restore();

// CENTRAL REACTION POPUP (STRIKE, SPARE, GUTTER)
if (room.state.bannerLife > 0 && room.state.phase !== 'WINNER') {
  room.state.bannerLife -= frame.dt;
  const popScale = Math.min(1.0, 1.0 + Math.sin(room.state.bannerLife * 3) * 0.15);

  ctx.save();
  ctx.translate(W * 0.5, H * 0.38);
  ctx.scale(popScale, popScale);
  ctx.textAlign = 'center';

  // Backdrop banner card
  ctx.fillStyle = 'rgba(5, 5, 15, 0.85)';
  ctx.strokeStyle = room.state.bannerColor;
  ctx.lineWidth = 4;
  ctx.shadowColor = room.state.bannerColor;
  ctx.shadowBlur = 30 + bass * 35;
  ctx.beginPath();
  ctx.roundRect(-320, -65, 640, 130, 24);
  ctx.fill();
  ctx.stroke();

  ctx.font = '900 68px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = room.state.bannerColor;
  ctx.fillText(room.state.bannerText, 0, 8);

  ctx.font = '800 24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 0;
  ctx.fillText(room.state.bannerSub, 0, 46);
  ctx.restore();
}

// Attract mode subtle badge if nobody has pressed anything
if (idleTime > 3.0 && room.state.phase !== 'WINNER') {
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '800 16px monospace';
  ctx.fillStyle = '#00f0ff';
  ctx.globalAlpha = 0.6 + Math.sin(frame.t * 5) * 0.3;
  ctx.fillText('⚡ AUTO DEMO / PARTY ATTRACT MODE', W - 30, H - 24);
  ctx.restore();
}

ctx.restore();