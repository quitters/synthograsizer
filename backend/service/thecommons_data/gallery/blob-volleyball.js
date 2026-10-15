const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);
const speedVar = getVar('game_speed') ?? 1.0;
const bounceVar = getVar('ball_bounciness') ?? 1.2;
const winTarget = getVar('win_score') ?? 5;
const crowdFX = getVar('crowd_cheer') ?? true;
const paletteName = getVar('sunset_palette') || 'Miami Neon';

const PALETTES = {
  'Miami Neon':    { top: '#16002c', mid: '#791a88', bot: '#ff4d6d', sun: '#ffee55', sand: '#2b1055', sandLight: '#ff758f', net: '#00f5d4' },
  'Golden Hour':  { top: '#1c0a00', mid: '#b23a00', bot: '#ff8800', sun: '#fff0a8', sand: '#3a1e0b', sandLight: '#ffb703', net: '#ffe66d' },
  'Deep Twilight':{ top: '#060814', mid: '#1e1b4b', bot: '#4338ca', sun: '#818cf8', sand: '#0f172a', sandLight: '#6366f1', net: '#38bdf8' },
  'Solar Flare':  { top: '#210002', mid: '#9e0031', bot: '#ff5400', sun: '#ffff3f', sand: '#370617', sandLight: '#ff9e00', net: '#ffffff' }
};
const pal = PALETTES[paletteName] || PALETTES['Miami Neon'];

const S = room.state;
S.scores ??= [0, 0];
S.ball ??= { x: W * 0.35, y: H * 0.35, vx: 220, vy: -120, r: 24, spin: 0 };
S.blobs ??= [
  { x: W * 0.25, y: H * 0.72, vy: 0, grounded: true, squish: 1, baseJump: 0, targetX: W * 0.25 },
  { x: W * 0.75, y: H * 0.72, vy: 0, grounded: true, squish: 1, baseJump: 0, targetX: W * 0.75 }
];
S.particles ??= [];
S.banner ??= { text: 'SERVE!', t: 1.5, team: -1 };
S.lastInputT ??= frame.t;
S.shake ??= 0;
S.gameWon ??= -1;
S.winResetT ??= 0;

const sandY = H * 0.78;
const netX = W * 0.5;
const netTopY = H * 0.54;
const netW = 14;

// Team assignment mapping
const people = room.people || [];
const tableMap = new Map();
people.forEach(p => { if (p.table) tableMap.set(p.table, true); });
const useTables = tableMap.size > 1;
const sortedTables = Array.from(tableMap.keys()).sort();

function getTeam(p, idx) {
  if (useTables && p && p.table) {
    const tIdx = sortedTables.indexOf(p.table);
    return (tIdx % 2 === 0) ? 0 : 1;
  }
  return (idx % 2 === 0) ? 0 : 1;
}

// Track Jump & Spike actions
const presses = [0, 0];
const spikes = [0, 0];
if (room.events && room.events.length > 0) {
  for (const e of room.events) {
    const pIdx = people.findIndex(p => p.id === e.participantId);
    const person = pIdx >= 0 ? people[pIdx] : null;
    const team = person ? getTeam(person, pIdx) : (Math.random() < 0.5 ? 0 : 1);
    if (e.name === 'jump') {
      presses[team]++;
      S.lastInputT = frame.t;
      if (person) {
        S.particles.push({
          x: team === 0 ? W * 0.25 : W * 0.75,
          y: sandY - 20,
          vx: (Math.random() - 0.5) * 160,
          vy: -200 - Math.random() * 200,
          hue: person.hue,
          life: 0.7,
          maxLife: 0.7,
          size: 9
        });
      }
    } else if (e.name === 'spike') {
      spikes[team]++;
      S.lastInputT = frame.t;
    }
  }
}

// Attract mode AI if quiet for > 3.5s
const idle = (frame.t - S.lastInputT) > 3.5;
if (idle) {
  const ball = S.ball;
  if (ball.x < netX && ball.x > W * 0.08 && ball.y > H * 0.45 && S.blobs[0].grounded) {
    if (Math.abs(ball.x - S.blobs[0].x) < 90) presses[0] = 1;
  }
  if (ball.x > netX && ball.x < W * 0.92 && ball.y > H * 0.45 && S.blobs[1].grounded) {
    if (Math.abs(ball.x - S.blobs[1].x) < 90) presses[1] = 1;
  }
}

// Blob jump physics
for (let i = 0; i < 2; i++) {
  const b = S.blobs[i];
  const count = presses[i];
  if (count > 0 && b.grounded) {
    const boost = Math.min(count, 5);
    b.vy = -(620 + boost * 90) * speedVar;
    b.grounded = false;
    b.squish = 1.45;
    for (let k = 0; k < 6 + boost * 2; k++) {
      S.particles.push({
        x: b.x + (Math.random() - 0.5) * 50,
        y: sandY,
        vx: (Math.random() - 0.5) * 180,
        vy: -Math.random() * 120,
        hue: i === 0 ? 330 : 190,
        life: 0.4,
        maxLife: 0.4,
        size: 7
      });
    }
  }
  if (spikes[i] > 0 && !b.grounded) {
    b.vy = 480 * speedVar;
    b.squish = 0.7;
  }

  // Blob tracking towards ball horizontally
  const teamSideMin = i === 0 ? W * 0.08 : netX + 40;
  const teamSideMax = i === 0 ? netX - 40 : W * 0.92;
  const ballOnSide = (i === 0 && S.ball.x < netX) || (i === 1 && S.ball.x > netX);
  const targetX = ballOnSide ? Math.max(teamSideMin, Math.min(teamSideMax, S.ball.x)) : (i === 0 ? W * 0.25 : W * 0.75);
  b.x += (targetX - b.x) * 4.5 * dt;

  // Gravity
  b.vy += 1500 * dt;
  b.y += b.vy * dt;
  if (b.y >= sandY - 40) {
    b.y = sandY - 40;
    b.vy = 0;
    if (!b.grounded) b.squish = 0.65;
    b.grounded = true;
  }
  b.squish += (1.0 - b.squish) * 9 * dt;
}

// Winner celebration timer
if (S.gameWon >= 0) {
  S.winResetT -= dt;
  if (frame.t % 0.08 < dt) {
    const winHue = S.gameWon === 0 ? 330 : 190;
    S.particles.push({
      x: (0.2 + Math.random() * 0.6) * W,
      y: H * 0.3,
      vx: (Math.random() - 0.5) * 400,
      vy: -250 - Math.random() * 200,
      hue: winHue + (Math.random() - 0.5) * 60,
      life: 1.2,
      maxLife: 1.2,
      size: 10
    });
  }
  if (S.winResetT <= 0) {
    S.scores = [0, 0];
    S.gameWon = -1;
    S.banner = { text: 'GO!', t: 1.5, team: -1 };
    S.ball.x = W * 0.35;
    S.ball.y = H * 0.3;
    S.ball.vx = 200;
    S.ball.vy = -100;
  }
}

// Ball physics
const ball = S.ball;
const gravity = 1050 * speedVar;
ball.vy += gravity * dt;
ball.x += ball.vx * dt * speedVar;
ball.y += ball.vy * dt * speedVar;
ball.spin += ball.vx * dt * 0.02;

// Net collision
if (ball.x + ball.r > netX - netW/2 && ball.x - ball.r < netX + netW/2) {
  if (ball.y + ball.r > netTopY) {
    if (ball.y < netTopY + 15) {
      ball.y = netTopY - ball.r;
      ball.vy = -Math.abs(ball.vy) * 0.85;
    } else {
      ball.vx = ball.x < netX ? -Math.abs(ball.vx) * 0.8 : Math.abs(ball.vx) * 0.8;
      ball.x = ball.x < netX ? netX - netW/2 - ball.r : netX + netW/2 + ball.r;
    }
    S.shake = 0.15;
  }
}

// Wall bounces
if (ball.x - ball.r < 10) {
  ball.x = 10 + ball.r;
  ball.vx = Math.abs(ball.vx) * 0.9;
} else if (ball.x + ball.r > W - 10) {
  ball.x = W - 10 - ball.r;
  ball.vx = -Math.abs(ball.vx) * 0.9;
}

// Blob collision
for (let i = 0; i < 2; i++) {
  const b = S.blobs[i];
  const dx = ball.x - b.x;
  const dy = ball.y - b.y;
  const dist = Math.hypot(dx, dy);
  const headR = 48;
  if (dist < ball.r + headR && dy < 10) {
    const nx = dx / (dist || 1);
    const ny = dy / (dist || 1);
    const speed = Math.hypot(ball.vx, ball.vy);
    const bounceSpd = Math.max(speed * bounceVar, 460);
    const angle = Math.atan2(ny, nx);
    const hitAngle = Math.min(-0.35, Math.max(-2.79, angle));
    
    ball.vx = Math.cos(hitAngle) * bounceSpd + (i === 0 ? 120 : -120);
    ball.vy = Math.sin(hitAngle) * bounceSpd + Math.min(0, b.vy * 0.5);
    ball.x = b.x + nx * (ball.r + headR + 2);
    ball.y = b.y + ny * (ball.r + headR + 2);
    b.squish = 0.65;
    S.shake = 0.2;

    for (let k = 0; k < 8; k++) {
      S.particles.push({
        x: ball.x,
        y: ball.y,
        vx: (Math.random() - 0.5) * 260,
        vy: (Math.random() - 0.5) * 260,
        hue: i === 0 ? 330 : 190,
        life: 0.4,
        maxLife: 0.4,
        size: 8
      });
    }
  }
}

// Point scored when ball lands in sand
if (ball.y + ball.r >= sandY && S.gameWon < 0) {
  const scoringTeam = ball.x < netX ? 1 : 0;
  S.scores[scoringTeam]++;
  S.shake = 0.35;
  
  for (let k = 0; k < 25; k++) {
    S.particles.push({
      x: ball.x,
      y: sandY,
      vx: (Math.random() - 0.5) * 350,
      vy: -Math.random() * 320 - 50,
      hue: scoringTeam === 0 ? 330 : 190,
      life: 0.8,
      maxLife: 0.8,
      size: 9
    });
  }

  if (S.scores[scoringTeam] >= winTarget) {
    S.gameWon = scoringTeam;
    S.winResetT = 4.0;
    S.banner = { text: scoringTeam === 0 ? 'TEAM MAGENTA WINS!' : 'TEAM CYAN WINS!', t: 4.0, team: scoringTeam };
  } else {
    S.banner = { text: scoringTeam === 0 ? 'MAGENTA POINT!' : 'CYAN POINT!', t: 1.5, team: scoringTeam };
    ball.x = scoringTeam === 0 ? W * 0.25 : W * 0.75;
    ball.y = H * 0.3;
    ball.vx = scoringTeam === 0 ? 180 : -180;
    ball.vy = -160;
  }
}

// Particle updates (bounded to 180)
if (S.particles.length > 180) S.particles.splice(0, S.particles.length - 180);
for (let i = S.particles.length - 1; i >= 0; i--) {
  const p = S.particles[i];
  p.life -= dt;
  if (p.life <= 0) {
    S.particles.splice(i, 1);
    continue;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += 600 * dt;
}

// Screen shake
ctx.save();
if (S.shake > 0) {
  const shk = S.shake * 18;
  ctx.translate((Math.random() - 0.5) * shk, (Math.random() - 0.5) * shk);
  S.shake = Math.max(0, S.shake - dt * 2.5);
}

// DRAW SKY
const skyGrad = ctx.createLinearGradient(0, 0, 0, sandY);
skyGrad.addColorStop(0, pal.top);
skyGrad.addColorStop(0.55, pal.mid);
skyGrad.addColorStop(1, pal.bot);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

// DRAW SUN
const sunPulse = 1.0 + (audio.bass || 0) * 0.12;
const sunY = H * 0.46;
const sunR = Math.min(W, H) * 0.18 * sunPulse;
const sunGrad = ctx.createRadialGradient(netX, sunY, sunR * 0.2, netX, sunY, sunR);
sunGrad.addColorStop(0, '#ffffff');
sunGrad.addColorStop(0.4, pal.sun);
sunGrad.addColorStop(1, 'transparent');
ctx.fillStyle = sunGrad;
ctx.beginPath();
ctx.arc(netX, sunY, sunR, 0, Math.PI * 2);
ctx.fill();

// Sun scanlines (synthwave sunset vibe)
ctx.fillStyle = pal.top;
ctx.globalAlpha = 0.35;
for (let sy = sunY - sunR * 0.2; sy < sunY + sunR; sy += 10) {
  const barH = 2 + (sy - sunY + sunR * 0.2) * 0.05;
  ctx.fillRect(netX - sunR, sy, sunR * 2, barH);
}
ctx.globalAlpha = 1.0;

// SEA HORIZON
const seaGrad = ctx.createLinearGradient(0, H * 0.56, 0, sandY);
seaGrad.addColorStop(0, pal.mid);
seaGrad.addColorStop(1, pal.sand);
ctx.fillStyle = seaGrad;
ctx.fillRect(0, H * 0.56, W, sandY - H * 0.56);

// SAND DUNES & GROUND
const sandGrad = ctx.createLinearGradient(0, sandY, 0, H);
sandGrad.addColorStop(0, pal.sandLight);
sandGrad.addColorStop(0.2, pal.sand);
sandGrad.addColorStop(1, '#05020a');
ctx.fillStyle = sandGrad;
ctx.beginPath();
ctx.moveTo(0, sandY);
ctx.quadraticCurveTo(W * 0.25, sandY - 12, W * 0.5, sandY);
ctx.quadraticCurveTo(W * 0.75, sandY + 12, W, sandY);
ctx.lineTo(W, H);
ctx.lineTo(0, H);
ctx.closePath();
ctx.fill();

// VOLLEYBALL NET
ctx.lineWidth = netW;
ctx.strokeStyle = '#222';
ctx.beginPath();
ctx.moveTo(netX, sandY);
ctx.lineTo(netX, netTopY - 15);
ctx.stroke();

// Net Mesh
const netH = sandY - netTopY;
ctx.strokeStyle = pal.net;
ctx.lineWidth = 2.5;
ctx.strokeRect(netX - 18, netTopY, 36, netH * 0.55);
ctx.beginPath();
for (let y = netTopY; y <= netTopY + netH * 0.55; y += 14) {
  ctx.moveTo(netX - 18, y);
  ctx.lineTo(netX + 18, y);
}
for (let x = netX - 18; x <= netX + 18; x += 9) {
  ctx.moveTo(x, netTopY);
  ctx.lineTo(x, netTopY + netH * 0.55);
}
ctx.stroke();

// Top band of net
ctx.fillStyle = '#ffffff';
ctx.fillRect(netX - 20, netTopY - 5, 40, 7);

// DRAW SPECTATOR CROWD (room.people in their hues)
if (crowdFX && people.length > 0) {
  const seatW = W / (people.length + 1);
  people.forEach((p, idx) => {
    const team = getTeam(p, idx);
    const px = (team === 0 ? 0.05 * W : netX + 0.05 * W) + (idx % (Math.ceil(people.length / 2) || 1)) * (W * 0.4 / (Math.ceil(people.length / 2) || 1));
    const py = H * 0.88 + Math.sin(frame.t * 4 + idx) * 5;
    ctx.save();
    ctx.fillStyle = `hsl(${p.hue}, 90%, 58%)`;
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, Math.PI * 2);
    ctx.fill();
    // mini googly eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px - 4, py - 3, 3.5, 0, Math.PI * 2);
    ctx.arc(px + 4, py - 3, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(px - 4, py - 3, 1.6, 0, Math.PI * 2);
    ctx.arc(px + 4, py - 3, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// DRAW BLOBS
for (let i = 0; i < 2; i++) {
  const b = S.blobs[i];
  const isMagenta = i === 0;
  const teamColor = isMagenta ? '#ff007f' : '#00e5ff';
  const teamGlow = isMagenta ? '#ff80bf' : '#a0f0ff';
  const eyeOffsetX = isMagenta ? 10 : -10;
  
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(1 / Math.sqrt(b.squish), b.squish);

  // Blob Shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 42 * (1 / b.squish), 40 * Math.sqrt(b.squish), 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Blob Body gradient
  const bGrad = ctx.createRadialGradient(-10, -15, 6, 0, 0, 50);
  bGrad.addColorStop(0, teamGlow);
  bGrad.addColorStop(0.7, teamColor);
  bGrad.addColorStop(1, isMagenta ? '#8b0042' : '#005f73');
  ctx.fillStyle = bGrad;

  // Soft jelly blob dome
  ctx.beginPath();
  ctx.moveTo(-45, 38);
  ctx.bezierCurveTo(-52, -25, -20, -52, 0, -52);
  ctx.bezierCurveTo(20, -52, 52, -25, 45, 38);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Big Googly Eyes looking at ball!
  const eyeDx = ball.x - b.x;
  const eyeDy = ball.y - (b.y - 20);
  const eyeAngle = Math.atan2(eyeDy, eyeDx);
  const pupilR = 5;
  const lookDist = 5;

  for (const eyeX of [-16 + eyeOffsetX * 0.4, 16 + eyeOffsetX * 0.4]) {
    // Sclera
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eyeX, -22, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111';
    ctx.stroke();

    // Pupil tracking ball
    const px = eyeX + Math.cos(eyeAngle) * lookDist;
    const py = -22 + Math.sin(eyeAngle) * lookDist;
    ctx.fillStyle = '#111122';
    ctx.beginPath();
    ctx.arc(px, py, pupilR, 0, Math.PI * 2);
    ctx.fill();
    
    // Catchlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px - 2, py - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rosy cheeks
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-26, 6, 8, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(26, 6, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// DRAW VOLLEYBALL
ctx.save();
ctx.translate(ball.x, ball.y);
ctx.rotate(ball.spin);

// Ball shadow beneath on sand
ctx.save();
const groundDist = sandY - ball.y;
if (groundDist > 0 && groundDist < H * 0.5) {
  const sAlpha = Math.max(0, 0.45 - groundDist / (H * 0.5));
  const sScale = Math.max(0.4, 1 - groundDist / (H * 0.6));
  ctx.fillStyle = `rgba(0,0,0,${sAlpha})`;
  ctx.beginPath();
  ctx.ellipse(0, groundDist, ball.r * sScale * 1.5, ball.r * sScale * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// Swirling colored volleyball panels
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
ctx.fill();

for (let a = 0; a < 3; a++) {
  ctx.fillStyle = a === 0 ? '#ffbe0b' : (a === 1 ? '#3a86ff' : '#ffffff');
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, ball.r, a * (Math.PI * 2 / 3), (a + 1) * (Math.PI * 2 / 3));
  ctx.closePath();
  ctx.fill();
}
ctx.lineWidth = 3.5;
ctx.strokeStyle = '#1b1b2f';
ctx.beginPath();
ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
ctx.stroke();
// Panel lines
ctx.beginPath();
for (let a = 0; a < 3; a++) {
  const ang = a * (Math.PI * 2 / 3);
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(ang) * ball.r, Math.sin(ang) * ball.r);
}
ctx.stroke();
ctx.restore();

// DRAW PARTICLES
for (const p of S.particles) {
  ctx.save();
  const alpha = Math.max(0, p.life / p.maxLife);
  ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// HUD: BOLD TEAM LABELS & SCORES
ctx.textAlign = 'center';
ctx.textBaseline = 'top';

// Team Magenta (Left)
ctx.font = '900 68px system-ui, sans-serif';
ctx.fillStyle = '#ff007f';
ctx.fillText(String(S.scores[0]), W * 0.25, 40);
ctx.font = '800 24px system-ui, sans-serif';
ctx.fillStyle = '#ffb3d9';
ctx.fillText('TEAM MAGENTA', W * 0.25, 115);

// Team Cyan (Right)
ctx.font = '900 68px system-ui, sans-serif';
ctx.fillStyle = '#00e5ff';
ctx.fillText(String(S.scores[1]), W * 0.75, 40);
ctx.font = '800 24px system-ui, sans-serif';
ctx.fillStyle = '#a6f8ff';
ctx.fillText('TEAM CYAN', W * 0.75, 115);

// Target Score in center
ctx.font = '700 20px system-ui, sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.fillText(`FIRST TO ${winTarget}`, netX, 48);

if (idle) {
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = '#ffea00';
  ctx.fillText('AUTO-VOLLEY ACTIVE  •  PRESS JUMP TO PLAY', netX, 82);
}

// BIG BANNER REACTION (POINT, WINNER, GO!)
if (S.banner && S.banner.t > 0) {
  S.banner.t -= dt;
  const bAlpha = Math.min(1, S.banner.t * 2);
  ctx.save();
  ctx.globalAlpha = bAlpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 76px system-ui, sans-serif';
  
  const textColor = S.banner.team === 0 ? '#ff007f' : (S.banner.team === 1 ? '#00f5d4' : '#fff');
  // Shadow / outline
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#050014';
  ctx.strokeText(S.banner.text, netX, H * 0.24);
  ctx.fillStyle = textColor;
  ctx.fillText(S.banner.text, netX, H * 0.24);
  ctx.restore();
}

ctx.restore();