const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);
const now = frame.t;

// Init persistent state once
room.state.balls ??= [];
room.state.bricks ??= [];
room.state.sparks ??= [];
room.state.rings ??= [];
room.state.paddleX ??= 0.5;
room.state.score ??= 0;
room.state.combo ??= 0;
room.state.level ??= 1;
room.state.lastInput ??= now;
room.state.lastPaddleVal ??= -1;
room.state.banner ??= { text: 'READY', sub: 'LAUNCH A BALL!', t: 2.5, hue: 45 };

const style = getVar('brick_style') ?? 'Neon Grid';
const speedChoice = getVar('ball_speed') ?? 'Standard';
const speedMults = { 'Standard': 1.0, 'Turbo': 1.45, 'Overdrive': 1.9 };
const speedMult = speedMults[speedChoice] ?? 1.0;
const paddleWidthPct = ((getVar('paddle_width') ?? 18) / 100);
const paddlePosVal = getVar('paddle_pos') ?? 50;
const trails = getVar('trails') ?? true;

// Detect paddle control movement
if (Math.abs(paddlePosVal - room.state.lastPaddleVal) > 0.5) {
  room.state.lastInput = now;
  room.state.lastPaddleVal = paddlePosVal;
}

// Process trigger events
const activePeople = (room.people && room.people.length > 0) ? room.people : [{ id: 'p0', hue: 195 }];
let launchedThisFrame = false;

if (room.events && room.events.length > 0) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    if (ev.name === 'launch') {
      room.state.lastInput = now;
      const person = activePeople.find(p => p.id === ev.participantId);
      const ballHue = person ? person.hue : ((room.state.balls.length * 67 + (now * 50)) % 360);
      if (room.state.balls.length < 18) {
        const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.1;
        const baseSpd = (0.55 + Math.random() * 0.15) * H;
        room.state.balls.push({
          x: room.state.paddleX * W,
          y: H * 0.86,
          vx: Math.cos(angle) * baseSpd,
          vy: Math.sin(angle) * baseSpd,
          hue: ballHue,
          r: Math.max(9, W * 0.009),
          power: 1
        });
        launchedThisFrame = true;
        room.state.rings.push({ x: room.state.paddleX * W, y: H * 0.88, r: 10, maxR: W * 0.15, hue: ballHue, life: 1 });
      }
    } else if (ev.name === 'pulse') {
      room.state.lastInput = now;
      room.state.rings.push({ x: W * 0.5, y: H * 0.5, r: 20, maxR: W * 0.8, hue: 50, life: 1 });
      for (let b = 0; b < room.state.balls.length; b++) {
        room.state.balls[b].vy = -Math.abs(room.state.balls[b].vy) * 1.2;
        room.state.balls[b].power = 2;
      }
    }
  }
}

// Attract mode: auto-play if idle
const isIdle = (now - room.state.lastInput) > 4.5;
let targetPaddleX = paddlePosVal / 100;
if (isIdle) {
  if (room.state.balls.length === 0) {
    // Auto spawn in attract mode
    const randHue = (now * 40) % 360;
    const angle = -Math.PI * 0.5 + (Math.sin(now * 2) * 0.6);
    room.state.balls.push({
      x: room.state.paddleX * W,
      y: H * 0.86,
      vx: Math.cos(angle) * H * 0.6,
      vy: Math.sin(angle) * H * 0.6,
      hue: randHue,
      r: Math.max(9, W * 0.009),
      power: 1
    });
  }
  let closestBall = null;
  let maxBallY = -1;
  for (let b = 0; b < room.state.balls.length; b++) {
    const ball = room.state.balls[b];
    if (ball.vy > 0 && ball.y > maxBallY) {
      maxBallY = ball.y;
      closestBall = ball;
    }
  }
  if (closestBall) {
    targetPaddleX = closestBall.x / W;
  } else {
    targetPaddleX = 0.5 + Math.sin(now * 1.2) * 0.3;
  }
}

// Smooth paddle motion
const paddleLerp = Math.min(1, dt * 14);
room.state.paddleX += (targetPaddleX - room.state.paddleX) * paddleLerp;
room.state.paddleX = Math.max(paddleWidthPct * 0.5, Math.min(1 - paddleWidthPct * 0.5, room.state.paddleX));

const paddleW = paddleWidthPct * W;
const paddleH = Math.max(14, H * 0.024);
const paddleY = H * 0.88;
const paddleX1 = (room.state.paddleX * W) - paddleW * 0.5;
const paddleX2 = paddleX1 + paddleW;

// Brick setup helper
const buildBricks = (lvl) => {
  const cols = 9 + Math.min(lvl, 5);
  const rows = 4 + Math.min(lvl, 4);
  const topY = H * 0.12;
  const gridH = H * 0.32;
  const padX = W * 0.06;
  const availW = W - padX * 2;
  const bw = (availW / cols) - 6;
  const bh = (gridH / rows) - 6;
  const bricks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let hue = 0;
      if (style === 'Neon Grid') {
        hue = (c / cols * 180 + r * 30 + lvl * 40) % 360;
      } else if (style === 'Rainbow Citadel') {
        hue = ((c + r * 2) * 32 + lvl * 50) % 360;
      } else {
        hue = (190 + (r * 35) + (c % 2) * 20) % 360;
      }
      const maxHp = 1 + (r === 0 ? 1 : 0) + (lvl > 2 && (r + c) % 4 === 0 ? 1 : 0);
      bricks.push({
        x: padX + c * (bw + 6),
        y: topY + r * (bh + 6),
        w: bw,
        h: bh,
        hp: maxHp,
        maxHp: maxHp,
        hue: hue,
        alive: true
      });
    }
  }
  return bricks;
};

if (room.state.bricks.length === 0) {
  room.state.bricks = buildBricks(room.state.level);
}

// Check active bricks
let activeBrickCount = 0;
for (let i = 0; i < room.state.bricks.length; i++) {
  if (room.state.bricks[i].alive) activeBrickCount++;
}

if (activeBrickCount === 0) {
  room.state.level++;
  room.state.bricks = buildBricks(room.state.level);
  room.state.banner = { text: 'STAGE CLEARED!', sub: 'LEVEL ' + room.state.level, t: 2.8, hue: 120 };
  room.state.rings.push({ x: W * 0.5, y: H * 0.3, r: 10, maxR: W * 0.9, hue: 120, life: 1 });
}

// Update Balls
for (let b = room.state.balls.length - 1; b >= 0; b--) {
  const ball = room.state.balls[b];
  ball.x += ball.vx * speedMult * dt;
  ball.y += ball.vy * speedMult * dt;

  // Wall bounce (left / right)
  if (ball.x - ball.r < 10) {
    ball.x = 10 + ball.r;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x + ball.r > W - 10) {
    ball.x = W - 10 - ball.r;
    ball.vx = -Math.abs(ball.vx);
  }

  // Ceiling bounce
  if (ball.y - ball.r < 8) {
    ball.y = 8 + ball.r;
    ball.vy = Math.abs(ball.vy);
  }

  // Paddle collision
  if (ball.vy > 0 && (ball.y + ball.r >= paddleY) && (ball.y - ball.r <= paddleY + paddleH)) {
    if (ball.x >= paddleX1 - 8 && ball.x <= paddleX2 + 8) {
      ball.y = paddleY - ball.r;
      const hitNorm = (ball.x - (paddleX1 + paddleW * 0.5)) / (paddleW * 0.5);
      const bounceAngle = -Math.PI * 0.5 + hitNorm * (Math.PI * 0.38);
      const currentSpd = Math.hypot(ball.vx, ball.vy) * (1 + (audio.bass || 0) * 0.2);
      ball.vx = Math.sin(bounceAngle) * currentSpd;
      ball.vy = -Math.cos(bounceAngle) * currentSpd;
      room.state.combo = 0;

      // Spark spray from paddle
      for (let p = 0; p < 8; p++) {
        if (room.state.sparks.length < 120) {
          const ang = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.5;
          const sp = (100 + Math.random() * 260);
          room.state.sparks.push({
            x: ball.x, y: paddleY, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            hue: ball.hue, life: 1, maxLife: 0.4 + Math.random() * 0.3, size: 3 + Math.random() * 4
          });
        }
      }
    }
  }

  // Brick collision
  for (let k = 0; k < room.state.bricks.length; k++) {
    const br = room.state.bricks[k];
    if (!br.alive) continue;
    if (ball.x + ball.r > br.x && ball.x - ball.r < br.x + br.w &&
        ball.y + ball.r > br.y && ball.y - ball.r < br.y + br.h) {
      
      // Simple rebound direction check
      const overlapLeft = (ball.x + ball.r) - br.x;
      const overlapRight = (br.x + br.w) - (ball.x - ball.r);
      const overlapTop = (ball.y + ball.r) - br.y;
      const overlapBottom = (br.y + br.h) - (ball.y - ball.r);
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

      if (minOverlap === overlapLeft || minOverlap === overlapRight) {
        ball.vx = -ball.vx;
      } else {
        ball.vy = -ball.vy;
      }

      br.hp -= ball.power;
      room.state.score += 50 * (1 + room.state.combo);
      room.state.combo++;

      if (br.hp <= 0) {
        br.alive = false;
        // Burst fragments
        const fragCount = 10;
        for (let f = 0; f < fragCount; f++) {
          if (room.state.sparks.length < 120) {
            const fa = Math.random() * Math.PI * 2;
            const fspd = 80 + Math.random() * 220;
            room.state.sparks.push({
              x: br.x + br.w * 0.5, y: br.y + br.h * 0.5,
              vx: Math.cos(fa) * fspd, vy: Math.sin(fa) * fspd,
              hue: br.hue, life: 1, maxLife: 0.5 + Math.random() * 0.4,
              size: 4 + Math.random() * 6
            });
          }
        }
      } else {
        // Hit flash
        br.flash = 1.0;
      }
      break;
    }
  }

  // Drop out at bottom
  if (ball.y - ball.r > H + 20) {
    room.state.balls.splice(b, 1);
  }
}

// Update sparks
for (let i = room.state.sparks.length - 1; i >= 0; i--) {
  const s = room.state.sparks[i];
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.vy += 300 * dt; // gravity
  s.life -= dt / s.maxLife;
  if (s.life <= 0) room.state.sparks.splice(i, 1);
}

// Update expanding rings
for (let i = room.state.rings.length - 1; i >= 0; i--) {
  const r = room.state.rings[i];
  r.r += (r.maxR - r.r) * dt * 5;
  r.life -= dt * 1.5;
  if (r.life <= 0) room.state.rings.splice(i, 1);
}

// Update banner
if (room.state.banner && room.state.banner.t > 0) {
  room.state.banner.t -= dt;
}

// --- DRAWING ---
ctx.save();

// Dark sports-arena backdrop with subtle speed trail
if (trails) {
  ctx.fillStyle = 'rgba(7, 9, 18, 0.35)';
  ctx.fillRect(0, 0, W, H);
} else {
  ctx.fillStyle = '#070912';
  ctx.fillRect(0, 0, W, H);
}

// Arena grid lines
ctx.lineWidth = 1;
ctx.strokeStyle = 'rgba(40, 60, 110, 0.15)';
const gridStep = W / 16;
for (let gx = 0; gx <= W; gx += gridStep) {
  ctx.beginPath();
  ctx.moveTo(gx, 0);
  ctx.lineTo(gx, H);
  ctx.stroke();
}

// Expanding shockwave rings
for (let i = 0; i < room.state.rings.length; i++) {
  const ring = room.state.rings[i];
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${ring.hue}, 95%, 65%, ${Math.max(0, ring.life)})`;
  ctx.lineWidth = 4 * ring.life;
  ctx.stroke();
}

// Draw Bricks
const bassKick = (audio.bass || 0) * 4;
for (let i = 0; i < room.state.bricks.length; i++) {
  const br = room.state.bricks[i];
  if (!br.alive) continue;
  const hpRatio = br.hp / br.maxHp;
  const light = 45 + hpRatio * 20 + (br.flash ? 30 : 0);
  if (br.flash) br.flash = Math.max(0, br.flash - dt * 4);

  ctx.fillStyle = `hsl(${br.hue}, 90%, ${light}%)`;
  ctx.fillRect(br.x, br.y, br.w, br.h);

  // Inner neon border
  ctx.strokeStyle = `hsl(${br.hue}, 100%, 75%)`;
  ctx.lineWidth = 2 + bassKick;
  ctx.strokeRect(br.x + 1, br.y + 1, br.w - 2, br.h - 2);

  // Core gleam
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(br.x + 3, br.y + 3, br.w - 6, Math.max(2, br.h * 0.25));
}

// Draw Sparks / Fragments
for (let i = 0; i < room.state.sparks.length; i++) {
  const s = room.state.sparks[i];
  ctx.fillStyle = `hsla(${s.hue}, 100%, 65%, ${Math.max(0, s.life)})`;
  ctx.fillRect(s.x - s.size * 0.5, s.y - s.size * 0.5, s.size, s.size);
}

// Draw Paddle
const paddlePulse = 1 + (audio.level || 0) * 0.2;
const currentPaddleHue = (now * 50) % 360;
ctx.fillStyle = `hsl(${currentPaddleHue}, 90%, 60%)`;
ctx.shadowColor = `hsl(${currentPaddleHue}, 100%, 50%)`;
ctx.shadowBlur = 15;

// Paddle body with round caps
const rad = paddleH * 0.5;
ctx.beginPath();
ctx.roundRect(paddleX1, paddleY, paddleW, paddleH, rad);
ctx.fill();

// Paddle glowing core line
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(paddleX1 + rad, paddleY + rad);
ctx.lineTo(paddleX2 - rad, paddleY + rad);
ctx.stroke();
ctx.shadowBlur = 0;

// Draw Balls
for (let b = 0; b < room.state.balls.length; b++) {
  const ball = room.state.balls[b];
  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${ball.hue}, 100%, 68%)`;
  ctx.shadowColor = `hsl(${ball.hue}, 100%, 60%)`;
  ctx.shadowBlur = 18;
  ctx.fill();

  // Hot white center
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

// HUD: Score & Active Players
ctx.textAlign = 'left';
ctx.textBaseline = 'top';
ctx.font = '900 28px sans-serif';
ctx.fillStyle = '#ffffff';
ctx.fillText(`SCORE ${room.state.score}`, W * 0.05, H * 0.035);

ctx.textAlign = 'right';
ctx.fillStyle = isIdle ? '#ffaa44' : '#00ffcc';
ctx.font = '700 20px sans-serif';
const statusTxt = isIdle ? 'ATTRACT MODE (PRESS LAUNCH)' : `LVL ${room.state.level}  •  ${room.state.balls.length}/18 BALLS`;
ctx.fillText(statusTxt, W * 0.95, H * 0.038);

// Room player badges along the bottom floor
const pCount = activePeople.length;
const badgeSpacing = Math.min(42, (W * 0.8) / Math.max(1, pCount));
const badgeStartX = (W - (pCount - 1) * badgeSpacing) * 0.5;
const badgeY = H * 0.955;

for (let i = 0; i < pCount; i++) {
  const p = activePeople[i];
  const bx = badgeStartX + i * badgeSpacing;
  ctx.beginPath();
  ctx.arc(bx, badgeY, 9, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${p.hue}, 85%, 55%)`;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Center Banner for game events
if (room.state.banner && room.state.banner.t > 0) {
  const alpha = Math.min(1, room.state.banner.t * 2);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 64px sans-serif';
  ctx.fillStyle = `hsla(${room.state.banner.hue}, 100%, 65%, ${alpha})`;
  ctx.shadowColor = `hsla(${room.state.banner.hue}, 100%, 50%, 0.8)`;
  ctx.shadowBlur = 24;
  ctx.fillText(room.state.banner.text, W * 0.5, H * 0.55);

  if (room.state.banner.sub) {
    ctx.font = '700 28px sans-serif';
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
    ctx.shadowBlur = 10;
    ctx.fillText(room.state.banner.sub, W * 0.5, H * 0.63);
  }
  ctx.restore();
}

ctx.restore();