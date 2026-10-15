ctx.save();
const W = frame.width, H = frame.height;

// ---- Persistent State Setup ----
room.state.game ??= {
  phase: 'GREEN', // 'GREEN', 'YELLOW', 'RED', 'WON'
  timer: 0,
  phaseDuration: 4,
  winnerId: null,
  winnerHue: 50,
  winnerName: '',
  winTimer: 0,
  lastActionT: frame.t,
  roundCount: 1
};
room.state.players ??= {}; // id -> { pos, targetPos, score, bustedT, lastStepT, hue }
room.state.fx ??= [];      // bounded bursts & rings (max 80)
room.state.bots ??= [];    // simulated runners if room is empty

const game = room.state.game;
const players = room.state.players;
const fx = room.state.fx;

// Controls
const trackStyle = getVar('track_style') ?? 'neon_grid';
const basePace = getVar('pace') ?? 4;
const difficulty = getVar('difficulty') ?? 'forgiving';
const enableTrails = getVar('trails') ?? true;

const yellowLen = difficulty === 'sudden_death' ? 0.35 : 0.9;
const penalty = difficulty === 'forgiving' ? 0.35 : 1.0; // portion sent back

// ---- Ensure active players from room.people ----
const currentPeople = (room.people && room.people.length > 0) ? room.people : [];
const hasRealPlayers = currentPeople.length > 0;

if (hasRealPlayers) {
  for (let i = 0; i < currentPeople.length; i++) {
    const p = currentPeople[i];
    if (!players[p.id]) {
      players[p.id] = { pos: 0, targetPos: 0, score: 0, bustedT: -10, lastStepT: -10, hue: p.hue ?? (i * 47) % 360 };
    } else {
      players[p.id].hue = p.hue ?? players[p.id].hue;
    }
  }
} else {
  // Attract mode fallback bots
  if (room.state.bots.length === 0) {
    for (let b = 0; b < 6; b++) {
      room.state.bots.push({ id: 'bot_' + b, pos: 0, targetPos: 0, bustedT: -10, lastStepT: -10, hue: (b * 55) % 360 });
    }
  }
}

// Helper to spawn FX (bounded)
function addFx(x, y, hue, text, size) {
  if (fx.length > 70) fx.shift();
  fx.push({ x, y, hue, text, size: size || 18, life: 1, maxLife: 1 });
}

// Helper to restart round
function startNewRound() {
  game.phase = 'GREEN';
  game.timer = 0;
  game.phaseDuration = basePace * (0.8 + Math.random() * 0.5);
  game.winnerId = null;
  game.winTimer = 0;
  game.roundCount++;
  for (const id in players) {
    players[id].pos = 0;
    players[id].targetPos = 0;
  }
  for (const b of room.state.bots) {
    b.pos = 0;
    b.targetPos = 0;
  }
}

// ---- Process Triggers & Events ----
let anyAction = false;
if (room.events) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    if (ev.name === 'restart') {
      startNewRound();
      anyAction = true;
    } else if (ev.name === 'step') {
      anyAction = true;
      game.lastActionT = frame.t;
      const pid = ev.participantId || (hasRealPlayers ? currentPeople[0].id : null);
      const runner = pid ? players[pid] : null;

      if (runner && game.phase !== 'WON') {
        if (game.phase === 'GREEN') {
          runner.targetPos = Math.min(1, runner.targetPos + 0.1);
          runner.lastStepT = frame.t;
          addFx(0, 0, runner.hue, '+1', 24);
        } else {
          // BUSTED on RED or late YELLOW!
          runner.targetPos = Math.max(0, runner.targetPos * (1 - penalty));
          runner.pos = runner.targetPos;
          runner.bustedT = frame.t;
          addFx(0, 0, 0, 'BUSTED!', 32);
        }
      }
    }
  }
}

// Attract mode auto-stepping when idle
const isIdle = (frame.t - game.lastActionT) > 3.0;
if (isIdle && game.phase !== 'WON') {
  if (Math.random() < 0.08) {
    const list = hasRealPlayers ? Object.values(players) : room.state.bots;
    if (list.length > 0) {
      const pick = list[Math.floor(Math.random() * list.length)];
      if (game.phase === 'GREEN') {
        pick.targetPos = Math.min(1, pick.targetPos + 0.09);
        pick.lastStepT = frame.t;
      } else if (Math.random() < 0.25) {
        // occasional greed trigger during red
        pick.targetPos = 0;
        pick.pos = 0;
        pick.bustedT = frame.t;
      }
    }
  }
}

// ---- Phase Timing Update ----
game.timer += frame.dt;
if (game.phase === 'WON') {
  game.winTimer += frame.dt;
  if (game.winTimer > 4.5) {
    startNewRound();
  }
} else if (game.phase === 'GREEN') {
  if (game.timer >= game.phaseDuration) {
    game.phase = 'YELLOW';
    game.timer = 0;
    game.phaseDuration = yellowLen;
  }
} else if (game.phase === 'YELLOW') {
  if (game.timer >= game.phaseDuration) {
    game.phase = 'RED';
    game.timer = 0;
    game.phaseDuration = basePace * (0.6 + Math.random() * 0.7);
  }
} else if (game.phase === 'RED') {
  if (game.timer >= game.phaseDuration) {
    game.phase = 'GREEN';
    game.timer = 0;
    game.phaseDuration = basePace * (0.8 + Math.random() * 0.5);
  }
}

// Check Winner
if (game.phase !== 'WON') {
  const checkList = hasRealPlayers ? Object.entries(players) : room.state.bots.map(b => [b.id, b]);
  for (let i = 0; i < checkList.length; i++) {
    const [id, r] = checkList[i];
    if (r.targetPos >= 1) {
      game.phase = 'WON';
      game.winnerId = id;
      game.winnerHue = r.hue;
      game.winnerName = id.startsWith('bot_') ? `RUNNER #${id.split('_')[1]}` : `PLAYER ${id.slice(-4).toUpperCase()}`;
      game.winTimer = 0;
      if (r.score !== undefined) r.score++;
      break;
    }
  }
}

// ---- Drawing ----
if (enableTrails) {
  ctx.fillStyle = 'rgba(10, 12, 18, 0.35)';
  ctx.fillRect(0, 0, W, H);
} else {
  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(0, 0, W, H);
}

// Field geometry (perspective corridor bottom -> top)
const topY = H * 0.26;
const botY = H * 0.90;
const trackTopW = W * 0.55;
const trackBotW = W * 0.92;
const trackLeftTop = (W - trackTopW) * 0.5;
const trackLeftBot = (W - trackBotW) * 0.5;

// Draw Ground Track Grid
ctx.save();
ctx.beginPath();
ctx.moveTo(trackLeftTop, topY);
ctx.lineTo(trackLeftTop + trackTopW, topY);
ctx.lineTo(trackLeftBot + trackBotW, botY);
ctx.lineTo(trackLeftBot, botY);
ctx.closePath();

const trackGrad = ctx.createLinearGradient(0, topY, 0, botY);
if (trackStyle === 'cyber_highway') {
  trackGrad.addColorStop(0, '#101726');
  trackGrad.addColorStop(1, '#05070c');
} else if (trackStyle === 'retro_arcade') {
  trackGrad.addColorStop(0, '#241026');
  trackGrad.addColorStop(1, '#0a0410');
} else {
  trackGrad.addColorStop(0, '#141c22');
  trackGrad.addColorStop(1, '#080d12');
}
ctx.fillStyle = trackGrad;
ctx.fill();
ctx.lineWidth = 3 + audio.bass * 3;
ctx.strokeStyle = game.phase === 'RED' ? 'rgba(255, 40, 60, 0.4)' : 'rgba(50, 220, 140, 0.35)';
ctx.stroke();

// Perspective cross rungs
const rungs = 12;
for (let r = 1; r < rungs; r++) {
  const p = r / rungs;
  const ry = topY + (botY - topY) * Math.pow(p, 1.4);
  const rx1 = trackLeftTop + (trackLeftBot - trackLeftTop) * ( (ry - topY) / (botY - topY) );
  const rx2 = (trackLeftTop + trackTopW) + ((trackLeftBot + trackBotW) - (trackLeftTop + trackTopW)) * ( (ry - topY) / (botY - topY) );
  ctx.beginPath();
  ctx.moveTo(rx1, ry);
  ctx.lineTo(rx2, ry);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + 0.15 * p})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Finish Line Ribbon
ctx.beginPath();
ctx.moveTo(trackLeftTop - 10, topY);
ctx.lineTo(trackLeftTop + trackTopW + 10, topY);
ctx.lineWidth = 6 + (audio.beat ? 4 : 0);
ctx.strokeStyle = '#ffd700';
ctx.stroke();
ctx.restore();

// ---- Giant Traffic Light / Overseer at Far End ----
const lightCenterX = W * 0.5;
const lightCenterY = H * 0.13;
const lightBoxW = Math.min(W * 0.42, 380);
const lightBoxH = H * 0.18;

// Beacon glow reaction to audio bass
const glowRadius = (lightBoxH * 0.8) * (1 + audio.bass * 0.5);
const lightGlow = ctx.createRadialGradient(lightCenterX, lightCenterY, 10, lightCenterX, lightCenterY, glowRadius);
if (game.phase === 'GREEN') {
  lightGlow.addColorStop(0, 'rgba(0, 255, 140, 0.6)');
  lightGlow.addColorStop(1, 'rgba(0, 255, 140, 0)');
} else if (game.phase === 'YELLOW') {
  lightGlow.addColorStop(0, 'rgba(255, 210, 0, 0.6)');
  lightGlow.addColorStop(1, 'rgba(255, 210, 0, 0)');
} else {
  lightGlow.addColorStop(0, 'rgba(255, 20, 50, 0.8)');
  lightGlow.addColorStop(1, 'rgba(255, 20, 50, 0)');
}
ctx.save();
ctx.fillStyle = lightGlow;
ctx.fillRect(lightCenterX - glowRadius, lightCenterY - glowRadius, glowRadius * 2, glowRadius * 2);

// Signal housing
ctx.fillStyle = '#08080c';
ctx.strokeStyle = '#282b3a';
ctx.lineWidth = 4;
ctx.beginPath();
ctx.roundRect(lightCenterX - lightBoxW * 0.5, lightCenterY - lightBoxH * 0.5, lightBoxW, lightBoxH, 18);
ctx.fill();
ctx.stroke();

// 3 Signal lenses (Red, Yellow, Green)
const lensR = lightBoxH * 0.32;
const lensSpacing = lightBoxW * 0.28;
const lensY = lightCenterY;
const lensConfigs = [
  { col: 'red', x: lightCenterX - lensSpacing, active: game.phase === 'RED', cOn: '#ff1c44', cOff: '#3a0810' },
  { col: 'yel', x: lightCenterX, active: game.phase === 'YELLOW', cOn: '#ffd200', cOff: '#3d3200' },
  { col: 'grn', x: lightCenterX + lensSpacing, active: game.phase === 'GREEN', cOn: '#00ff88', cOff: '#003318' }
];

for (const lens of lensConfigs) {
  ctx.beginPath();
  ctx.arc(lens.x, lensY, lensR, 0, Math.PI * 2);
  ctx.fillStyle = lens.active ? lens.cOn : lens.cOff;
  ctx.fill();
  ctx.lineWidth = lens.active ? 4 : 2;
  ctx.strokeStyle = lens.active ? '#ffffff' : '#1a1d26';
  ctx.stroke();

  if (lens.active) {
    ctx.beginPath();
    ctx.arc(lens.x, lensY, lensR * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  }
}
ctx.restore();

// ---- Big Banner Announcement ----
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.font = '900 48px system-ui, sans-serif';

if (game.phase === 'GREEN') {
  ctx.fillStyle = '#00ff88';
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 24;
  ctx.fillText('RUN! (GREEN LIGHT)', W * 0.5, topY - 24);
} else if (game.phase === 'YELLOW') {
  ctx.fillStyle = '#ffd200';
  ctx.shadowColor = '#ffd200';
  ctx.shadowBlur = 24;
  ctx.fillText('STEADY... CAUTION!', W * 0.5, topY - 24);
} else if (game.phase === 'RED') {
  ctx.fillStyle = '#ff2244';
  ctx.shadowColor = '#ff2244';
  ctx.shadowBlur = 28 + (audio.beat ? 16 : 0);
  ctx.fillText('FREEZE! (RED LIGHT)', W * 0.5, topY - 24);
} else if (game.phase === 'WON') {
  ctx.fillStyle = `hsl(${game.winnerHue}, 100%, 65%)`;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 35;
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.fillText(`VICTORY! ${game.winnerName}`, W * 0.5, topY - 20);
}
ctx.restore();

// ---- Draw Runners and Lanes ----
const activeList = hasRealPlayers ? currentPeople : room.state.bots;
const runnerCount = Math.max(1, activeList.length);

for (let i = 0; i < runnerCount; i++) {
  const pData = activeList[i];
  const runner = hasRealPlayers ? players[pData.id] : pData;
  if (!runner) continue;

  // Smooth interpolation toward targetPos
  runner.pos += (runner.targetPos - runner.pos) * Math.min(1, frame.dt * 14);

  // Perspective mapping:
  // pos 0 = botY (front), pos 1 = topY (finish line)
  const clampedPos = Math.max(0, Math.min(1, runner.pos));
  const y = botY - clampedPos * (botY - topY);
  const laneT = (runnerCount === 1) ? 0.5 : (i + 0.5) / runnerCount;

  // Width at this Y
  const progressFrac = clampedPos;
  const currentTrackW = trackBotW + (trackTopW - trackBotW) * progressFrac;
  const currentTrackLeft = trackLeftBot + (trackLeftTop - trackLeftBot) * progressFrac;
  const x = currentTrackLeft + currentTrackW * laneT;

  // Scale runner by perspective distance
  const runnerScale = 1.0 - progressFrac * 0.55; // smaller as it gets farther
  const avatarR = 18 * runnerScale;
  const isBustedRecent = (frame.t - runner.bustedT) < 0.6;
  const isStepRecent = (frame.t - runner.lastStepT) < 0.3;

  ctx.save();
  ctx.translate(x, y);

  // Lane Marker Line
  ctx.beginPath();
  ctx.setLineDash([4, 6]);
  ctx.moveTo(0, 0);
  ctx.lineTo(0, (botY - y));
  ctx.strokeStyle = `hsla(${runner.hue}, 80%, 50%, 0.18)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  // Pulse ring on recent step
  if (isStepRecent) {
    const pulseRatio = (frame.t - runner.lastStepT) / 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, avatarR * (1 + pulseRatio * 1.8), 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${runner.hue}, 100%, 70%, ${1 - pulseRatio})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Busted Alarm Ring
  if (isBustedRecent) {
    ctx.beginPath();
    ctx.arc(0, 0, avatarR * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 20, 50, 0.4)';
    ctx.fill();
    ctx.strokeStyle = '#ff1c44';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Runner Body
  ctx.beginPath();
  ctx.arc(0, 0, avatarR, 0, Math.PI * 2);
  ctx.fillStyle = isBustedRecent ? '#ff1c44' : `hsl(${runner.hue}, 90%, 55%)`;
  ctx.fill();
  ctx.lineWidth = 3 * runnerScale;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Number/Score label inside avatar
  ctx.fillStyle = '#05070a';
  ctx.font = `900 ${Math.max(10, Math.floor(14 * runnerScale))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = hasRealPlayers ? `${i + 1}` : `B${i + 1}`;
  ctx.fillText(label, 0, 0);

  // Table / Player ID Tag
  if (runnerScale > 0.65) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 11px system-ui, sans-serif';
    const sub = pData.table ? pData.table : (hasRealPlayers ? `P${i + 1}` : 'BOT');
    ctx.fillText(sub, 0, avatarR + 13);
  }

  ctx.restore();
}

// ---- FX System (Text bursts, sparks) ----
for (let i = fx.length - 1; i >= 0; i--) {
  const f = fx[i];
  f.life -= frame.dt * 1.8;
  if (f.life <= 0) {
    fx.splice(i, 1);
    continue;
  }
  ctx.save();
  ctx.globalAlpha = Math.max(0, f.life);
  ctx.fillStyle = f.hue === 0 ? '#ff3344' : `hsl(${f.hue}, 100%, 65%)`;
  ctx.font = `900 ${f.size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  // Float upwards slightly
  const fy = H * 0.5 - (1 - f.life) * 40;
  ctx.fillText(f.text, W * 0.5, fy);
  ctx.restore();
}

// ---- HUD Footer: Controls info & Round Status ----
ctx.save();
ctx.fillStyle = '#ffffff';
ctx.font = '700 18px system-ui, sans-serif';
ctx.textAlign = 'left';
ctx.textBaseline = 'bottom';
ctx.fillText(`ROUND ${game.roundCount}  •  PACE: ${basePace}s  •  RULES: ${difficulty.toUpperCase()}`, 30, H - 25);

ctx.textAlign = 'right';
ctx.fillStyle = isIdle ? '#ffaa44' : '#00ff88';
ctx.fillText(isIdle ? 'ATTRACT MODE — PRESS "STEP" TO JOIN' : `${runnerCount} RUNNERS ACTIVE`, W - 30, H - 25);
ctx.restore();

ctx.restore();