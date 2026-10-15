const width = frame.width;
const height = frame.height;
const t = frame.t;

// 1. Controls & Settings
const padCount = Math.round(getVar('pad_count') ?? 7);
const rhythmSpeed = getVar('rhythm_speed') ?? 1.0;
const pondTheme = getVar('pond_theme') ?? 'Midnight Deep';
const hazardStyle = getVar('hazard_style') ?? 'Alternating Wave';
const showRipples = getVar('water_ripples') ?? true;

// Color Themes
const themes = {
  'Midnight Deep': { bg0: '#030814', bg1: '#091e36', padSurfaced: '#10b981', padSunken: '#083344', bank: '#134e4a', accent: '#38bdf8' },
  'Neon Bayou':    { bg0: '#090214', bg1: '#1e0836', padSurfaced: '#00ff88', padSunken: '#2e1065', bank: '#4c1d95', accent: '#f43f5e' },
  'Acid Swamp':    { bg0: '#070f03', bg1: '#142908', padSurfaced: '#84cc16', padSunken: '#1f2e10', bank: '#365314', accent: '#eab308' },
  'Twilight Glow': { bg0: '#0f051d', bg1: '#260e3a', padSurfaced: '#059669', padSunken: '#311042', bank: '#581c87', accent: '#fb923c' }
};
const currentTheme = themes[pondTheme] ?? themes['Midnight Deep'];

// 2. Persistent State Init
room.state.racers ??= {};
room.state.particles ??= [];
room.state.lastInputT ??= t;
room.state.lastBotT ??= t;
room.state.status ??= 'racing'; // 'racing' | 'won'
room.state.statusT ??= t;
room.state.winnerName ??= '';
room.state.winnerHue ??= 140;
room.state.roundNum ??= 1;

// 3. Build Racer Lineup (Adaptive to 0, 1, or many players)
let activeRacers = [];
if (room.people && room.people.length > 0) {
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    activeRacers.push({
      id: p.id,
      name: `P${i + 1}`,
      hue: p.hue,
      isBot: false
    });
  }
  // If solo player, add 2 AI companions so it's a real race
  if (room.people.length === 1) {
    activeRacers.push({ id: 'bot_croak', name: 'Toad AI', hue: (room.people[0].hue + 120) % 360, isBot: true });
    activeRacers.push({ id: 'bot_ribbit', name: 'Ribbit AI', hue: (room.people[0].hue + 240) % 360, isBot: true });
  }
} else {
  // Attract / empty room demo frogs
  activeRacers = [
    { id: 'bot_alpha', name: 'Froggo', hue: 135, isBot: true },
    { id: 'bot_beta', name: 'Lily', hue: 320, isBot: true },
    { id: 'bot_gamma', name: 'Croaker', hue: 45, isBot: true },
    { id: 'bot_delta', name: 'Hoppy', hue: 200, isBot: true }
  ];
}

// Synchronize Persistent Racers Map
for (let i = 0; i < activeRacers.length; i++) {
  const r = activeRacers[i];
  if (!room.state.racers[r.id]) {
    room.state.racers[r.id] = {
      id: r.id,
      name: r.name,
      hue: r.hue,
      lane: i,
      pad: 0,
      targetPad: 0,
      hopStartT: 0,
      hopDur: 0.28,
      inAir: false,
      score: 0,
      dunkT: -10
    };
  } else {
    room.state.racers[r.id].name = r.name;
    room.state.racers[r.id].hue = r.hue;
    room.state.racers[r.id].lane = i;
  }
}

// 4. Submergence Rhythm Calculation
function getSubmergence(col, laneIdx, time) {
  if (col === 0 || col === padCount - 1) return -1; // Banks are always solid land
  let phase = 0;
  if (hazardStyle === 'Alternating Wave') {
    phase = col * 1.1 + laneIdx * 0.45;
  } else if (hazardStyle === 'Sync Beats') {
    phase = (col % 2 === 0 ? 0 : Math.PI) + (audio.beat ? 0.35 : 0);
  } else {
    // Cascading Sink
    phase = -col * 1.3 + laneIdx * 0.2;
  }
  const freq = rhythmSpeed * 2.8;
  // Value between -1.0 (fully surfaced) and +1.0 (fully underwater)
  return Math.sin(time * freq + phase);
}

// 5. Layout Metrics
const laneCount = Math.max(1, activeRacers.length);
const headerH = 100;
const footerH = 40;
const availableH = height - headerH - footerH;
const laneH = Math.min(130, Math.max(34, availableH / laneCount));
const padRadius = Math.max(14, Math.min(36, laneH * 0.38));
const frogSize = padRadius * 0.88;

const bankStartW = 120;
const bankFinishW = 120;
const trackW = width - bankStartW - bankFinishW;
function getPadX(col) {
  if (col <= 0) return bankStartW * 0.55;
  if (col >= padCount - 1) return width - bankFinishW * 0.55;
  return bankStartW + ((col - 0.5) / (padCount - 2)) * trackW;
}
function getLaneY(laneIdx) {
  return headerH + (laneIdx + 0.5) * laneH;
}

// 6. Handle Hop Inputs & Triggers
let pressedAny = false;
if (room.events) {
  for (const ev of room.events) {
    if (ev.name === 'hop') {
      pressedAny = true;
      room.state.lastInputT = t;
      // Find racer: either match participantId or match first available human
      let r = room.state.racers[ev.participantId];
      if (!r) {
        const human = activeRacers.find(p => !p.isBot);
        if (human) r = room.state.racers[human.id];
        else r = room.state.racers[activeRacers[0]?.id];
      }
      if (r && !r.inAir && room.state.status === 'racing') {
        r.inAir = true;
        r.hopStartT = t;
        r.targetPad = Math.min(padCount - 1, r.pad + 1);
      }
    }
  }
}
if (pressedAny) room.state.lastInputT = t;

// 7. Attract Mode (Lively AI plays when idle for 3.5s)
const isIdle = (t - room.state.lastInputT) > 3.5;
if (isIdle && room.state.status === 'racing' && (t - room.state.lastBotT) > 0.65) {
  room.state.lastBotT = t;
  const eligible = activeRacers
    .map(ar => room.state.racers[ar.id])
    .filter(r => r && !r.inAir && r.pad < padCount - 1);
  if (eligible.length > 0) {
    const bot = eligible[Math.floor(Math.random() * eligible.length)];
    const nextSub = getSubmergence(bot.pad + 1, bot.lane, t + 0.28);
    // Bot jumps smartly 75% of time, comically splashes 25% of time
    if (nextSub < 0.2 || Math.random() < 0.25) {
      bot.inAir = true;
      bot.hopStartT = t;
      bot.targetPad = bot.pad + 1;
    }
  }
}

// 8. Auto-Restart After Victory
if (room.state.status === 'won' && (t - room.state.statusT) > 4.5) {
  room.state.status = 'racing';
  room.state.statusT = t;
  room.state.roundNum++;
  for (const key in room.state.racers) {
    const r = room.state.racers[key];
    r.pad = 0;
    r.targetPad = 0;
    r.inAir = false;
  }
}

// 9. Update Racer Movements, Landings & Splashes
for (let i = 0; i < activeRacers.length; i++) {
  const r = room.state.racers[activeRacers[i].id];
  if (!r) continue;

  if (r.inAir) {
    const progress = (t - r.hopStartT) / r.hopDur;
    if (progress >= 1.0) {
      r.inAir = false;
      const landSub = getSubmergence(r.targetPad, r.lane, t);
      // Dunk condition: sunken if subVal > 0.18
      if (r.targetPad > 0 && r.targetPad < padCount - 1 && landSub > 0.18) {
        // SPLASH! Dunked back to start bank
        r.pad = 0;
        r.targetPad = 0;
        r.dunkT = t;
        const splashX = getPadX(r.targetPad);
        const splashY = getLaneY(r.lane);
        for (let p = 0; p < 18; p++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 60 + Math.random() * 160;
          room.state.particles.push({
            x: splashX,
            y: splashY,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 40,
            life: 0.6 + Math.random() * 0.4,
            maxLife: 1.0,
            color: currentTheme.accent,
            size: 3 + Math.random() * 4
          });
        }
      } else {
        // Safe Landing!
        r.pad = r.targetPad;
        // Reached Finish Bank?
        if (r.pad === padCount - 1 && room.state.status === 'racing') {
          room.state.status = 'won';
          room.state.statusT = t;
          room.state.winnerName = r.name;
          room.state.winnerHue = r.hue;
          r.score++;
          // Celebration confetti
          for (let p = 0; p < 50; p++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 100 + Math.random() * 250;
            room.state.particles.push({
              x: getPadX(padCount - 1),
              y: getLaneY(r.lane),
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd - 60,
              life: 1.2 + Math.random() * 0.8,
              maxLife: 2.0,
              color: `hsl(${(r.hue + Math.random() * 80) % 360}, 95%, 65%)`,
              size: 4 + Math.random() * 5
            });
          }
        }
      }
    }
  }
}

// Bound particle array
if (room.state.particles.length > 120) {
  room.state.particles.splice(0, room.state.particles.length - 120);
}

// 10. RENDER PASS
ctx.save();

// Pond Water Gradient
const bgGrad = ctx.createLinearGradient(0, 0, width, height);
bgGrad.addColorStop(0, currentTheme.bg0);
bgGrad.addColorStop(0.5, currentTheme.bg1);
bgGrad.addColorStop(1, currentTheme.bg0);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, width, height);

// Audio-Reactive Caustics & Water Ripples
if (showRipples) {
  ctx.strokeStyle = currentTheme.accent;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.12 + audio.bass * 0.18;
  for (let r = 0; r < 4; r++) {
    ctx.beginPath();
    const waveY = headerH + (r + 0.5) * (availableH / 4) + Math.sin(t * 1.5 + r) * 20;
    ctx.moveTo(bankStartW, waveY);
    for (let wx = bankStartW; wx < width - bankFinishW; wx += 40) {
      const cy = waveY + Math.sin(wx * 0.02 + t * 2.5 + r) * (8 + audio.mid * 14);
      ctx.lineTo(wx, cy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;
}

// Draw Left Bank (Start)
ctx.fillStyle = currentTheme.bank;
ctx.beginPath();
ctx.roundRect(0, headerH - 10, bankStartW, availableH + 20, [0, 24, 24, 0]);
ctx.fill();
ctx.fillStyle = '#22c55e';
ctx.fillRect(bankStartW - 6, headerH - 10, 6, availableH + 20);

// Draw Right Bank (Finish Goal)
ctx.fillStyle = '#854d0e';
ctx.beginPath();
ctx.roundRect(width - bankFinishW, headerH - 10, bankFinishW, availableH + 20, [24, 0, 0, 24]);
ctx.fill();
// Checkered finish tape
const checkSize = 14;
const checkRows = Math.ceil((availableH + 20) / checkSize);
for (let cr = 0; cr < checkRows; cr++) {
  ctx.fillStyle = (cr % 2 === 0) ? '#facc15' : '#000000';
  ctx.fillRect(width - bankFinishW, headerH - 10 + cr * checkSize, 8, checkSize);
}

// Bank Labels
ctx.save();
ctx.font = '900 18px monospace';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#86efac';
ctx.fillText('START', bankStartW * 0.5, headerH + availableH * 0.5);
ctx.fillStyle = '#fef08a';
ctx.fillText('GOAL', width - bankFinishW * 0.5, headerH + availableH * 0.5);
ctx.restore();

// 11. Draw Lily Pads
for (let l = 0; l < activeRacers.length; l++) {
  const laneY = getLaneY(l);
  
  // Subtle lane divider line
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.05;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bankStartW, laneY + laneH * 0.5);
  ctx.lineTo(width - bankFinishW, laneY + laneH * 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1.0;

  for (let c = 1; c < padCount - 1; c++) {
    const padX = getPadX(c);
    const sub = getSubmergence(c, l, t);
    const isDunked = sub > 0.18;
    const sinkDepth = Math.max(0, sub);

    ctx.save();
    ctx.translate(padX, laneY);

    if (isDunked) {
      // Submerged Pad: watery dark disk, blue ripples
      const scale = 0.78 - sinkDepth * 0.1;
      ctx.scale(scale, scale * 0.85);
      ctx.fillStyle = currentTheme.padSunken;
      ctx.globalAlpha = 0.35 + (1 - sinkDepth) * 0.25;
      ctx.beginPath();
      ctx.arc(0, 0, padRadius, 0, Math.PI * 2);
      ctx.fill();

      // Underwater ripples
      ctx.strokeStyle = currentTheme.accent;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4 * (1 - sinkDepth);
      const ripR = padRadius * (1.1 + Math.sin(t * 4 + c) * 0.2);
      ctx.beginPath();
      ctx.arc(0, 0, ripR, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Surfaced Lily Pad: vibrant green disc with leaf notch
      const bounce = audio.beat ? 1.08 : (1.0 + Math.sin(t * 3 + c) * 0.03);
      ctx.scale(bounce, bounce);
      ctx.globalAlpha = 0.95;

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 4, padRadius, 0, Math.PI * 2);
      ctx.fill();

      // Leaf body
      ctx.fillStyle = currentTheme.padSurfaced;
      ctx.beginPath();
      // Classic lily pad with wedge cutout facing right
      ctx.arc(0, 0, padRadius, 0.25, Math.PI * 2 - 0.25);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();

      // Leaf vein detail
      ctx.strokeStyle = '#a7f3d0';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-padRadius * 0.7, -padRadius * 0.3);
      ctx.moveTo(0, 0);
      ctx.lineTo(-padRadius * 0.7, padRadius * 0.3);
      ctx.moveTo(0, 0);
      ctx.lineTo(-padRadius * 0.8, 0);
      ctx.stroke();

      // Warning rim if pad is about to submerge
      if (sub > -0.05) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.8 + Math.sin(t * 12) * 0.2;
        ctx.beginPath();
        ctx.arc(0, 0, padRadius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// 12. Draw Frogs
for (let i = 0; i < activeRacers.length; i++) {
  const r = room.state.racers[activeRacers[i].id];
  if (!r) continue;

  const laneY = getLaneY(r.lane);
  let frogX, frogY, jumpScale = 1.0, shadowOffset = 4;

  if (r.inAir) {
    const p = Math.min(1, Math.max(0, (t - r.hopStartT) / r.hopDur));
    const startX = getPadX(r.pad);
    const targetX = getPadX(r.targetPad);
    frogX = startX + (targetX - startX) * p;
    const arcH = Math.sin(p * Math.PI) * (36 + laneH * 0.15);
    frogY = laneY - arcH;
    jumpScale = 1.0 + Math.sin(p * Math.PI) * 0.35;
    shadowOffset = 4 + arcH * 0.7;
  } else {
    frogX = getPadX(r.pad);
    frogY = laneY;
  }

  // Splash notification text on dunk
  if (t - r.dunkT < 0.85) {
    ctx.save();
    ctx.font = '900 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.fillText('SPLASH!', frogX, frogY - 28 - (t - r.dunkT) * 20);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(frogX, frogY);

  // Ground / Water Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, shadowOffset, frogSize * 0.9 * jumpScale, frogSize * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Frog Body with player hue
  ctx.scale(jumpScale, jumpScale);
  const frogColor = `hsl(${r.hue}, 95%, 52%)`;
  const frogDark = `hsl(${r.hue}, 90%, 35%)`;
  const frogLight = `hsl(${r.hue}, 95%, 75%)`;

  // Hind legs kicking if jumping, folded if landed
  ctx.fillStyle = frogDark;
  if (r.inAir) {
    // Extended kick legs
    ctx.beginPath();
    ctx.ellipse(-frogSize * 0.9, -frogSize * 0.5, frogSize * 0.7, frogSize * 0.25, -0.4, 0, Math.PI * 2);
    ctx.ellipse(-frogSize * 0.9, frogSize * 0.5, frogSize * 0.7, frogSize * 0.25, 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Folded squat legs
    ctx.beginPath();
    ctx.ellipse(-frogSize * 0.4, -frogSize * 0.65, frogSize * 0.45, frogSize * 0.35, -0.6, 0, Math.PI * 2);
    ctx.ellipse(-frogSize * 0.4, frogSize * 0.65, frogSize * 0.45, frogSize * 0.35, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Torso
  ctx.fillStyle = frogColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, frogSize * 0.8, frogSize * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  // Back belly accent
  ctx.fillStyle = frogLight;
  ctx.beginPath();
  ctx.ellipse(frogSize * 0.15, 0, frogSize * 0.4, frogSize * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bulbous Eyes (facing forward towards goal +X)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(frogSize * 0.4, -frogSize * 0.45, frogSize * 0.3, 0, Math.PI * 2);
  ctx.arc(frogSize * 0.4, frogSize * 0.45, frogSize * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eye Pupils looking right
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(frogSize * 0.48, -frogSize * 0.45, frogSize * 0.14, 0, Math.PI * 2);
  ctx.arc(frogSize * 0.48, frogSize * 0.45, frogSize * 0.14, 0, Math.PI * 2);
  ctx.fill();

  // Player Badge / Tag
  ctx.font = '900 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(r.name, 0, 0);

  ctx.restore();
}

// 13. Update & Draw Particles
for (let p = room.state.particles.length - 1; p >= 0; p--) {
  const part = room.state.particles[p];
  part.x += part.vx * frame.dt;
  part.y += part.vy * frame.dt;
  part.vy += 220 * frame.dt; // gravity
  part.life -= frame.dt;

  if (part.life <= 0) {
    room.state.particles.splice(p, 1);
    continue;
  }

  ctx.save();
  ctx.fillStyle = part.color;
  ctx.globalAlpha = Math.max(0, part.life / part.maxLife);
  ctx.beginPath();
  ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 14. Top Header Banner & HUD
ctx.save();
ctx.fillStyle = 'rgba(3, 8, 20, 0.85)';
ctx.fillRect(0, 0, width, headerH - 12);
ctx.strokeStyle = currentTheme.accent;
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(0, headerH - 12);
ctx.lineTo(width, headerH - 12);
ctx.stroke();

// Title
ctx.font = '900 32px sans-serif';
ctx.textAlign = 'left';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#ffffff';
ctx.fillText('🐸 LILY HOP RELAY', 28, (headerH - 12) * 0.5);

// Instructions & Mode Indicator
ctx.font = '700 18px monospace';
ctx.textAlign = 'center';
if (isIdle) {
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('⚡ ATTRACT MODE - PRESS HOP TO TAKE OVER! ⚡', width * 0.54, (headerH - 12) * 0.5);
} else {
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('PRESS [HOP] • TIMING IS EVERYTHING • SUNK PADS SPLASH!', width * 0.54, (headerH - 12) * 0.5);
}

// Round counter
ctx.textAlign = 'right';
ctx.fillStyle = '#a7f3d0';
ctx.font = '900 20px monospace';
ctx.fillText(`ROUND #${room.state.roundNum}`, width - 28, (headerH - 12) * 0.5);
ctx.restore();

// 15. Big Winner Fanfare Overlay
if (room.state.status === 'won') {
  const winElapsed = t - room.state.statusT;
  const pulse = 1.0 + Math.sin(t * 8) * 0.05;
  ctx.save();
  ctx.translate(width * 0.5, height * 0.5);
  ctx.scale(pulse, pulse);

  // Backdrop Box
  ctx.fillStyle = 'rgba(5, 12, 28, 0.94)';
  ctx.strokeStyle = `hsl(${room.state.winnerHue}, 95%, 55%)`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(-340, -110, 680, 220, [24]);
  ctx.fill();
  ctx.stroke();

  // Winner Text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 48px sans-serif';
  ctx.fillStyle = `hsl(${room.state.winnerHue}, 95%, 65%)`;
  ctx.fillText(`🏆 ${room.state.winnerName.toUpperCase()} WINS! 🏆`, 0, -32);

  // Countdown to next race
  const remainingSecs = Math.max(1, Math.ceil(4.5 - winElapsed));
  ctx.font = '700 22px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`NEXT RACE IN ${remainingSecs}...`, 0, 42);

  ctx.restore();
}

ctx.restore();