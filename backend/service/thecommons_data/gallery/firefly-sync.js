const W = frame.width;
const H = frame.height;
const coupling = getVar('coupling') ?? 0.4;
const tempoVar = getVar('tempo') ?? 'waltz';
const glowStyle = getVar('glow_style') ?? 'biolum';
const grassSway = getVar('grass_sway') ?? true;

const tempoFreqs = { gentle: 0.65, waltz: 1.0, allegro: 1.5, hyper: 2.2 };
const baseFreq = (tempoFreqs[tempoVar] ?? 1.0) * (1 + audio.mid * 0.4);

// Persistent room state init
room.state.flies ??= [];
room.state.rings ??= [];
room.state.shocks ??= [];
room.state.syncStreak ??= 0;
room.state.bestStreak ??= 0;
room.state.syncBannerTimer ??= 0;
room.state.bannerText ??= '';
room.state.lastPressTime ??= frame.t;
room.state.unisonCooldown ??= 0;

const flies = room.state.flies;
const rings = room.state.rings;
const shocks = room.state.shocks;

// Ambient dummy flock if room is sparse, plus 1 firefly per real connected person
const realPeople = room.people || [];
const targetCount = Math.max(14, realPeople.length);

// Keep flies array matched to audience + fill
while (flies.length < targetCount) {
  const i = flies.length;
  flies.push({
    id: i < realPeople.length ? realPeople[i].id : 'ambient_' + i,
    x: 0.1 + 0.8 * Math.random(),
    y: 0.15 + 0.65 * Math.random(),
    vx: (Math.random() - 0.5) * 0.04,
    vy: (Math.random() - 0.5) * 0.04,
    phase: Math.random() * Math.PI * 2,
    flashVal: 0,
    hue: (i * 37) % 360,
    isPlayer: false
  });
}
if (flies.length > targetCount && flies.length > 14) {
  flies.length = targetCount;
}

// Bind real people hues and statuses
for (let i = 0; i < flies.length; i++) {
  if (i < realPeople.length) {
    flies[i].id = realPeople[i].id;
    flies[i].hue = realPeople[i].hue ?? ((i * 45) % 360);
    flies[i].isPlayer = true;
  } else {
    flies[i].isPlayer = false;
    if (flies[i].id.indexOf('ambient') !== 0) flies[i].id = 'ambient_' + i;
  }
}

// Handle events (Blink actions)
let someonePressed = false;
for (const ev of room.events) {
  if (ev.name === 'blink') {
    someonePressed = true;
    room.state.lastPressTime = frame.t;
    let matched = flies.find(f => f.id === ev.participantId);
    if (!matched) {
      // pick nearest player or random
      matched = flies[Math.floor(Math.random() * flies.length)];
    }
    if (matched) {
      matched.phase = 0; // jump directly to peak flash
      matched.flashVal = 1.0;
      shocks.push({ x: matched.x, y: matched.y, r: 0, hue: matched.hue, life: 1.0 });
      if (shocks.length > 20) shocks.shift();

      // Nudge nearby fireflies strongly toward this phase
      const nudgeStrength = coupling * 1.8;
      for (let j = 0; j < flies.length; j++) {
        if (flies[j] === matched) continue;
        const dx = flies[j].x - matched.x;
        const dy = flies[j].y - matched.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 0.22) {
          const dPhase = Math.sin(matched.phase - flies[j].phase);
          flies[j].phase += dPhase * nudgeStrength * (1 - Math.sqrt(distSq) / 0.47);
        }
      }
    }
  }
}

// Attract mode: autonomous auto-blinks if quiet
if (!someonePressed && (frame.t - room.state.lastPressTime) > 4.5) {
  if (Math.random() < 0.04 || audio.beat) {
    const pick = flies[Math.floor(Math.random() * flies.length)];
    pick.phase = 0;
    pick.flashVal = 1.0;
    shocks.push({ x: pick.x, y: pick.y, r: 0, hue: pick.hue, life: 0.8 });
    if (shocks.length > 20) shocks.shift();
  }
}

// kuramoto phase coupling & drift physics
let cosSum = 0;
let sinSum = 0;
const dt = Math.min(frame.dt || 0.016, 0.05);
const cycleSpeed = baseFreq * Math.PI * 2;

for (let i = 0; i < flies.length; i++) {
  const f = flies[i];
  f.x += f.vx * dt + Math.sin(frame.t * 0.8 + i) * 0.0003;
  f.y += f.vy * dt + Math.cos(frame.t * 0.7 + i * 1.5) * 0.0003;
  if (f.x < 0.06) { f.x = 0.06; f.vx = Math.abs(f.vx); }
  if (f.x > 0.94) { f.x = 0.94; f.vx = -Math.abs(f.vx); }
  if (f.y < 0.12) { f.y = 0.12; f.vy = Math.abs(f.vy); }
  if (f.y > 0.82) { f.y = 0.82; f.vy = -Math.abs(f.vy); }

  // Kuramoto natural drift + subtle neighbor pull
  f.phase = (f.phase + cycleSpeed * dt) % (Math.PI * 2);
  cosSum += Math.cos(f.phase);
  sinSum += Math.sin(f.phase);

  // Flash intensity: sharp peak around phase ~ 0
  const distToPeak = Math.abs(f.phase > Math.PI ? f.phase - Math.PI * 2 : f.phase);
  const naturalPulse = Math.max(0, 1 - distToPeak / 0.55);
  f.flashVal = Math.max(f.flashVal * 0.88, naturalPulse * naturalPulse);
}

// Kuramoto order parameter: R in [0, 1]
const syncOrder = Math.sqrt(cosSum * cosSum + sinSum * sinSum) / flies.length;

// Unison explosion check
room.state.unisonCooldown = Math.max(0, room.state.unisonCooldown - dt);
if (syncOrder > 0.72 && room.state.unisonCooldown <= 0) {
  room.state.syncStreak++;
  if (room.state.syncStreak > room.state.bestStreak) {
    room.state.bestStreak = room.state.syncStreak;
  }
  room.state.syncBannerTimer = 2.4;
  room.state.bannerText = room.state.syncStreak > 3 ? 'PERFECT UNISON!' : 'HARMONY!';
  room.state.unisonCooldown = 1.8;

  // Spawn grand ripple wave
  rings.push({ r: 20, maxR: Math.max(W, H) * 0.9, alpha: 1.0, hue: (frame.t * 60) % 360 });
  if (rings.length > 8) rings.shift();
} else if (syncOrder < 0.35 && room.state.unisonCooldown <= 0) {
  if (room.state.syncStreak > 0 && Math.random() < 0.02) {
    room.state.syncStreak = 0;
  }
}

// Draw background
ctx.save();
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
if (glowStyle === 'aurora') {
  bgGrad.addColorStop(0, '#04161f');
  bgGrad.addColorStop(0.65, '#06201a');
  bgGrad.addColorStop(1, '#020b08');
} else if (glowStyle === 'neon_meadow') {
  bgGrad.addColorStop(0, '#100320');
  bgGrad.addColorStop(0.7, '#1b082e');
  bgGrad.addColorStop(1, '#080112');
} else if (glowStyle === 'starlight') {
  bgGrad.addColorStop(0, '#050714');
  bgGrad.addColorStop(0.7, '#080d24');
  bgGrad.addColorStop(1, '#02040b');
} else {
  // biolum
  bgGrad.addColorStop(0, '#020f18');
  bgGrad.addColorStop(0.65, '#051821');
  bgGrad.addColorStop(1, '#01090d');
}
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Unison shockwave rings
for (let i = rings.length - 1; i >= 0; i--) {
  const r = rings[i];
  r.r += 420 * dt;
  r.alpha *= 0.97;
  ctx.strokeStyle = `hsla(${r.hue}, 100%, 70%, ${r.alpha})`;
  ctx.lineWidth = 14 * r.alpha;
  ctx.beginPath();
  ctx.arc(W * 0.5, H * 0.5, r.r, 0, Math.PI * 2);
  ctx.stroke();
  if (r.alpha < 0.02 || r.r > r.maxR) rings.splice(i, 1);
}

// Shock ripples from individual blinks
for (let i = shocks.length - 1; i >= 0; i--) {
  const s = shocks[i];
  s.r += 260 * dt;
  s.life -= dt * 2.2;
  if (s.life <= 0) {
    shocks.splice(i, 1);
    continue;
  }
  ctx.beginPath();
  ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${s.hue}, 100%, 75%, ${s.life * 0.8})`;
  ctx.lineWidth = 4 * s.life;
  ctx.stroke();
}

// Draw fireflies
for (let i = 0; i < flies.length; i++) {
  const f = flies[i];
  const fx = f.x * W;
  const fy = f.y * H;
  const fHue = f.hue;
  const bright = f.flashVal;
  const radius = f.isPlayer ? 18 : 13;
  const popR = radius * (1 + bright * 0.9 + audio.bass * 0.3);

  // Multi-tier radial aura
  if (bright > 0.05) {
    const haloR = popR * (2.4 + bright * 3.5);
    const aura = ctx.createRadialGradient(fx, fy, 2, fx, fy, haloR);
    aura.addColorStop(0, `hsla(${fHue}, 100%, 75%, ${bright * 0.9})`);
    aura.addColorStop(0.4, `hsla(${fHue}, 90%, 55%, ${bright * 0.45})`);
    aura.addColorStop(1, `hsla(${fHue}, 80%, 40%, 0)`);
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(fx, fy, haloR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Core body
  ctx.beginPath();
  ctx.arc(fx, fy, popR * 0.7, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${fHue}, 95%, ${40 + bright * 55}%)`;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = f.isPlayer ? 3.5 : 1.5;
  ctx.stroke();

  // Central bright spark
  ctx.beginPath();
  ctx.arc(fx, fy, Math.max(3, popR * 0.3), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + bright * 0.6})`;
  ctx.fill();

  // Player badge ring
  if (f.isPlayer) {
    ctx.beginPath();
    ctx.arc(fx, fy, popR + 7, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${fHue}, 100%, 80%, ${0.6 + bright * 0.4})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// Meadow grass silhouette foreground
if (grassSway) {
  ctx.fillStyle = '#020707';
  ctx.beginPath();
  ctx.moveTo(0, H);
  const blades = 36;
  const bStep = W / blades;
  for (let b = 0; b <= blades; b++) {
    const bx = b * bStep;
    const sway = Math.sin(frame.t * 2.2 + b * 0.5) * 16 + audio.mid * 20;
    const hBlade = 80 + Math.sin(b * 3.7) * 45 + (b % 3) * 35;
    ctx.quadraticCurveTo(bx - sway * 0.5, H - hBlade * 0.5, bx + sway, H - hBlade);
    ctx.quadraticCurveTo(bx + sway * 0.3, H - hBlade * 0.4, bx + bStep, H);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

// Top party HUD: bold synchrony gauge & scores
const barW = Math.min(W * 0.6, 500);
const barH = 18;
const barX = (W - barW) * 0.5;
const barY = 32;

// Bar back
ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
ctx.strokeStyle = '#334455';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.roundRect(barX, barY, barW, barH, 9);
ctx.fill();
ctx.stroke();

// Bar fill (sync order)
const fillW = Math.max(0, Math.min(barW, barW * syncOrder));
const syncHue = syncOrder > 0.7 ? 130 : (syncOrder > 0.45 ? 50 : 10);
ctx.fillStyle = `hsl(${syncHue}, 95%, 55%)`;
ctx.beginPath();
ctx.roundRect(barX, barY, fillW, barH, 9);
ctx.fill();

// Sync Meter Label
ctx.textAlign = 'center';
ctx.textBaseline = 'bottom';
ctx.font = '900 16px monospace, sans-serif';
ctx.fillStyle = '#f0f6ff';
ctx.fillText(`SYNC HARMONY: ${Math.round(syncOrder * 100)}%`, W * 0.5, barY - 6);

// Streak & Best streak banners
ctx.font = '900 24px sans-serif';
ctx.textAlign = 'left';
ctx.textBaseline = 'top';
ctx.fillStyle = '#ffdf40';
ctx.fillText(`STREAK: ${room.state.syncStreak}`, 30, 26);

ctx.font = '700 18px sans-serif';
ctx.fillStyle = '#7de8ff';
ctx.fillText(`BEST: ${room.state.bestStreak}`, 30, 56);

ctx.textAlign = 'right';
ctx.font = '700 16px sans-serif';
ctx.fillStyle = '#c5d3e8';
ctx.fillText(`${flies.length} FIREFLIES (${realPeople.length} LIVE)`, W - 30, 30);
ctx.font = '900 14px monospace';
ctx.fillStyle = '#6ee7b7';
ctx.fillText(`PRESS [BLINK!] TOGETHER`, W - 30, 56);

// Giant center announcement on synchrony
if (room.state.syncBannerTimer > 0) {
  room.state.syncBannerTimer -= dt;
  const scale = Math.min(1.0, (2.4 - room.state.syncBannerTimer) * 4);
  const alpha = Math.min(1.0, room.state.syncBannerTimer);
  ctx.save();
  ctx.translate(W * 0.5, H * 0.36);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 68px sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(room.state.bannerText, 0, 0);
  ctx.fillStyle = `hsl(${(frame.t * 120) % 360}, 100%, 65%)`;
  ctx.fillText(room.state.bannerText, 0, 0);
  ctx.restore();
}

ctx.restore();