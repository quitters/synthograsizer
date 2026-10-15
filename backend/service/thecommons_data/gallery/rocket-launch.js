const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

// Variable configurations
const model = getVar('rocket_model') ?? 'Saturn V';
const site = getVar('launch_site') ?? 'Cape Nebula';
const hazard = getVar('hazard_level') ?? 'Standard';
const enableShake = getVar('screen_shake') ?? true;

const coolingRates = { 'Standard': 24, 'Hair-Trigger': 16, 'Forgiving': 36 };
const coolRate = coolingRates[hazard] ?? 24;

// Persistent game state
room.state.phase ??= 'fueling'; // 'fueling' | 'ready' | 'countdown' | 'liftoff' | 'celebrate'
room.state.fuel ??= 0;
room.state.pressure ??= 0;
room.state.shake ??= 0;
room.state.timer ??= 0;
room.state.round ??= 1;
room.state.particles ??= [];
room.state.conduits ??= [];
room.state.playerScores ??= {};
room.state.lastInputTime ??= frame.t;
room.state.lastAttractPulse ??= 0;
room.state.overheatedTimer ??= 0;
room.state.rocketY ??= 0;
room.state.rocketVelY ??= 0;
room.state.rollout ??= 1;
room.state.mvpName ??= 'TEAM';
room.state.mvpHue ??= 190;

// Palettes per site
const siteThemes = {
  'Cape Nebula': { sky0: '#070a1e', sky1: '#11183c', pad: '#1e294b', truss: '#00f0ff', accent: '#3b82f6', ground: '#090d24' },
  'Mars Red':    { sky0: '#1b0808', sky1: '#361111', pad: '#3b1d1d', truss: '#ff4d00', accent: '#f59e0b', ground: '#140505' },
  'Midnight Moon': { sky0: '#03060c', sky1: '#0a101d', pad: '#182030', truss: '#38bdf8', accent: '#e2e8f0', ground: '#05070e' }
};
const theme = siteThemes[site] ?? siteThemes['Cape Nebula'];

// Handle interactive input
let hadAction = false;
for (const e of room.events) {
  room.state.lastInputTime = frame.t;
  const person = room.people.find(p => p.id === e.participantId);
  const pHue = person ? person.hue : Math.floor((frame.t * 90) % 360);
  const pName = person ? (person.table ? `Table ${person.table}` : `Cadet ${person.id.slice(0, 4)}`) : 'Operator';

  if (e.name === 'fuel') {
    hadAction = true;
    if (room.state.phase === 'fueling' && room.state.overheatedTimer <= 0) {
      const count = Math.max(1, room.people.length);
      const gain = Math.max(2.5, 9 / Math.sqrt(count));
      room.state.fuel = Math.min(100, room.state.fuel + gain);
      room.state.pressure = Math.min(110, room.state.pressure + 9.5);
      room.state.shake = Math.min(18, room.state.shake + 3.5);

      // Track MVP
      room.state.playerScores[e.participantId] = (room.state.playerScores[e.participantId] || 0) + 1;
      if ((room.state.playerScores[e.participantId] || 0) > (room.state.playerScores[room.state.mvpId] || 0)) {
        room.state.mvpId = e.participantId;
        room.state.mvpName = pName;
        room.state.mvpHue = pHue;
      }

      // Conduit surge pulse
      if (room.state.conduits.length < 24) {
        room.state.conduits.push({ hue: pHue, t: 0, life: 0.5 });
      }

      // Add pad sparks
      for (let i = 0; i < 4; i++) {
        if (room.state.particles.length < 160) {
          room.state.particles.push({
            x: W * 0.48 + (Math.random() - 0.5) * 40,
            y: H * 0.65,
            vx: (Math.random() - 0.5) * 140,
            vy: -Math.random() * 120 - 40,
            life: 0.4 + Math.random() * 0.3,
            maxLife: 0.7,
            hue: pHue,
            size: 4 + Math.random() * 4,
            type: 'spark'
          });
        }
      }

      if (room.state.fuel >= 100) {
        room.state.phase = 'ready';
        room.state.shake = 12;
      }
    }
  }

  if (e.name === 'launch') {
    hadAction = true;
    if (room.state.phase === 'ready' || room.state.fuel >= 99) {
      room.state.phase = 'countdown';
      room.state.timer = 3.2;
      room.state.shake = 16;
    }
  }
}

// Attract mode if idle
if (frame.t - room.state.lastInputTime > 3.2) {
  if (room.state.phase === 'fueling' && frame.t - room.state.lastAttractPulse > 0.55) {
    room.state.lastAttractPulse = frame.t;
    room.state.fuel = Math.min(100, room.state.fuel + 3.2);
    room.state.pressure = Math.min(100, room.state.pressure + 6);
    const mockHue = Math.floor((frame.t * 70) % 360);
    if (room.state.conduits.length < 20) {
      room.state.conduits.push({ hue: mockHue, t: 0, life: 0.5 });
    }
    if (room.state.fuel >= 100) {
      room.state.phase = 'ready';
    }
  } else if (room.state.phase === 'ready' && frame.t - room.state.lastInputTime > 6.0) {
    room.state.phase = 'countdown';
    room.state.timer = 3.2;
  }
}

// Pressure dynamics & Overheat
if (room.state.overheatedTimer > 0) {
  room.state.overheatedTimer -= dt;
  room.state.pressure = Math.max(0, room.state.pressure - coolRate * 1.8 * dt);
} else if (room.state.phase === 'fueling') {
  room.state.pressure = Math.max(0, room.state.pressure - coolRate * dt);
  if (room.state.pressure >= 100) {
    // OVERHEAT BLAST!
    room.state.overheatedTimer = 1.8;
    room.state.fuel = Math.max(0, room.state.fuel - 18);
    room.state.shake = 22;
    // Vent smoke outburst
    for (let i = 0; i < 26; i++) {
      if (room.state.particles.length < 180) {
        room.state.particles.push({
          x: W * 0.48,
          y: H * 0.52,
          vx: (i % 2 === 0 ? 1 : -1) * (180 + Math.random() * 220),
          vy: (Math.random() - 0.5) * 80,
          life: 0.8 + Math.random() * 0.5,
          maxLife: 1.3,
          hue: 15,
          size: 16 + Math.random() * 20,
          type: 'vent'
        });
      }
    }
  }
} else {
  room.state.pressure = Math.max(0, room.state.pressure - coolRate * 1.5 * dt);
}

// Phase progress
if (room.state.phase === 'countdown') {
  room.state.timer -= dt;
  room.state.shake = Math.max(room.state.shake, 6 + (3.2 - room.state.timer) * 3);
  if (room.state.timer <= 0) {
    room.state.phase = 'liftoff';
    room.state.timer = 4.2;
    room.state.rocketVelY = 0;
    room.state.shake = 25;
  }
} else if (room.state.phase === 'liftoff') {
  room.state.timer -= dt;
  room.state.rocketVelY -= 550 * dt;
  room.state.rocketY += room.state.rocketVelY * dt;
  room.state.shake = Math.max(room.state.shake, 14);

  // Rocket flame plumes
  for (let i = 0; i < 6; i++) {
    if (room.state.particles.length < 190) {
      room.state.particles.push({
        x: W * 0.48 + (Math.random() - 0.5) * 36,
        y: H * 0.66 + room.state.rocketY,
        vx: (Math.random() - 0.5) * 140,
        vy: 200 + Math.random() * 400,
        life: 0.6 + Math.random() * 0.6,
        maxLife: 1.2,
        hue: Math.random() > 0.4 ? 35 : 10,
        size: 20 + Math.random() * 25,
        type: 'plume'
      });
    }
  }
  if (room.state.timer <= 0 || room.state.rocketY < -H * 1.3) {
    room.state.phase = 'celebrate';
    room.state.timer = 4.5;
  }
} else if (room.state.phase === 'celebrate') {
  room.state.timer -= dt;
  if (room.state.timer <= 0) {
    // Next rocket roll-out
    room.state.phase = 'fueling';
    room.state.fuel = 0;
    room.state.pressure = 0;
    room.state.rocketY = 0;
    room.state.rocketVelY = 0;
    room.state.rollout = 0;
    room.state.round++;
    room.state.playerScores = {};
    room.state.mvpName = 'TEAM';
  }
}

// Rollout animation
if (room.state.rollout < 1) {
  room.state.rollout = Math.min(1, room.state.rollout + dt * 1.4);
}

// Decay screen vibration
room.state.shake = Math.max(0, room.state.shake - dt * 20);

// ----------------- RENDERING -----------------
ctx.save();

// Screen shake translation
if (enableShake && room.state.shake > 0.5) {
  const mag = room.state.shake * (1 + audio.bass * 1.2);
  const sx = (Math.sin(frame.t * 60) * 0.7 + Math.cos(frame.t * 43) * 0.3) * mag;
  const sy = (Math.cos(frame.t * 54) * 0.7 + Math.sin(frame.t * 39) * 0.3) * mag;
  ctx.translate(sx, sy);
}

// Background Sky
const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
skyGrad.addColorStop(0, theme.sky0);
skyGrad.addColorStop(0.7, theme.sky1);
skyGrad.addColorStop(1, theme.ground);
ctx.fillStyle = skyGrad;
ctx.fillRect(-40, -40, W + 80, H + 80);

// Distant Stars & Launch Lights
ctx.save();
ctx.fillStyle = '#ffffff';
for (let i = 0; i < 40; i++) {
  const starX = (Math.sin(i * 91.3) * 0.5 + 0.5) * W;
  const starY = (Math.cos(i * 37.1) * 0.5 + 0.5) * (H * 0.65);
  const tw = Math.sin(frame.t * 3 + i) * 0.5 + 0.5;
  ctx.globalAlpha = 0.2 + 0.6 * tw;
  ctx.fillRect(starX, starY, 2, 2);
}
ctx.restore();

// Ground Platform / Launch Pad deck
const padY = H * 0.74;
ctx.fillStyle = theme.pad;
ctx.beginPath();
ctx.moveTo(W * 0.15, H);
ctx.lineTo(W * 0.25, padY);
ctx.lineTo(W * 0.75, padY);
ctx.lineTo(W * 0.85, H);
ctx.closePath();
ctx.fill();

// Pad Hazard Striping
ctx.save();
ctx.beginPath();
ctx.rect(W * 0.26, padY, W * 0.48, 16);
ctx.clip();
ctx.fillStyle = '#f59e0b';
ctx.fillRect(W * 0.26, padY, W * 0.48, 16);
ctx.fillStyle = '#111827';
for (let x = W * 0.25; x < W * 0.75; x += 32) {
  ctx.beginPath();
  ctx.moveTo(x, padY);
  ctx.lineTo(x + 18, padY);
  ctx.lineTo(x + 6, padY + 16);
  ctx.lineTo(x - 12, padY + 16);
  ctx.closePath();
  ctx.fill();
}
ctx.restore();

// Gantry Tower (Left)
const towerX = W * 0.34;
ctx.lineWidth = 4;
ctx.strokeStyle = '#475569';
ctx.strokeRect(towerX, H * 0.18, 45, padY - H * 0.18);
// Lattice trusses
ctx.beginPath();
for (let ty = H * 0.2; ty < padY - 20; ty += 40) {
  ctx.moveTo(towerX, ty);
  ctx.lineTo(towerX + 45, ty + 38);
  ctx.moveTo(towerX + 45, ty);
  ctx.lineTo(towerX, ty + 38);
}
ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
ctx.stroke();

// Service Arm swing / clamp
const armY = H * 0.38;
const clampRetract = (room.state.phase === 'liftoff' || (room.state.phase === 'countdown' && room.state.timer < 1.0)) ? 45 : 0;
ctx.fillStyle = theme.truss;
ctx.fillRect(towerX + 35, armY, 80 - clampRetract, 10);

// Rocket Center Coordinates
const rx = W * 0.48;
const rocketBaseY = padY - 10;
const rOffsetY = room.state.rocketY + (1 - room.state.rollout) * 350;

// Draw Exhaust particles below pad & rocket
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  const progress = p.life / p.maxLife;
  ctx.save();
  if (p.type === 'spark') {
    ctx.fillStyle = `hsl(${p.hue}, 100%, 70%)`;
    ctx.shadowColor = `hsl(${p.hue}, 100%, 50%)`;
    ctx.shadowBlur = 8;
    ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
  } else if (p.type === 'vent') {
    ctx.fillStyle = `rgba(255, 230, 220, ${progress * 0.7})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1.5 - progress * 0.5), 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Plume
    const rad = p.size * (1 + (1 - progress) * 2);
    const a = progress * 0.85;
    ctx.fillStyle = p.hue < 20 ? `rgba(255, 70, 0, ${a})` : `rgba(255, 185, 30, ${a})`;
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Rocket Drawing
ctx.save();
ctx.translate(rx, rocketBaseY + rOffsetY);

// Thruster plume if liftoff or countdown ignition
if (room.state.phase === 'liftoff' || (room.state.phase === 'countdown' && room.state.timer < 0.9)) {
  const thrustLen = (room.state.phase === 'liftoff' ? 140 : 40) * (1 + audio.bass * 0.6);
  const flameGrad = ctx.createLinearGradient(0, 0, 0, thrustLen);
  flameGrad.addColorStop(0, '#ffffff');
  flameGrad.addColorStop(0.3, '#ffea00');
  flameGrad.addColorStop(0.8, '#ff3300');
  flameGrad.addColorStop(1, 'rgba(255, 30, 0, 0)');
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(-24, 0);
  ctx.quadraticCurveTo(-35, thrustLen * 0.5, 0, thrustLen);
  ctx.quadraticCurveTo(35, thrustLen * 0.5, 24, 0);
  ctx.closePath();
  ctx.fill();
}

// Rocket Body Silhouettes based on 'rocket_model'
if (model === 'Retro Nova') {
  // 50s atomic bulbous rocket
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(0, -290);
  ctx.bezierCurveTo(45, -230, 48, -70, 32, 0);
  ctx.lineTo(-32, 0);
  ctx.bezierCurveTo(-48, -70, -45, -230, 0, -290);
  ctx.fill();
  // Atomic Red Fins
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(-32, -80); ctx.lineTo(-65, 10); ctx.lineTo(-30, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(32, -80); ctx.lineTo(65, 10); ctx.lineTo(30, 0); ctx.closePath(); ctx.fill();
  // Porthole Window
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.arc(0, -180, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();
} else if (model === 'Cosmo Dart') {
  // Sleek needle
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = theme.truss;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -320);
  ctx.lineTo(26, -40);
  ctx.lineTo(38, 0);
  ctx.lineTo(-38, 0);
  ctx.lineTo(-26, -40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Neon Wings
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.moveTo(-26, -110); ctx.lineTo(-75, 15); ctx.lineTo(-24, -10); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(26, -110); ctx.lineTo(75, 15); ctx.lineTo(24, -10); ctx.closePath(); ctx.fill();
} else {
  // Saturn V iconic multi-stage
  // Base stage
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(-34, -280, 68, 280);
  // Black roll patterns
  ctx.fillStyle = '#090d16';
  ctx.fillRect(-34, -220, 34, 70);
  ctx.fillRect(0, -150, 34, 70);
  ctx.fillRect(-34, -60, 68, 30);
  // Fins
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(-34, -60); ctx.lineTo(-58, 0); ctx.lineTo(-34, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(34, -60); ctx.lineTo(58, 0); ctx.lineTo(34, 0); ctx.closePath(); ctx.fill();
  // Conical Nosecone & Launch Escape Tower
  ctx.beginPath();
  ctx.moveTo(-34, -280);
  ctx.lineTo(0, -345);
  ctx.lineTo(34, -280);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -345); ctx.lineTo(0, -390);
  ctx.stroke();
}

// Fuel Tank Level Display inside rocket fuselage
const tankH = 150;
const tankY = -190;
const tankW = 28;
ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
ctx.fillRect(-tankW * 0.5, tankY, tankW, tankH);
const currentFuelH = (room.state.fuel / 100) * tankH;
const fHue = room.state.fuel >= 100 ? 140 : 185;
ctx.fillStyle = `hsl(${fHue}, 100%, 50%)`;
ctx.shadowColor = `hsl(${fHue}, 100%, 50%)`;
ctx.shadowBlur = 10;
ctx.fillRect(-tankW * 0.5 + 2, tankY + tankH - currentFuelH, tankW - 4, currentFuelH);

// Engine Bell Nozzles
ctx.shadowBlur = 0;
ctx.fillStyle = '#334155';
ctx.beginPath();
ctx.moveTo(-20, 0); ctx.lineTo(-26, 12); ctx.lineTo(-10, 12); ctx.lineTo(-14, 0); ctx.closePath(); ctx.fill();
ctx.beginPath();
ctx.moveTo(14, 0); ctx.lineTo(10, 12); ctx.lineTo(26, 12); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
ctx.beginPath();
ctx.moveTo(-8, 0); ctx.lineTo(-12, 14); ctx.lineTo(12, 14); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill();

ctx.restore();

// ----------------- HUD METERS & GAUGES -----------------

// 1. GIANT TANK LEVEL COLUMN (Right of Rocket)
const gaugeX = W * 0.62;
const gaugeY = H * 0.22;
const gaugeW = 46;
const gaugeH = H * 0.46;

// Housing
ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
ctx.strokeStyle = '#334155';
ctx.lineWidth = 4;
ctx.strokeRect(gaugeX, gaugeY, gaugeW, gaugeH);
ctx.fillRect(gaugeX, gaugeY, gaugeW, gaugeH);

// Fuel Fill Liquid with audio slosh
const fRatio = room.state.fuel / 100;
const fillPx = fRatio * (gaugeH - 8);
const slosh = Math.sin(frame.t * 8) * (audio.mid * 6 + 2);
const fuelCol = room.state.fuel >= 100 ? '#10b981' : '#00f0ff';

ctx.save();
ctx.beginPath();
ctx.rect(gaugeX + 4, gaugeY + 4, gaugeW - 8, gaugeH - 8);
ctx.clip();

ctx.fillStyle = fuelCol;
ctx.shadowColor = fuelCol;
ctx.shadowBlur = 16;
ctx.beginPath();
const topY = gaugeY + gaugeH - 4 - fillPx;
ctx.moveTo(gaugeX + 4, gaugeY + gaugeH - 4);
ctx.lineTo(gaugeX + 4, topY + slosh);
ctx.lineTo(gaugeX + gaugeW - 4, topY - slosh);
ctx.lineTo(gaugeX + gaugeW - 4, gaugeY + gaugeH - 4);
ctx.closePath();
ctx.fill();

// Tick marks
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 2;
for (let p = 0.25; p < 1; p += 0.25) {
  const ty = gaugeY + gaugeH - (gaugeH * p);
  ctx.beginPath();
  ctx.moveTo(gaugeX + 4, ty);
  ctx.lineTo(gaugeX + 16, ty);
  ctx.stroke();
}
ctx.restore();

// Fuel % Label
ctx.font = '900 24px sans-serif';
ctx.textAlign = 'center';
ctx.fillStyle = '#ffffff';
ctx.fillText(`${Math.floor(room.state.fuel)}%`, gaugeX + gaugeW * 0.5, gaugeY + gaugeH + 34);
ctx.font = '700 14px sans-serif';
ctx.fillStyle = '#94a3b8';
ctx.fillText('FUEL TANK', gaugeX + gaugeW * 0.5, gaugeY - 12);

// 2. PRESSURE DIAL / THERMAL OVERHEAT GAUGE
const dialX = W * 0.78;
const dialY = H * 0.36;
const dialR = 64;

ctx.save();
ctx.translate(dialX, dialY);

// Dial Plate
ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
ctx.beginPath();
ctx.arc(0, 0, dialR, 0, Math.PI * 2);
ctx.fill();
ctx.lineWidth = 5;
const isOverheating = room.state.overheatedTimer > 0 || room.state.pressure > 85;
ctx.strokeStyle = isOverheating ? (Math.sin(frame.t * 20) > 0 ? '#ef4444' : '#ffffff') : '#475569';
ctx.stroke();

// Danger Arc (80-100%)
ctx.beginPath();
ctx.arc(0, 0, dialR - 10, -Math.PI * 0.75 + Math.PI * 1.5 * 0.8, Math.PI * 0.75);
ctx.lineWidth = 8;
ctx.strokeStyle = '#ef4444';
ctx.stroke();

// Safe Arc
ctx.beginPath();
ctx.arc(0, 0, dialR - 10, -Math.PI * 0.75, -Math.PI * 0.75 + Math.PI * 1.5 * 0.8);
ctx.strokeStyle = '#22c55e';
ctx.stroke();

// Needle
const pNorm = Math.min(1.0, room.state.pressure / 100);
const needleAngle = -Math.PI * 0.75 + pNorm * (Math.PI * 1.5) + (Math.random() - 0.5) * (audio.level * 0.15);
ctx.rotate(needleAngle);
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.moveTo(0, -dialR + 14);
ctx.lineTo(6, 0);
ctx.lineTo(-6, 0);
ctx.closePath();
ctx.fill();
ctx.beginPath();
ctx.arc(0, 0, 8, 0, Math.PI * 2);
ctx.fillStyle = '#ef4444';
ctx.fill();

ctx.restore();

// Dial Label
ctx.font = '700 14px sans-serif';
ctx.textAlign = 'center';
ctx.fillStyle = isOverheating ? '#ef4444' : '#94a3b8';
ctx.fillText(isOverheating ? 'OVERHEAT!' : 'PRESSURE', dialX, dialY + dialR + 24);
ctx.font = '900 18px sans-serif';
ctx.fillText(`${Math.round(room.state.pressure)} PSI`, dialX, dialY + dialR + 46);

// Conduit Fuel Surges from Player Consoles to Rocket
for (let i = room.state.conduits.length - 1; i >= 0; i--) {
  const c = room.state.conduits[i];
  c.t += dt / c.life;
  if (c.t >= 1) {
    room.state.conduits.splice(i, 1);
    continue;
  }
  const startX = W * 0.1 + ((c.hue * 13) % (W * 0.8));
  const startY = H * 0.94;
  const targetX = rx;
  const targetY = rocketBaseY - 40;
  const curX = startX + (targetX - startX) * c.t;
  const curY = startY + (targetY - startY) * c.t - Math.sin(c.t * Math.PI) * 120;

  ctx.save();
  ctx.fillStyle = `hsl(${c.hue}, 100%, 65%)`;
  ctx.shadowColor = `hsl(${c.hue}, 100%, 50%)`;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(curX, curY, 9 * (1 - c.t * 0.4), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ----------------- MISSION STATUS LABELS (BIG & VISIBLE) -----------------
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

if (room.state.phase === 'fueling') {
  if (room.state.overheatedTimer > 0) {
    ctx.fillStyle = '#ef4444';
    ctx.font = '900 64px sans-serif';
    ctx.shadowColor = '#dc2626';
    ctx.shadowBlur = 24;
    ctx.fillText('VENTING PRESSURE!', W * 0.5, H * 0.11);
    ctx.font = '700 24px sans-serif';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('HOLD PUMPS - SYSTEM RECOOLING', W * 0.5, H * 0.17);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 58px sans-serif';
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 18;
    ctx.fillText('PUMP FUEL TOGETHER', W * 0.5, H * 0.11);
    ctx.font = '700 22px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`PUMP IN UNISON - WATCH PRESSURE (VALVE: ${hazard.toUpperCase()})`, W * 0.5, H * 0.165);
  }
} else if (room.state.phase === 'ready') {
  const flash = Math.sin(frame.t * 12) > 0;
  ctx.fillStyle = flash ? '#22c55e' : '#ffffff';
  ctx.font = '900 76px sans-serif';
  ctx.shadowColor = '#15803d';
  ctx.shadowBlur = 28;
  ctx.fillText('TANK FULL! HIT LAUNCH KEY!', W * 0.5, H * 0.11);
  ctx.font = '700 24px sans-serif';
  ctx.fillStyle = '#86efac';
  ctx.fillText('COMMANDER HAS THE IGNITION TRIGGER', W * 0.5, H * 0.17);
} else if (room.state.phase === 'countdown') {
  const countVal = Math.max(1, Math.ceil(room.state.timer));
  ctx.fillStyle = '#f59e0b';
  ctx.font = '900 110px sans-serif';
  ctx.shadowColor = '#b45309';
  ctx.shadowBlur = 32;
  ctx.fillText(`T - ${countVal}`, W * 0.5, H * 0.11);
  ctx.font = '800 26px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('CLEAR THE PAD!', W * 0.5, H * 0.18);
} else if (room.state.phase === 'liftoff') {
  ctx.fillStyle = '#ffedd5';
  ctx.font = '900 84px sans-serif';
  ctx.shadowColor = '#ff4500';
  ctx.shadowBlur = 35;
  ctx.fillText('LIFT-OFF!', W * 0.5, H * 0.11);
} else if (room.state.phase === 'celebrate') {
  ctx.fillStyle = `hsl(${room.state.mvpHue}, 100%, 65%)`;
  ctx.font = '900 68px sans-serif';
  ctx.shadowColor = `hsl(${room.state.mvpHue}, 100%, 50%)`;
  ctx.shadowBlur = 30;
  ctx.fillText(`ROUND ${room.state.round} SUCCESS!`, W * 0.5, H * 0.10);
  ctx.font = '800 38px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`TOP OPERATOR: ${room.state.mvpName}`, W * 0.5, H * 0.16);
}
ctx.restore();

// ----------------- MISSION CONTROL CONSOLE RACK (BOTTOM) -----------------
const rackH = 68;
const rackY = H - rackH;
ctx.fillStyle = '#0b1120';
ctx.fillRect(0, rackY, W, rackH);
ctx.strokeStyle = '#1e293b';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(0, rackY);
ctx.lineTo(W, rackY);
ctx.stroke();

// Render Seats / Player Stations
const numCadets = room.people.length > 0 ? room.people.length : 8;
const stationW = Math.min(100, (W - 40) / numCadets);
const startStationX = (W - (stationW * numCadets)) * 0.5;

for (let i = 0; i < numCadets; i++) {
  const p = room.people[i];
  const cueHue = p ? p.hue : (i * (360 / numCadets));
  const sx = startStationX + i * stationW + stationW * 0.5;
  const sy = rackY + 34;

  // Seat LED Terminal
  ctx.save();
  ctx.translate(sx, sy);
  const score = p ? (room.state.playerScores[p.id] || 0) : 0;
  const isMVP = p && p.id === room.state.mvpId && score > 0;

  ctx.fillStyle = `hsl(${cueHue}, 80%, 30%)`;
  ctx.beginPath();
  ctx.arc(0, -2, 16, 0, Math.PI * 2);
  ctx.fill();

  // Screen / Button on desk
  ctx.fillStyle = `hsl(${cueHue}, 100%, 60%)`;
  ctx.shadowColor = `hsl(${cueHue}, 100%, 50%)`;
  ctx.shadowBlur = isMVP ? 14 : 6;
  ctx.beginPath();
  ctx.arc(0, -2, isMVP ? 11 : 8, 0, Math.PI * 2);
  ctx.fill();

  if (stationW > 45) {
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.shadowBlur = 0;
    ctx.fillText(p ? (p.table ? `T${p.table}` : `${score}`) : `C${i + 1}`, 0, 22);
  }
  ctx.restore();
}

ctx.restore();