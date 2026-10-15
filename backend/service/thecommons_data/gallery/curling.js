ctx.save();
const W = frame.width;
const H = frame.height;

// Init persistent game state
room.state.init ??= false;
if (!room.state.init) {
  room.state.init = true;
  room.state.endCount = 1;
  room.state.scoreTeamA = 0;
  room.state.scoreTeamB = 0;
  room.state.phase = 'ready'; // ready -> sliding -> scoring -> round_over
  room.state.currentStoneIdx = 0;
  room.state.stones = [];
  room.state.activeStone = null;
  room.state.lastInputT = 0;
  room.state.banner = 'READY TO THROW';
  room.state.bannerTimer = 2.0;
  room.state.sweepIntensity = 0;
  room.state.sweepFlashes = [];
  room.state.pebbles = [];
  for (let i = 0; i < 90; i++) {
    room.state.pebbles.push({
      x: Math.random(),
      y: Math.random(),
      r: 1 + Math.random() * 2.2,
      a: 0.15 + Math.random() * 0.35
    });
  }
}

const iceCond = getVar('ice_condition') ?? 'pebbled';
const style = getVar('visual_style') ?? 'neon_night';
const speedFactor = (getVar('ice_speed') ?? 3) * 0.35;
const showTrails = getVar('trails') ?? true;

// Team setup
const teamColA = style === 'arctic_aurora' ? '#00e5ff' : '#00f0ff';
const teamColB = style === 'arctic_aurora' ? '#ffaa00' : '#ff0055';
const teamNameA = 'CYAN';
const teamNameB = 'RUBY';

// Ice Sheet Geometry (Horizontal layout left-to-right)
const padX = W * 0.04;
const sheetX0 = padX;
const sheetX1 = W - padX;
const sheetW = sheetX1 - sheetX0;
const sheetY0 = H * 0.22;
const sheetY1 = H * 0.88;
const sheetH = sheetY1 - sheetY0;
const sheetMidY = (sheetY0 + sheetY1) / 2;

const hogLineX = sheetX0 + sheetW * 0.32;
const teeLineX = sheetX0 + sheetW * 0.82;
const houseRadius = Math.min(sheetW * 0.14, sheetH * 0.44);
const buttonRadius = houseRadius * 0.16;

// Rink Background & pebbled ice
ctx.fillStyle = '#050813';
ctx.fillRect(0, 0, W, H);

// Ice sheet fill
const iceGrad = ctx.createLinearGradient(sheetX0, sheetY0, sheetX1, sheetY1);
if (style === 'neon_night') {
  iceGrad.addColorStop(0, '#0a1428');
  iceGrad.addColorStop(0.5, '#0d1d36');
  iceGrad.addColorStop(1, '#081122');
} else if (style === 'arctic_aurora') {
  iceGrad.addColorStop(0, '#041820');
  iceGrad.addColorStop(0.5, '#062633');
  iceGrad.addColorStop(1, '#03141a');
} else {
  iceGrad.addColorStop(0, '#100f1c');
  iceGrad.addColorStop(0.5, '#17132a');
  iceGrad.addColorStop(1, '#0e0b1c');
}
ctx.fillStyle = iceGrad;
ctx.fillRect(sheetX0, sheetY0, sheetW, sheetH);

// Pebbles
ctx.save();
for (let i = 0; i < room.state.pebbles.length; i++) {
  const p = room.state.pebbles[i];
  const px = sheetX0 + p.x * sheetW;
  const py = sheetY0 + p.y * sheetH;
  ctx.fillStyle = `rgba(210, 240, 255, ${p.a * (iceCond === 'slick' ? 0.3 : 0.8)})`;
  ctx.beginPath();
  ctx.arc(px, py, p.r, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// Sheet boundary glow
ctx.save();
ctx.strokeStyle = '#224466';
ctx.lineWidth = 3;
ctx.strokeRect(sheetX0, sheetY0, sheetW, sheetH);
ctx.restore();

// Hog line & Centerline
ctx.save();
ctx.strokeStyle = 'rgba(255, 60, 60, 0.4)';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(hogLineX, sheetY0);
ctx.lineTo(hogLineX, sheetY1);
ctx.stroke();

// Centerline
ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
ctx.setLineDash([8, 8]);
ctx.beginPath();
ctx.moveTo(sheetX0, sheetMidY);
ctx.lineTo(sheetX1, sheetMidY);
ctx.stroke();
ctx.setLineDash([]);

// House (painted concentric target rings)
const rings = [
  { r: houseRadius, col: '#103060' },
  { r: houseRadius * 0.66, col: '#ffffff' },
  { r: houseRadius * 0.35, col: '#8b1220' },
  { r: buttonRadius, col: '#ffffff' }
];
for (const ring of rings) {
  ctx.beginPath();
  ctx.arc(teeLineX, sheetMidY, ring.r, 0, Math.PI * 2);
  ctx.fillStyle = ring.col;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1.0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.stroke();
}
// Crosshair across tee line
ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
ctx.beginPath();
ctx.moveTo(teeLineX, sheetMidY - houseRadius * 1.1);
ctx.lineTo(teeLineX, sheetMidY + houseRadius * 1.1);
ctx.stroke();
ctx.restore();

// Determine active team by stone index (0..7)
const currentTeam = (room.state.currentStoneIdx % 2 === 0) ? 'A' : 'B';
const currentTeamColor = currentTeam === 'A' ? teamColA : teamColB;

// Read Actions (triggers)
let sweepTriggered = false;
let throwTriggered = false;
let sweepUserHue = null;

for (const ev of room.events) {
  if (ev.name === 'sweep') {
    sweepTriggered = true;
    room.state.lastInputT = frame.t;
    const person = room.people ? room.people.find(p => p.id === ev.participantId) : null;
    sweepUserHue = person ? person.hue : (currentTeam === 'A' ? 185 : 340);
  }
  if (ev.name === 'throw') {
    throwTriggered = true;
    room.state.lastInputT = frame.t;
  }
}

// Attract mode: autoplay if no triggers for 3.5 seconds
const idleTime = frame.t - room.state.lastInputT;
if (idleTime > 3.5) {
  if (room.state.phase === 'ready') {
    throwTriggered = true;
  } else if (room.state.phase === 'sliding' && (audio.beat || Math.random() < 0.25)) {
    sweepTriggered = true;
    sweepUserHue = Math.floor(frame.t * 80) % 360;
  }
}

// Friction & physics params
const frictionBase = iceCond === 'slick' ? 0.993 : (iceCond === 'frosted' ? 0.984 : 0.988);

// Spawn active stone
function launchStone() {
  const isTeamA = (room.state.currentStoneIdx % 2 === 0);
  // target offset with slight random curl
  const targetY = sheetMidY + (Math.random() - 0.5) * houseRadius * 0.7;
  const startY = sheetMidY + (Math.random() - 0.5) * sheetH * 0.15;
  const dist = teeLineX - (sheetX0 + 40);
  const baseVx = Math.sqrt(2 * (1 - frictionBase) * dist) * (0.88 + Math.random() * 0.26) * speedFactor;
  
  room.state.activeStone = {
    x: sheetX0 + 35,
    y: startY,
    vx: Math.max(3.8, baseVx),
    vy: (targetY - startY) * 0.007 + (Math.random() - 0.5) * 0.4,
    spin: (Math.random() > 0.5 ? 1 : -1) * 0.04,
    rot: 0,
    team: isTeamA ? 'A' : 'B',
    color: isTeamA ? teamColA : teamColB,
    trail: []
  };
  room.state.phase = 'sliding';
  room.state.banner = `${isTeamA ? teamNameA : teamNameB} ROLLING!`;
  room.state.bannerTimer = 1.2;
}

// Handle throw trigger
if (throwTriggered && room.state.phase === 'ready' && room.state.currentStoneIdx < 8) {
  launchStone();
}

// Handle sweep trigger
if (sweepTriggered) {
  room.state.sweepIntensity = Math.min(1.0, room.state.sweepIntensity + 0.4);
  const hue = sweepUserHue ?? 50;
  const sX = room.state.activeStone ? room.state.activeStone.x + 30 : sheetMidY;
  const sY = room.state.activeStone ? room.state.activeStone.y : sheetMidY;
  room.state.sweepFlashes.push({
    x: sX,
    y: sY + (Math.random() - 0.5) * 50,
    hue: hue,
    life: 1.0
  });
  if (room.state.sweepFlashes.length > 20) room.state.sweepFlashes.shift();
}

// State Machine updates
if (room.state.phase === 'sliding' && room.state.activeStone) {
  const st = room.state.activeStone;
  // Sweeping reduces friction & straightens curl
  const sweepEff = room.state.sweepIntensity;
  const effFriction = frictionBase + sweepEff * 0.0065;
  
  st.vx *= effFriction;
  st.vy *= effFriction;
  // Curl effect increases as stone slows
  const curlSpeed = (1.0 - Math.min(1.0, st.vx / 4)) * st.spin * (1 - sweepEff * 0.85);
  st.vy += curlSpeed * frame.dt * 60;
  st.x += st.vx;
  st.y += st.vy;
  st.rot += st.spin * 2;

  // Wall bounces
  if (st.y < sheetY0 + 18) { st.y = sheetY0 + 18; st.vy *= -0.7; }
  if (st.y > sheetY1 - 18) { st.y = sheetY1 - 18; st.vy *= -0.7; }

  // Trail points
  if (showTrails && frame.t % 0.04 < 0.02) {
    st.trail.push({ x: st.x, y: st.y });
    if (st.trail.length > 30) st.trail.shift();
  }

  // Stone-to-stone collision with placed stones
  for (let j = 0; j < room.state.stones.length; j++) {
    const other = room.state.stones[j];
    const dx = other.x - st.x;
    const dy = other.y - st.y;
    const d = Math.hypot(dx, dy);
    if (d < 30 && d > 0.001) {
      const nx = dx / d;
      const ny = dy / d;
      const p = 2 * (st.vx * nx + st.vy * ny) / 2;
      st.vx -= p * nx * 0.85;
      st.vy -= p * ny * 0.85;
      other.vx = (other.vx || 0) + p * nx * 0.85;
      other.vy = (other.vy || 0) + p * ny * 0.85;
    }
  }

  // Update pushed stones
  for (let j = 0; j < room.state.stones.length; j++) {
    const s = room.state.stones[j];
    if (s.vx || s.vy) {
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= 0.94;
      s.vy *= 0.94;
      if (Math.hypot(s.vx, s.vy) < 0.05) {
        s.vx = 0;
        s.vy = 0;
      }
    }
  }

  // Check if stopped or out of bounds
  const stoneSpeed = Math.hypot(st.vx, st.vy);
  if (stoneSpeed < 0.12 || st.x > sheetX1 - 15) {
    // Valid only if passed hog line and didn't fall off end
    if (st.x >= hogLineX && st.x <= sheetX1 - 15) {
      room.state.stones.push({
        x: st.x,
        y: st.y,
        vx: 0,
        vy: 0,
        team: st.team,
        color: st.color,
        rot: st.rot
      });
    }
    room.state.activeStone = null;
    room.state.currentStoneIdx++;
    if (room.state.currentStoneIdx >= 8) {
      room.state.phase = 'scoring';
      room.state.bannerTimer = 4.5;
    } else {
      room.state.phase = 'ready';
      room.state.banner = `${(room.state.currentStoneIdx % 2 === 0) ? teamNameA : teamNameB}'S TURN`;
      room.state.bannerTimer = 1.5;
    }
  }
}

// Scoring calculation
if (room.state.phase === 'scoring') {
  if (!room.state.scoringDone) {
    let bestDist = Infinity;
    let winnerTeam = null;
    const dists = room.state.stones.map(s => ({
      dist: Math.hypot(s.x - teeLineX, s.y - sheetMidY),
      team: s.team
    })).filter(s => s.dist <= houseRadius);

    dists.sort((a, b) => a.dist - b.dist);
    let pts = 0;
    if (dists.length > 0) {
      winnerTeam = dists[0].team;
      for (const d of dists) {
        if (d.team === winnerTeam) pts++;
        else break;
      }
    }
    if (winnerTeam === 'A') room.state.scoreTeamA += pts;
    if (winnerTeam === 'B') room.state.scoreTeamB += pts;
    room.state.endPoints = pts;
    room.state.endWinner = winnerTeam;
    room.state.banner = pts > 0 ? `${winnerTeam === 'A' ? teamNameA : teamNameB} SCORES ${pts}!` : 'BLANK END!';
    room.state.scoringDone = true;
  }
  room.state.bannerTimer -= frame.dt;
  if (room.state.bannerTimer <= 0) {
    // Reset for next end
    room.state.currentStoneIdx = 0;
    room.state.stones = [];
    room.state.endCount++;
    room.state.phase = 'ready';
    room.state.scoringDone = false;
    room.state.banner = `END ${room.state.endCount} - READY!`;
    room.state.bannerTimer = 2.0;
  }
}

// Decay sweep intensity
room.state.sweepIntensity = Math.max(0, room.state.sweepIntensity - frame.dt * 1.8);

// Draw Sweep Flashes & Particles
ctx.save();
for (let i = room.state.sweepFlashes.length - 1; i >= 0; i--) {
  const f = room.state.sweepFlashes[i];
  f.life -= frame.dt * 2.2;
  if (f.life <= 0) {
    room.state.sweepFlashes.splice(i, 1);
    continue;
  }
  const rad = 25 + (1.0 - f.life) * 45;
  ctx.strokeStyle = `hsla(${f.hue}, 100%, 65%, ${f.life})`;
  ctx.lineWidth = 4 * f.life;
  ctx.beginPath();
  ctx.arc(f.x, f.y, rad, 0, Math.PI * 2);
  ctx.stroke();

  // Sweeper broom brush lines ahead of stone
  ctx.strokeStyle = `hsla(${f.hue}, 90%, 80%, ${f.life * 0.7})`;
  ctx.lineWidth = 2;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(f.x + 8, f.y + k * 8 - 6);
    ctx.lineTo(f.x + 24, f.y + k * 8 + 6);
    ctx.stroke();
  }
}
ctx.restore();

// Draw Placed Stones
function drawGraniteStone(x, y, color, rot, isActive = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  // Drop shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;

  // Granite outer ring
  ctx.fillStyle = '#606972';
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Edge band
  ctx.strokeStyle = '#2d333b';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Team color core
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
  ctx.fill();

  // Top handle
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-6, -2.5, 12, 5);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-6, -2.5, 12, 5);

  // Glow if active
  if (isActive) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 + Math.sin(frame.t * 8) * 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 16.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Active stone trails
if (room.state.activeStone && room.state.activeStone.trail) {
  ctx.save();
  ctx.lineWidth = 4;
  for (let i = 1; i < room.state.activeStone.trail.length; i++) {
    const p0 = room.state.activeStone.trail[i - 1];
    const p1 = room.state.activeStone.trail[i];
    const alpha = (i / room.state.activeStone.trail.length) * 0.45;
    ctx.strokeStyle = room.state.activeStone.team === 'A'
      ? `rgba(0, 240, 255, ${alpha})`
      : `rgba(255, 0, 85, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  ctx.restore();
}

// Draw already placed stones
for (const s of room.state.stones) {
  drawGraniteStone(s.x, s.y, s.color, s.rot, false);
}

// Draw currently moving stone
if (room.state.activeStone) {
  drawGraniteStone(
    room.state.activeStone.x,
    room.state.activeStone.y,
    room.state.activeStone.color,
    room.state.activeStone.rot,
    true
  );
}

// Top Dashboard & Scoreboard
ctx.save();
// Team A Score Card (Left)
ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
ctx.fillRect(W * 0.04, H * 0.03, W * 0.22, H * 0.15);
ctx.strokeStyle = teamColA;
ctx.lineWidth = currentTeam === 'A' ? 3.5 : 1;
ctx.strokeRect(W * 0.04, H * 0.03, W * 0.22, H * 0.15);

ctx.fillStyle = teamColA;
ctx.font = `bold ${Math.floor(H * 0.04)}px sans-serif`;
ctx.textAlign = 'left';
ctx.fillText(teamNameA, W * 0.06, H * 0.08);
ctx.font = `900 ${Math.floor(H * 0.07)}px sans-serif`;
ctx.fillText(`${room.state.scoreTeamA}`, W * 0.06, H * 0.15);

// Team B Score Card (Right)
ctx.fillStyle = 'rgba(255, 0, 85, 0.12)';
ctx.fillRect(W * 0.74, H * 0.03, W * 0.22, H * 0.15);
ctx.strokeStyle = teamColB;
ctx.lineWidth = currentTeam === 'B' ? 3.5 : 1;
ctx.strokeRect(W * 0.74, H * 0.03, W * 0.22, H * 0.15);

ctx.fillStyle = teamColB;
ctx.font = `bold ${Math.floor(H * 0.04)}px sans-serif`;
ctx.textAlign = 'right';
ctx.fillText(teamNameB, W * 0.94, H * 0.08);
ctx.font = `900 ${Math.floor(H * 0.07)}px sans-serif`;
ctx.fillText(`${room.state.scoreTeamB}`, W * 0.94, H * 0.15);

// Center Match info & Stones remaining indicator
ctx.fillStyle = '#ffffff';
ctx.textAlign = 'center';
ctx.font = `800 ${Math.floor(H * 0.038)}px sans-serif`;
ctx.fillText(`END ${room.state.endCount}  |  STONES: ${8 - room.state.currentStoneIdx}/8`, W * 0.5, H * 0.07);

// Stone racks (4 per team)
const remainingA = Math.max(0, 4 - Math.ceil(room.state.currentStoneIdx / 2));
const remainingB = Math.max(0, 4 - Math.floor(room.state.currentStoneIdx / 2));
for (let i = 0; i < 4; i++) {
  ctx.fillStyle = i < remainingA ? teamColA : '#334455';
  ctx.beginPath();
  ctx.arc(W * 0.44 - i * 18, H * 0.12, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = i < remainingB ? teamColB : '#334455';
  ctx.beginPath();
  ctx.arc(W * 0.56 + i * 18, H * 0.12, 6, 0, Math.PI * 2);
  ctx.fill();
}

// Big Callout Banner
if (room.state.banner) {
  const pulse = 1 + audio.bass * 0.12;
  ctx.save();
  ctx.translate(W * 0.5, sheetMidY);
  ctx.scale(pulse, pulse);
  ctx.font = `900 ${Math.floor(H * 0.055)}px sans-serif`;
  ctx.fillStyle = '#050a16';
  const tw = ctx.measureText(room.state.banner).width;
  ctx.fillStyle = 'rgba(10, 16, 32, 0.85)';
  ctx.fillRect(-tw / 2 - 20, -H * 0.045, tw + 40, H * 0.08);
  ctx.strokeStyle = currentTeamColor;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-tw / 2 - 20, -H * 0.045, tw + 40, H * 0.08);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(room.state.banner, 0, H * 0.015);
  ctx.restore();
}

// Sweeping gauge display when sliding
if (room.state.phase === 'sliding') {
  const sw = W * 0.28;
  const sh = 16;
  const sx = (W - sw) / 2;
  const sy = H * 0.91;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = currentTeamColor;
  ctx.fillRect(sx, sy, sw * room.state.sweepIntensity, sh);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx, sy, sw, sh);
  ctx.font = `bold ${Math.floor(H * 0.024)}px sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.fillText('PRESS SWEEP TO POLISH ICE!', W * 0.5, sy - 8);
}
ctx.restore();

// Bottom Player Roster (Crowd benches)
const players = room.people || [];
if (players.length > 0) {
  ctx.save();
  const pCount = players.length;
  const benchY = H * 0.96;
  const slotW = Math.min(42, (W * 0.9) / pCount);
  const startPx = (W - slotW * pCount) / 2;
  for (let i = 0; i < pCount; i++) {
    const p = players[i];
    const px = startPx + i * slotW + slotW / 2;
    // Team assignment: alternate or split tables
    const isTeamA = p.table ? (p.table.charCodeAt(p.table.length - 1) % 2 === 0) : (i % 2 === 0);
    ctx.fillStyle = `hsl(${p.hue}, 90%, 60%)`;
    ctx.beginPath();
    ctx.arc(px, benchY, Math.min(slotW * 0.35, 10), 0, Math.PI * 2);
    ctx.fill();
    // Team outline
    ctx.strokeStyle = isTeamA ? teamColA : teamColB;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

ctx.restore();