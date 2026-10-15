ctx.save();

const paletteChoice = getVar('neon_palette') ?? 'Cyber Neon';
const gravSetting = getVar('gravity') ?? 550;
const kickSetting = getVar('bumper_kick') ?? 1.6;
const mbSetting = getVar('multiball_targets') ?? 'Standard 4';
const trailsOn = getVar('trails') ?? true;

const targetCounts = { 'Standard 4': 4, 'Quick 3': 3, 'Mayhem 2': 2 };
const requiredTargets = targetCounts[mbSetting] ?? 4;

const themes = {
  'Cyber Neon': { bg: '#050713', p: '#00f0ff', s: '#ff0077', acc: '#ffe600', w: '#0088cc', off: '#0a1d33' },
  'Vapor Wave': { bg: '#0a0218', p: '#ff71ce', s: '#01cdfe', acc: '#b967ff', w: '#990088', off: '#240b3b' },
  'Laser Amber': { bg: '#0f0600', p: '#ffaa00', s: '#ff3700', acc: '#fff275', w: '#a34800', off: '#2b1200' },
  'Toxic Lime': { bg: '#020f06', p: '#39ff14', s: '#00f5d4', acc: '#e2ff00', w: '#138528', off: '#06260f' }
};
const pal = themes[paletteChoice] ?? themes['Cyber Neon'];

// Persistent game state
room.state.balls ??= [];
room.state.sparks ??= [];
room.state.score ??= 0;
room.state.displayScore ??= 0;
room.state.highScore ??= 10000;
room.state.roundTimer ??= 75;
room.state.roundPhase ??= 'play'; // 'play', 'game_over'
room.state.targets ??= [false, false, false, false];
room.state.targetFlash ??= [0, 0, 0, 0];
room.state.lastActionTime ??= frame.t;
room.state.bannerText ??= 'GO!';
room.state.bannerTimer ??= 2.2;
room.state.spawnDelay ??= 0.5;
room.state.pulses ??= [];
room.state.bumpers ??= [
  { x: 300, y: 270, r: 38, flash: 0 },
  { x: 205, y: 390, r: 34, flash: 0 },
  { x: 395, y: 390, r: 34, flash: 0 }
];
room.state.flipperL ??= { angle: 0.46, target: 0.46, pressT: 0, lastHue: null };
room.state.flipperR ??= { angle: Math.PI - 0.46, target: Math.PI - 0.46, pressT: 0, lastHue: null };

const dt = Math.min(frame.dt || 0.016, 0.05);

// Clear / trails
if (trailsOn) {
  ctx.fillStyle = pal.bg + '38';
  ctx.fillRect(0, 0, frame.width, frame.height);
} else {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, frame.width, frame.height);
}

// Process input events
let triggeredL = false;
let triggeredR = false;
let triggerHueL = null;
let triggerHueR = null;

if (room.events && room.events.length > 0) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    const person = room.people ? room.people.find(p => p.id === ev.participantId) : null;
    const pHue = person ? person.hue : 180;
    if (ev.name === 'flip_left') {
      triggeredL = true;
      triggerHueL = pHue;
      room.state.lastActionTime = frame.t;
    } else if (ev.name === 'flip_right') {
      triggeredR = true;
      triggerHueR = pHue;
      room.state.lastActionTime = frame.t;
    }
  }
}

// Attract mode auto-flip if idle for > 3.2 seconds
const isAttract = (frame.t - room.state.lastActionTime) > 3.2;
if (isAttract) {
  for (let i = 0; i < room.state.balls.length; i++) {
    const b = room.state.balls[i];
    if (b.y > 690 && b.y < 810 && b.vy > -50) {
      if (b.x < 305 && b.x > 170) triggeredL = true;
      if (b.x >= 295 && b.x < 430) triggeredR = true;
    }
  }
}

// Apply flipper triggers
if (triggeredL) {
  room.state.flipperL.target = -0.44;
  room.state.flipperL.pressT = 0.16;
  if (triggerHueL !== null) room.state.flipperL.lastHue = triggerHueL;
  if (room.state.pulses.length < 30) {
    room.state.pulses.push({ side: 'L', hue: triggerHueL ?? 180, life: 1.0 });
  }
}
if (triggeredR) {
  room.state.flipperR.target = Math.PI + 0.44;
  room.state.flipperR.pressT = 0.16;
  if (triggerHueR !== null) room.state.flipperR.lastHue = triggerHueR;
  if (room.state.pulses.length < 30) {
    room.state.pulses.push({ side: 'R', hue: triggerHueR ?? 300, life: 1.0 });
  }
}

// Update flipper angles
for (const flip of [room.state.flipperL, room.state.flipperR]) {
  if (flip.pressT > 0) {
    flip.pressT -= dt;
    if (flip.pressT <= 0) {
      flip.target = (flip === room.state.flipperL) ? 0.46 : Math.PI - 0.46;
    }
  }
  flip.angle += (flip.target - flip.angle) * Math.min(1.0, 36 * dt);
}

// Round management
if (room.state.roundPhase === 'play') {
  room.state.roundTimer -= dt;
  if (room.state.roundTimer <= 0) {
    room.state.roundPhase = 'game_over';
    room.state.roundTimer = 6.0;
    room.state.bannerText = 'ROUND OVER!';
    room.state.bannerTimer = 5.0;
    if (room.state.score > room.state.highScore) {
      room.state.highScore = room.state.score;
    }
  }
} else {
  room.state.roundTimer -= dt;
  if (room.state.roundTimer <= 0) {
    room.state.roundPhase = 'play';
    room.state.roundTimer = 75;
    room.state.score = 0;
    room.state.displayScore = 0;
    room.state.bannerText = 'GO!';
    room.state.bannerTimer = 2.0;
    room.state.balls = [];
    room.state.targets = [false, false, false, false];
  }
}

// Spawn ball if empty and during play phase
if (room.state.roundPhase === 'play' && room.state.balls.length === 0) {
  room.state.spawnDelay -= dt;
  if (room.state.spawnDelay <= 0) {
    room.state.balls.push({
      x: 300 + (Math.random() - 0.5) * 80,
      y: 90,
      vx: (Math.random() - 0.5) * 140,
      vy: 200 + Math.random() * 80,
      r: 12,
      trail: []
    });
    room.state.spawnDelay = 1.0;
  }
} else {
  room.state.spawnDelay = 0.5;
}

// Smooth display score
room.state.displayScore += (room.state.score - room.state.displayScore) * Math.min(1.0, 14 * dt);
if (room.state.bannerTimer > 0) room.state.bannerTimer -= dt;

// Geometry setup: playfield is 600 x 920 virtual coords, centered on canvas
const vw = 600;
const vh = 920;
const scale = Math.min((frame.width * 0.72) / vw, (frame.height * 0.94) / vh);
const tx = (frame.width - vw * scale) * 0.5;
const ty = (frame.height - vh * scale) * 0.5;

// Helper: segment collision
function bounceSegment(ball, x1, y1, x2, y2, restitution, kickNorm) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return false;
  let u = ((ball.x - x1) * dx + (ball.y - y1) * dy) / lenSq;
  u = Math.max(0, Math.min(1, u));
  const px = x1 + u * dx;
  const py = y1 + u * dy;
  const ndx = ball.x - px;
  const ndy = ball.y - py;
  const dist = Math.hypot(ndx, ndy);
  if (dist < ball.r) {
    const nx = dist === 0 ? 0 : ndx / dist;
    const ny = dist === 0 ? -1 : ndy / dist;
    ball.x = px + nx * (ball.r + 0.5);
    ball.y = py + ny * (ball.r + 0.5);
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= (1 + restitution) * dot * nx;
      ball.vy -= (1 + restitution) * dot * ny;
      if (kickNorm) {
        ball.vx += nx * kickNorm;
        ball.vy += ny * kickNorm;
      }
    }
    return true;
  }
  return false;
}

// Flipper collision and impulse
const fLen = 92;
const pivotL = { x: 210, y: 785 };
const pivotR = { x: 390, y: 785 };

function hitFlipper(ball, pivot, angle, isMovingUp) {
  const tipX = pivot.x + Math.cos(angle) * fLen;
  const tipY = pivot.y + Math.sin(angle) * fLen;
  const dx = tipX - pivot.x;
  const dy = tipY - pivot.y;
  const lenSq = dx * dx + dy * dy;
  let u = ((ball.x - pivot.x) * dx + (ball.y - pivot.y) * dy) / lenSq;
  u = Math.max(0, Math.min(1, u));
  const qx = pivot.x + u * dx;
  const qy = pivot.y + u * dy;
  const dist = Math.hypot(ball.x - qx, ball.y - qy);
  const fR = 10;
  if (dist < ball.r + fR) {
    const nx = dist === 0 ? 0 : (ball.x - qx) / dist;
    const ny = dist === 0 ? -1 : (ball.y - qy) / dist;
    ball.x = qx + nx * (ball.r + fR + 0.5);
    ball.y = qy + ny * (ball.r + fR + 0.5);
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 1.6 * dot * nx;
      ball.vy -= 1.6 * dot * ny;
    }
    if (isMovingUp) {
      ball.vy = -Math.abs(ball.vy) - 340 - u * 200;
      ball.vx += nx * 140;
      room.state.score += 150;
      if (room.state.sparks.length < 120) {
        for (let k = 0; k < 6; k++) {
          room.state.sparks.push({
            x: ball.x,
            y: ball.y,
            vx: (Math.random() - 0.5) * 260,
            vy: -150 - Math.random() * 200,
            c: pal.p,
            life: 0.5
          });
        }
      }
    }
    return true;
  }
  return false;
}

// Physics sub-stepping
const subSteps = 2;
const subDt = dt / subSteps;
const fUpL = room.state.flipperL.pressT > 0.04;
const fUpR = room.state.flipperR.pressT > 0.04;

for (let step = 0; step < subSteps; step++) {
  for (let i = room.state.balls.length - 1; i >= 0; i--) {
    const b = room.state.balls[i];
    b.vy += gravSetting * subDt;
    b.vx *= 0.999;
    b.vy *= 0.999;
    b.x += b.vx * subDt;
    b.y += b.vy * subDt;

    // Top arch collision
    if (b.y < 220) {
      const archC = { x: 300, y: 220 };
      const adx = b.x - archC.x;
      const ady = b.y - archC.y;
      const adist = Math.hypot(adx, ady);
      const archR = 230;
      if (adist > archR - b.r) {
        const anx = -adx / adist;
        const any = -ady / adist;
        b.x = archC.x - anx * (archR - b.r);
        b.y = archC.y - any * (archR - b.r);
        const dot = b.vx * anx + b.vy * any;
        if (dot < 0) {
          b.vx -= 1.7 * dot * anx;
          b.vy -= 1.7 * dot * any;
        }
      }
    }

    // Side walls
    if (b.x < 70 + b.r) {
      b.x = 70 + b.r;
      b.vx = Math.abs(b.vx) * 0.85;
    } else if (b.x > 530 - b.r) {
      b.x = 530 - b.r;
      b.vx = -Math.abs(b.vx) * 0.85;
    }

    // Guide lanes to flippers
    bounceSegment(b, 70, 640, 190, 755, 0.7, 0);
    bounceSegment(b, 530, 640, 410, 755, 0.7, 0);

    // Slingshots (kick on hit)
    if (bounceSegment(b, 150, 620, 195, 715, 0.8, 180)) {
      room.state.score += 250;
    }
    if (bounceSegment(b, 450, 620, 405, 715, 0.8, 180)) {
      room.state.score += 250;
    }

    // Flippers
    hitFlipper(b, pivotL, room.state.flipperL.angle, fUpL);
    hitFlipper(b, pivotR, room.state.flipperR.angle, fUpR);

    // Bumpers
    for (let bi = 0; bi < room.state.bumpers.length; bi++) {
      const bmp = room.state.bumpers[bi];
      const curR = bmp.r + audio.bass * 10;
      const bdx = b.x - bmp.x;
      const bdy = b.y - bmp.y;
      const bdist = Math.hypot(bdx, bdy);
      if (bdist < b.r + curR) {
        const bnx = bdist === 0 ? 0 : bdx / bdist;
        const bny = bdist === 0 ? -1 : bdy / bdist;
        b.x = bmp.x + bnx * (b.r + curR + 1);
        b.y = bmp.y + bny * (b.r + curR + 1);
        const speed = Math.max(380, Math.hypot(b.vx, b.vy) * kickSetting);
        b.vx = bnx * speed;
        b.vy = bny * speed;
        bmp.flash = 1.0;
        room.state.score += 500;
        if (room.state.sparks.length < 120) {
          for (let sp = 0; sp < 8; sp++) {
            room.state.sparks.push({
              x: b.x,
              y: b.y,
              vx: (Math.random() - 0.5) * 320,
              vy: (Math.random() - 0.5) * 320,
              c: pal.acc,
              life: 0.6
            });
          }
        }
      }
    }

    // Neon drop targets across upper lanes
    const tgY = 160;
    for (let ti = 0; ti < 4; ti++) {
      const tgX = 210 + ti * 60;
      if (b.x > tgX - 22 && b.x < tgX + 22 && Math.abs(b.y - tgY) < b.r + 10) {
        b.vy = Math.abs(b.vy) * 0.9 + 80;
        room.state.targetFlash[ti] = 1.0;
        if (!room.state.targets[ti]) {
          room.state.targets[ti] = true;
          room.state.score += 2000;
          // Multiball check
          let litCount = 0;
          for (let k = 0; k < 4; k++) if (room.state.targets[k]) litCount++;
          if (litCount >= requiredTargets) {
            room.state.score += 15000;
            room.state.bannerText = 'MULTIBALL!';
            room.state.bannerTimer = 2.8;
            room.state.targets = [false, false, false, false];
            if (room.state.balls.length < 4) {
              for (let mb = 0; mb < 2; mb++) {
                room.state.balls.push({
                  x: 270 + mb * 60,
                  y: 110,
                  vx: (mb === 0 ? -160 : 160),
                  vy: 240,
                  r: 12,
                  trail: []
                });
              }
            }
          }
        }
      }
    }

    // Drain check
    if (b.y > 890) {
      room.state.balls.splice(i, 1);
    }
  }
}

// Update bumper and target flashes
for (let i = 0; i < room.state.bumpers.length; i++) {
  room.state.bumpers[i].flash = Math.max(0, room.state.bumpers[i].flash - dt * 3.5);
}
for (let i = 0; i < 4; i++) {
  room.state.targetFlash[i] = Math.max(0, room.state.targetFlash[i] - dt * 4.0);
}

// Update and cap sparks
for (let i = room.state.sparks.length - 1; i >= 0; i--) {
  const s = room.state.sparks[i];
  s.life -= dt * 2.0;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  if (s.life <= 0) room.state.sparks.splice(i, 1);
}

// Update player activation pulses
for (let i = room.state.pulses.length - 1; i >= 0; i--) {
  const p = room.state.pulses[i];
  p.life -= dt * 2.5;
  if (p.life <= 0) room.state.pulses.splice(i, 1);
}

// RENDER PASS
// 1. Surrounding Room & Connected Audience Marquee
const crowd = room.people ?? [];
const crowdCount = crowd.length;
ctx.lineWidth = 2;

// Left margin audience column
const sideColWidth = tx > 60 ? tx - 20 : 0;
if (sideColWidth > 30) {
  const maxSlots = Math.min(20, Math.max(crowdCount, 4));
  const slotH = Math.min(50, (frame.height - 120) / maxSlots);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let idx = 0; idx < maxSlots; idx++) {
    const p = crowd[idx];
    const py = 90 + idx * slotH + slotH * 0.5;
    const hue = p ? p.hue : (idx * 45) % 360;
    const isActive = (triggerHueL === hue || triggerHueR === hue);
    const rad = (slotH * 0.32) * (isActive ? 1.4 : 1.0);

    ctx.beginPath();
    ctx.arc(tx * 0.45, py, Math.max(6, rad), 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 95%, ${isActive ? '75%' : '48%'})`;
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 100%, 85%)`;
    ctx.stroke();
  }
}

// Transform to virtual playfield
ctx.save();
ctx.translate(tx, ty);
ctx.scale(scale, scale);

// Playfield boundary glow & ambient lines
ctx.strokeStyle = pal.w;
ctx.lineWidth = 6;
ctx.strokeRect(60, 40, 480, 840);

ctx.strokeStyle = pal.p;
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(300, 220, 230, Math.PI, 0, false);
ctx.lineTo(530, 840);
ctx.lineTo(410, 840);
ctx.moveTo(70, 840);
ctx.lineTo(190, 840);
ctx.stroke();

// Internal decorative wireframe diagonals
ctx.strokeStyle = pal.off;
ctx.lineWidth = 1.5;
for (let gx = 100; gx < 520; gx += 40) {
  ctx.beginPath();
  ctx.moveTo(gx, 50);
  ctx.lineTo(gx, 840);
  ctx.stroke();
}

// Slingshot guide lanes
ctx.strokeStyle = pal.s;
ctx.lineWidth = 4;
ctx.beginPath();
ctx.moveTo(70, 640);
ctx.lineTo(190, 755);
ctx.moveTo(530, 640);
ctx.lineTo(410, 755);
ctx.stroke();

// Slingshot bounce triangles
ctx.fillStyle = pal.off;
ctx.beginPath();
ctx.moveTo(150, 620); ctx.lineTo(195, 715); ctx.lineTo(150, 715); ctx.closePath();
ctx.fill(); ctx.stroke();
ctx.beginPath();
ctx.moveTo(450, 620); ctx.lineTo(405, 715); ctx.lineTo(450, 715); ctx.closePath();
ctx.fill(); ctx.stroke();

// Draw Neon Drop Targets
const tgLabels = ['P', 'O', 'O', 'L'];
for (let ti = 0; ti < 4; ti++) {
  const tgX = 210 + ti * 60;
  const isLit = room.state.targets[ti];
  const flash = room.state.targetFlash[ti];
  ctx.fillStyle = flash > 0 ? '#ffffff' : (isLit ? pal.acc : pal.off);
  ctx.strokeStyle = isLit ? pal.acc : pal.p;
  ctx.lineWidth = 3;
  ctx.fillRect(tgX - 22, 148, 44, 16);
  ctx.strokeRect(tgX - 22, 148, 44, 16);

  ctx.fillStyle = isLit ? '#000000' : pal.p;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tgLabels[ti], tgX, 156);
}

// Draw Bumpers
for (let bi = 0; bi < room.state.bumpers.length; bi++) {
  const bmp = room.state.bumpers[bi];
  const bRad = bmp.r + audio.bass * 8;
  const flashCol = bmp.flash > 0 ? '#ffffff' : pal.acc;

  ctx.beginPath();
  ctx.arc(bmp.x, bmp.y, bRad + 6, 0, Math.PI * 2);
  ctx.strokeStyle = flashCol;
  ctx.lineWidth = 3 + bmp.flash * 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(bmp.x, bmp.y, bRad, 0, Math.PI * 2);
  ctx.fillStyle = bmp.flash > 0 ? pal.p : pal.off;
  ctx.fill();

  // Center core
  ctx.beginPath();
  ctx.arc(bmp.x, bmp.y, bRad * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = flashCol;
  ctx.fill();
}

// Draw Flippers
function drawFlipperBat(pivot, angle, lastHue, isLeft) {
  ctx.save();
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(angle);

  const batCol = lastHue !== null ? `hsl(${lastHue}, 100%, 65%)` : pal.p;
  ctx.fillStyle = batCol;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(fLen, -4);
  ctx.arc(fLen, 0, 4, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(0, 9);
  ctx.arc(0, 0, 9, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Pivot cap
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

drawFlipperBat(pivotL, room.state.flipperL.angle, room.state.flipperL.lastHue, true);
drawFlipperBat(pivotR, room.state.flipperR.angle, room.state.flipperR.lastHue, false);

// Draw Balls and neon trails
for (let i = 0; i < room.state.balls.length; i++) {
  const b = room.state.balls[i];
  b.trail.push({ x: b.x, y: b.y });
  if (b.trail.length > 8) b.trail.shift();

  // Trail line
  ctx.strokeStyle = pal.p;
  ctx.beginPath();
  for (let t = 0; t < b.trail.length; t++) {
    const tp = b.trail[t];
    if (t === 0) ctx.moveTo(tp.x, tp.y);
    else ctx.lineTo(tp.x, tp.y);
  }
  ctx.lineWidth = 3;
  ctx.stroke();

  // Ball body (glossy chrome neon)
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = pal.s;
  ctx.lineWidth = 3;
  ctx.stroke();
}

// Draw Sparks
for (let i = 0; i < room.state.sparks.length; i++) {
  const sp = room.state.sparks[i];
  ctx.fillStyle = sp.c;
  ctx.fillRect(sp.x - 2, sp.y - 2, 4, 4);
}

// Draw Audience Laser Pulses towards Flippers
for (let i = 0; i < room.state.pulses.length; i++) {
  const pulse = room.state.pulses[i];
  const isL = pulse.side === 'L';
  const targetP = isL ? pivotL : pivotR;
  const startX = isL ? 30 : 570;
  const startY = 820;

  ctx.save();
  ctx.globalAlpha = Math.max(0, pulse.life);
  ctx.strokeStyle = `hsl(${pulse.hue}, 100%, 70%)`;
  ctx.lineWidth = 5 * pulse.life;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(isL ? 90 : 510, 800, targetP.x, targetP.y);
  ctx.stroke();
  ctx.restore();
}

// 7-Segment Digit Renderer for DMD Pinball Display
function draw7SegDigit(x, y, w, h, digit, col, offCol) {
  const segMap = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
  const mask = segMap[digit] ?? 0;
  const th = h * 0.12;

  const drawBar = (on, bx, by, bw, bh) => {
    ctx.fillStyle = on ? col : offCol;
    ctx.fillRect(bx, by, bw, bh);
  };
  // a: top, b: top-right, c: bot-right, d: bottom, e: bot-left, f: top-left, g: mid
  drawBar(mask & 1, x + th * 0.4, y, w - th * 0.8, th);
  drawBar(mask & 2, x + w - th, y + th * 0.4, th, h * 0.5 - th * 0.6);
  drawBar(mask & 4, x + w - th, y + h * 0.5 + th * 0.2, th, h * 0.5 - th * 0.6);
  drawBar(mask & 8, x + th * 0.4, y + h - th, w - th * 0.8, th);
  drawBar(mask & 16, x, y + h * 0.5 + th * 0.2, th, h * 0.5 - th * 0.6);
  drawBar(mask & 32, x, y + th * 0.4, th, h * 0.5 - th * 0.6);
  drawBar(mask & 64, x + th * 0.4, y + h * 0.5 - th * 0.5, w - th * 0.8, th);
}

// Top DMD Scoreboard Panel
ctx.fillStyle = '#020409';
ctx.fillRect(110, 60, 380, 56);
ctx.strokeStyle = pal.p;
ctx.lineWidth = 3;
ctx.strokeRect(110, 60, 380, 56);

const curScore = Math.floor(room.state.displayScore);
const scoreStr = ('000000' + curScore).slice(-6);
const digitW = 26;
const digitH = 40;
const startX = 140;
for (let di = 0; di < 6; di++) {
  const d = parseInt(scoreStr[di], 10);
  draw7SegDigit(startX + di * (digitW + 6), 68, digitW, digitH, d, pal.acc, pal.off);
}

// Timer readout right side of DMD
const roundSec = Math.max(0, Math.ceil(room.state.roundTimer));
const timerStr = ('00' + roundSec).slice(-2);
for (let ti = 0; ti < 2; ti++) {
  const td = parseInt(timerStr[ti], 10);
  draw7SegDigit(415 + ti * (digitW * 0.7 + 4), 74, digitW * 0.7, digitH * 0.7, td, pal.s, pal.off);
}

// Central Flash Banner (MULTIBALL, GO!, GAME OVER)
if (room.state.bannerTimer > 0) {
  ctx.save();
  const alpha = Math.min(1.0, room.state.bannerTimer * 1.5);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000000dd';
  ctx.fillRect(80, 450, 440, 90);
  ctx.strokeStyle = pal.acc;
  ctx.lineWidth = 4;
  ctx.strokeRect(80, 450, 440, 90);

  ctx.fillStyle = pal.acc;
  ctx.font = '900 48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(room.state.bannerText, 300, 495);
  ctx.restore();
}

// Attract overlay prompt if in demo
if (isAttract && room.state.roundPhase === 'play') {
  ctx.save();
  const pulseAlpha = 0.55 + 0.45 * Math.sin(frame.t * 5);
  ctx.globalAlpha = pulseAlpha;
  ctx.fillStyle = pal.p;
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PRESS FLIPPERS TO JOIN!', 300, 580);
  ctx.restore();
}

// Flipper label guides at bottom
ctx.font = 'bold 15px monospace';
ctx.textAlign = 'center';
ctx.fillStyle = pal.p;
ctx.fillText('LEFT FLIPPER', 170, 830);
ctx.fillStyle = pal.s;
ctx.fillText('RIGHT FLIPPER', 430, 830);

ctx.restore();
ctx.restore();