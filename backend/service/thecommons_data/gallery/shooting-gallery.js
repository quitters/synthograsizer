ctx.save();
const W = frame.width, H = frame.height;
const themeKey = getVar('gallery_theme') ?? 'vintage_carnival';
const duckSpeed = getVar('duck_speed') ?? 1.2;
const motionType = getVar('sight_motion') ?? 'sweep_sine';
const showBulbs = getVar('carnival_bulbs') ?? true;
const roundDuration = getVar('round_duration') ?? 30;

// --- State Initialization ---
room.state.targets ??= [];
room.state.corks ??= [];
room.state.sparks ??= [];
room.state.popups ??= [];
room.state.scores ??= {};
room.state.roundTimer ??= roundDuration;
room.state.roundState ??= 'play'; // 'play' | 'winner'
room.state.winnerT ??= 0;
room.state.winnerInfo ??= null;
room.state.lastActionT ??= frame.t;
room.state.lastAttractPop ??= frame.t;

// Theme paletting
const themes = {
  vintage_carnival: { bg1: '#14081c', bg2: '#07020d', rail: '#b38234', awning1: '#a61c28', awning2: '#f0dfa8', duck: '#f4c430', star: '#df3c3c' },
  midnight_neon:    { bg1: '#050c1a', bg2: '#02050d', rail: '#00e5ff', awning1: '#ff0055', awning2: '#1a113a', duck: '#00ffc4', star: '#ffe600' },
  brass_and_gold:   { bg1: '#17130f', bg2: '#080605', rail: '#e6a13c', awning1: '#542616', awning2: '#c99b50', duck: '#ffcf56', star: '#f78328' }
};
const pal = themes[themeKey] ?? themes.vintage_carnival;

// Populate 3 rails of targets if empty
if (room.state.targets.length === 0) {
  const rowDefs = [
    { row: 0, yRatio: 0.32, speed: 0.18, type: 'star', pts: 30, dir: 1, count: 7 },
    { row: 1, yRatio: 0.50, speed: 0.12, type: 'duck', pts: 20, dir: -1, count: 8 },
    { row: 2, yRatio: 0.68, speed: 0.08, type: 'duck', pts: 10, dir: 1, count: 7 }
  ];
  let idGen = 0;
  for (const def of rowDefs) {
    for (let i = 0; i < def.count; i++) {
      room.state.targets.push({
        id: idGen++,
        row: def.row,
        yRatio: def.yRatio,
        x: i / def.count,
        speed: def.speed * def.dir,
        type: def.type,
        pts: def.pts,
        flipped: 0,
        flipTimer: 0
      });
    }
  }
}

// Determine active players (provide defaults if nobody connected yet)
const peopleList = (room.people && room.people.length > 0) ? room.people : [
  { id: 'demo1', hue: 45 },
  { id: 'demo2', hue: 195 },
  { id: 'demo3', hue: 320 }
];

// Compute crosshair screen positions for players
function getSightPos(p, idx, total) {
  const pIdx = idx >= 0 ? idx : 0;
  const hueOffset = (p.hue ?? 0) * (Math.PI / 180);
  const t = frame.t * 0.9;
  let xNorm = 0.5;
  let yNorm = 0.5;

  if (motionType === 'orbit_wave') {
    xNorm = 0.5 + 0.42 * Math.sin(t * 1.1 + hueOffset + pIdx);
    yNorm = 0.5 + 0.22 * Math.cos(t * 2.2 + hueOffset * 0.7);
  } else if (motionType === 'quick_zigzag') {
    const saw = ((t * 0.7 + pIdx * 0.33) % 2) - 1;
    xNorm = 0.5 + 0.42 * (saw < 0 ? -saw * 2 - 1 : saw * 2 - 1);
    const railStep = Math.floor((t * 0.5 + pIdx) % 3);
    yNorm = 0.32 + railStep * 0.18 + Math.sin(t * 3.5) * 0.04;
  } else {
    // sweep_sine
    xNorm = 0.5 + 0.43 * Math.sin(t * 1.35 + pIdx * 1.5 + hueOffset);
    yNorm = 0.50 + 0.22 * Math.sin(t * 2.7 + pIdx * 0.8 + hueOffset * 0.5);
  }
  return { x: xNorm * W, y: yNorm * H };
}

// --- Round Flow & Timer ---
if (room.state.roundState === 'play') {
  room.state.roundTimer -= frame.dt;
  if (room.state.roundTimer <= 0) {
    room.state.roundState = 'winner';
    room.state.winnerT = frame.t;
    // Pick top scorer
    let bestId = null, bestScore = -1;
    for (const [id, s] of Object.entries(room.state.scores)) {
      if (s > bestScore) { bestScore = s; bestId = id; }
    }
    const winP = peopleList.find(p => p.id === bestId) || peopleList[0];
    room.state.winnerInfo = { id: winP.id, hue: winP.hue, score: Math.max(0, bestScore) };
  }
} else if (room.state.roundState === 'winner') {
  if (frame.t - room.state.winnerT > 4.5) {
    // Auto reset to fresh round
    room.state.roundState = 'play';
    room.state.roundTimer = roundDuration;
    room.state.scores = {};
    for (const tgt of room.state.targets) {
      tgt.flipped = 0;
      tgt.flipTimer = 0;
    }
  }
}

// --- Handle Pop Events ---
const popsToProcess = [];
if (room.events && room.events.length > 0) {
  for (const ev of room.events) {
    if (ev.name === 'pop') {
      room.state.lastActionT = frame.t;
      const pIdx = peopleList.findIndex(p => p.id === ev.participantId);
      const p = pIdx >= 0 ? peopleList[pIdx] : peopleList[0];
      popsToProcess.push({ player: p, index: Math.max(0, pIdx) });
    }
  }
}

// Attract mode auto-pop if quiet for > 4.5 seconds
const isAttract = (frame.t - room.state.lastActionT) > 4.5;
if (isAttract && (frame.t - room.state.lastAttractPop > 0.85)) {
  room.state.lastAttractPop = frame.t;
  const randIdx = Math.floor(Math.random() * peopleList.length);
  popsToProcess.push({ player: peopleList[randIdx], index: randIdx, isBot: true });
}

// Spawn corks for all pops
for (const shot of popsToProcess) {
  if (room.state.corks.length >= 25) room.state.corks.shift();
  const sight = getSightPos(shot.player, shot.index, peopleList.length);
  const startX = W * (0.2 + 0.6 * ((shot.index + 0.5) / Math.max(1, peopleList.length)));
  const startY = H * 0.98;
  room.state.corks.push({
    startX, startY,
    targetX: sight.x, targetY: sight.y,
    t0: frame.t,
    duration: 0.16,
    hue: shot.player.hue ?? 50,
    playerId: shot.player.id
  });
}

// --- Target Rail Simulation ---
for (const tgt of room.state.targets) {
  tgt.x += tgt.speed * duckSpeed * frame.dt;
  if (tgt.x > 1.1) tgt.x = -0.1;
  if (tgt.x < -0.1) tgt.x = 1.1;

  if (tgt.flipped > 0) {
    tgt.flipTimer += frame.dt;
    // Spring back up after 2.8s
    if (tgt.flipTimer > 2.8) {
      tgt.flipped = Math.max(0, tgt.flipped - frame.dt * 4);
      if (tgt.flipped === 0) tgt.flipTimer = 0;
    } else {
      tgt.flipped = Math.min(1, tgt.flipped + frame.dt * 8);
    }
  }
}

// --- Update Corks & Hit Detection ---
for (let i = room.state.corks.length - 1; i >= 0; i--) {
  const c = room.state.corks[i];
  const progress = (frame.t - c.t0) / c.duration;
  if (progress >= 1.0) {
    // Cork reached sight point: check collision with targets
    let hit = null;
    let minDist = 48;
    for (const tgt of room.state.targets) {
      if (tgt.flipped > 0.2) continue;
      const tx = tgt.x * W;
      const ty = tgt.yRatio * H;
      const d = Math.hypot(tx - c.targetX, ty - c.targetY);
      if (d < minDist) {
        minDist = d;
        hit = tgt;
      }
    }

    if (hit) {
      hit.flipped = 0.1;
      hit.flipTimer = 0.01;
      const awarded = hit.pts;
      room.state.scores[c.playerId] = (room.state.scores[c.playerId] || 0) + awarded;

      // Score Popup
      if (room.state.popups.length >= 25) room.state.popups.shift();
      room.state.popups.push({
        x: hit.x * W, y: hit.yRatio * H - 20,
        text: `+${awarded}`,
        hue: c.hue,
        t0: frame.t
      });

      // Spark Clangs
      const sparkCount = 14;
      for (let s = 0; s < sparkCount; s++) {
        if (room.state.sparks.length >= 100) room.state.sparks.shift();
        const ang = Math.random() * Math.PI * 2;
        const spd = 120 + Math.random() * 260;
        room.state.sparks.push({
          x: hit.x * W, y: hit.yRatio * H,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 60,
          hue: s % 2 === 0 ? c.hue : 50,
          life: 0.6
        });
      }
    }
    room.state.corks.splice(i, 1);
  }
}

// Update Sparks
for (let i = room.state.sparks.length - 1; i >= 0; i--) {
  const sp = room.state.sparks[i];
  sp.life -= frame.dt * 1.5;
  sp.x += sp.vx * frame.dt;
  sp.y += sp.vy * frame.dt;
  sp.vy += 450 * frame.dt; // gravity
  if (sp.life <= 0) room.state.sparks.splice(i, 1);
}

// Update Popups
for (let i = room.state.popups.length - 1; i >= 0; i--) {
  if (frame.t - room.state.popups[i].t0 > 0.8) {
    room.state.popups.splice(i, 1);
  }
}

// ================= DRAWING SECTION =================

// 1. Fairground Dark Wood / Canvas Backdrop
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, pal.bg1);
bgGrad.addColorStop(1, pal.bg2);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Subtle vertical carnival curtain stripes
ctx.save();
ctx.globalAlpha = 0.08;
const stripeW = 40;
for (let sx = 0; sx < W; sx += stripeW * 2) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx, 0, stripeW, H);
}
ctx.restore();

// 2. Brass / Steel Target Rails
const railYList = [0.32, 0.50, 0.68];
for (const ry of railYList) {
  const y = ry * H;
  // Back drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, y + 16, W, 8);

  // Steel backing bar
  ctx.fillStyle = '#22252c';
  ctx.fillRect(0, y + 10, W, 10);

  // Metallic Brass Top Rail
  const railGrad = ctx.createLinearGradient(0, y - 6, 0, y + 8);
  railGrad.addColorStop(0, '#fff3b0');
  railGrad.addColorStop(0.4, pal.rail);
  railGrad.addColorStop(1, '#3b2505');
  ctx.fillStyle = railGrad;
  ctx.fillRect(0, y - 5, W, 12);

  // Rivets
  ctx.fillStyle = '#ffd97d';
  for (let rx = 20; rx < W; rx += 70) {
    ctx.beginPath();
    ctx.arc(rx, y + 1, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 3. Targets (Ducks and Stars)
for (const tgt of room.state.targets) {
  const tx = tgt.x * W;
  const ty = tgt.yRatio * H;
  const flipAngle = tgt.flipped * (Math.PI * 0.48); // Hinges down ~86 deg
  const scaleY = Math.cos(flipAngle);

  ctx.save();
  ctx.translate(tx, ty);
  // Bass reaction creates subtle target jitter
  const bJitter = (audio.bass || 0) * 4;
  ctx.translate(0, bJitter * (tgt.row % 2 === 0 ? 1 : -1));
  ctx.scale(1, scaleY);

  if (tgt.type === 'star') {
    // Spun Tin Star Target
    ctx.save();
    ctx.rotate(tgt.x * 6 + frame.t * 0.8);
    ctx.beginPath();
    const pts = 5, rOut = 28, rIn = 13;
    for (let p = 0; p < pts * 2; p++) {
      const r = p % 2 === 0 ? rOut : rIn;
      const a = (p * Math.PI) / pts - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = pal.star;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Center Brass Core
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff4a3';
    ctx.fill();
    ctx.restore();
  } else {
    // Carnival Tin Duck
    const faceDir = tgt.speed >= 0 ? 1 : -1;
    ctx.scale(faceDir, 1);

    // Duck Body
    ctx.beginPath();
    ctx.ellipse(0, -6, 24, 15, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.duck;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#221404';
    ctx.stroke();

    // Duck Head
    ctx.beginPath();
    ctx.arc(16, -18, 11, 0, Math.PI * 2);
    ctx.fillStyle = pal.duck;
    ctx.fill();
    ctx.stroke();

    // Beak
    ctx.beginPath();
    ctx.moveTo(25, -20);
    ctx.lineTo(38, -17);
    ctx.lineTo(25, -13);
    ctx.closePath();
    ctx.fillStyle = '#ff6200';
    ctx.fill();
    ctx.stroke();

    // Eye
    ctx.beginPath();
    ctx.arc(20, -20, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();

    // Wing Stamping Detail
    ctx.beginPath();
    ctx.arc(-2, -6, 9, 0.2, Math.PI - 0.4);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.stroke();
  }

  // Stand / Counter-weight clamp on rail
  ctx.fillStyle = '#3a3d45';
  ctx.fillRect(-5, 0, 10, 10);
  ctx.fillStyle = '#a8b0c0';
  ctx.fillRect(-3, 6, 6, 4);

  ctx.restore();
}

// 4. Corks in Flight
for (const c of room.state.corks) {
  const p = Math.min(1, (frame.t - c.t0) / c.duration);
  const curX = c.startX + (c.targetX - c.startX) * p;
  // Arc path slightly for ballistics
  const curY = c.startY + (c.targetY - c.startY) * p - Math.sin(p * Math.PI) * 55;

  // Cork String
  ctx.beginPath();
  ctx.moveTo(c.startX, c.startY);
  const ctrlX = (c.startX + curX) * 0.5;
  const ctrlY = (c.startY + curY) * 0.5 + 40;
  ctx.quadraticCurveTo(ctrlX, ctrlY, curX, curY);
  ctx.lineWidth = 2;
  ctx.strokeStyle = `hsla(${c.hue}, 90%, 75%, 0.55)`;
  ctx.stroke();

  // Cork Stopper
  ctx.save();
  ctx.translate(curX, curY);
  ctx.rotate(Math.atan2(c.targetY - c.startY, c.targetX - c.startX));
  ctx.fillStyle = '#d2a679';
  ctx.fillRect(-9, -5, 18, 10);
  ctx.fillStyle = '#a67244';
  ctx.fillRect(5, -6, 4, 12); // darker rim
  ctx.restore();
}

// 5. Sparks / Clang FX
for (const sp of room.state.sparks) {
  const alpha = Math.max(0, sp.life / 0.6);
  ctx.fillStyle = `hsla(${sp.hue}, 100%, 65%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

// 6. Score Popups ("+20", "+30")
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
for (const pop of room.state.popups) {
  const lifeRatio = (frame.t - pop.t0) / 0.8;
  const py = pop.y - lifeRatio * 45;
  const alpha = 1 - lifeRatio;
  ctx.save();
  ctx.font = '900 28px sans-serif';
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fillText(pop.text, pop.x + 2, py + 2);
  ctx.fillStyle = `hsla(${pop.hue}, 100%, 70%, ${alpha})`;
  ctx.fillText(pop.text, pop.x, py);
  ctx.restore();
}

// 7. Player Crosshairs (reticles)
for (let i = 0; i < peopleList.length; i++) {
  const p = peopleList[i];
  const sight = getSightPos(p, i, peopleList.length);
  const hue = p.hue ?? 50;
  const col = `hsl(${hue}, 100%, 60%)`;

  ctx.save();
  ctx.translate(sight.x, sight.y);

  // Subtle beat expansion
  const reticleR = 24 + (audio.beat ? 4 : 0);

  // Reticle outer ring
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, reticleR, 0, Math.PI * 2);
  ctx.stroke();

  // Cross lines
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-reticleR - 8, 0); ctx.lineTo(-reticleR + 5, 0);
  ctx.moveTo(reticleR - 5, 0);  ctx.lineTo(reticleR + 8, 0);
  ctx.moveTo(0, -reticleR - 8); ctx.lineTo(0, -reticleR + 5);
  ctx.moveTo(0, reticleR - 5);  ctx.lineTo(0, reticleR + 8);
  ctx.stroke();

  // Center sight pip
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  // Player Short Label
  ctx.shadowBlur = 0;
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(-22, reticleR + 6, 44, 18);
  ctx.fillStyle = col;
  ctx.fillText(`P${i + 1}`, 0, reticleR + 15);

  ctx.restore();
}

// 8. Carnival Festoon Canopy & Bulbs (Top Header)
// Awning Valance
const awningH = 48;
ctx.fillStyle = pal.awning1;
ctx.fillRect(0, 0, W, awningH);
const scallopW = 50;
ctx.beginPath();
for (let ax = 0; ax < W; ax += scallopW * 2) {
  ctx.fillStyle = pal.awning2;
  ctx.fillRect(ax, 0, scallopW, awningH);
}
// Scallop bottom curve
ctx.beginPath();
ctx.fillStyle = '#1c0704';
for (let ax = 0; ax <= W; ax += scallopW) {
  ctx.arc(ax + scallopW * 0.5, awningH, scallopW * 0.5, 0, Math.PI);
}
ctx.fill();

// Glowing carnival bulbs along bottom of awning
if (showBulbs) {
  const bulbSpacing = 42;
  const bulbColors = ['#ff2a5f', '#ffd83b', '#26e6a4', '#38bdf8', '#ff7a00'];
  const bulbPulse = 1.0 + (audio.level || 0) * 0.6;
  for (let bx = 20, idx = 0; bx < W; bx += bulbSpacing, idx++) {
    const bCol = bulbColors[idx % bulbColors.length];
    const by = awningH + 6 + Math.sin(bx * 0.05 + frame.t * 2) * 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, 6 * bulbPulse, 0, Math.PI * 2);
    ctx.fillStyle = bCol;
    ctx.shadowColor = bCol;
    ctx.shadowBlur = 12 * bulbPulse;
    ctx.fill();
    ctx.restore();
  }
}

// 9. HUD Banner, Timer, and Leaderboard (Legible at Distance)
ctx.save();
// Main Timer / Round status in center
const timeSec = Math.max(0, Math.ceil(room.state.roundTimer));
ctx.font = '900 36px sans-serif';
ctx.textAlign = 'center';
ctx.fillStyle = '#ffffff';
ctx.shadowColor = 'rgba(0,0,0,0.8)';
ctx.shadowBlur = 8;
if (room.state.roundState === 'play') {
  ctx.fillText(`TIME: ${timeSec}s`, W * 0.5, 34);
} else {
  ctx.fillStyle = '#ffdf4a';
  ctx.fillText('ROUND OVER!', W * 0.5, 34);
}

// Top Scores Badge (Rank 1-3)
const sortedScores = Object.entries(room.state.scores)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3);

ctx.textAlign = 'left';
ctx.font = 'bold 18px sans-serif';
let badgeX = 24;
for (let i = 0; i < sortedScores.length; i++) {
  const [id, sc] = sortedScores[i];
  const p = peopleList.find(pl => pl.id === id);
  const hue = p ? p.hue : 60;
  ctx.fillStyle = `hsl(${hue}, 100%, 65%)`;
  ctx.fillText(`★ ${sc} pts`, badgeX, 34);
  badgeX += 130;
}

// Attract Mode / Action Prompter across center bottom
if (isAttract && room.state.roundState === 'play') {
  const pulseAlpha = 0.7 + 0.3 * Math.sin(frame.t * 5);
  ctx.textAlign = 'center';
  ctx.font = '900 44px sans-serif';
  ctx.fillStyle = `rgba(255, 235, 59, ${pulseAlpha})`;
  ctx.shadowColor = '#ff2200';
  ctx.shadowBlur = 18;
  ctx.fillText('AIM & PRESS [POP!] TO PLAY', W * 0.5, H * 0.88);
}

// 10. Round Winner Big Celebration Overlay
if (room.state.roundState === 'winner' && room.state.winnerInfo) {
  const wInfo = room.state.winnerInfo;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, W, H);

  // Confetti / Cork firework bursts
  const burstCount = 8;
  for (let b = 0; b < burstCount; b++) {
    const bx = W * (0.2 + 0.6 * (b / burstCount));
    const by = H * 0.4 + Math.sin(frame.t * 3 + b) * 50;
    ctx.beginPath();
    ctx.arc(bx, by, 10 + Math.sin(frame.t * 6 + b) * 6, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${(wInfo.hue + b * 45) % 360}, 100%, 65%)`;
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 78px sans-serif';
  ctx.fillStyle = `hsl(${wInfo.hue}, 100%, 65%)`;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 24;
  ctx.fillText('WINNER!', W * 0.5, H * 0.46);

  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 10;
  ctx.fillText(`SCORE: ${wInfo.score} PTS`, W * 0.5, H * 0.56);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#f0dfa8';
  ctx.fillText('NEXT ROUND STARTING...', W * 0.5, H * 0.64);
  ctx.restore();
}

ctx.restore();
ctx.restore();