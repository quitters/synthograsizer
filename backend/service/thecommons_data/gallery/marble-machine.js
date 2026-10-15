ctx.save();
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.045);
const t = frame.t;

// Read Controls
const themeKey = getVar('theme') ?? 'brass clockwork';
const layoutKey = getVar('peg_layout') ?? 'triangular pyramid';
const rawTilt = getVar('tilt') ?? 0;
const elasticity = getVar('bounciness') ?? 0.65;
const numBins = Math.round(getVar('bin_count') ?? 9);

// Initialize Persistent State
room.state.marbles ??= [];
room.state.sparks ??= [];
room.state.pegs ??= [];
room.state.smoothTilt ??= 0;
room.state.trapdoor ??= 0;
room.state.autoTimer ??= 0;
room.state.lastLayout ??= '';

// Smooth tilt to avoid harsh physics shocks
const targetTiltRad = (rawTilt * Math.PI) / 180;
room.state.smoothTilt += (targetTiltRad - room.state.smoothTilt) * Math.min(1, dt * 5);
const tiltRad = room.state.smoothTilt;

// Dimensions of machine board inside canvas
const padX = W * 0.12;
const boardW = W - padX * 2;
const boardTop = H * 0.07;
const boardBottom = H * 0.93;
const boardH = boardBottom - boardTop;
const pegAreaTop = boardTop + boardH * 0.16;
const pegAreaBottom = boardTop + boardH * 0.72;
const binTop = pegAreaBottom + 6;
const floorY = boardBottom - 18;

// Regenerate Pegs if needed
if (room.state.lastLayout !== layoutKey || room.state.pegs.length === 0 || room.state.lastW !== W) {
  room.state.pegs = [];
  room.state.lastLayout = layoutKey;
  room.state.lastW = W;
  const pegR = Math.max(4, Math.min(8, W * 0.007));
  const centerX = W * 0.5;

  if (layoutKey === 'triangular pyramid') {
    const rows = 10;
    const rowH = (pegAreaBottom - pegAreaTop) / (rows + 0.5);
    for (let r = 0; r < rows; r++) {
      const count = 3 + r;
      const span = boardW * 0.76 * ((r + 2.5) / (rows + 2));
      const py = pegAreaTop + r * rowH;
      for (let c = 0; c < count; c++) {
        const px = centerX - span * 0.5 + (count === 1 ? 0 : (c / (count - 1)) * span);
        room.state.pegs.push({ x: px, y: py, r: pegR, hitTimer: 0, hitHue: 40 });
      }
    }
  } else if (layoutKey === 'diamond lattice') {
    const rows = 11;
    const rowH = (pegAreaBottom - pegAreaTop) / (rows - 0.5);
    const colW = boardW * 0.08;
    for (let r = 0; r < rows; r++) {
      const py = pegAreaTop + r * rowH;
      const staggered = (r % 2 === 1);
      const startX = padX + boardW * 0.14 + (staggered ? colW * 0.5 : 0);
      const endX = padX + boardW * 0.86;
      for (let px = startX; px <= endX; px += colW) {
        room.state.pegs.push({ x: px, y: py, r: pegR, hitTimer: 0, hitHue: 40 });
      }
    }
  } else {
    // Funnel Slalom
    const rows = 9;
    const rowH = (pegAreaBottom - pegAreaTop) / rows;
    for (let r = 0; r < rows; r++) {
      const py = pegAreaTop + r * rowH;
      const shift = Math.sin(r * 1.1) * (boardW * 0.22);
      const count = 7;
      const span = boardW * 0.65;
      for (let c = 0; c < count; c++) {
        const px = centerX + shift - span * 0.5 + (c / (count - 1)) * span;
        if (px > padX + 25 && px < padX + boardW - 25) {
          room.state.pegs.push({ x: px, y: py, r: pegR, hitTimer: 0, hitHue: 40 });
        }
      }
    }
  }
}

// Color Themes & Aesthetics
const themes = {
  'brass clockwork': {
    bgGrad: ['#0f0a06', '#1e140d'],
    boardFill: '#241710',
    rimColor: '#c9933b',
    rimShine: '#ffd27d',
    pegBase: '#b87b28',
    pegShine: '#fff1bf',
    wireColor: 'rgba(212, 160, 74, 0.25)',
    accent: '#e69a28'
  },
  'neon pachinko': {
    bgGrad: ['#06060d', '#100c22'],
    boardFill: '#0d0c18',
    rimColor: '#ff2a8d',
    rimShine: '#00ffff',
    pegBase: '#1a4e7c',
    pegShine: '#38efff',
    wireColor: 'rgba(0, 255, 255, 0.2)',
    accent: '#00ffff'
  },
  'cosmic arcade': {
    bgGrad: ['#030208', '#0b0920'],
    boardFill: '#070614',
    rimColor: '#6d3aff',
    rimShine: '#b78eff',
    pegBase: '#43297a',
    pegShine: '#d8c2ff',
    wireColor: 'rgba(150, 100, 255, 0.22)',
    accent: '#a855f7'
  },
  'slate minimalism': {
    bgGrad: ['#121417', '#1c1f24'],
    boardFill: '#17191d',
    rimColor: '#4f5660',
    rimShine: '#949ba4',
    pegBase: '#32373e',
    pegShine: '#cfd4dc',
    wireColor: 'rgba(255, 255, 255, 0.1)',
    accent: '#8b949e'
  }
};
const curTheme = themes[themeKey] || themes['brass clockwork'];

// Event Handling: Marble drops & Trapdoor releases
for (const ev of (room.events || [])) {
  if (ev.name === 'drop_marble') {
    let dropHue = Math.floor((ev.t * 137.5) % 360);
    if (room.people && room.people.length > 0) {
      const p = room.people.find(person => person.id === ev.participantId);
      if (p && p.hue !== undefined) dropHue = p.hue;
    }
    const spawnX = W * 0.5 + (Math.random() - 0.5) * (boardW * 0.12);
    room.state.marbles.push({
      x: spawnX,
      y: boardTop + 16,
      vx: (Math.random() - 0.5) * 80,
      vy: 60 + Math.random() * 50,
      r: Math.max(7, Math.min(13, W * 0.012)),
      hue: dropHue,
      owner: ev.participantId,
      settled: 0
    });
  } else if (ev.name === 'release_gate') {
    room.state.trapdoor = 2.8;
  }
}

// Trapdoor Decay
if (room.state.trapdoor > 0) {
  room.state.trapdoor = Math.max(0, room.state.trapdoor - dt);
}

// Idle Marble Spawner: Keep wall active even when alone
room.state.autoTimer += dt;
const autoInterval = audio.beat ? 0.9 : 2.6;
if ((room.state.marbles.length < 18 || audio.beat) && room.state.autoTimer > autoInterval) {
  room.state.autoTimer = 0;
  let randomHue = Math.floor(Math.random() * 360);
  if (room.people && room.people.length > 0) {
    const randomPerson = room.people[Math.floor(Math.random() * room.people.length)];
    if (randomPerson && randomPerson.hue !== undefined) randomHue = randomPerson.hue;
  }
  room.state.marbles.push({
    x: W * 0.5 + (Math.random() - 0.5) * (boardW * 0.16),
    y: boardTop + 14,
    vx: (Math.random() - 0.5) * 60,
    vy: 50 + Math.random() * 40,
    r: Math.max(7, Math.min(13, W * 0.012)),
    hue: randomHue,
    owner: 'auto',
    settled: 0
  });
}

// Bound Marble Population (~120 max)
while (room.state.marbles.length > 120) {
  room.state.marbles.shift();
}

// Calculate Physics Space
// Machine center of rotation
const midX = W * 0.5;
const midY = H * 0.5;

// World gravity relative to tilted machine:
// In local board coordinates, downward gravity is rotated by -tiltRad
const gMag = 940;
const gx = -gMag * Math.sin(tiltRad);
const gy = gMag * Math.cos(tiltRad) + (audio.bass || 0) * 140;

// Physics Sub-stepping for stability
const subSteps = 3;
const subDt = dt / subSteps;
const marbles = room.state.marbles;
const pegs = room.state.pegs;

// Bin Divider Boundaries
const binW = boardW / numBins;

for (let step = 0; step < subSteps; step++) {
  // 1. Marble Movement & Gravity
  for (let i = 0; i < marbles.length; i++) {
    const m = marbles[i];
    m.vx += gx * subDt;
    m.vy += gy * subDt;

    // Gentle air drag
    m.vx *= 0.999;
    m.vy *= 0.999;

    m.x += m.vx * subDt;
    m.y += m.vy * subDt;

    // Funnel Guides at top
    if (m.y < pegAreaTop - 10) {
      const funnelY = boardTop + 20;
      const tProgress = Math.max(0, Math.min(1, (m.y - funnelY) / (pegAreaTop - funnelY)));
      const leftF = padX + (boardW * 0.38) * tProgress;
      const rightF = padX + boardW - (boardW * 0.38) * tProgress;
      if (m.x < leftF + m.r) {
        m.x = leftF + m.r;
        if (m.vx < 0) m.vx = -m.vx * 0.4;
      }
      if (m.x > rightF - m.r) {
        m.x = rightF - m.r;
        if (m.vx > 0) m.vx = -m.vx * 0.4;
      }
    }

    // Outer Walls
    const minWallX = padX + 16 + m.r;
    const maxWallX = padX + boardW - 16 - m.r;
    if (m.x < minWallX) {
      m.x = minWallX;
      if (m.vx < 0) m.vx = -m.vx * elasticity;
    } else if (m.x > maxWallX) {
      m.x = maxWallX;
      if (m.vx > 0) m.vx = -m.vx * elasticity;
    }

    // Floor or Trapdoor
    const floorLimit = floorY - m.r;
    if (room.state.trapdoor <= 0) {
      if (m.y > floorLimit) {
        m.y = floorLimit;
        if (m.vy > 0) {
          m.vy = -m.vy * 0.28;
          m.vx *= 0.82;
        }
        if (Math.abs(m.vx) < 15 && Math.abs(m.vy) < 15) m.settled = Math.min(1, m.settled + subDt * 2);
      }
    }

    // Bin Separators (Pillars between slots)
    if (m.y > binTop && m.y <= floorY + 4) {
      for (let b = 1; b < numBins; b++) {
        const divX = padX + b * binW;
        const dx = m.x - divX;
        const divThick = 5;
        if (Math.abs(dx) < m.r + divThick) {
          const sign = dx >= 0 ? 1 : -1;
          m.x = divX + sign * (m.r + divThick);
          m.vx = -m.vx * 0.45;
        }
      }
    }

    // Peg Collisions
    for (let pIdx = 0; pIdx < pegs.length; pIdx++) {
      const p = pegs[pIdx];
      const pdx = m.x - p.x;
      const pdy = m.y - p.y;
      const minDist = m.r + p.r;
      const distSq = pdx * pdx + pdy * pdy;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 0.001;
        const nx = pdx / dist;
        const ny = pdy / dist;
        // Push out
        m.x = p.x + nx * minDist;
        m.y = p.y + ny * minDist;
        // Normal velocity reflection
        const vDotN = m.vx * nx + m.vy * ny;
        if (vDotN < 0) {
          m.vx = (m.vx - (1 + elasticity) * vDotN * nx) * 0.98;
          m.vy = (m.vy - (1 + elasticity) * vDotN * ny) * 0.98;
          p.hitTimer = 1.0;
          p.hitHue = m.hue;
          // Spawn spark on hard hits
          if (Math.abs(vDotN) > 140 && room.state.sparks.length < 50) {
            room.state.sparks.push({
              x: p.x + nx * p.r,
              y: p.y + ny * p.r,
              vx: nx * 90 + (Math.random() - 0.5) * 70,
              vy: ny * 90 + (Math.random() - 0.5) * 70,
              life: 1.0,
              hue: m.hue
            });
          }
        }
      }
    }
  }

  // 2. Marble vs Marble Collisions
  for (let i = 0; i < marbles.length; i++) {
    const m1 = marbles[i];
    for (let j = i + 1; j < marbles.length; j++) {
      const m2 = marbles[j];
      const dx = m2.x - m1.x;
      const dy = m2.y - m1.y;
      const minDist = m1.r + m2.r;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 0.001;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (minDist - dist) * 0.5;

        m1.x -= nx * overlap;
        m1.y -= ny * overlap;
        m2.x += nx * overlap;
        m2.y += ny * overlap;

        const rvx = m2.vx - m1.vx;
        const rvy = m2.vy - m1.vy;
        const vNorm = rvx * nx + rvy * ny;
        if (vNorm < 0) {
          const impulse = -(1 + elasticity * 0.75) * vNorm * 0.5;
          m1.vx -= impulse * nx;
          m1.vy -= impulse * ny;
          m2.vx += impulse * nx;
          m2.vy += impulse * ny;
        }
      }
    }
  }
}

// Remove dropped marbles that exited bottom
room.state.marbles = marbles.filter(m => m.y < H + 80);

// Update Peg Hit Timers & Sparks
for (let p of pegs) {
  if (p.hitTimer > 0) p.hitTimer = Math.max(0, p.hitTimer - dt * 2.8);
}
for (let s of room.state.sparks) {
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.life -= dt * 2.2;
}
room.state.sparks = room.state.sparks.filter(s => s.life > 0);

// -----------------------------------------------------
// RENDERING
// -----------------------------------------------------

// 1. Room / Wall Background (Unrotated)
const wallGrad = ctx.createLinearGradient(0, 0, 0, H);
wallGrad.addColorStop(0, curTheme.bgGrad[0]);
wallGrad.addColorStop(1, curTheme.bgGrad[1]);
ctx.fillStyle = wallGrad;
ctx.fillRect(0, 0, W, H);

// Ambient subtle audio pulse on backdrop
if (audio.level > 0.05) {
  const pulseR = Math.max(W, H) * (0.3 + audio.level * 0.25);
  const bgGlow = ctx.createRadialGradient(midX, midY, 10, midX, midY, pulseR);
  bgGlow.addColorStop(0, `hsla(${(t * 25) % 360}, 60%, 50%, ${0.08 * audio.level})`);
  bgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, W, H);
}

// 2. Rotate Entire Marble Machine Board Around Screen Center
ctx.save();
ctx.translate(midX, midY);
ctx.rotate(tiltRad);
ctx.translate(-midX, -midY);

// Board Shadow
ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
ctx.shadowBlur = 35;
ctx.shadowOffsetX = 0;
ctx.shadowOffsetY = 18;

// Machine Backboard
ctx.fillStyle = curTheme.boardFill;
ctx.beginPath();
ctx.roundRect(padX, boardTop, boardW, boardH, 20);
ctx.fill();
ctx.shadowBlur = 0;
ctx.shadowOffsetY = 0;

// Machine Outer Brass / Neon Bezel
ctx.lineWidth = Math.max(4, W * 0.007);
ctx.strokeStyle = curTheme.rimColor;
ctx.stroke();

// Inner Rim Highlight
ctx.lineWidth = 1.5;
ctx.strokeStyle = curTheme.rimShine;
ctx.beginPath();
ctx.roundRect(padX + 5, boardTop + 5, boardW - 10, boardH - 10, 16);
ctx.stroke();

// Decorative Top Hopper / Feeder Chamber
ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
ctx.beginPath();
ctx.moveTo(padX + boardW * 0.1, boardTop + 6);
ctx.lineTo(midX - boardW * 0.1, boardTop + boardH * 0.13);
ctx.lineTo(midX + boardW * 0.1, boardTop + boardH * 0.13);
ctx.lineTo(padX + boardW * 0.9, boardTop + 6);
ctx.closePath();
ctx.fill();
ctx.strokeStyle = curTheme.wireColor;
ctx.stroke();

// Draw Connected Participants Badges at Hopper
if (room.people && room.people.length > 0) {
  const badgeCount = Math.min(10, room.people.length);
  const badgeSpacing = Math.min(22, (boardW * 0.5) / badgeCount);
  const startBadgeX = midX - ((badgeCount - 1) * badgeSpacing) * 0.5;
  for (let i = 0; i < badgeCount; i++) {
    const person = room.people[i];
    const bx = startBadgeX + i * badgeSpacing;
    const by = boardTop + 14;
    ctx.beginPath();
    ctx.arc(bx, by, 5, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${person.hue ?? 45}, 85%, 60%)`;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Bin Partitions & Fill Floor
ctx.lineWidth = 3;
ctx.strokeStyle = curTheme.rimColor;
for (let b = 1; b < numBins; b++) {
  const divX = padX + b * binW;
  ctx.beginPath();
  ctx.moveTo(divX, binTop);
  ctx.lineTo(divX, floorY);
  ctx.stroke();

  // Top cap jewel on each bin divider
  ctx.beginPath();
  ctx.arc(divX, binTop, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = curTheme.rimShine;
  ctx.fill();
}

// Trapdoor at Bottom
if (room.state.trapdoor > 0) {
  const openProgress = Math.min(1, room.state.trapdoor);
  const swingAngle = (openProgress * Math.PI) / 3;
  ctx.save();
  ctx.strokeStyle = '#e63946';
  ctx.lineWidth = 4;
  // Left trapdoor flap
  ctx.beginPath();
  ctx.moveTo(padX + 10, floorY);
  ctx.lineTo(padX + 10 + (boardW * 0.45) * Math.cos(swingAngle), floorY + (boardW * 0.45) * Math.sin(swingAngle));
  ctx.stroke();
  // Right trapdoor flap
  ctx.beginPath();
  ctx.moveTo(padX + boardW - 10, floorY);
  ctx.lineTo(padX + boardW - 10 - (boardW * 0.45) * Math.cos(swingAngle), floorY + (boardW * 0.45) * Math.sin(swingAngle));
  ctx.stroke();
  ctx.restore();
} else {
  ctx.lineWidth = 5;
  ctx.strokeStyle = curTheme.rimColor;
  ctx.beginPath();
  ctx.moveTo(padX + 8, floorY);
  ctx.lineTo(padX + boardW - 8, floorY);
  ctx.stroke();
}

// Bin Slot Labels / Tally Glow
ctx.font = '10px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
for (let b = 0; b < numBins; b++) {
  const slotCenterX = padX + (b + 0.5) * binW;
  ctx.fillStyle = curTheme.wireColor;
  ctx.fillText(`${b + 1}`, slotCenterX, floorY + 11);
}

// Draw Pegs with Light Shimmer & Hit Flares
for (let i = 0; i < pegs.length; i++) {
  const p = pegs[i];
  const hit = p.hitTimer > 0;
  const currentR = p.r + (hit ? p.hitTimer * 3 : 0);

  // Base Peg
  ctx.beginPath();
  ctx.arc(p.x, p.y, currentR, 0, Math.PI * 2);
  ctx.fillStyle = hit ? `hsl(${p.hitHue}, 90%, 65%)` : curTheme.pegBase;
  ctx.fill();

  // Shiny Rim
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hit ? '#ffffff' : curTheme.pegShine;
  ctx.stroke();

  // Impact Wave
  if (hit) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, currentR + p.hitTimer * 9, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${p.hitHue}, 90%, 75%, ${p.hitTimer * 0.7})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}

// Draw Sparks
for (let s of room.state.sparks) {
  ctx.beginPath();
  ctx.arc(s.x, s.y, 2 * s.life, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${s.hue}, 100%, 75%, ${s.life})`;
  ctx.fill();
}

// Draw Marbles
for (let i = 0; i < marbles.length; i++) {
  const m = marbles[i];
  const speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy);

  // Motion Trail when moving briskly
  if (speed > 160 && m.settled < 0.2) {
    const tailLen = Math.min(speed * 0.05, 18);
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x - (m.vx / speed) * tailLen, m.y - (m.vy / speed) * tailLen);
    ctx.strokeStyle = `hsla(${m.hue}, 85%, 65%, 0.35)`;
    ctx.lineWidth = m.r * 1.4;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Drop Shadow
  ctx.beginPath();
  ctx.arc(m.x + 2, m.y + 3, m.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fill();

  // 3D Spherical Marble Body
  const grad = ctx.createRadialGradient(
    m.x - m.r * 0.35,
    m.y - m.r * 0.35,
    m.r * 0.1,
    m.x,
    m.y,
    m.r
  );
  const lightness = 52 + (audio.level || 0) * 12;
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, `hsl(${m.hue}, 90%, ${lightness + 18}%)`);
  grad.addColorStop(0.75, `hsl(${m.hue}, 85%, ${lightness}%)`);
  grad.addColorStop(1, `hsl(${m.hue}, 95%, ${Math.max(15, lightness - 25)}%)`);

  ctx.beginPath();
  ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Specular Glint
  ctx.beginPath();
  ctx.arc(m.x - m.r * 0.32, m.y - m.r * 0.35, m.r * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fill();
}

// Tilt Spirit Level Gauge (Top Center of Board Frame)
const gaugeW = 70;
const gaugeH = 10;
const gaugeX = midX - gaugeW * 0.5;
const gaugeY = boardTop + 8;
ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
ctx.beginPath();
ctx.roundRect(gaugeX, gaugeY, gaugeW, gaugeH, 5);
ctx.fill();
ctx.strokeStyle = curTheme.rimShine;
ctx.lineWidth = 1;
ctx.stroke();

// Bubble in gauge moves with actual tilt
const bubbleOffset = Math.max(-26, Math.min(26, (-rawTilt / 25) * 26));
ctx.beginPath();
ctx.arc(midX + bubbleOffset, gaugeY + gaugeH * 0.5, 3.5, 0, Math.PI * 2);
ctx.fillStyle = '#00ffcc';
ctx.fill();

ctx.restore();
ctx.restore();