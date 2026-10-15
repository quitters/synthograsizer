ctx.save();
const W = frame.width, H = frame.height;
const now = frame.t;

// --- THEMES & CONFIG ---
const THEMES = {
  neon_cyber:  { t0: '#00f3ff', t1: '#ff0055', bg: '#030712', grid: '#0d223a', t0Name: 'CYAN', t1Name: 'MAGENTA' },
  synthwave:   { t0: '#00ffcc', t1: '#e036fc', bg: '#0b001a', grid: '#240d42', t0Name: 'TEAL', t1Name: 'VAPOR' },
  acid_matrix: { t0: '#39ff14', t1: '#ffea00', bg: '#020d04', grid: '#0f2916', t0Name: 'MATRIX', t1Name: 'ACID' },
  solar_flare: { t0: '#00bfff', t1: '#ff7700', bg: '#080512', grid: '#281a38', t0Name: 'AZURE', t1Name: 'FLARE' }
};
const thKey = getVar('theme');
const theme = THEMES[thKey] || THEMES.neon_cyber;
const gridStyle = getVar('grid_style') || 'retro_wire';
const baseSpeed = getVar('cycle_speed') ?? 25;
const glowMult = (getVar('glow_intensity') ?? 3) * 0.3;
const floorBloom = getVar('floor_bloom') ?? true;

// --- ARENA GRID SETUP (96 x 54 grid cells) ---
const GW = 96, GH = 54;
const cellW = W / GW, cellH = H / GH;
const DIRS = [{x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}];

// --- STATE INITIALIZATION ---
room.state.scores ??= [0, 0];
room.state.grid ??= new Uint8Array(GW * GH);
room.state.phase ??= 'countdown'; // countdown | playing | crash | roundover
room.state.phaseT ??= now;
room.state.lastInputT ??= now;
room.state.winner ??= -1;
room.state.sparks ??= [];
room.state.announcements ??= [];
room.state.cycles ??= [
  { x: 18, y: Math.floor(GH / 2), dir: 0, nextDir: 0, alive: true, team: 0, trail: [] },
  { x: GW - 19, y: Math.floor(GH / 2), dir: 2, nextDir: 2, alive: true, team: 1, trail: [] }
];

function resetRound() {
  room.state.grid.fill(0);
  // Wall boundaries
  for (let x = 0; x < GW; x++) {
    room.state.grid[x] = 3;
    room.state.grid[(GH - 1) * GW + x] = 3;
  }
  for (let y = 0; y < GH; y++) {
    room.state.grid[y * GW] = 3;
    room.state.grid[y * GW + (GW - 1)] = 3;
  }
  const midY = Math.floor(GH / 2);
  room.state.cycles = [
    { x: 18, y: midY, dir: 0, nextDir: 0, alive: true, team: 0, trail: [{x: 18, y: midY}] },
    { x: GW - 19, y: midY, dir: 2, nextDir: 2, alive: true, team: 1, trail: [{x: GW - 19, y: midY}] }
  ];
  room.state.grid[midY * GW + 18] = 1;
  room.state.grid[midY * GW + (GW - 19)] = 2;
  room.state.phase = 'countdown';
  room.state.phaseT = now;
  room.state.winner = -1;
}

if (!room.state.initialized) {
  room.state.initialized = true;
  resetRound();
}

// Determine team for each person
const people = room.people || [];
function getParticipantTeam(pId) {
  if (!people.length) return 0;
  const idx = people.findIndex(p => p.id === pId);
  if (idx < 0) return 0;
  const tables = [...new Set(people.map(p => p.table).filter(Boolean))].sort();
  if (tables.length > 1) {
    const p = people[idx];
    return Math.max(0, tables.indexOf(p.table)) % 2;
  }
  return idx % 2;
}

// --- PROCESS TRIGGER EVENTS ---
for (const e of room.events || []) {
  if (e.name === 'turn_left' || e.name === 'turn_right') {
    room.state.lastInputT = now;
    const team = getParticipantTeam(e.participantId);
    const cycle = room.state.cycles[team];
    if (cycle && cycle.alive && room.state.phase === 'playing') {
      const turnOffset = e.name === 'turn_left' ? 3 : 1;
      const targetDir = (cycle.dir + turnOffset) % 4;
      // Prevent 180 reverse
      if ((targetDir + 2) % 4 !== cycle.dir) {
        cycle.nextDir = targetDir;
      }
    }
    const person = people.find(p => p.id === e.participantId);
    const pColor = person ? `hsl(${person.hue}, 90%, 65%)` : (team === 0 ? theme.t0 : theme.t1);
    room.state.announcements.push({
      text: `${team === 0 ? theme.t0Name : theme.t1Name} ${e.name === 'turn_left' ? '◄ LEFT' : 'RIGHT ►'}`,
      color: pColor,
      team,
      t: now
    });
    if (room.state.announcements.length > 8) room.state.announcements.shift();
  }
}

// --- AUTOPILOT ATTRACT MODE (if inactive > 4.0s) ---
const attractMode = (now - room.state.lastInputT) > 4.0;
if (attractMode && room.state.phase === 'playing') {
  for (const c of room.state.cycles) {
    if (!c.alive) continue;
    const curDir = DIRS[c.dir];
    const aheadX = c.x + curDir.x;
    const aheadY = c.y + curDir.y;
    const blocked = aheadX < 0 || aheadX >= GW || aheadY < 0 || aheadY >= GH || room.state.grid[aheadY * GW + aheadX] > 0;
    if (blocked || Math.random() < 0.03) {
      const options = [(c.dir + 1) % 4, (c.dir + 3) % 4];
      const valid = options.filter(d => {
        const tx = c.x + DIRS[d].x;
        const ty = c.y + DIRS[d].y;
        return tx >= 0 && tx < GW && ty >= 0 && ty < GH && room.state.grid[ty * GW + tx] === 0;
      });
      if (valid.length > 0) {
        c.nextDir = valid[Math.floor(Math.random() * valid.length)];
      }
    }
  }
}

// --- GAME LOOP & UPDATES ---
const beatSurge = audio.beat ? 1.25 : 1.0;
const simSpeed = (baseSpeed + (audio.bass || 0) * 8) * beatSurge;

if (room.state.phase === 'countdown') {
  if (now - room.state.phaseT > 1.8) {
    room.state.phase = 'playing';
    room.state.phaseT = now;
  }
} else if (room.state.phase === 'playing') {
  room.state.moveAccum = (room.state.moveAccum || 0) + frame.dt * simSpeed;
  while (room.state.moveAccum >= 1.0) {
    room.state.moveAccum -= 1.0;
    // Step both cycles synchronously
    const crashed = [false, false];
    for (let i = 0; i < 2; i++) {
      const c = room.state.cycles[i];
      if (!c.alive) continue;
      c.dir = c.nextDir;
      const d = DIRS[c.dir];
      const nx = c.x + d.x;
      const ny = c.y + d.y;
      if (nx < 0 || nx >= GW || ny < 0 || ny >= GH || room.state.grid[ny * GW + nx] > 0) {
        crashed[i] = true;
      } else {
        c.x = nx;
        c.y = ny;
        c.trail.push({x: nx, y: ny});
        if (c.trail.length > 500) c.trail.shift();
        room.state.grid[ny * GW + nx] = i + 1;
      }
    }
    // Handle crashes
    if (crashed[0] || crashed[1]) {
      room.state.phase = 'crash';
      room.state.phaseT = now;
      if (crashed[0] && crashed[1]) {
        room.state.winner = 2; // tie
      } else if (crashed[0]) {
        room.state.cycles[0].alive = false;
        room.state.winner = 1;
        room.state.scores[1]++;
      } else {
        room.state.cycles[1].alive = false;
        room.state.winner = 0;
        room.state.scores[0]++;
      }
      // Spawn explosion sparks
      for (let i = 0; i < 2; i++) {
        if (crashed[i]) {
          const c = room.state.cycles[i];
          for (let s = 0; s < 40; s++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 60 + Math.random() * 260;
            room.state.sparks.push({
              x: (c.x + 0.5) * cellW,
              y: (c.y + 0.5) * cellH,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              color: i === 0 ? theme.t0 : theme.t1,
              life: 1.0,
              t: now
            });
          }
        }
      }
      break;
    }
  }
} else if (room.state.phase === 'crash') {
  if (now - room.state.phaseT > 3.0) {
    resetRound();
  }
}

// --- DRAW BACKGROUND & ARENA GRID ---
ctx.fillStyle = theme.bg;
ctx.fillRect(0, 0, W, H);

// Audio-reactive floor pulse
if (floorBloom) {
  const grad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.65);
  const pulseAlpha = 0.08 + (audio.bass || 0) * 0.18;
  grad.addColorStop(0, theme.t0);
  grad.addColorStop(0.5, theme.t1);
  grad.addColorStop(1, 'transparent');
  ctx.globalAlpha = pulseAlpha;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1.0;
}

// Draw Grid Lines
ctx.lineWidth = 1;
ctx.strokeStyle = theme.grid;
ctx.globalAlpha = 0.35 + (audio.level || 0) * 0.3;

if (gridStyle === 'retro_wire') {
  ctx.beginPath();
  for (let x = 0; x <= GW; x += 3) {
    ctx.moveTo(x * cellW, 0);
    ctx.lineTo(x * cellW, H);
  }
  for (let y = 0; y <= GH; y += 3) {
    ctx.moveTo(0, y * cellH);
    ctx.lineTo(W, y * cellH);
  }
  ctx.stroke();
} else if (gridStyle === 'isometric_mesh') {
  ctx.beginPath();
  const step = cellW * 3;
  for (let x = -H; x < W + H; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
  }
  ctx.stroke();
} else {
  // hyper_dots
  ctx.fillStyle = theme.grid;
  for (let x = 2; x < GW; x += 4) {
    for (let y = 2; y < GH; y += 4) {
      ctx.fillRect(x * cellW - 1, y * cellH - 1, 3, 3);
    }
  }
}
ctx.globalAlpha = 1.0;

// Arena boundary glow
ctx.lineWidth = 4;
ctx.strokeStyle = '#ffffff';
ctx.shadowColor = audio.beat ? theme.t1 : theme.t0;
ctx.shadowBlur = 12 * glowMult;
ctx.strokeRect(cellW, cellH, W - cellW * 2, H - cellH * 2);
ctx.shadowBlur = 0;

// --- DRAW SOLID LIGHT WALLS ---
for (let i = 0; i < 2; i++) {
  const c = room.state.cycles[i];
  const col = i === 0 ? theme.t0 : theme.t1;
  if (c.trail.length > 1) {
    ctx.lineWidth = cellW * 0.95;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = (8 + (audio.mid || 0) * 12) * glowMult;
    ctx.beginPath();
    for (let idx = 0; idx < c.trail.length; idx++) {
      const p = c.trail[idx];
      const px = (p.x + 0.5) * cellW;
      const py = (p.y + 0.5) * cellH;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Hot core stroke for neon intensity
    ctx.lineWidth = cellW * 0.35;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Draw Cycle Head
  if (c.alive) {
    const hx = (c.x + 0.5) * cellW;
    const hy = (c.y + 0.5) * cellH;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(c.dir * Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = col;
    ctx.shadowBlur = 18 * glowMult;
    ctx.beginPath();
    ctx.moveTo(cellW * 1.2, 0);
    ctx.lineTo(-cellW * 0.8, -cellH * 0.7);
    ctx.lineTo(-cellW * 0.4, 0);
    ctx.lineTo(-cellW * 0.8, cellH * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// --- DRAW EXPLOSION SPARKS ---
if (room.state.sparks.length > 0) {
  for (let idx = room.state.sparks.length - 1; idx >= 0; idx--) {
    const s = room.state.sparks[idx];
    s.x += s.vx * frame.dt;
    s.y += s.vy * frame.dt;
    s.vx *= 0.94;
    s.vy *= 0.94;
    s.life -= frame.dt * 1.2;
    if (s.life <= 0) {
      room.state.sparks.splice(idx, 1);
      continue;
    }
    ctx.fillStyle = s.color;
    ctx.globalAlpha = Math.max(0, s.life);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3 + s.life * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
}

// --- HUD: TEAM SCORES & ROSTER (BIG, READABLE ACROSS ROOM) ---
ctx.textAlign = 'left';
ctx.textBaseline = 'top';
ctx.font = '900 48px system-ui, -apple-system, sans-serif';

// Team 0 Score Badge
ctx.fillStyle = theme.t0;
ctx.shadowColor = theme.t0;
ctx.shadowBlur = 14 * glowMult;
ctx.fillText(`${theme.t0Name}  ${room.state.scores[0]}`, 32, 24);

// Team 1 Score Badge
ctx.textAlign = 'right';
ctx.fillStyle = theme.t1;
ctx.shadowColor = theme.t1;
ctx.fillText(`${room.state.scores[1]}  ${theme.t1Name}`, W - 32, 24);
ctx.shadowBlur = 0;

// --- PARTICIPANT SQUAD STATUS ---
// Render room avatars on their team's side
const dotSize = 7;
let t0Count = 0, t1Count = 0;
for (const p of people) {
  const tm = getParticipantTeam(p.id);
  ctx.fillStyle = `hsl(${p.hue}, 95%, 60%)`;
  if (tm === 0) {
    ctx.beginPath();
    ctx.arc(36 + (t0Count % 12) * 16, 85 + Math.floor(t0Count / 12) * 16, dotSize, 0, Math.PI * 2);
    ctx.fill();
    t0Count++;
  } else {
    ctx.beginPath();
    ctx.arc(W - 36 - (t1Count % 12) * 16, 85 + Math.floor(t1Count / 12) * 16, dotSize, 0, Math.PI * 2);
    ctx.fill();
    t1Count++;
  }
}

// --- ACTION POPUPS (Immediate reaction when player presses turn) ---
const nowT = now;
for (let i = 0; i < room.state.announcements.length; i++) {
  const a = room.state.announcements[i];
  const age = nowT - a.t;
  if (age < 1.4) {
    const alpha = Math.max(0, 1 - age / 1.4);
    ctx.globalAlpha = alpha;
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillStyle = a.color;
    ctx.shadowColor = a.color;
    ctx.shadowBlur = 10;
    const yPos = H - 90 - (room.state.announcements.length - 1 - i) * 32;
    if (a.team === 0) {
      ctx.textAlign = 'left';
      ctx.fillText(a.text, 36, yPos);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText(a.text, W - 36, yPos);
    }
    ctx.shadowBlur = 0;
  }
}
ctx.globalAlpha = 1.0;

// --- CENTER STAGE OVERLAYS (GO!, WINNER, ATTRACT MODE) ---
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

if (room.state.phase === 'countdown') {
  const remain = 1.8 - (now - room.state.phaseT);
  let txt = 'READY';
  if (remain < 0.6) txt = 'GO!';
  else if (remain < 1.2) txt = 'SET';
  ctx.font = '900 110px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = theme.t0;
  ctx.shadowBlur = 28 * glowMult;
  ctx.fillText(txt, W / 2, H / 2);
  ctx.shadowBlur = 0;
} else if (room.state.phase === 'crash') {
  ctx.font = '900 78px system-ui, sans-serif';
  if (room.state.winner === 2) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MUTUAL CRASH!', W / 2, H / 2);
  } else {
    const winCol = room.state.winner === 0 ? theme.t0 : theme.t1;
    const winName = room.state.winner === 0 ? theme.t0Name : theme.t1Name;
    ctx.fillStyle = winCol;
    ctx.shadowColor = winCol;
    ctx.shadowBlur = 32 * glowMult;
    ctx.fillText(`${winName} WINS!`, W / 2, H / 2 - 20);
    ctx.font = '700 32px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fillText('NEXT ROUND INCOMING...', W / 2, H / 2 + 55);
    ctx.shadowBlur = 0;
  }
}

// Attract mode badge
if (attractMode && room.state.phase === 'playing') {
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 6;
  ctx.fillText('AUTOPILOT DEMO • TAP LEFT / RIGHT TO STEER YOUR TEAM', W / 2, H - 36);
  ctx.shadowBlur = 0;
}

ctx.restore();