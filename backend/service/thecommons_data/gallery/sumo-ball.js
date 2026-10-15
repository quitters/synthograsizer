const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.52;
const minDim = Math.min(W, H);
const ringR = minDim * 0.38;
const ballR = ringR * 0.34;

// Init persistent state
const S = room.state;
S.scores ??= [0, 0];
S.ball ??= { x: 0, y: 0, vx: 0, vy: 0, spin: 0, wobble: 0 };
S.lastActionT ??= frame.t;
S.shake ??= 0;
S.particles ??= [];
S.shoveRipples ??= [];
S.roundState ??= 'play'; // 'play', 'scored', 'won'
S.stateTimer ??= 0;
S.scorer ??= 0;
S.announcement ??= 'GO!';
S.winner ??= null;

const physicsMode = getVar('ball_physics') ?? 'bouncy';
const arenaStyle = getVar('arena_style') ?? 'sand_and_rope';
const targetScore = getVar('target_score') ?? 5;
const trails = getVar('show_trails') ?? true;

const physMap = {
  heavy: { damp: 0.965, impulse: 380, wobbleMult: 0.8 },
  bouncy: { damp: 0.982, impulse: 520, wobbleMult: 1.4 },
  hyper: { damp: 0.992, impulse: 700, wobbleMult: 2.2 }
};
const phys = physMap[physicsMode] ?? physMap.bouncy;

// Screen shake dampening
S.shake *= 0.88;
if (S.shake < 0.1) S.shake = 0;

// Determine teams for players
const people = room.people || [];
const teamOf = (p, idx) => {
  if (p && p.table && p.table.length > 0) {
    let sum = 0;
    for (let i = 0; i < p.table.length; i++) sum += p.table.charCodeAt(i);
    return sum % 2;
  }
  return idx % 2;
};

// Team visual palettes
const teamCol = [
  { name: 'CYAN', main: '#00f0ff', glow: 'rgba(0,240,255,0.4)', side: -1 },
  { name: 'CORAL', main: '#ff3366', glow: 'rgba(255,51,102,0.4)', side: 1 }
];

// Shove execution helper
function executeShove(team, hue, power = 1) {
  S.lastActionT = frame.t;
  const dir = team === 0 ? 1 : -1;
  const force = phys.impulse * (0.8 + 0.4 * power + audio.bass * 0.5);
  const ySpread = (Math.random() - 0.5) * force * 0.85;
  
  S.ball.vx += dir * force;
  S.ball.vy += ySpread;
  S.ball.spin += dir * (8 + Math.random() * 8) * phys.wobbleMult;
  S.ball.wobble = 1.0;
  S.shake = Math.min(S.shake + 12, 35);

  // Add shove shockwave
  const edgeX = cx - dir * ringR * 0.85;
  const edgeY = cy + (Math.random() - 0.5) * ringR * 0.6;
  S.shoveRipples.push({
    x: edgeX, y: edgeY, tx: cx + S.ball.x, ty: cy + S.ball.y,
    t: frame.t, hue: hue ?? (team === 0 ? 185 : 345), team
  });
  if (S.shoveRipples.length > 20) S.shoveRipples.shift();

  // Burst particles
  for (let i = 0; i < 10; i++) {
    const angle = dir > 0 ? (Math.random() - 0.5) * 1.2 : Math.PI + (Math.random() - 0.5) * 1.2;
    const spd = 120 + Math.random() * 260;
    S.particles.push({
      x: cx + S.ball.x,
      y: cy + S.ball.y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 1.0,
      hue: hue ?? (team === 0 ? 185 : 345),
      size: 4 + Math.random() * 8
    });
  }
}

// Handle events
if (room.events && room.events.length > 0 && S.roundState === 'play') {
  for (const ev of room.events) {
    if (ev.name === 'shove') {
      const pIdx = people.findIndex(p => p.id === ev.participantId);
      const p = pIdx >= 0 ? people[pIdx] : null;
      const team = p ? teamOf(p, pIdx) : (Math.random() < 0.5 ? 0 : 1);
      const hue = p ? p.hue : (team === 0 ? 185 : 345);
      executeShove(team, hue, 1.2);
    }
  }
}

// Attract mode: push when idle
const idleT = frame.t - S.lastActionT;
if (idleT > 2.8 && S.roundState === 'play') {
  // Ghost bot shoves automatically
  const pushTeam = S.ball.x > 0 ? 1 : 0;
  executeShove(pushTeam, pushTeam === 0 ? 185 : 345, 0.7);
  S.lastActionT = frame.t - 1.5; // schedule next faster
}

// Update Ball Physics
const dt = Math.min(frame.dt || 0.016, 0.05);
if (S.roundState === 'play') {
  S.ball.x += S.ball.vx * dt;
  S.ball.y += S.ball.vy * dt;
  S.ball.vx *= Math.pow(phys.damp, dt * 60);
  S.ball.vy *= Math.pow(phys.damp, dt * 60);
  // Audio bounce nudge
  if (audio.beat) {
    S.ball.vy += (Math.random() - 0.5) * audio.bass * 80;
  }
  // Centering gravity near top/bottom edges
  const maxDisplY = ringR * 0.75;
  if (Math.abs(S.ball.y) > maxDisplY) {
    S.ball.vy -= Math.sign(S.ball.y) * 400 * dt;
  }
  S.ball.spin *= 0.96;
  S.ball.wobble *= 0.92;

  // Check ring exit
  const distFromCenter = Math.hypot(S.ball.x, S.ball.y);
  if (distFromCenter > ringR - ballR * 0.4) {
    // Exited ring! Team pushing opposite direction scored
    const winningTeam = S.ball.x > 0 ? 0 : 1;
    S.scores[winningTeam]++;
    S.scorer = winningTeam;
    S.shake = 32;

    // Massive blast
    for (let i = 0; i < 50; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 200 + Math.random() * 500;
      S.particles.push({
        x: cx + S.ball.x,
        y: cy + S.ball.y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0.8 + Math.random() * 0.8,
        maxLife: 1.6,
        hue: winningTeam === 0 ? 185 : 345,
        size: 6 + Math.random() * 12
      });
    }

    if (S.scores[winningTeam] >= targetScore) {
      S.roundState = 'won';
      S.winner = winningTeam;
      S.stateTimer = frame.t + 4.0;
      S.announcement = teamCol[winningTeam].name + ' TAKES THE MATCH!';
    } else {
      S.roundState = 'scored';
      S.stateTimer = frame.t + 1.8;
      S.announcement = teamCol[winningTeam].name + ' SCORES!';
    }
  }
} else if (S.roundState === 'scored') {
  // Resetting to center
  S.ball.x += (0 - S.ball.x) * dt * 4;
  S.ball.y += (0 - S.ball.y) * dt * 4;
  S.ball.vx *= 0.8;
  S.ball.vy *= 0.8;
  if (frame.t > S.stateTimer) {
    S.roundState = 'play';
    S.ball.x = 0;
    S.ball.y = 0;
    S.ball.vx = 0;
    S.ball.vy = 0;
    S.announcement = 'GO!';
  }
} else if (S.roundState === 'won') {
  S.ball.x += (0 - S.ball.x) * dt * 3;
  S.ball.y += (0 - S.ball.y) * dt * 3;
  if (frame.t > S.stateTimer) {
    S.scores = [0, 0];
    S.roundState = 'play';
    S.ball.x = 0;
    S.ball.y = 0;
    S.ball.vx = 0;
    S.ball.vy = 0;
    S.announcement = 'GO!';
  }
}

// Limit particle pool
while (S.particles.length > 120) S.particles.shift();
for (let i = S.particles.length - 1; i >= 0; i--) {
  const p = S.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= 0.95;
  p.vy *= 0.95;
  p.life -= dt;
  if (p.life <= 0) S.particles.splice(i, 1);
}

// DRAWING STARTS
ctx.save();

// Background fill with slight trail if enabled
if (trails) {
  ctx.fillStyle = 'rgba(10, 11, 18, 0.32)';
  ctx.fillRect(0, 0, W, H);
} else {
  ctx.fillStyle = '#0a0b12';
  ctx.fillRect(0, 0, W, H);
}

// Apply screen shake
if (S.shake > 0.1) {
  const sx = (Math.random() - 0.5) * S.shake;
  const sy = (Math.random() - 0.5) * S.shake;
  ctx.translate(sx, sy);
}

// Arena Background styling
ctx.save();
if (arenaStyle === 'sand_and_rope') {
  // Warm tatami / sand radial
  const grad = ctx.createRadialGradient(cx, cy, ringR * 0.1, cx, cy, ringR);
  grad.addColorStop(0, '#241a16');
  grad.addColorStop(0.7, '#1b1310');
  grad.addColorStop(1, '#0e0b09');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.fill();
} else if (arenaStyle === 'neon_dohyo') {
  // Dark cyber ring
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, ringR * 1.1);
  grad.addColorStop(0, '#101426');
  grad.addColorStop(0.85, '#090a14');
  grad.addColorStop(1, '#05060a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.fill();
} else {
  // cyber_clash: split halves
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#0a1622';
  ctx.fillRect(cx - ringR, cy - ringR, ringR, ringR * 2);
  ctx.fillStyle = '#220d16';
  ctx.fillRect(cx, cy - ringR, ringR, ringR * 2);
  ctx.restore();
}

// Dohyo boundary rope & lines
ctx.lineWidth = arenaStyle === 'sand_and_rope' ? 14 : 10;
ctx.strokeStyle = arenaStyle === 'neon_dohyo' ? '#384d7a' : (arenaStyle === 'sand_and_rope' ? '#c29b63' : '#3d3052');
ctx.beginPath();
ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
ctx.stroke();

// Neon glow ring on bass
if (arenaStyle !== 'sand_and_rope') {
  ctx.lineWidth = 4 + audio.bass * 8;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + audio.bass * 0.6})`;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR + 3, 0, Math.PI * 2);
  ctx.stroke();
}

// Center Shikiri-sen (Sumo starting lines)
ctx.lineWidth = 6;
ctx.strokeStyle = 'rgba(255,255,255,0.25)';
ctx.beginPath();
ctx.moveTo(cx - 36, cy - 35);
ctx.lineTo(cx - 36, cy + 35);
ctx.moveTo(cx + 36, cy - 35);
ctx.lineTo(cx + 36, cy + 35);
ctx.stroke();

// Dividing line (subtle dotted)
ctx.setLineDash([8, 12]);
ctx.strokeStyle = 'rgba(255,255,255,0.12)';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(cx, cy - ringR);
ctx.lineTo(cx, cy + ringR);
ctx.stroke();
ctx.setLineDash([]);
ctx.restore();

// Shove ripples/lasers toward the ball
for (let i = S.shoveRipples.length - 1; i >= 0; i--) {
  const rip = S.shoveRipples[i];
  const age = frame.t - rip.t;
  if (age > 0.5) {
    S.shoveRipples.splice(i, 1);
    continue;
  }
  const progress = age / 0.5;
  ctx.save();
  ctx.strokeStyle = `hsla(${rip.hue}, 100%, 65%, ${1 - progress})`;
  ctx.lineWidth = 8 * (1 - progress) + 2;
  ctx.beginPath();
  ctx.moveTo(rip.x, rip.y);
  const curX = rip.x + (rip.tx - rip.x) * Math.min(progress * 2.5, 1);
  const curY = rip.y + (rip.ty - rip.y) * Math.min(progress * 2.5, 1);
  ctx.lineTo(curX, curY);
  ctx.stroke();
  ctx.restore();
}

// Particles
for (const p of S.particles) {
  const alpha = Math.max(0, p.life / p.maxLife);
  ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
  ctx.fill();
}

// DRAW GIANT BEACH BALL
ctx.save();
const bX = cx + S.ball.x;
const bY = cy + S.ball.y;
const rot = (S.ball.x * 0.015) + (frame.t * 0.3) + S.ball.spin * 0.1;
const wobbleScaleX = 1 + Math.sin(frame.t * 18) * S.ball.wobble * 0.22;
const wobbleScaleY = 1 - Math.sin(frame.t * 18) * S.ball.wobble * 0.22;

// Ball shadow inside ring
ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
ctx.beginPath();
ctx.ellipse(bX, bY + ballR * 0.9, ballR * 0.9 * wobbleScaleX, ballR * 0.32, 0, 0, Math.PI * 2);
ctx.fill();

// Ball body clip & segments
ctx.translate(bX, bY);
ctx.scale(wobbleScaleX, wobbleScaleY);

// Clip to circle
ctx.beginPath();
ctx.arc(0, 0, ballR, 0, Math.PI * 2);
ctx.save();
ctx.clip();

// 6 classic beach ball wedges
const segCols = ['#ff2a4b', '#ffffff', '#00d2ff', '#ffbe00', '#ffffff', '#22c55e'];
const numSegs = segCols.length;
for (let i = 0; i < numSegs; i++) {
  const a0 = rot + (i * Math.PI * 2) / numSegs;
  const a1 = rot + ((i + 1) * Math.PI * 2) / numSegs;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, ballR * 1.1, a0, a1);
  ctx.closePath();
  ctx.fillStyle = segCols[i];
  ctx.fill();
}

// Center white circle patch
ctx.beginPath();
ctx.arc(0, 0, ballR * 0.24, 0, Math.PI * 2);
ctx.fillStyle = '#f8fafc';
ctx.fill();

// 3D Shading sphere overlay
const sphereShade = ctx.createRadialGradient(-ballR * 0.35, -ballR * 0.35, ballR * 0.05, 0, 0, ballR);
sphereShade.addColorStop(0, 'rgba(255,255,255,0.75)');
sphereShade.addColorStop(0.4, 'rgba(255,255,255,0.1)');
sphereShade.addColorStop(0.85, 'rgba(0,0,0,0.3)');
sphereShade.addColorStop(1, 'rgba(0,0,0,0.65)');
ctx.fillStyle = sphereShade;
ctx.beginPath();
ctx.arc(0, 0, ballR, 0, Math.PI * 2);
ctx.fill();

ctx.restore(); // end clip

// Ball outline
ctx.lineWidth = 4;
ctx.strokeStyle = 'rgba(20, 20, 30, 0.8)';
ctx.beginPath();
ctx.arc(0, 0, ballR, 0, Math.PI * 2);
ctx.stroke();
ctx.restore(); // end ball translate

// DRAW PLAYERS ON PERIMETER
const numPeople = people.length;
if (numPeople > 0) {
  for (let i = 0; i < numPeople; i++) {
    const p = people[i];
    const team = teamOf(p, i);
    // Left team spreads from PI*0.6 to PI*1.4, right team from -PI*0.4 to PI*0.4
    const teamCount = Math.max(1, people.filter((q, qi) => teamOf(q, qi) === team).length);
    const rankInTeam = people.filter((q, qi) => qi < i && teamOf(q, qi) === team).length;
    const spread = (rankInTeam - (teamCount - 1) * 0.5) / Math.max(1, teamCount);
    
    const baseAngle = team === 0 ? Math.PI : 0;
    const angle = baseAngle + spread * 1.2;
    
    const px = cx + Math.cos(angle) * (ringR + 32);
    const py = cy + Math.sin(angle) * (ringR + 32);

    // Player avatar / wrestler pin
    const hue = p.hue ?? (team === 0 ? 185 : 345);
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = `hsl(${hue}, 90%, 55%)`;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Team indicator halo
    ctx.lineWidth = 2;
    ctx.strokeStyle = team === 0 ? '#00f0ff' : '#ff3366';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
} else {
  // Default team corner emblems when empty
  for (let team = 0; team < 2; team++) {
    const ex = team === 0 ? cx - ringR - 40 : cx + ringR + 40;
    ctx.save();
    ctx.fillStyle = teamCol[team].main;
    ctx.font = '900 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRESS SHOVE', ex, cy);
    ctx.restore();
  }
}

// UI: TOP TEAM BANNERS & SCORES
const barY = Math.max(50, H * 0.08);
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Team Left (0: Cyan)
ctx.font = '900 68px "Arial Black", Impact, sans-serif';
ctx.fillStyle = teamCol[0].main;
ctx.shadowColor = teamCol[0].glow;
ctx.shadowBlur = 18;
ctx.fillText(`${S.scores[0]}`, cx - minDim * 0.35, barY);
ctx.font = '800 22px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.85)';
ctx.fillText('CYAN TEAM (PUSH →)', cx - minDim * 0.35, barY + 44);

// VS / Target score in middle
ctx.shadowBlur = 0;
ctx.font = '900 24px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.4)';
ctx.fillText(`FIRST TO ${targetScore}`, cx, barY);

// Team Right (1: Coral)
ctx.font = '900 68px "Arial Black", Impact, sans-serif';
ctx.fillStyle = teamCol[1].main;
ctx.shadowColor = teamCol[1].glow;
ctx.shadowBlur = 18;
ctx.fillText(`${S.scores[1]}`, cx + minDim * 0.35, barY);
ctx.font = '800 22px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.85)';
ctx.fillText('(← PUSH) CORAL TEAM', cx + minDim * 0.35, barY + 44);
ctx.restore();

// ANNOUNCEMENTS & GAME STATE CALLOUTS
if (S.roundState !== 'play' || idleT > 2.5) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const isWin = S.roundState === 'won';
  const label = isWin ? S.announcement : (S.roundState === 'scored' ? S.announcement : 'TAP SHOVE!');
  
  ctx.font = isWin ? '900 72px "Arial Black", Impact, sans-serif' : '900 52px "Arial Black", Impact, sans-serif';
  const pulse = 1 + Math.sin(frame.t * 8) * 0.05;
  ctx.translate(cx, cy - ringR * 0.62);
  ctx.scale(pulse, pulse);
  
  // Text outline
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#05060b';
  ctx.strokeText(label, 0, 0);
  
  ctx.fillStyle = isWin ? '#ffea00' : '#ffffff';
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

ctx.restore();