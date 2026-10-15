ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.05);

// State init
room.state.plants ??= {};
room.state.particles ??= [];
room.state.fireflies ??= [];
room.state.roundState ??= 'PLAYING'; // 'PLAYING', 'VICTORY', 'RESET'
room.state.stateTimer ??= 0;
room.state.lastActionT ??= t;
room.state.gardenHarmony ??= 0;
room.state.splashRings ??= [];

const style = getVar('style') ?? 'Bioluminescent';
const layout = getVar('bed_layout') ?? 'Stepped Tier';
const dryRate = (getVar('decay_rate') ?? 3) * 0.04;
const glowOn = getVar('glow_boost') ?? true;

// Determine active participant list (fall back to 4 bot beds if empty room)
let roster = room.people && room.people.length > 0 ? room.people : null;
if (!roster) {
  roster = [
    { id: 'bot-0', hue: 140, table: 'demo' },
    { id: 'bot-1', hue: 45, table: 'demo' },
    { id: 'bot-2', hue: 200, table: 'demo' },
    { id: 'bot-3', hue: 310, table: 'demo' }
  ];
}

// Sync plants with active roster; prune departed players
const activeIds = new Set(roster.map(p => p.id));
for (const id in room.state.plants) {
  if (!activeIds.has(id)) delete room.state.plants[id];
}
roster.forEach((p, idx) => {
  room.state.plants[p.id] ??= {
    id: p.id,
    hue: p.hue ?? ((idx * 83) % 360),
    water: 0.2 + (idx * 0.1) % 0.3,
    shake: 0,
    wiltAlert: 0,
    bloomTime: 0
  };
  room.state.plants[p.id].hue = p.hue ?? ((idx * 83) % 360);
});

// Handle interactive trigger events
let anyAction = false;
if (room.events && room.events.length > 0) {
  for (const ev of room.events) {
    if (ev.name === 'water') {
      anyAction = true;
      let target = room.state.plants[ev.participantId];
      if (!target) {
        // Fallback: water first or random plant
        const keys = Object.keys(room.state.plants);
        target = room.state.plants[keys[Math.floor(Math.random() * keys.length)]];
      }
      if (target) {
        target.water = Math.min(1.2, target.water + 0.17);
        target.shake = 1.0;
        // Water droplets
        for (let i = 0; i < 6; i++) {
          if (room.state.particles.length < 140) {
            room.state.particles.push({
              x: 0, y: 0, targetId: target.id,
              vx: (Math.random() - 0.5) * 160,
              vy: -120 - Math.random() * 180,
              life: 1.0, hue: target.hue, type: 'drop'
            });
          }
        }
      }
    } else if (ev.name === 'rain_shower') {
      anyAction = true;
      for (const id in room.state.plants) {
        const p = room.state.plants[id];
        p.water = Math.min(1.15, p.water + 0.12);
        p.shake = 0.8;
      }
    }
  }
}

if (anyAction) room.state.lastActionT = t;

// Attract mode: simulate taps when idle for > 4.5s
const isAttract = (t - room.state.lastActionT) > 4.5;
if (isAttract) {
  if (Math.random() < dt * 2.8) {
    const keys = Object.keys(room.state.plants);
    if (keys.length > 0) {
      const pick = room.state.plants[keys[Math.floor(Math.random() * keys.length)]];
      pick.water = Math.min(1.15, pick.water + 0.15);
      pick.shake = 0.7;
    }
  }
}

// Round & Game Logic
room.state.stateTimer += dt;
const plantCount = roster.length;
let bloomingCount = 0;
let wiltedCount = 0;

for (const id in room.state.plants) {
  const p = room.state.plants[id];
  // Drying over time
  p.water = Math.max(0, p.water - dryRate * dt * (0.8 + audio.mid * 0.4));
  p.shake = Math.max(0, p.shake - dt * 2.5);

  // Check status (0.45 .. 0.85 is the BLOOM sweet spot)
  if (p.water >= 0.45 && p.water <= 0.88) {
    p.bloomTime += dt;
    bloomingCount++;
  } else {
    p.bloomTime = Math.max(0, p.bloomTime - dt);
  }
  if (p.water > 0.88) {
    wiltedCount++;
    p.wiltAlert = Math.min(1, p.wiltAlert + dt * 3);
  } else {
    p.wiltAlert = Math.max(0, p.wiltAlert - dt * 2);
  }
}

const syncRatio = plantCount > 0 ? (bloomingCount / plantCount) : 0;
room.state.gardenHarmony += (syncRatio - room.state.gardenHarmony) * Math.min(1, dt * 4);

if (room.state.roundState === 'PLAYING') {
  if (plantCount > 0 && bloomingCount === plantCount) {
    room.state.roundState = 'VICTORY';
    room.state.stateTimer = 0;
  }
} else if (room.state.roundState === 'VICTORY') {
  // Spawn victory fireflies lavishly
  if (room.state.fireflies.length < 90 && Math.random() < 0.6) {
    room.state.fireflies.push({
      x: Math.random() * W,
      y: H * 0.85,
      vx: (Math.random() - 0.5) * 80,
      vy: -140 - Math.random() * 160,
      size: 4 + Math.random() * 6,
      hue: (t * 70 + Math.random() * 60) % 360,
      life: 1.0
    });
  }
  if (room.state.stateTimer > 4.5) {
    room.state.roundState = 'RESET';
    room.state.stateTimer = 0;
  }
} else if (room.state.roundState === 'RESET') {
  for (const id in room.state.plants) {
    room.state.plants[id].water = 0.25 + Math.random() * 0.15;
  }
  if (room.state.stateTimer > 1.2) {
    room.state.roundState = 'PLAYING';
    room.state.stateTimer = 0;
  }
}

// Update & cull fireflies
for (let i = room.state.fireflies.length - 1; i >= 0; i--) {
  const ff = room.state.fireflies[i];
  ff.x += ff.vx * dt + Math.sin(t * 3 + i) * 0.6;
  ff.y += ff.vy * dt;
  ff.life -= dt * 0.35;
  if (ff.life <= 0 || ff.y < -50) room.state.fireflies.splice(i, 1);
}
// Ambient fireflies in night garden
if (room.state.fireflies.length < 24 && Math.random() < 0.2) {
  room.state.fireflies.push({
    x: Math.random() * W,
    y: H * (0.4 + Math.random() * 0.5),
    vx: (Math.random() - 0.5) * 40,
    vy: -20 - Math.random() * 40,
    size: 2.5 + Math.random() * 3,
    hue: 90 + Math.random() * 70,
    life: 1.0
  });
}

// Background rendering based on style
const bgLums = { 'Bioluminescent': '#050a14', 'Midnight Moss': '#060f0a', 'Neon Twilight': '#0f0514' };
ctx.fillStyle = bgLums[style] ?? '#050a14';
ctx.fillRect(0, 0, W, H);

// Night sky stars / ambient sheen
const harmonyGlow = room.state.gardenHarmony;
if (harmonyGlow > 0.05 && glowOn) {
  const gGrad = ctx.createRadialGradient(W * 0.5, H * 0.7, 50, W * 0.5, H * 0.6, W * 0.7);
  gGrad.addColorStop(0, `hsla(150, 90%, 45%, ${harmonyGlow * 0.28})`);
  gGrad.addColorStop(0.5, `hsla(180, 80%, 40%, ${harmonyGlow * 0.14})`);
  gGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, 0, W, H);
}

// Audio beat horizon shimmer
if (audio.level > 0.05) {
  ctx.fillStyle = `hsla(200, 100%, 70%, ${audio.level * 0.08})`;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
}

// Raised Bed Planter Geometry
const bedY = H * 0.72;
const bedHeight = H * 0.28;
ctx.save();
// Planter back soil line
ctx.fillStyle = '#0a140f';
ctx.beginPath();
ctx.moveTo(0, bedY);
ctx.lineTo(W, bedY);
ctx.lineTo(W, H);
ctx.lineTo(0, H);
ctx.fill();

// Wooden/Stone front border of raised bed
const borderGrad = ctx.createLinearGradient(0, bedY, 0, H);
borderGrad.addColorStop(0, '#1c2e22');
borderGrad.addColorStop(0.15, '#121f17');
borderGrad.addColorStop(1, '#09100c');
ctx.fillStyle = borderGrad;
ctx.fillRect(0, bedY + 16, W, bedHeight - 16);

// Top trim rail of the planter
ctx.fillStyle = '#2f4b39';
ctx.fillRect(0, bedY, W, 16);
ctx.fillStyle = '#42684f';
ctx.fillRect(0, bedY, W, 3);
ctx.restore();

// Render Each Plant Lane
const count = roster.length;
const laneWidth = W / count;

roster.forEach((p, idx) => {
  const plant = room.state.plants[p.id];
  if (!plant) return;

  // Base X with optional layout shape
  let baseX = laneWidth * (idx + 0.5);
  let baseY = bedY + 8;
  if (layout === 'Stepped Tier') {
    baseY += Math.sin((idx / Math.max(1, count - 1)) * Math.PI) * -24;
  } else if (layout === 'Arched Grove') {
    const arch = 1 - Math.pow(((idx / Math.max(1, count - 1)) - 0.5) * 2, 2);
    baseY += -arch * 40;
  }

  const water = plant.water;
  const shakeOffset = Math.sin(t * 30) * plant.shake * 12;
  const x = baseX + shakeOffset;

  // Compute plant heights and stages
  // water: 0..0.45 (sprout/growth), 0.45..0.88 (BLOOM), >0.88 (wilt)
  const isBloom = water >= 0.45 && water <= 0.88;
  const isWilted = water > 0.88;
  const stemGrowth = Math.min(1.0, water / 0.45);
  const maxStemH = Math.min(H * 0.45, 180 + H * 0.15);
  const stemH = (maxStemH * 0.25) + (stemGrowth * maxStemH * 0.75);

  const plantHue = plant.hue;

  ctx.save();

  // Draw lane target zone aura on soil
  const auraAlpha = isBloom ? 0.35 + audio.bass * 0.2 : 0.08;
  ctx.fillStyle = `hsla(${plantHue}, 90%, 55%, ${auraAlpha})`;
  ctx.beginPath();
  ctx.ellipse(x, baseY + 6, laneWidth * 0.38, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stem Drawing
  const headY = baseY - stemH;
  const stemSway = Math.sin(t * 2 + idx) * (isWilted ? 35 : 12) + (isWilted ? 25 : 0);
  const tipX = x + stemSway;
  const tipY = isWilted ? headY + stemH * 0.35 : headY;

  ctx.beginPath();
  ctx.moveTo(x, baseY);
  const ctrlX = x + (stemSway * 0.3);
  const ctrlY = baseY - stemH * 0.5;
  ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
  ctx.lineWidth = Math.max(4, Math.min(14, laneWidth * 0.15));
  ctx.lineCap = 'round';
  ctx.strokeStyle = isWilted ? '#525a48' : `hsl(${110 + (plantHue * 0.1)}, 65%, ${isBloom ? 45 : 32}%)`;
  ctx.stroke();

  // Leaves along stem
  if (water > 0.2) {
    const leafCount = Math.min(3, Math.floor(water * 4));
    for (let l = 1; l <= leafCount; l++) {
      const lfFrac = l / (leafCount + 1);
      const lx = x + (ctrlX - x) * lfFrac;
      const ly = baseY - stemH * lfFrac;
      const side = (l % 2 === 0) ? 1 : -1;
      const leafLen = Math.min(36, laneWidth * 0.28) * (isWilted ? 0.6 : 1);

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(side * (0.6 + Math.sin(t * 2 + l) * 0.1) + (isWilted ? 0.6 : 0));
      ctx.fillStyle = isWilted ? '#444d3d' : `hsl(125, 60%, ${30 + lfFrac * 18}%)`;
      ctx.beginPath();
      ctx.ellipse(leafLen * 0.5, 0, leafLen * 0.5, leafLen * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Flower Head / Bud / Wilted Droop
  ctx.save();
  ctx.translate(tipX, tipY);

  if (isWilted) {
    // Wilted Head: Drooped brown/gray bulb steaming excess water
    ctx.rotate(1.2);
    ctx.fillStyle = '#61584b';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    // Overwater steam / bubbles
    ctx.fillStyle = 'rgba(180, 220, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(Math.sin(t * 6) * 8, -20 - (t * 20 % 25), 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (isBloom) {
    // Full Brilliant Bloom!
    const pulse = 1.0 + (audio.beat ? 0.22 : 0) + Math.sin(t * 5 + idx) * 0.08;
    const bloomRadius = Math.min(48, laneWidth * 0.38) * pulse;
    const petals = 6;

    if (glowOn) {
      // Outer neon halo
      ctx.shadowColor = `hsl(${plantHue}, 100%, 65%)`;
      ctx.shadowBlur = 24 + audio.bass * 20;
    }

    // Petals
    for (let pIdx = 0; pIdx < petals; pIdx++) {
      const angle = (pIdx / petals) * Math.PI * 2 + (t * 0.5);
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = `hsl(${plantHue}, 90%, ${58 + (pIdx % 2) * 12}%)`;
      ctx.beginPath();
      ctx.ellipse(bloomRadius * 0.55, 0, bloomRadius * 0.5, bloomRadius * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Center pistil / core
    ctx.fillStyle = '#fff4a3';
    ctx.beginPath();
    ctx.arc(0, 0, bloomRadius * 0.32, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle sparkles
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, -bloomRadius * 0.7, 4, bloomRadius * 1.4);
    ctx.fillRect(-bloomRadius * 0.7, -2, bloomRadius * 1.4, 4);
  } else {
    // Sprout or Bud
    const budScale = 8 + (water / 0.45) * 18;
    ctx.fillStyle = `hsl(${plantHue}, 80%, 45%)`;
    ctx.beginPath();
    ctx.arc(0, 0, budScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8ce878';
    ctx.beginPath();
    ctx.arc(0, 3, budScale * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Water Meter & Player Tag underneath on the planter wall
  const meterW = Math.min(80, laneWidth * 0.75);
  const meterH = 14;
  const meterX = x - meterW * 0.5;
  const meterY = bedY + 36;

  // Meter bg
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(meterX, meterY, meterW, meterH);

  // Optimal Sweet Spot highlight on meter (0.45 to 0.88)
  const sweetX = meterX + meterW * 0.45;
  const sweetW = meterW * (0.88 - 0.45);
  ctx.fillStyle = 'rgba(40, 220, 110, 0.35)';
  ctx.fillRect(sweetX, meterY, sweetW, meterH);
  ctx.strokeStyle = '#3df58a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sweetX, meterY, sweetW, meterH);

  // Water level bar
  const fillRatio = Math.min(1.0, water);
  const barColor = isWilted ? '#e74c3c' : (isBloom ? '#2ecc71' : `hsl(${plantHue}, 85%, 55%)`);
  ctx.fillStyle = barColor;
  ctx.fillRect(meterX + 1, meterY + 1, (meterW - 2) * fillRatio, meterH - 2);

  // Status Label / Player Indicator
  ctx.font = '900 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  if (isWilted) {
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText('WILTED!', x, meterY + meterH + 4);
  } else if (isBloom) {
    ctx.fillStyle = '#69f0ae';
    ctx.fillText('BLOOM!', x, meterY + meterH + 4);
  } else {
    ctx.fillStyle = '#b0bec5';
    ctx.fillText('WATER!', x, meterY + meterH + 4);
  }

  // Player ID / Seat number chip
  const seatLabel = roster[idx].table && roster[idx].table !== 'demo' ? roster[idx].table.toUpperCase() : `P${idx + 1}`;
  ctx.font = '800 11px system-ui, sans-serif';
  ctx.fillStyle = `hsl(${plantHue}, 100%, 75%)`;
  ctx.fillText(seatLabel, x, meterY + meterH + 20);

  ctx.restore();
});

// Particle updates and rendering (water drops & bloom petals)
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const pt = room.state.particles[i];
  pt.x += pt.vx * dt;
  pt.y += pt.vy * dt;
  pt.vy += 380 * dt; // gravity
  pt.life -= dt * 1.5;

  if (pt.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }

  ctx.save();
  ctx.fillStyle = `hsla(${pt.hue}, 90%, 65%, ${pt.life})`;
  ctx.beginPath();
  ctx.arc(pt.x + (W * 0.5), pt.y + bedY, 4 * pt.life, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw fireflies
room.state.fireflies.forEach(ff => {
  ctx.save();
  const alpha = Math.min(1, ff.life * 1.5) * (0.6 + Math.sin(t * 6 + ff.x) * 0.4);
  ctx.fillStyle = `hsla(${ff.hue}, 100%, 70%, ${alpha})`;
  if (glowOn) {
    ctx.shadowColor = `hsl(${ff.hue}, 100%, 60%)`;
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.arc(ff.x, ff.y, ff.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
});

// Big Stage HUD / Scoreboard across top
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Progress bar: GARDEN HARMONY
const barTotalW = Math.min(540, W * 0.7);
const barTotalH = 26;
const barTopX = (W - barTotalW) * 0.5;
const barTopY = 24;

// Bar background
ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
ctx.fillRect(barTopX, barTopY, barTotalW, barTotalH);
ctx.strokeStyle = '#27ae60';
ctx.lineWidth = 2;
ctx.strokeRect(barTopX, barTopY, barTotalW, barTotalH);

// Bar progress
const fillWidth = (barTotalW - 4) * Math.min(1.0, syncRatio);
const gradFill = ctx.createLinearGradient(barTopX, 0, barTopX + barTotalW, 0);
gradFill.addColorStop(0, '#2ecc71');
gradFill.addColorStop(0.5, '#00e5ff');
gradFill.addColorStop(1, '#ffeb3b');
ctx.fillStyle = gradFill;
ctx.fillRect(barTopX + 2, barTopY + 2, fillWidth, barTotalH - 4);

// Harmony label
ctx.font = '900 14px system-ui, sans-serif';
ctx.fillStyle = '#ffffff';
ctx.shadowColor = 'rgba(0,0,0,0.8)';
ctx.shadowBlur = 4;
ctx.fillText(`HARMONY: ${bloomingCount} / ${plantCount} IN BLOOM`, W * 0.5, barTopY + barTotalH * 0.5);

// Large Over-the-Top Announcements
if (room.state.roundState === 'VICTORY') {
  ctx.save();
  const pulseScale = 1.0 + Math.sin(t * 8) * 0.08;
  ctx.translate(W * 0.5, H * 0.36);
  ctx.scale(pulseScale, pulseScale);

  ctx.font = '900 68px system-ui, sans-serif';
  ctx.shadowColor = '#00ffcc';
  ctx.shadowBlur = 36;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('NIGHT GARDEN BLOOMING!', 0, 0);

  ctx.font = '800 28px system-ui, sans-serif';
  ctx.fillStyle = '#69f0ae';
  ctx.fillText('PERFECT HARMONY ACHIEVED!', 0, 52);
  ctx.restore();
} else if (room.state.roundState === 'RESET') {
  ctx.save();
  ctx.font = '900 76px system-ui, sans-serif';
  ctx.fillStyle = '#ffeb3b';
  ctx.shadowColor = '#f39c12';
  ctx.shadowBlur = 30;
  ctx.fillText('NEXT ROUND: GO!', W * 0.5, H * 0.36);
  ctx.restore();
} else if (isAttract) {
  // Attract mode banner
  ctx.save();
  ctx.font = '900 24px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 12;
  ctx.fillText('PRESS WATER TO TEND YOUR PLANT!', W * 0.5, H * 0.18);
  ctx.restore();
}

ctx.restore();
ctx.restore();