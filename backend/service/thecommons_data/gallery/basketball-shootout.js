const W = frame.width;
const H = frame.height;

const themes = {
  cyber_arena: { bg: '#080814', floor1: '#0d1124', floor2: '#161c3a', c0: '#00f0ff', c1: '#ff2a6d', spot: 'rgba(0, 240, 255, 0.12)', spot1: 'rgba(255, 42, 109, 0.12)' },
  golden_stadium: { bg: '#0a0d18', floor1: '#141824', floor2: '#22283a', c0: '#00e5ff', c1: '#ffb300', spot: 'rgba(0, 229, 255, 0.12)', spot1: 'rgba(255, 179, 0, 0.12)' },
  retro_synth: { bg: '#0d0618', floor1: '#1b0d2e', floor2: '#2a1445', c0: '#00ffcc', c1: '#f000ff', spot: 'rgba(0, 255, 204, 0.12)', spot1: 'rgba(240, 0, 255, 0.12)' }
};
const theme = themes[getVar('court_theme')] ?? themes.cyber_arena;
const meterSpeed = getVar('meter_speed') ?? 1.4;
const showTrails = getVar('ball_trail') ?? true;
const hypeModes = { steady: 1.0, electric: 1.4, overdrive: 1.8 };
const hypeMult = hypeModes[getVar('crowd_hype')] ?? hypeModes.electric;

room.state.scores ??= [0, 0];
room.state.phase ??= 'playing';
room.state.timer ??= 45.0;
room.state.lastInputT ??= 0;
room.state.nextBotT ??= 1.0;
room.state.balls ??= [];
room.state.particles ??= [];
room.state.floatTexts ??= [];
room.state.netBounce ??= [0, 0];
room.state.rimShake ??= [0, 0];
room.state.flash ??= 0;
room.state.playerJump ??= {};

const people = room.people || [];
const tables = [...new Set(people.map(p => p.table).filter(Boolean))];
const getTeam = (p, idx) => {
  if (!p) return idx % 2;
  if (tables.length > 1) {
    const tIdx = tables.indexOf(p.table);
    return (tIdx >= 0 ? tIdx : idx) % 2;
  }
  return idx % 2;
};

const hoop0 = { x: W * 0.30, y: H * 0.42, w: W * 0.075 };
const hoop1 = { x: W * 0.70, y: H * 0.42, w: W * 0.075 };
const hoops = [hoop0, hoop1];

const dt = Math.min(frame.dt || 0.016, 0.05);

if (room.state.phase === 'warmup') {
  room.state.timer -= dt;
  if (room.state.timer <= 0) {
    room.state.phase = 'playing';
    room.state.timer = 45.0;
    room.state.scores = [0, 0];
    room.state.flash = 0.6;
  }
} else if (room.state.phase === 'playing') {
  room.state.timer -= dt;
  if (room.state.timer <= 0) {
    room.state.phase = 'gameover';
    room.state.timer = 6.0;
    room.state.flash = 0.8;
  }
} else if (room.state.phase === 'gameover') {
  room.state.timer -= dt;
  if (room.state.timer <= 0) {
    room.state.phase = 'warmup';
    room.state.timer = 3.2;
  }
}

room.state.flash = Math.max(0, room.state.flash - dt * 2.2);
room.state.netBounce[0] = Math.max(0, room.state.netBounce[0] - dt * 25);
room.state.netBounce[1] = Math.max(0, room.state.netBounce[1] - dt * 25);
room.state.rimShake[0] = Math.max(0, room.state.rimShake[0] - dt * 20);
room.state.rimShake[1] = Math.max(0, room.state.rimShake[1] - dt * 20);

const getNeedle = (team) => Math.sin(frame.t * meterSpeed * 3.4 + team * 2.15);

const fireBall = (team, hue, pId) => {
  if (room.state.phase !== 'playing') return;
  const targetHoop = hoops[team];
  const needle = getNeedle(team);
  const absN = Math.abs(needle);
  let quality = 'miss';
  if (absN < 0.28) quality = 'swish';
  else if (absN < 0.54) quality = 'rim_in';

  let startX = (team === 0 ? W * 0.18 : W * 0.62) + (Math.random() - 0.5) * (W * 0.18);
  let startY = H * 0.90;
  if (pId && room.state.playerPos && room.state.playerPos[pId]) {
    startX = room.state.playerPos[pId].x;
    startY = room.state.playerPos[pId].y;
  }
  if (pId) room.state.playerJump[pId] = frame.t;

  room.state.balls.push({
    team,
    hue,
    startX,
    startY,
    targetX: targetHoop.x + (quality === 'miss' ? (needle > 0 ? 30 : -30) : 0),
    targetY: targetHoop.y,
    t0: frame.t,
    dur: 0.85,
    quality,
    pts: quality === 'swish' ? 3 : 2,
    counted: false,
    trail: []
  });
  if (room.state.balls.length > 36) room.state.balls.shift();
};

for (const e of (room.events || [])) {
  if (e.name === 'shoot') {
    room.state.lastInputT = frame.t;
    const pIdx = people.findIndex(p => p.id === e.participantId);
    const p = pIdx >= 0 ? people[pIdx] : null;
    const team = p ? getTeam(p, pIdx) : (Math.random() < 0.5 ? 0 : 1);
    const hue = p ? p.hue : (team === 0 ? 190 : 340);
    fireBall(team, hue, e.participantId);
  }
}

if (room.state.phase === 'playing' && (frame.t - room.state.lastInputT > 2.8)) {
  if (frame.t > room.state.nextBotT) {
    const botTeam = Math.random() < 0.5 ? 0 : 1;
    const botHue = botTeam === 0 ? 195 : 335;
    fireBall(botTeam, botHue, 'bot_' + botTeam);
    room.state.nextBotT = frame.t + 1.1 + Math.random() * 0.8;
  }
}

ctx.save();
ctx.fillStyle = theme.bg;
ctx.fillRect(0, 0, W, H);

const courtTop = H * 0.52;
const floorGrad = ctx.createLinearGradient(0, courtTop, 0, H);
floorGrad.addColorStop(0, theme.floor1);
floorGrad.addColorStop(1, theme.floor2);
ctx.fillStyle = floorGrad;
ctx.beginPath();
ctx.moveTo(0, courtTop);
ctx.lineTo(W, courtTop);
ctx.lineTo(W, H);
ctx.lineTo(0, H);
ctx.fill();

ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(W * 0.5, courtTop);
ctx.lineTo(W * 0.5, H);
ctx.stroke();

ctx.beginPath();
ctx.ellipse(W * 0.5, H * 0.76, W * 0.14, H * 0.08, 0, 0, Math.PI * 2);
ctx.stroke();

[hoop0.x, hoop1.x].forEach((cx, i) => {
  ctx.strokeStyle = i === 0 ? theme.c0 : theme.c1;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.ellipse(cx, H * 0.78, W * 0.18, H * 0.11, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.08, courtTop);
  ctx.lineTo(cx - W * 0.08, H * 0.82);
  ctx.lineTo(cx + W * 0.08, H * 0.82);
  ctx.lineTo(cx + W * 0.08, courtTop);
  ctx.stroke();
});
ctx.globalAlpha = 1.0;

const bassBoost = (audio.bass || 0) * hypeMult;
[0.15, 0.40, 0.60, 0.85].forEach((lx, i) => {
  const targetX = (i < 2) ? hoop0.x : hoop1.x;
  const spotGrad = ctx.createRadialGradient(W * lx, 0, 10, targetX, hoop0.y + 40, W * 0.35);
  spotGrad.addColorStop(0, i < 2 ? theme.spot : theme.spot1);
  spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = spotGrad;
  ctx.beginPath();
  ctx.moveTo(W * lx - 40, 0);
  ctx.lineTo(W * lx + 40, 0);
  ctx.lineTo(targetX + (i % 2 === 0 ? 90 : -90) + Math.sin(frame.t * 2 + i) * 30, H * 0.85);
  ctx.lineTo(targetX + (i % 2 === 0 ? -90 : 90) + Math.sin(frame.t * 2 + i) * 30, H * 0.85);
  ctx.closePath();
  ctx.globalAlpha = 0.5 + bassBoost * 0.4;
  ctx.fill();
});
ctx.globalAlpha = 1.0;

const drawBoardAndHoop = (hoop, team, color) => {
  const shake = Math.sin(frame.t * 40) * room.state.rimShake[team];
  const hx = hoop.x + shake;
  const hy = hoop.y;

  ctx.fillStyle = '#111522';
  ctx.fillRect(hx - 4, hy - 40, 8, H * 0.45);

  const bw = W * 0.12;
  const bh = H * 0.14;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;
  ctx.fillStyle = 'rgba(15, 20, 35, 0.85)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.fillRect(hx - bw * 0.5, hy - bh * 0.85, bw, bh);
  ctx.strokeRect(hx - bw * 0.5, hy - bh * 0.85, bw, bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.strokeRect(hx - bw * 0.22, hy - bh * 0.55, bw * 0.44, bh * 0.45);
  ctx.restore();

  const meterY = hy - bh * 0.98;
  const mw = bw * 0.95;
  const mh = 14;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(hx - mw * 0.5, meterY, mw, mh);
  ctx.strokeStyle = '#445';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(hx - mw * 0.5, meterY, mw, mh);

  ctx.fillStyle = 'rgba(0, 255, 120, 0.45)';
  ctx.fillRect(hx - mw * 0.14, meterY + 1, mw * 0.28, mh - 2);
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(hx - 2, meterY + 1, 4, mh - 2);

  const needle = getNeedle(team);
  const nx = hx + needle * (mw * 0.48);
  ctx.save();
  ctx.fillStyle = Math.abs(needle) < 0.28 ? '#ffff00' : '#ffffff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(nx, meterY - 4);
  ctx.lineTo(nx + 5, meterY + mh + 4);
  ctx.lineTo(nx - 5, meterY + mh + 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const rw = hoop.w * 0.5;
  ctx.strokeStyle = '#ff6600';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(hx, hy, rw, 8, 0, 0, Math.PI * 2);
  ctx.stroke();

  const bounce = room.state.netBounce[team];
  ctx.strokeStyle = 'rgba(240, 240, 255, 0.85)';
  ctx.lineWidth = 1.5;
  const netH = 34 + bounce;
  const strings = 7;
  for (let s = 0; s <= strings; s++) {
    const topX = hx - rw + (s / strings) * rw * 2;
    const bottomX = hx - (rw * 0.45) + (s / strings) * (rw * 0.9) + Math.sin(frame.t * 12 + s) * (bounce * 0.25);
    ctx.beginPath();
    ctx.moveTo(topX, hy);
    ctx.lineTo(bottomX, hy + netH);
    ctx.stroke();
  }
  for (let r = 1; r <= 3; r++) {
    const frac = r / 3.5;
    ctx.beginPath();
    ctx.ellipse(hx, hy + netH * frac, rw * (1 - frac * 0.5), 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
};

drawBoardAndHoop(hoop0, 0, theme.c0);
drawBoardAndHoop(hoop1, 1, theme.c1);

for (let i = room.state.balls.length - 1; i >= 0; i--) {
  const b = room.state.balls[i];
  const p = (frame.t - b.t0) / b.dur;

  if (p < 1.0) {
    const curX = b.startX + (b.targetX - b.startX) * p;
    const curY = b.startY + (b.targetY - b.startY) * p - 4 * 160 * p * (1 - p);
    const rad = 14 + (1 - p) * 6;

    if (showTrails) {
      b.trail.push({ x: curX, y: curY });
      if (b.trail.length > 8) b.trail.shift();
      ctx.beginPath();
      for (let j = 0; j < b.trail.length; j++) {
        const pt = b.trail[j];
        const alpha = (j + 1) / b.trail.length * 0.4;
        ctx.fillStyle = `hsla(${b.hue}, 90%, 55%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, rad * (0.4 + alpha * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.save();
    ctx.shadowColor = `hsl(${b.hue}, 100%, 50%)`;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ff7b1c';
    ctx.beginPath();
    ctx.arc(curX, curY, rad, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `hsl(${b.hue}, 100%, 70%)`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40, 20, 10, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(curX, curY, rad * 0.65, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  } else {
    if (!b.counted) {
      b.counted = true;
      if (b.quality === 'swish' || b.quality === 'rim_in') {
        room.state.scores[b.team] += b.pts;
        room.state.netBounce[b.team] = 22;
        room.state.flash = Math.min(1.0, room.state.flash + 0.35);
        const txt = b.quality === 'swish' ? 'SWISH! +3' : 'BUCKET! +2';
        room.state.floatTexts.push({ x: b.targetX, y: b.targetY - 15, text: txt, color: b.team === 0 ? theme.c0 : theme.c1, t0: frame.t });
        for (let k = 0; k < 22; k++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 60 + Math.random() * 180;
          room.state.particles.push({
            x: b.targetX,
            y: b.targetY,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd + 40,
            life: 0.8 + Math.random() * 0.5,
            t0: frame.t,
            color: `hsl(${b.hue}, 100%, 65%)`,
            size: 3 + Math.random() * 4
          });
        }
      } else {
        room.state.rimShake[b.team] = 16;
        room.state.floatTexts.push({ x: b.targetX, y: b.targetY - 15, text: 'CLANK!', color: '#aaa', t0: frame.t });
        for (let k = 0; k < 12; k++) {
          room.state.particles.push({
            x: b.targetX + (Math.random() - 0.5) * 20,
            y: b.targetY,
            vx: (Math.random() - 0.5) * 220,
            vy: -80 - Math.random() * 160,
            life: 0.5 + Math.random() * 0.3,
            t0: frame.t,
            color: '#ffcc00',
            size: 2 + Math.random() * 3
          });
        }
      }
    }
    if (p > 1.35) {
      room.state.balls.splice(i, 1);
    }
  }
}

for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const pt = room.state.particles[i];
  const age = frame.t - pt.t0;
  if (age > pt.life) {
    room.state.particles.splice(i, 1);
    continue;
  }
  pt.x += pt.vx * dt;
  pt.y += pt.vy * dt;
  pt.vy += 320 * dt;
  const alpha = 1.0 - (age / pt.life);
  ctx.fillStyle = pt.color;
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
  ctx.fill();
}
ctx.globalAlpha = 1.0;
if (room.state.particles.length > 150) room.state.particles.splice(0, room.state.particles.length - 150);

for (let i = room.state.floatTexts.length - 1; i >= 0; i--) {
  const ft = room.state.floatTexts[i];
  const age = frame.t - ft.t0;
  if (age > 1.1) {
    room.state.floatTexts.splice(i, 1);
    continue;
  }
  const curY = ft.y - age * 55;
  const alpha = 1.0 - age / 1.1;
  ctx.save();
  ctx.font = `900 ${Math.floor(22 + (1.1 - age) * 6)}px "Arial Black", Impact, sans-serif`;
  ctx.fillStyle = ft.color;
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.textAlign = 'center';
  ctx.fillText(ft.text, ft.x, curY);
  ctx.restore();
}
if (room.state.floatTexts.length > 18) room.state.floatTexts.shift();

room.state.playerPos = {};
const teamCounts = [0, 0];
const activePlayers = people.length > 0 ? people : [{ id: 'bot_0', hue: 195 }, { id: 'bot_1', hue: 335 }];

activePlayers.forEach((p, idx) => {
  const team = getTeam(p, idx);
  teamCounts[team]++;
});

const teamSlots = [0, 0];
activePlayers.forEach((p, idx) => {
  const team = getTeam(p, idx);
  const count = Math.max(1, teamCounts[team]);
  const slot = teamSlots[team]++;
  const rangeLeft = team === 0 ? W * 0.05 : W * 0.55;
  const rangeWidth = W * 0.40;
  const spacing = rangeWidth / (count + 1);
  const px = rangeLeft + spacing * (slot + 1);
  const isJumping = (frame.t - (room.state.playerJump[p.id] || -99)) < 0.35;
  const py = H * 0.91 - (isJumping ? 26 : 0) + Math.sin(frame.t * 3 + idx) * 3;
  room.state.playerPos[p.id] = { x: px, y: py };

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(px, H * 0.92, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const jerseyColor = team === 0 ? theme.c0 : theme.c1;
  ctx.fillStyle = jerseyColor;
  ctx.shadowColor = jerseyColor;
  ctx.shadowBlur = isJumping ? 14 : 4;
  ctx.beginPath();
  ctx.roundRect(px - 10, py - 20, 20, 22, 4);
  ctx.fill();

  ctx.fillStyle = `hsl(${p.hue}, 85%, 65%)`;
  ctx.beginPath();
  ctx.arc(px, py - 27, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '900 11px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText((slot + 1).toString(), px, py - 6);
  ctx.restore();
});

const boardW = Math.min(W * 0.58, 640);
const boardH = 80;
const bx = (W - boardW) * 0.5;
const by = 16;

ctx.save();
ctx.fillStyle = '#060a14';
ctx.strokeStyle = '#223048';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.roundRect(bx, by, boardW, boardH, 10);
ctx.fill();
ctx.stroke();

const clockW = 90;
ctx.fillStyle = '#02050c';
ctx.fillRect(W * 0.5 - clockW * 0.5, by + 10, clockW, boardH - 20);
ctx.strokeStyle = '#334460';
ctx.lineWidth = 1.5;
ctx.strokeRect(W * 0.5 - clockW * 0.5, by + 10, clockW, boardH - 20);

const timerSecs = Math.max(0, Math.ceil(room.state.timer));
ctx.font = '900 36px "Courier New", Impact, monospace';
ctx.fillStyle = timerSecs <= 10 && room.state.phase === 'playing' ? '#ff1133' : '#ffb700';
ctx.textAlign = 'center';
ctx.fillText(timerSecs.toString().padStart(2, '0'), W * 0.5, by + 52);

ctx.font = '900 12px sans-serif';
ctx.fillStyle = '#8899aa';
ctx.fillText('SHOT CLOCK', W * 0.5, by + 68);

ctx.font = '900 15px "Arial Black", Impact, sans-serif';
ctx.fillStyle = theme.c0;
ctx.textAlign = 'left';
ctx.fillText('CYAN TEAM', bx + 22, by + 28);
ctx.font = '900 42px "Arial Black", Impact, sans-serif';
ctx.fillText(room.state.scores[0].toString(), bx + 22, by + 68);

ctx.fillStyle = theme.c1;
ctx.textAlign = 'right';
ctx.fillText('HOT TEAM', bx + boardW - 22, by + 28);
ctx.font = '900 42px "Arial Black", Impact, sans-serif';
ctx.fillText(room.state.scores[1].toString(), bx + boardW - 22, by + 68);

const vuX = W * 0.5;
const vuBars = 7;
for (let v = 0; v < vuBars; v++) {
  const vh = (audio.mid || 0.1) * 22 * Math.sin((v + 1) * 0.8 + frame.t * 5);
  ctx.fillStyle = v < 4 ? '#00ffaa' : '#ff0055';
  ctx.fillRect(vuX - 24 + v * 7, by + 4, 5, Math.max(2, Math.abs(vh)));
}
ctx.restore();

if (room.state.phase === 'warmup') {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = '900 68px "Arial Black", Impact, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 25;
  const warmCount = Math.ceil(room.state.timer);
  ctx.fillText(warmCount > 0 ? `GET READY! ${warmCount}` : 'GO!', W * 0.5, H * 0.5);
  ctx.font = '700 24px sans-serif';
  ctx.fillStyle = '#ffea00';
  ctx.fillText('PRESS SHOOT WHEN NEEDLE HITS CENTER!', W * 0.5, H * 0.5 + 50);
  ctx.restore();
} else if (room.state.phase === 'gameover') {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  const s0 = room.state.scores[0];
  const s1 = room.state.scores[1];
  let winnerText = 'IT IS A TIE!';
  let winnerColor = '#ffffff';
  if (s0 > s1) {
    winnerText = 'CYAN TEAM WINS!';
    winnerColor = theme.c0;
  } else if (s1 > s0) {
    winnerText = 'HOT TEAM WINS!';
    winnerColor = theme.c1;
  }

  ctx.font = '900 76px "Arial Black", Impact, sans-serif';
  ctx.fillStyle = winnerColor;
  ctx.shadowColor = winnerColor;
  ctx.shadowBlur = 30;
  ctx.fillText(winnerText, W * 0.5, H * 0.46);

  ctx.font = '900 38px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 10;
  ctx.fillText(`${s0}   -   ${s1}`, W * 0.5, H * 0.56);

  ctx.font = '700 22px sans-serif';
  ctx.fillStyle = '#8899aa';
  ctx.fillText(`NEXT ROUND IN ${Math.max(1, Math.ceil(room.state.timer))}s`, W * 0.5, H * 0.65);
  ctx.restore();
}

if (room.state.flash > 0.01) {
  ctx.fillStyle = `rgba(255, 255, 255, ${room.state.flash * 0.4})`;
  ctx.fillRect(0, 0, W, H);
}

ctx.restore();