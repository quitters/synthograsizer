ctx.save();

// ---- 1. CONFIG & KNOB MAPPINGS ----
const wallTheme = getVar('wall_theme') || 'Mossy Brick';
const snailStyle = getVar('snail_style') || 'Glossy Swirls';
const raceDist = getVar('race_length') || 'Standard';
const spookSens = getVar('spook_sens') || 'Balanced';
const rainLevel = getVar('rain_amount') ?? 5;
const glitter = getVar('glitter_trails') ?? true;

const stepCounts = { Sprint: 13, Standard: 20, Marathon: 30 };
const totalSteps = stepCounts[raceDist] || 20;
const stepSize = 1.0 / totalSteps;

const spookSettings = {
  Forgiving: { minTap: 0.32, duration: 1.3 },
  Balanced:  { minTap: 0.46, duration: 1.7 },
  Strict:    { minTap: 0.62, duration: 2.3 }
};
const spookRule = spookSettings[spookSens] || spookSettings.Balanced;

// ---- 2. STATE INITIALISATION (BOUNDED & PERSISTENT) ----
room.state.snails ??= [];
room.state.splashes ??= [];
room.state.confetti ??= [];
room.state.phase ??= 'countdown'; // 'countdown', 'racing', 'celebrating'
room.state.phaseTimer ??= 3.2;
room.state.lastInputTime ??= frame.t;
room.state.winnerName ??= '';
room.state.winnerHue ??= 50;
room.state.raceCount ??= 1;

// Function to restart race
function resetRace() {
  room.state.phase = 'countdown';
  room.state.phaseTimer = 3.4;
  room.state.winnerName = '';
  room.state.raceCount++;
  for (let i = 0; i < room.state.snails.length; i++) {
    const s = room.state.snails[i];
    s.prog = 0;
    s.vProg = 0;
    s.hidingUntil = 0;
    s.hideAnim = 0;
    s.trail = [];
  }
}

// Function to add a floating badge/splash
function addSplash(x, y, text, color, bg) {
  if (room.state.splashes.length > 35) room.state.splashes.shift();
  room.state.splashes.push({
    x, y, text, color, bg: bg || 'rgba(10,15,20,0.85)',
    life: 1.0, maxLife: 1.0, vy: -55
  });
}

// ---- 3. RECONCILE PARTICIPANTS / RACERS ----
const people = room.people || [];
let targetRacers = [];
if (people.length > 0) {
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const h = typeof p.hue === 'number' ? p.hue : (i * 73) % 360;
    targetRacers.push({
      id: p.id,
      name: 'P' + (i + 1),
      hue: h,
      isBot: false
    });
  }
  // If only 1 player, add 2 friendly garden rivals
  if (targetRacers.length === 1) {
    targetRacers.push({ id: '__bot_moss', name: 'Mossy', hue: (targetRacers[0].hue + 120) % 360, isBot: true });
    targetRacers.push({ id: '__bot_amber', name: 'Amber', hue: (targetRacers[0].hue + 240) % 360, isBot: true });
  }
} else {
  // 4 Default Demo Racers for attract mode
  targetRacers = [
    { id: '__bot_1', name: 'Turbo', hue: 35, isBot: true },
    { id: '__bot_2', name: 'Shelly', hue: 140, isBot: true },
    { id: '__bot_3', name: 'Drizzle', hue: 205, isBot: true },
    { id: '__bot_4', name: 'Petal', hue: 310, isBot: true }
  ];
}
if (targetRacers.length > 40) targetRacers = targetRacers.slice(0, 40);

// Sync snails array with target racers
const currentMap = new Map();
for (let i = 0; i < room.state.snails.length; i++) {
  currentMap.set(room.state.snails[i].id, room.state.snails[i]);
}
const updatedSnails = [];
for (let i = 0; i < targetRacers.length; i++) {
  const r = targetRacers[i];
  const existing = currentMap.get(r.id);
  if (existing) {
    existing.name = r.name;
    existing.hue = r.hue;
    existing.isBot = r.isBot;
    updatedSnails.push(existing);
  } else {
    updatedSnails.push({
      id: r.id,
      name: r.name,
      hue: r.hue,
      isBot: r.isBot,
      prog: 0,
      vProg: 0,
      x: frame.width * 0.5,
      y: frame.height * 0.84,
      lastTap: 0,
      hidingUntil: 0,
      hideAnim: 0,
      wiggle: Math.random() * 20,
      botTimer: 0.6 + Math.random() * 0.8,
      trail: []
    });
  }
}
room.state.snails = updatedSnails;

// ---- 4. HANDLE INTERACTIVE ACTIONS ----
function stepSnail(s, isAutonomous) {
  const now = frame.t;
  if (!isAutonomous) room.state.lastInputTime = now;

  if (room.state.phase === 'countdown') {
    // Early false start
    s.hidingUntil = now + spookRule.duration * 1.3;
    addSplash(s.x, s.y - 25, 'FALSE START!', '#ffcc00', 'rgba(40,25,0,0.9)');
    return;
  }
  if (room.state.phase !== 'racing') return;

  const dtTap = now - s.lastTap;
  s.lastTap = now;

  if (s.hidingUntil > now) {
    // Mashed while scared! Reset spook penalty
    s.hidingUntil = Math.max(s.hidingUntil, now + 0.8);
    addSplash(s.x, s.y - 28, 'STILL HIDING!', '#ff5577', 'rgba(40,10,20,0.9)');
  } else if (dtTap < spookRule.minTap && !isAutonomous) {
    // Rushed tap! Hide in shell!
    s.hidingUntil = now + spookRule.duration;
    addSplash(s.x, s.y - 32, 'TOO FAST!', '#ff3366', 'rgba(50,5,15,0.95)');
  } else {
    // Successful steady crawl
    s.prog = Math.min(1.0, s.prog + stepSize);
    addSplash(s.x, s.y - 24, '+1 SLIME', `hsl(${s.hue}, 100%, 75%)`, 'rgba(10,25,15,0.9)');

    if (s.prog >= 1.0 && room.state.phase === 'racing') {
      room.state.phase = 'celebrating';
      room.state.phaseTimer = 4.8;
      room.state.winnerName = s.name;
      room.state.winnerHue = s.hue;
      // Spawn winner burst
      for (let k = 0; k < 45; k++) {
        if (room.state.confetti.length > 90) room.state.confetti.shift();
        room.state.confetti.push({
          x: s.x,
          y: s.y,
          vx: (Math.random() - 0.5) * 450,
          vy: -150 - Math.random() * 320,
          hue: (s.hue + (Math.random() - 0.5) * 60 + 360) % 360,
          life: 1.0,
          rot: Math.random() * Math.PI
        });
      }
    }
  }
}

// Process incoming room.events
const events = room.events || [];
for (let i = 0; i < events.length; i++) {
  const ev = events[i];
  if (ev.name === 'new_race') {
    resetRace();
  } else if (ev.name === 'slime') {
    let matched = null;
    if (ev.participantId) {
      matched = room.state.snails.find(s => s.id === ev.participantId);
    }
    if (!matched) {
      // Fallback: pick human snail or first ready snail
      const humans = room.state.snails.filter(s => !s.isBot);
      matched = humans.length > 0
        ? humans.reduce((prev, curr) => (curr.lastTap < prev.lastTap ? curr : prev))
        : room.state.snails[0];
    }
    if (matched) stepSnail(matched, false);
  }
}

// ---- 5. GAME LOOP & ATTRACT MODE TIMERS ----
const numSnails = room.state.snails.length;
const startY = frame.height * 0.84;
const finishY = frame.height * 0.16;
const usableW = frame.width * 0.88;
const marginX = frame.width * 0.06;
const laneW = usableW / Math.max(1, numSnails);
const baseSize = Math.max(12, Math.min(32, laneW * 0.38));

if (room.state.phase === 'countdown') {
  room.state.phaseTimer -= frame.dt;
  if (room.state.phaseTimer <= 0) {
    room.state.phase = 'racing';
    room.state.phaseTimer = 0;
  }
} else if (room.state.phase === 'celebrating') {
  room.state.phaseTimer -= frame.dt;
  if (room.state.phaseTimer <= 0) {
    resetRace();
  }
} else if (room.state.phase === 'racing') {
  // Attract mode: if no human input for 3.2s, bots or snails crawl rhythmically
  const idleTime = frame.t - room.state.lastInputTime;
  for (let i = 0; i < room.state.snails.length; i++) {
    const s = room.state.snails[i];
    if (s.isBot || idleTime > 3.2) {
      s.botTimer -= frame.dt;
      if (s.botTimer <= 0) {
        // 14% chance to get eager and tap too fast, showcasing the mechanic
        const makeMistake = Math.random() < 0.14 && s.hidingUntil <= frame.t;
        s.botTimer = makeMistake ? 0.22 : (0.52 + Math.random() * 0.45);
        stepSnail(s, !makeMistake);
      }
    }
  }
}

// Smooth snail coordinates & trails
for (let i = 0; i < room.state.snails.length; i++) {
  const s = room.state.snails[i];
  const targetX = marginX + (i + 0.5) * laneW;
  s.x += (targetX - s.x) * Math.min(1.0, frame.dt * 9);
  s.vProg += (s.prog - s.vProg) * Math.min(1.0, frame.dt * 8);
  s.y = startY - s.vProg * (startY - finishY);

  // Hide animation easing (0 = extended, 1 = fully retracted)
  const isHidden = s.hidingUntil > frame.t;
  const targetHide = isHidden ? 1.0 : 0.0;
  s.hideAnim += (targetHide - s.hideAnim) * Math.min(1.0, frame.dt * 12);

  // Record slime trail if moved
  const lastPt = s.trail[s.trail.length - 1];
  const footY = s.y + baseSize * 0.7;
  if (!lastPt || Math.abs(lastPt.y - footY) > 3.5) {
    s.trail.push({ x: s.x, y: footY, t: frame.t });
    if (s.trail.length > 28) s.trail.shift();
  }
}

// ---- 6. DRAWING: WALL BACKGROUND ----
let bgGrad = ctx.createLinearGradient(0, 0, 0, frame.height);
if (wallTheme === 'Rainy Slate') {
  bgGrad.addColorStop(0, '#0a1017');
  bgGrad.addColorStop(0.5, '#121a24');
  bgGrad.addColorStop(1, '#080d14');
} else if (wallTheme === 'Midnight Garden') {
  bgGrad.addColorStop(0, '#09081a');
  bgGrad.addColorStop(0.5, '#13112c');
  bgGrad.addColorStop(1, '#060512');
} else {
  // Mossy Brick
  bgGrad.addColorStop(0, '#101610');
  bgGrad.addColorStop(0.5, '#1a221a');
  bgGrad.addColorStop(1, '#0d130d');
}
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

// Brick Courses & Mortar Joints
const brickH = 50;
const brickW = 100;
const numRows = Math.ceil(frame.height / brickH) + 1;
ctx.strokeStyle = wallTheme === 'Midnight Garden' ? 'rgba(70, 60, 110, 0.28)' : 'rgba(30, 48, 36, 0.35)';
ctx.lineWidth = 2.5;
ctx.beginPath();
for (let r = 0; r < numRows; r++) {
  const by = r * brickH;
  ctx.moveTo(0, by);
  ctx.lineTo(frame.width, by);
  const shift = (r % 2) * (brickW * 0.5);
  for (let bx = shift; bx < frame.width; bx += brickW) {
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by + brickH);
  }
}
ctx.stroke();

// Wet Specular Sheen (reacts to audio level & frame.t)
const sheenGrad = ctx.createLinearGradient(-frame.width * 0.2, 0, frame.width * 1.2, frame.height);
sheenGrad.addColorStop(0, 'rgba(255,255,255,0)');
sheenGrad.addColorStop(0.5 + Math.sin(frame.t * 0.4) * 0.1, `rgba(180, 225, 255, ${0.04 + audio.level * 0.05})`);
sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
ctx.fillStyle = sheenGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

// Lane Mortar Grooves & Markers
ctx.strokeStyle = 'rgba(255,255,255,0.05)';
ctx.lineWidth = 1.5;
ctx.setLineDash([8, 12]);
ctx.beginPath();
for (let i = 0; i <= numSnails; i++) {
  const lx = marginX + i * laneW;
  ctx.moveTo(lx, finishY);
  ctx.lineTo(lx, startY);
}
ctx.stroke();
ctx.setLineDash([]);

// ---- 7. START & FINISH LEDGES ----
// Bottom Start Stone Ledge
ctx.fillStyle = '#070b09';
ctx.fillRect(0, startY + 12, frame.width, frame.height - (startY + 12));
ctx.fillStyle = '#1b2c20';
ctx.fillRect(0, startY + 10, frame.width, 4);

// Start labels
ctx.fillStyle = 'rgba(150, 200, 160, 0.5)';
ctx.font = '900 13px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.fillText('• START LEDGE • SLOW & STEADY WINS •', frame.width * 0.5, startY + 32);

// Top Finish Trellis Wall
const trellisGrad = ctx.createLinearGradient(0, 0, 0, finishY);
trellisGrad.addColorStop(0, '#0c140f');
trellisGrad.addColorStop(1, '#1b261e');
ctx.fillStyle = trellisGrad;
ctx.fillRect(0, 0, frame.width, finishY);

// Finish Line Ribbon (Checkered pattern)
const ribbonH = 14;
const sqSize = 14;
const numSq = Math.ceil(frame.width / sqSize);
for (let sq = 0; sq < numSq; sq++) {
  ctx.fillStyle = (sq % 2 === 0) ? '#f2f8eb' : '#141c16';
  ctx.fillRect(sq * sqSize, finishY - ribbonH * 0.5, sqSize, ribbonH);
}
// Golden Bunting Border
ctx.fillStyle = '#ffcc33';
ctx.fillRect(0, finishY - ribbonH * 0.5 - 2, frame.width, 3);
ctx.fillRect(0, finishY + ribbonH * 0.5, frame.width, 3);

// Lantern fireflies at trellis top (pulse with audio bass)
const glowPulse = 0.5 + Math.sin(frame.t * 3) * 0.2 + audio.bass * 0.3;
ctx.fillStyle = `rgba(255, 230, 120, ${glowPulse})`;
ctx.shadowColor = '#ffdd44';
ctx.shadowBlur = 12 * (1 + audio.bass);
ctx.beginPath();
ctx.arc(frame.width * 0.08, finishY - 26, 7, 0, Math.PI * 2);
ctx.arc(frame.width * 0.92, finishY - 26, 7, 0, Math.PI * 2);
ctx.fill();
ctx.shadowBlur = 0;

// ---- 8. GLISTENING TRAILS & SNAIL RACERS ----
for (let i = 0; i < room.state.snails.length; i++) {
  const s = room.state.snails[i];
  const isSpooked = s.hidingUntil > frame.t;
  const shake = isSpooked ? Math.sin(frame.t * 46 + i) * (3.5 * s.hideAnim) : 0;
  const cx = s.x + shake;
  const cy = s.y;

  // A. Slime Trail
  if (s.trail.length > 1) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Outer luminous slime
    ctx.beginPath();
    ctx.moveTo(s.trail[0].x, s.trail[0].y);
    for (let pt = 1; pt < s.trail.length; pt++) {
      ctx.lineTo(s.trail[pt].x, s.trail[pt].y);
    }
    ctx.lineTo(cx, cy + baseSize * 0.6);
    ctx.strokeStyle = `hsla(${s.hue}, 90%, 55%, 0.35)`;
    ctx.lineWidth = baseSize * 0.65;
    ctx.stroke();

    // Wet glistening core
    ctx.strokeStyle = `hsla(${s.hue}, 100%, 88%, 0.75)`;
    ctx.lineWidth = Math.max(2.0, baseSize * 0.18);
    ctx.stroke();

    // Glitter sparkles along trail
    if (glitter) {
      ctx.fillStyle = '#ffffff';
      for (let pt = 0; pt < s.trail.length; pt += 3) {
        const spark = Math.sin(frame.t * 6 + pt + s.hue) * 0.5 + 0.5;
        if (spark > 0.45) {
          const dotR = (1.2 + spark * 2.4) * (1.0 + audio.treble * 0.9);
          ctx.beginPath();
          ctx.arc(s.trail[pt].x + Math.sin(pt * 2) * 2, s.trail[pt].y, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // B. Snail Body (Retracts when spooked)
  ctx.save();
  const bodyScale = 1.0 - s.hideAnim * 0.88;
  const inchWiggle = Math.sin(frame.t * 8 + s.wiggle) * baseSize * 0.12 * (1.0 - s.hideAnim);

  if (bodyScale > 0.18) {
    // Slug Foot Skirt
    ctx.fillStyle = `hsla(${s.hue}, 40%, 78%, 0.92)`;
    ctx.beginPath();
    const footTopY = cy - baseSize * 0.85 * bodyScale + inchWiggle;
    const footBottomY = cy + baseSize * 0.85 * bodyScale;
    const footHalfW = baseSize * 0.38 * bodyScale;

    ctx.ellipse(cx, (footTopY + footBottomY) * 0.5, footHalfW, (footBottomY - footTopY) * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyestalks & Eyes (Only if extended)
    if (s.hideAnim < 0.4) {
      const stalkExtend = (1.0 - s.hideAnim * 2.2);
      const stalkLen = baseSize * 0.65 * stalkExtend;
      const eyeR = Math.max(2.0, baseSize * 0.18 * stalkExtend);

      ctx.strokeStyle = `hsla(${s.hue}, 40%, 75%, 0.95)`;
      ctx.lineWidth = Math.max(1.5, baseSize * 0.1);
      ctx.beginPath();
      // Left stalk
      ctx.moveTo(cx - footHalfW * 0.5, footTopY + 2);
      ctx.lineTo(cx - footHalfW * 1.1, footTopY - stalkLen);
      // Right stalk
      ctx.moveTo(cx + footHalfW * 0.5, footTopY + 2);
      ctx.lineTo(cx + footHalfW * 1.1, footTopY - stalkLen);
      ctx.stroke();

      // Eye globes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - footHalfW * 1.1, footTopY - stalkLen, eyeR, 0, Math.PI * 2);
      ctx.arc(cx + footHalfW * 1.1, footTopY - stalkLen, eyeR, 0, Math.PI * 2);
      ctx.fill();

      // Pupils (follow music pulse)
      const pupilR = eyeR * (0.45 + audio.bass * 0.2);
      ctx.fillStyle = '#081014';
      ctx.beginPath();
      ctx.arc(cx - footHalfW * 1.1, footTopY - stalkLen - eyeR * 0.2, pupilR, 0, Math.PI * 2);
      ctx.arc(cx + footHalfW * 1.1, footTopY - stalkLen - eyeR * 0.2, pupilR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // C. Spiral Snail Shell
  const shellR = baseSize * (0.82 + (audio.beat ? 0.08 : 0.0) + audio.bass * 0.04);
  const shellY = cy + (isSpooked ? baseSize * 0.1 : 0);

  // Shell glow if Neon Biolum
  if (snailStyle === 'Neon Biolum') {
    ctx.shadowColor = `hsl(${s.hue}, 100%, 60%)`;
    ctx.shadowBlur = 14;
  }

  // Shell Body Gradient
  const shellGrad = ctx.createRadialGradient(cx - shellR * 0.35, shellY - shellR * 0.35, shellR * 0.1, cx, shellY, shellR);
  if (snailStyle === 'Pastel Shells') {
    shellGrad.addColorStop(0, `hsl(${s.hue}, 65%, 85%)`);
    shellGrad.addColorStop(0.7, `hsl(${s.hue}, 70%, 65%)`);
    shellGrad.addColorStop(1, `hsl(${s.hue}, 60%, 42%)`);
  } else {
    shellGrad.addColorStop(0, `hsl(${s.hue}, 100%, 80%)`);
    shellGrad.addColorStop(0.65, `hsl(${s.hue}, 90%, 52%)`);
    shellGrad.addColorStop(1, `hsl(${s.hue}, 95%, 28%)`);
  }
  ctx.fillStyle = shellGrad;
  ctx.beginPath();
  ctx.arc(cx, shellY, shellR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Shell Spiral Grooves
  ctx.strokeStyle = (isSpooked && Math.floor(frame.t * 8) % 2 === 0)
    ? '#ff3355'
    : `hsla(${s.hue}, 100%, 90%, 0.7)`;
  ctx.lineWidth = Math.max(1.5, baseSize * 0.08);
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 4; a += 0.22) {
    const r = (shellR * 0.14) + (shellR * 0.65) * (a / (Math.PI * 4));
    const px = cx + Math.cos(a + 1.2) * r;
    const py = shellY + Math.sin(a + 1.2) * r;
    if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Wet Gloss Highlight on Shell
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.ellipse(cx - shellR * 0.38, shellY - shellR * 0.38, shellR * 0.32, shellR * 0.18, -Math.PI * 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Spook Sweat / Shock Indicator
  if (isSpooked) {
    ctx.fillStyle = '#ffdd44';
    ctx.font = `900 ${Math.max(12, baseSize * 0.8)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('!', cx, shellY - shellR - 4);
  }

  // Snail Name Badge at bottom of lane
  ctx.fillStyle = `hsl(${s.hue}, 90%, 75%)`;
  ctx.font = `800 ${Math.max(10, Math.min(14, laneW * 0.22))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(s.name, s.x, startY + 24);

  ctx.restore();
}

// ---- 9. RAIN PARTICLES (LEAN & DETERMINISTIC) ----
const rainCount = Math.floor(rainLevel * 14);
if (rainCount > 0) {
  ctx.save();
  ctx.strokeStyle = wallTheme === 'Midnight Garden' ? 'rgba(130, 180, 255, 0.22)' : 'rgba(200, 235, 255, 0.22)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let r = 0; r < rainCount; r++) {
    const rx = ((r * 89.3 + frame.t * 380) % frame.width);
    const ry = ((r * 137.7 + frame.t * 900) % (frame.height + 60)) - 30;
    const len = 16 + (r % 6) * 4 + audio.treble * 14;
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - len * 0.3, ry + len);
  }
  ctx.stroke();
  ctx.restore();
}

// ---- 10. FLOATING BADGES & TEXT SPLASHES ----
for (let i = room.state.splashes.length - 1; i >= 0; i--) {
  const sp = room.state.splashes[i];
  sp.y += sp.vy * frame.dt;
  sp.life -= frame.dt * 1.3;
  if (sp.life <= 0) {
    room.state.splashes.splice(i, 1);
    continue;
  }
  ctx.save();
  ctx.globalAlpha = Math.min(1.0, sp.life * 1.5);
  ctx.font = '900 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(sp.text).width + 12;
  ctx.fillStyle = sp.bg;
  ctx.fillRect(sp.x - tw * 0.5, sp.y - 10, tw, 20);
  ctx.strokeStyle = sp.color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sp.x - tw * 0.5, sp.y - 10, tw, 20);
  ctx.fillStyle = sp.color;
  ctx.fillText(sp.text, sp.x, sp.y + 1);
  ctx.restore();
}

// ---- 11. WINNER CONFETTI BURST ----
for (let i = room.state.confetti.length - 1; i >= 0; i--) {
  const c = room.state.confetti[i];
  c.x += c.vx * frame.dt;
  c.y += c.vy * frame.dt;
  c.vy += 320 * frame.dt;
  c.life -= frame.dt * 0.6;
  c.rot += frame.dt * 5;
  if (c.life <= 0) {
    room.state.confetti.splice(i, 1);
    continue;
  }
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.rot);
  ctx.fillStyle = `hsla(${c.hue}, 95%, 65%, ${c.life})`;
  ctx.fillRect(-4, -2, 8, 4);
  ctx.restore();
}

// ---- 12. OVERLAY LABELS & BIG SHORT BANNER ----
// Top Title Bar
ctx.save();
ctx.textAlign = 'center';
ctx.fillStyle = '#e2f4df';
ctx.font = '900 24px system-ui, sans-serif';
ctx.shadowColor = 'rgba(0,0,0,0.8)';
ctx.shadowBlur = 8;
ctx.fillText('🐌 THE RAINY WALL SLIME CUP 🐌', frame.width * 0.5, finishY - 50);
ctx.font = '700 13px system-ui, sans-serif';
ctx.fillStyle = 'rgba(180, 225, 190, 0.85)';
ctx.fillText('PRESS "SLIME" TO INCH • PRESS TOO FAST AND YOUR SNAIL RETRACTS!', frame.width * 0.5, finishY - 28);
ctx.shadowBlur = 0;

// Countdown Phase Banners
if (room.state.phase === 'countdown') {
  const t = room.state.phaseTimer;
  let countText = 'PATIENCE...';
  let countColor = '#55ff99';
  if (t > 2.2) {
    countText = 'READY...';
    countColor = '#ffdd44';
  } else if (t > 1.1) {
    countText = 'STEADY...';
    countColor = '#ff9933';
  }
  const scale = 1.0 + Math.sin(frame.t * 8) * 0.05;
  ctx.save();
  ctx.translate(frame.width * 0.5, frame.height * 0.5);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(8, 14, 12, 0.88)';
  ctx.fillRect(-220, -50, 440, 100);
  ctx.strokeStyle = countColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(-220, -50, 440, 100);
  ctx.fillStyle = countColor;
  ctx.font = '900 52px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = countColor;
  ctx.shadowBlur = 24;
  ctx.fillText(countText, 0, 0);
  ctx.restore();
}

// Winner Celebration Phase Banner
if (room.state.phase === 'celebrating') {
  ctx.save();
  ctx.translate(frame.width * 0.5, frame.height * 0.44);
  const winBounce = 1.0 + Math.sin(frame.t * 10) * 0.04;
  ctx.scale(winBounce, winBounce);

  // Banner Backdrop
  ctx.fillStyle = 'rgba(6, 12, 9, 0.94)';
  ctx.fillRect(-340, -90, 680, 180);
  ctx.strokeStyle = `hsl(${room.state.winnerHue}, 100%, 65%)`;
  ctx.lineWidth = 5;
  ctx.strokeRect(-340, -90, 680, 180);

  ctx.shadowColor = `hsl(${room.state.winnerHue}, 100%, 65%)`;
  ctx.shadowBlur = 30;
  ctx.fillStyle = `hsl(${room.state.winnerHue}, 100%, 75%)`;
  ctx.font = '900 62px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('★ WINNER! ★', 0, -32);

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px system-ui, sans-serif';
  ctx.fillText(`${room.state.winnerName.toUpperCase()} TAKES THE WALL!`, 0, 22);

  ctx.font = '700 16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(180, 235, 195, 0.9)';
  ctx.fillText('SLOW AND STEADY WINS • NEXT RACE SHORTLY', 0, 56);
  ctx.restore();
}

// Racing Active Sub-HUD (Cadence indicator for whole room)
if (room.state.phase === 'racing' && frame.t - room.state.lastInputTime > 3.0) {
  ctx.fillStyle = 'rgba(255, 230, 120, 0.7)';
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('• ATTRACT CRUISE • PRESS "SLIME" TO STEER YOUR SNAIL •', frame.width * 0.5, startY - 14);
}

ctx.restore();