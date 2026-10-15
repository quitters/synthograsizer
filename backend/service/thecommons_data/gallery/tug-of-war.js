const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

const arena = getVar('arena_style') ?? 'cyber_laser';
const slack = getVar('rope_slack') ?? 0.4;
const crowdFx = getVar('crowd_effect') ?? 'kinetic_sparks';
const friction = getVar('friction') ?? 0.93;

// Palettes
const themes = {
  cyber_laser: {
    bg1: '#040714', bg2: '#0b162c',
    leftCol: '#00f0ff', rightCol: '#ff0055',
    ropeCol: '#70e0ff', knotCol: '#ffffff',
    glowL: 'rgba(0,240,255,', glowR: 'rgba(255,0,85,'
  },
  mythic_ember: {
    bg1: '#120703', bg2: '#240f06',
    leftCol: '#ff9900', rightCol: '#8844ff',
    ropeCol: '#ffd166', knotCol: '#fff8db',
    glowL: 'rgba(255,153,0,', glowR: 'rgba(136,68,255,'
  },
  abyssal_glow: {
    bg1: '#020b12', bg2: '#061d28',
    leftCol: '#00ffaa', rightCol: '#aa00ff',
    ropeCol: '#55ffd0', knotCol: '#e0ffff',
    glowL: 'rgba(0,255,170,', glowR: 'rgba(170,0,255,'
  }
};
const pal = themes[arena] || themes.cyber_laser;

// Init persistent state
room.state.knotX ??= 0.5;
room.state.knotVx ??= 0;
room.state.particles ??= [];
room.state.waves ??= [];
room.state.rings ??= [];
room.state.leftWins ??= 0;
room.state.rightWins ??= 0;
room.state.winner ??= null;
room.state.winTimer ??= 0;
room.state.shake ??= 0;

const st = room.state;

// Process button triggers
const events = room.events || [];
let leftPullStrength = 0;
let rightPullStrength = 0;

for (const e of events) {
  if (e.name === 'pull_left' && !st.winner) {
    leftPullStrength += 1;
  } else if (e.name === 'pull_right' && !st.winner) {
    rightPullStrength += 1;
  } else if (e.name === 'reset_match') {
    st.knotX = 0.5;
    st.knotVx = 0;
    st.winner = null;
    st.winTimer = 0;
    st.rings.push({ x: W * 0.5, y: H * 0.5, r: 10, maxR: Math.max(W, H) * 0.7, col: '#ffffff' });
  }
}

// Audio reactivity adds natural dynamic surging
const bassBoost = (audio.bass || 0) * (audio.beat ? 0.015 : 0.005);
st.shake = Math.max(0, st.shake * 0.9 + bassBoost * 30);

// Apply pull physics
if (leftPullStrength > 0) {
  st.knotVx -= 0.035 * leftPullStrength;
  st.shake += 4 * leftPullStrength;
  st.waves.push({ side: 'left', progress: 0, speed: 2.2, mag: 24 * Math.min(3, leftPullStrength) });
  for (let i = 0; i < 14; i++) {
    st.particles.push({
      x: W * 0.15 + Math.random() * 40,
      y: H * 0.5 + (Math.random() - 0.5) * 50,
      vx: -(Math.random() * 200 + 50),
      vy: (Math.random() - 0.5) * 120,
      life: 1.0,
      col: pal.leftCol
    });
  }
}

if (rightPullStrength > 0) {
  st.knotVx += 0.035 * rightPullStrength;
  st.shake += 4 * rightPullStrength;
  st.waves.push({ side: 'right', progress: 0, speed: 2.2, mag: 24 * Math.min(3, rightPullStrength) });
  for (let i = 0; i < 14; i++) {
    st.particles.push({
      x: W * 0.85 - Math.random() * 40,
      y: H * 0.5 + (Math.random() - 0.5) * 50,
      vx: (Math.random() * 200 + 50),
      vy: (Math.random() - 0.5) * 120,
      life: 1.0,
      col: pal.rightCol
    });
  }
}

// Update motion & friction
st.knotVx *= Math.pow(friction, dt * 60);
st.knotX += st.knotVx * dt;

// Victory detection
const threshold = 0.32;
if (!st.winner) {
  if (st.knotX <= 0.5 - threshold) {
    st.winner = 'LEFT';
    st.leftWins++;
    st.winTimer = 5.0;
    st.rings.push({ x: W * 0.18, y: H * 0.5, r: 20, maxR: W * 0.8, col: pal.leftCol });
  } else if (st.knotX >= 0.5 + threshold) {
    st.winner = 'RIGHT';
    st.rightWins++;
    st.winTimer = 5.0;
    st.rings.push({ x: W * 0.82, y: H * 0.5, r: 20, maxR: W * 0.8, col: pal.rightCol });
  }
} else {
  st.winTimer -= dt;
  if (st.winTimer <= 0) {
    st.winner = null;
    st.knotX = 0.5;
    st.knotVx = 0;
  }
}

st.knotX = Math.max(0.12, Math.min(0.88, st.knotX));

// Canvas Render
ctx.save();

// Screen shake on massive hits
if (st.shake > 0.5) {
  const sx = (Math.random() - 0.5) * st.shake;
  const sy = (Math.random() - 0.5) * st.shake;
  ctx.translate(sx, sy);
}

// Deep backdrop gradient
const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.5, 50, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
bgGrad.addColorStop(0, pal.bg2);
bgGrad.addColorStop(1, pal.bg1);
ctx.fillStyle = bgGrad;
ctx.fillRect(-20, -20, W + 40, H + 40);

// Arena midline & boundary markers
ctx.strokeStyle = 'rgba(255,255,255,0.08)';
ctx.lineWidth = 2;
ctx.setLineDash([8, 12]);
ctx.beginPath();
ctx.moveTo(W * 0.5, 0);
ctx.lineTo(W * 0.5, H);
ctx.stroke();

// Win threshold gates
ctx.strokeStyle = pal.glowL + '0.25)';
ctx.beginPath();
ctx.moveTo(W * (0.5 - threshold), H * 0.25);
ctx.lineTo(W * (0.5 - threshold), H * 0.75);
ctx.stroke();

ctx.strokeStyle = pal.glowR + '0.25)';
ctx.beginPath();
ctx.moveTo(W * (0.5 + threshold), H * 0.25);
ctx.lineTo(W * (0.5 + threshold), H * 0.75);
ctx.stroke();
ctx.setLineDash([]);

// Background crowd / connected people anchors
const people = room.people || [];
const leftPeople = [];
const rightPeople = [];
people.forEach((p, idx) => {
  if (idx % 2 === 0) leftPeople.push(p);
  else rightPeople.push(p);
});

// Draw crowd energy columns
function drawTuggers(team, side) {
  const isLeft = side === 'left';
  const anchorX = isLeft ? W * 0.12 : W * 0.88;
  const col = isLeft ? pal.leftCol : pal.rightCol;
  const glow = isLeft ? pal.glowL : pal.glowR;
  const count = Math.max(team.length, 4);

  for (let i = 0; i < count; i++) {
    const py = H * (0.28 + (i / Math.max(1, count - 1)) * 0.44);
    const sway = Math.sin(t * 3 + i) * 6;
    const px = anchorX + (isLeft ? -sway : sway);

    // Tether tethering people to main rope anchor
    ctx.strokeStyle = glow + '0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo((px + anchorX) * 0.5, py + 10, anchorX, H * 0.5);
    ctx.stroke();

    // Member node
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px, py, 6 + (audio.mid || 0) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
drawTuggers(leftPeople, 'left');
drawTuggers(rightPeople, 'right');

// Update & draw traveling wave pulses on the rope
for (let i = st.waves.length - 1; i >= 0; i--) {
  const w = st.waves[i];
  w.progress += w.speed * dt;
  if (w.progress > 1.2) st.waves.splice(i, 1);
}

// Calculate rope geometry
const ropeLeftX = W * 0.12;
const ropeRightX = W * 0.88;
const ropeY = H * 0.5;
const knotPixelX = W * st.knotX;
const knotSag = (1.0 - Math.abs(st.knotX - 0.5) * 1.6) * 70 * slack;

// Draw Rope as segmented resonant curve
const segments = 64;
const points = [];
for (let i = 0; i <= segments; i++) {
  const u = i / segments;
  const px = ropeLeftX + (ropeRightX - ropeLeftX) * u;
  // parabolic droop + audio vibration
  const droop = Math.sin(u * Math.PI) * (knotSag + Math.sin(t * 8 + u * 12) * (audio.bass || 0) * 18);
  
  // Traveling tug waves
  let waveDisp = 0;
  for (const w of st.waves) {
    const targetU = w.side === 'left' ? w.progress : (1 - w.progress);
    const dist = Math.abs(u - targetU);
    if (dist < 0.18) {
      const falloff = Math.cos((dist / 0.18) * Math.PI * 0.5);
      waveDisp += Math.sin((u - targetU) * 20) * w.mag * falloff;
    }
  }
  
  points.push({ x: px, y: ropeY + droop + waveDisp });
}

// Draw outer rope glow
ctx.save();
ctx.beginPath();
ctx.moveTo(points[0].x, points[0].y);
for (let i = 1; i < points.length; i++) {
  ctx.lineTo(points[i].x, points[i].y);
}
ctx.strokeStyle = pal.ropeCol;
ctx.lineWidth = 10 + (audio.mid || 0) * 4;
ctx.shadowColor = pal.ropeCol;
ctx.shadowBlur = 24;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.stroke();

// Rope core (white hot)
ctx.lineWidth = 4;
ctx.strokeStyle = '#ffffff';
ctx.shadowBlur = 8;
ctx.stroke();
ctx.restore();

// Draw decorative winding braids along the rope
ctx.strokeStyle = 'rgba(0,0,0,0.45)';
ctx.lineWidth = 2.5;
for (let i = 0; i < points.length - 1; i += 2) {
  const p1 = points[i];
  const p2 = points[i + 1];
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y - 3);
  ctx.lineTo(p2.x, p2.y + 3);
  ctx.stroke();
}

// Find actual knot screen coordinate
const knotU = (knotPixelX - ropeLeftX) / (ropeRightX - ropeLeftX);
const clampedU = Math.max(0, Math.min(1, knotU));
const knotIdx = Math.floor(clampedU * (segments - 1));
const knotPoint = points[knotIdx] || { x: knotPixelX, y: ropeY };

// Knot Ribbon / Core marker
ctx.save();
ctx.translate(knotPoint.x, knotPoint.y);
const knotPulse = 1.0 + Math.sin(t * 10) * 0.12 + Math.abs(st.knotVx) * 1.5;
ctx.scale(knotPulse, knotPulse);

// Central Ribbon tails
ctx.fillStyle = st.knotX < 0.5 ? pal.leftCol : pal.rightCol;
ctx.beginPath();
ctx.moveTo(-6, -8);
ctx.lineTo(0, -32 + Math.sin(t * 12) * 8);
ctx.lineTo(6, -8);
ctx.lineTo(10, 24 + Math.cos(t * 12) * 8);
ctx.lineTo(-4, 8);
ctx.closePath();
ctx.shadowColor = ctx.fillStyle;
ctx.shadowBlur = 18;
ctx.fill();

// Glowing Central Orb
const knotGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
knotGrad.addColorStop(0, '#ffffff');
knotGrad.addColorStop(0.6, pal.knotCol);
knotGrad.addColorStop(1, 'rgba(255,255,255,0)');
ctx.fillStyle = knotGrad;
ctx.beginPath();
ctx.arc(0, 0, 16, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// Draw expanding rings
for (let i = st.rings.length - 1; i >= 0; i--) {
  const r = st.rings[i];
  r.r += (r.maxR - r.r) * dt * 4 + 80 * dt;
  const alpha = Math.max(0, 1 - r.r / r.maxR);
  ctx.strokeStyle = r.col;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
  ctx.stroke();
  if (alpha <= 0.01) st.rings.splice(i, 1);
}
ctx.globalAlpha = 1.0;

// Update & draw sparks / crowd effect
for (let i = st.particles.length - 1; i >= 0; i--) {
  const p = st.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt * 1.3;
  
  if (crowdFx === 'lightning_arcs' && Math.random() < 0.2) {
    p.vx += (Math.random() - 0.5) * 200;
  }
  
  if (p.life <= 0) {
    st.particles.splice(i, 1);
    continue;
  }
  
  ctx.fillStyle = p.col;
  ctx.globalAlpha = p.life;
  ctx.shadowColor = p.col;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(p.x, p.y, (crowdFx === 'pulse_rings' ? 4 : 2.5) * p.life, 0, Math.PI * 2);
  ctx.fill();
}
ctx.globalAlpha = 1.0;
ctx.shadowBlur = 0;

// HUD: Scores & Status Banner
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Left Team HUD
ctx.fillStyle = pal.leftCol;
ctx.font = 'bold 36px monospace';
ctx.fillText(`${st.leftWins}`, W * 0.25, H * 0.14);
ctx.font = '600 15px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.fillText('LEFT TEAM', W * 0.25, H * 0.14 - 32);

// Right Team HUD
ctx.fillStyle = pal.rightCol;
ctx.font = 'bold 36px monospace';
ctx.fillText(`${st.rightWins}`, W * 0.75, H * 0.14);
ctx.font = '600 15px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.fillText('RIGHT TEAM', W * 0.75, H * 0.14 - 32);

// Center Match Status / Winner Callout
if (st.winner) {
  const winCol = st.winner === 'LEFT' ? pal.leftCol : pal.rightCol;
  ctx.fillStyle = winCol;
  ctx.shadowColor = winCol;
  ctx.shadowBlur = 30;
  ctx.font = '900 54px sans-serif';
  ctx.fillText(`${st.winner} WINS!`, W * 0.5, H * 0.25);
  ctx.font = '500 18px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 0;
  ctx.fillText('Next round starting soon...', W * 0.5, H * 0.25 + 46);
} else {
  const pct = Math.round((st.knotX - 0.5) * 200);
  ctx.font = '700 18px monospace';
  ctx.fillStyle = pct < 0 ? pal.leftCol : (pct > 0 ? pal.rightCol : '#aaaaaa');
  const arrow = pct < 0 ? `◀ ${Math.abs(pct)}%` : (pct > 0 ? `${pct}% ▶` : 'EQUILIBRIUM');
  ctx.fillText(arrow, W * 0.5, H * 0.14);
  
  ctx.font = '500 13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('MASH BUTTONS TO PULL', W * 0.5, H * 0.88);
}

ctx.restore();