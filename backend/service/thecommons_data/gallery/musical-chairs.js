ctx.save();

const paletteKey = getVar('palette') ?? 'Neon Night';
const tempoMult = (getVar('dance_tempo') ?? 3) * 0.45;
const autoFill = getVar('bot_fill') ?? true;
const arenaGlow = getVar('arena_glow') ?? true;

// Palettes
const themes = {
  'Neon Night': { bg: '#080816', ring: '#24284d', chair: '#00e5ff', chairClaimed: '#102a45', alert: '#ff0055', text: '#ffffff' },
  'Cyber Disco': { bg: '#10061a', ring: '#3b174d', chair: '#ff00bb', chairClaimed: '#381335', alert: '#ffe600', text: '#ffffff' },
  'Sunset Gold': { bg: '#140c06', ring: '#402a14', chair: '#ff9900', chairClaimed: '#3a2712', alert: '#ff1744', text: '#fff3e0' }
};
const theme = themes[paletteKey] ?? themes['Neon Night'];

// State setup
room.state.phase ??= 'DANCE';
room.state.phaseTimer ??= 0;
room.state.danceDuration ??= 4.5;
room.state.dancers ??= [];
room.state.particles ??= [];
room.state.shocks ??= [];
room.state.lastEventT ??= frame.t;
room.state.lastOutName ??= '';

const s = room.state;
s.phaseTimer += frame.dt;

// Synchronize active dancers from room.people + optional bots
function buildRoster() {
  const active = [];
  const realPeople = room.people || [];
  for (let i = 0; i < realPeople.length && i < 20; i++) {
    const p = realPeople[i];
    active.push({
      id: p.id,
      name: 'P' + (i + 1),
      hue: p.hue ?? ((i * 57) % 360),
      isBot: false,
      alive: true,
      seated: false,
      chairIdx: -1,
      angle: (i / Math.max(1, realPeople.length)) * Math.PI * 2
    });
  }
  if (autoFill && active.length < 6) {
    const target = Math.max(5, active.length + 3);
    for (let i = active.length; i < target; i++) {
      active.push({
        id: 'bot_' + i,
        name: 'GUEST ' + (i + 1),
        hue: (i * 68 + 25) % 360,
        isBot: true,
        alive: true,
        seated: false,
        chairIdx: -1,
        angle: (i / target) * Math.PI * 2
      });
    }
  }
  s.dancers = active;
  s.phase = 'DANCE';
  s.phaseTimer = 0;
  s.danceDuration = 3.5 + Math.random() * 4.5;
  s.lastOutName = '';
}

if (s.dancers.length === 0) buildRoster();

// Check manual restart event
for (const ev of room.events) {
  if (ev.name === 'new_game') {
    buildRoster();
    break;
  }
}

let aliveDancers = s.dancers.filter(d => d.alive);
if (aliveDancers.length <= 1 && s.phase === 'DANCE') {
  buildRoster();
  aliveDancers = s.dancers.filter(d => d.alive);
}

const totalChairs = Math.max(1, aliveDancers.length - 1);
let seatedCount = aliveDancers.filter(d => d.seated).length;

function seatDancer(d) {
  if (!d || !d.alive || d.seated || seatedCount >= totalChairs) return;
  d.seated = true;
  d.chairIdx = seatedCount;
  seatedCount++;
  s.shocks.push({ x: 0, y: 0, r: 20, maxR: Math.min(frame.width, frame.height) * 0.45, color: 'hsl(' + d.hue + ', 100%, 65%)', alpha: 1 });
  for (let k = 0; k < 12; k++) {
    if (s.particles.length > 150) s.particles.shift();
    const ang = Math.random() * Math.PI * 2;
    const spd = 120 + Math.random() * 260;
    s.particles.push({
      x: 0, y: 0,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      color: 'hsl(' + d.hue + ', 100%, 60%)',
      life: 0.8,
      maxLife: 0.8,
      size: 4 + Math.random() * 6
    });
  }
}

// Handle SIT events
for (const ev of room.events) {
  if (ev.name === 'sit') {
    s.lastEventT = frame.t;
    if (s.phase === 'FREEZE') {
      const target = s.dancers.find(d => d.id === ev.participantId && d.alive && !d.seated);
      if (target) seatDancer(target);
    }
  }
}

// Center & Layout dimensions
const cx = frame.width * 0.5;
const cy = frame.height * 0.54;
const minDim = Math.min(frame.width, frame.height);
const chairRingRadius = minDim * 0.22;
const danceRingRadius = minDim * 0.36;

// Update Phase Logic
if (s.phase === 'DANCE') {
  // Dancers move in circle
  const spd = (0.7 + audio.level * 0.8) * tempoMult;
  aliveDancers.forEach(d => {
    d.seated = false;
    d.chairIdx = -1;
    d.angle += spd * frame.dt;
  });

  // Sudden music stop
  if (s.phaseTimer >= s.danceDuration) {
    s.phase = 'FREEZE';
    s.phaseTimer = 0;
    // Plan bot reactions
    aliveDancers.forEach(d => {
      if (d.isBot) {
        d.botReaction = 0.25 + Math.random() * 1.5;
      }
    });
  }
} else if (s.phase === 'FREEZE') {
  // Bots react
  aliveDancers.forEach(d => {
    if (d.isBot && !d.seated && s.phaseTimer >= (d.botReaction ?? 0.6)) {
      seatDancer(d);
    }
  });

  // Auto timeout freeze after 3 seconds or all chairs claimed
  if (seatedCount >= totalChairs || s.phaseTimer > 2.8) {
    // Find who didn't get a chair
    const unseated = aliveDancers.filter(d => !d.seated);
    if (unseated.length > 0) {
      const victim = unseated[0];
      victim.alive = false;
      s.lastOutName = victim.name;
    }
    s.phaseTimer = 0;
    if (s.dancers.filter(d => d.alive).length <= 1) {
      s.phase = 'WINNER';
    } else {
      s.phase = 'OUT';
    }
  }
} else if (s.phase === 'OUT') {
  if (s.phaseTimer > 2.5) {
    s.phase = 'DANCE';
    s.phaseTimer = 0;
    s.danceDuration = 3.5 + Math.random() * 4.5;
    aliveDancers = s.dancers.filter(d => d.alive);
    aliveDancers.forEach((d, idx) => {
      d.seated = false;
      d.chairIdx = -1;
      d.angle = (idx / aliveDancers.length) * Math.PI * 2;
    });
  }
} else if (s.phase === 'WINNER') {
  if (s.phaseTimer > 4.5) {
    buildRoster();
  }
}

// Background
ctx.fillStyle = theme.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

// Arena Glow & Beat pulses
ctx.save();
ctx.translate(cx, cy);

if (arenaGlow) {
  const pulse = 1 + (audio.bass || 0) * 0.15;
  const glowGrad = ctx.createRadialGradient(0, 0, minDim * 0.05, 0, 0, minDim * 0.45 * pulse);
  const tint = s.phase === 'FREEZE' ? theme.alert : theme.ring;
  glowGrad.addColorStop(0, tint + '55');
  glowGrad.addColorStop(0.6, tint + '18');
  glowGrad.addColorStop(1, '#00000000');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(0, 0, minDim * 0.45 * pulse, 0, Math.PI * 2);
  ctx.fill();
}

// Outer boundary track
ctx.strokeStyle = theme.ring;
ctx.lineWidth = 6;
ctx.beginPath();
ctx.arc(0, 0, danceRingRadius, 0, Math.PI * 2);
ctx.stroke();

// Inner chair track
ctx.strokeStyle = theme.ring;
ctx.lineWidth = 3;
ctx.setLineDash([8, 12]);
ctx.beginPath();
ctx.arc(0, 0, chairRingRadius, 0, Math.PI * 2);
ctx.stroke();
ctx.setLineDash([]);

// Draw Chairs
for (let i = 0; i < totalChairs; i++) {
  const cAng = (i / totalChairs) * Math.PI * 2 - Math.PI * 0.5;
  const seatX = Math.cos(cAng) * chairRingRadius;
  const seatY = Math.sin(cAng) * chairRingRadius;
  const isOccupied = i < seatedCount;

  ctx.save();
  ctx.translate(seatX, seatY);
  ctx.rotate(cAng + Math.PI * 0.5);

  const seatW = Math.max(22, minDim * 0.045);
  const seatH = seatW * 0.75;

  ctx.fillStyle = isOccupied ? theme.chairClaimed : theme.chair;
  ctx.strokeStyle = isOccupied ? '#556677' : '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-seatW * 0.5, -seatH * 0.5, seatW, seatH, 6);
  ctx.fill();
  ctx.stroke();

  // Seat backrest
  ctx.beginPath();
  ctx.roundRect(-seatW * 0.45, -seatH * 0.5 - 6, seatW * 0.9, 5, 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// Update and draw Shockwaves
for (let i = s.shocks.length - 1; i >= 0; i--) {
  const sw = s.shocks[i];
  sw.r += frame.dt * 450;
  sw.alpha -= frame.dt * 1.8;
  if (sw.alpha <= 0 || sw.r >= sw.maxR) {
    s.shocks.splice(i, 1);
    continue;
  }
  ctx.strokeStyle = sw.color;
  ctx.globalAlpha = Math.max(0, sw.alpha);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Draw Dancers
s.dancers.forEach(d => {
  if (!d.alive) return;

  let targetX, targetY;
  if (d.seated && d.chairIdx >= 0) {
    const cAng = (d.chairIdx / totalChairs) * Math.PI * 2 - Math.PI * 0.5;
    targetX = Math.cos(cAng) * chairRingRadius;
    targetY = Math.sin(cAng) * chairRingRadius;
  } else {
    const bob = s.phase === 'DANCE' ? Math.sin(frame.t * 12 + d.angle * 3) * (6 + audio.bass * 8) : 0;
    const rad = danceRingRadius + bob;
    targetX = Math.cos(d.angle) * rad;
    targetY = Math.sin(d.angle) * rad;
  }

  ctx.save();
  ctx.translate(targetX, targetY);

  // Figure glow/shadow
  ctx.fillStyle = 'hsl(' + d.hue + ', 95%, 55%)';
  ctx.shadowColor = 'hsl(' + d.hue + ', 100%, 50%)';
  ctx.shadowBlur = 14;

  const rad = Math.max(12, minDim * 0.026);
  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI * 2);
  ctx.fill();

  // White center highlight
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Label over dancer
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold ' + Math.max(10, rad * 0.9) + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(d.name, 0, -rad - 4);

  ctx.restore();
});

// Particles
for (let i = s.particles.length - 1; i >= 0; i--) {
  const p = s.particles[i];
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  p.life -= frame.dt;
  if (p.life <= 0) {
    s.particles.splice(i, 1);
    continue;
  }
  ctx.fillStyle = p.color;
  ctx.globalAlpha = p.life / p.maxLife;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

ctx.restore(); // restore arena center

// Big Stage HUD / Banners visible across the floor
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Top score & chairs bar
ctx.font = '900 ' + Math.floor(minDim * 0.038) + 'px system-ui, sans-serif';
ctx.fillStyle = '#ffffff';
const remainingCount = aliveDancers.length;
const statusText = 'PLAYERS: ' + remainingCount + '  |  CHAIRS: ' + totalChairs;
ctx.fillText(statusText, cx, frame.height * 0.08);

// Big Phase Banner
if (s.phase === 'DANCE') {
  ctx.font = '900 ' + Math.floor(minDim * 0.085) + 'px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  const bounce = Math.sin(frame.t * 8) * 6;
  ctx.fillText('DANCE! 🎵', cx, frame.height * 0.22 + bounce);
} else if (s.phase === 'FREEZE') {
  // Flashing alert overlay
  const flash = Math.sin(frame.t * 24) > 0;
  ctx.fillStyle = flash ? 'rgba(255, 0, 80, 0.22)' : 'rgba(255, 0, 80, 0.08)';
  ctx.fillRect(0, 0, frame.width, frame.height);

  ctx.font = '900 ' + Math.floor(minDim * 0.12) + 'px system-ui, sans-serif';
  ctx.fillStyle = theme.alert;
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 18;
  ctx.fillText('SIT! HIT BUTTON!', cx, frame.height * 0.22);
} else if (s.phase === 'OUT') {
  ctx.font = '900 ' + Math.floor(minDim * 0.08) + 'px system-ui, sans-serif';
  ctx.fillStyle = '#ff4444';
  ctx.fillText(s.lastOutName + ' IS OUT!', cx, frame.height * 0.22);
} else if (s.phase === 'WINNER') {
  const winner = aliveDancers[0] || { name: 'CHAMPION', hue: 45 };
  ctx.font = '900 ' + Math.floor(minDim * 0.1) + 'px system-ui, sans-serif';
  ctx.fillStyle = 'hsl(' + winner.hue + ', 100%, 65%)';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 20;
  ctx.fillText('👑 ' + winner.name + ' WINS! 👑', cx, frame.height * 0.22);
}

// Footer Instructions
ctx.font = 'bold ' + Math.floor(minDim * 0.026) + 'px system-ui, sans-serif';
ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
ctx.shadowBlur = 0;
ctx.fillText('PRESS "SIT!" WHEN MUSIC STOPS', cx, frame.height * 0.94);

ctx.restore();
ctx.restore();