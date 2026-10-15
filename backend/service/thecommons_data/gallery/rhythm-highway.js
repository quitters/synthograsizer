ctx.save();
const W = frame.width;
const H = frame.height;

// ---- VARIABLES & THEME LOOKUPS ----
const themes = {
  cyber_neon: { bg: '#060614', grid: '#16193a', lane: '#0d1028', strike: '#00f7ff', accent: '#ff0077', bar: '#1a2256' },
  synth_sunset: { bg: '#120417', grid: '#38133b', lane: '#22082b', strike: '#ff7700', accent: '#ff00aa', bar: '#4f1642' },
  laser_grid: { bg: '#02120b', grid: '#0a3420', lane: '#052114', strike: '#00ff88', accent: '#00e1ff', bar: '#0d4a2d' },
  acid_matrix: { bg: '#0b0f02', grid: '#233008', lane: '#141c05', strike: '#c8ff00', accent: '#39ff14', bar: '#2f420b' }
};
const themeChoice = getVar('highway_theme') ?? 'cyber_neon';
const theme = themes[themeChoice] ?? themes.cyber_neon;
const laneCount = Math.max(3, Math.min(6, Math.round(getVar('lane_count') ?? 4)));
const tempoSpeed = getVar('tempo_speed') ?? 1.5;
const bloomGlow = getVar('bloom_glow') ?? true;
const roundDuration = getVar('round_duration') ?? 40;

// ---- PERSISTENT STATE INITIALIZATION ----
room.state.notes ??= [];
room.state.scores ??= {};
room.state.particles ??= [];
room.state.floatingText ??= [];
room.state.roundStart ??= frame.t;
room.state.lastEventT ??= frame.t;
room.state.nextSpawnT ??= frame.t + 0.3;
room.state.phase ??= 'play'; // 'play' | 'winner'
room.state.phaseT ??= frame.t;
room.state.demoHits ??= 0;

// Bounded state maintenance
if (room.state.notes.length > 70) room.state.notes.splice(0, room.state.notes.length - 70);
if (room.state.particles.length > 140) room.state.particles.splice(0, room.state.particles.length - 140);
if (room.state.floatingText.length > 25) room.state.floatingText.splice(0, room.state.floatingText.length - 25);

// Clean old participant scores if room is huge
const activePeople = room.people || [];
const activeIds = new Set(activePeople.map(p => p.id));

// Perspective Highway Geometry
const bassBoost = (audio.bass || 0) * 25;
const vpX = W * 0.5;
const vpY = H * 0.20;
const strikeY = H * 0.83;
const highwayBotW = Math.min(W * 0.72 + bassBoost, 1080);
const highwayTopW = highwayBotW * 0.22;
const travelDuration = 1.75 / tempoSpeed;

// ---- ATTRACT MODE DETECTION ----
const isAttract = (frame.t - room.state.lastEventT) > 5.0;

// Helper: Lane to bottom X
function getLaneX(laneIdx, totalLanes, yRatio) {
  const wAtY = highwayTopW + (highwayBotW - highwayTopW) * yRatio;
  const leftAtY = vpX - wAtY * 0.5;
  const laneW = wAtY / totalLanes;
  return leftAtY + laneW * (laneIdx + 0.5);
}

// Helper: Spawn Floating Text
function addPopup(text, x, y, hue, scale = 1.0) {
  room.state.floatingText.push({
    text,
    x,
    y,
    color: `hsl(${hue}, 100%, 65%)`,
    spawnT: frame.t,
    scale
  });
}

// Helper: Spawn Blast Particles
function blastParticles(x, y, hue, count = 22) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 260;
    room.state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 40,
      hue: (hue + (Math.random() * 40 - 20) + 360) % 360,
      life: 0.35 + Math.random() * 0.4,
      spawnT: frame.t,
      size: 3 + Math.random() * 5
    });
  }
}

// ---- ROUND FLOW MANAGEMENT ----
const elapsedRound = frame.t - room.state.roundStart;
if (room.state.phase === 'play' && elapsedRound >= roundDuration) {
  room.state.phase = 'winner';
  room.state.phaseT = frame.t;
  // Congratulatory fireworks
  for (let k = 0; k < 6; k++) {
    blastParticles(W * (0.2 + 0.12 * k), H * 0.4, (k * 60) % 360, 25);
  }
} else if (room.state.phase === 'winner' && (frame.t - room.state.phaseT) > 6.0) {
  // Auto restart next round
  room.state.phase = 'play';
  room.state.roundStart = frame.t;
  room.state.notes.length = 0;
  for (const k in room.state.scores) {
    room.state.scores[k].score = 0;
    room.state.scores[k].combo = 0;
  }
}

// ---- SPAWN NOTES ----
if (room.state.phase === 'play') {
  if (frame.t >= room.state.nextSpawnT) {
    const count = (audio.beat || Math.random() < 0.25) ? 2 : 1;
    const used = new Set();
    for (let c = 0; c < count; c++) {
      let lane = Math.floor(Math.random() * laneCount);
      if (!used.has(lane)) {
        used.add(lane);
        room.state.notes.push({
          id: Math.random(),
          lane,
          targetT: frame.t + travelDuration,
          hit: false,
          missed: false,
          colorHue: null
        });
      }
    }
    const tempoInterval = (0.55 / tempoSpeed) * (audio.beat ? 0.7 : 1.0);
    room.state.nextSpawnT = frame.t + Math.max(0.24, tempoInterval);
  }
}

// ---- PROCESS INPUT EVENTS (TRIGGER 'hit') ----
const events = room.events || [];
for (const ev of events) {
  if (ev.name === 'hit') {
    room.state.lastEventT = frame.t;
    if (room.state.phase !== 'play') continue;

    const pId = ev.participantId || 'guest';
    const person = activePeople.find(p => p.id === pId);
    const hue = (person && typeof person.hue === 'number') ? person.hue : 45;
    const displayName = person ? (person.table ? `${person.table}` : `P-${person.id.slice(0, 4)}`) : 'You';

    room.state.scores[pId] ??= { name: displayName, hue, score: 0, combo: 0, maxCombo: 0, hits: 0 };
    const player = room.state.scores[pId];
    player.hue = hue;
    player.name = displayName;

    // Find the closest unhit note within hit window
    let bestNote = null;
    let bestDiff = 999;
    for (const note of room.state.notes) {
      if (!note.hit && !note.missed) {
        const diff = Math.abs(frame.t - note.targetT);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestNote = note;
        }
      }
    }

    const hitWindow = 0.28;
    if (bestNote && bestDiff <= hitWindow) {
      bestNote.hit = true;
      bestNote.colorHue = hue;
      player.hits++;
      player.combo++;
      if (player.combo > player.maxCombo) player.maxCombo = player.combo;

      let points = 50;
      let rating = 'GOOD';
      if (bestDiff < 0.08) {
        points = 300;
        rating = 'PERFECT!';
      } else if (bestDiff < 0.16) {
        points = 150;
        rating = 'GREAT';
      }
      const comboBonus = Math.min(4, 1 + Math.floor(player.combo / 5) * 0.5);
      const totalPoints = Math.round(points * comboBonus);
      player.score += totalPoints;

      const noteX = getLaneX(bestNote.lane, laneCount, 1.0);
      blastParticles(noteX, strikeY, hue, rating === 'PERFECT!' ? 35 : 20);
      addPopup(`${rating} +${totalPoints}`, noteX, strikeY - 30, hue, rating === 'PERFECT!' ? 1.4 : 1.0);
    } else {
      // Missed tap
      player.combo = 0;
      addPopup('MISS', W * 0.5, strikeY - 10, 0, 0.9);
    }
  }
}

// ---- ATTRACT AUTO-BOT PLAY ----
if (isAttract && room.state.phase === 'play') {
  for (const note of room.state.notes) {
    if (!note.hit && !note.missed && Math.abs(frame.t - note.targetT) < 0.04) {
      note.hit = true;
      const demoHue = (frame.t * 70) % 360;
      note.colorHue = demoHue;
      room.state.scores['demo'] ??= { name: 'AUTO-DEMO', hue: 190, score: 0, combo: 0, maxCombo: 0, hits: 0 };
      const bot = room.state.scores['demo'];
      bot.combo++;
      bot.score += 250;
      const nx = getLaneX(note.lane, laneCount, 1.0);
      blastParticles(nx, strikeY, demoHue, 18);
      addPopup('AUTO HIT!', nx, strikeY - 24, demoHue, 1.1);
      break;
    }
  }
}

// Mark missed notes
for (const note of room.state.notes) {
  if (!note.hit && !note.missed && (frame.t - note.targetT) > 0.28) {
    note.missed = true;
  }
}

// ---- DRAWING ----

// 1. Dark Background & Cyber Horizon
ctx.fillStyle = theme.bg;
ctx.fillRect(0, 0, W, H);

// Perspective Ground Grid
ctx.strokeStyle = theme.grid;
ctx.lineWidth = 1.2;
const gridLines = 14;
for (let i = 0; i < gridLines; i++) {
  const rowT = (frame.t * 0.6 + i / gridLines) % 1.0;
  const gy = vpY + (H - vpY) * Math.pow(rowT, 2.2);
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(W, gy);
  ctx.stroke();
}

// Audio flank visualizers (party crowd / synth towers)
const sideBars = 10;
for (let i = 0; i < sideBars; i++) {
  const barH = 20 + Math.sin(frame.t * 4 + i) * 15 + (audio.mid || 0) * 120 * ((i % 3) + 1);
  const alpha = 0.3 + 0.3 * Math.sin(i * 0.8 + frame.t);
  // Left side
  ctx.fillStyle = `hsla(${(frame.t * 30 + i * 20) % 360}, 90%, 55%, ${alpha})`;
  ctx.fillRect(W * 0.02 + i * (W * 0.011), H * 0.78 - barH, W * 0.008, barH);
  // Right side
  ctx.fillRect(W * 0.98 - (i + 1) * (W * 0.011), H * 0.78 - barH, W * 0.008, barH);
}

// 2. Glowing Perspective Highway Body
ctx.save();
ctx.beginPath();
ctx.moveTo(vpX - highwayTopW * 0.5, vpY);
ctx.lineTo(vpX + highwayTopW * 0.5, vpY);
ctx.lineTo(vpX + highwayBotW * 0.5, H);
ctx.lineTo(vpX - highwayBotW * 0.5, H);
ctx.closePath();
ctx.fillStyle = theme.lane;
ctx.fill();
ctx.lineWidth = 3;
ctx.strokeStyle = theme.strike;
if (bloomGlow) {
  ctx.shadowColor = theme.strike;
  ctx.shadowBlur = 12 + (audio.bass || 0) * 18;
}
ctx.stroke();
ctx.restore();

// Lane divider lines
ctx.save();
ctx.strokeStyle = theme.grid;
ctx.lineWidth = 1.8;
ctx.setLineDash([12, 16]);
ctx.lineDashOffset = -frame.t * 80 * tempoSpeed;
for (let l = 1; l < laneCount; l++) {
  const topX = (vpX - highwayTopW * 0.5) + (highwayTopW / laneCount) * l;
  const botX = (vpX - highwayBotW * 0.5) + (highwayBotW / laneCount) * l;
  ctx.beginPath();
  ctx.moveTo(topX, vpY);
  ctx.lineTo(botX, H);
  ctx.stroke();
}
ctx.restore();

// 3. Strike Line
ctx.save();
const strikeL = vpX - (highwayTopW + (highwayBotW - highwayTopW) * ((strikeY - vpY) / (H - vpY))) * 0.5;
const strikeR = vpX + (highwayTopW + (highwayBotW - highwayTopW) * ((strikeY - vpY) / (H - vpY))) * 0.5;
ctx.lineWidth = 6 + (audio.beat ? 4 : 0);
ctx.strokeStyle = theme.strike;
if (bloomGlow) {
  ctx.shadowColor = theme.strike;
  ctx.shadowBlur = 16 + (audio.bass || 0) * 20;
}
ctx.beginPath();
ctx.moveTo(strikeL - 10, strikeY);
ctx.lineTo(strikeR + 10, strikeY);
ctx.stroke();

// Lane strike receptor pads
for (let l = 0; l < laneCount; l++) {
  const rx = getLaneX(l, laneCount, (strikeY - vpY) / (H - vpY));
  ctx.fillStyle = theme.bar;
  ctx.beginPath();
  ctx.roundRect(rx - 24, strikeY - 10, 48, 20, 6);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
ctx.restore();

// 4. Notes Rendering
ctx.save();
for (const note of room.state.notes) {
  if (note.hit && (frame.t - note.targetT) > 0.15) continue;
  if (note.missed && (frame.t - note.targetT) > 0.4) continue;

  const timeRemaining = note.targetT - frame.t;
  const progress = 1.0 - (timeRemaining / travelDuration);
  if (progress < 0 || progress > 1.25) continue;

  // Perspective projection curve
  const yCurve = Math.pow(Math.max(0, progress), 2.0);
  const ny = vpY + (strikeY - vpY) * yCurve;
  const wRatio = (ny - vpY) / (H - vpY);
  const nx = getLaneX(note.lane, laneCount, wRatio);

  const currentLaneW = (highwayTopW + (highwayBotW - highwayTopW) * wRatio) / laneCount;
  const noteW = currentLaneW * 0.78;
  const noteH = Math.max(8, 26 * wRatio);

  const noteHue = note.hit ? (note.colorHue ?? 60) : ((note.lane * 65 + 180) % 360);
  const alpha = note.missed ? Math.max(0, 1.0 - (frame.t - note.targetT) * 2.5) : 1.0;

  ctx.fillStyle = `hsla(${noteHue}, 100%, ${note.hit ? '80%' : '55%'}, ${alpha})`;
  if (bloomGlow && !note.missed) {
    ctx.shadowColor = `hsl(${noteHue}, 100%, 60%)`;
    ctx.shadowBlur = 10 + wRatio * 14;
  } else {
    ctx.shadowBlur = 0;
  }

  ctx.beginPath();
  ctx.roundRect(nx - noteW * 0.5, ny - noteH * 0.5, noteW, noteH, 6 * wRatio + 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}
ctx.restore();

// 5. Particles Update & Draw
ctx.save();
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  const age = frame.t - p.spawnT;
  if (age >= p.life) {
    room.state.particles.splice(i, 1);
    continue;
  }
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  p.vy += 220 * frame.dt; // gravity
  const alpha = 1.0 - age / p.life;

  ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${alpha})`;
  if (bloomGlow) {
    ctx.shadowColor = `hsl(${p.hue}, 100%, 55%)`;
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * (1 - age / p.life), 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// 6. Floating Feedback Texts
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
for (let i = room.state.floatingText.length - 1; i >= 0; i--) {
  const ft = room.state.floatingText[i];
  const age = frame.t - ft.spawnT;
  if (age >= 0.7) {
    room.state.floatingText.splice(i, 1);
    continue;
  }
  const curY = ft.y - age * 65;
  const alpha = 1.0 - Math.pow(age / 0.7, 2);
  const scale = ft.scale * (1.0 + age * 0.4);

  ctx.save();
  ctx.translate(ft.x, curY);
  ctx.scale(scale, scale);
  ctx.font = '900 24px system-ui, sans-serif';
  ctx.fillStyle = ft.color;
  ctx.globalAlpha = alpha;
  if (bloomGlow) {
    ctx.shadowColor = ft.color;
    ctx.shadowBlur = 12;
  }
  ctx.fillText(ft.text, 0, 0);
  ctx.restore();
}
ctx.restore();

// 7. Top Header: Round Timer & Title
ctx.save();
const timeLeft = Math.max(0, Math.ceil(roundDuration - elapsedRound));
ctx.font = '900 26px system-ui, sans-serif';
ctx.fillStyle = '#ffffff';
ctx.textAlign = 'left';
ctx.fillText('⚡ NEON RHYTHM', W * 0.04, H * 0.07);

// Round progress bar
const barW = Math.min(W * 0.45, 420);
const barX = W * 0.5 - barW * 0.5;
const barY = H * 0.05;
ctx.fillStyle = '#10142a';
ctx.beginPath();
ctx.roundRect(barX, barY, barW, 16, 8);
ctx.fill();

const progressFill = room.state.phase === 'play' ? (1.0 - elapsedRound / roundDuration) : 0;
ctx.fillStyle = theme.strike;
if (bloomGlow) {
  ctx.shadowColor = theme.strike;
  ctx.shadowBlur = 10;
}
ctx.beginPath();
ctx.roundRect(barX, barY, barW * Math.max(0, progressFill), 16, 8);
ctx.fill();

ctx.font = '800 18px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.fillStyle = '#ffffff';
ctx.fillText(room.state.phase === 'play' ? `TIME: ${timeLeft}s` : 'ROUND OVER!', W * 0.5, barY + 36);
ctx.restore();

// 8. Live Leaderboard (Top 5)
ctx.save();
const scoresArr = Object.values(room.state.scores).sort((a, b) => b.score - a.score);
const boardX = W * 0.04;
const boardY = H * 0.12;
const boardW = 230;

ctx.fillStyle = 'rgba(6, 8, 22, 0.85)';
ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.roundRect(boardX, boardY, boardW, 36 + Math.min(5, scoresArr.length || 1) * 34, 10);
ctx.fill();
ctx.stroke();

ctx.font = '800 15px system-ui, sans-serif';
ctx.fillStyle = theme.strike;
ctx.textAlign = 'left';
ctx.fillText('LEADERBOARD', boardX + 16, boardY + 24);

if (scoresArr.length === 0) {
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = '#8f9bb3';
  ctx.fillText('Tap HIT to join!', boardX + 16, boardY + 52);
} else {
  const top5 = scoresArr.slice(0, 5);
  top5.forEach((p, idx) => {
    const entryY = boardY + 54 + idx * 32;
    // Player color dot
    ctx.fillStyle = `hsl(${p.hue}, 100%, 60%)`;
    ctx.beginPath();
    ctx.arc(boardX + 18, entryY - 4, 6, 0, Math.PI * 2);
    ctx.fill();

    // Name
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${idx + 1}. ${p.name.slice(0, 9)}`, boardX + 32, entryY);

    // Score & Combo
    ctx.textAlign = 'right';
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.fillStyle = theme.accent;
    ctx.fillText(`${p.score}`, boardX + boardW - 14, entryY);
    ctx.textAlign = 'left';
  });
}
ctx.restore();

// 9. Attract / Active Player Banners
ctx.save();
if (isAttract) {
  const pulse = 0.7 + 0.3 * Math.sin(frame.t * 6);
  ctx.textAlign = 'center';
  ctx.font = '900 24px system-ui, sans-serif';
  ctx.fillStyle = `rgba(255, 230, 0, ${pulse})`;
  if (bloomGlow) {
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 14;
  }
  ctx.fillText('★ ATTRACT DEMO • PRESS "HIT" TO PLAY ★', W * 0.5, H * 0.94);
} else {
  ctx.textAlign = 'center';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillStyle = '#a0acc4';
  ctx.fillText(`${activePeople.length} PLAYER${activePeople.length === 1 ? '' : 'S'} IN ARENA • TAP ON THE BEAT!`, W * 0.5, H * 0.94);
}
ctx.restore();

// 10. Round Winner Celebration Overlay
if (room.state.phase === 'winner') {
  ctx.save();
  ctx.fillStyle = 'rgba(4, 5, 14, 0.75)';
  ctx.fillRect(0, 0, W, H);

  const winner = scoresArr[0] ?? { name: 'Nobody', score: 0, hue: 60 };
  const timeInWinner = frame.t - room.state.phaseT;
  const popScale = Math.min(1.0, timeInWinner * 3.0);

  ctx.translate(W * 0.5, H * 0.45);
  ctx.scale(popScale, popScale);

  ctx.textAlign = 'center';
  ctx.font = '900 48px system-ui, sans-serif';
  ctx.fillStyle = '#ffdf00';
  if (bloomGlow) {
    ctx.shadowColor = '#ffdf00';
    ctx.shadowBlur = 25;
  }
  ctx.fillText('🏆 WINNER! 🏆', 0, -60);

  ctx.font = '900 64px system-ui, sans-serif';
  ctx.fillStyle = `hsl(${winner.hue}, 100%, 65%)`;
  ctx.shadowColor = `hsl(${winner.hue}, 100%, 60%)`;
  ctx.shadowBlur = 20;
  ctx.fillText(winner.name, 0, 15);

  ctx.font = '800 32px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 0;
  ctx.fillText(`FINAL SCORE: ${winner.score}`, 0, 75);

  const nextIn = Math.max(1, Math.ceil(6.0 - timeInWinner));
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillStyle = '#8ea1c7';
  ctx.fillText(`Next round starting in ${nextIn}...`, 0, 130);
  ctx.restore();
}

ctx.restore();