if (!ctx.roundRect) {
  ctx.roundRect = function(x, y, w, h, r) {
    const rad = Math.min(Math.abs(r || 0), Math.abs(w) / 2, Math.abs(h) / 2);
    this.beginPath();
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
    return this;
  };
}

room.state.init ??= false;
room.state.duels ??= [];
room.state.particles ??= [];
room.state.shocks ??= [];
room.state.popups ??= [];
room.state.roundIndex ??= 1;
room.state.phase ??= 'SHAKE';
room.state.phaseTimer ??= 0;
room.state.lastInputTime ??= -100;
room.state.scores ??= {};
room.state.champion ??= null;
room.state.championTimer ??= 0;
room.state.screenShake ??= 0;
room.state.knownPeopleHash ??= '';

const styleKey = getVar('visual_style') ?? 'cyber_arcade';
const pace = Math.max(2, getVar('round_pace') ?? 4);
const bracketFormat = getVar('bracket_format') ?? 'battle_royale';
const crowdCheers = getVar('crowd_cheers') ?? true;
const shakeEnergy = getVar('shake_energy') ?? 1.2;
const dt = Math.min(frame.dt || 0.016, 0.1);
const now = frame.t;

const people = Array.isArray(room.people) ? room.people : [];
const isAttract = (now - room.state.lastInputTime > 5.5) || (people.length === 0);

function getPlayerColor(p) {
  if (!p) return '#94a3b8';
  return `hsl(${p.hue % 360}, 90%, 55%)`;
}

function getPlayerGlow(p) {
  if (!p) return 'rgba(148,163,184,0.3)';
  return `hsla(${p.hue % 360}, 95%, 65%, 0.45)`;
}

function buildRoster() {
  const pool = [];
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    pool.push({
      id: p.id,
      name: `PLAYER ${i + 1}`,
      hue: (typeof p.hue === 'number') ? p.hue : ((i * 73) % 360),
      isBot: false,
      choice: null,
      locked: false
    });
  }
  const botNames = ['NEXUS', 'VIPER', 'SOLAR', 'TITAN', 'CYPHER', 'KRONOS', 'BLAZE', 'PULSE'];
  const botHues = [185, 340, 48, 125, 275, 15, 215, 95];
  let botIdx = 0;
  while (pool.length < 2 || (bracketFormat === 'battle_royale' && pool.length < 4 && pool.length % 2 !== 0)) {
    pool.push({
      id: `bot-${botIdx}`,
      name: `${botNames[botIdx % botNames.length]} [AI]`,
      hue: botHues[botIdx % botHues.length],
      isBot: true,
      choice: null,
      locked: false
    });
    botIdx++;
  }
  if (pool.length % 2 !== 0) {
    pool.push({
      id: `bot-${botIdx}`,
      name: `${botNames[botIdx % botNames.length]} [AI]`,
      hue: botHues[botIdx % botHues.length],
      isBot: true,
      choice: null,
      locked: false
    });
  }

  let duelCount = 1;
  if (bracketFormat === 'battle_royale') {
    duelCount = Math.min(4, Math.floor(pool.length / 2));
  } else if (bracketFormat === 'gauntlet') {
    duelCount = 1;
  } else {
    duelCount = pool.length >= 4 ? 2 : 1;
  }

  const newDuels = [];
  for (let d = 0; d < duelCount; d++) {
    const p1 = pool[d * 2];
    const p2 = pool[d * 2 + 1];
    const oldScore1 = room.state.scores[p1.id] || 0;
    const oldScore2 = room.state.scores[p2.id] || 0;
    newDuels.push({
      id: `duel-${d}`,
      p1: { ...p1, score: oldScore1, choice: null, locked: false },
      p2: { ...p2, score: oldScore2, choice: null, locked: false },
      winnerId: null,
      resultText: '',
      resolved: false
    });
  }
  room.state.duels = newDuels;
}

const currentPeopleHash = people.map(p => p.id).join('|') + `:${bracketFormat}`;
if (!room.state.init || room.state.duels.length === 0 || room.state.knownPeopleHash !== currentPeopleHash) {
  room.state.knownPeopleHash = currentPeopleHash;
  buildRoster();
  room.state.init = true;
}

function spawnParticles(x, y, count, hue, speedMult = 1) {
  for (let i = 0; i < count; i++) {
    if (room.state.particles.length >= 180) room.state.particles.shift();
    const ang = Math.random() * Math.PI * 2;
    const spd = (Math.random() * 8 + 3) * speedMult;
    room.state.particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - (Math.random() * 3),
      hue: hue !== undefined ? hue : Math.floor(Math.random() * 360),
      life: 0.8 + Math.random() * 0.5,
      maxLife: 1.2,
      size: Math.random() * 7 + 4,
      shape: Math.random() > 0.5 ? 'spark' : 'confetti'
    });
  }
}

function spawnShock(x, y, hue, maxR = 180) {
  if (room.state.shocks.length >= 20) room.state.shocks.shift();
  room.state.shocks.push({ x, y, r: 12, maxR, hue, life: 0.5, maxLife: 0.5 });
}

function spawnPopup(text, x, y, hue, size = 38) {
  if (room.state.popups.length >= 25) room.state.popups.shift();
  room.state.popups.push({
    text, x, y,
    vy: -2.2,
    hue,
    size,
    life: 1.1,
    maxLife: 1.1
  });
}

if (Array.isArray(room.events)) {
  for (const e of room.events) {
    if (e.name === 'rock' || e.name === 'paper' || e.name === 'scissors') {
      room.state.lastInputTime = now;
      let matched = false;
      for (const duel of room.state.duels) {
        if (duel.p1.id === e.participantId) {
          duel.p1.choice = e.name;
          duel.p1.locked = true;
          spawnPopup(`${e.name.toUpperCase()}! 🔒`, frame.width * 0.25, frame.height * 0.45, duel.p1.hue, 44);
          spawnParticles(frame.width * 0.25, frame.height * 0.5, 20, duel.p1.hue, 1.4);
          spawnShock(frame.width * 0.25, frame.height * 0.5, duel.p1.hue, 120);
          matched = true;
          break;
        } else if (duel.p2.id === e.participantId) {
          duel.p2.choice = e.name;
          duel.p2.locked = true;
          spawnPopup(`${e.name.toUpperCase()}! 🔒`, frame.width * 0.75, frame.height * 0.45, duel.p2.hue, 44);
          spawnParticles(frame.width * 0.75, frame.height * 0.5, 20, duel.p2.hue, 1.4);
          spawnShock(frame.width * 0.75, frame.height * 0.5, duel.p2.hue, 120);
          matched = true;
          break;
        }
      }
      if (!matched) {
        for (const duel of room.state.duels) {
          if (duel.p1.isBot) {
            duel.p1.id = e.participantId;
            const pObj = people.find(p => p.id === e.participantId);
            duel.p1.hue = pObj ? pObj.hue : Math.floor(Math.random() * 360);
            duel.p1.name = `PLAYER ${e.participantId.slice(0, 4).toUpperCase()}`;
            duel.p1.isBot = false;
            duel.p1.choice = e.name;
            duel.p1.locked = true;
            spawnPopup(`JOINED ✊ ${e.name.toUpperCase()}!`, frame.width * 0.3, frame.height * 0.4, duel.p1.hue, 40);
            spawnParticles(frame.width * 0.3, frame.height * 0.5, 25, duel.p1.hue, 1.5);
            matched = true;
            break;
          } else if (duel.p2.isBot) {
            duel.p2.id = e.participantId;
            const pObj = people.find(p => p.id === e.participantId);
            duel.p2.hue = pObj ? pObj.hue : Math.floor(Math.random() * 360);
            duel.p2.name = `PLAYER ${e.participantId.slice(0, 4).toUpperCase()}`;
            duel.p2.isBot = false;
            duel.p2.choice = e.name;
            duel.p2.locked = true;
            spawnPopup(`JOINED ✋ ${e.name.toUpperCase()}!`, frame.width * 0.7, frame.height * 0.4, duel.p2.hue, 40);
            spawnParticles(frame.width * 0.7, frame.height * 0.5, 25, duel.p2.hue, 1.5);
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        spawnPopup(`LOCKED ${e.name.toUpperCase()}`, frame.width * 0.5, frame.height * 0.2, 50, 36);
      }
    }
  }
}

const shakeDur = pace * 0.65;
const clashDur = pace * 0.45;
const celebrateDur = 1.4;

room.state.phaseTimer += dt;

if (room.state.phase === 'CHAMPION') {
  room.state.championTimer -= dt;
  if (Math.random() < 0.3) {
    spawnParticles(frame.width * 0.5 + (Math.random() - 0.5) * 600, frame.height * 0.4, 6, Math.floor(Math.random() * 360), 1.2);
  }
  if (room.state.championTimer <= 0) {
    room.state.scores = {};
    room.state.champion = null;
    buildRoster();
    room.state.phase = 'SHAKE';
    room.state.phaseTimer = 0;
    room.state.roundIndex++;
  }
} else if (room.state.phase === 'SHAKE') {
  if (isAttract) {
    const moves = ['rock', 'paper', 'scissors'];
    for (const d of room.state.duels) {
      if (!d.p1.locked && room.state.phaseTimer > shakeDur * 0.45) {
        d.p1.choice = moves[Math.floor(Math.random() * 3)];
        d.p1.locked = true;
      }
      if (!d.p2.locked && room.state.phaseTimer > shakeDur * 0.6) {
        d.p2.choice = moves[Math.floor(Math.random() * 3)];
        d.p2.locked = true;
      }
    }
  }
  if (room.state.phaseTimer >= shakeDur) {
    room.state.phase = 'CLASH';
    room.state.phaseTimer = 0;
    room.state.screenShake = 16 * (1 + (audio?.bass || 0) * 1.4);

    const moves = ['rock', 'paper', 'scissors'];
    for (const d of room.state.duels) {
      if (!d.p1.choice) d.p1.choice = moves[Math.floor(Math.random() * 3)];
      if (!d.p2.choice) d.p2.choice = moves[Math.floor(Math.random() * 3)];
      d.p1.locked = true;
      d.p2.locked = true;

      const m1 = d.p1.choice;
      const m2 = d.p2.choice;
      if (m1 === m2) {
        d.winnerId = 'draw';
        d.resultText = 'DRAW! RE-SHAKE!';
      } else if (
        (m1 === 'rock' && m2 === 'scissors') ||
        (m1 === 'scissors' && m2 === 'paper') ||
        (m1 === 'paper' && m2 === 'rock')
      ) {
        d.winnerId = 'p1';
        d.p1.score = (d.p1.score || 0) + 1;
        room.state.scores[d.p1.id] = d.p1.score;
        const verb = m1 === 'rock' ? 'CRUSHES' : (m1 === 'scissors' ? 'SLICES' : 'COVERS');
        d.resultText = `${d.p1.name} ${verb}!`;
      } else {
        d.winnerId = 'p2';
        d.p2.score = (d.p2.score || 0) + 1;
        room.state.scores[d.p2.id] = d.p2.score;
        const verb = m2 === 'rock' ? 'CRUSHES' : (m2 === 'scissors' ? 'SLICES' : 'COVERS');
        d.resultText = `${d.p2.name} ${verb}!`;
      }
      d.resolved = true;
    }
  }
} else if (room.state.phase === 'CLASH') {
  if (room.state.phaseTimer >= clashDur) {
    let champ = null;
    for (const d of room.state.duels) {
      if (d.p1.score >= 3) champ = d.p1;
      if (d.p2.score >= 3) champ = d.p2;
    }
    if (champ) {
      room.state.champion = champ;
      room.state.championTimer = 4.2;
      room.state.phase = 'CHAMPION';
      spawnParticles(frame.width * 0.5, frame.height * 0.4, 70, champ.hue, 2.2);
      spawnShock(frame.width * 0.5, frame.height * 0.4, champ.hue, 320);
    } else {
      room.state.phase = 'CELEBRATE';
      room.state.phaseTimer = 0;
    }
  }
} else if (room.state.phase === 'CELEBRATE') {
  if (room.state.phaseTimer >= celebrateDur) {
    room.state.phase = 'SHAKE';
    room.state.phaseTimer = 0;
    room.state.roundIndex++;
    for (const d of room.state.duels) {
      d.p1.choice = null;
      d.p1.locked = false;
      d.p2.choice = null;
      d.p2.locked = false;
      d.winnerId = null;
      d.resultText = '';
      d.resolved = false;
    }
  }
}

ctx.save();
if (room.state.screenShake > 0.4) {
  const sx = (Math.random() - 0.5) * room.state.screenShake;
  const sy = (Math.random() - 0.5) * room.state.screenShake;
  ctx.translate(sx, sy);
  room.state.screenShake *= 0.86;
}

ctx.fillStyle = '#060712';
ctx.fillRect(0, 0, frame.width, frame.height);

if (styleKey === 'cyber_arcade') {
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.lineWidth = 1.5;
  const horizon = frame.height * 0.45;
  for (let y = horizon; y <= frame.height; y += 45) {
    const p = (y - horizon) / (frame.height - horizon);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(frame.width, y);
    ctx.stroke();
  }
  const vanishX = frame.width * 0.5;
  for (let x = -frame.width * 0.5; x <= frame.width * 1.5; x += 110) {
    ctx.beginPath();
    ctx.moveTo(vanishX, horizon);
    ctx.lineTo(x + ((frame.t * 30) % 110), frame.height);
    ctx.stroke();
  }
  ctx.restore();
} else if (styleKey === 'stadium_lights') {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const sweep1 = Math.sin(frame.t * 0.9) * 0.35;
  const sweep2 = Math.cos(frame.t * 0.7) * 0.35;
  const grad1 = ctx.createRadialGradient(frame.width * 0.2, 0, 10, frame.width * (0.3 + sweep1), frame.height * 0.8, frame.height);
  grad1.addColorStop(0, 'rgba(255, 230, 150, 0.25)');
  grad1.addColorStop(1, 'transparent');
  ctx.fillStyle = grad1;
  ctx.fillRect(0, 0, frame.width, frame.height);

  const grad2 = ctx.createRadialGradient(frame.width * 0.8, 0, 10, frame.width * (0.7 + sweep2), frame.height * 0.8, frame.height);
  grad2.addColorStop(0, 'rgba(100, 200, 255, 0.25)');
  grad2.addColorStop(1, 'transparent');
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.restore();
} else {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 3;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    ctx.beginPath();
    ctx.moveTo(frame.width * 0.5, frame.height * 0.5);
    ctx.lineTo(frame.width * 0.5 + Math.cos(a + frame.t * 0.1) * frame.width, frame.height * 0.5 + Math.sin(a + frame.t * 0.1) * frame.width);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGraphicHand(hx, hy, scale, facing, shape, hue, isWinner, isLoser, isLocked) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(facing * scale, scale);

  if (isWinner) {
    ctx.save();
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 28;
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(10, 0, 75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (isLocked) {
    ctx.save();
    ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
    ctx.lineWidth = 6;
    ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(10, 0, 68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (isLoser) {
    ctx.rotate(-0.35);
    ctx.translate(-25, 10);
  }

  ctx.fillStyle = `hsl(${hue}, 68%, 32%)`;
  ctx.strokeStyle = '#05070e';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-135, -34);
  ctx.lineTo(-42, -28);
  ctx.lineTo(-42, 28);
  ctx.lineTo(-135, 34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `hsl(${hue}, 88%, 68%)`;
  ctx.fillRect(-130, -31, 85, 6);

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(-46, -33, 16, 66, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `hsl(${hue}, 85%, 52%)`;
  ctx.strokeStyle = '#05070e';
  ctx.lineWidth = 7;

  if (shape === 'paper') {
    ctx.beginPath();
    ctx.roundRect(-28, -32, 50, 64, 10);
    ctx.fill();
    ctx.stroke();

    const lens = [74, 82, 76, 62];
    for (let i = 0; i < 4; i++) {
      const fy = -30 + i * 16;
      ctx.beginPath();
      ctx.roundRect(16, fy, lens[i], 14, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `hsl(${hue}, 95%, 75%)`;
      ctx.fillRect(16 + lens[i] - 14, fy + 2, 8, 4);
      ctx.fillStyle = `hsl(${hue}, 85%, 52%)`;
    }

    ctx.save();
    ctx.translate(-8, 16);
    ctx.rotate(0.48);
    ctx.beginPath();
    ctx.roundRect(0, 0, 48, 17, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else if (shape === 'scissors') {
    ctx.beginPath();
    ctx.roundRect(-28, -32, 48, 64, 10);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.translate(14, -10);
    ctx.rotate(-0.25);
    ctx.beginPath();
    ctx.roundRect(0, -8, 80, 16, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `hsl(${hue}, 95%, 75%)`;
    ctx.fillRect(62, -6, 10, 4);
    ctx.restore();

    ctx.save();
    ctx.translate(14, 9);
    ctx.rotate(0.25);
    ctx.beginPath();
    ctx.roundRect(0, -8, 80, 16, 8);
    ctx.fillStyle = `hsl(${hue}, 85%, 52%)`;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `hsl(${hue}, 95%, 75%)`;
    ctx.fillRect(62, -6, 10, 4);
    ctx.restore();

    ctx.fillStyle = `hsl(${hue}, 70%, 38%)`;
    ctx.beginPath();
    ctx.roundRect(5, 12, 24, 14, 7);
    ctx.roundRect(4, 25, 22, 13, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = `hsl(${hue}, 85%, 52%)`;
    ctx.beginPath();
    ctx.roundRect(-4, 2, 36, 17, 8);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.roundRect(-26, -34, 56, 68, 12);
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
      const fy = -30 + i * 16;
      ctx.beginPath();
      ctx.roundRect(26, fy, 25, 15, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `hsl(${hue}, 95%, 75%)`;
      ctx.fillRect(30, fy + 2, 14, 4);
      ctx.fillStyle = `hsl(${hue}, 85%, 52%)`;
    }

    ctx.save();
    ctx.translate(2, 6);
    ctx.rotate(-0.16);
    ctx.beginPath();
    ctx.roundRect(0, -9, 40, 21, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `hsl(${hue}, 95%, 75%)`;
    ctx.fillRect(12, -7, 18, 4);
    ctx.restore();
  }

  if (isWinner) {
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#05070e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-15, -60);
    ctx.lineTo(-5, -45);
    ctx.lineTo(10, -65);
    ctx.lineTo(25, -45);
    ctx.lineTo(35, -60);
    ctx.lineTo(25, -35);
    ctx.lineTo(-5, -35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  if (isLoser) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-20, -25);
    ctx.lineTo(35, 30);
    ctx.moveTo(35, -25);
    ctx.lineTo(-20, 30);
    ctx.stroke();
  }

  ctx.restore();
}

const duelCount = room.state.duels.length;
const cols = duelCount > 2 ? 2 : (duelCount === 2 ? 2 : 1);
const rows = Math.ceil(duelCount / cols);
const topMargin = frame.height * 0.14;
const botMargin = frame.height * 0.08;
const arenaW = frame.width / cols;
const arenaH = (frame.height - topMargin - botMargin) / rows;

for (let i = 0; i < duelCount; i++) {
  const d = room.state.duels[i];
  const c = i % cols;
  const r = Math.floor(i / cols);
  const cx = c * arenaW + arenaW * 0.5;
  const cy = topMargin + r * arenaH + arenaH * 0.5;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.strokeStyle = (audio?.beat) ? 'rgba(255, 255, 255, 0.45)' : 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(cx - arenaW * 0.48, cy - arenaH * 0.48, arenaW * 0.96, arenaH * 0.96, 20);
  ctx.fill();
  ctx.stroke();

  const p1Col = getPlayerColor(d.p1);
  const p2Col = getPlayerColor(d.p2);
  const gradDivider = ctx.createLinearGradient(cx, cy - arenaH * 0.4, cx, cy + arenaH * 0.4);
  gradDivider.addColorStop(0, 'transparent');
  gradDivider.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
  gradDivider.addColorStop(1, 'transparent');
  ctx.strokeStyle = gradDivider;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(cx, cy - arenaH * 0.42);
  ctx.lineTo(cx, cy + arenaH * 0.42);
  ctx.stroke();
  ctx.setLineDash([]);

  const badgeW = arenaW * 0.4;
  ctx.font = '900 20px sans-serif';
  ctx.fillStyle = p1Col;
  ctx.textAlign = 'left';
  ctx.fillText(d.p1.name, cx - arenaW * 0.44, cy - arenaH * 0.38);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 16px sans-serif';
  ctx.fillText(`SCORE: ${'★ '.repeat(d.p1.score || 0)}`, cx - arenaW * 0.44, cy - arenaH * 0.31);

  ctx.font = '900 20px sans-serif';
  ctx.fillStyle = p2Col;
  ctx.textAlign = 'right';
  ctx.fillText(d.p2.name, cx + arenaW * 0.44, cy - arenaH * 0.38);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 16px sans-serif';
  ctx.fillText(`SCORE: ${'★ '.repeat(d.p2.score || 0)}`, cx + arenaW * 0.44, cy - arenaH * 0.31);

  const handScale = Math.min(1.4, Math.max(0.65, (arenaW / 700))) * (1 + (audio?.bass || 0) * 0.12);
  const baseOffset = arenaW * 0.22;
  let hx1 = cx - baseOffset;
  let hx2 = cx + baseOffset;
  let hy1 = cy + arenaH * 0.06;
  let hy2 = cy + arenaH * 0.06;

  let shape1 = 'rock';
  let shape2 = 'rock';
  let rot1 = 0;
  let rot2 = 0;

  if (room.state.phase === 'SHAKE') {
    const subProg = (room.state.phaseTimer / shakeDur) * 3;
    const countStep = Math.min(2, Math.floor(subProg));
    const countFrac = subProg - countStep;
    const bump = Math.sin(countFrac * Math.PI);
    const pump = bump * 48 * shakeEnergy + (audio?.bass || 0) * 20;
    hy1 -= pump;
    hy2 -= pump;
    rot1 = -bump * 0.32 * shakeEnergy;
    rot2 = -bump * 0.32 * shakeEnergy;
    shape1 = 'rock';
    shape2 = 'rock';
  } else {
    shape1 = d.p1.choice || 'rock';
    shape2 = d.p2.choice || 'rock';
    const thrustProg = Math.min(1, room.state.phaseTimer / 0.16);
    const thrust = thrustProg * (arenaW * 0.14);
    hx1 += thrust;
    hx2 -= thrust;
  }

  const p1Wins = d.winnerId === 'p1';
  const p2Wins = d.winnerId === 'p2';
  const isTie = d.winnerId === 'draw';

  ctx.save();
  ctx.translate(hx1, hy1);
  ctx.rotate(rot1);
  drawGraphicHand(0, 0, handScale, 1, shape1, d.p1.hue, p1Wins, p2Wins, d.p1.locked);
  ctx.restore();

  ctx.save();
  ctx.translate(hx2, hy2);
  ctx.rotate(rot2);
  drawGraphicHand(0, 0, handScale, -1, shape2, d.p2.hue, p2Wins, p1Wins, d.p2.locked);
  ctx.restore();

  if (room.state.phase === 'CLASH' || room.state.phase === 'CELEBRATE') {
    const clashX = (hx1 + hx2) * 0.5;
    const clashY = (hy1 + hy2) * 0.5;
    ctx.save();
    ctx.shadowBlur = 24;
    ctx.shadowColor = '#fbbf24';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#05070e';
    ctx.lineWidth = 8;
    ctx.font = '900 38px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bannerText = isTie ? '⚡ DRAW! SUDDEN DEATH ⚡' : d.resultText.toUpperCase();
    ctx.strokeText(bannerText, clashX, cy - arenaH * 0.12);
    ctx.fillText(bannerText, clashX, cy - arenaH * 0.12);
    ctx.restore();
  }

  ctx.restore();
}

for (let i = room.state.shocks.length - 1; i >= 0; i--) {
  const s = room.state.shocks[i];
  s.r += (s.maxR - s.r) * (dt * 14);
  s.life -= dt;
  if (s.life <= 0) {
    room.state.shocks.splice(i, 1);
  } else {
    ctx.save();
    ctx.strokeStyle = `hsla(${s.hue}, 95%, 65%, ${s.life / s.maxLife})`;
    ctx.lineWidth = 7 * (s.life / s.maxLife);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.x += p.vx;
  p.y += p.vy;
  p.vy += 0.22;
  p.life -= dt;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
  } else {
    ctx.save();
    ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${p.life / p.maxLife})`;
    if (p.shape === 'spark') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 1.5);
    }
    ctx.restore();
  }
}

for (let i = room.state.popups.length - 1; i >= 0; i--) {
  const pop = room.state.popups[i];
  pop.y += pop.vy;
  pop.life -= dt;
  if (pop.life <= 0) {
    room.state.popups.splice(i, 1);
  } else {
    const alpha = Math.min(1, pop.life / (pop.maxLife * 0.4));
    ctx.save();
    ctx.font = `900 ${pop.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#05070e';
    ctx.lineWidth = 7;
    ctx.strokeText(pop.text, pop.x, pop.y);
    ctx.fillStyle = `hsla(${pop.hue}, 100%, 70%, ${alpha})`;
    ctx.fillText(pop.text, pop.x, pop.y);
    ctx.restore();
  }
}

ctx.save();
ctx.fillStyle = '#090d1a';
ctx.fillRect(0, 0, frame.width, frame.height * 0.11);
ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(0, frame.height * 0.11);
ctx.lineTo(frame.width, frame.height * 0.11);
ctx.stroke();

ctx.textAlign = 'left';
ctx.font = '900 32px sans-serif';
ctx.fillStyle = '#38bdf8';
ctx.fillText('⚡ RPS CHAMPIONSHIP ⚡', 32, frame.height * 0.07);

ctx.textAlign = 'center';
let centerPrompt = '';
let centerColor = '#facc15';
if (room.state.phase === 'SHAKE') {
  const subP = (room.state.phaseTimer / shakeDur) * 3;
  const step = Math.min(3, Math.floor(subP) + 1);
  if (step === 1) centerPrompt = '① ONE... ROCK!';
  else if (step === 2) centerPrompt = '② TWO... PAPER!';
  else centerPrompt = '③ THREE... SCISSORS!';
  centerColor = '#38bdf8';
} else if (room.state.phase === 'CLASH') {
  centerPrompt = '💥 SHOOT! GO! 💥';
  centerColor = '#f43f5e';
} else if (room.state.phase === 'CELEBRATE') {
  centerPrompt = '★ ROUND COMPLETE ★';
  centerColor = '#10b981';
}
ctx.font = '900 44px sans-serif';
ctx.strokeStyle = '#000000';
ctx.lineWidth = 8;
ctx.strokeText(centerPrompt, frame.width * 0.5, frame.height * 0.07);
ctx.fillStyle = centerColor;
ctx.fillText(centerPrompt, frame.width * 0.5, frame.height * 0.07);

ctx.textAlign = 'right';
ctx.font = '800 20px sans-serif';
ctx.fillStyle = isAttract ? '#fbbf24' : '#94a3b8';
const statusMsg = isAttract ? 'AUTO DEMO • PRESS ✊✋✌️ TO PLAY!' : `👥 ${people.length} PLAYERS • ROUND ${room.state.roundIndex}`;
ctx.fillText(statusMsg, frame.width - 32, frame.height * 0.07);
ctx.restore();

if (room.state.phase === 'CHAMPION' && room.state.champion) {
  ctx.save();
  ctx.fillStyle = 'rgba(5, 7, 18, 0.88)';
  ctx.fillRect(0, 0, frame.width, frame.height);

  const champ = room.state.champion;
  const bounce = Math.sin(frame.t * 6) * 16;
  ctx.textAlign = 'center';
  ctx.font = '900 84px sans-serif';
  ctx.strokeStyle = '#05070e';
  ctx.lineWidth = 14;
  ctx.strokeText('👑 GRAND CHAMPION! 👑', frame.width * 0.5, frame.height * 0.38 + bounce);
  ctx.fillStyle = '#facc15';
  ctx.fillText('👑 GRAND CHAMPION! 👑', frame.width * 0.5, frame.height * 0.38 + bounce);

  ctx.font = '900 68px sans-serif';
  const champHue = champ.hue || 45;
  ctx.strokeStyle = '#05070e';
  ctx.lineWidth = 12;
  ctx.strokeText(champ.name, frame.width * 0.5, frame.height * 0.54 + bounce);
  ctx.fillStyle = `hsl(${champHue}, 95%, 60%)`;
  ctx.fillText(champ.name, frame.width * 0.5, frame.height * 0.54 + bounce);

  ctx.font = '800 32px sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(`VICTORIOUS WITH ${champ.score || 3} WINS!`, frame.width * 0.5, frame.height * 0.65);
  ctx.restore();
}

ctx.restore();