const P = room.people || [];
const N = Math.max(P.length, 4);
const cx = frame.width * 0.5;
const cy = frame.height * 0.52;
const minDim = Math.min(frame.width, frame.height);
const circleRadius = minDim * 0.38;
const fireRadius = minDim * 0.12;

// Init persistent state
room.state.groove ??= 20;
room.state.lastPressT ??= frame.t;
room.state.lastBeatT ??= frame.t;
room.state.sparks ??= [];
room.state.rings ??= [];
room.state.playerAnim ??= {};
room.state.gameState ??= 'playing';
room.state.stateTimer ??= frame.t;
room.state.winnerHue ??= 30;
room.state.scores ??= {};
room.state.bpmPhase ??= 0;
room.state.fireScale ??= 1.0;
room.state.combo ??= 0;

// Timing & beat detection
const timingWindows = { lenient: 0.22, standard: 0.15, strict: 0.09 };
const hitWindow = timingWindows[getVar('beat_window')] ?? 0.15;
const sparkLimit = getVar('spark_count') ?? 100;
const fxStyle = getVar('strike_fx') ?? 'shockwaves';
const palChoice = getVar('fire_palette') ?? 'amber';

// Fallback synthetic beat if audio is quiet
room.state.bpmPhase += frame.dt * 2.0;
if (room.state.bpmPhase > 1.0) {
  room.state.bpmPhase -= 1.0;
  if (!audio.beat) room.state.lastBeatT = frame.t;
}
if (audio.beat) {
  room.state.lastBeatT = frame.t;
}

// Attract mode: if no one drums for 4.5s, simulate automated spirit strikes on beat
const isAttract = (frame.t - room.state.lastPressT) > 4.5;
if (isAttract && (audio.beat || Math.abs(frame.t - room.state.lastBeatT) < frame.dt * 1.5)) {
  const ghostIdx = Math.floor(frame.t * 1.7) % N;
  const ghostP = P[ghostIdx] || { id: 'ghost_' + ghostIdx, hue: (ghostIdx * 360 / N) % 360 };
  room.events = room.events || [];
  room.events.push({ name: 'drum', participantId: ghostP.id, auto: true });
}

// Process drum triggers
for (const e of (room.events || [])) {
  if (e.name === 'drum') {
    if (!e.auto) room.state.lastPressT = frame.t;
    if (room.state.gameState === 'victory') continue;

    const pIdx = P.findIndex(p => p.id === e.participantId);
    const hue = pIdx >= 0 ? P[pIdx].hue : Math.floor(Math.random() * 360);
    const dtBeat = Math.abs(frame.t - room.state.lastBeatT);
    const isHit = dtBeat <= hitWindow || dtBeat >= (0.5 - hitWindow);

    const key = e.participantId || ('seat_' + (pIdx >= 0 ? pIdx : 0));
    room.state.scores[key] = (room.state.scores[key] || 0) + (isHit ? 10 : -5);
    if (room.state.scores[key] < 0) room.state.scores[key] = 0;

    room.state.playerAnim[key] = { hitT: frame.t, isHit, hue };

    if (isHit) {
      room.state.groove = Math.min(100, room.state.groove + 7.5 + audio.bass * 4);
      room.state.combo++;
      if (room.state.rings.length < 30) {
        const angle = pIdx >= 0 ? (pIdx / N) * Math.PI * 2 - Math.PI * 0.5 : Math.random() * Math.PI * 2;
        room.state.rings.push({
          x: cx + Math.cos(angle) * circleRadius,
          y: cy + Math.sin(angle) * circleRadius,
          tx: cx,
          ty: cy,
          hue,
          progress: 0,
          speed: 2.2,
          good: true
        });
      }
      for (let s = 0; s < 4; s++) {
        if (room.state.sparks.length < sparkLimit * 1.5) {
          room.state.sparks.push({
            x: cx + (Math.random() - 0.5) * 40,
            y: cy + (Math.random() - 0.5) * 30,
            vx: (Math.random() - 0.5) * 160,
            vy: -150 - Math.random() * 260,
            life: 1.0,
            decay: 0.7 + Math.random() * 0.8,
            hue: hue,
            size: 3 + Math.random() * 4
          });
        }
      }
    } else {
      room.state.groove = Math.max(0, room.state.groove - 6);
      room.state.combo = 0;
    }
  }
}

// Natural groove drain over time
room.state.groove = Math.max(0, room.state.groove - frame.dt * 2.8);

// Check victory
if (room.state.gameState === 'playing' && room.state.groove >= 100) {
  room.state.gameState = 'victory';
  room.state.stateTimer = frame.t;
  let maxScore = -1;
  let winHue = 38;
  for (const p of P) {
    const s = room.state.scores[p.id] || 0;
    if (s > maxScore) { maxScore = s; winHue = p.hue; }
  }
  room.state.winnerHue = winHue;
}

// Round restart after celebration
if (room.state.gameState === 'victory' && (frame.t - room.state.stateTimer) > 5.5) {
  room.state.gameState = 'playing';
  room.state.groove = 25;
  room.state.combo = 0;
  room.state.scores = {};
}

// Clear canvas
ctx.save();
ctx.fillStyle = '#06060c';
ctx.fillRect(0, 0, frame.width, frame.height);

// Radial ambient glow
const ambientGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, circleRadius * 1.3);
const isVictory = room.state.gameState === 'victory';
const grooveRatio = room.state.groove / 100;
const pulse = Math.sin(frame.t * 6) * 0.15 + (audio.bass * 0.4);

const palMap = {
  amber: { base: 'rgba(255, 120, 20, ', spark: 32 },
  mystic_blue: { base: 'rgba(40, 160, 255, ', spark: 200 },
  emerald: { base: 'rgba(20, 255, 140, ', spark: 145 },
  solar_violet: { base: 'rgba(220, 60, 255, ', spark: 285 }
};
const curPal = palMap[palChoice] ?? palMap.amber;

ambientGlow.addColorStop(0, curPal.base + (0.35 + grooveRatio * 0.45 + pulse * 0.2) + ')');
ambientGlow.addColorStop(0.5, curPal.base + (0.08 + grooveRatio * 0.15) + ')');
ambientGlow.addColorStop(1, 'rgba(6, 6, 12, 0)');
ctx.fillStyle = ambientGlow;
ctx.beginPath();
ctx.arc(cx, cy, circleRadius * 1.4, 0, Math.PI * 2);
ctx.fill();

// Beat pulse guide ring
const beatPulse = (frame.t - room.state.lastBeatT) / 0.5;
if (beatPulse >= 0 && beatPulse <= 1.0) {
  const ringR = fireRadius + beatPulse * (circleRadius - fireRadius);
  ctx.strokeStyle = 'rgba(255, 255, 255, ' + (1.0 - beatPulse) * 0.45 + ')';
  ctx.lineWidth = 3 + (1.0 - beatPulse) * 4;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();
}

// Target Groove Meter Ring
ctx.lineWidth = 14;
ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
ctx.beginPath();
ctx.arc(cx, cy, fireRadius * 1.35, 0, Math.PI * 2);
ctx.stroke();

ctx.strokeStyle = isVictory ? '#ffffff' : (grooveRatio > 0.8 ? '#ffff44' : curPal.base + '0.95)');
ctx.lineWidth = 14;
ctx.lineCap = 'round';
ctx.beginPath();
ctx.arc(cx, cy, fireRadius * 1.35, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * grooveRatio);
ctx.stroke();
ctx.lineCap = 'butt';

// Update & draw strike shockwaves
for (let i = room.state.rings.length - 1; i >= 0; i--) {
  const r = room.state.rings[i];
  r.progress += frame.dt * r.speed;
  if (r.progress >= 1.0) {
    room.state.rings.splice(i, 1);
    continue;
  }
  const rx = r.x + (r.tx - r.x) * r.progress;
  const ry = r.y + (r.ty - r.y) * r.progress;
  const rad = 14 + r.progress * 30;
  ctx.strokeStyle = `hsla(${r.hue}, 100%, 70%, ${1 - r.progress})`;
  ctx.lineWidth = 5 * (1 - r.progress);
  ctx.beginPath();
  if (fxStyle === 'totem runes') {
    ctx.rect(rx - rad * 0.7, ry - rad * 0.7, rad * 1.4, rad * 1.4);
  } else if (fxStyle === 'starlight') {
    ctx.moveTo(rx, ry - rad);
    ctx.lineTo(rx + rad * 0.4, ry);
    ctx.lineTo(rx, ry + rad);
    ctx.lineTo(rx - rad * 0.4, ry);
    ctx.closePath();
  } else {
    ctx.arc(rx, ry, rad, 0, Math.PI * 2);
  }
  ctx.stroke();
}

// Fire flame height calculation
const targetH = isVictory ? 380 : (fireRadius * (1.1 + grooveRatio * 2.2 + audio.bass * 1.5));
room.state.fireScale += (targetH - room.state.fireScale) * 0.18;

// Spawn active sparks
const sparkRate = isVictory ? 12 : Math.floor(1 + grooveRatio * 5 + audio.treble * 4);
for (let s = 0; s < sparkRate; s++) {
  if (room.state.sparks.length < sparkLimit) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * (fireRadius * 0.6);
    room.state.sparks.push({
      x: cx + Math.cos(a) * d,
      y: cy + Math.sin(a) * d * 0.5,
      vx: (Math.random() - 0.5) * (isVictory ? 260 : 100),
      vy: -(120 + Math.random() * (isVictory ? 500 : 250)),
      life: 1.0,
      decay: (isVictory ? 0.35 : 0.6) + Math.random() * 0.6,
      hue: curPal.spark + (Math.random() * 40 - 20),
      size: (isVictory ? 4 : 2) + Math.random() * 4
    });
  }
}

// Bonfire flames
const flameLayers = isVictory ? 6 : 4;
for (let l = 0; l < flameLayers; l++) {
  const flW = fireRadius * (0.9 - l * 0.12);
  const flH = room.state.fireScale * (1.0 - l * 0.15);
  const flicker = Math.sin(frame.t * 18 + l * 2.1) * (10 + l * 4);
  const flHue = isVictory ? (frame.t * 90 + l * 40) % 360 : (curPal.spark + l * 12);
  
  ctx.fillStyle = `hsla(${flHue}, 100%, ${50 + l * 12}%, ${0.75 - l * 0.1})`;
  ctx.beginPath();
  ctx.moveTo(cx - flW, cy + 10);
  ctx.quadraticCurveTo(cx - flW * 0.8, cy - flH * 0.5, cx + flicker, cy - flH);
  ctx.quadraticCurveTo(cx + flW * 0.8, cy - flH * 0.5, cx + flW, cy + 10);
  ctx.closePath();
  ctx.fill();
}

// Stone hearth
ctx.fillStyle = '#1c1b22';
ctx.strokeStyle = '#383545';
ctx.lineWidth = 3;
const stones = 8;
for (let s = 0; s < stones; s++) {
  const sa = (s / stones) * Math.PI * 2;
  const sx = cx + Math.cos(sa) * fireRadius * 0.95;
  const sy = cy + Math.sin(sa) * fireRadius * 0.55;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 14, 9, sa, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// Update & draw sparks
for (let i = room.state.sparks.length - 1; i >= 0; i--) {
  const sp = room.state.sparks[i];
  sp.x += sp.vx * frame.dt;
  sp.y += sp.vy * frame.dt;
  sp.vy += 80 * frame.dt;
  sp.life -= sp.decay * frame.dt;
  if (sp.life <= 0) {
    room.state.sparks.splice(i, 1);
    continue;
  }
  ctx.fillStyle = `hsla(${sp.hue}, 100%, 75%, ${sp.life})`;
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, sp.size * sp.life, 0, Math.PI * 2);
  ctx.fill();
}

// Drum Circle
for (let i = 0; i < N; i++) {
  const p = P[i];
  const isReal = !!p;
  const hue = p ? p.hue : (i * 360 / N);
  const angle = (i / N) * Math.PI * 2 - Math.PI * 0.5;
  const dx = cx + Math.cos(angle) * circleRadius;
  const dy = cy + Math.sin(angle) * circleRadius;
  const key = p ? p.id : ('seat_' + i);
  const anim = room.state.playerAnim[key];
  const hitElapsed = anim ? (frame.t - anim.hitT) : 99;
  const isHitActive = hitElapsed < 0.35;
  const punch = isHitActive ? Math.sin((hitElapsed / 0.35) * Math.PI) * 12 : 0;
  const drumRadius = Math.max(16, Math.min(36, (minDim * 0.45) / N)) + punch;

  ctx.fillStyle = '#141420';
  ctx.beginPath();
  ctx.ellipse(dx, dy + 8, drumRadius, drumRadius * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isHitActive ? (anim.isHit ? '#ffffff' : '#ff3344') : `hsla(${hue}, 70%, 25%, 0.95)`;
  ctx.strokeStyle = `hsla(${hue}, 90%, ${isHitActive ? '85%' : '55%'}, 1)`;
  ctx.lineWidth = isHitActive ? 6 : 3;
  ctx.beginPath();
  ctx.ellipse(dx, dy, drumRadius, drumRadius * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `hsl(${hue}, 95%, 60%)`;
  ctx.beginPath();
  ctx.arc(dx, dy - drumRadius * 1.05, Math.max(5, drumRadius * 0.3), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (isHitActive) {
    ctx.save();
    ctx.font = '900 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = anim.isHit ? '#44ff88' : '#ff4444';
    ctx.fillText(anim.isHit ? '+PERFECT' : 'MISS', dx, dy - drumRadius * 1.5 - punch);
    ctx.restore();
  }

  const pScore = room.state.scores[key] || 0;
  if (pScore > 0 || isReal) {
    ctx.save();
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(pScore.toString(), dx, dy + drumRadius + 14);
    ctx.restore();
  }
}

// Center Heads-Up Display
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

if (isVictory) {
  ctx.font = '900 ' + Math.floor(minDim * 0.08) + 'px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = `hsl(${room.state.winnerHue}, 100%, 50%)`;
  ctx.shadowBlur = 35;
  ctx.fillText('FULL GROOVE!', cx, cy - minDim * 0.28);
  
  ctx.font = '800 ' + Math.floor(minDim * 0.045) + 'px sans-serif';
  ctx.fillStyle = `hsl(${room.state.winnerHue}, 100%, 75%)`;
  ctx.fillText('ROUND WON - NEXT ROUND SOON', cx, cy - minDim * 0.28 + 50);
} else {
  ctx.font = '900 ' + Math.floor(minDim * 0.038) + 'px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(Math.floor(room.state.groove) + '%', cx, cy + fireRadius * 1.9);

  if (isAttract) {
    ctx.font = '800 24px sans-serif';
    ctx.fillStyle = '#ffaa33';
    ctx.fillText('TAP DRUM ON THE BEAT!', cx, frame.height * 0.94);
  } else if (room.state.combo > 4) {
    ctx.font = '900 26px sans-serif';
    ctx.fillStyle = '#44ffaa';
    ctx.fillText(room.state.combo + 'x STREAK!', cx, frame.height * 0.94);
  } else {
    ctx.font = '800 20px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('STRIKE TOGETHER', cx, frame.height * 0.94);
  }
}

ctx.restore();
ctx.restore();