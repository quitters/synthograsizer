ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.1);

// Controls
const padStyle = getVar('pad_style') ?? 'neon_rings';
const glowMult = getVar('glow_intensity') ?? 1.5;
const ripplesEnabled = getVar('sound_waves') ?? true;
const tempoVar = getVar('tempo') ?? 'brisk';
const tempoSpeeds = { relaxed: 0.9, brisk: 0.55, frenzy: 0.35 };
const flashDuration = tempoSpeeds[tempoVar] ?? 0.55;

// Initialize persistent game state
room.state.seq ??= [0, 1, 2];
room.state.stepIdx ??= 0;
room.state.playbackIdx ??= 0;
room.state.mode ??= 'ATTRACT'; // 'DEMO', 'PLAY', 'SUCCESS', 'FAIL', 'ATTRACT'
room.state.timer ??= 0;
room.state.lastInputTime ??= t;
room.state.particles ??= [];
room.state.ripples ??= [];
room.state.flashPads ??= [0, 0, 0];
room.state.score ??= 0;
room.state.highScore ??= 3;
room.state.lastPlayerHue ??= 180;
room.state.bannerText ??= 'PARTY MEMORY';
room.state.bannerTimer ??= 0;

const S = room.state;

// Colors: 0 = Red, 1 = Green, 2 = Blue
const padHues = [0, 130, 220];
const padColors = ['#ff2b56', '#00ff88', '#009dff'];
const padDarkColors = ['#440915', '#05381d', '#051b3a'];

// Decay pad flash timers
for (let i = 0; i < 3; i++) {
  if (S.flashPads[i] > 0) S.flashPads[i] = Math.max(0, S.flashPads[i] - dt * 2.5);
}
if (S.bannerTimer > 0) S.bannerTimer = Math.max(0, S.bannerTimer - dt);

// Helper to spawn explosion
function spawnBurst(cx, cy, hue, count = 25) {
  for (let i = 0; i < count; i++) {
    if (S.particles.length > 180) S.particles.shift();
    const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const spd = 180 + Math.random() * 380;
    S.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      hue: hue,
      life: 1.0,
      decay: 0.9 + Math.random() * 0.8,
      size: 4 + Math.random() * 6
    });
  }
  if (ripplesEnabled && S.ripples.length < 30) {
    S.ripples.push({ x: cx, y: cy, r: 10, maxR: Math.max(W, H) * 0.6, hue, alpha: 1.0 });
  }
}

// Process input events
let pressedColor = -1;
let presserHue = 60;
if (room.events) {
  for (const e of room.events) {
    let col = -1;
    if (e.name === 'press_red') col = 0;
    else if (e.name === 'press_green') col = 1;
    else if (e.name === 'press_blue') col = 2;
    if (col !== -1) {
      pressedColor = col;
      const person = room.people ? room.people.find(p => p.id === e.participantId) : null;
      presserHue = person ? person.hue : padHues[col];
      S.lastPlayerHue = presserHue;
      S.lastInputTime = t;
      break;
    }
  }
}

// Helper to get Pad X, Y, Radius
function getPadMetrics(idx) {
  const gap = W * 0.05;
  const padW = Math.min((W - gap * 4) / 3, W * 0.28);
  const padH = Math.min(H * 0.45, padW * 1.3);
  const startX = (W - (padW * 3 + gap * 2)) * 0.5;
  const x = startX + idx * (padW + gap) + padW * 0.5;
  const y = H * 0.52;
  return { x, y, padW, padH };
}

// Game Machine Logic
S.timer += dt;
const idleDuration = t - S.lastInputTime;

// Attract mode kicks in after 7s of absolute silence
if (idleDuration > 7 && S.mode !== 'ATTRACT') {
  S.mode = 'ATTRACT';
  S.bannerText = 'RGB WALL: TAP ANY PAD!';
  S.bannerTimer = 999;
  S.timer = 0;
}

if (S.mode === 'ATTRACT') {
  // Automated pleasant rhythmic light dance
  if (S.timer > 0.45) {
    S.timer = 0;
    const nextDancePad = Math.floor((t * 2) % 3);
    S.flashPads[nextDancePad] = 1.0;
    const m = getPadMetrics(nextDancePad);
    spawnBurst(m.x, m.y, padHues[nextDancePad], 6);
  }
  if (pressedColor !== -1) {
    // Start new game on first press
    S.seq = [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)];
    S.score = 0;
    S.mode = 'DEMO';
    S.playbackIdx = 0;
    S.timer = -0.4;
    S.bannerText = 'WATCH SEQUENCE';
    S.bannerTimer = 1.5;
    S.flashPads[pressedColor] = 1.0;
  }
} else if (S.mode === 'DEMO') {
  // Playing sequence to room
  if (S.timer >= flashDuration) {
    S.timer = 0;
    if (S.playbackIdx < S.seq.length) {
      const padToFlash = S.seq[S.playbackIdx];
      S.flashPads[padToFlash] = 1.0;
      const m = getPadMetrics(padToFlash);
      spawnBurst(m.x, m.y, padHues[padToFlash], 12);
      S.playbackIdx++;
    } else {
      // Sequence finished, hand over to room
      S.mode = 'PLAY';
      S.stepIdx = 0;
      S.timer = 0;
      S.bannerText = 'YOUR TURN!';
      S.bannerTimer = 1.8;
    }
  }
} else if (S.mode === 'PLAY') {
  // Waiting for player input
  if (pressedColor !== -1) {
    const target = S.seq[S.stepIdx];
    const m = getPadMetrics(pressedColor);
    S.flashPads[pressedColor] = 1.0;

    if (pressedColor === target) {
      // Correct press
      spawnBurst(m.x, m.y, presserHue, 28);
      S.stepIdx++;
      if (S.stepIdx >= S.seq.length) {
        // Completed this sequence level!
        S.score = S.seq.length;
        if (S.score > S.highScore) S.highScore = S.score;
        S.mode = 'SUCCESS';
        S.timer = 0;
        S.bannerText = 'CORRECT! SCORE: ' + S.score;
        S.bannerTimer = 1.6;
        // Append a new color
        S.seq.push(Math.floor(Math.random() * 3));
      } else {
        S.bannerText = (S.stepIdx) + '/' + S.seq.length;
        S.bannerTimer = 0.8;
      }
    } else {
      // Wrong press! Flash all red and reset
      S.mode = 'FAIL';
      S.timer = 0;
      S.bannerText = 'ROUND OVER! HIGH: ' + S.highScore;
      S.bannerTimer = 2.5;
      S.flashPads = [1.2, 1.2, 1.2];
      for (let i = 0; i < 3; i++) {
        const pm = getPadMetrics(i);
        spawnBurst(pm.x, pm.y, 0, 30);
      }
    }
  }
} else if (S.mode === 'SUCCESS') {
  if (S.timer > 1.2) {
    S.mode = 'DEMO';
    S.playbackIdx = 0;
    S.timer = -0.3;
    S.bannerText = 'ROUND ' + S.seq.length;
    S.bannerTimer = 1.2;
  }
} else if (S.mode === 'FAIL') {
  if (S.timer > 2.8) {
    // Restart fresh sequence
    S.seq = [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)];
    S.score = 0;
    S.mode = 'DEMO';
    S.playbackIdx = 0;
    S.timer = -0.4;
    S.bannerText = 'READY... GO!';
    S.bannerTimer = 1.5;
  }
}

// RENDER
// Rich dark atmosphere with subtle music bass reaction
const bassBoost = audio.bass * 0.15;
ctx.fillStyle = '#06070c';
ctx.fillRect(0, 0, W, H);

// Backdrop ambient glow lines
ctx.lineWidth = 1.5;
ctx.strokeStyle = `rgba(30, 45, 80, ${0.15 + audio.mid * 0.2})`;
const gridY = H * 0.85;
ctx.beginPath();
for (let i = -10; i <= 10; i++) {
  ctx.moveTo(W * 0.5 + i * (W * 0.08), gridY);
  ctx.lineTo(W * 0.5 + i * (W * 0.35), H);
}
ctx.stroke();

// Update & Render Ripples
ctx.save();
for (let i = S.ripples.length - 1; i >= 0; i--) {
  const rip = S.ripples[i];
  rip.r += (rip.maxR - rip.r) * dt * 4.5;
  rip.alpha -= dt * 1.2;
  if (rip.alpha <= 0.02) {
    S.ripples.splice(i, 1);
    continue;
  }
  ctx.strokeStyle = `hsla(${rip.hue}, 100%, 65%, ${rip.alpha * 0.8})`;
  ctx.lineWidth = 3 + (1 - rip.alpha) * 8;
  ctx.beginPath();
  ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
  ctx.stroke();
}
ctx.restore();

// Draw The Three Main Pads
for (let i = 0; i < 3; i++) {
  const { x, y, padW, padH } = getPadMetrics(i);
  const flash = S.flashPads[i];
  const isHot = flash > 0.05;
  const baseHue = padHues[i];
  const audioPulse = (i === 0 ? audio.bass : i === 1 ? audio.mid : audio.treble) * 0.1;
  const scale = 1.0 + (isHot ? flash * 0.06 : 0) + audioPulse;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // External Pad Glow
  if (isHot || audio.level > 0.1) {
    const glowR = (padW * 0.6) * (1 + flash * 0.8 * glowMult);
    const radGrad = ctx.createRadialGradient(0, 0, padW * 0.1, 0, 0, glowR);
    radGrad.addColorStop(0, `hsla(${baseHue}, 100%, 65%, ${0.5 * flash * glowMult})`);
    radGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw Pad Body based on selected style
  const fillCol = isHot
    ? `hsla(${baseHue}, 100%, ${50 + flash * 45}%, 0.95)`
    : padDarkColors[i];
  const borderCol = isHot ? '#ffffff' : padColors[i];

  ctx.lineWidth = 6 + (isHot ? flash * 10 : 0);
  ctx.strokeStyle = borderCol;
  ctx.fillStyle = fillCol;

  if (padStyle === 'neon_rings') {
    const r = padW * 0.45;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Concentric inner ring
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
    ctx.stroke();
  } else if (padStyle === 'crystal_hex') {
    const r = padW * 0.48;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const angle = (Math.PI / 3) * k - Math.PI / 6;
      const hx = Math.cos(angle) * r;
      const hy = Math.sin(angle) * r;
      if (k === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // solid_blocks
    const rw = padW * 0.85;
    const rh = padH * 0.85;
    const cr = 24;
    ctx.beginPath();
    ctx.roundRect(-rw * 0.5, -rh * 0.5, rw, rh, cr);
    ctx.fill();
    ctx.stroke();
  }

  // Pad Label
  const names = ['RED', 'GREEN', 'BLUE'];
  ctx.font = '900 ' + Math.floor(padW * 0.17) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isHot ? '#ffffff' : `hsla(${baseHue}, 90%, 80%, 0.8)`;
  ctx.shadowColor = borderCol;
  ctx.shadowBlur = isHot ? 25 * glowMult : 0;
  ctx.fillText(names[i], 0, 0);
  ctx.shadowBlur = 0;

  // Trigger key prompt sub-label
  ctx.font = '700 ' + Math.floor(padW * 0.08) + 'px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('TRIGGER [' + (i + 1) + ']', 0, padW * 0.32);

  ctx.restore();
}

// Update & Render Particles
ctx.save();
for (let i = S.particles.length - 1; i >= 0; i--) {
  const p = S.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= 0.94;
  p.vy *= 0.94;
  p.life -= p.decay * dt;
  if (p.life <= 0) {
    S.particles.splice(i, 1);
    continue;
  }
  ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.life})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// Draw Players Status Bar (Scales gracefully from 0 to 40+ people)
const people = room.people || [];
const nPeople = people.length;
const barY = H * 0.88;
const barH = 50;

ctx.save();
ctx.fillStyle = 'rgba(15, 20, 32, 0.75)';
ctx.fillRect(W * 0.05, barY - 10, W * 0.9, barH + 20);
ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
ctx.strokeRect(W * 0.05, barY - 10, W * 0.9, barH + 20);

if (nPeople === 0) {
  ctx.font = '600 16px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Waiting for players to connect knobs & triggers...', W * 0.5, barY + 15);
} else {
  const maxSlots = Math.min(nPeople, 40);
  const spacing = Math.min(46, (W * 0.8) / maxSlots);
  const groupW = maxSlots * spacing;
  const startX = (W - groupW) * 0.5 + spacing * 0.5;

  for (let idx = 0; idx < maxSlots; idx++) {
    const p = people[idx];
    const px = startX + idx * spacing;
    const py = barY + 15;
    const isCurrent = Math.abs(p.hue - S.lastPlayerHue) < 5;
    const radius = isCurrent ? 14 : 9;

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.hue}, 85%, 55%)`;
    ctx.shadowColor = `hsl(${p.hue}, 90%, 65%)`;
    ctx.shadowBlur = isCurrent ? 15 : 4;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (isCurrent) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }
}
ctx.restore();

// Draw Top HUD (Score, Level, Giant Prominent Banner)
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Top score & High Score banner
ctx.font = '800 24px monospace';
ctx.fillStyle = '#64748b';
ctx.fillText(`SCORE: ${S.score}   |   BEST: ${S.highScore}   |   STEPS: ${S.seq ? S.seq.length : 0}`, W * 0.5, H * 0.08);

// Big short state message
let bannerText = S.bannerText;
if (S.mode === 'DEMO') {
  bannerText = `WATCH: ${S.playbackIdx} / ${S.seq.length}`;
} else if (S.mode === 'PLAY') {
  bannerText = `YOUR TURN: ${S.stepIdx + 1} / ${S.seq.length}`;
}

const bannerPulse = 1.0 + Math.sin(t * 8) * 0.05;
ctx.save();
ctx.translate(W * 0.5, H * 0.18);
ctx.scale(bannerPulse, bannerPulse);
ctx.font = '900 ' + Math.min(W * 0.055, 62) + 'px sans-serif';

// Dynamic text coloring based on mode
if (S.mode === 'PLAY') {
  ctx.fillStyle = '#00ffcc';
  ctx.shadowColor = '#00ffcc';
} else if (S.mode === 'SUCCESS') {
  ctx.fillStyle = '#55ff77';
  ctx.shadowColor = '#55ff77';
} else if (S.mode === 'FAIL') {
  ctx.fillStyle = '#ff2b56';
  ctx.shadowColor = '#ff2b56';
} else if (S.mode === 'DEMO') {
  ctx.fillStyle = '#ffd000';
  ctx.shadowColor = '#ffd000';
} else {
  ctx.fillStyle = '#e2e8f0';
  ctx.shadowColor = '#38bdf8';
}

ctx.shadowBlur = 20 * glowMult;
ctx.fillText(bannerText, 0, 0);
ctx.restore();

ctx.restore();
ctx.restore();