const dt = Math.min(frame.dt || 0.016, 0.05);
const W = frame.width;
const H = frame.height;

// 1. Controls & Palettes
const speeds = { relaxed: 160, cruising: 240, hyper: 340 };
const speed = (getVar('game_speed') ?? 2.5) * 85;

const gapSizes = { generous: 270, standard: 215, narrow: 165 };
const gapSize = gapSizes[getVar('gap_size')] ?? 215;

const grav = getVar('gravity') ?? 1800;
const trailsEnabled = getVar('trails') ?? true;

const themes = {
  neon_sunset: {
    skyTop: '#100526', skyMid: '#70145a', skyBot: '#ff6e40',
    sun: '#ffe600', sunGlow: '#ff0077',
    bldgFar: '#220b38', bldgNear: '#0c0217',
    pipeBody: '#180d2b', pipeRim: '#00ffff', pipeGlow: 'rgba(0,255,255,0.4)',
    accent: '#ff0077'
  },
  cyber_midnight: {
    skyTop: '#020b17', skyMid: '#062942', skyBot: '#006677',
    sun: '#00ffff', sunGlow: '#0088cc',
    bldgFar: '#081a2e', bldgNear: '#020914',
    pipeBody: '#0a1628', pipeRim: '#00ff88', pipeGlow: 'rgba(0,255,136,0.35)',
    accent: '#00ffcc'
  },
  vaporwave: {
    skyTop: '#1d0b38', skyMid: '#862973', skyBot: '#f788be',
    sun: '#ff71ce', sunGlow: '#01cdfe',
    bldgFar: '#2b1045', bldgNear: '#120424',
    pipeBody: '#221136', pipeRim: '#05ffa1', pipeGlow: 'rgba(5,255,161,0.4)',
    accent: '#ff71ce'
  },
  golden_hour: {
    skyTop: '#1a0808', skyMid: '#6e1d0f', skyBot: '#f48c06',
    sun: '#ffea00', sunGlow: '#ff5400',
    bldgFar: '#2b0f0a', bldgNear: '#140503',
    pipeBody: '#240f0b', pipeRim: '#ffba08', pipeGlow: 'rgba(255,186,8,0.4)',
    accent: '#faa307'
  }
};
const theme = themes[getVar('city_theme')] ?? themes.neon_sunset;

// 2. State Initialization
room.state.phase ??= 'countdown'; // 'countdown' | 'playing' | 'winner'
room.state.phaseTimer ??= 2.5;
room.state.pipes ??= [];
room.state.birds ??= [];
room.state.particles ??= [];
room.state.score ??= 0;
room.state.lastFlapTime ??= frame.t;
room.state.winnerInfo ??= null;
room.state.nextPipeX ??= W + 200;

const state = room.state;
const bass = audio.bass ?? 0;
const beat = audio.beat ?? false;

// Sync birds with room.people (or create bots if nobody connected)
const activePeople = (room.people && room.people.length > 0) 
  ? room.people 
  : [
      { id: '__bot0', hue: 45, table: 'Demo 1' },
      { id: '__bot1', hue: 170, table: 'Demo 2' },
      { id: '__bot2', hue: 280, table: 'Demo 3' },
      { id: '__bot3', hue: 345, table: 'Demo 4' }
    ];

// Maintain bird instances
const existingBirdMap = new Map();
for (const b of state.birds) existingBirdMap.set(b.id, b);

const totalBirds = activePeople.length;
state.birds = activePeople.map((p, idx) => {
  let b = existingBirdMap.get(p.id);
  const startX = Math.min(W * 0.4, 180 + (idx * 28) % (W * 0.22));
  if (!b) {
    b = {
      id: p.id,
      hue: p.hue ?? (idx * 67) % 360,
      label: p.table ? String(p.table) : `P${idx + 1}`,
      x: startX,
      y: H * 0.45 + (idx % 5 - 2) * 35,
      vy: 0,
      alive: true,
      pulse: 0,
      rot: 0,
      trail: []
    };
  } else {
    b.hue = p.hue ?? b.hue;
    b.x = startX;
  }
  return b;
});

// Helper to reset round
function startNewRound() {
  state.phase = 'countdown';
  state.phaseTimer = 2.4;
  state.score = 0;
  state.pipes.length = 0;
  state.nextPipeX = W + 120;
  state.winnerInfo = null;
  state.birds.forEach((b, i) => {
    b.y = H * 0.45 + (i % 6 - 3) * 30;
    b.vy = 0;
    b.alive = true;
    b.rot = 0;
    b.pulse = 0;
    b.trail.length = 0;
  });
}

// 3. Process Interactive Actions ('flap')
let flappedAny = false;
if (room.events) {
  for (const e of room.events) {
    if (e.name === 'flap') {
      state.lastFlapTime = frame.t;
      flappedAny = true;
      // Find specific bird, or if trigger has no participant match, flap all
      let target = state.birds.find(b => b.id === e.participantId);
      if (!target && state.birds.length > 0) {
        // Random or single player
        target = state.birds.find(b => b.alive) || state.birds[0];
      }
      if (target && target.alive) {
        target.vy = -540;
        target.pulse = 1.0;
        // Spawn flap puffs
        for (let k = 0; k < 4; k++) {
          if (state.particles.length < 150) {
            state.particles.push({
              x: target.x - 12,
              y: target.y + 6 + (Math.random() - 0.5) * 10,
              vx: -80 - Math.random() * 80,
              vy: 40 + Math.random() * 60,
              life: 1.0,
              decay: 2.5,
              color: `hsl(${target.hue}, 100%, 70%)`,
              size: 5 + Math.random() * 5
            });
          }
        }
      }
    }
  }
}

// Attract mode / Auto-pilot if inactive for > 3.8 seconds or demo bots
const isAttract = (frame.t - state.lastFlapTime > 3.8) || (room.people && room.people.length === 0);
if (isAttract && state.phase === 'playing') {
  // Find upcoming pipe gap
  const upcoming = state.pipes.find(p => p.x + 80 > 140);
  const targetY = upcoming ? (upcoming.topH + gapSize * 0.5) : H * 0.5;
  state.birds.forEach((b, i) => {
    if (b.alive) {
      const offset = Math.sin(frame.t * 3.5 + i * 1.3) * 28;
      if (b.y > targetY + offset && b.vy > 40) {
        b.vy = -520;
        b.pulse = 0.8;
      }
    }
  });
}

// 4. Update Game State
state.phaseTimer -= dt;

if (state.phase === 'countdown') {
  // Birds hover gently in formation
  state.birds.forEach((b, idx) => {
    b.y = H * 0.48 + Math.sin(frame.t * 4 + idx * 0.8) * 18;
    b.vy = 0;
    b.rot = Math.sin(frame.t * 4 + idx) * 0.1;
  });
  if (state.phaseTimer <= 0) {
    state.phase = 'playing';
  }
} else if (state.phase === 'playing') {
  // Spawn pipes
  state.nextPipeX -= speed * dt;
  if (state.nextPipeX <= W) {
    const margin = 120;
    const avail = H - gapSize - margin * 2;
    const topH = margin + Math.random() * Math.max(40, avail);
    state.pipes.push({ x: W + 20, topH, scored: false });
    state.nextPipeX = W + 360 + Math.random() * 80;
  }

  // Scroll & cull pipes
  for (let i = state.pipes.length - 1; i >= 0; i--) {
    const p = state.pipes[i];
    p.x -= speed * dt;
    if (!p.scored && p.x + 70 < 180) {
      p.scored = true;
      state.score += 1;
    }
    if (p.x < -120) state.pipes.splice(i, 1);
  }

  // Update birds physics & collision
  let aliveCount = 0;
  let lastAliveBird = null;

  state.birds.forEach((b) => {
    b.pulse = Math.max(0, b.pulse - dt * 3.0);
    if (b.alive) {
      b.vy += grav * dt;
      b.y += b.vy * dt;
      b.rot = Math.atan2(b.vy, 450);

      // Trails
      if (trailsEnabled && (frame.t % 0.05 < dt)) {
        b.trail.push({ x: b.x - 14, y: b.y, life: 1.0 });
        if (b.trail.length > 8) b.trail.shift();
      }

      // Ceiling / Floor bounds
      const r = 20;
      if (b.y - r < 0 || b.y + r > H - 24) {
        b.alive = false;
      }

      // Pipe collisions
      for (const p of state.pipes) {
        if (b.x + r > p.x && b.x - r < p.x + 76) {
          if (b.y - r < p.topH || b.y + r > p.topH + gapSize) {
            b.alive = false;
            break;
          }
        }
      }

      if (!b.alive) {
        // Crash burst!
        for (let k = 0; k < 14; k++) {
          if (state.particles.length < 150) {
            const ang = Math.random() * Math.PI * 2;
            const sp = 90 + Math.random() * 220;
            state.particles.push({
              x: b.x, y: b.y,
              vx: Math.cos(ang) * sp,
              vy: Math.sin(ang) * sp,
              life: 1.0,
              decay: 1.8,
              color: `hsl(${b.hue}, 100%, 65%)`,
              size: 5 + Math.random() * 6
            });
          }
        }
      } else {
        aliveCount++;
        lastAliveBird = b;
      }
    } else {
      // Tumble dead bird down off-screen
      b.vy += grav * 1.2 * dt;
      b.y += b.vy * dt;
      b.rot += 8 * dt;
    }
  });

  // Check win condition
  const threshold = (state.birds.length > 1) ? 1 : 0;
  if (aliveCount <= threshold) {
    state.phase = 'winner';
    state.phaseTimer = 3.6;
    state.winnerInfo = lastAliveBird || state.birds[0];
  }
} else if (state.phase === 'winner') {
  // Winner celebration / confetti
  if (Math.random() < 0.35 && state.particles.length < 160) {
    const winHue = state.winnerInfo ? state.winnerInfo.hue : 50;
    state.particles.push({
      x: Math.random() * W,
      y: -10,
      vx: (Math.random() - 0.5) * 90,
      vy: 120 + Math.random() * 160,
      life: 1.2,
      decay: 0.6,
      color: `hsl(${winHue + (Math.random() - 0.5) * 60}, 100%, 65%)`,
      size: 6 + Math.random() * 6
    });
  }
  if (state.phaseTimer <= 0) {
    startNewRound();
  }
}

// Update particles
for (let i = state.particles.length - 1; i >= 0; i--) {
  const pt = state.particles[i];
  pt.x += pt.vx * dt;
  pt.y += pt.vy * dt;
  pt.life -= pt.decay * dt;
  if (pt.life <= 0) state.particles.splice(i, 1);
}

// 5. DRAWING
ctx.save();

// Sky gradient
const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
skyGrad.addColorStop(0, theme.skyTop);
skyGrad.addColorStop(0.55, theme.skyMid);
skyGrad.addColorStop(1, theme.skyBot);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

// Big Synth Sun / Moon
const sunY = H * 0.52;
const sunR = Math.min(W, H) * 0.22 * (1 + bass * 0.12);
const sunGrad = ctx.createRadialGradient(W * 0.5, sunY, 10, W * 0.5, sunY, sunR);
sunGrad.addColorStop(0, '#ffffff');
sunGrad.addColorStop(0.2, theme.sun);
sunGrad.addColorStop(0.8, theme.sunGlow);
sunGrad.addColorStop(1, 'transparent');

ctx.save();
ctx.fillStyle = sunGrad;
ctx.beginPath();
ctx.arc(W * 0.5, sunY, sunR, 0, Math.PI * 2);
ctx.fill();

// Sliced sun scanlines
ctx.fillStyle = theme.skyMid;
for (let sy = sunY - sunR * 0.2; sy < sunY + sunR; sy += 14) {
  const bandH = Math.max(2, (sy - (sunY - sunR * 0.2)) * 0.08);
  ctx.fillRect(W * 0.5 - sunR, sy, sunR * 2, bandH);
}
ctx.restore();

// Distant Skyline Parallax (Far)
ctx.fillStyle = theme.bldgFar;
const farStep = 75;
for (let bx = 0; bx < W + farStep; bx += farStep) {
  const bh = 140 + Math.sin(bx * 0.012 + 1) * 70 + Math.cos(bx * 0.04) * 40;
  ctx.fillRect(bx - (frame.t * 20) % farStep, H - bh - 24, farStep + 2, bh);
}

// Near Skyline Parallax (Near with glowing windows)
ctx.fillStyle = theme.bldgNear;
const nearStep = 95;
for (let bx = 0; bx < W + nearStep; bx += nearStep) {
  const bh = 100 + Math.sin(bx * 0.02 + 4) * 90 + ((bx * 31) % 65);
  const curX = bx - (frame.t * speed * 0.28) % nearStep;
  ctx.fillRect(curX, H - bh - 24, nearStep + 2, bh);

  // Audio-reactive window grid
  ctx.fillStyle = (beat && (bx % 3 === 0)) ? theme.accent : 'rgba(255, 230, 160, 0.45)';
  for (let wy = H - bh - 10; wy < H - 35; wy += 22) {
    if (((bx + wy) % 5) !== 0) {
      ctx.fillRect(curX + 16, wy, 8, 12);
      ctx.fillRect(curX + 34, wy, 8, 12);
    }
  }
  ctx.fillStyle = theme.bldgNear;
}

// Columns / Towers (Obstacles)
for (const p of state.pipes) {
  const pw = 74;
  // Audio pulse outline glow
  const rimGlow = 4 + bass * 12;
  ctx.save();
  ctx.shadowColor = theme.pipeRim;
  ctx.shadowBlur = rimGlow;

  // Top pipe body
  ctx.fillStyle = theme.pipeBody;
  ctx.fillRect(p.x, 0, pw, p.topH);
  // Top cap rim
  ctx.fillStyle = theme.pipeRim;
  ctx.fillRect(p.x - 4, p.topH - 22, pw + 8, 22);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(p.x - 4, p.topH - 4, pw + 8, 4);

  // Bottom pipe body
  const bTop = p.topH + gapSize;
  const bH = H - bTop - 24;
  ctx.fillStyle = theme.pipeBody;
  ctx.fillRect(p.x, bTop, pw, bH);
  // Bottom cap rim
  ctx.fillStyle = theme.pipeRim;
  ctx.fillRect(p.x - 4, bTop, pw + 8, 22);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(p.x - 4, bTop, pw + 8, 4);

  // Neon hazard diagonal strips on pipes
  ctx.strokeStyle = theme.pipeGlow;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let sy = 20; sy < p.topH - 30; sy += 36) {
    ctx.moveTo(p.x + 8, sy);
    ctx.lineTo(p.x + pw - 8, sy + 20);
  }
  for (let sy = bTop + 36; sy < H - 40; sy += 36) {
    ctx.moveTo(p.x + 8, sy);
    ctx.lineTo(p.x + pw - 8, sy + 20);
  }
  ctx.stroke();

  ctx.restore();
}

// Glowing Floor & Ceiling boundaries
ctx.fillStyle = '#06010d';
ctx.fillRect(0, H - 24, W, 24);
ctx.fillStyle = theme.pipeRim;
ctx.fillRect(0, H - 24, W, 4);
ctx.shadowColor = theme.pipeRim;
ctx.shadowBlur = 10 + bass * 15;
ctx.fillRect(0, 0, W, 4);
ctx.shadowBlur = 0;

// Particles
for (const pt of state.particles) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, pt.life);
  ctx.fillStyle = pt.color;
  ctx.shadowColor = pt.color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, pt.size * (0.4 + pt.life * 0.6), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Bird Trails
if (trailsEnabled) {
  for (const b of state.birds) {
    for (let k = 0; k < b.trail.length; k++) {
      const tr = b.trail[k];
      const trAlpha = (k / b.trail.length) * 0.45;
      ctx.fillStyle = `hsla(${b.hue}, 100%, 65%, ${trAlpha})`;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 14 * (k / b.trail.length), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Render Birds
const birdR = 21;
for (const b of state.birds) {
  if (b.y > H + 80) continue;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);

  const isDead = !b.alive;
  const hue = b.hue;

  // Flap Shockwave ring
  if (b.pulse > 0.05) {
    ctx.strokeStyle = `hsla(${hue}, 100%, 75%, ${b.pulse})`;
    ctx.lineWidth = 4 * b.pulse;
    ctx.beginPath();
    ctx.arc(0, 0, birdR + (1.0 - b.pulse) * 32, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 6, birdR * 1.1, birdR * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bird Body
  ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
  ctx.shadowBlur = isDead ? 0 : 12 + bass * 8;
  ctx.fillStyle = isDead ? '#666' : `hsl(${hue}, 95%, 52%)`;
  ctx.beginPath();
  ctx.arc(0, 0, birdR, 0, Math.PI * 2);
  ctx.fill();

  // Wing
  ctx.fillStyle = isDead ? '#444' : `hsl(${hue}, 100%, 40%)`;
  const wingWiggle = Math.sin(frame.t * 22 + b.x) * 4;
  ctx.beginPath();
  ctx.ellipse(-6, 2 + wingWiggle, 10, 6, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Eye (White + Pupil or X when dead)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(9, -6, 7, 0, Math.PI * 2);
  ctx.fill();

  if (isDead) {
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(6, -9); ctx.lineTo(12, -3);
    ctx.moveTo(12, -9); ctx.lineTo(6, -3);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(11, -6, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Beak
  ctx.fillStyle = '#ff8800';
  ctx.beginPath();
  ctx.moveTo(17, -2);
  ctx.lineTo(26, 2);
  ctx.lineTo(16, 6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Player label floating above bird (unrotated)
  ctx.save();
  ctx.font = '900 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3.5;
  ctx.strokeText(b.label, b.x, b.y - birdR - 8);
  ctx.fillText(b.label, b.x, b.y - birdR - 8);
  ctx.restore();
}

// 6. HUD & Large Typography Overlay
// Live Score at Top Center
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'top';
ctx.font = '900 68px system-ui, sans-serif';
ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
ctx.shadowBlur = 10;
ctx.fillText(state.score, W * 0.5, 20);
ctx.restore();

// Mode Banners
if (state.phase === 'countdown') {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const countVal = Math.ceil(state.phaseTimer);
  const label = countVal > 0 ? (countVal === 1 ? 'READY!' : `${countVal}`) : 'FLAP!';
  
  ctx.font = '900 96px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 10;
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 24;
  ctx.strokeText(label, W * 0.5, H * 0.32);
  ctx.fillText(label, W * 0.5, H * 0.32);

  ctx.font = '900 28px system-ui, sans-serif';
  ctx.fillStyle = theme.accent;
  ctx.strokeText('PRESS FLAP TO FLY', W * 0.5, H * 0.32 + 75);
  ctx.fillText('PRESS FLAP TO FLY', W * 0.5, H * 0.32 + 75);
  ctx.restore();
} else if (state.phase === 'winner') {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const winner = state.winnerInfo;
  const winText = winner ? `${winner.label.toUpperCase()} WINS!` : 'ROUND OVER!';
  const winColor = winner ? `hsl(${winner.hue}, 100%, 65%)` : '#ffffff';

  // Banner background ribbon
  ctx.fillStyle = 'rgba(10, 2, 20, 0.85)';
  ctx.fillRect(0, H * 0.3 - 60, W, 140);
  ctx.fillStyle = winColor;
  ctx.fillRect(0, H * 0.3 - 60, W, 4);
  ctx.fillRect(0, H * 0.3 + 76, W, 4);

  ctx.font = '900 78px system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(winText, W * 0.5, H * 0.3);
  ctx.fillStyle = winColor;
  ctx.shadowColor = winColor;
  ctx.shadowBlur = 25;
  ctx.fillText(winText, W * 0.5, H * 0.3);

  ctx.font = '900 24px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 0;
  ctx.fillText(`SCORE: ${state.score}  •  NEXT FLIGHT SOON`, W * 0.5, H * 0.3 + 52);
  ctx.restore();
}

// Attract mode indicator (subtle label if playing demo)
if (isAttract && state.phase === 'playing') {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 20px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.lineWidth = 4;
  ctx.strokeText('DEMO MODE  —  TAP FLAP TO JOIN', W * 0.5, H - 38);
  ctx.fillText('DEMO MODE  —  TAP FLAP TO JOIN', W * 0.5, H - 38);
  ctx.restore();
}

ctx.restore();