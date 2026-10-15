ctx.save();

// 1. Persistent state setup
room.state.enemies ??= [];
room.state.shots ??= [];
room.state.particles ??= [];
room.state.scores ??= {};
room.state.lastSpawn ??= 0;
room.state.shieldHp ??= 100;
room.state.shake ??= 0;
room.state.floatingText ??= [];

const w = frame.width;
const h = frame.height;
const sidebarW = Math.min(220, Math.max(160, Math.floor(w * 0.22)));
const playW = w - sidebarW;
const baseY = h - 36;

// Variable reads
const enemyStyle = getVar('enemy_style') ?? 'geometric';
const turretMode = getVar('turret_mode') ?? 'laser beams';
const densityMode = getVar('difficulty') ?? 'intense';
const speedMult = getVar('wave_speed') ?? 1.0;
const glowPower = getVar('grid_glow') ?? 0.6;

const densityIntervals = { steady: 1.6, intense: 1.0, overdrive: 0.55 };
const spawnInterval = (densityIntervals[densityMode] ?? 1.0) / Math.max(0.6, speedMult);

// Screen shake on heavy impacts
if (room.state.shake > 0.05) {
  const sx = (Math.random() - 0.5) * room.state.shake * 12;
  const sy = (Math.random() - 0.5) * room.state.shake * 12;
  ctx.translate(sx, sy);
  room.state.shake = Math.max(0, room.state.shake - frame.dt * 4);
}

// Backdrop with subtle fade trails
ctx.fillStyle = '#060812';
ctx.fillRect(0, 0, w, h);

// Background vector grid in play area
ctx.save();
ctx.strokeStyle = `rgba(30, 60, 110, ${0.25 * glowPower})`;
ctx.lineWidth = 1;
const gridSpacing = 40;
const gridOffset = (frame.t * 18 * speedMult) % gridSpacing;
for (let y = gridOffset; y < h; y += gridSpacing) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(playW, y);
  ctx.stroke();
}
for (let x = 0; x < playW; x += gridSpacing) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, h);
  ctx.stroke();
}
ctx.restore();

// 2. Process triggers / incoming fires
const people = room.people || [];
for (const ev of room.events) {
  if (ev.name === 'fire') {
    const person = people.find(p => p.id === ev.participantId);
    const personIndex = person ? people.indexOf(person) : 0;
    const tableKey = ev.table || (person ? person.table : 'Central Grid');
    const hue = person ? person.hue : 180;

    // Derive turret launch position
    const turretSlot = people.length > 0 ? (personIndex + 0.5) / people.length : 0.5;
    const sx = Math.min(playW - 30, Math.max(30, turretSlot * playW));
    const sy = baseY - 6;

    // Choose target enemy (lowest Y in play area)
    let target = null;
    let lowestY = -1;
    for (const e of room.state.enemies) {
      if (e.hp > 0 && e.y > lowestY) {
        lowestY = e.y;
        target = e;
      }
    }

    const tx = target ? target.x : sx + (Math.random() - 0.5) * 60;
    const ty = target ? target.y : 40;
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const projSpeed = turretMode === 'seeking sparks' ? 520 : (turretMode === 'plasma pulses' ? 680 : 850);

    room.state.shots.push({
      x: sx,
      y: sy,
      vx: (dx / len) * projSpeed,
      vy: (dy / len) * projSpeed,
      mode: turretMode,
      hue: hue,
      table: tableKey,
      life: 1.4,
      targetId: target ? target.id : null
    });
    if (room.state.shots.length > 100) room.state.shots.shift();
  } else if (ev.name === 'emp_blast') {
    // EMP damages all visible invaders
    room.state.shake = Math.min(room.state.shake + 1.2, 2.5);
    for (const en of room.state.enemies) {
      en.hp -= 3;
    }
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      room.state.particles.push({
        x: playW * 0.5,
        y: h * 0.4,
        vx: Math.cos(ang) * 320,
        vy: Math.sin(ang) * 320,
        life: 0.9,
        maxLife: 0.9,
        hue: 195,
        size: 4
      });
    }
  }
}

// 3. Audio & periodic enemy spawning
const spawnRateBonus = audio.beat ? 0.3 : 0;
if (frame.t - room.state.lastSpawn > spawnInterval - spawnRateBonus) {
  room.state.lastSpawn = frame.t;
  const maxEnemies = densityMode === 'overdrive' ? 45 : (densityMode === 'intense' ? 30 : 18);
  if (room.state.enemies.length < maxEnemies) {
    const laneX = 30 + Math.random() * (playW - 60);
    const hpVal = Math.random() < 0.25 ? 4 : 2;
    room.state.enemies.push({
      id: Math.random(),
      x: laneX,
      y: -20,
      vy: (28 + Math.random() * 24) * speedMult,
      swayAmp: 15 + Math.random() * 25,
      swayFreq: 1 + Math.random() * 2,
      hp: hpVal,
      maxHp: hpVal,
      radius: hpVal > 2 ? 20 : 13,
      hue: (frame.t * 30 + laneX) % 360,
      style: enemyStyle
    });
  }
}

// 4. Update & Draw Enemies
ctx.save();
for (let i = room.state.enemies.length - 1; i >= 0; i--) {
  const en = room.state.enemies[i];
  en.y += en.vy * frame.dt * (1 + audio.mid * 0.3);
  const currentX = en.x + Math.sin(frame.t * en.swayFreq + en.id * 10) * en.swayAmp;

  // Check breach bottom
  if (en.y >= baseY) {
    room.state.shieldHp = Math.max(0, room.state.shieldHp - en.hp * 3);
    room.state.shake = Math.min(room.state.shake + 0.6, 2.0);
    for (let p = 0; p < 8; p++) {
      room.state.particles.push({
        x: currentX,
        y: baseY,
        vx: (Math.random() - 0.5) * 120,
        vy: -Math.random() * 100,
        life: 0.5,
        maxLife: 0.5,
        hue: 0,
        size: 3
      });
    }
    room.state.enemies.splice(i, 1);
    continue;
  }

  // Check defeated
  if (en.hp <= 0) {
    room.state.enemies.splice(i, 1);
    continue;
  }

  // Draw invader shape
  ctx.save();
  ctx.translate(currentX, en.y);
  const pulse = 1 + Math.sin(frame.t * 6 + en.id) * 0.15 + audio.bass * 0.2;
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = `hsl(${en.hue}, 95%, 65%)`;
  ctx.fillStyle = `hsla(${en.hue}, 95%, 45%, 0.2)`;
  ctx.lineWidth = 2.2;

  if (en.style === 'geometric') {
    ctx.beginPath();
    const sides = en.maxHp > 2 ? 6 : 3;
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2 - Math.PI / 2 + (en.maxHp > 2 ? frame.t : 0);
      const px = Math.cos(ang) * en.radius;
      const py = Math.sin(ang) * en.radius;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (en.style === 'crystalline') {
    ctx.beginPath();
    ctx.moveTo(0, -en.radius * 1.3);
    ctx.lineTo(en.radius, 0);
    ctx.lineTo(0, en.radius * 1.3);
    ctx.lineTo(-en.radius, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, en.radius * 0.35, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Biomorphic
    ctx.beginPath();
    ctx.arc(0, 0, en.radius, 0, Math.PI, true);
    ctx.lineTo(en.radius * 0.6, en.radius * 0.8);
    ctx.lineTo(0, en.radius * 0.3);
    ctx.lineTo(-en.radius * 0.6, en.radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Health pip indicators
  if (en.maxHp > 1) {
    for (let hIndex = 0; hIndex < en.hp; hIndex++) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-en.radius + hIndex * 8, -en.radius - 8, 5, 3);
    }
  }
  ctx.restore();
}
ctx.restore();

// 5. Update & Draw Projectiles
ctx.save();
for (let i = room.state.shots.length - 1; i >= 0; i--) {
  const s = room.state.shots[i];
  s.life -= frame.dt;

  // Seeking behaviour if sparks
  if (s.mode === 'seeking sparks' && s.targetId) {
    const tEn = room.state.enemies.find(e => e.id === s.targetId);
    if (tEn) {
      const dx = tEn.x - s.x;
      const dy = tEn.y - s.y;
      const len = Math.hypot(dx, dy) || 1;
      s.vx = s.vx * 0.92 + (dx / len) * 480 * 0.08;
      s.vy = s.vy * 0.92 + (dy / len) * 480 * 0.08;
    }
  }

  s.x += s.vx * frame.dt;
  s.y += s.vy * frame.dt;

  // Collision check vs enemies
  let hit = false;
  for (let j = room.state.enemies.length - 1; j >= 0; j--) {
    const en = room.state.enemies[j];
    const dist = Math.hypot(s.x - en.x, s.y - en.y);
    if (dist < en.radius + 8) {
      en.hp -= 1;
      hit = true;

      // Credit score to table
      const pts = en.hp <= 0 ? (en.maxHp > 2 ? 150 : 60) : 25;
      room.state.scores[s.table] = (room.state.scores[s.table] || 0) + pts;

      // Score popups
      room.state.floatingText.push({
        text: `+${pts}`,
        x: s.x,
        y: s.y,
        life: 0.8,
        hue: s.hue
      });
      if (room.state.floatingText.length > 25) room.state.floatingText.shift();

      // Spark particles
      const pCount = en.hp <= 0 ? 16 : 6;
      for (let p = 0; p < pCount; p++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 220;
        room.state.particles.push({
          x: s.x,
          y: s.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.6,
          maxLife: 0.6,
          hue: s.hue,
          size: en.hp <= 0 ? 3.5 : 2.0
        });
      }
      break;
    }
  }

  if (hit || s.life <= 0 || s.y < 0 || s.x < 0 || s.x > playW) {
    room.state.shots.splice(i, 1);
    continue;
  }

  // Render Projectile
  ctx.strokeStyle = `hsl(${s.hue}, 100%, 75%)`;
  ctx.fillStyle = `hsl(${s.hue}, 100%, 65%)`;
  ctx.shadowColor = `hsl(${s.hue}, 100%, 65%)`;
  ctx.shadowBlur = 12 * glowPower;

  if (s.mode === 'laser beams') {
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04);
    ctx.stroke();
  } else if (s.mode === 'plasma pulses') {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5 + audio.bass * 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Seeking sparks
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + (Math.random() - 0.5) * 10, s.y + (Math.random() - 0.5) * 10);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}
ctx.restore();

// 6. Particles update & render
ctx.save();
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.life -= frame.dt;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  p.vx *= 0.94;
  p.vy *= 0.94;
  const alpha = p.life / p.maxLife;
  ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
  ctx.fill();
}
if (room.state.particles.length > 180) {
  room.state.particles.splice(0, room.state.particles.length - 180);
}
ctx.restore();

// Floating score indicators
ctx.save();
ctx.font = 'bold 13px monospace';
ctx.textAlign = 'center';
for (let i = room.state.floatingText.length - 1; i >= 0; i--) {
  const ft = room.state.floatingText[i];
  ft.life -= frame.dt;
  ft.y -= 35 * frame.dt;
  if (ft.life <= 0) {
    room.state.floatingText.splice(i, 1);
    continue;
  }
  ctx.fillStyle = `hsla(${ft.hue}, 100%, 80%, ${ft.life / 0.8})`;
  ctx.fillText(ft.text, ft.x, ft.y);
}
ctx.restore();

// 7. Base Defense Wall & Turret nodes
ctx.save();
// Wall glow
const wallGlow = (0.4 + audio.bass * 0.4) * glowPower;
ctx.strokeStyle = `rgba(80, 200, 255, ${wallGlow})`;
ctx.lineWidth = 4;
ctx.beginPath();
ctx.moveTo(0, baseY);
ctx.lineTo(playW, baseY);
ctx.stroke();

// Ground decorative grid strip
ctx.fillStyle = 'rgba(10, 25, 45, 0.8)';
ctx.fillRect(0, baseY, playW, h - baseY);

// Render turrets for current room members or default 3 if solo
const turretCount = Math.max(3, people.length);
for (let i = 0; i < turretCount; i++) {
  const person = people[i] || null;
  const hue = person ? person.hue : ((i * 120) % 360);
  const tx = ((i + 0.5) / turretCount) * playW;
  const ty = baseY;

  // Base pedestal
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = `hsl(${hue}, 90%, 65%)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tx, ty, 14, Math.PI, 0);
  ctx.fill();
  ctx.stroke();

  // Rotating energy emitter
  const aimAngle = -Math.PI / 2 + Math.sin(frame.t * 2 + i) * 0.4;
  ctx.beginPath();
  ctx.moveTo(tx, ty - 6);
  ctx.lineTo(tx + Math.cos(aimAngle) * 16, ty - 6 + Math.sin(aimAngle) * 16);
  ctx.stroke();
}
ctx.restore();

// 8. Right Sidebar: Co-op Table Leaderboard & Shield Gauge
ctx.save();
// Sidebar panel background
ctx.fillStyle = 'rgba(8, 12, 22, 0.95)';
ctx.fillRect(playW, 0, sidebarW, h);
ctx.strokeStyle = 'rgba(50, 100, 160, 0.6)';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(playW, 0);
ctx.lineTo(playW, h);
ctx.stroke();

// Header
ctx.textAlign = 'left';
ctx.fillStyle = '#67e8f9';
ctx.font = 'bold 14px monospace';
ctx.fillText('VECTOR BASTION', playW + 14, 28);
ctx.fillStyle = '#94a3b8';
ctx.font = '10px monospace';
ctx.fillText('TABLE DEFENSE OPS', playW + 14, 44);

// Divider line
ctx.strokeStyle = 'rgba(100, 140, 200, 0.3)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(playW + 12, 54);
ctx.lineTo(w - 12, 54);
ctx.stroke();

// Table Leaderboard list
const scoreEntries = Object.entries(room.state.scores).sort((a, b) => b[1] - a[1]);
ctx.font = '11px monospace';
let rowY = 78;

if (scoreEntries.length === 0) {
  ctx.fillStyle = '#64748b';
  ctx.fillText('TAP [FIRE] TO', playW + 14, rowY);
  ctx.fillText('ENGAGE TARGETS', playW + 14, rowY + 16);
} else {
  scoreEntries.slice(0, 8).forEach(([tableName, score], rank) => {
    // Match table hue if available from participants
    const member = people.find(p => p.table === tableName);
    const tHue = member ? member.hue : (rank * 65 + 180) % 360;

    // Rank badge
    ctx.fillStyle = `hsl(${tHue}, 90%, 65%)`;
    ctx.fillText(`${rank + 1}.`, playW + 12, rowY);

    // Name (truncated)
    ctx.fillStyle = '#f1f5f9';
    const nameStr = tableName.length > 9 ? tableName.substring(0, 8) + '…' : tableName;
    ctx.fillText(nameStr, playW + 30, rowY);

    // Score
    ctx.textAlign = 'right';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${score}`, w - 14, rowY);
    ctx.textAlign = 'left';

    rowY += 24;
  });
}

// Total Defense Shield Integrity at bottom of sidebar
const shieldY = h - 68;
ctx.fillStyle = '#94a3b8';
ctx.font = '10px monospace';
ctx.fillText('BASTION SHIELD', playW + 14, shieldY);

// Shield bar container
const barW = sidebarW - 28;
const barH = 14;
ctx.fillStyle = '#0f172a';
ctx.fillRect(playW + 14, shieldY + 8, barW, barH);

// Fill percentage
const pct = Math.max(0, Math.min(100, room.state.shieldHp)) / 100;
const barHue = pct > 0.4 ? 180 : (pct > 0.2 ? 40 : 0);
ctx.fillStyle = `hsl(${barHue}, 90%, 55%)`;
ctx.fillRect(playW + 14, shieldY + 8, barW * pct, barH);

// Shield text
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 9px monospace';
ctx.textAlign = 'center';
ctx.fillText(`${Math.round(room.state.shieldHp)}%`, playW + 14 + barW / 2, shieldY + 19);

// Slow shield regen
if (room.state.shieldHp < 100) {
  room.state.shieldHp = Math.min(100, room.state.shieldHp + frame.dt * 1.5);
}

ctx.restore();
ctx.restore();