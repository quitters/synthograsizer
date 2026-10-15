const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

// --- Knobs & Themes ---
const courtTheme = getVar('court_theme') ?? 'classic_gym';
const ballSpeed = getVar('ball_speed') ?? 950;
const ballSize = getVar('ball_size') ?? 20;
const juice = getVar('juice') ?? 3;
const soundBounce = getVar('sound_bounce') ?? true;

// --- State Initialization ---
room.state.scores ??= { team0: 0, team1: 0 };
room.state.balls ??= [];
room.state.particles ??= [];
room.state.popups ??= [];
room.state.roundState ??= 'playing'; // 'playing' | 'game_over'
room.state.roundTimer ??= 0;
room.state.shake ??= 0;
room.state.lastInputTime ??= frame.t;
room.state.nextBotThrow ??= frame.t + 1.2;
room.state.nextBotDodge ??= frame.t + 2.0;
room.state.pdata ??= {}; // id -> { x, y, tx, ty, team, isOut, dodgeTimer, throwAnim, hitTimer }

// --- Audio Reactivity ---
const bassBump = (audio?.bass || 0) * (soundBounce ? 1.0 : 0.2);
const trebleBump = (audio?.treble || 0);
const isBeat = audio?.beat || false;

// --- Resolve Teams & Players ---
const people = room.people || [];
let team0Roster = [];
let team1Roster = [];

if (people.length === 0) {
  // Attract Bots
  for (let i = 0; i < 6; i++) {
    const botId = 'bot_' + i;
    const team = i % 2;
    const roster = team === 0 ? team0Roster : team1Roster;
    roster.push({ id: botId, isBot: true, hue: team === 0 ? 190 + i * 20 : 15 + i * 20, name: 'BOT ' + (i + 1), table: 'table-' + team });
  }
} else {
  const uniqueTables = Array.from(new Set(people.map(p => p.table || 'main'))).sort();
  const multiTable = uniqueTables.length > 1;
  people.forEach((p, idx) => {
    let team = 0;
    if (multiTable) {
      team = uniqueTables.indexOf(p.table || 'main') % 2;
    } else {
      team = idx % 2;
    }
    const entry = { id: p.id, isBot: false, hue: p.hue ?? (team === 0 ? 195 : 25), name: p.id.slice(0, 4).toUpperCase(), table: p.table };
    if (team === 0) team0Roster.push(entry); else team1Roster.push(entry);
  });

  // Balance empty side with bots so game is always playable
  if (team0Roster.length === 0) {
    team0Roster.push({ id: 'bot_t0', isBot: true, hue: 195, name: 'CYAN BOT', table: 'table-0' });
  }
  if (team1Roster.length === 0) {
    team1Roster.push({ id: 'bot_t1', isBot: true, hue: 25, name: 'CORAL BOT', table: 'table-1' });
  }
}

const allRoster = [...team0Roster, ...team1Roster];
const activeIds = new Set(allRoster.map(p => p.id));

// Clean up departed players
for (const id in room.state.pdata) {
  if (!activeIds.has(id)) delete room.state.pdata[id];
}

// Court geometry
const courtTop = H * 0.17;
const courtBottom = H * 0.86;
const courtH = courtBottom - courtTop;
const courtLeft = W * 0.07;
const courtRight = W * 0.93;
const courtW = courtRight - courtLeft;
const midX = W * 0.5;

// Compute player targets
function layoutTeam(roster, teamIdx) {
  const n = roster.length;
  const cols = Math.ceil(Math.sqrt(n * 0.6));
  const rows = Math.ceil(n / Math.max(1, cols));
  const xMin = teamIdx === 0 ? courtLeft + courtW * 0.05 : midX + courtW * 0.08;
  const xMax = teamIdx === 0 ? midX - courtW * 0.08 : courtRight - courtW * 0.05;
  const yMin = courtTop + courtH * 0.12;
  const yMax = courtBottom - courtH * 0.12;

  roster.forEach((p, i) => {
    const c = Math.floor(i / rows);
    const r = i % rows;
    const colRatio = cols > 1 ? c / (cols - 1) : 0.5;
    const rowRatio = rows > 1 ? r / (rows - 1) : 0.5;
    const tx = teamIdx === 0 ? xMax - colRatio * (xMax - xMin) : xMin + colRatio * (xMax - xMin);
    const ty = yMin + rowRatio * (yMax - yMin);

    const st = room.state.pdata[p.id] ??= {
      x: tx,
      y: ty,
      tx,
      ty,
      team: teamIdx,
      isOut: false,
      dodgeTimer: 0,
      throwAnim: 0,
      hitTimer: 0
    };
    st.tx = tx;
    st.ty = ty;
    st.team = teamIdx;
  });
}

layoutTeam(team0Roster, 0);
layoutTeam(team1Roster, 1);

// --- Reset / Round Check ---
const alive0 = team0Roster.filter(p => !room.state.pdata[p.id]?.isOut);
const alive1 = team1Roster.filter(p => !room.state.pdata[p.id]?.isOut);

if (room.state.roundState === 'playing') {
  if (alive0.length === 0 || alive1.length === 0) {
    room.state.roundState = 'game_over';
    room.state.roundTimer = 3.6;
    const winningTeam = alive0.length > 0 ? 0 : 1;
    if (winningTeam === 0) room.state.scores.team0++; else room.state.scores.team1++;
    room.state.popups.push({
      text: winningTeam === 0 ? 'CYAN STRIKERS WIN!' : 'CORAL BLAZE WINS!',
      x: midX,
      y: H * 0.5,
      scale: 2.2,
      life: 3.5,
      maxLife: 3.5,
      color: winningTeam === 0 ? '#00e5ff' : '#ff4d6d'
    });
    room.state.shake = 15 * juice;
  }
} else {
  room.state.roundTimer -= dt;
  if (room.state.roundTimer <= 0) {
    room.state.roundState = 'playing';
    allRoster.forEach(p => {
      if (room.state.pdata[p.id]) room.state.pdata[p.id].isOut = false;
    });
    room.state.balls = [];
    room.state.popups.push({
      text: 'GO!',
      x: midX,
      y: H * 0.5,
      scale: 2.4,
      life: 1.5,
      maxLife: 1.5,
      color: '#fff'
    });
    room.state.shake = 8 * juice;
  }
}

// --- Action Helper Functions ---
function executeThrow(playerEntry) {
  if (!playerEntry) return;
  const st = room.state.pdata[playerEntry.id];
  if (!st || st.isOut) return;

  st.throwAnim = 0.35;
  const team = st.team;
  const targetTeam = team === 0 ? team1Roster : team0Roster;
  const targets = targetTeam.filter(tp => !room.state.pdata[tp.id]?.isOut);
  let targetPos = { x: team === 0 ? courtRight - 100 : courtLeft + 100, y: st.y };
  if (targets.length > 0) {
    const chosen = targets[Math.floor(Math.random() * targets.length)];
    const cst = room.state.pdata[chosen.id];
    if (cst) targetPos = { x: cst.x, y: cst.y };
  }

  const dx = targetPos.x - st.x;
  const dy = targetPos.y - st.y;
  const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.15;
  const spd = ballSpeed * (0.9 + Math.random() * 0.25);

  if (room.state.balls.length < 24) {
    room.state.balls.push({
      x: st.x + Math.cos(angle) * (ballSize + 10),
      y: st.y + Math.sin(angle) * (ballSize + 10),
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      team,
      ownerHue: playerEntry.hue,
      active: true,
      spin: 0
    });
  }

  room.state.shake = Math.min(room.state.shake + 2.5 * juice, 20);

  // Throw dust
  for (let k = 0; k < 6; k++) {
    room.state.particles.push({
      x: st.x,
      y: st.y + 12,
      vx: -Math.cos(angle) * (80 + Math.random() * 120) + (Math.random() - 0.5) * 40,
      vy: -Math.sin(angle) * (80 + Math.random() * 120) + (Math.random() - 0.5) * 40,
      life: 0.3,
      maxLife: 0.3,
      size: 4 + Math.random() * 5,
      color: team === 0 ? '#00e5ff' : '#ff4d6d'
    });
  }
}

function executeDodge(playerEntry) {
  if (!playerEntry) return;
  const st = room.state.pdata[playerEntry.id];
  if (!st || st.isOut) return;
  st.dodgeTimer = 0.55;

  room.state.popups.push({
    text: 'DODGE!',
    x: st.x,
    y: st.y - 32,
    scale: 0.9,
    life: 0.7,
    maxLife: 0.7,
    color: st.team === 0 ? '#64ffda' : '#ffd166'
  });

  for (let k = 0; k < 8; k++) {
    const a = Math.random() * Math.PI * 2;
    room.state.particles.push({
      x: st.x,
      y: st.y,
      vx: Math.cos(a) * (90 + Math.random() * 70),
      vy: Math.sin(a) * (90 + Math.random() * 70),
      life: 0.4,
      maxLife: 0.4,
      size: 4,
      color: '#ffffff'
    });
  }
}

// --- Handle Events ---
const events = room.events || [];
if (events.length > 0) {
  room.state.lastInputTime = frame.t;
  for (const e of events) {
    let p = allRoster.find(r => r.id === e.participantId);
    // Fallback: assign to first alive teammate if participant not matched
    if (!p) {
      const pool = Math.random() > 0.5 ? alive0 : alive1;
      p = pool[Math.floor(Math.random() * pool.length)];
    }
    if (e.name === 'throw') executeThrow(p);
    if (e.name === 'dodge') executeDodge(p);
  }
}

// --- Attract Mode & AI Bots ---
const isIdle = (frame.t - room.state.lastInputTime) > 3.0;
if ((isIdle || people.length === 0) && room.state.roundState === 'playing') {
  if (frame.t > room.state.nextBotThrow) {
    const team = Math.random() < 0.5 ? 0 : 1;
    const pool = team === 0 ? alive0 : alive1;
    if (pool.length > 0) {
      const bot = pool[Math.floor(Math.random() * pool.length)];
      executeThrow(bot);
    }
    room.state.nextBotThrow = frame.t + 0.6 + Math.random() * 1.0;
  }

  if (frame.t > room.state.nextBotDodge) {
    // Check if ball incoming close to any player
    room.state.balls.forEach(b => {
      if (!b.active) return;
      const targets = b.team === 0 ? alive1 : alive0;
      targets.forEach(tp => {
        const st = room.state.pdata[tp.id];
        if (st && st.dodgeTimer <= 0) {
          const d = Math.hypot(b.x - st.x, b.y - st.y);
          if (d < 160 && Math.random() < 0.65) executeDodge(tp);
        }
      });
    });
    room.state.nextBotDodge = frame.t + 0.5 + Math.random() * 0.8;
  }
}

// --- Update Players & Physics ---
allRoster.forEach(p => {
  const st = room.state.pdata[p.id];
  if (!st) return;
  st.dodgeTimer = Math.max(0, st.dodgeTimer - dt);
  st.throwAnim = Math.max(0, st.throwAnim - dt);
  st.hitTimer = Math.max(0, st.hitTimer - dt);

  if (st.isOut) {
    // Drift to sideline bench
    const benchY = st.team === 0 ? courtTop - 25 : courtBottom + 25;
    st.x += (st.tx - st.x) * dt * 4;
    st.y += (benchY - st.y) * dt * 4;
  } else {
    // Subtle lively idle step
    const idleBounce = Math.sin(frame.t * 6 + (p.hue || 0)) * (2 + bassBump * 6);
    st.x += (st.tx - st.x) * dt * 8;
    st.y += (st.ty + idleBounce - st.y) * dt * 8;
  }
});

// --- Update Balls ---
for (let i = room.state.balls.length - 1; i >= 0; i--) {
  const b = room.state.balls[i];
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.spin += 12 * dt;

  // Ball bounce on gym floor top/bottom boundary
  if (b.y < courtTop + ballSize) {
    b.y = courtTop + ballSize;
    b.vy = Math.abs(b.vy) * 0.85;
  } else if (b.y > courtBottom - ballSize) {
    b.y = courtBottom - ballSize;
    b.vy = -Math.abs(b.vy) * 0.85;
  }

  // Ball out of court bounds (hits back wall)
  if (b.x < courtLeft - 30 || b.x > courtRight + 30) {
    b.active = false;
    for (let k = 0; k < 6; k++) {
      room.state.particles.push({
        x: Math.max(courtLeft, Math.min(courtRight, b.x)),
        y: b.y,
        vx: (Math.random() - 0.5) * 100,
        vy: (Math.random() - 0.5) * 100,
        life: 0.25,
        maxLife: 0.25,
        size: 3,
        color: '#ffcc00'
      });
    }
  }

  // Collision with target team players
  if (b.active) {
    const enemyTeam = b.team === 0 ? team1Roster : team0Roster;
    for (const ep of enemyTeam) {
      const est = room.state.pdata[ep.id];
      if (!est || est.isOut) continue;
      const dist = Math.hypot(b.x - est.x, b.y - est.y);
      const playerR = 24;

      if (dist < playerR + ballSize) {
        if (est.dodgeTimer > 0) {
          // Dodged! Glancing blow
          b.vx *= 0.5;
          b.vy += (Math.random() - 0.5) * 300;
          room.state.popups.push({
            text: 'CLOSE!',
            x: est.x,
            y: est.y - 28,
            scale: 0.8,
            life: 0.5,
            maxLife: 0.5,
            color: '#fff'
          });
        } else {
          // HIT! Player is out
          est.isOut = true;
          est.hitTimer = 1.0;
          b.active = false;
          room.state.shake = 12 * juice;

          room.state.popups.push({
            text: 'OUT!',
            x: est.x,
            y: est.y - 30,
            scale: 1.6,
            life: 1.2,
            maxLife: 1.2,
            color: '#ff2a2a'
          });

          // Hit impact particles
          for (let k = 0; k < 18; k++) {
            const angle = Math.random() * Math.PI * 2;
            const sp = 120 + Math.random() * 260;
            room.state.particles.push({
              x: est.x,
              y: est.y,
              vx: Math.cos(angle) * sp,
              vy: Math.sin(angle) * sp,
              life: 0.5 + Math.random() * 0.3,
              maxLife: 0.8,
              size: 5 + Math.random() * 6,
              color: b.team === 0 ? '#00e5ff' : '#ff4d6d'
            });
          }
          break;
        }
      }
    }
  }
}

// Prune dead balls
room.state.balls = room.state.balls.filter(b => b.active);
if (room.state.balls.length > 25) room.state.balls.splice(0, room.state.balls.length - 25);

// --- Update Particles & Popups ---
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  if (p.life <= 0) room.state.particles.splice(i, 1);
}
if (room.state.particles.length > 140) room.state.particles.splice(0, room.state.particles.length - 140);

for (let i = room.state.popups.length - 1; i >= 0; i--) {
  const pop = room.state.popups[i];
  pop.y -= dt * 35;
  pop.life -= dt;
  if (pop.life <= 0) room.state.popups.splice(i, 1);
}
if (room.state.popups.length > 15) room.state.popups.splice(0, room.state.popups.length - 15);

// Decay Screen Shake
room.state.shake = Math.max(0, room.state.shake - dt * 25);
const shakeX = (Math.random() - 0.5) * room.state.shake;
const shakeY = (Math.random() - 0.5) * room.state.shake;

// ==========================================================================
// RENDERING
// ==========================================================================
ctx.save();
ctx.translate(shakeX, shakeY);

// 1. Gym Court Floor Background
if (courtTheme === 'classic_gym') {
  // Polished Maple Wood Plank pattern
  ctx.fillStyle = '#1e1108';
  ctx.fillRect(-20, -20, W + 40, H + 40);

  ctx.fillStyle = '#82491a';
  ctx.fillRect(courtLeft, courtTop, courtW, courtH);

  // Wood planks
  ctx.strokeStyle = '#5a300d';
  ctx.lineWidth = 1;
  const plankH = 28;
  ctx.beginPath();
  for (let y = courtTop; y <= courtBottom; y += plankH) {
    ctx.moveTo(courtLeft, y);
    ctx.lineTo(courtRight, y);
  }
  ctx.stroke();

  // Dark glossy floor reflections
  const grad = ctx.createLinearGradient(0, courtTop, 0, courtBottom);
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = grad;
  ctx.fillRect(courtLeft, courtTop, courtW, courtH);
} else if (courtTheme === 'cyber_arena') {
  ctx.fillStyle = '#060a12';
  ctx.fillRect(-20, -20, W + 40, H + 40);

  ctx.fillStyle = '#0a1224';
  ctx.fillRect(courtLeft, courtTop, courtW, courtH);

  // Grid lines
  ctx.strokeStyle = '#122646';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const step = 42;
  for (let x = courtLeft; x <= courtRight; x += step) {
    ctx.moveTo(x, courtTop);
    ctx.lineTo(x, courtBottom);
  }
  for (let y = courtTop; y <= courtBottom; y += step) {
    ctx.moveTo(courtLeft, y);
    ctx.lineTo(courtRight, y);
  }
  ctx.stroke();
} else {
  // Retro Arcade Synthwave
  ctx.fillStyle = '#0d041c';
  ctx.fillRect(-20, -20, W + 40, H + 40);

  ctx.fillStyle = '#1c0b3b';
  ctx.fillRect(courtLeft, courtTop, courtW, courtH);

  // Neon grid floor
  ctx.strokeStyle = '#3d167a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let y = courtTop; y <= courtBottom; y += 38) {
    ctx.moveTo(courtLeft, y);
    ctx.lineTo(courtRight, y);
  }
  for (let x = courtLeft; x <= courtRight; x += 55) {
    ctx.moveTo(x, courtTop);
    ctx.lineTo(x, courtBottom);
  }
  ctx.stroke();
}

// 2. Court Boundary Markings & Neutral Attack Zone
const lineCol = courtTheme === 'classic_gym' ? '#ffffff' : (courtTheme === 'cyber_arena' ? '#00e5ff' : '#ff007f');
ctx.strokeStyle = lineCol;
ctx.lineWidth = 4;
ctx.strokeRect(courtLeft, courtTop, courtW, courtH);

// Center Line (Center court division)
ctx.beginPath();
ctx.setLineDash([12, 8]);
ctx.moveTo(midX, courtTop);
ctx.lineTo(midX, courtBottom);
ctx.stroke();
ctx.setLineDash([]);

// Center Jump Circle
ctx.beginPath();
ctx.arc(midX, (courtTop + courtBottom) / 2, 72 + bassBump * 14, 0, Math.PI * 2);
ctx.strokeStyle = lineCol;
ctx.lineWidth = 3;
ctx.stroke();

// 10-ft Neutral Attack Lines
ctx.strokeStyle = courtTheme === 'classic_gym' ? 'rgba(255,100,50,0.6)' : 'rgba(255,255,255,0.3)';
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.moveTo(midX - courtW * 0.16, courtTop);
ctx.lineTo(midX - courtW * 0.16, courtBottom);
ctx.moveTo(midX + courtW * 0.16, courtTop);
ctx.lineTo(midX + courtW * 0.16, courtBottom);
ctx.stroke();

// Sideline benches for out players
ctx.fillStyle = 'rgba(0,0,0,0.45)';
ctx.fillRect(courtLeft + 20, courtTop - 40, courtW - 40, 24);
ctx.fillRect(courtLeft + 20, courtBottom + 16, courtW - 40, 24);
ctx.strokeStyle = 'rgba(255,255,255,0.15)';
ctx.strokeRect(courtLeft + 20, courtTop - 40, courtW - 40, 24);
ctx.strokeRect(courtLeft + 20, courtBottom + 16, courtW - 40, 24);

// Bench Labels
ctx.font = 'bold 12px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.4)';
ctx.textAlign = 'center';
ctx.fillText('BENCH', courtLeft + 60, courtTop - 24);
ctx.fillText('BENCH', courtLeft + 60, courtBottom + 32);

// 3. Draw Players
allRoster.forEach(p => {
  const st = room.state.pdata[p.id];
  if (!st) return;
  const isT0 = st.team === 0;
  const teamColor = isT0 ? '#00e5ff' : '#ff4d6d';
  const isDodge = st.dodgeTimer > 0;
  const isThrow = st.throwAnim > 0;
  const isHit = st.hitTimer > 0;

  ctx.save();
  ctx.translate(st.x, st.y);

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  const shadowScale = isDodge ? 0.6 : (st.isOut ? 0.7 : 1.0);
  ctx.ellipse(0, 16, 18 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  if (st.isOut) {
    ctx.globalAlpha = 0.55;
  }

  // Dodge shield / aura effect
  if (isDodge) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fill();
  }

  // Torso / Jersey
  const bodyRadius = isDodge ? 15 : (isHit ? 22 : 19);
  ctx.fillStyle = teamColor;
  ctx.beginPath();
  ctx.arc(0, 0, bodyRadius, 0, Math.PI * 2);
  ctx.fill();

  // Inner Halo / Unique participant Hue
  ctx.fillStyle = `hsl(${p.hue}, 90%, 55%)`;
  ctx.beginPath();
  ctx.arc(0, 0, bodyRadius - 5, 0, Math.PI * 2);
  ctx.fill();

  // Throwing arm pose indicator
  if (isThrow) {
    ctx.fillStyle = '#ffffff';
    const throwDir = isT0 ? 1 : -1;
    ctx.beginPath();
    ctx.arc(throwDir * 22, -6, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Directional facing arrow/visor
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const faceDir = isT0 ? 1 : -1;
  ctx.arc(faceDir * 8, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  // Player Tag / ID Label
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(p.name, 0, isDodge ? -22 : -26);

  ctx.restore();
});

// 4. Draw Dodgeballs
room.state.balls.forEach(b => {
  ctx.save();
  ctx.translate(b.x, b.y);

  // Ball ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 16, ballSize * 0.9, ballSize * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glow trail
  const ballColor = b.team === 0 ? '#00e5ff' : '#ff4d6d';
  ctx.shadowColor = ballColor;
  ctx.shadowBlur = 14;

  // Ball Body
  ctx.fillStyle = ballColor;
  ctx.beginPath();
  ctx.arc(0, 0, ballSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Playground rubber ball ribs / seams
  ctx.rotate(b.spin);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, ballSize * 0.65, 0, Math.PI * 2);
  ctx.moveTo(-ballSize, 0);
  ctx.lineTo(ballSize, 0);
  ctx.stroke();

  ctx.restore();
});

// 5. Particles
room.state.particles.forEach(pt => {
  ctx.fillStyle = pt.color;
  ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1.0;
});

// 6. Floating Text Popups
room.state.popups.forEach(pop => {
  const alpha = Math.min(1.0, pop.life / (pop.maxLife * 0.3));
  ctx.save();
  ctx.translate(pop.x, pop.y);
  ctx.scale(pop.scale, pop.scale);
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.font = '900 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  ctx.fillText(pop.text, 2, 2);
  ctx.fillStyle = pop.color;
  ctx.fillText(pop.text, 0, 0);
  ctx.restore();
});

// 7. Large Scoreboard Header
ctx.save();
const barY = H * 0.08;

// Team 0 Score (Left)
ctx.textAlign = 'right';
ctx.font = '900 52px sans-serif';
ctx.fillStyle = '#00e5ff';
ctx.shadowColor = '#00e5ff';
ctx.shadowBlur = isBeat ? 18 : 6;
ctx.fillText(String(room.state.scores.team0), midX - 60, barY + 8);

// Team 0 Label & Alive Count
ctx.font = 'bold 18px sans-serif';
ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
ctx.fillText('CYAN TEAM (' + alive0.length + ' ALIVE)', midX - 130, barY + 2);

// VS Center Divider
ctx.shadowBlur = 0;
ctx.textAlign = 'center';
ctx.font = '900 26px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.fillText('VS', midX, barY + 3);

// Team 1 Score (Right)
ctx.textAlign = 'left';
ctx.font = '900 52px sans-serif';
ctx.fillStyle = '#ff4d6d';
ctx.shadowColor = '#ff4d6d';
ctx.shadowBlur = isBeat ? 18 : 6;
ctx.fillText(String(room.state.scores.team1), midX + 60, barY + 8);

// Team 1 Label & Alive Count
ctx.font = 'bold 18px sans-serif';
ctx.fillStyle = 'rgba(255, 77, 109, 0.9)';
ctx.fillText('(' + alive1.length + ' ALIVE) CORAL TEAM', midX + 130, barY + 2);

// Center Game State / Attract Status
ctx.shadowBlur = 0;
ctx.textAlign = 'center';
ctx.font = 'bold 14px sans-serif';
if (room.state.roundState === 'game_over') {
  ctx.fillStyle = '#ffea00';
  ctx.fillText('NEXT ROUND IN ' + Math.ceil(room.state.roundTimer) + 's', midX, barY + 32);
} else if (isIdle || people.length === 0) {
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('ATTRACT MODE • PRESS THROW OR DODGE', midX, barY + 32);
} else {
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('PRESS THROW TO HURL • PRESS DODGE TO DUCK', midX, barY + 32);
}

ctx.restore();
ctx.restore();