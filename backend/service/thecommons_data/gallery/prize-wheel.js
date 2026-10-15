ctx.save();
const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.52;
const R = Math.min(W, H) * 0.38;
const dt = Math.min(frame.dt || 0.016, 0.05);

// Controls
const spinPower = getVar('spin_power') ?? 3;
const rimStyle = getVar('rim_style') || 'Carnival Bulbs';
const confettiDensity = getVar('confetti_density') || 'Party Blast';
const soundReactive = getVar('sound_reactive') ?? true;
const bassBoost = (soundReactive && audio) ? audio.bass : 0;
const trebleSpark = (soundReactive && audio) ? audio.treble : 0;
const isBeat = soundReactive && audio && audio.beat;

// Persistent game state
room.state.angle ??= 0;
room.state.vel ??= 0;
room.state.mode ??= 'idle'; // 'idle', 'spinning', 'winner'
room.state.modeTimer ??= 0;
room.state.lastActionTime ??= frame.t;
room.state.winnerId ??= null;
room.state.winnerHue ??= 45;
room.state.pointerDeflect ??= 0;
room.state.lastSliceHit ??= -1;
room.state.confetti ??= [];
room.state.scores ??= {}; // id -> count
room.state.flash ??= 0;

// Resolve active players or default roster
let players = (room.people && room.people.length > 0) ? room.people : null;
if (!players) {
  room.state.mockPlayers ??= [
    { id: 'guest-1', hue: 10, table: '1' },
    { id: 'guest-2', hue: 55, table: '1' },
    { id: 'guest-3', hue: 130, table: '2' },
    { id: 'guest-4', hue: 195, table: '2' },
    { id: 'guest-5', hue: 280, table: '3' },
    { id: 'guest-6', hue: 330, table: '3' }
  ];
  players = room.state.mockPlayers;
}
const N = Math.max(1, Math.min(players.length, 48));
const sliceAngle = (Math.PI * 2) / N;

// Helper to spawn confetti
function spawnConfetti(count, hueBase) {
  const list = room.state.confetti;
  const maxTotal = 160;
  for (let i = 0; i < count && list.length < maxTotal; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 200 + Math.random() * 520;
    list.push({
      x: cx + (Math.random() - 0.5) * 60,
      y: cy - R * 0.3 + (Math.random() - 0.5) * 60,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd - 220,
      hue: (hueBase + (Math.random() - 0.5) * 60 + 360) % 360,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 12,
      size: 7 + Math.random() * 9,
      life: 1.0,
      decay: 0.3 + Math.random() * 0.4
    });
  }
}

// Process events
let triggeredSpin = false;
let triggeredCheer = false;
if (room.events) {
  for (const e of room.events) {
    if (e.name === 'spin') triggeredSpin = true;
    if (e.name === 'cheer') triggeredCheer = true;
  }
}

// Attract mode auto-trigger
if (!triggeredSpin && room.state.mode === 'idle' && (frame.t - room.state.lastActionTime > 7)) {
  triggeredSpin = true;
}

if (triggeredSpin && room.state.mode !== 'spinning') {
  room.state.mode = 'spinning';
  room.state.modeTimer = 0;
  room.state.lastActionTime = frame.t;
  const baseP = 12 + spinPower * 4.5;
  room.state.vel = baseP + Math.random() * 6;
  room.state.flash = 0.8;
}

if (triggeredCheer) {
  room.state.lastActionTime = frame.t;
  room.state.flash = 1.0;
  spawnConfetti(35, Math.random() * 360);
}

// Physics update
if (room.state.mode === 'spinning') {
  room.state.angle += room.state.vel * dt;
  room.state.vel *= Math.max(0.92, 0.985 - dt * 0.35);
  if (room.state.vel < 0.22) {
    room.state.vel = 0;
    room.state.mode = 'winner';
    room.state.modeTimer = 0;
    // Pinpoint winner slice at pointer (top: angle = -PI/2)
    const norm = ((-Math.PI * 0.5 - room.state.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const winIdx = Math.floor(norm / sliceAngle) % N;
    const winner = players[winIdx] || players[0];
    room.state.winnerId = winner.id;
    room.state.winnerHue = winner.hue ?? 50;
    room.state.scores[winner.id] = (room.state.scores[winner.id] || 0) + 1;
    
    const cMult = confettiDensity === 'Super Nova' ? 140 : (confettiDensity === 'Party Blast' ? 80 : 40);
    spawnConfetti(cMult, room.state.winnerHue);
  }
} else if (room.state.mode === 'winner') {
  room.state.modeTimer += dt;
  if (room.state.modeTimer > 4.5) {
    room.state.mode = 'idle';
    room.state.modeTimer = 0;
    room.state.lastActionTime = frame.t;
  }
} else {
  // Gentle idle wobble
  room.state.angle += Math.sin(frame.t * 1.5) * 0.002;
}

// Pointer ticker physics
const currentSlice = Math.floor((((-Math.PI * 0.5 - room.state.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / sliceAngle);
if (currentSlice !== room.state.lastSliceHit) {
  room.state.pointerDeflect = Math.min(0.6, room.state.vel * 0.08 + 0.35);
  room.state.lastSliceHit = currentSlice;
}
room.state.pointerDeflect += (0 - room.state.pointerDeflect) * Math.min(1, dt * 18);

// Dark carnival floor
ctx.fillStyle = '#08060f';
ctx.fillRect(0, 0, W, H);

// Background ambient radial lights
const bgRad = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.max(W, H) * 0.7);
bgRad.addColorStop(0, '#1c102a');
bgRad.addColorStop(0.6, '#090514');
bgRad.addColorStop(1, '#020106');
ctx.fillStyle = bgRad;
ctx.fillRect(0, 0, W, H);

// Spotlight effect for winner
if (room.state.mode === 'winner') {
  const pulse = 0.55 + 0.25 * Math.sin(frame.t * 8) + bassBoost * 0.3;
  ctx.save();
  const spot = ctx.createRadialGradient(cx, cy, 10, cx, cy, R * 1.4);
  spot.addColorStop(0, `hsla(${room.state.winnerHue}, 100%, 70%, ${pulse})`);
  spot.addColorStop(0.5, `hsla(${room.state.winnerHue}, 90%, 45%, ${pulse * 0.35})`);
  spot.addColorStop(1, 'transparent');
  ctx.fillStyle = spot;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Wheel shadow
ctx.save();
ctx.shadowColor = '#000000';
ctx.shadowBlur = 40 + bassBoost * 30;
ctx.shadowOffsetY = 16;
ctx.beginPath();
ctx.arc(cx, cy, R + 14, 0, Math.PI * 2);
ctx.fillStyle = '#0a0a0f';
ctx.fill();
ctx.restore();

// Draw Wheel Slices
ctx.save();
ctx.translate(cx, cy);
ctx.rotate(room.state.angle);

for (let i = 0; i < N; i++) {
  const p = players[i];
  const hue = p.hue ?? ((i * 360 / N) % 360);
  const a0 = i * sliceAngle;
  const a1 = a0 + sliceAngle;
  const isWinnerSlice = (room.state.mode === 'winner' && p.id === room.state.winnerId);
  
  // Wedge
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, R, a0, a1);
  ctx.closePath();
  const light = isWinnerSlice ? (62 + Math.sin(frame.t * 14) * 12) : 46;
  const sat = isWinnerSlice ? 95 : 82;
  ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
  ctx.fill();
  
  // Slice divider line
  ctx.strokeStyle = '#181224';
  ctx.lineWidth = Math.max(2, Math.min(5, 140 / N));
  ctx.stroke();

  // Text / Star in wedge
  ctx.save();
  const midA = a0 + sliceAngle * 0.5;
  ctx.rotate(midA);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  
  const stars = room.state.scores[p.id] || 0;
  const labelDist = R * 0.82;
  const fontSize = Math.max(12, Math.min(26, (Math.PI * 2 * R / N) * 0.42));
  ctx.font = `900 ${fontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  
  // Label: player seat or table plus stars
  let tag = (p.table ? `T${p.table}` : `P${i + 1}`);
  if (stars > 0) tag += ` ★${stars}`;
  ctx.fillText(tag, labelDist, 0);

  // Star icon drawn near inner radius
  if (stars > 0) {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(R * 0.35, 0, Math.min(10, fontSize * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}

// Outer peg pegs
const pegCount = Math.max(N, 16);
ctx.fillStyle = '#fce588';
for (let j = 0; j < pegCount; j++) {
  const pa = (j * Math.PI * 2) / pegCount;
  const px = Math.cos(pa) * (R - 4);
  const py = Math.sin(pa) * (R - 4);
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
}

ctx.restore(); // end wheel rotation

// Wheel Rim and Bulbs
ctx.save();
const rimThick = 24;
ctx.beginPath();
ctx.arc(cx, cy, R + rimThick * 0.5, 0, Math.PI * 2);
if (rimStyle === 'Gold Casino') {
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = rimThick;
  ctx.stroke();
  ctx.strokeStyle = '#fff2a8';
  ctx.lineWidth = 4;
  ctx.stroke();
} else if (rimStyle === 'Neon Glow') {
  ctx.strokeStyle = '#ff0066';
  ctx.shadowColor = '#ff007f';
  ctx.shadowBlur = 25;
  ctx.lineWidth = rimThick;
  ctx.stroke();
} else {
  ctx.strokeStyle = '#1e1b2e';
  ctx.lineWidth = rimThick;
  ctx.stroke();
  ctx.strokeStyle = '#ffd152';
  ctx.lineWidth = 3;
  ctx.stroke();
}

// Carnival Bulbs chasing around rim
const bulbCount = 32;
const chaseStep = Math.floor(frame.t * (room.state.vel > 1 ? 16 : 6));
for (let b = 0; b < bulbCount; b++) {
  const bAngle = (b * Math.PI * 2) / bulbCount;
  const bx = cx + Math.cos(bAngle) * (R + rimThick * 0.5);
  const by = cy + Math.sin(bAngle) * (R + rimThick * 0.5);
  const lit = (b + chaseStep) % 3 === 0 || isBeat;
  
  ctx.beginPath();
  ctx.arc(bx, by, lit ? 6.5 : 4, 0, Math.PI * 2);
  if (lit) {
    ctx.fillStyle = (b % 2 === 0) ? '#fff8cc' : '#ff4d6d';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12 + bassBoost * 10;
  } else {
    ctx.fillStyle = '#443b57';
    ctx.shadowBlur = 0;
  }
  ctx.fill();
}
ctx.restore();

// Center Carnival Cap
ctx.save();
const hubR = R * 0.22;
const capGrad = ctx.createRadialGradient(cx - hubR * 0.25, cy - hubR * 0.25, 2, cx, cy, hubR);
capGrad.addColorStop(0, '#ffffff');
capGrad.addColorStop(0.3, '#ffcc00');
capGrad.addColorStop(0.8, '#b86200');
capGrad.addColorStop(1, '#3b1c00');
ctx.beginPath();
ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
ctx.fillStyle = capGrad;
ctx.shadowColor = '#000000';
ctx.shadowBlur = 16;
ctx.fill();
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 3;
ctx.stroke();

// Center text or prompt
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#ffffff';
ctx.font = `900 ${Math.round(hubR * 0.42)}px sans-serif`;
if (room.state.mode === 'spinning') {
  ctx.fillText('SPIN!', cx, cy);
} else if (room.state.mode === 'winner') {
  ctx.fillText('WIN!', cx, cy);
} else {
  ctx.fillText('GO!', cx, cy);
}
ctx.restore();

// Pointer / Ticker Flapper (At Top of Wheel)
ctx.save();
const pointerTopY = cy - R - 6;
const pointerTipY = cy - R + 22;
ctx.translate(cx, pointerTopY);
ctx.rotate(room.state.pointerDeflect);
ctx.beginPath();
ctx.moveTo(-16, -14);
ctx.lineTo(16, -14);
ctx.lineTo(0, 36);
ctx.closePath();
ctx.fillStyle = '#ff2a4b';
ctx.shadowColor = '#ff1133';
ctx.shadowBlur = 14;
ctx.fill();
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 3;
ctx.stroke();
// Pointer hinge pin
ctx.beginPath();
ctx.arc(0, -6, 5, 0, Math.PI * 2);
ctx.fillStyle = '#ffffff';
ctx.fill();
ctx.restore();

// Confetti Simulation
if (room.state.confetti.length > 0) {
  ctx.save();
  for (let c = room.state.confetti.length - 1; c >= 0; c--) {
    const p = room.state.confetti[c];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 450 * dt; // gravity
    p.rot += p.vrot * dt;
    p.life -= p.decay * dt;
    
    if (p.life <= 0 || p.y > H + 50) {
      room.state.confetti.splice(c, 1);
      continue;
    }
    
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = `hsla(${p.hue}, 95%, ${60 + trebleSpark * 25}%, ${p.life})`;
    ctx.fillRect(-p.size * 0.5, -p.size * 0.3, p.size, p.size * 0.6);
    ctx.restore();
  }
  ctx.restore();
}

// Screen Flash on Hit / Cheer
if (room.state.flash > 0.01) {
  ctx.fillStyle = `rgba(255, 255, 255, ${room.state.flash * 0.28})`;
  ctx.fillRect(0, 0, W, H);
  room.state.flash += (0 - room.state.flash) * Math.min(1, dt * 7);
}

// Big Headline Banners legible from across the room
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'top';

if (room.state.mode === 'winner') {
  const pop = 1 + Math.sin(frame.t * 10) * 0.05 + bassBoost * 0.12;
  ctx.save();
  ctx.translate(cx, H * 0.05);
  ctx.scale(pop, pop);
  ctx.font = '900 58px sans-serif';
  ctx.fillStyle = `hsl(${room.state.winnerHue}, 100%, 65%)`;
  ctx.shadowColor = `hsla(${room.state.winnerHue}, 100%, 60%, 0.8)`;
  ctx.shadowBlur = 24;
  ctx.fillText('WINNER!', 0, 0);
  
  ctx.font = '800 28px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.fillText(`PLAYER ${room.state.winnerId} GETS A STAR!`, 0, 68);
  ctx.restore();
} else if (room.state.mode === 'spinning') {
  ctx.font = '900 48px sans-serif';
  ctx.fillStyle = '#ffd152';
  ctx.shadowColor = 'rgba(255, 209, 82, 0.7)';
  ctx.shadowBlur = 18;
  ctx.fillText('ROUND IN PLAY...', cx, H * 0.06);
} else {
  ctx.font = '900 44px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.fillText('HIT SPIN TO PLAY', cx, H * 0.06);
  
  ctx.font = '700 20px sans-serif';
  ctx.fillStyle = '#9e97b8';
  ctx.fillText(`${N} CONTESTANTS READY`, cx, H * 0.12);
}
ctx.restore();

ctx.restore();