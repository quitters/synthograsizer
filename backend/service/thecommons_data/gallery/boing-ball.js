const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

// --- State Initialization ---
room.state.ball ??= {
  x: W * 0.4,
  y: H * 0.35,
  vx: 320,
  vy: -80,
  r: Math.min(W, H) * 0.11,
  spin: 0,
  spinDir: 1,
  squishX: 1,
  squishY: 1,
  impact: 0
};
room.state.ripples ??= [];
room.state.shockwaves ??= [];

const ball = room.state.ball;
ball.r = Math.min(W, H) * 0.115;

// --- Parameters & Palettes ---
const speedMult = getVar('ball_speed') ?? 1.2;
const bassBoost = getVar('bounce_boost') ?? 1.0;
const trailMode = getVar('trail_echo') ?? 'clean';
const palChoice = getVar('grid_palette') ?? 'amiga_1984';

const palettes = {
  amiga_1984: {
    bgTop: '#2b2640',
    bgBot: '#151025',
    gridWall: '#8a4db8',
    gridFloor: '#a861dd',
    wallLine: 'rgba(170, 110, 240, 0.55)',
    floorLine: 'rgba(210, 150, 255, 0.75)',
    shadow: 'rgba(20, 5, 35, 0.65)',
    red: [225, 25, 25],
    white: [240, 240, 245],
    trim: '#ffdd55'
  },
  neon_night: {
    bgTop: '#080816',
    bgBot: '#020208',
    gridWall: '#00d2ff',
    gridFloor: '#ff007f',
    wallLine: 'rgba(0, 210, 255, 0.6)',
    floorLine: 'rgba(255, 0, 127, 0.85)',
    shadow: 'rgba(0, 5, 20, 0.7)',
    red: [255, 20, 120],
    white: [220, 250, 255],
    trim: '#00ffff'
  },
  copper_glow: {
    bgTop: '#35180c',
    bgBot: '#120502',
    gridWall: '#ff8833',
    gridFloor: '#ffaa44',
    wallLine: 'rgba(255, 140, 60, 0.6)',
    floorLine: 'rgba(255, 190, 80, 0.8)',
    shadow: 'rgba(25, 8, 3, 0.75)',
    red: [230, 45, 15],
    white: [255, 240, 210],
    trim: '#ffa020'
  }
};
const pal = palettes[palChoice] ?? palettes.amiga_1984;

// --- Handle Interactive Triggers ---
for (const ev of room.events) {
  if (ev.name === 'kick') {
    const kicker = room.people.find(p => p.id === ev.participantId);
    const hue = kicker ? kicker.hue : 45;
    ball.vy = -750 - (audio.bass || 0) * 350;
    ball.vx += (Math.random() - 0.5) * 200;
    ball.squishX = 1.35;
    ball.squishY = 0.75;
    ball.impact = 1;
    if (room.state.shockwaves.length < 12) {
      room.state.shockwaves.push({ x: ball.x, y: ball.y, r: ball.r * 0.5, maxR: ball.r * 2.8, hue, life: 1 });
    }
  } else if (ev.name === 'spin_flip') {
    ball.spinDir *= -1;
  }
}

// --- Arena Boundaries ---
const floorY = H * 0.74;
const wallLeft = W * 0.12;
const wallRight = W * 0.88;
const wallTop = H * 0.12;

// --- Physics Update ---
const gravity = 1500;
const bassImpulse = (audio.bass || 0) * bassBoost;
const effectiveDt = dt * speedMult;

ball.vy += gravity * effectiveDt;
ball.x += ball.vx * effectiveDt;
ball.y += ball.vy * effectiveDt;
ball.spin += ball.spinDir * 2.8 * effectiveDt * (1 + (audio.mid || 0) * 0.8);

// Bounce Floor
if (ball.y + ball.r >= floorY) {
  ball.y = floorY - ball.r;
  const baseRebound = -Math.abs(ball.vy) * 0.94;
  ball.vy = Math.min(-420, baseRebound - bassImpulse * 280);
  ball.squishX = 1.25 + bassImpulse * 0.2;
  ball.squishY = 0.75 - bassImpulse * 0.15;
  ball.impact = Math.max(ball.impact, 0.7 + bassImpulse * 0.3);
  if (room.state.ripples.length < 16) {
    room.state.ripples.push({ x: ball.x, y: floorY, rx: ball.r * 1.1, ry: ball.r * 0.35, life: 1 });
  }
}
// Bounce Left / Right Walls
if (ball.x - ball.r < wallLeft) {
  ball.x = wallLeft + ball.r;
  ball.vx = Math.abs(ball.vx);
  ball.squishX = 0.8;
  ball.squishY = 1.2;
  ball.impact = 0.6;
} else if (ball.x + ball.r > wallRight) {
  ball.x = wallRight - ball.r;
  ball.vx = -Math.abs(ball.vx);
  ball.squishX = 0.8;
  ball.squishY = 1.2;
  ball.impact = 0.6;
}
// Ceiling safety
if (ball.y - ball.r < wallTop) {
  ball.y = wallTop + ball.r;
  ball.vy = Math.abs(ball.vy) * 0.8;
}

// Relaxation back to spherical
ball.squishX += (1 - ball.squishX) * Math.min(1, 10 * dt);
ball.squishY += (1 - ball.squishY) * Math.min(1, 10 * dt);
ball.impact = Math.max(0, ball.impact - 2.5 * dt);

// --- Canvas Background & Trails ---
ctx.save();
if (trailMode === 'ghosted') {
  ctx.fillStyle = 'rgba(10, 6, 18, 0.32)';
  ctx.fillRect(0, 0, W, H);
} else if (trailMode === 'afterglow') {
  ctx.fillStyle = 'rgba(10, 6, 18, 0.14)';
  ctx.fillRect(0, 0, W, H);
} else {
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, pal.bgTop);
  bgGrad.addColorStop(1, pal.bgBot);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);
}

// --- Draw Retro Perspective Grid ---
// Back Wall Grid
const wallCols = 16;
const wallRows = 10;
ctx.lineWidth = 1.5;
ctx.strokeStyle = pal.wallLine;
ctx.beginPath();
for (let i = 0; i <= wallCols; i++) {
  const gx = wallLeft + ((wallRight - wallLeft) * i) / wallCols;
  ctx.moveTo(gx, wallTop);
  ctx.lineTo(gx, floorY);
}
for (let j = 0; j <= wallRows; j++) {
  const gy = wallTop + ((floorY - wallTop) * j) / wallRows;
  ctx.moveTo(wallLeft, gy);
  ctx.lineTo(wallRight, gy);
}
ctx.stroke();

// Wall Frame Border
ctx.lineWidth = 3;
ctx.strokeStyle = pal.gridWall;
ctx.strokeRect(wallLeft, wallTop, wallRight - wallLeft, floorY - wallTop);

// Floor Perspective Grid
const vpX = W * 0.5;
const floorRungs = 12;
ctx.lineWidth = 1.5;
ctx.strokeStyle = pal.floorLine;
ctx.beginPath();
// Perspective rays converging from VP towards bottom border
const floorCols = 20;
for (let i = 0; i <= floorCols; i++) {
  const tCol = i / floorCols;
  const topX = wallLeft + (wallRight - wallLeft) * tCol;
  const botX = (topX - vpX) * 1.55 + vpX;
  ctx.moveTo(topX, floorY);
  ctx.lineTo(botX, H);
}
// Transverse rungs spaced with perspective
for (let j = 0; j <= floorRungs; j++) {
  const p = Math.pow(j / floorRungs, 1.8);
  const ry = floorY + (H - floorY) * p;
  const spanScale = 1 + (1.55 - 1) * p;
  const lx = vpX + (wallLeft - vpX) * spanScale;
  const rx = vpX + (wallRight - vpX) * spanScale;
  ctx.moveTo(lx, ry);
  ctx.lineTo(rx, ry);
}
ctx.stroke();

// --- Draw Back Wall Soft Shadow ---
const shadowOffsetX = ball.r * 0.85;
const shadowOffsetY = ball.r * 0.45;
const shadowWallX = ball.x + shadowOffsetX;
const shadowWallY = Math.min(floorY - ball.r * 0.5, ball.y + shadowOffsetY);

ctx.save();
ctx.beginPath();
ctx.ellipse(shadowWallX, shadowWallY, ball.r * 0.95 * ball.squishX, ball.r * 0.9 * ball.squishY, 0, 0, Math.PI * 2);
ctx.fillStyle = pal.shadow;
ctx.filter = 'blur(12px)';
ctx.fill();
ctx.restore();

// --- Floor Contact Shadow ---
const heightAboveFloor = Math.max(0, floorY - (ball.y + ball.r));
const shadowAlpha = Math.max(0.15, 0.7 - heightAboveFloor / (H * 0.6));
const shadowScale = Math.max(0.4, 1 - heightAboveFloor / (H * 0.9));
ctx.save();
ctx.beginPath();
ctx.ellipse(ball.x, floorY, ball.r * 1.1 * shadowScale * ball.squishX, ball.r * 0.32 * shadowScale, 0, 0, Math.PI * 2);
ctx.fillStyle = `rgba(10, 2, 20, ${shadowAlpha})`;
ctx.fill();
ctx.restore();

// --- Floor Ripple Rings ---
for (let i = room.state.ripples.length - 1; i >= 0; i--) {
  const rip = room.state.ripples[i];
  rip.life -= dt * 1.8;
  if (rip.life <= 0) {
    room.state.ripples.splice(i, 1);
    continue;
  }
  const progress = 1 - rip.life;
  ctx.beginPath();
  ctx.ellipse(rip.x, rip.y, rip.rx * (1 + progress * 2.2), rip.ry * (1 + progress * 2.2), 0, 0, Math.PI * 2);
  ctx.lineWidth = 2 * rip.life;
  ctx.strokeStyle = `rgba(230, 160, 255, ${rip.life * 0.8})`;
  ctx.stroke();
}

// --- Trigger Shockwaves ---
for (let i = room.state.shockwaves.length - 1; i >= 0; i--) {
  const sw = room.state.shockwaves[i];
  sw.life -= dt * 2.0;
  if (sw.life <= 0) {
    room.state.shockwaves.splice(i, 1);
    continue;
  }
  const curR = sw.r + (sw.maxR - sw.r) * (1 - sw.life);
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, curR, 0, Math.PI * 2);
  ctx.lineWidth = 3 * sw.life;
  ctx.strokeStyle = `hsla(${sw.hue}, 90%, 65%, ${sw.life})`;
  ctx.stroke();
}

// --- 3D Checkered Sphere Rendering (Classic Amiga Geometry) ---
const numLat = 8;
const numLon = 16;
const tiltZ = -0.32; // ~-18 degrees tilt
const tiltX = 0.18;  // view angle looking slightly down

const cosZ = Math.cos(tiltZ), sinZ = Math.sin(tiltZ);
const cosX = Math.cos(tiltX), sinX = Math.sin(tiltX);
const lightX = -0.45, lightY = -0.65, lightZ = 0.6;

// Helper to transform sphere coords (lat, lon) -> screen coords
function projectSphere(lat, lon) {
  const phi = (lat / numLat - 0.5) * Math.PI;
  const theta = (lon / numLon) * Math.PI * 2 + ball.spin;

  const cosPhi = Math.cos(phi);
  const px0 = cosPhi * Math.sin(theta);
  const py0 = -Math.sin(phi);
  const pz0 = cosPhi * Math.cos(theta);

  // Tilt around Z
  const px1 = px0 * cosZ - py0 * sinZ;
  const py1 = px0 * sinZ + py0 * cosZ;
  const pz1 = pz0;

  // Tilt around X
  const px2 = px1;
  const py2 = py1 * cosX - pz1 * sinX;
  const pz2 = py1 * sinX + pz1 * cosX;

  return {
    sx: ball.x + px2 * ball.r * ball.squishX,
    sy: ball.y + py2 * ball.r * ball.squishY,
    z: pz2,
    nx: px2,
    ny: py2,
    nz: pz2
  };
}

// Render each checkered quad
for (let i = 0; i < numLat; i++) {
  for (let j = 0; j < numLon; j++) {
    const p0 = projectSphere(i, j);
    const p1 = projectSphere(i + 1, j);
    const p2 = projectSphere(i + 1, j + 1);
    const p3 = projectSphere(i, j + 1);

    // Backface culling via 2D signed polygon area
    const cross = (p1.sx - p0.sx) * (p2.sy - p0.sy) - (p1.sy - p0.sy) * (p2.sx - p0.sx);
    if (cross <= 0) continue;

    // Diffuse lighting from surface normal
    const avgNx = (p0.nx + p1.nx + p2.nx + p3.nx) * 0.25;
    const avgNy = (p0.ny + p1.ny + p2.ny + p3.ny) * 0.25;
    const avgNz = (p0.nz + p1.nz + p2.nz + p3.nz) * 0.25;
    const dot = Math.max(0.12, avgNx * lightX + avgNy * lightY + avgNz * lightZ);
    const bright = Math.min(1.25, 0.45 + dot * 0.75 + (audio.level || 0) * 0.2);

    const isRed = (i + j) % 2 === 0;
    const baseCol = isRed ? pal.red : pal.white;
    const rCol = Math.min(255, Math.floor(baseCol[0] * bright));
    const gCol = Math.min(255, Math.floor(baseCol[1] * bright));
    const bCol = Math.min(255, Math.floor(baseCol[2] * bright));

    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.lineTo(p3.sx, p3.sy);
    ctx.closePath();

    ctx.fillStyle = `rgb(${rCol}, ${gCol}, ${bCol})`;
    ctx.fill();

    // Classic Amiga black quad outlines
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(25, 12, 35, 0.85)';
    ctx.stroke();
  }
}

// Specular highlight arc overlay
ctx.save();
ctx.beginPath();
ctx.ellipse(
  ball.x - ball.r * 0.32 * ball.squishX,
  ball.y - ball.r * 0.35 * ball.squishY,
  ball.r * 0.32 * ball.squishX,
  ball.r * 0.2 * ball.squishY,
  -0.3,
  0,
  Math.PI * 2
);
ctx.fillStyle = `rgba(255, 255, 255, ${0.28 + (audio.treble || 0) * 0.35})`;
ctx.fill();
ctx.restore();

// --- Connected Participants Header Badge Strip ---
if (room.people && room.people.length > 0) {
  const badgeY = 28;
  const startX = wallLeft;
  ctx.font = '600 12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.trim;
  ctx.fillText(`COMMODORE-AMIGA 1984 [${room.people.length} PILOTS]`, startX, badgeY);

  const pList = room.people.slice(0, 16);
  for (let idx = 0; idx < pList.length; idx++) {
    const p = pList[idx];
    const px = startX + 260 + idx * 22;
    ctx.beginPath();
    ctx.arc(px, badgeY, 5, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.hue}, 85%, 60%)`;
    ctx.fill();
  }
}

ctx.restore();