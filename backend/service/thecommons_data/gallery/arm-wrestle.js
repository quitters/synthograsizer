ctx.save();

// ---- PERSISTENT STATE INIT ----
room.state.scoreA ??= 0;
room.state.scoreB ??= 0;
room.state.tilt ??= 0;          // -1 (Team A pin) to +1 (Team B pin)
room.state.tiltVel ??= 0;
room.state.roundState ??= 'fight'; // 'fight' | 'won'
room.state.winner ??= null;
room.state.winTimer ??= 0;
room.state.lastPushT ??= 0;
room.state.shake ??= 0;
room.state.particles ??= [];
room.state.shockwaves ??= [];
room.state.lampPhase ??= 0;

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.52;
const dt = Math.min(frame.dt || 0.016, 0.05);

// ---- KNOBS & SETTINGS ----
const theme = getVar('arena_theme') ?? 'Underground Tavern';
const strainSens = getVar('strain_force') ?? 5;
const sweatMode = getVar('sweat_intensity') ?? 'Sweat Torrent';
const lampSwing = getVar('spotlight_swing') ?? true;
const canRumble = getVar('camera_rumble') ?? true;

// Palette definition
const palettes = {
  'Underground Tavern': {
    bg: '#0c0806',
    wood: '#442211',
    woodEdge: '#261208',
    woodHighlight: '#703c1e',
    tablePadA: '#e63946',
    tablePadB: '#e76f51',
    teamA: '#ff3b30',
    teamB: '#f4a261',
    teamAName: 'CRIMSON',
    teamBName: 'AMBER',
    lampGlow: 'rgba(255, 190, 80, ',
    metal: '#785b46'
  },
  'Neon Cyber Club': {
    bg: '#060714',
    wood: '#0e122b',
    woodEdge: '#070a1a',
    woodHighlight: '#22295a',
    tablePadA: '#ff0077',
    tablePadB: '#00f0ff',
    teamA: '#ff0077',
    teamB: '#00f0ff',
    teamAName: 'SYNTH PINK',
    teamBName: 'CYBER CYAN',
    lampGlow: 'rgba(0, 240, 255, ',
    metal: '#3b427a'
  },
  'Steel Colosseum': {
    bg: '#0a0d12',
    wood: '#1e242d',
    woodEdge: '#101419',
    woodHighlight: '#343f4f',
    tablePadA: '#ff4d00',
    tablePadB: '#76ff03',
    teamA: '#ff5500',
    teamB: '#76ff03',
    teamAName: 'MAGMA',
    teamBName: 'VENOM',
    lampGlow: 'rgba(230, 240, 255, ',
    metal: '#4b5563'
  }
};
const pal = palettes[theme] ?? palettes['Underground Tavern'];

// Determine team membership logic
const allTables = [...new Set((room.people || []).map(p => p.table))];
function getTeam(participantId) {
  const p = (room.people || []).find(x => x.id === participantId);
  if (!p) return Math.random() < 0.5 ? 'A' : 'B';
  if (allTables.length > 1) {
    return allTables.indexOf(p.table) % 2 === 0 ? 'A' : 'B';
  }
  return (room.people.indexOf(p) % 2 === 0) ? 'A' : 'B';
}

// Hand pivot geometry
const padDistance = Math.min(340, W * 0.22);
const tableY = cy + 120;
const handBaseY = cy - 130;
const slamArc = 200;

// Current grip point
const gripX = cx + room.state.tilt * padDistance;
const gripY = handBaseY + Math.pow(Math.abs(room.state.tilt), 1.8) * slamArc;

// ---- PROCESS USER EVENTS ----
const pushForce = 0.05 + strainSens * 0.022;
let pushedA = false;
let pushedB = false;

for (const e of room.events) {
  if (e.name === 'push') {
    room.state.lastPushT = frame.t;
    if (room.state.roundState === 'fight') {
      const tm = getTeam(e.participantId);
      const person = (room.people || []).find(p => p.id === e.participantId);
      const pColor = person ? `hsl(${person.hue}, 100%, 65%)` : (tm === 'A' ? pal.teamA : pal.teamB);

      if (tm === 'A') {
        room.state.tiltVel -= pushForce;
        pushedA = true;
      } else {
        room.state.tiltVel += pushForce;
        pushedB = true;
      }
      room.state.shake = Math.min(room.state.shake + 9, 26);

      // Spawn sweat/impact particles
      const count = sweatMode === 'Misty Spritz' ? 6 : (sweatMode === 'Sparks & Steam' ? 12 : 18);
      const dirSign = tm === 'A' ? -1 : 1;
      for (let i = 0; i < count; i++) {
        if (room.state.particles.length > 120) room.state.particles.shift();
        const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.5 + dirSign * 0.4;
        const spd = 200 + Math.random() * 450;
        room.state.particles.push({
          x: gripX + (Math.random() - 0.5) * 20,
          y: gripY + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 1.0,
          decay: 1.2 + Math.random() * 1.5,
          size: sweatMode === 'Sparks & Steam' ? 3 + Math.random() * 3 : 4 + Math.random() * 4,
          color: pColor,
          isSpark: sweatMode === 'Sparks & Steam'
        });
      }

      // Add shockwave
      if (room.state.shockwaves.length > 8) room.state.shockwaves.shift();
      room.state.shockwaves.push({
        x: gripX,
        y: gripY,
        r: 10,
        maxR: 90 + audio.bass * 60,
        color: pColor,
        alpha: 0.9
      });
    }
  }
}

// ---- ATTRACT MODE & IDLE DUEL ----
const idleDuration = frame.t - room.state.lastPushT;
if (idleDuration > 2.5 && room.state.roundState === 'fight') {
  // Autonomous dynamic tug-of-war so the screen never freezes
  const duelWobble = Math.sin(frame.t * 2.8) * 0.016 + Math.cos(frame.t * 6.3) * 0.008;
  room.state.tiltVel += duelWobble;

  // Tiny periodic sweat fleck during attract
  if (Math.random() < 0.2) {
    if (room.state.particles.length > 120) room.state.particles.shift();
    room.state.particles.push({
      x: gripX,
      y: gripY - 10,
      vx: (Math.random() - 0.5) * 120,
      vy: -150 - Math.random() * 100,
      life: 0.8,
      decay: 2.0,
      size: 3,
      color: '#ffffff',
      isSpark: false
    });
  }
}

// ---- PHYSICS & WIN CHECK ----
if (room.state.roundState === 'fight') {
  room.state.tilt += room.state.tiltVel * dt * 60;
  // Dampening & slight elasticity toward center for sustained drama
  room.state.tiltVel *= 0.86;
  room.state.tiltVel -= room.state.tilt * 0.018;

  // Pin threshold limits
  if (room.state.tilt <= -0.98) {
    room.state.tilt = -1;
    room.state.roundState = 'won';
    room.state.winner = 'A';
    room.state.scoreA++;
    room.state.winTimer = frame.t;
    room.state.shake = 35;
    // Slam ring blast
    for (let i = 0; i < 35; i++) {
      if (room.state.particles.length > 120) room.state.particles.shift();
      const sp = 250 + Math.random() * 600;
      const an = Math.random() * Math.PI * 2;
      room.state.particles.push({
        x: cx - padDistance,
        y: tableY - 10,
        vx: Math.cos(an) * sp,
        vy: Math.sin(an) * sp - 150,
        life: 1.2,
        decay: 1.0,
        size: 5 + Math.random() * 5,
        color: pal.teamA,
        isSpark: true
      });
    }
  } else if (room.state.tilt >= 0.98) {
    room.state.tilt = 1;
    room.state.roundState = 'won';
    room.state.winner = 'B';
    room.state.scoreB++;
    room.state.winTimer = frame.t;
    room.state.shake = 35;
    // Slam ring blast
    for (let i = 0; i < 35; i++) {
      if (room.state.particles.length > 120) room.state.particles.shift();
      const sp = 250 + Math.random() * 600;
      const an = Math.random() * Math.PI * 2;
      room.state.particles.push({
        x: cx + padDistance,
        y: tableY - 10,
        vx: Math.cos(an) * sp,
        vy: Math.sin(an) * sp - 150,
        life: 1.2,
        decay: 1.0,
        size: 5 + Math.random() * 5,
        color: pal.teamB,
        isSpark: true
      });
    }
  }
} else if (room.state.roundState === 'won') {
  // Keep pinned
  room.state.tiltVel = 0;
  // Auto reset round after 3.6s
  if (frame.t - room.state.winTimer > 3.6) {
    room.state.roundState = 'fight';
    room.state.winner = null;
    room.state.tilt = 0;
    room.state.tiltVel = 0;
  }
}

// ---- SCREEN SHAKE APPLY ----
if (canRumble && room.state.shake > 0.3) {
  const s = room.state.shake;
  ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  room.state.shake *= 0.91;
}

// ---- BACKGROUND & AMBIENCE ----
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Subtle background wall planks
ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
ctx.lineWidth = 2;
const wallGap = 65;
for (let y = 0; y < tableY - 40; y += wallGap) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
}

// ---- SWINGING HANGING SPOTLIGHT ----
const lampArmL = 260;
let lampAngle = 0;
if (lampSwing) {
  lampAngle = Math.sin(frame.t * 1.6) * 0.16 + (audio.bass * 0.05);
}
const lampX = cx + Math.sin(lampAngle) * lampArmL;
const lampY = Math.cos(lampAngle) * lampArmL * 0.35 + 30;

// Cord
ctx.strokeStyle = '#2d2d2d';
ctx.lineWidth = 4;
ctx.beginPath();
ctx.moveTo(cx, 0);
ctx.lineTo(lampX, lampY);
ctx.stroke();

// Lamp shade hood
ctx.save();
ctx.translate(lampX, lampY);
ctx.rotate(lampAngle);
ctx.fillStyle = '#1c1c1c';
ctx.beginPath();
ctx.moveTo(-35, 0);
ctx.lineTo(35, 0);
ctx.lineTo(20, -28);
ctx.lineTo(-20, -28);
ctx.closePath();
ctx.fill();

// Bulb
ctx.fillStyle = '#fff4cc';
ctx.beginPath();
ctx.arc(0, 2, 9, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// Light cone projection on floor/table
ctx.save();
const spotGrad = ctx.createRadialGradient(lampX, lampY + 120, 40, lampX, lampY + 340, 520);
spotGrad.addColorStop(0, pal.lampGlow + (0.35 + audio.level * 0.25) + ')');
spotGrad.addColorStop(0.5, pal.lampGlow + '0.12)');
spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = spotGrad;
ctx.beginPath();
ctx.moveTo(lampX - 40, lampY + 10);
ctx.lineTo(lampX + 40, lampY + 10);
ctx.lineTo(lampX + 680, H);
ctx.lineTo(lampX - 680, H);
ctx.closePath();
ctx.fill();
ctx.restore();

// ---- CROWD / SPECTATOR AVATARS ----
// Draw room.people dynamically distributed on left/right stands
const teamAPeople = [];
const teamBPeople = [];
const peopleList = room.people || [];
for (const p of peopleList) {
  if (getTeam(p.id) === 'A') teamAPeople.push(p);
  else teamBPeople.push(p);
}

function drawSideCrowd(members, startX, endX, isLeft) {
  const n = members.length;
  const maxSlots = Math.max(n, 4);
  const stepX = (endX - startX) / (maxSlots + 1);
  const crowdY = tableY - 140;

  for (let i = 0; i < maxSlots; i++) {
    const px = startX + stepX * (i + 1);
    const person = members[i];
    const bounce = Math.sin(frame.t * 5 + i * 1.3) * (audio.beat ? 12 : 5);
    const hue = person ? person.hue : (isLeft ? 5 : 200);
    const alpha = person ? 0.95 : 0.22;

    // Head / body
    ctx.save();
    ctx.fillStyle = `hsla(${hue}, 85%, 55%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, crowdY - bounce, 16, 0, Math.PI * 2);
    ctx.fill();

    // Torso
    ctx.fillStyle = `hsla(${hue}, 60%, 30%, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(px, crowdY + 28 - bounce, 18, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cheering arm waving up
    ctx.strokeStyle = `hsla(${hue}, 85%, 60%, ${alpha})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const armAngle = (isLeft ? -1 : 1) * Math.sin(frame.t * 8 + i) * 0.4 - 0.7;
    ctx.moveTo(px + (isLeft ? -8 : 8), crowdY + 14 - bounce);
    ctx.lineTo(px + Math.cos(armAngle) * 30 * (isLeft ? -1 : 1), crowdY + Math.sin(armAngle) * 30 - bounce);
    ctx.stroke();
    ctx.restore();
  }
}
drawSideCrowd(teamAPeople, 40, cx - padDistance - 60, true);
drawSideCrowd(teamBPeople, cx + padDistance + 60, W - 40, false);

// ---- HEAVY WOODEN TABLE ----
const tableW = Math.min(880, W * 0.85);
const tableH = 140;
const tableTop = tableY;

// Table Shadow
ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
ctx.beginPath();
ctx.ellipse(cx, tableTop + tableH + 40, tableW * 0.52, 45, 0, 0, Math.PI * 2);
ctx.fill();

// Heavy Legs
ctx.fillStyle = pal.woodEdge;
ctx.fillRect(cx - tableW * 0.42, tableTop + 30, 60, H - tableTop);
ctx.fillRect(cx + tableW * 0.42 - 60, tableTop + 30, 60, H - tableTop);

// Main Tabletop Slab
ctx.fillStyle = pal.wood;
ctx.beginPath();
ctx.roundRect(cx - tableW * 0.5, tableTop, tableW, tableH, 18);
ctx.fill();

// Beveled rim & woodgrain highlight
ctx.strokeStyle = pal.woodHighlight;
ctx.lineWidth = 6;
ctx.beginPath();
ctx.roundRect(cx - tableW * 0.5, tableTop, tableW, 28, [18, 18, 0, 0]);
ctx.stroke();

// Corner Metal Brackets & Rivets
ctx.fillStyle = pal.metal;
const bW = 34;
const bH = 50;
ctx.fillRect(cx - tableW * 0.5, tableTop, bW, bH);
ctx.fillRect(cx + tableW * 0.5 - bW, tableTop, bW, bH);
ctx.fillStyle = '#ffffff';
for (let i = 0; i < 3; i++) {
  ctx.beginPath();
  ctx.arc(cx - tableW * 0.5 + 17, tableTop + 12 + i * 14, 2.5, 0, Math.PI * 2);
  ctx.arc(cx + tableW * 0.5 - 17, tableTop + 12 + i * 14, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

// Center battle groove line
ctx.strokeStyle = 'rgba(0,0,0,0.5)';
ctx.lineWidth = 4;
ctx.beginPath();
ctx.moveTo(cx, tableTop + 6);
ctx.lineTo(cx, tableTop + tableH - 6);
ctx.stroke();

// Elbow Resting Pads
const elbowX_A = cx - padDistance * 0.65;
const elbowX_B = cx + padDistance * 0.65;
const elbowY = tableTop + 30;

function drawPad(x, y, padColor, glow) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = padColor;
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = padColor;
  ctx.beginPath();
  ctx.ellipse(x, y, 46, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}
drawPad(elbowX_A, elbowY, pal.tablePadA, room.state.tilt < -0.6);
drawPad(elbowX_B, elbowY, pal.tablePadB, room.state.tilt > 0.6);

// Slam Pin Cushions (Where hands hit the table for a win)
function drawSlamCushion(x, y, color, isHit) {
  ctx.save();
  ctx.fillStyle = color;
  if (isHit) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
  }
  ctx.beginPath();
  ctx.roundRect(x - 30, y - 10, 60, 20, 6);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = isHit ? 3 : 1;
  ctx.stroke();
  ctx.restore();
}
drawSlamCushion(cx - padDistance, tableTop + 20, pal.teamA, room.state.tilt <= -0.98);
drawSlamCushion(cx + padDistance, tableTop + 20, pal.teamB, room.state.tilt >= 0.98);

// ---- LOCKED FOREARMS RENDERING ----
// Muscle tension jitter
const jitterAmp = (room.state.roundState === 'fight' ? 1.0 : 0.0) *
  (3.5 * (1 - Math.abs(room.state.tilt) * 0.5) + audio.bass * 8);
const jitterX = (Math.random() - 0.5) * jitterAmp;
const jitterY = (Math.random() - 0.5) * jitterAmp;

const curGripX = gripX + jitterX;
const curGripY = gripY + jitterY;

function drawForearm(elX, elY, gX, gY, armCol, shadeCol, isTeamA) {
  ctx.save();
  const dx = gX - elX;
  const dy = gY - elY;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);

  // Muscle contour polygon
  ctx.beginPath();
  // Elbow root
  ctx.moveTo(elX + nx * 24, elY + ny * 24);
  // Forearm bulk (brachioradialis)
  const mid1X = elX + dx * 0.45;
  const mid1Y = elY + dy * 0.45;
  ctx.quadraticCurveTo(mid1X + nx * 44, mid1Y + ny * 44, gX + nx * 22, gY + ny * 22);
  // Wrist edge
  ctx.lineTo(gX - nx * 20, gY - ny * 20);
  // Inner muscle
  ctx.quadraticCurveTo(mid1X - nx * 26, mid1Y - ny * 26, elX - nx * 22, elY - ny * 22);
  ctx.closePath();

  // Shading
  const grad = ctx.createLinearGradient(elX + nx * 30, elY + ny * 30, elX - nx * 30, elY - ny * 30);
  grad.addColorStop(0, armCol);
  grad.addColorStop(0.55, armCol);
  grad.addColorStop(1, shadeCol);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Pulsing strain vein
  ctx.strokeStyle = isTeamA ? 'rgba(255,200,200,0.7)' : 'rgba(200,255,255,0.7)';
  ctx.lineWidth = 2 + audio.bass * 3;
  ctx.beginPath();
  ctx.moveTo(elX + dx * 0.2 + nx * 12, elY + dy * 0.2 + ny * 12);
  ctx.lineTo(elX + dx * 0.45 + nx * 18, elY + dy * 0.45 + ny * 18);
  ctx.lineTo(elX + dx * 0.75 + nx * 8, elY + dy * 0.75 + ny * 8);
  ctx.stroke();

  // Wrist athletic tape
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(gX + nx * 21 - dx * 0.08, gY + ny * 21 - dy * 0.08);
  ctx.lineTo(gX - nx * 19 - dx * 0.08, gY - ny * 19 - dy * 0.08);
  ctx.stroke();

  ctx.restore();
}

// Draw left forearm (Team A)
drawForearm(elbowX_A, elbowY, curGripX, curGripY, pal.teamA, '#550510', true);
// Draw right forearm (Team B)
drawForearm(elbowX_B, elbowY, curGripX, curGripY, pal.teamB, '#052c38', false);

// ---- INTERLOCKED CLENCHED FISTS AT GRIP ----
ctx.save();
ctx.translate(curGripX, curGripY);

// Clasp shadow & outline glow
if (room.state.roundState === 'fight') {
  ctx.shadowColor = room.state.tilt < 0 ? pal.teamA : pal.teamB;
  ctx.shadowBlur = 15 + audio.level * 20;
}

// Team A Fingers (Left Hand Clasp)
ctx.fillStyle = pal.teamA;
for (let f = -2; f <= 1; f++) {
  ctx.beginPath();
  ctx.roundRect(-22, f * 9 - 4, 26, 8, 4);
  ctx.fill();
}

// Team B Thumb & Knuckles (Interlocking right hand)
ctx.fillStyle = pal.teamB;
for (let f = -1; f <= 2; f++) {
  ctx.beginPath();
  ctx.roundRect(-4, f * 9 - 4, 26, 8, 4);
  ctx.fill();
}

// Thumbs clamped down
ctx.fillStyle = '#f0d0b8';
ctx.beginPath();
ctx.ellipse(-14, -20, 10, 6, 0.4, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
ctx.ellipse(14, -20, 10, 6, -0.4, 0, Math.PI * 2);
ctx.fill();

// White-knuckle pressure sparks at the center clasp
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(0, 0, 4 + audio.mid * 5, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// ---- SHOCKWAVES UPDATE & DRAW ----
for (let i = room.state.shockwaves.length - 1; i >= 0; i--) {
  const sw = room.state.shockwaves[i];
  sw.r += dt * 320;
  sw.alpha *= 0.90;
  if (sw.alpha < 0.05 || sw.r >= sw.maxR) {
    room.state.shockwaves.splice(i, 1);
    continue;
  }
  ctx.save();
  ctx.strokeStyle = sw.color;
  ctx.lineWidth = 4 * sw.alpha;
  ctx.globalAlpha = sw.alpha;
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---- PARTICLES (SWEAT, SPARKS) ----
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += (p.isSpark ? 280 : 550) * dt; // Gravity
  p.life -= p.decay * dt;

  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, p.life);
  ctx.fillStyle = p.color;
  if (p.isSpark) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
    ctx.stroke();
  } else {
    // Sweat droplet teardrop shape
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- TUG-OF-WAR TILT GAUGE ----
const meterW = Math.min(540, W * 0.55);
const meterH = 14;
const meterY = tableTop + tableH - 24;

ctx.save();
// Gauge track
ctx.fillStyle = 'rgba(0,0,0,0.6)';
ctx.beginPath();
ctx.roundRect(cx - meterW * 0.5, meterY, meterW, meterH, 7);
ctx.fill();

// Mid divider tick
ctx.fillStyle = '#ffffff';
ctx.fillRect(cx - 1.5, meterY - 3, 3, meterH + 6);

// Active tilt fill bar
const meterFill = (room.state.tilt) * (meterW * 0.5);
if (meterFill < 0) {
  ctx.fillStyle = pal.teamA;
  ctx.beginPath();
  ctx.roundRect(cx + meterFill, meterY + 2, -meterFill, meterH - 4, 5);
  ctx.fill();
} else if (meterFill > 0) {
  ctx.fillStyle = pal.teamB;
  ctx.beginPath();
  ctx.roundRect(cx, meterY + 2, meterFill, meterH - 4, 5);
  ctx.fill();
}

// Meter pointer indicator
ctx.shadowColor = '#000';
ctx.shadowBlur = 6;
ctx.fillStyle = '#ffffff';
ctx.beginPath();
const pinPtrX = cx + (room.state.tilt * meterW * 0.5);
ctx.arc(pinPtrX, meterY + meterH * 0.5, 9, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// ---- TOP SCOREBOARD & PARTY HUD ----
const scoreBarY = 65;

// Team A Score Card (Left)
ctx.save();
ctx.textAlign = 'left';
ctx.textBaseline = 'middle';
ctx.font = '900 48px sans-serif';
ctx.fillStyle = pal.teamA;
ctx.fillText(room.state.scoreA.toString(), 60, scoreBarY);

ctx.font = '900 20px sans-serif';
ctx.fillStyle = pal.teamA;
ctx.fillText(pal.teamAName, 125, scoreBarY - 12);
ctx.font = '600 14px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.fillText(`${teamAPeople.length} PLAYERS`, 125, scoreBarY + 12);

// Team B Score Card (Right)
ctx.textAlign = 'right';
ctx.font = '900 48px sans-serif';
ctx.fillStyle = pal.teamB;
ctx.fillText(room.state.scoreB.toString(), W - 60, scoreBarY);

ctx.font = '900 20px sans-serif';
ctx.fillStyle = pal.teamB;
ctx.fillText(pal.teamBName, W - 125, scoreBarY - 12);
ctx.font = '600 14px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.fillText(`${teamBPeople.length} PLAYERS`, W - 125, scoreBarY + 12);

// VS Badge in Center
ctx.textAlign = 'center';
ctx.font = '900 26px sans-serif';
ctx.fillStyle = '#ffffff';
ctx.shadowColor = '#000';
ctx.shadowBlur = 8;
ctx.fillText('VS', cx, scoreBarY);
ctx.restore();

// ---- CENTER ANNOUNCEMENT & ATTRACT BANNER ----
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

if (room.state.roundState === 'won') {
  const isWinnerA = room.state.winner === 'A';
  const winColor = isWinnerA ? pal.teamA : pal.teamB;
  const winText = isWinnerA ? `${pal.teamAName} SLAMS!` : `${pal.teamBName} SLAMS!`;

  // Winner Flash Backdrop
  const pulse = 1 + Math.sin(frame.t * 12) * 0.06;
  ctx.translate(cx, cy - 230);
  ctx.scale(pulse, pulse);

  ctx.shadowColor = winColor;
  ctx.shadowBlur = 35;
  ctx.font = '900 70px sans-serif';
  ctx.fillStyle = winColor;
  ctx.fillText(winText, 0, 0);

  ctx.font = '900 24px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 10;
  ctx.fillText('WINNER! NEXT ROUND STARTING...', 0, 52);
} else {
  // In Fight Mode: Display GO or PUSH callout
  if (idleDuration > 3.0) {
    // Attract Prompt
    const blink = (Math.sin(frame.t * 4) + 1) * 0.5;
    ctx.font = '900 24px sans-serif';
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + blink * 0.6})`;
    ctx.fillText('PRESS [PUSH] TO TILT THE GRIP!', cx, cy - 240);
  } else {
    // Active battle meter / hype
    ctx.font = '900 32px sans-serif';
    const pushBias = Math.abs(room.state.tilt);
    if (pushBias > 0.6) {
      ctx.fillStyle = room.state.tilt < 0 ? pal.teamA : pal.teamB;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 16;
      ctx.fillText('PIN IMMINENT!', cx, cy - 240);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('LOCK IN & PUSH!', cx, cy - 240);
    }
  }
}
ctx.restore();

ctx.restore();