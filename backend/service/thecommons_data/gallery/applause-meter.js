ctx.save();
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

// Init persistent state safely
room.state.needle ??= 0;
room.state.needleVel ??= 0;
room.state.holdProgress ??= 0;
room.state.curtainOpen ??= 0;
room.state.gameState ??= 'ready'; // ready, holding, finale
room.state.finaleTimer ??= 0;
room.state.lastCheerT ??= frame.t;
room.state.particles ??= [];
room.state.jumpers ??= {}; // participantId -> jump timer
room.state.topParticipant ??= null;
room.state.cheerCounts ??= {};

const themeStr = getVar('stage_theme') || 'Broadway Velvet';
const targetStr = getVar('target_hold') || 'Party Roar (3.5s)';
const sens = getVar('sensitivity') ?? 2.5;
const showAudience = getVar('audience_lane') ?? true;

const holdDurations = { 'Fast Clap (2s)': 2.0, 'Party Roar (3.5s)': 3.5, 'Iron Lungs (5s)': 5.0 };
const holdReq = holdDurations[targetStr] || 3.5;

// Handle events
let cheerCountThisFrame = 0;
if (room.events && room.events.length) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    if (ev.name === 'cheer') {
      cheerCountThisFrame++;
      room.state.lastCheerT = frame.t;
      if (ev.participantId) {
        room.state.jumpers[ev.participantId] = 0.45;
        room.state.cheerCounts[ev.participantId] = (room.state.cheerCounts[ev.participantId] || 0) + 1;
        room.state.topParticipant = ev.participantId;
      }
    }
  }
}

// Attract mode if idle > 4s
const idleT = frame.t - room.state.lastCheerT;
const inAttract = idleT > 4.5 && room.state.gameState !== 'finale';

// Target needle input from mic + cheers + attract pulse
let needleInput = (audio.level * 0.9 + audio.bass * 0.5) * (sens * 0.45);
if (cheerCountThisFrame > 0) {
  needleInput += Math.min(0.7, cheerCountThisFrame * 0.28);
}
if (inAttract) {
  needleInput += Math.max(0, Math.sin(frame.t * 3.2) * 0.45 + (audio.beat ? 0.35 : 0.15));
}

// Spring physics for needle
const targetNeedle = Math.max(0.04, Math.min(1.0, needleInput));
const springK = 38.0;
const damping = 7.5;
const force = (targetNeedle - room.state.needle) * springK;
room.state.needleVel += (force - room.state.needleVel * damping) * dt;
room.state.needle += room.state.needleVel * dt;
room.state.needle = Math.max(0.02, Math.min(1.04, room.state.needle));

// Needle jitter when hot
const jitter = room.state.needle > 0.8 ? (Math.random() - 0.5) * 0.05 * (audio.level + 0.3) : 0;
const displayNeedle = Math.max(0, Math.min(1.05, room.state.needle + jitter));

// Game state transitions
const RED_LINE = 0.82;
if (room.state.gameState === 'finale') {
  room.state.finaleTimer -= dt;
  room.state.curtainOpen = Math.min(1.0, room.state.curtainOpen + dt * 1.6);
  if (room.state.finaleTimer <= 0) {
    room.state.gameState = 'ready';
    room.state.holdProgress = 0;
  }
} else {
  if (displayNeedle >= RED_LINE) {
    room.state.holdProgress += dt / holdReq;
    if (room.state.holdProgress >= 1.0) {
      room.state.gameState = 'finale';
      room.state.finaleTimer = 6.0;
      // Spawn mega celebratory confetti
      for (let p = 0; p < 90; p++) {
        if (room.state.particles.length < 180) {
          room.state.particles.push({
            x: W * 0.65 + (Math.random() - 0.5) * W * 0.3,
            y: H * 0.5,
            vx: (Math.random() - 0.5) * 900,
            vy: -Math.random() * 800 - 150,
            size: Math.random() * 9 + 4,
            hue: Math.floor(Math.random() * 360),
            rot: Math.random() * 6,
            vr: (Math.random() - 0.5) * 12,
            life: 1.0
          });
        }
      }
    }
  } else {
    room.state.holdProgress = Math.max(0, room.state.holdProgress - dt * 0.55);
  }
  room.state.curtainOpen = Math.max(0.0, room.state.curtainOpen - dt * 1.8);
}

// Background fill
ctx.fillStyle = '#08080d';
ctx.fillRect(0, 0, W, H);

// Ambient stage glow
const stageX = W * 0.38;
const stageW = W * 0.62;
const stageH = H * 0.82;

// --- DRAW STAGE (Right / Center) ---
ctx.save();
// Stage Backing (visible through parted curtains)
const stageGrad = ctx.createLinearGradient(stageX, 0, stageX + stageW, stageH);
stageGrad.addColorStop(0, '#1a0d2a');
stageGrad.addColorStop(0.6, '#0d0716');
stageGrad.addColorStop(1, '#05020a');
ctx.fillStyle = stageGrad;
ctx.fillRect(stageX, 0, stageW, stageH);

// Finale / Reveal Stage Lights
if (room.state.curtainOpen > 0.05) {
  const openAlpha = room.state.curtainOpen;
  ctx.save();
  ctx.globalAlpha = openAlpha;
  const cx = stageX + stageW * 0.5;
  const cy = stageH * 0.45;
  
  // Sweeping searchlights
  const beamCount = 6;
  for (let b = 0; b < beamCount; b++) {
    const angle = Math.sin(frame.t * 2.2 + b * (Math.PI * 2 / beamCount)) * 0.65;
    const beamGrad = ctx.createRadialGradient(cx, stageH, 10, cx + Math.tan(angle) * stageH, 0, stageW * 0.3);
    const beamHue = (frame.t * 60 + b * 50) % 360;
    beamGrad.addColorStop(0, `hsla(${beamHue}, 100%, 75%, 0.4)`);
    beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(cx, stageH);
    ctx.lineTo(cx + Math.tan(angle - 0.25) * stageH, 0);
    ctx.lineTo(cx + Math.tan(angle + 0.25) * stageH, 0);
    ctx.closePath();
    ctx.fill();
  }

  // Giant center starburst or Winner badge
  const starPulse = 1.0 + Math.sin(frame.t * 10) * 0.08 + audio.bass * 0.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(starPulse, starPulse);
  
  // Starburst rays
  const rays = 12;
  ctx.fillStyle = 'rgba(255, 220, 80, 0.25)';
  for (let r = 0; r < rays; r++) {
    ctx.rotate(Math.PI / rays);
    ctx.fillRect(-stageW * 0.3, -8, stageW * 0.6, 16);
  }
  
  // Gold Medal / Star plaque
  ctx.beginPath();
  ctx.arc(0, 0, 90, 0, Math.PI * 2);
  ctx.fillStyle = '#ffcf33';
  ctx.shadowColor = '#ffe875';
  ctx.shadowBlur = 35;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#b8860b';
  ctx.stroke();

  // Winner Text
  let winnerName = 'THE ROOM!';
  if (room.state.topParticipant && room.people && room.people.length) {
    const p = room.people.find(person => person.id === room.state.topParticipant);
    if (p) winnerName = `STAR #${p.id.slice(0, 4).toUpperCase()}`;
  }
  ctx.fillStyle = '#220b00';
  ctx.font = '900 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 0;
  ctx.fillText('WINNER!', 0, -18);
  ctx.font = '800 20px sans-serif';
  ctx.fillText(winnerName, 0, 18);
  ctx.restore();

  // Overhead Marquee Sign during Finale
  ctx.fillStyle = '#ffea6c';
  ctx.font = '900 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ffb300';
  ctx.shadowBlur = 25;
  ctx.fillText('100% MAXIMUM ROAR!', cx, 90);
  ctx.restore();
}

// Velvet Curtains
const curtainW = (stageW * 0.51) * (1.0 - room.state.curtainOpen * 0.92);
const folds = 9;

// Curtain palette by theme
let cDark = '#3d0208', cMid = '#820a16', cHi = '#b51928';
if (themeStr === 'Neon Cabaret') {
  cDark = '#1a0328'; cMid = '#580b7c'; cHi = '#9c1fd4';
} else if (themeStr === 'Golden Grand') {
  cDark = '#2b1c00'; cMid = '#6e4b09'; cHi = '#b0811e';
}

// Draw Left Velvet Curtain
ctx.save();
for (let f = 0; f < folds; f++) {
  const fx = stageX + (f / folds) * curtainW;
  const fw = curtainW / folds + 1;
  const fGrad = ctx.createLinearGradient(fx, 0, fx + fw, 0);
  fGrad.addColorStop(0, cDark);
  fGrad.addColorStop(0.5, cHi);
  fGrad.addColorStop(1, cMid);
  ctx.fillStyle = fGrad;
  ctx.fillRect(fx, 0, fw, stageH);
}
// Draw Right Velvet Curtain
const rightCurtainStart = stageX + stageW - curtainW;
for (let f = 0; f < folds; f++) {
  const fx = rightCurtainStart + (f / folds) * curtainW;
  const fw = curtainW / folds + 1;
  const fGrad = ctx.createLinearGradient(fx, 0, fx + fw, 0);
  fGrad.addColorStop(0, cMid);
  fGrad.addColorStop(0.5, cHi);
  fGrad.addColorStop(1, cDark);
  ctx.fillStyle = fGrad;
  ctx.fillRect(fx, 0, fw, stageH);
}

// Top Valance Scallop
const scallopCount = 8;
const scW = stageW / scallopCount;
for (let s = 0; s < scallopCount; s++) {
  ctx.beginPath();
  ctx.arc(stageX + s * scW + scW * 0.5, 0, scW * 0.6, 0, Math.PI);
  ctx.fillStyle = cMid;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffd700';
  ctx.stroke();
}
// Gold fringe rail along top
ctx.fillStyle = '#ffd700';
ctx.fillRect(stageX, 0, stageW, 10);

// Proscenium Pillars / Arch borders
ctx.fillStyle = '#1c1306';
ctx.fillRect(stageX, 0, 16, stageH);
ctx.fillRect(stageX + stageW - 16, 0, 16, stageH);

// Chaser bulbs on Proscenium
const bulbCount = 18;
for (let b = 0; b < bulbCount; b++) {
  const by = 20 + (b / bulbCount) * (stageH - 40);
  const lit = (Math.floor(frame.t * 8) + b) % 3 === 0 || room.state.gameState === 'finale';
  ctx.beginPath();
  ctx.arc(stageX + 8, by, 6, 0, Math.PI * 2);
  ctx.arc(stageX + stageW - 8, by, 6, 0, Math.PI * 2);
  ctx.fillStyle = lit ? '#fff38a' : '#4d4021';
  ctx.shadowColor = lit ? '#ffe600' : 'transparent';
  ctx.shadowBlur = lit ? 12 : 0;
  ctx.fill();
}
ctx.restore();

// Center curtain instruction badge when closed
if (room.state.curtainOpen < 0.3) {
  ctx.save();
  const bx = stageX + stageW * 0.5;
  const by = stageH * 0.42;
  ctx.fillStyle = 'rgba(10, 4, 12, 0.88)';
  ctx.strokeStyle = '#f5c542';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(bx - 170, by - 55, 340, 110, 16);
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '900 26px sans-serif';
  ctx.fillText(inAttract ? 'TAP CHEER TO START!' : 'KEEP IN THE RED!', bx, by - 12);
  
  ctx.fillStyle = '#ff4a5a';
  ctx.font = '800 18px sans-serif';
  const secLeft = Math.max(0, (1 - room.state.holdProgress) * holdReq).toFixed(1);
  ctx.fillText(room.state.holdProgress > 0 ? `HOLD: ${secLeft}s TO UNLOCK` : 'CHEER OR MAKE NOISE!', bx, by + 24);
  ctx.restore();
}

// --- DRAW VINTAGE APPLAUSE GAUGE (Left ~36% width) ---
const gaugeW = stageX - 24;
const gaugeH = H * 0.80;
const gcx = 12 + gaugeW * 0.5;
const gcy = 24 + gaugeH * 0.58;
const gRadius = Math.min(gaugeW * 0.46, gaugeH * 0.44);

ctx.save();
// Gauge Frame Shadow & Bezel
ctx.fillStyle = '#141419';
ctx.strokeStyle = '#cda250';
ctx.lineWidth = 8;
ctx.beginPath();
ctx.roundRect(16, 20, gaugeW, gaugeH, 22);
ctx.fill();
ctx.stroke();

// Header Plaque: "APPLAUSE-O-METER"
ctx.fillStyle = '#241a0d';
ctx.fillRect(32, 34, gaugeW - 32, 54);
ctx.strokeStyle = '#ffd269';
ctx.lineWidth = 2;
ctx.strokeRect(32, 34, gaugeW - 32, 54);

ctx.fillStyle = '#ffeaa7';
ctx.font = '900 24px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('★ APPLAUSE METER ★', gcx, 68);

// Vintage Dial Face
ctx.save();
ctx.beginPath();
ctx.arc(gcx, gcy, gRadius, 0, Math.PI * 2);
const dialGrad = ctx.createRadialGradient(gcx, gcy, 10, gcx, gcy, gRadius);
dialGrad.addColorStop(0, '#fffbe6');
dialGrad.addColorStop(0.85, '#e8dcbe');
dialGrad.addColorStop(1, '#c0b292');
ctx.fillStyle = dialGrad;
ctx.fill();
ctx.lineWidth = 6;
ctx.strokeStyle = '#382e18';
ctx.stroke();

// Dial Arcs: Green -> Yellow -> Red Hot
const startA = Math.PI * 0.82;
const endA = Math.PI * 2.18;
const totalSpan = endA - startA;
const yellowSplit = startA + totalSpan * 0.55;
const redSplit = startA + totalSpan * RED_LINE;

// Background track
ctx.lineWidth = 22;
ctx.lineCap = 'butt';

// Safe Green Arc
ctx.strokeStyle = '#27ae60';
ctx.beginPath();
ctx.arc(gcx, gcy, gRadius - 26, startA, yellowSplit);
ctx.stroke();

// Building Yellow Arc
ctx.strokeStyle = '#f39c12';
ctx.beginPath();
ctx.arc(gcx, gcy, gRadius - 26, yellowSplit, redSplit);
ctx.stroke();

// RED ZONE ARC (Glows intensely when needle is inside)
const inRed = displayNeedle >= RED_LINE;
ctx.strokeStyle = inRed ? (Math.sin(frame.t * 18) > 0 ? '#ff1e38' : '#ff6b7e') : '#d63031';
if (inRed) {
  ctx.shadowColor = '#ff2244';
  ctx.shadowBlur = 20;
}
ctx.beginPath();
ctx.arc(gcx, gcy, gRadius - 26, redSplit, endA);
ctx.stroke();
ctx.shadowBlur = 0;

// Calibration Ticks & Numbers
const ticks = 10;
for (let t = 0; t <= ticks; t++) {
  const pct = t / ticks;
  const ang = startA + pct * totalSpan;
  const rOut = gRadius - 12;
  const rIn = t % 2 === 0 ? gRadius - 40 : gRadius - 30;
  const x1 = gcx + Math.cos(ang) * rIn;
  const y1 = gcy + Math.sin(ang) * rIn;
  const x2 = gcx + Math.cos(ang) * rOut;
  const y2 = gcy + Math.sin(ang) * rOut;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = t >= 8 ? 4 : 2;
  ctx.strokeStyle = t >= 8 ? '#a81324' : '#2d3436';
  ctx.stroke();

  if (t % 2 === 0) {
    const tx = gcx + Math.cos(ang) * (gRadius - 52);
    const ty = gcy + Math.sin(ang) * (gRadius - 52);
    ctx.fillStyle = t >= 8 ? '#b80018' : '#332d20';
    ctx.font = '800 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${t * 10}`, tx, ty);
  }
}

// Vintage dial markings
ctx.fillStyle = '#6e5d3f';
ctx.font = '900 14px sans-serif';
ctx.fillText('DECIBELS', gcx, gcy - gRadius * 0.45);
ctx.fillStyle = '#c0392b';
ctx.font = '900 16px sans-serif';
ctx.fillText('MAX ROAR', gcx + gRadius * 0.44, gcy - gRadius * 0.22);

// Needle
const needleAngle = startA + Math.min(1.03, displayNeedle) * totalSpan;
ctx.save();
ctx.translate(gcx, gcy);
ctx.rotate(needleAngle);

// Needle shadow
ctx.fillStyle = 'rgba(0,0,0,0.25)';
ctx.fillRect(4, -3, gRadius * 0.88, 6);

// Needle body
ctx.beginPath();
ctx.moveTo(-16, -5);
ctx.lineTo(gRadius * 0.86, -1.5);
ctx.lineTo(gRadius * 0.86, 1.5);
ctx.lineTo(-16, 5);
ctx.closePath();
ctx.fillStyle = inRed ? '#e71d36' : '#1e272e';
ctx.shadowColor = inRed ? '#ff0033' : 'transparent';
ctx.shadowBlur = inRed ? 14 : 0;
ctx.fill();
ctx.restore();

// Pivot cap brass
ctx.beginPath();
ctx.arc(gcx, gcy, 18, 0, Math.PI * 2);
ctx.fillStyle = '#a67c1e';
ctx.fill();
ctx.lineWidth = 3;
ctx.strokeStyle = '#2b1f05';
ctx.stroke();

ctx.restore(); // face clip

// Big Digital Score readout beneath needle
const score = Math.min(100, Math.round(displayNeedle * 100));
ctx.fillStyle = '#0f0f14';
ctx.fillRect(gcx - 90, gcy + gRadius * 0.52, 180, 48);
ctx.strokeStyle = inRed ? '#ff385c' : '#576574';
ctx.lineWidth = 3;
ctx.strokeRect(gcx - 90, gcy + gRadius * 0.52, 180, 48);

ctx.fillStyle = inRed ? '#ff385c' : '#2ed573';
ctx.font = '900 36px monospace';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.shadowColor = inRed ? '#ff385c' : '#2ed573';
ctx.shadowBlur = 10;
ctx.fillText(`${score}%`, gcx, gcy + gRadius * 0.52 + 25);
ctx.shadowBlur = 0;

// Red-Zone Hold Progress Bar below dial
const pBarW = gaugeW - 56;
const pBarH = 20;
const pbx = gcx - pBarW * 0.5;
const pby = gaugeH - 34;
ctx.fillStyle = '#1c1c24';
ctx.fillRect(pbx, pby, pBarW, pBarH);
ctx.strokeStyle = '#485460';
ctx.lineWidth = 2;
ctx.strokeRect(pbx, pby, pBarW, pBarH);

if (room.state.holdProgress > 0) {
  const fillW = Math.min(pBarW, pBarW * room.state.holdProgress);
  const fillGrad = ctx.createLinearGradient(pbx, 0, pbx + fillW, 0);
  fillGrad.addColorStop(0, '#f39c12');
  fillGrad.addColorStop(1, '#ff3838');
  ctx.fillStyle = fillGrad;
  ctx.shadowColor = '#ff3838';
  ctx.shadowBlur = 12;
  ctx.fillRect(pbx + 2, pby + 2, fillW - 4, pBarH - 4);
  ctx.shadowBlur = 0;
}
ctx.fillStyle = '#ffffff';
ctx.font = '900 12px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(room.state.gameState === 'finale' ? '★ UNLOCKED! ★' : 'RED ZONE HOLD CHARGE', gcx, pby + pBarH * 0.5);

ctx.restore();

// --- DRAW AUDIENCE ROW AT BOTTOM ---
const audY = H * 0.85;
const audH = H * 0.15;
ctx.fillStyle = '#06060a';
ctx.fillRect(0, audY, W, audH);
ctx.strokeStyle = '#222233';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(0, audY);
ctx.lineTo(W, audY);
ctx.stroke();

const people = (room.people && room.people.length > 0) 
  ? room.people 
  : [{id: 'demo-1', hue: 45}, {id: 'demo-2', hue: 190}, {id: 'demo-3', hue: 320}, {id: 'demo-4', hue: 120}];

if (showAudience) {
  const count = people.length;
  const maxSlots = Math.max(8, count);
  const slotW = W / (count + 1);

  for (let i = 0; i < count; i++) {
    const p = people[i];
    const px = slotW * (i + 1);
    
    // Check jumping timer for cheering response
    if (room.state.jumpers[p.id]) {
      room.state.jumpers[p.id] -= dt;
      if (room.state.jumpers[p.id] <= 0) delete room.state.jumpers[p.id];
    }
    const isJumping = !!room.state.jumpers[p.id];
    const jumpOffset = isJumping ? Math.sin((room.state.jumpers[p.id] / 0.45) * Math.PI) * 32 : (audio.beat ? 6 : 0);
    const headY = audY + 45 - jumpOffset;
    const headR = Math.max(14, Math.min(26, (W / maxSlots) * 0.35));
    
    const pHue = (p.hue !== undefined && !isNaN(p.hue)) ? p.hue : ((i * 45) % 360);
    
    // Cheering particles shooting up
    if (isJumping && Math.random() < 0.4 && room.state.particles.length < 180) {
      room.state.particles.push({
        x: px + (Math.random() - 0.5) * 20,
        y: headY - headR,
        vx: (Math.random() - 0.5) * 80,
        vy: -Math.random() * 260 - 80,
        size: Math.random() * 5 + 3,
        hue: pHue,
        rot: 0,
        vr: 0,
        life: 0.8
      });
    }

    // Audience body / shoulders
    ctx.save();
    ctx.fillStyle = `hsl(${pHue}, 75%, 28%)`;
    ctx.beginPath();
    ctx.ellipse(px, headY + headR + 18, headR * 1.5, headR * 1.0, 0, 0, Math.PI, true);
    ctx.fill();

    // Head with player's color
    ctx.beginPath();
    ctx.arc(px, headY, headR, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${pHue}, 90%, 55%)`;
    ctx.shadowColor = `hsl(${pHue}, 100%, 65%)`;
    ctx.shadowBlur = isJumping ? 18 : 6;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Clapping Hands when jumping
    if (isJumping) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px - headR * 1.1, headY - 8, 6, 0, Math.PI * 2);
      ctx.arc(px + headR * 1.1, headY - 8, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Pop label "CLAP!"
      ctx.fillStyle = '#ffea00';
      ctx.font = '900 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CLAP!', px, headY - headR - 10);
    }
    ctx.restore();
  }
}

// --- DRAW PARTICLES (Bounded confetti / spark pool) ---
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const pt = room.state.particles[i];
  pt.x += pt.vx * dt;
  pt.y += pt.vy * dt;
  pt.vy += 450 * dt; // gravity
  pt.rot += pt.vr * dt;
  pt.life -= dt * 0.95;
  
  if (pt.life <= 0 || pt.y > H) {
    room.state.particles.splice(i, 1);
    continue;
  }
  
  ctx.save();
  ctx.translate(pt.x, pt.y);
  ctx.rotate(pt.rot);
  ctx.globalAlpha = Math.max(0, pt.life);
  ctx.fillStyle = `hsl(${pt.hue}, 95%, 60%)`;
  ctx.fillRect(-pt.size * 0.5, -pt.size * 0.5, pt.size, pt.size * 0.7);
  ctx.restore();
}

ctx.restore();