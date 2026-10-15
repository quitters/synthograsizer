const W = frame.width;
const H = frame.height;

// 1. Persistent state initialization
room.state.snowflakes ??= Array.from({ length: 90 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  r: 1.5 + Math.random() * 3.5,
  speed: 40 + Math.random() * 80,
  drift: (Math.random() - 0.5) * 40
}));
room.state.particles ??= [];
room.state.snowmen ??= {};
room.state.lastPressTime ??= frame.t;
room.state.lastAttractPress ??= 0;
room.state.roundState ??= 'playing'; // 'playing' | 'winner'
room.state.winnerTimer ??= 0;
room.state.winnerInfo ??= null;

// Variables lookup
const skyStyles = {
  midnight_aurora: ['#040a1c', '#0c1b33', '#114b5f'],
  twilight_indigo: ['#07071f', '#19113b', '#412258'],
  deep_frost: ['#020b14', '#061a29', '#0d324d']
};
const skyGrad = skyStyles[getVar('night_sky')] ?? skyStyles.midnight_aurora;
const snowSpeedMul = (getVar('snowfall_speed') ?? 3) * 0.45;
const isBlizzard = getVar('blizzard_mode') ?? false;
const partyStyle = getVar('party_style') ?? 'classic_cozy';

// Manage Snowmen list (bound to active room.people or demo bots)
const people = (room.people && room.people.length > 0)
  ? room.people
  : [
      { id: 'demo_1', table: 'Lane 1', hue: 35 },
      { id: 'demo_2', table: 'Lane 2', hue: 190 },
      { id: 'demo_3', table: 'Lane 3', hue: 330 }
    ];

// Keep active snowmen list bounded to current people
const activeIds = new Set(people.map(p => p.id));
for (const p of people) {
  if (!room.state.snowmen[p.id]) {
    room.state.snowmen[p.id] = {
      id: p.id,
      label: p.table || ('P' + p.hue),
      hue: p.hue,
      b1: 0, // bottom ball 0..1
      b2: 0, // middle ball 0..1
      b3: 0, // head ball 0..1
      eyes: false,
      nose: false,
      scarf: false,
      scarfHue: p.hue,
      hat: false,
      squash: 0,
      flash: 0,
      done: false
    };
  } else {
    room.state.snowmen[p.id].hue = p.hue;
    room.state.snowmen[p.id].label = p.table || ('P' + p.hue);
  }
}
// Clean up stale players not in current group
for (const id in room.state.snowmen) {
  if (!activeIds.has(id)) delete room.state.snowmen[id];
}

// Helper to spawn poof particles
function spawnPoof(x, y, hue, count = 12, speed = 160) {
  const pList = room.state.particles;
  for (let i = 0; i < count; i++) {
    if (pList.length >= 150) pList.shift();
    const ang = Math.random() * Math.PI * 2;
    const vel = (0.3 + Math.random() * 0.7) * speed;
    pList.push({
      x,
      y,
      vx: Math.cos(ang) * vel,
      vy: Math.sin(ang) * vel - 40,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 0.8,
      size: 4 + Math.random() * 6,
      hue
    });
  }
}

// Action trigger processing
function applyAction(actionName, participantId) {
  let sm = participantId ? room.state.snowmen[participantId] : null;
  if (!sm) {
    const keys = Object.keys(room.state.snowmen);
    if (keys.length > 0) {
      sm = room.state.snowmen[keys[Math.floor(Math.random() * keys.length)]];
    }
  }
  if (!sm) return;

  room.state.lastPressTime = frame.t;
  sm.squash = 0.35;
  sm.flash = 1.0;

  if (actionName === 'roll') {
    if (sm.b1 < 1) sm.b1 = Math.min(1, sm.b1 + 0.34);
    else if (sm.b2 < 1) sm.b2 = Math.min(1, sm.b2 + 0.35);
    else if (sm.b3 < 1) sm.b3 = Math.min(1, sm.b3 + 0.36);
    spawnPoof(0, 0, 200, 10, 140); // will offset with snowman pos
  } else if (actionName === 'decorate') {
    if (sm.b3 < 0.99) {
      // Snowballs not ready, small visual nudge
      sm.squash = 0.15;
    } else if (!sm.eyes) {
      sm.eyes = true;
    } else if (!sm.nose) {
      sm.nose = true;
    } else if (!sm.scarf) {
      sm.scarf = true;
      sm.scarfHue = sm.hue;
    } else if (!sm.hat) {
      sm.hat = true;
      sm.done = true;
      if (room.state.roundState === 'playing') {
        room.state.roundState = 'winner';
        room.state.winnerTimer = frame.t + 5.5;
        room.state.winnerInfo = { label: sm.label, hue: sm.hue };
        spawnPoof(W / 2, H * 0.4, sm.hue, 45, 320);
      }
    }
    spawnPoof(0, 0, sm.hue, 14, 200);
  }
}

// Read incoming momentary trigger events
for (const e of room.events) {
  if (e.name === 'roll' || e.name === 'decorate') {
    applyAction(e.name, e.participantId);
  }
}

// Attract mode: autoplay lively steps if idle for > 4 seconds
if (frame.t - room.state.lastPressTime > 4.0 && frame.t - room.state.lastAttractPress > 0.65) {
  room.state.lastAttractPress = frame.t;
  const keys = Object.keys(room.state.snowmen);
  if (keys.length > 0) {
    const randomId = keys[Math.floor(Math.random() * keys.length)];
    const sm = room.state.snowmen[randomId];
    if (sm.b3 < 0.99) applyAction('roll', randomId);
    else applyAction('decorate', randomId);
  }
}

// Winner state auto-reset
if (room.state.roundState === 'winner' && frame.t > room.state.winnerTimer) {
  room.state.roundState = 'playing';
  room.state.winnerInfo = null;
  for (const id in room.state.snowmen) {
    const s = room.state.snowmen[id];
    s.b1 = 0; s.b2 = 0; s.b3 = 0;
    s.eyes = false; s.nose = false; s.scarf = false; s.hat = false;
    s.done = false;
  }
}

// 2. BACKGROUND DRAWING
ctx.save();
const grad = ctx.createLinearGradient(0, 0, 0, H);
grad.addColorStop(0, skyGrad[0]);
grad.addColorStop(0.55, skyGrad[1]);
grad.addColorStop(1, skyGrad[2]);
ctx.fillStyle = grad;
ctx.fillRect(0, 0, W, H);

// Ambient Northern Lights / Sky glow responsive to audio
const auroraGlow = ctx.createRadialGradient(
  W * 0.5 + Math.sin(frame.t * 0.5) * W * 0.2,
  H * 0.15,
  40,
  W * 0.5,
  H * 0.3,
  W * 0.6
);
auroraGlow.addColorStop(0, `hsla(${160 + Math.sin(frame.t) * 30}, 80%, 50%, ${0.12 + audio.bass * 0.25})`);
auroraGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = auroraGlow;
ctx.fillRect(0, 0, W, H * 0.6);

// Snowy background hills
ctx.fillStyle = '#10223b';
ctx.beginPath();
ctx.moveTo(0, H * 0.72);
ctx.quadraticCurveTo(W * 0.35, H * 0.62, W * 0.7, H * 0.74);
ctx.quadraticCurveTo(W * 0.88, H * 0.78, W, H * 0.71);
ctx.lineTo(W, H);
ctx.lineTo(0, H);
ctx.fill();

// Foreground snow terrace
const groundGrad = ctx.createLinearGradient(0, H * 0.72, 0, H);
groundGrad.addColorStop(0, '#dbe7f7');
groundGrad.addColorStop(0.3, '#c2d5ee');
groundGrad.addColorStop(1, '#8ea6c7');
ctx.fillStyle = groundGrad;
ctx.beginPath();
ctx.moveTo(0, H * 0.78);
ctx.quadraticCurveTo(W * 0.28, H * 0.74, W * 0.55, H * 0.8);
ctx.quadraticCurveTo(W * 0.82, H * 0.84, W, H * 0.76);
ctx.lineTo(W, H);
ctx.lineTo(0, H);
ctx.fill();
ctx.restore();

// 3. SNOWFLAKES UPDATE & DRAW
ctx.save();
ctx.fillStyle = '#ffffff';
const blizzardWind = (isBlizzard ? 180 : 20) + audio.mid * 50;
for (const flake of room.state.snowflakes) {
  flake.y += flake.speed * snowSpeedMul * frame.dt;
  flake.x += (flake.drift + blizzardWind) * frame.dt;
  if (flake.y > H) {
    flake.y = -10;
    flake.x = Math.random() * W;
  }
  if (flake.x > W) flake.x = 0;
  if (flake.x < 0) flake.x = W;

  ctx.beginPath();
  ctx.arc(flake.x, flake.y, flake.r * (1 + audio.treble * 0.5), 0, Math.PI * 2);
  ctx.globalAlpha = 0.5 + Math.sin(frame.t * 3 + flake.x) * 0.25;
  ctx.fill();
}
ctx.restore();

// 4. LAYOUT AND DRAW SNOWMEN
const smKeys = Object.keys(room.state.snowmen);
const count = Math.max(1, smKeys.length);
// Arrange into 1 or 2 rows depending on count
const rows = count > 8 ? 2 : 1;
const cols = Math.ceil(count / rows);
const cellW = W / (cols + 1);

// Scale base snowman height so it fits crisply
const baseScale = Math.min(1.1, Math.max(0.42, 6.0 / Math.max(cols, 4)));

smKeys.forEach((key, idx) => {
  const sm = room.state.snowmen[key];
  const row = rows === 1 ? 0 : Math.floor(idx / cols);
  const col = rows === 1 ? idx : (idx % cols);
  const colsInThisRow = (rows === 2 && row === 1) ? (count - cols) : cols;
  const rowSpacing = W / (colsInThisRow + 1);
  
  const laneX = rowSpacing * (col + 1);
  const laneY = rows === 1 ? H * 0.86 : (row === 0 ? H * 0.73 : H * 0.90);
  const scale = baseScale * (rows === 2 && row === 0 ? 0.78 : 1.0);

  // Decay squash & flash
  sm.squash = Math.max(0, sm.squash * Math.pow(0.05, frame.dt));
  sm.flash = Math.max(0, sm.flash - frame.dt * 2.8);

  ctx.save();
  ctx.translate(laneX, laneY);
  ctx.scale(scale, scale);

  // Audio bounce + impact squash
  const bounce = Math.sin(frame.t * 5 + idx) * 3 * audio.bass;
  const sqX = 1 + sm.squash * 0.5;
  const sqY = 1 - sm.squash * 0.35;
  ctx.scale(sqX, sqY);
  ctx.translate(0, bounce);

  // Base Shadow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 5, 80 * Math.max(0.2, sm.b1), 22 * Math.max(0.2, sm.b1), 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 30, 60, 0.45)';
  ctx.fill();
  ctx.restore();

  // Helper to draw a shaded snowball
  function drawSnowball(cx, cy, radius, fillRatio) {
    if (fillRatio <= 0.01) return;
    const r = radius * fillRatio;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const ballGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    if (sm.flash > 0.05) {
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(1, `hsl(${sm.hue}, 90%, 80%)`);
    } else {
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.75, '#e5effb');
      ballGrad.addColorStop(1, '#a6c5e8');
    }
    ctx.fillStyle = ballGrad;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#6888ac';
    ctx.stroke();
    ctx.restore();
  }

  // 1. Bottom ball
  drawSnowball(0, -60, 64, sm.b1);

  // 2. Middle ball
  if (sm.b1 >= 0.8) {
    drawSnowball(0, -145, 50, sm.b2);

    // Stick Arms (drawn if middle is rolled)
    if (sm.b2 > 0.5) {
      ctx.save();
      ctx.strokeStyle = '#5a3825';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      const wave = sm.done ? Math.sin(frame.t * 10) * 0.35 : 0;

      // Left stick arm
      ctx.beginPath();
      ctx.moveTo(-40, -145);
      ctx.lineTo(-90, -170 + Math.sin(frame.t * 3) * 5);
      ctx.lineTo(-105, -185);
      ctx.stroke();

      // Right stick arm (waves when completed!)
      ctx.beginPath();
      ctx.moveTo(40, -145);
      ctx.lineTo(90, -165 - wave * 45);
      ctx.lineTo(110, -180 - wave * 65);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 3. Head ball
  if (sm.b2 >= 0.8) {
    drawSnowball(0, -215, 38, sm.b3);
  }

  // 4. Face & Decorations (when head is completed)
  if (sm.b3 >= 0.95) {
    // Coal Eyes
    if (sm.eyes) {
      ctx.save();
      ctx.fillStyle = '#1c1e24';
      ctx.beginPath();
      ctx.arc(-13, -225, 4.5, 0, Math.PI * 2);
      ctx.arc(13, -225, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // Eye twinkle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-14.5, -226.5, 1.5, 0, Math.PI * 2);
      ctx.arc(11.5, -226.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Carrot Nose
    if (sm.nose) {
      ctx.save();
      ctx.fillStyle = '#ff6b1a';
      ctx.strokeStyle = '#cc4b02';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -218);
      ctx.lineTo(26, -214);
      ctx.lineTo(0, -210);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Scarf in player's custom hue
    if (sm.scarf) {
      ctx.save();
      const sHue = sm.scarfHue ?? sm.hue;
      ctx.fillStyle = `hsl(${sHue}, 90%, 50%)`;
      ctx.strokeStyle = `hsl(${sHue}, 95%, 35%)`;
      ctx.lineWidth = 2.5;

      // Neck wrap
      ctx.beginPath();
      ctx.roundRect(-36, -186, 72, 18, 8);
      ctx.fill();
      ctx.stroke();

      // Hanging tail waving in the wind
      const flutter = Math.sin(frame.t * 6 + idx) * 8;
      ctx.beginPath();
      ctx.moveTo(10, -175);
      ctx.quadraticCurveTo(24 + flutter, -150, 18 + flutter * 1.5, -125);
      ctx.lineTo(6 + flutter * 1.5, -125);
      ctx.quadraticCurveTo(12 + flutter, -150, 0, -175);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Scarf fringe
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6 + flutter * 1.5, -125);
      ctx.lineTo(18 + flutter * 1.5, -125);
      ctx.stroke();
      ctx.restore();
    }

    // Hat (Style varies by variable)
    if (sm.hat) {
      ctx.save();
      if (partyStyle === 'neon_glow') {
        // Cyber Neon Visor & Beanie
        ctx.fillStyle = `hsl(${sm.hue}, 100%, 55%)`;
        ctx.shadowColor = `hsl(${sm.hue}, 100%, 65%)`;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(0, -250, 32, Math.PI, 0);
        ctx.fill();
        // Visor band
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(-28, -242, 56, 12);
      } else if (partyStyle === 'golden_crown') {
        // Golden Crown
        ctx.fillStyle = '#ffd700';
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-28, -245);
        ctx.lineTo(-32, -280);
        ctx.lineTo(-12, -260);
        ctx.lineTo(0, -288);
        ctx.lineTo(12, -260);
        ctx.lineTo(32, -280);
        ctx.lineTo(28, -245);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Classic Cozy Top Hat
        ctx.fillStyle = '#22252c';
        ctx.strokeStyle = '#0e1014';
        ctx.lineWidth = 2;
        // Brim
        ctx.beginPath();
        ctx.ellipse(0, -245, 42, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Crown cylinder
        ctx.beginPath();
        ctx.rect(-24, -295, 48, 52);
        ctx.fill();
        ctx.stroke();
        // Ribbon band in player's hue
        ctx.fillStyle = `hsl(${sm.hue}, 85%, 55%)`;
        ctx.fillRect(-24, -260, 48, 12);
      }
      ctx.restore();
    }
  }

  // 5. PROGRESS & STATUS BADGE (High visibility across the room)
  ctx.save();
  // Player badge pill
  const badgeY = 28;
  ctx.fillStyle = `hsl(${sm.hue}, 85%, 45%)`;
  ctx.beginPath();
  ctx.roundRect(-60, badgeY, 120, 34, 12);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Label
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 18px Impact, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sm.label.toUpperCase().slice(0, 10), 0, badgeY + 17);

  // Step indicator icons (dots for stage: Roll 1-3, Deco 1-4)
  let stageCount = 0;
  if (sm.b1 >= 0.99) stageCount++;
  if (sm.b2 >= 0.99) stageCount++;
  if (sm.b3 >= 0.99) stageCount++;
  if (sm.eyes) stageCount++;
  if (sm.nose) stageCount++;
  if (sm.scarf) stageCount++;
  if (sm.hat) stageCount++;

  const dotCount = 7;
  const dotStartX = -((dotCount - 1) * 14) / 2;
  for (let d = 0; d < dotCount; d++) {
    ctx.beginPath();
    ctx.arc(dotStartX + d * 14, badgeY + 44, 4.5, 0, Math.PI * 2);
    if (d < stageCount) {
      ctx.fillStyle = d < 3 ? '#ffffff' : `hsl(${sm.hue}, 100%, 65%)`;
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    }
    ctx.fill();
  }
  ctx.restore();

  ctx.restore(); // restore snowman space
});

// 5. PARTICLES (Burst & snow poofs)
ctx.save();
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  p.vy += 220 * frame.dt; // gravity
  p.life -= frame.dt;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  const progress = p.life / p.maxLife;
  ctx.globalAlpha = progress;
  ctx.fillStyle = p.hue === 200 ? '#eaf4ff' : `hsl(${p.hue}, 90%, 60%)`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * progress, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// 6. HEADS-UP DISPLAY / GAME BANNERS
ctx.save();
if (room.state.roundState === 'winner' && room.state.winnerInfo) {
  // Celebration Winner Overlay
  const win = room.state.winnerInfo;
  const pulse = 1 + Math.sin(frame.t * 8) * 0.06;
  const bannerY = H * 0.22;

  ctx.save();
  ctx.translate(W / 2, bannerY);
  ctx.scale(pulse, pulse);

  // Outer glow plaque
  ctx.shadowColor = `hsl(${win.hue}, 100%, 60%)`;
  ctx.shadowBlur = 35;
  ctx.fillStyle = 'rgba(10, 15, 30, 0.92)';
  ctx.strokeStyle = `hsl(${win.hue}, 95%, 60%)`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(-360, -75, 720, 150, 24);
  ctx.fill();
  ctx.stroke();

  // Giant Winner Title
  ctx.shadowBlur = 0;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.font = '900 48px Impact, system-ui, sans-serif';
  ctx.fillText(`WINNER: ${win.label.toUpperCase()}!`, 0, -12);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 24px system-ui, sans-serif';
  const timeLeft = Math.max(1, Math.ceil(room.state.winnerTimer - frame.t));
  ctx.fillText(`SNOWMAN COMPLETE! NEXT ROUND IN ${timeLeft}...`, 0, 36);
  ctx.restore();
} else {
  // Active Play Header
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Top Game Bar Background Pill
  ctx.fillStyle = 'rgba(6, 12, 28, 0.65)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 280, 18, 560, 52, 26);
  ctx.fill();
  ctx.stroke();

  ctx.font = '900 24px Impact, system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('ROLL SNOWBALLS (1-3)  ➔  DECORATE!', W / 2, 31);
}
ctx.restore();