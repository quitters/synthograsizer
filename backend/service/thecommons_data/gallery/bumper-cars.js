ctx.save();
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);
const speedMult = getVar('arena_speed') ?? 1.0;
const styleName = getVar('arena_style') || 'cyber_neon';
const sparkStyle = getVar('spark_intensity') || 'explosive';
const showTrails = getVar('floor_trails') ?? true;

// Spark counts by preset
const sparkCounts = { sparky: 12, explosive: 25, supernova: 42 };
const sparkBurst = sparkCounts[sparkStyle] ?? 25;

// Arena color schemes
const themes = {
  cyber_neon: { floor: '#080814', border: '#00f3ff', grid: 'rgba(0, 243, 255, 0.12)', pole: '#ff0077', text: '#00f3ff' },
  carnival: { floor: '#140810', border: '#ffaa00', grid: 'rgba(255, 170, 0, 0.15)', pole: '#ffe600', text: '#ffd23f' },
  electric_storm: { floor: '#050a14', border: '#60a5fa', grid: 'rgba(147, 197, 253, 0.18)', pole: '#93c5fd', text: '#bfdbfe' }
};
const theme = themes[styleName] || themes.cyber_neon;

// Persistent game state
room.state.cars ??= [];
room.state.sparks ??= [];
room.state.floaters ??= [];
room.state.lastBoostTime ??= frame.t;
room.state.lastAttractTime ??= 0;
room.state.round ??= { phase: 'play', winner: null, timer: 0, targetScore: 7 };

const state = room.state;
const round = state.round;

// Arena geometry (leave right panel for big scoreboard)
const padX = 70;
const arenaW = Math.max(400, W - 320);
const arenaH = H - 120;
const arenaLeft = padX;
const arenaTop = 60;
const arenaRight = arenaLeft + arenaW;
const arenaBottom = arenaTop + arenaH;
const arenaCx = arenaLeft + arenaW * 0.5;
const arenaCy = arenaTop + arenaH * 0.5;

// Sync cars with room.people (plus bots to keep at least 4 active)
const activePeople = room.people || [];
const targetCarCount = Math.max(4, Math.min(activePeople.length, 36));
const totalSlots = Math.max(activePeople.length, 4);

// Index existing cars by id
const carMap = new Map();
for (const c of state.cars) carMap.set(c.id, c);

const updatedCars = [];
// 1. Cars from connected people
for (let i = 0; i < activePeople.length; i++) {
  const p = activePeople[i];
  let car = carMap.get(p.id);
  if (!car) {
    const ang = (i / Math.max(1, activePeople.length)) * Math.PI * 2;
    car = {
      id: p.id,
      isBot: false,
      name: 'P' + (i + 1),
      hue: p.hue ?? ((i * 55) % 360),
      x: arenaCx + Math.cos(ang) * (arenaW * 0.3),
      y: arenaCy + Math.sin(ang) * (arenaH * 0.3),
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      angle: ang + Math.PI,
      turnRate: 1.8,
      score: 0,
      boost: 0,
      spin: 0,
      cooldown: 0
    };
  } else {
    car.hue = p.hue ?? car.hue;
  }
  updatedCars.push(car);
}

// 2. Supplement with bots if < 4 total
const botNeeded = Math.max(0, 4 - updatedCars.length);
for (let b = 0; b < botNeeded; b++) {
  const botId = '__bot_' + b;
  let car = carMap.get(botId);
  if (!car) {
    const ang = (b / 4) * Math.PI * 2 + 0.4;
    car = {
      id: botId,
      isBot: true,
      name: 'BOT ' + (b + 1),
      hue: (b * 90 + 35) % 360,
      x: arenaCx + Math.cos(ang) * (arenaW * 0.28),
      y: arenaCy + Math.sin(ang) * (arenaH * 0.28),
      vx: 30,
      vy: -20,
      angle: ang,
      turnRate: 1.5,
      score: 0,
      boost: 0,
      spin: 0,
      cooldown: 0
    };
  }
  updatedCars.push(car);
}
state.cars = updatedCars;

// Car radius scaled to crowdedness
const carRadius = Math.max(18, Math.min(30, Math.floor(400 / Math.sqrt(state.cars.length * 15 + 40))));

// Process 'boost' triggers
for (const ev of room.events || []) {
  if (ev.name === 'boost') {
    state.lastBoostTime = frame.t;
    let car = state.cars.find(c => c.id === ev.participantId);
    // If trigger came from a viewer not yet mapped, boost a human or random car
    if (!car) car = state.cars.find(c => !c.isBot) || state.cars[0];
    if (car && car.cooldown <= 0) {
      car.boost = 1.0;
      car.cooldown = 0.5;
      const lunge = 480 * speedMult;
      car.vx += Math.cos(car.angle) * lunge;
      car.vy += Math.sin(car.angle) * lunge;
      // Boost sound/particles floater
      state.floaters.push({ text: 'BOOST!', x: car.x, y: car.y - 25, hue: car.hue, life: 1 });
      for (let s = 0; s < 12; s++) {
        const sa = car.angle + Math.PI + (Math.random() - 0.5) * 1.2;
        const sp = 120 + Math.random() * 260;
        state.sparks.push({
          x: car.x - Math.cos(car.angle) * carRadius,
          y: car.y - Math.sin(car.angle) * carRadius,
          vx: Math.cos(sa) * sp,
          vy: Math.sin(sa) * sp,
          hue: (car.hue + 40) % 360,
          life: 0.6 + Math.random() * 0.4,
          age: 0
        });
      }
    }
  }
}

// Attract mode: if nobody pushed boost for 2.8s, trigger bots/cars periodically
if (frame.t - state.lastBoostTime > 2.8 && frame.t - state.lastAttractTime > 1.2) {
  state.lastAttractTime = frame.t;
  const pick = state.cars[Math.floor(Math.random() * state.cars.length)];
  if (pick && pick.cooldown <= 0) {
    pick.boost = 0.85;
    pick.cooldown = 0.6;
    const lunge = 400 * speedMult;
    pick.vx += Math.cos(pick.angle) * lunge;
    pick.vy += Math.sin(pick.angle) * lunge;
  }
}

// Round state logic
if (round.phase === 'winner') {
  round.timer -= dt;
  if (round.timer <= 0) {
    round.phase = 'play';
    round.winner = null;
    for (const c of state.cars) c.score = 0;
  }
} else {
  // Check winner
  for (const c of state.cars) {
    if (c.score >= round.targetScore) {
      round.phase = 'winner';
      round.winner = c;
      round.timer = 4.5; // display winner for 4.5s then restart
      // Mega firework burst
      for (let k = 0; k < 60; k++) {
        const ang = (k / 60) * Math.PI * 2;
        const sp = 200 + Math.random() * 320;
        state.sparks.push({
          x: arenaCx, y: arenaCy,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          hue: (c.hue + k * 6) % 360,
          life: 1.5, age: 0
        });
      }
      break;
    }
  }
}

// Update Car Physics
const baseSpeed = 110 * speedMult;
for (let i = 0; i < state.cars.length; i++) {
  const c = state.cars[i];
  c.cooldown = Math.max(0, c.cooldown - dt);
  c.boost = Math.max(0, c.boost - dt * 2.2);

  // Spin-out recovery
  if (Math.abs(c.spin) > 0.05) {
    c.angle += c.spin * dt;
    c.spin *= Math.pow(0.1, dt);
  } else {
    c.spin = 0;
    // Autonomous steering: steer smoothly toward arena center or random wander
    const toCx = arenaCx - c.x;
    const toCy = arenaCy - c.y;
    const distToCenter = Math.hypot(toCx, toCy);
    let desiredAngle = c.angle;

    if (distToCenter > arenaW * 0.38) {
      desiredAngle = Math.atan2(toCy, toCx);
    } else {
      // Slight erratic steering + audio mid-frequencies reaction
      desiredAngle += Math.sin(frame.t * 2 + i * 1.7) * (0.8 + (audio?.mid || 0) * 1.5) * dt;
    }

    // Smooth rotate towards desired
    let diff = desiredAngle - c.angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    c.angle += Math.sign(diff) * Math.min(Math.abs(diff), c.turnRate * dt * 3.5);

    // Forward engine thrust
    const thrust = (c.boost > 0 ? 320 : baseSpeed) * (1 + (audio?.bass || 0) * 0.4);
    c.vx += Math.cos(c.angle) * thrust * dt;
    c.vy += Math.sin(c.angle) * thrust * dt;
  }

  // Friction / drag
  c.vx *= Math.pow(0.65, dt);
  c.vy *= Math.pow(0.65, dt);
  c.x += c.vx * dt;
  c.y += c.vy * dt;

  // Wall bounce (arena boundaries)
  const minX = arenaLeft + carRadius + 12;
  const maxX = arenaRight - carRadius - 12;
  const minY = arenaTop + carRadius + 12;
  const maxY = arenaBottom - carRadius - 12;

  if (c.x < minX) { c.x = minX; c.vx = Math.abs(c.vx) * 0.8; c.spin = (Math.random() - 0.5) * 6; }
  if (c.x > maxX) { c.x = maxX; c.vx = -Math.abs(c.vx) * 0.8; c.spin = (Math.random() - 0.5) * 6; }
  if (c.y < minY) { c.y = minY; c.vy = Math.abs(c.vy) * 0.8; c.spin = (Math.random() - 0.5) * 6; }
  if (c.y > maxY) { c.y = maxY; c.vy = -Math.abs(c.vy) * 0.8; c.spin = (Math.random() - 0.5) * 6; }
}

// Car-to-Car Collisions
for (let i = 0; i < state.cars.length; i++) {
  for (let j = i + 1; j < state.cars.length; j++) {
    const c1 = state.cars[i];
    const c2 = state.cars[j];
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    const dist = Math.hypot(dx, dy);
    const minDist = carRadius * 2;

    if (dist < minDist && dist > 0.001) {
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      c1.x -= nx * overlap * 0.5;
      c1.y -= ny * overlap * 0.5;
      c2.x += nx * overlap * 0.5;
      c2.y += ny * overlap * 0.5;

      // Relative velocity along normal
      const kx = c1.vx - c2.vx;
      const ky = c1.vy - c2.vy;
      const p = 2 * (nx * kx + ny * ky) / 2;
      const restitution = 1.15;

      c1.vx -= p * nx * restitution;
      c1.vy -= p * ny * restitution;
      c2.vx += p * nx * restitution;
      c2.vy += p * ny * restitution;

      // Score & spin-out calculation: bumper who hit harder gets point
      const c1Impact = Math.cos(c1.angle) * nx + Math.sin(c1.angle) * ny;
      const c2Impact = -(Math.cos(c2.angle) * nx + Math.sin(c2.angle) * ny);
      const cxMid = (c1.x + c2.x) * 0.5;
      const cyMid = (c1.y + c2.y) * 0.5;

      if (round.phase === 'play') {
        if (c1Impact > 0.25 || c1.boost > c2.boost) {
          c1.score += 1;
          c2.spin = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 8);
          state.floaters.push({ text: '+1 BUMP!', x: c1.x, y: c1.y - 30, hue: c1.hue, life: 0.9 });
        } else if (c2Impact > 0.25 || c2.boost > c1.boost) {
          c2.score += 1;
          c1.spin = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 8);
          state.floaters.push({ text: '+1 BUMP!', x: c2.x, y: c2.y - 30, hue: c2.hue, life: 0.9 });
        }
      }

      // Spawn sparks
      for (let s = 0; s < sparkBurst; s++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 80 + Math.random() * 380;
        state.sparks.push({
          x: cxMid,
          y: cyMid,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          hue: (Math.random() > 0.5 ? c1.hue : c2.hue),
          life: 0.4 + Math.random() * 0.5,
          age: 0
        });
      }
    }
  }
}

// Update & Bound Sparks
for (let i = state.sparks.length - 1; i >= 0; i--) {
  const s = state.sparks[i];
  s.age += dt;
  if (s.age >= s.life) {
    state.sparks.splice(i, 1);
    continue;
  }
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.vx *= Math.pow(0.85, dt);
  s.vy *= Math.pow(0.85, dt);
}
if (state.sparks.length > 200) {
  state.sparks.splice(0, state.sparks.length - 200);
}

// Update floaters
for (let i = state.floaters.length - 1; i >= 0; i--) {
  const f = state.floaters[i];
  f.life -= dt * 1.4;
  f.y -= 35 * dt;
  if (f.life <= 0) state.floaters.splice(i, 1);
}
if (state.floaters.length > 25) state.floaters.splice(0, state.floaters.length - 25);

// --- DRAWING ---

// 1. Dark floor background
if (showTrails) {
  ctx.fillStyle = theme.floor;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1.0;
} else {
  ctx.fillStyle = theme.floor;
  ctx.fillRect(0, 0, W, H);
}

// 2. Arena Floor & Neon Border with bass pulse
const bassBoost = (audio?.bass || 0) * 16;
ctx.save();
ctx.lineWidth = 8 + bassBoost * 0.4;
ctx.strokeStyle = theme.border;
ctx.shadowColor = theme.border;
ctx.shadowBlur = 18 + bassBoost;
ctx.fillStyle = '#06060c';
ctx.beginPath();
ctx.roundRect(arenaLeft, arenaTop, arenaW, arenaH, 36);
ctx.fill();
ctx.stroke();
ctx.restore();

// 3. Overhead Sparking Electrified Ceiling Grid
const getGrid = getVar('grid_sparks') ?? true;
if (getGrid) {
  ctx.save();
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1.2;
  const step = 40;
  ctx.beginPath();
  for (let x = arenaLeft + 20; x < arenaRight - 10; x += step) {
    ctx.moveTo(x, arenaTop);
    ctx.lineTo(x, arenaBottom);
  }
  for (let y = arenaTop + 20; y < arenaBottom - 10; y += step) {
    ctx.moveTo(arenaLeft, y);
    ctx.lineTo(arenaRight, y);
  }
  ctx.stroke();
  ctx.restore();
}

// 4. Draw Cars, Rubber Bumpers, and Electric Contact Poles
for (let i = 0; i < state.cars.length; i++) {
  const c = state.cars[i];
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);

  const isBoosting = c.boost > 0.05;
  const carCol = `hsl(${c.hue}, 95%, ${isBoosting ? '65%' : '52%'})`;
  const glowCol = `hsl(${c.hue}, 100%, 70%)`;

  // Black rubber outer bumper ring
  ctx.fillStyle = '#1c1d24';
  ctx.beginPath();
  ctx.ellipse(0, 0, carRadius * 1.15, carRadius * 1.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#3a3f50';
  ctx.stroke();

  // Car colored body
  ctx.shadowColor = glowCol;
  ctx.shadowBlur = isBoosting ? 24 : 10;
  ctx.fillStyle = carCol;
  ctx.beginPath();
  ctx.ellipse(2, 0, carRadius * 0.88, carRadius * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Headlights
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(carRadius * 0.65, -carRadius * 0.35, 3.5, 0, Math.PI * 2);
  ctx.arc(carRadius * 0.65, carRadius * 0.35, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Driver seat cockpit
  ctx.fillStyle = '#0a0a10';
  ctx.beginPath();
  ctx.arc(-carRadius * 0.1, 0, carRadius * 0.42, 0, Math.PI * 2);
  ctx.fill();

  // Electric pole rod extending back/up
  ctx.strokeStyle = '#8892b0';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-carRadius * 0.4, 0);
  ctx.lineTo(-carRadius * 0.9, -carRadius * 0.7);
  ctx.stroke();

  // Sparking contact shoe on pole tip
  const zapActive = isBoosting || (audio?.beat && Math.random() > 0.3);
  ctx.fillStyle = zapActive ? '#ffffff' : theme.pole;
  ctx.shadowColor = theme.pole;
  ctx.shadowBlur = zapActive ? 16 : 4;
  ctx.beginPath();
  ctx.arc(-carRadius * 0.9, -carRadius * 0.7, zapActive ? 5 : 3, 0, Math.PI * 2);
  ctx.fill();

  // Zapping overhead arc line occasionally
  if (zapActive) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-carRadius * 0.9, -carRadius * 0.7);
    ctx.lineTo(-carRadius * 0.9 + (Math.random() - 0.5) * 20, -carRadius * 0.7 - 25);
    ctx.stroke();
  }

  // Player label on bumper
  ctx.restore();
  ctx.save();
  ctx.font = '900 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 4;
  ctx.fillText(c.name, c.x, c.y);
  ctx.restore();
}

// 5. Render Sparks
ctx.save();
for (let i = 0; i < state.sparks.length; i++) {
  const s = state.sparks[i];
  const alpha = Math.max(0, 1 - s.age / s.life);
  ctx.fillStyle = `hsla(${s.hue}, 100%, 75%, ${alpha})`;
  ctx.shadowColor = `hsl(${s.hue}, 100%, 60%)`;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// 6. Floater texts (+1 BUMP!, BOOST!)
ctx.save();
for (const f of state.floaters) {
  ctx.font = '900 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = `hsla(${f.hue}, 100%, 80%, ${f.life})`;
  ctx.shadowColor = `hsl(${f.hue}, 100%, 50%)`;
  ctx.shadowBlur = 10;
  ctx.fillText(f.text, f.x, f.y);
}
ctx.restore();

// 7. Leaderboard Panel (Right Side)
const boardX = arenaRight + 24;
const boardW = W - boardX - 24;
if (boardW > 140) {
  ctx.save();
  ctx.fillStyle = 'rgba(12, 14, 28, 0.85)';
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 3;
  ctx.shadowColor = theme.border;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.roundRect(boardX, arenaTop, boardW, arenaH, 20);
  ctx.fill();
  ctx.stroke();

  // Header
  ctx.font = '900 22px sans-serif';
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'center';
  ctx.shadowBlur = 8;
  ctx.fillText('TOP BUMPERS', boardX + boardW * 0.5, arenaTop + 38);

  // Target goal
  ctx.font = '700 13px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.shadowBlur = 0;
  ctx.fillText(`FIRST TO ${round.targetScore}`, boardX + boardW * 0.5, arenaTop + 62);

  // Sort cars by score desc
  const sorted = [...state.cars].sort((a, b) => b.score - a.score);
  const maxVisible = Math.min(8, sorted.length);
  for (let r = 0; r < maxVisible; r++) {
    const entry = sorted[r];
    const rowY = arenaTop + 95 + r * 42;
    // Swatch badge
    ctx.fillStyle = `hsl(${entry.hue}, 90%, 55%)`;
    ctx.beginPath();
    ctx.arc(boardX + 24, rowY, 11, 0, Math.PI * 2);
    ctx.fill();

    // Name
    ctx.font = '800 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(entry.name, boardX + 44, rowY + 5);

    // Score
    ctx.font = '900 18px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = entry.score >= round.targetScore - 1 ? '#ff3366' : theme.text;
    ctx.fillText(entry.score.toString(), boardX + boardW - 20, rowY + 5);
  }

  // Instructions at footer of board
  ctx.font = '800 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('PRESS BOOST!', boardX + boardW * 0.5, arenaBottom - 26);
  ctx.restore();
}

// 8. WINNER / GO! Banner Overlay
if (round.phase === 'winner' && round.winner) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(arenaLeft, arenaTop, arenaW, arenaH);

  const pulse = 1 + Math.sin(frame.t * 8) * 0.08;
  ctx.translate(arenaCx, arenaCy);
  ctx.scale(pulse, pulse);

  ctx.font = '900 68px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = `hsl(${round.winner.hue}, 100%, 65%)`;
  ctx.shadowColor = `hsl(${round.winner.hue}, 100%, 50%)`;
  ctx.shadowBlur = 32;
  ctx.fillText('WINNER!', 0, -25);

  ctx.font = '900 44px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 18;
  ctx.fillText(round.winner.name, 0, 35);

  ctx.font = '700 20px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.shadowBlur = 0;
  ctx.fillText('NEXT ROUND STARTING...', 0, 85);
  ctx.restore();
} else if (frame.t < 2.0) {
  // Initial GO! banner
  ctx.save();
  ctx.font = '900 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#00ffcc';
  ctx.shadowColor = '#00ffcc';
  ctx.shadowBlur = 30;
  ctx.fillText('GO!', arenaCx, arenaCy);
  ctx.restore();
}

ctx.restore();