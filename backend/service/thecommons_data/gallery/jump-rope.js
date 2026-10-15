const W = frame.width;
const H = frame.height;
const baseSpeed = getVar('base_tempo') ?? 1.4;
const ropeStyle = getVar('rope_style') ?? 'neon_glow';
const courtStyle = getVar('backdrop') ?? 'midnight_asphalt';
const showConfetti = getVar('confetti') ?? true;

// Persistent game state
room.state.initialized ??= true;
room.state.phase ??= 'play'; // 'play', 'round_win'
room.state.ropeAngle ??= 0;
room.state.roundScore ??= 0;
room.state.roundTimer ??= 0;
room.state.lastInputTime ??= frame.t;
room.state.bannerTimer ??= 2.0;
room.state.bannerText ??= 'GET READY!';
room.state.winnerName ??= '';
room.state.winnerHue ??= 45;
room.state.particles ??= [];
room.state.pops ??= [];
room.state.jumpers ??= [];

const S = room.state;

// Collect active IDs from room.people or provide fallback bots
const people = (room.people && room.people.length > 0) ? room.people : [
  { id: 'bot-1', hue: 45, isBot: true },
  { id: 'bot-2', hue: 140, isBot: true },
  { id: 'bot-3', hue: 200, isBot: true },
  { id: 'bot-4', hue: 280, isBot: true },
  { id: 'bot-5', hue: 340, isBot: true }
];

// Synchronize jumpers roster
const targetIds = new Set(people.map(p => p.id));
S.jumpers = S.jumpers.filter(j => targetIds.has(j.id));

for (let i = 0; i < people.length; i++) {
  const p = people[i];
  let j = S.jumpers.find(item => item.id === p.id);
  if (!j) {
    j = {
      id: p.id,
      hue: p.hue ?? (i * 57) % 360,
      alive: true,
      yOffset: 0,
      vy: 0,
      jumpTimer: 0,
      score: 0,
      isBot: !!p.isBot,
      flash: 0,
      cheer: 0
    };
    S.jumpers.push(j);
  } else {
    j.hue = p.hue ?? j.hue;
    j.isBot = !!p.isBot;
  }
}

// Handle events (human jumps)
let anyInput = false;
if (room.events && room.events.length > 0) {
  for (const e of room.events) {
    if (e.name === 'jump') {
      anyInput = true;
      S.lastInputTime = frame.t;
      let target = S.jumpers.find(j => j.id === e.participantId);
      if (!target && S.jumpers.length > 0) {
        // Fallback for anonymous trigger
        const aliveOnes = S.jumpers.filter(j => j.alive && j.yOffset <= 1);
        if (aliveOnes.length > 0) target = aliveOnes[0];
      }
      if (target && target.alive && target.yOffset <= 2) {
        target.vy = -18;
        target.flash = 1.0;
        S.pops.push({ x: target.screenX || W * 0.5, y: (target.screenY || H * 0.65) - 40, text: 'HOP!', hue: target.hue, t: 0.5 });
      }
    }
  }
}

// Attract mode auto-jump if idle > 4.5 seconds
const idle = (frame.t - S.lastInputTime) > 4.5;

// Rope dynamics
const dangerSpeedMult = 1.0 + Math.min(S.roundScore * 0.05, 1.2);
const musicKick = (audio && audio.beat) ? 0.35 : 0;
const currentSpeed = (baseSpeed + musicKick) * dangerSpeedMult;
const prevAngle = S.ropeAngle;
S.ropeAngle = (S.ropeAngle + currentSpeed * Math.PI * 2 * frame.dt) % (Math.PI * 2);

// Danger sweep: rope hits the floor when angle crosses PI (from top to bottom)
const crossedBottom = (prevAngle < Math.PI && S.ropeAngle >= Math.PI) || (prevAngle > 5.5 && S.ropeAngle < 1.0);

// Ground baseline
const floorY = H * 0.72;
const turnerLeft = { x: W * 0.12, y: floorY - 30 };
const turnerRight = { x: W * 0.88, y: floorY - 30 };

// Layout jumpers across the rope width
const totalJumpers = Math.max(1, S.jumpers.length);
const spanStart = W * 0.23;
const spanEnd = W * 0.77;
const slotW = (spanEnd - spanStart) / (totalJumpers + 1);

// Attract mode AI jump decision
if (idle || people.some(p => p.isBot)) {
  for (let i = 0; i < S.jumpers.length; i++) {
    const j = S.jumpers[i];
    if (j.alive && (idle || j.isBot) && j.yOffset <= 2) {
      // Jump ahead of bottom crossing
      const distToBottom = (Math.PI - S.ropeAngle + Math.PI * 2) % (Math.PI * 2);
      if (distToBottom < 0.95 && distToBottom > 0.4) {
        // Intentional occasional slip in attract mode so round progresses
        const failChance = (S.roundScore > 8) ? 0.22 : 0.08;
        if (Math.random() > failChance) {
          j.vy = -18;
          j.flash = 0.8;
        }
      }
    }
  }
}

// Update jumpers physics and collisions
let aliveCount = 0;
let lastAlive = null;

for (let i = 0; i < S.jumpers.length; i++) {
  const j = S.jumpers[i];
  j.screenX = spanStart + slotW * (i + 1);
  j.screenY = floorY;

  // Jump arc physics
  if (j.yOffset > 0 || j.vy < 0) {
    j.yOffset += -j.vy;
    j.vy += 38 * frame.dt; // gravity
    if (j.yOffset <= 0) {
      j.yOffset = 0;
      j.vy = 0;
    }
  }
  if (j.flash > 0) j.flash = Math.max(0, j.flash - frame.dt * 3);

  if (j.alive) {
    aliveCount++;
    lastAlive = j;

    // Check collision on bottom cross
    if (crossedBottom) {
      // Clearance height: need at least 26px air
      if (j.yOffset < 28) {
        j.alive = false;
        j.flash = 2.0;
        // Tangle particle burst
        for (let p = 0; p < 18; p++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 60 + Math.random() * 140;
          S.particles.push({
            x: j.screenX,
            y: floorY - 20,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp - 40,
            hue: 15,
            alpha: 1.0,
            size: 4 + Math.random() * 5,
            life: 0.7
          });
        }
        S.pops.push({ x: j.screenX, y: floorY - 70, text: 'TANGLED!', hue: 10, t: 1.0 });
      } else {
        j.score++;
        j.cheer = 1.0;
        // Sparkle for success
        S.particles.push({
          x: j.screenX,
          y: floorY - j.yOffset,
          vx: (Math.random() - 0.5) * 40,
          vy: -30 - Math.random() * 40,
          hue: j.hue,
          alpha: 1.0,
          size: 3 + Math.random() * 4,
          life: 0.5
        });
      }
    }
  }
}

// If rope crossed and at least one survived, bump round streak
if (crossedBottom && aliveCount > 0) {
  S.roundScore++;
  if (S.roundScore % 5 === 0) {
    S.pops.push({ x: W * 0.5, y: H * 0.28, text: `STREAK ${S.roundScore}! SPEED UP!`, hue: 50, t: 1.2 });
  }
}

// Win condition / Game Over
if (S.phase === 'play') {
  if (aliveCount === 0 || (aliveCount === 1 && totalJumpers > 1)) {
    S.phase = 'round_win';
    S.roundTimer = 0;
    if (lastAlive) {
      S.winnerName = (lastAlive.isBot ? 'PLAYER' : 'CHAMP') + ` #${(S.jumpers.indexOf(lastAlive) + 1)}`;
      S.winnerHue = lastAlive.hue;
      S.bannerText = `${S.winnerName} WINS!`;
    } else {
      S.bannerText = 'DOUBLE TANGLE!';
      S.winnerHue = 45;
    }
  }
} else if (S.phase === 'round_win') {
  S.roundTimer += frame.dt;
  // Confetti shower for winner
  if (showConfetti && Math.random() < 0.6) {
    for (let c = 0; c < 3; c++) {
      S.particles.push({
        x: Math.random() * W,
        y: -10,
        vx: (Math.random() - 0.5) * 80,
        vy: 80 + Math.random() * 120,
        hue: (S.winnerHue + Math.random() * 80 - 40 + 360) % 360,
        alpha: 1,
        size: 5 + Math.random() * 6,
        life: 2.5
      });
    }
  }
  // Auto reset round after 3.8s
  if (S.roundTimer > 3.8) {
    S.phase = 'play';
    S.roundScore = 0;
    S.bannerText = 'GO!';
    S.bannerTimer = 1.2;
    for (const j of S.jumpers) {
      j.alive = true;
      j.yOffset = 0;
      j.vy = 0;
      j.score = 0;
    }
  }
}

if (S.bannerTimer > 0) {
  S.bannerTimer -= frame.dt;
}

// Update particles & bounded cap
for (let i = S.particles.length - 1; i >= 0; i--) {
  const p = S.particles[i];
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  p.vy += 60 * frame.dt;
  p.alpha -= frame.dt / p.life;
  if (p.alpha <= 0) S.particles.splice(i, 1);
}
if (S.particles.length > 160) S.particles.splice(0, S.particles.length - 160);

// Update floating pop texts
for (let i = S.pops.length - 1; i >= 0; i--) {
  const pop = S.pops[i];
  pop.y -= 30 * frame.dt;
  pop.t -= frame.dt;
  if (pop.t <= 0) S.pops.splice(i, 1);
}
if (S.pops.length > 25) S.pops.splice(0, S.pops.length - 25);

// ==================== RENDERING ====================
ctx.save();

// 1. Background Court
if (courtStyle === 'sunset_concrete') {
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#220b28');
  bgGrad.addColorStop(0.65, '#3b1735');
  bgGrad.addColorStop(1, '#150616');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);
} else if (courtStyle === 'cyber_grid') {
  ctx.fillStyle = '#060a14';
  ctx.fillRect(0, 0, W, H);
  // Grid lines
  ctx.strokeStyle = '#12253d';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let gx = 0; gx < W; gx += 60) {
    ctx.moveTo(gx, floorY);
    ctx.lineTo(gx + (gx - W * 0.5) * 0.5, H);
  }
  for (let gy = floorY; gy < H; gy += 25) {
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
  }
  ctx.stroke();
} else {
  // midnight_asphalt
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#0a0d14');
  bgGrad.addColorStop(0.7, '#111722');
  bgGrad.addColorStop(1, '#05070a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);
}

// Schoolyard Ground line with painted yellow dashed boundary
ctx.strokeStyle = '#2a3548';
ctx.lineWidth = 6;
ctx.beginPath();
ctx.moveTo(0, floorY + 6);
ctx.lineTo(W, floorY + 6);
ctx.stroke();

ctx.strokeStyle = '#eab30844';
ctx.lineWidth = 3;
ctx.setLineDash([18, 14]);
ctx.beginPath();
ctx.moveTo(0, floorY + 12);
ctx.lineTo(W, floorY + 12);
ctx.stroke();
ctx.setLineDash([]);

// Audio bass reaction ripple under jumpers
if (audio && audio.bass > 0.3) {
  ctx.save();
  ctx.strokeStyle = `hsla(200, 100%, 70%, ${audio.bass * 0.35})`;
  ctx.lineWidth = 2 + audio.bass * 4;
  ctx.beginPath();
  ctx.ellipse(W * 0.5, floorY + 10, W * 0.35, 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 2. Draw Turners (Kids holding rope ends)
function drawTurner(x, y, facingRight, hue) {
  ctx.save();
  ctx.translate(x, y);
  const armSwing = Math.sin(S.ropeAngle) * 16;
  const armLift = Math.cos(S.ropeAngle) * 12;
  const dir = facingRight ? 1 : -1;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 32, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
  ctx.beginPath();
  ctx.roundRect(-12, -20, 24, 38, 6);
  ctx.fill();

  // Head
  ctx.fillStyle = `hsl(${hue}, 85%, 85%)`;
  ctx.beginPath();
  ctx.arc(0, -32, 14, 0, Math.PI * 2);
  ctx.fill();

  // Cap / Hair
  ctx.fillStyle = `hsl(${(hue + 180) % 360}, 90%, 50%)`;
  ctx.beginPath();
  ctx.arc(0, -36, 14, Math.PI, Math.PI * 2);
  ctx.fill();

  // Turner Arm rotating with rope
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(dir * 6, -8);
  ctx.lineTo(dir * (18 + armSwing * 0.5), -4 + armLift);
  ctx.stroke();

  ctx.restore();
}

drawTurner(turnerLeft.x, turnerLeft.y, true, 25);
drawTurner(turnerRight.x, turnerRight.y, false, 200);

// 3. Draw Jumpers (Back to Front depth relative to rope)
// Rope sin determines whether rope is in front of jumpers or behind them!
const ropeZ = Math.cos(S.ropeAngle); // > 0: in front, < 0: behind

// Helper to draw the curved jump rope
function drawRope() {
  ctx.save();
  const dipFactor = Math.sin(S.ropeAngle);
  const ropeMaxDip = (floorY - turnerLeft.y + 40);
  const midDip = dipFactor * ropeMaxDip;
  const ropeY = turnerLeft.y + midDip;

  // Rope style strokes
  if (ropeStyle === 'electric_wire') {
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f0ff';
    ctx.strokeStyle = '#e0ffff';
    ctx.lineWidth = 5;
  } else if (ropeStyle === 'chalk_rainbow') {
    ctx.shadowBlur = 10;
    ctx.shadowColor = `hsl(${(frame.t * 120) % 360}, 100%, 60%)`;
    ctx.strokeStyle = `hsl(${(frame.t * 120) % 360}, 100%, 75%)`;
    ctx.lineWidth = 6;
  } else {
    // neon_glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff0055';
    ctx.strokeStyle = '#ff77aa';
    ctx.lineWidth = 6;
  }

  ctx.beginPath();
  ctx.moveTo(turnerLeft.x + 18, turnerLeft.y);
  // Quadratic curve down into the center
  ctx.quadraticCurveTo(W * 0.5, ropeY, turnerRight.x - 18, turnerRight.y);
  ctx.stroke();
  ctx.restore();
}

// If rope is behind jumpers, draw rope first
if (ropeZ < 0) drawRope();

// Draw all jumpers
for (let i = 0; i < S.jumpers.length; i++) {
  const j = S.jumpers[i];
  const px = j.screenX;
  const py = floorY - j.yOffset;
  const pScale = Math.min(1.0, 40 / (totalJumpers + 8));
  const baseH = 55 * pScale;
  const baseW = 28 * pScale;

  ctx.save();
  ctx.translate(px, py);

  // Shadow on floor
  const shadowScale = Math.max(0.2, 1.0 - (j.yOffset / 180));
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, j.yOffset, baseW * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tangle or Alive state
  if (!j.alive) {
    ctx.rotate(Math.PI * 0.42); // fallen over
    ctx.globalAlpha = 0.55;
  }

  // Flash on jump / hit
  if (j.flash > 0) {
    ctx.shadowBlur = 20 * j.flash;
    ctx.shadowColor = `hsl(${j.hue}, 100%, 75%)`;
  }

  // Body: Chunky athletic silhouette
  const bodyColor = `hsl(${j.hue}, 85%, ${j.alive ? 52 : 30}%)`;
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.roundRect(-baseW * 0.5, -baseH * 0.75, baseW, baseH * 0.75, 5 * pScale);
  ctx.fill();

  // Player Head
  ctx.fillStyle = `hsl(${j.hue}, 90%, ${j.alive ? 82 : 45}%)`;
  ctx.beginPath();
  ctx.arc(0, -baseH * 0.95, baseW * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Headband / visor matching hue
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-baseW * 0.45, -baseH * 1.02, baseW * 0.9, 4 * pScale);

  // Player legs (bent when airborne, straight when grounded)
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 5 * pScale;
  ctx.lineCap = 'round';
  const legSpread = j.yOffset > 5 ? 8 * pScale : 5 * pScale;
  ctx.beginPath();
  ctx.moveTo(-legSpread, 0);
  ctx.lineTo(-legSpread * 0.8, baseH * 0.25);
  ctx.moveTo(legSpread, 0);
  ctx.lineTo(legSpread * 0.8, baseH * 0.25);
  ctx.stroke();

  // Arms up in air when jumping!
  const armY = j.yOffset > 5 ? -baseH * 0.9 : -baseH * 0.45;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4 * pScale;
  ctx.beginPath();
  ctx.moveTo(-baseW * 0.5, -baseH * 0.55);
  ctx.lineTo(-baseW * 0.75, armY);
  ctx.moveTo(baseW * 0.5, -baseH * 0.55);
  ctx.lineTo(baseW * 0.75, armY);
  ctx.stroke();

  // Top score / rank indicator badge
  if (j.alive && j.score > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(12, 16 * pScale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${j.score}`, 0, -baseH * 1.25);
  }

  // You indicator if interactive human
  if (!j.isBot) {
    ctx.fillStyle = `hsl(${j.hue}, 100%, 70%)`;
    ctx.beginPath();
    ctx.moveTo(0, -baseH * 1.45);
    ctx.lineTo(-5, -baseH * 1.6);
    ctx.lineTo(5, -baseH * 1.6);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// If rope is in front of jumpers, draw rope after jumpers
if (ropeZ >= 0) drawRope();

// 4. Particles (Confetti & sparks)
for (const p of S.particles) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, p.alpha);
  ctx.fillStyle = `hsl(${p.hue}, 95%, 65%)`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 5. Floating Reaction Pop Labels
for (const pop of S.pops) {
  ctx.save();
  ctx.globalAlpha = Math.min(1.0, pop.t * 2);
  ctx.font = '900 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(pop.text, pop.x, pop.y);
  ctx.fillStyle = `hsl(${pop.hue}, 100%, 70%)`;
  ctx.fillText(pop.text, pop.x, pop.y);
  ctx.restore();
}

// 6. Big HUD & Center Court Labels
ctx.save();
// Round Streak Counter in corner
ctx.textAlign = 'left';
ctx.font = '900 32px sans-serif';
ctx.fillStyle = '#ffffff';
ctx.shadowColor = 'rgba(0,0,0,0.8)';
ctx.shadowBlur = 8;
ctx.fillText(`JUMPS: ${S.roundScore}`, 40, 60);

ctx.font = '700 18px sans-serif';
ctx.fillStyle = '#94a3b8';
ctx.fillText(`SPEED ${(currentSpeed).toFixed(1)}x | ALIVE: ${aliveCount}/${totalJumpers}`, 40, 90);

// Prompt instruction on screen for audience
ctx.textAlign = 'right';
ctx.font = '900 24px sans-serif';
ctx.fillStyle = '#38bdf8';
ctx.fillText('PRESS [JUMP] ON THE BEAT!', W - 40, 60);
if (idle) {
  ctx.font = '700 16px sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('AUTO-ATTRACT MODE', W - 40, 88);
}

// Large Center Banner (Winner / GO! / Danger Alert)
if (S.bannerTimer > 0 || S.phase === 'round_win') {
  ctx.textAlign = 'center';
  const isWinner = S.phase === 'round_win';
  const bannerText = isWinner ? S.bannerText : (S.bannerTimer > 0 ? S.bannerText : '');
  
  if (bannerText) {
    const fontSize = isWinner ? Math.min(84, W * 0.08) : Math.min(96, W * 0.09);
    ctx.font = `900 ${fontSize}px sans-serif`;
    
    // Glow outline
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(bannerText, W * 0.5, H * 0.38);
    
    ctx.fillStyle = isWinner ? `hsl(${S.winnerHue}, 100%, 65%)` : '#ffffff';
    ctx.shadowBlur = 25;
    ctx.shadowColor = isWinner ? `hsl(${S.winnerHue}, 100%, 50%)` : '#38bdf8';
    ctx.fillText(bannerText, W * 0.5, H * 0.38);
    
    if (isWinner) {
      ctx.font = '900 28px sans-serif';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#000';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('NEXT ROUND STARTING SOON...', W * 0.5, H * 0.46);
    }
  }
}

ctx.restore();
ctx.restore();