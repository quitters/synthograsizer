const S = room.state;
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.04);

// Read Knob Controls
const themeName = getVar('arena_theme') || 'neon_cyber';
const patternName = getVar('brick_pattern') || 'classic_grid';
const speedKnob = getVar('ball_speed') ?? 2.5;
const padSizeKnob = getVar('paddle_size') ?? 110;
const trailMode = getVar('trail_style') || 'laser_sparks';

// Palettes
const palettes = {
  neon_cyber: { left: '#00f0ff', right: '#ff0077', lHue: 185, rHue: 330, bg: '#050711', grid: 'rgba(0, 240, 255, 0.08)' },
  solar_flare: { left: '#ffaa00', right: '#ff2200', lHue: 40, rHue: 10, bg: '#0d0402', grid: 'rgba(255, 120, 0, 0.08)' },
  emerald_matrix: { left: '#00ffaa', right: '#aaff00', lHue: 160, rHue: 80, bg: '#020d07', grid: 'rgba(0, 255, 140, 0.08)' },
  monochrome_vibe: { left: '#88ddff', right: '#ffddaa', lHue: 200, rHue: 30, bg: '#0a0a0c', grid: 'rgba(255, 255, 255, 0.07)' }
};
const pal = palettes[themeName] || palettes.neon_cyber;

// Helper to build brick wall
function generateBricks(pattern) {
  const bricks = [];
  const cols = 4;
  const rows = 8;
  const bH = (H - 200) / rows;
  const bW = Math.max(16, W * 0.024);
  const padLeftX = W * 0.025;
  const padRightX = W - W * 0.025 - cols * (bW + 6);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let keep = true;
      let hp = 1;
      if (pattern === 'checker_wave') {
        keep = (r + c) % 2 === 0;
      } else if (pattern === 'fortress') {
        if (c === 0) hp = 2;
        if (r === 3 || r === 4) keep = c === 0;
      } else if (pattern === 'diamond_mesh') {
        const dist = Math.abs(c - 1.5) + Math.abs(r - 3.5);
        keep = dist <= 3.8;
      }
      if (keep) {
        // Left side brick
        bricks.push({
          side: 'left',
          x: padLeftX + c * (bW + 6),
          y: 100 + r * bH + 4,
          w: bW,
          h: bH - 8,
          hp: hp,
          alive: true,
          hue: pal.lHue + (r * 4)
        });
        // Right side brick
        bricks.push({
          side: 'right',
          x: padRightX + c * (bW + 6),
          y: 100 + r * bH + 4,
          w: bW,
          h: bH - 8,
          hp: hp,
          alive: true,
          hue: pal.rHue - (r * 4)
        });
      }
    }
  }
  return bricks;
}

// Initialize State
if (!S.init) {
  S.init = true;
  S.round = 1;
  S.scoreL = 0;
  S.scoreR = 0;
  S.shake = 0;
  S.winTimer = 0;
  S.winner = null;
  S.lastPattern = patternName;
  S.bricks = generateBricks(patternName);
  S.particles = [];
  S.ball = {
    x: W / 2,
    y: H / 2,
    vx: 360,
    vy: 140,
    r: 9,
    speedMul: 1,
    trail: []
  };
  S.padL = { y: H / 2, dir: 1, impulse: 0, flash: 0 };
  S.padR = { y: H / 2, dir: -1, impulse: 0, flash: 0 };
}

// Rebuild bricks if pattern changed
if (S.lastPattern !== patternName) {
  S.bricks = generateBricks(patternName);
  S.lastPattern = patternName;
}

// Process Interactive Triggers
if (room.events && room.events.length > 0) {
  for (const e of room.events) {
    if (e.name === 'left_nudge') {
      S.padL.dir *= -1;
      S.padL.impulse = S.padL.dir * 380;
      S.padL.flash = 1.0;
      for (let i = 0; i < 8; i++) {
        S.particles.push({
          x: W * 0.16,
          y: S.padL.y + (Math.random() - 0.5) * padSizeKnob,
          vx: -120 - Math.random() * 150,
          vy: (Math.random() - 0.5) * 200,
          life: 0.5,
          col: pal.left,
          size: 4
        });
      }
    } else if (e.name === 'right_nudge') {
      S.padR.dir *= -1;
      S.padR.impulse = S.padR.dir * 380;
      S.padR.flash = 1.0;
      for (let i = 0; i < 8; i++) {
        S.particles.push({
          x: W * 0.84,
          y: S.padR.y + (Math.random() - 0.5) * padSizeKnob,
          vx: 120 + Math.random() * 150,
          vy: (Math.random() - 0.5) * 200,
          life: 0.5,
          col: pal.right,
          size: 4
        });
      }
    } else if (e.name === 'smash_boost') {
      S.ball.speedMul = Math.min(S.ball.speedMul + 0.35, 2.2);
      S.shake = 8;
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 90 + Math.random() * 180;
        S.particles.push({
          x: S.ball.x,
          y: S.ball.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.6,
          col: '#ffffff',
          size: 5
        });
      }
    }
  }
}

// Screen Shake Decay
S.shake = Math.max(0, S.shake - dt * 25);
const shakeX = S.shake ? (Math.random() - 0.5) * S.shake : 0;
const shakeY = S.shake ? (Math.random() - 0.5) * S.shake : 0;

// Paddle Physics & Tracking Dynamics
const halfPad = padSizeKnob / 2;
S.padL.impulse *= Math.exp(-dt * 5);
S.padR.impulse *= Math.exp(-dt * 5);
S.padL.flash = Math.max(0, S.padL.flash - dt * 3);
S.padR.flash = Math.max(0, S.padR.flash - dt * 3);

// Autonomous gentle tracking with bounce oscillation
const autoTrackSpeed = 120 + audio.level * 80;
S.padL.y += (S.padL.dir * autoTrackSpeed + S.padL.impulse) * dt;
S.padR.y += (S.padR.dir * autoTrackSpeed + S.padR.impulse) * dt;

// AI bias towards ball if close
if (S.ball.vx < 0 && S.ball.x < W * 0.45) {
  S.padL.y += (S.ball.y - S.padL.y) * dt * 2.2;
}
if (S.ball.vx > 0 && S.ball.x > W * 0.55) {
  S.padR.y += (S.ball.y - S.padR.y) * dt * 2.2;
}

// Clamp paddles
const topBound = 80 + halfPad;
const botBound = H - 60 - halfPad;
if (S.padL.y < topBound) { S.padL.y = topBound; S.padL.dir = 1; }
if (S.padL.y > botBound) { S.padL.y = botBound; S.padL.dir = -1; }
if (S.padR.y < topBound) { S.padR.y = topBound; S.padR.dir = 1; }
if (S.padR.y > botBound) { S.padR.y = botBound; S.padR.dir = -1; }

// Ball Substepping Physics
const subSteps = 3;
const subDt = dt / subSteps;
const padLX = W * 0.16;
const padRX = W * 0.84;
const padW = 16;

for (let step = 0; step < subSteps; step++) {
  if (S.winTimer <= 0) {
    const curSpeed = (180 + speedKnob * 70) * S.ball.speedMul;
    const velLen = Math.hypot(S.ball.vx, S.ball.vy) || 1;
    const vxNorm = (S.ball.vx / velLen) * curSpeed;
    const vyNorm = (S.ball.vy / velLen) * curSpeed;

    S.ball.x += vxNorm * subDt;
    S.ball.y += vyNorm * subDt;

    // Top / Bottom Arena Bounces
    if (S.ball.y - S.ball.r < 70) {
      S.ball.y = 70 + S.ball.r;
      S.ball.vy = Math.abs(S.ball.vy);
    }
    if (S.ball.y + S.ball.r > H - 50) {
      S.ball.y = H - 50 - S.ball.r;
      S.ball.vy = -Math.abs(S.ball.vy);
    }

    // Paddle Left Collision
    if (S.ball.vx < 0 &&
        S.ball.x - S.ball.r <= padLX + padW / 2 &&
        S.ball.x + S.ball.r >= padLX - padW / 2 &&
        Math.abs(S.ball.y - S.padL.y) <= halfPad + S.ball.r) {
      const norm = Math.max(-1, Math.min(1, (S.ball.y - S.padL.y) / halfPad));
      const bounceAngle = norm * (Math.PI * 0.38);
      const sp = Math.hypot(S.ball.vx, S.ball.vy);
      S.ball.vx = Math.cos(bounceAngle) * sp;
      S.ball.vy = Math.sin(bounceAngle) * sp + S.padL.impulse * 0.15;
      S.ball.x = padLX + padW / 2 + S.ball.r + 1;
      S.padL.flash = 0.9;
      S.shake = 3.5;
    }

    // Paddle Right Collision
    if (S.ball.vx > 0 &&
        S.ball.x + S.ball.r >= padRX - padW / 2 &&
        S.ball.x - S.ball.r <= padRX + padW / 2 &&
        Math.abs(S.ball.y - S.padR.y) <= halfPad + S.ball.r) {
      const norm = Math.max(-1, Math.min(1, (S.ball.y - S.padR.y) / halfPad));
      const bounceAngle = norm * (Math.PI * 0.38);
      const sp = Math.hypot(S.ball.vx, S.ball.vy);
      S.ball.vx = -Math.cos(bounceAngle) * sp;
      S.ball.vy = Math.sin(bounceAngle) * sp + S.padR.impulse * 0.15;
      S.ball.x = padRX - padW / 2 - S.ball.r - 1;
      S.padR.flash = 0.9;
      S.shake = 3.5;
    }

    // Brick Collisions
    for (let i = 0; i < S.bricks.length; i++) {
      const b = S.bricks[i];
      if (!b.alive) continue;
      if (S.ball.x + S.ball.r > b.x && S.ball.x - S.ball.r < b.x + b.w &&
          S.ball.y + S.ball.r > b.y && S.ball.y - S.ball.r < b.y + b.h) {
        b.hp--;
        if (b.hp <= 0) b.alive = false;

        // Reflect ball
        const overlapLeft = Math.abs((S.ball.x + S.ball.r) - b.x);
        const overlapRight = Math.abs((S.ball.x - S.ball.r) - (b.x + b.w));
        const overlapTop = Math.abs((S.ball.y + S.ball.r) - b.y);
        const overlapBottom = Math.abs((S.ball.y - S.ball.r) - (b.y + b.h));
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if (minOverlap === overlapLeft || minOverlap === overlapRight) {
          S.ball.vx = -S.ball.vx;
        } else {
          S.ball.vy = -S.ball.vy;
        }

        S.shake = 4.5;
        // Particles
        for (let p = 0; p < 6; p++) {
          const ang = Math.random() * Math.PI * 2;
          const pSp = 70 + Math.random() * 150;
          S.particles.push({
            x: b.x + b.w / 2,
            y: b.y + b.h / 2,
            vx: Math.cos(ang) * pSp,
            vy: Math.sin(ang) * pSp,
            life: 0.65,
            col: `hsl(${b.hue}, 100%, 65%)`,
            size: 4
          });
        }

        // Check Round Victory
        let leftAlive = 0;
        let rightAlive = 0;
        for (let j = 0; j < S.bricks.length; j++) {
          if (S.bricks[j].alive) {
            if (S.bricks[j].side === 'left') leftAlive++;
            else rightAlive++;
          }
        }
        if (leftAlive === 0) {
          S.winner = 'RIGHT';
          S.scoreR++;
          S.winTimer = 3.2;
        } else if (rightAlive === 0) {
          S.winner = 'LEFT';
          S.scoreL++;
          S.winTimer = 3.2;
        }
        break;
      }
    }

    // Screen boundary bounce if ball gets behind wall
    if (S.ball.x - S.ball.r < 10) {
      S.ball.x = 10 + S.ball.r;
      S.ball.vx = Math.abs(S.ball.vx);
    }
    if (S.ball.x + S.ball.r > W - 10) {
      S.ball.x = W - 10 - S.ball.r;
      S.ball.vx = -Math.abs(S.ball.vx);
    }
  }
}

// Ball trail history
S.ball.trail.push({ x: S.ball.x, y: S.ball.y, t: frame.t });
if (S.ball.trail.length > 20) S.ball.trail.shift();

// Handle Round Reset / Win Timer
if (S.winTimer > 0) {
  S.winTimer -= dt;
  if (S.winTimer <= 0) {
    S.round++;
    S.winner = null;
    S.bricks = generateBricks(patternName);
    S.ball.x = W / 2;
    S.ball.y = H / 2;
    S.ball.speedMul = 1.0;
    S.ball.vx = (S.round % 2 === 0 ? 1 : -1) * (200 + speedKnob * 60);
    S.ball.vy = (Math.random() - 0.5) * 200;
    S.shake = 10;
  }
}

// Update Particles
for (let i = S.particles.length - 1; i >= 0; i--) {
  const p = S.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt * 1.5;
  if (p.life <= 0) {
    S.particles.splice(i, 1);
  }
}
while (S.particles.length > 180) S.particles.shift();

// ==================== RENDERING ====================
ctx.save();
ctx.translate(shakeX, shakeY);

// Dark arena background
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Audio reactive arena floor grid
ctx.lineWidth = 1;
ctx.strokeStyle = pal.grid;
const gridStep = 40;
ctx.beginPath();
for (let gx = 0; gx < W; gx += gridStep) {
  ctx.moveTo(gx, 70);
  ctx.lineTo(gx, H - 50);
}
for (let gy = 70; gy < H - 50; gy += gridStep) {
  ctx.moveTo(0, gy);
  ctx.lineTo(W, gy);
}
ctx.stroke();

// Central Net & Court boundaries
ctx.save();
const netPulse = 2 + audio.bass * 6;
ctx.lineWidth = netPulse;
ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 + audio.mid * 0.4})`;
ctx.setLineDash([12, 14]);
ctx.beginPath();
ctx.moveTo(W / 2, 70);
ctx.lineTo(W / 2, H - 50);
ctx.stroke();
ctx.restore();

// Outer Arena borders
ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + audio.bass * 0.4})`;
ctx.lineWidth = 2 + audio.beat * 3;
ctx.strokeRect(10, 70, W - 20, H - 120);

// Header / Scoreboard HUD
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 15px monospace';
ctx.fillText(`ROUND ${S.round}`, W / 2, 30);

// Score & Brick counters
let leftCount = 0;
let rightCount = 0;
for (const b of S.bricks) {
  if (b.alive) {
    if (b.side === 'left') leftCount++;
    else rightCount++;
  }
}

ctx.font = '900 32px sans-serif';
ctx.fillStyle = pal.left;
ctx.fillText(`${S.scoreL}`, W / 2 - 80, 34);
ctx.font = 'bold 12px monospace';
ctx.fillText(`WALL: ${leftCount}`, W * 0.16, 48);

ctx.font = '900 32px sans-serif';
ctx.fillStyle = pal.right;
ctx.fillText(`${S.scoreR}`, W / 2 + 80, 34);
ctx.font = 'bold 12px monospace';
ctx.fillText(`WALL: ${rightCount}`, W * 0.84, 48);

// Audience spectator beacons
if (room.people && room.people.length > 0) {
  ctx.save();
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const px = ((i + 1) / (room.people.length + 1)) * W;
    const py = H - 25;
    ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
    ctx.beginPath();
    ctx.arc(px, py, 4 + audio.level * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, 0.25)`;
    ctx.beginPath();
    ctx.arc(px, py, 8 + audio.bass * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Render Bricks
for (const b of S.bricks) {
  if (!b.alive) continue;
  ctx.save();
  const isLeft = b.side === 'left';
  ctx.fillStyle = isLeft ? pal.left : pal.right;
  ctx.globalAlpha = b.hp > 1 ? 1.0 : 0.75;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 6 + audio.treble * 8;
  ctx.fillRect(b.x, b.y, b.w, b.h);

  // Inner core glow
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.4 + (b.hp > 1 ? 0.3 : 0);
  ctx.fillRect(b.x + 3, b.y + 3, Math.max(1, b.w - 6), Math.max(1, b.h - 6));
  ctx.restore();
}

// Render Ball Trail
if (S.ball.trail.length > 1) {
  ctx.save();
  for (let i = 1; i < S.ball.trail.length; i++) {
    const p1 = S.ball.trail[i - 1];
    const p2 = S.ball.trail[i];
    const factor = i / S.ball.trail.length;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    if (trailMode === 'laser_sparks') {
      ctx.strokeStyle = `rgba(255, 255, 255, ${factor * 0.7})`;
      ctx.lineWidth = factor * 5;
    } else if (trailMode === 'plasma_ribbon') {
      ctx.strokeStyle = S.ball.vx > 0 ? pal.left : pal.right;
      ctx.globalAlpha = factor * 0.8;
      ctx.lineWidth = factor * (8 + audio.mid * 10);
    } else {
      ctx.strokeStyle = `rgba(180, 220, 255, ${factor * 0.4})`;
      ctx.lineWidth = factor * 14;
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Render Ball
ctx.save();
const ballColor = S.ball.vx > 0 ? pal.left : pal.right;
const ballR = S.ball.r + audio.bass * 4;
ctx.shadowColor = ballColor;
ctx.shadowBlur = 14 + audio.level * 18;
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(S.ball.x, S.ball.y, ballR, 0, Math.PI * 2);
ctx.fill();
ctx.strokeStyle = ballColor;
ctx.lineWidth = 3;
ctx.stroke();
ctx.restore();

// Render Paddles
function drawPaddle(x, y, padH, color, flash, dir, isLeft) {
  ctx.save();
  const halfH = padH / 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 + flash * 20 + audio.beat * 10;

  // Paddle Body Capsule
  ctx.fillStyle = flash > 0.1 ? '#ffffff' : color;
  ctx.beginPath();
  ctx.roundRect(x - padW / 2, y - halfH, padW, padH, 8);
  ctx.fill();

  // Glowing core
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(x - 3, y - halfH + 8, 6, padH - 16, 3);
  ctx.fill();

  // Thruster jet flares
  ctx.fillStyle = color;
  ctx.beginPath();
  const flameY = dir > 0 ? y - halfH : y + halfH;
  const flameLen = (12 + audio.bass * 16) * (dir > 0 ? -1 : 1);
  ctx.moveTo(x - padW / 2 + 2, flameY);
  ctx.lineTo(x + padW / 2 - 2, flameY);
  ctx.lineTo(x, flameY + flameLen);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

drawPaddle(padLX, S.padL.y, padSizeKnob, pal.left, S.padL.flash, S.padL.dir, true);
drawPaddle(padRX, S.padR.y, padSizeKnob, pal.right, S.padR.flash, S.padR.dir, false);

// Render Particles
ctx.save();
for (const p of S.particles) {
  ctx.fillStyle = p.col;
  ctx.globalAlpha = Math.max(0, p.life);
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// Victory Banner Overlay
if (S.winner) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, H / 2 - 70, W, 140);

  const winCol = S.winner === 'LEFT' ? pal.left : pal.right;
  ctx.shadowColor = winCol;
  ctx.shadowBlur = 24;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = winCol;
  ctx.font = '900 42px sans-serif';
  ctx.fillText(`${S.winner} TEAM DESTROYED THE SHIELD!`, W / 2, H / 2 - 14);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`NEXT ROUND IN ${Math.ceil(S.winTimer)}...`, W / 2, H / 2 + 28);
  ctx.restore();
}

ctx.restore();