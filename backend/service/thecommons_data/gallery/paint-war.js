ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.05);

// ---- CONTROLS & PALETTES ----
const themeKey = getVar('arena_theme') ?? 'White Plaza';
const palKey = getVar('team_palette') ?? 'Cyan vs Magenta';
const styleKey = getVar('bomb_style') ?? 'Juicy Splat';
const baseRadius = getVar('splat_size') ?? 90;

const PALETTES = {
  'Cyan vs Magenta': {
    t0: { name: 'CYAN', main: '#00e5ff', dark: '#0097a7', light: '#84ffff', glow: 'rgba(0, 229, 255, 0.45)' },
    t1: { name: 'MAGENTA', main: '#ff007f', dark: '#c51162', light: '#ff80ab', glow: 'rgba(255, 0, 127, 0.45)' }
  },
  'Lime vs Violet': {
    t0: { name: 'LIME', main: '#76ff03', dark: '#52b202', light: '#b2ff59', glow: 'rgba(118, 255, 3, 0.45)' },
    t1: { name: 'VIOLET', main: '#9d00ff', dark: '#6200ea', light: '#d500f9', glow: 'rgba(157, 0, 255, 0.45)' }
  },
  'Tangerine vs Azure': {
    t0: { name: 'SUN', main: '#ff9100', dark: '#e65100', light: '#ffd180', glow: 'rgba(255, 145, 0, 0.45)' },
    t1: { name: 'AZURE', main: '#2979ff', dark: '#1565c0', light: '#82b1ff', glow: 'rgba(41, 121, 255, 0.45)' }
  }
};
const activePal = PALETTES[palKey] ?? PALETTES['Cyan vs Magenta'];

// Arena bounds
const arenaX = 40;
const arenaY = 90;
const arenaW = W - 80;
const arenaH = H - 160;

// ---- STATE INITIALIZATION ----
room.state.init ??= true;
room.state.splats ??= [];
room.state.particles ??= [];
room.state.rockets ??= [];
room.state.roundStart ??= t;
room.state.roundState ??= 'playing'; // 'playing' | 'ended'
room.state.lastInputTime ??= t;
room.state.nextAttract ??= t + 1.8;
room.state.autoTeam ??= 0;
room.state.gridCols = 32;
room.state.gridRows = 20;
room.state.grid ??= new Int8Array(room.state.gridCols * room.state.gridRows).fill(-1);

// Helper to get team for participant
function getParticipantTeam(pId) {
  const people = room.people || [];
  if (!people.length) return 0;
  const idx = people.findIndex(p => p.id === pId);
  if (idx < 0) return 0;
  // Check if multiple tables exist
  const tables = [...new Set(people.map(p => p.table))];
  if (tables.length > 1) {
    const tableIdx = tables.indexOf(people[idx].table);
    return (tableIdx >= 0 ? tableIdx : 0) % 2;
  }
  return idx % 2;
}

// Grid territory updater
function updateGrid(cx, cy, r, team) {
  const gw = arenaW / room.state.gridCols;
  const gh = arenaH / room.state.gridRows;
  const r2 = r * r;
  for (let gy = 0; gy < room.state.gridRows; gy++) {
    const y = arenaY + (gy + 0.5) * gh;
    const dy = y - cy;
    if (Math.abs(dy) > r) continue;
    for (let gx = 0; gx < room.state.gridCols; gx++) {
      const x = arenaX + (gx + 0.5) * gw;
      const dx = x - cx;
      if (dx * dx + dy * dy <= r2) {
        room.state.grid[gy * room.state.gridCols + gx] = team;
      }
    }
  }
}

// Spawn a bomb impact
function spawnSplat(team, x, y, playerHue) {
  const rad = baseRadius * (0.85 + Math.random() * 0.35 + audio.bass * 0.4);
  const splat = {
    x, y, team,
    targetR: rad,
    r: 10,
    hue: playerHue,
    dots: []
  };
  // Satellite droplets
  const dotCount = styleKey === 'Paint Drops' ? 14 : 8;
  for (let i = 0; i < dotCount; i++) {
    const ang = (Math.PI * 2 * i) / dotCount + (Math.random() - 0.5) * 0.6;
    const dist = rad * (0.8 + Math.random() * 0.6);
    splat.dots.push({
      dx: Math.cos(ang) * dist,
      dy: Math.sin(ang) * dist,
      r: (rad * 0.12) * (0.5 + Math.random() * 0.9)
    });
  }
  room.state.splats.push(splat);
  if (room.state.splats.length > 140) room.state.splats.shift();
  updateGrid(x, y, rad * 0.9, team);

  // Burst particles
  const pCount = styleKey === 'Shockwave Blast' ? 24 : 14;
  for (let i = 0; i < pCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 120 + Math.random() * 260 + audio.bass * 200;
    room.state.particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 0.8,
      team,
      size: 4 + Math.random() * 7
    });
  }
  if (room.state.particles.length > 180) room.state.particles.splice(0, room.state.particles.length - 180);
}

// ---- HANDLE EVENTS & ATTRACT MODE ----
let hasEvents = false;
if (room.events && room.events.length) {
  for (const ev of room.events) {
    if (ev.name === 'splat') {
      hasEvents = true;
      room.state.lastInputTime = t;
      const team = getParticipantTeam(ev.participantId);
      const p = (room.people || []).find(person => person.id === ev.participantId);
      const pHue = p ? p.hue : (team === 0 ? 190 : 330);

      // Spawn incoming rocket from arena side
      const startX = team === 0 ? arenaX + 20 : arenaX + arenaW - 20;
      const startY = arenaY + 30 + Math.random() * (arenaH - 60);
      const targetX = arenaX + 50 + Math.random() * (arenaW - 100);
      const targetY = arenaY + 40 + Math.random() * (arenaH - 80);
      room.state.rockets.push({
        sx: startX, sy: startY,
        tx: targetX, ty: targetY,
        x: startX, y: startY,
        team, hue: pHue,
        progress: 0,
        speed: 3.2
      });
    }
  }
}

// Attract mode if idle
if (t - room.state.lastInputTime > 3.0 && t > room.state.nextAttract && room.state.roundState === 'playing') {
  room.state.nextAttract = t + 0.85 + Math.random() * 0.7;
  const team = room.state.autoTeam;
  room.state.autoTeam = (room.state.autoTeam + 1) % 2;
  const startX = team === 0 ? arenaX + 10 : arenaX + arenaW - 10;
  const startY = arenaY + 40 + Math.random() * (arenaH - 80);
  const targetX = arenaX + 60 + Math.random() * (arenaW - 120);
  const targetY = arenaY + 40 + Math.random() * (arenaH - 80);
  room.state.rockets.push({
    sx: startX, sy: startY,
    tx: targetX, ty: targetY,
    x: startX, y: startY,
    team, hue: team === 0 ? 190 : 330,
    progress: 0,
    speed: 3.0
  });
}

// ---- ROUND TIMER & RESET ----
const ROUND_DURATION = 60;
const roundElapsed = t - room.state.roundStart;
const timeLeft = Math.max(0, ROUND_DURATION - roundElapsed);

if (roundElapsed >= ROUND_DURATION && room.state.roundState === 'playing') {
  room.state.roundState = 'ended';
  room.state.endedAt = t;
}

if (room.state.roundState === 'ended' && t - room.state.endedAt > 6.0) {
  // Reset game
  room.state.roundStart = t;
  room.state.roundState = 'playing';
  room.state.splats = [];
  room.state.rockets = [];
  room.state.particles = [];
  room.state.grid.fill(-1);
}

// Calculate territory percentages
let t0Count = 0;
let t1Count = 0;
const totalCells = room.state.gridCols * room.state.gridRows;
for (let i = 0; i < totalCells; i++) {
  if (room.state.grid[i] === 0) t0Count++;
  else if (room.state.grid[i] === 1) t1Count++;
}
const claimed = t0Count + t1Count;
const pct0 = claimed > 0 ? (t0Count / claimed) : 0.5;
const pct1 = 1 - pct0;
const winnerTeam = t0Count >= t1Count ? 0 : 1;

// ---- DRAWING ----

// 1. Dark outer stadium floor
ctx.fillStyle = '#0a0d14';
ctx.fillRect(0, 0, W, H);

// 2. Arena Plaza Base
ctx.save();
if (themeKey === 'White Plaza') {
  ctx.fillStyle = '#eef1f6';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 24;
  ctx.fillRect(arenaX, arenaY, arenaW, arenaH);
  ctx.shadowBlur = 0;
  // Elegant plaza stone grid
  ctx.strokeStyle = 'rgba(180, 190, 205, 0.45)';
  ctx.lineWidth = 1;
  const step = 40;
  ctx.beginPath();
  for (let x = arenaX; x <= arenaX + arenaW; x += step) {
    ctx.moveTo(x, arenaY); ctx.lineTo(x, arenaY + arenaH);
  }
  for (let y = arenaY; y <= arenaY + arenaH; y += step) {
    ctx.moveTo(arenaX, y); ctx.lineTo(arenaX + arenaW, y);
  }
  ctx.stroke();
} else if (themeKey === 'Neon Night') {
  ctx.fillStyle = '#111622';
  ctx.fillRect(arenaX, arenaY, arenaW, arenaH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(arenaX, arenaY, arenaW, arenaH);
} else {
  // Cyber Grid
  ctx.fillStyle = '#080c18';
  ctx.fillRect(arenaX, arenaY, arenaW, arenaH);
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
  ctx.lineWidth = 1;
  for (let x = arenaX; x <= arenaX + arenaW; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, arenaY); ctx.lineTo(x, arenaY + arenaH); ctx.stroke();
  }
  for (let y = arenaY; y <= arenaY + arenaH; y += 50) {
    ctx.beginPath(); ctx.moveTo(arenaX, y); ctx.lineTo(arenaX + arenaW, y); ctx.stroke();
  }
}
ctx.restore();

// 3. Paint Splats (clipped to arena)
ctx.save();
ctx.beginPath();
ctx.rect(arenaX, arenaY, arenaW, arenaH);
ctx.clip();

for (let i = 0; i < room.state.splats.length; i++) {
  const sp = room.state.splats[i];
  if (sp.r < sp.targetR) {
    sp.r += (sp.targetR - sp.r) * 12 * dt;
  }
  const colObj = sp.team === 0 ? activePal.t0 : activePal.t1;
  ctx.fillStyle = colObj.main;

  // Main puddle
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
  ctx.fill();

  // Satellite blobs
  for (let j = 0; j < sp.dots.length; j++) {
    const d = sp.dots[j];
    ctx.beginPath();
    ctx.arc(sp.x + d.dx * (sp.r / sp.targetR), sp.y + d.dy * (sp.r / sp.targetR), d.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Glossy highlight arc
  ctx.fillStyle = colObj.light;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(sp.x - sp.r * 0.25, sp.y - sp.r * 0.25, sp.r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1.0;
}

// 4. Update & Draw Particles
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= 0.94;
  p.vy *= 0.94;
  p.life -= dt;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  const alpha = Math.max(0, p.life / p.maxLife);
  const c = p.team === 0 ? activePal.t0 : activePal.t1;
  ctx.fillStyle = c.main;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
  ctx.fill();
}
ctx.globalAlpha = 1.0;

// 5. Update & Draw In-Flight Rockets
for (let i = room.state.rockets.length - 1; i >= 0; i--) {
  const r = room.state.rockets[i];
  r.progress += r.speed * dt;
  if (r.progress >= 1.0) {
    spawnSplat(r.team, r.tx, r.ty, r.hue);
    room.state.rockets.splice(i, 1);
    continue;
  }
  // Arc height
  const p = r.progress;
  r.x = r.sx + (r.tx - r.sx) * p;
  r.y = r.sy + (r.ty - r.sy) * p - Math.sin(p * Math.PI) * 70;

  // Draw rocket/bomb
  const c = r.team === 0 ? activePal.t0 : activePal.t1;
  ctx.fillStyle = c.main;
  ctx.shadowColor = c.main;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(r.x, r.y, 11 + Math.sin(t * 20) * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Smoke trail
  ctx.fillStyle = c.light;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(r.x - (r.tx - r.sx) * 0.05, r.y + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1.0;
}

ctx.restore(); // arena clip

// 6. Arena Perimeter Border with audio glow
ctx.save();
ctx.lineWidth = 4 + audio.bass * 4;
ctx.strokeStyle = '#22293a';
ctx.strokeRect(arenaX, arenaY, arenaW, arenaH);
ctx.restore();

// 7. Players Bench / Avatars
const people = room.people || [];
const pCount = people.length;
const seatY = H - 42;
if (pCount > 0) {
  const stepX = Math.min(54, (W - 120) / pCount);
  const startPX = (W - (pCount - 1) * stepX) / 2;
  for (let i = 0; i < pCount; i++) {
    const p = people[i];
    const px = startPX + i * stepX;
    const team = getParticipantTeam(p.id);
    const teamCol = team === 0 ? activePal.t0.main : activePal.t1.main;

    // Team color ring
    ctx.lineWidth = 3;
    ctx.strokeStyle = teamCol;
    ctx.beginPath();
    ctx.arc(px, seatY, 16 + (audio.beat ? 2 : 0), 0, Math.PI * 2);
    ctx.stroke();

    // Personal hue avatar
    ctx.fillStyle = `hsl(${p.hue}, 85%, 55%)`;
    ctx.beginPath();
    ctx.arc(px, seatY, 12, 0, Math.PI * 2);
    ctx.fill();

    // Table tag
    ctx.fillStyle = '#8f9ba8';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((p.table || '').replace('table-', 'T'), px, seatY + 28);
  }
} else {
  ctx.fillStyle = '#4e5d6c';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PRESS SPLAT TO JOIN TEAM', W / 2, seatY + 4);
}

// 8. TOP SCORE BAR & TIMER (Tug-of-War)
const barH = 34;
const barY = 22;
const barW = arenaW;
const barX = arenaX;
const splitX = barX + barW * pct0;

ctx.save();
// Team 0 Bar
ctx.fillStyle = activePal.t0.main;
ctx.shadowColor = activePal.t0.main;
ctx.shadowBlur = 10;
ctx.beginPath();
ctx.rect(barX, barY, Math.max(8, barW * pct0), barH);
ctx.fill();

// Team 1 Bar
ctx.fillStyle = activePal.t1.main;
ctx.shadowColor = activePal.t1.main;
ctx.beginPath();
ctx.rect(splitX, barY, Math.max(8, barW * pct1), barH);
ctx.fill();
ctx.shadowBlur = 0;

// Tug divider pulse
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.rect(splitX - 3, barY - 4, 6, barH + 8);
ctx.fill();

// Bar Text Labels
ctx.fillStyle = '#05070a';
ctx.font = '900 18px sans-serif';
ctx.textAlign = 'left';
ctx.fillText(`${activePal.t0.name} ${Math.round(pct0 * 100)}%`, barX + 16, barY + 24);
ctx.textAlign = 'right';
ctx.fillText(`${Math.round(pct1 * 100)}% ${activePal.t1.name}`, barX + barW - 16, barY + 24);

// Floating Clock / Round Status
const clockW = 100;
const clockH = 36;
const clockX = W / 2 - clockW / 2;
const clockY = barY - 6;
ctx.fillStyle = '#0e121c';
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.roundRect ? ctx.roundRect(clockX, clockY, clockW, clockH, 8) : ctx.rect(clockX, clockY, clockW, clockH);
ctx.fill();
ctx.stroke();

ctx.fillStyle = timeLeft <= 10 && room.state.roundState === 'playing' ? '#ff3b30' : '#ffffff';
ctx.font = '900 20px monospace';
ctx.textAlign = 'center';
const secs = Math.ceil(timeLeft);
const timeStr = room.state.roundState === 'playing' ? `${secs}s` : 'OVER';
ctx.fillText(timeStr, W / 2, clockY + 25 + (audio.bass * 2));
ctx.restore();

// 9. GAME OVER / WINNER OVERLAY
if (room.state.roundState === 'ended') {
  const endElapsed = t - room.state.endedAt;
  const floodProgress = Math.min(1.0, endElapsed / 1.5);
  const winCol = winnerTeam === 0 ? activePal.t0 : activePal.t1;

  // Screen flood
  ctx.save();
  ctx.fillStyle = winCol.main;
  ctx.globalAlpha = floodProgress * 0.94;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1.0;

  // Winner Big Announcement
  const bounce = Math.sin(Math.min(Math.PI / 2, endElapsed * 3)) * (1 + audio.bass * 0.15);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(bounce, bounce);
  
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${winCol.name} WINS!`, 0, -30);

  ctx.font = '900 32px sans-serif';
  ctx.fillStyle = '#0b0e14';
  const finalScore = winnerTeam === 0 ? Math.round(pct0 * 100) : Math.round(pct1 * 100);
  ctx.fillText(`TERRITORY CONTROL: ${finalScore}%`, 0, 48);
  
  const nextIn = Math.max(1, Math.ceil(6.0 - endElapsed));
  ctx.font = '700 20px sans-serif';
  ctx.fillText(`NEXT ROUND IN ${nextIn}...`, 0, 95);
  ctx.restore();
  ctx.restore();
}

// 10. Start countdown / GO flare for first 2 seconds
if (roundElapsed < 2.2 && room.state.roundState === 'playing') {
  ctx.save();
  ctx.translate(W / 2, arenaY + arenaH / 2);
  const fade = Math.max(0, 1 - roundElapsed / 2.2);
  const scale = 1 + roundElapsed * 0.6;
  ctx.scale(scale, scale);
  ctx.globalAlpha = fade;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 20;
  ctx.font = '900 90px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAINT WAR: GO!', 0, 0);
  ctx.restore();
}

ctx.restore();