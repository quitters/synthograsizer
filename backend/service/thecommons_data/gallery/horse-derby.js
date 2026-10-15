ctx.save();
const W = frame.width, H = frame.height;
const targetDist = getVar('target_distance') ?? 25;
const trackStyle = getVar('track_style') ?? 'Boardwalk Lacquer';
const lightsMode = getVar('carnival_lights') ?? 'Carnival Chase';
const musicBoost = getVar('music_boost') ?? true;

// Persistent game state
room.state.scores ??= {};
room.state.ballEffects ??= [];
room.state.confetti ??= [];
room.state.winnerId ??= null;
room.state.winnerHue ??= 45;
room.state.winnerName ??= '';
room.state.winnerTimer ??= 0;
room.state.lastRollT ??= frame.t;
room.state.attractTimer ??= 0;
room.state.roundCount ??= 1;

const scores = room.state.scores;
const balls = room.state.ballEffects;
const confetti = room.state.confetti;

// Sync active racers with room.people
const people = (room.people && room.people.length > 0)
  ? room.people
  : [
      { id: 'demo-1', table: 'lane-1', hue: 10 },
      { id: 'demo-2', table: 'lane-2', hue: 50 },
      { id: 'demo-3', table: 'lane-3', hue: 140 },
      { id: 'demo-4', table: 'lane-4', hue: 210 },
      { id: 'demo-5', table: 'lane-5', hue: 290 }
    ];

const numRacers = Math.min(people.length, 36);

for (let i = 0; i < numRacers; i++) {
  const p = people[i];
  if (scores[p.id] === undefined) scores[p.id] = 0;
}

// Process rolls from room.events
if (room.events && room.events.length > 0) {
  for (let k = 0; k < room.events.length; k++) {
    const ev = room.events[k];
    if (ev.name === 'roll') {
      room.state.lastRollT = frame.t;
      let pid = ev.participantId;
      if (!pid || scores[pid] === undefined) {
        pid = people[Math.floor(Math.random() * numRacers)].id;
      }
      if (!room.state.winnerId) {
        const points = 1 + Math.floor(Math.random() * 3);
        scores[pid] = (scores[pid] || 0) + points;
        const racerObj = people.find(p => p.id === pid) || people[0];
        if (balls.length < 24) {
          balls.push({
            id: pid,
            hue: racerObj.hue ?? 30,
            points,
            t0: frame.t,
            laneIndex: people.findIndex(p => p.id === pid)
          });
        }
      }
    }
  }
}

// Attract mode if idle
if (!room.state.winnerId && frame.t - room.state.lastRollT > 3.5) {
  room.state.attractTimer += frame.dt;
  const attractInterval = 0.65 - (audio.beat ? 0.3 : 0);
  if (room.state.attractTimer > attractInterval) {
    room.state.attractTimer = 0;
    const randP = people[Math.floor(Math.random() * numRacers)];
    const pts = Math.random() < 0.2 ? 3 : (Math.random() < 0.5 ? 2 : 1);
    scores[randP.id] = (scores[randP.id] || 0) + pts;
    if (balls.length < 24) {
      balls.push({
        id: randP.id,
        hue: randP.hue ?? 30,
        points: pts,
        t0: frame.t,
        laneIndex: people.findIndex(p => p.id === randP.id)
      });
    }
  }
}

// Check winner
if (!room.state.winnerId) {
  for (let i = 0; i < numRacers; i++) {
    const p = people[i];
    if ((scores[p.id] || 0) >= targetDist) {
      room.state.winnerId = p.id;
      room.state.winnerHue = p.hue ?? 40;
      room.state.winnerName = 'LANE ' + (i + 1);
      room.state.winnerTimer = frame.t;
      for (let c = 0; c < 120; c++) {
        confetti.push({
          x: W * 0.5,
          y: H * 0.4,
          vx: (Math.random() - 0.5) * 850,
          vy: -300 - Math.random() * 550,
          hue: (p.hue + Math.random() * 80 - 40 + 360) % 360,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 12,
          size: 8 + Math.random() * 10,
          life: 1.0
        });
      }
      break;
    }
  }
} else {
  if (frame.t - room.state.winnerTimer > 4.5) {
    room.state.winnerId = null;
    room.state.winnerTimer = 0;
    room.state.lastRollT = frame.t;
    room.state.roundCount++;
    for (let k in scores) scores[k] = 0;
    balls.length = 0;
    confetti.length = 0;
  }
}

// Palette definition
let bgGrad = ctx.createLinearGradient(0, 0, 0, H);
if (trackStyle === 'Midnight Neon') {
  bgGrad.addColorStop(0, '#0a0614');
  bgGrad.addColorStop(1, '#020108');
} else if (trackStyle === 'Golden Circus') {
  bgGrad.addColorStop(0, '#1c0a06');
  bgGrad.addColorStop(1, '#0a0302');
} else {
  bgGrad.addColorStop(0, '#180905');
  bgGrad.addColorStop(1, '#0a0403');
}
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

const headerH = Math.max(68, H * 0.11);
const footerH = Math.max(54, H * 0.08);
const trackTop = headerH;
const trackBottom = H - footerH;
const trackH = trackBottom - trackTop;
const laneH = trackH / numRacers;

// Draw Bulb Border
const bulbCountX = Math.floor(W / 28);
const beatPulse = musicBoost ? (audio.bass * 0.8 + (audio.beat ? 0.3 : 0)) : 0;
ctx.lineWidth = 2;
for (let i = 0; i <= bulbCountX; i++) {
  const bx = (i / bulbCountX) * W;
  let lit = false;
  if (lightsMode === 'Strobe Flash') {
    lit = audio.beat || Math.sin(frame.t * 12 + i) > 0.1;
  } else if (lightsMode === 'Steady Glow') {
    lit = true;
  } else {
    lit = ((Math.floor(frame.t * 14) + i) % 3 === 0);
  }
  if (room.state.winnerId) lit = ((Math.floor(frame.t * 22) + i) % 2 === 0);

  const bulbColor = lit
    ? `hsl(${(i * 18 + frame.t * 60) % 360}, 100%, ${65 + beatPulse * 25}%)`
    : '#3a2016';

  ctx.fillStyle = bulbColor;
  ctx.beginPath();
  ctx.arc(bx, 14, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(bx, H - 12, 5.5, 0, Math.PI * 2);
  ctx.fill();
}

// Header Signboard
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.font = '900 ' + Math.min(32, headerH * 0.45) + 'px sans-serif';
ctx.fillStyle = '#fce59f';
ctx.shadowColor = '#e28413';
ctx.shadowBlur = 10 + beatPulse * 15;
const headerTitle = room.state.winnerId
  ? '★ WE HAVE A WINNER! ★'
  : (frame.t - room.state.lastRollT > 3.5 ? '★ READY! PRESS ROLL! ★' : '★ FAIRGROUND DERBY RACER ★');
ctx.fillText(headerTitle, W * 0.5, headerH * 0.42);
ctx.shadowBlur = 0;

ctx.font = '700 ' + Math.min(15, headerH * 0.22) + 'px monospace';
ctx.fillStyle = '#bfa686';
const statusTxt = `ROUND ${room.state.roundCount} • GOAL: ${targetDist} PTS • ${numRacers} RUNNERS`;
ctx.fillText(statusTxt, W * 0.5, headerH * 0.78);

const trackPadL = Math.max(90, W * 0.10);
const trackPadR = Math.max(90, W * 0.10);
const runW = W - trackPadL - trackPadR;
const finishX = trackPadL + runW;

// Finish Line Checkered Banner
const checkW = 16;
const checkRows = Math.floor(trackH / 14);
for (let r = 0; r < checkRows; r++) {
  for (let c = 0; c < 2; c++) {
    ctx.fillStyle = (r + c) % 2 === 0 ? '#f5f5f5' : '#1a1a1a';
    ctx.fillRect(finishX + c * checkW, trackTop + r * 14, checkW, 14);
  }
}

ctx.save();
ctx.translate(finishX + 38, trackTop + trackH * 0.5);
ctx.rotate(Math.PI * 0.5);
ctx.font = '900 13px sans-serif';
ctx.fillStyle = '#ffd700';
ctx.fillText('FINISH', 0, 0);
ctx.restore();

// Horse Lanes
for (let i = 0; i < numRacers; i++) {
  const p = people[i];
  const ly = trackTop + i * laneH;
  const score = scores[p.id] || 0;
  const prog = Math.min(1.0, score / targetDist);
  const hx = trackPadL + prog * runW;
  const isWinner = room.state.winnerId === p.id;

  ctx.fillStyle = (i % 2 === 0)
    ? 'rgba(45, 20, 12, 0.55)'
    : 'rgba(28, 12, 8, 0.55)';
  if (isWinner) {
    ctx.fillStyle = `hsla(${p.hue}, 80%, 25%, ${0.6 + Math.sin(frame.t * 10) * 0.3})`;
  }
  ctx.fillRect(0, ly, W, laneH);

  ctx.strokeStyle = '#3e2417';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, ly + laneH);
  ctx.lineTo(W, ly + laneH);
  ctx.stroke();

  const badgeW = trackPadL * 0.72;
  const badgeH = Math.min(laneH * 0.85, 34);
  const badgeY = ly + (laneH - badgeH) * 0.5;
  ctx.fillStyle = `hsl(${p.hue}, 75%, 38%)`;
  ctx.beginPath();
  ctx.roundRect(14, badgeY, badgeW, badgeH, 6);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.min(15, badgeH * 0.55)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`L${i + 1} • ${score}`, 14 + badgeW * 0.5, badgeY + badgeH * 0.5);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let s = 1; s <= 4; s++) {
    const sx = trackPadL + (runW * s) / 5;
    ctx.beginPath();
    ctx.moveTo(sx, ly + 2);
    ctx.lineTo(sx, ly + laneH - 2);
    ctx.stroke();
  }

  const horseSize = Math.max(16, Math.min(laneH * 0.9, 44));
  const cy = ly + laneH * 0.5;
  const rockPhase = frame.t * (8 + (prog > 0 ? 4 : 0)) + i * 1.3;
  const rockAngle = Math.sin(rockPhase) * (0.12 + beatPulse * 0.08);
  const bobY = Math.abs(Math.sin(rockPhase * 2)) * 4;

  ctx.save();
  ctx.translate(hx, cy - bobY);
  ctx.rotate(rockAngle);

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = Math.max(2, horseSize * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, -horseSize * 0.65);
  ctx.lineTo(0, horseSize * 0.65);
  ctx.stroke();

  ctx.fillStyle = `hsl(${p.hue}, 85%, 52%)`;
  ctx.shadowColor = `hsl(${p.hue}, 100%, 70%)`;
  ctx.shadowBlur = isWinner ? 24 : 8;

  ctx.beginPath();
  ctx.ellipse(0, 0, horseSize * 0.55, horseSize * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(horseSize * 0.2, -horseSize * 0.1);
  ctx.lineTo(horseSize * 0.45, -horseSize * 0.55);
  ctx.lineTo(horseSize * 0.65, -horseSize * 0.38);
  ctx.lineTo(horseSize * 0.5, -horseSize * 0.15);
  ctx.lineTo(horseSize * 0.3, 0.1);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff4ce';
  ctx.beginPath();
  ctx.ellipse(0, -horseSize * 0.1, horseSize * 0.22, horseSize * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffdf00';
  ctx.beginPath();
  ctx.arc(horseSize * 0.25, -horseSize * 0.38, horseSize * 0.1, 0, Math.PI * 2);
  ctx.arc(horseSize * 0.12, -horseSize * 0.26, horseSize * 0.09, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.arc(horseSize * 0.48, -horseSize * 0.38, Math.max(1.5, horseSize * 0.04), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#c4823f';
  ctx.lineWidth = Math.max(1.5, horseSize * 0.06);
  ctx.beginPath();
  ctx.arc(0, -horseSize * 0.1, horseSize * 0.6, 0.38 * Math.PI, 0.62 * Math.PI);
  ctx.stroke();

  ctx.restore();
}

// Lower Counter Ramp
const counterY = trackBottom + 4;
ctx.fillStyle = '#1c0f09';
ctx.fillRect(0, counterY, W, footerH);

ctx.fillStyle = '#d4af37';
ctx.fillRect(0, counterY - 2, W, 4);

const holeCenter = W * 0.5;
const holeSpacing = Math.min(100, W * 0.15);
const holeRadii = [18, 14, 11];
const ptsLabel = [1, 2, 3];

ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
for (let h = 0; h < 3; h++) {
  const hx = holeCenter + (h - 1) * holeSpacing;
  const hy = counterY + footerH * 0.5;
  const hr = holeRadii[h];

  ctx.fillStyle = '#050201';
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e5a93c';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = '900 12px sans-serif';
  ctx.fillText(ptsLabel[h] + ' PT', hx, hy);
}

// Animate Flying Ball Roll Reactions
for (let b = balls.length - 1; b >= 0; b--) {
  const ball = balls[b];
  const age = frame.t - ball.t0;
  const dur = 0.65;
  if (age > dur) {
    balls.splice(b, 1);
    continue;
  }
  const norm = age / dur;
  const targetHoleX = holeCenter + (ball.points - 2) * holeSpacing;
  const laneY = trackTop + (ball.laneIndex + 0.5) * laneH;

  const curX = targetHoleX + (finishX * 0.5 - targetHoleX) * norm * 0.4;
  const curY = (counterY + footerH * 0.5) * (1 - norm) + laneY * norm - Math.sin(norm * Math.PI) * 50;
  const r = 9 * (1 - norm * 0.35);

  ctx.fillStyle = '#f0f0f0';
  ctx.shadowColor = `hsl(${ball.hue}, 100%, 65%)`;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(curX, curY, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = '900 20px sans-serif';
  ctx.fillStyle = `hsl(${ball.hue}, 100%, 75%)`;
  ctx.fillText('+' + ball.points, curX + 16, curY - 10);
}

// Confetti
if (confetti.length > 0) {
  for (let c = confetti.length - 1; c >= 0; c--) {
    const p = confetti[c];
    p.x += p.vx * frame.dt;
    p.y += p.vy * frame.dt;
    p.vy += 850 * frame.dt;
    p.rot += p.vrot * frame.dt;
    p.life -= frame.dt * 0.22;

    if (p.life <= 0 || p.y > H + 40) {
      confetti.splice(c, 1);
      continue;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${Math.min(1, p.life * 1.5)})`;
    ctx.fillRect(-p.size * 0.5, -p.size * 0.25, p.size, p.size * 0.5);
    ctx.restore();
  }
}

// Giant Winner Banner
if (room.state.winnerId) {
  const bannerScale = Math.min(1.0, (frame.t - room.state.winnerTimer) * 3.5);
  const winY = H * 0.46;

  ctx.save();
  ctx.translate(W * 0.5, winY);
  ctx.scale(bannerScale, bannerScale);

  const bw = Math.min(680, W * 0.85);
  const bh = 130;
  ctx.fillStyle = '#0f0502';
  ctx.shadowColor = `hsl(${room.state.winnerHue}, 100%, 60%)`;
  ctx.shadowBlur = 30 + Math.sin(frame.t * 15) * 12;
  ctx.beginPath();
  ctx.roundRect(-bw * 0.5, -bh * 0.5, bw, bh, 18);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffd700';
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.font = '900 48px sans-serif';
  ctx.fillStyle = `hsl(${room.state.winnerHue}, 100%, 65%)`;
  ctx.fillText('WINNER!', 0, -18);

  ctx.font = '900 24px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(room.state.winnerName + ' WINS THE DERBY!', 0, 24);

  ctx.font = '700 13px monospace';
  ctx.fillStyle = '#ffd54f';
  ctx.fillText('NEXT ROUND STARTING SHORTLY...', 0, 48);
  ctx.restore();
}

ctx.restore();