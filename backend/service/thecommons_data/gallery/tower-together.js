const dt = Math.min(frame.dt || 0.016, 0.05);
const W = frame.width;
const H = frame.height;

const craneSpeedMul = getVar('crane_speed') ?? 1.4;
const wobbleSetting = getVar('tower_wobble') ?? 1.5;
const currentTheme = getVar('theme') ?? 'cyber_neon';
const audioReact = getVar('audio_react') ?? true;

// Palette map
const palettes = {
  cyber_neon: { bg0: '#070814', bg1: '#120d2b', grid: 'rgba(0,240,255,0.12)', crane: '#00f0ff', accent: '#ff0077', white: '#ffffff' },
  candy_pop:  { bg0: '#16081e', bg1: '#2e0f36', grid: 'rgba(255,105,180,0.12)', crane: '#ffdf00', accent: '#ff4081', white: '#ffffff' },
  aurora_gold: { bg0: '#031414', bg1: '#072522', grid: 'rgba(72,255,200,0.12)', crane: '#ffd700', accent: '#00e5ff', white: '#ffffff' }
};
const pal = palettes[currentTheme] || palettes.cyber_neon;

// Persistent game state
room.state.blocks ??= [];
room.state.falling ??= [];
room.state.particles ??= [];
room.state.shockwaves ??= [];
room.state.floatTexts ??= [];
room.state.cranePhase ??= 0;
room.state.roundState ??= 'PLAYING'; // 'PLAYING', 'TOPPLE', 'RESETTING'
room.state.roundTimer ??= 0;
room.state.camY ??= 0;
room.state.shake ??= 0;
room.state.lastDropT ??= 0;
room.state.bestHeight ??= 0;
room.state.recordMarkerY ??= null;
room.state.totalPlaced ??= 0;
room.state.combo ??= 0;

const BLOCK_W = Math.clamp ? Math.clamp(W * 0.16, 120, 220) : Math.max(120, Math.min(220, W * 0.16));
const BLOCK_H = 46;
const BASE_Y = H * 0.82;
const BASE_X = W * 0.5;

// Spawn spark helper
function spawnSparks(x, y, hue, count) {
  for (let i = 0; i < count; i++) {
    if (room.state.particles.length > 140) room.state.particles.shift();
    const ang = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 280;
    room.state.particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 60,
      hue: hue ?? 50,
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
      size: 3 + Math.random() * 5
    });
  }
}

// Function to trigger a drop
function triggerDrop(participantId) {
  if (room.state.roundState !== 'PLAYING') return;
  // Limit max simultaneous dropping blocks to 2
  if (room.state.falling.length >= 2) return;

  let pColor = ((room.state.totalPlaced * 67 + (frame.t * 30)) % 360);
  let tag = 'YOU';
  if (participantId && room.people && room.people.length > 0) {
    const person = room.people.find(p => p.id === participantId);
    if (person) {
      pColor = person.hue;
      tag = person.table ? `T-${person.table}` : 'VIP';
    }
  } else if (!participantId && room.people && room.people.length > 0) {
    const randomP = room.people[Math.floor(Math.random() * room.people.length)];
    pColor = randomP.hue;
    tag = randomP.table ? `T-${randomP.table}` : 'PARTY';
  }

  const craneSpan = W * 0.34;
  const craneX = BASE_X + Math.sin(room.state.cranePhase) * craneSpan;
  const craneY = H * 0.18;

  room.state.falling.push({
    x: craneX,
    y: craneY + room.state.camY,
    vx: Math.cos(room.state.cranePhase) * craneSpeedMul * 120,
    vy: 180,
    w: BLOCK_W,
    h: BLOCK_H,
    hue: pColor,
    tag: tag,
    rot: 0,
    vrot: 0
  });

  room.state.lastDropT = frame.t;
  room.state.shockwaves.push({
    x: craneX,
    y: craneY + room.state.camY,
    r: 10,
    maxR: 90,
    hue: pColor,
    alpha: 0.9
  });
}

// 1. Process Event Actions
for (const e of (room.events || [])) {
  if (e.name === 'drop') {
    triggerDrop(e.participantId);
  }
}

// 2. Attract Mode (Auto-play when unattended)
if (room.state.roundState === 'PLAYING') {
  if (frame.t - room.state.lastDropT > 3.6) {
    triggerDrop(null);
  }
}

// 3. Round Logic / State Transitions
room.state.cranePhase += dt * craneSpeedMul * 2.2;
if (audioReact && audio.bass > 0.5) {
  room.state.cranePhase += dt * 0.8 * audio.bass;
}

// Camera tracking target
const targetCam = Math.max(0, (room.state.blocks.length - 4) * BLOCK_H);
room.state.camY += (targetCam - room.state.camY) * (dt * 3.5);

// Screen shake dampening
room.state.shake = Math.max(0, room.state.shake - dt * 25);

// Tower Sway & Center of Mass Physics
let sumOffset = 0;
const count = room.state.blocks.length;
const wobbleAmp = wobbleSetting * (0.8 + (audioReact ? audio.bass * 0.7 : 0));

for (let i = 0; i < count; i++) {
  const b = room.state.blocks[i];
  const sway = Math.sin(frame.t * 2.5 + i * 0.28) * (i * 1.3 * wobbleAmp);
  b.sway = sway;
  sumOffset += (b.targetX - BASE_X) + sway;
  if (b.squish > 0) b.squish = Math.max(0, b.squish - dt * 4.5);
}

const avgOffset = count > 0 ? (sumOffset / count) : 0;
const topBlockOffset = count > 0 ? (room.state.blocks[count - 1].targetX - BASE_X + room.state.blocks[count - 1].sway) : 0;

// Collapse check
if (room.state.roundState === 'PLAYING' && count >= 3) {
  if (Math.abs(avgOffset) > BLOCK_W * 0.85 || Math.abs(topBlockOffset) > BLOCK_W * 1.1) {
    // Collapse tower!
    room.state.roundState = 'TOPPLE';
    room.state.roundTimer = 3.6;
    room.state.shake = 24;
    if (count > room.state.bestHeight) {
      room.state.bestHeight = count;
      room.state.recordMarkerY = BASE_Y - count * BLOCK_H;
    }
    // Scatter blocks
    for (let i = 0; i < count; i++) {
      const b = room.state.blocks[i];
      const dir = (b.targetX - BASE_X + b.sway) >= 0 ? 1 : -1;
      b.vx = dir * (80 + Math.random() * 220) + (i * 12);
      b.vy = -(60 + Math.random() * 140);
      b.vrot = dir * (1.5 + Math.random() * 4);
    }
    room.state.floatTexts.push({
      text: 'CRASH!',
      x: BASE_X,
      y: BASE_Y - (count * 0.6) * BLOCK_H,
      hue: 0,
      life: 2.2,
      maxLife: 2.2,
      size: 54
    });
  }
}

// Update Falling Blocks
for (let i = room.state.falling.length - 1; i >= 0; i--) {
  const fb = room.state.falling[i];
  fb.vy += 780 * dt; // gravity
  fb.y += fb.vy * dt;
  fb.x += fb.vx * dt;
  fb.vx *= (1 - dt * 1.2);
  fb.rot += fb.vrot * dt;

  // Check impact with tower top or base platform
  const topIndex = room.state.blocks.length - 1;
  const targetLandingY = (topIndex >= 0)
    ? BASE_Y - (topIndex + 1) * BLOCK_H
    : BASE_Y - BLOCK_H;
  const targetLandingX = (topIndex >= 0)
    ? room.state.blocks[topIndex].targetX + room.state.blocks[topIndex].sway
    : BASE_X;

  if (fb.y >= targetLandingY) {
    const diffX = fb.x - targetLandingX;
    const tolerance = BLOCK_W * 0.68;

    if (Math.abs(diffX) <= tolerance && room.state.roundState === 'PLAYING') {
      // LANDED!
      const isPerfect = Math.abs(diffX) < 14;
      const finalX = isPerfect ? targetLandingX : fb.x;
      room.state.blocks.push({
        targetX: finalX,
        sway: 0,
        w: fb.w,
        h: fb.h,
        hue: fb.hue,
        tag: fb.tag,
        squish: 1.0,
        vx: 0,
        vy: 0,
        rot: 0,
        vrot: 0
      });
      room.state.totalPlaced++;
      room.state.shake = isPerfect ? 16 : 7;

      if (isPerfect) {
        room.state.combo++;
        room.state.floatTexts.push({
          text: room.state.combo > 1 ? `PERFECT x${room.state.combo}!` : 'PERFECT!',
          x: finalX,
          y: targetLandingY,
          hue: 50,
          life: 1.2,
          maxLife: 1.2,
          size: 38
        });
        spawnSparks(finalX, targetLandingY + BLOCK_H * 0.5, 50, 40);
      } else {
        room.state.combo = 0;
        room.state.floatTexts.push({
          text: `+1 [${fb.tag}]`,
          x: finalX,
          y: targetLandingY,
          hue: fb.hue,
          life: 0.9,
          maxLife: 0.9,
          size: 26
        });
        spawnSparks(finalX, targetLandingY + BLOCK_H * 0.5, fb.hue, 16);
      }

      room.state.shockwaves.push({
        x: finalX,
        y: targetLandingY + BLOCK_H * 0.5,
        r: 12,
        maxR: isPerfect ? 160 : 90,
        hue: fb.hue,
        alpha: 1.0
      });

      room.state.falling.splice(i, 1);
    } else if (fb.y > H + room.state.camY + 100) {
      // Missed totally, falls into abyss
      room.state.falling.splice(i, 1);
      room.state.combo = 0;
      room.state.floatTexts.push({
        text: 'MISSED!',
        x: fb.x,
        y: H * 0.7 + room.state.camY,
        hue: 0,
        life: 0.8,
        maxLife: 0.8,
        size: 30
      });
    }
  }
}

// Update Toppling Pieces
if (room.state.roundState === 'TOPPLE') {
  room.state.roundTimer -= dt;
  for (const b of room.state.blocks) {
    b.vy += 850 * dt;
    b.targetX += b.vx * dt;
    b.sway = 0;
    b.rot += b.vrot * dt;
  }
  if (room.state.roundTimer <= 0) {
    room.state.roundState = 'RESETTING';
    room.state.roundTimer = 1.4;
  }
} else if (room.state.roundState === 'RESETTING') {
  room.state.roundTimer -= dt;
  if (room.state.roundTimer <= 0) {
    room.state.blocks.length = 0;
    room.state.falling.length = 0;
    room.state.roundState = 'PLAYING';
    room.state.combo = 0;
    room.state.floatTexts.push({
      text: 'GO! STACK IT UP!',
      x: BASE_X,
      y: BASE_Y - 80,
      hue: 130,
      life: 1.5,
      maxLife: 1.5,
      size: 48
    });
  }
}

// Update Shockwaves
for (let i = room.state.shockwaves.length - 1; i >= 0; i--) {
  const sw = room.state.shockwaves[i];
  sw.r += (sw.maxR - sw.r) * (dt * 12);
  sw.alpha -= dt * 2.2;
  if (sw.alpha <= 0) room.state.shockwaves.splice(i, 1);
}

// Update Particles
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.life -= dt;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += 380 * dt;
}

// Update Floating Texts
for (let i = room.state.floatTexts.length - 1; i >= 0; i--) {
  const ft = room.state.floatTexts[i];
  ft.life -= dt;
  ft.y -= dt * 42;
  if (ft.life <= 0) room.state.floatTexts.splice(i, 1);
}

// 4. DRAWING
ctx.save();

// Camera shake offset
const shakeX = (Math.random() - 0.5) * room.state.shake;
const shakeY = (Math.random() - 0.5) * room.state.shake;
ctx.translate(shakeX, shakeY);

// Gradient Background
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, pal.bg1);
bgGrad.addColorStop(1, pal.bg0);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Dynamic Grid lines in the sky/ground
ctx.strokeStyle = pal.grid;
ctx.lineWidth = 1.5;
const gridSpacing = 64;
const gridOffsetY = (room.state.camY * 0.4) % gridSpacing;
ctx.beginPath();
for (let y = gridOffsetY; y < H; y += gridSpacing) {
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
}
for (let x = 0; x < W; x += gridSpacing) {
  ctx.moveTo(x, 0);
  ctx.lineTo(x, H);
}
ctx.stroke();

// Starfield / Sparkle background based on height
const altLevel = Math.floor(room.state.camY / 80);
if (altLevel > 1) {
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 28; i++) {
    const sx = ((i * 137.5) % W);
    const sy = ((i * 92.3 + frame.t * 15) % H);
    const sz = ((i % 3) + 1) * (0.8 + (audioReact ? audio.treble * 0.6 : 0));
    ctx.fillRect(sx, sy, sz, sz);
  }
}

// 5. WORLD SPACE (Transforms with Camera Y)
ctx.save();
ctx.translate(0, room.state.camY);

// Altitude / Floor Markers on left side
ctx.textAlign = 'left';
ctx.textBaseline = 'middle';
ctx.font = '900 16px sans-serif';
for (let f = 1; f <= 40; f++) {
  const markY = BASE_Y - f * BLOCK_H;
  if (markY < -room.state.camY - 50 || markY > H - room.state.camY + 50) continue;
  ctx.fillStyle = f % 5 === 0 ? 'rgba(255, 230, 0, 0.75)' : 'rgba(255,255,255,0.25)';
  ctx.fillText(`${f}F`, 28, markY);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(68, markY - 1, 36, 2);
}

// Record Height Flag
if (room.state.bestHeight > 0 && room.state.recordMarkerY !== null) {
  const flagY = room.state.recordMarkerY;
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(60, flagY);
  ctx.lineTo(W - 60, flagY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  ctx.fillStyle = '#ffd700';
  ctx.font = '900 15px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`★ RECORD: ${room.state.bestHeight} BLOCKS`, W - 70, flagY - 10);
}

// Base Platform
const basePlatformW = BLOCK_W * 1.8;
const basePlatformH = 26;
const baseGrad = ctx.createLinearGradient(BASE_X - basePlatformW/2, 0, BASE_X + basePlatformW/2, 0);
baseGrad.addColorStop(0, '#222');
baseGrad.addColorStop(0.5, pal.crane);
baseGrad.addColorStop(1, '#222');
ctx.fillStyle = baseGrad;
ctx.beginPath();
ctx.roundRect(BASE_X - basePlatformW/2, BASE_Y, basePlatformW, basePlatformH, [6, 6, 2, 2]);
ctx.fill();
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 2;
ctx.stroke();

// Platform neon pulse indicator
ctx.fillStyle = pal.accent;
ctx.fillRect(BASE_X - 16, BASE_Y + 7, 32, 12);

// Render Stacked Blocks
for (let i = 0; i < room.state.blocks.length; i++) {
  const b = room.state.blocks[i];
  const isFallingDown = room.state.roundState === 'TOPPLE';
  const blockY = isFallingDown ? BASE_Y - (i + 1) * BLOCK_H + b.vy * 0.1 : BASE_Y - (i + 1) * BLOCK_H;
  const blockX = b.targetX + b.sway;

  // Skip offscreen blocks
  if (blockY < -room.state.camY - 80 || blockY > H - room.state.camY + 80) continue;

  ctx.save();
  ctx.translate(blockX, blockY + b.h / 2);
  if (b.rot) ctx.rotate(b.rot);

  // Squish stretch on impact
  const squishY = b.squish ? (1 - b.squish * 0.28) : 1;
  const squishX = b.squish ? (1 + b.squish * 0.32) : 1;
  ctx.scale(squishX, squishY);

  // Block body
  ctx.fillStyle = `hsl(${b.hue}, 95%, 52%)`;
  ctx.shadowColor = `hsl(${b.hue}, 100%, 60%)`;
  ctx.shadowBlur = (audioReact && audio.beat) ? 22 : 12;
  ctx.beginPath();
  ctx.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 8);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Inner bevel / glow highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Center decorative light stripe
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(-b.w * 0.35, -2, b.w * 0.7, 4);

  // Owner label
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.tag || 'VIP', 0, 1);

  ctx.restore();
}

// Render Currently Dropping Blocks
for (const fb of room.state.falling) {
  ctx.save();
  ctx.translate(fb.x, fb.y + fb.h / 2);
  ctx.fillStyle = `hsl(${fb.hue}, 100%, 55%)`;
  ctx.shadowColor = `hsl(${fb.hue}, 100%, 65%)`;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.roundRect(-fb.w / 2, -fb.h / 2, fb.w, fb.h, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Dropping speed lines
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(-fb.w * 0.2, -fb.h * 0.8, fb.w * 0.4, 3);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fb.tag, 0, 1);
  ctx.restore();
}

// Render Shockwaves
for (const sw of room.state.shockwaves) {
  ctx.save();
  ctx.strokeStyle = `hsla(${sw.hue}, 100%, 65%, ${Math.max(0, sw.alpha)})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Render Particles
for (const p of room.state.particles) {
  const alpha = Math.max(0, p.life / p.maxLife);
  ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
}

// Render Floating In-Game Texts
for (const ft of room.state.floatTexts) {
  const alpha = Math.max(0, ft.life / ft.maxLife);
  ctx.save();
  ctx.font = `900 ${ft.size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `hsla(${ft.hue}, 100%, 65%, ${alpha})`;
  ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.9})`;
  ctx.lineWidth = 6;
  ctx.strokeText(ft.text, ft.x, ft.y);
  ctx.fillText(ft.text, ft.x, ft.y);
  ctx.restore();
}

ctx.restore(); // Exit camera space

// 6. SCREEN SPACE OVERLAYS: Crane, HUD, Crowd, Big Banners

// Crane at Screen Top (Always visible, moves dynamically)
const craneSpan = W * 0.34;
const currentCraneX = BASE_X + Math.sin(room.state.cranePhase) * craneSpan;
const craneFixedY = H * 0.16;

// Crane girder track at very top
ctx.fillStyle = '#161927';
ctx.fillRect(0, 0, W, 22);
ctx.fillStyle = pal.crane;
ctx.fillRect(0, 20, W, 4);

// Cable from girder to trolley
ctx.strokeStyle = '#555f77';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(currentCraneX, 22);
ctx.lineTo(currentCraneX, craneFixedY);
ctx.stroke();

// Crane Trolley / Winch
ctx.fillStyle = pal.crane;
ctx.shadowColor = pal.crane;
ctx.shadowBlur = 14;
ctx.beginPath();
ctx.roundRect(currentCraneX - 32, craneFixedY - 14, 64, 24, 6);
ctx.fill();
ctx.shadowBlur = 0;

// Warning Beacon on Trolley
const beaconLit = (audioReact && audio.beat) || Math.sin(frame.t * 8) > 0;
ctx.fillStyle = beaconLit ? '#ff0033' : '#550011';
ctx.beginPath();
ctx.arc(currentCraneX, craneFixedY - 16, 6, 0, Math.PI * 2);
ctx.fill();

// Hook / Preview of next block
if (room.state.roundState === 'PLAYING') {
  const nextHue = (room.state.totalPlaced * 67 + (frame.t * 30)) % 360;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(currentCraneX - BLOCK_W / 2, craneFixedY + 12, BLOCK_W, BLOCK_H);
  ctx.fillStyle = `hsla(${nextHue}, 90%, 55%, 0.45)`;
  ctx.fillRect(currentCraneX - BLOCK_W / 2, craneFixedY + 12, BLOCK_W, BLOCK_H);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEXT', currentCraneX, craneFixedY + 12 + BLOCK_H / 2);
}

// Crowd line along the bottom (represents connected room.people)
if (room.people && room.people.length > 0) {
  const pCount = room.people.length;
  const pad = Math.min(36, W / (pCount + 1));
  const startX = (W - (pCount - 1) * pad) / 2;
  ctx.textAlign = 'center';
  ctx.font = '900 10px sans-serif';
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const px = startX + i * pad;
    const py = H - 18;
    ctx.fillStyle = `hsl(${p.hue}, 90%, 55%)`;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    // Little beacon crown
    if (audioReact && audio.beat) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// HUD Bar at Top
ctx.textAlign = 'left';
ctx.textBaseline = 'top';
ctx.font = '900 32px sans-serif';
ctx.fillStyle = '#ffffff';
ctx.shadowColor = 'rgba(0,0,0,0.8)';
ctx.shadowBlur = 8;
ctx.fillText(`TOWER: ${room.state.blocks.length}F`, 32, 34);
ctx.shadowBlur = 0;

ctx.textAlign = 'right';
ctx.fillStyle = '#ffd700';
ctx.fillText(`BEST: ${Math.max(room.state.bestHeight, room.state.blocks.length)}F`, W - 32, 34);

// Center Big Prompt Banner
if (room.state.roundState === 'PLAYING') {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '900 18px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText('PRESS [DROP BLOCK] TO BUILD TOGETHER!', W / 2, 38);
} else if (room.state.roundState === 'TOPPLE') {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 68px sans-serif';
  ctx.fillStyle = '#ff2255';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 8;
  ctx.strokeText('TIMBERRR!', W / 2, H * 0.44);
  ctx.fillText('TIMBERRR!', W / 2, H * 0.44);
} else if (room.state.roundState === 'RESETTING') {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 60px sans-serif';
  ctx.fillStyle = '#00ffcc';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 8;
  ctx.strokeText('GET READY...', W / 2, H * 0.44);
  ctx.fillText('GET READY...', W / 2, H * 0.44);
}

ctx.restore();