const dt = Math.min(frame.dt || 0.016, 0.05);
const W = frame.width;
const H = frame.height;
const cx = W * 0.5;

// ---- PERSISTENT STATE ----
room.state.blocks ??= [];
room.state.debris ??= [];
room.state.particles ??= [];
room.state.score ??= 0;
room.state.highScore ??= 0;
room.state.streak ??= 0;
room.state.turnIndex ??= 0;
room.state.gameState ??= 'PLAYING';
room.state.lastActionTime ??= frame.t;
room.state.gameOverTimer ??= 0;
room.state.cameraY ??= 0;
room.state.banner ??= { text: 'READY? DROP!', sub: 'TAP TO STACK', timer: 2.5, hue: 180 };
room.state.shake ??= 0;
room.state.activeBlock ??= null;
room.state.shockwaves ??= [];

// ---- SETTINGS & CONTROLS ----
const speedMult = getVar('block_speed') ?? 2.0;
const attractOn = getVar('attract_mode') ?? true;
const shakeOn = getVar('camera_shake') ?? true;

const snapChoices = { Forgiving: 14, Crisp: 8, Precision: 4 };
const snapDist = snapChoices[getVar('snap_window')] ?? 8;

const paletteChoice = getVar('palette') ?? 'Neon Arcade';
const palBases = {
  'Neon Arcade': [185, 290, 320, 140, 45],
  'Sunset Synth': [15, 335, 275, 45, 195],
  'Laser Cyber': [160, 190, 220, 280, 120],
  'Golden Royale': [42, 50, 20, 210, 280]
};
const currentPalette = palBases[paletteChoice] ?? palBases['Neon Arcade'];

const BASE_W = Math.min(360, W * 0.42);
const BLOCK_H = Math.max(30, Math.min(48, H * 0.045));
const BASE_Y = H - 160;

// ---- ACTIVE PLAYER COMPUTATION ----
const people = Array.isArray(room.people) ? room.people : [];
const hasPeople = people.length > 0;
const activePerson = hasPeople ? people[room.state.turnIndex % people.length] : null;
const activeHue = activePerson ? activePerson.hue : (currentPalette[(room.state.turnIndex) % currentPalette.length]);

// ---- INITIALIZE TOWER IF EMPTY ----
if (room.state.blocks.length === 0) {
  room.state.blocks.push({
    x: cx - BASE_W * 0.5,
    y: BASE_Y,
    w: BASE_W,
    h: BLOCK_H,
    hue: currentPalette[0],
    alpha: 1
  });
  room.state.activeBlock = {
    x: cx - BASE_W * 0.5 - 240,
    y: BASE_Y - BLOCK_H,
    w: BASE_W,
    h: BLOCK_H,
    dir: 1,
    hue: activeHue
  };
}

// Helper to spawn particles
function spawnBurst(px, py, count, hue, speed) {
  for (let i = 0; i < count; i++) {
    if (room.state.particles.length > 100) room.state.particles.shift();
    const ang = Math.random() * Math.PI * 2;
    const spd = (0.3 + Math.random() * 0.7) * speed;
    room.state.particles.push({
      x: px, y: py,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0,
      maxLife: 0.4 + Math.random() * 0.4,
      hue: hue,
      size: 3 + Math.random() * 4
    });
  }
}

// ---- INPUT PROCESSING & ATTRACT MODE ----
let triggerDrop = false;
for (const e of room.events) {
  if (e.name === 'drop') {
    triggerDrop = true;
    room.state.lastActionTime = frame.t;
    break;
  }
}

// Attract auto-drop logic
if (!triggerDrop && attractOn && room.state.gameState === 'PLAYING') {
  const idleTime = frame.t - room.state.lastActionTime;
  if (idleTime > 2.0 && room.state.activeBlock && room.state.blocks.length > 0) {
    const topB = room.state.blocks[room.state.blocks.length - 1];
    const actCenter = room.state.activeBlock.x + room.state.activeBlock.w * 0.5;
    const topCenter = topB.x + topB.w * 0.5;
    if (Math.abs(actCenter - topCenter) < topB.w * 0.28 || idleTime > 3.6) {
      triggerDrop = true;
      room.state.lastActionTime = frame.t;
    }
  }
}

// ---- DROP RESOLUTION ----
if (triggerDrop && room.state.gameState === 'PLAYING' && room.state.activeBlock) {
  const act = room.state.activeBlock;
  const top = room.state.blocks[room.state.blocks.length - 1];
  const diff = act.x - top.x;

  if (Math.abs(diff) <= snapDist) {
    // --- PERFECT DROP ---
    act.x = top.x;
    act.w = Math.min(BASE_W, act.w + 10);
    room.state.streak++;
    room.state.score += 2;
    room.state.shake = 10;
    room.state.banner = {
      text: 'PERFECT!!',
      sub: `${room.state.streak}x STREAK • +2`,
      timer: 1.1,
      hue: 50
    };
    spawnBurst(act.x + act.w * 0.5, act.y + act.h * 0.5, 36, 50, 480);
    room.state.shockwaves.push({ x: act.x + act.w * 0.5, y: act.y, r: 10, maxR: act.w * 1.4, alpha: 1, hue: 50 });
  } else if (act.x + act.w <= top.x || act.x >= top.x + top.w) {
    // --- TOTAL MISS / GAME OVER ---
    room.state.gameState = 'GAMEOVER';
    room.state.gameOverTimer = 3.4;
    room.state.shake = 28;
    room.state.banner = {
      text: 'TIMBERRR!',
      sub: `SCORE: ${room.state.score}  •  BEST: ${room.state.highScore}`,
      timer: 3.4,
      hue: 0
    };
    // Tumble active block
    const missDir = act.x < top.x ? -1 : 1;
    room.state.debris.push({
      x: act.x, y: act.y, w: act.w, h: act.h,
      vx: missDir * 280, vy: -120,
      rot: 0, vrot: missDir * 6,
      hue: act.hue, alpha: 1
    });
    // Cascade tilt top blocks
    const blen = room.state.blocks.length;
    for (let i = Math.max(1, blen - 4); i < blen; i++) {
      const b = room.state.blocks[i];
      b.vx = (Math.random() - 0.5) * 160 + missDir * 90;
      b.vy = -Math.random() * 150;
      b.vrot = (Math.random() - 0.5) * 5;
      b.rot = 0;
      b.toppling = true;
    }
    room.state.activeBlock = null;
  } else {
    // --- PARTIAL SLICE ---
    const newW = act.w - Math.abs(diff);
    let sliceX = 0;
    let sliceW = Math.abs(diff);
    let sliceDir = 1;

    if (diff > 0) {
      sliceX = top.x + top.w;
      sliceDir = 1;
    } else {
      sliceX = act.x;
      act.x = top.x;
      sliceDir = -1;
    }
    act.w = newW;

    // Spawn falling debris
    if (room.state.debris.length > 30) room.state.debris.shift();
    room.state.debris.push({
      x: sliceX, y: act.y, w: sliceW, h: act.h,
      vx: sliceDir * (120 + Math.random() * 80),
      vy: -60,
      rot: 0,
      vrot: sliceDir * (3 + Math.random() * 4),
      hue: act.hue,
      alpha: 1
    });

    room.state.streak = 0;
    room.state.score += 1;
    room.state.shake = 7;
    room.state.banner = {
      text: 'SLICED!',
      sub: `${Math.round(newW)}px WIDE`,
      timer: 0.75,
      hue: act.hue
    };
    spawnBurst(diff > 0 ? sliceX : sliceX + sliceW, act.y + act.h * 0.5, 20, act.hue, 300);
  }

  // Commit stacked block & advance
  if (room.state.gameState === 'PLAYING') {
    room.state.blocks.push({
      x: act.x, y: act.y, w: act.w, h: act.h,
      hue: act.hue, alpha: 1
    });
    if (room.state.score > room.state.highScore) {
      room.state.highScore = room.state.score;
    }
    room.state.turnIndex++;

    // Pick next player hue
    const nextPerson = hasPeople ? people[room.state.turnIndex % people.length] : null;
    const nextHue = nextPerson ? nextPerson.hue : currentPalette[(room.state.turnIndex) % currentPalette.length];

    const spawnDir = (room.state.blocks.length % 2 === 0) ? 1 : -1;
    const spawnSpan = BASE_W * 1.35;
    room.state.activeBlock = {
      x: spawnDir === 1 ? cx - spawnSpan : cx + spawnSpan - act.w,
      y: act.y - BLOCK_H,
      w: act.w,
      h: BLOCK_H,
      dir: spawnDir,
      hue: nextHue
    };
  }
}

// ---- GAME OVER RESET TIMER ----
if (room.state.gameState === 'GAMEOVER') {
  room.state.gameOverTimer -= dt;
  if (room.state.gameOverTimer <= 0) {
    room.state.blocks = [];
    room.state.debris = [];
    room.state.particles = [];
    room.state.score = 0;
    room.state.streak = 0;
    room.state.gameState = 'PLAYING';
    room.state.banner = { text: 'NEXT ROUND!', sub: 'GET READY TO DROP', timer: 1.8, hue: 120 };
    // Will reinitialize base next frame
  }
}

// ---- BLOCK MOTION & PHYSICS ----
if (room.state.activeBlock && room.state.gameState === 'PLAYING') {
  const act = room.state.activeBlock;
  const speed = (280 + Math.min(room.state.score * 12, 380)) * speedMult;
  act.x += act.dir * speed * dt;
  const span = BASE_W * 1.35;
  const minX = cx - span;
  const maxX = cx + span - act.w;
  if (act.x <= minX) {
    act.x = minX;
    act.dir = 1;
  } else if (act.x >= maxX) {
    act.x = maxX;
    act.dir = -1;
  }
}

// Update falling debris
for (let i = room.state.debris.length - 1; i >= 0; i--) {
  const deb = room.state.debris[i];
  deb.vy += 1100 * dt;
  deb.x += deb.vx * dt;
  deb.y += deb.vy * dt;
  deb.rot += deb.vrot * dt;
  deb.alpha -= dt * 0.45;
  if (deb.y > H + 100 || deb.alpha <= 0) {
    room.state.debris.splice(i, 1);
  }
}

// Update toppling tower blocks
for (let i = 0; i < room.state.blocks.length; i++) {
  const b = room.state.blocks[i];
  if (b.toppling) {
    b.vy += 1200 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot = (b.rot || 0) + b.vrot * dt;
  }
}

// Update particles
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.life += dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += 450 * dt;
  if (p.life >= p.maxLife) {
    room.state.particles.splice(i, 1);
  }
}

// Update shockwaves
for (let i = room.state.shockwaves.length - 1; i >= 0; i--) {
  const sw = room.state.shockwaves[i];
  sw.r += (sw.maxR - sw.r) * Math.min(1, 14 * dt);
  sw.alpha -= dt * 2.2;
  if (sw.alpha <= 0) room.state.shockwaves.splice(i, 1);
}

// Camera tracking
const topBlock = room.state.blocks[room.state.blocks.length - 1];
const targetCamY = topBlock ? Math.max(0, (H * 0.52) - topBlock.y) : 0;
room.state.cameraY += (targetCamY - room.state.cameraY) * Math.min(1, 6 * dt);

// Screen shake dampening
if (shakeOn && room.state.shake > 0) {
  room.state.shake = Math.max(0, room.state.shake - dt * 28);
} else {
  room.state.shake = 0;
}
const shakeOffX = (Math.random() - 0.5) * room.state.shake;
const shakeOffY = (Math.random() - 0.5) * room.state.shake;

// Audio kickers
const bassKick = (audio.bass || 0) * 0.35;
const beatPulse = audio.beat ? 1.0 : 0.0;

// ==================== RENDERING ====================
ctx.save();

// 1. Dark Futuristic Arena Background
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, '#060714');
bgGrad.addColorStop(0.65, '#0b0c22');
bgGrad.addColorStop(1, '#020208');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Audio-reactive horizon pulse
ctx.save();
ctx.globalCompositeOperation = 'screen';
const auraGrad = ctx.createRadialGradient(cx, H * 0.65, 40, cx, H * 0.65, W * 0.65);
auraGrad.addColorStop(0, `hsla(${activeHue}, 80%, 45%, ${0.12 + bassKick * 0.25})`);
auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = auraGrad;
ctx.fillRect(0, 0, W, H);
ctx.restore();

// Perspective grid on ground
ctx.save();
ctx.strokeStyle = `hsla(220, 70%, 50%, ${0.08 + bassKick * 0.15})`;
ctx.lineWidth = 1.5;
const gridHorizon = BASE_Y + room.state.cameraY + BLOCK_H;
for (let i = -10; i <= 10; i++) {
  ctx.beginPath();
  ctx.moveTo(cx + i * 40, gridHorizon);
  ctx.lineTo(cx + i * 220, H + 100);
  ctx.stroke();
}
for (let y = gridHorizon; y < H + 100; y += 32) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
}
ctx.restore();

// Apply Camera & Screen Shake
ctx.save();
ctx.translate(shakeOffX, room.state.cameraY + shakeOffY);

// 2. Base Platform Under Tower
ctx.save();
const platW = BASE_W * 1.5;
const platH = 26;
const platX = cx - platW * 0.5;
const platY = BASE_Y + BLOCK_H;
ctx.fillStyle = '#101428';
ctx.strokeStyle = `hsla(210, 80%, 65%, ${0.6 + bassKick})`;
ctx.lineWidth = 3;
ctx.fillRect(platX, platY, platW, platH);
ctx.strokeRect(platX, platY, platW, platH);
// Neon accent lines
ctx.fillStyle = `hsl(${activeHue}, 90%, 60%)`;
ctx.fillRect(platX + 16, platY + platH - 4, platW - 32, 3);
ctx.restore();

// 3. Drop Alignment Guides
if (room.state.activeBlock && room.state.gameState === 'PLAYING') {
  const act = room.state.activeBlock;
  const targetB = room.state.blocks[room.state.blocks.length - 1];
  if (targetB) {
    ctx.save();
    ctx.strokeStyle = `hsla(${act.hue}, 100%, 75%, ${0.25 + beatPulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    // Left and right laser alignment rails
    ctx.beginPath();
    ctx.moveTo(act.x, act.y + act.h);
    ctx.lineTo(act.x, targetB.y);
    ctx.moveTo(act.x + act.w, act.y + act.h);
    ctx.lineTo(act.x + act.w, targetB.y);
    ctx.stroke();
    ctx.restore();
  }
}

// Function to draw sleek rounded block with bevel
function drawBlock(x, y, w, h, hue, isCurrent) {
  ctx.save();
  ctx.translate(x, y);
  const rad = 6;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, rad);

  // Base block gradient
  const bGrad = ctx.createLinearGradient(0, 0, 0, h);
  const lightness = isCurrent ? 58 : 50;
  bGrad.addColorStop(0, `hsl(${hue}, 88%, ${lightness + 12}%)`);
  bGrad.addColorStop(1, `hsl(${hue}, 85%, ${lightness - 10}%)`);
  ctx.fillStyle = bGrad;
  ctx.fill();

  // Edge glow & rim highlight
  ctx.lineWidth = isCurrent ? 3 : 2;
  ctx.strokeStyle = isCurrent ? '#ffffff' : `hsl(${hue}, 95%, 75%)`;
  ctx.stroke();

  // Glossy top strip
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.roundRect(3, 3, Math.max(0, w - 6), Math.max(3, h * 0.28), 3);
  ctx.fill();

  ctx.restore();
}

// 4. Draw Stacked Tower Blocks
for (let i = 0; i < room.state.blocks.length; i++) {
  const b = room.state.blocks[i];
  ctx.save();
  if (b.toppling) {
    ctx.translate(b.x + b.w * 0.5, b.y + b.h * 0.5);
    ctx.rotate(b.rot);
    drawBlock(-b.w * 0.5, -b.h * 0.5, b.w, b.h, b.hue, false);
  } else {
    drawBlock(b.x, b.y, b.w, b.h, b.hue, i === room.state.blocks.length - 1);
  }
  ctx.restore();
}

// 5. Draw Falling Debris
for (const deb of room.state.debris) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, deb.alpha);
  ctx.translate(deb.x + deb.w * 0.5, deb.y + deb.h * 0.5);
  ctx.rotate(deb.rot);
  drawBlock(-deb.w * 0.5, -deb.h * 0.5, deb.w, deb.h, deb.hue, false);
  ctx.restore();
}

// 6. Draw Shockwaves
for (const sw of room.state.shockwaves) {
  ctx.save();
  ctx.strokeStyle = `hsla(${sw.hue}, 100%, 75%, ${sw.alpha})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 7. Draw Active Sliding Block
if (room.state.activeBlock && room.state.gameState === 'PLAYING') {
  const act = room.state.activeBlock;
  ctx.save();
  // Pulsing active aura
  ctx.shadowColor = `hsl(${act.hue}, 100%, 60%)`;
  ctx.shadowBlur = 18 + beatPulse * 14;
  drawBlock(act.x, act.y, act.w, act.h, act.hue, true);
  ctx.restore();

  // Big Player Arrow Marker above block
  ctx.save();
  const markerX = act.x + act.w * 0.5;
  const bob = Math.sin(frame.t * 8) * 6;
  const markerY = act.y - 18 + bob;
  ctx.fillStyle = `hsl(${act.hue}, 100%, 65%)`;
  ctx.beginPath();
  ctx.moveTo(markerX - 14, markerY - 14);
  ctx.lineTo(markerX + 14, markerY - 14);
  ctx.lineTo(markerX, markerY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 8. Draw Slice/Perfect Particles
for (const p of room.state.particles) {
  const pAlpha = 1 - (p.life / p.maxLife);
  ctx.save();
  ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${pAlpha})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * pAlpha, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

ctx.restore(); // Restore Camera transform

// ==================== HUD & PARTY INTERFACE ====================

// 9. Score Board (Top Left)
ctx.save();
ctx.font = '900 48px -apple-system, BlinkMacSystemFont, "Impact", "Arial Black", sans-serif';
ctx.fillStyle = '#ffffff';
ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
ctx.shadowBlur = 8;
ctx.fillText(`${room.state.score}`, 48, 72);
ctx.font = '700 16px -apple-system, sans-serif';
ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
ctx.fillText(`BEST ${room.state.highScore}`, 50, 96);
ctx.restore();

// 10. Center Turn Pill Banner (Top Center)
ctx.save();
const turnPillW = Math.min(480, W * 0.52);
const turnPillH = 54;
const turnPillX = cx - turnPillW * 0.5;
const turnPillY = 24;

// Outer glowing container
ctx.fillStyle = 'rgba(10, 14, 28, 0.85)';
ctx.strokeStyle = `hsl(${activeHue}, 100%, 55%)`;
ctx.lineWidth = 3;
ctx.shadowColor = `hsl(${activeHue}, 100%, 50%)`;
ctx.shadowBlur = 12;
ctx.beginPath();
ctx.roundRect(turnPillX, turnPillY, turnPillW, turnPillH, 27);
ctx.fill();
ctx.stroke();

// Turn Indicator Text
ctx.shadowBlur = 0;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.font = '900 22px -apple-system, BlinkMacSystemFont, "Impact", sans-serif';
ctx.fillStyle = '#ffffff';
const turnLabel = hasPeople
  ? `PLAYER ${(room.state.turnIndex % people.length) + 1} • PRESS DROP!`
  : 'PRESS "DROP" TO STACK!';
ctx.fillText(turnLabel, cx, turnPillY + turnPillH * 0.5);
ctx.restore();

// 11. Large Animated Announcement Banner (Center Screen)
if (room.state.banner && room.state.banner.timer > 0) {
  room.state.banner.timer -= dt;
  const bnr = room.state.banner;
  const scale = 1 + Math.sin(Math.min(1, (1.8 - bnr.timer) * 3)) * 0.15;
  ctx.save();
  ctx.translate(cx, H * 0.28);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Primary text
  ctx.font = '900 68px -apple-system, BlinkMacSystemFont, "Impact", sans-serif';
  ctx.fillStyle = `hsl(${bnr.hue}, 100%, 65%)`;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 16;
  ctx.fillText(bnr.text, 0, 0);

  // Subtext / Score report
  if (bnr.sub) {
    ctx.font = '800 24px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fillText(bnr.sub, 0, 48);
  }
  ctx.restore();
}

// 12. Bottom Player Queue Ribbon
if (hasPeople) {
  ctx.save();
  const maxBadges = Math.min(people.length, 16);
  const badgeSpacing = Math.min(54, (W - 80) / maxBadges);
  const startX = cx - ((maxBadges - 1) * badgeSpacing) * 0.5;
  const badgeY = H - 36;

  for (let i = 0; i < maxBadges; i++) {
    const p = people[i];
    const bx = startX + i * badgeSpacing;
    const isTurn = (i === (room.state.turnIndex % people.length));
    const rad = isTurn ? 18 : 12;

    if (isTurn) {
      // Pulsing ring for active player
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx, badgeY, rad + 4 + Math.sin(frame.t * 10) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = `hsl(${p.hue}, 90%, ${isTurn ? 62 : 45}%)`;
    ctx.beginPath();
    ctx.arc(bx, badgeY, rad, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`P${i + 1}`, bx, badgeY);
  }
  ctx.restore();
}

ctx.restore();