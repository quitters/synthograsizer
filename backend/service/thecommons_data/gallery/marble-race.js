ctx.save();
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

// ---- CONTROLS & THEME LOOKUP ----
const themeKey = getVar('track_theme') || 'neon_arcade';
const bounceVal = getVar('bounciness') ?? 0.6;
const speedMul = getVar('track_speed') ?? 1.2;
const boostKey = getVar('boost_power') || 'punchy';
const trailsOn = getVar('trails') ?? true;

const boostPowers = { gentle: 0.20, punchy: 0.38, hyperdrive: 0.65 };
const currentBoostPower = boostPowers[boostKey] ?? 0.38;

const THEMES = {
  neon_arcade: {
    bg: '#070914',
    bed: '#0e1224',
    rail1: '#00f0ff',
    rail2: '#ff0077',
    accent: '#ffe600',
    pin: '#ffffff'
  },
  carved_timber: {
    bg: '#140c08',
    bed: '#2c1a11',
    rail1: '#c4823f',
    rail2: '#8b4e18',
    accent: '#f7d08a',
    pin: '#e6c280'
  },
  cyber_circuit: {
    bg: '#030f0d',
    bed: '#07241f',
    rail1: '#00ff88',
    rail2: '#00bbff',
    accent: '#55ffaa',
    pin: '#aaffdd'
  },
  midnight_gold: {
    bg: '#090812',
    bed: '#181428',
    rail1: '#ffd700',
    rail2: '#9d4edd',
    accent: '#ff9e00',
    pin: '#ffe066'
  }
};
const theme = THEMES[themeKey] || THEMES.neon_arcade;

// ---- INITIALIZE PERSISTENT STATE ----
room.state.marbles ??= [];
room.state.particles ??= [];
room.state.phase ??= 'countdown'; // 'countdown' | 'racing' | 'podium'
room.state.phaseTimer ??= 3.2;
room.state.roundCount ??= 1;
room.state.lastActionTime ??= frame.t;
room.state.shake ??= 0;
room.state.bumpers ??= [
  { u: 0.49, lane: -0.5 },
  { u: 0.53, lane: 0.4 },
  { u: 0.57, lane: -0.3 },
  { u: 0.61, lane: 0.5 }
];

// ---- TRACK GEOMETRY EVALUATION ----
// Track is segmented into 5 zones along normalized spline s in [0, 1]
function getTrackPos(s, lane) {
  let x = 0, y = 0, nx = 0, ny = 1;
  const railHalfWidth = W * 0.024;

  if (s < 0.22) {
    // Tier 1: Chute Left -> Right
    const u = s / 0.22;
    x = W * (0.12 + 0.60 * u);
    y = H * (0.13 + 0.08 * u);
    nx = 0.08 * H; ny = -0.60 * W;
  } else if (s < 0.44) {
    // Tier 2: Vortex Funnel 1 (Right)
    const u = (s - 0.22) / 0.22;
    const cx = W * 0.74, cy = H * 0.31;
    const r = W * (0.095 * (1 - u * 0.72));
    const angle = -0.5 * Math.PI + u * (4 * Math.PI);
    x = cx + Math.cos(angle) * r;
    y = cy + Math.sin(angle) * (r * 0.75);
    nx = Math.cos(angle); ny = Math.sin(angle);
  } else if (s < 0.65) {
    // Tier 3: Chute Right -> Left with slalom pins
    const u = (s - 0.44) / 0.21;
    x = W * (0.74 - 0.50 * u);
    y = H * (0.42 + 0.15 * u);
    nx = 0.15 * H; ny = 0.50 * W;
  } else if (s < 0.83) {
    // Tier 4: Vortex Funnel 2 (Left)
    const u = (s - 0.65) / 0.18;
    const cx = W * 0.24, cy = H * 0.66;
    const r = W * (0.088 * (1 - u * 0.70));
    const angle = 0.2 * Math.PI - u * (3.6 * Math.PI);
    x = cx + Math.cos(angle) * r;
    y = cy + Math.sin(angle) * (r * 0.75);
    nx = Math.cos(angle); ny = Math.sin(angle);
  } else {
    // Tier 5: Final Sprint into Finish Gate
    const u = Math.min((s - 0.83) / 0.17, 1.0);
    x = W * (0.24 + 0.54 * u);
    y = H * (0.75 + 0.08 * u);
    nx = 0.08 * H; ny = -0.54 * W;
  }

  const len = Math.hypot(nx, ny) || 1;
  const px = x + (nx / len) * (lane * railHalfWidth);
  const py = y + (ny / len) * (lane * railHalfWidth);
  return { x: px, y: py, cx: x, cy: y };
}

// ---- SYNC MARBLES TO ROOM.PEOPLE (SCALES 1 TO 40) ----
const people = room.people && room.people.length > 0 ? room.people : null;
let targetIds = [];

if (people) {
  targetIds = people.map(p => p.id);
} else {
  // Attract bots if no humans connected
  targetIds = ['bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5', 'bot-6'];
}

// Prune departed racers
room.state.marbles = room.state.marbles.filter(m => targetIds.includes(m.id));

// Add missing racers
for (let i = 0; i < targetIds.length; i++) {
  const id = targetIds[i];
  let marble = room.state.marbles.find(m => m.id === id);
  if (!marble) {
    let hue = 0;
    let label = 'P' + (i + 1);
    if (people) {
      const p = people.find(item => item.id === id);
      hue = p && typeof p.hue === 'number' ? p.hue : (i * 53) % 360;
      label = (i + 1).toString();
    } else {
      const botHues = [25, 60, 140, 195, 280, 330];
      hue = botHues[i % botHues.length];
      label = 'B' + (i + 1);
    }
    marble = {
      id,
      label,
      hue,
      s: room.state.phase === 'racing' ? 0.03 : 0.01,
      lane: ((i % 5) - 2) * 0.35,
      v: 0.04,
      vLane: 0,
      cooldown: 0,
      boostGlow: 0,
      finished: false,
      finishRank: 0
    };
    room.state.marbles.push(marble);
  }
}

// Dynamically scale marble size to player count
const marbleCount = Math.max(room.state.marbles.length, 1);
const marbleRadius = Math.max(9, Math.min(18, Math.floor(W * 0.013 * Math.sqrt(8 / Math.max(marbleCount, 8)))));

// ---- HANDLE USER EVENTS ----
let boostedCount = 0;
if (room.events) {
  for (const e of room.events) {
    if (e.name === 'reset_race') {
      room.state.phase = 'countdown';
      room.state.phaseTimer = 3.2;
      room.state.marbles.forEach(m => {
        m.s = 0.01;
        m.v = 0.04;
        m.finished = false;
        m.finishRank = 0;
        m.cooldown = 0;
      });
      room.state.particles.push({
        x: W * 0.5, y: H * 0.5, vx: 0, vy: 0, life: 1, maxLife: 1, size: 40, hue: 60, type: 'ring'
      });
    } else if (e.name === 'boost') {
      room.state.lastActionTime = frame.t;
      const m = room.state.marbles.find(item => item.id === e.participantId);
      if (m && m.cooldown <= 0 && !m.finished) {
        m.v += currentBoostPower;
        m.cooldown = 1.1;
        m.boostGlow = 1.0;
        room.state.shake = 8;
        boostedCount++;
        // Spark burst on boost
        const pos = getTrackPos(m.s, m.lane);
        for (let k = 0; k < 6; k++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 60 + Math.random() * 120;
          room.state.particles.push({
            x: pos.x, y: pos.y,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            life: 0.6, maxLife: 0.6, size: 4 + Math.random() * 4, hue: m.hue, type: 'spark'
          });
        }
      }
    }
  }
}

// ---- ATTRACT MODE (AUTO-PLAY WHEN QUIET) ----
const isAttract = (frame.t - room.state.lastActionTime) > 4.5;
if (isAttract && room.state.phase === 'racing') {
  if (audio.beat || Math.random() < 0.06) {
    const eligible = room.state.marbles.filter(m => m.cooldown <= 0 && !m.finished);
    if (eligible.length > 0) {
      const pick = eligible[Math.floor(Math.random() * eligible.length)];
      pick.v += currentBoostPower * 0.75;
      pick.cooldown = 1.4;
      pick.boostGlow = 0.8;
    }
  }
}

// ---- PHASE & GAME STATE FLOW ----
room.state.phaseTimer -= dt;

if (room.state.phase === 'countdown') {
  // Jiggle at gate
  room.state.marbles.forEach((m, idx) => {
    m.s = 0.01 + Math.sin(frame.t * 8 + idx) * 0.003;
    m.finished = false;
    m.finishRank = 0;
    m.cooldown = Math.max(0, m.cooldown - dt);
  });
  if (room.state.phaseTimer <= 0) {
    room.state.phase = 'racing';
    room.state.phaseTimer = 28.0; // max race timeout
    room.state.shake = 12;
  }
} else if (room.state.phase === 'racing') {
  let finishedTotal = room.state.marbles.filter(m => m.finished).length;

  // Update marble physics
  for (let i = 0; i < room.state.marbles.length; i++) {
    const m = room.state.marbles[i];
    m.cooldown = Math.max(0, m.cooldown - dt);
    m.boostGlow = Math.max(0, m.boostGlow - dt * 1.8);

    if (m.finished) continue;

    // Gravity & slope acceleration
    let gravity = 0.055;
    if ((m.s >= 0.22 && m.s < 0.44) || (m.s >= 0.65 && m.s < 0.83)) {
      gravity = 0.04; // funnels swirl longer
    }
    m.v += gravity * dt * speedMul;
    m.v *= Math.pow(0.975, dt * 60); // rolling drag

    // Audio bass kick impulse
    if (audio.bass > 0.6) {
      m.v += (audio.bass * 0.03) * dt;
    }

    m.s += m.v * dt;
    m.lane += m.vLane * dt;
    m.vLane *= Math.pow(0.85, dt * 60);

    // Keep in track bounds with rail bounce
    if (m.lane > 0.85) {
      m.lane = 0.85;
      m.vLane = -Math.abs(m.vLane) * bounceVal - 0.2;
    } else if (m.lane < -0.85) {
      m.lane = -0.85;
      m.vLane = Math.abs(m.vLane) * bounceVal + 0.2;
    }

    // Slalom Pin Collisions in Tier 3
    if (m.s >= 0.44 && m.s <= 0.65) {
      for (const pin of room.state.bumpers) {
        const ds = Math.abs(m.s - pin.u);
        const dLane = Math.abs(m.lane - pin.lane);
        if (ds < 0.015 && dLane < 0.35) {
          m.vLane = (m.lane > pin.lane ? 1 : -1) * (1.2 * bounceVal);
          m.v *= 0.92;
          const hitPos = getTrackPos(m.s, m.lane);
          room.state.particles.push({
            x: hitPos.x, y: hitPos.y, vx: (Math.random() - 0.5) * 60, vy: -50,
            life: 0.4, maxLife: 0.4, size: 6, hue: 45, type: 'spark'
          });
        }
      }
    }

    // Marble-Marble Clacking & Jostling
    for (let j = i + 1; j < room.state.marbles.length; j++) {
      const m2 = room.state.marbles[j];
      if (m2.finished) continue;
      const ds = Math.abs(m.s - m2.s);
      const dLane = Math.abs(m.lane - m2.lane);
      if (ds < 0.022 && dLane < 0.48) {
        // Clack bump!
        const diffLane = m.lane - m2.lane || (Math.random() - 0.5) * 0.1;
        m.vLane += Math.sign(diffLane) * 0.6 * bounceVal;
        m2.vLane -= Math.sign(diffLane) * 0.6 * bounceVal;
        const avgV = (m.v + m2.v) * 0.5;
        m.v = avgV + 0.02;
        m2.v = Math.max(0.01, avgV - 0.02);
        if (room.state.particles.length < 90) {
          const clackP = getTrackPos((m.s + m2.s) * 0.5, (m.lane + m2.lane) * 0.5);
          room.state.particles.push({
            x: clackP.x, y: clackP.y, vx: 0, vy: 0,
            life: 0.25, maxLife: 0.25, size: 8, hue: 60, type: 'ring'
          });
        }
      }
    }

    // Finish Line Crossing at s = 0.96
    if (m.s >= 0.96 && !m.finished) {
      m.finished = true;
      finishedTotal++;
      m.finishRank = finishedTotal;
      room.state.shake = 10;
      // Winner confetti shower
      const pos = getTrackPos(0.96, m.lane);
      for (let k = 0; k < 18; k++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 80 + Math.random() * 160;
        room.state.particles.push({
          x: pos.x, y: pos.y,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 50,
          life: 1.2, maxLife: 1.2, size: 5 + Math.random() * 5, hue: (m.hue + k * 18) % 360, type: 'confetti'
        });
      }
    }
  }

  // Check if podium phase should start
  const racersActive = room.state.marbles.length;
  const targetFinishers = Math.min(3, racersActive);
  if (finishedTotal >= targetFinishers || room.state.phaseTimer <= 0) {
    room.state.phase = 'podium';
    room.state.phaseTimer = 7.0;
  }
} else if (room.state.phase === 'podium') {
  // Spawn intermittent fireworks/confetti during podium celebration
  if (Math.random() < 0.2) {
    room.state.particles.push({
      x: W * (0.35 + Math.random() * 0.30),
      y: H * (0.75 + Math.random() * 0.15),
      vx: (Math.random() - 0.5) * 80,
      vy: -100 - Math.random() * 120,
      life: 1.0, maxLife: 1.0, size: 6, hue: Math.random() * 360, type: 'confetti'
    });
  }
  if (room.state.phaseTimer <= 0) {
    // Auto restart new round
    room.state.roundCount++;
    room.state.phase = 'countdown';
    room.state.phaseTimer = 3.2;
    room.state.marbles.forEach(m => {
      m.s = 0.01;
      m.v = 0.04;
      m.finished = false;
      m.finishRank = 0;
      m.cooldown = 0;
    });
  }
}

// ---- SCREEN SHAKE DISSIPATION ----
let shakeX = 0, shakeY = 0;
if (room.state.shake > 0.1) {
  shakeX = (Math.random() - 0.5) * room.state.shake;
  shakeY = (Math.random() - 0.5) * room.state.shake;
  room.state.shake *= 0.88;
}
ctx.translate(shakeX, shakeY);

// ---- BACKGROUND & MOTION TRAILS ----
if (trailsOn) {
  ctx.fillStyle = theme.bg + '55';
  ctx.fillRect(-20, -20, W + 40, H + 40);
} else {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(-20, -20, W + 40, H + 40);
}

// ---- DRAW TRACK RAILS, FUNNELS & CHUTES ----
const railWidth = W * 0.024;

function renderTrackBed() {
  const sampleSteps = 240;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Base track floor
  ctx.beginPath();
  for (let i = 0; i <= sampleSteps; i++) {
    const s = i / sampleSteps;
    const pos = getTrackPos(s, 0);
    if (i === 0) ctx.moveTo(pos.cx, pos.cy); else ctx.lineTo(pos.cx, pos.cy);
  }
  ctx.strokeStyle = theme.bed;
  ctx.lineWidth = railWidth * 2.3;
  ctx.stroke();

  // Subtle center line
  ctx.setLineDash([8, 12]);
  ctx.strokeStyle = theme.accent + '33';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  // Outer Rails (Left & Right)
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = theme.rail1;
  ctx.beginPath();
  for (let i = 0; i <= sampleSteps; i++) {
    const pos = getTrackPos(i / sampleSteps, -1.0);
    if (i === 0) ctx.moveTo(pos.x, pos.y); else ctx.lineTo(pos.x, pos.y);
  }
  ctx.stroke();

  ctx.strokeStyle = theme.rail2;
  ctx.beginPath();
  for (let i = 0; i <= sampleSteps; i++) {
    const pos = getTrackPos(i / sampleSteps, 1.0);
    if (i === 0) ctx.moveTo(pos.x, pos.y); else ctx.lineTo(pos.x, pos.y);
  }
  ctx.stroke();

  // Draw Funnel Vortex Rings
  const funnels = [
    { cx: W * 0.74, cy: H * 0.31, r: W * 0.095 },
    { cx: W * 0.24, cy: H * 0.66, r: W * 0.088 }
  ];
  for (const fn of funnels) {
    for (let k = 3; k >= 1; k--) {
      ctx.beginPath();
      ctx.ellipse(fn.cx, fn.cy, fn.r * (k / 3), fn.r * 0.75 * (k / 3), 0, 0, Math.PI * 2);
      ctx.strokeStyle = theme.rail1 + (k === 1 ? 'aa' : '33');
      ctx.lineWidth = k === 1 ? 3 : 1.5;
      ctx.stroke();
    }
    // Center drain hole
    ctx.beginPath();
    ctx.ellipse(fn.cx, fn.cy, fn.r * 0.2, fn.r * 0.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
  }

  // Slalom Pins in Tier 3
  for (const pin of room.state.bumpers) {
    const pos = getTrackPos(pin.u, pin.lane);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = theme.pin;
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Starting Gate Bar
  const gateP1 = getTrackPos(0.015, -1.2);
  const gateP2 = getTrackPos(0.015, 1.2);
  ctx.beginPath();
  ctx.moveTo(gateP1.x, gateP1.y); ctx.lineTo(gateP2.x, gateP2.y);
  ctx.strokeStyle = room.state.phase === 'countdown' ? '#ff3333' : '#33ff88';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Checkered Finish Gate at s = 0.96
  const finP1 = getTrackPos(0.96, -1.15);
  const finP2 = getTrackPos(0.96, 1.15);
  ctx.beginPath();
  ctx.moveTo(finP1.x, finP1.y); ctx.lineTo(finP2.x, finP2.y);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.stroke();
}
renderTrackBed();

// ---- DRAW PARTICLES & SPARKS ----
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.life -= dt;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  const progress = p.life / p.maxLife;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (p.type === 'spark') {
    ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${progress})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * progress, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.type === 'ring') {
    ctx.strokeStyle = `hsla(${p.hue}, 100%, 75%, ${progress})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 - progress) * 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (p.type === 'confetti') {
    p.vy += 120 * dt;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(progress * 10);
    ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${progress})`;
    ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size * 0.6);
    ctx.restore();
  }
}
if (room.state.particles.length > 130) {
  room.state.particles.splice(0, room.state.particles.length - 130);
}

// ---- DRAW MARBLES (GLASS SPHERES WITH HIGHLIGHTS) ----
// Sort marbles by progress for correct front-to-back overlap
const sortedMarbles = [...room.state.marbles].sort((a, b) => a.s - b.s);

for (const m of sortedMarbles) {
  let pos = getTrackPos(m.s, m.lane);

  // If finished and in podium phase, float into podium slots
  if (room.state.phase === 'podium' && m.finishRank > 0 && m.finishRank <= 3) {
    const podSlots = [
      { x: W * 0.50, y: H * 0.86 }, // 1st
      { x: W * 0.42, y: H * 0.89 }, // 2nd
      { x: W * 0.58, y: H * 0.91 }  // 3rd
    ];
    const target = podSlots[m.finishRank - 1];
    pos.x += (target.x - pos.x) * 0.15;
    pos.y += (target.y - pos.y) * 0.15;
  }

  const r = marbleRadius * (1 + (audio.bass * 0.25));

  // Drop Shadow on track
  ctx.beginPath();
  ctx.ellipse(pos.x + 3, pos.y + r * 0.65, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fill();

  // Boost Energy Halo
  if (m.boostGlow > 0.05) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * (1.3 + m.boostGlow * 0.8), 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${m.hue}, 100%, 70%, ${m.boostGlow})`;
    ctx.lineWidth = 4;
    ctx.shadowColor = `hsl(${m.hue}, 100%, 60%)`;
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Glass Marble Base Sphere
  const grad = ctx.createRadialGradient(pos.x - r * 0.35, pos.y - r * 0.35, r * 0.1, pos.x, pos.y, r);
  grad.addColorStop(0, `hsl(${m.hue}, 100%, 82%)`);
  grad.addColorStop(0.5, `hsl(${m.hue}, 90%, 52%)`);
  grad.addColorStop(1, `hsl(${m.hue}, 100%, 25%)`);

  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = `hsla(${m.hue}, 100%, 95%, 0.85)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Glass Specular Curved Glint (Top-Left)
  ctx.beginPath();
  ctx.ellipse(pos.x - r * 0.32, pos.y - r * 0.32, r * 0.38, r * 0.20, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fill();

  // Bottom Rim Bounce Light
  ctx.beginPath();
  ctx.ellipse(pos.x + r * 0.22, pos.y + r * 0.32, r * 0.45, r * 0.16, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${m.hue}, 100%, 85%, 0.35)`;
  ctx.fill();

  // Crisp Player Label in Marble Center
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.max(10, Math.floor(r * 0.95))}px 'Impact', 'Arial Black', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 4;
  ctx.fillText(m.label, pos.x, pos.y + 1);
  ctx.shadowBlur = 0;

  // Boost Ready Indicator or Cooldown Ring
  if (m.cooldown > 0) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r + 4, -Math.PI * 0.5, -Math.PI * 0.5 + (m.cooldown / 1.1) * Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

// ---- PODIUM PEDESTALS (BOTTOM CENTER) ----
if (room.state.phase === 'podium') {
  const podW = W * 0.075;
  const bx = W * 0.5;
  const by = H * 0.95;

  // Blocks: 2nd (Silver, Left), 1st (Gold, Center), 3rd (Bronze, Right)
  const steps = [
    { rank: '2ND', h: 48, col: '#a0aab8', ox: -podW * 1.05 },
    { rank: '1ST', h: 72, col: '#f7c325', ox: 0 },
    { rank: '3RD', h: 32, col: '#cd7f32', ox: podW * 1.05 }
  ];

  for (const st of steps) {
    const sx = bx + st.ox - podW * 0.5;
    const sy = by - st.h;
    ctx.fillStyle = st.col + 'dd';
    ctx.fillRect(sx, sy, podW, st.h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, podW, st.h);

    ctx.fillStyle = '#111';
    ctx.font = `bold ${Math.floor(W * 0.016)}px 'Impact', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(st.rank, bx + st.ox, sy + 24);
  }
}

// ---- BIG ARCADE HUD & STATUS ANNOUNCEMENTS ----
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Header Title Banner
ctx.font = `900 ${Math.floor(W * 0.022)}px 'Impact', 'Arial Black', sans-serif`;
ctx.fillStyle = theme.accent;
ctx.fillText('MARBLE GRAND PRIX', W * 0.5, H * 0.055);

if (room.state.phase === 'countdown') {
  const countInt = Math.ceil(room.state.phaseTimer);
  const countText = countInt > 0 ? (countInt <= 3 ? countInt.toString() : 'GET READY!') : 'GO!';
  ctx.font = `900 ${Math.floor(W * 0.09)}px 'Impact', sans-serif`;
  ctx.fillStyle = countInt === 1 ? '#ff3344' : (countInt === 2 ? '#ffcc00' : '#33ff77');
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 8;
  ctx.strokeText(countText, W * 0.5, H * 0.48);
  ctx.fillText(countText, W * 0.5, H * 0.48);
} else if (room.state.phase === 'racing') {
  // Leader Badge in top right corner
  const leader = [...room.state.marbles].sort((a, b) => b.s - a.s)[0];
  if (leader) {
    ctx.textAlign = 'right';
    ctx.font = `bold ${Math.floor(W * 0.017)}px 'Impact', sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`LEADER: #${leader.label}`, W * 0.94, H * 0.055);
    ctx.beginPath();
    ctx.arc(W * 0.96, H * 0.052, 9, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${leader.hue}, 95%, 55%)`;
    ctx.fill();
  }
} else if (room.state.phase === 'podium') {
  // Huge Winner Announcement Banner
  const winner = room.state.marbles.find(m => m.finishRank === 1) || room.state.marbles[0];
  const winText = winner ? `WINNER: RACER #${winner.label}!` : 'RACE FINISHED!';
  ctx.font = `900 ${Math.floor(W * 0.048)}px 'Impact', sans-serif`;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 7;
  ctx.strokeText(winText, W * 0.5, H * 0.45);
  ctx.fillStyle = winner ? `hsl(${winner.hue}, 100%, 65%)` : '#ffd700';
  ctx.shadowColor = '#ffe600';
  ctx.shadowBlur = 20;
  ctx.fillText(winText, W * 0.5, H * 0.45);
  ctx.shadowBlur = 0;

  ctx.font = `bold ${Math.floor(W * 0.016)}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`NEXT ROUND IN ${Math.max(1, Math.ceil(room.state.phaseTimer))}s`, W * 0.5, H * 0.52);
}

// Attract Mode Banner if idle
if (isAttract) {
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.floor(W * 0.014)}px 'Impact', sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText('⚡ PRESS "BOOST" TO POWER YOUR MARBLE ⚡', W * 0.5, H * 0.97);
}

ctx.restore();