ctx.save();

// --- Configuration & Variable Lookups ---
const styleName = getVar('lane_style') || 'Cyber Neon';
const speedMult = getVar('note_speed') ?? 3.5;
const diffName = getVar('difficulty') || 'Steady';

const themes = {
  'Cyber Neon': {
    bgGrad: ['#040711', '#0a1026'],
    lanePalette: ['#00f0ff', '#ff0077', '#00ff88', '#ffb700', '#a244ff', '#38bdf8'],
    receptorGlow: '#00f0ff',
    gridColor: 'rgba(0, 240, 255, 0.08)'
  },
  'Synthwave': {
    bgGrad: ['#12031e', '#230a38'],
    lanePalette: ['#ff007f', '#00f6ff', '#ffe600', '#a855f7', '#ff6b00', '#34d399'],
    receptorGlow: '#ff007f',
    gridColor: 'rgba(255, 0, 127, 0.08)'
  },
  'Electro Gold': {
    bgGrad: ['#0d0c07', '#211c0f'],
    lanePalette: ['#fbbf24', '#f97316', '#38bdf8', '#f43f5e', '#a3e635', '#c084fc'],
    receptorGlow: '#fbbf24',
    gridColor: 'rgba(251, 191, 36, 0.08)'
  }
};
const theme = themes[styleName] || themes['Cyber Neon'];

const spawnIntervals = { 'Groove': 0.68, 'Steady': 0.44, 'Frenzy': 0.28 };
const spawnInterval = spawnIntervals[diffName] ?? 0.44;

// --- State Initialization ---
room.state.notes ??= [];
room.state.particles ??= [];
room.state.scores ??= {};
room.state.lastSpawn ??= 0;
room.state.noteCounter ??= 0;
room.state.receptorFlashes ??= {};

// --- Lane & Table Layout Setup ---
// Determine participating tables dynamically from connected users, fallback to default 4
const activeTables = [];
if (room.people && room.people.length > 0) {
  for (const p of room.people) {
    const tName = p.table ? String(p.table) : null;
    if (tName && !activeTables.includes(tName)) activeTables.push(tName);
  }
}
const fallbackTables = ['Table 1', 'Table 2', 'Table 3', 'Table 4'];
const tableList = [...activeTables];
for (const fb of fallbackTables) {
  if (tableList.length >= 4) break;
  if (!tableList.includes(fb)) tableList.push(fb);
}
const displayTables = tableList.slice(0, 6);
const numLanes = displayTables.length;

// Ensure score record exists for every visible table
for (const tId of displayTables) {
  room.state.scores[tId] ??= {
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    feedback: '',
    feedbackColor: '#fff',
    feedbackTimer: 0,
    feverUntil: 0
  };
}

// Geometry
const highwayMargin = frame.width * 0.08;
const highwayWidth = frame.width - highwayMargin * 2;
const laneW = highwayWidth / numLanes;
const highwayTop = frame.height * 0.16;
const targetY = frame.height * 0.81;
const highwayBottom = frame.height * 0.94;
const noteH = Math.max(14, frame.height * 0.024);
const baseVelocity = (targetY - highwayTop) / (5.0 / speedMult);

// --- Input Handling: Triggers & Actions ---
if (room.events && room.events.length > 0) {
  for (const e of room.events) {
    // Identify which table triggered this action
    let userTable = e.table ? String(e.table) : null;
    if (!userTable && e.participantId && room.people) {
      const person = room.people.find(p => p.id === e.participantId);
      if (person && person.table) userTable = String(person.table);
    }
    if (!userTable || !displayTables.includes(userTable)) {
      // Map by index or first available table
      userTable = displayTables[0];
    }

    const laneIdx = displayTables.indexOf(userTable);
    const tStats = room.state.scores[userTable];

    if (e.name === 'fever') {
      tStats.feverUntil = frame.t + 6.0;
      tStats.feedback = 'FEVER BOOST! 2X';
      tStats.feedbackColor = '#ffd700';
      tStats.feedbackTimer = frame.t + 1.2;
      // Spawn radiant burst particles
      for (let i = 0; i < 20; i++) {
        const angle = (Math.PI * 2 * i) / 20;
        room.state.particles.push({
          x: highwayMargin + laneIdx * laneW + laneW / 2,
          y: targetY,
          vx: Math.cos(angle) * (120 + Math.random() * 160),
          vy: Math.sin(angle) * (120 + Math.random() * 160),
          color: '#ffd700',
          alpha: 1,
          size: 4 + Math.random() * 4,
          decay: 1.5
        });
      }
    }

    if (e.name === 'hit') {
      room.state.receptorFlashes[laneIdx] = frame.t + 0.22;
      const isFever = frame.t < tStats.feverUntil;
      const mult = isFever ? 2 : 1;

      // Find closest unhit note in player's lane
      let bestNote = null;
      let minDiff = 99999;
      for (const note of room.state.notes) {
        if (note.laneIdx === laneIdx && !note.hit) {
          const diff = Math.abs(note.y - targetY);
          if (diff < minDiff) {
            minDiff = diff;
            bestNote = note;
          }
        }
      }

      const perfectWindow = 26 * (frame.height / 720);
      const greatWindow = 54 * (frame.height / 720);
      const goodWindow = 84 * (frame.height / 720);
      const badWindow = 120 * (frame.height / 720);

      if (bestNote && minDiff <= badWindow) {
        bestNote.hit = true;
        bestNote.hitTime = frame.t;
        let points = 0;
        let rating = '';
        let col = '#ffffff';

        if (minDiff <= perfectWindow) {
          points = 300 * mult;
          rating = 'PERFECT!';
          col = '#00ffcc';
        } else if (minDiff <= greatWindow) {
          points = 180 * mult;
          rating = 'GREAT!';
          col = '#38bdf8';
        } else if (minDiff <= goodWindow) {
          points = 90 * mult;
          rating = 'GOOD';
          col = '#fbbf24';
        } else {
          points = 20 * mult;
          rating = 'POOR';
          col = '#f87171';
        }

        if (rating === 'POOR') {
          tStats.combo = 0;
        } else {
          tStats.combo += 1;
          tStats.maxCombo = Math.max(tStats.maxCombo, tStats.combo);
        }
        tStats.score += points + tStats.combo * 5;
        tStats.hits += 1;
        tStats.feedback = rating;
        tStats.feedbackColor = col;
        tStats.feedbackTimer = frame.t + 0.7;

        // Sparkle burst
        const noteX = highwayMargin + laneIdx * laneW + laneW / 2;
        const pCount = rating === 'PERFECT!' ? 16 : 9;
        for (let i = 0; i < pCount; i++) {
          const speed = (60 + Math.random() * 140) * (rating === 'PERFECT!' ? 1.4 : 1);
          const ang = Math.random() * Math.PI * 2;
          room.state.particles.push({
            x: noteX,
            y: targetY,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed,
            color: col,
            alpha: 1,
            size: 3 + Math.random() * 3,
            decay: 1.8
          });
        }
      } else {
        // Empty tap feedback
        tStats.feedback = 'MISS';
        tStats.feedbackColor = '#ef4444';
        tStats.feedbackTimer = frame.t + 0.45;
        tStats.combo = 0;
      }
    }
  }
}

// --- Note Generation (Tempo & Audio-synced) ---
const beatTrigger = audio && (audio.beat || audio.bass > 0.65);
const timeSinceSpawn = frame.t - room.state.lastSpawn;
const readyToSpawn = timeSinceSpawn >= spawnInterval || (beatTrigger && timeSinceSpawn >= spawnInterval * 0.65);

if (readyToSpawn) {
  room.state.lastSpawn = frame.t;
  // Spawn note for 1 or 2 lanes
  const lanesToSpawn = [];
  const count = (diffName === 'Frenzy' && Math.random() > 0.4) ? 2 : 1;
  while (lanesToSpawn.length < count) {
    const chosen = Math.floor(Math.random() * numLanes);
    if (!lanesToSpawn.includes(chosen)) lanesToSpawn.push(chosen);
  }

  for (const lIdx of lanesToSpawn) {
    room.state.noteCounter++;
    room.state.notes.push({
      id: room.state.noteCounter,
      laneIdx: lIdx,
      y: highwayTop,
      hit: false,
      missed: false,
      spawnTime: frame.t
    });
  }
}

// Cap notes array
if (room.state.notes.length > 100) {
  room.state.notes = room.state.notes.slice(-70);
}

// --- Update Falling Notes & Detect Misses ---
const missDropThreshold = targetY + 48 * (frame.height / 720);
for (const note of room.state.notes) {
  if (!note.hit) {
    note.y += baseVelocity * frame.dt;
    // Missed judgment
    if (note.y > missDropThreshold && !note.missed) {
      note.missed = true;
      note.hit = true; // prevent re-evaluation
      const tId = displayTables[note.laneIdx];
      if (tId && room.state.scores[tId]) {
        room.state.scores[tId].combo = 0;
        room.state.scores[tId].feedback = 'MISS';
        room.state.scores[tId].feedbackColor = '#ef4444';
        room.state.scores[tId].feedbackTimer = frame.t + 0.55;
      }
    }
  }
}

// Clean offscreen notes
room.state.notes = room.state.notes.filter(n => n.y < frame.height + 60 && !(n.hit && frame.t - (n.hitTime || 0) > 0.2));

// --- Update Particles ---
for (const p of room.state.particles) {
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  p.vy += 60 * frame.dt; // slight gravity
  p.alpha -= p.decay * frame.dt;
}
room.state.particles = room.state.particles.filter(p => p.alpha > 0.02);
if (room.state.particles.length > 140) room.state.particles = room.state.particles.slice(-90);

// ==================== RENDERING ====================

// 1. Background Scene
const bgGrad = ctx.createLinearGradient(0, 0, 0, frame.height);
bgGrad.addColorStop(0, theme.bgGrad[0]);
bgGrad.addColorStop(1, theme.bgGrad[1]);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

// Perspective ambient grid lines on outer flanks
ctx.lineWidth = 1;
ctx.strokeStyle = theme.gridColor;
const gridLines = 8;
for (let i = 0; i <= gridLines; i++) {
  const xL = (highwayMargin / gridLines) * i;
  const xR = frame.width - highwayMargin + ((highwayMargin / gridLines) * i);
  ctx.beginPath();
  ctx.moveTo(xL, 0);
  ctx.lineTo(xL, frame.height);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(xR, 0);
  ctx.lineTo(xR, frame.height);
  ctx.stroke();
}

// Audio reactive Equalizer wave in far background
const bassReact = audio ? audio.bass : 0;
const levelReact = audio ? audio.level : 0;
ctx.save();
ctx.globalAlpha = 0.22 + bassReact * 0.25;
ctx.fillStyle = theme.receptorGlow;
const bars = 28;
const barStep = frame.width / bars;
for (let b = 0; b < bars; b++) {
  const barH = (Math.sin(frame.t * 3.5 + b * 0.45) * 0.5 + 0.5) * 35 * (1 + bassReact * 1.5);
  ctx.fillRect(b * barStep + 4, frame.height * 0.12 - barH, barStep - 8, barH);
}
ctx.restore();

// 2. Rhythm Highway Surface
ctx.fillStyle = 'rgba(2, 4, 10, 0.72)';
ctx.fillRect(highwayMargin, highwayTop, highwayWidth, highwayBottom - highwayTop);

// Highway border strokes (pulse with audio bass)
ctx.lineWidth = 2 + bassReact * 3;
ctx.strokeStyle = theme.receptorGlow;
ctx.beginPath();
ctx.moveTo(highwayMargin, highwayTop);
ctx.lineTo(highwayMargin, highwayBottom);
ctx.moveTo(highwayMargin + highwayWidth, highwayTop);
ctx.lineTo(highwayMargin + highwayWidth, highwayBottom);
ctx.stroke();

// 3. Lane Dividers and Sub-glow
for (let i = 0; i < numLanes; i++) {
  const lx = highwayMargin + i * laneW;
  const laneCol = theme.lanePalette[i % theme.lanePalette.length];

  // Subtle lane tint
  ctx.fillStyle = laneCol + '0a';
  ctx.fillRect(lx, highwayTop, laneW, highwayBottom - highwayTop);

  // Lane divider line
  if (i > 0) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(lx, highwayTop);
    ctx.lineTo(lx, highwayBottom);
    ctx.stroke();
  }
}

// 4. Target Judgement Bar / Receptor Line
ctx.save();
const targetPulse = 2 + (audio ? audio.bass * 4 : 0);
ctx.lineWidth = targetPulse;
ctx.strokeStyle = theme.receptorGlow;
ctx.shadowColor = theme.receptorGlow;
ctx.shadowBlur = 12 + targetPulse * 3;
ctx.beginPath();
ctx.moveTo(highwayMargin, targetY);
ctx.lineTo(highwayMargin + highwayWidth, targetY);
ctx.stroke();
ctx.restore();

// Target Receptors per Lane (Hit zones)
for (let i = 0; i < numLanes; i++) {
  const lx = highwayMargin + i * laneW;
  const cx = lx + laneW / 2;
  const laneCol = theme.lanePalette[i % theme.lanePalette.length];
  const isFlash = frame.t < (room.state.receptorFlashes[i] || 0);
  const recW = laneW * 0.74;
  const recH = noteH * 1.35;

  ctx.save();
  ctx.lineWidth = isFlash ? 3.5 : 1.8;
  ctx.strokeStyle = isFlash ? '#ffffff' : laneCol;
  ctx.fillStyle = isFlash ? laneCol + 'aa' : laneCol + '22';
  ctx.shadowColor = laneCol;
  ctx.shadowBlur = isFlash ? 20 : 6;

  // Rounded receptor capsule
  ctx.beginPath();
  const r = 6;
  const rx = cx - recW / 2;
  const ry = targetY - recH / 2;
  ctx.roundRect(rx, ry, recW, recH, r);
  ctx.fill();
  ctx.stroke();

  // Inner receptor glyph
  ctx.fillStyle = isFlash ? '#ffffff' : laneCol;
  ctx.beginPath();
  ctx.arc(cx, targetY, isFlash ? 6 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 5. Falling Notes
for (const note of room.state.notes) {
  if (note.hit && frame.t - (note.hitTime || 0) > 0.08) continue;
  const laneCol = theme.lanePalette[note.laneIdx % theme.lanePalette.length];
  const cx = highwayMargin + note.laneIdx * laneW + laneW / 2;
  const nWidth = laneW * 0.72;
  const nLeft = cx - nWidth / 2;
  const nTop = note.y - noteH / 2;

  ctx.save();
  // Trailing light tail
  const tailLen = Math.min(38, baseVelocity * 0.06);
  const tailGrad = ctx.createLinearGradient(0, nTop - tailLen, 0, nTop);
  tailGrad.addColorStop(0, 'rgba(255,255,255,0)');
  tailGrad.addColorStop(1, laneCol + '99');
  ctx.fillStyle = tailGrad;
  ctx.fillRect(nLeft + 4, nTop - tailLen, nWidth - 8, tailLen);

  // Main Note Body
  ctx.shadowColor = laneCol;
  ctx.shadowBlur = 10 + (audio ? audio.level * 8 : 0);
  ctx.fillStyle = laneCol;
  ctx.beginPath();
  ctx.roundRect(nLeft, nTop, nWidth, noteH, 5);
  ctx.fill();

  // Note bright core reflection
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.roundRect(nLeft + 4, nTop + 2, nWidth - 8, Math.max(3, noteH * 0.35), 3);
  ctx.fill();
  ctx.restore();
}

// 6. Burst Particles
for (const p of room.state.particles) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, p.alpha);
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 7. Hit Feedback Text above receptors
for (let i = 0; i < numLanes; i++) {
  const tId = displayTables[i];
  const tStats = room.state.scores[tId];
  if (tStats && frame.t < tStats.feedbackTimer) {
    const cx = highwayMargin + i * laneW + laneW / 2;
    const remainRatio = (tStats.feedbackTimer - frame.t) / 0.7;
    const alpha = Math.min(1, remainRatio * 1.5);
    const floatY = targetY - 32 - (1 - remainRatio) * 20;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold ' + Math.floor(Math.max(14, laneW * 0.16)) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = tStats.feedbackColor;
    ctx.shadowColor = tStats.feedbackColor;
    ctx.shadowBlur = 12;
    ctx.fillText(tStats.feedback, cx, floatY);
    ctx.restore();
  }
}

// 8. Header Scoreboard (Per-table performance HUD)
for (let i = 0; i < numLanes; i++) {
  const tId = displayTables[i];
  const tStats = room.state.scores[tId];
  const laneCol = theme.lanePalette[i % theme.lanePalette.length];
  const lx = highwayMargin + i * laneW;
  const cx = lx + laneW / 2;
  const hudY = frame.height * 0.035;
  const isFever = frame.t < (tStats?.feverUntil || 0);

  // Table Badge Container
  ctx.save();
  ctx.fillStyle = 'rgba(10, 15, 30, 0.85)';
  ctx.strokeStyle = isFever ? '#ffd700' : laneCol;
  ctx.lineWidth = isFever ? 2.5 : 1.2;
  ctx.shadowColor = isFever ? '#ffd700' : laneCol;
  ctx.shadowBlur = isFever ? 14 : 4;
  ctx.beginPath();
  ctx.roundRect(lx + 4, hudY, laneW - 8, highwayTop - hudY - 8, 8);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Table Name Label
  ctx.save();
  ctx.fillStyle = isFever ? '#ffd700' : '#ffffff';
  ctx.font = 'bold ' + Math.max(12, Math.floor(laneW * 0.12)) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(tId.toUpperCase(), cx, hudY + 18);

  // Score Display
  const scoreStr = (tStats?.score || 0).toLocaleString();
  ctx.fillStyle = laneCol;
  ctx.font = 'bold ' + Math.max(15, Math.floor(laneW * 0.16)) + 'px monospace';
  ctx.fillText(scoreStr, cx, hudY + 38);

  // Combo Counter Badge
  const curCombo = tStats?.combo || 0;
  if (curCombo > 1) {
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold ' + Math.max(10, Math.floor(laneW * 0.10)) + 'px sans-serif';
    ctx.fillText(`${curCombo} COMBO!`, cx, hudY + 54);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = Math.max(9, Math.floor(laneW * 0.085)) + 'px sans-serif';
    ctx.fillText(`BEST ${tStats?.maxCombo || 0}`, cx, hudY + 54);
  }

  // Fever active banner
  if (isFever) {
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('★ 2X FEVER ★', cx, hudY + 68);
  }
  ctx.restore();
}

// 9. Bottom Footer: Instructions & Room Summary
ctx.save();
ctx.textAlign = 'center';
ctx.font = 'bold 13px sans-serif';
ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
ctx.fillText('TAP [HIT / STRIKE] IN TIME WITH THE BEAT • [FEVER BOOST] GRANTS 2X POINTS', frame.width / 2, highwayBottom + 24);

// Highest Table Lead Indicator
let topTable = null;
let maxScore = -1;
for (const tId of displayTables) {
  const s = room.state.scores[tId]?.score || 0;
  if (s > maxScore) {
    maxScore = s;
    topTable = tId;
  }
}
if (topTable && maxScore > 0) {
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#ffd700';
  ctx.fillText(`👑 LEADER: ${topTable} (${maxScore.toLocaleString()} PTS)`, frame.width / 2, highwayBottom + 42);
}
ctx.restore();

ctx.restore();