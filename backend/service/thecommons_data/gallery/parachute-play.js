const S = room.state;
if (!S.ready) {
  S.ready = true;
  S.ball = { z: 0, vz: 0, x: 0, y: 0, vx: 0, vy: 0, rot: 0 };
  S.waves = [];
  S.particles = [];
  S.playerLifts = {};
  S.roundTimer = 22;
  S.gameState = 'PLAY';
  S.lastActionT = 0;
  S.score = 0;
  S.bestLaunch = 0;
  S.banner = 'LIFT TOGETHER!';
  S.bannerTimer = 2;
  S.bannerColor = '#ffffff';
  S.attractTimer = 0;
}

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const minDim = Math.min(W, H);
const chuteR = minDim * 0.40;
const dt = Math.min(frame.dt || 0.016, 0.05);
const now = frame.t;

// Read controls
const palChoice = getVar('palette_style') || 'Classic Rainbow';
const ballChoice = getVar('ball_style') || 'Giant Beach Ball';
const bPow = (getVar('bounce_power') ?? 3) * 0.45;
const sparklesOn = getVar('sparkle_fx') ?? true;

// Palette sets
const palettes = {
  'Classic Rainbow': ['#ff2a2a', '#ff9900', '#ffee00', '#22dd44', '#00c3ff', '#3355ff', '#9922ee', '#ff33aa'],
  'Neon Carnival': ['#ff0055', '#ff5500', '#00ffcc', '#0088ff', '#bf00ff', '#ff00aa', '#ffff00', '#00ff66'],
  'Sunset Pop': ['#ff1e56', '#ff4e00', '#ffac41', '#ffe400', '#ff007f', '#d800ff', '#7900ff', '#ff5252'],
  'Cyber Pastel': ['#70d6ff', '#ff70a6', '#ff9770', '#ffd670', '#e9ff70', '#9b5de5', '#00f5d4', '#f15bb5']
};
const pal = palettes[palChoice] || palettes['Classic Rainbow'];

// People mapping
const people = room.people && room.people.length > 0 ? room.people : [];
const activeCount = Math.max(people.length, 8);

// Process 'lift' events
let pressedThisFrame = false;
if (room.events) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    if (ev.name === 'lift') {
      pressedThisFrame = true;
      S.lastActionT = now;
      let idx = people.findIndex(p => p.id === ev.participantId);
      if (idx < 0) idx = Math.floor(Math.random() * activeCount);
      const person = people[idx];
      const pHue = person ? person.hue : (idx * 360 / activeCount);
      const ang = (idx / activeCount) * Math.PI * 2;

      S.playerLifts[ev.participantId || idx] = now;
      if (S.waves.length < 24) {
        S.waves.push({ ang, r: chuteR, speed: chuteR * 1.8, hue: pHue, t0: now, strength: 1.0 });
      }
      if (sparklesOn && S.particles.length < 90) {
        const px = cx + Math.cos(ang) * chuteR;
        const py = cy + Math.sin(ang) * chuteR;
        for (let k = 0; k < 4; k++) {
          const spd = 60 + Math.random() * 120;
          const a = ang + Math.PI + (Math.random() - 0.5) * 1.2;
          S.particles.push({
            x: px, y: py,
            vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            life: 0.5 + Math.random() * 0.4,
            maxLife: 0.8,
            hue: pHue, size: 6 + Math.random() * 6
          });
        }
      }
    }
  }
}

// Attract mode if idle
const isAttract = (now - S.lastActionT) > 4.5;
if (isAttract) {
  S.attractTimer += dt;
  if (S.attractTimer > 0.4) {
    S.attractTimer = 0;
    const fakeIdx = Math.floor(Math.random() * activeCount);
    const ang = (fakeIdx / activeCount) * Math.PI * 2 + (Math.sin(now * 2) * 0.1);
    const pHue = (fakeIdx * 360 / activeCount) % 360;
    if (S.waves.length < 18) {
      S.waves.push({ ang, r: chuteR, speed: chuteR * 1.5, hue: pHue, t0: now, strength: 0.7 });
    }
  }
}

// Music punch
const audioBoost = (audio.bass || 0) * 1.5 + (audio.beat ? 0.6 : 0);
if (audio.beat && S.waves.length < 20) {
  const randAng = Math.random() * Math.PI * 2;
  S.waves.push({ ang: randAng, r: chuteR, speed: chuteR * 2.0, hue: (now * 50) % 360, t0: now, strength: 0.85 });
}

// Wave simulation & center convergence
let centerKick = 0;
let convergedCount = 0;
for (let i = S.waves.length - 1; i >= 0; i--) {
  const w = S.waves[i];
  w.r -= w.speed * dt;
  if (w.r <= chuteR * 0.15) {
    convergedCount++;
    centerKick += w.strength;
    S.waves.splice(i, 1);
  }
}

// Evaluate center sync impact on the ball
if (convergedCount > 0) {
  const syncMulti = Math.min(3.5, 1.0 + (convergedCount - 1) * 0.5);
  const liftImpulse = (140 + centerKick * 70) * bPow * syncMulti;

  // Only launch forcefully if ball is low or descending
  if (S.ball.z < 60 || S.ball.vz < 40) {
    S.ball.vz = Math.max(S.ball.vz, 0) + liftImpulse;
    S.ball.vx += (Math.random() - 0.5) * 40;
    S.ball.vy += (Math.random() - 0.5) * 40;
    const altMeters = Math.round(S.ball.vz * 1.6);
    S.score = Math.max(S.score, altMeters);
    S.bestLaunch = Math.max(S.bestLaunch, altMeters);

    if (convergedCount >= 4) {
      S.banner = 'SUPER SYNC! ' + altMeters + 'm';
      S.bannerColor = '#00ffcc';
      S.bannerTimer = 1.6;
    } else if (convergedCount >= 2) {
      S.banner = 'GREAT POP! ' + altMeters + 'm';
      S.bannerColor = '#ffff00';
      S.bannerTimer = 1.3;
    } else {
      S.banner = altMeters + 'm';
      S.bannerColor = '#ffffff';
      S.bannerTimer = 0.8;
    }

    // Ball launch sparkle splash
    if (sparklesOn && S.particles.length < 80) {
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 90 + Math.random() * 180;
        S.particles.push({
          x: cx + S.ball.x, y: cy + S.ball.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.6 + Math.random() * 0.5,
          maxLife: 0.9,
          hue: (Math.random() * 360),
          size: 7 + Math.random() * 8
        });
      }
    }
  }
}

// Ball physics (gravity, bouncing, returning to center)
const gravity = 480;
S.ball.vz -= gravity * dt;
S.ball.z += S.ball.vz * dt;
if (S.ball.z <= 0) {
  S.ball.z = 0;
  S.ball.vz = -S.ball.vz * 0.45; // damp rebound
  if (Math.abs(S.ball.vz) < 30) S.ball.vz = 0;
}
// Mild centering pull on X/Y
S.ball.vx += (-S.ball.x * 1.8) * dt;
S.ball.vy += (-S.ball.y * 1.8) * dt;
S.ball.x += S.ball.vx * dt;
S.ball.y += S.ball.vy * dt;
S.ball.rot += (0.6 + S.ball.vz * 0.003) * dt;

// Round state timer
if (S.gameState === 'PLAY') {
  S.roundTimer -= dt;
  if (S.roundTimer <= 0) {
    S.gameState = 'WIN';
    S.roundTimer = 5.0;
    S.banner = 'NEW RECORD: ' + S.bestLaunch + 'm!';
    S.bannerColor = '#ffd700';
    S.bannerTimer = 4.8;
  }
} else if (S.gameState === 'WIN') {
  S.roundTimer -= dt;
  if (S.roundTimer <= 0) {
    S.gameState = 'PLAY';
    S.roundTimer = 24.0;
    S.score = 0;
    S.banner = 'GO! LIFT!';
    S.bannerColor = '#00ff88';
    S.bannerTimer = 1.8;
  }
}

// --- DRAWING ---
ctx.save();

// Deep festive arena floor
ctx.fillStyle = '#0a0914';
ctx.fillRect(0, 0, W, H);

// Ambient floor glow
const ambientGlow = ctx.createRadialGradient(cx, cy, chuteR * 0.2, cx, cy, chuteR * 1.3);
ambientGlow.addColorStop(0, 'rgba(30, 20, 60, 0.6)');
ambientGlow.addColorStop(1, 'rgba(10, 9, 20, 0)');
ctx.fillStyle = ambientGlow;
ctx.beginPath();
ctx.arc(cx, cy, chuteR * 1.3, 0, Math.PI * 2);
ctx.fill();

// Parachute segments
const numSlices = Math.max(16, Math.min(48, activeCount * 2));
const baseLiftWobble = Math.sin(now * 3) * 4;

for (let i = 0; i < numSlices; i++) {
  const a1 = (i / numSlices) * Math.PI * 2;
  const a2 = ((i + 1) / numSlices) * Math.PI * 2;
  const midA = (a1 + a2) * 0.5;

  // Check lift deformation at this slice
  let sliceBulge = 0;
  for (let j = 0; j < S.waves.length; j++) {
    const w = S.waves[j];
    const angDiff = Math.abs(Math.atan2(Math.sin(midA - w.ang), Math.cos(midA - w.ang)));
    if (angDiff < 0.6) {
      const falloff = 1 - (angDiff / 0.6);
      sliceBulge += Math.sin((1 - (w.r / chuteR)) * Math.PI) * 18 * falloff * w.strength;
    }
  }

  const col = pal[i % pal.length];
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  const segR = chuteR + sliceBulge + Math.sin(now * 4 + i) * baseLiftWobble + (audioBoost * 6);
  ctx.arc(cx, cy, segR, a1, a2);
  ctx.closePath();
  ctx.fill();

  // Segment shade/ridge line
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a1) * segR, cy + Math.sin(a1) * segR);
  ctx.stroke();
}

// Center air-hole mesh / bullseye
ctx.beginPath();
ctx.arc(cx, cy, chuteR * 0.16, 0, Math.PI * 2);
ctx.fillStyle = '#161426';
ctx.fill();
ctx.lineWidth = 4;
ctx.strokeStyle = '#ffffff';
ctx.stroke();

// Draw Inward Billow Ripples
for (let i = 0; i < S.waves.length; i++) {
  const w = S.waves[i];
  const alpha = Math.max(0, Math.min(0.85, w.r / chuteR));
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(10, w.r), w.ang - 0.5, w.ang + 0.5);
  ctx.strokeStyle = 'hsla(' + w.hue + ', 100%, 75%, ' + alpha + ')';
  ctx.lineWidth = 14 * w.strength;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// Outer Parachute Rim Border
ctx.beginPath();
ctx.arc(cx, cy, chuteR + 2, 0, Math.PI * 2);
ctx.lineWidth = 8;
ctx.strokeStyle = '#ffffff';
ctx.stroke();

// Handles and Connected Player Avatars around rim
for (let i = 0; i < activeCount; i++) {
  const ang = (i / activeCount) * Math.PI * 2;
  const person = people[i];
  const pHue = person ? person.hue : (i * 360 / activeCount);
  const lastLift = person ? (S.playerLifts[person.id] || 0) : (S.playerLifts[i] || 0);
  const isLifting = (now - lastLift) < 0.28;
  const handleExtend = isLifting ? 24 : 10;

  const hx = cx + Math.cos(ang) * (chuteR + handleExtend);
  const hy = cy + Math.sin(ang) * (chuteR + handleExtend);
  const rimX = cx + Math.cos(ang) * chuteR;
  const rimY = cy + Math.sin(ang) * chuteR;

  // Parachute strap
  ctx.beginPath();
  ctx.moveTo(rimX, rimY);
  ctx.lineTo(hx, hy);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = isLifting ? 6 : 3;
  ctx.stroke();

  // Handle / Hand grip
  ctx.beginPath();
  ctx.arc(hx, hy, isLifting ? 14 : 9, 0, Math.PI * 2);
  ctx.fillStyle = 'hsl(' + pHue + ', 95%, 60%)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Lift flash highlight
  if (isLifting) {
    ctx.beginPath();
    ctx.arc(hx, hy, 22, 0, Math.PI * 2);
    ctx.strokeStyle = 'hsla(' + pHue + ', 100%, 75%, 0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

// Particles (lift sparks & celebratory bursts)
for (let i = S.particles.length - 1; i >= 0; i--) {
  const p = S.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= 0.94;
  p.vy *= 0.94;
  p.life -= dt;
  if (p.life <= 0) {
    S.particles.splice(i, 1);
    continue;
  }
  const progress = p.life / p.maxLife;
  ctx.fillStyle = 'hsla(' + p.hue + ', 100%, 65%, ' + progress + ')';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * progress, 0, Math.PI * 2);
  ctx.fill();
}

// --- THE BOUNCING BALL (Pseudo-3D Projection) ---
const ballNormZ = Math.min(1.0, S.ball.z / 600);
const ballScale = 1.0 + ballNormZ * 1.5;
const shadowScale = Math.max(0.2, 1.0 - ballNormZ * 0.7);
const shadowAlpha = Math.max(0.12, 0.45 - ballNormZ * 0.35);
const bx = cx + S.ball.x;
const by = cy + S.ball.y;
const baseBallR = minDim * 0.075;
const ballDrawR = baseBallR * ballScale;

// Ball ground shadow on the parachute
ctx.save();
ctx.beginPath();
ctx.ellipse(bx, by + 12, baseBallR * shadowScale * 1.2, baseBallR * shadowScale * 0.75, 0, 0, Math.PI * 2);
ctx.fillStyle = 'rgba(0, 0, 0, ' + shadowAlpha + ')';
ctx.fill();
ctx.restore();

// Ball height elevation offset
const elevatedY = by - (S.ball.z * 0.75);

// Render chosen ball style
ctx.save();
ctx.translate(bx, elevatedY);
ctx.rotate(S.ball.rot);

if (ballChoice === 'Super Star') {
  // 5-pointed star emblem
  ctx.beginPath();
  const spikes = 5;
  const outer = ballDrawR * 1.2;
  const inner = ballDrawR * 0.55;
  for (let k = 0; k < spikes * 2; k++) {
    const r = (k % 2 === 0) ? outer : inner;
    const a = (k / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffea00';
  ctx.fill();
  ctx.lineWidth = 6 * ballScale;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
} else if (ballChoice === 'Disco Sphere') {
  // Faceted disco ball
  ctx.beginPath();
  ctx.arc(0, 0, ballDrawR, 0, Math.PI * 2);
  ctx.fillStyle = '#dcdde1';
  ctx.fill();
  ctx.clip();
  const tileCount = 7;
  for (let ix = -tileCount; ix <= tileCount; ix++) {
    for (let iy = -tileCount; iy <= tileCount; iy++) {
      const shimmer = Math.sin(now * 8 + ix * 1.2 + iy) > 0.3;
      ctx.fillStyle = shimmer ? '#ffffff' : ((ix + iy) % 2 === 0 ? '#718093' : '#a4b0be');
      ctx.fillRect(ix * (ballDrawR / 4), iy * (ballDrawR / 4), ballDrawR / 4.5, ballDrawR / 4.5);
    }
  }
  ctx.lineWidth = 6 * ballScale;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
} else {
  // Giant Beach Ball (Classic 6-color segmented sphere)
  const beachColors = ['#ff2a2a', '#ffffff', '#00b4d8', '#ffffff', '#ffd166', '#06d6a0'];
  for (let b = 0; b < beachColors.length; b++) {
    const aStart = (b / beachColors.length) * Math.PI * 2;
    const aEnd = ((b + 1) / beachColors.length) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, ballDrawR, aStart, aEnd);
    ctx.fillStyle = beachColors[b];
    ctx.fill();
  }
  // End caps
  ctx.beginPath();
  ctx.arc(0, 0, ballDrawR * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 5 * ballScale;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}
ctx.restore();

// --- BIG BOLD HUD & PARTY LABELS ---
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Header Info: Round Timer & Best Peak
ctx.font = '900 24px sans-serif';
ctx.fillStyle = '#ffffff';
const displayTimer = Math.max(0, Math.ceil(S.roundTimer));
ctx.fillText('TIME: ' + displayTimer + 's', cx - 180, 48);
ctx.fillText('BEST: ' + S.bestLaunch + 'm', cx + 180, 48);

// Big Callout Banner
if (S.bannerTimer > 0) {
  S.bannerTimer -= dt;
  ctx.save();
  ctx.font = '900 ' + Math.floor(minDim * 0.075) + 'px sans-serif';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 10;
  ctx.strokeText(S.banner, cx, cy - chuteR * 0.65);
  ctx.fillStyle = S.bannerColor;
  ctx.fillText(S.banner, cx, cy - chuteR * 0.65);
  ctx.restore();
}

// Prominent Action Button / Helper Callout
ctx.save();
if (isAttract) {
  ctx.font = '800 28px sans-serif';
  ctx.fillStyle = '#ffdf70';
  ctx.fillText('PRESS [LIFT] TO JOIN THE ROOM!', cx, H - 45);
} else {
  ctx.font = '900 32px sans-serif';
  ctx.fillStyle = '#00f5d4';
  ctx.fillText('PRESS LIFT IN UNISON!', cx, H - 45);
}
ctx.restore();

ctx.restore();